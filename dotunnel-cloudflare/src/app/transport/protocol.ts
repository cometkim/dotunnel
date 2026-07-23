/**
 * Protocol utilities for encoding/decoding rkyv tunnel messages.
 * Provides high-level helpers for HTTP request/response and WebSocket frame handling.
 *
 * The wire schema is defined in dotunnel/src/transport/message.rs;
 * the codecs in message.gen.ts are generated from it by rkyv-js-codegen.
 */

import {
  ArchivedEnvelope,
  type Control,
  type Header,
  type HttpMessage,
  type Payload,
  type AbortReason as WireAbortReason,
  type HttpVersion as WireHttpVersion,
  type WebSocketFrame as WireWebSocketFrame,
  type WebSocketOpcode as WireWebSocketOpcode,
} from "dotunnel/transport";

// =============================================================================
// Constants
// =============================================================================

/** Maximum concurrent streams per tunnel */
export const MAX_CONCURRENT_STREAMS = 100;

/** Request timeout in milliseconds */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Module-level TextEncoder/TextDecoder singletons to avoid per-call allocation */
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// =============================================================================
// Enums (tag unions mirroring the Rust enums)
// =============================================================================

export type HttpVersion = WireHttpVersion["tag"];
export const HttpVersion = {
  H1: "H1",
  H2: "H2",
} as const satisfies Record<string, HttpVersion>;

export type AbortReason = WireAbortReason["tag"];
export const AbortReason = {
  UNKNOWN: "Unknown",
  TIMEOUT: "Timeout",
  PEER_CLOSED: "PeerClosed",
  RESET_BY_PEER: "ResetByPeer",
  CONNECTION_LOST: "ConnectionLost",
  CANCELLED: "Cancelled",
  PROTOCOL_ERROR: "ProtocolError",
  FLOW_CONTROL: "FlowControl",
  OVERLOAD: "Overload",
} as const satisfies Record<string, AbortReason>;

export type WebSocketOpcode = WireWebSocketOpcode["tag"];
export const WebSocketOpcode = {
  CONTINUATION: "Continuation",
  TEXT: "Text",
  BINARY: "Binary",
  CLOSE: "Close",
  PING: "Ping",
  PONG: "Pong",
} as const satisfies Record<string, WebSocketOpcode>;

// =============================================================================
// Types
// =============================================================================

/** Decoded envelope with type-safe union handling */
export type DecodedEnvelope =
  | {
      type: "http";
      streamId: number;
      connectionId: bigint;
      msgSeq: number;
      http: DecodedHttpMessage;
    }
  | {
      type: "ws";
      streamId: number;
      connectionId: bigint;
      msgSeq: number;
      ws: DecodedWebSocketFrame;
    }
  | {
      type: "control";
      streamId: number;
      connectionId: bigint;
      msgSeq: number;
      control: DecodedControl;
    };

/** Decoded HTTP message variants */
export type DecodedHttpMessage =
  | { type: "requestInit"; data: DecodedHttpRequestInit }
  | { type: "requestBodyChunk"; data: DecodedHttpBodyChunk }
  | { type: "requestEnd"; timestampMs: bigint }
  | { type: "requestAbort"; reason: AbortReason; detail: string }
  | { type: "responseInit"; data: DecodedHttpResponseInit }
  | { type: "responseBodyChunk"; data: DecodedHttpBodyChunk }
  | { type: "responseEnd"; timestampMs: bigint }
  | { type: "responseAbort"; reason: AbortReason; detail: string };

export interface DecodedHttpRequestInit {
  timestampMs: bigint;
  method: string;
  uri: string;
  version: HttpVersion;
  headers: Array<{ name: string; value: Uint8Array }>;
  hasBody: boolean;
}

export interface DecodedHttpResponseInit {
  timestampMs: bigint;
  status: number;
  headers: Array<{ name: string; value: Uint8Array }>;
  hasBody: boolean;
  contentLength: bigint;
}

export interface DecodedHttpBodyChunk {
  timestampMs: bigint;
  data: Uint8Array;
  seq: number;
  isLast: boolean;
}

