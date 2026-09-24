import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FACT_ENGINE_ADAPTER_VERSION,
  FACT_ENGINE_PROTOCOL_VERSION,
  MAHJONG_HELPER_COMMIT,
  STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,
  managedLocalMortalEngineVersion,
} from "@riichi-coach/contracts";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
} from "@riichi-coach/mahjong-soul-source";
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
  collectLocalMortalRiichiCandidateWindows,
  collectLocalMortalRonCandidateWindows,
  collectDamaTsumoWindows,
  createMortalCoverageRegistry,
  enumerateResponseCandidates,
  localMortalResponseToReportEntry,
  projectLocalMortalRequest,
  replayCanonicalResponseWindows,
  replayCanonicalStream,
  runMortalFullGameReview,
  selectReviewDecisions,
  validateStructuredAnalysisPackage,
} from "@riichi-coach/reasoning";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifactRoot = process.env.RIICHI_LOCAL_MORTAL_ROOT
  ?? join(process.env.LOCALAPPDATA ?? "", "RiichiCoach", "local-mortal-spike");
const receiptPath = join(artifactRoot, "preparation-receipt.json");
const checkpointPath = join(artifactRoot, "mortal_582500.pth");
const pythonExecutable = join(artifactRoot, "python", "Scripts", "python.exe");
const mortalRoot = join(artifactRoot, "Mortal");
const runtimePackageRoot = join(repoRoot, "packages", "mortal-runtime");
const runtimePath = join(runtimePackageRoot, "runtime", "local_mortal_runtime.py");
const manifestPath = join(runtimePackageRoot, "manifests", "mortal-582500.windows-x64.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(receiptPath)) fail("local Mortal assets are absent; run npm run prepare:local-mortal-spike first");
const prepared = JSON.parse(readFileSync(receiptPath, "utf8"));
const manifest = await loadManagedMortalManifest(manifestPath);
if (
  prepared.receiptVersion !== "local-mortal-preparation-receipt/v1"
  || prepared.runtimeRevision !== manifest.identity.runtimeRevision
  || prepared.runtimeArtifactSha256 !== manifest.identity.runtimeArtifactSha256
  || prepared.checkpointRevision !== manifest.identity.checkpointRevision
  || prepared.checkpointFileSha256 !== manifest.identity.checkpointFileSha256
  || await sha256File(runtimePath) !== prepared.runtimeArtifactSha256
  || await sha256File(checkpointPath) !== prepared.checkpointFileSha256
) fail("local Mortal preparation receipt or artifact identity mismatch");

const fixtureManifestPath = join(repoRoot, "packages", "reasoning", "tests", "fixtures", "local-mortal", "fixture-manifest.json");
const fixtureManifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8"));
const fixturePath = resolve(join(repoRoot, "packages", "reasoning", "tests", "fixtures", "local-mortal"), fixtureManifest.source);
const fixtureBytes = readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBytes.toString("utf8"));
const fixtureSha256 = createHash("sha256").update(fixtureBytes).digest("hex");
const actorPerspectives = process.env.RIICHI_LOCAL_MORTAL_ACTORS === undefined
  ? fixtureManifest.perspectives
  : process.env.RIICHI_LOCAL_MORTAL_ACTORS.split(",").map((value) => Number(value));
