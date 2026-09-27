import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { LIBRIICHI_RULE_NORMALIZATION_VERSION, libriichiRuleCanonicalJson,
  type CanonicalGameEvent, type LibriichiRuleRequest, type LibriichiRuleSuccess, type TileId } from "@riichi-coach/contracts";
import { collectDamaTsumoWindows } from "../src/replay/dama-tsumo-discovery.js";
import { canonicalStartEvents, canonicalStream, canonicalTile } from "./fixtures/canonical-stream.js";

const identity = {implementation:"Equim-chan/Mortal/libriichi" as const,revision:"0".repeat(40),
  nativeArtifactSha256:"1".repeat(64),wrapperSha256:"2".repeat(64),normalizationVersion:LIBRIICHI_RULE_NORMALIZATION_VERSION};
function fixture(discard:"9m"|"4p"="9m", twice=false) {
  const events:CanonicalGameEvent[]=[...canonicalStartEvents()];
  const add=(event:Record<string,unknown>)=>events.push({...event,eventId:`game:fixture/0/${events.length}/0`,sourceRecordRef:`record:${events.length}`} as CanonicalGameEvent);
  add({type:"tile_drawn",actor:0,tile:{visibility:"visible",tile:canonicalTile("4p")},from:"live_wall"});
  add({type:"tile_discarded",actor:0,tile:canonicalTile(discard),discardMode:discard==="4p"?"tsumogiri":"tedashi",riichiDeclarationEventRef:null});
  if(twice) {
    for(const actor of [1,2,3]) {
      add({type:"tile_drawn",actor,tile:{visibility:"hidden"},from:"live_wall"});
      add({type:"tile_discarded",actor,tile:canonicalTile("7z"),discardMode:"tsumogiri",riichiDeclarationEventRef:null});
    }
    add({type:"tile_drawn",actor:0,tile:{visibility:"visible",tile:canonicalTile("9m")},from:"live_wall"});
    add({type:"tile_discarded",actor:0,tile:canonicalTile("9m"),discardMode:"tsumogiri",riichiDeclarationEventRef:null});
  }
  return canonicalStream(events);
}
function response(request:LibriichiRuleRequest, winning:boolean):LibriichiRuleSuccess {
  const draw=JSON.parse(request.events.at(-1)!.json).pai;
  const actions=[{runtimeAction:{index:8,variant:null},mjaiActionJson:JSON.stringify({type:"dahai",actor:0,pai:"9m",tsumogiri:draw==="9m"})},
    {runtimeAction:{index:12,variant:null},mjaiActionJson:JSON.stringify({type:"dahai",actor:0,pai:"4p",tsumogiri:draw==="4p"})},
    ...(winning?[{runtimeAction:{index:43,variant:null},mjaiActionJson:JSON.stringify({type:"hora",actor:0,target:0,pai:draw})}]:[])];
  const content={protocolVersion:request.protocolVersion,requestId:request.requestId,identity,status:"ok" as const,actions};
  return {...content,resultId:createHash("sha256").update(libriichiRuleCanonicalJson(content)).digest("hex")};
}

it.each(["9m","4p"] as const)("discovers unchosen tsumo from the same controlled rule set, actual discard=%s",async discard=>{
  const queryRules=vi.fn(async(request:LibriichiRuleRequest)=>response(request,true));
  const result=await collectDamaTsumoWindows({stream:fixture(discard),identity,port:{queryRules}});
  expect(queryRules).toHaveBeenCalledTimes(1);
  expect(result.windows).toEqual([{decisionEventRef:"game:fixture/0/2/0",discardedWaitTile34:discard==="9m"?8:12,
    ruleResultId:(await queryRules.mock.results[0]!.value).resultId}]);
  expect(result.classifiedWindows).toBe(1);
  expect(result.engineFailures).toBe(0);
});

it("a complete hand shape alone cannot promote a window absent native tsumo",async()=>{
  const queryRules=vi.fn(async(request:LibriichiRuleRequest)=>response(request,false));
  const result=await collectDamaTsumoWindows({stream:fixture(),identity,port:{queryRules}});
  expect(queryRules).toHaveBeenCalledTimes(1);
  expect(result.windows).toEqual([]);
  expect(result.classifiedWindows).toBe(1);
  expect(result.engineFailures).toBe(0);
});

