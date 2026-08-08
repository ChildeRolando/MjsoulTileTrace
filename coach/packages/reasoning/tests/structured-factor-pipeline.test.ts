import { describe, expect, it } from "vitest";
import {
  KnownGameFactsSchema,
  StandaloneHypothesisFrameSchema,
  StructuredComparisonSetSchema,
  canonicalActionRef,
  type CompletedHandFactRequest,
  type CompletedHandFactResult,
  type EngineIdentity,
  type Hand13FactRequest,
  type Hand13FactResult,
  type ThreatRiskFactRequest,
  type ThreatRiskFactResult,
  type Tile,
} from "@riichi-coach/contracts";
import type { MahjongFactEnginePort } from "../src/fact-engine/port.js";
import { runStructuredFactorPipeline } from "../src/factors/structured-factor-pipeline.js";

const identity: EngineIdentity = {
  engine: "mahjong-helper",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  adapterVersion: "0.1.0",
  protocolVersion: "mahjong-facts/v1",
};
const tile = (id: Tile["id"]): Tile => ({ id, red: false });
const twoPinAction = {
  kind: "discard" as const,
  tile: tile("2p"),
  discardMode: "tedashi" as const,
};
const sixSouAction = {
  kind: "discard" as const,
  tile: tile("6s"),
  discardMode: "tsumogiri" as const,
};
const twoPinRef = canonicalActionRef(twoPinAction);
const sixSouRef = canonicalActionRef(sixSouAction);

const facts = KnownGameFactsSchema.parse({
  factSetId: "facts:pipeline",
  provenance: "raw_replay",
  actor: 0,
  selfRiichi: false,
  decisionEventRef: "event:draw",
  decisionWindow: {
    kind: "self_turn",
    actor: 0,
    triggerEventRef: "event:draw",
  },
  concealedTiles: [
    "1m", "2m", "3m", "4m", "5m", "7m",
    "2p", "3p", "4p", "7p", "8p", "9p", "1s",
  ].map((id) => tile(id as Tile["id"])),
  currentDraw: { tile: tile("6s"), eventRef: "event:draw" },
  melds: [],
  doraIndicators: [tile("9s")],
  rivers: [[], [], [{
    tile: tile("6s"),
    actor: 2,
    tsumogiri: false,
    eventId: "event:safe:6s",
    afterRiichiEventIds: [],
  }], []],
  threats: [{
    actor: 2,
    riichi: true,
    declarationEventId: "event:riichi:2",
    ippatsuAlive: true,
  }],
  roundWind: "E",
  seatWind: "E",
  dealer: true,
  remainingDraws: 50,
  completeness: {
    concealedTiles: true,
    melds: true,
    doraIndicators: true,
    rivers: true,
    remainingDraws: true,
    calledDiscardMarkers: true,
  },
  evidenceIds: ["event:draw", "event:safe:6s", "event:riichi:2"],
});

const frame = StandaloneHypothesisFrameSchema.parse({
  kind: "standalone_hypothesis",
  frameId: "frame:pipeline",
  scope: { kind: "applied_decision" },
  facts: [{ factId: facts.factSetId, provenance: "user_asserted" }],
});

function comparison(reverse = false) {
  const candidates = [
    { action: twoPinAction, actionRef: twoPinRef, origins: ["actual", "model"] as const },
    { action: sixSouAction, actionRef: sixSouRef, origins: ["model"] as const },
  ];
  return StructuredComparisonSetSchema.parse({
    comparisonSetId: "comparison:pipeline",
    origin: "automatic_review",
    decisionLayerRef: "decision:pipeline",
    decisionWindow: facts.decisionWindow,
    candidates: reverse
      ? [...candidates].reverse().map((candidate) => ({
          ...candidate,
          origins: [...candidate.origins].reverse(),
        }))
      : candidates,
  });
}

class FixtureEngine implements MahjongFactEnginePort {
  async identity(): Promise<EngineIdentity> {
    return identity;
  }

  async analyzeHand13(request: Hand13FactRequest): Promise<Hand13FactResult> {
    const twoPin = request.actionRef === twoPinRef;
    return {
      kind: "hand13_result",
      requestId: request.requestId,
      protocolVersion: request.protocolVersion,
      actionRef: request.actionRef,
      stateHash: request.stateHash,
      identity,
      shanten: twoPin ? 1 : 2,
      effectiveTile34: twoPin ? [1, 4] : [4],
      waitsRemainingStatus: "calculated",
      waitsRemaining: twoPin
        ? [{ tile34: 1, count: 3 }, { tile34: 4, count: 4 }]
        : [{ tile34: 4, count: 4 }],
      improves: [],
      doraCountStatus: "calculated",
      doraCount: 0,
      estimates: [],
      diagnostics: [],
    };
  }

  async analyzeCompletedHand(
    _request: CompletedHandFactRequest,
  ): Promise<CompletedHandFactResult> {
    throw new Error("not used");
  }

  async analyzeThreatRisk(
    request: ThreatRiskFactRequest,
  ): Promise<ThreatRiskFactResult> {
    return {
      kind: "threat_risk_result",
      requestId: request.requestId,
      protocolVersion: request.protocolVersion,
      actionRef: request.actionRef,
      stateHash: request.stateHash,
      identity,
      threatActor: request.threatActor,
      riskScale: Array(34).fill(5),
      classifications: [],
      leftNoSujiTile34: [],
      evidenceIds: request.evidenceIds,
      limitations: ["Helper structural risk only"],
      diagnostics: [],
    };
  }

  async close(): Promise<void> {}
}

class FailingEngine extends FixtureEngine {
  override async analyzeHand13(): Promise<Hand13FactResult> {
    throw new Error("sidecar unavailable");
  }

  override async analyzeThreatRisk(): Promise<ThreatRiskFactResult> {
    throw new Error("sidecar unavailable");
  }
}

function findFact(
  result: Awaited<ReturnType<typeof runStructuredFactorPipeline>>,
  actionRef: string,
  factorKey: string,
) {
  const ledger = result.ledgers.find((entry) => entry.actionRef === actionRef);
  const found = ledger?.axes.flatMap((axis) => axis.facts)
    .find((entry) => entry.factorKey === factorKey);
  if (found === undefined) throw new Error(`missing ${actionRef}/${factorKey}`);
  return found;
}

describe("structured factor pipeline", () => {
  it("produces one ledger per canonical candidate", async () => {
    const result = await runStructuredFactorPipeline({
      frame,
      comparisonSet: comparison(),
      facts,
      engine: new FixtureEngine(),
    });
    expect(result.ledgers.map((ledger) => ledger.actionRef).sort())
      .toEqual(comparison().candidates.map((candidate) => candidate.actionRef).sort());
  });

  it("is invariant to candidate origins and order", async () => {
    const normal = await runStructuredFactorPipeline({
      frame,
      comparisonSet: comparison(),
      facts,
      engine: new FixtureEngine(),
    });
    const permuted = await runStructuredFactorPipeline({
      frame,
      comparisonSet: comparison(true),
      facts,
      engine: new FixtureEngine(),
    });
    expect(permuted).toEqual(normal);
  });

  it("keeps local defense when every sidecar request fails", async () => {
    const result = await runStructuredFactorPipeline({
      frame,
      comparisonSet: comparison(),
      facts,
      engine: new FailingEngine(),
    });
    expect(findFact(result, sixSouRef, "defense.genbutsu.actor2").status)
      .toBe("calculated");
    expect(findFact(result, sixSouRef, "efficiency.shanten").status)
      .toBe("blocked_engine_failure");
  });
});
