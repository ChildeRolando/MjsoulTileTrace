import { projectLocalMortalAction as mjaiAction, stableMortalSoftmax as stableSoftmax, buildLocalMortalReportEntry } from "./local-mortal-report.js";
import { projectLocalMortalEvent } from "./local-mortal-events.js";
import { createHash } from "node:crypto";
import {
  LocalMortalInferenceRequestSchema,
  canonicalActionRef,
  libriichiRuleCanonicalJson,
  sortTilesCanonical,
  type CanonicalEventStream,
  type LocalMortalCandidateBinding,
  type LocalMortalInferenceRequest,
  type LocalMortalInferenceSuccess,
  type ManagedMortalRuntimeIdentity,
  type RiichiAction,
  type Tile,
} from "@riichi-coach/contracts";
import {
  computeCanonicalGameFingerprint,
  type MortalReportCandidate,
  type MortalReportDecisionEntry,
  type MortalSourceAction,
} from "@riichi-coach/mortal-source";
import type { ReplayedDecision } from "../replay/stream-replayer.js";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import { buildHandStructureRequestV2, deriveHandStructureRonContext } from "../factors/hand-structure-projector.js";
import { tileIdTo34 } from "../factors/tile34.js";
import { stableProjectedStateHash } from "../factors/tile34.js";
import type { CompletedHandFactRequest } from "@riichi-coach/contracts";
import { isCompleteHandShapeWithSets } from "../factors/win-shape.js";
import { deriveResponseFuriten } from "../replay/response-furiten.js";
import { canDeclareKan, forbiddenCallDiscardIds, enumerateResponseCandidates, type RonCandidateVerdict } from "./response-candidate-enumeration.js";

function tileIndex(tile: Tile): number {
  if (tile.red) return tile.id.endsWith("m") ? 34 : tile.id.endsWith("p") ? 35 : 36;
  const offset = tile.id.endsWith("m") ? 0 : tile.id.endsWith("p") ? 9 : tile.id.endsWith("s") ? 18 : 27;
  return offset + Number(tile.id[0]) - 1;
}

function runtimeIndex(action: RiichiAction, offered?: Tile): number {
  switch (action.kind) {
    case "discard": return tileIndex(action.tile);
    case "declare_riichi": return 37;
    case "chi": {
      const ranks = action.consumedTiles.map((tile) => Number(tile.id[0]));
      const rank = Number(action.calledTile.id[0]);
      return Math.min(...ranks) > rank ? 38 : Math.max(...ranks) > rank ? 39 : 40;
    }
    case "pon": return 41;
    case "daiminkan":
    case "ankan":
    case "kakan": return 42;
    case "tsumo":
    case "ron": return 43;
    case "kyuushu_kyuuhai": return 44;
    case "pass": return 45;
    case "riichi_discard": return 37;
  }
}

function binding(action: RiichiAction, actor: number): LocalMortalCandidateBinding {
  return {
    actionRef: canonicalActionRef(action),
    runtimeAction: { index: runtimeIndex(action), variant: action.kind === "ankan" || action.kind === "kakan"
      ? `kan:${tileIdTo34(action.kind === "ankan" ? action.tiles[0].id : action.addedTile.id)}` : null },
    mjaiActionJson: JSON.stringify(mjaiAction(action, actor)),
  };
}

/** Shared physical discard enumeration for projection and local singleton proof. */
export function enumerateSelfDiscards(decision: ReplayedDecision): readonly Extract<RiichiAction, { kind: "discard" }>[] {
  const state = decision.snapshot.privateState;
  const actual = decision.actualAction;
  const draw = state.currentDraw?.tile;
  const tiles = [...state.concealedTiles, ...(draw === undefined ? [] : [draw])];
  const unique = new Map<string, Tile>();
  for (const tile of tiles) unique.set(`${tile.id}:${tile.red}`, tile);
  const forbiddenDiscardIds = new Set<string>();
  if (state.decisionWindow.kind === "post_call_discard" &&
      (state.fields.concealedTiles !== "complete" || decision.snapshot.publicState.fields.melds !== "complete")) {
    throw new Error("mortal_candidate_mismatch");
  }
  if (state.decisionWindow.kind === "post_call_discard") {
    const call = decision.snapshot.publicState.melds.find((meld) => meld.createdEventRef === state.decisionWindow.triggerEventRef);
    if (call?.actor === decision.snapshot.selfActor && (call.kind === "chi" || call.kind === "pon")) {
      for (const id of forbiddenCallDiscardIds(call)) forbiddenDiscardIds.add(id);
    }
  }
  return [...unique.values()].filter((tile) => !forbiddenDiscardIds.has(tile.id)).map((tile) => ({
    kind: "discard",
    tile,
    discardMode: actual?.kind === "discard" && actual.tile.id === tile.id && actual.tile.red === tile.red
      ? actual.discardMode
      : draw !== undefined && draw.id === tile.id && draw.red === tile.red ? "tsumogiri" : "tedashi",
  } as const));
}

