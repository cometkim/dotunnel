import { loadConfigFromDatabase } from "#app/lib/db.ts";

import {
  buildAuthorizationUrl,
  clearStateCookie,
  createOAuthState,
  exchangeCodeForTokens,
  fetchUserInfo,
  OAuthError,
  parseOAuthState,
} from "./oauth.ts";
import { createSession, getCookie } from "./session.ts";
import { findOrCreateUser } from "./user.ts";

// =============================================================================
// Login Handler
// =============================================================================

/**
 * Handle login request - redirect to OAuth provider.
 */
export async function handleLogin(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const providerId = url.searchParams.get("provider_id");
  const isBootstrap = url.searchParams.get("bootstrap") === "true";
  const returnTo = url.searchParams.get("return_to") || "/";

  if (!providerId) {
    return new Response("Missing provider_id", { status: 400 });
  }

  // Load config and find provider
  const { config } = await loadConfigFromDatabase();
  const provider = config.auth.providers.find((p) => p.id === providerId);

  if (!provider) {
    return new Response("Provider not found", { status: 404 });
  }

  // Build callback URL
  const callbackUrl = new URL("/_auth/callback", url.origin).toString();

  // Create state for CSRF protection
  const { state, cookie } = createOAuthState(
    providerId,
    isBootstrap ? "/_bootstrap" : returnTo,
    isBootstrap,
  );

  // Build authorization URL
  const authUrl = buildAuthorizationUrl(provider, callbackUrl, state);

  // Redirect to provider
  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      "Set-Cookie": cookie,
    },
  });
}

// =============================================================================
// Callback Handler
// =============================================================================

/**
 * Handle OAuth callback - exchange code for tokens and create session.
 */
export async function handleCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error:", error, errorDescription);
    return createErrorRedirect(
      "/_bootstrap",
      `Authentication failed: ${errorDescription || error}`,
    );
  }

  if (!code || !stateParam) {
    return createErrorRedirect("/_bootstrap", "Missing code or state");
  }

  // Validate state (CSRF protection)
  const stateCookie = getCookie(request, "oauth_state");
  const state = parseOAuthState(stateParam, stateCookie);

  if (!state) {
    return createErrorRedirect(
      "/_bootstrap",
      "Invalid state - please try again",
    );
  }

  try {
    // Load config and find provider
    const { config } = await loadConfigFromDatabase();
    const provider = config.auth.providers.find(
      (p) => p.id === state.providerId,
    );

    if (!provider) {
      return createErrorRedirect(state.returnTo, "Provider not found");
    }

    // Build callback URL for token exchange
    const callbackUrl = new URL("/_auth/callback", url.origin).toString();

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(provider, code, callbackUrl);

    // Fetch user info
    const userInfo = await fetchUserInfo(provider, tokens.access_token);

    if (!userInfo.email) {
      return createErrorRedirect(
        state.returnTo,
        "Email not provided by OAuth provider. Please ensure email access is granted.",
      );
    }

    // Find or create user
    const user = await findOrCreateUser(provider.id, userInfo);

    // Create session
    const { cookie: sessionCookie } = await createSession(user.id, request);

    // Clear state cookie and set session cookie
    const headers = new Headers();
    headers.append("Set-Cookie", clearStateCookie());
    headers.append("Set-Cookie", sessionCookie);
    headers.set("Location", state.returnTo);

    return new Response(null, {
      status: 302,
      headers,
    });
  } catch (err) {
    console.error("OAuth callback error:", err);

    const message =
      err instanceof OAuthError
        ? err.message
        : "Authentication failed. Please try again.";

    return createErrorRedirect(state.returnTo, message);
  }
}

// =============================================================================
// Logout Handler
// =============================================================================

/**
 * Handle logout request - clear session.
 */
export async function handleLogout(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return_to") || "/";

  // Import here to avoid circular dependency
  const {
    buildClearSessionCookie,
    getSessionTokenFromRequest,
    validateSession,
    deleteSessionByPublicId,
  } = await import("./session.ts");

  // Get current session and delete it
  const token = getSessionTokenFromRequest(request);
  if (token) {
    const session = await validateSession(token);
    if (session) {
      await deleteSessionByPublicId(session.publicId);
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: returnTo,
      "Set-Cookie": buildClearSessionCookie(),
    },
  });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a redirect response with an error message.
 */
function createErrorRedirect(returnTo: string, error: string): Response {
  const url = new URL(returnTo, "http://localhost");
  url.searchParams.set("error", error);

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.pathname + url.search,
      "Set-Cookie": clearStateCookie(),
    },
  });
}
