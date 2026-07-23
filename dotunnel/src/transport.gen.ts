/**
 * Generated TypeScript codecs for the DOtunnel wire protocol.
 * Source of truth: dotunnel/src/transport/message.rs — do not edit by hand.
 */

import * as r from 'rkyv-js';
import { bytes } from 'rkyv-js/lib/bytes';

export const ArchivedAbortReason = r.taggedEnum({
  Unknown: null,
  Timeout: null,
  PeerClosed: null,
  ResetByPeer: null,
  ConnectionLost: null,
  Cancelled: null,
  ProtocolError: null,
  FlowControl: null,
  Overload: null,
});

export type AbortReason = r.Infer<typeof ArchivedAbortReason>;

export const ArchivedErrorReport = r.struct({
  timestamp_ms: r.u64,
  code: r.u32,
  message: r.string,
});

export type ErrorReport = r.Infer<typeof ArchivedErrorReport>;

export const ArchivedFlowWindowUpdate = r.struct({
  timestamp_ms: r.u64,
  available_send_bytes: r.u32,
});

export type FlowWindowUpdate = r.Infer<typeof ArchivedFlowWindowUpdate>;

export const ArchivedGoAway = r.struct({
  timestamp_ms: r.u64,
  last_msg_seq: r.u32,
  reason: r.string,
});

export type GoAway = r.Infer<typeof ArchivedGoAway>;

export const ArchivedHeader = r.struct({
  name: r.string,
  value: bytes,
});

export type Header = r.Infer<typeof ArchivedHeader>;

export const ArchivedHttpBodyChunk = r.struct({
  timestamp_ms: r.u64,
  data: bytes,
  seq: r.u32,
  is_last: r.bool,
});

export type HttpBodyChunk = r.Infer<typeof ArchivedHttpBodyChunk>;

export const ArchivedHttpInterimResponse = r.struct({
  timestamp_ms: r.u64,
  status: r.u16,
  headers: r.vec(ArchivedHeader),
});

export type HttpInterimResponse = r.Infer<typeof ArchivedHttpInterimResponse>;

export const ArchivedHttpRequestAbort = r.struct({
  timestamp_ms: r.u64,
  reason: ArchivedAbortReason,
  detail: r.string,
});

export type HttpRequestAbort = r.Infer<typeof ArchivedHttpRequestAbort>;

export const ArchivedHttpRequestEnd = r.struct({
  timestamp_ms: r.u64,
});

export type HttpRequestEnd = r.Infer<typeof ArchivedHttpRequestEnd>;

export const ArchivedHttpResponseAbort = r.struct({
  timestamp_ms: r.u64,
  reason: ArchivedAbortReason,
  detail: r.string,
});

export type HttpResponseAbort = r.Infer<typeof ArchivedHttpResponseAbort>;

export const ArchivedHttpResponseEnd = r.struct({
  timestamp_ms: r.u64,
});

export type HttpResponseEnd = r.Infer<typeof ArchivedHttpResponseEnd>;

export const ArchivedHttpResponseInit = r.struct({
  timestamp_ms: r.u64,
  status: r.u16,
  headers: r.vec(ArchivedHeader),
  has_body: r.bool,
  content_length: r.u64,
});

export type HttpResponseInit = r.Infer<typeof ArchivedHttpResponseInit>;

export const ArchivedHttpTrailers = r.struct({
  timestamp_ms: r.u64,
  headers: r.vec(ArchivedHeader),
});

export type HttpTrailers = r.Infer<typeof ArchivedHttpTrailers>;

export const ArchivedHttpVersion = r.taggedEnum({
  H1: null,
  H2: null,
});

export type HttpVersion = r.Infer<typeof ArchivedHttpVersion>;

export const ArchivedHttpRequestInit = r.struct({
  timestamp_ms: r.u64,
  method: r.string,
  uri: r.string,
  version: ArchivedHttpVersion,
  headers: r.vec(ArchivedHeader),
  has_body: r.bool,
});

export type HttpRequestInit = r.Infer<typeof ArchivedHttpRequestInit>;

export const ArchivedHttpMessage = r.taggedEnum({
  RequestInit: ArchivedHttpRequestInit,
  RequestBodyChunk: ArchivedHttpBodyChunk,
  RequestTrailers: ArchivedHttpTrailers,
  RequestEnd: ArchivedHttpRequestEnd,
  RequestAbort: ArchivedHttpRequestAbort,
  ResponseInit: ArchivedHttpResponseInit,
  ResponseInterim: ArchivedHttpInterimResponse,
  ResponseBodyChunk: ArchivedHttpBodyChunk,
  ResponseTrailers: ArchivedHttpTrailers,
  ResponseEnd: ArchivedHttpResponseEnd,
  ResponseAbort: ArchivedHttpResponseAbort,
});

export type HttpMessage = r.Infer<typeof ArchivedHttpMessage>;

export const ArchivedPing = r.struct({
  timestamp_ms: r.u64,
  data: bytes,
});

export type Ping = r.Infer<typeof ArchivedPing>;

export const ArchivedPong = r.struct({
  timestamp_ms: r.u64,
  data: bytes,
});

export type Pong = r.Infer<typeof ArchivedPong>;

export const ArchivedControl = r.taggedEnum({
  Ping: ArchivedPing,
  Pong: ArchivedPong,
  FlowWindowUpdate: ArchivedFlowWindowUpdate,
  Error: ArchivedErrorReport,
  GoAway: ArchivedGoAway,
});

export type Control = r.Infer<typeof ArchivedControl>;

export const ArchivedWebSocketOpcode = r.taggedEnum({
  Continuation: null,
  Text: null,
  Binary: null,
  Close: null,
  Ping: null,
  Pong: null,
});

export type WebSocketOpcode = r.Infer<typeof ArchivedWebSocketOpcode>;

export const ArchivedWebSocketFrame = r.struct({
  timestamp_ms: r.u64,
  fin: r.bool,
  rsv1: r.bool,
  rsv2: r.bool,
  rsv3: r.bool,
  opcode: ArchivedWebSocketOpcode,
  masked: r.bool,
  mask_key: r.u32,
  payload: bytes,
  close_code: r.option(r.u16),
});

export type WebSocketFrame = r.Infer<typeof ArchivedWebSocketFrame>;

export const ArchivedPayload = r.taggedEnum({
  Http: ArchivedHttpMessage,
  Ws: ArchivedWebSocketFrame,
  Control: ArchivedControl,
});

export type Payload = r.Infer<typeof ArchivedPayload>;

export const ArchivedEnvelope = r.struct({
  timestamp_ms: r.u64,
  connection_id: r.u64,
  stream_id: r.u32,
  msg_seq: r.u32,
  payload: ArchivedPayload,
});

export type Envelope = r.Infer<typeof ArchivedEnvelope>;
