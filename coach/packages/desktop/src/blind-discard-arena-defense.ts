import { ActionRefSchema, ArenaCaseRefSchema, ArenaToolBindingSchema, EngineIdentitySchema, type ArenaToolBinding, type KnownGameFacts } from "@riichi-coach/contracts";
import { buildDeterministicDefenseMatrix, projectCandidate, validateThreatRiskResult, type MahjongFactEnginePort } from "@riichi-coach/reasoning";
import { z } from "zod";
import { prepareArenaMcpHand13Request } from "./blind-discard-arena-mcp.js";
const Actor = z.number().int().min(0).max(3);
const Safety = z.discriminatedUnion("status", [z.object({ status:z.literal("proven"), evidence:z.array(z.enum(["threat_own_discard","post_riichi_pass"])).min(1).max(2) }).strict(), z.object({status:z.literal("no_proof")}).strict(), z.object({status:z.literal("unavailable"),reason:z.enum(["missing_facts","incomplete_response","unsupported"])}).strict()]);
const Classification = z.enum(["suji","half_suji","double_suji","no_suji","wall","no_chance","double_no_chance","one_chance","double_one_chance","mixed_one_chance"]);
const Structure = z.discriminatedUnion("status", [z.object({status:z.literal("available"),classifications:z.array(Classification),honor:z.object({remainingCount:z.number().int().min(0).max(4),category:z.enum(["yakuhai","guest_wind"])}).strict().nullable()}).strict(),z.object({status:z.literal("unavailable"),reason:z.enum(["incomplete_response","missing_facts","unsupported","projection"])}).strict(),z.object({status:z.literal("error")}).strict()]);
const Cell = z.object({actor:Actor,safety:Safety,structure:Structure}).strict();
const Row = z.discriminatedUnion("status",[z.object({actionRef:ActionRefSchema,status:z.literal("available"),opponents:z.array(Cell).max(3)}).strict(),z.object({actionRef:ActionRefSchema,status:z.literal("error")}).strict()]);
export const ARENA_DEFENSE_SEMANTICS = "Rows bind legal actionRefs; opponents are independent absolute actors and only listed threats are covered. No threats does not mean all safe. Proven genbutsu identifies own-discard and/or confirmed post-riichi-pass evidence; no_proof means no such proof, not danger. Incomplete response timing prevents negative proof and structural classifications. Suji and wall labels are mechanical classifications, not safety guarantees or probabilities. Honor remainingCount means unseen copies in unknown locations, not live-wall count; category uses this opponent's wind and round wind. Red fives share tile type. Unsupported and unavailable/error states are not zero. The existing threat-risk engine internally co-computes a heuristic scale; that scale and early-outside labels are excluded.";
export const ArenaDefenseFactsSchema = z.object({version:z.literal("arena-defense-facts/v1"),caseRef:ArenaCaseRefSchema,semantics:z.literal(ARENA_DEFENSE_SEMANTICS),producer:EngineIdentitySchema.nullable(),threats:z.array(z.object({actor:Actor,kind:z.enum(["riichi_declared","riichi_accepted","user_marked_open"])}).strict()).max(3),rows:z.array(Row).min(2).max(14)}).strict().superRefine((p,ctx)=>{
 const fail=()=>ctx.addIssue({code:z.ZodIssueCode.custom,message:"arena_defense_binding_invalid"});
 if(new Set(p.rows.map(r=>r.actionRef)).size!==p.rows.length||p.threats.some((t,i)=>i>0&&t.actor<=p.threats[i-1]!.actor)) fail();
 for(const r of p.rows) if(r.status==="available") { if(JSON.stringify(r.opponents.map(c=>c.actor))!==JSON.stringify(p.threats.map(t=>t.actor))) fail(); if(r.opponents.some(c=>c.structure.status==="available")&&!p.producer) fail(); for(const [i,c] of r.opponents.entries()){if(p.threats[i]!.kind==="user_marked_open"&&(c.safety.status!=="unavailable"||c.safety.reason!=="unsupported"||c.structure.status!=="unavailable"||c.structure.reason!=="unsupported")) fail();if(c.safety.status==="proven"&&new Set(c.safety.evidence).size!==c.safety.evidence.length) fail();if(c.structure.status==="available"&&new Set(c.structure.classifications).size!==c.structure.classifications.length) fail();} }
});
export async function calculateArenaDefenseFacts(input:{binding:ArenaToolBinding;facts:KnownGameFacts;actionRefs:readonly string[];engine:MahjongFactEnginePort;signal?:AbortSignal}){
 const binding=ArenaToolBindingSchema.parse(input.binding),refs=input.actionRefs.map(ref=>ActionRefSchema.parse(ref));
 if(JSON.stringify(refs)!==JSON.stringify(binding.candidates.map(c=>c.actionRef))) throw new Error("arena_defense_candidate_binding_mismatch");
 prepareArenaMcpHand13Request({authorizedCase:{binding,facts:input.facts},actionRef:refs[0]!});
 const threats=input.facts.defenseThreats.map(t=>({actor:t.actor,kind:t.kind})).sort((a,b)=>a.actor-b.actor);
 let identity:z.infer<typeof EngineIdentitySchema>|null=null;
 if(threats.some(t=>t.kind!=="user_marked_open")&&input.facts.completeness.responseOpportunities) try{identity=EngineIdentitySchema.parse(await input.engine.identity());}catch{}
 const rows:z.infer<typeof Row>[]=[];
 for(const candidate of binding.candidates){
  if(input.signal?.aborted) throw new Error("arena_defense_cancelled"); const actionRef=candidate.actionRef;
  try{
   const item={actionRef,action:candidate.action,origins:["model" as const]},matrix=buildDeterministicDefenseMatrix({candidate:item,facts:input.facts}),projection=projectCandidate(item,input.facts),opponents:z.infer<typeof Cell>[]=[];
   for(const cell of matrix.cells){
    const d=cell.deterministicSafety;
    const safety:z.infer<typeof Safety>=d.status==="not_applicable"?{status:"unavailable",reason:"unsupported"}:d.status==="blocked_missing_facts"?{status:"unavailable",reason:"missing_facts"}:d.genbutsu?{status:"proven",evidence:[...new Set(d.evidenceRefs.map(e=>e.role))]}:!input.facts.completeness.responseOpportunities?{status:"unavailable",reason:"incomplete_response"}:{status:"no_proof"};
    let structure:z.infer<typeof Structure>;
    if(cell.threat.kind==="user_marked_open") structure={status:"unavailable",reason:"unsupported"};
    else if(!input.facts.completeness.responseOpportunities) structure={status:"unavailable",reason:"incomplete_response"};
    else if(projection.status!=="ready") structure={status:"unavailable",reason:"projection"};
    else {const p=projection.threatRiskProjections.find(x=>x.threatActor===cell.threat.actor);if(!p||p.status!=="ready") structure={status:"unavailable",reason:p?.status==="unsupported_threat_kind"?"unsupported":"missing_facts"};else if(!identity) structure={status:"error"};else try{
      const result=validateThreatRiskResult(p.request,await input.engine.analyzeThreatRisk(p.request));if(JSON.stringify(result.identity)!==JSON.stringify(identity)) throw Error("identity_mismatch");
      const classifications=result.classifications.filter(x=>x.tile34===matrix.candidateTile34&&x.kind!=="genbutsu"&&x.kind!=="early_outside"&&x.kind!=="honor_count").map(x=>x.kind),honor=result.honorClassifications.find(x=>x.tile34===matrix.candidateTile34);
      structure=Structure.parse({status:"available",classifications,honor:honor?{remainingCount:honor.remainingCount,category:honor.category}:null});
    }catch{structure={status:"error"};}}
    opponents.push({actor:cell.threat.actor,safety,structure});
   }
   rows.push(Row.parse({actionRef,status:"available",opponents}));
  }catch{rows.push({actionRef,status:"error"});}
 }
 return ArenaDefenseFactsSchema.parse({version:"arena-defense-facts/v1",caseRef:binding.caseRef,semantics:ARENA_DEFENSE_SEMANTICS,producer:identity,threats,rows});
}
