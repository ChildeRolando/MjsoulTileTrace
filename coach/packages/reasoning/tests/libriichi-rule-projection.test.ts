import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  LIBRIICHI_RULE_NORMALIZATION_VERSION, LibriichiRuleResponseSchema, libriichiRuleCanonicalJson,
  type LibriichiRuleIdentity, type LibriichiRuleRequest, type CanonicalEventStream,
} from "@riichi-coach/contracts";
import { createLibriichiRuleProjector, bindLibriichiRuleResult } from "../src/analysis/libriichi-rule-projection.js";
import { replayCanonicalStream } from "../src/replay/stream-replayer.js";
import { canonicalSelfDrawDiscardEvents, canonicalStream } from "./fixtures/canonical-stream.js";
import { actualLibriichiActionRef } from "../src/analysis/local-mortal-rule-scoring.js";

const digest = (value: unknown) => createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");
const identity: LibriichiRuleIdentity = {
  implementation: "Equim-chan/Mortal/libriichi", revision: "0".repeat(40), nativeArtifactSha256: "1".repeat(64),
  wrapperSha256: "2".repeat(64), normalizationVersion: LIBRIICHI_RULE_NORMALIZATION_VERSION,
};
function fixture(stream = canonicalStream(canonicalSelfDrawDiscardEvents())) {
  const decision = replayCanonicalStream(stream)[0]!;
  return { stream, decision, request: createLibriichiRuleProjector(stream, identity)(decision) };
}
function result(request: LibriichiRuleRequest, actions = [
  { runtimeAction: { index: 0, variant: null }, mjaiActionJson: '{"type":"dahai","actor":0,"pai":"1m","tsumogiri":false}' },
  { runtimeAction: { index: 1, variant: null }, mjaiActionJson: '{"type":"dahai","actor":0,"pai":"2m","tsumogiri":false}' },
]) {
  const content = { protocolVersion: request.protocolVersion, requestId: request.requestId, identity: request.identity,
    status: "ok", actions };
  return LibriichiRuleResponseSchema.parse({ ...content, resultId: digest(content) });
}

