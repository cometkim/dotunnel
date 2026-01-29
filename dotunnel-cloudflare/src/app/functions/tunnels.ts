"use server";

import { env } from "cloudflare:workers";
import { getRequestInfo } from "rwsdk/worker";
import * as v from "valibot";
import { loadConfig } from "#app/lib/db.ts";
import {
  buildTunnelUrl,
  CreateTunnelInput,
  generateEphemeralSubdomain,
  SubdomainSchema,
  type Tunnel,
  type TunnelDisplay,
  type TunnelRow,
  tunnelFromRow,
} from "#app/models/tunnel.ts";
import type { AppContext } from "#worker.tsx";

// =============================================================================
// Types
// =============================================================================

export type TunnelResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get current user ID from request context.
 * Throws if user is not authenticated.
 */
function requireUserId(): number {
  const { ctx } = getRequestInfo() as { ctx: AppContext };
  if (!ctx.user) {
    throw new Error("Authentication required");
  }
  return ctx.user.id;
}

/**
 * Generate a unique ephemeral subdomain.
 * Retries up to maxAttempts times if collision occurs.
 */
async function generateUniqueSubdomain(
  maxAttempts = 10,
): Promise<string | null> {
  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    const subdomain = generateEphemeralSubdomain();
    const existing = await env.DB.prepare(
      `SELECT 1 FROM tunnels WHERE subdomain = ?1`,
    )
      .bind(subdomain)
      .first();

    if (!existing) {
      return subdomain;
    }
  }
  return null;
}

// =============================================================================
// Queries
// =============================================================================

/**
 * Get all tunnels for a user.
 */
export async function getUserTunnels(userId: number): Promise<TunnelDisplay[]> {
  const [tunnelsResult, configResult] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM tunnels WHERE user_id = ?1 ORDER BY created_at DESC`,
    )
      .bind(userId)
      .all<TunnelRow>(),
    loadConfig(import.meta.env.DEV),
  ]);

  const hostPattern = configResult.config.tunnel.hostPattern;

  return tunnelsResult.results.map((row) => {
    const tunnel = tunnelFromRow(row);
    return {
      ...tunnel,
      url: buildTunnelUrl(tunnel.subdomain, hostPattern),
    };
  });
}

/**
 * Get a single tunnel by public ID (for the owner).
 */
export async function getTunnel(
  userId: number,
  publicId: string,
): Promise<TunnelDisplay | null> {
  const [tunnelResult, configResult] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM tunnels WHERE public_id = ?1 AND user_id = ?2`,
    )
      .bind(publicId, userId)
      .first<TunnelRow>(),
    loadConfig(import.meta.env.DEV),
  ]);

  if (!tunnelResult) {
    return null;
  }

  const hostPattern = configResult.config.tunnel.hostPattern;
  const tunnel = tunnelFromRow(tunnelResult);

  return {
    ...tunnel,
    url: buildTunnelUrl(tunnel.subdomain, hostPattern),
  };
}

/**
 * Check if a subdomain is available.
 */
export async function isSubdomainAvailable(
  subdomain: string,
): Promise<TunnelResult<{ available: boolean }>> {
  try {
    // Validate subdomain format first
    const parseResult = v.safeParse(SubdomainSchema, subdomain);
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.issues[0]?.message ?? "Invalid subdomain format",
      };
    }

    const normalizedSubdomain = parseResult.output;

    const existing = await env.DB.prepare(
      `SELECT 1 FROM tunnels WHERE subdomain = ?1`,
    )
      .bind(normalizedSubdomain)
      .first();

    return {
      success: true,
      data: { available: !existing },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to check subdomain availability",
    };
  }
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Create a new tunnel for the current user.
 */
