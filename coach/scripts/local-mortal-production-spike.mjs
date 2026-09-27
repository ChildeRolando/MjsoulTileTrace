import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { countProvenWave1, readAcceptanceCommit } from "./local-mortal-spike-proof.mjs";
import {
  FACT_ENGINE_ADAPTER_VERSION,
  FACT_ENGINE_PROTOCOL_VERSION,
  MAHJONG_HELPER_COMMIT,
  NATIVE_STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,
  managedLocalMortalEngineVersion,
} from "@riichi-coach/contracts";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
} from "@riichi-coach/mahjong-soul-source";
import { mapTenhouRecord } from "@riichi-coach/tenhou-source";
import { computeCanonicalGameFingerprint } from "@riichi-coach/mortal-source";
import {
  ManagedMortalRuntime,
  loadManagedMortalManifest,
  sha256File,
} from "@riichi-coach/mortal-runtime";
import {
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
  MORTAL_COVERAGE_BRANCHES,
  buildStructuredAnalysisPackage,
  createMortalCoverageRegistry,
  actualLibriichiActionRef,
  localMortalRuleScoresToReportEntry,
  projectLocalMortalRuleScoring,
  queryCanonicalLibriichiRules,
  runMortalFullGameReview,
  selectReviewDecisions,
  validateStructuredAnalysisPackage,
} from "@riichi-coach/reasoning";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const acceptanceCommit = readAcceptanceCommit(repoRoot);
const artifactRoot = process.env.RIICHI_LOCAL_MORTAL_ROOT
  ?? join(process.env.LOCALAPPDATA ?? "", "RiichiCoach", "local-mortal-spike");
const receiptPath = join(artifactRoot, "preparation-receipt.json");
const checkpointPath = join(artifactRoot, "mortal_582500.pth");
const pythonExecutable = join(artifactRoot, "python", "Scripts", "python.exe");
const mortalRoot = join(artifactRoot, "Mortal");
const modelPath = join(mortalRoot, "mortal", "model.py");
const enginePath = join(mortalRoot, "mortal", "engine.py");

const runtimePackageRoot = join(repoRoot, "packages", "mortal-runtime");
const runtimePath = join(runtimePackageRoot, "runtime", "local_mortal_runtime.py");
const manifestPath = join(runtimePackageRoot, "manifests", "mortal-582500.windows-x64.json");

function fail(message) {
  throw new Error(message);
}

if (!existsSync(receiptPath)) fail("local Mortal assets are absent; run npm run prepare:local-mortal-spike first");
const prepared = JSON.parse(readFileSync(receiptPath, "utf8"));
const manifest = await loadManagedMortalManifest(manifestPath);
if (
  prepared.receiptVersion !== "local-mortal-preparation-receipt/v1"
  || prepared.runtimeRevision !== manifest.identity.runtimeRevision
  || prepared.runtimeModelSha256 !== manifest.identity.runtimeModelSha256
  || prepared.runtimeEngineSha256 !== manifest.identity.runtimeEngineSha256
  || prepared.checkpointRevision !== manifest.identity.checkpointRevision
  || prepared.checkpointFileSha256 !== manifest.identity.checkpointFileSha256
  || await sha256File(runtimePath) !== manifest.identity.runtimeArtifactSha256
  || await sha256File(modelPath) !== prepared.runtimeModelSha256
  || await sha256File(enginePath) !== prepared.runtimeEngineSha256
  || await sha256File(checkpointPath) !== prepared.checkpointFileSha256
) fail("local Mortal preparation receipt or artifact identity mismatch");
// The original preparation receipt still attests cached model assets. Native
// rules are a separate source-bound build; never inherit its old wrapper/hash.
const nativeReceiptPath = process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT;
if (!nativeReceiptPath) fail("set RIICHI_LIBRIICHI_NATIVE_RECEIPT to the verified native build receipt");
const nativePrepared = JSON.parse(readFileSync(nativeReceiptPath,"utf8"));
const nativeModulePath = process.env.RIICHI_LIBRIICHI_NATIVE_MODULE ?? nativePrepared.nativeModulePath;
if (nativePrepared.receiptVersion !== "coach-libriichi-native/v1" ||
    nativePrepared.upstreamRevision !== manifest.identity.runtimeRevision ||
    nativePrepared.patchSha256 !== await sha256File(join(runtimePackageRoot,"native/coach-rule-config.patch")) ||
    nativePrepared.nativeArtifactSha256 !== await sha256File(nativeModulePath)) fail("native rule build receipt mismatch");
