import { env } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import * as v from "valibot";

import { Config } from "#app/models/config.ts";

export type MigrationStatus = {
  migrated: boolean;
  appliedMigrations: string[];
  requiredMigrations: string[];
};

export type ConfigContext = {
  config: v.InferOutput<typeof Config>;
  source: "static" | "database";
};

export class NotBootstrappedError extends Error {
  name = "NotBootstrappedError";
  constructor() {
    super("Service is not bootstrapped");
  }
}

/**
 * Check if D1 migrations have been applied.
 * Queries the d1_migrations table to verify required migrations exist.
 */
export async function checkMigrations(): Promise<MigrationStatus> {
  const requiredMigrations = ["0001-initial.sql"];

  try {
    const result = await env.DB.prepare(
      "SELECT name FROM d1_migrations ORDER BY id",
    ).all<{ name: string }>();

    const appliedMigrations = result.results.map((r) => r.name);

    const allApplied = requiredMigrations.every((m) =>
      appliedMigrations.includes(m),
    );

    return {
      migrated: allApplied,
      appliedMigrations,
      requiredMigrations,
    };
  } catch {
    // Table doesn't exist = migrations not run
    return {
      migrated: false,
      appliedMigrations: [],
      requiredMigrations,
    };
  }
}

/**
 * Load config from static secret or database.
 * In development, always uses database for easier iteration.
 * In production, prefers static CONFIG secret, falls back to database.
 */
export async function loadConfig(isDev: boolean): Promise<ConfigContext> {
  // Development: Always use D1 for easier iteration
  if (isDev) {
    return loadConfigFromDatabase();
  }

  // Production: Static secret first (base64 encoded)
  if (env.CONFIG) {
    const json = Buffer.from(env.CONFIG, "base64").toString("utf8");
    const config = v.parse(Config, JSON.parse(json));
    return { config, source: "static" };
  }

  // Fallback to D1
  return loadConfigFromDatabase();
}

/**
 * Load config from D1 settings table.
 */
export async function loadConfigFromDatabase(): Promise<ConfigContext> {
  const result = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'config'",
  ).first<{ value: string }>();

  if (result) {
    // D1 JSONB is returned as string, parse it
    const value =
      typeof result.value === "string"
        ? JSON.parse(result.value)
        : result.value;
    const config = v.parse(Config, value);
    return { config, source: "database" };
  }

  throw new NotBootstrappedError();
}

/**
 * Save config to D1 settings table.
 * Uses UPSERT to handle both insert and update.
 */
export async function saveConfig(
  config: v.InferOutput<typeof Config>,
): Promise<void> {
  // Validate before saving
  const validated = v.parse(Config, config);

  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('config', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
  )
    .bind(JSON.stringify(validated))
    .run();
}

/**
 * Check if the service has been bootstrapped.
 * Returns the config if bootstrapped, null otherwise.
 */
export async function getBootstrapStatus(
  isDev: boolean,
): Promise<
  | { bootstrapped: true; config: ConfigContext }
  | { bootstrapped: false; config: null }
> {
  try {
    const configCtx = await loadConfig(isDev);
    if (configCtx.config.bootstrapped) {
      return { bootstrapped: true, config: configCtx };
    }
    return { bootstrapped: false, config: null };
  } catch (error) {
    if (error instanceof NotBootstrappedError) {
      return { bootstrapped: false, config: null };
    }
    throw error;
  }
}

/**
 * Export config as base64-encoded JSON for static deployment.
 */
export function exportConfigAsBase64(
  config: v.InferOutput<typeof Config>,
): string {
  const json = JSON.stringify(config);
  return Buffer.from(json, "utf8").toString("base64");
}
