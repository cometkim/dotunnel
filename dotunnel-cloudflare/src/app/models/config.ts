import * as v from "valibot";

// =============================================================================
// Auth Provider Schemas (Discriminated Union)
// =============================================================================

/**
 * GitHub OAuth 2.0 provider.
 * Endpoints are hardcoded in auth-endpoints.ts since GitHub doesn't support OIDC.
 */
export const GitHubAuthProvider = v.object({
  id: v.string(),
  type: v.literal("github"),
  clientId: v.string(),
  clientSecret: v.string(),
});

/**
 * Google OIDC provider.
 * Endpoints are hardcoded in auth-endpoints.ts since they're stable.
 */
export const GoogleAuthProvider = v.object({
  id: v.string(),
  type: v.literal("google"),
  clientId: v.string(),
  clientSecret: v.string(),
});

/**
 * Custom OIDC provider (Auth0, Okta, Keycloak, etc.).
 * Endpoints are resolved from OIDC discovery and stored statically.
 */
export const OIDCAuthProvider = v.object({
  id: v.string(),
  type: v.literal("oidc"),
  /** Display name (e.g., "Auth0", "Okta") */
  name: v.string(),
  /** OIDC issuer URL (e.g., "https://mytenant.auth0.com") */
  issuer: v.string(),
  clientId: v.string(),
  clientSecret: v.string(),
  /** OAuth scopes. Defaults to ['openid', 'email', 'profile'] if not specified */
  scopes: v.optional(v.array(v.string())),
  /** Authorization endpoint from OIDC discovery */
  authorizationEndpoint: v.string(),
  /** Token endpoint from OIDC discovery */
  tokenEndpoint: v.string(),
  /** UserInfo endpoint from OIDC discovery */
  userinfoEndpoint: v.optional(v.string()),
  /** JWKS URI from OIDC discovery */
  jwksUri: v.string(),
});

/**
 * Auth provider discriminated union.
 * Use `provider.type` to narrow the type.
 */
export const AuthProvider = v.variant("type", [
  GitHubAuthProvider,
  GoogleAuthProvider,
  OIDCAuthProvider,
]);

export type AuthProvider = v.InferOutput<typeof AuthProvider>;
export type GitHubAuthProvider = v.InferOutput<typeof GitHubAuthProvider>;
export type GoogleAuthProvider = v.InferOutput<typeof GoogleAuthProvider>;
export type OIDCAuthProvider = v.InferOutput<typeof OIDCAuthProvider>;

// =============================================================================
// Main Config Schema
// =============================================================================

/**
 * Main configuration schema.
 * Contains versioning, auth providers, and tunnel settings.
 *
 * Storage:
 * - D1 settings table (key: "config") for dynamic setup
 * - CONFIG env var (base64 JSON) for static production deployment
 */
export const Config = v.object({
  /** Schema version for future migrations */
  _v: v.literal(1),

  /** Whether the bootstrap wizard has been completed */
  bootstrapped: v.boolean(),

  /** Authentication configuration */
  auth: v.object({
    /** Configured auth providers */
    providers: v.array(AuthProvider),
  }),

  /** Tunnel configuration */
  tunnel: v.object({
    /**
     * Wildcard host pattern for tunnel endpoints.
     * Example: "*.mytunnel.io"
     * Used to distinguish tunnel requests from service requests.
     */
    hostPattern: v.string(),
  }),
});

export type Config = v.InferOutput<typeof Config>;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a default config object for initial bootstrap.
 */
export function createDefaultConfig(): Config {
  return {
    _v: 1,
    bootstrapped: false,
    auth: {
      providers: [],
    },
    tunnel: {
      hostPattern: "",
    },
  };
}

/**
 * Check if a hostname matches the tunnel host pattern.
 * Example: "api.mytunnel.io" matches "*.mytunnel.io"
 */
export function isTunnelHost(hostname: string, pattern: string): boolean {
  if (!pattern.startsWith("*.")) {
    return false;
  }

  const baseDomain = pattern.slice(2); // Remove "*."

  // Exact match of base domain is NOT a tunnel (it's the service)
  if (hostname === baseDomain) {
    return false;
  }

  // Check if hostname ends with the base domain and has a subdomain
  return hostname.endsWith(`.${baseDomain}`);
}
