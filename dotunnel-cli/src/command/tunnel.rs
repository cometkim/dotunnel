//! Tunnel command - establishes a tunnel to expose a local server.

use anyhow::{bail, Context, Result};
use bytes::Bytes;
use clap::Parser;
use serde::Deserialize;
use std::collections::{BinaryHeap, HashMap};
use std::io::Read;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tracing::{debug, error, info, warn};
use tungstenite::protocol::CloseFrame;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{connect, Message as WsMessage, WebSocket};
use url::Url;

use crate::config::{Config, Credentials};
use dotunnel::transport::message::{
    Control, Envelope, Header, HttpBodyChunk, HttpMessage, HttpResponseEnd, HttpResponseInit,
    Payload, Pong, WebSocketFrame, WebSocketOpcode,
};

/// Expose a local server through a tunnel
#[derive(Debug, Parser)]
pub struct Args {
    /// Local port to forward to
    #[arg(short, long)]
    port: u16,

    /// Local host (default: 127.0.0.1)
    #[arg(long, default_value = "127.0.0.1")]
    host: String,

    /// Use named tunnel (subdomain)
    #[arg(short, long)]
    subdomain: Option<String>,

    /// Service URL override
    #[arg(long, env = "DOTUNNEL_SERVICE_URL")]
    service_url: Option<String>,
}

// =============================================================================
// Protocol Types
// =============================================================================

/// Connect response from POST /_api/tunnel/connect
#[derive(Debug, Deserialize)]
struct ConnectResponse {
    #[serde(rename = "tunnelId")]
    tunnel_id: String,
    #[serde(rename = "tunnelUrl")]
    tunnel_url: String,
    #[allow(dead_code)]
    subdomain: String,
}

/// Error response
#[derive(Debug, Deserialize)]
struct ErrorResponse {
    error: String,
    #[allow(dead_code)]
    code: Option<String>,
}

// =============================================================================
// Reconnection Constants
// =============================================================================

const INITIAL_BACKOFF_MS: u64 = 1000;
const MAX_BACKOFF_MS: u64 = 60000;
const BACKOFF_MULTIPLIER: f64 = 2.0;

// =============================================================================
// Priority Write Channel
// =============================================================================

/// Priority levels for outbound messages.
/// Lower numeric value = higher priority = sent first.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WritePriority {
    /// Control messages (pong, goaway, close) — highest priority
    Control = 0,
    /// Response headers and end markers — must not be delayed by body chunks
    Meta = 1,
    /// Response body chunks — bulk data, lowest priority
    Body = 2,
}

/// A message tagged with priority for the write channel.
struct PrioritizedMsg {
    priority: WritePriority,
    /// Tie-breaker: lower seq = sent first among same priority
    seq: u64,
    msg: WsMessage,
}

impl PartialEq for PrioritizedMsg {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority && self.seq == other.seq
    }
}

impl Eq for PrioritizedMsg {}

impl PartialOrd for PrioritizedMsg {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for PrioritizedMsg {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // BinaryHeap is a max-heap; we want min-priority first, so reverse.
        (other.priority as u8, other.seq).cmp(&(self.priority as u8, self.seq))
    }
}

/// Sender handle for priority-tagged writes.
#[derive(Clone)]
struct PriorityWriter {
    tx: mpsc::Sender<PrioritizedMsg>,
    seq: Arc<AtomicU64>,
}

use std::sync::atomic::AtomicU64;

impl PriorityWriter {
    fn new(tx: mpsc::Sender<PrioritizedMsg>) -> Self {
        Self {
            tx,
            seq: Arc::new(AtomicU64::new(0)),
        }
    }

    fn send(&self, priority: WritePriority, msg: WsMessage) -> Result<(), mpsc::SendError<PrioritizedMsg>> {
        let seq = self.seq.fetch_add(1, Ordering::Relaxed);
        self.tx.send(PrioritizedMsg { priority, seq, msg })
    }

    /// Send a control message (highest priority).
    fn send_control(&self, msg: WsMessage) -> Result<(), mpsc::SendError<PrioritizedMsg>> {
        self.send(WritePriority::Control, msg)
    }

    /// Send a response header or end marker.
    fn send_meta(&self, msg: WsMessage) -> Result<(), mpsc::SendError<PrioritizedMsg>> {
        self.send(WritePriority::Meta, msg)
    }

    /// Send a response body chunk (lowest priority).
    fn send_body(&self, msg: WsMessage) -> Result<(), mpsc::SendError<PrioritizedMsg>> {
        self.send(WritePriority::Body, msg)
    }
}

// =============================================================================
// Stream State
// =============================================================================

