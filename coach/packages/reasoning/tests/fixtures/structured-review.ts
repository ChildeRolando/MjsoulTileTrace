/**
 * Shared M6-C E2E fixture: a synthetic canonical self-turn discard stream
 * (draw 5p → discard 5p tsumogiri) with a canned fact engine returning valid
 * results, driven through the real whole-game review seam
 * (`runMortalFullGameReview`, M6-A established release seam). The ordinary
 * self-turn discard surface carries no coverage branches, so it reaches
 * `analysis_ready` without lifting the coverage gate.
 *
 * Used by the Slice 2 production-assembly tests and the Slice 3
 * serialization/validator tests so both exercise the SAME pinned fixture
 * through the SAME E2E path (spec Testing Decisions: 给定 pinned 报告 fixture
 * + 真实 sidecar → runMortalFullGameReview → builder → validator).
 */
import {
  FACT_ENGINE_ADAPTER_VERSION,
  FACT_ENGINE_PROTOCOL_VERSION,
  MAHJONG_HELPER_COMMIT,
  type ComponentVersions,
  type CompletedHandFactRequest,
  type CompletedHandFactResult,
  type EngineIdentity,
  type Hand13FactRequest,
  type Hand13FactResult,
  type HandStructureRequestV2,
  type HandStructureResultV2,
  type ThreatRiskFactRequest,
  type ThreatRiskFactResult,
} from "@riichi-coach/contracts";
import {
  computeCanonicalGameFingerprint,
  formatMjaiTile,
  type MortalFetchedReport,
  type MortalReportDecisionEntry,
} from "@riichi-coach/mortal-source";
import {
  runMortalFullGameReview,
} from "../../src/analysis/mortal-full-game-review.js";
import type { HandStructureFactEnginePort } from "../../src/fact-engine/port.js";
import {
  replayCanonicalStream,
  type ReplayedDecision,
} from "../../src/replay/stream-replayer.js";
import {
  canonicalSelfDrawDiscardEvents,
  canonicalStream,
} from "./canonical-stream.js";

const identity: EngineIdentity = {
  engine: "mahjong-helper",
  upstreamCommit: MAHJONG_HELPER_COMMIT,
  adapterVersion: FACT_ENGINE_ADAPTER_VERSION,
  protocolVersion: FACT_ENGINE_PROTOCOL_VERSION,
};

/** Canned engine returning valid fact-engine results (same shape family as
 *  the structured-factor-pipeline FixtureEngine). Never used by the builder or
 *  the validator — only to make the whole-game review reach analysis_ready in
 *  the E2E seam. */
class CannedEngine implements HandStructureFactEnginePort {
  async identity(): Promise<EngineIdentity> {
    return identity;
  }

  async analyzeHand13(request: Hand13FactRequest): Promise<Hand13FactResult> {
    return {
      kind: "hand13_result",
      requestId: request.requestId,
      protocolVersion: request.protocolVersion,
      actionRef: request.actionRef,
      stateHash: request.stateHash,
      identity,
      shanten: 1,
      effectiveTile34: [1, 4],
      waitsRemainingStatus: "calculated",
      waitsRemaining: [
        { tile34: 1, count: 3 },
        { tile34: 4, count: 4 },
      ],
      improves: [],
      doraCountStatus: "calculated",
      doraCount: 0,
      estimates: [{
        field: "dama_point",
        numericValue: 3900,
        limitations: ["helper_dama_point_estimate"],
      }],
      diagnostics: [],
    };
  }

  async analyzeHandStructure(
    request: HandStructureRequestV2,
  ): Promise<HandStructureResultV2> {
    const decompositionRef = `standard:${request.stateHash}`;
    const groups = request.handTiles34.flatMap((count, tile34) =>
      Array.from({ length: count }, () => ({
        kind: "floating" as const,
        tiles34: [tile34],
      }))
    );
    return {
      kind: "hand_structure_result",
      schemaVersion: "hand-structure/v2",
      requestId: request.requestId,
      protocolVersion: request.protocolVersion,
      actionRef: request.actionRef,
      stateHash: request.stateHash,
      identity,
      overallShanten: 1,
      bestFamilies: ["standard"],
      families: [{
        family: "standard",
        applicability: "applicable",
        shanten: 1,
        effectiveTiles: [{
          tile34: 4,
          remainingStatus: request.visibleCountsComplete
            ? "calculated" : "blocked_missing_facts",
          remaining: request.visibleCountsComplete
            ? request.leftTiles34![4]! : null,
        }],
      }, {
        family: "chiitoitsu",
        applicability: "applicable",
        shanten: 5,
        effectiveTiles: [],
      }, {
        family: "kokushi",
        applicability: "applicable",
        shanten: 8,
        effectiveTiles: [],
      }],
      decompositions: {
        status: "calculated",
        totalNonDominated: 1,
        truncated: false,
        items: [{
          decompositionRef,
          family: "standard",
          shanten: 1,
          groups,
        }],
        invariantClaims: groups,
        alternativeClaims: [],
      },
      waits: [],
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
      scaleVersion: request.scaleVersion,
      riskScale: request.safeTiles34.map((safe) => safe ? 0 : 5),
      classifications: request.safeTiles34.flatMap((safe, tile34) =>
        safe ? [{ tile34, kind: "genbutsu" as const }] : []
      ),
      honorClassifications: Array.from({ length: 7 }, (_, index) => ({
        tile34: 27 + index,
        remainingCount: request.leftTiles34[27 + index]!,
        category: "guest_wind" as const,
      })),
      leftNoSujiTile34: [],
      evidenceIds: request.evidenceIds,
      limitations: [
        "helper_risk_not_mortal_probability",
        "threats_analyzed_independently",
        "structural_labels_separate",
      ],
      diagnostics: [],
    };
  }

