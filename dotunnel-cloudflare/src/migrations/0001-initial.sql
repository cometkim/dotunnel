CREATE TABLE IF NOT EXISTS `settings` (
  `key` TEXT NOT NULL PRIMARY KEY,
  `value` JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS `users` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `public_id` TEXT NOT NULL UNIQUE,
  `name` TEXT NOT NULL,
  `email` TEXT NOT NULL,
  `email_verified` BOOLEAN NOT NULL,
  `image` TEXT,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL
);

DROP INDEX IF EXISTS `users_public_id_uniq`;
CREATE UNIQUE INDEX `users_public_id_uniq` ON `users`(`public_id`);

-- accounts is only for authn.
-- no access tokens are stored in the database.
CREATE TABLE IF NOT EXISTS `accounts` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` INTEGER NOT NULL,
  `provider` TEXT NOT NULL,
  `subject` TEXT NOT NULL,
  `created_at` TEXT NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);

DROP INDEX IF EXISTS `accounts_provider_subject_uniq`;
CREATE UNIQUE INDEX `accounts_provider_subject_uniq` ON `accounts`(`provider`, `subject`);

CREATE TABLE IF NOT EXISTS `sessions` (
  `public_id` TEXT NOT NULL PRIMARY KEY,
  `token_hash` BLOB NOT NULL,
  `user_id` INTEGER NOT NULL,
  `ip_address` TEXT,
  `user_agent` TEXT,
  `expires_at` TEXT NOT NULL,
  `created_at` TEXT NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `audits` (
  `actor` TEXT NOT NULL,
  `action` TEXT NOT NULL,
  `target` TEXT NOT NULL,
  `metadata` JSONB,
  `timestamp` INTEGER NOT NULL DEFAULT (unixepoch())
);