function selfCandidates(
  decision: ReplayedDecision,
  includeDeclareRiichi: boolean,
  includeTsumo: boolean,
  riichiDiscardCandidates?: readonly Tile[],
  riichiAnkanCandidates?: readonly Tile[],
): LocalMortalCandidateBinding[] {
  const state = decision.snapshot.privateState;
  const actor = decision.snapshot.selfActor;
  const actual = decision.actualAction;
  if (actual === null) throw new Error("mortal_actual_action_mismatch");
  if (state.decisionWindow.kind === "post_riichi_discard") {
    if (riichiDiscardCandidates === undefined) throw new Error("mortal_protocol_invalid");
    return riichiDiscardCandidates.map((tile) => binding({
      kind: "discard",
      tile,
      discardMode: actual?.kind === "discard" && actual.tile.id === tile.id && actual.tile.red === tile.red
        ? actual.discardMode
        : "tedashi",
    }, actor));
  }
  const draw = state.currentDraw?.tile;
  const tiles = [...state.concealedTiles, ...(draw === undefined ? [] : [draw])];
  let result = enumerateSelfDiscards(decision).map(action => binding(action, actor));
  const counts = new Map<string, Tile[]>();
  for (const tile of tiles) counts.set(tile.id, [...(counts.get(tile.id) ?? []), tile]);
  const riichiStatus = decision.snapshot.publicState.riichiStates[actor]!.status;
  const canKan = canDeclareKan(decision);
  for (const group of counts.values()) {
    if (group.length !== 4) continue;
    if (state.decisionWindow.kind !== "self_turn" || !canKan) continue;
    if (riichiStatus !== "none") {
      if (riichiStatus !== "accepted" || state.decisionWindow.kind !== "self_turn" ||
          draw?.id !== group[0]!.id) continue;
      if (riichiAnkanCandidates === undefined) throw new Error("mortal_candidate_mismatch");
      if (!riichiAnkanCandidates.some((tile) => tile.id === group[0]!.id)) continue;
    }
    result.push(binding({ kind: "ankan", tiles: group as [Tile, Tile, Tile, Tile] }, actor));
  }
  for (const meld of decision.snapshot.publicState.melds) {
    if (state.decisionWindow.kind !== "self_turn" || riichiStatus !== "none" || !canKan) break;
    if (meld.actor !== actor || meld.kind !== "pon") continue;
    const addedTile = tiles.find((tile) => tile.id === meld.calledTile.id);
    if (addedTile !== undefined) {
      result.push(binding({ kind: "kakan", addedTile, existingMeldRef: meld.meldRef }, actor));
    }
  }
  if (riichiStatus !== "none" && state.decisionWindow.kind === "self_turn") {
    result = draw === undefined ? [] : [
      binding({ kind: "discard", tile: draw, discardMode: "tsumogiri" }, actor),
      ...result.filter((row) => row.runtimeAction.index === 42 && riichiStatus === "accepted"),
    ];
  }
  if (actual.kind === "riichi_discard") {
    result.push(binding(actual, actor));
  } else if (includeDeclareRiichi) {
    result.push(binding({ kind: "declare_riichi" }, actor));
  }
  if (includeTsumo && state.currentDraw !== null && !result.some((row) => row.runtimeAction.index === 43)) {
    result.push(binding({ kind: "tsumo", winningTile: state.currentDraw.tile, drawEventRef: state.currentDraw.eventRef }, actor));
  }
  const terminalKinds = new Set(tiles.filter((tile) => tile.id.endsWith("z") || tile.id.startsWith("1") || tile.id.startsWith("9")).map((tile) => tile.id));
  const publicState = decision.snapshot.publicState;
  if (state.decisionWindow.kind === "self_turn" && publicState.rivers[actor]!.length === 0 &&
      terminalKinds.size >= 9 && publicState.melds.length === 0) {
    // Any call or kan, including another player's concealed kan, interrupts
    // the first cycle. An empty self river alone does not prove eligibility.
    if (publicState.fields.melds !== "complete" || publicState.fields.rivers !== "complete" ||
        state.currentDraw === null) throw new Error("mortal_candidate_mismatch");
    result.push(binding({ kind: "kyuushu_kyuuhai", drawEventRef: state.currentDraw.eventRef }, actor));
  }
  if (["ankan", "kakan", "tsumo", "kyuushu_kyuuhai"].includes(actual.kind) &&
      !result.some((row) => row.actionRef === canonicalActionRef(actual))) {
    throw new Error("mortal_candidate_mismatch");
  }
  const kans = result.filter(row => row.runtimeAction.index === 42);
  if (kans.length === 1) kans[0]!.runtimeAction.variant = null;
  return result;
}

