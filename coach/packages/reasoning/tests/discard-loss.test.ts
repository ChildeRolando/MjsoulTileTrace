import { describe, expect, it, vi } from "vitest";
import { type Hand13FactRequest, type Hand13FactResult, type StructuredAnalysisPackage, type LibriichiRuleIdentity, LIBRIICHI_RULE_NORMALIZATION_VERSION } from "@riichi-coach/contracts";
import { calculateDiscardLoss } from "../src/factors/discard-loss.js";
import { createLibriichiRuleProjector, normalizeLibriichiRuleActions } from "../src/analysis/libriichi-rule-projection.js";
import { replayCanonicalStream } from "../src/replay/stream-replayer.js";
import { canonicalSelfDrawDiscardEvents, canonicalStream } from "./fixtures/canonical-stream.js";
import type { MahjongFactEnginePort } from "../src/fact-engine/port.js";

function fixture() {
  const stream = canonicalStream(canonicalSelfDrawDiscardEvents());
  const decision = replayCanonicalStream(stream)[0]!;
  const identity:LibriichiRuleIdentity={implementation:"Equim-chan/Mortal/libriichi",revision:"0".repeat(40),nativeArtifactSha256:"1".repeat(64),wrapperSha256:"2".repeat(64),normalizationVersion:LIBRIICHI_RULE_NORMALIZATION_VERSION};
  const request = createLibriichiRuleProjector(stream,identity)(decision);
  const response = {protocolVersion:request.protocolVersion,requestId:request.requestId,identity,status:"ok" as const,resultId:"fixture",
    actions:[{runtimeAction:{index:0,variant:null},mjaiActionJson:JSON.stringify({type:"dahai",actor:0,pai:"1m",tsumogiri:false})},
      {runtimeAction:{index:1,variant:null},mjaiActionJson:JSON.stringify({type:"dahai",actor:0,pai:"2m",tsumogiri:false})},
      {runtimeAction:{index:13,variant:null},mjaiActionJson:JSON.stringify({type:"dahai",actor:0,pai:"5p",tsumogiri:true})}]};
  const facts=decision.facts;
  const actions=normalizeLibriichiRuleActions(request,response,{decisionWindow:facts.decisionWindow,concealedTiles:facts.concealedTiles,currentDraw:facts.currentDraw,melds:facts.melds});
  // Focused input seam fixture; full package validation is the controller's job.
  const pkg={decisions:[{decisionId:"d",outcome:"analysis_ready",knownGameFacts:facts,comparisonSet:{candidates:actions.map(a=>({actionRef:a.actionRef,action:a.action,origins:["model"]}))}}],
    legalActionEvidence:{identity,results:[{decisionId:"d",request,response}]}} as unknown as StructuredAnalysisPackage;
  const analyzeHand13=vi.fn(async (r:Hand13FactRequest) => {
    const first=r.actionRef===actions[0]!.actionRef,third=r.actionRef===actions[2]!.actionRef;
    return {calculationMode:"efficiency-v1",shanten:third?2:1,waitsRemainingStatus:"calculated",
      waitsRemaining:(third?[30]:first?[6]:[7]).map(tile34=>({tile34,count:r.leftTiles34![tile34]!})),
      improves:(third?[31]:first?[8,9]:[6,8]).map(drawTile34=>({drawTile34,bestWaits:[]}))} as unknown as Hand13FactResult;
  });
  return {pkg,analyzeHand13,engine:{analyzeHand13} as unknown as MahjongFactEnginePort};
}

describe("discard opportunity loss",()=>{
  it("uses the union, keeps direct/improvement distinct, and excludes regressing branches from the baseline",async()=>{
    const {pkg,engine,analyzeHand13}=fixture();
    const result=await calculateDiscardLoss(pkg,"d",engine);
    expect(result.status).toBe("ready");if(result.status!=="ready")return;
    expect(result.baselineShanten).toBe(1);
    expect(result.candidates[0]!.directLost.map(t=>t.tile.id)).toEqual(["8m"]);
    expect(result.candidates[1]!.directLost).toEqual([{tile:{id:"7m",red:false},count:3,degradedToImprovement:true}]); // one 7m is in the known hand
    expect(result.candidates[1]!.improvementLost.map(t=>t.tile.id)).toEqual(["1p"]);
    expect(result.candidates.flatMap(c=>[...c.directLost,...c.improvementLost]).some(t=>t.tile.id==="4z"||t.tile.id==="5z")).toBe(false);
    const requests=analyzeHand13.mock.calls.map(([r])=>r);
    expect(requests.every(r=>r.calculationMode==="efficiency-v1")).toBe(true);
    expect(requests[0]!.leftTiles34).toEqual(requests[1]!.leftTiles34);
    expect(requests[0]!.leftTiles34).toEqual(requests[2]!.leftTiles34); // draw moved to river, counted once
  });
  it("does not turn missing legality, incomplete visibility or engine failure into zero",async()=>{
    const {pkg,engine,analyzeHand13}=fixture();
    const legacy=structuredClone(pkg);delete legacy.legalActionEvidence;
    expect(await calculateDiscardLoss(legacy,"d",engine)).toEqual({status:"unavailable",reason:"legal_actions_missing"});
    expect(analyzeHand13).not.toHaveBeenCalled();
    const partial=structuredClone(pkg);partial.decisions[0]!.knownGameFacts.completeness.rivers=false;
    expect(await calculateDiscardLoss(partial,"d",engine)).toEqual({status:"unavailable",reason:"facts_missing"});
    analyzeHand13.mockRejectedValue(new Error("helper unavailable"));
    expect(await calculateDiscardLoss(pkg,"d",engine)).toEqual({status:"unavailable",reason:"engine_failed"});
  });
});
