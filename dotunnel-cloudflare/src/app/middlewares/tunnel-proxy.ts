/**
 * Tunnel proxy middleware.
 *
 * Intercepts requests to tunnel subdomains (e.g., *.tunnel.io) and routes
 * them to the appropriate TunnelSession Durable Object.
 *
 * This middleware runs early in the request pipeline, before bootstrap and auth,
 * because tunnel requests should be proxied regardless of service configuration.
 */

import { env } from "cloudflare:workers";
import type { RouteMiddleware } from "rwsdk/router";
import { getTunnelBySubdomain } from "#app/functions/tunnels.ts";
import { loadConfig, NotBootstrappedError } from "#app/lib/db.ts";
import { isTunnelHost } from "#app/models/config.ts";
import type { Tunnel } from "#app/models/tunnel.ts";

// =============================================================================
// Tunnel Lookup Cache
// =============================================================================

/**
 * In-memory cache for tunnel lookups (subdomain -> tunnel).
 *
 * This avoids a D1 query on every single proxied request. The cache lives
 * in the Worker isolate and is shared across requests handled by the same
 * isolate. A short TTL (10s) ensures stale data is refreshed quickly while
 * eliminating most redundant DB queries under load.
 *
 * Cache misses (tunnel not found) are also cached to avoid repeated 404 lookups.
 */
const TUNNEL_CACHE_TTL_MS = 10_000;

type TunnelCacheEntry = {
  tunnel: Tunnel | null;
  expiresAt: number;
};

const tunnelCache = new Map<string, TunnelCacheEntry>();

async function getCachedTunnel(subdomain: string): Promise<Tunnel | null> {
  const now = Date.now();
  const cached = tunnelCache.get(subdomain);
  if (cached && cached.expiresAt > now) {
    return cached.tunnel;
  }

  const tunnel = await getTunnelBySubdomain(subdomain);
  tunnelCache.set(subdomain, {
    tunnel,
    expiresAt: now + TUNNEL_CACHE_TTL_MS,
  });
  return tunnel;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract subdomain from a hostname given the wildcard pattern.
 * Example: extractSubdomain("api.tunnel.io", "*.tunnel.io") => "api"
 */
function extractSubdomain(hostname: string, pattern: string): string {
  // Pattern is "*.basedomain.com"
  const baseDomain = pattern.slice(2); // Remove "*."
  // Hostname is "subdomain.basedomain.com"
  return hostname.slice(0, -(baseDomain.length + 1)); // Remove ".basedomain.com"
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Tunnel proxy middleware.
 *
 * - Checks if hostname matches the tunnel wildcard pattern
 * - Looks up tunnel by subdomain (cached)
 * - Routes request to TunnelSession Durable Object
 * - Returns 502 if tunnel is offline (best-effort check, DO is authoritative)
 * - Returns 404 if tunnel doesn't exist
 */
export function tunnelProxy(): RouteMiddleware {
  return async ({ request }) => {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Try to load config to get tunnel host pattern
    let config: import("#app/models/config.ts").Config | null = null;
    try {
      const result = await loadConfig(import.meta.env.DEV);
      config = result.config;
    } catch (error) {
      if (NotBootstrappedError.is(error)) {
        // Not bootstrapped yet - can't proxy tunnels
        return;
      }
      throw error;
    }

    // Check if this is a tunnel host
    if (
      !config.tunnel.hostPattern ||
      !isTunnelHost(hostname, config.tunnel.hostPattern)
    ) {
      return; // Not a tunnel request, continue to normal routing
    }

    // Extract subdomain
    const subdomain = extractSubdomain(hostname, config.tunnel.hostPattern);
    if (!subdomain) {
      return new Response("Invalid tunnel URL", { status: 400 });
    }

    // Look up tunnel (cached to avoid D1 query per request)
    const tunnel = await getCachedTunnel(subdomain);
    if (!tunnel) {
      return new Response(
        `Tunnel "${subdomain}" not found.\n\nThis tunnel may have been deleted or never existed.`,
        {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        },
      );
    }

    // Check if tunnel is online (best-effort from cached DB state).
    // The DO itself is authoritative and returns 502 if CLI is not connected.
    if (tunnel.status !== "online") {
      return new Response(
        `Tunnel "${subdomain}" is offline.\n\nThe tunnel owner needs to reconnect using the CLI.`,
        {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        },
      );
    }

    // Route to Durable Object
    const doId = env.TUNNEL_SESSION.idFromName(tunnel.publicId);
    const stub = env.TUNNEL_SESSION.get(doId);

    return stub.fetch(request);
  };
}