/** Prove post-acceptance kan eligibility before constructing a model request.
 * Missing or inconsistent fact-engine evidence aborts the projection rather
 * than producing a false single-candidate window. */
export async function collectLocalMortalRiichiAnkanCandidates(
  decisions: readonly ReplayedDecision[],
  engine: Pick<HandStructureFactEnginePort, "analyzeHandStructure">,
): Promise<ReadonlyMap<string, readonly Tile[]>> {
  const result = new Map<string, readonly Tile[]>();
  for (const decision of decisions) {
    const snapshot = decision.snapshot;
    const state = snapshot.privateState;
    const actor = snapshot.selfActor;
    const draw = state.currentDraw?.tile;
    if (state.decisionWindow.kind !== "self_turn" || draw === undefined ||
        snapshot.publicState.riichiStates[actor]?.status !== "accepted") continue;
    const group = [...state.concealedTiles, draw].filter((tile) => tile.id === draw.id);
    if (group.length !== 4) continue;
    if (!canDeclareKan(decision)) {
      result.set(decision.decisionEventRef, []);
      continue;
    }
    const melds = decision.facts.melds.filter((meld) => meld.actor === actor);
    const actionRef = canonicalActionRef({ kind: "ankan", tiles: group as [Tile, Tile, Tile, Tile] });
    const yakuContext = {
      windsStatus: "unknown" as const, roundWindTile34: null, selfWindTile34: null,
      riichiStatus: "accepted" as const, openTanyaoStatus: "unknown" as const,
    };
    const before = await engine.analyzeHandStructure(buildHandStructureRequestV2({
      actionRef, factSetId: `local-mortal-riichi-kan-before:${decision.decisionEventRef}`,
      projectedHand: state.concealedTiles, selfMelds: melds,
      leftTiles34: null, ronContext: "unknown_future", yakuContext,
    }));
    if (before.overallShanten !== 0 || before.decompositions.status !== "calculated") {
      throw new Error("mortal_candidate_mismatch");
    }
    const tile34 = tileIdTo34(draw.id);
    const afterHand = state.concealedTiles.filter(tile => tile.id !== draw.id);
    const afterCounts = Array<number>(34).fill(0);
    for (const tile of afterHand) afterCounts[tileIdTo34(tile.id)]! += 1;
    if (before.waits.some(wait => {
      if (wait.tile34 === tile34) return true;
      const winning = [...afterCounts];
      winning[wait.tile34]! += 1;
      return !isCompleteHandShapeWithSets(winning, 3 - melds.length);
    })) {
      result.set(decision.decisionEventRef, []);
      continue;
    }
    const after = await engine.analyzeHandStructure(buildHandStructureRequestV2({
      actionRef, factSetId: `local-mortal-riichi-kan-after:${decision.decisionEventRef}`,
      projectedHand: afterHand,
      selfMelds: [...melds, {
        actor, kind: "ankan", meldRef: `local-mortal:${decision.decisionEventRef}`,
        tiles: group,
      }],
      leftTiles34: null, ronContext: "unknown_future", yakuContext,
    }));
    if (after.decompositions.status !== "calculated") throw new Error("mortal_candidate_mismatch");
    // The pinned runtime uses Tenhou's non-strict rule: preserve winning
    // tile kinds, not every decomposition, wait shape, or yaku. Invariant
    // shape claims describe facts; they are not a kan legality requirement.
    const waits = (value: typeof before) => value.waits.map(wait => wait.tile34).sort((a,b) => a-b);
    result.set(decision.decisionEventRef,
      after.overallShanten === 0 && JSON.stringify(waits(before)) === JSON.stringify(waits(after))
        ? [draw] : []);
  }
  return result;
}

