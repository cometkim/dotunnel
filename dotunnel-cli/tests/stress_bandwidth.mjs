#!/usr/bin/env node

/**
 * Stress test for dotunnel CLI tunnel bandwidth and concurrency.
 *
 * Usage:
 *   node tests/stress_bandwidth.mjs <tunnel-url>
 *
 * Starts a local HTTP server that serves large files, then hammers
 * the tunnel with concurrent requests measuring throughput and latency.
 */

import { createServer } from "node:http";
import { performance } from "node:perf_hooks";

const TUNNEL_URL = process.argv[2];
if (!TUNNEL_URL) {
  console.error("Usage: node tests/stress_bandwidth.mjs <tunnel-url>");
  process.exit(1);
}

// ─── Test Parameters ────────────────────────────────────────────────
const LARGE_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
const SMALL_FILE_SIZE = 4 * 1024; // 4 KB
const CONCURRENT_LARGE = 5;
const CONCURRENT_SMALL = 20;
const SEQUENTIAL_LARGE = 10;

// Pre-generate test data
const LARGE_BODY = Buffer.alloc(LARGE_FILE_SIZE, "A");
const SMALL_BODY = Buffer.alloc(SMALL_FILE_SIZE, "B");

// ─── Helpers ────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

async function timedFetch(url) {
  const start = performance.now();
  const res = await fetch(url);
  const headerTime = performance.now() - start;

  const body = await res.arrayBuffer();
  const totalTime = performance.now() - start;

  return {
    status: res.status,
    bodySize: body.byteLength,
    headerTime,
    totalTime,
    throughputMBps: body.byteLength / 1024 / 1024 / (totalTime / 1000),
  };
}

function printStats(label, results) {
  const times = results.map((r) => r.totalTime).sort((a, b) => a - b);
  const headerTimes = results.map((r) => r.headerTime).sort((a, b) => a - b);
  const throughputs = results.map((r) => r.throughputMBps);
  const totalBytes = results.reduce((sum, r) => sum + r.bodySize, 0);
  const failures = results.filter((r) => r.status !== 200);

  const p = (arr, pct) =>
    arr[Math.floor(arr.length * pct)] ?? arr[arr.length - 1];

  console.log(`\n── ${label} ──`);
  console.log(`  Requests:   ${results.length} (${failures.length} failures)`);
  console.log(`  Total data: ${formatBytes(totalBytes)}`);
  console.log(
    `  TTFB:       p50=${formatMs(p(headerTimes, 0.5))}  p95=${formatMs(p(headerTimes, 0.95))}  p99=${formatMs(p(headerTimes, 0.99))}`,
  );
  console.log(
    `  Total time: p50=${formatMs(p(times, 0.5))}  p95=${formatMs(p(times, 0.95))}  p99=${formatMs(p(times, 0.99))}`,
  );
  console.log(
    `  Throughput: avg=${(throughputs.reduce((a, b) => a + b, 0) / throughputs.length).toFixed(2)} MB/s`,
  );
}

// ─── Test Runner ────────────────────────────────────────────────────

async function runTest(name, url, concurrency) {
  const results = await Promise.all(
    Array.from({ length: concurrency }, () =>
      timedFetch(url).catch((e) => ({
        status: 0,
        bodySize: 0,
        headerTime: 0,
        totalTime: 0,
        throughputMBps: 0,
        error: e.message,
      })),
    ),
  );
  printStats(name, results);
  return results;
}

async function runSequentialTest(name, url, count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      results.push(await timedFetch(url));
    } catch (e) {
      results.push({
        status: 0,
        bodySize: 0,
        headerTime: 0,
        totalTime: 0,
        throughputMBps: 0,
        error: e.message,
      });
    }
  }
  printStats(name, results);
  return results;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("=== dotunnel Bandwidth Stress Test ===");
  console.log(`Tunnel URL: ${TUNNEL_URL}`);
  console.log();

  // 1. Warmup
  console.log("Warming up...");
  try {
    await timedFetch(`${TUNNEL_URL}/small`);
  } catch {
    console.error("Failed to reach tunnel. Is it running?");
    process.exit(1);
  }

  // 2. Sequential large file downloads
  console.log(
    `\n[Test 1] Sequential large file downloads (${SEQUENTIAL_LARGE}x ${formatBytes(LARGE_FILE_SIZE)})`,
  );
  await runSequentialTest(
    `Sequential ${formatBytes(LARGE_FILE_SIZE)}`,
    `${TUNNEL_URL}/large`,
    SEQUENTIAL_LARGE,
  );

  // 3. Concurrent large file downloads
  console.log(
    `\n[Test 2] Concurrent large file downloads (${CONCURRENT_LARGE}x ${formatBytes(LARGE_FILE_SIZE)})`,
  );
  await runTest(
    `${CONCURRENT_LARGE} concurrent ${formatBytes(LARGE_FILE_SIZE)}`,
    `${TUNNEL_URL}/large`,
    CONCURRENT_LARGE,
  );

  // 4. Concurrent small requests
  console.log(
    `\n[Test 3] Concurrent small requests (${CONCURRENT_SMALL}x ${formatBytes(SMALL_FILE_SIZE)})`,
  );
  await runTest(
    `${CONCURRENT_SMALL} concurrent ${formatBytes(SMALL_FILE_SIZE)}`,
    `${TUNNEL_URL}/small`,
    CONCURRENT_SMALL,
  );

  // 5. Mixed workload: large + small concurrent
  console.log(
    `\n[Test 4] Mixed workload: ${CONCURRENT_LARGE} large + ${CONCURRENT_SMALL} small concurrent`,
  );
  const mixedResults = await Promise.all([
    ...Array.from({ length: CONCURRENT_LARGE }, () =>
      timedFetch(`${TUNNEL_URL}/large`)
        .catch((e) => ({
          status: 0,
          bodySize: 0,
          headerTime: 0,
          totalTime: 0,
          throughputMBps: 0,
          error: e.message,
          type: "large",
        }))
        .then((r) => ({ ...r, type: "large" })),
    ),
    ...Array.from({ length: CONCURRENT_SMALL }, () =>
      timedFetch(`${TUNNEL_URL}/small`)
        .catch((e) => ({
          status: 0,
          bodySize: 0,
          headerTime: 0,
          totalTime: 0,
          throughputMBps: 0,
          error: e.message,
          type: "small",
        }))
        .then((r) => ({ ...r, type: "small" })),
    ),
  ]);

  const largeMixed = mixedResults.filter((r) => r.type === "large");
  const smallMixed = mixedResults.filter((r) => r.type === "small");
  printStats("Mixed - large files", largeMixed);
  printStats("Mixed - small files", smallMixed);

  // 6. Sustained burst: 3 waves of concurrent requests
  console.log(
    `\n[Test 5] Sustained burst: 3 waves of ${CONCURRENT_SMALL} small requests`,
  );
  const allWaveResults = [];
  for (let wave = 1; wave <= 3; wave++) {
    const waveResults = await Promise.all(
      Array.from({ length: CONCURRENT_SMALL }, () =>
        timedFetch(`${TUNNEL_URL}/small`).catch((e) => ({
          status: 0,
          bodySize: 0,
          headerTime: 0,
          totalTime: 0,
          throughputMBps: 0,
          error: e.message,
        })),
      ),
    );
    printStats(`Wave ${wave}`, waveResults);
    allWaveResults.push(...waveResults);
  }

  console.log("\n=== Test Complete ===\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