  async close(): Promise<void> {}
}

export const FROZEN_NOW = Date.parse("2026-08-20T00:00:00.000Z");

export const componentVersions: ComponentVersions = {
  packageSchema: "structured-analysis-package/v1",
  canonicalReplay: "canonical-riichi-events/v2",
  mapperAdapter: "fixture/v1",
  factEngine: {
    engine: "mahjong-helper",
    upstreamCommit: MAHJONG_HELPER_COMMIT,
    adapterVersion: FACT_ENGINE_ADAPTER_VERSION,
    protocolVersion: FACT_ENGINE_PROTOCOL_VERSION,
  },
  factorPipeline: "factor-pipeline/v1",
  mortalSourceModel: {
    identity: "Mortal",
    version: "mortal-source/2",
    modelTag: "4.1b",
  },
};

/** A bound source entry for the fixture's single self-turn discard window. */
export function entryFor(decision: ReplayedDecision): MortalReportDecisionEntry {
  const pub = decision.snapshot.publicState;
  const priv = decision.snapshot.privateState;
  const draw = priv.currentDraw;
  if (draw === null) throw new Error("fixture decision must carry a draw");
  const hand = [...priv.concealedTiles, draw.tile];
  return {
    roundOrdinal: pub.roundOrdinal,
    roundWind: pub.roundWind,
    dealer: pub.dealer,
    kyoku: 0,
    honba: pub.honba,
    junme: 1,
    tilesLeft: pub.remainingDraws ?? 70,
    lastActor: 0,
    tile: formatMjaiTile(draw.tile),
    tehai: hand.map(formatMjaiTile),
    fuuros: [],
    atSelfChiPon: false,
    atSelfRiichi: false,
    atOpponentKakan: false,
    expected: { type: "dahai", actor: 0, pai: formatMjaiTile(draw.tile), tsumogiri: true },
    actual: { type: "dahai", actor: 0, pai: formatMjaiTile(draw.tile), tsumogiri: true },
    isEqual: true,
    details: [
      {
        action: { type: "dahai", actor: 0, pai: formatMjaiTile(draw.tile), tsumogiri: true },
        probability: 0.8,
        qValue: 1,
      },
      {
        action: { type: "dahai", actor: 0, pai: "9m", tsumogiri: false },
        probability: 0.2,
        qValue: 0.1,
      },
    ],
    shanten: 1,
    atFuriten: false,
    actualIndex: 0,
  };
}

function makeReport(
  entries: readonly MortalReportDecisionEntry[],
  stream: ReturnType<typeof canonicalStream>,
): MortalFetchedReport {
  return Object.freeze({
    reportId: "0123456789abcdef",
    adapterVersion: "mortal-source/2" as const,
    engine: "Mortal" as const,
    version: "1.5.10",
    modelTag: "4.1b",
    playerId: 0,
    gameFingerprint: computeCanonicalGameFingerprint(stream),
    kyokus: Object.freeze([{
      roundOrdinal: 0,
      roundWind: "E" as const,
      dealer: 0,
      kyoku: 0,
      honba: 0,
      entries: Object.freeze(entries),
    }]),
  });
}

export async function runFixtureReview(
  stream: ReturnType<typeof canonicalStream>,
  decisions: readonly ReplayedDecision[],
  entries: readonly MortalReportDecisionEntry[],
) {
  const review = await runMortalFullGameReview({
    stream,
    decisions,
    report: makeReport(entries, stream),
    engine: new CannedEngine(),
    now: () => FROZEN_NOW,
  });
  if (review.status !== "coverage_ready") {
    throw new Error(`fixture review failed: ${review.status}`);
  }
  return review;
}

export function fixtureSetup() {
  const stream = canonicalStream(canonicalSelfDrawDiscardEvents());
  const decisions = replayCanonicalStream(stream);
  return { stream, decisions };
}