/** Ask the existing scoring engine about the completed draw. Bonuses cannot
 * establish yaku. Evaluate every wind assignment allowed by the known context. */
async function proveOpenTsumo(decision: ReplayedDecision, engine: Pick<HandStructureFactEnginePort, "analyzeCompletedHand">): Promise<boolean> {
  const facts = decision.facts, draw = decision.snapshot.privateState.currentDraw!;
  const context = facts.handStructureYakuContext;
  const melds = facts.melds.filter(meld => meld.actor === decision.snapshot.selfActor);
  const held = [...decision.snapshot.privateState.concealedTiles, draw.tile];
  const counts = Array<number>(34).fill(0);
  for (const tile of held) counts[tileIdTo34(tile.id)]! += 1;
  const owned = [...held, ...melds.flatMap(meld => meld.tiles)];
  // The upstream scorer assumes kuitan. Without an enabled rule it cannot
  // prove an all-simples open hand; the structural ron proof remains usable.
  if (context?.openTanyaoStatus !== "enabled" && owned.every(tile => {
    const i=tileIdTo34(tile.id); return i<27 && i%9!==0 && i%9!==8;
  })) throw new Error("mortal_candidate_mismatch");
  const winds = context?.windsStatus === "known"
    ? [[context.roundWindTile34!, context.selfWindTile34!]]
    : [27,28,29,30].flatMap(round => [27,28,29,30].map(seat => [round,seat]));
  const outcomes: boolean[] = [];
  for (const [roundWindTile34, selfWindTile34] of winds) {
    const projected = {actionRef: canonicalActionRef({kind:"tsumo",winningTile:draw.tile,drawEventRef:draw.eventRef}),
      completedHandTiles34:counts,tsumo:true,winTile34:tileIdTo34(draw.tile.id),
      melds:melds.map(meld=>({kind:meld.kind,tiles34:meld.tiles.map(tile=>tileIdTo34(tile.id))})),
      doraTiles34:[],redFiveCounts:[0,0,0] as [number,number,number],roundWindTile34:roundWindTile34!,selfWindTile34:selfWindTile34!,
      dealer:selfWindTile34===27,riichi:decision.snapshot.publicState.riichiStates[decision.snapshot.selfActor]?.status==="accepted",selfDiscards34:[]};
    const stateHash=stableProjectedStateHash(projected);
    const request:CompletedHandFactRequest={kind:"completed_hand",requestId:`local-mortal-tsumo:${decision.decisionEventRef}:${stateHash}`,protocolVersion:"mahjong-facts/v1",stateHash,...projected};
    outcomes.push((await engine.analyzeCompletedHand(request)).point>0);
  }
  if(outcomes.every(Boolean)) return true;
  if(outcomes.every(value=>!value)) return false;
  throw new Error("mortal_candidate_mismatch");
}

/** Cover winning draws outside dama-discard discovery using structure and
 * yaku evidence, independent of whether the player took the win. */