const outputRoot = process.env.RIICHI_LOCAL_MORTAL_EVIDENCE_ROOT
  ?? join(process.env.LOCALAPPDATA ?? "", "RiichiCoach", "spike-runs");
const evidenceDirectory = join(outputRoot,`production-native-${acceptanceCommit.slice(0,12)}-${Date.now()}`);
mkdirSync(evidenceDirectory,{recursive:true});
const failures = [];
function recordFailure(stage, fixtureRun, decision, error) {
  const row = {stage,fixtureId:fixtureRun?.fixtureId ?? null,actor:fixtureRun?.actor ?? null,
    decisionEventRef:decision?.decisionEventRef ?? null,
    code:error instanceof Error ? error.message : String(error)};
  failures.push(row);
}
const runtimeIdentity = {
  ...manifest.identity,
  nativeArtifactSha256: nativePrepared.nativeArtifactSha256,
};

const fixtureManifestPath = join(repoRoot, "packages", "reasoning", "tests", "fixtures", "local-mortal", "fixture-manifest.json");
const fixtureManifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8"));
if (fixtureManifest.version !== "local-mortal-real-fixture-set/v2" || !Array.isArray(fixtureManifest.fixtures)) {
  fail("local Mortal fixture manifest is invalid");
}
const fixtureRoot = join(repoRoot, "packages", "reasoning", "tests", "fixtures", "local-mortal");
const actorFilter = process.env.RIICHI_LOCAL_MORTAL_ACTORS === undefined
  ? null
  : new Set(process.env.RIICHI_LOCAL_MORTAL_ACTORS.split(",").map((value) => Number(value)));
const bundle = await loadMahjongSoulProtocolBundle(join(repoRoot, "vendor", "mahjong-soul-protocol"));
const fixtureRuns = [];
const fixtureEvidence = [];
for (const registered of fixtureManifest.fixtures) {
  const fixturePath = resolve(fixtureRoot, registered.source);
  const fixtureBytes = readFileSync(fixturePath);
  const fixtureSha256 = createHash("sha256").update(fixtureBytes).digest("hex");
  if (fixtureSha256 !== registered.sha256) fail(`local Mortal fixture hash mismatch: ${registered.id}`);
  const perspectives = registered.perspectives.filter((actor) => actorFilter === null || actorFilter.has(actor));
  fixtureEvidence.push({ id: registered.id, sourceKind: registered.sourceKind, fixtureSha256, actorPerspectives: perspectives });
  if (registered.sourceKind === "mahjong_soul") {
    const fixture = JSON.parse(fixtureBytes.toString("utf8"));
    const recordBytes = unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex"));
    for (const actor of perspectives) fixtureRuns.push({
      fixtureId: registered.id,
      actor,
      map: () => mapMahjongSoulRecord({
        gameId: `majsoul:local-mortal-production:${registered.id}:${actor}`,
        selfActor: actor,
        recordId: fixture.recordId,
        recordBytes,
        bundle,
      }),
    });
  } else if (registered.sourceKind === "tenhou") {
    const raw = fixtureBytes.toString("utf8");
    for (const actor of perspectives) fixtureRuns.push({
      fixtureId: registered.id,
      actor,
      map: () => mapTenhouRecord({
        raw,
        gameId: `tenhou:local-mortal-production:${registered.id}:${actor}`,
        selfActor: actor,
      }),
    });
  } else {
    fail(`unsupported local Mortal fixture source kind: ${registered.sourceKind}`);
  }
}
if (fixtureRuns.length === 0) fail("local Mortal fixture selection is empty");
const runtime = new ManagedMortalRuntime({
  executable: pythonExecutable,
  runtimePath,
  checkpointPath,
  mortalSourcePath: join(mortalRoot, "mortal"),
  nativeModulePath,
  manifest,
  identity: runtimeIdentity,
  environment: {
    ...process.env,
    PYTHONPATH: "",
    CUDA_VISIBLE_DEVICES: "",
  },
  startTimeoutMs: 120_000,
  inferenceTimeoutMs: 30_000,
});

