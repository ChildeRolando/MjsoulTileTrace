import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  LibriichiRuleResponseSchema,
  OpenAiCoachProviderConfigSchema,
  libriichiRuleCanonicalJson,
} from "@riichi-coach/contracts";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
} from "@riichi-coach/mahjong-soul-source";
import {
  bindLocalMortalRuleScores,
  createLibriichiRuleProjector,
  projectLocalMortalRuleScoring,
  replayCanonicalStream,
} from "@riichi-coach/reasoning";
import {
  createManagedMortalRuntimeFromAssets,
  loadManagedMortalManifest,
} from "@riichi-coach/mortal-runtime";
import {
  createArenaBlindObservation,
  createArenaBlindRuleRequest,
  createArenaReferenceLabel,
  createArenaToolBinding,
  ArenaRunAliasVault,
  screenArenaDecisions,
} from "@riichi-coach/desktop/blind-discard-arena";
import {
  createArenaMcpRunnerTool,
  createArenaRagRunnerTool,
  runBlindCoachCase,
  ARENA_RUN_LIMITS_V1,
} from "@riichi-coach/desktop/blind-discard-arena-runner";
import { ArenaMcpClient } from "@riichi-coach/desktop/blind-discard-arena-mcp";
import { createArenaRagRetriever, ARENA_RAG_RETRIEVER_VERSION } from "@riichi-coach/desktop/blind-discard-arena-rag";
import { ARENA_TOOL_CALL_PROMPT_VERSION } from "@riichi-coach/desktop/blind-discard-arena-provider";
import { createArenaToolCallProvider } from "@riichi-coach/desktop/llm-provider/service";
import {
  ArenaArchiveEventSchema,
  ArenaArchiveManifestSchema,
  parseArenaArchiveEvents,
  summarizeArenaArchive,
} from "@riichi-coach/desktop/blind-discard-arena-archive";

const coachRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(coachRoot, "..");
const fixturePath = join(coachRoot, "packages/mahjong-soul-source/tests/fixtures/real-record-complete.json");
const packageRoot = join(coachRoot, "packages/mortal-runtime");
const platformManifest = "mortal-582500.windows-x64.json";
const expectedSourceRecordHash = "sha256:fe547cc2b42f0ea83230feaa0fbbdf9bab7281838a66f051cb7a8609687e1c33";
const expectedRuleArtifactSha256 = "5ff7f712a45c7288f739af7c7e0613567b467ee4ade2c66c0988e18982cdefad";
const expectedRuntime = {
  runtimeRevision: "0cff2b52982be5b1163aa9a62fb01f03ce91e0d2",
  checkpointRevision: "7386c9f5c751a3ea75efea99737cef5a5ef950f1",
  checkpointFileSha256: "738e0d6e3c0ce9671629554ad39abd147d2ffbac676e80b194c83f2acc0fea20",
  checkpointModelTag: "mortal-hpc@582500",
  runtimeConfigSha256: "1c4d2711033cbc897602655907548ba47876b356723a52efc7ab05a30f6a35df",
};
const ARCHIVE_ROOT = join(coachRoot, "reports/blind-discard-arena");
const MCP_SERVER_PATH = join(coachRoot, "bin/blind-discard-arena-mcp-server.mjs");
const DEFAULT_BUDGET = Object.freeze({ maxProviderTurns: 4, maxToolCalls: 2, maxProviderOutputTokens: 512, maxRunElapsedMs: 120_000 });

