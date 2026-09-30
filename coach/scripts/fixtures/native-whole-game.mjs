/** Shared test fixture: real XML and captured native/CPU answers through current
 * production consumers and the real helper. No network or checkpoint is loaded.
 * Captured answers verify binding; they are not an independent rule oracle. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
  queryCanonicalLibriichiRules, runMortalFullGameReview, validateStructuredAnalysisPackage,
} from "@riichi-coach/reasoning";

const root = new URL("../../", import.meta.url);
const frozenNow = Date.parse("2026-09-28T00:00:00.000Z");

export async function nativeWholeGameFixture() {
  const captured = JSON.parse(await readFile(new URL("packages/reasoning/tests/fixtures/local-mortal/native-daiminkan-golden.json", root), "utf8"));
  const raw = await readFile(new URL(captured.provenance.sourcePath, root));
  assert.equal(createHash("sha256").update(raw).digest("hex"), captured.provenance.sourceSha256);
  const mapped = mapTenhouRecord({raw:raw.toString("utf8"),gameId:captured.stream.gameId,selfActor:1});
  assert.equal(mapped.status, "ready");
  const stream = mapped.stream;
  assert.deepEqual(stream, captured.stream);
  const byRef = new Map(captured.rows.map(row=>[row.decisionEventRef,row]));
  assert.equal(byRef.size, 65);
  let calls = 0;
  const census = await queryCanonicalLibriichiRules({stream,identity:captured.ruleIdentity,port:{queryRules:async request=>{
    calls++;
    const row = byRef.get(request.decision.triggerEventRef);
    assert(row);
    assert.equal(request.requestId, row.ruleResponse.requestId);
    return structuredClone(row.ruleResponse);
  }}});
  assert.equal(calls, 65);
  assert.deepEqual([...census.rules.values()].filter(row=>row.response.status==="error"), []);
  const entries = [];
  for (const decision of [...census.decisions,...census.responseDecisions]) {
    const rule = census.rules.get(decision.decisionEventRef);
    if (rule.response.status!=="ok" || rule.actions.length===1) continue;
    const request = projectLocalMortalRuleScoring({stream,decision,identity:captured.modelIdentity,
      ruleRequest:rule.request,ruleResult:rule.response});
    const response = byRef.get(decision.decisionEventRef).scoringResponse;
    assert(response);
    entries.push({decision,entry:localMortalRuleScoresToReportEntry({request,response,decision})});
  }
  assert.equal(entries.length, 22);
  const ordinal = new Map(stream.events.map((event,index)=>[event.eventId,index]));
  entries.sort((a,b)=>ordinal.get(a.decision.decisionEventRef)-ordinal.get(b.decision.decisionEventRef));
  const groups = new Map();
  for (const {entry} of entries) {
    const key = entry.roundOrdinal;
    if (!groups.has(key)) groups.set(key,{roundOrdinal:key,roundWind:entry.roundWind,dealer:entry.dealer,
      kyoku:entry.kyoku,honba:entry.honba,entries:[]});
    groups.get(key).entries.push(entry);
  }
  const report = {reportId:"native-daiminkan-golden",adapterVersion:captured.modelIdentity.adapterVersion,
    engine:"Mortal",version:managedLocalMortalEngineVersion(captured.modelIdentity),
    modelTag:captured.modelIdentity.checkpointModelTag,playerId:1,
    gameFingerprint:computeCanonicalGameFingerprint(stream),kyokus:[...groups.values()]};
  const versions = {packageSchema:NATIVE_STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,legalActionRules:captured.ruleIdentity,
    canonicalReplay:"canonical-riichi-events/v2",mapperAdapter:stream.mapperVersion,
    factEngine:{engine:"mahjong-helper",upstreamCommit:MAHJONG_HELPER_COMMIT,
      adapterVersion:FACT_ENGINE_ADAPTER_VERSION,protocolVersion:FACT_ENGINE_PROTOCOL_VERSION},
    factorPipeline:"factor-pipeline/v1",mortalSourceModel:{identity:"Mortal",version:captured.modelIdentity.adapterVersion,
      modelTag:captured.modelIdentity.checkpointModelTag,evidenceSource:{kind:"managed_local_runtime",identity:captured.modelIdentity}}};

  async function reviewPackage(sourceReport = report) {
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("resources/", root))));
    let review;
    try {
      review = await runMortalFullGameReview({stream,decisions:census.decisions,responseDecisions:census.responseDecisions,
        report:sourceReport,engine,now:()=>frozenNow,
        coverageRegistry:createMortalCoverageRegistry(MORTAL_COVERAGE_BRANCHES),
        libriichi:{identity:captured.ruleIdentity,results:census.rules}});
    } finally {await engine.close();}
    assert.equal(review.status, "coverage_ready");
    const input = {stream,decisions:census.decisions,responseDecisions:census.responseDecisions,review,componentVersions:versions,
      frozenPolicySnapshot:{threshold:10,unit:"model_selection_score_points",boundary:"greater_than_or_equal_is_detailed",
        policyVersion:"mortal-review/v1",frozenAt:new Date(frozenNow).toISOString()},now:()=>frozenNow};
    const pkg = buildStructuredAnalysisPackage(input);
    validateStructuredAnalysisPackage(pkg);
    return {review,pkg,input};
  }
  return {captured,stream,census,report,versions,reviewPackage};
}
