#!/usr/bin/env node

/**
 * Browser-like stress test for dotunnel.
 *
 * Simulates realistic browser behavior:
 *   - 6 parallel connections per origin (HTTP/1.1 browser limit)
 *   - Page loads with cascading resource requests (HTML -> CSS/JS -> images -> API)
 *   - Rapid SPA navigations firing overlapping request bursts
 *   - HMR/SSE long-poll running while normal requests happen
 *   - Mixed sizes reflecting real web assets
 *
 * Prerequisite: start the stress server first:
 *   node tests/stress_server.mjs 18950
 *
 * Usage:
 *   node tests/stress_browser.mjs <tunnel-url>
 */

import { performance } from "node:perf_hooks";

const TUNNEL_URL = process.argv[2];
if (!TUNNEL_URL) {
  console.error("Usage: node tests/stress_browser.mjs <tunnel-url>");
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
  if (!sorted.length) return 0;
  const idx = Math.floor(sorted.length * pct);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function timedFetch(url, label, signal) {
  const start = performance.now();
  const res = await fetch(url, { signal });
  const ttfb = performance.now() - start;
  const body = await res.arrayBuffer();
  const total = performance.now() - start;
  return {
    label,
    ok: res.status === 200,
    status: res.status,
    bodySize: body.byteLength,
    ttfb,
    total,
  };
}

function summarize(label, results) {
  const ok = results.filter((r) => r.ok);
  const fail = results.length - ok.length;
  const ttfbs = ok.map((r) => r.ttfb).sort((a, b) => a - b);
  const totals = ok.map((r) => r.total).sort((a, b) => a - b);
  const totalBytes = ok.reduce((s, r) => s + r.bodySize, 0);

  return {
    label,
    count: results.length,
    failures: fail,
    totalBytes,
    ttfb: {
      p50: percentile(ttfbs, 0.5),
      p95: percentile(ttfbs, 0.95),
      max: ttfbs[ttfbs.length - 1] ?? 0,
    },
    total: {
      p50: percentile(totals, 0.5),
      p95: percentile(totals, 0.95),
      max: totals[totals.length - 1] ?? 0,
    },
  };
}

function printSummary(stats) {
  console.log(`\n── ${stats.label} ──`);
  console.log(
    `  Requests: ${stats.count}  (${stats.failures} failures)  Data: ${fmtBytes(stats.totalBytes)}`,
  );
  console.log(
    `  TTFB:  p50=${fmtMs(stats.ttfb.p50)}  p95=${fmtMs(stats.ttfb.p95)}  max=${fmtMs(stats.ttfb.max)}`,
  );
  console.log(
    `  Total: p50=${fmtMs(stats.total.p50)}  p95=${fmtMs(stats.total.p95)}  max=${fmtMs(stats.total.max)}`,
  );
}

/**
 * Run fetches through a connection pool of size `slots`.
 * Each fetch occupies a slot until complete, like a browser connection.
 */
async function browserPool(requests, slots = 6, timeoutMs = 30000) {
  const results = [];
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < requests.length) {
      const req = requests[nextIdx++];

      // Stagger delay — simulates the browser discovering resources over time
      if (req.delay) {
        await new Promise((r) => setTimeout(r, req.delay));
      }

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const r = await timedFetch(req.url, req.label, ac.signal);
        results.push(r);
      } catch (e) {
        results.push({
          label: req.label,
          ok: false,
          status: 0,
          bodySize: 0,
          ttfb: 0,
          total: 0,
          error: e.message,
        });
      } finally {
        clearTimeout(timer);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(slots, requests.length) }, () => worker()),
  );
  return results;
}

// ─── Typical Web Asset Sizes ────────────────────────────────────────
// Simulated via /size/:bytes on the stress server.

