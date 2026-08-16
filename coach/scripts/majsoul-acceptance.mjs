#!/usr/bin/env node
// M6-A3 source-policy correction — FIRST-CLASS Mahjong Soul acceptance
// entry (§6/§12). Mahjong Soul is the PREFERRED acceptance source (the final
// product); Tenhou is supplemental discovery/rare-event corpus/secondary
// acceptance. Both feed the SAME shared Mortal acceptance core.
//
// This is the platform-local-source adapter for Mahjong Soul. It owns ONLY:
//   LOCAL   trusted INNER GameDetailRecords bytes + resolved selfActor →
//           mapMahjongSoulRecord (existing production mapper — NO new
//           parser) → validate → replayCanonicalStream;
//   MODEL   cached real report (local raw body served through the injected
//           fetch — zero network, full production parse path) or an
//           operator-supplied result URL (real fetch). It NEVER submits to
//           mjai.ekyu.moe itself: the submission is operator-assisted (the
//           operator's browser passes Turnstile), and this script only
//           downloads the public result URL afterwards.
//   E2E     delegated to runMortalAcceptanceEvidence (shared core: binding
//           → review → evidence → redacted artifact → hash → manifest
//           samples). No second implementation of any E2E stage.
//
// State machine / privacy: identical to the Tenhou runner —
// mortal-acceptance-checkpoint/v1 with §13 source-aware identity
// (sourceType "mahjong_soul", so a same-digest Tenhou pair never collides),
// atomic 0600 writes, resumability, cached-success never refetched, hard
// fetch budget + conservative seeded delays. Outputs carry opaque ids only:
// the gameId is a CONTENT HASH of the record bytes — the raw Mahjong Soul
// record id appears nowhere in the checkpoint, artifact, manifest, or
// console aggregates (it lives only in this process's memory).
//
// usage:
//   node scripts/majsoul-acceptance.mjs \
//     --record <inner-record-bytes.pb> --seat <0-3> \
//     --result-url-file <file-with-mjai-result-url> \
//     [--report-body <raw-report-body.json>  # zero-network H2 mode] \
//     --state-dir <dir> [--evidence out.json] \
//     [--max-requests 1] [--poll-attempts 8] [--evidence-version m6-a3-acceptance/v1]
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
} from "@riichi-coach/mahjong-soul-source";
import {
  createEmptyAcceptanceCheckpoint,
  delayBeforeRequestMs,
  findAcceptancePair,
  MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION,
  parseAcceptanceCheckpointFile,
  transitionAcceptanceState,
  upsertAcceptancePair,
} from "@riichi-coach/tenhou-source";
import { fetchMortalReport } from "@riichi-coach/mortal-source";
import {
  buildMortalCoverageEvidenceManifest,
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
  replayCanonicalStream,
  runMortalAcceptanceEvidence,
  validateCanonicalEventStream,
} from "@riichi-coach/reasoning";

function fail(message) {
  console.error(String(message));
  process.exit(2);
}

