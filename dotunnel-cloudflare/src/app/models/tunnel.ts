import * as v from "valibot";

// =============================================================================
// Tunnel Schemas
// =============================================================================

/**
 * Tunnel type enum.
 * - ephemeral: Auto-generated subdomain, temporary
 * - named: User-defined subdomain, persistent
 */
export const TunnelType = v.picklist(["ephemeral", "named"]);
export type TunnelType = v.InferOutput<typeof TunnelType>;

/**
 * Tunnel status enum.
 * - online: Client is connected
 * - offline: No active connection
 */
export const TunnelStatus = v.picklist(["online", "offline"]);
export type TunnelStatus = v.InferOutput<typeof TunnelStatus>;

/**
 * Tunnel schema matching database structure.
 */
export const Tunnel = v.object({
  id: v.number(),
  publicId: v.string(),
  userId: v.number(),
  subdomain: v.string(),
  type: TunnelType,
  name: v.nullable(v.string()),
  status: TunnelStatus,
  lastConnectedAt: v.nullable(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

export type Tunnel = v.InferOutput<typeof Tunnel>;

/**
 * Tunnel for display in UI (includes computed fields).
 */
export type TunnelDisplay = Tunnel & {
  /** Full tunnel URL, e.g., "https://myapp.tunnel.io" */
  url: string;
};

// =============================================================================
// Input Schemas for Creating Tunnels
// =============================================================================

/**
 * Input for creating an ephemeral tunnel.
 * Subdomain is auto-generated.
 */
export const CreateEphemeralTunnelInput = v.object({
  type: v.literal("ephemeral"),
  name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
});

export type CreateEphemeralTunnelInput = v.InferOutput<
  typeof CreateEphemeralTunnelInput
>;

/**
 * Subdomain validation rules:
 * - 3-63 characters
 * - Lowercase alphanumeric and hyphens
 * - Cannot start or end with hyphen
 * - Cannot be reserved words
 */
const RESERVED_SUBDOMAINS = [
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "smtp",
  "ftp",
  "ssh",
  "localhost",
  "test",
  "dev",
  "staging",
  "prod",
  "production",
];

export const SubdomainSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.minLength(3, "Subdomain must be at least 3 characters"),
  v.maxLength(63, "Subdomain must be at most 63 characters"),
  v.regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    "Subdomain must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen",
  ),
  v.check(
    (value) => !RESERVED_SUBDOMAINS.includes(value),
    "This subdomain is reserved",
  ),
);

/**
 * Input for creating a named tunnel.
 * User specifies the subdomain.
 */
export const CreateNamedTunnelInput = v.object({
  type: v.literal("named"),
  subdomain: SubdomainSchema,
  name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
});

export type CreateNamedTunnelInput = v.InferOutput<
  typeof CreateNamedTunnelInput
>;

/**
 * Union of all tunnel creation inputs.
 */
export const CreateTunnelInput = v.variant("type", [
  CreateEphemeralTunnelInput,
  CreateNamedTunnelInput,
]);

export type CreateTunnelInput = v.InferOutput<typeof CreateTunnelInput>;

// =============================================================================
// Database Row Type
// =============================================================================

/**
 * Raw database row type (snake_case).
 */
export type TunnelRow = {
  id: number;
  public_id: string;
  user_id: number;
  subdomain: string;
  type: string;
  name: string | null;
  status: string;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Convert database row to Tunnel object.
 */
export function tunnelFromRow(row: TunnelRow): Tunnel {
  return {
    id: row.id,
    publicId: row.public_id,
    userId: row.user_id,
    subdomain: row.subdomain,
    type: row.type as TunnelType,
    name: row.name,
    status: row.status as TunnelStatus,
    lastConnectedAt: row.last_connected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a random subdomain for ephemeral tunnels.
 * Format: 8 character lowercase alphanumeric string.
 */
export function generateEphemeralSubdomain(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomValues = new Uint8Array(8);
  crypto.getRandomValues(randomValues);
  for (const byte of randomValues) {
    result += chars[byte % chars.length];
  }
  return result;
}

/**
 * Build full tunnel URL from subdomain and host pattern.
 */
export function buildTunnelUrl(subdomain: string, hostPattern: string): string {
  // hostPattern is like "*.tunnel.io", we replace * with subdomain
  const host = hostPattern.replace("*", subdomain);
  return `https://${host}`;
}