const ASSET = {
  html: { size: 15000, label: "html" }, // 15 KB HTML document
  css: { size: 45000, label: "css" }, // 45 KB CSS bundle
  jsSmall: { size: 30000, label: "js-small" }, // 30 KB JS chunk
  jsLarge: { size: 350000, label: "js-large" }, // 350 KB JS bundle
  jsVendor: { size: 800000, label: "js-vendor" }, // 800 KB vendor bundle
  font: { size: 50000, label: "font" }, // 50 KB WOFF2
  imgSmall: { size: 8000, label: "img-small" }, // 8 KB icon/thumbnail
  imgMedium: { size: 80000, label: "img-medium" }, // 80 KB hero image
  imgLarge: { size: 500000, label: "img-large" }, // 500 KB photo
  apiJson: { size: 2000, label: "api-json" }, // 2 KB JSON API response
  favicon: { size: 1500, label: "favicon" }, // 1.5 KB favicon
};

function assetUrl(asset, delay = 0) {
  return { url: `${TUNNEL_URL}/size/${asset.size}`, label: asset.label, delay };
}

// ─── Test Scenarios ─────────────────────────────────────────────────

/**
 * Scenario 1: Initial page load.
 * Browser discovers resources in cascading order:
 *   t=0    HTML document
 *   t=0    favicon
 *   t~50   CSS + JS (found in HTML <head>)
 *   t~100  fonts (discovered from CSS @font-face)
 *   t~100  images (discovered from HTML <img>)
 *   t~150  lazy JS chunks (dynamic imports)
 */
async function scenarioPageLoad() {
  console.log("\n==========================================================");
  console.log("SCENARIO 1: Initial page load (cascading resource discovery)");
  console.log("==========================================================");

  const requests = [
    // Immediate
    assetUrl(ASSET.html, 0),
    assetUrl(ASSET.favicon, 0),

    // After HTML parsed (~50ms)
    assetUrl(ASSET.css, 50),
    assetUrl(ASSET.jsVendor, 50),
    assetUrl(ASSET.jsLarge, 50),
    assetUrl(ASSET.jsSmall, 50),
    assetUrl(ASSET.jsSmall, 50),

    // After CSS parsed (~100ms)
    assetUrl(ASSET.font, 100),
    assetUrl(ASSET.font, 100),

    // Images from HTML
    assetUrl(ASSET.imgLarge, 100),
    assetUrl(ASSET.imgMedium, 100),
    assetUrl(ASSET.imgMedium, 100),
    assetUrl(ASSET.imgSmall, 100),
    assetUrl(ASSET.imgSmall, 100),
    assetUrl(ASSET.imgSmall, 100),

    // Lazy-loaded JS chunks (~150ms)
    assetUrl(ASSET.jsSmall, 150),
    assetUrl(ASSET.jsSmall, 150),

    // API calls from app init (~200ms)
    assetUrl(ASSET.apiJson, 200),
    assetUrl(ASSET.apiJson, 200),
    assetUrl(ASSET.apiJson, 200),
  ];

  const wallStart = performance.now();
  const results = await browserPool(requests, 6);
  const wallTime = performance.now() - wallStart;

  // Group by asset type
  const byLabel = new Map();
  for (const r of results) {
    if (!byLabel.has(r.label)) byLabel.set(r.label, []);
    byLabel.get(r.label).push(r);
  }

  const allStats = summarize("All resources", results);
  printSummary(allStats);

  // Per-type breakdown
  for (const [label, group] of byLabel) {
    const s = summarize(label, group);
    const ttfbs = group
      .filter((r) => r.ok)
      .map((r) => r.ttfb)
      .sort((a, b) => a - b);
    console.log(
      `    ${label.padEnd(12)} x${group.length}  TTFB p50=${fmtMs(percentile(ttfbs, 0.5))}  max=${fmtMs(ttfbs[ttfbs.length - 1] ?? 0)}`,
    );
  }

  console.log(`\n  Wall-clock page load: ${fmtMs(wallTime)}`);
}

/**
 * Scenario 2: Rapid SPA navigations.
 * User clicks through 5 pages quickly (~500ms apart). Each "navigation"
 * fires a burst of 6-10 requests (API + lazy chunks + images).
 * Requests from previous navigation may still be in flight.
 */
