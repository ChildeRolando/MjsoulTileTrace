#!/usr/bin/env node
/**
 * M6-A3 §2/§4/§5 — live Mortal acceptance runner (FULL E2E owner).
 *
 *   node scripts/tenhou-acceptance.mjs <log1.xml> [log2.xml ...] \
 *     --discovery report.json --state-dir <dir> [--evidence out.json] \
 *     [--max-requests 2] [--base-delay-ms 10000] [--jitter-ms 2000] \
 *     [--seed 20260816] [--poll-attempts 8] \
 *     [--evidence-version m6-a3-acceptance/v1]
 *
 * This script owns the WHOLE acceptance chain, calling the same production
 * primitives the desktop pipeline calls — no second parser, no bypass:
 *
 *   LOCAL   raw mjloggm → mapTenhouRecord (selfActor=seat) → replayCanonicalStream
 *   MODEL   fetchMortalReport (approved mjai.ekyu.moe report URL)
 *   E2E     runMortalFullGameReview (binding → correspondence → coverage →
 *           StructuredComparisonSet → ModelEvaluation → assembly) →
 *           extractAcceptedBranchEvidence → buildRedactedAcceptanceArtifact →
 *           sha256 evidence hash → MortalCoverageEvidenceManifest
 *
 * §4 STOP-CLAUSE FINDING (2026-08-16, pinned against the live site):
 * mjai.ekyu.moe has NO automatable submission transport. The only submission
 * surface is the HTML form `POST /review` gated by Cloudflare Turnstile
 * (sitekey 0x4AAAAAAAAnc33mIX4aonHH; both submit buttons stay disabled until
 * the challenge callback fires), it takes a Tenhou/RiichiCity/Hime log URL or
 * tenhou.net/6 log id (not a raw log upload), and no API is documented.
 * Automating it would mean defeating the operator's bot protection — not a
 * "safe" transport. Therefore the mortal_submission_pending →
 * mortal_submitted transition is OPERATOR-ASSISTED, exactly like the desktop
 * diagnostic runner: the operator submits the selected (game, seat) pairs in
 * their own browser and drops each result URL into
 * `<state-dir>/inbox/<gameId>#<seat>.url`. Nothing here fakes acceptance: a
 * pair becomes `accepted` only after a real fetched report passes the full
 * E2E chain, and pairs without an operator submission stay fail-closed in
 * `mortal_submission_pending`.
 *
 * Safety (§4): strictly sequential; ≥10s base delay + deterministic seeded
 * jitter before EVERY fetch; (game, seat) dedupe; successful reports cached
 * under `<state-dir>/cache/` and never resubmitted; hard per-run budget on
 * NEW submissions (--max-requests, default 2); bounded polling per pair.
 *
 * Privacy (§15/§23): the state dir is private (0600 files) and holds the
 * only secret/result locators (inbox URLs, cached report bytes). The
 * checkpoint, artifacts, evidence manifest, and this script's console
 * output carry opaque game hashes, seats, ordinals, branch names, model
 * tags/versions, and evidence hashes only.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canTransitionAcceptance,
  createEmptyAcceptanceCheckpoint,
  delayBeforeRequestMs,
  findAcceptancePair,
  MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION,
  parseAcceptanceCheckpointFile,
  planAcceptanceRun,
  transitionAcceptanceState,
  upsertAcceptancePair,
} from "@riichi-coach/tenhou-source";
import { fetchMortalReport } from "@riichi-coach/mortal-source";
import {
  buildMortalCoverageEvidenceManifest,
  buildRedactedAcceptanceArtifact,
  extractAcceptedBranchEvidence,
  createMortalCoverageRegistry,
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
  MORTAL_COVERAGE_BRANCHES,
  replayCanonicalStream,
  runMortalFullGameReview,
} from "@riichi-coach/reasoning";
import { mapTenhouRecord } from "@riichi-coach/tenhou-source";

function parseArgs(argv) {
  const files = [];
  const options = {
    discovery: null,
    stateDir: null,
    evidence: null,
    maxRequests: 2,
    baseDelayMs: 10_000,
    jitterMs: 2_000,
    seed: 20_260_816,
    pollAttempts: 8,
    evidenceVersion: "m6-a3-acceptance/v1",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--discovery") {
      options.discovery = argv[++index] ?? fail("--discovery requires a path");
    } else if (arg === "--state-dir") {
      options.stateDir = argv[++index] ?? fail("--state-dir requires a path");
    } else if (arg === "--evidence") {
      options.evidence = argv[++index] ?? fail("--evidence requires a path");
    } else if (arg === "--max-requests") {
      options.maxRequests = intOption(argv, index, "--max-requests", 1);
      index += 1;
    } else if (arg === "--base-delay-ms") {
      options.baseDelayMs = intOption(argv, index, "--base-delay-ms", 0);
      index += 1;
    } else if (arg === "--jitter-ms") {
      options.jitterMs = intOption(argv, index, "--jitter-ms", 0);
      index += 1;
    } else if (arg === "--seed") {
      options.seed = intOption(argv, index, "--seed", 0);
      index += 1;
    } else if (arg === "--poll-attempts") {
      options.pollAttempts = intOption(argv, index, "--poll-attempts", 1);
      index += 1;
    } else if (arg === "--evidence-version") {
      options.evidenceVersion = argv[++index]
        ?? fail("--evidence-version requires a value");
    } else if (arg.startsWith("--")) {
      fail(`unknown option ${arg}`);
    } else {
      files.push(arg);
    }
  }
  if (files.length === 0 || options.discovery === null || options.stateDir === null) {
    fail(
      "usage: tenhou-acceptance.mjs <log1.xml> [log2.xml ...] --discovery report.json" +
        " --state-dir <dir> [--evidence out.json] [--max-requests N] [--poll-attempts N]",
    );
  }
  return { files, options };
}

function intOption(argv, index, name, min) {
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < min) {
    fail(`${name} requires an integer >= ${min}`);
  }
  return value;
}

function fail(message) {
  console.error(String(message));
  process.exit(2);
}

const { files, options } = parseArgs(process.argv.slice(2));

const stateDir = options.stateDir;
const cacheDir = join(stateDir, "cache");
const inboxDir = join(stateDir, "inbox");
const artifactsDir = join(stateDir, "artifacts");
for (const dir of [stateDir, cacheDir, inboxDir, artifactsDir]) {
  mkdirSync(dir, { recursive: true });
}
const checkpointPath = join(stateDir, "checkpoint.json");
const evidencePath = options.evidence ?? join(stateDir, "evidence-manifest.json");

function pairKey(gameId, seat) {
  return `${gameId}#${seat}`;
}

/** Atomic 0600 write — a half-written checkpoint must never be loaded. */
function writePrivate(path, text) {
  const temp = `${path}.tmp`;
  writeFileSync(temp, text, { mode: 0o600 });
  renameSync(temp, path);
}

