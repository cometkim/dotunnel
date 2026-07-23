"use server";

import { env } from "cloudflare:workers";
import { Result } from "flight-result";
import * as v from "valibot";
import { exportConfigAsBase64, loadConfig, saveConfig } from "#app/lib/db.ts";
import { DatabaseError, ValidationError } from "#app/lib/errors.ts";
import {
  AuthProvider,
  type AuthProviderInput,
  type PublicAuthProvider,
  type PublicConfig,
  toPublicConfig,
  toPublicProvider,
} from "#app/models/config.ts";

// =============================================================================
// Types
// =============================================================================

export type AdminDashboardData = {
  config: {
    config: PublicConfig;
    source: "static" | "database";
  };
  stats: {
    usersCount: number;
    sessionsCount: number;
    providersCount: number;
  };
};

export type AdminUser = {
  id: number;
  publicId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
};

export type AdminSession = {
  publicId: string;
  userId: number;
  userName: string;
  userEmail: string;
  type: "browser" | "cli";
  name: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

// =============================================================================
// Dashboard
// =============================================================================

/**
 * Get admin dashboard data including config and stats.
 */
export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const config = await loadConfig(import.meta.env.DEV);

  // Get counts
  const [usersResult, sessionsResult] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as count FROM users").first<{
      count: number;
    }>(),
    env.DB.prepare("SELECT COUNT(*) as count FROM sessions").first<{
      count: number;
    }>(),
  ]);

  return {
    config: {
      config: toPublicConfig(config.config),
      source: config.source,
    },
    stats: {
      usersCount: usersResult?.count ?? 0,
      sessionsCount: sessionsResult?.count ?? 0,
      providersCount: config.config.auth.providers.length,
    },
  };
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get current configuration with export data.
 *
 * configBase64 is an intentional secret reveal: the admin copies it into
 * `wrangler secret put CONFIG` for static deployment.
 */
export async function getConfigData(): Promise<{
  config: PublicConfig;
  source: "static" | "database";
  configBase64: string;
}> {
  const result = await loadConfig(import.meta.env.DEV);
  return {
    config: toPublicConfig(result.config),
    source: result.source,
    configBase64: exportConfigAsBase64(result.config),
  };
}

/**
 * A client-editable view of the config.
 *
 * The client never holds stored secrets, so instead of round-tripping the
 * full config it sends a patch: host fields, providers to add (with the
 * secrets the admin just typed), and stored provider ids to remove.
 */
export type ConfigPatch = {
  serviceHost: string;
  tunnelHostPattern: string;
  addProviders: AuthProviderInput[];
  removeProviderIds: string[];
};

/**
 * Apply a config patch from the admin config page.
 * Secrets of existing providers never leave the server.
 */
export async function saveFullConfig(
  patch: ConfigPatch,
): Promise<
  Result<
    { config: PublicConfig; configBase64: string },
    ValidationError | DatabaseError
  >
> {
  return Result.gen(async function* ($) {
    // Validate
    if (!patch.serviceHost) {
      return Result.err(
        ValidationError({
          field: "service.host",
          message: "Service host is required",
        }),
      );
    }
    if (patch.tunnelHostPattern && !patch.tunnelHostPattern.startsWith("*.")) {
      return Result.err(
        ValidationError({
          field: "tunnel.hostPattern",
          message: "Tunnel host pattern must start with '*.'",
        }),
      );
    }

    const result = await loadConfig(import.meta.env.DEV);
    const config = result.config;

    config.service.host = patch.serviceHost;
    config.tunnel.hostPattern = patch.tunnelHostPattern;

    config.auth.providers = config.auth.providers.filter(
      (p) => !patch.removeProviderIds.includes(p.id),
    );

    for (const provider of patch.addProviders) {
      // Annotate incoming secrets as Redacted before they touch the config
      const parseResult = v.safeParse(AuthProvider, provider);
      if (!parseResult.success) {
        return Result.err(
          ValidationError({
            field: "auth.providers",
            message: `Invalid provider: ${parseResult.issues[0].message}`,
          }),
        );
      }
      const existingIndex = config.auth.providers.findIndex(
        (p) => p.id === parseResult.output.id,
      );
      if (existingIndex >= 0) {
        config.auth.providers[existingIndex] = parseResult.output;
      } else {
        config.auth.providers.push(parseResult.output);
      }
    }

    if (config.auth.providers.length === 0) {
      return Result.err(
        ValidationError({
          field: "auth.providers",
          message: "At least one auth provider is required",
        }),
      );
    }

    yield* $(
      await Result.tryPromise({
        try: () => saveConfig(config),
        catch: (e) => DatabaseError({ operation: "save config", cause: e }),
      }),
    );

    return Result.ok({
      config: toPublicConfig(config),
      configBase64: exportConfigAsBase64(config),
    });
  });
}

