import { createHash } from "node:crypto";
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
  type MortalReportFuuro,
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
  reportIdHash: string;
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

function hashMortalReportId(reportId: string): string {
  return `sha256:${createHash("sha256").update(reportId).digest("hex")}`;
}

function sameTile(
  left: { id: string; red: boolean },
  right: { id: string; red: boolean },
): boolean {
  return left.id === right.id && left.red === right.red;
}

// M6-A3: the local actual is a typed action sequence in the source's mjai
// shape. Every tile comes from local canonical events — never from the
// Mortal row (ADR-0001).
function localActualEnvelopes(
  decision: ReplayedDecision,
): Array<{ eventRef: string; action: MortalSourceAction }> {
  const actual = decision.actualAction;
  if (actual === null) {
    // No representable self action resolved the window (e.g. a pure round
    // end). Fail closed before Mortal import.
    throw new MortalSourceError("mortal_decision_unsupported_entry");
  }
  const actor = decision.snapshot.selfActor;
  const eventRef = actualEventRef(decision);
  const dahai = (tile: Tile, tsumogiri: boolean) => ({
    type: "dahai",
    actor,
    pai: formatMjaiTile(tile),
    tsumogiri,
  });
  switch (actual.kind) {
    case "discard":
      return [{
        eventRef,
        action: dahai(actual.tile, actual.discardMode === "tsumogiri"),
      }];
    case "riichi_discard":
      // The full declaration: a tile-less reach plus the authoritative local
      // discard — exactly the sequence the adapter pairs into riichi_discard,
      // which then REALIZES the declare_riichi model row via the typed
      // correspondence (never by rewriting the model row).
      return [
        { eventRef, action: { type: "reach", actor } },
        {
          eventRef,
          action: dahai(actual.tile, actual.discardMode === "tsumogiri"),
        },
      ];
    case "tsumo":
      return [{
        eventRef,
        action: {
          type: "hora",
          actor,
          target: actor,
          pai: formatMjaiTile(actual.winningTile),
        },
      }];
    case "ankan":
      return [{
        eventRef,
        action: {
          type: "ankan",
          actor,
          consumed: actual.tiles.map((tile) => formatMjaiTile(tile)),
        },
      }];
    case "kakan":
      return [{
        eventRef,
        action: {
          type: "kakan",
          actor,
          pai: formatMjaiTile(actual.addedTile),
          existingMeldRef: actual.existingMeldRef,
        },
      }];
    case "kyuushu_kyuuhai":
      return [{
        eventRef,
        action: { type: "ryukyoku", actor, reason: "kyuushu_kyuuhai" },
      }];
    default:
      throw new MortalSourceError("mortal_decision_unsupported_entry");
  }
}

function asStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === "string") ? value : null;
}

function sameStringMultiset(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((item, index) => item === sortedRight[index]);
}