export async function collectLocalMortalAdditionalTsumoWindows(
  decisions: readonly ReplayedDecision[],
  engine: Pick<HandStructureFactEnginePort, "analyzeHandStructure" | "analyzeCompletedHand">,
): Promise<ReadonlySet<string>> {
  const result = new Set<string>();
  for (const decision of decisions) {
    const snapshot = decision.snapshot;
    const state = snapshot.privateState;
    const actor = snapshot.selfActor;
    if (state.decisionWindow.kind !== "self_turn" || state.currentDraw === null) continue;
    const melds = decision.facts.melds.filter((meld) => meld.actor === actor);
    const open = melds.some(meld => meld.kind !== "ankan");
    const held = [...state.concealedTiles, state.currentDraw.tile];
    const counts = Array<number>(34).fill(0);
    for (const tile of held) counts[tileIdTo34(tile.id)]! += 1;
    if (!isCompleteHandShapeWithSets(counts, 4 - melds.length)) continue;
    if (state.fields.concealedTiles !== "complete" || snapshot.publicState.fields.melds !== "complete") {
      throw new Error("mortal_candidate_mismatch");
    }
    const verdict = await engine.analyzeHandStructure(buildHandStructureRequestV2({
      actionRef: canonicalActionRef({ kind: "tsumo", winningTile: state.currentDraw.tile,
        drawEventRef: state.currentDraw.eventRef }),
      factSetId: `local-mortal-riichi-tsumo:${decision.decisionEventRef}`,
      projectedHand: state.concealedTiles, selfMelds: melds,
      // Use ordinary-hand yaku proof here. Draw-specific haitei/rinshan and
      // menzen tsumo are checked below, never borrowed from future ron context.
      leftTiles34: null, ronContext: "complete_none",
      yakuContext: decision.facts.handStructureYakuContext ?? {
        windsStatus: "unknown", roundWindTile34: null, selfWindTile34: null,
        riichiStatus: snapshot.publicState.riichiStates[actor]?.status === "accepted" ? "accepted" : "inactive",
        openTanyaoStatus: "unknown",
      },
    }));
    const wait = verdict.waits.find(wait => wait.tile34 === tileIdTo34(state.currentDraw!.tile.id));
    const situationalYaku = (snapshot.publicState.remainingDraws === 0 && snapshot.publicState.fields.remainingDraws === "complete") ||
      state.currentDraw.from === "rinshan";
    if (verdict.overallShanten !== 0 || wait === undefined) continue;
    if (!open || situationalYaku || wait.baseRonEligibility === "eligible" || await proveOpenTsumo(decision, engine)) {
      result.add(decision.decisionEventRef);
    }

  }
  return result;
}

export async function collectLocalMortalRiichiCandidateWindows(
  decisions: readonly ReplayedDecision[],
  engine: Pick<HandStructureFactEnginePort, "analyzeHandStructure">,
): Promise<ReadonlySet<string>> {
  const result = new Set<string>();
  for (const decision of decisions) {
    const state = decision.snapshot.privateState;
    const actor = decision.snapshot.selfActor;
    const selfMelds = decision.facts.melds.filter((meld) => meld.actor === actor);
    if (state.decisionWindow.kind !== "self_turn" || state.currentDraw === null ||
        selfMelds.some((meld) => meld.kind !== "ankan") || decision.snapshot.publicState.riichiStates[actor]!.status !== "none" ||
        decision.snapshot.publicState.scores[actor]! < 1_000 ||
        (decision.snapshot.publicState.remainingDraws !== null && decision.snapshot.publicState.remainingDraws < 4)) continue;
    const held = [...state.concealedTiles, state.currentDraw.tile];
    const unique = new Map<string, Tile>();
    for (const tile of held) unique.set(`${tile.id}:${tile.red}`, tile);
    for (const discard of unique.values()) {
      const index = held.findIndex((tile) => tile.id === discard.id && tile.red === discard.red);
      const projectedHand = [...held.slice(0, index), ...held.slice(index + 1)];
      const verdict = await engine.analyzeHandStructure(buildHandStructureRequestV2({
        actionRef: canonicalActionRef({ kind: "discard", tile: discard, discardMode: "tedashi" }),
        factSetId: `local-mortal-riichi:${decision.decisionEventRef}:${discard.id}:${discard.red}`,
        projectedHand,
        selfMelds,
        leftTiles34: null,
        ronContext: "unknown_future",
        yakuContext: {
          windsStatus: "unknown", roundWindTile34: null, selfWindTile34: null,
          riichiStatus: "inactive", openTanyaoStatus: "unknown",
        },
      }));
      if (verdict.overallShanten === 0) {
        result.add(decision.decisionEventRef);
        break;
      }
    }
  }
  return result;
}

