#!/usr/bin/env node
/**
 * M6-A3 §14 discovery corpus runner (local-only).
 *
 *   node scripts/tenhou-discovery.mjs <log1.xml> [log2.xml ...]
 *     [--out report.json] [--max-candidates N] [--dama-tsumo]
 *
 * Pipeline: raw logs → tenhou mapper → canonical → structural census, plus
 * (with --dama-tsumo) the §7 private pass: per-seat mapping → replay →
 * weightless libriichi rules, classifying dama_with_tsumo windows the public
 * census cannot see. Neural model scoring is NEVER called here. Output is §23-compliant:
 * counts, opaque game ids, seats, branch names, and canonical decision
 * locators only. Game ids are derived from the record content hash, never
 * from file names or any Tenhou identifier.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  discoverTenhouCorpus,
  mapTenhouRecord,
  mergeDamaTsumoCandidates,
} from "@riichi-coach/tenhou-source";
import {
  collectDamaTsumoWindows,
} from "@riichi-coach/reasoning";
import { createManagedRuleRuntime } from "./managed-mortal-acceptance.mjs";

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
    } else if (arg === "--dir") {
      const dir = argv[++index] ?? fail("--dir requires a path");
      const names = readdirSync(dir).filter((name) => name.endsWith(".xml")).sort();
      if (names.length === 0) {
        fail(`--dir ${dir} contains no .xml files`);
      }
      for (const name of names) files.push(path.join(dir, name));
    } else if (arg.startsWith("--")) {
      fail(`unknown option ${arg}`);
    } else {
      files.push(arg);
    }
  }
  if (files.length === 0) {
    fail("usage: tenhou-discovery.mjs <log1.xml> [log2.xml ...] [--dir <raw dir>] [--out report.json] [--dama-tsumo]");
  }
  return { files, out, maxCandidateSamples, damaTsumo };
}

function fail(message) {
  console.error(String(message));
  process.exit(2);
}

const { files, out, maxCandidateSamples, damaTsumo } = parseArgs(process.argv.slice(2));

const inputs = files.map((file) => {
  const raw = readFileSync(file, "utf8");
  // Opaque id from content only: no file name, no Tenhou log id, no URL.
  const digest = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
  return { raw, gameId: `tenhou-g:${digest}` };
});

let report = discoverTenhouCorpus(inputs, { maxCandidateSamples });

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
        // The private pass re-maps per seat: only the self actor's draws are
        // visible in a canonical stream, so concealed tiles exist per-seat.
        const mapped = mapTenhouRecord({
          raw: input.raw,
          gameId: input.gameId,
          selfActor: seat,
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
