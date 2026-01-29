import { env } from "cloudflare:workers";

// =============================================================================
// Types
// =============================================================================

export type DeviceCodeStatus = "pending" | "authorized" | "denied" | "expired";

export type DeviceCode = {
  id: number;
  deviceCode: string;
  userCode: string;
  userId: number | null;
  clientId: string;
  scope: string | null;
  status: DeviceCodeStatus;
  expiresAt: Date;
  createdAt: Date;
  authorizedAt: Date | null;
};

export type DeviceAuthorizationResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
};

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in?: number;
};

export type TokenErrorResponse = {
  error:
    | "authorization_pending"
    | "slow_down"
    | "access_denied"
    | "expired_token";
  error_description: string;
};

// =============================================================================
// Constants
// =============================================================================

const DEVICE_CODE_LENGTH = 32;
const USER_CODE_LENGTH = 8; // 8 alphanumeric chars (easy to type)
const DEVICE_CODE_EXPIRES_IN = 900; // 15 minutes
const POLL_INTERVAL = 5; // 5 seconds
const CLI_TOKEN_LENGTH = 32;

// Characters for user code (excluding confusing chars like 0/O, 1/I/l)
const USER_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// =============================================================================
// Code Generation
// =============================================================================

function generateDeviceCode(): string {
  const bytes = new Uint8Array(DEVICE_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateUserCode(): string {
  const bytes = new Uint8Array(USER_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (b) => USER_CODE_CHARS[b % USER_CODE_CHARS.length],
  ).join("");
}

function generateCliToken(): string {
  const bytes = new Uint8Array(CLI_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return `dt_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function generatePublicId(prefix = "ses"): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function hashToken(token: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  return crypto.subtle.digest("SHA-256", data);
}

// =============================================================================
// Device Authorization (Step 1: CLI requests device code)
// =============================================================================

export async function createDeviceCode(
  clientId: string,
  baseUrl: string,
  scope?: string,
): Promise<DeviceAuthorizationResponse> {
  const deviceCode = generateDeviceCode();
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRES_IN * 1000);
  const createdAt = new Date();

  await env.DB.prepare(
    `INSERT INTO device_codes (device_code, user_code, client_id, scope, status, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6)`,
  )
    .bind(
      deviceCode,
      userCode,
      clientId,
      scope || null,
      expiresAt.toISOString(),
      createdAt.toISOString(),
    )
    .run();

  // Build verification URIs using the request origin
  const verificationUri = `${baseUrl}/_device`;
  const verificationUriComplete = `${baseUrl}/_device?code=${userCode}`;

  return {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: verificationUriComplete,
    expires_in: DEVICE_CODE_EXPIRES_IN,
    interval: POLL_INTERVAL,
  };
}

// =============================================================================
// Token Polling (Step 2: CLI polls for token)
// =============================================================================

export async function pollDeviceCode(
  deviceCode: string,
  clientId: string,
): Promise<TokenResponse | TokenErrorResponse> {
  const result = await env.DB.prepare(
    `SELECT id, user_id, status, expires_at FROM device_codes 
     WHERE device_code = ?1 AND client_id = ?2`,
  )
    .bind(deviceCode, clientId)
    .first<{
      id: number;
      user_id: number | null;
      status: DeviceCodeStatus;
      expires_at: string;
    }>();

  if (!result) {
    return {
      error: "expired_token",
      error_description: "Device code not found or expired",
    };
  }

  const expiresAt = new Date(result.expires_at);
  if (expiresAt < new Date()) {
    // Clean up expired code
    await env.DB.prepare("DELETE FROM device_codes WHERE id = ?1")
      .bind(result.id)
      .run();
    return {
      error: "expired_token",
      error_description: "The device code has expired",
    };
  }

  switch (result.status) {
    case "pending":
      return {
        error: "authorization_pending",
        error_description: "The user has not yet authorized the device",
      };

    case "denied":
      // Clean up denied code
      await env.DB.prepare("DELETE FROM device_codes WHERE id = ?1")
        .bind(result.id)
        .run();
      return {
        error: "access_denied",
        error_description: "The user denied the authorization request",
      };

    case "authorized": {
      if (!result.user_id) {
        return {
          error: "authorization_pending",
          error_description: "Authorization incomplete",
        };
      }

      // Generate CLI token and store in sessions table with type='cli'
      const token = generateCliToken();
      const tokenHash = await hashToken(token);
      const publicId = generatePublicId("cli");
      const createdAt = new Date();

      // CLI sessions don't expire by default (null expires_at)
      await env.DB.prepare(
        `INSERT INTO sessions (public_id, token_hash, user_id, type, name, created_at)
         VALUES (?1, ?2, ?3, 'cli', ?4, ?5)`,
      )
        .bind(
          publicId,
          new Uint8Array(tokenHash),
          result.user_id,
          `CLI (${clientId})`,
          createdAt.toISOString(),
        )
        .run();

      // Clean up the device code
      await env.DB.prepare("DELETE FROM device_codes WHERE id = ?1")
        .bind(result.id)
        .run();

      return {
        access_token: token,
        token_type: "Bearer",
      };
    }

    default:
      return {
        error: "expired_token",
        error_description: "Invalid device code state",
      };
  }
}

// =============================================================================
// User Authorization (Step 3: User authorizes in browser)
// =============================================================================

export async function getDeviceCodeByUserCode(
  userCode: string,
): Promise<DeviceCode | null> {
  const result = await env.DB.prepare(
    `SELECT id, device_code, user_code, user_id, client_id, scope, status, expires_at, created_at, authorized_at
     FROM device_codes WHERE user_code = ?1`,
  )
    .bind(userCode.toUpperCase())
    .first<{
      id: number;
      device_code: string;
      user_code: string;
      user_id: number | null;
      client_id: string;
      scope: string | null;
      status: DeviceCodeStatus;
      expires_at: string;
      created_at: string;
      authorized_at: string | null;
    }>();

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    deviceCode: result.device_code,
    userCode: result.user_code,
    userId: result.user_id,
    clientId: result.client_id,
    scope: result.scope,
    status: result.status,
    expiresAt: new Date(result.expires_at),
    createdAt: new Date(result.created_at),
    authorizedAt: result.authorized_at ? new Date(result.authorized_at) : null,
  };
}

export async function authorizeDeviceCode(
  userCode: string,
  userId: number,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE device_codes 
     SET status = 'authorized', user_id = ?1, authorized_at = ?2
     WHERE user_code = ?3 AND status = 'pending' AND expires_at > ?4`,
  )
    .bind(
      userId,
      new Date().toISOString(),
      userCode.toUpperCase(),
      new Date().toISOString(),
    )
    .run();

  return result.meta.changes > 0;
}

export async function denyDeviceCode(userCode: string): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE device_codes 
     SET status = 'denied'
     WHERE user_code = ?1 AND status = 'pending'`,
  )
    .bind(userCode.toUpperCase())
    .run();

  return result.meta.changes > 0;
}

// =============================================================================
// CLI Token Validation (uses sessions table with type='cli')
// =============================================================================

export type CliTokenUser = {
  id: number;
  publicId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
};

export async function validateCliToken(
  token: string,
): Promise<CliTokenUser | null> {
  if (!token.startsWith("dt_")) {
    return null;
  }

  const tokenHash = await hashToken(token);

  const result = await env.DB.prepare(
    `SELECT s.public_id as session_id, s.expires_at, s.revoked_at,
            u.id, u.public_id, u.name, u.email, u.email_verified, u.image
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token_hash = ?1 AND s.type = 'cli'`,
  )
    .bind(new Uint8Array(tokenHash))
    .first<{
      session_id: string;
      expires_at: string | null;
      revoked_at: string | null;
      id: number;
      public_id: string;
      name: string;
      email: string;
      email_verified: number;
      image: string | null;
    }>();

  if (!result) {
    return null;
  }

  // Check if revoked
  if (result.revoked_at) {
    return null;
  }

  // Check if expired (CLI tokens may have null expires_at = never expires)
  if (result.expires_at && new Date(result.expires_at) < new Date()) {
    return null;
  }

  // Update last used
  await env.DB.prepare(
    `UPDATE sessions SET last_used_at = ?1 WHERE public_id = ?2`,
  )
    .bind(new Date().toISOString(), result.session_id)
    .run();

  return {
    id: result.id,
    publicId: result.public_id,
    name: result.name,
    email: result.email,
    emailVerified: Boolean(result.email_verified),
    image: result.image,
  };
}

// =============================================================================
// CLI Token Revocation (uses sessions table)
// =============================================================================

export async function revokeCliTokenByToken(token: string): Promise<boolean> {
  if (!token.startsWith("dt_")) {
    return false;
  }

  const tokenHash = await hashToken(token);

  const result = await env.DB.prepare(
    `UPDATE sessions 
     SET revoked_at = ?1
     WHERE token_hash = ?2 AND type = 'cli' AND revoked_at IS NULL`,
  )
    .bind(new Date().toISOString(), new Uint8Array(tokenHash))
    .run();

  return result.meta.changes > 0;
}
