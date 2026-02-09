#!/usr/bin/env node

/**
 * Local test server for stress tests.
 *
 * Endpoints:
 *   /              - health check
 *   /small         - 4 KB response
 *   /large         - 1 MB response
 *   /huge          - 10 MB response
 *   /size/:bytes   - arbitrary size response (e.g. /size/65536)
 *   /chunked/:n    - chunked transfer: n chunks of 16 KB, 5ms apart
 *   /slow/:ms      - 4 KB response delayed by :ms milliseconds
 */

import { createServer } from "node:http";

const PORT = parseInt(process.argv[2] || "18950", 10);

const SMALL_SIZE = 4 * 1024;
const LARGE_SIZE = 1 * 1024 * 1024;
const HUGE_SIZE = 10 * 1024 * 1024;
const CHUNK_SIZE = 16 * 1024;

// Pre-generate static bodies
const SMALL_BODY = Buffer.alloc(SMALL_SIZE, "B");
const LARGE_BODY = Buffer.alloc(LARGE_SIZE, "A");
const HUGE_BODY = Buffer.alloc(HUGE_SIZE, "H");
const CHUNK_BUF = Buffer.alloc(CHUNK_SIZE, "C");

let requestCount = 0;

const server = createServer((req, res) => {
  requestCount++;

  if (req.url === "/small") {
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": SMALL_SIZE.toString(),
    });
    res.end(SMALL_BODY);
    return;
  }

  if (req.url === "/large") {
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": LARGE_SIZE.toString(),
    });
    res.end(LARGE_BODY);
    return;
  }

  if (req.url === "/huge") {
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": HUGE_SIZE.toString(),
    });
    res.end(HUGE_BODY);
    return;
  }

  // /size/:bytes — arbitrary size
  const sizeMatch = req.url.match(/^\/size\/(\d+)$/);
  if (sizeMatch) {
    const bytes = parseInt(sizeMatch[1], 10);
    const body = Buffer.alloc(bytes, "X");
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": bytes.toString(),
    });
    res.end(body);
    return;
  }

  // /chunked/:n — n chunks of 16 KB, streamed with 5ms gaps
  const chunkedMatch = req.url.match(/^\/chunked\/(\d+)$/);
  if (chunkedMatch) {
    const numChunks = parseInt(chunkedMatch[1], 10);
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Transfer-Encoding": "chunked",
    });
    let sent = 0;
    const interval = setInterval(() => {
      if (sent >= numChunks) {
        clearInterval(interval);
        res.end();
        return;
      }
      res.write(CHUNK_BUF);
      sent++;
    }, 5);
    return;
  }

  // /slow/:ms — 4 KB response delayed by ms
  const slowMatch = req.url.match(/^\/slow\/(\d+)$/);
  if (slowMatch) {
    const delay = parseInt(slowMatch[1], 10);
    setTimeout(() => {
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": SMALL_SIZE.toString(),
      });
      res.end(SMALL_BODY);
    }, delay);
    return;
  }

  // health check
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
});

server.listen(PORT, () => {
  console.log(`Stress test server on :${PORT}`);
  console.log(`  /small          => ${SMALL_SIZE} bytes`);
  console.log(`  /large          => ${LARGE_SIZE} bytes`);
  console.log(`  /huge           => ${HUGE_SIZE} bytes`);
  console.log(`  /size/:bytes    => arbitrary`);
  console.log(`  /chunked/:n     => n * ${CHUNK_SIZE} bytes streamed`);
  console.log(`  /slow/:ms       => 4 KB after delay`);
});