// P6 (M6-A3): the local actual is authoritative; the Mortal actual row is a
// cross-check by TYPE CORRESPONDENCE — riichi_discard ↔ tile-less reach,
// tsumo ↔ hora targeting self, ankan ↔ consumed multiset. Never tile
// equality on the riichi side: the source cannot carry the authoritative
// tile.
//
// Real-evidence pin (H2 sample report, 2026-08-15): hora actual rows in real
// Mortal reports systematically omit `pai` — the winning tile lives on the
// entry's `tile` field. `sourceEntryTile` carries that source-side tile so
// the tsumo cross-check can verify the winning tile against the only place
// the real source shape exposes it. A source that exposes neither
// `actual.pai` nor the entry tile fails the check.
export function mortalActualMatchesLocal(
  actual: MortalSourceAction,
  decision: ReplayedDecision,
  sourceEntryTile?: string | null,
): boolean {
  const actor = decision.snapshot.selfActor;
  const local = decision.actualAction;
  if (local === null) return false;
  switch (local.kind) {
    case "discard":
      return actual.type === "dahai"
        && actual.actor === actor
        && actual.pai === formatMjaiTile(local.tile)
        && actual.tsumogiri === (local.discardMode === "tsumogiri");
    case "riichi_discard":
      return actual.type === "reach" && actual.actor === actor;
    case "tsumo": {
      if (
        (actual.type !== "hora" && actual.type !== "agari")
        || actual.actor !== actor
        || actual.target !== actor
      ) {
        return false;
      }
      // The winning tile is on `actual.pai` when the source carries it, and
      // on the entry's `tile` in the real report shape. Neither → fail.
      const sourceWinningTile = typeof actual.pai === "string"
        ? actual.pai
        : typeof sourceEntryTile === "string"
          ? sourceEntryTile
          : null;
      return sourceWinningTile !== null
        && sourceWinningTile === formatMjaiTile(local.winningTile);
    }
    case "ankan": {
      if (actual.type !== "ankan" || actual.actor !== actor) return false;
      const consumed = asStringArray(actual.consumed);
      return consumed !== null
        && sameStringMultiset(
          consumed,
          local.tiles.map((tile) => formatMjaiTile(tile)),
        );
    }
    case "kakan":
      return actual.type === "kakan"
        && actual.actor === actor
        && actual.pai === formatMjaiTile(local.addedTile);
    case "kyuushu_kyuuhai": {
      // Real-evidence pin (ekyu report, 2026-08-17): the kyuushu actual
      // serializes as a bare `{"type":"ryukyoku","deltas":[0,0,0,0]}` — no
      // actor and no reason. The degree-1 identity binding (round identity +
      // full 14-tile hand + draw tile) is the actor authority for this row;
      // any actor/reason the source does carry must still agree, and any
      // explicit non-zero deltas contradict an abortive draw.
      if (actual.type !== "ryukyoku") return false;
      if (actual.actor !== undefined && actual.actor !== actor) return false;
      if (
        actual.reason !== undefined
        && actual.reason !== "kyuushu_kyuuhai"
        && actual.reason !== "kyushukyuhai"
      ) {
        return false;
      }
      if (Array.isArray(actual.deltas) && actual.deltas.some((v) => v !== 0)) {
        return false;
      }
      return true;
    }
    default:
      return false;
  }
}

export function entryMatchesDecisionIdentity(
  entry: MortalReportDecisionEntry,
  decision: ReplayedDecision,
): boolean {
  const snapshot = decision.snapshot;
  const privateState = snapshot.privateState;
  const publicState = snapshot.publicState;
  const window = privateState.decisionWindow;

  // Round identity: canonical round occurrence, wind, dealer, and honba.
  // These are public facts on both sides and are proven by fingerprint v2,
  // so they are not "array position" guesses.
  if (entry.roundOrdinal !== publicState.roundOrdinal) return false;
  if (entry.roundWind !== publicState.roundWind) return false;
  if (entry.dealer !== publicState.dealer) return false;
  if (entry.honba !== publicState.honba) return false;

  if (
    publicState.fields.remainingDraws === "complete" &&
    publicState.remainingDraws !== null &&
    entry.tilesLeft !== publicState.remainingDraws
  ) return false;

  const sameHand = (handTiles: readonly Tile[]): boolean => {
    const mortalHand = sortTilesCanonical(entryStateTiles(entry));
    const canonicalHand = sortTilesCanonical(handTiles);
    if (mortalHand.length !== canonicalHand.length) return false;
    return canonicalHand.every((tile, index) =>
      sameTile(mortalHand[index]!, tile)
    );
  };

  if (window.kind === "self_turn") {
    const currentDraw = privateState.currentDraw;
    if (currentDraw === null) return false;
    // Surface flags: a self-turn row is neither a post-call nor a
    // post-riichi row.
    if (entry.atSelfChiPon) return false;
    const selfRiichi =
      publicState.riichiStates[snapshot.selfActor]!.status !== "none";
    if (entry.atSelfRiichi !== selfRiichi) return false;
    const drawnTile = parseMjaiTile(entry.tile);
    if (!sameTile(drawnTile, currentDraw.tile)) return false;
    return sameHand([...privateState.concealedTiles, currentDraw.tile]);
  }

  if (window.kind === "post_call_discard") {
    // The 11-tile concealed multiset right after the call; there is no draw
    // in this window, so the draw-tile fact is not part of the table. The
    // self meld state must also line up: source state.fuuros ↔ local
    // selfMeldRefs melds, kind + tile multiset, order-canonicalized (§9).
    if (!entry.atSelfChiPon) return false;
    if (entry.atSelfRiichi) return false;
    if (!sameHand(privateState.concealedTiles)) return false;
    return sameFuuros(entry.fuuros, localSelfFuuros(decision));
  }

  if (window.kind === "post_riichi_discard") {
    // The declaration turn's discard window: riichi is declared (not yet
    // accepted) and the turn's draw is still in hand. This is the identity
    // of Mortal's same-turn at_self_riichi=true dahai row.
    if (entry.atSelfChiPon) return false;
    if (!entry.atSelfRiichi) return false;
    if (
      publicState.riichiStates[snapshot.selfActor]!.status === "none"
    ) return false;
    const currentDraw = privateState.currentDraw;
    if (currentDraw === null) return false;
    return sameHand([...privateState.concealedTiles, currentDraw.tile]);
  }

  // Response surfaces are M6-A4: no identity table here yet.
  return false;
}

