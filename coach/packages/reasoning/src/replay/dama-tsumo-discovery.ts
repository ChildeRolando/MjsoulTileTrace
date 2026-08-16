/**
 * M6-A3 closing round (§7): local dama_with_tsumo_candidate discovery.
 *
 * A dama-with-tsumo window is a self-turn draw where the player could legally
 * have won by tsumo but actually discarded. Two facts decide it, both local:
 *
 * 1. Winning shape — the 14-tile hand (concealed + draw) is complete. The
 *    hand-structure fact engine speaks 13-tile projections, so the check is:
 *    remove the actually-discarded tile; the remaining 13 tiles are tenpai
 *    (overallShanten === 0) and the discarded tile is one of the waits. That
 *    is exactly "the 14-tile hand was a winning hand".
 * 2. Legality — a closed (menzen) hand always has the menzen-tsumo yaku, so
 *    completeness alone makes the tsumo legal. Open hands are excluded
 *    rather than guessed at: their tsumo legality depends on situational
 *    yaku this check does not certify.
 *
 * This module never infers anything from Mortal — it consumes replayed local
 * decisions and asks the trusted Go fact engine one question per candidate
 * window. Engine failures skip the window fail-closed (a window is never
 * promoted to a candidate without the engine's verdict).
 */
import {
  canonicalActionRef,
  type HandStructureResultV2,
  type Tile,
} from "@riichi-coach/contracts";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import { buildHandStructureRequestV2 } from "../factors/hand-structure-projector.js";
import { tileIdTo34 } from "../factors/tile34.js";
import type { ReplayedDecision } from "./stream-replayer.js";

/** One verified dama-with-tsumo window: locator + the wait that was discarded. */
export interface DamaTsumoWindow {
  readonly decisionEventRef: string;
  /** 34-index of the discarded tile — it was a winning tile of the kept hand. */
  readonly discardedWaitTile34: number;
}

export interface DamaTsumoDiscoveryResult {
  readonly windows: readonly DamaTsumoWindow[];
  /** Windows the engine was asked about (one request each). */
  readonly classifiedWindows: number;
  /** Windows skipped structurally (open hand, riichi'd, no draw, unprovable private facts). */
  readonly skippedWindows: number;
  /** Windows skipped fail-closed because the engine errored. */
  readonly engineFailures: number;
}

function removePhysicalTile(
  tiles: readonly Tile[],
  discarded: Tile,
): readonly Tile[] | null {
  const index = tiles.findIndex(
    (tile) => tile.id === discarded.id && tile.red === discarded.red,
  );
  if (index < 0) return null;
  return [...tiles.slice(0, index), ...tiles.slice(index + 1)];
}

/**
 * Classify replayed self decisions into dama_with_tsumo candidate windows.
 * Only the hand-structure surface of the fact engine port is used; every
 * request is built by the same projector the review pipeline uses.
 */
export async function collectDamaTsumoWindows(
  decisions: readonly ReplayedDecision[],
  engine: { analyzeHandStructure: HandStructureFactEnginePort["analyzeHandStructure"] },
): Promise<DamaTsumoDiscoveryResult> {
  const windows: DamaTsumoWindow[] = [];
  let classifiedWindows = 0;
  let skippedWindows = 0;
  let engineFailures = 0;

  for (const decision of decisions) {
    const action = decision.actualAction;
    // Only self-turn windows resolved by a PLAIN discard are dama candidates:
    // riichi_discard declared riichi (not dama), and tsumo/kan/kyuushu
    // resolutions did not decline a win by discarding.
    if (decision.snapshot.privateState.decisionWindow.kind !== "self_turn") continue;
    if (action === null || action.kind !== "discard") continue;
    const facts = decision.facts;
    // Open hands and riichi'd seats are skipped without an engine call: an
    // open tsumo's legality needs situational yaku we do not certify, and a
    // riichi'd seat no longer has a dama choice at all.
    if (facts.selfRiichi || facts.melds.length > 0 || facts.currentDraw === null) {
      skippedWindows += 1;
      continue;
    }
    const held = [...facts.concealedTiles, facts.currentDraw.tile];
    if (held.length !== 14) {
      // Incomplete private facts cannot prove anything — skip, never guess.
      skippedWindows += 1;
      continue;
    }
    const projectedHand = removePhysicalTile(held, action.tile);
    if (projectedHand === null) {
      skippedWindows += 1;
      continue;
    }
    classifiedWindows += 1;
    const request = buildHandStructureRequestV2({
      actionRef: canonicalActionRef(action),
      factSetId: `dama-tsumo-discovery:${decision.decisionEventRef}`,
      projectedHand,
      selfMelds: [],
      leftTiles34: null,
      ronContext: "unknown_future",
      yakuContext: {
        windsStatus: "unknown",
        roundWindTile34: null,
        selfWindTile34: null,
        riichiStatus: "inactive",
        openTanyaoStatus: "unknown",
      },
    });
    let result: HandStructureResultV2;
    try {
      result = await engine.analyzeHandStructure(request);
    } catch {
      engineFailures += 1;
      continue;
    }
    const discarded34 = tileIdTo34(action.tile.id);
    if (result.overallShanten === 0 &&
      result.waits.some((wait) => wait.tile34 === discarded34)) {
      windows.push({
        decisionEventRef: decision.decisionEventRef,
        discardedWaitTile34: discarded34,
      });
    }
  }

  return { windows, classifiedWindows, skippedWindows, engineFailures };
}