/// Pending HTTP request being assembled
struct PendingRequest {
    method: String,
    uri: String,
    headers: Vec<(String, String)>,
    body_chunks: Vec<Bytes>,
    #[allow(dead_code)]
    has_body: bool,
}

/// Active WebSocket connection to local server
struct LocalWebSocket {
    write_tx: mpsc::Sender<WsMessage>,
    #[allow(dead_code)]
    stream_id: u32,
}

/// Active stream state - can be HTTP request or WebSocket
enum StreamType {
    Http {
        pending_request: Option<PendingRequest>,
    },
    WebSocket {
        local_ws: LocalWebSocket,
    },
}

/// Active stream state
struct StreamState {
    stream_type: StreamType,
}

// =============================================================================
// Execution
// =============================================================================

pub fn execute(args: &Args, profile: &str) -> Result<()> {
    // Load config and credentials
    let config = Config::load()?;
    let credentials = Credentials::load()?;

    // Get service URL
    let service_url = args
        .service_url
        .clone()
        .or_else(|| config.get_profile(profile).map(|p| p.service_url.clone()))
        .context("No service URL configured. Run 'dotunnel login --service-url <URL>' first.")?;

    // Get token
    let creds = credentials
        .get_profile(profile)
        .context("Not logged in. Run 'dotunnel login' first.")?;
    let token = creds.token.clone();

    // Resolve hostname to socket address
    let local_addr: SocketAddr = format!("{}:{}", args.host, args.port)
        .to_socket_addrs()
        .context("Failed to resolve local address")?
        .next()
        .context("No addresses found for local host")?;

    // Run with reconnection
    let mut backoff_ms = INITIAL_BACKOFF_MS;
    let mut first_connect = true;

    loop {
        if !first_connect {
            info!("Reconnecting in {} ms...", backoff_ms);
            thread::sleep(Duration::from_millis(backoff_ms));
        }
        first_connect = false;

        match connect_and_run(&service_url, &token, &args.subdomain, local_addr) {
            Ok(()) => {
                // Graceful shutdown
                info!("Tunnel closed gracefully");
                break;
            }
            Err(e) => {
                error!("Tunnel error: {}", e);
                // Increase backoff
                backoff_ms = ((backoff_ms as f64) * BACKOFF_MULTIPLIER) as u64;
                if backoff_ms > MAX_BACKOFF_MS {
                    backoff_ms = MAX_BACKOFF_MS;
                }
            }
        }
    }

    Ok(())
}

fn connect_and_run(
    service_url: &str,
    token: &str,
    subdomain: &Option<String>,
    local_addr: SocketAddr,
) -> Result<()> {
    info!("Connecting to {}...", service_url);

    // Step 1: POST to get/create tunnel
    let agent = crate::http_client::agent();
    let connect_url = format!("{}/_api/tunnel/connect", service_url);

    let body = if let Some(subdomain) = subdomain {
        serde_json::json!({ "subdomain": subdomain })
    } else {
        serde_json::json!({})
    };

    let resp = agent
        .post(&connect_url)
        .header("Authorization", &format!("Bearer {}", token))
        .send_json(&body)
        .context("Failed to connect to tunnel service")?;

    if resp.status() != 200 {
        let error: ErrorResponse = resp.into_body().read_json().unwrap_or(ErrorResponse {
            error: "Unknown error".to_string(),
            code: None,
        });
        bail!("Failed to create tunnel: {}", error.error);
    }

    let tunnel_info: ConnectResponse = resp
        .into_body()
        .read_json()
        .context("Failed to parse tunnel response")?;
    info!("Tunnel created: {}", tunnel_info.tunnel_url);

    // Step 2: Connect WebSocket to DO
    let ws_url = format!(
        "{}/_api/tunnel/connect?tunnelId={}",
        service_url
            .replace("http://", "ws://")
            .replace("https://", "wss://"),
        tunnel_info.tunnel_id
    );

    let parsed_url = Url::parse(&ws_url)?;

    let ws_request = http::Request::builder()
        .uri(&ws_url)
        .header("Authorization", format!("Bearer {}", token))
        .header(
            "Sec-WebSocket-Key",
            tungstenite::handshake::client::generate_key(),
        )
        .header("Sec-WebSocket-Version", "13")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Host", parsed_url.host_str().unwrap_or("localhost"))
        .body(())
        .context("Failed to build WebSocket request")?;

    let (ws_stream, _) = connect(ws_request).context("Failed to establish WebSocket connection")?;

    println!("\n✓ Tunnel established!");
    println!("  Public URL: {}", tunnel_info.tunnel_url);
    println!("  Forwarding: http://{}", local_addr);
    println!("\nPress Ctrl+C to stop the tunnel.\n");

    // Run the tunnel
    run_tunnel(ws_stream, local_addr)
}