function usage() {
  return [
    "Blind Discard Arena local CLI",
    "",
    "  npm run arena -- run --dataset blind-discard-smoke-v1 --rag off [options]",
    "  npm run arena -- run --dataset blind-discard-smoke-v1 --rag local [options]",
    "  npm run arena -- inspect <runId>",
    "",
    "Run options:",
    "  --base-url <url>                  OpenAI-compatible endpoint",
    "  --model <name>                    model name",
    "  --max-provider-turns <1..12>      default 4",
    "  --max-provider-output-tokens <1..2048>  default 512",
    "  --max-tool-calls <1..16>          default 2",
    "  --max-run-ms <1..300000>          default 120000",
    "  --fault first-helper-timeout      controlled helper timeout path",
    "",
    "Credentials are read only from RIICHI_COACH_API_KEY and are never written to the archive.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return { command: "help" };
  const [command, ...rest] = argv;
  if (command === "inspect") {
    if (rest.length !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(rest[0])) {
      throw new Error("arena_inspect_run_id_invalid");
    }
    return { command, runId: rest[0] };
  }
  if (command !== "run") throw new Error("arena_command_invalid");
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key?.startsWith("--")) throw new Error("arena_option_invalid");
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error("arena_option_value_missing");
    if (["--dataset", "--rag", "--base-url", "--model", "--fault"].includes(key)) {
      if (options[key] !== undefined) throw new Error("arena_option_duplicate");
      options[key] = value;
      index += 1;
      continue;
    }
    if (["--max-provider-turns", "--max-provider-output-tokens", "--max-tool-calls", "--max-run-ms"].includes(key)) {
      if (options[key] !== undefined || !/^\d+$/u.test(value)) throw new Error("arena_budget_invalid");
      options[key] = Number(value);
      index += 1;
      continue;
    }
    throw new Error("arena_option_unknown");
  }
  if (options["--dataset"] !== "blind-discard-smoke-v1" || !["off", "local"].includes(options["--rag"])) {
    throw new Error("arena_dataset_or_rag_invalid");
  }
  if (options["--fault"] !== undefined && options["--fault"] !== "first-helper-timeout") {
    throw new Error("arena_fault_invalid");
  }
  const budget = {
    maxProviderTurns: options["--max-provider-turns"] ?? DEFAULT_BUDGET.maxProviderTurns,
    maxProviderOutputTokens: options["--max-provider-output-tokens"] ?? DEFAULT_BUDGET.maxProviderOutputTokens,
    maxToolCalls: options["--max-tool-calls"] ?? DEFAULT_BUDGET.maxToolCalls,
    maxRunElapsedMs: options["--max-run-ms"] ?? DEFAULT_BUDGET.maxRunElapsedMs,
  };
  if (budget.maxProviderTurns < 1 || budget.maxProviderTurns > ARENA_RUN_LIMITS_V1.maxProviderTurns ||
      budget.maxProviderOutputTokens < 1 || budget.maxProviderOutputTokens > ARENA_RUN_LIMITS_V1.maxProviderOutputTokens ||
      budget.maxToolCalls < 1 || budget.maxToolCalls > ARENA_RUN_LIMITS_V1.maxToolCalls ||
      budget.maxRunElapsedMs < 1 || budget.maxRunElapsedMs > ARENA_RUN_LIMITS_V1.maxRunElapsedMs) {
    throw new Error("arena_budget_invalid");
  }
  const rawBaseUrl = options["--base-url"] ?? process.env.RIICHI_COACH_ARENA_BASE_URL;
  const rawModel = options["--model"] ?? process.env.RIICHI_COACH_ARENA_MODEL;
  if ((rawBaseUrl === undefined) !== (rawModel === undefined)) throw new Error("arena_provider_settings_incomplete");
  const providerSettings = rawBaseUrl === undefined ? null : OpenAiCoachProviderConfigSchema.safeParse({
    baseUrl: rawBaseUrl,
    modelName: rawModel,
  });
  if (providerSettings !== null && !providerSettings.success) throw new Error("arena_provider_settings_invalid");
  return {
    command,
    ragMode: options["--rag"],
    fault: options["--fault"] ?? "none",
    budget,
    providerSettings: providerSettings?.data ?? null,
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalDigest(value) {
  return sha256(Buffer.from(libriichiRuleCanonicalJson(value), "utf8"));
}

function gitOutput(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function requireCleanGitHead() {
  const status = gitOutput(["status", "--porcelain", "--untracked-files=all"]);
  if (status.length > 0) throw new Error("arena_requires_clean_git_worktree");
  return gitOutput(["rev-parse", "HEAD"]);
}

function mortalArtifactRoot() {
  const root = process.env.RIICHI_LOCAL_MORTAL_ROOT ?? join(process.env.LOCALAPPDATA ?? "", "RiichiCoach", "local-mortal-spike");
  if (!root || root === join("RiichiCoach", "local-mortal-spike")) throw new Error("arena_mortal_asset_root_missing");
  return resolve(root);
}

async function findNativeReceipt(artifactRoot) {
  const explicit = process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT;
  const defaultReceipt = join(artifactRoot, "native-build-receipt.json");
  const candidates = [];
  if (explicit !== undefined && explicit.length > 0) candidates.push(resolve(explicit));
  else if (await exists(defaultReceipt)) candidates.push(defaultReceipt);
  else {
    const buildsRoot = join(artifactRoot, "rule-native-builds");
    let entries;
    try { entries = await readdir(buildsRoot, { withFileTypes: true }); } catch { entries = []; }
    for (const entry of entries) {
      if (entry.isDirectory()) candidates.push(join(buildsRoot, entry.name, "receipt.json"));
    }
  }
  const matching = [];
  for (const candidate of candidates) {
    try {
      const receipt = JSON.parse(await readFile(candidate, "utf8"));
      if (receipt.nativeArtifactSha256 === expectedRuleArtifactSha256 && typeof receipt.nativeModulePath === "string") {
        matching.push({ path: candidate, receipt });
      }
    } catch { /* a stale or incomplete build is not a candidate */ }
  }
  if (matching.length !== 1) throw new Error("arena_pinned_native_receipt_missing_or_ambiguous");
  return matching[0];
}

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

function checkPinnedMortalManifest(manifest) {
  const identity = manifest.identity;
  if (identity.runtimeRevision !== expectedRuntime.runtimeRevision ||
      identity.checkpointRevision !== expectedRuntime.checkpointRevision ||
      identity.checkpointFileSha256 !== expectedRuntime.checkpointFileSha256 ||
      identity.checkpointModelTag !== expectedRuntime.checkpointModelTag) {
    throw new Error("arena_pinned_mortal_identity_mismatch");
  }
}

async function createPinnedRuntime() {
  const artifactRoot = mortalArtifactRoot();
  const nativeReceipt = await findNativeReceipt(artifactRoot);
  const runtimeManifest = await loadManagedMortalManifest(join(packageRoot, "manifests", platformManifest));
  checkPinnedMortalManifest(runtimeManifest);
  const pythonExecutable = join(artifactRoot, "python", "Scripts", "python.exe");
  const runtime = await createManagedMortalRuntimeFromAssets({
    artifactRoot,
    packageRoot,
    platformManifest,
    pythonExecutable,
    nativeReceiptPath: nativeReceipt.path,
    nativeModulePath: nativeReceipt.receipt.nativeModulePath,
  });
  if (runtime.identity.nativeArtifactSha256 !== expectedRuleArtifactSha256 ||
      runtime.ruleIdentity.nativeArtifactSha256 !== expectedRuleArtifactSha256) {
    await runtime.close();
    throw new Error("arena_pinned_runtime_artifact_mismatch");
  }
  return { runtime, runtimeManifest, nativeReceiptPath: nativeReceipt.path };
}

async function makeFrozenDataset(runtime) {
  const fixtureBytes = await readFile(fixturePath);
  const fixture = JSON.parse(fixtureBytes.toString("utf8"));
  if (typeof fixture.recordId !== "string" || typeof fixture.wire !== "string" || !/^(?:[0-9a-f]{2})+$/iu.test(fixture.wire)) {
    throw new Error("arena_fixture_invalid");
  }
  const bundle = await loadMahjongSoulProtocolBundle(join(coachRoot, "vendor/mahjong-soul-protocol"));
  const recordBytes = unwrapGameDetailRecords(bundle, Uint8Array.from(Buffer.from(fixture.wire, "hex")));
  const mapped = mapMahjongSoulRecord({
    gameId: "majsoul:blind-discard-smoke-v1",
    recordId: fixture.recordId,
    selfActor: 0,
    recordBytes,
    ruleEvidence: fixture.ruleEvidence,
    bundle,
  });
  if (mapped.status !== "ready" || mapped.stream.sourceRecordHash !== expectedSourceRecordHash) {
    throw new Error("arena_pinned_fixture_identity_mismatch");
  }
  const decisions = replayCanonicalStream(mapped.stream);
  const projectRules = createLibriichiRuleProjector(mapped.stream, runtime.ruleIdentity);
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
      decision: {
        decisionEventRef: decision.decisionEventRef,
        snapshot: decision.snapshot,
        facts: decision.facts,
      },
      ruleRequest,
      ruleResponse,
    });
  }
  const screening = screenArenaDecisions(ruleInputs, { maxIncluded: 3 });
  const byOrder = new Map(ruleInputs.map((input) => [input.canonicalDecisionOrder, input]));
  const labels = new Map();
  for (const selected of screening.selected) {
    const frozen = byOrder.get(selected.canonicalDecisionOrder);
    if (frozen === undefined || frozen.ruleResponse.status !== "ok") throw new Error("arena_selected_case_binding_invalid");
    try {
      const request = projectLocalMortalRuleScoring({
        stream: mapped.stream,
        decision: decisions[selected.canonicalDecisionOrder],
        identity: runtime.identity,
        ruleRequest: frozen.ruleRequest,
        ruleResult: frozen.ruleResponse,
      });
      const response = await runtime.scoreRules(request);
      const boundScores = bindLocalMortalRuleScores({ request, response, decision: decisions[selected.canonicalDecisionOrder] });
      labels.set(selected.canonicalDecisionOrder, { status: "available", boundScores });
    } catch {
      labels.set(selected.canonicalDecisionOrder, { status: "unavailable", reason: "mortal_error" });
    }
  }
  const selected = screening.selected.map((row, caseOrdinal) => {
    const candidateRefs = row.candidates.map((candidate) => candidate.actionRef).sort();
    return {
      caseOrdinal,
      selected: row,
      candidateCount: row.candidates.length,
      candidateSetDigest: canonicalDigest(candidateRefs),
    };
  });
  const caseSetDigest = canonicalDigest({
    datasetVersion: "blind-discard-smoke-v1",
    sourceRecordHash: mapped.stream.sourceRecordHash,
    ruleIdentity: runtime.ruleIdentity,
    selected: selected.map(({ caseOrdinal, selected: row, candidateCount, candidateSetDigest }) => ({
      caseOrdinal,
      canonicalDecisionOrder: row.canonicalDecisionOrder,
      candidateCount,
      candidateSetDigest,
    })),
    excluded: screening.excluded,
  });
  return {
    fixtureSha256: sha256(fixtureBytes),
    sourceRecordHash: mapped.stream.sourceRecordHash,
    stream: mapped.stream,
    decisions,
    screening,
    labels,
    selected,
    caseSetDigest,
  };
}

