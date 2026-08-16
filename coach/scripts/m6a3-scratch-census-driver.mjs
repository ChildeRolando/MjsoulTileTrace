#!/usr/bin/env node
/**
 * M6-A3 §2/§3 scratch census driver — chunked local scan over a raw Tenhou
 * corpus directory. Reuses the production discoverTenhouCorpus pipeline in
 * memory-sized chunks and merges the reports (summed hits/failures, deduped
 * candidates, greedy selection recomputed over the merged pool). Resumable
 * via a --state file that remembers processed files. Mortal is NEVER called.
 *
 *   node scripts/m6a3-scratch-census-driver.mjs --dir <rawDir>
 *     --out <merged.json> --state <state.json> [--chunk 200] [--limit N]
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  discoverTenhouCorpus,
  TENHOU_COVERAGE_BRANCHES,
} from "@riichi-coach/tenhou-source";

function fail(message) {
  console.error(String(message));
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { dir: null, out: null, state: null, chunk: 200, limit: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dir") opts.dir = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--state") opts.state = argv[++i];
    else if (a === "--chunk") opts.chunk = Number(argv[++i]);
    else if (a === "--limit") opts.limit = Number(argv[++i]);
    else fail(`unknown option ${a}`);
  }
  if (!opts.dir || !opts.out || !opts.state) {
    fail("usage: m6a3-scratch-census-driver.mjs --dir <rawDir> --out <merged.json> --state <state.json> [--chunk 200] [--limit N]");
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

const state = existsSync(opts.state)
  ? JSON.parse(readFileSync(opts.state, "utf8"))
  : { processed: [] };
const processed = new Set(state.processed);

const allNames = readdirSync(opts.dir).filter((n) => n.endsWith(".xml")).sort();
const todoNames = allNames.filter((n) => !processed.has(n));
const names = opts.limit === null ? todoNames : todoNames.slice(0, opts.limit);
console.error(`corpus dir: ${allNames.length} xml files, ${todoNames.length} unprocessed, scanning ${names.length}`);

const localBranchHits = {};
const branchCandidates = {};
for (const branch of TENHOU_COVERAGE_BRANCHES) {
  localBranchHits[branch] = 0;
  branchCandidates[branch] = [];
}
let gamesScanned = 0;
let seatsScanned = 0;
let damaTsumoCandidateWindows = 0;
const mapFailureCounts = {};
const candidateSeen = new Set();

for (let offset = 0; offset < names.length; offset += opts.chunk) {
  const chunkNames = names.slice(offset, offset + opts.chunk);
  const inputs = chunkNames.map((name) => {
    const raw = readFileSync(path.join(opts.dir, name), "utf8");
    const digest = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
    return { raw, gameId: `tenhou-g:${digest}` };
  });
  const report = discoverTenhouCorpus(inputs);
  gamesScanned += report.gamesScanned;
  seatsScanned += report.seatsScanned;
  damaTsumoCandidateWindows += report.damaTsumoCandidateWindows;
  for (const [code, count] of Object.entries(report.mapFailureCounts)) {
    mapFailureCounts[code] = (mapFailureCounts[code] ?? 0) + count;
  }
  for (const branch of TENHOU_COVERAGE_BRANCHES) {
    localBranchHits[branch] += report.localBranchHits[branch] ?? 0;
    for (const candidate of report.branchCandidates[branch] ?? []) {
      const key = `${candidate.gameId}#${candidate.seat}#${candidate.decisionEventRef}`;
      if (candidateSeen.has(key)) continue;
      candidateSeen.add(key);
      branchCandidates[branch].push(candidate);
    }
  }
  for (const name of chunkNames) processed.add(name);
  state.processed = [...processed];
  writeFileSync(opts.state, JSON.stringify(state));
  console.error(`chunk ${Math.floor(offset / opts.chunk) + 1}: total scanned ${gamesScanned}, failures ${JSON.stringify(mapFailureCounts)}`);
}

// Greedy minimal-cover selection over the merged candidate pool.
const pairMap = new Map();
for (const branch of TENHOU_COVERAGE_BRANCHES) {
  for (const candidate of branchCandidates[branch]) {
    const key = `${candidate.gameId}#${candidate.seat}`;
    if (!pairMap.has(key)) pairMap.set(key, { gameId: candidate.gameId, seat: candidate.seat, branches: new Set() });
    pairMap.get(key).branches.add(branch);
  }
}
const covered = new Set();
const selectionPairs = [];
const remaining = () => [...pairMap.values()].filter((p) => [...p.branches].some((b) => !covered.has(b)));
for (;;) {
  const pool = remaining();
  if (pool.length === 0) break;
  pool.sort((a, b) =>
    [...b.branches].filter((x) => !covered.has(x)).length - [...a.branches].filter((x) => !covered.has(x)).length
    || a.gameId.localeCompare(b.gameId),
  );
  const best = pool[0];
  selectionPairs.push({
    gameId: best.gameId,
    seat: best.seat,
    branches: TENHOU_COVERAGE_BRANCHES.filter((b) => best.branches.has(b)),
  });
  for (const b of best.branches) covered.add(b);
}

const merged = {
  gamesScanned,
  seatsScanned,
  mapFailureCounts,
  localBranchHits,
  branchCandidates,
  candidateCounts: Object.fromEntries(
    TENHOU_COVERAGE_BRANCHES.map((b) => [b, branchCandidates[b].length]),
  ),
  selectionPairs,
  damaTsumoCandidateWindows,
  maxCandidateSamples: 20,
  needsHandStructureEngine: true,
  uncoveredLocalBranches: TENHOU_COVERAGE_BRANCHES.filter((b) => branchCandidates[b].length === 0),
};
writeFileSync(opts.out, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
console.error(`wrote ${opts.out}`);
console.error(`SUMMARY gamesScanned=${gamesScanned} failures=${JSON.stringify(mapFailureCounts)}`);
for (const b of TENHOU_COVERAGE_BRANCHES) {
  console.error(`  ${b}: hits=${localBranchHits[b]} candidates=${branchCandidates[b].length}`);
}
