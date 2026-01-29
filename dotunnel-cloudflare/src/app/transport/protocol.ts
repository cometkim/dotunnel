/**
 * Protocol utilities for encoding/decoding Cap'n Proto tunnel messages.
 * Provides high-level helpers for HTTP request/response and WebSocket frame handling.
 */

import { Message } from "capnp-es";
import {
  AbortReason,
  type Control,
  Control_Which,
  Envelope,
  Envelope_Which,
  type Header,
  type HttpMessage,
  HttpMessage_Which,
  HttpVersion,
  type WebSocketFrame,
  WebSocketOpcode,
} from "./message.ts";

// =============================================================================
// Constants
// =============================================================================

/** Maximum concurrent streams per tunnel */
export const MAX_CONCURRENT_STREAMS = 100;

/** Request timeout in milliseconds */
export const REQUEST_TIMEOUT_MS = 30_000;

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
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = streamId;
  envelope.msgSeq = msgSeq;

  const http = envelope._initHttp();
  const init = http._initRequestInit();
  init.timestampMs = envelope.timestampMs;
  init.method = request.method;
  init.uri = request.uri;
  init.version = HttpVersion.H1;
  init.hasBody = request.hasBody;

  // Convert Headers to Cap'n Proto list
  const headerEntries = Array.from(request.headers.entries());
  const headers = init._initHeaders(headerEntries.length);
  const encoder = new TextEncoder();
  for (let i = 0; i < headerEntries.length; i++) {
    const [name, value] = headerEntries[i];
    const header = headers.get(i);
    header.name = name;
    const valueBytes = encoder.encode(value);
    const valueData = header._initValue(valueBytes.length);
    valueData.copyBuffer(valueBytes);
  }

  return msg.toPackedArrayBuffer();
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
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = streamId;
  envelope.msgSeq = msgSeq;

  const http = envelope._initHttp();
  const chunk = isRequest
    ? http._initRequestBodyChunk()
    : http._initResponseBodyChunk();
  chunk.timestampMs = envelope.timestampMs;
  chunk.seq = seq;
  chunk.isLast = isLast;

  const chunkData = chunk._initData(data.length);
  chunkData.copyBuffer(data);

  return msg.toPackedArrayBuffer();
}

/**
 * Encode an HTTP request end message.
 * Signals the end of request body.
 */
export function encodeHttpRequestEnd(
  connectionId: bigint,
  streamId: number,
  msgSeq: number,
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = streamId;
  envelope.msgSeq = msgSeq;

  const http = envelope._initHttp();
  const end = http._initRequestEnd();
  end.timestampMs = envelope.timestampMs;

  return msg.toPackedArrayBuffer();
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
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = streamId;
  envelope.msgSeq = msgSeq;

  const http = envelope._initHttp();
  const abort = http._initRequestAbort();
  abort.timestampMs = envelope.timestampMs;
  abort.reason = reason;
  abort.detail = detail;

  return msg.toPackedArrayBuffer();
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
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = streamId;
  envelope.msgSeq = msgSeq;

  const http = envelope._initHttp();
  const init = http._initResponseInit();
  init.timestampMs = envelope.timestampMs;
  init.status = response.status;
  init.hasBody = response.hasBody;
  init.contentLength = response.contentLength ?? 0n;

  // Convert Headers to Cap'n Proto list
  const headerEntries = Array.from(response.headers.entries());
  const headers = init._initHeaders(headerEntries.length);
  const encoder = new TextEncoder();
  for (let i = 0; i < headerEntries.length; i++) {
    const [name, value] = headerEntries[i];
    const header = headers.get(i);
    header.name = name;
    const valueBytes = encoder.encode(value);
    const valueData = header._initValue(valueBytes.length);
    valueData.copyBuffer(valueBytes);
  }

  return msg.toPackedArrayBuffer();
}

/**
 * Encode an HTTP response end message.
 */