export async function collectLocalMortalRonCandidateWindows(
  stream: CanonicalEventStream,
  decisions: readonly ReplayedDecision[],
  engine: HandStructureFactEnginePort,
): Promise<ReadonlyMap<string, RonCandidateVerdict>> {
  const result = new Map<string, RonCandidateVerdict>();
  for (const decision of decisions) {
    const enumeration = enumerateResponseCandidates(decision);
    if (enumeration?.ron !== true) continue;
    const window = decision.snapshot.privateState.decisionWindow;
    if (window.kind !== "discard_response" && window.kind !== "kan_response") continue;
    const facts = decision.facts;
    const request = buildHandStructureRequestV2({
      actionRef: canonicalActionRef({
        kind: "ron", winningTile: window.offeredTile, targetActor: window.sourceActor!,
        responseEventRef: window.triggerEventRef,
        winContext: window.kind === "kan_response" ? window.kanKind : "discard",
      }),
      factSetId: `local-mortal-ron:${decision.decisionEventRef}`,
      projectedHand: decision.snapshot.privateState.concealedTiles,
      selfMelds: facts.melds.filter((meld) => meld.actor === decision.snapshot.selfActor),
      leftTiles34: null,
      ronContext: deriveHandStructureRonContext(facts),
      yakuContext: facts.handStructureYakuContext ?? {
        windsStatus: "unknown", roundWindTile34: null, selfWindTile34: null,
        riichiStatus: facts.selfRiichi ? "accepted" : "inactive", openTanyaoStatus: "unknown",
      },
    });
    try {
      const hand = await engine.analyzeHandStructure(request);
      const wait = hand.waits.find((row) => row.tile34 === tileIdTo34(window.offeredTile.id));
      // A successful, complete structural result makes absence definitive.
      // Missing input or a blocked engine result is still unknown evidence.
      if (hand.decompositions.status !== "calculated" ||
          decision.snapshot.privateState.fields.concealedTiles !== "complete" ||
          decision.snapshot.publicState.fields.melds !== "complete") {
        result.set(decision.decisionEventRef, { status: "unknown", reason: "hand_structure_unknown" });
        continue;
      }
      if (wait === undefined || wait.baseRonEligibility === "ineligible") {
        result.set(decision.decisionEventRef, { status: "proven_ineligible", reason: "hand_structure_ineligible" });
        continue;
      }
      if (wait?.baseRonEligibility !== "eligible") {
        result.set(decision.decisionEventRef, { status: "unknown", reason: "hand_structure_unknown" });
        continue;
      }
      const furiten = await deriveResponseFuriten(stream, decision.decisionEventRef, engine);
      // As in the hand-structure furiten merger, every structural wait (not
      // only the offered tile) must be checked against the self river.
      const publicState = decision.snapshot.publicState;
      const selfRiver = publicState.rivers[decision.snapshot.selfActor];
      const structuralWaits = new Set(hand.waits.map((row) => row.tile34));
      const discardStatus = selfRiver?.some((discard) =>
        discard.actor === decision.snapshot.selfActor && structuralWaits.has(tileIdTo34(discard.tile.id)))
        ? "confirmed"
        : selfRiver !== undefined &&
          stream.completeness.eventSequence === "complete" &&
          stream.completeness.rivers === "complete" &&
          publicState.fields.rivers === "complete"
          ? "clear"
          : "unknown";
      const states = [discardStatus, furiten.temporary.status, furiten.riichi.status];
      result.set(decision.decisionEventRef, states.includes("confirmed")
        ? { status: "proven_ineligible", reason: "furiten_confirmed" }
        : states.every((status) => status === "clear")
          ? { status: "eligible", reason: "ron_eligible" }
          : { status: "unknown", reason: "furiten_unknown" });
    } catch {
      result.set(decision.decisionEventRef, { status: "unknown", reason: "fact_engine_unavailable" });
    }
  }
  return result;
}

