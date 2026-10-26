#!/usr/bin/env node
/**
 * Paired Self-RAG study harness (COAC-267).
 *
 *   node bin/selfrag-study.mjs prepare --artifacts <dir> --seed <seed>
 *   node bin/selfrag-study.mjs verify  --artifacts <dir> [--phase pilot|evaluation]
 *   node bin/selfrag-study.mjs run     --artifacts <dir> [--phase ...] [--case <id>] [--arm ...]
 *   node bin/selfrag-study.mjs report  --artifacts <dir> [--judge-reasons | --reason-review <file>]
 *
 * `prepare` freezes every input (research subset, exclusions, scene sample,
 * queries, candidate passages, prejudge) with one AI call per case. `verify`
 * re-reads the frozen inputs before a batch. `run` executes the pre-declared
 * schedule once per attempt. `report` derives the paired metrics.
 *
 * This harness never edits the Arena gate, contracts, desktop code, or any
 * package.json; it only consumes their public exports.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ArenaRunAliasVault,
  createArenaBlindObservation,
  createArenaBlindRuleRequest,
  screenArenaDecisions,
} from "@riichi-coach/desktop/blind-discard-arena";
import { createArenaRagRetriever } from "@riichi-coach/desktop/blind-discard-arena-rag";
import { createArenaToolCallProvider } from "@riichi-coach/desktop/llm-provider/service";
import { createLibriichiRuleProjector, replayCanonicalStream } from "@riichi-coach/reasoning";
import { LibriichiRuleResponseSchema, libriichiRuleCanonicalJson } from "@riichi-coach/contracts";
import { mapMjaiRecord } from "../scripts/replay-corpus/canonical.mjs";

import { digestOf, sha256Bytes, studyError } from "../scripts/selfrag-study/canonical.mjs";
import {
  SELF_RAG_STUDY_DEFAULTS,
  parseArgs,
  resolveCodexExecutable,
  usage,
} from "../scripts/selfrag-study/cli.mjs";
import { openReplayCorpus } from "../scripts/selfrag-study/corpus.mjs";
import {
  SELF_RAG_STUDY_ARTIFACTS,
  SELF_RAG_STUDY_EXECUTION_IDENTITY,
  SELF_RAG_STUDY_PREJUDGE_PROMPT,
  SELF_RAG_STUDY_REASON_REVIEW_PROMPT_VERSION,
  SELF_RAG_STUDY_SELF_ACTOR,
  buildResearchArenaCorpus,
  classifySceneLayers,
  freezeSelectorBudget,
  loadStudyExclusions,
  prepareStudy,
  sceneFactsFromSnapshot,
  verifyStudy,
} from "../scripts/selfrag-study/prepare.mjs";
import { loadResearchSubset } from "../scripts/selfrag-study/knowledge.mjs";
import { readAttempts } from "../scripts/selfrag-study/schedule.mjs";
import { runStudyAttempt, selectSelectorBudget } from "../scripts/selfrag-study/run.mjs";
import {
  computeStudyReport,
  renderStudyReportMarkdown,
  validateReasonReview,
  buildReasonReviewRequest,
} from "../scripts/selfrag-study/report.mjs";

const coachRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(coachRoot, "..");

const DEFAULT_CORPUS = SELF_RAG_STUDY_DEFAULTS.corpus;
const DEFAULT_KNOWLEDGE = SELF_RAG_STUDY_DEFAULTS.knowledge;
const DEFAULT_EXCLUSION_ROOT = SELF_RAG_STUDY_DEFAULTS.exclusionRoot;
const CALL_TIMEOUT_MS = 120_000;
const SELECTOR_MODEL = "gpt-6-luna";
const SELECTOR_EFFORT = "high";
const PROVIDER_VERSION = "codex-cli 0.162.1";

function gitOutput(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function gitHead() {
  const status = gitOutput(["status", "--porcelain", "--untracked-files=all"]);
  return { sha: gitOutput(["rev-parse", "HEAD"]), clean: status.length === 0 };
}

/** Freezes the exact executable, version and model the adapter would run. */
async function providerIdentity() {
  const executablePath = resolveCodexExecutable();
  if (executablePath === null) throw studyError("provider_unavailable");
  const bytes = await readFile(executablePath);
  const version = execFileSync(executablePath, ["--version"], { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (version !== PROVIDER_VERSION) throw studyError("provider_version_mismatch", version);
  return {
    ...SELF_RAG_STUDY_EXECUTION_IDENTITY,
    executablePath,
    executableSha256: sha256Bytes(bytes),
    executableBytes: statSync(executablePath).size,
    cliVersion: version,
  };
}

async function loadArenaApplicabilityModule() {
  try {
    return await import("@riichi-coach/desktop/blind-discard-arena-rag-applicability");
  } catch {
    throw studyError("applicability_gate_unavailable");
  }
}

function gateIdentityFrom(module) {
  return {
    available: true,
    gateVersion: module.ARENA_RAG_APPLICABILITY_GATE_VERSION,
    promptVersion: module.ARENA_RAG_APPLICABILITY_PROMPT_VERSION,
  };
}

async function gateIdentity() {
  return gateIdentityFrom(await loadArenaApplicabilityModule());
}

async function passageCharLimit() {
  const module = await import("@riichi-coach/desktop/blind-discard-arena-rag");
  return module.ARENA_RAG_LIMITS_V1.maxPassageChars;
}

function createProvider() {
  const provider = createArenaToolCallProvider({
    settings: null,
    credentials: { readKey: async () => null },
    fetchImpl: fetch,
    arenaCodex: { modelName: SELECTOR_MODEL, reasoningEffort: SELECTOR_EFFORT },
  });
  if (provider === null) throw studyError("provider_unavailable");
  return provider;
}

function observingProvider(base, observed) {
  return Object.freeze({
    descriptor: base.descriptor,
    async request(request, signal) {
      const result = await base.request(request, signal);
      observed.outputBytes = result?.status === "ready" ? Buffer.byteLength(result.call.arguments, "utf8") : null;
      return result;
    },
  });
}

function withTimeout(operation, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return operation(controller.signal).finally(() => clearTimeout(timer));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJsonExclusive(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

async function writeJsonReplacing(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

function replayGame(gameId, raw) {
  // The corpus carries no rule-set fields; the mapper records them as unknown
  // and the Arena screening rules out decisions without usable rule input.
  const stream = mapMjaiRecord(raw, gameId, SELF_RAG_STUDY_SELF_ACTOR);
  return { stream, decisions: replayCanonicalStream(stream) };
}

async function buildRuleInputs(runtime, stream, decisions) {
  const projectRules = createLibriichiRuleProjector(stream, runtime.ruleIdentity);
  const ruleInputs = [];
  for (let canonicalDecisionOrder = 0; canonicalDecisionOrder < decisions.length; canonicalDecisionOrder += 1) {
    const decision = decisions[canonicalDecisionOrder];
    if (decision === undefined) continue;
    const ruleRequest = createArenaBlindRuleRequest(projectRules(decision));
    let ruleResponse;
    try {
      ruleResponse = LibriichiRuleResponseSchema.parse(await runtime.queryRules(ruleRequest));
    } catch {
      ruleResponse = LibriichiRuleResponseSchema.parse({
        protocolVersion: ruleRequest.protocolVersion,
        requestId: ruleRequest.requestId,
        status: "error",
        code: "rules_runtime_failed",
      });
    }
    ruleInputs.push({
      canonicalDecisionOrder,
      decision: { decisionEventRef: decision.decisionEventRef, snapshot: decision.snapshot, facts: decision.facts },
      ruleRequest,
      ruleResponse,
    });
  }
  return ruleInputs;
}

function requireRecord(corpus, game) {
  return corpus.readRecord({ gameId: game.gameId, sourceHash: game.sourceHash });
}

function createStudyDeps(options) {
  const runtime = options.runtime;
  return {
    gitHead,
    providerIdentity,
    gateIdentity,
    passageCharLimit,
    loadResearchSubset: async () => loadResearchSubset(await readFile(options.knowledgeFile), { knowledgePath: options.knowledgeFile }),
    loadExclusions: async () => loadStudyExclusions({ root: options.exclusionRoot }),
    openCorpus: async () => openReplayCorpus(options.corpusFile),
    analyzeGame: async ({ game, corpus }) => {
      try {
        const { stream, decisions } = replayGame(game.gameId, requireRecord(corpus, game).raw);
        const ruleInputs = await buildRuleInputs(runtime, stream, decisions);
        const screening = screenArenaDecisions(ruleInputs, { maxIncluded: 128 });
        const layers = {};
        for (const row of screening.selected) {
          for (const layer of classifySceneLayers(sceneFactsFromSnapshot(row.snapshot))) {
            if (layers[layer] === undefined) layers[layer] = row.canonicalDecisionOrder;
          }
        }
        return { status: "ok", layers };
      } catch (error) {
        return { status: "skipped", reason: String(error?.message ?? "analyze_failed") };
      }
    },
    buildCase: async ({ selected, corpus }) => {
      const { stream, decisions } = replayGame(selected.gameId, requireRecord(corpus, selected).raw);
      const ruleInputs = await buildRuleInputs(runtime, stream, decisions);
      const screening = screenArenaDecisions(ruleInputs, { maxIncluded: 128 });
      const row = screening.selected.find((candidate) => candidate.canonicalDecisionOrder === selected.canonicalDecisionOrder);
      if (row === undefined) throw studyError("study_case_unavailable", selected.caseId);
      const aliases = new ArenaRunAliasVault();
      const observation = createArenaBlindObservation({
        selected: row,
        aliases,
        tools: {
          description: "The generator receives frozen local teaching passages; no tools are available in this study turn.",
          supportedCapabilities: [],
        },
      });
      return { observation, aliases };
    },
    retrieverVersion: "arena-local-terms/v1",
    createRetriever: async ({ caseRef, aliases, researchCorpus }) => createArenaRagRetriever({
      mode: "local",
      caseRef,
      aliases,
      loadCorpus: async () => buildResearchArenaCorpus(researchCorpus.subset),
    }),
    prejudge: async ({ caseId, observation, passages }) => {
      const provider = createProvider();
      const request = prejudgeRequest(observation, passages);
      const started = Date.now();
      const result = await withTimeout((signal) => provider.request(request, signal), CALL_TIMEOUT_MS);
      if (result.status !== "ready") throw studyError("prejudge_provider_failed", result.status);
      let parsed;
      try {
        parsed = JSON.parse(result.call.arguments);
      } catch {
        throw studyError("prejudge_invalid", "json");
      }
      if (parsed?.caseId !== observation.caseRef) throw studyError("prejudge_invalid", "caseRef");
      return { verdicts: parsed.verdicts, usage: result.usage ?? null, elapsedMs: Date.now() - started, judge: provider.descriptor() };
    },
  };
}

function prejudgeRequest(observation, passages) {
  const refs = passages.map((passage) => passage.sourceRef);
  return {
    messages: [
      { role: "system", content: SELF_RAG_STUDY_PREJUDGE_PROMPT },
      { role: "user", content: JSON.stringify({
        observation,
        passages: passages.map((passage) => ({
          sourceRef: passage.sourceRef,
          sourceTitle: passage.sourceTitle,
          documentLocation: passage.documentLocation,
          content: passage.content,
          applicableWhen: passage.applicableWhen,
        })),
      }) },
    ],
    tools: [{
      type: "function",
      function: {
        name: "submit_prejudge",
        description: "Judge every candidate passage independently for this decision.",
        strict: true,
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            caseId: { type: "string", enum: [observation.caseRef] },
            verdicts: {
              type: "array",
              minItems: refs.length,
              maxItems: refs.length,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  sourceRef: { type: "string", enum: refs },
                  verdict: { type: "string", enum: ["useful", "irrelevant", "uncertain"] },
                  reason: { type: "string" },
                },
                required: ["sourceRef", "verdict", "reason"],
              },
            },
          },
          required: ["caseId", "verdicts"],
        },
      },
    }],
    maxOutputTokens: 2048,
    maxInputBytes: 64 * 1024,
    maxOutputBytes: 16 * 1024,
  };
}

async function commandPrepare(options) {
  const artifactDir = resolve(options["--artifacts"]);
  const knowledgeFile = resolve(options["--knowledge"] ?? DEFAULT_KNOWLEDGE);
  const corpusFile = resolve(options["--corpus"] ?? DEFAULT_CORPUS);
  const exclusionRoot = resolve(options["--exclusion-root"] ?? DEFAULT_EXCLUSION_ROOT);
  await gateIdentity();
  await providerIdentity();
  const { createPinnedRuntime } = await import("./blind-discard-arena.mjs");
  const prepared = await createPinnedRuntime(false);
  try {
    const deps = createStudyDeps({ runtime: prepared.runtime, knowledgeFile, corpusFile, exclusionRoot });
    const freeze = await prepareStudy({
      artifactDir,
      seed: options["--seed"],
      deps,
      writeJson: writeJsonExclusive,
    });
    process.stdout.write(`${JSON.stringify({ artifactDir, codeSha: freeze.codeSha, caseIds: freeze.caseIds, verdictCounts: freeze.prejudge.verdictCounts, selectorBudget: freeze.selectorBudget }, null, 2)}\n`);
  } finally {
    await prepared.runtime.close().catch(() => undefined);
  }
}

async function commandVerify(options) {
  const artifactDir = resolve(options["--artifacts"]);
  const deps = {
    gitHead,
    providerIdentity,
    gateIdentity,
    passageCharLimit,
    loadResearchSubset: async () => loadResearchSubset(await readFile(resolve(options["--knowledge"] ?? DEFAULT_KNOWLEDGE)), {
      knowledgePath: resolve(options["--knowledge"] ?? DEFAULT_KNOWLEDGE),
    }),
    loadExclusions: async () => loadStudyExclusions({ root: resolve(options["--exclusion-root"] ?? DEFAULT_EXCLUSION_ROOT) }),
  };
  const result = await verifyStudy({ artifactDir, deps, phase: options["--phase"] ?? "pilot" });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function readRuns(artifactDir) {
  const root = join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.runs);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const runs = [];
  for (const caseEntry of entries) {
    if (!caseEntry.isDirectory()) continue;
    for (const arm of ["baseline", "selfrag"]) {
      let files;
      try {
        files = await readdir(join(root, caseEntry.name, arm));
      } catch {
        continue;
      }
      for (const file of files.filter((name) => /^\d+\.json$/u.test(name))) {
        runs.push(await readJson(join(root, caseEntry.name, arm, file)));
      }
    }
  }
  return runs.sort((left, right) => (left.caseId < right.caseId ? -1 : left.caseId > right.caseId ? 1 : left.arm < right.arm ? -1 : left.arm > right.arm ? 1 : left.attempt - right.attempt));
}

async function commandRun(options) {
  const artifactDir = resolve(options["--artifacts"]);
  const freeze = await readJson(join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.freeze));
  const phase = options["--phase"] ?? (freeze.selectorBudget === null ? "pilot" : "evaluation");
  if (options["--pilot-rerun"] === true && phase !== "pilot") throw studyError("study_pilot_rerun_invalid");
  await verifyStudy({
    artifactDir,
    phase,
    deps: {
      gitHead,
      providerIdentity,
      gateIdentity,
      passageCharLimit,
      loadResearchSubset: async () => loadResearchSubset(await readFile(resolve(options["--knowledge"] ?? DEFAULT_KNOWLEDGE)), {
        knowledgePath: resolve(options["--knowledge"] ?? DEFAULT_KNOWLEDGE),
      }),
      loadExclusions: async () => loadStudyExclusions({ root: resolve(options["--exclusion-root"] ?? DEFAULT_EXCLUSION_ROOT) }),
    },
  });
  const schedule = await readJson(join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.schedule));
  const casePhase = new Map(freeze.sampling.selected.map((entry) => [entry.caseId, entry.phase]));
  const attempts = await readAttempts(join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.attempts));
  const completed = new Set(attempts.filter((entry) => entry.status === "completed").map((entry) => `${entry.caseId}/${entry.arm}`));
  const rows = schedule.rows.filter((row) => casePhase.get(row.caseId) === phase
    && (options["--case"] === undefined || row.caseId === options["--case"])
    && (options["--arm"] === undefined || row.arm === options["--arm"]));

  const gateModule = await loadArenaApplicabilityModule();
  const generatorProvider = createProvider();
  const selectorProvider = createProvider();
  const candidates = await readJson(join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.candidates));
  const candidatesByCase = new Map(candidates.cases.map((entry) => [entry.caseId, entry.result]));
  const observations = new Map();
  for (const caseId of freeze.caseIds) {
    const stored = await readJson(join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.observations, `${caseId}.json`));
    observations.set(caseId, stored.observation);
  }

  const controller = new AbortController();
  const onSignal = () => controller.abort();
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  const result = { phase, ran: [], skipped: [], failed: [] };
  try {
    for (const row of rows) {
      if (controller.signal.aborted) break;
      if (options["--pilot-rerun"] !== true && completed.has(`${row.caseId}/${row.arm}`)) {
        result.skipped.push({ caseId: row.caseId, arm: row.arm, reason: "already_completed" });
        continue;
      }
      const observation = observations.get(row.caseId);
      const candidateResult = candidatesByCase.get(row.caseId);
      if (observation === undefined || candidateResult === undefined) throw studyError("study_artifact_missing", row.caseId);
      const attempt = await runStudyAttempt({
        artifactDir,
        caseId: row.caseId,
        arm: row.arm,
        phase,
        observation,
        candidateResult,
        generatorProvider,
        pilotRerun: options["--pilot-rerun"] === true,
        signal: controller.signal,
        timeoutMs: options["--max-run-ms"] ?? CALL_TIMEOUT_MS,
        gateFactory: row.arm === "selfrag"
          ? async ({ caseRef }) => {
            const observed = { outputBytes: null };
            const gate = gateModule.createArenaRagApplicabilityGate({
              provider: observingProvider(selectorProvider, observed),
              caseRef,
              ...(freeze.selectorBudget === null ? {} : { limits: freeze.selectorBudget }),
            });
            return {
              descriptor: {
                gateId: "blind-discard-arena-rag-applicability",
                gateVersion: gateModule.ARENA_RAG_APPLICABILITY_GATE_VERSION,
                promptVersion: gateModule.ARENA_RAG_APPLICABILITY_PROMPT_VERSION,
              },
              async apply(input) {
                const output = await gate.apply(input);
                return { ...output, outputBytes: observed.outputBytes };
              },
            };
          }
          : undefined,
      });
      if (attempt.record.status === "completed") {
        result.ran.push({ caseId: row.caseId, arm: row.arm, attempt: attempt.record.attempt, status: attempt.record.status });
      } else {
        result.failed.push({ caseId: row.caseId, arm: row.arm, attempt: attempt.record.attempt, status: attempt.record.status, failureCode: attempt.record.failureCode });
      }
    }
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }

  if (phase === "pilot" && freeze.selectorBudget === null && controller.signal.aborted === false) {
    const pilotRows = schedule.rows.filter((row) => casePhase.get(row.caseId) === "pilot");
    const settled = await readAttempts(join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.attempts));
    const completedKeys = new Set(settled.filter((entry) => entry.status === "completed").map((entry) => `${entry.caseId}/${entry.arm}`));
    if (pilotRows.every((row) => completedKeys.has(`${row.caseId}/${row.arm}`))) {
      const runs = await readRuns(artifactDir);
      const observationsForBudget = runs
        .filter((run) => run.arm === "selfrag" && casePhase.get(run.caseId) === "pilot" && run.status === "completed")
        .flatMap((run) => (run.gate !== null && run.gate !== undefined && Number.isInteger(run.gate.outputBytes) &&
          run.usage?.selector?.status === "reported" && Number.isInteger(run.usage.selector.tokens?.outputTokens)
          ? [{ outputTokens: run.usage.selector.tokens.outputTokens, outputBytes: run.gate.outputBytes }]
          : []));
      const budget = selectSelectorBudget({ observations: observationsForBudget });
      await freezeSelectorBudget({ artifactDir, budget: { maxOutputTokens: budget.maxOutputTokens, maxOutputBytes: budget.maxOutputBytes } });
      result.selectorBudget = budget;
    } else {
      result.pilotIncomplete = true;
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.failed.length > 0) process.exitCode = 1;
}

