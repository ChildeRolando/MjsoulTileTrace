import { describe, expect, it } from "vitest";
import {
  DecisionWindowSchema,
  RiichiActionSchema,
  actionWindowConflictCodes,
  type RiichiAction,
} from "../src/index.js";

const tile = (id: "1m" | "2m" | "3m" | "5p" | "7z", red = false) => ({
  id,
  red,
});

const actions: RiichiAction[] = [
  { kind: "discard", tile: tile("5p"), discardMode: "tedashi" },
  {
    kind: "riichi_discard",
    tile: tile("5p", true),
    discardMode: "tsumogiri",
  },
  {
    kind: "chi",
    calledTile: tile("2m"),
    consumedTiles: [tile("1m"), tile("3m")],
    targetActor: 1,
    responseEventRef: "event:discard",
  },
  {
    kind: "pon",
    calledTile: tile("5p"),
    consumedTiles: [tile("5p"), tile("5p", true)],
    targetActor: 1,
    responseEventRef: "event:discard",
  },
  {
    kind: "daiminkan",
    calledTile: tile("5p"),
    consumedTiles: [tile("5p"), tile("5p"), tile("5p", true)],
    targetActor: 1,
    responseEventRef: "event:discard",
  },
  {
    kind: "ankan",
    tiles: [
      tile("5p"),
      tile("5p"),
      tile("5p"),
      tile("5p", true),
    ],
  },
  {
    kind: "kakan",
    addedTile: tile("5p", true),
    existingMeldRef: "meld:pon:5p",
  },
  {
    kind: "tsumo",
    winningTile: tile("5p", true),
    drawEventRef: "event:draw",
  },
  {
    kind: "ron",
    winningTile: tile("5p"),
    targetActor: 1,
    responseEventRef: "event:discard",
    winContext: "discard",
  },
  {
    kind: "kyuushu_kyuuhai",
    drawEventRef: "event:draw",
  },
  {
    kind: "pass",
    responseEventRef: "event:discard",
    responseKind: "discard",
  },
];

