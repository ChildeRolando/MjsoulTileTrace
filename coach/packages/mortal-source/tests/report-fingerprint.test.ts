import { describe, expect, it } from "vitest";
import type { CanonicalEventStream } from "@riichi-coach/contracts";
import {
  computeCanonicalGameFingerprint,
  computeMortalGameFingerprint,
} from "../src/report-fingerprint.js";

function selfHand() {
  return Array.from({ length: 13 }, (_, index) => ({
    id: `${(index % 9) + 1}m`,
    red: false,
  }));
}

function gameStarted() {
  return {
    type: "game_started" as const,
    eventId: "game:test/0/0/0",
    sourceRecordRef: "record:0",
  };
}

function roundStarted(overrides: Record<string, unknown> = {}) {
  return {
    type: "round_started" as const,
    eventId: "game:test/0/1/0",
    sourceRecordRef: "record:1",
    roundOrdinal: 0,
    roundWind: "E" as const,
    hand: 1,
    honba: 0,
    riichiSticks: 0,
    dealer: 0,
    scores: [25000, 25000, 25000, 25000] as [number, number, number, number],
    doraIndicator: { id: "6p", red: false },
    selfHand: selfHand(),
    remainingDraws: 70,
    ...overrides,
  };
}

function tileDiscarded(
  sourceOrdinal: number,
  tile = "1p",
  tsumogiri = false,
  riichiDeclarationEventRef: string | null = null,
) {
  return {
    type: "tile_discarded" as const,
    eventId: `game:test/0/${sourceOrdinal}/0`,
    sourceRecordRef: `record:${sourceOrdinal}`,
    actor: 0,
    tile: { id: tile, red: false },
    discardMode: tsumogiri ? ("tsumogiri" as const) : ("tedashi" as const),
    riichiDeclarationEventRef,
  };
}

function riichiDeclared(sourceOrdinal: number, actor = 0) {
  return {
    type: "riichi_declared" as const,
    eventId: `game:test/0/${sourceOrdinal}/0`,
    sourceRecordRef: `record:${sourceOrdinal}`,
    actor,
  };
}

function riichiAccepted(sourceOrdinal: number, actor = 0, declarationEventRef = "game:test/0/3/0") {
  return {
    type: "riichi_accepted" as const,
    eventId: `game:test/0/${sourceOrdinal}/0`,
    sourceRecordRef: `record:${sourceOrdinal}`,
    actor,
    declarationEventRef,
  };
}

function chiCalled(sourceOrdinal: number) {
  return {
    type: "chi_called" as const,
    eventId: `game:test/0/${sourceOrdinal}/0`,
    sourceRecordRef: `record:${sourceOrdinal}`,
    actor: 0,
    targetActor: 1,
    calledTile: { id: "2p", red: false },
    consumedTiles: [
      { id: "3p", red: false },
      { id: "4p", red: false },
    ] as [{ id: string; red: boolean }, { id: string; red: boolean }],
    calledDiscardEventRef: "game:test/0/2/0",
  };
}

function ponCalled(sourceOrdinal: number) {
  return {
    type: "pon_called" as const,
    eventId: `game:test/0/${sourceOrdinal}/0`,
    sourceRecordRef: `record:${sourceOrdinal}`,
    actor: 0,
    targetActor: 1,
    calledTile: { id: "5z", red: false },
    consumedTiles: [
      { id: "5z", red: false },
      { id: "5z", red: false },
    ] as [{ id: string; red: boolean }, { id: string; red: boolean }],
    calledDiscardEventRef: "game:test/0/2/0",
  };
}

function hiddenDraw(sourceOrdinal: number, actor = 1) {
  return {
    type: "tile_drawn" as const,
    eventId: `game:test/0/${sourceOrdinal}/0`,
    sourceRecordRef: `record:${sourceOrdinal}`,
    actor,
    tile: { visibility: "hidden" } as const,
    from: "live_wall" as const,
  };
}

