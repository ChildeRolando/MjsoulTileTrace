import { createHash } from "node:crypto";
import {
  LocalMortalInferenceRequestSchema,
  canonicalActionRef,
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
  formatMjaiTile,
  type MortalReportCandidate,
  type MortalReportDecisionEntry,
  type MortalReportFuuro,
  type MortalSourceAction,
} from "@riichi-coach/mortal-source";
import type { ReplayedDecision } from "../replay/stream-replayer.js";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import { buildHandStructureRequestV2, deriveHandStructureRonContext } from "../factors/hand-structure-projector.js";
import { tileIdTo34 } from "../factors/tile34.js";
import { deriveResponseFuriten } from "../replay/response-furiten.js";
import { enumerateResponseCandidates } from "./response-candidate-enumeration.js";

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

function mjaiAction(action: RiichiAction, actor: number): MortalSourceAction {
  switch (action.kind) {
    case "discard":
      return { type: "dahai", actor, pai: formatMjaiTile(action.tile), tsumogiri: action.discardMode === "tsumogiri" };
    case "riichi_discard": return { type: "reach", actor };
    case "declare_riichi": return { type: "reach", actor };
    case "chi":
    case "pon":
    case "daiminkan":
      return { type: action.kind, actor, target: action.targetActor, pai: formatMjaiTile(action.calledTile), consumed: action.consumedTiles.map(formatMjaiTile) };
    case "ankan": return { type: "ankan", actor, consumed: action.tiles.map(formatMjaiTile) };
    case "kakan": return { type: "kakan", actor, pai: formatMjaiTile(action.addedTile) };
    case "tsumo": return { type: "hora", actor, target: actor, pai: formatMjaiTile(action.winningTile) };
    case "ron": return { type: "hora", actor, target: action.targetActor, pai: formatMjaiTile(action.winningTile) };
    case "kyuushu_kyuuhai": return { type: "ryukyoku", actor };
    case "pass": return { type: "none" };
  }
}

function binding(action: RiichiAction, actor: number): LocalMortalCandidateBinding {
  return {
    actionRef: canonicalActionRef(action),
    runtimeAction: { index: runtimeIndex(action), variant: null },
    mjaiActionJson: JSON.stringify(mjaiAction(action, actor)),
  };
}

