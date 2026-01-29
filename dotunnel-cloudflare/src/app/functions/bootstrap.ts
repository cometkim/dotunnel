"use server";

import { env } from "cloudflare:workers";
import {
  fetchOIDCDiscovery,
  type OIDCDiscoveryDocument,
  OIDCDiscoveryError,
} from "#app/lib/auth-endpoints.ts";
import {
  checkMigrations,
  exportConfigAsBase64,
  loadConfigFromDatabase,
  type MigrationStatus,
  NotBootstrappedError,
  saveConfig,
} from "#app/lib/db.ts";
import {
  type AuthProvider,
  type Config,
  createDefaultConfig,
} from "#app/models/config.ts";

// =============================================================================
// Types
// =============================================================================

export type BootstrapState =
  | { step: "migration"; migrationStatus: MigrationStatus }
  | { step: "auth"; config: Config }
  | { step: "admin"; config: Config }
  | { step: "tunnel"; config: Config }
  | { step: "complete"; config: Config; configBase64: string }
  | { step: "done" };

// =============================================================================
// Bootstrap Status
// =============================================================================

/**
 * Get the current bootstrap state.
 * Determines which step of the wizard should be shown.
 */
export async function getBootstrapState(): Promise<BootstrapState> {
  // Check migrations first
  const migrationStatus = await checkMigrations();
  if (!migrationStatus.migrated) {
    return { step: "migration", migrationStatus };
  }

  // Try to load existing config
  let config: Config;
  try {
    const result = await loadConfigFromDatabase();
    config = result.config;
  } catch (error) {
    if (error instanceof NotBootstrappedError) {
      // No config exists, start fresh
      config = createDefaultConfig();
    } else {
      throw error;
    }
  }

  // Already bootstrapped
  if (config.bootstrapped) {
    return { step: "done" };
  }

  // Determine which step based on config state
  if (config.auth.providers.length === 0) {
    return { step: "auth", config };
  }

  // Check if admin user exists
  const hasAdmin = await checkAdminExists();
  if (!hasAdmin) {
    return { step: "admin", config };
  }

  if (!config.service.host || !config.tunnel.hostPattern) {
    return { step: "tunnel", config };
  }

  // All steps complete, ready to finalize
  const finalConfig = { ...config, bootstrapped: true };
  return {
    step: "complete",
    config: finalConfig,
    configBase64: exportConfigAsBase64(finalConfig),
  };
}

// =============================================================================
// Migration Check
// =============================================================================

/**
 * Refresh migration status.
 * Called when user clicks "Refresh Status" button.
 */
export async function refreshMigrationStatus(): Promise<MigrationStatus> {
  return checkMigrations();
}

// =============================================================================
// Auth Provider Setup (Step 1)
// =============================================================================

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
 * Save auth provider configuration.
 */
export async function saveAuthProvider(
  provider: AuthProvider,
): Promise<
  { success: true; config: Config } | { success: false; error: string }
> {
  try {
    // Load current config or create default
    let config: Config;
    try {
      const result = await loadConfigFromDatabase();
      config = result.config;
    } catch (error) {
      if (error instanceof NotBootstrappedError) {
        config = createDefaultConfig();
      } else {
        throw error;
      }
    }

    // Add or update provider
    const existingIndex = config.auth.providers.findIndex(
      (p) => p.id === provider.id,
    );
    if (existingIndex >= 0) {
      config.auth.providers[existingIndex] = provider;
    } else {
      config.auth.providers.push(provider);
    }

    // Save to database
    await saveConfig(config);

    return { success: true, config };
  } catch (error) {
    console.error("Failed to save auth provider:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save provider",
    };
  }
}

/**
 * Remove an auth provider.
 */
export async function removeAuthProvider(
  providerId: string,
): Promise<
  { success: true; config: Config } | { success: false; error: string }
> {
  try {
    const result = await loadConfigFromDatabase();
    const config = result.config;

    config.auth.providers = config.auth.providers.filter(
      (p) => p.id !== providerId,
    );

    await saveConfig(config);
    return { success: true, config };
  } catch (error) {
    console.error("Failed to remove auth provider:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to remove provider",
    };
  }
}

// =============================================================================
// Admin User Setup (Step 2)
// =============================================================================

/**
 * Check if an admin user exists.
 */
async function checkAdminExists(): Promise<boolean> {
  const result = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM users LIMIT 1",
  ).first<{ count: number }>();

  return (result?.count ?? 0) > 0;
}

/**
 * Get the current admin user if exists.
 */
export async function getAdminUser(): Promise<{
  id: number;
  name: string;
  email: string;
} | null> {
  const result = await env.DB.prepare(
    "SELECT id, name, email FROM users ORDER BY id LIMIT 1",
  ).first<{ id: number; name: string; email: string }>();

  return result ?? null;
}

// =============================================================================
// Service & Tunnel Configuration (Step 3)
// =============================================================================

/**
 * Save service host and tunnel host pattern configuration.
 */
export async function saveHostsConfig(
  serviceHost: string,
  tunnelHostPattern: string,
): Promise<
  { success: true; config: Config } | { success: false; error: string }
> {
  try {
    // Validate service host
    if (!serviceHost) {
      return {
        success: false,
        error: "Service host is required",
      };
    }

    // Validate tunnel pattern format
    if (!tunnelHostPattern.startsWith("*.")) {
      return {
        success: false,
        error: "Tunnel host pattern must start with '*.' (e.g., *.tunnel.io)",
      };
    }

    const result = await loadConfigFromDatabase();
    const config = result.config;

    config.service.host = serviceHost;
    config.tunnel.hostPattern = tunnelHostPattern;

    await saveConfig(config);
    return { success: true, config };
  } catch (error) {
    console.error("Failed to save hosts config:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to save hosts config",
    };
  }
}

// =============================================================================
// Complete Bootstrap (Step 4)
// =============================================================================

/**
 * Finalize bootstrap process.
 * Marks the config as bootstrapped and returns the base64 config for deployment.
 */
export async function completeBootstrap(): Promise<
  | { success: true; config: Config; configBase64: string }
  | { success: false; error: string }
> {
  try {
    const result = await loadConfigFromDatabase();
    const config = result.config;

    // Validate all required fields are set
    if (config.auth.providers.length === 0) {
      return {
        success: false,
        error: "At least one auth provider is required",
      };
    }

    const hasAdmin = await checkAdminExists();
    if (!hasAdmin) {
      return { success: false, error: "Admin user is required" };
    }

    if (!config.service.host) {
      return { success: false, error: "Service host is required" };
    }

    if (!config.tunnel.hostPattern) {
      return { success: false, error: "Tunnel host pattern is required" };
    }

    // Mark as bootstrapped
    config.bootstrapped = true;
    await saveConfig(config);

    return {
      success: true,
      config,
      configBase64: exportConfigAsBase64(config),
    };
  } catch (error) {
    console.error("Failed to complete bootstrap:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to complete bootstrap",
    };
  }
}

/**
 * Export current config as base64.
 * Used for copying config value for static deployment.
 */
export async function exportCurrentConfig(): Promise<
  { success: true; configBase64: string } | { success: false; error: string }
> {
  try {
    const result = await loadConfigFromDatabase();
    return {
      success: true,
      configBase64: exportConfigAsBase64(result.config),
    };
  } catch (error) {
    console.error("Failed to export config:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to export config",
    };
  }
}
