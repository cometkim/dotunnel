//! DOtunnel wire protocol schema.
//!
//! This file is the single source of truth for the tunnel wire format.
//! `build.rs` feeds it to `rkyv-js-codegen` which emits matching TypeScript
//! codecs at `dotunnel-cloudflare/src/app/transport/message.gen.ts`.
//!
//! Keep this file limited to type definitions; codec helpers live in the
//! parent `transport` module.

use bytes::Bytes;
use rkyv::{Archive, Deserialize, Serialize};

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct Envelope {
    pub timestamp_ms: u64,
    pub connection_id: u64,
    pub stream_id: u32,
    pub msg_seq: u32,
    pub payload: Payload,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub enum Payload {
    Http(HttpMessage),
    Ws(WebSocketFrame),
    Control(Control),
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub enum HttpMessage {
    RequestInit(HttpRequestInit),
    RequestBodyChunk(HttpBodyChunk),
    RequestTrailers(HttpTrailers),
    RequestEnd(HttpRequestEnd),
    RequestAbort(HttpRequestAbort),

    ResponseInit(HttpResponseInit),
    /// 1xx interim responses, e.g. 103 Early Hints
    ResponseInterim(HttpInterimResponse),
    ResponseBodyChunk(HttpBodyChunk),
    ResponseTrailers(HttpTrailers),
    ResponseEnd(HttpResponseEnd),
    ResponseAbort(HttpResponseAbort),
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct HttpRequestInit {
    pub timestamp_ms: u64,
    pub method: String,
    pub uri: String,
    pub version: HttpVersion,
    pub headers: Vec<Header>,
    pub has_body: bool,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct HttpRequestEnd {
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct HttpRequestAbort {
    pub timestamp_ms: u64,
    pub reason: AbortReason,
    pub detail: String,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct HttpResponseInit {
    pub timestamp_ms: u64,
    /// 200, 404, ...
    pub status: u16,
    pub headers: Vec<Header>,
    pub has_body: bool,
    /// 0 = unknown
    pub content_length: u64,
}

/// e.g. 100 Continue, 103 Early Hints
#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct HttpInterimResponse {
    pub timestamp_ms: u64,
    /// 100-199
    pub status: u16,
    pub headers: Vec<Header>,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct HttpBodyChunk {
    pub timestamp_ms: u64,
    pub data: Bytes,
    pub seq: u32,
    pub is_last: bool,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct HttpTrailers {
    pub timestamp_ms: u64,
    pub headers: Vec<Header>,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct HttpResponseEnd {
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct HttpResponseAbort {
    pub timestamp_ms: u64,
    pub reason: AbortReason,
    pub detail: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Archive, Serialize, Deserialize)]
pub enum HttpVersion {
    /// HTTP/1.1
    H1,
    /// HTTP/2 (h3 is not supported)
    H2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Archive, Serialize, Deserialize)]
pub enum AbortReason {
    Unknown,
    Timeout,
    PeerClosed,
    ResetByPeer,
    ConnectionLost,
    Cancelled,
    ProtocolError,
    FlowControl,
    Overload,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct Header {
    pub name: String,
    pub value: Bytes,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Archive, Serialize, Deserialize)]
pub enum WebSocketOpcode {
    Continuation,
    Text,
    Binary,
    Close,
    Ping,
    Pong,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct WebSocketFrame {
    pub timestamp_ms: u64,
    pub fin: bool,
    pub rsv1: bool,
    pub rsv2: bool,
    pub rsv3: bool,
    pub opcode: WebSocketOpcode,
    pub masked: bool,
    pub mask_key: u32,

    pub payload: Bytes,

    /// only for close frame
    pub close_code: Option<u16>,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub enum Control {
    Ping(Ping),
    Pong(Pong),
    FlowWindowUpdate(FlowWindowUpdate),
    Error(ErrorReport),
    GoAway(GoAway),
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct Ping {
    pub timestamp_ms: u64,
    pub data: Bytes,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct Pong {
    pub timestamp_ms: u64,
    pub data: Bytes,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct FlowWindowUpdate {
    pub timestamp_ms: u64,
    pub available_send_bytes: u32,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct ErrorReport {
    pub timestamp_ms: u64,
    pub code: u32,
    pub message: String,
}

#[derive(Debug, Clone, Archive, Serialize, Deserialize)]
pub struct GoAway {
    pub timestamp_ms: u64,
    pub last_msg_seq: u32,
    pub reason: String,
}
