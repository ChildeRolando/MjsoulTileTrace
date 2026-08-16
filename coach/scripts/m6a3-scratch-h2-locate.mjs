#!/usr/bin/env node
/**
 * M6-A3 §4 scratch — locate the H2 majsoul game on amae-koromo (public API)
 * by date + final-score fingerprint, then resolve the seat-3 paipu URL via
 * the public view_game redirect. PRIVATE ONLY: prints/saves identifiers to
 * the private job state dir, never into the repo.
 */
import { writeFileSync } from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
// The SPA spreads API reads across numbered data mirrors; cycle them the same
// way, with the headers the real client sends. Standard requests only — we do
// not attempt to defeat the rate limiter, just avoid hammering one mirror.
const MIRRORS = [
  "https://5-data.amae-koromo.com",
  "https://1.data.amae-koromo.com",
  "https://2.data.amae-koromo.com",
  "https://4.data.amae-koromo.com",
];
const HEADERS = {
  "User-Agent": UA,
  Accept: "application/json",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Referer: "https://amae-koromo.sapk.ch/",
};
const TARGET_SCORES = [54400, 11500, 15200, 19900]; // seats 0..3, from local .pb
const MODES = [16, 12, 9]; // throne / jade / gold 4p hanchan
const DAY = "2026-08-10"; // CST(-6) day of the capture (fileKey 260810)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function games(endMs, startMs, mode) {
  let lastErr = null;
  for (const mirror of MIRRORS) {
    const base = `${mirror}/api/v2/pl4`;
    const url = `${base}/games/${endMs}/${startMs}?limit=500&descending=true&mode=${mode}`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 20000);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${mirror}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(t);
    }
    await sleep(1500);
  }
  throw lastErr ?? new Error("all mirrors failed");
}

const cst = (day, h, m, s) =>
  Date.parse(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}-06:00`);

const dayStart = cst(DAY, 0, 0, 0);
const dayEnd = cst(DAY, 23, 59, 59) + 999;

let found = null;
let scanned = 0;
outer:
for (const mode of MODES) {
  for (let chunk = 0; chunk < 4; chunk += 1) {
    const s = dayStart + chunk * 6 * 3600 * 1000;
    const e = Math.min(s + 6 * 3600 * 1000 - 1, dayEnd);
    let batch;
    try {
      batch = await games(e, s, mode);
    } catch (err) {
      console.error(`chunk fail mode=${mode} ${chunk}: ${err.message}`);
      await sleep(10000);
      continue;
    }
    scanned += batch.length;
    console.error(`mode=${mode} chunk=${chunk}: ${batch.length} games`);
    for (const g of batch) {
      const scores = g.players.map((p) => p.score);
      const exact = scores.length === 4 && scores.every((v, i) => v === TARGET_SCORES[i]);
      const multiset = exact || (scores.length === 4 && [...scores].sort().join(",") === [...TARGET_SCORES].sort().join(","));
      if (multiset) {
        found = { g, exact };
        break outer;
      }
    }
    await sleep(2500);
  }
}

if (!found) {
  console.error(`NOT FOUND: scanned ${scanned} games on ${DAY}`);
  process.exit(1);
}
const { g, exact } = found;
console.error(`FOUND ${exact ? "exact" : "multiset"} uuid=${g.uuid} modeId=${g.modeId} startTime=${g.startTime}`);
console.error("seat players:", g.players.map((p, i) => `#${i} id=${p.accountId} score=${p.score}`).join(" | "));
const seat3 = g.players[3];
if (!seat3) {
  console.error("no seat-3 player");
  process.exit(1);
}

// Resolve the seat-3 paipu URL via the public redirect endpoint (no auth).
for (const mirror of MIRRORS) {
  const viewUrl = `${mirror}/api/v2/pl4/view_game/1/${g.modeId}/${g.uuid}/${seat3.accountId}`;
  const res = await fetch(viewUrl, { headers: HEADERS, redirect: "manual" }).catch(() => null);
  const location = res && res.headers ? res.headers.get("location") : null;
  console.error(`view_game ${mirror} status=${res && res.status} location=${location}`);
  if (location) {
    const outPath = "C:/Users/Roland/.claude/jobs/fa6fe5a3/tmp/m6a3-h2-seat3-paipu-url.txt";
    writeFileSync(outPath, `${location}\n`, { mode: 0o600 });
    console.error(`saved seat-3 paipu URL to ${outPath}`);
    process.exit(0);
  }
  await sleep(1500);
}
console.error("view_game failed on all mirrors");
process.exit(1);
