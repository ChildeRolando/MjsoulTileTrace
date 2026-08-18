#!/usr/bin/env node
/**
 * M6-A4.3 — response-surface discovery corpus runner (local-only, pure-event).
 *
 *   node scripts/response-surface-discovery.mjs <log1.xml> [log2.xml ...]
 *     [--dir <raw dir>] [--majsoul <record1.pb> ...] [--out report.json]
 *     [--max-candidates N]
 *
 * The A4 spec's discovery policy: chankan's pure-event scan starts EARLIEST
 * because it is the only wave-1 branch without a degradation fallback. This
 * runner is that scan — zero Mortal cost, exactly like the A3 discovery
 * runners, over BOTH approved sources:
 *
 *   LOCAL   tenhou raw mjloggm → mapTenhouRecord | majsoul INNER record →
 *           mapMahjongSoulRecord → validateCanonicalEventStream →
 *           replayCanonicalStream (a game that cannot replay is fail-closed
 *           and does NOT count toward the degradation N) →
 *           discoverResponseSurfaceCorpus (shared, source-agnostic census)
 *
 * Output is the A4.3 discovery manifest: per-source qualified-game counts
 * (the degradation-clause counting unit: mapper-accepted + replay-succeeded
 * 4p south games), per-branch response actual hits, concrete (game, seat,
 * branch, locator) candidates for submission, and the uncovered branches.
 * Mortal is NEVER called here.
 *
 * §23 privacy: counts, opaque content-hash game ids, seats, branch names,
 * and canonical decision locators only. Game ids hash the record bytes.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
} from "@riichi-coach/mahjong-soul-source";
import {
  mapTenhouRecord,
} from "@riichi-coach/tenhou-source";
import {
  discoverResponseSurfaceCorpus,
  RESPONSE_SURFACE_DISCOVERY_BRANCHES,
  replayCanonicalStream,
  validateCanonicalEventStream,
} from "@riichi-coach/reasoning";

function parseArgs(argv) {
  const files = [];
  const majsoulFiles = [];
  let out = null;
  let maxCandidateSamples;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      out = argv[++index] ?? fail("--out requires a path");
    } else if (arg === "--max-candidates") {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1) {
        fail("--max-candidates requires a positive integer");
      }
      maxCandidateSamples = value;
    } else if (arg === "--dir") {
      const dir = argv[++index] ?? fail("--dir requires a path");
      const names = readdirSync(dir).filter((name) => name.endsWith(".xml")).sort();
      if (names.length === 0) {
        fail(`--dir ${dir} contains no .xml files`);
      }
      for (const name of names) files.push(path.join(dir, name));
    } else if (arg === "--majsoul") {
      const record = argv[++index] ?? fail("--majsoul requires a path");
      majsoulFiles.push(record);
    } else if (arg.startsWith("--")) {
      fail(`unknown option ${arg}`);
    } else {
      files.push(arg);
    }
  }
  if (files.length === 0 && majsoulFiles.length === 0) {
    fail("usage: response-surface-discovery.mjs <log1.xml> [log2.xml ...] [--dir <raw dir>] [--majsoul <record.pb> ...] [--out report.json] [--max-candidates N]");
  }
  return { files, majsoulFiles, out, maxCandidateSamples };
}

function fail(message) {
  console.error(String(message));
  process.exit(2);
}

const { files, majsoulFiles, out, maxCandidateSamples } = parseArgs(process.argv.slice(2));

// --- Map + validate + replay per game; only replay-succeeded games count
// toward the degradation N and enter the census. Per-source accounting
// (spec: 两来源合计，manifest 按 source 分别记录计数供审计). ---

const sourceCounts = {
  tenhou: { gamesScanned: 0, gamesMapped: 0, gamesValidated: 0, qualifiedGames: 0, replayFailures: 0, mapFailureCounts: {}, validationFailureCounts: {} },
  mahjong_soul: { gamesScanned: 0, gamesMapped: 0, gamesValidated: 0, qualifiedGames: 0, replayFailures: 0, mapFailureCounts: {}, validationFailureCounts: {} },
};
const streams = [];

function scanStream(sourceKind, gameId, mapped, sc) {
  sc.gamesMapped += 1;
  const validation = validateCanonicalEventStream(mapped.stream);
  if (validation.status !== "valid") {
    sc.validationFailureCounts[validation.code] =
      (sc.validationFailureCounts[validation.code] ?? 0) + 1;
    return;
  }
  sc.gamesValidated += 1;
  try {
    replayCanonicalStream(mapped.stream);
  } catch (error) {
    // Fail-closed: a game the local pipeline cannot replay is not a
    // qualified game (degradation clause counting unit) and can never
    // become an acceptance candidate.
    sc.replayFailures += 1;
    console.error(
      `replay fail ${gameId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  sc.qualifiedGames += 1;
  streams.push(mapped.stream);
}

for (const file of files) {
  const sc = sourceCounts.tenhou;
  const raw = readFileSync(file, "utf8");
  const digest = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
  const gameId = `tenhou-g:${digest}`;
  sc.gamesScanned += 1;
  const mapped = mapTenhouRecord({ raw, gameId, selfActor: 0 });
  if (mapped.status !== "ready") {
    sc.mapFailureCounts[mapped.code] = (sc.mapFailureCounts[mapped.code] ?? 0) + 1;
    continue;
  }
  scanStream("tenhou", gameId, mapped, sc);
}

if (majsoulFiles.length > 0) {
  const bundleRoot = fileURLToPath(new URL("../vendor/mahjong-soul-protocol/", import.meta.url));
  const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
  for (const file of majsoulFiles) {
    const sc = sourceCounts.mahjong_soul;
    const recordBytes = new Uint8Array(readFileSync(file));
    const digest = createHash("sha256").update(recordBytes).digest("hex").slice(0, 16);
    const gameId = `majsoul-g:${digest}`;
    sc.gamesScanned += 1;
    const mapped = mapMahjongSoulRecord({
      gameId,
      selfActor: 0,
      recordId: `majsoul-opaque:${digest}`,
      recordBytes,
      bundle,
    });
    if (mapped.status !== "ready") {
      sc.mapFailureCounts[mapped.code] = (sc.mapFailureCounts[mapped.code] ?? 0) + 1;
      continue;
    }
    scanStream("mahjong_soul", gameId, mapped, sc);
  }
}

// --- Shared source-agnostic response census. ---

const census = discoverResponseSurfaceCorpus(streams, { maxCandidateSamples });
const report = {
  schemaVersion: "response-surface-discovery/v1",
  // Degradation-clause counting: qualified games per source = mapper-accepted
  // AND canonically replayed 4p south games (fail-closed games excluded).
  // 口径 = 两来源合计（雀魂自有对局 + 天凤归档），manifest 按 source 分记。
  sourceCounts,
  totalQualifiedGames:
    sourceCounts.tenhou.qualifiedGames + sourceCounts.mahjong_soul.qualifiedGames,
  streamsScanned: census.streamsScanned,
  branchHits: census.branchHits,
  branchCandidates: census.branchCandidates,
  uncoveredLocalBranches: census.uncoveredLocalBranches,
  discoveredBranches: RESPONSE_SURFACE_DISCOVERY_BRANCHES.filter(
    (branch) => census.branchHits[branch] > 0,
  ),
};

const json = JSON.stringify(report, null, 2);
if (out === null) {
  process.stdout.write(`${json}\n`);
} else {
  writeFileSync(out, json, { mode: 0o600 });
  console.error(`wrote ${out} (${report.totalQualifiedGames} qualified / ${files.length + majsoulFiles.length} scanned)`);
}
