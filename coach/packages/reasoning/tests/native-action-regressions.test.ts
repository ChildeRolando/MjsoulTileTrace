import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LIBRIICHI_RULE_NORMALIZATION_VERSION, LOCAL_MORTAL_ADAPTER_VERSION, LOCAL_MORTAL_PROTOCOL_VERSION,
  FACT_ENGINE_ADAPTER_VERSION, FACT_ENGINE_PROTOCOL_VERSION, MAHJONG_HELPER_COMMIT,
  canonicalActionRef, libriichiRuleCanonicalJson, managedLocalMortalEngineVersion,
  type CanonicalGameEvent, type CanonicalEventStream, type LibriichiRuleSuccess,
  type LocalMortalScoringSuccess, type ManagedMortalRuntimeIdentity, type Tile,
} from "@riichi-coach/contracts";
import { computeCanonicalGameFingerprint } from "@riichi-coach/mortal-source";
import { createLibriichiRuleProjector } from "../src/analysis/libriichi-rule-projection.js";
import { collectLibriichiRuleResults } from "../src/analysis/libriichi-rule-collection.js";
import { projectLocalMortalRuleScoring, localMortalRuleScoresToReportEntry } from "../src/analysis/local-mortal-rule-scoring.js";
import { runMortalFullGameReview } from "../src/analysis/mortal-full-game-review.js";
import { createMortalCoverageRegistry, type MortalCoverageBranch } from "../src/analysis/mortal-coverage-registry.js";
import { buildStructuredAnalysisPackage } from "../src/analysis/structured-analysis-package-builder.js";
import { validateStructuredAnalysisPackage } from "../src/validate/structured-package-validator.js";
import { JsonlFactEngineClient } from "../src/fact-engine/jsonl-client.js";
import { ManagedFactEngineTransport } from "../src/fact-engine/managed-sidecar.js";
import { replayCanonicalStream, scanCanonicalResponseBoundaries, type ReplayedDecision } from "../src/replay/stream-replayer.js";
import { canonicalStartEvents, canonicalStream, canonicalTile } from "./fixtures/canonical-stream.js";
import { acceptedRiichiKanStream } from "./fixtures/accepted-riichi.js";
import * as reasoning from "../src/index.js";

const digest = (value: unknown) => createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");
const identity: ManagedMortalRuntimeIdentity = {
  runtimeImplementation:"Equim-chan/Mortal",runtimeRevision:"0".repeat(40),runtimeVersion:"Mortal V4",
  runtimeArtifactSha256:"1".repeat(64),nativeArtifactSha256:"2".repeat(64),runtimeModelSha256:"3".repeat(64),
  runtimeEngineSha256:"4".repeat(64),checkpointRepository:"Yuchen1457/mortal-582500",checkpointRevision:"5".repeat(40),
  checkpointFileSha256:"6".repeat(64),checkpointModelTag:"mortal-hpc@582500",
  protocolVersion:LOCAL_MORTAL_PROTOCOL_VERSION,adapterVersion:LOCAL_MORTAL_ADAPTER_VERSION,
};
const ruleIdentity = {implementation:"Equim-chan/Mortal/libriichi" as const,revision:identity.runtimeRevision,
  wrapperSha256:identity.runtimeArtifactSha256,nativeArtifactSha256:identity.nativeArtifactSha256,
  normalizationVersion:LIBRIICHI_RULE_NORMALIZATION_VERSION};
const action = (index:number, value:unknown, variant:string|null=null) =>
  ({runtimeAction:{index,variant},mjaiActionJson:JSON.stringify(value)});
const discard = (index:number,pai:string,tsumogiri=false) => action(index,{type:"dahai",actor:0,pai,tsumogiri});
const parseHand = (text:string) => [...text.matchAll(/([1-9]+)([mpsz])/g)].flatMap(m =>
  [...m[1]!].map(n => canonicalTile(`${n}${m[2]}` as Tile["id"])));

