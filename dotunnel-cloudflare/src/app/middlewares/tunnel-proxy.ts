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
 * - Looks up tunnel by subdomain in DB
 * - Routes request to TunnelSession Durable Object
 * - Returns 502 if tunnel is offline
 * - Returns 404 if tunnel doesn't exist
 */
export function tunnelProxy(): RouteMiddleware {
  return async ({ request }) => {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const upgrade = request.headers.get("Upgrade");

    console.log(
      `[tunnelProxy] ${request.method} ${hostname}${url.pathname} upgrade=${upgrade}`,
    );

    // Try to load config to get tunnel host pattern
    let config: import("#app/models/config.ts").Config | null = null;
    try {
      const result = await loadConfig(import.meta.env.DEV);
      config = result.config;
    } catch (error) {
      if (error instanceof NotBootstrappedError) {
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

    // Look up tunnel in DB
    const tunnel = await getTunnelBySubdomain(subdomain);
    if (!tunnel) {
      return new Response(
        `Tunnel "${subdomain}" not found.\n\nThis tunnel may have been deleted or never existed.`,
        {
          status: 404,
          headers: { "Content-Type": "text/plain" },
        },
      );
    }

    // Check if tunnel is online
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
    console.log(`[tunnelProxy] Routing to DO for tunnel ${tunnel.publicId}`);
    const doId = env.TUNNEL_SESSION.idFromName(tunnel.publicId);
    const stub = env.TUNNEL_SESSION.get(doId);

    // Forward the original request to the DO
    console.log(`[tunnelProxy] Forwarding request to DO`);
    return stub.fetch(request);
  };
}
