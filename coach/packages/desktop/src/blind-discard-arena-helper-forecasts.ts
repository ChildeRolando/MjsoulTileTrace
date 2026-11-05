import { z } from "zod";
import { ArenaBasicCalculationsSchema } from "./blind-discard-arena-basic-calculations.js";

export const FORECAST_METHOD_NOTE = "这些数值来自固定版本 helper 的启发式前瞻，与当前局面事实分开使用。速度分用当前和前进一步的未见进张比例作固定10巡近似，再乘100；二向听另除4，因此分数不是当前局面的实际和牌概率。路径分在听牌时使用（经验和率/100）×（估计打点+1500）−1500，非听牌时按向听前进摸牌的未见数加权，并采用内部排序选出的后续路径；它没有纳入实际对手放铳损失与顺位价值，也不是净收益EV。两项均保留该helper的固定经验表和路径选择假设，未见牌并不全在牌山。unavailable表示本次没有可解释值，不按0解释。数值供比较；最终弃牌仍由你结合完整公开局面判断。\r\n";
const field = z.discriminatedUnion("status", [
  z.object({ status: z.literal("available"), value: z.number().finite() }).strict(),
  z.object({ status: z.literal("unavailable"), reason: z.enum(["source_unavailable", "incomplete_facts", "outside_scope_or_zero"]) }).strict(),
]);
export const ArenaHelperForecastSchema = z.object({
  version: z.literal("arena-helper-forecasts/v1"), caseRef: z.string(),
  method: z.literal(FORECAST_METHOD_NOTE),
  source: z.object({ upstreamCommit: z.literal("514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0"), adapterVersion: z.literal("0.2.0"), executableSha256: z.literal("825a9e1b7fd3321e1e21d460115fb117ed29c9f7da3b99669813232d4c489f51") }).strict(),
  rows: z.array(z.object({ actionRef: z.string(), speedScore: field, pathPointScore: field }).strict()),
}).strict();
const capturedField = z.discriminatedUnion("status", [
  z.object({status:z.literal("returned"),value:z.number().finite(),limitations:z.array(z.string())}).strict(),
  z.object({status:z.literal("unavailable"),diagnostics:z.array(z.string())}).strict(),
]);
const captured = z.object({version:z.literal("forecast-source-audit/v1"),caseRef:z.string(),rows:z.array(z.object({
  actionRef:z.string(),requestSha256:z.string().regex(/^[a-f0-9]{64}$/),resultSha256:z.string().regex(/^[a-f0-9]{64}$/),remainingDraws:z.number().nullable(),status:z.literal("available"),shanten:z.number().int(),
  visibleCountsComplete:z.boolean(),doraTilesComplete:z.boolean(),selfDiscardsComplete:z.boolean(),riichi:z.boolean(),hasOpenMeld:z.boolean(),meldCount:z.number().int(),
  values:z.object({mixed_waits_score:capturedField,avg_agari_rate:capturedField,furiten_rate:capturedField,mixed_round_point:capturedField}).strict(),
}).strict())}).strict();
/** Consume a hash-verified, frozen public helper capture; never read labels or order candidates. */
export function buildArenaHelperForecast(input: { basicCalculations:unknown; capture:unknown }) {
  const basic=ArenaBasicCalculationsSchema.parse(input.basicCalculations), data=captured.parse(input.capture);
  if(data.caseRef!==basic.caseRef || JSON.stringify(data.rows.map(r=>r.actionRef))!==JSON.stringify(basic.candidates.map(r=>r.actionRef))) throw new Error("arena_forecast_capture_binding");
  const rows=data.rows.map((r,i)=>{
    const candidate=basic.candidates[i]!;
    if(candidate.status!=="available" || candidate.shanten!==r.shanten) throw new Error("arena_forecast_shanten_binding");
    const complete=r.visibleCountsComplete&&r.doraTilesComplete&&r.selfDiscardsComplete&&r.remainingDraws!==null;
    const convert=(v:z.infer<typeof capturedField>, eligible:boolean):z.infer<typeof field> => {
      if(v.status!=="returned") return {status:"unavailable",reason:"source_unavailable"};
      if(!complete) return {status:"unavailable",reason:"incomplete_facts"};
      if(!eligible || v.value===0) return {status:"unavailable",reason:"outside_scope_or_zero"};
      return {status:"available",value:v.value};
    };
    return {actionRef:r.actionRef,speedScore:convert(r.values.mixed_waits_score,r.shanten>=1),pathPointScore:convert(r.values.mixed_round_point,r.shanten>=0&&r.shanten<=2)};
  });
  const informative=(["speedScore","pathPointScore"] as const).some(key=>new Set(rows.flatMap(r=>r[key].status==="available"?[r[key].value]:[])).size>=2);
  if(!informative) return undefined;
  return ArenaHelperForecastSchema.parse({version:"arena-helper-forecasts/v1",caseRef:basic.caseRef,method:FORECAST_METHOD_NOTE,
    source:{upstreamCommit:"514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",adapterVersion:"0.2.0",executableSha256:"825a9e1b7fd3321e1e21d460115fb117ed29c9f7da3b99669813232d4c489f51"},rows});
}