// =============================================================================
// Tunnel Runtime
// =============================================================================

/// Run the tunnel IO loop.
///
/// Architecture:
///   - Single thread owns the WebSocket (required by tungstenite — `read()` may write internally).
///   - Worker threads send outbound messages through a priority channel.
///   - The IO loop alternates between draining writes (priority-ordered, batched) and reading.
///   - Read timeout is 50ms so writes are never stalled for long.
///   - When truly idle (no writes, no reads), we block on the channel for up to 5ms.
fn run_tunnel(
    mut ws_stream: WebSocket<MaybeTlsStream<TcpStream>>,
    local_addr: SocketAddr,
) -> Result<()> {
    // Use a short read timeout so the IO loop stays responsive for writes.
    // We cannot use non-blocking because tungstenite's read() may internally write
    // (auto-pong) and a non-blocking write returning WouldBlock breaks it.
    // Note: very short timeouts (< ~10ms) cause data corruption on macOS with
    // native-tls because the TLS layer may return TimedOut mid-record.
    let active_timeout = Some(Duration::from_millis(50));
    set_read_timeout(&ws_stream, active_timeout)?;

    // Priority write channel
    let (write_tx, write_rx) = mpsc::channel::<PrioritizedMsg>();
    let writer = PriorityWriter::new(write_tx);

    // Stream state map: streamId -> StreamState
    let streams: Arc<Mutex<HashMap<u32, StreamState>>> = Arc::new(Mutex::new(HashMap::new()));
    let msg_seq_counter = Arc::new(AtomicU32::new(1));

    // Set up Ctrl+C handler
    let shutdown = Arc::new(AtomicBool::new(false));
    {
        let shutdown = shutdown.clone();
        let writer = writer.clone();
        ctrlc::set_handler(move || {
            info!("Shutting down tunnel...");
            shutdown.store(true, Ordering::SeqCst);
            let _ = writer.send_control(WsMessage::Close(None));
        })
        .context("Failed to set Ctrl+C handler")?;
    }

    // Re-usable priority heap — avoids per-iteration allocation
    let mut heap: BinaryHeap<PrioritizedMsg> = BinaryHeap::with_capacity(64);

    loop {
        if shutdown.load(Ordering::SeqCst) {
            drain_and_flush(&write_rx, &mut heap, &mut ws_stream);
            return Ok(());
        }

        // ── Phase 1: Drain channel into priority heap, write in priority order ──
        let wrote = drain_and_flush(&write_rx, &mut heap, &mut ws_stream);

        // ── Phase 2: Try to read one inbound message (times out after ~50ms) ──
        match ws_stream.read() {
            Ok(msg) => {
                handle_inbound(msg, local_addr, &writer, &streams, &msg_seq_counter, &mut ws_stream)?;
                // After reading, immediately loop back to drain writes.
                continue;
            }
            Err(tungstenite::Error::Io(ref e))
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut =>
            {
                // No inbound data right now — fall through.
            }
            Err(tungstenite::Error::ConnectionClosed) => {
                info!("Server closed connection");
                return Ok(());
            }
            Err(tungstenite::Error::AlreadyClosed) => {
                return Ok(());
            }
            Err(e) => {
                if shutdown.load(Ordering::SeqCst) {
                    return Ok(());
                }
                return Err(anyhow::anyhow!("WebSocket error: {}", e));
            }
        }

        // ── Phase 3: Nothing to read and nothing was written — idle wait ──
        // Block on the channel briefly to avoid busy-spinning at 50ms granularity.
        if !wrote {
            match write_rx.recv_timeout(Duration::from_millis(5)) {
                Ok(msg) => {
                    heap.push(msg);
                    // Drain any additional messages that arrived while we waited
                    while let Ok(m) = write_rx.try_recv() {
                        heap.push(m);
                    }
                    flush_heap(&mut heap, &mut ws_stream);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // Idle — loop back and check for inbound data
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Ok(());
                }
            }
        }
    }
}

/// Set the read timeout on the underlying TCP stream.
fn set_read_timeout(ws: &WebSocket<MaybeTlsStream<TcpStream>>, timeout: Option<Duration>) -> Result<()> {
    match ws.get_ref() {
        MaybeTlsStream::Plain(tcp) => tcp.set_read_timeout(timeout)?,
        MaybeTlsStream::NativeTls(tls) => tls.get_ref().set_read_timeout(timeout)?,
        _ => {}
    }
    Ok(())
}

/// Drain all pending messages from the channel into the priority heap,
/// then send them to the WebSocket in priority order.
/// Returns true if any messages were written.
fn drain_and_flush(
    rx: &mpsc::Receiver<PrioritizedMsg>,
    heap: &mut BinaryHeap<PrioritizedMsg>,
    ws: &mut WebSocket<MaybeTlsStream<TcpStream>>,
) -> bool {
    while let Ok(m) = rx.try_recv() {
        heap.push(m);
    }
    if heap.is_empty() {
        return false;
    }
    flush_heap(heap, ws);
    true
}