function selfCandidates(decision: ReplayedDecision, includeDeclareRiichi: boolean, includeTsumo: boolean): LocalMortalCandidateBinding[] {
  const state = decision.snapshot.privateState;
  const actor = decision.snapshot.selfActor;
  const actual = decision.actualAction;
  if (actual === null) throw new Error("mortal_actual_action_mismatch");
  if (state.decisionWindow.kind === "post_riichi_discard") return [binding(actual, actor)];
  const draw = state.currentDraw?.tile;
  const tiles = [...state.concealedTiles, ...(draw === undefined ? [] : [draw])];
  const unique = new Map<string, Tile>();
  for (const tile of tiles) unique.set(`${tile.id}:${tile.red}`, tile);
  const forbiddenDiscardIds = new Set<string>();
  if (state.decisionWindow.kind === "post_call_discard") {
    const call = decision.snapshot.publicState.melds.find((meld) => meld.createdEventRef === state.decisionWindow.triggerEventRef);
    if (call?.kind === "chi" || call?.kind === "pon") {
      forbiddenDiscardIds.add(call.calledTile.id);
      if (call.kind === "chi") {
        const calledRank = Number(call.calledTile.id[0]);
        const consumedRanks = call.consumedTiles.map((tile) => Number(tile.id[0]));
        const min = Math.min(...consumedRanks);
        const max = Math.max(...consumedRanks);
        const swappedRank = calledRank < min ? max + 1 : calledRank > max ? min - 1 : null;
        if (swappedRank !== null && swappedRank >= 1 && swappedRank <= 9) {
          forbiddenDiscardIds.add(`${swappedRank}${call.calledTile.id[1]}`);
        }
      }
    }
  }
  let result = [...unique.values()].filter((tile) => !forbiddenDiscardIds.has(tile.id)).map((tile) => binding({
    kind: "discard",
    tile,
    discardMode: actual.kind === "discard" && actual.tile.id === tile.id && actual.tile.red === tile.red
      ? actual.discardMode
      : draw !== undefined && draw.id === tile.id && draw.red === tile.red ? "tsumogiri" : "tedashi",
  }, actor));
  const counts = new Map<string, Tile[]>();
  for (const tile of tiles) counts.set(tile.id, [...(counts.get(tile.id) ?? []), tile]);
  for (const group of counts.values()) {
    if (group.length === 4) result.push(binding({ kind: "ankan", tiles: group as [Tile, Tile, Tile, Tile] }, actor));
  }
  for (const meld of decision.snapshot.publicState.melds) {
    if (meld.actor !== actor || meld.kind !== "pon") continue;
    const addedTile = tiles.find((tile) => tile.id === meld.calledTile.id);
    if (addedTile !== undefined) {
      if (result.some((row) => row.runtimeAction.index === 42)) throw new Error("mortal_candidate_mismatch");
      result.push(binding({ kind: "kakan", addedTile, existingMeldRef: meld.meldRef }, actor));
    }
  }
  if (decision.snapshot.publicState.riichiStates[actor]!.status !== "none") {
    result = draw === undefined ? [] : [binding({ kind: "discard", tile: draw, discardMode: "tsumogiri" }, actor)];
  }
  if (actual.kind !== "riichi_discard" && !result.some((row) => row.runtimeAction.index === runtimeIndex(actual))) {
    result.push(binding(actual, actor));
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
  if (state.decisionWindow.kind === "self_turn" && decision.snapshot.publicState.rivers[actor]!.length === 0 && terminalKinds.size >= 9 && !result.some((row) => row.runtimeAction.index === 44)) {
    result.push(binding({ kind: "kyuushu_kyuuhai", drawEventRef: state.currentDraw!.eventRef }, actor));
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
    if (state.decisionWindow.kind !== "self_turn" || state.currentDraw === null ||
        state.selfMeldRefs.length > 0 || decision.snapshot.publicState.riichiStates[actor]!.status !== "none" ||
        decision.snapshot.publicState.scores[actor]! < 1_000 ||
        (decision.snapshot.publicState.remainingDraws !== null && decision.snapshot.publicState.remainingDraws < 4)) continue;
    if (decision.actualAction?.kind === "riichi_discard") {
      result.add(decision.decisionEventRef);
      continue;
    }
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
        selfMelds: [],
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
): Promise<ReadonlySet<string>> {
  const result = new Set<string>();
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
    const hand = await engine.analyzeHandStructure(request);
    const wait = hand.waits.find((row) => row.tile34 === tileIdTo34(window.offeredTile.id));
    if (wait?.baseRonEligibility !== "eligible") continue;
    const furiten = await deriveResponseFuriten(stream, decision.decisionEventRef, engine);
    if (furiten.temporary.status === "clear" && furiten.riichi.status === "clear") {
      result.add(decision.decisionEventRef);
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
    const consumed = sortTilesCanonical(decision.snapshot.privateState.concealedTiles.filter((tile) => tile.id === window.offeredTile.id).slice(0, 2)) as [Tile, Tile];
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

function projectEvent(stream: CanonicalEventStream, event: CanonicalEventStream["events"][number]): Record<string, unknown> | null {
  switch (event.type) {
    case "game_started": return { type: "start_game", names: ["p0", "p1", "p2", "p3"] };
    case "round_started": {
      const tehais = Array.from({ length: 4 }, (_, actor) => actor === stream.selfActor ? event.selfHand.map(formatMjaiTile) : Array(13).fill("?"));
      return { type: "start_kyoku", bakaze: event.roundWind, kyoku: event.hand, honba: event.honba, kyotaku: event.riichiSticks, oya: event.dealer, scores: event.scores, dora_marker: formatMjaiTile(event.doraIndicator), tehais };
    }
    case "tile_drawn": return { type: "tsumo", actor: event.actor, pai: event.tile.visibility === "visible" ? formatMjaiTile(event.tile.tile) : "?" };
    case "tile_discarded": return { type: "dahai", actor: event.actor, pai: formatMjaiTile(event.tile), tsumogiri: event.discardMode === "tsumogiri" };
    case "riichi_declared": return { type: "reach", actor: event.actor };
    case "riichi_accepted": return { type: "reach_accepted", actor: event.actor };
    case "chi_called":
    case "pon_called": return { type: event.type === "chi_called" ? "chi" : "pon", actor: event.actor, target: event.targetActor, pai: formatMjaiTile(event.calledTile), consumed: event.consumedTiles.map(formatMjaiTile) };
    case "daiminkan_called": return { type: "daiminkan", actor: event.actor, target: event.targetActor, pai: formatMjaiTile(event.calledTile), consumed: event.consumedTiles.map(formatMjaiTile) };
    case "ankan_declared": return { type: "ankan", actor: event.actor, consumed: event.tiles.map(formatMjaiTile) };
    case "kakan_declared": {
      const pon = stream.events.find((row) => row.eventId === event.upgradedPonEventRef);
      if (pon?.type !== "pon_called") throw new Error("mortal_protocol_invalid");
      return {
        type: "kakan", actor: event.actor, pai: formatMjaiTile(event.addedTile),
        consumed: [pon.calledTile, ...pon.consumedTiles].map(formatMjaiTile),
      };
    }
    case "dora_revealed": return { type: "dora", dora_marker: formatMjaiTile(event.indicator) };
    case "round_ended": return { type: "end_kyoku" };
    case "game_ended": return { type: "end_game" };
    default: return null;
  }
}

export function projectLocalMortalRequest(input: {
  stream: CanonicalEventStream;
  decision: ReplayedDecision;
  surface: "self" | "response";
  identity: ManagedMortalRuntimeIdentity;
  includeDeclareRiichi?: boolean;
  includeTsumo?: boolean;
  includeRon?: boolean;
}): LocalMortalInferenceRequest {
  const candidates = input.surface === "response"
    ? responseCandidates(input.decision, input.includeRon ?? false)
    : selfCandidates(input.decision, input.includeDeclareRiichi ?? false, input.includeTsumo ?? false);
  const trigger = input.decision.decisionEventRef;
  const events = [];
  for (const event of input.stream.events) {
    const projected = projectEvent(input.stream, event);
    if (projected !== null) events.push({ eventRef: event.eventId, json: JSON.stringify(projected), canAct: event.eventId === trigger });
    if (event.eventId === trigger) break;
  }
  const actual = input.decision.actualAction;
  if (actual === null) throw new Error("mortal_actual_action_mismatch");
  const actualActionRef = canonicalActionRef(actual);
  if (candidates.filter((candidate) => candidate.actionRef === actualActionRef).length !== 1) {
    throw new Error("mortal_actual_action_mismatch");
  }
  return LocalMortalInferenceRequestSchema.parse({
    protocolVersion: input.identity.protocolVersion,
    requestId: `local-mortal:${createHash("sha256").update(`${input.stream.gameId}:${trigger}`).digest("hex")}`,
    identity: input.identity,
    recordId: input.stream.gameId,
    canonicalStreamIdentity: computeCanonicalGameFingerprint(input.stream),
    decision: { decisionId: trigger, surface: input.surface, windowKind: input.decision.snapshot.privateState.decisionWindow.kind, triggerEventRef: trigger, selfActor: input.stream.selfActor },
    events,
    candidates,
    actualActionRef,
  });
}

function stableSoftmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

function localFuuros(decision: ReplayedDecision): MortalReportFuuro[] {
  return decision.snapshot.privateState.selfMeldRefs.map((ref) => {
    const meld = decision.snapshot.publicState.melds.find((row) => row.meldRef === ref)!;
    const tiles = meld.kind === "ankan" ? meld.tiles : meld.kind === "kakan" ? [meld.calledTile, ...meld.consumedTiles, meld.addedTile] : [meld.calledTile, ...meld.consumedTiles];
    return { kind: meld.kind, tiles };
  });
}

export function localMortalResponseToReportEntry(input: {
  request: LocalMortalInferenceRequest;
  response: LocalMortalInferenceSuccess;
  decision: ReplayedDecision;
}): MortalReportDecisionEntry {
  const candidateByKey = new Map(input.request.candidates.map((row) => [JSON.stringify(row.runtimeAction), row]));
  const probs = stableSoftmax(input.response.candidates.map((row) => row.qValue));
  const details: MortalReportCandidate[] = input.response.candidates.map((row, index) => {
    const candidate = candidateByKey.get(JSON.stringify(row.runtimeAction));
    if (candidate === undefined) throw new Error("mortal_candidate_mismatch");
    return { action: JSON.parse(candidate.mjaiActionJson) as MortalSourceAction, probability: probs[index]!, qValue: row.qValue };
  });
  const snapshot = input.decision.snapshot;
  const state = snapshot.privateState;
  const window = state.decisionWindow;
  const actual = input.decision.actualAction;
  if (actual === null) throw new Error("mortal_actual_action_mismatch");
  const preferred = candidateByKey.get(JSON.stringify(input.response.preferredRuntimeAction));
  if (preferred === undefined) throw new Error("mortal_candidate_mismatch");
  const expected = JSON.parse(preferred.mjaiActionJson) as MortalSourceAction;
  const actualProjected = mjaiAction(actual, snapshot.selfActor);
  const triggerTile = window.kind === "discard_response" || window.kind === "kan_response"
    ? window.offeredTile
    : state.currentDraw?.tile ?? (actual.kind === "discard" || actual.kind === "riichi_discard" ? actual.tile : undefined);
  if (triggerTile === undefined) throw new Error("mortal_actual_action_mismatch");
  const hand = [...state.concealedTiles, ...(window.kind === "self_turn" && state.currentDraw !== null ? [state.currentDraw.tile] : [])];
  return {
    roundOrdinal: snapshot.publicState.roundOrdinal,
    roundWind: snapshot.publicState.roundWind,
    dealer: snapshot.publicState.dealer,
    kyoku: snapshot.publicState.hand - 1,
    honba: snapshot.publicState.honba,
    junme: snapshot.publicState.rivers[snapshot.selfActor]!.length + 1,
    tilesLeft: snapshot.publicState.remainingDraws ?? 0,
    lastActor: window.kind === "discard_response" || window.kind === "kan_response" ? window.sourceActor! : snapshot.selfActor,
    tile: formatMjaiTile(triggerTile),
    tehai: hand.map(formatMjaiTile),
    fuuros: localFuuros(input.decision),
    atSelfChiPon: window.kind === "post_call_discard",
    atSelfRiichi: window.kind === "post_riichi_discard" || snapshot.publicState.riichiStates[snapshot.selfActor]!.status !== "none",
    atOpponentKakan: window.kind === "kan_response",
    expected,
    actual: actualProjected,
    isEqual: JSON.stringify(expected) === JSON.stringify(actualProjected),
    details,
    shanten: 0,
    atFuriten: false,
    actualIndex: (() => {
      const index = details.findIndex((row) => JSON.stringify(row.action) === JSON.stringify(actualProjected));
      if (index < 0) throw new Error("mortal_actual_action_mismatch");
      return index;
    })(),
  };
}