async function scenarioSPANavigation() {
  console.log("\n==========================================================");
  console.log("SCENARIO 2: Rapid SPA navigations (5 pages, 500ms apart)");
  console.log("==========================================================");

  const pages = 5;
  const allResults = [];
  const pageStats = [];

  // Fire all navigations concurrently but staggered
  const requests = [];
  for (let p = 0; p < pages; p++) {
    const baseDelay = p * 500;
    // Each navigation: 1 API route + 2 JS chunks + 3 images + 2 API data
    requests.push(
      assetUrl(ASSET.apiJson, baseDelay), // route data
      assetUrl(ASSET.jsSmall, baseDelay), // lazy chunk
      assetUrl(ASSET.jsSmall, baseDelay + 10), // lazy chunk
      assetUrl(ASSET.imgMedium, baseDelay + 20), // hero image
      assetUrl(ASSET.imgSmall, baseDelay + 20), // thumbnail
      assetUrl(ASSET.imgSmall, baseDelay + 20), // thumbnail
      assetUrl(ASSET.apiJson, baseDelay + 50), // data fetch
      assetUrl(ASSET.apiJson, baseDelay + 50), // data fetch
    );
  }

  const wallStart = performance.now();
  const results = await browserPool(requests, 6, 30000);
  const wallTime = performance.now() - wallStart;

  printSummary(
    summarize(
      `All ${pages} navigations (${requests.length} requests)`,
      results,
    ),
  );
  console.log(`\n  Wall-clock for all navigations: ${fmtMs(wallTime)}`);

  // Check if later navigations are slower
  // Rough heuristic: group by delay buckets
  for (let p = 0; p < pages; p++) {
    const start = p * 8;
    const end = start + 8;
    const pageResults = results.slice(start, end);
    const s = summarize(`Navigation ${p + 1}`, pageResults);
    pageStats.push(s);
    console.log(
      `    Nav ${p + 1}: TTFB p50=${fmtMs(s.ttfb.p50)}  max=${fmtMs(s.ttfb.max)}  Total p50=${fmtMs(s.total.p50)}`,
    );
  }

  if (pageStats.length >= 2) {
    const firstTTFB = pageStats[0].ttfb.p50;
    const lastTTFB = pageStats[pageStats.length - 1].ttfb.p50;
    if (firstTTFB > 0) {
      const ratio = lastTTFB / firstTTFB;
      console.log(
        `\n  Nav degradation: first p50=${fmtMs(firstTTFB)} -> last p50=${fmtMs(lastTTFB)}  (${ratio.toFixed(2)}x)`,
      );
    }
  }
}

/**
 * Scenario 3: Dev server with HMR.
 * An SSE/long-poll connection stays open while the dev repeatedly saves
 * files, triggering hot reloads (JS chunk re-fetches).
 *
 * Uses /chunked/200 (~1s stream) as the HMR-like connection, while
 * firing periodic bursts of JS/CSS re-fetches.
 */
async function scenarioDevHMR() {
  console.log("\n==========================================================");
  console.log("SCENARIO 3: Dev server with HMR (long-poll + reload bursts)");
  console.log("==========================================================");

  const HMR_CHUNKS = 200; // ~1 second of streaming
  const SAVE_INTERVAL_MS = 800;
  const SAVES = 5;

  // Start the HMR-like stream
  const hmrPromise = (async () => {
    const start = performance.now();
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 15000);
      const res = await fetch(`${TUNNEL_URL}/chunked/${HMR_CHUNKS}`, {
        signal: ac.signal,
      });
      const ttfb = performance.now() - start;
      const body = await res.arrayBuffer();
      const total = performance.now() - start;
      clearTimeout(timer);
      return {
        label: "hmr-stream",
        ok: res.status === 200,
        status: res.status,
        bodySize: body.byteLength,
        ttfb,
        total,
      };
    } catch (e) {
      return {
        label: "hmr-stream",
        ok: false,
        status: 0,
        bodySize: 0,
        ttfb: 0,
        total: 0,
      };
    }
  })();

  // Simulate file saves with reload bursts
  const reloadResults = [];
  for (let s = 0; s < SAVES; s++) {
    await new Promise((r) => setTimeout(r, SAVE_INTERVAL_MS));

    // Each save: re-fetch 2-3 JS chunks + 1 CSS (the changed modules)
    const burst = [
      {
        url: `${TUNNEL_URL}/size/${ASSET.jsSmall.size}`,
        label: `save${s + 1}-js`,
        delay: 0,
      },
      {
        url: `${TUNNEL_URL}/size/${ASSET.jsSmall.size}`,
        label: `save${s + 1}-js`,
        delay: 0,
      },
      {
        url: `${TUNNEL_URL}/size/${ASSET.css.size}`,
        label: `save${s + 1}-css`,
        delay: 0,
      },
    ];
    const burstResults = await browserPool(burst, 6, 10000);
    reloadResults.push(...burstResults);

    const s2 = summarize(`Save ${s + 1}`, burstResults);
    console.log(
      `    Save ${s + 1}: TTFB p50=${fmtMs(s2.ttfb.p50)}  max=${fmtMs(s2.ttfb.max)}  (${burstResults.filter((r) => r.ok).length}/${burstResults.length} ok)`,
    );
  }

  const hmrResult = await hmrPromise;
  console.log(
    `\n  HMR stream: ${hmrResult.ok ? "OK" : "FAIL"}  TTFB=${fmtMs(hmrResult.ttfb)}  Total=${fmtMs(hmrResult.total)}  Size=${fmtBytes(hmrResult.bodySize)}`,
  );

  printSummary(summarize("All reload fetches", reloadResults));
}