function providerFor(settings, credentials) {
  const adapter = createArenaToolCallProvider({ settings, credentials, fetchImpl: fetch });
  if (adapter !== null) return adapter;
  return Object.freeze({
    descriptor: () => ({ providerId: "openai-compatible", model: "unconfigured", protocolVersion: "arena-function-call/v1" }),
    request: async () => ({ status: "provider_unavailable" }),
  });
}

function safeChildEnvironment() {
  const names = ["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA"];
  return Object.fromEntries(names.flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]]]));
}

async function startMcpClient(authorizedCase, fault) {
  const directory = await mkdtemp(join(tmpdir(), "arena-mcp-"));
  const configPath = join(directory, "authorized-case.json");
  await writeFile(configPath, JSON.stringify({ authorizedCases: [authorizedCase], fault }), { encoding: "utf8", mode: 0o600, flag: "wx" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [MCP_SERVER_PATH, configPath],
    cwd: coachRoot,
    env: safeChildEnvironment(),
    stderr: "pipe",
  });
  const client = new ArenaMcpClient();
  try {
    await client.connect(transport);
    return {
      client,
      async cleanup() {
        try { await client.close(); } finally { await rm(directory, { recursive: true, force: true }); }
      },
    };
  } catch (error) {
    client.forceClose();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function getRunLimits(budget) {
  return {
    ...ARENA_RUN_LIMITS_V1,
    ...budget,
  };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

async function runCommand(options) {
  const codeSha = requireCleanGitHead();
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const runDirectory = join(ARCHIVE_ROOT, runId);
  await mkdir(runDirectory, { recursive: true });
  let apiKey = process.env.RIICHI_COACH_API_KEY ?? null;
  delete process.env.RIICHI_COACH_API_KEY;
  let runtime;
  try {
    const prepared = await createPinnedRuntime();
    runtime = prepared.runtime;
    const dataset = await makeFrozenDataset(runtime);
    const computedRuntimeConfigSha256 = canonicalDigest({
      geometry: prepared.runtimeManifest.geometry,
      inference: prepared.runtimeManifest.inference,
    });
    if (computedRuntimeConfigSha256 !== expectedRuntime.runtimeConfigSha256) {
      throw new Error("arena_pinned_mortal_config_mismatch");
    }
    const descriptorProvider = providerFor(options.providerSettings, { readKey: async () => apiKey });
    const descriptor = descriptorProvider.descriptor();
    const ragCorpusVersion = options.ragMode === "local"
      ? (await import("@riichi-coach/desktop/blind-discard-arena-rag-seed")).BLIND_DISCARD_ARENA_RAG_SEED_CORPUS.corpusVersion
      : null;
    const credentialStatus = options.providerSettings === null
      ? "not_configured"
      : apiKey === null ? "missing" : "available";
    const limits = getRunLimits(options.budget);
    const manifest = ArenaArchiveManifestSchema.parse({
      schemaVersion: "blind-discard-arena-run-manifest/v1",
      runId,
      startedAt,
      codeSha,
      dataset: {
        id: "blind-discard-smoke-v1",
        caseSetDigest: dataset.caseSetDigest,
        split: { unit: "complete_game", developmentGames: 1, acceptanceGames: 0, status: "smoke_dev_only" },
        source: {
          kind: "sanitized_mahjong_soul_fixture",
          fixtureSha256: dataset.fixtureSha256,
          sourceRecordHash: dataset.sourceRecordHash,
        },
        inputCaseCount: dataset.decisions.length,
        selected: dataset.selected.map(({ selected, candidateCount, candidateSetDigest }) => ({
          canonicalDecisionOrder: selected.canonicalDecisionOrder,
          candidateCount,
          candidateSetDigest,
        })),
        excluded: dataset.screening.excluded,
      },
      mortal: {
        runtimeIdentity: runtime.identity,
        ruleIdentity: runtime.ruleIdentity,
        runtimeConfigSha256: computedRuntimeConfigSha256,
      },
      coach: {
        providerId: descriptor.providerId,
        model: descriptor.model,
        protocolVersion: descriptor.protocolVersion,
        promptVersion: ARENA_TOOL_CALL_PROMPT_VERSION,
        submissionSchemaVersion: "blind-discard-arena-submission/v1",
        credentialStatus,
      },
      rag: {
        mode: options.ragMode,
        corpusVersion: ragCorpusVersion,
        retrieverVersion: options.ragMode === "local" ? ARENA_RAG_RETRIEVER_VERSION : "disabled",
      },
      controlledFault: options.fault,
      budget: { maxCases: 3, limits, selectionSeed: null },
    });
    const datasetScan = ArenaArchiveEventSchema.parse({
      schemaVersion: "blind-discard-arena-archive-event/v1",
      type: "dataset_scan",
      recordedAt: new Date().toISOString(),
      datasetId: "blind-discard-smoke-v1",
      sourceRecordHash: dataset.sourceRecordHash,
      inputCaseCount: dataset.decisions.length,
      selected: dataset.selected.map(({ caseOrdinal, candidateCount, candidateSetDigest }) => ({
        caseOrdinal,
        canonicalDecisionOrder: dataset.selected[caseOrdinal].selected.canonicalDecisionOrder,
        candidateCount,
        candidateSetDigest,
      })),
      excluded: dataset.screening.excluded,
    });
    const manifestPath = join(runDirectory, "manifest.json");
    const eventsPath = join(runDirectory, "events.jsonl");
    await writeJson(manifestPath, manifest);
    await writeFile(eventsPath, `${JSON.stringify(datasetScan)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });

    for (const entry of dataset.selected) {
      const aliases = new ArenaRunAliasVault();
      const observation = createArenaBlindObservation({
        selected: entry.selected,
        aliases,
        tools: { description: "Use targeted, bounded evidence queries and sourced local knowledge only when helpful.", supportedCapabilities: ["analyze_candidates", "search_knowledge"] },
      });
      const binding = createArenaToolBinding({ caseRef: observation.caseRef, selected: entry.selected });
      const savedLabel = dataset.labels.get(entry.selected.canonicalDecisionOrder);
      const reference = savedLabel?.status === "available"
        ? { status: "available", label: createArenaReferenceLabel({ caseRef: observation.caseRef, boundScores: savedLabel.boundScores, runtimeManifest: prepared.runtimeManifest }) }
        : { status: "unavailable", reason: savedLabel?.reason ?? "mortal_error" };
      const mcp = await startMcpClient({ binding, facts: entry.selected.facts }, options.fault);
      try {
        const mcpTool = await createArenaMcpRunnerTool({ client: mcp.client, caseRef: observation.caseRef });
        const retriever = createArenaRagRetriever({ mode: options.ragMode, caseRef: observation.caseRef, aliases });
        const ragTool = createArenaRagRunnerTool({ retriever, caseRef: observation.caseRef });
        const result = await runBlindCoachCase({
          observation,
          grading: { binding, reference },
          provider: descriptorProvider,
          tools: [mcpTool, ragTool],
          limits,
        });
        const event = ArenaArchiveEventSchema.parse({
          schemaVersion: "blind-discard-arena-archive-event/v1",
          type: "case_run",
          recordedAt: new Date().toISOString(),
          caseOrdinal: entry.caseOrdinal,
          ragMode: options.ragMode,
          result,
        });
        await appendFile(eventsPath, `${JSON.stringify(event)}\n`, { encoding: "utf8" });
      } finally {
        await mcp.cleanup();
      }
    }
    const storedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const storedEvents = parseArenaArchiveEvents(await readFile(eventsPath, "utf8"));
    const summary = summarizeArenaArchive({ manifest: storedManifest, events: storedEvents });
    await writeJson(join(runDirectory, "summary.json"), summary);
    process.stdout.write(`${JSON.stringify({ runId, archive: `coach/reports/blind-discard-arena/${runId}`, summary }, null, 2)}\n`);
  } finally {
    apiKey = null;
    if (runtime !== undefined) await runtime.close().catch(() => undefined);
  }
}

async function inspectCommand(runId) {
  const runDirectory = resolve(ARCHIVE_ROOT, runId);
  if (!runDirectory.startsWith(`${resolve(ARCHIVE_ROOT)}${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error("arena_inspect_run_id_invalid");
  }
  const manifest = JSON.parse(await readFile(join(runDirectory, "manifest.json"), "utf8"));
  const events = parseArenaArchiveEvents(await readFile(join(runDirectory, "events.jsonl"), "utf8"));
  const recomputed = summarizeArenaArchive({ manifest, events });
  const saved = JSON.parse(await readFile(join(runDirectory, "summary.json"), "utf8"));
  if (JSON.stringify(saved) !== JSON.stringify(recomputed)) throw new Error("arena_archive_summary_mismatch");
  process.stdout.write(`${JSON.stringify(recomputed, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.command === "inspect") {
    await inspectCommand(options.runId);
    return;
  }
  await runCommand(options);
}

main().catch((error) => {
  const code = error instanceof Error && /^[a-z0-9_]+$/u.test(error.message) ? error.message : "arena_run_failed";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
