import type { LocalMortalDecisionIdentity, RiichiAction } from "@riichi-coach/contracts";
import { formatMjaiTile, type MortalSourceAction, type MortalReportCandidate, type MortalReportDecisionEntry } from "@riichi-coach/mortal-source";
import type { ReplayedDecision } from "../replay/stream-replayer.js";

/** Representation of a known action, never action enumeration. */
export function projectLocalMortalAction(action: RiichiAction, actor: number): MortalSourceAction {
  switch (action.kind) {
    case "discard": return { type: "dahai", actor, pai: formatMjaiTile(action.tile), tsumogiri: action.discardMode === "tsumogiri" };
    case "riichi_discard": case "declare_riichi": return { type: "reach", actor };
    case "chi": case "pon": case "daiminkan":
      return { type: action.kind, actor, target: action.targetActor, pai: formatMjaiTile(action.calledTile), consumed: action.consumedTiles.map(formatMjaiTile) };
    case "ankan": return { type: "ankan", actor, consumed: action.tiles.map(formatMjaiTile) };
    case "kakan": return { type: "kakan", actor, pai: formatMjaiTile(action.addedTile) };
    case "tsumo": return { type: "hora", actor, target: actor, pai: formatMjaiTile(action.winningTile) };
    case "ron": return { type: "hora", actor, target: action.targetActor, pai: formatMjaiTile(action.winningTile) };
    case "kyuushu_kyuuhai": return { type: "ryukyoku", actor, reason: "kyuushu_kyuuhai" };
    case "pass": return { type: "none" };
  }
}

export function stableMortalSoftmax(values: readonly number[]): number[] {
  const max = Math.max(...values);
  const exps = values.map(value => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map(value => value / total);
}

/** Existing report representation after action/score correspondence was verified. */
export function buildLocalMortalReportEntry(input: {
  decision: ReplayedDecision; details: MortalReportCandidate[]; preferredIndex: number; actualIndex: number;
  decisionIdentity: LocalMortalDecisionIdentity;
}): MortalReportDecisionEntry {
  const { decision, details } = input;
  const actual = decision.actualAction;
  if (actual === null || details[input.actualIndex] === undefined || details[input.preferredIndex] === undefined) {
    throw new Error("mortal_actual_action_mismatch");
  }
  const snapshot = decision.snapshot;
  const state = snapshot.privateState;
  const window = state.decisionWindow;
  const lastActor = window.kind === "discard_response" || window.kind === "kan_response" ? window.sourceActor : snapshot.selfActor;
  if (lastActor === null) throw new Error("mortal_actual_action_mismatch");
  const expected = details[input.preferredIndex]!.action;
  const actualProjected = projectLocalMortalAction(actual, snapshot.selfActor);
  const triggerTile = window.kind === "discard_response" || window.kind === "kan_response"
    ? window.offeredTile : state.currentDraw?.tile ?? (actual.kind === "discard" || actual.kind === "riichi_discard" ? actual.tile : undefined);
  if (triggerTile === undefined) throw new Error("mortal_actual_action_mismatch");
  const hand = [...state.concealedTiles,
    ...((window.kind === "self_turn" || window.kind === "post_riichi_discard") && state.currentDraw !== null ? [state.currentDraw.tile] : [])];
  return {
    roundOrdinal: snapshot.publicState.roundOrdinal, roundWind: snapshot.publicState.roundWind,
    dealer: snapshot.publicState.dealer, kyoku: snapshot.publicState.hand - 1, honba: snapshot.publicState.honba,
    junme: snapshot.publicState.rivers[snapshot.selfActor]!.length + 1,
    tilesLeft: snapshot.publicState.remainingDraws ?? 0,
    lastActor,
    tile: formatMjaiTile(triggerTile), tehai: hand.map(formatMjaiTile),
    fuuros: state.selfMeldRefs.map(ref => {
      const meld = snapshot.publicState.melds.find(row => row.meldRef === ref)!;
      const tiles = meld.kind === "ankan" ? meld.tiles : meld.kind === "kakan"
        ? [meld.calledTile, ...meld.consumedTiles, meld.addedTile] : [meld.calledTile, ...meld.consumedTiles];
      return { kind: meld.kind, tiles };
    }),
    atSelfChiPon: window.kind === "post_call_discard",
    atSelfRiichi: window.kind === "post_riichi_discard" || snapshot.publicState.riichiStates[snapshot.selfActor]!.status !== "none",
    atOpponentKakan: window.kind === "kan_response", expected, actual: actualProjected,
    isEqual: input.actualIndex === input.preferredIndex, details,
    shanten: 0, atFuriten: false, actualIndex: input.actualIndex, localDecisionIdentity: input.decisionIdentity,
  };
}