describe("single-source libriichi input and representation boundary", () => {
  it.each(["valid", "other-tile", "duplicate", "wrong-actor", "missing-copy"])("validates native physical aliases: %s", variant => {
    const stream = canonicalStream(canonicalSelfDrawDiscardEvents());
    const draw = stream.events[2]!;
    if(draw.type !== "tile_drawn") throw new Error("fixture");
    draw.tile = {visibility:"visible",tile:{id:variant === "missing-copy" ? "5p" : "1m",red:false}};
    const discard = stream.events[3]!;
    if(discard.type !== "tile_discarded") throw new Error("fixture");
    discard.tile = {...draw.tile.tile};
    const {request,decision} = fixture(stream);
    const pai = variant === "missing-copy" ? "5p" : "1m";
    const primary = {type:"dahai",actor:0,pai,tsumogiri:true};
    const alias = {...primary,tsumogiri:variant === "duplicate",pai:variant === "other-tile" ? "2m" : pai,
      actor:variant === "wrong-actor" ? 1 : 0};
    const content = {protocolVersion:request.protocolVersion,requestId:request.requestId,identity:request.identity,status:"ok" as const,
      actions:[{runtimeAction:{index:variant === "missing-copy" ? 13 : 0,variant:null},mjaiActionJson:JSON.stringify(primary),physicalAliases:[JSON.stringify(alias)]}]};
    const response = {...content,resultId:digest(content)};
    if(variant !== "valid") {
      expect(()=>bindLibriichiRuleResult({request,response,decision})).toThrow("rules_action_mapping_invalid");
      return;
    }
    const {actions} = bindLibriichiRuleResult({request,response,decision});
    expect(actions).toHaveLength(1);
    expect(actions[0]!.physicalRealizations.map(item=>item.action)).toEqual([
      {kind:"discard",tile:{id:"1m",red:false},discardMode:"tsumogiri"},
      {kind:"discard",tile:{id:"1m",red:false},discardMode:"tedashi"},
    ]);
    for(const discardMode of ["tedashi","tsumogiri"] as const) {
      expect(actualLibriichiActionRef({actualAction:{kind:"discard",tile:{id:"1m",red:false},discardMode}},actions)).toBe(actions[0]!.actionRef);
    }
  });

  it("binds the full input, prefix, profile, phase, native and wrapper without a checkpoint", () => {
    const { request, decision } = fixture();
    expect(request).not.toHaveProperty("actualActionRef");
    expect(JSON.stringify(request)).not.toMatch(/checkpoint|qValue|probability/);
    expect(request.events.at(-1)!.eventRef).toBe(decision.decisionEventRef);
    expect(request.events.map(row => JSON.parse(row.json).type)).toEqual(["start_game", "start_kyoku", "tsumo"]);
    const changedChoice = { ...structuredClone(decision), actualAction: {
      kind: "discard" as const, tile: { id: "1m" as const, red: false }, discardMode: "tedashi" as const,
    } };
    expect(createLibriichiRuleProjector(fixture().stream, identity)(changedChoice)).toEqual(request);
    const changedHand = fixture().stream;
    const start = changedHand.events[1]!;
    if (start.type !== "round_started") throw new Error("fixture");
    start.selfHand[0] = { id: "9p", red: false };
    expect(fixture(changedHand).request.requestId).not.toBe(request.requestId);
  });

  it.each(["eventSequence", "melds", "remainingDraws", "responseOpportunities", "rivers"] as const)(
    "R14 rejects incomplete %s without querying or proving a singleton", field => {
      const stream = canonicalStream(canonicalSelfDrawDiscardEvents());
      stream.completeness[field] = "partial";
      const decisions = replayCanonicalStream(stream);
      expect(() => createLibriichiRuleProjector(stream, identity)(decisions[0]!)).toThrow("rules_input_incomplete");
    });

  it("rejects forged snapshot evidence instead of trusting a complete stream label", () => {
    const { stream, decision } = fixture();
    const changed = structuredClone(decision);
    changed.snapshot.publicState.remainingDraws = 1;
    expect(() => createLibriichiRuleProjector(stream, identity)(changed)).toThrow("rules_input_incomplete");
  });

  it("maps each native action independently of what was actually chosen", () => {
    const { request, decision } = fixture();
    const response = result(request);
    const bound = bindLibriichiRuleResult({ request, response, decision });
    expect(bound.actions.map(row => row.action)).toEqual([
      { kind: "discard", tile: { id: "1m", red: false }, discardMode: "tedashi" },
      { kind: "discard", tile: { id: "2m", red: false }, discardMode: "tedashi" },
    ]);
    const other = { ...structuredClone(decision), actualAction: null };
    expect(bindLibriichiRuleResult({ request, response, decision: other })).toEqual(bound);
  });

  it("R14 rejects action/index swaps even after a fresh result hash", () => {
    const { request, decision } = fixture();
    const response = result(request);
    if (response.status !== "ok") throw new Error("fixture");
    [response.actions[0]!.mjaiActionJson, response.actions[1]!.mjaiActionJson] =
      [response.actions[1]!.mjaiActionJson, response.actions[0]!.mjaiActionJson];
    const { resultId: _old, ...content } = response;
    response.resultId = digest(content);
    expect(() => bindLibriichiRuleResult({ request, response, decision })).toThrow("rules_action_mapping_invalid");
  });

  it.each(["wrong-request", "duplicate", "missing-physical-tile"])("rejects %s", mutation => {
    const { request, decision } = fixture();
    const response = result(request);
    if (response.status !== "ok") throw new Error("fixture");
    if (mutation === "wrong-request") response.requestId = "f".repeat(64);
    if (mutation === "duplicate") response.actions.push(response.actions[0]!);
    if (mutation === "missing-physical-tile") response.actions[0] = {
      runtimeAction: { index: 26, variant: null }, mjaiActionJson: '{"type":"dahai","actor":0,"pai":"9s","tsumogiri":false}',
    };
    const { resultId: _old, ...content } = response;
    response.resultId = digest(content);
    expect(() => bindLibriichiRuleResult({ request, response, decision })).toThrow(/rules_(protocol|action_mapping)_invalid/);
  });
});
