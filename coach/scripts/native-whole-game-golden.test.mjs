/** Captured real CPU/native output + freshly mapped XML + real helper.
 * Default tests replay the capture: no native assets, checkpoint or network.
 * Same-engine replay proves consumer binding, not independent rule correctness.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  FACT_ENGINE_ADAPTER_VERSION, FACT_ENGINE_PROTOCOL_VERSION, MAHJONG_HELPER_COMMIT,
  NATIVE_STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION, managedLocalMortalEngineVersion,
} from "@riichi-coach/contracts";
import { mapTenhouRecord } from "@riichi-coach/tenhou-source";
import { computeCanonicalGameFingerprint } from "@riichi-coach/mortal-source";
import {
  JsonlFactEngineClient, ManagedFactEngineTransport, MORTAL_COVERAGE_BRANCHES,
  buildStructuredAnalysisPackage, createMortalCoverageRegistry,
  localMortalRuleScoresToReportEntry, projectLocalMortalRuleScoring,
  queryCanonicalLibriichiRules, runMortalFullGameReview,
  selectReviewDecisions, validateStructuredAnalysisPackage,
} from "@riichi-coach/reasoning";

const root = new URL("../", import.meta.url);
const captureUrl = new URL("packages/reasoning/tests/fixtures/local-mortal/native-daiminkan-golden.json", root);
const frozenNow = Date.parse("2026-09-28T00:00:00.000Z");
let captured, stream, census, report, versions, baseline;

async function reviewPackage(sourceReport = report) {
  const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("resources/", root))));
  let review;
  try {
    review = await runMortalFullGameReview({stream, decisions:census.decisions, responseDecisions:census.responseDecisions,
      report:sourceReport, engine, now:()=>frozenNow,
      coverageRegistry:createMortalCoverageRegistry(MORTAL_COVERAGE_BRANCHES),
      libriichi:{identity:captured.ruleIdentity,results:census.rules}});
  } finally { await engine.close(); }
  expect(review.status).toBe("coverage_ready");
  const input = {stream,decisions:census.decisions,responseDecisions:census.responseDecisions,review,componentVersions:versions,
    frozenPolicySnapshot:{threshold:10,unit:"model_selection_score_points",boundary:"greater_than_or_equal_is_detailed",
      policyVersion:"mortal-review/v1",frozenAt:new Date(frozenNow).toISOString()},now:()=>frozenNow};
  const pkg = buildStructuredAnalysisPackage(input);
  validateStructuredAnalysisPackage(pkg);
  return {review,pkg,input};
}

beforeAll(async () => {
  captured = JSON.parse(await readFile(captureUrl,"utf8"));
  const raw = await readFile(new URL(captured.provenance.sourcePath,root));
  expect(createHash("sha256").update(raw).digest("hex")).toBe(captured.provenance.sourceSha256);
  const mapped = mapTenhouRecord({raw:raw.toString("utf8"),gameId:captured.stream.gameId,selfActor:1});
  expect(mapped.status).toBe("ready");
  stream=mapped.stream;
  expect(stream).toEqual(captured.stream);
  const byRef=new Map(captured.rows.map(row=>[row.decisionEventRef,row]));
  expect(byRef.size).toBe(65);
  const queryRules=vi.fn(async request=>{
    const row=byRef.get(request.decision.triggerEventRef);
    expect(row).toBeDefined();
    expect(request.requestId).toBe(row.ruleResponse.requestId);
    return structuredClone(row.ruleResponse);
  });
  census=await queryCanonicalLibriichiRules({stream,identity:captured.ruleIdentity,port:{queryRules}});
  expect(queryRules).toHaveBeenCalledTimes(65);
  expect([...census.rules.values()].filter(row=>row.response.status==="error")).toEqual([]);
  const entries=[];
  for(const decision of [...census.decisions,...census.responseDecisions]) {
    const rule=census.rules.get(decision.decisionEventRef);
    if(rule.response.status!=="ok" || rule.actions.length===1) continue;
    const request=projectLocalMortalRuleScoring({stream,decision,identity:captured.modelIdentity,
      ruleRequest:rule.request,ruleResult:rule.response});
    const response=byRef.get(decision.decisionEventRef).scoringResponse;
    expect(response).toBeDefined();
    entries.push({decision,entry:localMortalRuleScoresToReportEntry({request,response,decision})});
  }
  expect(entries).toHaveLength(22);
  const ordinal=new Map(stream.events.map((event,index)=>[event.eventId,index]));
  entries.sort((a,b)=>ordinal.get(a.decision.decisionEventRef)-ordinal.get(b.decision.decisionEventRef));
  const groups=new Map();
  for(const {entry} of entries) {
    const key=entry.roundOrdinal;
    if(!groups.has(key)) groups.set(key,{roundOrdinal:key,roundWind:entry.roundWind,dealer:entry.dealer,
      kyoku:entry.kyoku,honba:entry.honba,entries:[]});
    groups.get(key).entries.push(entry);
  }
  report={reportId:"native-daiminkan-golden",adapterVersion:captured.modelIdentity.adapterVersion,
    engine:"Mortal",version:managedLocalMortalEngineVersion(captured.modelIdentity),
    modelTag:captured.modelIdentity.checkpointModelTag,playerId:1,
    gameFingerprint:computeCanonicalGameFingerprint(stream),kyokus:[...groups.values()]};
  versions={packageSchema:NATIVE_STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,legalActionRules:captured.ruleIdentity,
    canonicalReplay:"canonical-riichi-events/v2",mapperAdapter:stream.mapperVersion,
    factEngine:{engine:"mahjong-helper",upstreamCommit:MAHJONG_HELPER_COMMIT,
      adapterVersion:FACT_ENGINE_ADAPTER_VERSION,protocolVersion:FACT_ENGINE_PROTOCOL_VERSION},
    factorPipeline:"factor-pipeline/v1",mortalSourceModel:{identity:"Mortal",version:captured.modelIdentity.adapterVersion,
      modelTag:captured.modelIdentity.checkpointModelTag,evidenceSource:{kind:"managed_local_runtime",identity:captured.modelIdentity}}};
  baseline=await reviewPackage();
},120000);

describe("native whole-game golden",()=>{
  it("retains all 22 evaluations across both surfaces and accounts for all 65 boundaries",()=>{
    expect(baseline.review.summary.outcomes).toEqual({analysis_ready:22,unsupported_action:0,source_row_not_expected:0,
      no_mortal_entry:0,binding_mismatch:0,model_output_incomplete:0,analysis_blocked:0});
    expect(baseline.review.retainedAnalyses).toHaveLength(22);
    expect(baseline.review.libriichi.nonActionBoundaries).toHaveLength(43);
    expect(baseline.pkg.decisions).toHaveLength(22);
    expect(baseline.pkg.legalActionEvidence.results).toHaveLength(65);
    expect(baseline.pkg.record.status).toBe("complete");
    expect(baseline.pkg.decisions.filter(row=>row.surface==="response")).toHaveLength(6);
    expect(baseline.pkg.decisions.filter(row=>row.surface==="response").map(row=>row.comparisonSet.candidates.find(c=>c.origins.includes("actual")).action.kind))
      .toEqual(["pass","pass","pass","chi","daiminkan","ron"]);
  });

  it("records missing model rows as incomplete while preserving successful rules and non-action boundaries",async()=>{
    const missing=await reviewPackage({...report,kyokus:[]});
    expect(missing.review.summary.outcomes.no_mortal_entry).toBe(22);
    expect(missing.review.retainedAnalyses).toEqual([]);
    expect(missing.review.libriichi.nonActionBoundaries).toHaveLength(43);
    expect(missing.pkg.legalActionEvidence.results).toEqual(baseline.pkg.legalActionEvidence.results);
    expect(missing.pkg.record.status).toBe("integrity_failed");
    expect(selectReviewDecisions(missing.pkg).selected).toEqual([]);
  },120000);

  it("recomputes the complete analysis, package identity and selection deterministically",async()=>{
    const second=await reviewPackage();
    expect(second.pkg.analysisKey).toBe(baseline.pkg.analysisKey);
    expect(second.pkg.packageId).toBe(baseline.pkg.packageId);
    expect(second.pkg.semanticContentHash).toBe(baseline.pkg.semanticContentHash);
    expect(selectReviewDecisions(second.pkg)).toEqual(selectReviewDecisions(baseline.pkg));
    const other=buildStructuredAnalysisPackage({...baseline.input,componentVersions:{...versions,factorPipeline:"factor-pipeline/v2"}});
    expect(other.packageId).not.toBe(baseline.pkg.packageId);
    expect(other.semanticContentHash).not.toBe(baseline.pkg.semanticContentHash);
  },120000);

  it("selects the two pinned disagreements with resolvable decision identities",()=>{
    const selection=selectReviewDecisions(baseline.pkg);
    const prefix=`decision:${stream.gameId}:self1:self:self_turn:${stream.gameId}/0/`;
    expect(selection.selected).toEqual([
      {decisionId:`${prefix}66/0`,rank:1,selectionReason:"model_disagreement_above_threshold"},
      {decisionId:`${prefix}74/0`,rank:2,selectionReason:"model_disagreement_above_threshold"},
    ]);
    expect(selection.analysisPackageId).toBe(baseline.pkg.packageId);
    expect(selection.analysisPackageStatus).toBe("complete");
    for(const item of selection.selected) {
      const decision=baseline.pkg.decisions.find(row=>row.decisionId===item.decisionId);
      expect(decision.outcome).toBe("analysis_ready");
      expect(decision.modelEvaluation.errorGap).toBeGreaterThanOrEqual(10);
    }
  });
});
