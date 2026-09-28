#!/usr/bin/env node
/**
 * M6-A3 final evidence-closing §4 — Mahjong Soul coverage discovery runner
 * (local-only, PREFERRED source).
 *
 *   node scripts/majsoul-discovery.mjs <record1.pb> [record2.pb ...]
 *     [--out report.json] [--max-candidates N] [--dama-tsumo]
 *     [--input-format inner|record-cache]
 *
 * Pipeline: INNER GameDetailRecords bytes → mapMahjongSoulRecord (existing
 * production mapper — no second parser/classifier) → the SAME source-agnostic
 * structural census and §6 candidate/selection aggregation the Tenhou runner
 * uses (discoverCanonicalCorpus), plus (with --dama-tsumo) the §7 private
 * pass: per-seat mapping → replay → weightless libriichi rules, classifying
 * dama_with_tsumo windows the public census cannot see. Neural model scoring is NEVER
 * called here — discovery only names candidate (game, seat, branch, locator)
 * windows for later acceptance.
 *
 * §10/§23 privacy: output carries counts, opaque content-hash game ids,
 * seats, branch names, and canonical decision locators only. The raw Mahjong
 * Soul record id / share URL appears nowhere (game ids hash the input bytes,
 * including bound rule evidence when input-format is record-cache).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  decodeMahjongSoulRecordCache,
  MahjongSoulSourceError,
} from "@riichi-coach/mahjong-soul-source";
import {
  discoverCanonicalCorpus,
  mergeDamaTsumoCandidates,
} from "@riichi-coach/tenhou-source";
import {
  collectDamaTsumoWindows,
} from "@riichi-coach/reasoning";
import { createManagedRuleRuntime } from "./managed-mortal-acceptance.mjs";

function fail(message) {
  console.error(String(message));
  process.exit(2);
}

function parseArgs(argv) {
  const files = [];
  let out = null;
  let maxCandidateSamples;
  let damaTsumo = false;
  let inputFormat = "inner";
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
    } else if (arg === "--input-format") {
      inputFormat = argv[++index];
      if (!["inner", "record-cache"].includes(inputFormat)) fail("--input-format must be inner or record-cache");
    } else if (arg === "--dama-tsumo") {
      damaTsumo = true;
    } else if (arg.startsWith("--")) {
      fail(`unknown option ${arg}`);
    } else {
      files.push(arg);
    }
  }
  if (files.length === 0) {
    fail("usage: majsoul-discovery.mjs <record1.pb> [record2.pb ...] [--out report.json] [--max-candidates N] [--dama-tsumo]");
  }
  return { files, out, maxCandidateSamples, damaTsumo, inputFormat };
}

const { files, out, maxCandidateSamples, damaTsumo, inputFormat } = parseArgs(process.argv.slice(2));

const bundleRoot = fileURLToPath(new URL("../vendor/mahjong-soul-protocol/", import.meta.url));
const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);

const inputs = files.map((file) => {
  const bytes = readFileSync(file);
  // Opaque id from content only: no file name, no Mahjong Soul record id, no URL.
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  if (inputFormat === "record-cache") {
    try {
      const captured = decodeMahjongSoulRecordCache({ bundle, cacheBytes: bytes });
      return { ...captured, gameId: `majsoul-g:${digest}` };
    } catch (error) {
      fail(error instanceof MahjongSoulSourceError ? error.code : "mahjong_soul_record_cache_invalid");
    }
  }
  return { recordBytes: new Uint8Array(bytes), recordId: `majsoul-opaque:${digest}`, gameId: `majsoul-g:${digest}` };
});

// --- Census pass: one mapping per record (selfActor 0 — the census walks
// public events only, so the concealment perspective is irrelevant). ---

const streams = [];
const mapFailureCounts = {};
for (const input of inputs) {
  const mapped = mapMahjongSoulRecord({
    gameId: input.gameId,
    selfActor: 0,
    recordId: input.recordId,
    recordBytes: input.recordBytes,
    ...(input.ruleEvidence === undefined ? {} : { ruleEvidence: input.ruleEvidence }),
    bundle,
  });
  if (mapped.status !== "ready") {
    mapFailureCounts[mapped.code] = (mapFailureCounts[mapped.code] ?? 0) + 1;
    console.error(`MAP FAIL ${input.gameId}: ${mapped.code}`);
    continue;
  }
  streams.push({ gameId: input.gameId, stream: mapped.stream });
  console.error(`MAP OK ${input.gameId}: ${mapped.stream.events.length} events`);
}

let report = discoverCanonicalCorpus(streams, { maxCandidateSamples });
if (Object.keys(mapFailureCounts).length > 0) {
  report = { ...report, mapFailureCounts: { ...mapFailureCounts } };
}

// --- §7 private pass (opt-in): per-seat perspective → replay → engine. ---

if (damaTsumo) {
  const runtime = await createManagedRuleRuntime();
  const candidates = [];
  let seatsReplayed = 0;
  let seatsFailed = 0;
  let windowsClassified = 0;
  let engineFailures = 0;
  const failureCounts = {};
  try {
    for (const input of inputs) {
      for (let seat = 0; seat < 4; seat += 1) {
        // The private pass re-maps per seat: only the self actor's concealed
        // tiles exist in a canonical stream, so each seat is its own mapping.
        const mapped = mapMahjongSoulRecord({
          gameId: input.gameId,
          selfActor: seat,
          recordId: input.recordId,
          recordBytes: input.recordBytes,
          ...(input.ruleEvidence === undefined ? {} : { ruleEvidence: input.ruleEvidence }),
          bundle,
        });
        if (mapped.status !== "ready") {
          seatsFailed += 1;
          continue;
        }
        // Replay and every rule query run inside the collector. A bad seat
        // cannot abort later seats; raw exception prose never enters output.
        const result = await collectDamaTsumoWindows({stream: mapped.stream,
          identity: runtime.ruleIdentity, port: runtime}).catch(() => {
          seatsFailed += 1;
          console.error(`dama-tsumo ${input.gameId}#${seat}: rules_input_invalid`);
          return null;
        });
        if (result === null) continue;
        seatsReplayed += 1;
        windowsClassified += result.classifiedWindows;
        engineFailures += result.engineFailures;
        for (const [code, count] of Object.entries(result.failureCounts)) {
          failureCounts[code] = (failureCounts[code] ?? 0) + count;
        }
        console.error(
          `dama-tsumo ${input.gameId}#${seat}: ${result.windows.length} found ` +
          `(${result.classifiedWindows} classified, ${result.skippedWindows} skipped, ` +
          `${result.engineFailures} engine failures)`,
        );
        for (const window of result.windows) {
          candidates.push({
            gameId: input.gameId,
            seat,
            decisionEventRef: window.decisionEventRef,
            ruleResultId: window.ruleResultId,
          });
        }
      }
    }
  } finally {
    await runtime.close();
  }
  report = mergeDamaTsumoCandidates(report, candidates, {
    seatsReplayed,
    seatsFailed,
    windowsClassified,
    engineFailures,
    engineUsed: true,
    failureCounts,
    legalActionRules: runtime.ruleIdentity,
  });
  console.error(
    `dama-tsumo pass: ${candidates.length} windows found ` +
    `(${seatsReplayed} seats replayed, ${seatsFailed} seat maps failed, ` +
    `${windowsClassified} classified, ${engineFailures} engine failures)`,
  );
}

const json = JSON.stringify(report, null, 2);
if (out === null) {
  process.stdout.write(`${json}\n`);
} else {
  writeFileSync(out, json, { mode: 0o600 });
  console.error(`wrote ${out} (${report.gamesScanned} games scanned)`);
}