/**
 * Update hosts configuration (service host and tunnel pattern).
 * Returns the updated config with new base64 export.
 */
export async function updateHostsConfig(
  serviceHost: string,
  tunnelHostPattern: string,
): Promise<
  Result<
    { config: PublicConfig; configBase64: string },
    ValidationError | DatabaseError
  >
> {
  return Result.gen(async function* ($) {
    if (!serviceHost) {
      return Result.err(
        ValidationError({
          field: "serviceHost",
          message: "Service host is required",
        }),
      );
    }
    if (!tunnelHostPattern.startsWith("*.")) {
      return Result.err(
        ValidationError({
          field: "tunnelHostPattern",
          message: "Tunnel host pattern must start with '*.'",
        }),
      );
    }

    const result = await loadConfig(import.meta.env.DEV);
    result.config.service.host = serviceHost;
    result.config.tunnel.hostPattern = tunnelHostPattern;

    yield* $(
      await Result.tryPromise({
        try: () => saveConfig(result.config),
        catch: (e) =>
          DatabaseError({ operation: "update hosts config", cause: e }),
      }),
    );

    return Result.ok({
      config: toPublicConfig(result.config),
      configBase64: exportConfigAsBase64(result.config),
    });
  });
}

/**
 * Update config and return updated base64.
 * Used for live-edit experience.
 */
export async function updateConfig(
  updates: Partial<{
    serviceHost: string;
    tunnelHostPattern: string;
  }>,
): Promise<
  Result<
    { config: PublicConfig; configBase64: string },
    ValidationError | DatabaseError
  >
> {
  return Result.gen(async function* ($) {
    const result = await loadConfig(import.meta.env.DEV);

    if (updates.serviceHost !== undefined) {
      result.config.service.host = updates.serviceHost;
    }
    if (updates.tunnelHostPattern !== undefined) {
      if (
        updates.tunnelHostPattern &&
        !updates.tunnelHostPattern.startsWith("*.")
      ) {
        return Result.err(
          ValidationError({
            field: "tunnelHostPattern",
            message: "Tunnel host pattern must start with '*.'",
          }),
        );
      }
      result.config.tunnel.hostPattern = updates.tunnelHostPattern;
    }

    yield* $(
      await Result.tryPromise({
        try: () => saveConfig(result.config),
        catch: (e) => DatabaseError({ operation: "update config", cause: e }),
      }),
    );

    return Result.ok({
      config: toPublicConfig(result.config),
      configBase64: exportConfigAsBase64(result.config),
    });
  });
}

// =============================================================================
// Auth Providers
// =============================================================================

/**
 * Get all auth providers (public view, no secrets).
 */
export async function getAuthProviders(): Promise<PublicAuthProvider[]> {
  const result = await loadConfig(import.meta.env.DEV);
  return result.config.auth.providers.map(toPublicProvider);
}

/**
 * Add or update an auth provider.
 */
export async function saveAuthProvider(
  provider: AuthProviderInput,
): Promise<Result<void, DatabaseError>> {
  return Result.gen(async function* ($) {
    const parsed = v.parse(AuthProvider, provider);
    const result = await loadConfig(import.meta.env.DEV);
    const existingIndex = result.config.auth.providers.findIndex(
      (p) => p.id === parsed.id,
    );

    if (existingIndex >= 0) {
      result.config.auth.providers[existingIndex] = parsed;
    } else {
      result.config.auth.providers.push(parsed);
    }

    yield* $(
      await Result.tryPromise({
        try: () => saveConfig(result.config),
        catch: (e) =>
          DatabaseError({ operation: "save auth provider", cause: e }),
      }),
    );

    return Result.ok(undefined);
  });
}

/**
 * Delete an auth provider.
 */
export async function deleteAuthProvider(
  providerId: string,
): Promise<Result<void, DatabaseError>> {
  return Result.gen(async function* ($) {
    const result = await loadConfig(import.meta.env.DEV);
    result.config.auth.providers = result.config.auth.providers.filter(
      (p) => p.id !== providerId,
    );

    yield* $(
      await Result.tryPromise({
        try: () => saveConfig(result.config),
        catch: (e) =>
          DatabaseError({ operation: "delete auth provider", cause: e }),
      }),
    );

    return Result.ok(undefined);
  });
}

/**
 * Add a new auth provider and return updated config.
 */
