-- Tunnels table for managing user tunnel endpoints
-- Two types: ephemeral (auto-generated, temporary) and named (user-defined, persistent)

CREATE TABLE IF NOT EXISTS `tunnels` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `public_id` TEXT NOT NULL UNIQUE,
  `user_id` INTEGER NOT NULL,
  `subdomain` TEXT NOT NULL UNIQUE,
  `type` TEXT NOT NULL CHECK(`type` IN ('ephemeral', 'named')),
  `name` TEXT,
  `status` TEXT NOT NULL DEFAULT 'offline' CHECK(`status` IN ('online', 'offline')),
  `last_connected_at` TEXT,
  `created_at` TEXT NOT NULL,
  `updated_at` TEXT NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);

DROP INDEX IF EXISTS `tunnels_public_id_uniq`;
CREATE UNIQUE INDEX `tunnels_public_id_uniq` ON `tunnels`(`public_id`);

DROP INDEX IF EXISTS `tunnels_subdomain_uniq`;
CREATE UNIQUE INDEX `tunnels_subdomain_uniq` ON `tunnels`(`subdomain`);

DROP INDEX IF EXISTS `tunnels_user_id_idx`;
CREATE INDEX `tunnels_user_id_idx` ON `tunnels`(`user_id`);
