#!/usr/bin/env node
/**
 * M6-A3 final evidence-closing §4 — Mahjong Soul coverage discovery runner
 * (local-only, PREFERRED source).
 *
 *   node scripts/majsoul-discovery.mjs <record1.pb> [record2.pb ...]
 *     [--out report.json] [--max-candidates N] [--dama-tsumo]
 *
 * Pipeline: INNER GameDetailRecords bytes → mapMahjongSoulRecord (existing
 * production mapper — no second parser/classifier) → the SAME source-agnostic
 * structural census and §6 candidate/selection aggregation the Tenhou runner
 * uses (discoverCanonicalCorpus), plus (with --dama-tsumo) the §7 private
 * pass: per-seat mapping → replay → hand-structure fact engine, classifying
 * dama_with_tsumo windows the public census cannot see. Mortal is NEVER
 * called here — discovery only names candidate (game, seat, branch, locator)
 * windows for later acceptance.
 *
 * §10/§23 privacy: output carries counts, opaque content-hash game ids,
 * seats, branch names, and canonical decision locators only. The raw Mahjong
 * Soul record id / share URL appears nowhere (game ids hash the bytes).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
} from "@riichi-coach/mahjong-soul-source";
import {
  discoverCanonicalCorpus,
  mergeDamaTsumoCandidates,
} from "@riichi-coach/tenhou-source";
import {
  collectDamaTsumoWindows,
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
  replayCanonicalStream,
} from "@riichi-coach/reasoning";

function fail(message) {
  console.error(String(message));
  process.exit(2);
}

function parseArgs(argv) {
  const files = [];
  let out = null;
  let maxCandidateSamples;
  let damaTsumo = false;
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
  return { files, out, maxCandidateSamples, damaTsumo };
}

const { files, out, maxCandidateSamples, damaTsumo } = parseArgs(process.argv.slice(2));

const bundleRoot = fileURLToPath(new URL("../vendor/mahjong-soul-protocol/", import.meta.url));
const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);

const inputs = files.map((file) => {
  const recordBytes = new Uint8Array(readFileSync(file));
  // Opaque id from content only: no file name, no Mahjong Soul record id, no URL.
  const digest = createHash("sha256").update(recordBytes).digest("hex").slice(0, 16);
  return { recordBytes, gameId: `majsoul-g:${digest}` };
});

// --- Census pass: one mapping per record (selfActor 0 — the census walks
// public events only, so the concealment perspective is irrelevant). ---

const streams = [];
const mapFailureCounts = {};
for (const input of inputs) {
  const mapped = mapMahjongSoulRecord({
    gameId: input.gameId,
    selfActor: 0,
    recordId: `majsoul-opaque:${input.gameId.slice("majsoul-g:".length)}`,
    recordBytes: input.recordBytes,
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
  const resourcesDir = fileURLToPath(new URL("../resources/", import.meta.url));
  const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(resourcesDir));
  const candidates = [];
  let seatsReplayed = 0;
  let seatsFailed = 0;
  let windowsClassified = 0;
  let engineFailures = 0;
  try {
    for (const input of inputs) {
      for (let seat = 0; seat < 4; seat += 1) {
        // The private pass re-maps per seat: only the self actor's concealed
        // tiles exist in a canonical stream, so each seat is its own mapping.
        const mapped = mapMahjongSoulRecord({
          gameId: input.gameId,
          selfActor: seat,
          recordId: `majsoul-opaque:${input.gameId.slice("majsoul-g:".length)}`,
          recordBytes: input.recordBytes,
          bundle,
        });
        if (mapped.status !== "ready") {
          seatsFailed += 1;
          continue;
        }
        // Per-seat fail-closed isolation: a game whose replay is not supported
        // locally skips that seat without aborting the corpus — it can simply
        // never become an acceptance candidate. replayCanonicalStream returns
        // ReplayedDecision[] directly.
        let decisions;
        try {
          decisions = replayCanonicalStream(mapped.stream);
        } catch (error) {
          seatsFailed += 1;
          console.error(
            `dama-tsumo ${input.gameId}#${seat}: replay failed, seat skipped (${
              error instanceof Error ? error.message : String(error)
            })`,
          );
          continue;
        }
        const result = await collectDamaTsumoWindows(decisions, engine).catch((error) => {
          seatsFailed += 1;
          console.error(
            `dama-tsumo ${input.gameId}#${seat}: window collection failed, seat skipped (${
              error instanceof Error ? error.message : String(error)
            })`,
          );
          return null;
        });
        if (result === null) continue;
        seatsReplayed += 1;
        windowsClassified += result.classifiedWindows;
        engineFailures += result.engineFailures;
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
          });
        }
      }
    }
  } finally {
    await engine.close();
  }
  report = mergeDamaTsumoCandidates(report, candidates, {
    seatsReplayed,
    seatsFailed,
    windowsClassified,
    engineFailures,
    engineUsed: true,
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