/** Decoded WebSocket frame */
export interface DecodedWebSocketFrame {
  timestampMs: bigint;
  opcode: WebSocketOpcode;
  fin: boolean;
  payload: Uint8Array;
  closeCode?: number;
}

/** Decoded control message */
export type DecodedControl =
  | { type: "ping"; timestampMs: bigint; data: Uint8Array }
  | { type: "pong"; timestampMs: bigint; data: Uint8Array }
  | { type: "error"; timestampMs: bigint; code: number; message: string }
  | { type: "goAway"; timestampMs: bigint; lastMsgSeq: number; reason: string };

// =============================================================================
// Encoding Functions
// =============================================================================

function encodeEnvelope(
  connectionId: bigint,
  streamId: number,
  msgSeq: number,
  payload: (timestampMs: bigint) => Payload,
): Uint8Array {
  const timestampMs = BigInt(Date.now());
  return ArchivedEnvelope.encode({
    timestamp_ms: timestampMs,
    connection_id: connectionId,
    stream_id: streamId,
    msg_seq: msgSeq,
    payload: payload(timestampMs),
  });
}

function encodeHeaders(headers: Headers): Header[] {
  return Array.from(headers.entries()).map(([name, value]) => ({
    name,
    value: textEncoder.encode(value),
  }));
}

function wireAbortReason(reason: AbortReason): WireAbortReason {
  return { tag: reason, value: null } as WireAbortReason;
}

/**
 * Encode an HTTP request init message.
 * Sent from DO to CLI when a new HTTP request arrives.
 */
export function encodeHttpRequestInit(
  connectionId: bigint,
  streamId: number,
  msgSeq: number,
  request: {
    method: string;
    uri: string;
    headers: Headers;
    hasBody: boolean;
  },
): Uint8Array {
  return encodeEnvelope(connectionId, streamId, msgSeq, (timestampMs) => ({
    tag: "Http",
    value: {
      tag: "RequestInit",
      value: {
        timestamp_ms: timestampMs,
        method: request.method,
        uri: request.uri,
        version: { tag: "H1", value: null },
        headers: encodeHeaders(request.headers),
        has_body: request.hasBody,
      },
    },
  }));
}

/**
 * Encode an HTTP body chunk message.
 * Used for streaming request/response bodies.
 */
export function encodeHttpBodyChunk(
  connectionId: bigint,
  streamId: number,
  msgSeq: number,
  data: Uint8Array,
  seq: number,
  isLast: boolean,
  isRequest: boolean,
): Uint8Array {
  return encodeEnvelope(connectionId, streamId, msgSeq, (timestampMs) => ({
    tag: "Http",
    value: {
      tag: isRequest ? "RequestBodyChunk" : "ResponseBodyChunk",
      value: {
        timestamp_ms: timestampMs,
        data,
        seq,
        is_last: isLast,
      },
    },
  }));
}

/**
 * Encode an HTTP request end message.
 * Signals the end of request body.
 */
export function encodeHttpRequestEnd(
  connectionId: bigint,
  streamId: number,
  msgSeq: number,
): Uint8Array {
  return encodeEnvelope(connectionId, streamId, msgSeq, (timestampMs) => ({
    tag: "Http",
    value: {
      tag: "RequestEnd",
      value: { timestamp_ms: timestampMs },
    },
  }));
}

/**
 * Encode an HTTP request abort message.
 */
export function encodeHttpRequestAbort(
  connectionId: bigint,
  streamId: number,
  msgSeq: number,
  reason: AbortReason,
  detail: string,
): Uint8Array {
  return encodeEnvelope(connectionId, streamId, msgSeq, (timestampMs) => ({
    tag: "Http",
    value: {
      tag: "RequestAbort",
      value: {
        timestamp_ms: timestampMs,
        reason: wireAbortReason(reason),
        detail,
      },
    },
  }));
}

/**
 * Encode an HTTP response init message.
 * Sent from CLI to DO when local server responds.
 */
