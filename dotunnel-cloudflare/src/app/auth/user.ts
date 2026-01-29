import { env } from "cloudflare:workers";

import type { UserInfo } from "./oauth.ts";

// =============================================================================
// Types
// =============================================================================

export type User = {
  id: number;
  publicId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// =============================================================================
// User Management
// =============================================================================

/**
 * Generate a random public user ID.
 */
function generatePublicId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `usr_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Find or create a user from OAuth user info.
 * Links the OAuth account to the user.
 */
export async function findOrCreateUser(
  providerId: string,
  userInfo: UserInfo,
): Promise<User> {
  const now = new Date().toISOString();

  // First, check if we have an existing account link
  const existingAccount = await env.DB.prepare(
    `SELECT a.user_id, u.id, u.public_id, u.name, u.email, u.email_verified, u.image, u.created_at, u.updated_at
     FROM accounts a
     JOIN users u ON a.user_id = u.id
     WHERE a.provider = ?1 AND a.subject = ?2`,
  )
    .bind(providerId, userInfo.sub)
    .first<{
      user_id: number;
      id: number;
      public_id: string;
      name: string;
      email: string;
      email_verified: number;
      image: string | null;
      created_at: string;
      updated_at: string;
    }>();

  if (existingAccount) {
    // Update user info if changed
    await env.DB.prepare(
      `UPDATE users SET name = ?1, image = ?2, updated_at = ?3 WHERE id = ?4`,
    )
      .bind(
        userInfo.name || existingAccount.name,
        userInfo.picture || existingAccount.image,
        now,
        existingAccount.id,
      )
      .run();

    return {
      id: existingAccount.id,
      publicId: existingAccount.public_id,
      name: userInfo.name || existingAccount.name,
      email: existingAccount.email,
      emailVerified: Boolean(existingAccount.email_verified),
      image: userInfo.picture || existingAccount.image,
      createdAt: new Date(existingAccount.created_at),
      updatedAt: new Date(now),
    };
  }

  // Check if user exists by email (for linking additional providers)
  if (userInfo.email) {
    const existingUserByEmail = await env.DB.prepare(
      `SELECT id, public_id, name, email, email_verified, image, created_at, updated_at
       FROM users WHERE email = ?1`,
    )
      .bind(userInfo.email)
      .first<{
        id: number;
        public_id: string;
        name: string;
        email: string;
        email_verified: number;
        image: string | null;
        created_at: string;
        updated_at: string;
      }>();

    if (existingUserByEmail) {
      // Link this provider to existing user
      await env.DB.prepare(
        `INSERT INTO accounts (user_id, provider, subject, created_at)
         VALUES (?1, ?2, ?3, ?4)`,
      )
        .bind(existingUserByEmail.id, providerId, userInfo.sub, now)
        .run();

      // Update user info
      await env.DB.prepare(
        `UPDATE users SET 
         name = ?1, 
         email_verified = ?2,
         image = ?3, 
         updated_at = ?4 
         WHERE id = ?5`,
      )
        .bind(
          userInfo.name || existingUserByEmail.name,
          userInfo.email_verified ? 1 : existingUserByEmail.email_verified,
          userInfo.picture || existingUserByEmail.image,
          now,
          existingUserByEmail.id,
        )
        .run();

      return {
        id: existingUserByEmail.id,
        publicId: existingUserByEmail.public_id,
        name: userInfo.name || existingUserByEmail.name,
        email: existingUserByEmail.email,
        emailVerified:
          userInfo.email_verified ||
          Boolean(existingUserByEmail.email_verified),
        image: userInfo.picture || existingUserByEmail.image,
        createdAt: new Date(existingUserByEmail.created_at),
        updatedAt: new Date(now),
      };
    }
  }

  // Create new user
  const publicId = generatePublicId();

  const insertResult = await env.DB.prepare(
    `INSERT INTO users (public_id, name, email, email_verified, image, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(
      publicId,
      userInfo.name || "User",
      userInfo.email || "",
      userInfo.email_verified ? 1 : 0,
      userInfo.picture || null,
      now,
      now,
    )
    .run();

  const userId = insertResult.meta.last_row_id;

  // Create account link
  await env.DB.prepare(
    `INSERT INTO accounts (user_id, provider, subject, created_at)
     VALUES (?1, ?2, ?3, ?4)`,
  )
    .bind(userId, providerId, userInfo.sub, now)
    .run();

  return {
    id: Number(userId),
    publicId,
    name: userInfo.name || "User",
    email: userInfo.email || "",
    emailVerified: userInfo.email_verified || false,
    image: userInfo.picture || null,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

/**
 * Get user by ID.
 */
export async function getUserById(id: number): Promise<User | null> {
  const result = await env.DB.prepare(
    `SELECT id, public_id, name, email, email_verified, image, created_at, updated_at
     FROM users WHERE id = ?1`,
  )
    .bind(id)
    .first<{
      id: number;
      public_id: string;
      name: string;
      email: string;
      email_verified: number;
      image: string | null;
      created_at: string;
      updated_at: string;
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
    createdAt: new Date(result.created_at),
    updatedAt: new Date(result.updated_at),
  };
}

/**
 * Get user by public ID.
 */
export async function getUserByPublicId(
  publicId: string,
): Promise<User | null> {
  const result = await env.DB.prepare(
    `SELECT id, public_id, name, email, email_verified, image, created_at, updated_at
     FROM users WHERE public_id = ?1`,
  )
    .bind(publicId)
    .first<{
      id: number;
      public_id: string;
      name: string;
      email: string;
      email_verified: number;
      image: string | null;
      created_at: string;
      updated_at: string;
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
    createdAt: new Date(result.created_at),
    updatedAt: new Date(result.updated_at),
  };
}

/**
 * Check if any users exist (for bootstrap).
 */
export async function hasAnyUsers(): Promise<boolean> {
  const result = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM users LIMIT 1`,
  ).first<{ count: number }>();

  return (result?.count ?? 0) > 0;
}

/**
 * Get the count of users.
 */
export async function getUserCount(): Promise<number> {
  const result = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM users`,
  ).first<{ count: number }>();

  return result?.count ?? 0;
}