it.each(["throw","wrong-binding"])("collects %s failure and continues to the later winning window",async mode=>{
  let calls=0;
  const queryRules=vi.fn(async(request:LibriichiRuleRequest)=>{
    if(calls++===0) {
      if(mode==="throw") throw new Error("private runtime prose");
      return {...response(request,true),requestId:"f".repeat(64)};
    }
    return response(request,true);
  });
  const result=await collectDamaTsumoWindows({stream:fixture("9m",true),identity,port:{queryRules}});
  expect(queryRules).toHaveBeenCalledTimes(2);
  expect(result.windows.map(row=>row.decisionEventRef)).toEqual(["game:fixture/0/10/0"]);
  expect(result.classifiedWindows).toBe(2);
  expect(result.engineFailures).toBe(1);
  expect(result.failureCounts).toEqual({[mode==="throw"?"rules_runtime_failed":"rules_action_mapping_invalid"]:1});
  expect(JSON.stringify(result)).not.toContain("private runtime prose");
});

it("incomplete source evidence produces explicit failures without invoking the engine",async()=>{
  const stream=fixture(); stream.completeness.remainingDraws="partial";
  const queryRules=vi.fn(async(request:LibriichiRuleRequest)=>response(request,true));
  const result=await collectDamaTsumoWindows({stream,identity,port:{queryRules}});
  expect(queryRules).not.toHaveBeenCalled();
  expect(result.windows).toEqual([]);
  expect(result.failureCounts).toEqual({rules_input_incomplete:1});
  expect(result.engineFailures).toBe(1);
});

it("queries a non-winning shape instead of filtering it with a second rules implementation",async()=>{
  const stream=fixture();
  const start=stream.events[1]!;
  if(start.type!=="round_started") throw new Error("fixture");
  start.selfHand[9]=canonicalTile("1s");
  const queryRules=vi.fn(async(request:LibriichiRuleRequest)=>response(request,false));
  const result=await collectDamaTsumoWindows({stream,identity,port:{queryRules}});
  expect(queryRules).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({windows:[],classifiedWindows:1,skippedWindows:1,engineFailures:0});
});

it("rejects an actual action missing from the complete result, without backfilling",async()=>{
  const queryRules=vi.fn(async(request:LibriichiRuleRequest)=>{
    const {resultId:_,...content}=response(request,true);
    content.actions=content.actions.filter(row=>row.runtimeAction.index!==8);
    return {...content,resultId:createHash("sha256").update(libriichiRuleCanonicalJson(content)).digest("hex")};
  });
  const result=await collectDamaTsumoWindows({stream:fixture(),identity,port:{queryRules}});
  expect(result.windows).toEqual([]);
  expect(result.failureCounts).toEqual({rules_actual_action_mismatch:1});
});

it("discovers an open-hand tsumo opportunity while querying and excluding the preceding post-call discard",async()=>{
  const hand:TileId[]=["1m","3m","4m","5m","6m","7p","8p","9p","5z","5z","9s","1p","2p"];
  const events=[...canonicalStartEvents(hand.map(id=>canonicalTile(id)))];
  const start=events[1]!; if(start.type!=="round_started") throw new Error("fixture");
  start.dealer=3;
  const add=(event:Record<string,unknown>)=>events.push({...event,eventId:`game:fixture/0/${events.length}/0`,sourceRecordRef:`record:${events.length}`} as CanonicalGameEvent);
  add({type:"tile_drawn",actor:3,tile:{visibility:"hidden"},from:"live_wall"});
  add({type:"tile_discarded",actor:3,tile:canonicalTile("2m"),discardMode:"tedashi",riichiDeclarationEventRef:null});
  add({type:"chi_called",actor:0,targetActor:3,calledTile:canonicalTile("2m"),
    consumedTiles:[canonicalTile("1m"),canonicalTile("3m")],calledDiscardEventRef:"game:fixture/0/3/0"});
  add({type:"tile_discarded",actor:0,tile:canonicalTile("9s"),discardMode:"tedashi",riichiDeclarationEventRef:null});
  for(const actor of [1,2,3]) {
    add({type:"tile_drawn",actor,tile:{visibility:"hidden"},from:"live_wall"});
    add({type:"tile_discarded",actor,tile:canonicalTile("7z"),discardMode:"tsumogiri",riichiDeclarationEventRef:null});
  }
  add({type:"tile_drawn",actor:0,tile:{visibility:"visible",tile:canonicalTile("3p")},from:"live_wall"});
  add({type:"tile_discarded",actor:0,tile:canonicalTile("3p"),discardMode:"tsumogiri",riichiDeclarationEventRef:null});
  const queryRules=vi.fn(async(request:LibriichiRuleRequest)=>{
    const postCall=JSON.parse(request.events.at(-1)!.json).type==="chi";
    const actions=postCall
      ? [{runtimeAction:{index:26,variant:null},mjaiActionJson:JSON.stringify({type:"dahai",actor:0,pai:"9s",tsumogiri:false})}]
      : [{runtimeAction:{index:11,variant:null},mjaiActionJson:JSON.stringify({type:"dahai",actor:0,pai:"3p",tsumogiri:true})},
         {runtimeAction:{index:43,variant:null},mjaiActionJson:JSON.stringify({type:"hora",actor:0,target:0,pai:"3p"})}];
    const content={protocolVersion:request.protocolVersion,requestId:request.requestId,identity,status:"ok" as const,actions};
    return {...content,resultId:createHash("sha256").update(libriichiRuleCanonicalJson(content)).digest("hex")};
  });
  const result=await collectDamaTsumoWindows({stream:canonicalStream(events),identity,port:{queryRules}});
  expect(queryRules).toHaveBeenCalledTimes(2);
  expect(result.windows).toEqual([{decisionEventRef:"game:fixture/0/12/0",discardedWaitTile34:11,
    ruleResultId:(await queryRules.mock.results[1]!.value).resultId}]);
  expect(result).toMatchObject({classifiedWindows:2,skippedWindows:1,engineFailures:0,legalActionRules:identity});
});