function canonicalStream(
  events: unknown[],
): CanonicalEventStream {
  return {
    schemaVersion: "canonical-riichi-events/v2",
    mapperVersion: "test/v1",
    gameId: "game:test",
    sourceKind: "fixture",
    sourceRecordHash: "sha256:test",
    playerCount: 4,
    selfActor: 0,
    completeness: {
      eventSequence: "complete",
      ruleSet: "complete",
      scores: "complete",
      doraIndicators: "complete",
      rivers: "complete",
      calledDiscardMarkers: "complete",
      melds: "complete",
      remainingDraws: "complete",
      settlement: "complete",
      responseOpportunities: "complete",
    },
    ruleSet: {
      length: "east",
      redFives: { man: 1, pin: 1, sou: 1 },
      openTanyao: true,
      atamahane: false,
      westExtension: "none",
      ippatsuCancelledByAnkan: true,
    },
    events: [gameStarted(), roundStarted(), ...events],
  } as unknown as CanonicalEventStream;
}

function mjaiStartGame() {
  return { type: "start_game", names: ["A", "B", "C", "D"], kyoku_first: 0, aka_flag: true };
}

function mjaiStartKyoku() {
  return {
    type: "start_kyoku",
    bakaze: "E",
    dora_marker: "6p",
    kyoku: 0,
    honba: 0,
    kyotaku: 0,
    oya: 0,
    scores: [25000, 25000, 25000, 25000],
    tehais: [[], [], [], []],
  };
}

function mjaiDahai(pai = "1p", tsumogiri = false) {
  return { type: "dahai", actor: 0, pai, tsumogiri };
}

function mjaiTsumo(actor = 1, pai = "1p") {
  return { type: "tsumo", actor, pai };
}

function mjaiLog(events: unknown[]): unknown[] {
  return [mjaiStartGame(), mjaiStartKyoku(), ...events];
}

describe("Mortal game fingerprint v2", () => {
  it("matches canonical public event sequence for the same game", () => {
    const mortal = computeMortalGameFingerprint(mjaiLog([
      mjaiDahai("1p", false),
      { type: "reach", actor: 0 },
      { type: "reach_accepted", actor: 0 },
      { type: "pon", actor: 0, target: 1, pai: "5z", consumed: ["5z", "5z"] },
      { type: "end_kyoku" },
    ]));
    const canonical = computeCanonicalGameFingerprint(canonicalStream([
      tileDiscarded(2, "1p", false),
      riichiDeclared(3, 0),
      riichiAccepted(4, 0),
      ponCalled(5),
      { type: "round_ended", eventId: "game:test/0/6/0", sourceRecordRef: "record:6", terminalEventRef: "game:test/0/5/0" },
    ]));
    expect(mortal).toBe(canonical);
  });

  it("changes when one discard differs", () => {
    expect(computeMortalGameFingerprint(mjaiLog([mjaiDahai("1p")])))
      .not.toBe(computeMortalGameFingerprint(mjaiLog([mjaiDahai("2p")])));
    expect(computeCanonicalGameFingerprint(canonicalStream([
      tileDiscarded(2, "1p"),
    ]))).not.toBe(computeCanonicalGameFingerprint(canonicalStream([
      tileDiscarded(2, "2p"),
    ])));
  });

  it("changes when one call differs", () => {
    const withChi = computeCanonicalGameFingerprint(canonicalStream([
      tileDiscarded(2, "2p"),
      chiCalled(3),
    ]));
    const withPon = computeCanonicalGameFingerprint(canonicalStream([
      tileDiscarded(2, "2p"),
      ponCalled(3),
    ]));
    expect(withChi).not.toBe(withPon);
  });

  it("changes when the riichi sequence differs", () => {
    const withRiichi = computeCanonicalGameFingerprint(canonicalStream([
      tileDiscarded(2, "1p"),
      riichiDeclared(3),
      riichiAccepted(4),
    ]));
    const withoutRiichi = computeCanonicalGameFingerprint(canonicalStream([
      tileDiscarded(2, "1p"),
    ]));
    expect(withRiichi).not.toBe(withoutRiichi);
  });

  it("ignores opponent hidden draws on both sides", () => {
    expect(computeMortalGameFingerprint(mjaiLog([mjaiTsumo(1, "1p")])))
      .toBe(computeMortalGameFingerprint(mjaiLog([mjaiTsumo(1, "2p")])));
    expect(computeCanonicalGameFingerprint(canonicalStream([
      hiddenDraw(2, 1),
      tileDiscarded(3, "1p"),
    ]))).toBe(computeCanonicalGameFingerprint(canonicalStream([
      hiddenDraw(2, 1),
      hiddenDraw(3, 2),
      tileDiscarded(4, "1p"),
    ])));
  });
});
