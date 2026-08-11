# Local relay for tunnel testing

Runs the whole product locally: dashboard on `https://dotunnel.localhost`,
tunnels on `https://<subdomain>.dotunnel.localhost`. Real port-less URLs, real
TLS, no cloud account, no OAuth app.

```
browser / curl ──TLS:443──> _dev/proxy.mjs ──HTTP:5173──> vite dev (worker + DO)
                                                              │  WebSocket
   dotunnel CLI ──────────────────────────────────────────────┘
        └── HTTP ──> your local server
```

## One-time, per machine

```sh
cargo build -p dotunnel-cli   # the CLI under test
yarn dev:cert                 # issue + trust the wildcard cert (asks for your password)
yarn dev:seed                 # seed local D1 and an isolated CLI profile
```

`yarn dev:cert` runs [`@expo/devcert`], whose CSR template emits both
`DNS.1 = dotunnel.localhost` and `DNS.2 = *.dotunnel.localhost`, so one cert
covers the dashboard and every tunnel. It installs a root CA into the OS trust
store (and NSS, for Firefox) — that is what the password prompt is for. The
issued pair is exported to `_dev/.certs/` so the proxy can read it without
re-running devcert as root.

> **devcert 1.2.1 is patched**: See https://github.com/expo/devcert/pull/9

Then let the proxy bind :443:

- **Linux** — `sudo sysctl -w net.ipv4.ip_unprivileged_port_start=443`, persisted
  in `/etc/sysctl.d/`. Preferred: no `setcap` on the Node binary (which a
  version manager would invalidate on every upgrade) and no running Node as root.
- **macOS** — no such knob; use `sudo -E yarn dev:proxy`. The cert already
  exists at that point, so root only binds the socket.

## Every session

```sh
yarn workspace dotunnel-cloudflare dev   # :5173
yarn dev:proxy                           # :443  (sudo -E on macOS)

python3 -m http.server 8000              # whatever you want to expose
./_dev/dotunnel tunnel --port 8000 --subdomain test
```

`https://test.dotunnel.localhost` is now live. Drop `--subdomain` to exercise
the ephemeral path instead, which generates a random subdomain.

`./_dev/dotunnel` is a wrapper that sets `XDG_CONFIG_HOME` to `_dev/.home`, so
your real credentials in `~/.config/dotunnel` are never read or written.

## What the seed does

Skips the bootstrap wizard and the device flow, neither of which is interesting
when the tunnel data path is what you're testing, and both of which need a real
OAuth app. It writes:

- a `settings` config row with `service.host = dotunnel.localhost` and
  `tunnel.hostPattern = *.dotunnel.localhost`
- a user, plus a `sessions` row with `type = 'cli'` and `token_hash =
  sha256('dt_localdev')` — `validateCliToken()` needs nothing else
- a named `test` tunnel, so the URL is stable across restarts
- `_dev/.home/dotunnel/{config,credentials}.toml`

Re-run `yarn dev:seed` any time; every statement is idempotent.

## Gotchas

- **Vite shadows some paths, even on tunnel hosts.** `/@vite/*`, `/src/*`,
  `/node_modules/*` and anything in `dotunnel-cloudflare/public/` are answered
  by Vite's own middlewares before the worker runs. If your test origin serves
  those paths, they will not tunnel.
- **Up to 10s of stale `502`** after the CLI connects — `TUNNEL_CACHE_TTL_MS` in
  `middlewares/tunnel-proxy.ts` caches the `offline` row.
- **A rejected WebSocket upgrade looks like `502`, not `401`.** When the worker
  declines an upgrade, @cloudflare/vite-plugin does `socket.destroy()` without
  writing a response, so the proxy only sees a dead upstream. Hitting :5173
  directly returns an empty response for the same case. Dev-only artifact — in
  production the status comes back intact.
- **HTTP/1.1 only.** `https.createServer` does not negotiate h2, so every
  WebSocket is a plain Upgrade with no RFC 8441 path involved. Fine for dev, and
  closer to what the tunnel itself speaks.
- **Changing the domain**: set `DOTUNNEL_DEV_DOMAIN`, then re-run `yarn dev:cert`
  and `yarn dev:seed`. Stick to something under `.localhost` unless you also
  want to run a resolver.

[`@expo/devcert`]: https://github.com/expo/devcert
