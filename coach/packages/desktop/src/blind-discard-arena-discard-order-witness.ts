import { createHash } from "node:crypto";
import { z } from "zod";
import { TileIdSchema, type ArenaBlindObservation } from "@riichi-coach/contracts";
import { ArenaBasicCalculationsSchema } from "./blind-discard-arena-basic-calculations.js";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const semantics = "所列为移去指定两张牌后一种不重叠的可行结构，并非判断必须拆这两张或建议先打哪张。分组按牌种，不分配赤五实体；原始牌和基础事实仍保留赤五。";
const group = z.array(TileIdSchema).min(2).max(3);
export const DiscardOrderWitnessSchema = z.object({
  version: z.literal("discard-order-witness/v1"), caseRef: z.string(), candidateRefs: z.array(z.string()).min(1),
  handDigest: z.string().regex(/^[a-f0-9]{64}$/), basicDigest: z.string().regex(/^[a-f0-9]{64}$/),
  edge: z.tuple([TileIdSchema, TileIdSchema]), canonical: z.tuple([group,group,group,group,group]), decompositionCount: z.number().int().min(1),
  shantenEqual: z.boolean(), unseenTotalEqual: z.boolean(), effectiveTilesEqual: z.boolean(),
}).strict();
export function validateDiscardOrderWitness(value: unknown, observation: ArenaBlindObservation, basic: z.infer<typeof ArenaBasicCalculationsSchema>) {
  const x=DiscardOrderWitnessSchema.parse(value), self=observation.visibleState.self;
  if (x.caseRef!==observation.caseRef || JSON.stringify(x.candidateRefs)!==JSON.stringify(observation.candidates.map(c=>c.actionRef)) || x.handDigest!==digest({concealedTiles:self.concealedTiles,currentDraw:self.currentDraw}) || x.basicDigest!==digest(basic) || !self.currentDraw) throw Error("arena_witness_binding_mismatch");
  if (x.edge[0][1]!==x.edge[1][1] || !["12","89"].includes(x.edge[0].charAt(0)+x.edge[1].charAt(0)) || x.edge[0][1]==="z") throw Error("arena_witness_edge_invalid");
  const ranks=(g: string[])=>g.map(t=>Number(t[0])), sameSuit=(g:string[])=>g.every(t=>t[1]===g[0]![1]);
  const meld=(g:string[])=>g.length===3 && (g.every(t=>t===g[0]) || (g[0]![1]!=="z" && sameSuit(g) && ranks(g)[1]! ===ranks(g)[0]! + 1 && ranks(g)[2]! ===ranks(g)[0]! + 2));
  const ryanmen=(g:string[])=>g.length===2 && g[0]![1]!=="z" && sameSuit(g) && ranks(g)[0]!>=2 && ranks(g)[0]!<=7 && ranks(g)[1]! ===ranks(g)[0]! + 1;
  if (!meld(x.canonical[0]) || !meld(x.canonical[1]) || !ryanmen(x.canonical[2]) || !ryanmen(x.canonical[3]) || x.canonical[4].length!==2 || x.canonical[4][0]!==x.canonical[4][1]) throw Error("arena_witness_groups_invalid");
  const hand=[...self.concealedTiles.map(t=>t.id),self.currentDraw.tile.id];
  for (const t of x.edge) { const index=hand.indexOf(t); if(index<0) throw Error("arena_witness_missing_edge");hand.splice(index,1) }
  if(JSON.stringify(hand.sort())!==JSON.stringify(x.canonical.flat().sort())) throw Error("arena_witness_multiset_invalid");
  const edgeRows=x.edge.map(t=>{const cs=observation.candidates.filter(c=>c.tile.id===t && !c.tile.red);if(cs.length!==1)throw Error("arena_witness_edge_candidate_invalid");const row=basic.candidates.find(c=>c.actionRef===cs[0]!.actionRef);if(!row || row.status!=="available")throw Error("arena_witness_basic_unavailable");return row});
  const [a,b]=edgeRows; if (!a || !b || a.status!=="available" || b.status!=="available") throw Error("arena_witness_basic_unavailable");
  const same=(l:unknown,r:unknown)=>JSON.stringify(l)===JSON.stringify(r);
  if(x.shantenEqual!==(a.shanten===b.shanten) || x.unseenTotalEqual!==(a.unseenTotal===b.unseenTotal) || x.effectiveTilesEqual!==same(a.effectiveTiles,b.effectiveTiles)) throw Error("arena_witness_equality_invalid");
  return { version:x.version, semantics, edge:x.edge, canonical:x.canonical, decompositionCount:x.decompositionCount, shantenEqual:x.shantenEqual, unseenTotalEqual:x.unseenTotalEqual, effectiveTilesEqual:x.effectiveTilesEqual };
}
