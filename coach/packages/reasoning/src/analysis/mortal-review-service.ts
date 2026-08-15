import {
  CanonicalEventStreamSchema,
  CurrentSceneFrameSchema,
  DecisionSnapshotV2Schema,
  KnownActionFactsSchema,
  KnownGameFactsSchema,
  ResponseFuritenAnalysisV2Schema,
  sortTilesCanonical,
  type CanonicalEventStream,
  type DecisionSnapshotV2,
  type KnownActionFacts,
  type KnownGameFacts,
  type ModelEvaluation,
  type ResponseFuritenAnalysisV2,
  type StructuredComparisonSet,
  type Tile,
} from "@riichi-coach/contracts";
import {
  MORTAL_ADAPTER_VERSION,
  MortalSourceError,
  computeCanonicalGameFingerprint,
  formatMjaiTile,
  parseMjaiTile,
  type MortalFetchedReport,
  type MortalReportDecisionEntry,
  type MortalSourceAction,
  type MortalSourceErrorCode,
} from "@riichi-coach/mortal-source";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import { importStructuredMortalComparison } from "../import/structured-mortal.js";
import { buildMortalModelEvaluation } from "../model/model-evaluation-builder.js";
import { freezeDetailPolicy } from "../policy/detail-policy.js";
import { deriveResponseFuriten } from "../replay/response-furiten.js";
import type { ReplayedDecision } from "../replay/stream-replayer.js";
import { runStructuredAnalysisAssembly } from "./structured-analysis-assembly.js";
import type { StructuredFactorPipelineResult } from "../factors/structured-factor-pipeline.js";

export type MortalReviewFailureCode =
  | MortalSourceErrorCode
  | "mortal_review_engine_failed"
  | "mortal_review_assembly_failed";

export type MortalDecisionAnchor = Readonly<{
  reportId: string;
  kyoku: number;
  honba: number;
  junme: number;
  decisionEventRef: string;
}>;

export type MortalSingleDecisionReviewResult =
  | {
      readonly status: "ready";
      readonly anchor: MortalDecisionAnchor;
      readonly comparisonSet: StructuredComparisonSet;
      readonly modelEvaluation: ModelEvaluation;
      readonly factorResult: StructuredFactorPipelineResult;
    }
  | {
      readonly status: "failed";
      readonly code: MortalReviewFailureCode;
      readonly diagnostics: readonly string[];
    }
  | {
      readonly status: "not_comparable";
      readonly code: "cross_decision_window" | "fewer_than_two_distinct_actions";
      readonly diagnostics: readonly string[];
    };

const DECISION_DETAIL_POLICY_VERSION = "mortal-review/v1" as const;

function sameTile(
  left: { id: string; red: boolean },
  right: { id: string; red: boolean },
): boolean {
  return left.id === right.id && left.red === right.red;
}

function localActualAction(decision: ReplayedDecision): MortalSourceAction {
  const actualDiscard = decision.actualDiscard;
  if (actualDiscard === null) {
    throw new MortalSourceError("mortal_decision_actual_mismatch");
  }
  return {
    type: "dahai",
    actor: decision.snapshot.selfActor,
    pai: formatMjaiTile(actualDiscard.tile),
    tsumogiri: actualDiscard.discardMode === "tsumogiri",
  };
}

