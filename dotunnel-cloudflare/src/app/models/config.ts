import * as v from "valibot";

import { Redacted } from "#app/lib/redacted.ts";

// =============================================================================
// Secret Schema
// =============================================================================

/**
 * A string secret, annotated as Redacted<string> after parsing.
 *
 * Accepts either a plain string (from stored JSON or client form input) or an
 * already-wrapped Redacted instance (from in-memory config), so parsed configs
 * can be re-validated without unwrapping.
 *
 * Serialization must go through serializeConfig() - JSON.stringify on a
 * Redacted value throws by design.
 */
export const redactedString: v.GenericSchema<
  string | Redacted<string>,
  Redacted<string>
> = v.union([
  v.custom<Redacted<string>>((input) => Redacted.is(input)),
  v.pipe(
    v.string(),
    v.transform((value) => Redacted.make(value)),
  ),
]);

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
  clientSecret: redactedString,
});

/**
 * Google OIDC provider.
 * Endpoints are hardcoded in auth-endpoints.ts since they're stable.
 */
export const GoogleAuthProvider = v.object({
  id: v.string(),
  type: v.literal("google"),
  clientId: v.string(),
  clientSecret: redactedString,
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
  clientSecret: redactedString,
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

/**
 * Wire format for creating/updating a provider (e.g. from a client form).
 * clientSecret is a plain string here; parse with the AuthProvider schema
 * to get a Redacted-annotated provider before storing or using it.
 */
export type AuthProviderInput = v.InferInput<typeof AuthProvider>;

// =============================================================================
// Public (Client-Safe) Views
// =============================================================================

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * Provider without its secret. This is the ONLY provider shape that may
 * cross the RSC boundary (client component props, "use server" returns).
 */
export type PublicAuthProvider = DistributiveOmit<AuthProvider, "clientSecret">;

/**
 * Config without secrets, safe to serialize to the client.
 */
export type PublicConfig = Omit<Config, "auth"> & {
  auth: { providers: PublicAuthProvider[] };
};

export function toPublicProvider(provider: AuthProvider): PublicAuthProvider {
  const { clientSecret: _clientSecret, ...publicProvider } = provider;
  return publicProvider as PublicAuthProvider;
}

export function toPublicConfig(config: Config): PublicConfig {
  return {
    ...config,
    auth: {
      providers: config.auth.providers.map(toPublicProvider),
    },
  };
}

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

  /** Service configuration */
  service: v.object({
    /**
     * Host for the service dashboard & API.
     * Example: "dotunnel.example.com"
     */
    host: v.string(),
  }),

  /** Tunnel configuration */
  tunnel: v.object({
    /**
     * Wildcard host pattern for tunnel endpoints.
     * Example: "*.tunnel.io"
     * This is independent from the service host.
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
    service: {
      host: "",
    },
    tunnel: {
      hostPattern: "",
    },
  };
}

/**
 * Serialize a config to its stored JSON form, revealing secrets.
 *
 * This is the ONLY sanctioned path from Redacted secrets back to plaintext,
 * used for persistence (D1 settings row, CONFIG secret export). A plain
 * JSON.stringify(config) throws because of Redacted's toJSON guard.
 */
export function serializeConfig(config: Config): string {
  const stored = {
    ...config,
    auth: {
      providers: config.auth.providers.map((provider) => ({
        ...provider,
        clientSecret: Redacted.value(provider.clientSecret),
      })),
    },
  };
  return JSON.stringify(stored);
}

/**
 * Check if a hostname matches the tunnel host pattern.
 * Example: "api.tunnel.io" matches "*.tunnel.io"
 */
export function isTunnelHost(hostname: string, pattern: string): boolean {
  if (!pattern.startsWith("*.")) {
    return false;
  }

  const baseDomain = pattern.slice(2); // Remove "*."

  // Check if hostname ends with the base domain and has a subdomain
  // e.g., "foo.tunnel.io" matches "*.tunnel.io", but "tunnel.io" does not
  if (hostname === baseDomain) {
    return false;
  }

  return hostname.endsWith(`.${baseDomain}`);
}

/**
 * Check if a hostname is the service host.
 */
export function isServiceHost(hostname: string, serviceHost: string): boolean {
  return hostname === serviceHost;
}
