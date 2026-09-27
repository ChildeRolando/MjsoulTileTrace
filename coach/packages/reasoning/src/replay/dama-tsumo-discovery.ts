import type { CanonicalEventStream, LibriichiRuleIdentity, LibriichiRulePort } from "@riichi-coach/contracts";
import { collectLibriichiRuleResults } from "../analysis/libriichi-rule-collection.js";
import { actualLibriichiActionRef } from "../analysis/local-mortal-rule-scoring.js";
import { tileIdTo34 } from "../factors/tile34.js";
import { replayCanonicalStream } from "./stream-replayer.js";

export interface DamaTsumoWindow {
  readonly decisionEventRef: string;
  readonly discardedWaitTile34: number;
  readonly ruleResultId: string;
}

export interface DamaTsumoDiscoveryResult {
  readonly windows: readonly DamaTsumoWindow[];
  /** All self boundaries queried, including post-call and riichi phases. */
  readonly classifiedWindows: number;
  /** Successfully classified windows outside the requested branch. */
  readonly skippedWindows: number;
  readonly engineFailures: number;
  readonly failureCounts: Readonly<Record<string, number>>;
  readonly legalActionRules: LibriichiRuleIdentity;
}

/** Discovery selects a branch only AFTER the complete native action result.
 * No hand-shape prefilter, helper legality inference, or model scoring.
 * Each failed boundary is counted and later boundaries still run.
 */
export async function collectDamaTsumoWindows(input: {
  stream: CanonicalEventStream; identity: LibriichiRuleIdentity; port: LibriichiRulePort;
}): Promise<DamaTsumoDiscoveryResult> {
  const decisions = replayCanonicalStream(input.stream);
  const rules = await collectLibriichiRuleResults({ ...input, decisions });
  const windows: DamaTsumoWindow[] = [];
  const failureCounts: Record<string, number> = {};
  let skippedWindows = 0;
  const fail = (code: string) => { failureCounts[code] = (failureCounts[code] ?? 0) + 1; };
  for (const decision of decisions) {
    const rule = rules.get(decision.decisionEventRef)!;
    if (rule.response.status !== "ok") {
      fail(rule.response.status === "error" ? rule.response.code : "rules_action_mapping_invalid");
      continue;
    }
    const action = decision.actualAction;
    if (decision.snapshot.privateState.decisionWindow.kind !== "self_turn" ||
        action?.kind !== "discard" || decision.facts.selfRiichi) {
      skippedWindows++;
      continue;
    }
    try { actualLibriichiActionRef(decision, rule.actions); }
    catch { fail("rules_actual_action_mismatch"); continue; }
    if (!rule.actions.some(row => row.action.kind === "tsumo")) {
      skippedWindows++;
      continue;
    }
    windows.push({ decisionEventRef: decision.decisionEventRef,
      discardedWaitTile34: tileIdTo34(action.tile.id), ruleResultId: rule.response.resultId });
  }
  return { windows, classifiedWindows: decisions.length, skippedWindows,
    engineFailures: Object.values(failureCounts).reduce((sum,count)=>sum+count,0),
    failureCounts, legalActionRules: input.identity };
}