function entryMatchesDecision(
  entry: MortalReportDecisionEntry,
  decision: ReplayedDecision,
): boolean {
  const snapshot = decision.snapshot;
  const privateState = snapshot.privateState;
  const currentDraw = privateState.currentDraw;
  if (currentDraw === null) return false;
  const actualDiscard = decision.actualDiscard;
  if (actualDiscard === null) return false;
  if (privateState.decisionWindow.kind !== "self_turn") return false;

  const drawnTile = parseMjaiTile(entry.tile);
  if (!sameTile(drawnTile, currentDraw.tile)) return false;

  const publicState = snapshot.publicState;
  if (
    publicState.fields.remainingDraws === "complete" &&
    publicState.remainingDraws !== null &&
    entry.tilesLeft !== publicState.remainingDraws
  ) return false;

  const selfRiichi = publicState.riichiStates[snapshot.selfActor]!.status !== "none";
  if (entry.atSelfRiichi !== selfRiichi) return false;

  const mortalHand = sortTilesCanonical(entryStateTiles(entry));
  const canonicalHand = sortTilesCanonical([
    ...privateState.concealedTiles,
    currentDraw.tile,
  ]);
  if (mortalHand.length !== canonicalHand.length) return false;
  for (let index = 0; index < canonicalHand.length; index += 1) {
    if (!sameTile(mortalHand[index]!, canonicalHand[index]!)) return false;
  }

  const actualAction = entry.actual;
  if (
    actualAction.type !== "dahai" ||
    actualAction.actor !== snapshot.selfActor ||
    actualAction.pai !== formatMjaiTile(actualDiscard.tile) ||
    actualAction.tsumogiri !== (actualDiscard.discardMode === "tsumogiri")
  ) return false;

  return true;
}

function entryStateTiles(entry: MortalReportDecisionEntry): Tile[] {
  // `tehai` is the reviewed player's own 14-tile hand at decision time; it is
  // the strongest 1:1 binding anchor against the canonical private snapshot.
  return entry.tehai.map(parseMjaiTile);
}

function projectActionFacts(
  decision: ReplayedDecision,
): KnownActionFacts {
  const facts = KnownGameFactsSchema.parse(decision.facts);
  return KnownActionFactsSchema.parse({
    decisionWindow: facts.decisionWindow,
    concealedTiles: facts.concealedTiles.map((tile) => ({ ...tile })),
    currentDraw: facts.currentDraw === null
      ? null
      : {
          tile: { ...facts.currentDraw.tile },
          eventRef: facts.currentDraw.eventRef,
        },
    melds: facts.melds.map((meld) => ({
      meldRef: meld.meldRef,
      kind: meld.kind,
      ...(meld.actor === undefined ? {} : { actor: meld.actor }),
      ...(meld.calledDiscardEventRef === undefined
        ? {}
        : { calledDiscardEventRef: meld.calledDiscardEventRef }),
      tiles: meld.tiles.map((tile) => ({ ...tile })),
    })),
  });
}

function candidateEventRef(
  reportId: string,
  entry: MortalReportDecisionEntry,
  index: number,
): string {
  return `mortal:${reportId}:${entry.kyoku}:${entry.junme}:detail:${index}`;
}

function actualEventRef(decision: ReplayedDecision): string {
  return `mortal-review-actual:${decision.decisionEventRef}`;
}

function buildFrame(
  reportId: string,
  decision: ReplayedDecision,
  facts: KnownGameFacts,
) {
  return CurrentSceneFrameSchema.parse({
    kind: "current_scene",
    frameId: `mortal-review:${reportId}:${decision.decisionEventRef}`,
    scope: { kind: "applied_decision" },
    sceneRef: decision.decisionEventRef,
    facts: [{
      factId: facts.factSetId,
      provenance: "raw_replay",
    }],
  });
}

function anchorEntry(
  report: MortalFetchedReport,
  decision: ReplayedDecision,
): {
  status: "anchored";
  anchor: MortalDecisionAnchor;
  entry: MortalReportDecisionEntry;
} | { status: "failed"; code: MortalSourceErrorCode } {
  const supportedMatches: Array<{
    anchor: MortalDecisionAnchor;
    entry: MortalReportDecisionEntry;
  }> = [];
  for (const kyoku of report.kyokus) {
    for (const entry of kyoku.entries) {
      if (entry.lastActor !== report.playerId) continue;
      if (!entryMatchesDecision(entry, decision)) continue;
      const anchor: MortalDecisionAnchor = Object.freeze({
        reportId: report.reportId,
        kyoku: entry.kyoku,
        honba: entry.honba,
        junme: entry.junme,
        decisionEventRef: decision.decisionEventRef,
      });
      // The single-decision slice only adapts plain discard candidates.
      const supported = entry.details.length > 0 &&
        entry.details.every((detail) => detail.action.type === "dahai");
      if (!supported) continue;
      supportedMatches.push({ anchor, entry });
    }
  }
  if (supportedMatches.length === 1) {
    return { status: "anchored", ...supportedMatches[0]! };
  }
  if (supportedMatches.length > 1) {
    return { status: "failed", code: "mortal_decision_anchor_ambiguous" };
  }
  // Distinguish "matched a decision but its Mortal candidates are not
  // representable in this slice" from "no self-turn discard decision exists".
  for (const kyoku of report.kyokus) {
    for (const entry of kyoku.entries) {
      if (entry.lastActor !== report.playerId) continue;
      if (!entryMatchesDecision(entry, decision)) continue;
      return { status: "failed", code: "mortal_decision_unsupported_entry" };
    }
  }
  return { status: "failed", code: "mortal_decision_anchor_not_found" };
}