function builder(text:string,dealer=0) {
  const events=[...canonicalStartEvents(parseHand(text),canonicalTile("9s"))];
  (events[1] as Extract<CanonicalGameEvent,{type:"round_started"}>).dealer=dealer;
  const add=(event:Record<string,unknown>) => {
    const i=events.length;
    events.push({...event,eventId:`game:fixture/0/${i}/0`,sourceRecordRef:`record:${i}`} as CanonicalGameEvent);
    return events.at(-1)!.eventId;
  };
  const draw=(actor:number,id:Tile["id"])=>add({type:"tile_drawn",actor,
    tile:actor===0?{visibility:"visible",tile:canonicalTile(id)}:{visibility:"hidden"},from:"live_wall"});
  const drop=(actor:number,id:Tile["id"],discardMode="tsumogiri")=>add({type:"tile_discarded",actor,
    tile:canonicalTile(id),discardMode,riichiDeclarationEventRef:null});
  const pon=(actor:number,id:Tile["id"])=>{
    draw(actor,id);const calledDiscardEventRef=drop(actor,id);
    return add({type:"pon_called",actor:0,targetActor:actor,calledTile:canonicalTile(id),
      consumedTiles:[canonicalTile(id),canonicalTile(id)],calledDiscardEventRef});
  };
  return {events,add,draw,drop,pon,stream:()=>canonicalStream(events)};
}

// These explicit answers test consumers, not native legality. The matching
// scenarios are independently exercised against real libriichi in
// runtime_rules_native_test.py. No old enumerator or report supplies answers.
async function reviewCase(stream:CanonicalEventStream, decision:ReplayedDecision,
  actions:LibriichiRuleSuccess["actions"], branches:readonly MortalCoverageBranch[]) {
  const original = structuredClone({stream,decision});
  const ruleRequest=createLibriichiRuleProjector(stream,ruleIdentity)(decision);
  const content={protocolVersion:ruleRequest.protocolVersion,requestId:ruleRequest.requestId,
    identity:ruleIdentity,status:"ok" as const,actions};
  const ruleResult={...content,resultId:digest(content)};
  const results=await collectLibriichiRuleResults({stream,decisions:[decision],identity:ruleIdentity,
    port:{queryRules:async()=>ruleResult}});
  const bound=results.get(decision.decisionEventRef)!;
  expect(bound.response.status).toBe("ok");
  expect(bound.actions).toHaveLength(actions.length);
  const isResponse=ruleRequest.decision.surface==="response";
  const decisions=isResponse?[]:[decision],responseDecisions=isResponse?[decision]:[];
  const entries=[];
  if(actions.length>1) {
    const request=projectLocalMortalRuleScoring({stream,decision,identity,ruleRequest,ruleResult});
    const multipleKans=actions.filter(r=>r.runtimeAction.index===42).length>1;
    const candidates=actions.map((row,i)=>({runtimeAction:row.runtimeAction,ruleActionId:digest(row),
      qValue:row.runtimeAction.index===43?20:row.runtimeAction.index===42?10:i/100,
      ...(multipleKans&&row.runtimeAction.index===42?{kanSelectionQValue:i}:{}),
    }));
    const preferred=[...candidates].sort((a,b)=>b.qValue-a.qValue||(b.kanSelectionQValue??0)-(a.kanSelectionQValue??0))[0]!;
    const response:LocalMortalScoringSuccess={protocolVersion:request.protocolVersion,requestId:request.requestId,
      identity,ruleResultId:ruleResult.resultId,status:"ok",candidates,preferredRuntimeAction:preferred.runtimeAction};
    const entry=localMortalRuleScoresToReportEntry({decision,request,response});
    expect(entry.details).toHaveLength(actions.length);
    expect(entry.details.reduce((sum,row)=>sum+row.probability!,0)).toBeCloseTo(1);
    entries.push(entry);
  }
  const engine=new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/",import.meta.url))));
  try {
    const review=await runMortalFullGameReview({stream,decisions,responseDecisions,engine,
      coverageRegistry:createMortalCoverageRegistry(branches),libriichi:{identity:ruleIdentity,results},
      report:{reportId:"native-action-regression",adapterVersion:identity.adapterVersion,engine:"Mortal",
        version:managedLocalMortalEngineVersion(identity),modelTag:identity.checkpointModelTag,playerId:0,
        gameFingerprint:computeCanonicalGameFingerprint(stream),kyokus:entries.length?[{roundOrdinal:0,roundWind:"E",
          dealer:decision.snapshot.publicState.dealer,kyoku:0,honba:0,entries}]:[]}});
    expect(review.status).toBe("coverage_ready");
    if(review.status!=="coverage_ready")throw Error("review failed");
    expect(review.decisions.map(r=>r.outcome)).toEqual([actions.length===1?"source_row_not_expected":"analysis_ready"]);
    if(actions.length===1) {
      expect(review.decisions[0]!.singleCandidateProof).toMatchObject({shape:"libriichi_single_candidate",candidateCount:1,
        ruleRequestId:ruleRequest.requestId,ruleResultId:ruleResult.resultId,actionRef:canonicalActionRef(decision.actualAction!)});
    } else {
      const retained=review.retainedAnalyses[0]!;
      expect(retained.modelEvaluation.candidates.map(r=>r.actionRef).sort()).toEqual(bound.actions.map(r=>r.actionRef).sort());
      const pkg=buildStructuredAnalysisPackage({stream,decisions,responseDecisions,review,
        componentVersions:{packageSchema:"structured-analysis-package/v2",legalActionRules:ruleIdentity,
          canonicalReplay:"canonical-riichi-events/v2",mapperAdapter:stream.mapperVersion,
          factEngine:{engine:"mahjong-helper",upstreamCommit:MAHJONG_HELPER_COMMIT,adapterVersion:FACT_ENGINE_ADAPTER_VERSION,protocolVersion:FACT_ENGINE_PROTOCOL_VERSION},
          factorPipeline:"factor-pipeline/v1",mortalSourceModel:{identity:"Mortal",version:identity.adapterVersion,modelTag:identity.checkpointModelTag,
            evidenceSource:{kind:"managed_local_runtime",identity}}},frozenPolicySnapshot:retained.modelEvaluation.detailPolicy});
      expect(()=>validateStructuredAnalysisPackage(pkg)).not.toThrow();
      expect(pkg.decisions[0]!.outcome).toBe("analysis_ready");
    }
    expect({stream,decision}).toEqual(original);
    return review;
  } finally {await engine.close();}
}

