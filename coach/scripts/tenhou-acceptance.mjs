#!/usr/bin/env node
/**
 * M6-A3 §15 acceptance corpus runner (policy + local pipeline).
 *
 *   node scripts/tenhou-acceptance.mjs --selection sel.json \
 *     [--checkpoint ckpt.json] [--max-requests N] [--base-delay-ms N] \
 *     [--jitter-ms N] [--seed N] [--dry-run]
 *
 * selection.json: [{ "gameId": "tenhou-g:...", "seat": 0, "file": "log.xml" }]
 *
 * The local side of every planned submission is fully executed here and stays
 * strictly independent of Mortal: raw paipu → tenhou mapper → canonical →
 * validateCanonicalEventStream → replayCanonicalStream. The Mortal transport
 * (submission + report fetch) is an injected seam (`--dry-run`, the default
 * off state, plans and verifies the local pipeline only): live submissions
 * compose the existing M6-A2 desktop Mortal pipeline at acceptance-execution
 * time under the same budget/checkpoint/dedupe/no-resubmit policy enforced by
 * planAcceptanceRun. Mortal is an acceptance oracle, not a search engine.
 *
 * §23 privacy: console + checkpoint carry only opaque game ids, seats,
 * ordinals, and aggregate outcomes — never reportIds, result URLs, names, or
 * raw record bytes. The checkpoint file is written 0600 where supported.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { planAcceptanceRun, mapTenhouRecord, updateCheckpoint } from "@riichi-coach/tenhou-source";
import { validateCanonicalEventStream, replayCanonicalStream } from "@riichi-coach/reasoning";

function fail(message) {
  console.error(String(message));
  process.exit(2);
}

function parseArgs(argv) {
  const options = {
    selection: null,
    checkpointPath: null,
    maxRequestsPerRun: 3,
    baseDelayMs: 10_000,
    jitterMs: 4_000,
    seed: 0x5eed_0001,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--selection": options.selection = argv[++index] ?? fail("--selection requires a path"); break;
      case "--checkpoint": options.checkpointPath = argv[++index] ?? fail("--checkpoint requires a path"); break;
      case "--max-requests": options.maxRequestsPerRun = Number(argv[++index]); break;
      case "--base-delay-ms": options.baseDelayMs = Number(argv[++index]); break;
      case "--jitter-ms": options.jitterMs = Number(argv[++index]); break;
      case "--seed": options.seed = Number(argv[++index]); break;
      case "--dry-run": options.dryRun = true; break;
      default: fail(`unknown option ${arg}`);
    }
  }
  if (options.selection === null) {
    fail("usage: tenhou-acceptance.mjs --selection sel.json [--checkpoint ckpt.json] [--dry-run]");
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const selection = JSON.parse(readFileSync(options.selection, "utf8"));
if (!Array.isArray(selection)) fail("selection must be a JSON array");

let checkpoint = [];
if (options.checkpointPath !== null) {
  try {
    checkpoint = JSON.parse(readFileSync(options.checkpointPath, "utf8"));
  } catch {
    checkpoint = [];
  }
}

const fileByPair = new Map(selection.map((entry) => [`${entry.gameId}#${entry.seat}`, entry.file]));

const plan = planAcceptanceRun({
  selection: selection.map((entry) => ({ gameId: entry.gameId, seat: entry.seat })),
  checkpoint,
  budget: {
    maxRequestsPerRun: options.maxRequestsPerRun,
    baseDelayMs: options.baseDelayMs,
    jitterMs: options.jitterMs,
    seed: options.seed,
  },
});

const reasonCounts = {};
for (const item of plan) {
  reasonCounts[item.reason] = (reasonCounts[item.reason] ?? 0) + 1;
}
console.log(`plan: ${JSON.stringify(reasonCounts)}`);

let localOk = 0;
let localFailed = 0;
for (const item of plan) {
  if (item.reason !== "submit") continue;
  const file = fileByPair.get(`${item.gameId}#${item.seat}`);
  if (typeof file !== "string") fail(`selection entry missing file for ${item.gameId}#${item.seat}`);

  // Independent local pipeline for the selected paipu/seat.
  const raw = readFileSync(file, "utf8");
  const mapped = mapTenhouRecord({ raw, gameId: item.gameId, selfActor: item.seat });
  if (mapped.status !== "ready") {
    console.log(`${item.gameId}#${item.seat}: local map failed (${mapped.code})`);
    localFailed += 1;
    if (options.checkpointPath !== null) {
      checkpoint = updateCheckpoint(checkpoint, item.gameId, item.seat, "failed", item.attempts);
    }
    continue;
  }
  const validation = validateCanonicalEventStream(mapped.stream);
  if (validation.status !== "valid") {
    console.log(`${item.gameId}#${item.seat}: local validation failed (${validation.code})`);
    localFailed += 1;
    if (options.checkpointPath !== null) {
      checkpoint = updateCheckpoint(checkpoint, item.gameId, item.seat, "failed", item.attempts);
    }
    continue;
  }
  const decisions = replayCanonicalStream(mapped.stream);
  console.log(
    `${item.gameId}#${item.seat}: local pipeline ok ` +
    `(${mapped.stream.events.length} events, ${decisions.length} decision windows)`,
  );
  localOk += 1;
  if (options.checkpointPath !== null) {
    // In --dry-run the Mortal stage never runs, so nothing is marked
    // succeeded: the checkpoint records the verified local stage only.
    checkpoint = updateCheckpoint(checkpoint, item.gameId, item.seat, "pending", item.attempts);
  }
  if (options.dryRun) {
    console.log(`${item.gameId}#${item.seat}: dry-run stops before the Mortal transport`);
  }
}

if (options.checkpointPath !== null) {
  writeFileSync(options.checkpointPath, JSON.stringify(checkpoint, null, 2), { mode: 0o600 });
}
console.log(`local stage: ${localOk} ok, ${localFailed} failed; Mortal stage: ${options.dryRun ? "skipped (dry-run)" : "not wired in this runner (compose the M6-A2 desktop pipeline)"}`);