const fixedErrors = Object.fromEntries([
  "mortal_runtime_unavailable", "mortal_runtime_identity_mismatch",
  "mortal_checkpoint_identity_mismatch", "mortal_runtime_crash",
  "mortal_runtime_timeout", "mortal_protocol_invalid", "mortal_candidate_mismatch",
  "mortal_actual_action_mismatch", "mortal_output_incomplete",
].map((code) => [code, 0]));
const families = Object.fromEntries(["discard", "riichi", "chi", "pon", "daiminkan", "hora", "pass", "ankan", "kakan", "kyuushu"].map((name) => [name, 0]));
const packages = [];
const wave1ActualBranchCounts = Object.fromEntries([
  "resp_chi_actual", "resp_pon_actual", "resp_daiminkan_actual",
  "resp_hora_actual", "resp_pass_on_discard", "resp_chankan_actual",
].map((name) => [name, 0]));
const passOnDiscardCandidateFamilyCounts = Object.fromEntries(["chi", "pon", "daiminkan", "hora"].map((name) => [name, 0]));
const windowActualCounts = {};
let inferenceCount = 0;
const runSummaries = fixtureRuns.map(run=>({fixtureId:run.fixtureId,actor:run.actor,status:"not_run"}));

try {
  await runtime.start();
  for (const fixtureRun of fixtureRuns) {
    const runSummary = runSummaries.find(run=>run.fixtureId===fixtureRun.fixtureId && run.actor===fixtureRun.actor);
    const failuresBefore = failures.length;
    runSummary.status = "running";
    try {
      const { actor } = fixtureRun;
      const mapped = fixtureRun.map();
      if (mapped.status !== "ready") fail(`production mapper failed: ${mapped.code}`);
      const stream = mapped.stream;
      const {decisions,responseDecisions,rules} = await queryCanonicalLibriichiRules({stream,identity:runtime.ruleIdentity,port:runtime});
      for (const decision of [...decisions, ...responseDecisions]) {
        const window = decision.snapshot.privateState.decisionWindow;
        const actualKind = decision.actualAction?.kind ?? "missing";
        const windowActualKey = `${window.kind}:${actualKind}`;
        windowActualCounts[windowActualKey] = (windowActualCounts[windowActualKey] ?? 0) + 1;
      }
      const evaluated = [];
      const ruleCounts = {ok:0,non_action:0,error:0,singleton:0};
      const evaluable = [
        ...decisions.map(decision=>({decision,surface:"self"})),
        ...responseDecisions.map(decision=>({decision,surface:"response"})),
      ];
      for (const row of evaluable) {
        const result = rules.get(row.decision.decisionEventRef);
        ruleCounts[result.response.status]++;
        if (result.response.status === "error") {
          recordFailure("rules",fixtureRun,row.decision,result.response.code);
          continue;
        }
        if (result.response.status === "non_action") continue;
        try {
          actualLibriichiActionRef(row.decision,result.actions);
          if (result.actions.length === 1) {ruleCounts.singleton++;continue;}
          const request = projectLocalMortalRuleScoring({stream,decision:row.decision,identity:runtimeIdentity,
            ruleRequest:result.request,ruleResult:result.response});
          const response = await runtime.scoreRules(request);
          if (response.status === "error") {
            fixedErrors[response.code] = (fixedErrors[response.code] ?? 0)+1;
            recordFailure("scoring",fixtureRun,row.decision,response.code);
            continue;
          }
          const entry = localMortalRuleScoresToReportEntry({request,response,decision:row.decision});
          evaluated.push({entry,decision:row.decision,surface:row.surface,request,response});
          inferenceCount++;
          for (const candidate of request.ruleResult.actions) {
            const action=JSON.parse(candidate.mjaiActionJson);
            const family=action.type === "dahai" ? "discard" : action.type === "reach" ? "riichi" : action.type === "ryukyoku" ? "kyuushu" : action.type === "none" ? "pass" : action.type;
            if (family in families) families[family]++;
          }
        } catch (error) {
          recordFailure("binding",fixtureRun,row.decision,error);
        }
      }
      console.log(JSON.stringify({fixtureId:fixtureRun.fixtureId,actor,ruleCounts,inferences:evaluated.length}));
      Object.assign(runSummary,{ruleCounts,inferences:evaluated.length,boundaries:evaluable.length});
      const groups = new Map();
      const eventOrdinal = new Map(stream.events.map((event, index) => [event.eventId, index]));
      const orderedEvaluated = [...evaluated].sort((left, right) =>
        eventOrdinal.get(left.decision.decisionEventRef) - eventOrdinal.get(right.decision.decisionEventRef)
      );
      for (const { entry } of orderedEvaluated) {
        const key = `${entry.roundOrdinal}:${entry.roundWind}:${entry.dealer}:${entry.kyoku}:${entry.honba}`;
        const group = groups.get(key) ?? { roundOrdinal: entry.roundOrdinal, roundWind: entry.roundWind, dealer: entry.dealer, kyoku: entry.kyoku, honba: entry.honba, entries: [] };
        group.entries.push(entry);
        groups.set(key, group);
      }
      const report = {
        reportId: `managed-local-mortal:${actor}`,
        adapterVersion: manifest.identity.adapterVersion, engine: "Mortal",
        version: managedLocalMortalEngineVersion(runtimeIdentity),
        modelTag: manifest.identity.checkpointModelTag, playerId: actor,
        gameFingerprint: computeCanonicalGameFingerprint(stream), kyokus: [...groups.values()],
      };
      const factEngine = new JsonlFactEngineClient(new ManagedFactEngineTransport(join(repoRoot, "resources")));
      let review;
      try {
        review = await runMortalFullGameReview({
          stream, decisions, responseDecisions, report,
          libriichi:{identity:runtime.ruleIdentity,results:rules},
          engine: factEngine, now: () => Date.parse("2026-09-24T00:00:00.000Z"),
          coverageRegistry: createMortalCoverageRegistry(MORTAL_COVERAGE_BRANCHES),
        });
      } finally {
        await factEngine.close();
      }
      if (review.status !== "coverage_ready" || review.retainedAnalyses.length === 0) {
        fail(`whole-game review failed: actor=${actor}; ${review.status === "failed" ? review.code : "no_analysis_ready_decision"}`);
      }
      if (
        review.summary.localConservation !== decisions.length + responseDecisions.length
        || review.sourceCoverage.mortalSelfEntryCount + review.sourceCoverage.responseEntryCount !== evaluated.length
        || review.sourceCoverage.unboundMortalEntryCount !== 0
        || review.sourceCoverage.ambiguousMortalEntryCount !== 0
        || review.sourceCoverage.responseUnboundEntryCount !== 0
        || review.sourceCoverage.responseAmbiguousEntryCount !== 0
      ) {
        const reportEntries = report.kyokus.flatMap((kyoku) => kyoku.entries);
        const failedSourceRows = [
          ...review.sourceCoverage.entries,
          ...review.sourceCoverage.responseEntries,
        ].filter((row) => row.disposition !== "bound");
        fail(`whole-game conservation failed: actor=${actor}; ${JSON.stringify({
        decisionCount: decisions.length + responseDecisions.length,
        sourceEntryCount: evaluated.length,
        localConservation: review.summary.localConservation,
        selfSourceConservation: review.summary.sourceConservation,
        responseSourceConservation: review.sourceCoverage.responseBoundEntryCount
          + review.sourceCoverage.responseUnboundEntryCount
          + review.sourceCoverage.responseAmbiguousEntryCount,
        failedSourceRows: failedSourceRows.map((row) => ({
          ...row,
          entry: reportEntries[row.sourceOrdinal],
        })),
      })}`);
      }
      for (const decision of review.decisions) {
        if (decision.outcome !== "analysis_ready" && decision.outcome !== "source_row_not_expected") {
          recordFailure("full-game",fixtureRun,decision,`${decision.outcome}:${decision.reason ?? "unknown"}`);
        }
      }
      const pkg = buildStructuredAnalysisPackage({
        review, stream, decisions, responseDecisions,
        componentVersions: {
          packageSchema: NATIVE_STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,
          legalActionRules:runtime.ruleIdentity,
          canonicalReplay: "canonical-riichi-events/v2",
          mapperAdapter: stream.mapperVersion,
          factEngine: { engine: "mahjong-helper", upstreamCommit: MAHJONG_HELPER_COMMIT, adapterVersion: FACT_ENGINE_ADAPTER_VERSION, protocolVersion: FACT_ENGINE_PROTOCOL_VERSION },
          factorPipeline: "factor-pipeline/v1",
          mortalSourceModel: {
            identity: "Mortal", version: manifest.identity.adapterVersion, modelTag: manifest.identity.checkpointModelTag,
            evidenceSource: { kind: "managed_local_runtime", identity: runtimeIdentity },
          },
        },
        frozenPolicySnapshot: review.retainedAnalyses[0].modelEvaluation.detailPolicy,
        now: () => Date.parse("2026-09-24T00:00:00.000Z"),
      });
      validateStructuredAnalysisPackage(pkg);
      writeFileSync(join(evidenceDirectory,`${fixtureRun.fixtureId}-actor-${actor}-package.json`),JSON.stringify(pkg),{flag:"wx"});
      const proven = countProvenWave1(responseDecisions, evaluated, pkg);
      for (const [branch, count] of Object.entries(proven.actual)) wave1ActualBranchCounts[branch] += count;
      for (const [family, count] of Object.entries(proven.passFamilies)) passOnDiscardCandidateFamilyCounts[family] += count;
      if (pkg.record.status === "integrity_failed") fail(`whole-game package integrity failed: actor=${actor}; ${JSON.stringify({
        outcomes: review.summary.outcomes,
        failedDecisions: review.decisions.filter((row) =>
          row.outcome === "no_mortal_entry" || row.outcome === "binding_mismatch" || row.outcome === "model_output_incomplete"
        ),
      })}`);
      const selection = selectReviewDecisions(pkg);
      packages.push({
        fixtureId: fixtureRun.fixtureId,
        actor,
        sourceEntryCount: evaluated.length,
        decisionCount: pkg.decisions.length,
        ruleCounts,
        outcomeCounts: review.summary.outcomes,
        packageId: pkg.packageId,
        semanticContentHash: pkg.semanticContentHash,
        status: pkg.record.status,
        selectedCount: selection.selected.length,
      });
      runSummary.status = failures.length === failuresBefore ? "completed" : "failed";
    } catch (error) {recordFailure("fixture",fixtureRun,null,error);runSummary.status="failed";}
  }
} catch (error) {
  recordFailure("runtime",null,null,error);
} finally {
  try {await runtime.close();} catch (error) {recordFailure("runtime-close",null,null,error);}
}

