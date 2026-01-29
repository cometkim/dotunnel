"use server";

import { env } from "cloudflare:workers";
import {
  fetchOIDCDiscovery,
  type OIDCDiscoveryDocument,
  OIDCDiscoveryError,
} from "#app/lib/auth-endpoints.ts";
import {
  type ConfigContext,
  exportConfigAsBase64,
  loadConfig,
  saveConfig,
} from "#app/lib/db.ts";
import type { AuthProvider, Config } from "#app/models/config.ts";

// =============================================================================
// Types
// =============================================================================

export type ConfigSaveResult =
  | { success: true; config: Config; configBase64: string }
  | { success: false; error: string };

export type AdminDashboardData = {
  config: ConfigContext;
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
    config,
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
 */
export async function getConfigData(): Promise<{
  config: Config;
  source: "static" | "database";
  configBase64: string;
}> {
  const result = await loadConfig(import.meta.env.DEV);
  return {
    config: result.config,
    source: result.source,
    configBase64: exportConfigAsBase64(result.config),
  };
}

/**
 * Save the full configuration (all fields).
 * Used by the unified config page.
 */
export async function saveFullConfig(
  config: Config,
): Promise<ConfigSaveResult> {
  try {
    // Validate
    if (!config.service.host) {
      return { success: false, error: "Service host is required" };
    }
    if (
      config.tunnel.hostPattern &&
      !config.tunnel.hostPattern.startsWith("*.")
    ) {
      return {
        success: false,
        error: "Tunnel host pattern must start with '*.' ",
      };
    }
    if (config.auth.providers.length === 0) {
      return {
        success: false,
        error: "At least one auth provider is required",
      };
    }

    await saveConfig(config);

    return {
      success: true,
      config,
      configBase64: exportConfigAsBase64(config),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to save configuration",
    };
  }
}

/**
 * Update hosts configuration (service host and tunnel pattern).
 * Returns the updated config with new base64 export.
 */
export async function updateHostsConfig(
  serviceHost: string,
  tunnelHostPattern: string,
): Promise<
  | { success: true; config: Config; configBase64: string }
  | { success: false; error: string }
> {
  try {
    if (!serviceHost) {
      return { success: false, error: "Service host is required" };
    }
    if (!tunnelHostPattern.startsWith("*.")) {
      return {
        success: false,
        error: "Tunnel host pattern must start with '*.'",
      };
    }

    const result = await loadConfig(import.meta.env.DEV);
    result.config.service.host = serviceHost;
    result.config.tunnel.hostPattern = tunnelHostPattern;
    await saveConfig(result.config);

    return {
      success: true,
      config: result.config,
      configBase64: exportConfigAsBase64(result.config),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update",
    };
  }
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
  | { success: true; config: Config; configBase64: string }
  | { success: false; error: string }
> {
  try {
    const result = await loadConfig(import.meta.env.DEV);

    if (updates.serviceHost !== undefined) {
      result.config.service.host = updates.serviceHost;
    }
    if (updates.tunnelHostPattern !== undefined) {
      if (
        updates.tunnelHostPattern &&
        !updates.tunnelHostPattern.startsWith("*.")
      ) {
        return {
          success: false,
          error: "Tunnel host pattern must start with '*.'",
        };
      }
      result.config.tunnel.hostPattern = updates.tunnelHostPattern;
    }

    await saveConfig(result.config);

    return {
      success: true,
      config: result.config,
      configBase64: exportConfigAsBase64(result.config),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update",
    };
  }
}

// =============================================================================
// Auth Providers
// =============================================================================

/**
 * Get all auth providers.
 */
export async function getAuthProviders(): Promise<AuthProvider[]> {
  const result = await loadConfig(import.meta.env.DEV);
  return result.config.auth.providers;
}

/**
 * Add or update an auth provider.
 */
export async function saveAuthProvider(
  provider: AuthProvider,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const result = await loadConfig(import.meta.env.DEV);
    const existingIndex = result.config.auth.providers.findIndex(
      (p) => p.id === provider.id,
    );

    if (existingIndex >= 0) {
      result.config.auth.providers[existingIndex] = provider;
    } else {
      result.config.auth.providers.push(provider);
    }

    await saveConfig(result.config);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save provider",
    };
  }
}

/**
 * Delete an auth provider.
 */
export async function deleteAuthProvider(
  providerId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const result = await loadConfig(import.meta.env.DEV);
    result.config.auth.providers = result.config.auth.providers.filter(
      (p) => p.id !== providerId,
    );
    await saveConfig(result.config);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete provider",
    };
  }
}

/**
 * Fetch OIDC discovery document for auto-filling endpoints.
 */
export async function discoverOIDCEndpoints(
  issuer: string,
): Promise<
  | { success: true; discovery: OIDCDiscoveryDocument }
  | { success: false; error: string }
> {
  try {
    const discovery = await fetchOIDCDiscovery(issuer);
    return { success: true, discovery };
  } catch (error) {
    if (error instanceof OIDCDiscoveryError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to fetch OIDC discovery" };
  }
}

/**
 * Add a new auth provider and return updated config.
 */
export async function addAuthProvider(
  provider: AuthProvider,
): Promise<
  | { success: true; config: Config; configBase64: string }
  | { success: false; error: string }
> {
  try {
    const result = await loadConfig(import.meta.env.DEV);

    // Check for duplicate
    const existingIndex = result.config.auth.providers.findIndex(
      (p) => p.id === provider.id,
    );
    if (existingIndex >= 0) {
      result.config.auth.providers[existingIndex] = provider;
    } else {
      result.config.auth.providers.push(provider);
    }

    await saveConfig(result.config);
    return {
      success: true,
      config: result.config,
      configBase64: exportConfigAsBase64(result.config),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add provider",
    };
  }
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
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(userId).run();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete user",
    };
  }
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
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    // Check if it's a CLI session
    const session = await env.DB.prepare(
      "SELECT type FROM sessions WHERE public_id = ?1",
    )
      .bind(publicId)
      .first<{ type: string | null }>();

    if (session?.type === "cli") {
      // Soft delete CLI sessions
      await env.DB.prepare(
        "UPDATE sessions SET revoked_at = ?1 WHERE public_id = ?2",
      )
        .bind(new Date().toISOString(), publicId)
        .run();
    } else {
      // Hard delete browser sessions
      await env.DB.prepare("DELETE FROM sessions WHERE public_id = ?1")
        .bind(publicId)
        .run();
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete session",
    };
  }
}

/**
 * Delete all sessions for a user.
 */
export async function deleteUserSessions(
  userId: number,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1")
      .bind(userId)
      .run();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete sessions",
    };
  }
}
