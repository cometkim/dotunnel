"use server";

import { env } from "cloudflare:workers";
import { Result } from "better-result";
import { getRequestInfo } from "rwsdk/worker";
import * as v from "valibot";
import { loadConfig } from "#app/lib/db.ts";
import {
  AuthRequiredError,
  ConflictError,
  DatabaseError,
  type NotFoundError,
  PermissionError,
  type TunnelError,
  ValidationError,
} from "#app/lib/errors.ts";
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
// Helpers
// =============================================================================

/**
 * Get current user ID from request context.
 * Returns Result with AuthRequiredError if user is not authenticated.
 */
function requireUserId(): Result<number, AuthRequiredError> {
  const { ctx } = getRequestInfo() as { ctx: AppContext };
  if (!ctx.user) {
    return Result.err(new AuthRequiredError());
  }
  return Result.ok(ctx.user.id);
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
): Promise<Result<{ available: boolean }, ValidationError | DatabaseError>> {
  return Result.gen(async function* () {
    // Validate subdomain format first
    const parseResult = v.safeParse(SubdomainSchema, subdomain);
    if (!parseResult.success) {
      return Result.err(
        new ValidationError({
          field: "subdomain",
          message: parseResult.issues[0]?.message ?? "Invalid subdomain format",
        }),
      );
    }

    const normalizedSubdomain = parseResult.output;

    const existing = yield* Result.await(
      Result.tryPromise({
        try: () =>
          env.DB.prepare(`SELECT 1 FROM tunnels WHERE subdomain = ?1`)
            .bind(normalizedSubdomain)
            .first(),
        catch: (e) =>
          new DatabaseError({ operation: "check subdomain", cause: e }),
      }),
    );

    return Result.ok({ available: !existing });
  });
}

// =============================================================================
// Mutations
// =============================================================================

/**
 * Create a new tunnel for the current user.
 */
export async function createTunnel(
  input: unknown,
): Promise<Result<TunnelDisplay, TunnelError>> {
  return Result.gen(async function* () {
    const userId = yield* requireUserId();
    const tunnel = yield* Result.await(createTunnelForUser(userId, input));
    return Result.ok(tunnel);
  });
}

/**
 * Create a new tunnel for a specific user (internal use).
 * This is used by CLI API where userId comes from token validation.
 */
export async function createTunnelForUser(
  userId: number,
  input: unknown,
): Promise<Result<TunnelDisplay, TunnelError>> {
  return Result.gen(async function* () {
    // Validate input
    const parseResult = v.safeParse(CreateTunnelInput, input);
    if (!parseResult.success) {
      return Result.err(
        new ValidationError({
          message: parseResult.issues[0]?.message ?? "Invalid input",
        }),
      );
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
        return Result.err(
          new ConflictError({
            resource: "subdomain",
            message: "Failed to generate unique subdomain, please try again",
          }),
        );
      }
      subdomain = generated;
    } else {
      // Named tunnel - user specified subdomain
      subdomain = validInput.subdomain;

      // Check availability
      const existing = yield* Result.await(
        Result.tryPromise({
          try: () =>
            env.DB.prepare(`SELECT 1 FROM tunnels WHERE subdomain = ?1`)
              .bind(subdomain)
              .first(),
          catch: (e) =>
            new DatabaseError({ operation: "check subdomain", cause: e }),
        }),
      );

      if (existing) {
        return Result.err(
          new ConflictError({
            resource: "subdomain",
            message: "This subdomain is already taken",
          }),
        );
      }
    }

    // Insert tunnel
    yield* Result.await(
      Result.tryPromise({
        try: () =>
          env.DB.prepare(
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
            .run(),
        catch: (e) => {
          // Handle unique constraint violation
          if (
            e instanceof Error &&
            e.message.includes("UNIQUE constraint failed")
          ) {
            return new ConflictError({
              resource: "subdomain",
              message: "This subdomain is already taken",
            });
          }
          return new DatabaseError({ operation: "create tunnel", cause: e });
        },
      }),
    );

    // Fetch the created tunnel
    const [tunnelResult, configResult] = await Promise.all([
      env.DB.prepare(`SELECT * FROM tunnels WHERE public_id = ?1`)
        .bind(publicId)
        .first<TunnelRow>(),
      loadConfig(import.meta.env.DEV),
    ]);

    if (!tunnelResult) {
      return Result.err(
        new DatabaseError({
          operation: "retrieve tunnel",
          cause: new Error("Failed to retrieve created tunnel"),
        }),
      );
    }

    const hostPattern = configResult.config.tunnel.hostPattern;
    const tunnel = tunnelFromRow(tunnelResult);

    return Result.ok({
      ...tunnel,
      url: buildTunnelUrl(tunnel.subdomain, hostPattern),
    });
  });
}

/**
 * Delete a tunnel (owner only).
 */
export async function deleteTunnel(
  publicId: string,
): Promise<Result<void, TunnelError>> {
  return Result.gen(async function* () {
    const userId = yield* requireUserId();

    const result = yield* Result.await(
      Result.tryPromise({
        try: () =>
          env.DB.prepare(
            `DELETE FROM tunnels WHERE public_id = ?1 AND user_id = ?2`,
          )
            .bind(publicId, userId)
            .run(),
        catch: (e) =>
          new DatabaseError({ operation: "delete tunnel", cause: e }),
      }),
    );

    if (result.meta.changes === 0) {
      return Result.err(
        new PermissionError({ action: "delete", resource: "tunnel" }),
      );
    }

    return Result.ok(undefined);
  });
}

/**
 * Update tunnel name (owner only).
 */
export async function updateTunnelName(
  userId: number,
  publicId: string,
  name: string | null,
): Promise<Result<void, NotFoundError | PermissionError | DatabaseError>> {
  return Result.gen(async function* () {
    const now = new Date().toISOString();

    const result = yield* Result.await(
      Result.tryPromise({
        try: () =>
          env.DB.prepare(
            `UPDATE tunnels SET name = ?1, updated_at = ?2 WHERE public_id = ?3 AND user_id = ?4`,
          )
            .bind(name, now, publicId, userId)
            .run(),
        catch: (e) =>
          new DatabaseError({ operation: "update tunnel", cause: e }),
      }),
    );

    if (result.meta.changes === 0) {
      return Result.err(
        new PermissionError({ action: "update", resource: "tunnel" }),
      );
    }

    return Result.ok(undefined);
  });
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