export function encodeHttpResponseInit(
  connectionId: bigint,
  streamId: number,
  msgSeq: number,
  response: {
    status: number;
    headers: Headers;
    hasBody: boolean;
    contentLength?: bigint;
  },
): Uint8Array {
  return encodeEnvelope(connectionId, streamId, msgSeq, (timestampMs) => ({
    tag: "Http",
    value: {
      tag: "ResponseInit",
      value: {
        timestamp_ms: timestampMs,
        status: response.status,
        headers: encodeHeaders(response.headers),
        has_body: response.hasBody,
        content_length: response.contentLength ?? 0n,
      },
    },
  }));
}

/**
 * Encode an HTTP response end message.
 */
export function encodeHttpResponseEnd(
  connectionId: bigint,
  streamId: number,
  msgSeq: number,
): Uint8Array {
  return encodeEnvelope(connectionId, streamId, msgSeq, (timestampMs) => ({
    tag: "Http",
    value: {
      tag: "ResponseEnd",
      value: { timestamp_ms: timestampMs },
    },
  }));
}

/**
 * Encode an HTTP response abort message.
 */
export function encodeHttpResponseAbort(
  connectionId: bigint,
  streamId: number,
  msgSeq: number,
  reason: AbortReason,
  detail: string,
): Uint8Array {
  return encodeEnvelope(connectionId, streamId, msgSeq, (timestampMs) => ({
    tag: "Http",
    value: {
      tag: "ResponseAbort",
      value: {
        timestamp_ms: timestampMs,
        reason: wireAbortReason(reason),
        detail,
      },
    },
  }));
}

/**
 * Encode a WebSocket frame message.
 * Used for proxying WebSocket connections.
 */
export function encodeWebSocketFrame(
  connectionId: bigint,
  streamId: number,
  msgSeq: number,
  frame: {
    opcode: WebSocketOpcode;
    payload: Uint8Array;
    fin?: boolean;
    closeCode?: number;
  },
): Uint8Array {
  return encodeEnvelope(connectionId, streamId, msgSeq, (timestampMs) => ({
    tag: "Ws",
    value: {
      timestamp_ms: timestampMs,
      fin: frame.fin ?? true,
      rsv1: false,
      rsv2: false,
      rsv3: false,
      opcode: { tag: frame.opcode, value: null } as WireWebSocketOpcode,
      masked: false,
      mask_key: 0,
      payload: frame.payload,
      close_code: frame.closeCode ?? null,
    },
  }));
}

/**
 * Encode a control ping message.
 */
export function encodeControlPing(
  connectionId: bigint,
  data?: Uint8Array,
): Uint8Array {
  return encodeEnvelope(connectionId, 0, 0, (timestampMs) => ({
    tag: "Control",
    value: {
      tag: "Ping",
      value: {
        timestamp_ms: timestampMs,
        data: data ?? new Uint8Array(0),
      },
    },
  }));
}

/**
 * Encode a control pong message.
 */
export function encodeControlPong(
  connectionId: bigint,
  data?: Uint8Array,
): Uint8Array {
  return encodeEnvelope(connectionId, 0, 0, (timestampMs) => ({
    tag: "Control",
    value: {
      tag: "Pong",
      value: {
        timestamp_ms: timestampMs,
        data: data ?? new Uint8Array(0),
      },
    },
  }));
}

/**
 * Encode a control error message.
 */
export function encodeControlError(
  connectionId: bigint,
  code: number,
  message: string,
): Uint8Array {
  return encodeEnvelope(connectionId, 0, 0, (timestampMs) => ({
    tag: "Control",
    value: {
      tag: "Error",
      value: {
        timestamp_ms: timestampMs,
        code,
        message,
      },
    },
  }));
}

/**
 * Encode a control goaway message.
 */
export function encodeControlGoAway(
  connectionId: bigint,
  lastMsgSeq: number,
  reason: string,
): Uint8Array {
  return encodeEnvelope(connectionId, 0, 0, (timestampMs) => ({
    tag: "Control",
    value: {
      tag: "GoAway",
      value: {
        timestamp_ms: timestampMs,
        last_msg_seq: lastMsgSeq,
        reason,
      },
    },
  }));
}

// =============================================================================
// Decoding Functions
// =============================================================================

/**
 * Decode an rkyv-encoded envelope from ArrayBuffer.
 */
