import { serialize } from "cookie-es";

import {
  GITHUB_DEFAULT_SCOPES,
  GITHUB_ENDPOINTS,
  GOOGLE_DEFAULT_SCOPES,
  GOOGLE_ENDPOINTS,
  OIDC_DEFAULT_SCOPES,
} from "#app/lib/auth-endpoints.ts";
import type { AuthProvider } from "#app/models/config.ts";

// =============================================================================
// Types
// =============================================================================

export type OAuthState = {
  providerId: string;
  returnTo: string;
  isBootstrap: boolean;
  nonce: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
};

export type UserInfo = {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
};

// =============================================================================
// State Management (CSRF Protection)
// =============================================================================

const STATE_COOKIE_NAME = "oauth_state";
const STATE_MAX_AGE = 600; // 10 minutes

/**
 * Generate a cryptographically secure random string.
 */
function generateRandomString(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create OAuth state and return both the state string and the cookie to set.
 */
export function createOAuthState(
  providerId: string,
  returnTo: string,
  isBootstrap: boolean,
): { state: string; cookie: string } {
  const stateData: OAuthState = {
    providerId,
    returnTo,
    isBootstrap,
    nonce: generateRandomString(16),
  };

  const state = btoa(JSON.stringify(stateData));

  const cookie = serialize(STATE_COOKIE_NAME, state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: STATE_MAX_AGE,
    secure: !import.meta.env.DEV,
  });

  return { state, cookie };
}

/**
 * Parse and validate OAuth state from callback.
 */
export function parseOAuthState(
  stateParam: string,
  stateCookie: string | null,
): OAuthState | null {
  if (!stateCookie || stateParam !== stateCookie) {
    return null;
  }

  try {
    return JSON.parse(atob(stateParam)) as OAuthState;
  } catch {
    return null;
  }
}

/**
 * Create a cookie to clear the OAuth state.
 */
export function clearStateCookie(): string {
  return serialize(STATE_COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    maxAge: 0,
  });
}

// =============================================================================
// Authorization URL Building
// =============================================================================

/**
 * Build the authorization URL for a provider.
 */
export function buildAuthorizationUrl(
  provider: AuthProvider,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams();
  params.set("client_id", provider.clientId);
  params.set("redirect_uri", redirectUri);
  params.set("response_type", "code");
  params.set("state", state);

  let authorizationEndpoint: string;
  let scopes: readonly string[];

  switch (provider.type) {
    case "github":
      authorizationEndpoint = GITHUB_ENDPOINTS.authorizationEndpoint;
      scopes = GITHUB_DEFAULT_SCOPES;
      break;

    case "google":
      authorizationEndpoint = GOOGLE_ENDPOINTS.authorizationEndpoint;
      scopes = GOOGLE_DEFAULT_SCOPES;
      break;

    case "oidc":
      authorizationEndpoint = provider.authorizationEndpoint;
      scopes = provider.scopes ?? OIDC_DEFAULT_SCOPES;
      break;
  }

  params.set("scope", scopes.join(" "));

  return `${authorizationEndpoint}?${params.toString()}`;
}

// =============================================================================
// Token Exchange
// =============================================================================

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForTokens(
  provider: AuthProvider,
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  let tokenEndpoint: string;

  switch (provider.type) {
    case "github":
      tokenEndpoint = GITHUB_ENDPOINTS.tokenEndpoint;
      break;
    case "google":
      tokenEndpoint = GOOGLE_ENDPOINTS.tokenEndpoint;
      break;
    case "oidc":
      tokenEndpoint = provider.tokenEndpoint;
      break;
  }

  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("client_id", provider.clientId);
  params.set("client_secret", provider.clientSecret);
  params.set("code", code);
  params.set("redirect_uri", redirectUri);

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new OAuthError(
      `Token exchange failed: ${response.status} - ${error}`,
    );
  }

  return response.json() as Promise<TokenResponse>;
}

// =============================================================================
// User Info Fetching
// =============================================================================

/**
 * Fetch user info from the provider.
 */
export async function fetchUserInfo(
  provider: AuthProvider,
  accessToken: string,
): Promise<UserInfo> {
  switch (provider.type) {
    case "github":
      return fetchGitHubUserInfo(accessToken);
    case "google":
    case "oidc":
      return fetchOIDCUserInfo(provider, accessToken);
  }
}

/**
 * Fetch user info from GitHub API.
 * GitHub doesn't use standard OIDC, so we need custom handling.
 */
async function fetchGitHubUserInfo(accessToken: string): Promise<UserInfo> {
  // Fetch basic user info
  const userResponse = await fetch(GITHUB_ENDPOINTS.userinfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "DOtunnel",
    },
  });

  if (!userResponse.ok) {
    throw new OAuthError(
      `Failed to fetch GitHub user info: ${userResponse.status}`,
    );
  }

  const user = (await userResponse.json()) as {
    id: number;
    login: string;
    name?: string;
    email?: string;
    avatar_url?: string;
  };

  // GitHub might not return email in user endpoint if it's private
  // Fetch from /user/emails endpoint
  let email = user.email;
  let emailVerified = false;

  if (!email) {
    const emailsResponse = await fetch(GITHUB_ENDPOINTS.userEmailsEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "DOtunnel",
      },
    });

    if (emailsResponse.ok) {
      const emails = (await emailsResponse.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;

      const primaryEmail = emails.find((e) => e.primary && e.verified);
      if (primaryEmail) {
        email = primaryEmail.email;
        emailVerified = primaryEmail.verified;
      }
    }
  }

  return {
    sub: String(user.id),
    name: user.name || user.login,
    email,
    email_verified: emailVerified,
    picture: user.avatar_url,
  };
}

/**
 * Fetch user info from OIDC userinfo endpoint.
 */
async function fetchOIDCUserInfo(
  provider: AuthProvider & { type: "google" | "oidc" },
  accessToken: string,
): Promise<UserInfo> {
  let userinfoEndpoint: string;

  if (provider.type === "google") {
    userinfoEndpoint = GOOGLE_ENDPOINTS.userinfoEndpoint;
  } else {
    if (!provider.userinfoEndpoint) {
      throw new OAuthError("OIDC provider missing userinfo endpoint");
    }
    userinfoEndpoint = provider.userinfoEndpoint;
  }

  const response = await fetch(userinfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new OAuthError(`Failed to fetch userinfo: ${response.status}`);
  }

  const data = (await response.json()) as UserInfo;

  return {
    sub: data.sub,
    name: data.name,
    email: data.email,
    email_verified: data.email_verified,
    picture: data.picture,
  };
}

// =============================================================================
// Errors
// =============================================================================

export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}