async function deriveReviewResponseFuriten(
  stream: CanonicalEventStream,
  facts: KnownGameFacts,
  engine: HandStructureFactEnginePort,
): Promise<ResponseFuritenAnalysisV2> {
  // `deriveResponseFuriten` binds to canonical-v2 fact-set ids, which is the
  // production path for Mahjong Soul records. Fixture / user-asserted streams
  // use the same explicit unavailable binding as the structured regression,
  // so the assembly can still run without pretending a response history
  // exists.
  if (stream.sourceKind === "mahjong_soul") {
    return await deriveResponseFuriten(
      stream,
      facts.decisionEventRef,
      engine,
    );
  }
  return ResponseFuritenAnalysisV2Schema.parse({
    binding: {
      source: "unavailable",
      factSetId: facts.factSetId,
      decisionEventRef: facts.decisionEventRef,
      selfActor: facts.actor,
      reason: "response_history_not_provided",
      engineIdentityStatus: "unknown",
      engineIdentity: null,
    },
    temporary: {
      status: "unknown",
      unknownReason: "response_history_not_provided",
      evidenceIds: [],
      analysisRefs: [],
      riichiAcceptanceEventRef: null,
    },
    riichi: {
      status: "unknown",
      unknownReason: "response_history_not_provided",
      evidenceIds: [],
      analysisRefs: [],
      riichiAcceptanceEventRef: null,
    },
  });
}

