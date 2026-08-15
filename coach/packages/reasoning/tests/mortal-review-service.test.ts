import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type {
  CompletedHandFactRequest,
  CompletedHandFactResult,
  EngineIdentity,
  Hand13FactRequest,
  Hand13FactResult,
  HandStructureRequestV2,
  HandStructureResultV2,
  ThreatRiskFactRequest,
  ThreatRiskFactResult,
} from "@riichi-coach/contracts";
import {
  computeMortalGameFingerprint,
  parseMjaiTile,
  type MortalFetchedReport,
  type MortalReportDecisionEntry,
} from "@riichi-coach/mortal-source";
import type { HandStructureFactEnginePort } from "../src/fact-engine/port.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayCanonicalStream } from "../src/replay/stream-replayer.js";
import { runMortalSingleDecisionReview } from "../src/analysis/mortal-review-service.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

const identity: EngineIdentity = {
  engine: "mahjong-helper",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  adapterVersion: "0.2.0",
  protocolVersion: "mahjong-facts/v1",
};

class FailingEngine implements HandStructureFactEnginePort {
  async identity(): Promise<EngineIdentity> {
    return identity;
  }

  async analyzeHand13(_request: Hand13FactRequest): Promise<Hand13FactResult> {
    throw new Error("not available in this test");
  }

  async analyzeCompletedHand(
    _request: CompletedHandFactRequest,
  ): Promise<CompletedHandFactResult> {
    throw new Error("not available in this test");
  }

  async analyzeHandStructure(
    _request: HandStructureRequestV2,
  ): Promise<HandStructureResultV2> {
    throw new Error("not available in this test");
  }

  async analyzeThreatRisk(
    _request: ThreatRiskFactRequest,
  ): Promise<ThreatRiskFactResult> {
    throw new Error("not available in this test");
  }

  async close(): Promise<void> {}
}

type RawLegacyFixture = {
  source: { reportId: string; modelTag: string; playerId: number };
  mjaiLog: unknown[];
  decisions: Array<{
    junme: number;
    tile: string;
    state: { tehai: string[]; fuuros: unknown[] };
    expected: { type: string; actor: number; pai: string; tsumogiri: boolean };
    actual: { type: string; actor: number; pai: string; tsumogiri: boolean };
    is_equal: boolean;
    details: Array<{
      action: { type: string; actor: number; pai: string; tsumogiri: boolean };
      q_value: number;
      prob: number;
    }>;
    shanten: number;
    at_furiten: boolean;
    actual_index: number;
  }>;
};

function legacyEntryToMortalEntry(
  raw: RawLegacyFixture["decisions"][number],
): MortalReportDecisionEntry {
  return Object.freeze({
    kyoku: 0,
    honba: 0,
    junme: raw.junme,
    tilesLeft: 46,
    lastActor: 3,
    tile: raw.tile,
    tehai: Object.freeze([...raw.state.tehai]),
    atSelfChiPon: false,
    atSelfRiichi: false,
    atOpponentKakan: false,
    expected: { ...raw.expected },
    actual: { ...raw.actual },
    isEqual: raw.is_equal,
    details: Object.freeze(raw.details.map((detail) => ({
      action: { ...detail.action },
      probability: detail.prob,
      qValue: detail.q_value,
    }))),
    shanten: raw.shanten,
    atFuriten: raw.at_furiten,
    actualIndex: raw.actual_index,
  });
}

function buildReport(raw: RawLegacyFixture): MortalFetchedReport {
  return Object.freeze({
    reportId: raw.source.reportId,
    adapterVersion: "mortal-source/1" as const,
    engine: "Mortal" as const,
    version: "1.5.10",
    modelTag: raw.source.modelTag,
    playerId: raw.source.playerId,
    gameFingerprint: computeMortalGameFingerprint(raw.mjaiLog),
    kyokus: Object.freeze([{
      kyoku: 0,
      honba: 0,
      entries: Object.freeze(raw.decisions.map(legacyEntryToMortalEntry)),
    }]),
  });
}

describe("runMortalSingleDecisionReview", () => {
  it("binds the legacy East-1 turn 6 decision and produces a full review", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RawLegacyFixture;
    const imported = importRegressionFixture(raw as never);
    const bridged = bridgeLegacyRegressionEvents(
      imported.events,
      imported.selfActor,
      { sourceKind: "fixture", gameId: "fixture:c1924cad66f66dd9" },
    );
    expect(bridged.status).toBe("ready");
    if (bridged.status !== "ready") return;

    const decisions = replayCanonicalStream(bridged.stream);
    const targetDraw = parseMjaiTile(raw.decisions[0]!.tile);
    const decision = decisions.find((entry) =>
      entry.actualDiscard !== null
      && entry.snapshot.privateState.currentDraw !== null
      && entry.snapshot.privateState.currentDraw.tile.id === targetDraw.id
      && entry.snapshot.privateState.currentDraw.tile.red === targetDraw.red
    );
    expect(decision).toBeDefined();
    if (decision === undefined) return;

    const report = buildReport(raw);
    const review = await runMortalSingleDecisionReview({
      stream: bridged.stream,
      decision,
      report,
      engine: new FailingEngine(),
    });

    expect(review.status).toBe("ready");
    if (review.status !== "ready") return;
    expect(review.anchor.reportId).toBe(raw.source.reportId);
    expect(review.anchor.junme).toBe(6);
    expect(review.modelEvaluation.engineId).toBe("mortal");
    expect(review.modelEvaluation.scoreMethod).toBe("mortal_probability_x100");
    expect(review.comparisonSet.candidates.length).toBeGreaterThanOrEqual(2);
    expect(review.modelEvaluation.candidates.length).toBe(review.comparisonSet.candidates.length);
  });
});