async function collectReasonEntries(artifactDir) {
  const runs = await readRuns(artifactDir);
  const entries = [];
  for (const run of runs) {
    if (run.arm !== "selfrag" || run.status !== "completed") continue;
    const verdicts = run.gate?.receipt?.verdicts;
    if (!Array.isArray(verdicts)) continue;
    for (const verdict of verdicts) {
      if (verdict.effectiveVerdict !== "irrelevant") continue;
      entries.push({
        caseId: run.caseId,
        sourceRef: verdict.sourceRef,
        verdict: verdict.verdict,
        reason: verdict.reason,
        basis: verdict.basis,
        premises: verdict.premises,
      });
    }
  }
  return entries;
}

async function judgeReasons(artifactDir) {
  const entries = await collectReasonEntries(artifactDir);
  if (entries.length === 0) throw studyError("reason_review_no_entries");
  const provider = createProvider();
  const request = buildReasonReviewRequest({ entries });
  const started = Date.now();
  const result = await withTimeout((signal) => provider.request(request, signal), CALL_TIMEOUT_MS);
  if (result.status !== "ready") throw studyError("reason_review_provider_failed", result.status);
  let parsed;
  try {
    parsed = JSON.parse(result.call.arguments);
  } catch {
    throw studyError("reason_review_invalid", "json");
  }
  const counts = validateReasonReview({ entries, verdicts: parsed.verdicts });
  const artifact = {
    schemaVersion: "selfrag-study-reason-review/v1",
    promptVersion: SELF_RAG_STUDY_REASON_REVIEW_PROMPT_VERSION,
    attestation: "ai_judgement_not_expert_gold",
    createdAt: new Date().toISOString(),
    judge: provider.descriptor(),
    usage: result.usage ?? null,
    elapsedMs: Date.now() - started,
    entries,
    verdicts: parsed.verdicts,
    counts,
    digest: digestOf({ entries, verdicts: parsed.verdicts }),
  };
  await writeJsonExclusive(join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.reasonReview), artifact);
  return artifact;
}