function entryStateTiles(entry: MortalReportDecisionEntry): Tile[] {
  // `tehai` is the reviewed player's own 14-tile hand at decision time; it is
  // the strongest 1:1 binding anchor against the canonical private snapshot.
  return entry.tehai.map(parseMjaiTile);
}

// M6-A3 §9: the local side of the fuuro identity — the self player's own
// melds at the frozen snapshot, resolved through privateState.selfMeldRefs
// (a kakan upgrade replaces the pon in place, keeping its ref). Each meld is
// reduced to the same normalized shape as the source projection: kind plus
// the full tile multiset, canonically ordered.
function localSelfFuuros(
  decision: ReplayedDecision,
): MortalReportFuuro[] {
  const { publicState, privateState } = decision.snapshot;
  return privateState.selfMeldRefs.map((meldRef) => {
    const meld = publicState.melds.find(
      (candidate) => candidate.meldRef === meldRef,
    );
    if (meld === undefined) {
      // Invariant: every selfMeldRef was created by a self call event that
      // also pushed a meld. A miss means the snapshot is corrupt — fail loud,
      // never silently under-match.
      throw new Error("mortal_review_self_meld_missing");
    }
    const tiles =
      meld.kind === "ankan"
        ? [...meld.tiles]
        : meld.kind === "daiminkan"
          ? [meld.calledTile, ...meld.consumedTiles]
          : meld.kind === "kakan"
            ? [meld.calledTile, ...meld.consumedTiles, meld.addedTile]
            : [meld.calledTile, ...meld.consumedTiles];
    return {
      kind: meld.kind,
      tiles: sortTilesCanonical(tiles).map((tile) => ({
        id: tile.id,
        red: tile.red,
      })),
    };
  });
}

function sameFuuros(
  source: readonly MortalReportFuuro[],
  local: readonly MortalReportFuuro[],
): boolean {
  if (source.length !== local.length) return false;
  const fuuroKey = (fuuro: MortalReportFuuro): string =>
    `${fuuro.kind}:${fuuro.tiles
      .map((tile) => `${tile.id}${tile.red ? "r" : ""}`)
      .join(",")}`;
  const sourceKeys = source.map(fuuroKey).sort();
  const localKeys = local.map(fuuroKey).sort();
  return sourceKeys.every((key, index) => key === localKeys[index]);
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
  reportIdHash: string,
  entry: MortalReportDecisionEntry,
  index: number,
): string {
  return `mortal:${reportIdHash}:${entry.kyoku}:${entry.junme}:detail:${index}`;
}

function actualEventRef(decision: ReplayedDecision): string {
  return `mortal-review-actual:${decision.decisionEventRef}`;
}

function buildFrame(
  reportIdHash: string,
  decision: ReplayedDecision,
  facts: KnownGameFacts,
) {
  return CurrentSceneFrameSchema.parse({
    kind: "current_scene",
    frameId: `mortal-review:${reportIdHash}:${decision.decisionEventRef}`,
    scope: { kind: "applied_decision" },
    sceneRef: decision.decisionEventRef,
    facts: [{
      factId: facts.factSetId,
      provenance: "raw_replay",
    }],
  });
}