function parseArgs(argv) {
  const options = {
    record: null,
    seat: null,
    resultUrlFile: null,
    reportBody: null,
    stateDir: null,
    evidence: null,
    maxRequests: 1,
    baseDelayMs: 10_000,
    jitterMs: 2_000,
    seed: 20_260_816,
    pollAttempts: 8,
    evidenceVersion: "m6-a3-acceptance/v1",
  };
  const intOption = (name, min) => {
    const value = Number(argv[Number(argv.indexOf(name)) + 1]);
    if (!Number.isInteger(value) || value < min) {
      fail(`${name} requires an integer >= ${min}`);
    }
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--record") {
      options.record = argv[++index] ?? fail("--record requires a path");
    } else if (arg === "--seat") {
      options.seat = intOption("--seat", 0);
      if (options.seat > 3) fail("--seat must be 0..3");
      index += 1;
    } else if (arg === "--result-url-file") {
      options.resultUrlFile = argv[++index] ?? fail("--result-url-file requires a path");
    } else if (arg === "--report-body") {
      options.reportBody = argv[++index] ?? fail("--report-body requires a path");
    } else if (arg === "--state-dir") {
      options.stateDir = argv[++index] ?? fail("--state-dir requires a path");
    } else if (arg === "--evidence") {
      options.evidence = argv[++index] ?? fail("--evidence requires a path");
    } else if (arg === "--max-requests") {
      options.maxRequests = intOption("--max-requests", 1);
      index += 1;
    } else if (arg === "--base-delay-ms") {
      options.baseDelayMs = intOption("--base-delay-ms", 0);
      index += 1;
    } else if (arg === "--jitter-ms") {
      options.jitterMs = intOption("--jitter-ms", 0);
      index += 1;
    } else if (arg === "--seed") {
      options.seed = intOption("--seed", 0);
      index += 1;
    } else if (arg === "--poll-attempts") {
      options.pollAttempts = intOption("--poll-attempts", 1);
      index += 1;
    } else if (arg === "--evidence-version") {
      options.evidenceVersion = argv[++index] ?? fail("--evidence-version requires a value");
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  if (options.record === null) fail("--record is required (INNER GameDetailRecords bytes)");
  if (options.seat === null) fail("--seat is required");
  if (options.stateDir === null) fail("--state-dir is required");
  return options;
}

const options = parseArgs(process.argv.slice(2));

const stateDir = options.stateDir;
const cacheDir = join(stateDir, "cache");
const artifactsDir = join(stateDir, "artifacts");
for (const dir of [stateDir, cacheDir, artifactsDir]) {
  mkdirSync(dir, { recursive: true });
}
const checkpointPath = join(stateDir, "checkpoint.json");
const evidencePath = options.evidence ?? join(stateDir, "evidence-manifest.json");

/** Atomic 0600 write — a half-written checkpoint must never be loaded. */
function writePrivate(path, text) {
  const temp = `${path}.tmp`;
  writeFileSync(temp, text, { mode: 0o600 });
  renameSync(temp, path);
}

function writeCheckpoint(checkpoint) {
  writePrivate(
    checkpointPath,
    `${JSON.stringify(
      { ...checkpoint, schemaVersion: MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION },
      null,
      2,
    )}\n`,
  );
}

function loadCheckpoint() {
  if (!existsSync(checkpointPath)) return createEmptyAcceptanceCheckpoint();
  return parseAcceptanceCheckpointFile(JSON.parse(readFileSync(checkpointPath, "utf8")));
}

let checkpoint = loadCheckpoint();

function advance(gameId, seat, event, patch = {}) {
  const record = findAcceptancePair(checkpoint, gameId, seat, "mahjong_soul");
  if (record === null) {
    throw new Error(`acceptance_pair_missing:${gameId}#${seat}`);
  }
  const state = transitionAcceptanceState(record.state, event);
  checkpoint = upsertAcceptancePair(checkpoint, {
    ...record,
    state,
    failureReason: state === "failed" ? (patch.failureReason ?? "unspecified") : null,
    evidenceHash: state === "accepted" ? (patch.evidenceHash ?? null) : record.evidenceHash,
    evidenceVersion: state === "accepted"
      ? (patch.evidenceVersion ?? null)
      : record.evidenceVersion,
    branches: state === "accepted" ? (patch.branches ?? record.branches) : record.branches,
    updatedAt: new Date().toISOString(),
  });
  writeCheckpoint(checkpoint);
  return checkpoint;
}

function failPair(gameId, seat, reason) {
  return advance(gameId, seat, "fail", { failureReason: reason });
}

// --- LOCAL: INNER record bytes → opaque id → mapper → validate → replay. ---

const recordBytes = new Uint8Array(readFileSync(options.record));
const digest = createHash("sha256").update(recordBytes).digest("hex");
// §14: opaque content-hash game id. The raw Mahjong Soul record id never
// enters any output; the mapper's recordId parameter feeds only in-memory
// sourceRecordRefs (audit fidelity), which are not persisted by this script.
const gameId = `majsoul-g:${digest.slice(0, 16)}`;
const seat = options.seat;
// NTFS forbids ':' in file names — the artifact/cache file key sanitizes it.
const fileKey = `${gameId}#${seat}`.replaceAll(":", "-");
const cachePath = join(cacheDir, `${fileKey}.json`);

let record = findAcceptancePair(checkpoint, gameId, seat, "mahjong_soul");
if (record === null) {
  checkpoint = upsertAcceptancePair(checkpoint, {
    gameId,
    seat,
    sourceType: "mahjong_soul",
    state: "local_ready",
    attempts: 0,
    failureReason: null,
    evidenceHash: null,
    evidenceVersion: null,
    branches: [],
    updatedAt: new Date().toISOString(),
  });
  writeCheckpoint(checkpoint);
  record = findAcceptancePair(checkpoint, gameId, seat, "mahjong_soul");
}
if (record.state === "accepted" || record.state === "failed") {
  // Idempotent re-run: a terminal pair is never re-executed (§4).
  console.error(`PAIR ${fileKey}: terminal ${record.state} — nothing to do`);
} else {
  const bundleRoot = fileURLToPath(new URL("../vendor/mahjong-soul-protocol/", import.meta.url));
  const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
  const mapped = mapMahjongSoulRecord({
    gameId,
    selfActor: seat,
    recordId: `majsoul-opaque:${digest.slice(0, 16)}`,
    recordBytes,
    bundle,
  });
  if (mapped.status !== "ready") {
    checkpoint = failPair(gameId, seat, `local_map_failed:${mapped.code}`);
    console.error(`LOCAL FAIL ${fileKey}: ${mapped.code}`);
  } else {
    const validation = validateCanonicalEventStream(mapped.stream);
    if (validation.status !== "valid") {
      checkpoint = failPair(gameId, seat, `local_validation_failed:${validation.code}`);
      console.error(`LOCAL FAIL ${fileKey}: ${validation.code}`);
    } else {
      let decisions = null;
      try {
        decisions = replayCanonicalStream(mapped.stream);
      } catch (error) {
        decisions = null;
        console.error(
          `LOCAL REPLAY ERROR ${fileKey}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (decisions === null || decisions.length === 0) {
        checkpoint = failPair(gameId, seat, "local_replay_failed");
        console.error(`LOCAL FAIL ${fileKey}: local_replay_failed`);
      } else {
        const local = { stream: mapped.stream, decisions };
        console.error(
          `LOCAL OK ${fileKey}: ${mapped.stream.events.length} events, ${decisions.length} decisions`,
        );

        // --- MODEL: cached report | local raw body | operator result URL. ---

        if (!existsSync(cachePath) && record.state === "local_ready") {
          // Local side proven: the pair is selected for submission. The
          // submission itself is the operator's out-of-band browser action
          // (this script never posts to Mortal); the result URL (and
          // optionally the local raw body) arrive on this or a later run.
          checkpoint = advance(gameId, seat, "select_for_submission");
          record = findAcceptancePair(checkpoint, gameId, seat, "mahjong_soul");
          if (options.resultUrlFile === null) {
            console.error(
              `PENDING ${fileKey}: give --result-url-file (and optionally --report-body) on the next run`,
            );
          }
        }
        record = findAcceptancePair(checkpoint, gameId, seat, "mahjong_soul");
        if (
          !existsSync(cachePath)
          && options.resultUrlFile !== null
          && ["mortal_submission_pending", "mortal_submitted", "report_pending"].includes(
            record.state,
          )
        ) {
          const url = readFileSync(options.resultUrlFile, "utf8").trim();
          const budget = {
            maxRequestsPerRun: options.maxRequests,
            baseDelayMs: options.baseDelayMs,
            jitterMs: options.jitterMs,
            seed: options.seed,
          };
          if (record.state === "mortal_submission_pending") {
            checkpoint = advance(gameId, seat, "submission_confirmed");
            record = findAcceptancePair(checkpoint, gameId, seat, "mahjong_soul");
          }
          if (record.state === "mortal_submitted") {
            checkpoint = advance(gameId, seat, "poll_started");
            record = findAcceptancePair(checkpoint, gameId, seat, "mahjong_soul");
          }
          let report = null;
          for (let attempt = 1; attempt <= options.pollAttempts; attempt += 1) {
            const delay = delayBeforeRequestMs(attempt, budget);
            console.error(`FETCH ${fileKey} attempt ${attempt}/${options.pollAttempts} in ${delay}ms`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            try {
              if (options.reportBody !== null) {
                // Zero-network mode (H2): the REAL result URL is parsed and
                // host-validated by fetchMortalReport; the body is served
                // from the locally saved raw bytes through the injected
                // fetch — the full production parse path runs untouched.
                const body = readFileSync(options.reportBody);
                report = await fetchMortalReport({
                  url,
                  fetchImpl: async () =>
                    new Response(body, {
                      status: 200,
                      headers: { "content-type": "application/json" },
                    }),
                });
              } else {
                report = await fetchMortalReport({ url, timeoutMs: 30_000 });
              }
              break;
            } catch (error) {
              console.error(
                `FETCH MISS ${fileKey} attempt ${attempt}/${options.pollAttempts}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
          }
          if (report === null) {
            // Not failed — resumable: the operator's review may still be queued.
            console.error(`POLL EXHAUSTED ${fileKey}: stays report_pending for the next run`);
          } else {
            writePrivate(cachePath, JSON.stringify(report, null, 2));
            checkpoint = advance(gameId, seat, "report_fetched");
            console.error(`REPORT OK ${fileKey}`);
          }
          record = findAcceptancePair(checkpoint, gameId, seat, "mahjong_soul");
        } else if (existsSync(cachePath) && record.state !== "report_ready") {
          // Cached success short-circuits (never refetch, §4).
          while (record.state !== "report_ready") {
            const event = record.state === "local_ready"
              ? "select_for_submission"
              : record.state === "mortal_submission_pending"
                ? "submission_confirmed"
                : record.state === "mortal_submitted"
                  ? "poll_started"
                  : "report_fetched";
            checkpoint = advance(gameId, seat, event);
            record = findAcceptancePair(checkpoint, gameId, seat, "mahjong_soul");
          }
          console.error(`CACHE HIT ${fileKey}: cached report, no fetch`);
        }

        // --- E2E: shared acceptance core (single implementation). ---

        if (record.state === "report_ready") {
          const cachedReport = JSON.parse(readFileSync(cachePath, "utf8"));
          const resourcesDir = fileURLToPath(new URL("../resources/", import.meta.url));
          const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(resourcesDir));
          const evidenceRun = await runMortalAcceptanceEvidence({
            local: {
              sourceKind: "mahjong_soul",
              opaqueGameId: gameId,
              selfActor: seat,
              canonicalStream: local.stream,
              replayedDecisions: local.decisions,
            },
            report: cachedReport,
            engine,
            evidenceVersion: options.evidenceVersion,
          }).finally(() => engine.close());
          if (evidenceRun.status === "review_failed") {
            checkpoint = failPair(gameId, seat, `review_failed:${evidenceRun.code}`);
            console.error(`E2E FAIL ${fileKey}: ${evidenceRun.code}`);
          } else if (evidenceRun.status === "no_analysis_ready_branch_evidence") {
            checkpoint = failPair(
              gameId,
              seat,
              "no_analysis_ready_branch_evidence",
            );
            console.error(
              `E2E FAIL ${fileKey}: no analysis_ready branch evidence (${evidenceRun.analysisReadyRowCount} rows)`,
            );
          } else {
            checkpoint = advance(gameId, seat, "review_finished");
            writePrivate(
              join(artifactsDir, `${fileKey}.json`),
              `${JSON.stringify(evidenceRun.artifact, null, 2)}\n`,
            );
            checkpoint = advance(gameId, seat, "evidence_recorded", {
              evidenceHash: evidenceRun.evidenceHash,
              evidenceVersion: options.evidenceVersion,
              branches: [...evidenceRun.evidence.branches],
            });
            console.error(
              `ACCEPTED ${fileKey}: branches [${evidenceRun.evidence.branches.join(", ")}]`
              + ` evidence ${evidenceRun.evidenceHash.slice(0, 19)}…`,
            );
          }
        }
      }
    }
  }
}

