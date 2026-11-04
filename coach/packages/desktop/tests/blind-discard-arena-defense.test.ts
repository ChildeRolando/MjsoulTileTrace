import { describe, expect, it } from "vitest";
import { ARENA_RAW_BASELINE, ArenaExperimentConfigSchema, ArenaBlindObservationSchema, canonicalActionRef } from "@riichi-coach/contracts";
import { ArenaDefenseFactsSchema, calculateArenaDefenseFacts } from "../src/blind-discard-arena-defense.js";
import { assembleArenaExperiment } from "../src/blind-discard-arena-experiment.js";
import { makeArenaMcpCase } from "./fixtures/arena-mcp-case.js";
import type { MahjongFactEnginePort } from "@riichi-coach/reasoning";
const engine = { identity: async () => { throw Error("unavailable"); } } as unknown as MahjongFactEnginePort;
describe("Arena defense facts",()=>{
 it("binds the complete legal set and excludes unoffered modules",async()=>{
  const {observation,authorizedCase}=makeArenaMcpCase({includeRawVisibleHistory:true}), refs=observation.candidates.map(c=>c.actionRef);
  const packet=await calculateArenaDefenseFacts({...authorizedCase,actionRefs:refs,engine});
  expect(packet.threats).toEqual([]); expect(packet.rows.every(r=>r.status==="available"&&r.opponents.length===0)).toBe(true);
  const config={...ARENA_RAW_BASELINE,legalCandidates:true,defenseFacts:true};
  const result=assembleArenaExperiment({observation,config,defenseFacts:packet});
  expect(result.tools).toEqual([]);expect(JSON.stringify(result.modules)).not.toMatch(/riskScale|early_outside|CANARY|recommendationScore/);
  for(const bad of [{...packet,rows:[...packet.rows].reverse()},{...packet,rows:packet.rows.slice(1)},{...packet,rows:[...packet.rows,packet.rows[0]]},{...packet,caseRef:"arena-case:v1:00000000-0000-4000-8000-000000000999"}]) expect(()=>assembleArenaExperiment({observation,config,defenseFacts:bad})).toThrow();
  for(const bad of [{helperFacts:true},{handStructureFacts:true},{improvementFacts:true},{comparison:true},{explanation:true},{scenarioHint:true},{teaching:"on"},{callableTools:["analyze_candidates"]}]) expect(ArenaExperimentConfigSchema.safeParse({...config,...bad}).success).toBe(false);
  const red=[false,true].map(red=>{const action={kind:"discard" as const,tile:{id:"5p" as const,red},discardMode:"tedashi" as const};return {actionRef:canonicalActionRef(action),tile:action.tile,discardMode:action.discardMode};});
  const redObs=ArenaBlindObservationSchema.parse({...observation,candidates:red}); const redPacket={...packet,rows:packet.rows.map((r,i)=>({...r,actionRef:red[i]!.actionRef}))};
  expect(()=>assembleArenaExperiment({observation:redObs,config,defenseFacts:redPacket})).not.toThrow();expect(()=>assembleArenaExperiment({observation:redObs,config,defenseFacts:{...redPacket,rows:[...redPacket.rows].reverse()}})).toThrow();
  await expect(calculateArenaDefenseFacts({...authorizedCase,actionRefs:refs.slice(1),engine})).rejects.toThrow();
  await expect(calculateArenaDefenseFacts({...authorizedCase,facts:{...authorizedCase.facts,hidden:"CANARY"} as typeof authorizedCase.facts,actionRefs:refs,engine})).rejects.toThrow();
  const future=makeArenaMcpCase({includeRawVisibleHistory:true,changeFuture:true}); const same=await calculateArenaDefenseFacts({...future.authorizedCase,actionRefs:future.observation.candidates.map(c=>c.actionRef),engine}); expect(same.rows).toEqual(packet.rows);
 });
 it("rejects altered opponent assignments and forbidden fields",async()=>{
  const {observation,authorizedCase}=makeArenaMcpCase(),refs=observation.candidates.map(c=>c.actionRef); const p=await calculateArenaDefenseFacts({...authorizedCase,actionRefs:refs,engine});
  const cell={actor:1,safety:{status:"proven",evidence:["threat_own_discard"]},structure:{status:"unavailable",reason:"incomplete_response"}};
  const two={...p,threats:[{actor:1,kind:"riichi_accepted"},{actor:2,kind:"riichi_declared"}],rows:p.rows.map(r=>({actionRef:r.actionRef,status:"available",opponents:[cell,{...cell,actor:2}]}))};
  expect(ArenaDefenseFactsSchema.safeParse(two).success).toBe(true);
  const open={...p,threats:[{actor:1,kind:"user_marked_open"}],rows:p.rows.map(r=>({actionRef:r.actionRef,status:"available",opponents:[{actor:1,safety:{status:"unavailable",reason:"unsupported"},structure:{status:"unavailable",reason:"unsupported"}}]}))};
  expect(ArenaDefenseFactsSchema.safeParse(open).success).toBe(true);
  expect(ArenaDefenseFactsSchema.safeParse({...open,rows:open.rows.map(r=>({...r,opponents:[{...r.opponents[0],safety:{status:"no_proof"}}]}))}).success).toBe(false);

  const wrong=structuredClone(two);wrong.rows[0]!.opponents.reverse();expect(ArenaDefenseFactsSchema.safeParse(wrong).success).toBe(false);
  expect(ArenaDefenseFactsSchema.safeParse({...two,rows:two.rows.map(r=>({...r,opponents:r.opponents.map(c=>({...c,riskScale:0}))}))}).success).toBe(false);
  expect(()=>assembleArenaExperiment({observation,config:{...ARENA_RAW_BASELINE,legalCandidates:true,defenseFacts:true},defenseFacts:two})).toThrow("arena_defense_threat_binding_mismatch");
 });
});
