import { describe, expect, it } from "vitest";
import {
  CompletedHandFactResultSchema,
  CompletedHandFactRequestSchema,
  EngineIdentitySchema,
  Hand13FactRequestSchema,
  Hand13FactResultSchema,
  ThreatRiskFactRequestSchema,
  ThreatRiskFactResultSchema,
  Tile34CountsSchema,
} from "../src/index.js";

const identity = {
  engine: "mahjong-helper",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  adapterVersion: "1.0.0",
  protocolVersion: "mahjong-facts/v1",
} as const;

const resultIdentity = {
  requestId: "req-1",
  protocolVersion: "mahjong-facts/v1",
  actionRef: "action:v1:test",
  stateHash: "sha256:test",
  identity,
};

describe("fact engine contracts", () => {
  it("requires exactly 34 finite integer tile counts", () => {
    expect(Tile34CountsSchema.parse(Array(34).fill(0))).toHaveLength(34);
    expect(() => Tile34CountsSchema.parse(Array(33).fill(0))).toThrow();
    expect(() => Tile34CountsSchema.parse([
      ...Array(33).fill(0),
      5,
    ])).toThrow();
    expect(() => Tile34CountsSchema.parse([
      ...Array(33).fill(0),
      Number.NaN,
    ])).toThrow();
  });

  it("freezes the engine identity and upstream commit", () => {
    expect(EngineIdentitySchema.parse(identity)).toEqual(identity);
    expect(() => EngineIdentitySchema.parse({
      ...identity,
      upstreamCommit: "latest",
    })).toThrow();
  });

  it("parses all three strict request kinds", () => {
    const requestBase = {
      requestId: "req-1",
      protocolVersion: "mahjong-facts/v1",
      actionRef: "action:v1:test",
      stateHash: "sha256:test",
    };
    const context = {
      melds: [],
      doraTiles34: [],
      redFiveCounts: [0, 0, 0],
      roundWindTile34: 27,
      selfWindTile34: 30,
      dealer: false,
      riichi: false,
      selfDiscards34: [],
    };
    expect(Hand13FactRequestSchema.parse({
      ...requestBase,
      ...context,
      kind: "hand13",
      handTiles34: Array(34).fill(0),
      leftTiles34: null,
      visibleCountsComplete: false,
      doraTilesComplete: true,
      selfDiscardsComplete: true,
      remainingDraws: null,
    }).kind).toBe("hand13");
    expect(CompletedHandFactRequestSchema.parse({
      ...requestBase,
      ...context,
      kind: "completed_hand",
      completedHandTiles34: Array(34).fill(0),
      tsumo: false,
      winTile34: 2,
    }).kind).toBe("completed_hand");
    expect(ThreatRiskFactRequestSchema.parse({
      ...requestBase,
      kind: "threat_risk",
      threatActor: 2,
      turns: 8,
      safeTiles34: Array(34).fill(false),
      leftTiles34: Array(34).fill(4),
      doraTiles34: [4],
      roundWindTile34: 27,
      threatWindTile34: 29,
      earlyOutsideTiles34: [0],
      evidenceIds: ["event-riichi"],
    }).kind).toBe("threat_risk");
  });

  it("parses hand13 facts while keeping remaining counts independently statused", () => {
    const parsed = Hand13FactResultSchema.parse({
      ...resultIdentity,
      kind: "hand13_result",
      shanten: 1,
      effectiveTile34: [2],
      waitsRemainingStatus: "calculated",
      waitsRemaining: [{ tile34: 2, count: 4 }],
      improves: [],
      doraCountStatus: "calculated",
      doraCount: 0,
      estimates: [{
        field: "dama_point",
        numericValue: 3900,
        limitations: ["Upstream average point estimate"],
      }],
      diagnostics: [],
    });

    expect(parsed.waitsRemaining[0]).toEqual({ tile34: 2, count: 4 });
  });

  it("allows structural effective tiles while live counts are blocked", () => {
    const parsed = Hand13FactResultSchema.parse({
      ...resultIdentity,
      kind: "hand13_result",
      shanten: 1,
      effectiveTile34: [2],
      waitsRemainingStatus: "blocked_missing_facts",
      waitsRemaining: [],
      improves: [],
      doraCountStatus: "calculated",
      doraCount: 0,
      estimates: [],
      diagnostics: ["missing_left_tile_counts"],
    });

    expect(parsed.effectiveTile34).toEqual([2]);
    expect(() => Hand13FactResultSchema.parse({
      ...parsed,
      waitsRemaining: [{ tile34: 2, count: 4 }],
    })).toThrow("Blocked remaining counts must be empty");
  });

  it("requires tile-index collections to use strict ascending order", () => {
    expect(() => Hand13FactResultSchema.parse({
      ...resultIdentity,
      kind: "hand13_result",
      shanten: 1,
      effectiveTile34: [3, 2],
      waitsRemainingStatus: "calculated",
      waitsRemaining: [],
      improves: [],
      doraCountStatus: "calculated",
      doraCount: 0,
      estimates: [],
      diagnostics: [],
    })).toThrow("Tile34 indexes must use strict ascending order");
  });

  it("rejects an upstream recommendation field", () => {
    expect(Hand13FactResultSchema).toBeDefined();
    expect(() => Hand13FactResultSchema.parse({
      ...resultIdentity,
      kind: "hand13_result",
      shanten: 1,
      effectiveTile34: [2],
      waitsRemainingStatus: "calculated",
      waitsRemaining: [{ tile34: 2, count: 4 }],
      improves: [],
      doraCountStatus: "calculated",
      doraCount: 0,
      estimates: [],
      diagnostics: [],
      recommendedDiscard: 2,
    })).toThrow();
  });

  it("blocks dora count independently without inventing zero", () => {
    const parsed = Hand13FactResultSchema.parse({
      ...resultIdentity,
      kind: "hand13_result",
      shanten: 1,
      effectiveTile34: [2],
      waitsRemainingStatus: "blocked_missing_facts",
      waitsRemaining: [],
      improves: [],
      doraCountStatus: "blocked_missing_facts",
      doraCount: null,
      estimates: [],
      diagnostics: ["dora_count_blocked_missing_facts"],
    });
    expect(parsed.doraCount).toBeNull();
    expect(() => Hand13FactResultSchema.parse({
      ...parsed,
      doraCount: 0,
    })).toThrow();
  });

  it("exposes completed points but fails closed for private han and fu", () => {
    const parsed = CompletedHandFactResultSchema.parse({
      ...resultIdentity,
      kind: "completed_hand_result",
      point: 3900,
      fixedPoint: 3900,
      hanStatus: "unsupported_upstream_api",
      fuStatus: "unsupported_upstream_api",
      limitations: ["Pao is not implemented upstream"],
      diagnostics: [],
    });

    expect(parsed.hanStatus).toBe("unsupported_upstream_api");
  });

  it("requires 34 threat-risk values and named structural classes", () => {
    const parsed = ThreatRiskFactResultSchema.parse({
      ...resultIdentity,
      kind: "threat_risk_result",
      threatActor: 2,
      riskScale: Array(34).fill(0),
      classifications: [{ tile34: 2, kind: "one_chance" }],
      leftNoSujiTile34: [3, 4],
      evidenceIds: ["event-riichi"],
      limitations: ["Not a calibrated Mortal deal-in probability"],
      diagnostics: [],
    });

    expect(parsed.riskScale).toHaveLength(34);
  });

  it("bounds threat turns to the pinned helper risk table", () => {
    const request = {
      requestId: "req-1",
      protocolVersion: "mahjong-facts/v1",
      actionRef: "action:v1:test",
      stateHash: "sha256:test",
      kind: "threat_risk",
      threatActor: 2,
      turns: 8,
      safeTiles34: Array(34).fill(false),
      leftTiles34: Array(34).fill(4),
      doraTiles34: [],
      roundWindTile34: 27,
      threatWindTile34: 29,
      earlyOutsideTiles34: [],
      evidenceIds: ["event-riichi"],
    };
    expect(() => ThreatRiskFactRequestSchema.parse({ ...request, turns: 0 })).toThrow();
    expect(() => ThreatRiskFactRequestSchema.parse({ ...request, turns: 20 })).toThrow();
  });
});