function writeCheckpoint(checkpoint) {
  writePrivate(
    checkpointPath,
    JSON.stringify(
      { ...checkpoint, schemaVersion: MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION },
      null,
      2,
    ),
  );
}

function loadCheckpoint() {
  if (!existsSync(checkpointPath)) return createEmptyAcceptanceCheckpoint();
  return parseAcceptanceCheckpointFile(
    JSON.parse(readFileSync(checkpointPath, "utf8")),
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One transition per checkpoint write: an interrupted run resumes at the
// last durable state (§5).
function advance(checkpoint, gameId, seat, event, patch = {}) {
  const record = findAcceptancePair(checkpoint, gameId, seat);
  if (record === null) {
    throw new Error(`acceptance_pair_missing:${pairKey(gameId, seat)}`);
  }
  const state = transitionAcceptanceState(record.state, event);
  const next = upsertAcceptancePair(checkpoint, {
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
  writeCheckpoint(next);
  return next;
}

function failPair(checkpoint, gameId, seat, reason) {
  return advance(checkpoint, gameId, seat, "fail", { failureReason: reason });
}

// --- Inputs: raw files by opaque content-hash id + discovery selection. ---

const rawByGameId = new Map();
for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const digest = createHash("sha256").update(raw, "utf8").digest("hex");
  const gameId = `tenhou-g:${digest.slice(0, 16)}`;
  rawByGameId.set(gameId, { raw, sha256: digest });
}

const discovery = JSON.parse(readFileSync(options.discovery, "utf8"));
if (!Array.isArray(discovery.selectionPairs)) {
  fail("discovery report has no selectionPairs — run scripts/tenhou-discovery.mjs first");
}
const selection = discovery.selectionPairs
  .filter((pair) => rawByGameId.has(pair.gameId))
  .map((pair) => ({ gameId: pair.gameId, seat: pair.seat }));
const missingFiles = discovery.selectionPairs.filter(
  (pair) => !rawByGameId.has(pair.gameId),
).length;

const budget = {
  maxRequestsPerRun: options.maxRequests,
  baseDelayMs: options.baseDelayMs,
  jitterMs: options.jitterMs,
  seed: options.seed,
};

let checkpoint = loadCheckpoint();

// --- Stage 1 (LOCAL): raw → mapper → replay, per selected pair. ---

const decisionsByPair = new Map();
for (const pair of selection) {
  const existing = findAcceptancePair(checkpoint, pair.gameId, pair.seat);
  if (existing !== null && existing.state !== "local_ready") continue; // already past local
  const source = rawByGameId.get(pair.gameId);
  const mapped = mapTenhouRecord({
    raw: source.raw,
    gameId: pair.gameId,
    selfActor: pair.seat,
  });
  if (mapped.status !== "ready") {
    checkpoint = upsertAcceptancePair(checkpoint, {
      gameId: pair.gameId,
      seat: pair.seat,
      state: "failed",
      attempts: existing?.attempts ?? 0,
      failureReason: `local_map_failed:${mapped.status}`,
      evidenceHash: null,
      evidenceVersion: null,
      branches: [],
      updatedAt: new Date().toISOString(),
    });
    writeCheckpoint(checkpoint);
    console.error(`LOCAL FAIL ${pairKey(pair.gameId, pair.seat)}: ${mapped.status}`);
    continue;
  }
  let replayDecisions;
  try {
    replayDecisions = replayCanonicalStream(mapped.stream);
  } catch (error) {
    // A game the local pipeline cannot replay (e.g. a west round) fails this
    // pair closed — it can never be acceptance evidence.
    const code = error instanceof Error ? error.message.slice(0, 80) : "unknown";
    checkpoint = upsertAcceptancePair(checkpoint, {
      gameId: pair.gameId,
      seat: pair.seat,
      state: "failed",
      attempts: 0,
      failureReason: `local_replay_failed:${code}`,
      evidenceHash: null,
      evidenceVersion: null,
      branches: [],
      updatedAt: new Date().toISOString(),
    });
    writeCheckpoint(checkpoint);
    console.error(`LOCAL FAIL ${pairKey(pair.gameId, pair.seat)}: replay ${code}`);
    continue;
  }
  if (replayDecisions.length === 0) {
    checkpoint = upsertAcceptancePair(checkpoint, {
      gameId: pair.gameId,
      seat: pair.seat,
      state: "failed",
      attempts: 0,
      failureReason: "local_replay_no_decisions",
      evidenceHash: null,
      evidenceVersion: null,
      branches: [],
      updatedAt: new Date().toISOString(),
    });
    writeCheckpoint(checkpoint);
    console.error(`LOCAL FAIL ${pairKey(pair.gameId, pair.seat)}: no decisions`);
    continue;
  }
  decisionsByPair.set(pairKey(pair.gameId, pair.seat), {
    stream: mapped.stream,
    decisions: replayDecisions,
  });
  if (existing === null) {
    checkpoint = upsertAcceptancePair(checkpoint, {
      gameId: pair.gameId,
      seat: pair.seat,
      state: "local_ready",
      attempts: 0,
      failureReason: null,
      evidenceHash: null,
      evidenceVersion: null,
      branches: [],
      updatedAt: new Date().toISOString(),
    });
    writeCheckpoint(checkpoint);
  }
}

// --- Stage 2 (PLAN + SUBMISSION): budget, dedupe, operator worklist. ---

const plan = planAcceptanceRun({
  selection,
  cachedSuccesses: checkpoint.pairs
    .filter((pair) => pair.state === "accepted")
    .map((pair) => ({ gameId: pair.gameId, seat: pair.seat })),
  // Pairs already past local_ready have a submission charged in an earlier
  // run — they must not consume THIS run's budget. Transport/review failures
  // re-enter under the budget as retries; deterministic local-stage failures
  // are terminal (the runner refuses to retry them) and must not consume a
  // submission slot that a viable pair could use.
  checkpoint: [
    ...checkpoint.pairs
      .filter((pair) => pair.state !== "local_ready" && pair.state !== "failed")
      .map((pair) => ({
        gameId: pair.gameId,
        seat: pair.seat,
        status: "succeeded",
        attempts: pair.attempts,
      })),
    ...checkpoint.pairs
      .filter((pair) => pair.state === "failed")
      .map((pair) => ({
        gameId: pair.gameId,
        seat: pair.seat,
        status: "failed",
        attempts: pair.attempts,
        terminal: (pair.failureReason ?? "").startsWith("local_"),
      })),
  ],
  budget,
});

let newSubmissionsThisRun = 0;
for (const item of plan) {
  let record = findAcceptancePair(checkpoint, item.gameId, item.seat);
  if (record === null) continue;
  if (item.reason === "submit") {
    if (record.state === "failed") {
      // Local-side failures are deterministic: retrying them would burn the
      // whole budget every run on a pair that can never succeed. Only
      // transport/review failures are retryable.
      if (record.failureReason?.startsWith("local_")) continue;
      // A retried pair re-enters the pipeline at local_ready under budget.
      if (!canTransitionAcceptance(record.state, "retry")) continue;
      checkpoint = advance(checkpoint, item.gameId, item.seat, "retry");
      record = findAcceptancePair(checkpoint, item.gameId, item.seat);
    }
    if (canTransitionAcceptance(record.state, "select_for_submission")) {
      checkpoint = advance(
        checkpoint,
        item.gameId,
        item.seat,
        "select_for_submission",
      );
      const reloaded = findAcceptancePair(checkpoint, item.gameId, item.seat);
      checkpoint = upsertAcceptancePair(checkpoint, {
        ...reloaded,
        attempts: item.attempts,
      });
      writeCheckpoint(checkpoint);
      newSubmissionsThisRun += 1;
    }
  } else if (item.reason.startsWith("skip_")) {
    // Budget/dedupe/cache skips leave the pair exactly where it is.
  }
}

// --- Stage 3 (MODEL): operator-supplied result URL → real report fetch. ---

let fetchOrdinal = 0;
let fetchesThisRun = 0;

async function fetchWithSchedule(url, onWait) {
  fetchOrdinal += 1;
  fetchesThisRun += 1;
  const delay = delayBeforeRequestMs(fetchOrdinal, budget);
  onWait?.(delay);
  await sleep(delay);
  return fetchMortalReport({ url, timeoutMs: 30_000 });
}

// Stage 3 advances ANY live pair — including pairs selected in an earlier
// run whose discovery selection has since changed. A pair waiting on its
// inbox URL must not be orphaned just because this run's selection moved on.
const stagePairs = [];
const stageSeen = new Set();
for (const pair of selection) {
  stagePairs.push(pair);
  stageSeen.add(pairKey(pair.gameId, pair.seat));
}
for (const pair of checkpoint.pairs) {
  const key = pairKey(pair.gameId, pair.seat);
  // local_ready pairs outside the selection were never planned for
  // submission this run; everything past local_ready still consumes its
  // inbox URL / cache / poll state.
  if (stageSeen.has(key) || pair.state === "local_ready") continue;
  if (pair.state === "accepted" || pair.state === "failed") continue;
  stagePairs.push({ gameId: pair.gameId, seat: pair.seat });
  stageSeen.add(key);
}

for (const pair of stagePairs) {
  const key = pairKey(pair.gameId, pair.seat);
  let record = findAcceptancePair(checkpoint, pair.gameId, pair.seat);
  if (record === null || record.state === "accepted" || record.state === "failed") {
    continue;
  }
  const cachePath = join(cacheDir, `${key}.json`);
  const inboxPath = join(inboxDir, `${key}.url`);

  // Cached success short-circuits everything (never resubmit, §4).
  if (existsSync(cachePath)) {
    if (record.state === "local_ready"
      || record.state === "mortal_submission_pending"
      || record.state === "mortal_submitted"
      || record.state === "report_pending") {
      while (record.state !== "report_ready") {
        const event = record.state === "local_ready"
          ? "select_for_submission"
          : record.state === "mortal_submission_pending"
            ? "submission_confirmed"
            : record.state === "mortal_submitted"
              ? "poll_started"
              : "report_fetched";
        checkpoint = advance(checkpoint, pair.gameId, pair.seat, event);
        record = findAcceptancePair(checkpoint, pair.gameId, pair.seat);
      }
      console.error(`CACHE HIT ${key}: cached report, no submission`);
    }
  } else if (record.state === "mortal_submission_pending" && existsSync(inboxPath)) {
    // Operator confirmed a submission by dropping the result URL.
    checkpoint = advance(checkpoint, pair.gameId, pair.seat, "submission_confirmed");
    checkpoint = advance(checkpoint, pair.gameId, pair.seat, "poll_started");
    record = findAcceptancePair(checkpoint, pair.gameId, pair.seat);
    const url = readFileSync(inboxPath, "utf8").trim();
    let report = null;
    for (let attempt = 1; attempt <= options.pollAttempts; attempt += 1) {
      try {
        report = await fetchWithSchedule(url, (delay) => {
          console.error(`FETCH ${key} attempt ${attempt}/${options.pollAttempts} in ${delay}ms`);
        });
        break;
      } catch (error) {
        console.error(
          `FETCH MISS ${key} attempt ${attempt}/${options.pollAttempts}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (report === null) {
      // Not failed — resumable: the report may simply still be queued.
      console.error(`POLL EXHAUSTED ${key}: stays report_pending for the next run`);
      continue;
    }
    writePrivate(cachePath, JSON.stringify(report, null, 2));
    checkpoint = advance(checkpoint, pair.gameId, pair.seat, "report_fetched");
    record = findAcceptancePair(checkpoint, pair.gameId, pair.seat);
  } else if (record.state === "report_pending") {
    // A previous run's poll exhausted; retry from the inbox URL if present.
    if (!existsSync(inboxPath)) continue;
    const url = readFileSync(inboxPath, "utf8").trim();
    let report = null;
    for (let attempt = 1; attempt <= options.pollAttempts; attempt += 1) {
      try {
        report = await fetchWithSchedule(url, (delay) => {
          console.error(`FETCH ${key} attempt ${attempt}/${options.pollAttempts} in ${delay}ms`);
        });
        break;
      } catch (error) {
        console.error(
          `FETCH MISS ${key} attempt ${attempt}/${options.pollAttempts}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (report === null) {
      console.error(`POLL EXHAUSTED ${key}: stays report_pending for the next run`);
      continue;
    }
    writePrivate(cachePath, JSON.stringify(report, null, 2));
    checkpoint = advance(checkpoint, pair.gameId, pair.seat, "report_fetched");
    record = findAcceptancePair(checkpoint, pair.gameId, pair.seat);
  }

  // --- Stage 4 (E2E): review → evidence → redacted artifact → hash. ---

  if (record.state !== "report_ready") continue;
  const cachedReport = existsSync(cachePath)
    ? JSON.parse(readFileSync(cachePath, "utf8"))
    : null;
  if (cachedReport === null) {
    checkpoint = failPair(checkpoint, pair.gameId, pair.seat, "report_cache_missing");
    console.error(`E2E FAIL ${key}: report_cache_missing`);
    continue;
  }
  const local = decisionsByPair.get(key)
    ?? (() => {
      // Pairs from a previous run re-derive the local side deterministically.
      const source = rawByGameId.get(pair.gameId);
      if (source === undefined) return null; // raw not passed this run
      const mapped = mapTenhouRecord({
        raw: source.raw,
        gameId: pair.gameId,
        selfActor: pair.seat,
      });
      if (mapped.status !== "ready") return null;
      try {
        const decisions = replayCanonicalStream(mapped.stream);
        return decisions.length === 0
          ? null
          : { stream: mapped.stream, decisions };
      } catch {
        return null;
      }
    })();
  if (local === null) {
    checkpoint = failPair(checkpoint, pair.gameId, pair.seat, "local_side_unavailable");
    console.error(`E2E FAIL ${key}: local_side_unavailable`);
    continue;
  }

  const resourcesDir = fileURLToPath(new URL("../resources/", import.meta.url));
  const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(resourcesDir));
  let review;
  try {
    // Acceptance mode: the runner is the evidence PRODUCER, so the coverage
    // gate is wide open here — production consumers lift from the evidence
    // manifest only (createMortalCoverageRegistryFromManifest), never from
    // this call.
    review = await runMortalFullGameReview({
      stream: local.stream,
      decisions: local.decisions,
      report: cachedReport,
      engine,
      coverageRegistry: createMortalCoverageRegistry(MORTAL_COVERAGE_BRANCHES),
    });
  } finally {
    await engine.close();
  }
  if (review.status !== "coverage_ready") {
    checkpoint = failPair(checkpoint, pair.gameId, pair.seat, `review_failed:${review.code}`);
    console.error(`E2E FAIL ${key}: ${review.code}`);
    continue;
  }
  checkpoint = advance(checkpoint, pair.gameId, pair.seat, "review_finished");
  record = findAcceptancePair(checkpoint, pair.gameId, pair.seat);

  const evidence = extractAcceptedBranchEvidence({
    stream: local.stream,
    decisions: local.decisions,
    report: cachedReport,
    review,
  });
  if (evidence.analysisReadyRowCount === 0 || evidence.branches.length === 0) {
    checkpoint = failPair(
      checkpoint,
      pair.gameId,
      pair.seat,
      "no_analysis_ready_branch_evidence",
    );
    console.error(
      `E2E FAIL ${key}: no analysis_ready branch evidence (${evidence.analysisReadyRowCount} rows)`,
    );
    continue;
  }
  const artifact = buildRedactedAcceptanceArtifact({
    gameId: pair.gameId,
    seat: pair.seat,
    report: cachedReport,
    review,
    evidence,
  });
  const evidenceHash = `sha256:${createHash("sha256")
    .update(JSON.stringify(artifact), "utf8")
    .digest("hex")}`;
  writePrivate(
    join(artifactsDir, `${key}.json`),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  checkpoint = advance(checkpoint, pair.gameId, pair.seat, "evidence_recorded", {
    evidenceHash,
    evidenceVersion: options.evidenceVersion,
    branches: [...evidence.branches],
  });
  console.error(
    `ACCEPTED ${key}: branches [${evidence.branches.join(", ")}] evidence ${evidenceHash.slice(0, 19)}…`,
  );
}

// --- §4 operator worklist: EVERY pair currently awaiting an operator
// submission — including pairs selected in earlier runs — not just this
// run's fresh selects. Opaque ids + content hashes + branches only (§15).

const operatorWorklist = [];
for (const pair of checkpoint.pairs) {
  if (pair.state !== "mortal_submission_pending") continue;
  const key = pairKey(pair.gameId, pair.seat);
  const source = rawByGameId.get(pair.gameId);
  const branches = discovery.selectionPairs.find(
    (entry) => entry.gameId === pair.gameId && entry.seat === pair.seat,
  )?.branches ?? [];
  operatorWorklist.push({
    key,
    ...(source === undefined
      ? {
          contentSha256: null,
          note: "raw log not passed this run — include it on the next run",
        }
      : { contentSha256: source.sha256 }),
    seat: pair.seat,
    branches,
  });
}

// --- Stage 5 (MANIFEST): rebuild from every accepted sample, write. ---

const samples = [];
for (const pair of checkpoint.pairs) {
  if (pair.state !== "accepted") continue;
  const cachePath = join(cacheDir, `${pairKey(pair.gameId, pair.seat)}.json`);
  if (!existsSync(cachePath)) {
    fail(`checkpoint/cache inconsistency: accepted ${pairKey(pair.gameId, pair.seat)} has no cached report`);
  }
  const report = JSON.parse(readFileSync(cachePath, "utf8"));
  for (const branch of pair.branches) {
    samples.push({
      branch,
      evidenceVersion: pair.evidenceVersion ?? options.evidenceVersion,
      evidenceHash: pair.evidenceHash ?? "",
      localSourceType: "tenhou",
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
  JSON.stringify(
    {
      run: {
        newSubmissions: newSubmissionsThisRun,
        reportFetches: fetchesThisRun,
        budgetMaxRequests: options.maxRequests,
        selectionPairs: selection.length,
        selectionPairsWithoutLocalFile: missingFiles,
      },
      pairStates: stateCounts,
      acceptedBranchSampleCounts: branchTotals,
      operatorWorklist, // opaque ids + content hashes + branches only
      evidenceManifestPath: evidencePath,
    },
    null,
    2,
  ),
);
if (operatorWorklist.length > 0) {
  console.error(
    `\nOPERATOR ACTION REQUIRED (${operatorWorklist.length} pair(s) await submission):\n` +
      "  1. Identify each game by its content sha256 (below) among your local logs.\n" +
      "  2. Submit game + seat at https://mjai.ekyu.moe/ in your own browser\n" +
      "     (engine Mortal; submission is Turnstile-gated — no automated transport).\n" +
      "  3. Save each result URL into: <state-dir>/inbox/<gameId>#<seat>.url\n" +
      "  4. Re-run this script; it resumes from the checkpoint.",
  );
}
