import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_MORTAL_ADAPTER_VERSION, LOCAL_MORTAL_PROTOCOL_VERSION, LIBRIICHI_RULE_NORMALIZATION_VERSION,
  canonicalActionRef, libriichiRuleCanonicalJson, type LibriichiRuleSuccess, type ManagedMortalRuntimeIdentity,
  type LocalMortalScoringSuccess,
  type CanonicalEventStream, type Tile,
  STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION, MAHJONG_HELPER_COMMIT, FACT_ENGINE_ADAPTER_VERSION,
  FACT_ENGINE_PROTOCOL_VERSION, managedLocalMortalEngineVersion,
} from "@riichi-coach/contracts";
import { computeCanonicalGameFingerprint } from "@riichi-coach/mortal-source";
import { JsonlFactEngineClient } from "../src/fact-engine/jsonl-client.js";
import { ManagedFactEngineTransport } from "../src/fact-engine/managed-sidecar.js";
import { runMortalFullGameReview } from "../src/analysis/mortal-full-game-review.js";
import { createMortalCoverageRegistry } from "../src/analysis/mortal-coverage-registry.js";
import { buildStructuredAnalysisPackage } from "../src/analysis/structured-analysis-package-builder.js";
import { validateStructuredAnalysisPackage } from "../src/validate/structured-package-validator.js";
import { createLibriichiRuleProjector } from "../src/analysis/libriichi-rule-projection.js";
import { collectLibriichiRuleResults } from "../src/analysis/libriichi-rule-collection.js";
import { projectLocalMortalRuleScoring, bindLocalMortalRuleScores, localMortalRuleScoresToReportEntry } from "../src/analysis/local-mortal-rule-scoring.js";
import { replayCanonicalStream } from "../src/replay/stream-replayer.js";
import { deriveSemanticContentHash, derivePackageId } from "../src/analysis/package-identity.js";
import { canonicalStream, canonicalSelfDrawDiscardEvents, canonicalTile } from "./fixtures/canonical-stream.js";

const digest = (value: unknown) => createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");
const identity: ManagedMortalRuntimeIdentity = {
  runtimeImplementation: "Equim-chan/Mortal", runtimeRevision: "0".repeat(40), runtimeVersion: "Mortal V4",
  runtimeArtifactSha256: "1".repeat(64), nativeArtifactSha256: "2".repeat(64), runtimeModelSha256: "3".repeat(64),
  runtimeEngineSha256: "4".repeat(64), checkpointRepository: "Yuchen1457/mortal-582500", checkpointRevision: "5".repeat(40),
  checkpointFileSha256: "6".repeat(64), checkpointModelTag: "mortal-hpc@582500",
  protocolVersion: LOCAL_MORTAL_PROTOCOL_VERSION, adapterVersion: LOCAL_MORTAL_ADAPTER_VERSION,
};
function fixture(stream: CanonicalEventStream = canonicalStream(canonicalSelfDrawDiscardEvents()), actions: LibriichiRuleSuccess["actions"] = [
  { runtimeAction: { index: 0, variant: null }, mjaiActionJson: '{"type":"dahai","actor":0,"pai":"1m","tsumogiri":false}' },
  { runtimeAction: { index: 13, variant: null }, mjaiActionJson: '{"type":"dahai","actor":0,"pai":"5p","tsumogiri":true}' },
]) {
  const decision = replayCanonicalStream(stream)[0]!;
  const ruleRequest = createLibriichiRuleProjector(stream, {
    implementation: "Equim-chan/Mortal/libriichi", revision: identity.runtimeRevision, wrapperSha256: identity.runtimeArtifactSha256,
    nativeArtifactSha256: identity.nativeArtifactSha256, normalizationVersion: LIBRIICHI_RULE_NORMALIZATION_VERSION,
  })(decision);
  const content = { protocolVersion: ruleRequest.protocolVersion, identity: ruleRequest.identity, requestId: ruleRequest.requestId,
    status: "ok" as const, actions };
  const ruleResult: LibriichiRuleSuccess = { ...content, resultId: digest(content) };
  const input = { stream, decision, identity, ruleRequest, ruleResult };
  const request = projectLocalMortalRuleScoring(input);
  const response: LocalMortalScoringSuccess = {
    protocolVersion: request.protocolVersion, requestId: request.requestId, identity,
    ruleResultId: ruleResult.resultId, status: "ok",
    candidates: ruleResult.actions.map((row, i) => ({ runtimeAction: row.runtimeAction, ruleActionId: digest(row), qValue: i * 2 })),
    preferredRuntimeAction: actions.at(-1)!.runtimeAction,
  };
  return { ...input, request, response };
}