// --- MANIFEST: rebuild from every accepted sample in this state dir. ---

const samples = [];
for (const pair of checkpoint.pairs) {
  if (pair.state !== "accepted") continue;
  const pairFileKey = `${pair.gameId}#${pair.seat}`.replaceAll(":", "-");
  const pairCachePath = join(cacheDir, `${pairFileKey}.json`);
  if (!existsSync(pairCachePath)) {
    fail(`checkpoint/cache inconsistency: accepted ${pairFileKey} has no cached report`);
  }
  const report = JSON.parse(readFileSync(pairCachePath, "utf8"));
  for (const branch of pair.branches) {
    samples.push({
      branch,
      evidenceVersion: pair.evidenceVersion ?? options.evidenceVersion,
      evidenceHash: pair.evidenceHash ?? "",
      localSourceType: pair.sourceType ?? "mahjong_soul",
      modelAdapterVersion: report.adapterVersion,
      ...(report.modelTag !== undefined ? { modelTag: report.modelTag } : {}),
    });
  }
}
const manifest = buildMortalCoverageEvidenceManifest(samples);
writePrivate(evidencePath, `${JSON.stringify(manifest, null, 2)}\n`);

// --- §23-safe run summary (counts + opaque ids only). ---

const stateCounts = {};
for (const pair of checkpoint.pairs) {
  stateCounts[pair.state] = (stateCounts[pair.state] ?? 0) + 1;
}
const branchTotals = {};
for (const entry of manifest.entries) {
  branchTotals[entry.branch] = entry.acceptedRealSampleCount;
}
console.log(
  JSON.stringify({
    run: { sourceKind: "mahjong_soul", pair: fileKey, evidenceVersion: options.evidenceVersion },
    pairStates: stateCounts,
    acceptedBranchSampleCounts: branchTotals,
  }),
);
