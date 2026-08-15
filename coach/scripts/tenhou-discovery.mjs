#!/usr/bin/env node
/**
 * M6-A3 §14 discovery corpus runner (local-only).
 *
 *   node scripts/tenhou-discovery.mjs <log1.xml> [log2.xml ...] [--out report.json]
 *
 * Pipeline: raw logs → tenhou mapper → canonical → structural census. Mortal
 * is NEVER called here. Output is §23-compliant aggregates and selection
 * metadata only (counts, opaque game ids, seats, branch names). Game ids are
 * derived from the record content hash, never from file names or any Tenhou
 * identifier.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { discoverTenhouCorpus } from "@riichi-coach/tenhou-source";

function parseArgs(argv) {
  const files = [];
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
    } else if (arg.startsWith("--")) {
      fail(`unknown option ${arg}`);
    } else {
      files.push(arg);
    }
  }
  if (files.length === 0) {
    fail("usage: tenhou-discovery.mjs <log1.xml> [log2.xml ...] [--out report.json]");
  }
  return { files, out, maxCandidateSamples };
}

function fail(message) {
  console.error(String(message));
  process.exit(2);
}

const { files, out, maxCandidateSamples } = parseArgs(process.argv.slice(2));

const inputs = files.map((file) => {
  const raw = readFileSync(file, "utf8");
  // Opaque id from content only: no file name, no Tenhou log id, no URL.
  const digest = createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
  return { raw, gameId: `tenhou-g:${digest}` };
});

const report = discoverTenhouCorpus(inputs, { maxCandidateSamples });

const json = JSON.stringify(report, null, 2);
if (out === null) {
  process.stdout.write(`${json}\n`);
} else {
  writeFileSync(out, json, { mode: 0o600 });
  console.error(`wrote ${out} (${report.gamesScanned} games scanned)`);
}