/// Send all messages from the heap to the WebSocket in priority order.
fn flush_heap(
    heap: &mut BinaryHeap<PrioritizedMsg>,
    ws: &mut WebSocket<MaybeTlsStream<TcpStream>>,
) {
    while let Some(pm) = heap.pop() {
        if let Err(e) = ws.send(pm.msg) {
            error!("WebSocket write error: {}", e);
            heap.clear();
            return;
        }
    }
}

/// Handle one inbound WebSocket message.
fn handle_inbound(
    msg: WsMessage,
    local_addr: SocketAddr,
    writer: &PriorityWriter,
    streams: &Arc<Mutex<HashMap<u32, StreamState>>>,
    msg_seq_counter: &Arc<AtomicU32>,
    ws: &mut WebSocket<MaybeTlsStream<TcpStream>>,
) -> Result<()> {
    match msg {
        WsMessage::Text(text) => {
            debug!("Received text message: {}", text);
        }
        WsMessage::Binary(data) => match Envelope::decode(&data) {
            Ok(envelope) => {
                dispatch_message(envelope, local_addr, writer, streams, msg_seq_counter);
            }
            Err(e) => {
                error!("Error decoding message: {}", e);
            }
        },
        WsMessage::Ping(_data) => {
            debug!("Received ping");
            // Tungstenite auto-queues a pong internally, just flush it out.
            let _ = ws.flush();
        }
        WsMessage::Pong(_) => {
            debug!("Received pong");
        }
        WsMessage::Close(frame) => {
            info!("Server closed connection: {:?}", frame);
            return Err(anyhow::anyhow!("server_closed"));
        }
        WsMessage::Frame(_) => {}
    }
    Ok(())
}

/// Dispatch a decoded envelope: fast operations run inline, slow I/O spawns a thread.
fn dispatch_message(
    envelope: Envelope,
    local_addr: SocketAddr,
    writer: &PriorityWriter,
    streams: &Arc<Mutex<HashMap<u32, StreamState>>>,
    msg_seq_counter: &Arc<AtomicU32>,
) {
    let stream_id = envelope.stream_id;
    let connection_id = envelope.connection_id;

    match envelope.payload {
        Payload::Http(http) => match http {
            // Fast path: just store data in the streams map (inline)
            HttpMessage::RequestInit(init) => {
                let method = init.method;
                let uri = init.uri;
                let has_body = init.has_body;
                let headers: Vec<(String, String)> = init
                    .headers
                    .into_iter()
                    .map(|h| (h.name, String::from_utf8_lossy(&h.value).into_owned()))
                    .collect();
                debug!(
                    "Stream {}: {} {} (hasBody: {})",
                    stream_id, method, uri, has_body
                );

                let is_websocket = headers.iter().any(|(name, value)| {
                    name.eq_ignore_ascii_case("upgrade") && value.eq_ignore_ascii_case("websocket")
                });

                if is_websocket {
                    debug!("Stream {}: WebSocket upgrade request", stream_id);
                    // WebSocket upgrade does blocking I/O — spawn a thread
                    let writer = writer.clone();
                    let streams = streams.clone();
                    let msg_seq_counter = msg_seq_counter.clone();
                    thread::spawn(move || {
                        if let Err(e) = handle_websocket_upgrade(
                            stream_id,
                            connection_id,
                            local_addr,
                            &uri,
                            &headers,
                            writer,
                            streams,
                            msg_seq_counter,
                        ) {
                            error!("Stream {}: WebSocket upgrade error: {}", stream_id, e);
                        }
                    });
                } else {
                    let mut streams_guard = streams.lock().unwrap();
                    streams_guard.insert(
                        stream_id,
                        StreamState {
                            stream_type: StreamType::Http {
                                pending_request: Some(PendingRequest {
                                    method,
                                    uri,
                                    headers,
                                    body_chunks: vec![],
                                    has_body,
                                }),
                            },
                        },
                    );
                }
            }
            // Fast path: append body data (inline)
            HttpMessage::RequestBodyChunk(chunk) => {
                let mut streams_guard = streams.lock().unwrap();
                if let Some(state) = streams_guard.get_mut(&stream_id)
                    && let StreamType::Http {
                        pending_request: Some(pending),
                    } = &mut state.stream_type
                {
                    pending.body_chunks.push(chunk.data);
                }
            }
            // Slow path: forward to local server — spawn a thread
            HttpMessage::RequestEnd(_) => {
                debug!("Stream {}: request end", stream_id);
                let writer = writer.clone();
                let streams = streams.clone();
                let msg_seq_counter = msg_seq_counter.clone();
                thread::spawn(move || {
                    if let Err(e) = process_request(
                        stream_id,
                        connection_id,
                        local_addr,
                        writer,
                        streams,
                        msg_seq_counter,
                    ) {
                        error!("Stream {}: Error processing request: {}", stream_id, e);
                    }
                });
            }
            HttpMessage::RequestAbort(abort) => {
                warn!("Stream {}: request aborted: {:?}", stream_id, abort.reason);
                let mut streams_guard = streams.lock().unwrap();
                streams_guard.remove(&stream_id);
            }
            _ => {
                warn!("Stream {}: unexpected HTTP message from server", stream_id);
            }
        },
        Payload::Ws(frame) => {
            debug!(
                "Stream {}: Received WebSocket frame (opcode: {:?})",
                stream_id, frame.opcode
            );
            let mut streams_guard = streams.lock().unwrap();
            handle_ws_frame(stream_id, frame, &mut streams_guard);
        }
        Payload::Control(control) => {
            if let Err(e) = handle_control(connection_id, control, writer.clone()) {
                error!("Error handling control message: {}", e);
            }
        }
    }
}

