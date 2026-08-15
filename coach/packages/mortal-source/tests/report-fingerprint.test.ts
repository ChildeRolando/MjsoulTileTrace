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

function canonicalStream(dealer = 0): CanonicalEventStream {
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
    events: [
      {
        type: "game_started",
        eventId: "game:test/0/0/0",
        sourceRecordRef: "record:0",
      },
      {
        type: "round_started",
        eventId: "game:test/0/1/0",
        sourceRecordRef: "record:1",
        roundOrdinal: 0,
        roundWind: "E",
        hand: 1,
        honba: 0,
        riichiSticks: 0,
        dealer,
        scores: [25000, 25000, 25000, 25000],
        doraIndicator: { id: "6p", red: false },
        selfHand: selfHand(),
        remainingDraws: 70,
      },
    ],
  };
}

describe("Mortal game fingerprint", () => {
  it("matches canonical public round facts for the same game", () => {
    const mortal = computeMortalGameFingerprint([{
      type: "start_game",
      names: ["A", "B", "C", "D"],
      kyoku_first: 0,
      aka_flag: true,
    }, {
      type: "start_kyoku",
      bakaze: "E",
      dora_marker: "6p",
      kyoku: 0,
      honba: 0,
      kyotaku: 0,
      oya: 0,
      scores: [25000, 25000, 25000, 25000],
      tehais: [[], [], [], []],
    }]);
    expect(mortal).toBe(computeCanonicalGameFingerprint(canonicalStream(0)));
  });

  it("changes when a public round fact differs", () => {
    const mortal = computeMortalGameFingerprint([{
      type: "start_kyoku",
      bakaze: "E",
      dora_marker: "6p",
      kyoku: 0,
      honba: 0,
      kyotaku: 0,
      oya: 0,
      scores: [25000, 25000, 25000, 25000],
    }]);
    expect(mortal).not.toBe(computeCanonicalGameFingerprint(canonicalStream(1)));
  });
});
