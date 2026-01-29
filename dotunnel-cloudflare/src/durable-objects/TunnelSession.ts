/**
 * TunnelSession Durable Object
 *
 * Manages a single tunnel's WebSocket connection from the CLI and proxies
 * HTTP requests and WebSocket connections through it.
 *
 * Architecture:
 * - Single CLI WebSocket connection per tunnel (hibernatable)
 * - Multiple concurrent client connections (HTTP and WebSocket)
 * - Request multiplexing via streamId
 * - Streaming body support for large payloads
 */

import { DurableObject } from "cloudflare:workers";
import {
  AbortReason,
  type DecodedControl,
  type DecodedEnvelope,
  type DecodedHttpMessage,
  type DecodedWebSocketFrame,
  decodeEnvelope,
  encodeControlGoAway,
  encodeControlPong,
  encodeHttpBodyChunk,
  encodeHttpRequestAbort,
  encodeHttpRequestEnd,
  encodeHttpRequestInit,
  encodeWebSocketFrame,
  headersFromDecoded,
  MAX_CONCURRENT_STREAMS,
  REQUEST_TIMEOUT_MS,
  WebSocketOpcode,
} from "#app/transport/protocol.ts";

// =============================================================================
// Types
// =============================================================================

/** Attachment stored with CLI WebSocket for hibernation recovery */
interface CliAttachment {
  type: "cli";
  tunnelPublicId: string;
  tunnelUrl: string;
}

/** Attachment stored with client WebSocket for hibernation recovery */
interface ClientWsAttachment {
  type: "client-ws";
  tunnelPublicId: string;
  streamId: number;
}

type WebSocketAttachment = CliAttachment | ClientWsAttachment;

/** State for a pending HTTP stream */
interface PendingHttpStream {
  streamId: number;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  readable: ReadableStream<Uint8Array>;
  responseStarted: boolean;
  responseStatus?: number;
  responseHeaders?: Headers;
  timeoutId: ReturnType<typeof setTimeout>;
  msgSeq: number;
  /** If set, this stream is waiting for WebSocket upgrade confirmation */
  pendingWsUpgrade?: {
    clientSocket: WebSocket;
  };
}

/** State for a client WebSocket stream */
interface ClientWsStream {
  streamId: number;
  socket: WebSocket;
  msgSeq: number;
}

// =============================================================================
// TunnelSession Durable Object
// =============================================================================

export class TunnelSession extends DurableObject {
  /** The CLI WebSocket connection (only one allowed per tunnel) */
  private cliSocket: WebSocket | null = null;

  /** Connection ID for this session (changes on each CLI reconnect) */
  private connectionId: bigint = 0n;

  /** Tunnel metadata */
  private tunnelPublicId: string | null = null;
  private tunnelUrl: string | null = null;

  /** Pending HTTP request streams waiting for responses */
  private pendingHttpStreams = new Map<number, PendingHttpStream>();

  /** Client WebSocket connections being proxied */
  private clientWsStreams = new Map<number, ClientWsStream>();

  /** Stream ID counter (monotonically increasing) */
  private nextStreamId = 1;