function responseCandidates(decision: ReplayedDecision, includeRon: boolean): LocalMortalCandidateBinding[] {
  const enumeration = enumerateResponseCandidates(decision);
  if (enumeration === null) throw new Error("mortal_candidate_mismatch");
  const window = decision.snapshot.privateState.decisionWindow;
  if (window.kind !== "discard_response" && window.kind !== "kan_response" || window.sourceActor === null) {
    throw new Error("mortal_candidate_mismatch");
  }
  const actor = decision.snapshot.selfActor;
  const actions: RiichiAction[] = [];
  for (const chi of enumeration.chiCombinations) actions.push({
    kind: "chi", calledTile: window.offeredTile,
    consumedTiles: chi.consumedTiles as [Tile, Tile], targetActor: window.sourceActor,
    responseEventRef: window.triggerEventRef,
  });
  if (enumeration.pon) {
    const matching = decision.snapshot.privateState.concealedTiles.filter((tile) => tile.id === window.offeredTile.id);
    const consumed = sortTilesCanonical([...matching].sort((a, b) => Number(b.red) - Number(a.red)).slice(0, 2)) as [Tile, Tile];
    if (consumed.length !== 2) throw new Error("mortal_candidate_mismatch");
    actions.push({ kind: "pon", calledTile: window.offeredTile, consumedTiles: consumed, targetActor: window.sourceActor, responseEventRef: window.triggerEventRef });
  }
  if (enumeration.daiminkan) {
    const consumed = sortTilesCanonical(decision.snapshot.privateState.concealedTiles.filter((tile) => tile.id === window.offeredTile.id).slice(0, 3)) as [Tile, Tile, Tile];
    actions.push({ kind: "daiminkan", calledTile: window.offeredTile, consumedTiles: consumed, targetActor: window.sourceActor, responseEventRef: window.triggerEventRef });
  }
  if (includeRon || decision.actualAction?.kind === "ron") actions.push({ kind: "ron", winningTile: window.offeredTile, targetActor: window.sourceActor, responseEventRef: window.triggerEventRef, winContext: window.kind === "kan_response" ? window.kanKind : "discard" });
  actions.push({ kind: "pass", responseEventRef: window.triggerEventRef, responseKind: window.kind === "kan_response" ? window.kanKind : "discard" });
  return actions.map((action) => binding(action, actor));
}


export function projectLocalMortalRequest(input: {
  stream: CanonicalEventStream;
  decision: ReplayedDecision;
  surface: "self" | "response";
  identity: ManagedMortalRuntimeIdentity;
  includeDeclareRiichi?: boolean;
  includeTsumo?: boolean;
  includeRon?: boolean;
  riichiDiscardCandidates?: readonly Tile[];
  riichiAnkanCandidates?: readonly Tile[];
}): LocalMortalInferenceRequest {
  const candidates = input.surface === "response"
    ? responseCandidates(input.decision, input.includeRon ?? false)
    : selfCandidates(
      input.decision,
      input.includeDeclareRiichi ?? false,
      input.includeTsumo ?? false,
      input.riichiDiscardCandidates,
      input.riichiAnkanCandidates,
    );
  const actual = input.decision.actualAction;
  if (actual === null) throw new Error("mortal_actual_action_mismatch");
  const actualActionRef = canonicalActionRef(actual);
  if (candidates.filter((candidate) => candidate.actionRef === actualActionRef).length !== 1) {
    throw new Error("mortal_actual_action_mismatch");
  }
  if (candidates.length < 2) throw new Error("mortal_source_row_not_expected");
  const trigger = input.decision.decisionEventRef;
  const events = [];
  for (const event of input.stream.events) {
    const projected = projectLocalMortalEvent(input.stream, event);
    if (projected !== null) events.push({ eventRef: event.eventId, json: JSON.stringify(projected), canAct: event.eventId === trigger });
    if (event.eventId === trigger) break;
  }
  const request: LocalMortalInferenceRequest = LocalMortalInferenceRequestSchema.parse({
    protocolVersion: input.identity.protocolVersion,
    requestId: "pending-content-binding",
    identity: input.identity,
    recordId: input.stream.gameId,
    canonicalStreamIdentity: computeCanonicalGameFingerprint(input.stream),
    decision: { decisionId: trigger, surface: input.surface, windowKind: input.decision.snapshot.privateState.decisionWindow.kind, triggerEventRef: trigger, selfActor: input.stream.selfActor },
    events,
    candidates,
    actualActionRef,
  });
  return { ...request, requestId: localMortalRequestId(request) };
}

function localMortalRequestId(request: LocalMortalInferenceRequest): string {
  const { requestId: _requestId, ...content } = request;
  return `local-mortal:${createHash("sha256").update(libriichiRuleCanonicalJson(content)).digest("hex")}`;
}

