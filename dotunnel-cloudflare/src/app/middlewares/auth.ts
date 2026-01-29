import type { RouteMiddleware } from "rwsdk/router";
import {
  getSessionTokenFromRequest,
  getSessionUser,
  type Session,
  type SessionUser,
  validateSession,
} from "#app/auth/session.ts";

// =============================================================================
// Types
// =============================================================================

export type AuthContextFields = {
  session: Session | null;
  user: SessionUser | null;
};

// =============================================================================
// Middleware
// =============================================================================

/**
 * Middleware that validates session and attaches user to request context.
 * Does not require authentication - just loads it if present.
 */
export function sessionLoader(): RouteMiddleware {
  return async ({ request, ctx }) => {
    const authCtx = ctx as AuthContextFields;
    const token = getSessionTokenFromRequest(request);

    if (token) {
      const session = await validateSession(token);
      if (session) {
        const user = await getSessionUser(session);
        authCtx.session = session;
        authCtx.user = user;
      } else {
        authCtx.session = null;
        authCtx.user = null;
      }
    } else {
      authCtx.session = null;
      authCtx.user = null;
    }
  };
}

/**
 * Middleware that requires authentication.
 * Redirects to login if not authenticated.
 */
export function requireAuth(loginUrl = "/_auth/login"): RouteMiddleware {
  return async ({ request, ctx }) => {
    const authCtx = ctx as AuthContextFields;

    if (!authCtx.session || !authCtx.user) {
      const url = new URL(request.url);
      const returnTo = url.pathname + url.search;
      const redirectUrl = new URL(loginUrl, url.origin);
      redirectUrl.searchParams.set("return_to", returnTo);

      return new Response(null, {
        status: 302,
        headers: { Location: redirectUrl.toString() },
      });
    }
  };
}