export async function addAuthProvider(
  provider: AuthProviderInput,
): Promise<
  Result<{ config: PublicConfig; configBase64: string }, DatabaseError>
> {
  return Result.gen(async function* ($) {
    const parsed = v.parse(AuthProvider, provider);
    const result = await loadConfig(import.meta.env.DEV);

    // Check for duplicate
    const existingIndex = result.config.auth.providers.findIndex(
      (p) => p.id === parsed.id,
    );
    if (existingIndex >= 0) {
      result.config.auth.providers[existingIndex] = parsed;
    } else {
      result.config.auth.providers.push(parsed);
    }

    yield* $(
      await Result.tryPromise({
        try: () => saveConfig(result.config),
        catch: (e) =>
          DatabaseError({ operation: "add auth provider", cause: e }),
      }),
    );

    return Result.ok({
      config: toPublicConfig(result.config),
      configBase64: exportConfigAsBase64(result.config),
    });
  });
}

// =============================================================================
// Users
// =============================================================================

/**
 * Get all users.
 */
export async function getUsers(): Promise<AdminUser[]> {
  const result = await env.DB.prepare(
    "SELECT id, public_id, name, email, email_verified, image, created_at FROM users ORDER BY created_at DESC",
  ).all<{
    id: number;
    public_id: string;
    name: string;
    email: string;
    email_verified: number;
    image: string | null;
    created_at: string;
  }>();

  return result.results.map((row) => ({
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    image: row.image,
    createdAt: row.created_at,
  }));
}

/**
 * Delete a user and all their sessions.
 */
export async function deleteUser(
  userId: number,
): Promise<Result<void, DatabaseError>> {
  const result = await Result.tryPromise({
    try: () =>
      env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(userId).run(),
    catch: (e) => DatabaseError({ operation: "delete user", cause: e }),
  });
  return Result.map(result, () => undefined);
}

// =============================================================================
// Sessions
// =============================================================================

/**
 * Get all sessions with user info (both browser and CLI sessions).
 */
export async function getSessions(): Promise<AdminSession[]> {
  const result = await env.DB.prepare(
    `SELECT s.public_id, s.user_id, s.type, s.name, s.ip_address, s.user_agent, 
            s.expires_at, s.created_at, s.last_used_at, s.revoked_at,
            u.name as user_name, u.email as user_email
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     ORDER BY s.created_at DESC`,
  ).all<{
    public_id: string;
    user_id: number;
    type: "browser" | "cli";
    name: string | null;
    ip_address: string | null;
    user_agent: string | null;
    expires_at: string | null;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
    user_name: string;
    user_email: string;
  }>();

  return result.results.map((row) => ({
    publicId: row.public_id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    type: row.type || "browser", // Default for old sessions without type
    name: row.name,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }));
}

/**
 * Delete or revoke a session.
 * Browser sessions are deleted, CLI sessions are soft-deleted (revoked).
 */
export async function deleteSession(
  publicId: string,
): Promise<Result<void, DatabaseError>> {
  return Result.gen(async function* ($) {
    // Check if it's a CLI session
    const session = yield* $(
      await Result.tryPromise({
        try: () =>
          env.DB.prepare("SELECT type FROM sessions WHERE public_id = ?1")
            .bind(publicId)
            .first<{ type: string | null }>(),
        catch: (e) =>
          DatabaseError({ operation: "get session type", cause: e }),
      }),
    );

    if (session?.type === "cli") {
      // Soft delete CLI sessions
      yield* $(
        await Result.tryPromise({
          try: () =>
            env.DB.prepare(
              "UPDATE sessions SET revoked_at = ?1 WHERE public_id = ?2",
            )
              .bind(new Date().toISOString(), publicId)
              .run(),
          catch: (e) =>
            DatabaseError({ operation: "revoke session", cause: e }),
        }),
      );
    } else {
      // Hard delete browser sessions
      yield* $(
        await Result.tryPromise({
          try: () =>
            env.DB.prepare("DELETE FROM sessions WHERE public_id = ?1")
              .bind(publicId)
              .run(),
          catch: (e) =>
            DatabaseError({ operation: "delete session", cause: e }),
        }),
      );
    }

    return Result.ok(undefined);
  });
}

/**
 * Delete all sessions for a user.
 */
export async function deleteUserSessions(
  userId: number,
): Promise<Result<void, DatabaseError>> {
  const result = await Result.tryPromise({
    try: () =>
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1")
        .bind(userId)
        .run(),
    catch: (e) =>
      DatabaseError({ operation: "delete user sessions", cause: e }),
  });
  return Result.map(result, () => undefined);
}
