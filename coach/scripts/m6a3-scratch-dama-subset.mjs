#!/usr/bin/env node
/**
 * M6-A3 §5 scratch — bounded dama_with_tsumo subset scan over the raw Tenhou
 * corpus. Keeps ONE fact-engine sidecar alive across games, replays each seat,
 * classifies windows, and STOPS EARLY once enough distinct candidates are
 * found (stop condition = branches found, not a fixed game count). Private
 * output: opaque game ids + seats + locators only. Mortal is NEVER called.
 *
 *   node scripts/m6a3-scratch-dama-subset.mjs --dir <rawDir>
 *     --out <result.json> [--max-games 40] [--target-candidates 5]
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapTenhouRecord } from "@riichi-coach/tenhou-source";
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
  const opts = { dir: null, out: null, maxGames: 40, targetCandidates: 5, skip: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dir") opts.dir = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--max-games") opts.maxGames = Number(argv[++i]);
    else if (a === "--target-candidates") opts.targetCandidates = Number(argv[++i]);
    else if (a === "--skip") opts.skip = Number(argv[++i]);
    else fail(`unknown option ${a}`);
  }
  if (!opts.dir || !opts.out) {
    fail("usage: m6a3-scratch-dama-subset.mjs --dir <rawDir> --out <result.json> [--max-games 40] [--target-candidates 5] [--skip N]");
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const allNames = readdirSync(opts.dir).filter((n) => n.endsWith(".xml")).sort();
// --skip resumes after the first N sorted files (a previous bounded run
// already classified them; re-burning ~2.9s/window of engine time on them
// buys nothing).
const names = allNames.slice(opts.skip);
console.error(`dama subset: ${allNames.length} files total, skipping ${opts.skip}, scanning ${Math.min(opts.maxGames, names.length)}, target ${opts.targetCandidates} candidates`);

const resourcesDir = fileURLToPath(new URL("../resources/", import.meta.url));
const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(resourcesDir));

const candidates = [];
let gamesScanned = 0;
let seatsReplayed = 0;
let seatsFailed = 0;
let windowsClassified = 0;
let engineFailures = 0;
let stopReason = "max-games";
const gamesSkipped = opts.skip;

try {
  for (const name of names) {
    if (gamesScanned >= opts.maxGames || candidates.length >= opts.targetCandidates) {
      stopReason = candidates.length >= opts.targetCandidates ? "target-reached" : "max-games";
      break;
    }
    const raw = readFileSync(path.join(opts.dir, name), "utf8");
    const digest = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
    const gameId = `tenhou-g:${digest}`;
    gamesScanned += 1;
    for (let seat = 0; seat < 4; seat += 1) {
      const mapped = mapTenhouRecord({ raw, gameId, selfActor: seat });
      if (mapped.status !== "ready") {
        seatsFailed += 1;
        continue;
      }
      let decisions;
      try {
        decisions = replayCanonicalStream(mapped.stream);
      } catch {
        seatsFailed += 1;
        continue;
      }
      const result = await collectDamaTsumoWindows(decisions, engine).catch(() => null);
      if (result === null) {
        seatsFailed += 1;
        continue;
      }
      seatsReplayed += 1;
      windowsClassified += result.classifiedWindows;
      engineFailures += result.engineFailures;
      for (const window of result.windows) {
        candidates.push({ gameId, seat, decisionEventRef: window.decisionEventRef });
      }
      console.error(
        `${gameId}#${seat}: +${result.windows.length} (total ${candidates.length}) ` +
        `cls=${result.classifiedWindows} fail=${result.engineFailures}`,
      );
    }
    console.error(`game ${gamesScanned}/${Math.min(opts.maxGames, names.length)} done (${name}): candidates=${candidates.length}`);
    // Checkpoint after every game so interim progress survives any stop.
    writeFileSync(opts.out, `${JSON.stringify({
      stopReason: "in-progress",
      gamesSkipped,
      gamesScanned,
      seatsReplayed,
      seatsFailed,
      windowsClassified,
      engineFailures,
      candidates,
    }, null, 2)}\n`, { mode: 0o600 });
  }
} finally {
  await engine.close();
}

writeFileSync(opts.out, `${JSON.stringify({
  stopReason,
  gamesSkipped,
  gamesScanned,
  seatsReplayed,
  seatsFailed,
  windowsClassified,
  engineFailures,
  candidates,
}, null, 2)}\n`, { mode: 0o600 });
console.error(
  `DONE ${stopReason}: games=${gamesScanned} seats=${seatsReplayed} ok/${seatsFailed} failed, ` +
  `windows=${windowsClassified}, candidates=${candidates.length}`,
);