async function commandReport(options) {
  const artifactDir = resolve(options["--artifacts"]);
  const freeze = await readJson(join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.freeze));
  const candidates = await readJson(join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.candidates));
  const candidatesByCase = Object.fromEntries(candidates.cases.map((entry) => [entry.caseId, { result: entry.result }]));
  const prejudgeByCase = {};
  for (const caseId of freeze.caseIds) {
    prejudgeByCase[caseId] = await readJson(join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.prejudge, `${caseId}.json`));
  }
  const runs = await readRuns(artifactDir);
  const attempts = await readAttempts(join(artifactDir, SELF_RAG_STUDY_ARTIFACTS.attempts));

  let reasonReview = null;
  if (options["--judge-reasons"] === true) {
    reasonReview = await judgeReasons(artifactDir);
  } else if (typeof options["--reason-review"] === "string") {
    const stored = await readJson(resolve(options["--reason-review"]));
    reasonReview = { counts: stored.counts };
  }

  const report = computeStudyReport({
    caseIds: freeze.caseIds,
    candidatesByCase,
    prejudgeByCase,
    runs,
    attempts,
    createdAt: new Date().toISOString(),
    reasonReview,
  });
  await writeJsonReplacing(join(artifactDir, "report.json"), report);
  await writeFile(join(artifactDir, "report.md"), renderStudyReportMarkdown(report), { encoding: "utf8" });
  process.stdout.write(`${JSON.stringify({ report: join(artifactDir, "report.json"), digest: report.digest, conclusion: report.conclusion }, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === "help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.command === "prepare") return commandPrepare(options);
  if (options.command === "verify") return commandVerify(options);
  if (options.command === "run") return commandRun(options);
  return commandReport(options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^[a-z0-9_]+$/u.test(error.message) ? error.message : "selfrag_study_failed";
    process.stderr.write(error?.detail === undefined ? `${code}\n` : `${code} ${error.detail}\n`);
    process.exitCode = 1;
  });
}