/// Handle decoded control message
fn handle_control(connection_id: u64, control: Control, writer: PriorityWriter) -> Result<()> {
    match control {
        Control::Ping(ping) => {
            debug!("Received control ping");
            let pong = encode_control_pong(connection_id, &ping.data);
            writer
                .send_control(WsMessage::Binary(pong.into()))
                .context("Failed to send control pong")?;
        }
        Control::Pong(_) => {
            debug!("Received control pong");
        }
        Control::Error(error) => {
            error!("Control error {}: {}", error.code, error.message);
        }
        Control::GoAway(go_away) => {
            warn!("Received GoAway: {}", go_away.reason);
        }
        Control::FlowWindowUpdate(_) => {
            // Flow control - ignore for now
            debug!("Received FlowWindowUpdate (not implemented)");
        }
    }
    Ok(())
}

/// Process a complete request and stream response back
fn process_request(
    stream_id: u32,
    connection_id: u64,
    local_addr: SocketAddr,
    writer: PriorityWriter,
    streams: Arc<Mutex<HashMap<u32, StreamState>>>,
    msg_seq_counter: Arc<AtomicU32>,
) -> Result<()> {
    // Extract request data
    let request = {
        let mut streams = streams.lock().unwrap();
        if let Some(state) = streams.get_mut(&stream_id) {
            if let StreamType::Http { pending_request } = &mut state.stream_type {
                pending_request.take()
            } else {
                None
            }
        } else {
            None
        }
    };

    let Some(request) = request else {
        return Ok(());
    };

    // Concatenate body chunks
    let body: Vec<u8> = request.body_chunks.into_iter().flatten().collect();

    // Forward to local server and stream back
    let result = forward_to_local_streaming(
        local_addr,
        &request.method,
        &request.uri,
        request.headers,
        body,
    );

    match result {
        Ok(mut resp) => {
            let status = resp.status().as_u16();
            let resp_headers: Vec<(String, String)> = resp
                .headers()
                .iter()
                .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
                .collect();

            // Send response init immediately — META priority so it jumps ahead of body chunks
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_init = encode_response_init(
                connection_id,
                stream_id,
                msg_seq,
                status,
                &resp_headers,
                true, // assume body exists, ResponseEnd will close it
            );
            writer.send_meta(WsMessage::Binary(response_init.into()))?;

            info!(
                "Stream {}: {} {} -> {}",
                stream_id, request.method, request.uri, status
            );

            // Stream body chunks — BODY priority (lowest)
            let mut reader = resp.body_mut().as_reader();
            let mut buf = [0u8; 16384];
            let mut chunk_seq: u32 = 0;

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
                        let body_chunk = encode_response_body_chunk(
                            connection_id,
                            stream_id,
                            msg_seq,
                            &buf[..n],
                            chunk_seq,
                            false,
                        );
                        writer.send_body(WsMessage::Binary(body_chunk.into()))?;
                        chunk_seq += 1;
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        // Non-blocking read returned no data, yield briefly
                        thread::sleep(Duration::from_millis(1));
                        continue;
                    }
                    Err(e) => {
                        warn!("Stream {}: Error reading response body: {}", stream_id, e);
                        break;
                    }
                }
            }

            // Send response end — BODY priority so it's sent after all body chunks
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_end = encode_response_end(connection_id, stream_id, msg_seq);
            writer.send_body(WsMessage::Binary(response_end.into()))?;
        }
        Err(e) => {
            // Send error response
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_init =
                encode_response_init(connection_id, stream_id, msg_seq, 502, &[], true);
            writer.send_meta(WsMessage::Binary(response_init.into()))?;

            let error_body = format!("Bad Gateway: {}", e);
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let body_chunk = encode_response_body_chunk(
                connection_id,
                stream_id,
                msg_seq,
                error_body.as_bytes(),
                0,
                true,
            );
            writer.send_body(WsMessage::Binary(body_chunk.into()))?;

            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_end = encode_response_end(connection_id, stream_id, msg_seq);
            writer.send_body(WsMessage::Binary(response_end.into()))?;

            warn!(
                "Stream {}: {} {} -> 502 ({})",
                stream_id, request.method, request.uri, e
            );
        }
    }

    // Clean up stream
    {
        let mut streams = streams.lock().unwrap();
        streams.remove(&stream_id);
    }

    Ok(())
}

