import type { AuthProvider, OIDCAuthProvider } from "#app/models/config.ts";

// =============================================================================
// Hardcoded Endpoints for GitHub and Google
// =============================================================================

/**
 * GitHub OAuth 2.0 endpoints.
 * GitHub does not support OIDC, so we use custom OAuth flow with API calls.
 */
export const GITHUB_ENDPOINTS = {
  authorizationEndpoint: "https://github.com/login/oauth/authorize",
  tokenEndpoint: "https://github.com/login/oauth/access_token",
  userinfoEndpoint: "https://api.github.com/user",
  userEmailsEndpoint: "https://api.github.com/user/emails",
} as const;

/**
 * Default scopes for GitHub OAuth.
 */
export const GITHUB_DEFAULT_SCOPES = ["read:user", "user:email"] as const;

/**
 * Google OIDC endpoints.
 * These are stable and well-documented, so we hardcode them.
 */
export const GOOGLE_ENDPOINTS = {
  issuer: "https://accounts.google.com",
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  userinfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
  jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
} as const;

/**
 * Default scopes for Google OIDC.
 */
export const GOOGLE_DEFAULT_SCOPES = ["openid", "email", "profile"] as const;

/**
 * Default scopes for custom OIDC providers.
 */
export const OIDC_DEFAULT_SCOPES = ["openid", "email", "profile"] as const;

// =============================================================================
// OIDC Discovery
// =============================================================================

/**
 * OIDC Discovery document structure.
 * Only includes fields we care about.
 */
export type OIDCDiscoveryDocument = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  scopes_supported?: string[];
};

/**
 * Fetch OIDC discovery document from issuer.
 * Used for auto-filling endpoints when configuring custom OIDC providers.
 */
export async function fetchOIDCDiscovery(
  issuer: string,
): Promise<OIDCDiscoveryDocument> {
  // Normalize issuer URL (remove trailing slash)
  const normalizedIssuer = issuer.replace(/\/$/, "");
  const discoveryUrl = `${normalizedIssuer}/.well-known/openid-configuration`;

  const response = await fetch(discoveryUrl, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new OIDCDiscoveryError(
      `Failed to fetch OIDC discovery: ${response.status} ${response.statusText}`,
      issuer,
    );
  }

  const doc = (await response.json()) as OIDCDiscoveryDocument;

  // Validate required fields
  if (!doc.authorization_endpoint) {
    throw new OIDCDiscoveryError(
      "Missing authorization_endpoint in discovery document",
      issuer,
    );
  }
  if (!doc.token_endpoint) {
    throw new OIDCDiscoveryError(
      "Missing token_endpoint in discovery document",
      issuer,
    );
  }
  if (!doc.jwks_uri) {
    throw new OIDCDiscoveryError(
      "Missing jwks_uri in discovery document",
      issuer,
    );
  }

  return doc;
}

export class OIDCDiscoveryError extends Error {
  constructor(
    message: string,
    public readonly issuer: string,
  ) {
    super(message);
    this.name = "OIDCDiscoveryError";
  }
}

// =============================================================================
// Endpoint Resolution
// =============================================================================

export type ResolvedEndpoints = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
};

/**
 * Get resolved endpoints for an auth provider.
 * GitHub and Google use hardcoded endpoints.
 * Custom OIDC providers use stored endpoints from discovery.
 */
export function getProviderEndpoints(
  provider: AuthProvider,
): ResolvedEndpoints {
  switch (provider.type) {
    case "github":
      return {
        authorizationEndpoint: GITHUB_ENDPOINTS.authorizationEndpoint,
        tokenEndpoint: GITHUB_ENDPOINTS.tokenEndpoint,
        userinfoEndpoint: GITHUB_ENDPOINTS.userinfoEndpoint,
      };

    case "google":
      return {
        authorizationEndpoint: GOOGLE_ENDPOINTS.authorizationEndpoint,
        tokenEndpoint: GOOGLE_ENDPOINTS.tokenEndpoint,
        userinfoEndpoint: GOOGLE_ENDPOINTS.userinfoEndpoint,
        jwksUri: GOOGLE_ENDPOINTS.jwksUri,
      };

    case "oidc":
      return {
        authorizationEndpoint: provider.authorizationEndpoint,
        tokenEndpoint: provider.tokenEndpoint,
        userinfoEndpoint: provider.userinfoEndpoint,
        jwksUri: provider.jwksUri,
      };
  }
}

/**
 * Get scopes for an auth provider.
 */
export function getProviderScopes(provider: AuthProvider): readonly string[] {
  switch (provider.type) {
    case "github":
      return GITHUB_DEFAULT_SCOPES;

    case "google":
      return GOOGLE_DEFAULT_SCOPES;

    case "oidc":
      return provider.scopes ?? OIDC_DEFAULT_SCOPES;
  }
}

/**
 * Get display name for an auth provider.
 */
export function getProviderDisplayName(provider: AuthProvider): string {
  switch (provider.type) {
    case "github":
      return "GitHub";

    case "google":
      return "Google";

    case "oidc":
      return provider.name;
  }
}

// =============================================================================
// Helper for Creating OIDC Provider from Discovery
// =============================================================================

/**
 * Create an OIDC provider config from discovery document.
 * Used to populate provider fields after fetching discovery.
 */
export function createOIDCProviderFromDiscovery(
  id: string,
  name: string,
  issuer: string,
  clientId: string,
  clientSecret: string,
  discovery: OIDCDiscoveryDocument,
  scopes?: string[],
): OIDCAuthProvider {
  return {
    id,
    type: "oidc",
    name,
    issuer: discovery.issuer || issuer,
    clientId,
    clientSecret,
    scopes,
    authorizationEndpoint: discovery.authorization_endpoint,
    tokenEndpoint: discovery.token_endpoint,
    userinfoEndpoint: discovery.userinfo_endpoint,
    jwksUri: discovery.jwks_uri,
  };
}
