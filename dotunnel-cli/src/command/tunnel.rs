//! Tunnel command - establishes a tunnel to expose a local server.

use anyhow::{bail, Context, Result};
use capnp::message::{Builder, ReaderOptions};
use capnp::serialize_packed;
use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Cursor;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use tracing::{debug, error, info, warn};
use url::Url;

use crate::config::{Config, Credentials};
use crate::message_capnp;

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
// Stream State
// =============================================================================

/// Pending HTTP request being assembled
struct PendingRequest {
    method: String,
    uri: String,
    headers: Vec<(String, String)>,
    body_chunks: Vec<Vec<u8>>,
    #[allow(dead_code)]
    has_body: bool,
}

/// Active WebSocket connection to local server
struct LocalWebSocket {
    write_tx: mpsc::UnboundedSender<WsMessage>,
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

pub async fn execute(args: &Args, profile: &str) -> Result<()> {
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
    let local_addr: SocketAddr = tokio::net::lookup_host(format!("{}:{}", args.host, args.port))
        .await
        .context("Failed to resolve local address")?
        .next()
        .context("No addresses found for local host")?;

    // Run with reconnection
    let mut backoff_ms = INITIAL_BACKOFF_MS;
    let mut first_connect = true;

    loop {
        if !first_connect {
            info!("Reconnecting in {} ms...", backoff_ms);
            tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
        }
        first_connect = false;

        match connect_and_run(&service_url, &token, &args.subdomain, local_addr).await {
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

async fn connect_and_run(
    service_url: &str,
    token: &str,
    subdomain: &Option<String>,
    local_addr: SocketAddr,
) -> Result<()> {
    info!("Connecting to {}...", service_url);

    // Step 1: POST to get/create tunnel
    let client = reqwest::Client::new();
    let connect_url = format!("{}/_api/tunnel/connect", service_url);

    let body = if let Some(subdomain) = subdomain {
        serde_json::json!({ "subdomain": subdomain })
    } else {
        serde_json::json!({})
    };

    let resp = client
        .post(&connect_url)
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .context("Failed to connect to tunnel service")?;

    if !resp.status().is_success() {
        let error: ErrorResponse = resp.json().await.unwrap_or(ErrorResponse {
            error: "Unknown error".to_string(),
            code: None,
        });
        bail!("Failed to create tunnel: {}", error.error);
    }

    let tunnel_info: ConnectResponse = resp
        .json()
        .await
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

    let ws_request = http::Request::builder()
        .uri(&ws_url)
        .header("Authorization", format!("Bearer {}", token))
        .header(
            "Sec-WebSocket-Key",
            tokio_tungstenite::tungstenite::handshake::client::generate_key(),
        )
        .header("Sec-WebSocket-Version", "13")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header(
            "Host",
            Url::parse(service_url)?
                .host_str()
                .unwrap_or("localhost"),
        )
        .body(())
        .context("Failed to build WebSocket request")?;

    let (ws_stream, _) = connect_async(ws_request)
        .await
        .context("Failed to establish WebSocket connection")?;

    println!("\n✓ Tunnel established!");
    println!("  Public URL: {}", tunnel_info.tunnel_url);
    println!("  Forwarding: http://{}", local_addr);
    println!("\nPress Ctrl+C to stop the tunnel.\n");

    // Run the tunnel
    run_tunnel(ws_stream, local_addr).await
}

// =============================================================================
// Tunnel Runtime
// =============================================================================

type WsStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

/// Run the tunnel event loop
async fn run_tunnel(ws_stream: WsStream, local_addr: SocketAddr) -> Result<()> {
    let (ws_write, mut ws_read) = ws_stream.split();
    let ws_write = Arc::new(Mutex::new(ws_write));

    // Stream state map: streamId -> StreamState
    let streams: Arc<Mutex<HashMap<u32, StreamState>>> = Arc::new(Mutex::new(HashMap::new()));
    let msg_seq_counter = Arc::new(AtomicU32::new(1));

    // Handle incoming messages
    loop {
        tokio::select! {
            msg = ws_read.next() => {
                match msg {
                    Some(Ok(WsMessage::Text(text))) => {
                        debug!("Received text message: {}", text);
                        // Handle JSON control messages (tunnel_ready, etc.)
                    }
                    Some(Ok(WsMessage::Binary(data))) => {
                        // Decode message synchronously to extract owned data
                        match decode_binary_message(&data) {
                            Ok(decoded) => {
                                // Handle in separate task for concurrent processing
                                let ws_write = ws_write.clone();
                                let streams = streams.clone();
                                let msg_seq_counter = msg_seq_counter.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_decoded_message(
                                        decoded,
                                        local_addr,
                                        ws_write,
                                        streams,
                                        msg_seq_counter,
                                    ).await {
                                        error!("Error handling message: {}", e);
                                    }
                                });
                            }
                            Err(e) => {
                                error!("Error decoding message: {}", e);
                            }
                        }
                    }
                    Some(Ok(WsMessage::Ping(data))) => {
                        debug!("Received ping");
                        let mut ws = ws_write.lock().await;
                        let _ = ws.send(WsMessage::Pong(data)).await;
                    }
                    Some(Ok(WsMessage::Pong(_))) => {
                        debug!("Received pong");
                    }
                    Some(Ok(WsMessage::Close(frame))) => {
                        info!("Server closed connection: {:?}", frame);
                        return Ok(());
                    }
                    Some(Ok(WsMessage::Frame(_))) => {
                        // Raw frame, ignore
                    }
                    Some(Err(e)) => {
                        return Err(anyhow::anyhow!("WebSocket error: {}", e));
                    }
                    None => {
                        return Err(anyhow::anyhow!("WebSocket connection closed unexpectedly"));
                    }
                }
            }
            _ = tokio::signal::ctrl_c() => {
                info!("Shutting down tunnel...");
                let mut ws = ws_write.lock().await;
                let _ = ws.close().await;
                return Ok(());
            }
        }
    }
}

// =============================================================================
// Decoded Message Types (owned, Send-safe)
// =============================================================================

#[derive(Debug)]
enum DecodedMessage {
    Http {
        stream_id: u32,
        connection_id: u64,
        http: DecodedHttpMessage,
    },
    Ws {
        stream_id: u32,
        opcode: u16,
        payload: Vec<u8>,
        close_code: Option<u16>,
    },
    Control {
        connection_id: u64,
        control: DecodedControlMessage,
    },
}

#[derive(Debug)]
enum DecodedHttpMessage {
    RequestInit {
        method: String,
        uri: String,
        headers: Vec<(String, String)>,
        has_body: bool,
    },
    RequestBodyChunk {
        data: Vec<u8>,
    },
    RequestEnd,
    RequestAbort {
        reason: i16,
    },
}

#[derive(Debug)]
enum DecodedControlMessage {
    Ping { data: Vec<u8> },
    Pong,
    Error { code: u32, message: String },
    GoAway { reason: String },
}

/// Decode binary message synchronously into owned types
fn decode_binary_message(data: &[u8]) -> Result<DecodedMessage> {
    let mut cursor = Cursor::new(data);
    let reader = serialize_packed::read_message(&mut cursor, ReaderOptions::new())?;
    let envelope = reader.get_root::<message_capnp::envelope::Reader>()?;

    let stream_id = envelope.get_stream_id();
    let connection_id = envelope.get_connection_id();

    match envelope.which()? {
        message_capnp::envelope::Which::Http(http) => {
            let http = http?;
            let decoded_http = match http.which()? {
                message_capnp::http_message::Which::RequestInit(init) => {
                    let init = init?;
                    let method = init.get_method()?.to_string()?;
                    let uri = init.get_uri()?.to_string()?;
                    let has_body = init.get_has_body();
                    let mut headers = Vec::new();
                    for header in init.get_headers()? {
                        let name = header.get_name()?.to_string()?;
                        let value_bytes = header.get_value()?;
                        let value = String::from_utf8_lossy(value_bytes).to_string();
                        headers.push((name, value));
                    }
                    DecodedHttpMessage::RequestInit { method, uri, headers, has_body }
                }
                message_capnp::http_message::Which::RequestBodyChunk(chunk) => {
                    let chunk = chunk?;
                    let data = chunk.get_data()?.to_vec();
                    DecodedHttpMessage::RequestBodyChunk { data }
                }
                message_capnp::http_message::Which::RequestEnd(_) => {
                    DecodedHttpMessage::RequestEnd
                }
                message_capnp::http_message::Which::RequestAbort(abort) => {
                    let abort = abort?;
                    let reason = abort.get_reason()? as i16;
                    DecodedHttpMessage::RequestAbort { reason }
                }
                _ => return Err(anyhow::anyhow!("Unexpected HTTP message type")),
            };
            Ok(DecodedMessage::Http { stream_id, connection_id, http: decoded_http })
        }
        message_capnp::envelope::Which::Ws(ws) => {
            let ws = ws?;
            let opcode = ws.get_opcode()? as u16;
            let payload = ws.get_payload()?.to_vec();
            let close_code = if opcode == 8 { Some(ws.get_close_code()) } else { None };
            Ok(DecodedMessage::Ws { stream_id, opcode, payload, close_code })
        }
        message_capnp::envelope::Which::Control(control) => {
            let control = control?;
            let decoded_control = match control.which()? {
                message_capnp::control::Which::Ping(ping) => {
                    let ping = ping?;
                    let data = ping.get_data()?.to_vec();
                    DecodedControlMessage::Ping { data }
                }
                message_capnp::control::Which::Pong(_) => DecodedControlMessage::Pong,
                message_capnp::control::Which::Error(error) => {
                    let error = error?;
                    let code = error.get_code();
                    let message = error.get_message()?.to_str()?.to_string();
                    DecodedControlMessage::Error { code, message }
                }
                message_capnp::control::Which::GoAway(go_away) => {
                    let go_away = go_away?;
                    let reason = go_away.get_reason()?.to_str()?.to_string();
                    DecodedControlMessage::GoAway { reason }
                }
                message_capnp::control::Which::FlowWindowUpdate(_) => {
                    // Flow control - ignore for now
                    return Err(anyhow::anyhow!("FlowWindowUpdate not implemented"));
                }
            };
            Ok(DecodedMessage::Control { connection_id, control: decoded_control })
        }
    }
}

/// Handle decoded message (async, can be spawned)
async fn handle_decoded_message(
    msg: DecodedMessage,
    local_addr: SocketAddr,
    ws_write: Arc<Mutex<futures_util::stream::SplitSink<WsStream, WsMessage>>>,
    streams: Arc<Mutex<HashMap<u32, StreamState>>>,
    msg_seq_counter: Arc<AtomicU32>,
) -> Result<()> {
    match msg {
        DecodedMessage::Http { stream_id, connection_id, http } => {
            handle_decoded_http(stream_id, connection_id, http, local_addr, ws_write, streams, msg_seq_counter).await?;
        }
        DecodedMessage::Ws { stream_id, opcode, payload, close_code } => {
            debug!("Stream {}: Received WebSocket frame (opcode: {})", stream_id, opcode);
            let mut streams_guard = streams.lock().await;
            handle_ws_frame(stream_id, opcode, &payload, close_code, &mut streams_guard);
        }
        DecodedMessage::Control { connection_id, control } => {
            handle_decoded_control(connection_id, control, ws_write).await?;
        }
    }
    Ok(())
}

/// Handle decoded HTTP message
async fn handle_decoded_http(
    stream_id: u32,
    connection_id: u64,
    http: DecodedHttpMessage,
    local_addr: SocketAddr,
    ws_write: Arc<Mutex<futures_util::stream::SplitSink<WsStream, WsMessage>>>,
    streams: Arc<Mutex<HashMap<u32, StreamState>>>,
    msg_seq_counter: Arc<AtomicU32>,
) -> Result<()> {
    match http {
        DecodedHttpMessage::RequestInit { method, uri, headers, has_body } => {
            debug!("Stream {}: {} {} (hasBody: {})", stream_id, method, uri, has_body);

            // Check if this is a WebSocket upgrade request
            let is_websocket = headers.iter().any(|(name, value)| {
                name.eq_ignore_ascii_case("upgrade") && value.eq_ignore_ascii_case("websocket")
            });

            if is_websocket {
                debug!("Stream {}: WebSocket upgrade request", stream_id);
                handle_websocket_upgrade(
                    stream_id,
                    connection_id,
                    local_addr,
                    &uri,
                    &headers,
                    ws_write.clone(),
                    streams.clone(),
                    msg_seq_counter.clone(),
                ).await?;
            } else {
                // Store pending HTTP request
                let mut streams_guard = streams.lock().await;
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
        DecodedHttpMessage::RequestBodyChunk { data } => {
            let mut streams_guard = streams.lock().await;
            if let Some(state) = streams_guard.get_mut(&stream_id) {
                if let StreamType::Http { pending_request: Some(pending) } = &mut state.stream_type {
                    pending.body_chunks.push(data);
                }
            }
        }
        DecodedHttpMessage::RequestEnd => {
            debug!("Stream {}: request end", stream_id);
            process_request(stream_id, connection_id, local_addr, ws_write, streams, msg_seq_counter).await?;
        }
        DecodedHttpMessage::RequestAbort { reason } => {
            warn!("Stream {}: request aborted: {}", stream_id, reason);
            let mut streams_guard = streams.lock().await;
            streams_guard.remove(&stream_id);
        }
    }
    Ok(())
}

/// Handle decoded control message
async fn handle_decoded_control(
    connection_id: u64,
    control: DecodedControlMessage,
    ws_write: Arc<Mutex<futures_util::stream::SplitSink<WsStream, WsMessage>>>,
) -> Result<()> {
    match control {
        DecodedControlMessage::Ping { data } => {
            debug!("Received control ping");
            let pong = encode_control_pong(connection_id, &data);
            let mut ws = ws_write.lock().await;
            ws.send(WsMessage::Binary(pong.into())).await?;
        }
        DecodedControlMessage::Pong => {
            debug!("Received control pong");
        }
        DecodedControlMessage::Error { code, message } => {
            error!("Control error {}: {}", code, message);
        }
        DecodedControlMessage::GoAway { reason } => {
            warn!("Received GoAway: {}", reason);
        }
    }
    Ok(())
}

/// Process a complete request and send response
async fn process_request(
    stream_id: u32,
    connection_id: u64,
    local_addr: SocketAddr,
    ws_write: Arc<Mutex<futures_util::stream::SplitSink<WsStream, WsMessage>>>,
    streams: Arc<Mutex<HashMap<u32, StreamState>>>,
    msg_seq_counter: Arc<AtomicU32>,
) -> Result<()> {
    // Extract request data
    let request = {
        let mut streams = streams.lock().await;
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

    // Forward to local server
    let result = forward_to_local(
        local_addr,
        &request.method,
        &request.uri,
        request.headers,
        body,
    )
    .await;

    match result {
        Ok((status, headers, body)) => {
            // Batch all response messages and send them together
            let mut ws = ws_write.lock().await;
            
            // Send response init
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_init =
                encode_response_init(connection_id, stream_id, msg_seq, status, &headers, !body.is_empty());
            ws.feed(WsMessage::Binary(response_init.into())).await?;

            // Send body if any
            if !body.is_empty() {
                let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
                let body_chunk =
                    encode_response_body_chunk(connection_id, stream_id, msg_seq, &body, 0, true);
                ws.feed(WsMessage::Binary(body_chunk.into())).await?;
            }

            // Send response end
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_end = encode_response_end(connection_id, stream_id, msg_seq);
            ws.feed(WsMessage::Binary(response_end.into())).await?;
            
            // Flush all messages at once
            ws.flush().await?;
            drop(ws);

            info!(
                "Stream {}: {} {} -> {}",
                stream_id, request.method, request.uri, status
            );
        }
        Err(e) => {
            // Send error response
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_init =
                encode_response_init(connection_id, stream_id, msg_seq, 502, &[], true);
            {
                let mut ws = ws_write.lock().await;
                ws.send(WsMessage::Binary(response_init.into())).await?;
            }

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
            {
                let mut ws = ws_write.lock().await;
                ws.send(WsMessage::Binary(body_chunk.into())).await?;
            }

            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_end = encode_response_end(connection_id, stream_id, msg_seq);
            {
                let mut ws = ws_write.lock().await;
                ws.send(WsMessage::Binary(response_end.into())).await?;
            }

            warn!(
                "Stream {}: {} {} -> 502 ({})",
                stream_id, request.method, request.uri, e
            );
        }
    }

    // Clean up stream
    {
        let mut streams = streams.lock().await;
        streams.remove(&stream_id);
    }

    Ok(())
}

// =============================================================================
// WebSocket Handling
// =============================================================================

/// Handle WebSocket upgrade request - connect to local WS server and start proxying
async fn handle_websocket_upgrade(
    stream_id: u32,
    connection_id: u64,
    local_addr: SocketAddr,
    uri: &str,
    headers: &[(String, String)],
    ws_write: Arc<Mutex<futures_util::stream::SplitSink<WsStream, WsMessage>>>,
    streams: Arc<Mutex<HashMap<u32, StreamState>>>,
    msg_seq_counter: Arc<AtomicU32>,
) -> Result<()> {
    // Build local WebSocket URL
    let local_url = format!("ws://{}{}", local_addr, uri);
    
    // Build WebSocket request with forwarded headers
    let mut request = http::Request::builder()
        .uri(&local_url)
        .header("Sec-WebSocket-Key", tokio_tungstenite::tungstenite::handshake::client::generate_key())
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
    
    let request = request.body(()).context("Failed to build WebSocket request")?;
    
    // Connect to local WebSocket server
    let local_ws_result = connect_async(request).await;
    
    match local_ws_result {
        Ok((local_ws, response)) => {
            info!("Stream {}: Connected to local WebSocket server (status: {})", 
                  stream_id, response.status());
            
            // Send successful upgrade response to server
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_headers: Vec<(String, String)> = response
                .headers()
                .iter()
                .filter_map(|(k, v)| {
                    v.to_str().ok().map(|v| (k.to_string(), v.to_string()))
                })
                .collect();
            
            let response_init = encode_response_init(
                connection_id, 
                stream_id, 
                msg_seq, 
                101, // Switching Protocols
                &response_headers,
                false,
            );
            {
                let mut ws = ws_write.lock().await;
                ws.send(WsMessage::Binary(response_init.into())).await?;
            }
            
            // Create channel for sending messages to local WebSocket
            let (local_tx, mut local_rx) = mpsc::unbounded_channel::<WsMessage>();
            
            // Store WebSocket state
            {
                let mut streams_guard = streams.lock().await;
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
            
            // Split local WebSocket
            let (mut local_ws_write, mut local_ws_read) = local_ws.split();
            
            // Clone references for the tasks
            let ws_write_clone = ws_write.clone();
            let msg_seq_counter_clone = msg_seq_counter.clone();
            let streams_clone = streams.clone();
            
            // Spawn task to forward messages from local WS to server
            tokio::spawn(async move {
                while let Some(msg_result) = local_ws_read.next().await {
                    match msg_result {
                        Ok(msg) => {
                            let frame = match &msg {
                                WsMessage::Text(text) => {
                                    let msg_seq = msg_seq_counter_clone.fetch_add(1, Ordering::SeqCst);
                                    encode_ws_frame(
                                        connection_id,
                                        stream_id,
                                        msg_seq,
                                        1, // Text opcode
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
                                        2, // Binary opcode
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
                                        9, // Ping opcode
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
                                        10, // Pong opcode
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
                                        8, // Close opcode
                                        &[],
                                        Some(code),
                                    )
                                }
                                WsMessage::Frame(_) => continue, // Raw frames, skip
                            };
                            
                            let mut ws = ws_write_clone.lock().await;
                            if ws.send(WsMessage::Binary(frame.into())).await.is_err() {
                                break;
                            }
                        }
                        Err(e) => {
                            debug!("Stream {}: Local WS read error: {}", stream_id, e);
                            break;
                        }
                    }
                }
                
                // Clean up stream when local WS closes
                let mut streams_guard = streams_clone.lock().await;
                streams_guard.remove(&stream_id);
                debug!("Stream {}: Local WebSocket closed", stream_id);
            });
            
            // Spawn task to forward messages from channel to local WS
            tokio::spawn(async move {
                while let Some(msg) = local_rx.recv().await {
                    if local_ws_write.send(msg).await.is_err() {
                        break;
                    }
                }
            });
        }
        Err(e) => {
            // Failed to connect to local WebSocket server
            warn!("Stream {}: Failed to connect to local WebSocket: {}", stream_id, e);
            
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
            {
                let mut ws = ws_write.lock().await;
                ws.send(WsMessage::Binary(response_init.into())).await?;
            }
            
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
            {
                let mut ws = ws_write.lock().await;
                ws.send(WsMessage::Binary(body_chunk.into())).await?;
            }
            
            let msg_seq = msg_seq_counter.fetch_add(1, Ordering::SeqCst);
            let response_end = encode_response_end(connection_id, stream_id, msg_seq);
            {
                let mut ws = ws_write.lock().await;
                ws.send(WsMessage::Binary(response_end.into())).await?;
            }
        }
    }
    
    Ok(())
}

/// Handle WebSocket frame from server (forward to local WebSocket)
fn handle_ws_frame(
    stream_id: u32,
    opcode: u16,
    payload: &[u8],
    close_code: Option<u16>,
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
    
    let msg = match opcode {
        1 => {
            // Text
            match String::from_utf8(payload.to_vec()) {
                Ok(text) => WsMessage::Text(text.into()),
                Err(_) => {
                    debug!("Stream {}: Invalid UTF-8 in text frame", stream_id);
                    return;
                }
            }
        }
        2 => {
            // Binary
            WsMessage::Binary(payload.to_vec().into())
        }
        8 => {
            // Close
            WsMessage::Close(close_code.map(|code| {
                tokio_tungstenite::tungstenite::protocol::CloseFrame {
                    code: code.into(),
                    reason: "".into(),
                }
            }))
        }
        9 => {
            // Ping
            WsMessage::Ping(payload.to_vec().into())
        }
        10 => {
            // Pong
            WsMessage::Pong(payload.to_vec().into())
        }
        _ => {
            debug!("Stream {}: Unknown WS opcode: {}", stream_id, opcode);
            return;
        }
    };
    
    if local_ws.write_tx.send(msg).is_err() {
        debug!("Stream {}: Failed to send to local WebSocket", stream_id);
    }
}

/// Forward request to local server
async fn forward_to_local(
    local_addr: SocketAddr,
    method: &str,
    uri: &str,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
) -> Result<(u16, Vec<(String, String)>, Vec<u8>)> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        // Don't auto-decompress - forward raw bytes to preserve Content-Encoding
        .no_gzip()
        .no_brotli()
        .no_deflate()
        .no_zstd()
        .build()?;

    let url = format!("http://{}{}", local_addr, uri);

    let method = method
        .parse::<reqwest::Method>()
        .context("Invalid HTTP method")?;

    let mut req = client.request(method, &url);

    for (name, value) in headers {
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
        req = req.header(&name, &value);
    }
    
    // Override Accept-Encoding to prevent local server from compressing.
    // Cloudflare's edge will handle compression for the client.
    req = req.header("Accept-Encoding", "identity");

    if !body.is_empty() {
        req = req.body(body);
    }

    let resp = req
        .send()
        .await
        .context("Failed to forward request to local server")?;

    let status = resp.status().as_u16();
    let headers: Vec<(String, String)> = resp
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    
    let body = resp.bytes().await?.to_vec();

    Ok((status, headers, body))
}

// =============================================================================
// Encoding Functions
// =============================================================================

fn encode_response_init(
    connection_id: u64,
    stream_id: u32,
    msg_seq: u32,
    status: u16,
    headers: &[(String, String)],
    has_body: bool,
) -> Vec<u8> {
    let mut message = Builder::new_default();
    {
        let mut envelope = message.init_root::<message_capnp::envelope::Builder>();
        envelope.set_timestamp_ms(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        );
        envelope.set_connection_id(connection_id);
        envelope.set_stream_id(stream_id);
        envelope.set_msg_seq(msg_seq);

        let http = envelope.init_http();
        let mut init = http.init_response_init();
        init.set_timestamp_ms(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        );
        init.set_status(status);
        init.set_has_body(has_body);
        init.set_content_length(0);

        let mut header_list = init.init_headers(headers.len() as u32);
        for (i, (name, value)) in headers.iter().enumerate() {
            let mut h = header_list.reborrow().get(i as u32);
            h.set_name(name);
            h.set_value(value.as_bytes());
        }
    }

    let mut buf = Vec::new();
    serialize_packed::write_message(&mut buf, &message).unwrap();
    buf
}

fn encode_response_body_chunk(
    connection_id: u64,
    stream_id: u32,
    msg_seq: u32,
    data: &[u8],
    seq: u32,
    is_last: bool,
) -> Vec<u8> {
    let mut message = Builder::new_default();
    {
        let mut envelope = message.init_root::<message_capnp::envelope::Builder>();
        envelope.set_timestamp_ms(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        );
        envelope.set_connection_id(connection_id);
        envelope.set_stream_id(stream_id);
        envelope.set_msg_seq(msg_seq);

        let http = envelope.init_http();
        let mut chunk = http.init_response_body_chunk();
        chunk.set_timestamp_ms(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        );
        chunk.set_data(data);
        chunk.set_seq(seq);
        chunk.set_is_last(is_last);
    }

    let mut buf = Vec::new();
    serialize_packed::write_message(&mut buf, &message).unwrap();
    buf
}

fn encode_response_end(connection_id: u64, stream_id: u32, msg_seq: u32) -> Vec<u8> {
    let mut message = Builder::new_default();
    {
        let mut envelope = message.init_root::<message_capnp::envelope::Builder>();
        envelope.set_timestamp_ms(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        );
        envelope.set_connection_id(connection_id);
        envelope.set_stream_id(stream_id);
        envelope.set_msg_seq(msg_seq);

        let http = envelope.init_http();
        let mut end = http.init_response_end();
        end.set_timestamp_ms(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        );
    }

    let mut buf = Vec::new();
    serialize_packed::write_message(&mut buf, &message).unwrap();
    buf
}

fn encode_control_pong(connection_id: u64, data: &[u8]) -> Vec<u8> {
    let mut message = Builder::new_default();
    {
        let mut envelope = message.init_root::<message_capnp::envelope::Builder>();
        envelope.set_timestamp_ms(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        );
        envelope.set_connection_id(connection_id);
        envelope.set_stream_id(0);
        envelope.set_msg_seq(0);

        let control = envelope.init_control();
        let mut pong = control.init_pong();
        pong.set_timestamp_ms(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        );
        pong.set_data(data);
    }

    let mut buf = Vec::new();
    serialize_packed::write_message(&mut buf, &message).unwrap();
    buf
}

fn encode_ws_frame(
    connection_id: u64,
    stream_id: u32,
    msg_seq: u32,
    opcode: u16,
    payload: &[u8],
    close_code: Option<u16>,
) -> Vec<u8> {
    let mut message = Builder::new_default();
    {
        let mut envelope = message.init_root::<message_capnp::envelope::Builder>();
        envelope.set_timestamp_ms(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        );
        envelope.set_connection_id(connection_id);
        envelope.set_stream_id(stream_id);
        envelope.set_msg_seq(msg_seq);

        let mut ws = envelope.init_ws();
        ws.set_timestamp_ms(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        );
        ws.set_fin(true);
        ws.set_rsv1(false);
        ws.set_rsv2(false);
        ws.set_rsv3(false);
        
        // Map opcode to enum
        let opcode_enum = match opcode {
            0 => message_capnp::WebSocketOpcode::Continuation,
            1 => message_capnp::WebSocketOpcode::Text,
            2 => message_capnp::WebSocketOpcode::Binary,
            8 => message_capnp::WebSocketOpcode::Close,
            9 => message_capnp::WebSocketOpcode::Ping,
            10 => message_capnp::WebSocketOpcode::Pong,
            _ => message_capnp::WebSocketOpcode::Binary,
        };
        ws.set_opcode(opcode_enum);
        ws.set_masked(false);
        ws.set_mask_key(0);
        ws.set_payload(payload);
        
        if let Some(code) = close_code {
            ws.set_close_code(code);
        }
    }

    let mut buf = Vec::new();
    serialize_packed::write_message(&mut buf, &message).unwrap();
    buf
}