describe("structured riichi actions", () => {
  it("round-trips all eleven action variants", () => {
    expect(actions.map((action) =>
      RiichiActionSchema.parse(JSON.parse(JSON.stringify(action))).kind
    )).toEqual([
      "discard",
      "riichi_discard",
      "chi",
      "pon",
      "daiminkan",
      "ankan",
      "kakan",
      "tsumo",
      "ron",
      "kyuushu_kyuuhai",
      "pass",
    ]);
  });

  it("rejects undeclared fields at both action and tile boundaries", () => {
    expect(() => RiichiActionSchema.parse({
      kind: "discard",
      tile: { id: "5p", red: false, hiddenOwner: 2 },
      discardMode: "tedashi",
    })).toThrow();
    expect(() => RiichiActionSchema.parse({
      kind: "discard",
      tile: tile("5p"),
      discardMode: "tedashi",
      modelReason: "defense",
    })).toThrow();
  });

  it("rejects malformed chi, pon, daiminkan, ankan, and kakan identities", () => {
    expect(() => RiichiActionSchema.parse({
      kind: "chi",
      calledTile: tile("2m"),
      consumedTiles: [tile("2m"), tile("3m")],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toThrow(/consecutive/);
    expect(() => RiichiActionSchema.parse({
      kind: "pon",
      calledTile: tile("5p"),
      consumedTiles: [tile("5p"), tile("7z")],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toThrow(/same tile ID/);
    expect(() => RiichiActionSchema.parse({
      kind: "daiminkan",
      calledTile: tile("5p"),
      consumedTiles: [tile("5p"), tile("5p"), tile("7z")],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toThrow(/same tile ID/);
    expect(() => RiichiActionSchema.parse({
      kind: "ankan",
      tiles: [tile("5p"), tile("5p"), tile("5p"), tile("7z")],
    })).toThrow(/same tile ID/);
    expect(() => RiichiActionSchema.parse({
      kind: "kakan",
      addedTile: tile("5p"),
      existingMeldRef: "",
    })).toThrow();
  });

  it("requires canonical tile order for consumed call tiles", () => {
    expect(() => RiichiActionSchema.parse({
      kind: "chi",
      calledTile: tile("2m"),
      consumedTiles: [tile("3m"), tile("1m")],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toThrow(/canonical tile order/);
    expect(() => RiichiActionSchema.parse({
      kind: "pon",
      calledTile: tile("5p"),
      consumedTiles: [tile("5p", true), tile("5p")],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toThrow(/canonical tile order/);
  });
});

describe("decision windows", () => {
  it("parses all four strict window variants", () => {
    expect([
      DecisionWindowSchema.parse({
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "event:draw",
      }),
      DecisionWindowSchema.parse({
        kind: "discard_response",
        actor: 0,
        triggerEventRef: "event:discard",
        sourceActor: 1,
        offeredTile: tile("5p"),
      }),
      DecisionWindowSchema.parse({
        kind: "kan_response",
        actor: null,
        triggerEventRef: "event:kakan",
        sourceActor: null,
        offeredTile: tile("5p", true),
        kanKind: "kakan",
      }),
      DecisionWindowSchema.parse({
        kind: "post_call_discard",
        actor: 0,
        triggerEventRef: "event:chi",
      }),
    ].map((window) => window.kind)).toEqual([
      "self_turn",
      "discard_response",
      "kan_response",
      "post_call_discard",
    ]);
  });

  it("enforces the action/window matrix and response binding", () => {
    const discardResponse = DecisionWindowSchema.parse({
      kind: "discard_response",
      actor: 0,
      triggerEventRef: "event:discard",
      sourceActor: 1,
      offeredTile: tile("2m"),
    });
    const postCall = DecisionWindowSchema.parse({
      kind: "post_call_discard",
      actor: 0,
      triggerEventRef: "event:chi",
    });

    expect(actionWindowConflictCodes(actions[2]!, discardResponse)).toEqual([]);
    expect(actionWindowConflictCodes(actions[7]!, discardResponse)).toContain(
      "action_not_allowed_in_window",
    );
    expect(actionWindowConflictCodes(actions[2]!, postCall)).toContain(
      "action_not_allowed_in_window",
    );
    expect(actionWindowConflictCodes(
      { kind: "discard", tile: tile("5p"), discardMode: "tsumogiri" },
      postCall,
    )).toContain("post_call_discard_requires_tedashi");
    expect(actionWindowConflictCodes(
      {
        kind: "pass",
        responseEventRef: "event:other",
        responseKind: "kakan",
      },
      discardResponse,
    )).toEqual([
      "response_event_mismatch",
      "response_kind_mismatch",
    ]);
    expect(actionWindowConflictCodes(
      {
        kind: "chi",
        calledTile: tile("3m"),
        consumedTiles: [tile("1m"), tile("2m")],
        targetActor: 2,
        responseEventRef: "event:discard",
      },
      discardResponse,
    )).toEqual([
      "response_source_actor_mismatch",
      "response_tile_mismatch",
    ]);
  });

  it("rejects self-target responses even when the source actor is unknown", () => {
    const responseWindow = DecisionWindowSchema.parse({
      kind: "discard_response",
      actor: 0,
      triggerEventRef: "event:discard",
      sourceActor: null,
      offeredTile: tile("2m"),
    });

    expect(actionWindowConflictCodes(
      {
        kind: "pon",
        calledTile: tile("2m"),
        consumedTiles: [tile("2m"), tile("2m")],
        targetActor: 0,
        responseEventRef: "event:discard",
      },
      responseWindow,
    )).toContain("response_target_self");
  });

  it("rejects response windows whose actor is also the known source", () => {
    expect(() => DecisionWindowSchema.parse({
      kind: "discard_response",
      actor: 0,
      triggerEventRef: "event:discard",
      sourceActor: 0,
      offeredTile: tile("2m"),
    })).toThrow(/Response window actor cannot equal source actor/);
    expect(() => DecisionWindowSchema.parse({
      kind: "kan_response",
      actor: 2,
      triggerEventRef: "event:kakan",
      sourceActor: 2,
      offeredTile: tile("5p"),
      kanKind: "kakan",
    })).toThrow(/Response window actor cannot equal source actor/);
  });
});