export function encodeHttpResponseEnd(
  connectionId: bigint,
  streamId: number,
  msgSeq: number,
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = streamId;
  envelope.msgSeq = msgSeq;

  const http = envelope._initHttp();
  const end = http._initResponseEnd();
  end.timestampMs = envelope.timestampMs;

  return msg.toPackedArrayBuffer();
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
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = streamId;
  envelope.msgSeq = msgSeq;

  const http = envelope._initHttp();
  const abort = http._initResponseAbort();
  abort.timestampMs = envelope.timestampMs;
  abort.reason = reason;
  abort.detail = detail;

  return msg.toPackedArrayBuffer();
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
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = streamId;
  envelope.msgSeq = msgSeq;

  const ws = envelope._initWs();
  ws.timestampMs = envelope.timestampMs;
  ws.opcode = frame.opcode;
  ws.fin = frame.fin ?? true;
  ws.masked = false;
  ws.maskKey = 0;

  if (frame.closeCode !== undefined) {
    ws.closeCode = frame.closeCode;
  }

  const payload = ws._initPayload(frame.payload.length);
  payload.copyBuffer(frame.payload);

  return msg.toPackedArrayBuffer();
}

/**
 * Encode a control ping message.
 */
export function encodeControlPing(
  connectionId: bigint,
  data?: Uint8Array,
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = 0;
  envelope.msgSeq = 0;

  const control = envelope._initControl();
  const ping = control._initPing();
  ping.timestampMs = envelope.timestampMs;

  if (data) {
    const pingData = ping._initData(data.length);
    pingData.copyBuffer(data);
  }

  return msg.toPackedArrayBuffer();
}

/**
 * Encode a control pong message.
 */
export function encodeControlPong(
  connectionId: bigint,
  data?: Uint8Array,
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = 0;
  envelope.msgSeq = 0;

  const control = envelope._initControl();
  const pong = control._initPong();
  pong.timestampMs = envelope.timestampMs;

  if (data) {
    const pongData = pong._initData(data.length);
    pongData.copyBuffer(data);
  }

  return msg.toPackedArrayBuffer();
}

/**
 * Encode a control error message.
 */
export function encodeControlError(
  connectionId: bigint,
  code: number,
  message: string,
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = 0;
  envelope.msgSeq = 0;

  const control = envelope._initControl();
  const error = control._initError();
  error.timestampMs = envelope.timestampMs;
  error.code = code;
  error.message = message;

  return msg.toPackedArrayBuffer();
}

/**
 * Encode a control goaway message.
 */
export function encodeControlGoAway(
  connectionId: bigint,
  lastMsgSeq: number,
  reason: string,
): ArrayBuffer {
  const msg = new Message();
  const envelope = msg.initRoot(Envelope);
  envelope.timestampMs = BigInt(Date.now());
  envelope.connectionId = connectionId;
  envelope.streamId = 0;
  envelope.msgSeq = 0;

  const control = envelope._initControl();
  const goAway = control._initGoAway();
  goAway.timestampMs = envelope.timestampMs;
  goAway.lastMsgSeq = lastMsgSeq;
  goAway.reason = reason;

  return msg.toPackedArrayBuffer();
}

// =============================================================================
// Decoding Functions
// =============================================================================

/**
 * Decode a packed Cap'n Proto message from ArrayBuffer.
 */
export function decodeEnvelope(buffer: ArrayBuffer): DecodedEnvelope {
  const msg = new Message(buffer, true); // true = packed
  const envelope = msg.getRoot(Envelope);

  const base = {
    streamId: envelope.streamId,
    connectionId: envelope.connectionId,
    msgSeq: envelope.msgSeq,
  };

  switch (envelope.which()) {
    case Envelope_Which.HTTP:
      return {
        type: "http",
        ...base,
        http: decodeHttpMessage(envelope.http),
      };
    case Envelope_Which.WS:
      return {
        type: "ws",
        ...base,
        ws: decodeWebSocketFrame(envelope.ws),
      };
    case Envelope_Which.CONTROL:
      return {
        type: "control",
        ...base,
        control: decodeControl(envelope.control),
      };
    default:
      throw new Error(`Unknown envelope type: ${envelope.which()}`);
  }
}

