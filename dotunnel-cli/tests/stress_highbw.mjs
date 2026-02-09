#!/usr/bin/env node

/**
 * High-bandwidth stress test for dotunnel — designed to expose degradation
 * under sustained load and large file serving.
 *
 * Prerequisite: start the stress server first:
 *   node tests/stress_server.mjs 18950
 *
 * Then run the tunnel:
 *   cargo run -p dotunnel-cli -- tunnel --port 18950
 *
 * Usage:
 *   node tests/stress_highbw.mjs <tunnel-url>
 *
 * The test runs multiple phases and tracks whether latency/throughput
 * degrades over successive rounds (the "gets slower and slower" problem).
 */

import { performance } from "node:perf_hooks";

const TUNNEL_URL = process.argv[2];
if (!TUNNEL_URL) {
  console.error("Usage: node tests/stress_highbw.mjs <tunnel-url>");
  process.exit(1);
}

// ─── Helpers ────────────────────────────────────────────────────────

function fmtBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

function percentile(sorted, pct) {
  const idx = Math.floor(sorted.length * pct);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function timedFetch(url, signal) {
  const start = performance.now();
  const res = await fetch(url, { signal });
  const ttfb = performance.now() - start;
  const body = await res.arrayBuffer();
  const total = performance.now() - start;
  return {
    ok: res.status === 200,
    status: res.status,
    bodySize: body.byteLength,
    ttfb,
    total,
    throughputMBps: body.byteLength / 1024 / 1024 / (total / 1000),
  };
}

function summarize(results) {
  const ok = results.filter((r) => r.ok);
  const fail = results.length - ok.length;
  const ttfbs = ok.map((r) => r.ttfb).sort((a, b) => a - b);
  const totals = ok.map((r) => r.total).sort((a, b) => a - b);
  const tps = ok.map((r) => r.throughputMBps);
  const totalBytes = ok.reduce((s, r) => s + r.bodySize, 0);
  const wallStart = Math.min(...ok.map((r) => r.ttfb));
  const wallEnd = Math.max(...ok.map((r) => r.total));

  return {
    count: results.length,
    failures: fail,
    totalBytes,
    ttfb: {
      p50: percentile(ttfbs, 0.5),
      p95: percentile(ttfbs, 0.95),
      p99: percentile(ttfbs, 0.99),
      max: ttfbs[ttfbs.length - 1],
    },
    total: {
      p50: percentile(totals, 0.5),
      p95: percentile(totals, 0.95),
      p99: percentile(totals, 0.99),
      max: totals[totals.length - 1],
    },
    avgThroughput: tps.length ? tps.reduce((a, b) => a + b, 0) / tps.length : 0,
    // Aggregate throughput = total bytes / wall-clock duration of the slowest
    aggThroughputMBps: totalBytes / 1024 / 1024 / (wallEnd / 1000),
  };
}

function printSummary(label, stats) {
  console.log(`\n── ${label} ──`);
  console.log(`  Requests: ${stats.count}  (${stats.failures} failures)`);
  console.log(`  Total data: ${fmtBytes(stats.totalBytes)}`);
  console.log(
    `  TTFB:       p50=${fmtMs(stats.ttfb.p50)}  p95=${fmtMs(stats.ttfb.p95)}  p99=${fmtMs(stats.ttfb.p99)}  max=${fmtMs(stats.ttfb.max)}`,
  );
  console.log(
    `  Total time: p50=${fmtMs(stats.total.p50)}  p95=${fmtMs(stats.total.p95)}  p99=${fmtMs(stats.total.p99)}  max=${fmtMs(stats.total.max)}`,
  );
  console.log(
    `  Throughput: per-req avg=${stats.avgThroughput.toFixed(2)} MB/s  aggregate=${stats.aggThroughputMBps.toFixed(2)} MB/s`,
  );
}

// ─── Concurrency-limited runner ────────────────────────────────────

/**
 * Run `totalRequests` fetches with at most `concurrency` in-flight at once.
 * Returns results in completion order.
 */
async function runPool(url, totalRequests, concurrency, timeoutMs = 30000) {
  const results = [];
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < totalRequests) {
      const _idx = nextIdx++;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const r = await timedFetch(url, ac.signal);
        results.push(r);
      } catch (e) {
        results.push({
          ok: false,
          status: 0,
          bodySize: 0,
          ttfb: 0,
          total: 0,
          throughputMBps: 0,
          error: e.message,
        });
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, totalRequests) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ─── Test Phases ────────────────────────────────────────────────────

/**
 * Phase 1: Sustained large-file download — multiple rounds.
 * Detects whether throughput degrades over time.
 */
async function phaseSustainedLarge() {
  console.log("\n==========================================================");
  console.log(
    "PHASE 1: Sustained large-file download (1 MB x 50, 5 at a time)",
  );
  console.log("==========================================================");

  const ROUNDS = 5;
  const PER_ROUND = 10;
  const CONCURRENCY = 5;
  const roundStats = [];

  for (let r = 0; r < ROUNDS; r++) {
    const results = await runPool(
      `${TUNNEL_URL}/large`,
      PER_ROUND,
      CONCURRENCY,
    );
    const stats = summarize(results);
    roundStats.push(stats);
    printSummary(`Round ${r + 1}/${ROUNDS}`, stats);
  }

  // Degradation check
  const firstP50 = roundStats[0].total.p50;
  const lastP50 = roundStats[roundStats.length - 1].total.p50;
  const ratio = lastP50 / firstP50;
  console.log(
    `\n  Degradation: round1 p50=${fmtMs(firstP50)} -> round${ROUNDS} p50=${fmtMs(lastP50)}  (${ratio.toFixed(2)}x)`,
  );
  if (ratio > 1.5) {
    console.log(
      "  *** DEGRADATION DETECTED — latency grew >1.5x over rounds ***",
    );
  }
}

/**
 * Phase 2: Huge files (10 MB) — saturate the write channel.
 */
async function phaseHugeFiles() {
  console.log("\n==========================================================");
  console.log("PHASE 2: Huge file downloads (10 MB x 10, 3 at a time)");
  console.log("==========================================================");

  const results = await runPool(`${TUNNEL_URL}/huge`, 10, 3, 60000);
  printSummary("10 MB downloads", summarize(results));
}

/**
 * Phase 3: Head-of-line blocking — large files saturating the channel
 * while small requests try to squeeze through.
 */
async function phaseHeadOfLine() {
  console.log("\n==========================================================");
  console.log("PHASE 3: Head-of-line blocking (3x 10MB + 30x 4KB concurrent)");
  console.log("==========================================================");

  const [largeResults, smallResults] = await Promise.all([
    runPool(`${TUNNEL_URL}/huge`, 3, 3, 60000),
    runPool(`${TUNNEL_URL}/small`, 30, 10, 30000),
  ]);

  printSummary("Huge files (10 MB)", summarize(largeResults));
  printSummary(
    "Small files (4 KB, while huge are in flight)",
    summarize(smallResults),
  );
}

/**
 * Phase 4: Ramp-up concurrency — increase concurrent requests each round.
 * Shows at what concurrency level the tunnel breaks down.
 */
async function phaseRampUp() {
  console.log("\n==========================================================");
  console.log("PHASE 4: Ramp-up concurrency (1 MB, increasing concurrency)");
  console.log("==========================================================");

  const levels = [1, 2, 5, 10, 20];
  for (const c of levels) {
    const results = await runPool(`${TUNNEL_URL}/large`, c * 2, c);
    printSummary(`Concurrency ${c} (${c * 2} requests)`, summarize(results));
  }
}

/**
 * Phase 5: Sustained high-concurrency small requests — exposes per-request
 * overhead accumulation.
 */
async function phaseSustainedSmall() {
  console.log("\n==========================================================");
  console.log(
    "PHASE 5: Sustained small-request storm (4 KB x 200, 20 at a time)",
  );
  console.log("==========================================================");

  const ROUNDS = 4;
  const PER_ROUND = 50;
  const CONCURRENCY = 20;
  const roundStats = [];

  for (let r = 0; r < ROUNDS; r++) {
    const results = await runPool(
      `${TUNNEL_URL}/small`,
      PER_ROUND,
      CONCURRENCY,
    );
    const stats = summarize(results);
    roundStats.push(stats);
    printSummary(`Round ${r + 1}/${ROUNDS}`, stats);
  }

  const firstP50 = roundStats[0].ttfb.p50;
  const lastP50 = roundStats[roundStats.length - 1].ttfb.p50;
  const ratio = lastP50 / firstP50;
  console.log(
    `\n  Degradation: round1 TTFB p50=${fmtMs(firstP50)} -> round${ROUNDS} TTFB p50=${fmtMs(lastP50)}  (${ratio.toFixed(2)}x)`,
  );
  if (ratio > 1.5) {
    console.log("  *** DEGRADATION DETECTED — TTFB grew >1.5x over rounds ***");
  }
}

/**
 * Phase 6: Chunked streaming under load — simulates SSE / HMR alongside
 * normal requests.
 */
async function phaseChunkedUnderLoad() {
  console.log("\n==========================================================");
  console.log("PHASE 6: Chunked streaming + concurrent small requests");
  console.log("==========================================================");

  // Start 2 long-running chunked streams (64 chunks = 1 MB each, ~320ms)
  const chunkedPromise = runPool(`${TUNNEL_URL}/chunked/64`, 2, 2, 30000);

  // Fire small requests while the streams are running
  const smallPromise = runPool(`${TUNNEL_URL}/small`, 30, 10, 15000);

  const [chunkedResults, smallResults] = await Promise.all([
    chunkedPromise,
    smallPromise,
  ]);

  printSummary("Chunked streams (64 x 16KB)", summarize(chunkedResults));
  printSummary(
    "Small requests (concurrent with streams)",
    summarize(smallResults),
  );
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("==========================================================");
  console.log("  dotunnel High-Bandwidth Stress Test");
  console.log("==========================================================");
  console.log(`Tunnel: ${TUNNEL_URL}`);
  console.log(`Time:   ${new Date().toISOString()}`);

  // Warmup
  console.log("\nWarming up...");
  try {
    await timedFetch(`${TUNNEL_URL}/small`);
    await timedFetch(`${TUNNEL_URL}/small`);
  } catch {
    console.error("Cannot reach tunnel. Is it running?");
    process.exit(1);
  }

  await phaseSustainedLarge();
  await phaseHugeFiles();
  await phaseHeadOfLine();
  await phaseRampUp();
  await phaseSustainedSmall();
  await phaseChunkedUnderLoad();

  console.log("\n==========================================================");
  console.log("  All phases complete.");
  console.log("==========================================================\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
