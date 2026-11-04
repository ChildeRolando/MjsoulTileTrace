import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { ARENA_RAW_BASELINE } from "@riichi-coach/contracts";
import { ArenaProviderRequestSchema } from "../src/blind-discard-arena-provider.js";
import { assembleArenaExperiment } from "../src/blind-discard-arena-experiment.js";
import { runBlindCoachCase } from "../src/blind-discard-arena-runner.js";
import { assembleWholeUnitSelector,createWholeUnitFacts,createWholeUnitLibrary,parseWholeUnitSelection,runWholeUnitSelector,type WholeUnitLibrary } from "../src/blind-discard-arena-textbook-unit.js";
import { makeArenaMcpCase } from "./fixtures/arena-mcp-case.js";
let library:WholeUnitLibrary,indexBytes:Buffer;
beforeAll(async()=>{indexBytes=await readFile("E:/AgentData/Coach/scene-pattern-ceiling-restart2-20261028/textbook/index.json");library=createWholeUnitLibrary(indexBytes);});
const setup=()=>{const fixture=makeArenaMcpCase({includeRawVisibleHistory:true}),basic={version:"arena-basic-calculations/v1",caseRef:fixture.observation.caseRef,semantics:"Unseen copies include tiles in unknown locations; they are not live-wall counts or win probabilities. Null means unavailable, not zero.",producer:null,candidates:fixture.observation.candidates.map(c=>({actionRef:c.actionRef,status:"unavailable"}))};return {...fixture,basic};};
const descriptor=()=>({providerId:"synthetic",model:"local",protocolVersion:"arena-function-call/v1" as const});
describe("whole textbook unit Arena",()=>{
 it("pins all content and binds selected/none/failure without truncation",()=>{
  expect(library.catalog).toHaveLength(240);expect(library.catalog.filter(x=>x.role==="instruction")).toHaveLength(237);
  const {observation,basic}=setup(),id=library.catalog.find(x=>x.role==="instruction")!.unitId,nav=library.catalog.find(x=>x.role==="navigation")!.unitId;
  const packet=createWholeUnitFacts({library,caseRef:observation.caseRef,selection:{status:"selected",unitId:id}}),cfg={...ARENA_RAW_BASELINE,legalCandidates:true,basicCalculations:true,textbookInputBudget:true,wholeUnitFacts:true};
  const base=assembleArenaExperiment({observation,config:{...cfg,wholeUnitFacts:false},basicCalculations:basic}),a=assembleArenaExperiment({observation,config:cfg,basicCalculations:basic,wholeUnitFacts:packet,textbookLibrary:library});
  expect(a.modules.raw).toEqual(base.modules.raw);expect(a.modules.basicCalculations).toEqual(base.modules.basicCalculations);expect(a.messages[0]).toEqual(base.messages[0]);expect(a.outputSchema).toEqual(base.outputSchema);expect(a.tools).toEqual([]);
  expect(packet.status).toBe("selected");if(packet.status!=="selected")throw Error("selected");const original=JSON.parse(indexBytes.toString()).passages.find((x:{id:string})=>x.id===id);expect(packet.unit.content).toBe(original.content);expect(packet.unit.contentDigest).toBe(original.contentDigest);
  expect(()=>createWholeUnitFacts({library,caseRef:observation.caseRef,selection:{status:"selected",unitId:nav}})).toThrow();
  expect(()=>assembleArenaExperiment({observation,config:cfg,basicCalculations:basic,wholeUnitFacts:{...packet,unit:{...packet.unit,content:packet.unit.content.slice(0,-1)}},textbookLibrary:library})).toThrow();
  expect(()=>assembleArenaExperiment({observation,config:cfg,basicCalculations:basic,wholeUnitFacts:{...packet,caseRef:"arena-case:v1:00000000-0000-4000-8000-000000000999"},textbookLibrary:library})).toThrow();
  expect(()=>assembleArenaExperiment({observation,config:cfg,basicCalculations:basic,wholeUnitFacts:packet,textbookLibrary:{...library}})).toThrow();
  for(const selection of [{status:"none" as const},{status:"unavailable" as const,reason:"provider_failure" as const}]){const facts=createWholeUnitFacts({library,caseRef:observation.caseRef,selection});expect(assembleArenaExperiment({observation,config:cfg,basicCalculations:basic,wholeUnitFacts:facts,textbookLibrary:library}).modules.wholeUnitFacts?.status).toBe(selection.status);}
  expect(()=>createWholeUnitLibrary(Buffer.from(indexBytes.toString().replace('instruction','navigation')))).toThrow();
 });
 it("sends only raw/basic/catalog to one selector turn and preserves failure/null",async()=>{
  const {observation,basic}=setup(),id=library.catalog.find(x=>x.role==="instruction")!.unitId,nav=library.catalog.find(x=>x.role==="navigation")!.unitId,request=assembleWholeUnitSelector({observation,basicCalculations:basic,library});
  expect(request.maxInputBytes).toBe(131072);expect(request.tools).toEqual([]);const userMessage=request.messages[1]!; if(userMessage.role!=="user")throw Error("user_message"); const payload=JSON.parse(userMessage.content);expect(payload.textbookCatalog).toHaveLength(240);expect(payload.textbookCatalog.every((x:Record<string,unknown>)=>!('content' in x))).toBe(true);
  expect(parseWholeUnitSelection({unitId:null},library)).toEqual({status:"none"});expect(()=>parseWholeUnitSelection({unitId:id,answer:"1m"},library)).toThrow();expect(()=>parseWholeUnitSelection({unitId:nav},library)).toThrow();
  let n=0;for(const [body,expected] of [[JSON.stringify({unitId:id}),"selected"],[JSON.stringify({unitId:null}),"none"],[JSON.stringify({unitId:id,advice:"1m"}),"unavailable"]] as const){const result=await runWholeUnitSelector({observation,basicCalculations:basic,library,signal:new AbortController().signal,provider:{descriptor,request:async()=>{n++;return {status:"final",content:body,outputBytes:Buffer.byteLength(body)};}}});expect(result.selection.status).toBe(expected);}expect(n).toBe(3);
  const failed=await runWholeUnitSelector({observation,basicCalculations:basic,library,signal:new AbortController().signal,provider:{descriptor,request:async()=>({status:"timeout"})}});expect(failed.selection).toEqual({status:"unavailable",reason:"provider_failure"});expect(failed.usage.status).toBe("unknown");
  const excessive=await runWholeUnitSelector({observation,basicCalculations:basic,library,signal:new AbortController().signal,provider:{descriptor,request:async()=>({status:"final",content:'{"unitId":null}',outputBytes:15,usage:{outputTokens:32769}})}});expect(excessive.selection).toEqual({status:"unavailable",reason:"provider_failure"});expect(excessive.providerStatus).toBe("output_token_limit");expect(excessive.usage.status).toBe("reported");
 });
 it("keeps old 64 KiB boundary and passes only explicit 256 KiB to runner",async()=>{
  const {observation,basic,authorizedCase}=setup(),messages=[{role:"system",content:"x"},{role:"user",content:"a".repeat(65537)}],request={messages,tools:[],outputSchema:{type:"object"},requireIsolatedContext:true,maxOutputTokens:100,maxOutputBytes:16384,maxInputBytes:262144};
  expect(ArenaProviderRequestSchema.safeParse(request).success).toBe(false);expect(ArenaProviderRequestSchema.safeParse({...request,maxInputBytes:65536}).success).toBe(false);expect(ArenaProviderRequestSchema.safeParse({...request,inputProfile:"textbook-decision-v1"}).success).toBe(true);expect(ArenaProviderRequestSchema.safeParse({...request,maxInputBytes:131073,inputProfile:"textbook-selector-v1"}).success).toBe(false);
  const cfg={...ARENA_RAW_BASELINE,legalCandidates:true,basicCalculations:true,textbookInputBudget:true,wholeUnitFacts:true},id=library.catalog.filter(x=>x.role==="instruction").sort((a,b)=>b.characters-a.characters)[0]!.unitId,facts=createWholeUnitFacts({library,caseRef:observation.caseRef,selection:{status:"selected",unitId:id}});let sent:unknown;
  const run=await runBlindCoachCase({observation,grading:{binding:authorizedCase.binding,reference:{status:"unavailable",reason:"mortal_unavailable"}},tools:[],experiment:cfg,limits:{maxContextInputBytes:262144,maxProviderTurns:1,maxProviderOutputTokens:32768},prepareModules:async()=>({basicCalculations:basic,wholeUnitFacts:facts,textbookLibrary:library}),provider:{descriptor,request:async r=>{sent=r;return {status:"final",content:'{"tile":"1m","red":false}',outputBytes:25};}}});
  expect(run.status).toBe("completed");expect((sent as {maxInputBytes:number}).maxInputBytes).toBe(262144);expect((sent as {inputProfile:string}).inputProfile).toBe("textbook-decision-v1");
  await expect(runBlindCoachCase({observation,grading:{binding:authorizedCase.binding,reference:{status:"unavailable",reason:"mortal_unavailable"}},tools:[],experiment:{...cfg,textbookInputBudget:false,wholeUnitFacts:false},limits:{maxContextInputBytes:262144},provider:{descriptor,request:async()=>({status:"timeout"})}})).rejects.toThrow("arena_run_limit_exceeds_v1_maximum");
 });
});