  /** Global message sequence counter */
  private globalMsgSeq = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Restore state after hibernation
    this.restoreFromHibernation();
  }

  /**
   * Restore WebSocket connections after hibernation.
   */
  private restoreFromHibernation(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment =
        ws.deserializeAttachment() as WebSocketAttachment | null;
      if (!attachment) continue;

      if (attachment.type === "cli") {
        this.cliSocket = ws;
        this.tunnelPublicId = attachment.tunnelPublicId;
        this.tunnelUrl = attachment.tunnelUrl;
        this.connectionId = BigInt(Date.now());
      } else if (attachment.type === "client-ws") {
        // Restore client WebSocket stream
        this.clientWsStreams.set(attachment.streamId, {
          streamId: attachment.streamId,
          socket: ws,
          msgSeq: 0,
        });
        // Update nextStreamId to avoid collisions
        if (attachment.streamId >= this.nextStreamId) {
          this.nextStreamId = attachment.streamId + 1;
        }
      }
    }
  }

  /**
   * Main fetch handler - routes requests appropriately.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");

    console.log(
      `[TunnelSession] fetch: ${request.method} ${url.pathname} upgrade=${upgrade}`,
    );

    // CLI WebSocket connection
    if (url.pathname === "/_cli/connect" && upgrade === "websocket") {
      console.log("[TunnelSession] Handling CLI connect");
      return this.handleCliConnect(request);
    }

    // Client WebSocket upgrade - tunnel to local server
    if (upgrade === "websocket") {
      console.log("[TunnelSession] Handling client WebSocket upgrade");
      return this.handleClientWebSocket(request);
    }

    // Regular HTTP request - proxy to CLI
    console.log("[TunnelSession] Handling HTTP proxy");
    return this.proxyHttpRequest(request);
  }

  // ===========================================================================
  // CLI Connection Handling
  // ===========================================================================

  /**
   * Handle CLI WebSocket connection.
   */
  private async handleCliConnect(request: Request): Promise<Response> {
    console.log("[TunnelSession] handleCliConnect starting");
    const tunnelPublicId = request.headers.get("X-Tunnel-Id");
    const tunnelUrl = request.headers.get("X-Tunnel-Url");
    console.log(
      `[TunnelSession] tunnelPublicId=${tunnelPublicId} tunnelUrl=${tunnelUrl}`,
    );

    if (!tunnelPublicId || !tunnelUrl) {
      console.log("[TunnelSession] Missing metadata, returning 400");
      return new Response("Missing tunnel metadata", { status: 400 });
    }

    // Close existing CLI connection if any (replaced by new connection)
    if (this.cliSocket && this.cliSocket.readyState === WebSocket.OPEN) {
      // Send GoAway to old connection
      const goAway = encodeControlGoAway(
        this.connectionId,
        this.globalMsgSeq,
        "Replaced by new connection",
      );
      this.cliSocket.send(goAway);
      this.cliSocket.close(1000, "Replaced by new connection");
    }

    // Fail all pending requests from old connection
    this.failAllPendingStreams("CLI reconnected");

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept with hibernation support
    const attachment: CliAttachment = {
      type: "cli",
      tunnelPublicId,
      tunnelUrl,
    };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    this.cliSocket = server;
    this.tunnelPublicId = tunnelPublicId;
    this.tunnelUrl = tunnelUrl;
    this.connectionId = BigInt(Date.now());
    this.nextStreamId = 1;
    this.globalMsgSeq = 0;

    // Send tunnel info to CLI as JSON (initial handshake)
    console.log("[TunnelSession] Sending tunnel_ready to CLI");
    server.send(
      JSON.stringify({
        type: "tunnel_ready",
        connectionId: this.connectionId.toString(),
        tunnelUrl,
      }),
    );

    // Mark tunnel as online in the database
    console.log("[TunnelSession] Updating tunnel status in DB");
    await this.updateTunnelStatusInDb(tunnelPublicId, "online");

    console.log("[TunnelSession] Returning 101 response");
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Update tunnel status in the database.
   */
  private async updateTunnelStatusInDb(
    publicId: string,
    status: "online" | "offline",
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      await this.env.DB.prepare(
        `UPDATE tunnels SET status = ?1, last_connected_at = ?2, updated_at = ?2 WHERE public_id = ?3`,
      )
        .bind(status, now, publicId)
        .run();
    } catch (error) {
      console.error("Failed to update tunnel status:", error);
    }
  }

  // ===========================================================================
  // HTTP Request Proxying
  // ===========================================================================

  /**
   * Proxy an HTTP request to the CLI.
   */
  private async proxyHttpRequest(request: Request): Promise<Response> {
    // Check if CLI is connected
    if (!this.cliSocket || this.cliSocket.readyState !== WebSocket.OPEN) {
      return new Response("Tunnel offline", { status: 502 });
    }

    // Check concurrent stream limit
    if (this.pendingHttpStreams.size >= MAX_CONCURRENT_STREAMS) {
      return new Response("Too many concurrent requests", { status: 503 });
    }

    const streamId = this.nextStreamId++;
    const url = new URL(request.url);

    // Create streaming response infrastructure
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();

    // Create promise for response
    const responsePromise = new Promise<Response>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const stream = this.pendingHttpStreams.get(streamId);
        if (stream) {
          this.pendingHttpStreams.delete(streamId);
          stream.writer.abort(new Error("Request timeout"));
          // Send abort to CLI
          if (this.cliSocket && this.cliSocket.readyState === WebSocket.OPEN) {
            const abort = encodeHttpRequestAbort(
              this.connectionId,
              streamId,
              this.globalMsgSeq++,
              AbortReason.TIMEOUT,
              "Request timeout",
            );
            this.cliSocket.send(abort);
          }
        }
        reject(new Error("Request timeout"));
      }, REQUEST_TIMEOUT_MS);

      const stream: PendingHttpStream = {
        streamId,
        resolve,
        reject,
        writer,
        writable,
        readable,
        responseStarted: false,
        timeoutId,
        msgSeq: 0,
      };

      this.pendingHttpStreams.set(streamId, stream);
    });

    // Send request init to CLI
    const initMsg = encodeHttpRequestInit(
      this.connectionId,
      streamId,
      this.globalMsgSeq++,
      {
        method: request.method,
        uri: url.pathname + url.search,
        headers: request.headers,
        hasBody: request.body !== null,
      },
    );
    this.cliSocket.send(initMsg);

    // Stream request body if present
    if (request.body) {
      this.streamRequestBody(streamId, request.body);
    } else {
      // No body - send request end immediately
      const endMsg = encodeHttpRequestEnd(
        this.connectionId,
        streamId,
        this.globalMsgSeq++,
      );
      this.cliSocket.send(endMsg);
    }

    return responsePromise;
  }

  /**
   * Stream request body to CLI.
   */
  private async streamRequestBody(
    streamId: number,
    body: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const reader = body.getReader();
    let seq = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        // Check if stream was cancelled
        if (!this.pendingHttpStreams.has(streamId)) {
          break;
        }

        // Check if CLI is still connected
        if (!this.cliSocket || this.cliSocket.readyState !== WebSocket.OPEN) {
          break;
        }

        if (done) {
          // Send request end
          const endMsg = encodeHttpRequestEnd(
            this.connectionId,
            streamId,
            this.globalMsgSeq++,
          );
          this.cliSocket.send(endMsg);
          break;
        }

        // Send body chunk
        const chunkMsg = encodeHttpBodyChunk(
          this.connectionId,
          streamId,
          this.globalMsgSeq++,
          value,
          seq++,
          false,
          true, // isRequest
        );
        this.cliSocket.send(chunkMsg);
      }
    } catch (error) {
      // Send abort on error
      if (
        this.cliSocket &&
        this.cliSocket.readyState === WebSocket.OPEN &&
        this.pendingHttpStreams.has(streamId)
      ) {
        const abortMsg = encodeHttpRequestAbort(
          this.connectionId,
          streamId,
          this.globalMsgSeq++,
          AbortReason.CANCELLED,
          error instanceof Error ? error.message : "Unknown error",
        );
        this.cliSocket.send(abortMsg);
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ===========================================================================
  // Client WebSocket Handling
  // ===========================================================================

  /**
   * Handle client WebSocket upgrade - tunnel to local server.
   *
   * Flow:
   * 1. Create WebSocket pair for client (must be done synchronously)
   * 2. Send upgrade request to CLI
   * 3. Wait for CLI to respond with 101 (handled in handleHttpMessage)
   * 4. Once CLI confirms upgrade, the connection is ready for bidirectional frames
   *
   * If CLI responds with non-101, we close the client WebSocket with an error.
   */
  private async handleClientWebSocket(request: Request): Promise<Response> {
    console.log(
      `[TunnelSession] handleClientWebSocket: cliSocket=${!!this.cliSocket} readyState=${this.cliSocket?.readyState}`,
    );

    // Check if CLI is connected
    if (!this.cliSocket || this.cliSocket.readyState !== WebSocket.OPEN) {
      console.log("[TunnelSession] CLI not connected, returning 502");
      return new Response("Tunnel offline", { status: 502 });
    }

    // Check concurrent stream limit
    if (
      this.pendingHttpStreams.size + this.clientWsStreams.size >=
      MAX_CONCURRENT_STREAMS
    ) {
      return new Response("Too many concurrent connections", { status: 503 });
    }

    const streamId = this.nextStreamId++;
    const url = new URL(request.url);

    // Create WebSocket pair for the client
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept with hibernation
    const attachment: ClientWsAttachment = {
      type: "client-ws",
      // biome-ignore lint/style/noNonNullAssertion: checked earlier
      tunnelPublicId: this.tunnelPublicId!,
      streamId,
    };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    // Create a dummy stream infrastructure for tracking the upgrade
    // We don't use readable/writable for WebSocket, but we need the pending stream
    // to track the upgrade handshake
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();

    const timeoutId = setTimeout(() => {
      const stream = this.pendingHttpStreams.get(streamId);
      if (stream) {
        this.pendingHttpStreams.delete(streamId);
        // Close client WebSocket with error
        if (server.readyState === WebSocket.OPEN) {
          server.close(1011, "WebSocket upgrade timeout");
        }
      }
    }, REQUEST_TIMEOUT_MS);

    // Store as pending HTTP stream until CLI confirms upgrade
    const pendingStream: PendingHttpStream = {
      streamId,
      // biome-ignore lint/suspicious/noEmptyBlockStatements: not used for WebSocket
      resolve: () => {},
      // biome-ignore lint/suspicious/noEmptyBlockStatements: not used for WebSocket
      reject: () => {},
      writer,
      writable,
      readable,
      responseStarted: false,
      timeoutId,
      msgSeq: 0,
      pendingWsUpgrade: {
        clientSocket: server,
      },
    };
    this.pendingHttpStreams.set(streamId, pendingStream);

    // Send WebSocket upgrade request to CLI (as HTTP request init with Upgrade header)
    const initMsg = encodeHttpRequestInit(
      this.connectionId,
      streamId,
      this.globalMsgSeq++,
      {
        method: request.method,
        uri: url.pathname + url.search,
        headers: request.headers, // Includes Upgrade: websocket
        hasBody: false,
      },
    );
    this.cliSocket.send(initMsg);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ===========================================================================
  // WebSocket Hibernation Handlers
  // ===========================================================================

  /**
   * Called when a WebSocket receives a message (after hibernation wake-up).
   */
  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): void {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (!attachment) return;

    if (attachment.type === "cli") {
      this.handleCliMessage(message);
    } else if (attachment.type === "client-ws") {
      this.handleClientWsMessage(attachment.streamId, message);
    }
  }

  /**
   * Handle message from CLI.
   */
  private handleCliMessage(message: ArrayBuffer | string): void {
    // JSON control messages
    if (typeof message === "string") {
      try {
        const ctrl = JSON.parse(message);
        if (ctrl.type === "pong") {
          // Heartbeat response - ignore
        }
      } catch {
        console.error("Invalid JSON from CLI:", message);
      }
      return;
    }

    // Binary Cap'n Proto messages
    try {
      const envelope = decodeEnvelope(message);
      this.handleDecodedEnvelope(envelope);
    } catch (error) {
      console.error("Failed to decode message from CLI:", error);
    }
  }

  /**
   * Handle decoded envelope from CLI.
   */
  private handleDecodedEnvelope(envelope: DecodedEnvelope): void {
    const { streamId } = envelope;

    switch (envelope.type) {
      case "http":
        this.handleHttpMessage(streamId, envelope.http);
        break;
      case "ws":
        this.handleWebSocketFrame(streamId, envelope.ws);
        break;
      case "control":
        this.handleControlMessage(envelope.control);
        break;
    }
  }

  /**
   * Handle HTTP response message from CLI.
   */
  private handleHttpMessage(streamId: number, http: DecodedHttpMessage): void {
    const stream = this.pendingHttpStreams.get(streamId);
    if (!stream) return;

    switch (http.type) {
      case "responseInit": {
        const headers = headersFromDecoded(http.data.headers);
        stream.responseStatus = http.data.status;
        stream.responseHeaders = headers;
        stream.responseStarted = true;

        // Check if this is a WebSocket upgrade response
        if (stream.pendingWsUpgrade) {
          clearTimeout(stream.timeoutId);

          if (http.data.status === 101) {
            // CLI confirmed WebSocket upgrade - move to clientWsStreams
            this.clientWsStreams.set(streamId, {
              streamId,
              socket: stream.pendingWsUpgrade.clientSocket,
              msgSeq: 0,
            });
            this.pendingHttpStreams.delete(streamId);
            console.log(`Stream ${streamId}: WebSocket upgrade confirmed`);
          } else {
            // CLI rejected WebSocket upgrade - close client connection
            console.log(
              `Stream ${streamId}: WebSocket upgrade rejected with status ${http.data.status}`,
            );
            if (
              stream.pendingWsUpgrade.clientSocket.readyState === WebSocket.OPEN
            ) {
              stream.pendingWsUpgrade.clientSocket.close(
                1002,
                `Upstream rejected: ${http.data.status}`,
              );
            }
            this.pendingHttpStreams.delete(streamId);
          }
          return;
        }

        // Regular HTTP response - create and resolve the Response with streaming body
        const response = new Response(
          http.data.hasBody ? stream.readable : null,
          {
            status: http.data.status,
            headers,
          },
        );
        stream.resolve(response);
        break;
      }

      case "responseBodyChunk": {
        if (stream.responseStarted) {
          stream.writer.write(http.data.data).catch(() => {
            // Writer closed - ignore
          });
        }
        break;
      }

      case "responseEnd": {
        clearTimeout(stream.timeoutId);
        if (stream.responseStarted) {
          stream.writer.close().catch(() => {
            // Already closed - ignore
          });
        }
        this.pendingHttpStreams.delete(streamId);
        break;
      }

      case "responseAbort": {
        clearTimeout(stream.timeoutId);

        // Check if this is a WebSocket upgrade that failed
        if (stream.pendingWsUpgrade) {
          if (
            stream.pendingWsUpgrade.clientSocket.readyState === WebSocket.OPEN
          ) {
            stream.pendingWsUpgrade.clientSocket.close(
              1011,
              http.detail || "WebSocket upgrade failed",
            );
          }
          this.pendingHttpStreams.delete(streamId);
          return;
        }

        if (stream.responseStarted) {
          stream.writer
            .abort(new Error(http.detail || "Response aborted"))
            .catch(() => {
              // Already closed - ignore
            });
        } else {
          stream.reject(new Error(http.detail || "Response aborted"));
        }
        this.pendingHttpStreams.delete(streamId);
        break;
      }
    }
  }

  /**
   * Handle WebSocket frame from CLI (forward to client).
   */
  private handleWebSocketFrame(
    streamId: number,
    frame: DecodedWebSocketFrame,
  ): void {
    const clientStream = this.clientWsStreams.get(streamId);
    if (!clientStream) return;

    const { socket } = clientStream;
    if (socket.readyState !== WebSocket.OPEN) return;

    switch (frame.opcode) {
      case WebSocketOpcode.TEXT:
        socket.send(new TextDecoder().decode(frame.payload));
        break;
      case WebSocketOpcode.BINARY:
        socket.send(frame.payload);
        break;
      case WebSocketOpcode.CLOSE:
        socket.close(frame.closeCode ?? 1000, "");
        this.clientWsStreams.delete(streamId);
        break;
      case WebSocketOpcode.PING:
        // Auto-pong (WebSocket spec)
        socket.send(frame.payload);
        break;
      case WebSocketOpcode.PONG:
        // Ignore pong
        break;
    }
  }

  /**
   * Handle control message from CLI.
   */
  private handleControlMessage(control: DecodedControl): void {
    switch (control.type) {
      case "ping": {
        // Respond with pong
        if (this.cliSocket && this.cliSocket.readyState === WebSocket.OPEN) {
          const pong = encodeControlPong(this.connectionId, control.data);
          this.cliSocket.send(pong);
        }
        break;
      }
      case "pong":
        // Heartbeat response - update last seen
        break;
      case "error":
        console.error(
          `CLI error: code=${control.code} message=${control.message}`,
        );
        break;
      case "goAway":
        console.log(`CLI going away: ${control.reason}`);
        // CLI is gracefully shutting down
        break;
    }
  }

  /**
   * Handle message from client WebSocket (forward to CLI).
   */
  private handleClientWsMessage(
    streamId: number,
    message: ArrayBuffer | string,
  ): void {
    if (!this.cliSocket || this.cliSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    const clientStream = this.clientWsStreams.get(streamId);
    if (!clientStream) return;

    // Encode and forward to CLI
    const opcode =
      typeof message === "string"
        ? WebSocketOpcode.TEXT
        : WebSocketOpcode.BINARY;
    const payload =
      typeof message === "string"
        ? new TextEncoder().encode(message)
        : new Uint8Array(message);

    const frame = encodeWebSocketFrame(
      this.connectionId,
      streamId,
      this.globalMsgSeq++,
      {
        opcode,
        payload,
        fin: true,
      },
    );
    this.cliSocket.send(frame);
  }

  /**
   * Called when a WebSocket closes.
   */
  webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): void {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (!attachment) return;

    if (attachment.type === "cli") {
      this.handleCliDisconnect(code, reason);
    } else if (attachment.type === "client-ws") {
      this.handleClientWsClose(attachment.streamId, code, reason);
    }
  }

  /**
   * Handle CLI disconnect.
   */
  private handleCliDisconnect(code: number, reason: string): void {
    console.log(`CLI disconnected: code=${code} reason=${reason}`);

    // Mark tunnel as offline in the database
    if (this.tunnelPublicId) {
      this.updateTunnelStatusInDb(this.tunnelPublicId, "offline").catch((err) =>
        console.error("Failed to update tunnel status on disconnect:", err),
      );
    }

    this.cliSocket = null;

    // Fail all pending HTTP requests
    this.failAllPendingStreams("CLI disconnected");

    // Close all client WebSockets
    for (const [_streamId, clientStream] of this.clientWsStreams) {
      if (clientStream.socket.readyState === WebSocket.OPEN) {
        clientStream.socket.close(1001, "Tunnel closed");
      }
    }
    this.clientWsStreams.clear();
  }

  /**
   * Handle client WebSocket close.
   */
  private handleClientWsClose(
    streamId: number,
    code: number,
    _reason: string,
  ): void {
    this.clientWsStreams.delete(streamId);

    // Notify CLI that client WebSocket closed
    if (this.cliSocket && this.cliSocket.readyState === WebSocket.OPEN) {
      const closeFrame = encodeWebSocketFrame(
        this.connectionId,
        streamId,
        this.globalMsgSeq++,
        {
          opcode: WebSocketOpcode.CLOSE,
          payload: new Uint8Array(0),
          closeCode: code,
        },
      );
      this.cliSocket.send(closeFrame);
    }
  }

  /**
   * Called when a WebSocket errors.
   */
  webSocketError(ws: WebSocket, error: unknown): void {
    console.error("WebSocket error:", error);
    ws.close(1011, "Internal error");
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Fail all pending HTTP streams with an error.
   */
  private failAllPendingStreams(reason: string): void {
    for (const [, stream] of this.pendingHttpStreams) {
      clearTimeout(stream.timeoutId);
      if (stream.responseStarted) {
        stream.writer.abort(new Error(reason)).catch(() => {});
      } else {
        stream.reject(new Error(reason));
      }
    }
    this.pendingHttpStreams.clear();
  }
}