describe("native rules to scores to report without a second action enumerator", () => {
  it("same-tile tedashi keeps one score carrier and its actual identity through the native package", async () => {
    const events = canonicalSelfDrawDiscardEvents();
    const draw = events[2]!; const discard = events[3]!;
    if(draw.type !== "tile_drawn" || discard.type !== "tile_discarded") throw new Error("fixture");
    draw.tile = {visibility:"visible",tile:canonicalTile("1m")};
    discard.tile = canonicalTile("1m"); discard.discardMode = "tedashi";
    const actions = Array.from({length:13},(_,index)=>({runtimeAction:{index,variant:null},
      mjaiActionJson:JSON.stringify({type:"dahai",actor:0,pai:index<9 ? `${index+1}m` : `${index-8}p`,tsumogiri:index===0}),
      ...(index===0 ? {physicalAliases:[JSON.stringify({type:"dahai",actor:0,pai:"1m",tsumogiri:false})]} : {})}));
    actions.push({runtimeAction:{index:37,variant:null},mjaiActionJson:'{"type":"reach","actor":0}'});
    const input = fixture(canonicalStream(events),actions);
    const entry = localMortalRuleScoresToReportEntry(input);
    const switched = {...input,decision:{...input.decision,actualAction:{kind:"discard",tile:canonicalTile("1m"),discardMode:"tsumogiri"} as const}};
    expect(localMortalRuleScoresToReportEntry(switched).details).toEqual(entry.details);
    expect(projectLocalMortalRuleScoring(switched)).toEqual(input.request);
    expect(entry.actual).toMatchObject({type:"dahai",pai:"1m",tsumogiri:false});
    expect(entry.details[0]!.action).toMatchObject({type:"dahai",pai:"1m",tsumogiri:true});
    expect(entry.details).toHaveLength(14);
    expect(entry.details.reduce((sum,row)=>sum+row.probability!,0)).toBeCloseTo(1);
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/",import.meta.url))));
    try {
      const rules = await collectLibriichiRuleResults({stream:input.stream,decisions:[input.decision],identity:input.ruleRequest.identity,
        port:{queryRules:async()=>input.ruleResult}});
      const review = await runMortalFullGameReview({stream:input.stream,decisions:[input.decision],responseDecisions:[],engine,
        coverageRegistry:createMortalCoverageRegistry(["dama_with_riichi_candidate"]),
        libriichi:{identity:input.ruleRequest.identity,results:rules},
        report:{reportId:"native-discard-mode",adapterVersion:identity.adapterVersion,engine:"Mortal",version:managedLocalMortalEngineVersion(identity),
          modelTag:identity.checkpointModelTag,playerId:0,gameFingerprint:computeCanonicalGameFingerprint(input.stream),
          kyokus:[{roundOrdinal:0,roundWind:"E",dealer:0,kyoku:0,honba:0,entries:[entry]}]}});
      expect(review.status).toBe("coverage_ready");
      if(review.status!=="coverage_ready") throw new Error("review failed");
      expect(review.decisions.map(row=>row.outcome)).toEqual(["analysis_ready"]);
      const retained = review.retainedAnalyses[0]!;
      const pkg = buildStructuredAnalysisPackage({review,stream:input.stream,decisions:[input.decision],responseDecisions:[],
        componentVersions:{packageSchema:"structured-analysis-package/v2",legalActionRules:input.ruleRequest.identity,
          canonicalReplay:"canonical-riichi-events/v2",mapperAdapter:input.stream.mapperVersion,
          factEngine:{engine:"mahjong-helper",upstreamCommit:MAHJONG_HELPER_COMMIT,adapterVersion:FACT_ENGINE_ADAPTER_VERSION,protocolVersion:FACT_ENGINE_PROTOCOL_VERSION},
          factorPipeline:"factor-pipeline/v1",mortalSourceModel:{identity:"Mortal",version:identity.adapterVersion,modelTag:identity.checkpointModelTag,
            evidenceSource:{kind:"managed_local_runtime",identity}}},frozenPolicySnapshot:retained.modelEvaluation.detailPolicy});
      expect(()=>validateStructuredAnalysisPackage(pkg)).not.toThrow();
      expect(pkg.decisions[0]!.normalizedDecisionContext.actualAction).toMatchObject({kind:"discard",discardMode:"tedashi"});
      const decision = pkg.decisions[0]!;
      if(decision.outcome !== "analysis_ready") throw new Error("fixture");
      expect(decision.modelEvaluation.candidates).toHaveLength(14);
      expect(decision.comparisonSet.correspondences).toEqual([{relation:"native_physical_realization",ruleResultId:input.ruleResult.resultId,
        actualActionRef:canonicalActionRef(input.decision.actualAction!),scoredModelActionRef:canonicalActionRef(switched.decision.actualAction)}]);
      const forged = structuredClone(pkg);
      const forgedDecision = forged.decisions[0]!;
      if(forgedDecision.outcome !== "analysis_ready") throw new Error("fixture");
      const correspondence = forgedDecision.comparisonSet.correspondences![0]!;
      if(correspondence.relation !== "native_physical_realization") throw new Error("fixture");
      correspondence.ruleResultId = "f".repeat(64);
      forged.semanticContentHash = deriveSemanticContentHash(forged);
      forged.packageId = derivePackageId(forged);
      expect(()=>validateStructuredAnalysisPackage(forged)).toThrow("physical_correspondence");
    } finally { await engine.close(); }
  });

  it.each(["legacy", "native"] as const)("R14 nine-terminals reaches the %s full-game consumer", async mode => {
    const events = canonicalSelfDrawDiscardEvents();
    const start = events[1]!;
    const drawn = events[2]!;
    const discarded = events[3]!;
    if (start.type !== "round_started" || drawn.type !== "tile_drawn" || discarded.type !== "tile_discarded") throw new Error("fixture");
    start.selfHand = ["1m","9m","1p","9p","1s","9s","1z","2z","3z","4z","5z","6z","7z"].map(id => canonicalTile(id as Tile["id"]));
    start.doraIndicator = canonicalTile("8p");
    drawn.tile = { visibility:"visible", tile:canonicalTile("2m") };
    discarded.tile = canonicalTile("2m");
    // Fixed full native set, also checked against real libriichi by the native
    // suite and CPU capability probe. Injected scores are protocol test data.
    const indices = [0,1,8,9,17,18,26,27,28,29,30,31,32,33,37,44];
    const mjai = ["1m","2m","9m","1p","9p","1s","9s","E","S","W","N","P","F","C"];
    const actions = indices.map((index, i) => ({ runtimeAction:{index,variant:null}, mjaiActionJson: JSON.stringify(
      index === 37 ? {type:"reach",actor:0} : index === 44 ? {type:"ryukyoku",actor:0,reason:"kyuushu_kyuuhai"}
        : {type:"dahai",actor:0,pai:mjai[i],tsumogiri:index === 1}) }));
    const input = fixture(canonicalStream(events), actions);
    const entry = localMortalRuleScoresToReportEntry(input);
    expect(entry.details.map(row => row.action.type)).toEqual([...Array(14).fill("dahai"),"reach","ryukyoku"]);
    expect(entry.details.at(-1)!.action.reason).toBe("kyuushu_kyuuhai");
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))));
    const rules = await collectLibriichiRuleResults({stream:input.stream,decisions:[input.decision],identity:input.ruleRequest.identity,
      port:{queryRules:async()=>input.ruleResult}});
    try {
      const reviewInput = { stream:input.stream, decisions:[input.decision], responseDecisions:[], engine,
        ...(mode === "native" ? {libriichi:{identity:input.ruleRequest.identity,results:rules}} : {}),
        coverageRegistry:createMortalCoverageRegistry(["self_turn_kyuushu","dama_with_riichi_candidate"]),
        report:{reportId:"native-nine-terminals-regression",adapterVersion:identity.adapterVersion,engine:"Mortal" as const,
          version:managedLocalMortalEngineVersion(identity),modelTag:identity.checkpointModelTag,playerId:0,
          gameFingerprint:computeCanonicalGameFingerprint(input.stream),
          kyokus:[{roundOrdinal:0,roundWind:"E" as const,dealer:0,kyoku:0,honba:0,entries:[entry]}]},
      };
      // R14's original wire shape: index 44 carried actor but no abort reason.
      // Keep all 16 rows/scores so this isolates the failed downstream import.
      const broken = { ...entry, details: entry.details.map(row => {
        if (row.action.type !== "ryukyoku") return row;
        const { reason: _reason, ...action } = row.action;
        return { ...row, action };
      }) };
      const oldShape = await runMortalFullGameReview({ ...reviewInput,
        report:{...reviewInput.report,kyokus:[{...reviewInput.report.kyokus[0]!,entries:[broken]}]},
      });
      expect(oldShape.status).toBe("coverage_ready");
      if (oldShape.status !== "coverage_ready") throw new Error("negative control failed");
      expect(oldShape.decisions.map(row => row.outcome)).toEqual(["model_output_incomplete"]);
      const review = await runMortalFullGameReview(reviewInput);
      expect(review.status).toBe("coverage_ready");
      if (review.status !== "coverage_ready") throw new Error("review failed");
      expect(review.decisions.map(row => row.outcome)).toEqual(["analysis_ready"]);
      expect(review.summary.outcomes.no_mortal_entry).toBe(0);
      const retained = review.retainedAnalyses[0]!;
      expect(retained.modelEvaluation.candidates).toHaveLength(16);
      const packageInput = {review,stream:input.stream,decisions:[input.decision],responseDecisions:[],
        componentVersions:{packageSchema:mode === "native" ? "structured-analysis-package/v2" as const : STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,
          ...(mode === "native" ? {legalActionRules:input.ruleRequest.identity} : {}),canonicalReplay:"canonical-riichi-events/v2",
          mapperAdapter:input.stream.mapperVersion,factEngine:{engine:"mahjong-helper" as const,upstreamCommit:MAHJONG_HELPER_COMMIT,
            adapterVersion:FACT_ENGINE_ADAPTER_VERSION,protocolVersion:FACT_ENGINE_PROTOCOL_VERSION},factorPipeline:"factor-pipeline/v1",
          mortalSourceModel:{identity:"Mortal",version:identity.adapterVersion,modelTag:identity.checkpointModelTag,
            evidenceSource:{kind:"managed_local_runtime" as const,identity}}},
        frozenPolicySnapshot:retained.modelEvaluation.detailPolicy};
      const pkg = buildStructuredAnalysisPackage(packageInput);
      expect(() => validateStructuredAnalysisPackage(pkg)).not.toThrow();
      expect(pkg.decisions.map(row => row.outcome)).toEqual(["analysis_ready"]);
      if(mode === "native") {
        expect(pkg.legalActionEvidence?.results).toHaveLength(1);
        const helperCalls=vi.spyOn(engine,"analyzeHandStructure");
        const missing={...entry,details:entry.details.filter(row=>row.action.pai!=="1m").map(row=>({...row,probability:1/15}))};
        const incomplete=await runMortalFullGameReview({...reviewInput,
          report:{...reviewInput.report,kyokus:[{...reviewInput.report.kyokus[0]!,entries:[missing]}]}});
        expect(incomplete.status).toBe("coverage_ready");
        if(incomplete.status!=="coverage_ready") throw new Error("review failed");
        expect(incomplete.decisions[0]).toMatchObject({outcome:"model_output_incomplete",reason:"legal_candidate_mismatch"});
        expect(helperCalls).not.toHaveBeenCalled();
        helperCalls.mockRestore();
      }
    } finally { await engine.close(); }
  });
  it("keeps identical input, candidates and scores when the actual choice changes", () => {
    const input = fixture();
    const alternative = { ...structuredClone(input.decision),
      actualAction: { kind: "discard", tile: { id: "1m", red: false }, discardMode: "tedashi" } as const };
    expect(projectLocalMortalRuleScoring({ ...input, decision: alternative })).toEqual(input.request);
    expect(input.request).not.toHaveProperty("actualActionRef");
    const first = localMortalRuleScoresToReportEntry(input);
    const second = localMortalRuleScoresToReportEntry({ ...input, decision: alternative });
    expect(first.details).toEqual(second.details);
    expect(first.details.map(row => [row.action.pai, row.qValue])).toEqual([["1m", 0], ["5p", 2]]);
    expect(first.actualIndex).toBe(1);
    expect(second.actualIndex).toBe(0);
    expect(first.localDecisionIdentity?.triggerEventRef).toBe(input.decision.decisionEventRef);
    expect(first.details.reduce((sum, row) => sum + row.probability!, 0)).toBeCloseTo(1);
  });

  it("R14 rejects swapped action payloads even with freshly recomputed result and request hashes", () => {
    const input = fixture();
    const rows = input.ruleResult.actions;
    [rows[0]!.mjaiActionJson, rows[1]!.mjaiActionJson] = [rows[1]!.mjaiActionJson, rows[0]!.mjaiActionJson];
    const { resultId: _old, ...content } = input.ruleResult;
    input.ruleResult.resultId = digest(content);
    expect(() => projectLocalMortalRuleScoring(input)).toThrow("rules_action_mapping_invalid");
  });

  it.each(["different-rule-result", "swapped-score-identity", "wrong-preferred", "extra-kan-score", "missing-score", "duplicate-score"])(
    "rejects %s before building a report row", mutation => {
      const input = fixture();
      if (mutation === "different-rule-result") input.response.ruleResultId = "f".repeat(64);
      if (mutation === "swapped-score-identity") [input.response.candidates[0]!.ruleActionId, input.response.candidates[1]!.ruleActionId] =
        [input.response.candidates[1]!.ruleActionId, input.response.candidates[0]!.ruleActionId];
      if (mutation === "wrong-preferred") input.response.preferredRuntimeAction = input.response.candidates[0]!.runtimeAction;
      if (mutation === "extra-kan-score") input.response.candidates[0]!.kanSelectionQValue = 10;
      if (mutation === "missing-score") input.response.candidates.pop();
      if (mutation === "duplicate-score") input.response.candidates[1] = input.response.candidates[0]!;
      expect(() => localMortalRuleScoresToReportEntry(input)).toThrow();
    });

  it("does not change a native result to accommodate an absent actual action", () => {
    const input = fixture();
    const actualAction = { kind: "discard", tile: { id: "2m", red: false }, discardMode: "tedashi" } as const;
    const changed = { ...input, decision: { ...input.decision, actualAction } };
    expect(bindLocalMortalRuleScores(changed).actions.map(row => row.actionRef)).not.toContain(canonicalActionRef(actualAction));
    expect(() => localMortalRuleScoresToReportEntry(changed)).toThrow("mortal_actual_action_mismatch");
    expect(input.ruleResult.actions).toHaveLength(2);
  });

  it("rejects a changed stream even when the decision identifiers are reused", () => {
    const input = fixture();
    input.stream.ruleSet.openTanyao = false;
    expect(() => projectLocalMortalRuleScoring(input)).toThrow();
  });

  it("rejects mismatched native provenance even after rehashing and changing both model identities", () => {
    const input = fixture();
    input.request.identity = { ...input.request.identity, nativeArtifactSha256: "f".repeat(64) };
    input.response.identity = input.request.identity;
    const { requestId: _old, ...content } = input.request;
    input.request.requestId = digest(content);
    input.response.requestId = input.request.requestId;
    expect(() => bindLocalMortalRuleScores(input)).toThrow();
  });
});
