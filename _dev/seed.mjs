/**
 * Seed local dev state: relay config, a user, a CLI token, and a named tunnel.
 *
 * This deliberately bypasses both the bootstrap wizard and the OAuth/device
 * flow. Neither is interesting when what you want to exercise is the tunnel
 * data path, and both need a real OAuth app to complete.
 *
 * Also writes an isolated CLI profile under `dev/.home` so `~/.config/dotunnel`
 * — which holds your real relay credentials — is never touched.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  CLI_HOME,
  CLI_TOKEN,
  DOMAIN,
  HTTPS_PORT,
  REPO_DIR,
  SUBDOMAIN,
} from "./config.mjs";

const tokenHash = createHash("sha256").update(CLI_TOKEN).digest("hex");

const config = {
  _v: 1,
  bootstrapped: true,
  // Empty is valid; the dashboard's /login has nothing to offer, but the CLI
  // token path and the tunnel proxy never consult providers.
  auth: { providers: [] },
  service: { host: DOMAIN },
  tunnel: { hostPattern: `*.${DOMAIN}` },
};

const sql = `
INSERT INTO settings (key, value) VALUES ('config', '${JSON.stringify(config)}')
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT OR IGNORE INTO users (public_id, name, email, email_verified, created_at, updated_at)
VALUES ('usr_localdev', 'Local Dev', 'dev@${DOMAIN}', 1, datetime('now'), datetime('now'));

-- token_hash is sha256 of the plaintext token; validateCliToken() only also
-- requires the dt_ prefix. NULL expires_at means the CLI session never expires.
INSERT OR REPLACE INTO sessions (public_id, token_hash, user_id, type, name, expires_at, created_at)
VALUES (
  'cli_localdev',
  X'${tokenHash}',
  (SELECT id FROM users WHERE public_id = 'usr_localdev'),
  'cli',
  'Local dev CLI',
  NULL,
  datetime('now')
);

-- A named tunnel keeps the URL stable across restarts. Omit --subdomain on the
-- CLI to exercise the ephemeral path instead, which mints a random subdomain.
INSERT OR REPLACE INTO tunnels (public_id, user_id, subdomain, type, name, status, created_at, updated_at)
VALUES (
  'tun_localdev',
  (SELECT id FROM users WHERE public_id = 'usr_localdev'),
  '${SUBDOMAIN}',
  'named',
  'Local dev',
  'offline',
  datetime('now'),
  datetime('now')
);
`;

const sqlFile = path.join(os.tmpdir(), `dotunnel-seed-${process.pid}.sql`);
await fs.writeFile(sqlFile, sql);

try {
  execFileSync(
    "yarn",
    [
      "workspace",
      "dotunnel-cloudflare",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--file",
      sqlFile,
      "-y",
    ],
    { cwd: REPO_DIR, stdio: ["ignore", "ignore", "inherit"] },
  );
} finally {
  await fs.rm(sqlFile, { force: true });
}

const suffix = HTTPS_PORT === 443 ? "" : `:${HTTPS_PORT}`;
const serviceUrl = `https://${DOMAIN}${suffix}`;

await fs.mkdir(path.join(CLI_HOME, "dotunnel"), { recursive: true });
await fs.writeFile(
  path.join(CLI_HOME, "dotunnel", "config.toml"),
  `[profiles.default]\nservice_url = "${serviceUrl}"\n`,
);
await fs.writeFile(
  path.join(CLI_HOME, "dotunnel", "credentials.toml"),
  `[profiles.default]\ntoken = "${CLI_TOKEN}"\n`,
  { mode: 0o600 },
);

console.log(`Seeded local D1 and CLI profile.

  relay      ${serviceUrl}
  tunnel     https://${SUBDOMAIN}.${DOMAIN}${suffix}
  cli home   ${CLI_HOME}`);