// M6-A3: the candidate gate is per decision surface. Raw mjai candidate
// types outside a surface's closed set are a defensive fail-closed path
// (`mortal_candidate_action_not_supported`) — live reports are expected to
// stay inside the set.
const supportedCandidateTypesByWindowKind: Readonly<
  Record<string, ReadonlySet<string>>
> = {
  // "agari" is accepted alongside "hora": Mortal's win action serialization
  // has been seen under both vocabularies (mjai event vs ACTION_SPACE label).
  self_turn: new Set([
    "dahai",
    "reach",
    "ankan",
    "kakan",
    "hora",
    "agari",
    "ryukyoku",
  ]),
  // Riichi requires a concealed hand; a chi/pon call opens it, so a
  // post-call window's candidate set is plain discards only.
  post_call_discard: new Set(["dahai"]),
  // Riichi is declared (not yet accepted) at this window: the same-turn
  // discard is locked, so only the plain discard remains.
  post_riichi_discard: new Set(["dahai"]),
};

export function supportedCandidateTypesForWindow(
  windowKind: string,
): ReadonlySet<string> | null {
  return supportedCandidateTypesByWindowKind[windowKind] ?? null;
}

function isSupportedEntry(
  entry: MortalReportDecisionEntry,
  decision: ReplayedDecision,
): boolean {
  const allowed = supportedCandidateTypesForWindow(
    decision.snapshot.privateState.decisionWindow.kind,
  );
  if (allowed === null) return false;
  return entry.details.length > 0 &&
    entry.details.every((detail) => allowed.has(detail.action.type));
}

function collectIdentityMatches(
  report: MortalFetchedReport,
  decision: ReplayedDecision,
): MortalReportDecisionEntry[] {
  const matches: MortalReportDecisionEntry[] = [];
  for (const kyoku of report.kyokus) {
    for (const entry of kyoku.entries) {
      if (entry.lastActor !== report.playerId) continue;
      if (entryMatchesDecisionIdentity(entry, decision)) matches.push(entry);
    }
  }
  return matches;
}