export function localMortalResponseToReportEntry(input: {
  request: LocalMortalInferenceRequest;
  response: LocalMortalInferenceSuccess;
  decision: ReplayedDecision;
}): MortalReportDecisionEntry {
  if (input.request.requestId !== localMortalRequestId(input.request)) {
    throw new Error("mortal_protocol_invalid");
  }
  const actual = input.decision.actualAction;
  if (actual === null) throw new Error("mortal_actual_action_mismatch");
  const window = input.decision.snapshot.privateState.decisionWindow;
  const expectedSurface = window.kind === "discard_response" || window.kind === "kan_response"
    ? "response"
    : "self";
  const expectedDecision = {
    decisionId: input.decision.decisionEventRef,
    surface: expectedSurface,
    windowKind: window.kind,
    triggerEventRef: input.decision.decisionEventRef,
    selfActor: input.decision.snapshot.selfActor,
  };
  if (
    input.response.requestId !== input.request.requestId
    || input.response.protocolVersion !== input.request.protocolVersion
    || JSON.stringify(input.response.identity) !== JSON.stringify(input.request.identity)
    || JSON.stringify(input.response.decision) !== JSON.stringify(input.request.decision)
    || JSON.stringify(input.request.decision) !== JSON.stringify(expectedDecision)
  ) {
    throw new Error("mortal_protocol_invalid");
  }
  const actualActionRef = canonicalActionRef(actual);
  if (
    input.request.actualActionRef !== actualActionRef
    || input.request.candidates.filter((row) => row.actionRef === actualActionRef).length !== 1
  ) {
    throw new Error("mortal_actual_action_mismatch");
  }
  const requestKeys = input.request.candidates.map((row) => JSON.stringify(row.runtimeAction));
  const responseKeys = input.response.candidates.map((row) => JSON.stringify(row.runtimeAction));
  const requestActionRefs = input.request.candidates.map((row) => row.actionRef);
  if (
    new Set(requestKeys).size !== requestKeys.length
    || new Set(requestActionRefs).size !== requestActionRefs.length
    || new Set(responseKeys).size !== responseKeys.length
    || JSON.stringify([...requestKeys].sort()) !== JSON.stringify([...responseKeys].sort())
  ) {
    throw new Error("mortal_candidate_mismatch");
  }
  const preferredKey = JSON.stringify(input.response.preferredRuntimeAction);
  const preferredRow = input.response.candidates.find((row) => JSON.stringify(row.runtimeAction) === preferredKey);
  const maxQ = Math.max(...input.response.candidates.map((row) => row.qValue));
  if (preferredRow === undefined || preferredRow.qValue !== maxQ) {
    throw new Error("mortal_candidate_mismatch");
  }
  const kanRows = input.response.candidates.filter(row => row.runtimeAction.index === 42);
  const multipleKans = kanRows.length > 1;
  if (input.response.candidates.some(row =>
    (multipleKans && row.runtimeAction.index === 42) !== (row.kanSelectionQValue !== undefined)) ||
    (multipleKans && (kanRows.some(row => row.qValue !== kanRows[0]!.qValue) ||
      (preferredRow.runtimeAction.index === 42 && preferredRow.kanSelectionQValue !== Math.max(...kanRows.map(row => row.kanSelectionQValue!)))))) {
    throw new Error("mortal_candidate_mismatch");
  }
  const candidateByKey = new Map(input.request.candidates.map((row) => [JSON.stringify(row.runtimeAction), row]));
  // Preserve the native two-stage greedy ordering without pretending a kan
  // selection Q is comparable to a main-action Q. Scores are derived locally;
  // reported qValue remains the raw main-action value.
  const bestKanQ = multipleKans ? Math.max(...kanRows.map(row => row.kanSelectionQValue!)) : 0;
  const probs = stableSoftmax(input.response.candidates.map(row => row.qValue +
    (row.kanSelectionQValue === undefined ? 0 : row.kanSelectionQValue - bestKanQ)));
  const details: MortalReportCandidate[] = input.response.candidates.map((row, index) => {
    const candidate = candidateByKey.get(JSON.stringify(row.runtimeAction));
    if (candidate === undefined) throw new Error("mortal_candidate_mismatch");
    return { action: JSON.parse(candidate.mjaiActionJson) as MortalSourceAction, probability: probs[index]!, qValue: row.qValue };
  });
  const actualProjected = mjaiAction(actual, input.decision.snapshot.selfActor);
  return buildLocalMortalReportEntry({
    decision: input.decision, decisionIdentity: input.request.decision, details,
    preferredIndex: input.response.candidates.indexOf(preferredRow),
    actualIndex: details.findIndex(row => JSON.stringify(row.action) === JSON.stringify(actualProjected)),
  });
}
