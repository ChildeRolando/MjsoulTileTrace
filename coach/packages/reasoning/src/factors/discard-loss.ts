import { DiscardLossSchema, type DiscardLossDto, type StructuredAnalysisPackage, type Tile } from "@riichi-coach/contracts";
import type { MahjongFactEnginePort } from "../fact-engine/port.js";
import { normalizeLibriichiRuleActions } from "../analysis/libriichi-rule-projection.js";
import { projectCandidate } from "./candidate-projector.js";
import { stableProjectedStateHash } from "./tile34.js";

const tile = (n: number): Tile => ({id: `${n < 27 ? n % 9 + 1 : n - 26}${n < 9 ? "m" : n < 18 ? "p" : n < 27 ? "s" : "z"}` as Tile["id"], red:false});

/** Teaching consequences only. The caller supplies an already validated package;
 * current legal actions come exclusively from its recorded native rules result. */
export async function calculateDiscardLoss(pkg: StructuredAnalysisPackage, decisionId: string, engine: MahjongFactEnginePort): Promise<DiscardLossDto> {
  const decision = pkg.decisions.find(d => d.decisionId === decisionId);
  if (decision?.outcome !== "analysis_ready") return {status:"unavailable",reason:"not_discard_window"};
  const evidence = pkg.legalActionEvidence?.results.find(r => r.decisionId === decisionId);
  if (!evidence?.request || evidence.response.status !== "ok") return {status:"unavailable",reason:"legal_actions_missing"};
  const facts = decision.knownGameFacts;
  if (!facts.completeness.concealedTiles || !facts.completeness.rivers || !facts.completeness.melds || !facts.completeness.doraIndicators || !facts.completeness.calledDiscardMarkers) return {status:"unavailable",reason:"facts_missing"};
  try {
    const actions = normalizeLibriichiRuleActions(evidence.request,evidence.response,{
      decisionWindow:facts.decisionWindow,concealedTiles:facts.concealedTiles,currentDraw:facts.currentDraw,melds:facts.melds,
    }).filter(row => row.action.kind === "discard" || row.action.kind === "riichi_discard");
    if (!actions.length) return {status:"unavailable",reason:"not_discard_window"};
    const rows: Array<{row:typeof actions[number];shanten:number;direct:Set<number>;improves:Set<number>;left:number[]}> = [];
    for (const row of actions) {
      const candidate = decision.comparisonSet.candidates.find(c => c.actionRef === row.actionRef);
      if (!candidate) return {status:"unavailable",reason:"legal_actions_missing"};
      const projected = projectCandidate(candidate,facts);
      if (projected.status !== "ready" || !projected.hand13Request?.visibleCountsComplete || !projected.hand13Request.leftTiles34) return {status:"unavailable",reason:"facts_missing"};
      const base = projected.hand13Request;
      const stateHash = stableProjectedStateHash({baseStateHash:base.stateHash,calculationMode:"efficiency-v1"});
      const result = await engine.analyzeHand13({...base,calculationMode:"efficiency-v1",stateHash,requestId:`loss:${stateHash}`});
      if (result.calculationMode !== "efficiency-v1" || result.waitsRemainingStatus !== "calculated") throw new Error("efficiency_unavailable");
      const direct = new Set(result.waitsRemaining.filter(t => t.count > 0).map(t => t.tile34));
      const improves = new Set(result.improves.filter(t => base.leftTiles34![t.drawTile34]! > 0).map(t => t.drawTile34));
      rows.push({row,shanten:result.shanten,direct,improves,left:base.leftTiles34!});
    }
    // A discard transfers a known tile from hand to river: it cannot change
    // the perspective's unseen counts. Reject partial/inconsistent projections.
    if (rows.some(r => r.left.some((n,i) => n !== rows[0]!.left[i]))) return {status:"unavailable",reason:"facts_missing"};
    const baselineShanten = Math.min(...rows.map(r => r.shanten));
    const best = rows.filter(r => r.shanten === baselineShanten);
    const direct = new Set(best.flatMap(r => [...r.direct]));
    const improves = new Set(best.flatMap(r => [...r.improves]).filter(t => !direct.has(t)));
    return DiscardLossSchema.parse({status:"ready",baselineShanten,candidates:rows.flatMap(r => r.row.physicalRealizations.flatMap(({action}) => {
      if (action.kind !== "discard" && action.kind !== "riichi_discard") return [];
      return [{tile:action.tile,discardMode:action.discardMode,shanten:r.shanten,
        directLost:[...direct].filter(t => !r.direct.has(t)).sort((a,b)=>a-b).map(t => ({tile:tile(t),count:r.left[t]!,degradedToImprovement:r.improves.has(t)})),
        improvementLost:[...improves].filter(t => !r.improves.has(t) && !r.direct.has(t)).sort((a,b)=>a-b).map(t => ({tile:tile(t),count:r.left[t]!,degradedToImprovement:false})),
      }];
    }))});
  } catch { return {status:"unavailable",reason:"engine_failed"}; }
}