it("queries both riichi declaration phases without reporting either as dama tsumo",async()=>{
  const events=fixture().events.slice(0,3);
  events.push({type:"riichi_declared",actor:0,eventId:"game:fixture/0/3/0",sourceRecordRef:"record:3"},
    {type:"tile_discarded",actor:0,tile:canonicalTile("4p"),discardMode:"tsumogiri",
      riichiDeclarationEventRef:"game:fixture/0/3/0",eventId:"game:fixture/0/4/0",sourceRecordRef:"record:4"});
  const queryRules=vi.fn(async(request:LibriichiRuleRequest)=>{
    const declared=request.decision.riichiPhase==="declared";
    const actions=declared
      ? [{runtimeAction:{index:12,variant:null},mjaiActionJson:'{"type":"dahai","actor":0,"pai":"4p","tsumogiri":true}'}]
      : [...response(request,true).actions,{runtimeAction:{index:37,variant:null},mjaiActionJson:'{"type":"reach","actor":0}'}];
    const content={protocolVersion:request.protocolVersion,requestId:request.requestId,identity,status:"ok" as const,actions};
    return {...content,resultId:createHash("sha256").update(libriichiRuleCanonicalJson(content)).digest("hex")};
  });
  const result=await collectDamaTsumoWindows({stream:canonicalStream(events),identity,port:{queryRules}});
  expect(queryRules.mock.calls.map(([request])=>request.decision.riichiPhase)).toEqual(["none","declared"]);
  expect(result).toMatchObject({windows:[],classifiedWindows:2,skippedWindows:2,engineFailures:0});
});

it.each([
  {family:"chiitoitsu",hand:["1m","1m","3m","3m","5m","5m","2p","2p","4p","4p","6s","6s","8s"],draw:"8s",index:25},
  {family:"kokushi",hand:["1m","9m","1p","9p","1s","9s","1z","2z","3z","4z","5z","6z","7z"],draw:"7z",index:33},
])("retains $family discovery through the rule port",async({hand,draw,index})=>{
  const stream=fixture(); const start=stream.events[1]!;
  if(start.type!=="round_started") throw new Error("fixture");
  start.selfHand=hand.map(id=>canonicalTile(id as TileId));
  const drawn=stream.events[2]!,discard=stream.events[3]!;
  if(drawn.type!=="tile_drawn"||discard.type!=="tile_discarded") throw new Error("fixture");
  drawn.tile={visibility:"visible",tile:canonicalTile(draw as TileId)};
  discard.tile=canonicalTile(draw as TileId); discard.discardMode="tsumogiri";
  const queryRules=vi.fn(async(request:LibriichiRuleRequest)=>{
    const actions=[{runtimeAction:{index,variant:null},mjaiActionJson:JSON.stringify({type:"dahai",actor:0,pai:draw,tsumogiri:true})},
      {runtimeAction:{index:43,variant:null},mjaiActionJson:JSON.stringify({type:"hora",actor:0,target:0,pai:draw})}];
    const content={protocolVersion:request.protocolVersion,requestId:request.requestId,identity,status:"ok" as const,actions};
    return {...content,resultId:createHash("sha256").update(libriichiRuleCanonicalJson(content)).digest("hex")};
  });
  const result=await collectDamaTsumoWindows({stream,identity,port:{queryRules}});
  expect(queryRules).toHaveBeenCalledTimes(1);
  expect(result.windows).toEqual([{decisionEventRef:"game:fixture/0/2/0",discardedWaitTile34:index,
    ruleResultId:(await queryRules.mock.results[0]!.value).resultId}]);
  expect(result.engineFailures).toBe(0);
});