function decodeHttpMessage(http: HttpMessage): DecodedHttpMessage {
  switch (http.which()) {
    case HttpMessage_Which.REQUEST_INIT: {
      const init = http.requestInit;
      return {
        type: "requestInit",
        data: {
          timestampMs: init.timestampMs,
          method: init.method,
          uri: init.uri,
          version: init.version,
          headers: decodeHeaders(init.headers),
          hasBody: init.hasBody,
        },
      };
    }
    case HttpMessage_Which.REQUEST_BODY_CHUNK: {
      const chunk = http.requestBodyChunk;
      return {
        type: "requestBodyChunk",
        data: {
          timestampMs: chunk.timestampMs,
          data: new Uint8Array(chunk.data.toArrayBuffer()),
          seq: chunk.seq,
          isLast: chunk.isLast,
        },
      };
    }
    case HttpMessage_Which.REQUEST_END:
      return {
        type: "requestEnd",
        timestampMs: http.requestEnd.timestampMs,
      };
    case HttpMessage_Which.REQUEST_ABORT:
      return {
        type: "requestAbort",
        reason: http.requestAbort.reason,
        detail: http.requestAbort.detail,
      };
    case HttpMessage_Which.RESPONSE_INIT: {
      const init = http.responseInit;
      return {
        type: "responseInit",
        data: {
          timestampMs: init.timestampMs,
          status: init.status,
          headers: decodeHeaders(init.headers),
          hasBody: init.hasBody,
          contentLength: init.contentLength,
        },
      };
    }
    case HttpMessage_Which.RESPONSE_BODY_CHUNK: {
      const chunk = http.responseBodyChunk;
      return {
        type: "responseBodyChunk",
        data: {
          timestampMs: chunk.timestampMs,
          data: new Uint8Array(chunk.data.toArrayBuffer()),
          seq: chunk.seq,
          isLast: chunk.isLast,
        },
      };
    }
    case HttpMessage_Which.RESPONSE_END:
      return {
        type: "responseEnd",
        timestampMs: http.responseEnd.timestampMs,
      };
    case HttpMessage_Which.RESPONSE_ABORT:
      return {
        type: "responseAbort",
        reason: http.responseAbort.reason,
        detail: http.responseAbort.detail,
      };
    default:
      throw new Error(`Unknown HTTP message type: ${http.which()}`);
  }
}

function decodeWebSocketFrame(ws: WebSocketFrame): DecodedWebSocketFrame {
  return {
    timestampMs: ws.timestampMs,
    opcode: ws.opcode,
    fin: ws.fin,
    payload: new Uint8Array(ws.payload.toArrayBuffer()),
    closeCode: ws.opcode === WebSocketOpcode.CLOSE ? ws.closeCode : undefined,
  };
}

function decodeControl(control: Control): DecodedControl {
  switch (control.which()) {
    case Control_Which.PING:
      return {
        type: "ping",
        timestampMs: control.ping.timestampMs,
        data: new Uint8Array(control.ping.data.toArrayBuffer()),
      };
    case Control_Which.PONG:
      return {
        type: "pong",
        timestampMs: control.pong.timestampMs,
        data: new Uint8Array(control.pong.data.toArrayBuffer()),
      };
    case Control_Which.ERROR:
      return {
        type: "error",
        timestampMs: control.error.timestampMs,
        code: control.error.code,
        message: control.error.message,
      };
    case Control_Which.GO_AWAY:
      return {
        type: "goAway",
        timestampMs: control.goAway.timestampMs,
        lastMsgSeq: control.goAway.lastMsgSeq,
        reason: control.goAway.reason,
      };
    default:
      throw new Error(`Unknown control message type: ${control.which()}`);
  }
}

function decodeHeaders(
  headers: import("capnp-es").List<Header>,
): Array<{ name: string; value: Uint8Array }> {
  const result: Array<{ name: string; value: Uint8Array }> = [];
  for (let i = 0; i < headers.length; i++) {
    const header = headers.get(i);
    result.push({
      name: header.name,
      value: new Uint8Array(header.value.toArrayBuffer()),
    });
  }
  return result;
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
  const decoder = new TextDecoder();
  for (const { name, value } of decoded) {
    headers.append(name, decoder.decode(value));
  }
  return headers;
}

/**
 * Convert WebSocket opcode to string for logging.
 */
export function opcodeToString(opcode: WebSocketOpcode): string {
  switch (opcode) {
    case WebSocketOpcode.CONTINUATION:
      return "continuation";
    case WebSocketOpcode.TEXT:
      return "text";
    case WebSocketOpcode.BINARY:
      return "binary";
    case WebSocketOpcode.CLOSE:
      return "close";
    case WebSocketOpcode.PING:
      return "ping";
    case WebSocketOpcode.PONG:
      return "pong";
    default:
      return `unknown(${opcode})`;
  }
}

// Re-export types from message.ts for convenience
export { AbortReason, HttpVersion, WebSocketOpcode };