function makeAnchor(
  report: MortalFetchedReport,
  decision: ReplayedDecision,
  entry: MortalReportDecisionEntry,
): MortalDecisionAnchor {
  return Object.freeze({
    reportIdHash: hashMortalReportId(report.reportId),
    kyoku: entry.kyoku,
    honba: entry.honba,
    junme: entry.junme,
    decisionEventRef: decision.decisionEventRef,
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
  const matches = collectIdentityMatches(report, decision);
  if (matches.length === 0) {
    return { status: "failed", code: "mortal_decision_anchor_not_found" };
  }
  if (matches.length > 1) {
    return { status: "failed", code: "mortal_decision_anchor_ambiguous" };
  }
  const entry = matches[0]!;
  if (!isSupportedEntry(entry, decision)) {
    return { status: "failed", code: "mortal_decision_unsupported_entry" };
  }
  return {
    status: "anchored",
    anchor: makeAnchor(report, decision, entry),
    entry,
  };
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

export function validateMortalReportBinding(
  rawStream: CanonicalEventStream,
  report: MortalFetchedReport,
): void {
  const stream = CanonicalEventStreamSchema.parse(rawStream);
  if (computeCanonicalGameFingerprint(stream) !== report.gameFingerprint) {
    throw new MortalSourceError("mortal_report_game_fingerprint_mismatch");
  }
  if (report.playerId !== stream.selfActor) {
    throw new MortalSourceError("mortal_report_perspective_mismatch");
  }
}

export async function runBoundMortalDecisionReview(input: {
  readonly stream: CanonicalEventStream;
  readonly decision: ReplayedDecision;
  readonly report: MortalFetchedReport;
  readonly entry: MortalReportDecisionEntry;
  readonly engine: HandStructureFactEnginePort;
  readonly now?: () => number;
  readonly frozenAt?: string;
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

    const reportIdHash = hashMortalReportId(input.report.reportId);
    const anchor = makeAnchor(input.report, input.decision, input.entry);

    // P0-1 (M6-A3): the local actual must be a typed action on this surface;
    // every tile stays local-authoritative.
    const localEnvelopes = localActualEnvelopes(input.decision);

    // P6: local actual authority; the Mortal actual is a type-correspondence
    // cross-check only.
    if (
      !mortalActualMatchesLocal(
        input.entry.actual,
        input.decision,
        input.entry.tile,
      )
    ) {
      throw new MortalSourceError("mortal_decision_actual_mismatch");
    }

    // P7: pure projection into the candidate normalizer's action-fact shape.
    const actionFacts = projectActionFacts(input.decision);

    // P8: reuse the structured Mortal import. A kakan candidate needs the
    // upgraded pon ref; the local actual owns it, so it flows in as adapter
    // context for every model row.
    const kakanMeldHint = input.decision.actualAction?.kind === "kakan"
      ? input.decision.actualAction.existingMeldRef
      : undefined;
    const decisionLayerRef = `mortal-review:${reportIdHash}:${input.decision.decisionEventRef}`;
    const comparisonSetId = `mortal-comparison:${reportIdHash}:${input.decision.decisionEventRef}`;
    const imported = importStructuredMortalComparison({
      comparisonSetId,
      decisionLayerRef,
      facts: actionFacts,
      modelCandidates: input.entry.details.map((detail, index) => ({
        actions: [{
          eventRef: candidateEventRef(reportIdHash, input.entry, index),
          action: detail.action,
        }],
        probability: detail.probability,
        qValue: detail.qValue,
        ...(kakanMeldHint === undefined
          ? {}
          : { existingMeldRef: kakanMeldHint }),
      })),
      actual: { actions: localEnvelopes },
    });
    if (imported.status === "incomplete") {
      return {
        status: "failed",
        code: "mortal_decision_unsupported_entry",
        diagnostics: Object.freeze([...imported.diagnostics]),
      };
    }
    if (imported.status === "not_comparable") {
      return {
        status: "not_comparable",
        code: imported.code,
        diagnostics: Object.freeze([...imported.windowKinds]),
      };
    }

    // P9: deterministic model evaluation. For a riichi window the actual
    // riichi_discard realizes the tile-less declare_riichi alternative, so the
    // scored carrier is the correspondence's model ref; ordinary actions carry
    // their own exact ref.
    const actualCandidate = imported.comparisonSet.candidates.find(
      (candidate) => candidate.origins.includes("actual"),
    );
    if (actualCandidate === undefined) {
      throw new MortalSourceError("mortal_decision_actual_mismatch");
    }
    const correspondence = imported.comparisonSet.correspondences?.find(
      (item) => item.actualActionRef === actualCandidate.actionRef,
    );
    const evaluationBuilt = buildMortalModelEvaluation({
      evaluationId: `mortal-evaluation:${reportIdHash}:${input.decision.decisionEventRef}`,
      comparisonSetId: imported.comparisonSet.comparisonSetId,
      decisionLayerRef: imported.comparisonSet.decisionLayerRef,
      engineVersion: input.report.version,
      adapterVersion: MORTAL_ADAPTER_VERSION,
      actualActionRef: actualCandidate.actionRef,
      scoredActualModelActionRef:
        correspondence?.scoredModelActionRef ?? actualCandidate.actionRef,
      detailPolicy: freezeDetailPolicy({
        policyVersion: DECISION_DETAIL_POLICY_VERSION,
        frozenAt: input.frozenAt ?? new Date(now()).toISOString(),
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
        frame: buildFrame(reportIdHash, input.decision, facts),
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

export async function runMortalSingleDecisionReview(input: {
  readonly stream: CanonicalEventStream;
  readonly decision: ReplayedDecision;
  readonly report: MortalFetchedReport;
  readonly engine: HandStructureFactEnginePort;
  readonly now?: () => number;
}): Promise<MortalSingleDecisionReviewResult> {
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

    // Whole-report preflight: game identity + perspective.
    validateMortalReportBinding(stream, input.report);

    // P0-1 (M6-A3): the local actual must be a typed action on this surface.
    localActualEnvelopes(input.decision);

    // P5: exact 1:1 anchor.
    const anchored = anchorEntry(input.report, input.decision);
    if (anchored.status === "failed") {
      throw new MortalSourceError(anchored.code);
    }

    return await runBoundMortalDecisionReview({
      stream,
      decision: input.decision,
      report: input.report,
      entry: anchored.entry,
      engine: input.engine,
      ...(input.now === undefined ? {} : { now: input.now }),
    });
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