export function decodeEnvelope(buffer: ArrayBuffer): DecodedEnvelope {
  const envelope = ArchivedEnvelope.decode(new Uint8Array(buffer));

  const base = {
    streamId: envelope.stream_id,
    connectionId: envelope.connection_id,
    msgSeq: envelope.msg_seq,
  };

  const payload = envelope.payload;
  switch (payload.tag) {
    case "Http":
      return {
        type: "http",
        ...base,
        http: decodeHttpMessage(payload.value),
      };
    case "Ws":
      return {
        type: "ws",
        ...base,
        ws: decodeWebSocketFrame(payload.value),
      };
    case "Control":
      return {
        type: "control",
        ...base,
        control: decodeControl(payload.value),
      };
  }
}

function decodeHttpMessage(http: HttpMessage): DecodedHttpMessage {
  switch (http.tag) {
    case "RequestInit": {
      const init = http.value;
      return {
        type: "requestInit",
        data: {
          timestampMs: init.timestamp_ms,
          method: init.method,
          uri: init.uri,
          version: init.version.tag,
          headers: init.headers,
          hasBody: init.has_body,
        },
      };
    }
    case "RequestBodyChunk": {
      const chunk = http.value;
      return {
        type: "requestBodyChunk",
        data: {
          timestampMs: chunk.timestamp_ms,
          data: chunk.data,
          seq: chunk.seq,
          isLast: chunk.is_last,
        },
      };
    }
    case "RequestEnd":
      return {
        type: "requestEnd",
        timestampMs: http.value.timestamp_ms,
      };
    case "RequestAbort":
      return {
        type: "requestAbort",
        reason: http.value.reason.tag,
        detail: http.value.detail,
      };
    case "ResponseInit": {
      const init = http.value;
      return {
        type: "responseInit",
        data: {
          timestampMs: init.timestamp_ms,
          status: init.status,
          headers: init.headers,
          hasBody: init.has_body,
          contentLength: init.content_length,
        },
      };
    }
    case "ResponseBodyChunk": {
      const chunk = http.value;
      return {
        type: "responseBodyChunk",
        data: {
          timestampMs: chunk.timestamp_ms,
          data: chunk.data,
          seq: chunk.seq,
          isLast: chunk.is_last,
        },
      };
    }
    case "ResponseEnd":
      return {
        type: "responseEnd",
        timestampMs: http.value.timestamp_ms,
      };
    case "ResponseAbort":
      return {
        type: "responseAbort",
        reason: http.value.reason.tag,
        detail: http.value.detail,
      };
    default:
      throw new Error(`Unsupported HTTP message type: ${http.tag}`);
  }
}

function decodeWebSocketFrame(ws: WireWebSocketFrame): DecodedWebSocketFrame {
  return {
    timestampMs: ws.timestamp_ms,
    opcode: ws.opcode.tag,
    fin: ws.fin,
    payload: ws.payload,
    closeCode:
      ws.opcode.tag === WebSocketOpcode.CLOSE
        ? (ws.close_code ?? undefined)
        : undefined,
  };
}

function decodeControl(control: Control): DecodedControl {
  switch (control.tag) {
    case "Ping":
      return {
        type: "ping",
        timestampMs: control.value.timestamp_ms,
        data: control.value.data,
      };
    case "Pong":
      return {
        type: "pong",
        timestampMs: control.value.timestamp_ms,
        data: control.value.data,
      };
    case "Error":
      return {
        type: "error",
        timestampMs: control.value.timestamp_ms,
        code: control.value.code,
        message: control.value.message,
      };
    case "GoAway":
      return {
        type: "goAway",
        timestampMs: control.value.timestamp_ms,
        lastMsgSeq: control.value.last_msg_seq,
        reason: control.value.reason,
      };
    default:
      throw new Error(`Unsupported control message type: ${control.tag}`);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert decoded headers to a standard Headers object.
 */
export function headersFromDecoded(
  decoded: Array<{ name: string; value: Uint8Array }>,
): Headers {
  const headers = new Headers();
  for (const { name, value } of decoded) {
    headers.append(name, textDecoder.decode(value));
  }
  return headers;
}

/**
 * Convert WebSocket opcode to string for logging.
 */
export function opcodeToString(opcode: WebSocketOpcode): string {
  return opcode.toLowerCase();
}