const requiredFamilies = ["discard", "riichi", "chi", "pon", "daiminkan", "hora", "pass", "ankan", "kakan"];
if (inferenceCount === 0 || requiredFamilies.some((family) => families[family] === 0)) {
  recordFailure("coverage",null,null,`production spike coverage incomplete: ${JSON.stringify(families)}`);
}
if (Object.values(wave1ActualBranchCounts).some((count) => count === 0)
  || Object.values(passOnDiscardCandidateFamilyCounts).some((count) => count === 0)) {
  recordFailure("coverage",null,null,`production spike wave-1 matrix incomplete: ${JSON.stringify({ wave1ActualBranchCounts, passOnDiscardCandidateFamilyCounts, windowActualCounts })}`);
}
if (actorFilter !== null) recordFailure("scope",null,null,"filtered corpus is diagnostic only, not full acceptance");
try {if (readAcceptanceCommit(repoRoot) !== acceptanceCommit) fail("acceptance commit changed during execution");}
catch (error) {recordFailure("commit",null,null,error);}
const acceptance = {
  receiptVersion: "local-mortal-production-spike-receipt/v3",
  ruleIdentity:runtime.ruleIdentity,
  nativeBuildReceipt:nativePrepared,
  createdAt:new Date().toISOString(),
  executionConditions:{device:"cpu",networkIsolation:"not-attested-by-this-runner"},
  failures,
  runs:runSummaries,
  evidenceDirectory,
  commit: acceptanceCommit,
  runtimeIdentity,
  nativeArtifactSha256: nativePrepared.nativeArtifactSha256,
  fixtureEvidence,
  inferenceCount,
  familyCandidateCounts: families,
  wave1ActualBranchCounts,
  passOnDiscardCandidateFamilyCounts,
  windowActualCounts,
  fixedErrorCounts: fixedErrors,
  packages,
  command: "npm run test:local-mortal-production-spike",
  exitCode: failures.length === 0 ? 0 : 1,
};
const outputReceipt = join(evidenceDirectory,"production-spike-receipt.json");
writeFileSync(outputReceipt,`${JSON.stringify(acceptance,null,2)}\n`,{flag:"wx"});
console.log(JSON.stringify({status:acceptance.exitCode === 0 ? "PASS" : "FAILED",receipt:outputReceipt,
  inferenceCount,packageCount:packages.length,failureCount:failures.length}));
process.exitCode=acceptance.exitCode;
