/**
 * Tunnel API endpoints for CLI connection.
 */

import { env } from "cloudflare:workers";
import { validateCliToken } from "#app/auth/device-flow.ts";
import {
  createTunnelForUser,
  getTunnelBySubdomain,
} from "#app/functions/tunnels.ts";
import { loadConfig } from "#app/lib/db.ts";
import { buildTunnelUrl } from "#app/models/tunnel.ts";

// =============================================================================
// Types
// =============================================================================

interface ConnectRequest {
  subdomain?: string; // For named tunnels
}

interface ConnectResponse {
  tunnelId: string;
  tunnelUrl: string;
  subdomain: string;
}

interface ErrorResponse {
  error: string;
  code?: string;
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * Handle CLI tunnel connect request.
 *
 * POST /_api/tunnel/connect (for creating/selecting tunnel)
 * GET /_api/tunnel/connect (for WebSocket upgrade after selection)
 *
 * Flow:
 * 1. CLI POSTs to get/create tunnel info
 * 2. CLI connects via WebSocket to the returned DO
 */
export async function handleTunnelConnect(request: Request): Promise<Response> {
  // Validate CLI token
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json(
      {
        error: "Missing or invalid authorization header",
        code: "unauthorized",
      } satisfies ErrorResponse,
      { status: 401 },
    );
  }

  const token = authHeader.slice(7);
  const session = await validateCliToken(token);
  if (!session) {
    return Response.json(
      {
        error: "Invalid or expired token",
        code: "invalid_token",
      } satisfies ErrorResponse,
      { status: 401 },
    );
  }

  // Handle POST - create/select tunnel
  if (request.method === "POST") {
    return handleTunnelSelection(request, session.id);
  }

  // Handle GET with WebSocket upgrade - connect to tunnel DO
  if (
    request.method === "GET" &&
    request.headers.get("Upgrade") === "websocket"
  ) {
    return handleWebSocketConnect(request, session.id);
  }

  return Response.json(
    {
      error: "Method not allowed",
      code: "method_not_allowed",
    } satisfies ErrorResponse,
    { status: 405 },
  );
}

/**
 * Handle tunnel selection/creation (POST).
 */
async function handleTunnelSelection(
  request: Request,
  userId: number,
): Promise<Response> {
  let subdomain: string | undefined;

  // Parse request body
  try {
    const contentType = request.headers.get("Content-Type");
    if (contentType?.includes("application/json") && request.body) {
      const body = (await request.json()) as ConnectRequest;
      subdomain = body.subdomain;
    }
  } catch {
    return Response.json(
      {
        error: "Invalid request body",
        code: "invalid_body",
      } satisfies ErrorResponse,
      { status: 400 },
    );
  }

  // Load config for tunnel URL pattern
  const { config } = await loadConfig(import.meta.env.DEV);

  let tunnel: { publicId: string; subdomain: string; userId: number } | null =
    null;
  if (subdomain) {
    // Named tunnel - must exist and belong to user
    tunnel = await getTunnelBySubdomain(subdomain);
    if (!tunnel) {
      return Response.json(
        {
          error: "Tunnel not found",
          code: "tunnel_not_found",
        } satisfies ErrorResponse,
        { status: 404 },
      );
    }
    if (tunnel.userId !== userId) {
      return Response.json(
        {
          error: "Tunnel not found",
          code: "tunnel_not_found",
        } satisfies ErrorResponse,
        { status: 404 },
      );
    }
  } else {
    // Create ephemeral tunnel
    const result = await createTunnelForUser(userId, { type: "ephemeral" });
    if (!result.success) {
      return Response.json(
        {
          error: result.error,
          code: "tunnel_creation_failed",
        } satisfies ErrorResponse,
        { status: 400 },
      );
    }
    tunnel = result.data;
  }

  const tunnelUrl = buildTunnelUrl(tunnel.subdomain, config.tunnel.hostPattern);

  return Response.json({
    tunnelId: tunnel.publicId,
    tunnelUrl,
    subdomain: tunnel.subdomain,
  } satisfies ConnectResponse);
}

/**
 * Handle WebSocket connection to tunnel DO (GET with Upgrade).
 */
async function handleWebSocketConnect(
  request: Request,
  userId: number,
): Promise<Response> {
  // Get tunnel ID from query param
  const url = new URL(request.url);
  const tunnelId = url.searchParams.get("tunnelId");

  if (!tunnelId) {
    return Response.json(
      {
        error: "Missing tunnelId parameter",
        code: "missing_tunnel_id",
      } satisfies ErrorResponse,
      { status: 400 },
    );
  }

  // Verify tunnel ownership by looking up in DB
  // (We could also just trust the tunnelId since CLI has valid token,
  // but this adds an extra layer of security)
  const tunnelResult = await env.DB.prepare(
    `SELECT public_id, subdomain, user_id FROM tunnels WHERE public_id = ?1`,
  )
    .bind(tunnelId)
    .first<{ public_id: string; subdomain: string; user_id: number }>();

  if (!tunnelResult) {
    return Response.json(
      {
        error: "Tunnel not found",
        code: "tunnel_not_found",
      } satisfies ErrorResponse,
      { status: 404 },
    );
  }

  if (tunnelResult.user_id !== userId) {
    return Response.json(
      {
        error: "Tunnel not found",
        code: "tunnel_not_found",
      } satisfies ErrorResponse,
      { status: 404 },
    );
  }

  // Load config for tunnel URL
  const { config } = await loadConfig(import.meta.env.DEV);
  const tunnelUrl = buildTunnelUrl(
    tunnelResult.subdomain,
    config.tunnel.hostPattern,
  );

  // Route to Durable Object
  const doId = env.TUNNEL_SESSION.idFromName(tunnelId);
  const stub = env.TUNNEL_SESSION.get(doId);

  // Forward request with tunnel metadata headers
  const doRequest = new Request(
    new URL("/_cli/connect", request.url).toString(),
    {
      method: "GET",
      headers: new Headers([
        ...request.headers,
        ["X-Tunnel-Id", tunnelId],
        ["X-Tunnel-Url", tunnelUrl],
      ]),
    },
  );

  return stub.fetch(doRequest);
}
