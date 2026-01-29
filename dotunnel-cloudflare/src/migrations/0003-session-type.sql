-- Add type column to sessions table to distinguish browser vs CLI sessions
-- type: 'browser' (default) or 'cli'

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- to make expires_at nullable (CLI sessions don't expire)

-- Create new sessions table with nullable expires_at
CREATE TABLE IF NOT EXISTS `sessions_new` (
  `public_id` TEXT NOT NULL PRIMARY KEY,
  `token_hash` BLOB NOT NULL,
  `user_id` INTEGER NOT NULL,
  `type` TEXT NOT NULL DEFAULT 'browser',  -- 'browser' or 'cli'
  `name` TEXT,                              -- Friendly name for CLI tokens
  `ip_address` TEXT,
  `user_agent` TEXT,
  `expires_at` TEXT,                        -- NULL means never expires (for CLI)
  `created_at` TEXT NOT NULL,
  `last_used_at` TEXT,                      -- Track last usage for CLI tokens
  `revoked_at` TEXT,                        -- Soft delete for CLI tokens
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Copy existing data
INSERT INTO sessions_new (public_id, token_hash, user_id, type, ip_address, user_agent, expires_at, created_at)
SELECT public_id, token_hash, user_id, 'browser', ip_address, user_agent, expires_at, created_at
FROM sessions;

-- Drop old table and rename new one
DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;

-- Drop the separate cli_tokens and device_codes tables if they exist
DROP TABLE IF EXISTS `cli_tokens`;
DROP TABLE IF EXISTS `device_codes`;

-- Recreate device_codes table (needed for device flow)
CREATE TABLE IF NOT EXISTS `device_codes` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `device_code` TEXT NOT NULL UNIQUE,
  `user_code` TEXT NOT NULL UNIQUE,
  `user_id` INTEGER,
  `client_id` TEXT NOT NULL,
  `scope` TEXT,
  `status` TEXT NOT NULL DEFAULT 'pending',
  `expires_at` TEXT NOT NULL,
  `created_at` TEXT NOT NULL,
  `authorized_at` TEXT,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);

DROP INDEX IF EXISTS `device_codes_device_code_idx`;
CREATE INDEX `device_codes_device_code_idx` ON `device_codes`(`device_code`);

DROP INDEX IF EXISTS `device_codes_user_code_idx`;
CREATE INDEX `device_codes_user_code_idx` ON `device_codes`(`user_code`);
