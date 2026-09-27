import { createHash } from "node:crypto";
import {
  LIBRIICHI_RULE_PROTOCOL_VERSION,
  LibriichiRuleRequestSchema,
  LibriichiRuleResponseSchema,
  libriichiRuleCanonicalJson,
  canonicalActionRef,
  type CanonicalEventStream,
  type LibriichiRuleIdentity,
  type LibriichiRuleRequest,
  type LibriichiRuleResponse,
  type LibriichiRuleSuccess,
  type RiichiAction,
  type KnownActionFacts,
} from "@riichi-coach/contracts";
import { parseMjaiTile } from "@riichi-coach/mortal-source";
import { freezeDecisionSnapshotInContext, freezeDecisionStreamContext } from "../replay/decision-snapshot.js";
import type { ReplayedDecision } from "../replay/stream-replayer.js";
import { projectLocalMortalEvent } from "./local-mortal-events.js";
import { adaptMjaiActionSequence } from "../import/mjai-action.js";
import { normalizeCandidate } from "../candidate/candidate-normalizer.js";
import { tileIdTo34 } from "../factors/tile34.js";
import { projectKnownGameFactsV2 } from "../factors/known-game-facts-v2.js";

const digest = (value: unknown): string => createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");

/** Freeze one canonical stream once; no report, actual choice, helper or model input. */
export function createLibriichiRuleProjector(rawStream: CanonicalEventStream, identity: LibriichiRuleIdentity) {
  const context = freezeDecisionStreamContext(rawStream);
  const stream = context.stream;
  // Unlike the public report fingerprint this includes private draws, rules,
  // completeness and every canonical field that can affect rule execution.
  const canonicalStreamIdentity = `sha256:${digest(stream)}`;
  return (decision: ReplayedDecision): LibriichiRuleRequest => {
    const snapshot = decision.snapshot;
    const window = snapshot.privateState.decisionWindow;
    const fresh = freezeDecisionSnapshotInContext(context, window);
    if (libriichiRuleCanonicalJson(snapshot) !== libriichiRuleCanonicalJson(fresh) ||
        decision.decisionEventRef !== fresh.decisionEventRef) throw new Error("rules_input_incomplete");
    const freshFacts = projectKnownGameFactsV2({stream,decisionWindow:window,cachedSnapshot:fresh,streamContext:context});
    if (libriichiRuleCanonicalJson(decision.facts) !== libriichiRuleCanonicalJson(freshFacts)) throw new Error("rules_input_incomplete");
    const requiredStreamFields = ["eventSequence", "scores", "doraIndicators", "rivers", "calledDiscardMarkers", "melds", "remainingDraws", "responseOpportunities"] as const;
    const requiredPublicFields = ["roundContext", "scores", "doraIndicators", "rivers", "calledDiscardMarkers", "melds", "remainingDraws"] as const;
    if (requiredStreamFields.some(field => stream.completeness[field] !== "complete") ||
        requiredPublicFields.some(field => fresh.publicState.fields[field] !== "complete") ||
        fresh.privateState.fields.concealedTiles !== "complete" ||
        fresh.privateState.fields.currentDraw !== "complete" ||
        fresh.privateState.fields.responseOpportunities !== "complete" ||
        fresh.publicState.remainingDraws === null) throw new Error("rules_input_incomplete");
    const triggerIndex = stream.events.findIndex(event => event.eventId === decision.decisionEventRef);
    if (triggerIndex < 0) throw new Error("rules_input_incomplete");
    const prefix = stream.events.slice(0, triggerIndex + 1);
    const roundStart = prefix.findLast(event => event.type === "round_started");
    if (roundStart?.type !== "round_started" || roundStart.remainingDraws !== 70) {
      // Native starts from a full wall. A mid-round snapshot is not a replay.
      throw new Error("rules_input_incomplete");
    }
    const events = prefix.flatMap(event => {
      const projected = projectLocalMortalEvent(stream, event);
      return projected === null ? [] : [{ eventRef: event.eventId, json: libriichiRuleCanonicalJson(projected) }];
    });
    if (events.at(-1)?.eventRef !== window.triggerEventRef) throw new Error("rules_input_incomplete");
    const content = {
      protocolVersion: LIBRIICHI_RULE_PROTOCOL_VERSION, operation: "legal_actions" as const,
      identity, canonicalStreamIdentity, eventPrefixSha256: digest(events),
      decision: { decisionId: decision.decisionEventRef,
        surface: window.kind === "discard_response" || window.kind === "kan_response" ? "response" : "self",
        windowKind: window.kind, triggerEventRef: window.triggerEventRef, selfActor: fresh.selfActor,
        roundOrdinal: fresh.publicState.roundOrdinal, riichiPhase: fresh.publicState.riichiStates[fresh.selfActor]!.status },
      ruleSet: stream.ruleSet, events,
    };
    return LibriichiRuleRequestSchema.parse({ ...content, requestId: digest(content) });
  };
}

export type LibriichiBoundAction = LibriichiRuleSuccess["actions"][number] & {
  action: RiichiAction;
  actionRef: string;
};

function actionFacts(decision: ReplayedDecision): KnownActionFacts {
  const { privateState, publicState } = decision.snapshot;
  return {
    decisionWindow: privateState.decisionWindow,
    concealedTiles: privateState.concealedTiles,
    currentDraw: privateState.currentDraw === null ? null : {
      tile: privateState.currentDraw.tile, eventRef: privateState.currentDraw.eventRef,
    },
    melds: publicState.melds.map(meld => ({
      meldRef: meld.meldRef, kind: meld.kind, actor: meld.actor,
      tiles: meld.kind === "ankan" ? meld.tiles : meld.kind === "kakan"
        ? [meld.calledTile, ...meld.consumedTiles, meld.addedTile] : [meld.calledTile, ...meld.consumedTiles],
    })),
  };
}