/**
 * Scenario 4: Dashboard with polling.
 * Simulates a dashboard that polls 4 API endpoints every 2 seconds,
 * while also having periodic image/chart refreshes.
 * Runs for 10 seconds to detect degradation.
 */
async function scenarioDashboardPolling() {
  console.log("\n==========================================================");
  console.log("SCENARIO 4: Dashboard polling (4 APIs every 2s for 10s)");
  console.log("==========================================================");

  const DURATION_MS = 10000;
  const POLL_INTERVAL = 2000;
  const POLLS = Math.floor(DURATION_MS / POLL_INTERVAL);
  const pollResults = [];

  for (let p = 0; p < POLLS; p++) {
    const pollStart = performance.now();

    // 4 API calls + 1 chart image refresh
    const requests = [
      {
        url: `${TUNNEL_URL}/size/${ASSET.apiJson.size}`,
        label: "api-1",
        delay: 0,
      },
      {
        url: `${TUNNEL_URL}/size/${ASSET.apiJson.size}`,
        label: "api-2",
        delay: 0,
      },
      {
        url: `${TUNNEL_URL}/size/${ASSET.apiJson.size}`,
        label: "api-3",
        delay: 0,
      },
      {
        url: `${TUNNEL_URL}/size/${ASSET.apiJson.size}`,
        label: "api-4",
        delay: 0,
      },
      {
        url: `${TUNNEL_URL}/size/${ASSET.imgMedium.size}`,
        label: "chart",
        delay: 0,
      },
    ];

    const results = await browserPool(requests, 6, 10000);
    const stats = summarize(`Poll ${p + 1}`, results);
    pollResults.push(stats);

    console.log(
      `    Poll ${p + 1}/${POLLS}: TTFB p50=${fmtMs(stats.ttfb.p50)}  max=${fmtMs(stats.ttfb.max)}  fail=${stats.failures}`,
    );

    // Wait remainder of interval
    const elapsed = performance.now() - pollStart;
    const remaining = POLL_INTERVAL - elapsed;
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
  }

  if (pollResults.length >= 2) {
    const firstP50 = pollResults[0].ttfb.p50;
    const lastP50 = pollResults[pollResults.length - 1].ttfb.p50;
    if (firstP50 > 0) {
      const ratio = lastP50 / firstP50;
      console.log(
        `\n  Poll degradation: first p50=${fmtMs(firstP50)} -> last p50=${fmtMs(lastP50)}  (${ratio.toFixed(2)}x)`,
      );
    }
  }
}

/**
 * Scenario 5: Asset-heavy page with many images.
 * Simulates a gallery or e-commerce page with 30+ images of varying
 * sizes, loaded alongside the page shell.
 */
