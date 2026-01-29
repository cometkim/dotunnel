// This file is deprecated. Config loading is now handled by bootstrap-guard.ts
// Keeping for backwards compatibility, but this middleware does nothing.

import type { RouteMiddleware } from "rwsdk/router";

/**
 * @deprecated Use bootstrapGuard() instead which handles config loading.
 */
export function configLoader(): RouteMiddleware {
  return () => {
    // No-op - config loading is now done in bootstrap-guard
  };
}