// =============================================================================
// WebSocket Handling
// =============================================================================

/// Handle WebSocket upgrade request - connect to local WS server and start proxying
#[allow(clippy::too_many_arguments)]
fn handle_websocket_upgrade(
    stream_id: u32,
    connection_id: u64,
    local_addr: SocketAddr,
    uri: &str,
    headers: &[(String, String)],
    writer: PriorityWriter,
    streams: Arc<Mutex<HashMap<u32, StreamState>>>,
    msg_seq_counter: Arc<AtomicU32>,
) -> Result<()> {
    // Build local WebSocket URL
    let local_url = format!("ws://{}{}", local_addr, uri);

    // Build WebSocket request with forwarded headers
    let mut request = http::Request::builder()
        .uri(&local_url)
        .header(
            "Sec-WebSocket-Key",
            tungstenite::handshake::client::generate_key(),
        )
        .header("Sec-WebSocket-Version", "13")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Host", format!("{}", local_addr));

    // Forward relevant headers
    for (name, value) in headers {
        let name_lower = name.to_lowercase();
        // Forward protocol negotiation headers
        if name_lower == "sec-websocket-protocol"
            || name_lower == "sec-websocket-extensions"
            || name_lower == "origin"
        {
            request = request.header(name.as_str(), value.as_str());
        }
    }

    let request = request
        .body(())
        .context("Failed to build WebSocket request")?;

    // Connect to local WebSocket server
    let local_ws_result = connect(request);

    match local_ws_result {
        Ok((local_ws, response)) => {
            info!(
                "Stream {}: Connected to local WebSocket server (status: {})",
                stream_id,
                response.status()
            );

            // Send successful upgrade response to server
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_headers: Vec<(String, String)> = response
                .headers()
                .iter()
                .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
                .collect();

            let response_init = encode_response_init(
                connection_id,
                stream_id,
                msg_seq,
                101, // Switching Protocols
                &response_headers,
                false,
            );
            writer
                .send_meta(WsMessage::Binary(response_init.into()))
                .context("Failed to send WS upgrade response")?;

            // Create channel for sending messages to local WebSocket
            let (local_tx, local_rx) = mpsc::channel::<WsMessage>();

            // Store WebSocket state
            {
                let mut streams_guard = streams.lock().unwrap();
                streams_guard.insert(
                    stream_id,
                    StreamState {
                        stream_type: StreamType::WebSocket {
                            local_ws: LocalWebSocket {
                                write_tx: local_tx,
                                stream_id,
                            },
                        },
                    },
                );
            }

            // Single IO thread owns the local WebSocket (tungstenite sockets
            // can't be split): it drains outbound messages from the channel,
            // then polls for inbound frames with a short read timeout, so
            // neither direction can starve the other. The local connection is
            // always plain TCP (ws://), so a short timeout is safe here.
            if let Err(e) = set_read_timeout(&local_ws, Some(Duration::from_millis(10))) {
                warn!(
                    "Stream {}: Failed to set local WS read timeout: {}",
                    stream_id, e
                );
            }

            let writer_clone = writer.clone();
            let msg_seq_counter_clone = msg_seq_counter.clone();
            let streams_clone = streams.clone();
            let mut local_ws = local_ws;

            thread::spawn(move || {
                'io: loop {
                    // Forward pending client frames to the local server
                    loop {
                        match local_rx.try_recv() {
                            Ok(msg) => {
                                let is_close = matches!(msg, WsMessage::Close(_));
                                if local_ws.send(msg).is_err() || is_close {
                                    break 'io;
                                }
                            }
                            Err(mpsc::TryRecvError::Empty) => break,
                            Err(mpsc::TryRecvError::Disconnected) => break 'io,
                        }
                    }

                    // Poll for one inbound frame from the local server
                    let msg = match local_ws.read() {
                        Ok(msg) => msg,
                        Err(tungstenite::Error::Io(ref e))
                            if e.kind() == std::io::ErrorKind::WouldBlock
                                || e.kind() == std::io::ErrorKind::TimedOut =>
                        {
                            continue;
                        }
                        Err(_) => break,
                    };

                    let frame = match &msg {
                        WsMessage::Text(text) => {
                            let msg_seq = msg_seq_counter_clone.fetch_add(1, Ordering::SeqCst);
                            encode_ws_frame(
                                connection_id,
                                stream_id,
                                msg_seq,
                                WebSocketOpcode::Text,
                                text.as_bytes(),
                                None,
                            )
                        }
                        WsMessage::Binary(data) => {
                            let msg_seq = msg_seq_counter_clone.fetch_add(1, Ordering::SeqCst);
                            encode_ws_frame(
                                connection_id,
                                stream_id,
                                msg_seq,
                                WebSocketOpcode::Binary,
                                data,
                                None,
                            )
                        }
                        WsMessage::Ping(data) => {
                            let msg_seq = msg_seq_counter_clone.fetch_add(1, Ordering::SeqCst);
                            encode_ws_frame(
                                connection_id,
                                stream_id,
                                msg_seq,
                                WebSocketOpcode::Ping,
                                data,
                                None,
                            )
                        }
                        WsMessage::Pong(data) => {
                            let msg_seq = msg_seq_counter_clone.fetch_add(1, Ordering::SeqCst);
                            encode_ws_frame(
                                connection_id,
                                stream_id,
                                msg_seq,
                                WebSocketOpcode::Pong,
                                data,
                                None,
                            )
                        }
                        WsMessage::Close(frame) => {
                            let msg_seq = msg_seq_counter_clone.fetch_add(1, Ordering::SeqCst);
                            let code = frame.as_ref().map(|f| f.code.into()).unwrap_or(1000u16);
                            encode_ws_frame(
                                connection_id,
                                stream_id,
                                msg_seq,
                                WebSocketOpcode::Close,
                                &[],
                                Some(code),
                            )
                        }
                        WsMessage::Frame(_) => continue, // Raw frames, skip
                    };

                    if writer_clone
                        .send_meta(WsMessage::Binary(frame.into()))
                        .is_err()
                    {
                        break;
                    }

                    if matches!(msg, WsMessage::Close(_)) {
                        break;
                    }
                }

                // Clean up stream when local WS closes
                let mut streams_guard = streams_clone.lock().unwrap();
                streams_guard.remove(&stream_id);
                debug!("Stream {}: Local WebSocket closed", stream_id);
            });
        }
        Err(e) => {
            // Failed to connect to local WebSocket server
            warn!(
                "Stream {}: Failed to connect to local WebSocket: {}",
                stream_id, e
            );

            // Send error response
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_init = encode_response_init(
                connection_id,
                stream_id,
                msg_seq,
                502, // Bad Gateway
                &[],
                true,
            );
            writer.send_meta(WsMessage::Binary(response_init.into()))?;

            let error_body = format!("Failed to connect to local WebSocket server: {}", e);
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let body_chunk = encode_response_body_chunk(
                connection_id,
                stream_id,
                msg_seq,
                error_body.as_bytes(),
                0,
                true,
            );
            writer.send_body(WsMessage::Binary(body_chunk.into()))?;

            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_end = encode_response_end(connection_id, stream_id, msg_seq);
            writer.send_body(WsMessage::Binary(response_end.into()))?;
        }
    }

    Ok(())
}

