import { env } from "cloudflare:workers";
import { parse, serialize } from "cookie-es";

// =============================================================================
// Types
// =============================================================================

export type Session = {
  publicId: string;
  userId: number;
  expiresAt: Date;
};

export type SessionUser = {
  id: number;
  publicId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
};

// =============================================================================
// Constants
// =============================================================================

const SESSION_COOKIE_NAME = "session";
const SESSION_TOKEN_LENGTH = 32; // 256 bits
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// =============================================================================
// Token Generation & Hashing
// =============================================================================

/**
 * Generate a cryptographically secure session token.
 */
function generateSessionToken(): string {
  const bytes = new Uint8Array(SESSION_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a random public session ID.
 */
function generatePublicId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `ses_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Hash a session token using SHA-256.
 */
async function hashToken(token: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  return crypto.subtle.digest("SHA-256", data);
}

// =============================================================================
// Session CRUD
// =============================================================================

/**
 * Create a new session for a user.
 */
export async function createSession(
  userId: number,
  request: Request,
): Promise<{ session: Session; token: string; cookie: string }> {
  const token = generateSessionToken();
  const tokenHash = await hashToken(token);
  const publicId = generatePublicId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  // Extract request metadata
  const ipAddress =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    null;
  const userAgent = request.headers.get("User-Agent");

  await env.DB.prepare(
    `INSERT INTO sessions (public_id, token_hash, user_id, ip_address, user_agent, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(
      publicId,
      new Uint8Array(tokenHash),
      userId,
      ipAddress,
      userAgent,
      expiresAt.toISOString(),
      new Date().toISOString(),
    )
    .run();

  const session: Session = {
    publicId,
    userId,
    expiresAt,
  };

  const cookie = buildSessionCookie(token, expiresAt);

  return { session, token, cookie };
}

/**
 * Validate a session token and return the session if valid.
 */
export async function validateSession(token: string): Promise<Session | null> {
  const tokenHash = await hashToken(token);

  const result = await env.DB.prepare(
    `SELECT public_id, user_id, expires_at FROM sessions WHERE token_hash = ?1`,
  )
    .bind(new Uint8Array(tokenHash))
    .first<{ public_id: string; user_id: number; expires_at: string }>();

  if (!result) {
    return null;
  }

  const expiresAt = new Date(result.expires_at);

  // Check if expired
  if (expiresAt < new Date()) {
    // Clean up expired session
    await deleteSessionByPublicId(result.public_id);
    return null;
  }

  return {
    publicId: result.public_id,
    userId: result.user_id,
    expiresAt,
  };
}

/**
 * Delete a session by its public ID.
 */
export async function deleteSessionByPublicId(publicId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE public_id = ?1")
    .bind(publicId)
    .run();
}

/**
 * Delete all sessions for a user.
 */
export async function deleteUserSessions(userId: number): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1")
    .bind(userId)
    .run();
}

// =============================================================================
// Cookie Management
// =============================================================================

/**
 * Build the session cookie string.
 */
function buildSessionCookie(token: string, expiresAt: Date): string {
  return serialize(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    expires: expiresAt,
    secure: !import.meta.env.DEV,
  });
}

/**
 * Build a cookie to clear the session.
 */
export function buildClearSessionCookie(): string {
  return serialize(SESSION_COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    maxAge: 0,
  });
}

/**
 * Parse session token from request cookies.
 */
export function getSessionTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookies = parse(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] || null;
}

// =============================================================================
// User Fetching
// =============================================================================

/**
 * Get the user associated with a session.
 */
export async function getSessionUser(
  session: Session,
): Promise<SessionUser | null> {
  const result = await env.DB.prepare(
    `SELECT id, public_id, name, email, email_verified, image FROM users WHERE id = ?1`,
  )
    .bind(session.userId)
    .first<{
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
// Utility: Get cookie by name
// =============================================================================

export function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }

  const cookies = parse(cookieHeader);
  return cookies[name] || null;
}