export async function runMortalSingleDecisionReview(input: {
  readonly stream: CanonicalEventStream;
  readonly decision: ReplayedDecision;
  readonly report: MortalFetchedReport;
  readonly engine: HandStructureFactEnginePort;
  readonly now?: () => number;
}): Promise<MortalSingleDecisionReviewResult> {
  const now = input.now ?? Date.now;
  try {
    const stream = CanonicalEventStreamSchema.parse(input.stream);
    const snapshot = DecisionSnapshotV2Schema.parse(input.decision.snapshot);
    const facts = KnownGameFactsSchema.parse(input.decision.facts);
    if (snapshot.decisionEventRef !== input.decision.decisionEventRef) {
      throw new MortalSourceError("mortal_decision_anchor_not_found");
    }
    if (snapshot.decisionEventRef !== facts.decisionEventRef) {
      throw new MortalSourceError("mortal_decision_anchor_not_found");
    }

    // P3: game identity binding.
    if (computeCanonicalGameFingerprint(stream) !== input.report.gameFingerprint) {
      throw new MortalSourceError("mortal_report_game_fingerprint_mismatch");
    }

    // P4: perspective binding.
    if (input.report.playerId !== stream.selfActor) {
      throw new MortalSourceError("mortal_report_perspective_mismatch");
    }

    // P5/P6: exact 1:1 anchor, then local actual authority.
    const anchored = anchorEntry(input.report, input.decision);
    if (anchored.status === "failed") {
      throw new MortalSourceError(anchored.code);
    }
    const { anchor, entry } = anchored;
    const localActual = localActualAction(input.decision);
    if (
      entry.actual.type !== "dahai" ||
      entry.actual.actor !== localActual.actor ||
      entry.actual.pai !== localActual.pai ||
      entry.actual.tsumogiri !== localActual.tsumogiri
    ) {
      throw new MortalSourceError("mortal_decision_actual_mismatch");
    }

    // P7: pure projection into the candidate normalizer's action-fact shape.
    const actionFacts = projectActionFacts(input.decision);

    // P8: reuse the structured Mortal import.
    const decisionLayerRef = `mortal-review:${input.report.reportId}:${input.decision.decisionEventRef}`;
    const comparisonSetId = `mortal-comparison:${input.report.reportId}:${input.decision.decisionEventRef}`;
    const imported = importStructuredMortalComparison({
      comparisonSetId,
      decisionLayerRef,
      facts: actionFacts,
      modelCandidates: entry.details.map((detail, index) => ({
        actions: [{
          eventRef: candidateEventRef(input.report.reportId, entry, index),
          action: detail.action,
        }],
        probability: detail.probability,
        qValue: detail.qValue,
      })),
      actual: {
        actions: [{
          eventRef: actualEventRef(input.decision),
          action: localActual,
        }],
      },
    });
    if (imported.status === "incomplete") {
      throw new MortalSourceError("mortal_decision_unsupported_entry");
    }
    if (imported.status === "not_comparable") {
      return {
        status: "not_comparable",
        code: imported.code,
        diagnostics: Object.freeze([...imported.windowKinds]),
      };
    }

    // P9: deterministic model evaluation.
    const actualCandidate = imported.comparisonSet.candidates.find(
      (candidate) => candidate.origins.includes("actual"),
    );
    if (actualCandidate === undefined) {
      throw new MortalSourceError("mortal_decision_actual_mismatch");
    }
    const evaluationBuilt = buildMortalModelEvaluation({
      evaluationId: `mortal-evaluation:${input.report.reportId}:${input.decision.decisionEventRef}`,
      comparisonSetId: imported.comparisonSet.comparisonSetId,
      decisionLayerRef: imported.comparisonSet.decisionLayerRef,
      engineVersion: input.report.version,
      adapterVersion: MORTAL_ADAPTER_VERSION,
      actualActionRef: actualCandidate.actionRef,
      detailPolicy: freezeDetailPolicy({
        policyVersion: DECISION_DETAIL_POLICY_VERSION,
        frozenAt: new Date(now()).toISOString(),
      }),
      candidates: imported.scores.map((score) => ({
        actionRef: score.actionRef,
        probability: score.probability,
        ...(score.qValue === undefined ? {} : { qValue: score.qValue }),
      })),
    });
    if (evaluationBuilt.status !== "ready") {
      throw new MortalSourceError("mortal_decision_unsupported_entry");
    }

    // P10: same-snapshot assembly through the shared analysis path.
    let factorResult: StructuredFactorPipelineResult;
    try {
      const responseFuriten = await deriveReviewResponseFuriten(
        stream,
        facts,
        input.engine,
      );
      factorResult = await runStructuredAnalysisAssembly({
        frame: buildFrame(input.report.reportId, input.decision, facts),
        comparisonSet: imported.comparisonSet,
        facts,
        responseFuriten,
        engine: input.engine,
        modelEvaluation: evaluationBuilt.evaluation,
      }).then((result) => result.factorResult);
    } catch (error) {
      if (error instanceof MortalSourceError) throw error;
      return {
        status: "failed",
        code: "mortal_review_assembly_failed",
        diagnostics: Object.freeze([
          error instanceof Error ? error.message : "assembly_or_fact_engine_failed",
        ]),
      };
    }

    return {
      status: "ready",
      anchor,
      comparisonSet: imported.comparisonSet,
      modelEvaluation: evaluationBuilt.evaluation,
      factorResult,
    };
  } catch (error) {
    if (error instanceof MortalSourceError) {
      return {
        status: "failed",
        code: error.code,
        diagnostics: Object.freeze([]),
      };
    }
    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: "failed",
        code: "mortal_result_fetch_failed",
        diagnostics: Object.freeze(["aborted"]),
      };
    }
    return {
      status: "failed",
      code: "mortal_review_engine_failed",
      diagnostics: Object.freeze(["unexpected_review_failure"]),
    };
  }
}