/// Handle WebSocket frame from server (forward to local WebSocket)
fn handle_ws_frame(
    stream_id: u32,
    frame: WebSocketFrame,
    streams: &mut HashMap<u32, StreamState>,
) {
    let Some(state) = streams.get(&stream_id) else {
        debug!("Stream {}: No stream found for WS frame", stream_id);
        return;
    };

    let StreamType::WebSocket { local_ws } = &state.stream_type else {
        debug!("Stream {}: Stream is not a WebSocket", stream_id);
        return;
    };

    let msg = match frame.opcode {
        WebSocketOpcode::Text => match String::from_utf8(frame.payload.to_vec()) {
            Ok(text) => WsMessage::Text(text.into()),
            Err(_) => {
                debug!("Stream {}: Invalid UTF-8 in text frame", stream_id);
                return;
            }
        },
        WebSocketOpcode::Binary => WsMessage::Binary(frame.payload),
        WebSocketOpcode::Close => WsMessage::Close(frame.close_code.map(|code| CloseFrame {
            code: code.into(),
            reason: "".into(),
        })),
        WebSocketOpcode::Ping => WsMessage::Ping(frame.payload),
        WebSocketOpcode::Pong => WsMessage::Pong(frame.payload),
        WebSocketOpcode::Continuation => {
            debug!("Stream {}: Continuation frames are not supported", stream_id);
            return;
        }
    };

    if local_ws.write_tx.send(msg).is_err() {
        debug!("Stream {}: Failed to send to local WebSocket", stream_id);
    }
}