describe("historical candidate failures through native scoring and package consumers",()=>{
  it("does not expose retired independent action or proof producers",()=>{
    for(const name of ["projectLocalMortalRequest","localMortalResponseToReportEntry","enumerateSelfDiscards",
      "collectSingleCandidateProofs","collectResponseSingleCandidateProofs","collectRiichiDeclarationTenpaiDiscards",
      "enumerateResponseCandidates","collectLocalMortalRiichiAnkanCandidates","collectLocalMortalAdditionalTsumoWindows",
      "collectLocalMortalRiichiCandidateWindows","collectLocalMortalRonCandidateWindows"])
      expect(reasoning).not.toHaveProperty(name);
  });

  it.each(["discard","ankan"] as const)("accepted multi-decomposition kan remains available, actual=%s",async actual=>{
    const stream=acceptedRiichiKanStream(parseHand("111222333m456p7z"),canonicalTile("1m"),actual);
    await reviewCase(stream,replayCanonicalStream(stream).at(-1)!,[
      discard(0,"1m",true),action(42,{type:"ankan",actor:0,consumed:["1m","1m","1m","1m"]}),
    ],["self_turn_ankan"]);
  });

  it.each(["discard","tsumo"] as const)("open sanankou includes both choices, actual=%s",async actual=>{
    const b=builder("46m111p999s3344z8p",3);b.draw(3,"5m");const ref=b.drop(3,"5m");
    b.add({type:"chi_called",actor:0,targetActor:3,calledTile:canonicalTile("5m"),
      consumedTiles:[canonicalTile("4m"),canonicalTile("6m")],calledDiscardEventRef:ref});
    b.drop(0,"8p","tedashi");
    for(const [a,id] of [[1,"5z"],[2,"6z"],[3,"7z"]] as const){b.draw(a,id);b.drop(a,id);}
    const target=b.draw(0,"3z");
    if(actual==="discard")b.drop(0,"3z");
    else b.add({type:"win_declared",winnerActor:0,method:"tsumo",winningTile:canonicalTile("3z"),targetActor:null,winSourceEventRef:target,scoreDeltas:null});
    const stream=b.stream();
    await reviewCase(stream,replayCanonicalStream(stream).at(-1)!,[
      discard(9,"1p"),discard(26,"9s"),discard(29,"W",true),discard(30,"N"),action(43,{type:"hora",actor:0,target:0,pai:"W"}),
    ],["dama_with_tsumo_candidate","self_turn_tsumo_actual"]);
  });

  it("multiple kan variants retain separate scores and exact package identities",async()=>{
    const b=builder("111155z123p456s7z",3);b.pon(3,"5z");b.drop(0,"6s","tedashi");
    for(const [a,id] of [[1,"2z"],[2,"3z"],[3,"4z"]] as const){b.draw(a,id);b.drop(a,id);}
    b.draw(0,"5z");b.drop(0,"5z");const stream=b.stream();
    await reviewCase(stream,replayCanonicalStream(stream).at(-1)!,[
      discard(9,"1p"),discard(10,"2p"),discard(11,"3p"),discard(21,"4s"),discard(22,"5s"),
      discard(27,"E"),discard(31,"P",true),discard(33,"C"),
      action(42,{type:"ankan",actor:0,consumed:["E","E","E","E"]},"kan:27"),
      action(42,{type:"kakan",actor:0,pai:"P",consumed:["P","P","P"]},"kan:31"),
    ],["self_turn_ankan","self_turn_kakan"]);
  });

  it("keeps the full scored decision when one discard has structural zero-shanten but no physical wait",async()=>{
    const b=builder("456999m777p45s55z",3);b.pon(3,"5z");b.drop(0,"5s","tedashi");
    for(const [a,id] of [[1,"2s"],[2,"3s"],[3,"4m"]] as const){b.draw(a,id);b.drop(a,id);}
    b.draw(0,"5z");b.drop(0,"5z");const stream=b.stream();
    const review=await reviewCase(stream,replayCanonicalStream(stream).at(-1)!,[
      discard(3,"4m"),discard(4,"5m"),discard(5,"6m"),discard(8,"9m"),
      discard(15,"7p"),discard(21,"4s"),discard(31,"P",true),
      action(42,{type:"kakan",actor:0,pai:"P",consumed:["P","P","P"]}),
    ],["self_turn_kakan"]);
    expect(review.summary.outcomes.analysis_blocked).toBe(0);
    expect(review.retainedAnalyses[0]!.factorResult.diagnostics.some(row=>row.status==="blocked_engine_failure")).toBe(false);
  });

  it("post-call unique discard carries the native proof",async()=>{
    const b=builder("556677z22m123p99s",3);
    for(const [a,id,drop] of [[3,"5z","1p"],[1,"6z","2p"],[1,"7z","3p"],[1,"2m","9s"]] as const){b.pon(a,id);b.drop(0,drop,"tedashi");}
    const stream=b.stream();
    await reviewCase(stream,replayCanonicalStream(stream).at(-1)!,[discard(26,"9s")],[]);
  });

  it("passing an offered non-wait retains pon and daiminkan scores",async()=>{
    const b=builder("111m223344p5566s",1);b.draw(1,"1m");const target=b.drop(1,"1m");
    b.draw(2,"5z");b.drop(2,"5z");const stream=b.stream();
    const decision=scanCanonicalResponseBoundaries(stream).find(r=>r.decisionEventRef===target)!;
    await reviewCase(stream,decision,[action(41,{type:"pon",actor:0,target:1,pai:"1m",consumed:["1m","1m"]}),
      action(42,{type:"daiminkan",actor:0,target:1,pai:"1m",consumed:["1m","1m","1m"]}),action(45,{type:"none"}),
    ],["resp_pass_on_discard"]);
  });
});
