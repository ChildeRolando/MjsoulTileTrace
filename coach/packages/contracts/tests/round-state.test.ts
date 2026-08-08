import { describe, expect, it } from "vitest";
import {
  DecisionPrivateStateSchema,
  DecisionSnapshotV2Schema,
  PublicRoundStateSchema,
  SelfPrivateRoundStateSchema,
} from "../src/index.js";

const tile = (id:
  | "1m" | "2m" | "3m" | "4m" | "5m" | "6m" | "7m" | "8m" | "9m"
  | "1p" | "2p" | "3p" | "4p") => ({ id, red: false });

const concealedTiles = [
  tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
  tile("6m"), tile("7m"), tile("8m"), tile("9m"), tile("1p"),
  tile("2p"), tile("3p"), tile("4p"),
];

const rules = {
  length: "south" as const,
  redFives: { man: 1, pin: 1, sou: 1 },
  openTanyao: true,
  atamahane: false,
  westExtension: "sudden_death" as const,
  ippatsuCancelledByAnkan: true,
};

const completeness = {
  roundContext: "complete" as const,
  ruleSet: "complete" as const,
  scores: "complete" as const,
  doraIndicators: "complete" as const,
  rivers: "complete" as const,
  calledDiscardMarkers: "complete" as const,
  melds: "complete" as const,
  remainingDraws: "complete" as const,
  settlement: "unknown" as const,
};

function publicState() {
  return {
    gameId: "game:fixture",
    streamSchemaVersion: "canonical-riichi-events/v2" as const,
    ruleSet: rules,
    roundOrdinal: 0,
    roundWind: "E" as const,
    hand: 1,
    honba: 0,
    riichiSticks: 0,
    dealer: 0,
    scores: [25000, 25000, 25000, 25000],
    seatWinds: ["E", "S", "W", "N"] as const,
    phase: "awaiting_self_action" as const,
    expectedActor: 0,
    doraIndicators: [tile("1m")],
    rivers: [[], [], [], []],
    melds: [],
    riichiStates: [0, 1, 2, 3].map((actor) => ({
      actor,
      status: "none" as const,
      declarationEventRef: null,
      acceptanceEventRef: null,
      ippatsuAlive: false,
    })),
    remainingDraws: 69,
    terminal: null,
    fields: completeness,
    appliedEventRefs: [
      "game:fixture/0/0/0",
      "game:fixture/0/1/0",
      "game:fixture/0/2/0",
    ],
  };
}

function privateState() {
  return {
    selfActor: 0,
    concealedTiles,
    currentDraw: {
      tile: tile("5m"),
      eventRef: "game:fixture/0/2/0",
      from: "live_wall" as const,
    },
    selfMeldRefs: [],
    decisionWindow: {
      kind: "self_turn" as const,
      actor: 0,
      triggerEventRef: "game:fixture/0/2/0",
    },
    furiten: {
      discard: { status: "unknown" as const, evidenceIds: [] },
      temporary: { status: "unknown" as const, evidenceIds: [] },
      riichi: { status: "unknown" as const, evidenceIds: [] },
    },
    fields: {
      concealedTiles: "complete" as const,
      currentDraw: "complete" as const,
      responseOpportunities: "unknown" as const,
      furiten: "unknown" as const,
    },
    evidenceIds: ["game:fixture/0/1/0", "game:fixture/0/2/0"],
  };
}

function snapshot() {
  return {
    snapshotVersion: "decision-snapshot/v2" as const,
    gameId: "game:fixture",
    streamHash: "sha256:stream",
    streamPrefixHash: "sha256:prefix",
    decisionEventRef: "game:fixture/0/2/0",
    selfActor: 0,
    publicState: publicState(),
    privateState: privateState(),
    evidenceIds: [
      "game:fixture/0/0/0",
      "game:fixture/0/1/0",
      "game:fixture/0/2/0",
    ],
  };
}

describe("canonical round state", () => {
  it("keeps public and self-private state structurally separate", () => {
    const publicParsed = PublicRoundStateSchema.parse(publicState());
    const privateParsed = DecisionPrivateStateSchema.parse(privateState());

    expect(publicParsed.rivers).toHaveLength(4);
    expect(privateParsed.selfActor).toBe(0);
    expect(JSON.stringify(publicParsed)).not.toContain("concealedTiles");
  });

  it("binds a snapshot to nonempty stream hashes and its decision window", () => {
    expect(DecisionSnapshotV2Schema.parse(snapshot()).streamPrefixHash)
      .toBe("sha256:prefix");
    expect(() => DecisionSnapshotV2Schema.parse({
      ...snapshot(),
      streamPrefixHash: "",
    })).toThrow();
    expect(() => DecisionSnapshotV2Schema.parse({
      ...snapshot(),
      decisionEventRef: "event:other",
    })).toThrow("Decision event must equal the window trigger");
  });

  it("requires a self-turn draw to match the trigger event", () => {
    expect(() => DecisionPrivateStateSchema.parse({
      ...privateState(),
      currentDraw: {
        ...privateState().currentDraw,
        eventRef: "event:other",
      },
    })).toThrow("Self-turn draw must equal the window trigger");
  });

  it("keeps private-state evidence constraints in decision snapshots", () => {
    expect(() => DecisionPrivateStateSchema.parse({
      ...privateState(),
      evidenceIds: ["game:fixture/0/2/0", "game:fixture/0/2/0"],
    })).toThrow("Private state evidence IDs must be unique");
  });

  it("represents a known absence of a current draw", () => {
    const { decisionWindow: _window, ...state } = privateState();
    expect(SelfPrivateRoundStateSchema.parse({
      ...state,
      currentDraw: null,
      fields: { ...state.fields, currentDraw: "complete" },
    }).currentDraw).toBeNull();
  });

  it("rejects a river discard stored under another actor", () => {
    const discard = {
      eventRef: "game:fixture/0/3/0",
      actor: 1,
      tile: tile("1m"),
      discardMode: "tedashi" as const,
      riichiDeclarationEventRef: null,
      calledByEventRef: null,
    };
    expect(() => PublicRoundStateSchema.parse({
      ...publicState(),
      rivers: [[discard], [], [], []],
    })).toThrow("River actor must match its bucket");
  });

  it("requires riichi actors to match their tuple positions", () => {
    const state = publicState();
    state.riichiStates[2] = { ...state.riichiStates[2]!, actor: 1 };
    expect(() => PublicRoundStateSchema.parse(state))
      .toThrow("Riichi actor must match its position");
  });

  it("does not call remaining draws complete when the count is unknown", () => {
    expect(() => PublicRoundStateSchema.parse({
      ...publicState(),
      remainingDraws: null,
    })).toThrow("Remaining draw completeness must agree with its value");
  });
});
