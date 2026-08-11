/**
 * Issue a locally-trusted TLS certificate for the dev relay domain.
 *
 * devcert's CSR template already emits `DNS.1 = <domain>` and
 * `DNS.2 = *.<domain>`, so one call covers both the dashboard apex and every
 * tunnel subdomain. The root CA is installed into the OS trust store (and NSS,
 * for Firefox) on first run, which is what makes the sudo prompt appear.
 *
 * The cert is exported to `dev/.certs/` so that `proxy.mjs` — which may run
 * with elevated rights to bind :443 — can read it without re-running devcert
 * as root and stashing a second CA in root's config directory.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import devcert from "@expo/devcert";

import { CERT_DIR, CERT_PATH, DOMAIN, KEY_PATH } from "./config.mjs";

/** Returns PEM buffers for the dev domain, issuing them on first call. */
export async function ensureCert() {
  if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) {
    return {
      cert: await fs.readFile(CERT_PATH),
      key: await fs.readFile(KEY_PATH),
    };
  }

  if (process.getuid?.() === 0) {
    throw new Error(
      "Refusing to issue a certificate as root — the CA would land in root's " +
        "config dir and your user would not trust it.\n" +
        "Run `yarn dev:cert` as yourself first, then start the proxy.",
    );
  }

  console.log(`Issuing certificate for ${DOMAIN} and *.${DOMAIN}`);
  console.log("devcert will ask for your password to trust its root CA.\n");

  // skipHostsFile: `.localhost` already resolves to loopback on macOS and
  // Linux, so there is nothing to add to /etc/hosts.
  const { key, cert } = await devcert.certificateFor(DOMAIN, {
    skipHostsFile: true,
  });

  await fs.mkdir(CERT_DIR, { recursive: true });
  await fs.writeFile(CERT_PATH, cert);
  await fs.writeFile(KEY_PATH, key, { mode: 0o600 });

  return { key, cert };
}

if (import.meta.filename === process.argv[1]) {
  await ensureCert();
  console.log(`\nCertificate written to ${CERT_DIR}`);
}