export async function createTunnel(
  input: unknown,
): Promise<TunnelResult<TunnelDisplay>> {
  try {
    const userId = requireUserId();
    // Validate input
    const parseResult = v.safeParse(CreateTunnelInput, input);
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.issues[0]?.message ?? "Invalid input",
      };
    }

    const validInput = parseResult.output;
    const now = new Date().toISOString();
    const publicId = crypto.randomUUID();

    // Resolve subdomain based on tunnel type
    let subdomain: string;
    if (validInput.type === "ephemeral") {
      // Generate unique subdomain for ephemeral tunnel
      const generated = await generateUniqueSubdomain();
      if (!generated) {
        return {
          success: false,
          error: "Failed to generate unique subdomain, please try again",
        };
      }
      subdomain = generated;
    } else {
      // Named tunnel - user specified subdomain
      subdomain = validInput.subdomain;

      // Check availability
      const existing = await env.DB.prepare(
        `SELECT 1 FROM tunnels WHERE subdomain = ?1`,
      )
        .bind(subdomain)
        .first();

      if (existing) {
        return {
          success: false,
          error: "This subdomain is already taken",
        };
      }
    }

    // Insert tunnel
    await env.DB.prepare(
      `INSERT INTO tunnels (public_id, user_id, subdomain, type, name, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'offline', ?6, ?6)`,
    )
      .bind(
        publicId,
        userId,
        subdomain,
        validInput.type,
        validInput.name ?? null,
        now,
      )
      .run();

    // Fetch the created tunnel
    const [tunnelResult, configResult] = await Promise.all([
      env.DB.prepare(`SELECT * FROM tunnels WHERE public_id = ?1`)
        .bind(publicId)
        .first<TunnelRow>(),
      loadConfig(import.meta.env.DEV),
    ]);

    if (!tunnelResult) {
      return {
        success: false,
        error: "Failed to retrieve created tunnel",
      };
    }

    const hostPattern = configResult.config.tunnel.hostPattern;
    const tunnel = tunnelFromRow(tunnelResult);

    return {
      success: true,
      data: {
        ...tunnel,
        url: buildTunnelUrl(tunnel.subdomain, hostPattern),
      },
    };
  } catch (error) {
    // Handle unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      return {
        success: false,
        error: "This subdomain is already taken",
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create tunnel",
    };
  }
}

/**
 * Delete a tunnel (owner only).
 */
export async function deleteTunnel(
  publicId: string,
): Promise<TunnelResult<void>> {
  try {
    const userId = requireUserId();
    const result = await env.DB.prepare(
      `DELETE FROM tunnels WHERE public_id = ?1 AND user_id = ?2`,
    )
      .bind(publicId, userId)
      .run();

    if (result.meta.changes === 0) {
      return {
        success: false,
        error: "Tunnel not found or you don't have permission to delete it",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete tunnel",
    };
  }
}

/**
 * Update tunnel name (owner only).
 */
export async function updateTunnelName(
  userId: number,
  publicId: string,
  name: string | null,
): Promise<TunnelResult<void>> {
  try {
    const now = new Date().toISOString();

    const result = await env.DB.prepare(
      `UPDATE tunnels SET name = ?1, updated_at = ?2 WHERE public_id = ?3 AND user_id = ?4`,
    )
      .bind(name, now, publicId, userId)
      .run();

    if (result.meta.changes === 0) {
      return {
        success: false,
        error: "Tunnel not found or you don't have permission to update it",
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update tunnel",
    };
  }
}

// =============================================================================
// Internal (for tunnel proxy)
// =============================================================================

/**
 * Get tunnel by subdomain (for proxy routing).
 * This is used internally, not exposed to users.
 */
export async function getTunnelBySubdomain(
  subdomain: string,
): Promise<Tunnel | null> {
  const result = await env.DB.prepare(
    `SELECT * FROM tunnels WHERE subdomain = ?1`,
  )
    .bind(subdomain)
    .first<TunnelRow>();

  if (!result) {
    return null;
  }

  return tunnelFromRow(result);
}

/**
 * Update tunnel status (for Durable Object).
 */
export async function updateTunnelStatus(
  publicId: string,
  status: "online" | "offline",
): Promise<void> {
  const now = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE tunnels SET status = ?1, last_connected_at = ?2, updated_at = ?2 WHERE public_id = ?3`,
  )
    .bind(status, now, publicId)
    .run();
}
