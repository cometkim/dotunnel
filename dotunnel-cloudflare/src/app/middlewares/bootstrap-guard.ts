import type { RouteMiddleware } from "rwsdk/router";

import {
  type ConfigContext,
  checkMigrations,
  loadConfig,
  type MigrationStatus,
  NotBootstrappedError,
} from "#app/lib/db.ts";
import type { Config } from "#app/models/config.ts";

// =============================================================================
// Types
// =============================================================================

export type BootstrapContextFields = {
  /**
   * Bootstrap state for rendering the wizard.
   * Only set when on /_bootstrap route and not fully bootstrapped.
   */
  bootstrapState?:
    | {
        step: "migration";
        migrationStatus: MigrationStatus;
      }
    | {
        step: "wizard";
        config: Config | null;
      };

  /**
   * Loaded config (only set when fully bootstrapped).
   */
  config?: Config;

  /**
   * Where the config was loaded from.
   */
  configSource?: "static" | "database";
};

// =============================================================================
// Middleware
// =============================================================================

/**
 * Bootstrap guard middleware.
 *
 * Handles routing logic based on bootstrap state:
 * - If not migrated + on /_bootstrap: allow (show migration guide)
 * - If not migrated + NOT on /_bootstrap: redirect to /_bootstrap
 * - If migrated but not bootstrapped + on /_bootstrap: allow (show wizard)
 * - If migrated but not bootstrapped + NOT on /_bootstrap: redirect to /_bootstrap
 * - If fully bootstrapped + on /_bootstrap: redirect to /
 * - If fully bootstrapped + NOT on /_bootstrap: allow (normal routing)
 *
 * Also logs warning when config is loaded from database in production.
 */
export function bootstrapGuard(): RouteMiddleware {
  return async ({ request, ctx }) => {
    const url = new URL(request.url);
    const isBootstrapRoute = url.pathname.startsWith("/_bootstrap");
    const isAuthRoute = url.pathname.startsWith("/_auth");
    const isDev = import.meta.env.DEV;

    // Cast ctx to include our fields
    const appCtx = ctx as BootstrapContextFields;

    // Allow auth routes to pass through (needed for OAuth callbacks during bootstrap)
    if (isAuthRoute) {
      return;
    }

    // Step 1: Check migrations
    const migrationStatus = await checkMigrations();
    if (!migrationStatus.migrated) {
      if (!isBootstrapRoute) {
        return Response.redirect(new URL("/_bootstrap", request.url), 302);
      }
      appCtx.bootstrapState = { step: "migration", migrationStatus };
      return;
    }

    // Step 2: Load config
    let configCtx: ConfigContext;
    try {
      configCtx = await loadConfig(isDev);
    } catch (error) {
      if (error instanceof NotBootstrappedError) {
        // No config exists yet
        if (!isBootstrapRoute) {
          return Response.redirect(new URL("/_bootstrap", request.url), 302);
        }
        appCtx.bootstrapState = { step: "wizard", config: null };
        return;
      }
      throw error;
    }

    // Step 3: Check bootstrap status
    if (!configCtx.config.bootstrapped) {
      if (!isBootstrapRoute) {
        return Response.redirect(new URL("/_bootstrap", request.url), 302);
      }
      appCtx.bootstrapState = { step: "wizard", config: configCtx.config };
      return;
    }

    // Step 4: Fully bootstrapped
    if (isBootstrapRoute) {
      // Redirect away from bootstrap page
      return Response.redirect(new URL("/", request.url), 302);
    }

    // Warn if using database in production
    if (configCtx.source === "database" && !isDev) {
      console.warn(
        "[DOtunnel] Config loaded from database. " +
          "Set CONFIG secret and redeploy for better performance.",
      );
    }

    // Set config in context for downstream handlers
    appCtx.config = configCtx.config;
    appCtx.configSource = configCtx.source;
  };
}
