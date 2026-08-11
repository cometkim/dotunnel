import * as path from "node:path";

export const REPO_DIR = path.join(import.meta.dirname, "..");

/**
 * Base domain for the local relay.
 *
 * The dashboard lives on the apex and tunnels live on the wildcard,
 * mirroring production (`dotunnel.io` + `*.dotunnel.io`).
 *
 * `.localhost` is RFC 6761 special-use:
 * - macOS (mDNSResponder)
 * - Linux (systemd-resolved, via `is_localhost()`)
 * Both resolve it to loopback with no configuration.
 */
export const DOMAIN = process.env.DOTUNNEL_DEV_DOMAIN ?? "dotunnel.localhost";

/** Port-less HTTPS. Binding this is the one step that needs elevated rights. */
export const HTTPS_PORT = Number(process.env.DOTUNNEL_DEV_HTTPS_PORT ?? 443);

/**
 * The `vite dev` server the proxy forwards to.
 *
 * Kept as the name rather than a literal address on purpose: Vite binds
 * whatever `localhost` resolves to, which is `::1` on macOS and commonly
 * `127.0.0.1` on Linux. Node's Happy Eyeballs tries both, so the same config
 * works on either.
 */
export const TARGET_HOST = "localhost";
export const TARGET_PORT = Number(process.env.DOTUNNEL_DEV_TARGET_PORT ?? 5173);

export const CERT_DIR = path.join(import.meta.dirname, ".certs");
export const CERT_PATH = path.join(CERT_DIR, "cert.pem");
export const KEY_PATH = path.join(CERT_DIR, "key.pem");

/** Isolated XDG_CONFIG_HOME so we never touch ~/.config/dotunnel. */
export const CLI_HOME = path.join(import.meta.dirname, ".home");

/**
 * Fixed local CLI token. `validateCliToken` only requires the `dt_` prefix and
 * a matching sha256 in the `sessions` table, so a constant is fine here and
 * keeps the seed reproducible. Local-only; never valid against a real relay.
 */
export const CLI_TOKEN = "dt_localdev";

/** Subdomain of the pre-seeded named tunnel: https://test.dotunnel.localhost */
export const SUBDOMAIN = process.env.DOTUNNEL_DEV_SUBDOMAIN ?? "test";