/** Encoding correspondence only. No shape/wait/yaku eligibility inference. */
function encodedIndex(action: RiichiAction): number {
  switch (action.kind) {
    case "discard": return action.tile.red ? 34 + "mps".indexOf(action.tile.id[1]!) : tileIdTo34(action.tile.id);
    case "declare_riichi": return 37;
    case "chi": {
      const rank = Number(action.calledTile.id[0]);
      const ranks = action.consumedTiles.map(tile => Number(tile.id[0]));
      return Math.min(...ranks) > rank ? 38 : Math.max(...ranks) > rank ? 39 : 40;
    }
    case "pon": return 41;
    case "ankan": case "kakan": case "daiminkan": return 42;
    case "ron": case "tsumo": return 43;
    case "kyuushu_kyuuhai": return 44;
    case "pass": return 45;
    case "riichi_discard": throw new Error("rules_protocol_invalid");
  }
}

/** Validate and convert the one native result; it never adds candidates. */
export function bindLibriichiRuleResult(input: {
  request: LibriichiRuleRequest;
  response: LibriichiRuleResponse;
  decision: ReplayedDecision;
}): { response: LibriichiRuleResponse; actions: readonly LibriichiBoundAction[] } {
  const {request,response} = validateLibriichiRuleBinding(input.request,input.response);
  const snapshot = input.decision.snapshot;
  if (request.decision.triggerEventRef !== input.decision.decisionEventRef ||
      request.decision.selfActor !== snapshot.selfActor || request.decision.roundOrdinal !== snapshot.publicState.roundOrdinal ||
      request.decision.windowKind !== snapshot.privateState.decisionWindow.kind ||
      request.decision.riichiPhase !== snapshot.publicState.riichiStates[snapshot.selfActor]!.status) {
    throw new Error("rules_protocol_invalid");
  }
  return {response,actions:response.status === "ok" ? normalizeLibriichiRuleActions(request,response,actionFacts(input.decision)) : []};
}

/** Transport/provenance verification, also used when reading a saved v2 package.
 * This verifies recorded evidence; it does not re-run or independently prove rules. */
export function validateLibriichiRuleBinding(rawRequest: LibriichiRuleRequest, rawResponse: LibriichiRuleResponse) {
  const request = LibriichiRuleRequestSchema.parse(rawRequest);
  const response = LibriichiRuleResponseSchema.parse(rawResponse);
  const {requestId,...content} = request;
  if (requestId !== digest(content) || response.requestId !== requestId ||
      request.eventPrefixSha256 !== digest(request.events) ||
      request.events.at(-1)?.eventRef !== request.decision.triggerEventRef ||
      request.decision.decisionId !== request.decision.triggerEventRef ||
      (request.decision.surface === "response") !== ["discard_response","kan_response"].includes(request.decision.windowKind)) {
    throw new Error("rules_protocol_invalid");
  }
  if (response.status === "error") return {request,response};
  const { resultId, ...resultContent } = response;
  if (resultId !== digest(resultContent) || libriichiRuleCanonicalJson(response.identity) !== libriichiRuleCanonicalJson(request.identity)) {
    throw new Error("rules_protocol_invalid");
  }
  if (response.status === "non_action") {
    if (request.decision.surface !== "response") throw new Error("rules_protocol_invalid");
  }
  return {request,response};
}

/** The same physical-action normalization for live and saved native results. */
export function normalizeLibriichiRuleActions(request: LibriichiRuleRequest, response: LibriichiRuleSuccess, facts: KnownActionFacts): readonly LibriichiBoundAction[] {
  const kanCount = response.actions.filter(row => row.runtimeAction.index === 42).length;
  const actions = response.actions.map(row => {
    const mjai = JSON.parse(row.mjaiActionJson) as { type: string; pai?: string };
    const added = mjai.type === "kakan" ? parseMjaiTile(mjai.pai) : null;
    const pons = added === null ? [] : facts.melds!.filter(meld => meld.actor === request.decision.selfActor && meld.kind === "pon" && meld.tiles.every(tile => tile.id === added.id));
    const adapted = adaptMjaiActionSequence([{ eventRef: request.decision.triggerEventRef, action: mjai }], {
      decisionWindow: facts.decisionWindow,
      ...(pons.length === 1 ? { existingMeldRef: pons[0]!.meldRef } : {}),
      ...(facts.currentDraw ? { currentDrawTile: facts.currentDraw.tile } : {}),
    });
    if (adapted.status !== "ready") throw new Error("rules_action_mapping_invalid");
    // The existing normalizer validates physical holdings and window identity.
    // Its model-candidate representation also represents tile-less reach;
    // only the action is retained here, not a model origin or any model score.
    const normalized = normalizeCandidate({ draft: adapted.draft, origin: "model", facts });
    if (normalized.status !== "ready") throw new Error("rules_action_mapping_invalid");
    const action = normalized.candidate.action;
    const variant = kanCount > 1 && (action.kind === "ankan" || action.kind === "kakan")
      ? `kan:${tileIdTo34(action.kind === "ankan" ? action.tiles[0].id : action.addedTile.id)}` : null;
    if (row.runtimeAction.index !== encodedIndex(action) || row.runtimeAction.variant !== variant) {
      throw new Error("rules_action_mapping_invalid");
    }
    return { ...row, action, actionRef: canonicalActionRef(action) };
  });
  if (new Set(actions.map(row => row.actionRef)).size !== actions.length ||
      new Set(actions.map(row => libriichiRuleCanonicalJson(row.runtimeAction))).size !== actions.length) {
    throw new Error("rules_action_mapping_invalid");
  }
  return actions;
}