const bundle = await loadMahjongSoulProtocolBundle(join(repoRoot, "vendor", "mahjong-soul-protocol"));
const recordBytes = unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex"));
const runtime = new ManagedMortalRuntime({
  executable: pythonExecutable,
  runtimePath,
  checkpointPath,
  mortalSourcePath: join(mortalRoot, "mortal"),
  manifest,
  environment: {
    ...process.env,
    PYTHONPATH: join(mortalRoot, "target", "release"),
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
let inferenceCount = 0;

try {
  await runtime.start();
  for (const actor of actorPerspectives) {
    const mapped = mapMahjongSoulRecord({
      gameId: `majsoul:local-mortal-production:${actor}`,
      selfActor: actor,
      recordId: fixture.recordId,
      recordBytes,
      bundle,
    });
    if (mapped.status !== "ready") fail(`production mapper failed: ${mapped.code}`);
    const stream = mapped.stream;
    const decisions = replayCanonicalStream(stream);
    const responseDecisions = replayCanonicalResponseWindows(stream);
    const candidateFactEngine = new JsonlFactEngineClient(new ManagedFactEngineTransport(join(repoRoot, "resources")));
    let riichiWindows;
    let tsumoWindows;
    let ronWindows;
    try {
      riichiWindows = await collectLocalMortalRiichiCandidateWindows(decisions, candidateFactEngine);
      tsumoWindows = new Set((await collectDamaTsumoWindows(decisions, candidateFactEngine)).windows.map((row) => row.decisionEventRef));
      ronWindows = await collectLocalMortalRonCandidateWindows(stream, responseDecisions, candidateFactEngine);
    } finally {
      await candidateFactEngine.close();
    }
    const evaluated = [];
    const evaluable = [
      ...decisions
        .filter((decision) => {
          const window = decision.snapshot.privateState.decisionWindow;
          if (window.kind === "post_riichi_discard") return false;
          return !(decision.snapshot.publicState.riichiStates[actor].status !== "none" && decision.actualAction?.kind === "discard");
        })
        .map((decision) => ({ decision, surface: "self" })),
      ...responseDecisions
        .filter((decision) => {
          const row = enumerateResponseCandidates(decision);
          return row !== null && (row.chiCombinations.length > 0 || row.pon || row.daiminkan || ronWindows.has(decision.decisionEventRef));
        })
        .map((decision) => ({ decision, surface: "response" })),
    ];
    for (const row of evaluable) {
      const request = projectLocalMortalRequest({
        stream, decision: row.decision, surface: row.surface, identity: manifest.identity,
        includeDeclareRiichi: riichiWindows.has(row.decision.decisionEventRef),
        includeTsumo: tsumoWindows.has(row.decision.decisionEventRef),
        includeRon: ronWindows.has(row.decision.decisionEventRef),
      });
      const response = await runtime.infer(request);
      if (response.status === "error") {
        fixedErrors[response.code]++;
        fail(`real Mortal inference failed closed: ${response.code}; actor=${actor}; decision=${row.decision.decisionEventRef}; window=${row.decision.snapshot.privateState.decisionWindow.kind}; actual=${row.decision.actualAction?.kind}; candidates=${request.candidates.map((item) => item.runtimeAction.index).join(",")}`);
      }
      evaluated.push({
        entry: localMortalResponseToReportEntry({ request, response, decision: row.decision }),
        decision: row.decision,
        surface: row.surface,
      });
      inferenceCount++;
      for (const candidate of request.candidates) {
        const action = JSON.parse(candidate.mjaiActionJson);
        const family = action.type === "dahai" ? "discard" : action.type === "reach" ? "riichi" : action.type === "ryukyoku" ? "kyuushu" : action.type === "none" ? "pass" : action.type === "hora" ? "hora" : action.type;
        if (family in families) families[family]++;
      }
    }
    for (let chunkStart = 0; chunkStart < evaluated.length; chunkStart += 8) {
      const chunk = evaluated.slice(chunkStart, chunkStart + 8);
      console.log(JSON.stringify({ stage: "package_chunk", actor, chunk: chunkStart / 8, sourceEntryCount: chunk.length }));
      const groups = new Map();
      for (const { entry } of chunk) {
        const key = `${entry.roundOrdinal}:${entry.roundWind}:${entry.dealer}:${entry.kyoku}:${entry.honba}`;
        const group = groups.get(key) ?? { roundOrdinal: entry.roundOrdinal, roundWind: entry.roundWind, dealer: entry.dealer, kyoku: entry.kyoku, honba: entry.honba, entries: [] };
        group.entries.push(entry);
        groups.set(key, group);
      }
      const report = {
        reportId: `managed-local-mortal:${actor}:${chunkStart / 8}`,
        adapterVersion: manifest.identity.adapterVersion, engine: "Mortal",
        version: managedLocalMortalEngineVersion(manifest.identity),
        modelTag: manifest.identity.checkpointModelTag, playerId: actor,
        gameFingerprint: computeCanonicalGameFingerprint(stream), kyokus: [...groups.values()],
      };
      const chunkSelfDecisions = chunk.filter((row) => row.surface === "self").map((row) => row.decision);
      const chunkDecisions = chunkSelfDecisions.length > 0 ? chunkSelfDecisions : [decisions[0]];
      const chunkResponses = chunk.filter((row) => row.surface === "response").map((row) => row.decision);
      const factEngine = new JsonlFactEngineClient(new ManagedFactEngineTransport(join(repoRoot, "resources")));
      let review;
      try {
        review = await runMortalFullGameReview({
          stream, decisions: chunkDecisions, responseDecisions: chunkResponses, report,
          engine: factEngine, now: () => Date.parse("2026-09-24T00:00:00.000Z"),
          coverageRegistry: createMortalCoverageRegistry(MORTAL_COVERAGE_BRANCHES),
        });
      } finally {
        await factEngine.close();
      }
      if (review.status !== "coverage_ready" || review.retainedAnalyses.length === 0) {
        fail(`whole-game review failed: actor=${actor}; chunk=${chunkStart / 8}; ${review.status === "failed" ? review.code : "no_analysis_ready_decision"}`);
      }
      const pkg = buildStructuredAnalysisPackage({
        review, stream, decisions: chunkDecisions, responseDecisions: chunkResponses,
        componentVersions: {
          packageSchema: STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,
          canonicalReplay: "canonical-riichi-events/v2",
          mapperAdapter: "mahjong-soul-canonical-mapper/v1",
          factEngine: { engine: "mahjong-helper", upstreamCommit: MAHJONG_HELPER_COMMIT, adapterVersion: FACT_ENGINE_ADAPTER_VERSION, protocolVersion: FACT_ENGINE_PROTOCOL_VERSION },
          factorPipeline: "factor-pipeline/v1",
          mortalSourceModel: {
            identity: "Mortal", version: manifest.identity.adapterVersion, modelTag: manifest.identity.checkpointModelTag,
            evidenceSource: { kind: "managed_local_runtime", identity: manifest.identity },
          },
        },
        frozenPolicySnapshot: review.retainedAnalyses[0].modelEvaluation.detailPolicy,
        now: () => Date.parse("2026-09-24T00:00:00.000Z"),
      });
      validateStructuredAnalysisPackage(pkg);
      const selection = selectReviewDecisions(pkg);
      packages.push({ actor, chunk: chunkStart / 8, sourceEntryCount: chunk.length, packageId: pkg.packageId, semanticContentHash: pkg.semanticContentHash, status: pkg.record.status, selectedCount: selection.selected.length });
    }
  }
} finally {
  await runtime.close();
}

const requiredFamilies = ["discard", "riichi", "chi", "pon", "daiminkan", "hora", "pass", "ankan", "kakan"];
if (inferenceCount === 0 || requiredFamilies.some((family) => families[family] === 0)) {
  fail(`production spike coverage incomplete: ${JSON.stringify(families)}`);
}
const acceptance = {
  receiptVersion: "local-mortal-production-spike-receipt/v1",
  commit: process.env.GITHUB_SHA ?? "working-tree",
  runtimeIdentity: manifest.identity,
  nativeArtifactSha256: prepared.nativeArtifactSha256,
  fixtureSha256,
  actorPerspectives,
  inferenceCount,
  familyCandidateCounts: families,
  fixedErrorCounts: fixedErrors,
  packages,
  command: "npm run test:local-mortal-production-spike",
  exitCode: 0,
};
writeFileSync(join(artifactRoot, "production-spike-receipt.json"), `${JSON.stringify(acceptance, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "PASS", ...acceptance }));