/// Forward request to local server, returning the response for streaming.
///
/// Does NOT read the response body — the caller streams it in chunks.
fn forward_to_local_streaming(
    local_addr: SocketAddr,
    method: &str,
    uri: &str,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
) -> Result<http::Response<ureq::Body>> {
    let url = format!("http://{}{}", local_addr, uri);

    // No global timeout — streaming responses (SSE) can last indefinitely.
    // Individual read timeouts are handled at the chunk-read level.
    let agent = crate::http_client::agent();

    // Build an http::Request manually so we can handle any method uniformly
    let mut builder = http::Request::builder().method(method).uri(&url);

    for (name, value) in &headers {
        // Skip hop-by-hop headers and Accept-Encoding
        let name_lower = name.to_lowercase();
        if name_lower == "host"
            || name_lower == "connection"
            || name_lower == "upgrade"
            || name_lower == "transfer-encoding"
            || name_lower == "accept-encoding"
        {
            continue;
        }
        builder = builder.header(name.as_str(), value.as_str());
    }

    // Override Accept-Encoding to prevent local server from compressing.
    // Cloudflare's edge will handle compression for the client.
    builder = builder.header("Accept-Encoding", "identity");

    let resp = if !body.is_empty() {
        let request = builder.body(body).context("Failed to build request")?;
        agent
            .run(request)
            .context("Failed to forward request to local server")?
    } else {
        let request = builder.body(()).context("Failed to build request")?;
        agent
            .run(request)
            .context("Failed to forward request to local server")?
    };

    Ok(resp)
}

// =============================================================================
// Encoding Functions
// =============================================================================

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn encode_envelope(connection_id: u64, stream_id: u32, msg_seq: u32, payload: Payload) -> Vec<u8> {
    let envelope = Envelope {
        timestamp_ms: now_ms(),
        connection_id,
        stream_id,
        msg_seq,
        payload,
    };
    envelope.encode().expect("failed to encode envelope")
}

fn encode_response_init(
    connection_id: u64,
    stream_id: u32,
    msg_seq: u32,
    status: u16,
    headers: &[(String, String)],
    has_body: bool,
) -> Vec<u8> {
    let headers = headers
        .iter()
        .map(|(name, value)| Header {
            name: name.clone(),
            value: Bytes::copy_from_slice(value.as_bytes()),
        })
        .collect();
    encode_envelope(
        connection_id,
        stream_id,
        msg_seq,
        Payload::Http(HttpMessage::ResponseInit(HttpResponseInit {
            timestamp_ms: now_ms(),
            status,
            headers,
            has_body,
            content_length: 0,
        })),
    )
}

fn encode_response_body_chunk(
    connection_id: u64,
    stream_id: u32,
    msg_seq: u32,
    data: &[u8],
    seq: u32,
    is_last: bool,
) -> Vec<u8> {
    encode_envelope(
        connection_id,
        stream_id,
        msg_seq,
        Payload::Http(HttpMessage::ResponseBodyChunk(HttpBodyChunk {
            timestamp_ms: now_ms(),
            data: Bytes::copy_from_slice(data),
            seq,
            is_last,
        })),
    )
}

fn encode_response_end(connection_id: u64, stream_id: u32, msg_seq: u32) -> Vec<u8> {
    encode_envelope(
        connection_id,
        stream_id,
        msg_seq,
        Payload::Http(HttpMessage::ResponseEnd(HttpResponseEnd {
            timestamp_ms: now_ms(),
        })),
    )
}

fn encode_control_pong(connection_id: u64, data: &Bytes) -> Vec<u8> {
    encode_envelope(
        connection_id,
        0,
        0,
        Payload::Control(Control::Pong(Pong {
            timestamp_ms: now_ms(),
            data: data.clone(),
        })),
    )
}

fn encode_ws_frame(
    connection_id: u64,
    stream_id: u32,
    msg_seq: u32,
    opcode: WebSocketOpcode,
    payload: &[u8],
    close_code: Option<u16>,
) -> Vec<u8> {
    encode_envelope(
        connection_id,
        stream_id,
        msg_seq,
        Payload::Ws(WebSocketFrame {
            timestamp_ms: now_ms(),
            fin: true,
            rsv1: false,
            rsv2: false,
            rsv3: false,
            opcode,
            masked: false,
            mask_key: 0,
            payload: Bytes::copy_from_slice(payload),
            close_code,
        }),
    )
}