async function scenarioImageHeavy() {
  console.log("\n==========================================================");
  console.log("SCENARIO 5: Image-heavy page (40 images + page shell)");
  console.log("==========================================================");

  const requests = [
    // Page shell
    assetUrl(ASSET.html, 0),
    assetUrl(ASSET.css, 20),
    assetUrl(ASSET.jsLarge, 20),
    assetUrl(ASSET.jsVendor, 20),

    // 40 images discovered after HTML parse
    ...Array.from({ length: 6 }, (_, i) =>
      assetUrl(ASSET.imgLarge, 80 + i * 5),
    ),
    ...Array.from({ length: 12 }, (_, i) =>
      assetUrl(ASSET.imgMedium, 80 + i * 3),
    ),
    ...Array.from({ length: 22 }, (_, i) =>
      assetUrl(ASSET.imgSmall, 80 + i * 2),
    ),
  ];

  const wallStart = performance.now();
  const results = await browserPool(requests, 6, 60000);
  const wallTime = performance.now() - wallStart;

  printSummary(summarize("All resources", results));

  // Break down by type
  const imgs = results.filter((r) => r.label.startsWith("img-"));
  const nonImgs = results.filter((r) => !r.label.startsWith("img-"));
  printSummary(summarize("Page shell (HTML+CSS+JS)", nonImgs));
  printSummary(summarize("Images (40 total)", imgs));

  console.log(`\n  Wall-clock load: ${fmtMs(wallTime)}`);
}

/**
 * Scenario 6: Sustained page loads.
 * Simulates a user loading 10 full pages one after another (like
 * reading a blog). Each page is a full cascade.
 * Detects cross-page degradation.
 */
async function scenarioSustainedLoads() {
  console.log("\n==========================================================");
  console.log("SCENARIO 6: Sustained page loads (10 consecutive full loads)");
  console.log("==========================================================");

  const PAGES = 10;
  const pageStats = [];

  for (let p = 0; p < PAGES; p++) {
    const requests = [
      assetUrl(ASSET.html, 0),
      assetUrl(ASSET.favicon, 0),
      assetUrl(ASSET.css, 30),
      assetUrl(ASSET.jsVendor, 30),
      assetUrl(ASSET.jsLarge, 30),
      assetUrl(ASSET.font, 60),
      assetUrl(ASSET.imgMedium, 60),
      assetUrl(ASSET.imgSmall, 60),
      assetUrl(ASSET.apiJson, 100),
      assetUrl(ASSET.apiJson, 100),
    ];

    const wallStart = performance.now();
    const results = await browserPool(requests, 6);
    const wallTime = performance.now() - wallStart;

    const stats = summarize(`Page ${p + 1}`, results);
    stats.wallTime = wallTime;
    pageStats.push(stats);

    console.log(
      `    Page ${p + 1}/${PAGES}: wall=${fmtMs(wallTime)}  TTFB p50=${fmtMs(stats.ttfb.p50)}  max=${fmtMs(stats.ttfb.max)}  fail=${stats.failures}`,
    );
  }

  const firstWall = pageStats[0].wallTime;
  const lastWall = pageStats[pageStats.length - 1].wallTime;
  if (firstWall > 0) {
    const ratio = lastWall / firstWall;
    console.log(
      `\n  Page load degradation: page1=${fmtMs(firstWall)} -> page${PAGES}=${fmtMs(lastWall)}  (${ratio.toFixed(2)}x)`,
    );
    if (ratio > 1.5) {
      console.log("  *** DEGRADATION DETECTED ***");
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("==========================================================");
  console.log("  dotunnel Browser-Simulation Stress Test");
  console.log("==========================================================");
  console.log(`Tunnel: ${TUNNEL_URL}`);
  console.log(`Time:   ${new Date().toISOString()}`);

  // Warmup
  console.log("\nWarming up...");
  try {
    await timedFetch(`${TUNNEL_URL}/small`, "warmup");
    await timedFetch(`${TUNNEL_URL}/small`, "warmup");
  } catch {
    console.error("Cannot reach tunnel. Is it running?");
    process.exit(1);
  }

  await scenarioPageLoad();
  await scenarioSPANavigation();
  await scenarioDevHMR();
  await scenarioDashboardPolling();
  await scenarioImageHeavy();
  await scenarioSustainedLoads();

  console.log("\n==========================================================");
  console.log("  All scenarios complete.");
  console.log("==========================================================\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
