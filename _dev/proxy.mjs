/**
 * TLS front door for local tunnel testing.
 *
 * Terminates HTTPS on :443 for `<domain>` and `*.<domain>` and forwards to the
 * `vite dev` server, preserving the Host header — which is the whole point,
 * since `tunnelProxy()` routes on `new URL(request.url).hostname` and
 * @cloudflare/vite-plugin builds that URL straight from Host (for HTTP via
 * `createRequestHandler`, for WebSockets via its `httpServer.on("upgrade")`
 * hook).
 *
 * Deliberately HTTP/1.1 only: `https.createServer` does not negotiate h2, so
 * every WebSocket is a plain Upgrade handshake with no RFC 8441 path to worry
 * about.
 */

import http from "node:http";
import https from "node:https";

import { ensureCert } from "./certs.mjs";
import { DOMAIN, HTTPS_PORT, TARGET_HOST, TARGET_PORT } from "./config.mjs";

const { key, cert } = await ensureCert();

function upstreamHeaders(req) {
  return {
    ...req.headers,
    // Host is passed through untouched — everything downstream routes on it.
    "x-forwarded-proto": "https",
    "x-forwarded-host": req.headers.host ?? "",
    "x-forwarded-for": req.socket.remoteAddress ?? "",
  };
}

/**
 * Replay an upstream response head onto a raw socket.
 * rawHeaders keeps casing and duplicates intact, which matters for
 * Sec-WebSocket-Accept on the 101.
 */
function writeHead(socket, res) {
  const lines = [`HTTP/1.1 ${res.statusCode} ${res.statusMessage}`];
  for (let i = 0; i < res.rawHeaders.length; i += 2) {
    lines.push(`${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]}`);
  }
  socket.write(`${lines.join("\r\n")}\r\n\r\n`);
}

function unreachable(err) {
  return (
    `dev proxy: cannot reach ${TARGET_HOST}:${TARGET_PORT} ` +
    `(${err.code ?? err.message}). Is \`yarn workspace dotunnel-cloudflare dev\` running?\n`
  );
}

const server = https.createServer({ key, cert }, (req, res) => {
  const upstream = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: req.method,
      path: req.url,
      headers: upstreamHeaders(req),
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
    }
    res.end(unreachable(err));
  });

  req.pipe(upstream);
});

// WebSocket (and any other Upgrade) traffic: the CLI's control connection to
// /_api/tunnel/connect, plus client sockets proxied through a tunnel.
server.on("upgrade", (req, clientSocket, head) => {
  clientSocket.on("error", () => clientSocket.destroy());

  const upstream = http.request({
    host: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path: req.url,
    headers: upstreamHeaders(req),
    // Upgraded sockets must not go back into the agent's connection pool.
    agent: false,
  });

  upstream.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    upstreamSocket.on("error", () => upstreamSocket.destroy());

    writeHead(clientSocket, upstreamRes);

    if (upstreamHead?.length) clientSocket.write(upstreamHead);
    if (head?.length) upstreamSocket.write(head);

    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });

  // Upstream answered without upgrading (e.g. 401/404) — relay and close.
  upstream.on("response", (upstreamRes) => {
    writeHead(clientSocket, upstreamRes);
    upstreamRes.pipe(clientSocket);
  });

  upstream.on("error", (err) => {
    clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n${unreachable(err)}`);
  });

  upstream.end();
});

server.on("error", (err) => {
  if (err.code === "EACCES") {
    console.error(
      `\nCannot bind :${HTTPS_PORT} — needs elevated rights.\n\n` +
        "  Linux:  sudo sysctl -w net.ipv4.ip_unprivileged_port_start=443\n" +
        "          (persist in /etc/sysctl.d/, then rerun as your user)\n" +
        "  macOS:  sudo -E yarn dev:proxy\n" +
        "          (cert is already issued, so root only binds the socket)\n",
    );
    process.exit(1);
  }
  if (err.code === "EADDRINUSE") {
    console.error(`\nPort ${HTTPS_PORT} is already in use.\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(HTTPS_PORT, () => {
  const suffix = HTTPS_PORT === 443 ? "" : `:${HTTPS_PORT}`;
  console.log(`dev proxy  ->  ${TARGET_HOST}:${TARGET_PORT}`);
  console.log(`  dashboard  https://${DOMAIN}${suffix}`);
  console.log(`  tunnels    https://<subdomain>.${DOMAIN}${suffix}`);
});
