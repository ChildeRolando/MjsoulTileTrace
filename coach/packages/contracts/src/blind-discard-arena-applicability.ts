import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ArenaBlindDiscardCandidateSchema,
  ArenaBlindObservationSchema,
  ArenaCaseRefSchema,
  ArenaOpaqueReferenceSchema,
  ArenaRagPassageSchema,
  ArenaRagResultSchema,
  ArenaRagRetrievalMetadataSchema,
  type ArenaBlindObservation,
  type ArenaRagResult,
} from "./blind-discard-arena.js";
import { LlmTokenUsageSchema } from "./coach.js";
import { libriichiRuleCanonicalJson } from "./libriichi-rules.js";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

export const ARENA_RAG_APPLICABILITY_GATE_ID = "blind-discard-arena-rag-applicability";
export const ARENA_RAG_APPLICABILITY_GATE_VERSION = "applicability-v1" as const;
export const ARENA_RAG_APPLICABILITY_PROMPT_VERSION = "arena-rag-applicability-method/v1" as const;

/**
 * The only condition the program itself can decide (spec §4.3.4). Every other
 * applicability question stays a model judgment checked by independent review.
 */
export const ARENA_RAG_GATED_CONDITIONS = Object.freeze(["complete-visibility-only"] as const);
export const ARENA_RAG_VISIBILITY_FIELDS = Object.freeze([
  "concealedTiles",
  "currentDraw",
  "rivers",
  "doraIndicators",
  "melds",
  "calledDiscardMarkers",
] as const);

export const ARENA_RAG_APPLICABILITY_FAILURE_CODES = Object.freeze([
  "provider_unavailable",
  "provider_error",
  "timeout",
  "cancelled",
  "invalid_response",
  "invalid_binding",
  "receipt_too_large",
  "call_budget_exhausted",
  "output_budget_exhausted",
  "input_too_large",
  "orphan_call",
] as const);
export const ArenaRagApplicabilityFailureCodeSchema = z.enum(ARENA_RAG_APPLICABILITY_FAILURE_CODES);
export type ArenaRagApplicabilityFailureCode = z.infer<typeof ArenaRagApplicabilityFailureCodeSchema>;

export const ArenaRagApplicabilityLimitsSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-rag-applicability-limits/v1"),
  maxCallsPerCase: z.number().int().min(1),
  maxCallDurationMs: z.number().int().min(1),
  maxInputBytes: z.number().int().min(1),
  maxOutputTokens: z.number().int().positive().safe(),
  maxOutputBytes: z.number().int().min(1),
  maxOutputBytesPerRun: z.number().int().min(1),
  maxReceiptBytes: z.number().int().min(1),
}).strict();
export type ArenaRagApplicabilityLimits = z.infer<typeof ArenaRagApplicabilityLimitsSchema>;

/** Independent of `ARENA_RUN_LIMITS_V1`: the 10s tool budget must not cover reflection. */
export const ARENA_RAG_APPLICABILITY_LIMITS_V1: ArenaRagApplicabilityLimits = Object.freeze({
  schemaVersion: "blind-discard-arena-rag-applicability-limits/v1" as const,
  maxCallsPerCase: 4,
  maxCallDurationMs: 45_000,
  maxInputBytes: 48 * 1024,
  maxOutputTokens: 2048,
  maxOutputBytes: 4 * 1024,
  maxOutputBytesPerRun: 16 * 1024,
  maxReceiptBytes: 8 * 1024,
});

export const ARENA_RAG_APPLICABILITY_LIMIT_MAXIMA = Object.freeze({
  maxCallsPerCase: 8,
  maxCallDurationMs: 90_000,
  maxInputBytes: 64 * 1024,
  maxOutputTokens: 4096,
  maxOutputBytes: 16 * 1024,
  maxOutputBytesPerRun: 64 * 1024,
  maxReceiptBytes: 16 * 1024,
});

/** Partial overrides exist for tests and experiment profiles only; the product CLI never exposes them. */
export function resolveArenaRagApplicabilityLimits(
  raw?: Partial<ArenaRagApplicabilityLimits>,
): ArenaRagApplicabilityLimits {
  const limits = ArenaRagApplicabilityLimitsSchema.parse({ ...ARENA_RAG_APPLICABILITY_LIMITS_V1, ...raw });
  for (const key of Object.keys(ARENA_RAG_APPLICABILITY_LIMIT_MAXIMA) as Array<keyof typeof ARENA_RAG_APPLICABILITY_LIMIT_MAXIMA>) {
    if (limits[key] > ARENA_RAG_APPLICABILITY_LIMIT_MAXIMA[key]) {
      throw new Error("arena_rag_applicability_limit_exceeds_v1_maximum");
    }
  }
  return limits;
}

/** The observation schema is a refined object, so its white-list fields are read from the base object. */
const observationFields = ArenaBlindObservationSchema.innerType().shape;

/** Injection-judgment facts: the same blind observation the generator receives, minus tool permissions. */
export const ArenaRagApplicabilityFactsSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-rag-applicability-facts/v1"),
  caseRef: ArenaCaseRefSchema,
  ruleSet: observationFields.ruleSet,
  decision: observationFields.decision,
  visibleState: observationFields.visibleState,
  candidates: z.array(ArenaBlindDiscardCandidateSchema).min(2).max(46),
}).strict();
export type ArenaRagApplicabilityFacts = z.infer<typeof ArenaRagApplicabilityFactsSchema>;

/**
 * Explicit key table: `tools` and anything else outside the blind white list
 * must never reach the selector, so no spread of the whole observation is used.
 */
export function projectArenaRagApplicabilityFacts(
  observation: ArenaBlindObservation,
): ArenaRagApplicabilityFacts {
  const parsed = ArenaBlindObservationSchema.parse(observation);
  const state = parsed.visibleState;
  return ArenaRagApplicabilityFactsSchema.parse({
    schemaVersion: "blind-discard-arena-rag-applicability-facts/v1",
    caseRef: parsed.caseRef,
    ruleSet: parsed.ruleSet,
    decision: {
      selfActor: parsed.decision.selfActor,
      windowKind: parsed.decision.windowKind,
      roundOrdinal: parsed.decision.roundOrdinal,
    },
    visibleState: {
      roundWind: state.roundWind,
      hand: state.hand,
      honba: state.honba,
      riichiSticks: state.riichiSticks,
      dealer: state.dealer,
      scores: state.scores,
      seatWinds: state.seatWinds,
      remainingDraws: state.remainingDraws,
      doraIndicators: state.doraIndicators,
      rivers: state.rivers,
      melds: state.melds,
      riichiStates: state.riichiStates,
      self: {
        concealedTiles: state.self.concealedTiles,
        currentDraw: state.self.currentDraw,
        meldRefs: state.self.meldRefs,
        furiten: state.self.furiten,
        evidenceRefs: state.self.evidenceRefs,
      },
      completeness: state.completeness,
    },
    candidates: parsed.candidates.map((candidate) => ({
      actionRef: candidate.actionRef,
      tile: candidate.tile,
      discardMode: candidate.discardMode,
    })),
  });
}

/** Frozen v1 fact path table (spec §4.3.2). `tools` is deliberately absent. */
export const ARENA_RAG_VISIBLE_FACT_PATHS = Object.freeze([
  "ruleSet",
  "decision.selfActor",
  "decision.windowKind",
  "decision.roundOrdinal",
  "visibleState.roundWind",
  "visibleState.hand",
  "visibleState.honba",
  "visibleState.riichiSticks",
  "visibleState.dealer",
  "visibleState.scores",
  "visibleState.seatWinds",
  "visibleState.remainingDraws",
  "visibleState.doraIndicators",
  "visibleState.rivers",
  "visibleState.melds",
  "visibleState.riichiStates",
  "visibleState.self.concealedTiles",
  "visibleState.self.currentDraw",
  "visibleState.self.meldRefs",
  "visibleState.self.furiten",
  "visibleState.self.evidenceRefs",
  "visibleState.completeness.roundContext",
  "visibleState.completeness.ruleSet",
  "visibleState.completeness.scores",
  "visibleState.completeness.doraIndicators",
  "visibleState.completeness.rivers",
  "visibleState.completeness.calledDiscardMarkers",
  "visibleState.completeness.melds",
  "visibleState.completeness.remainingDraws",
  "visibleState.completeness.concealedTiles",
  "visibleState.completeness.currentDraw",
  "visibleState.completeness.responseOpportunities",
  "visibleState.completeness.furiten",
  "candidates",
] as const);
export type ArenaRagVisibleFactPath = (typeof ARENA_RAG_VISIBLE_FACT_PATHS)[number];
export const ArenaRagVisibleFactPathSchema = z.enum(ARENA_RAG_VISIBLE_FACT_PATHS);

export function arenaRagVisibleFacts(
  observation: ArenaBlindObservation,
): Readonly<Record<ArenaRagVisibleFactPath, unknown>> {
  const facts = projectArenaRagApplicabilityFacts(observation);
  return Object.freeze({
    ruleSet: facts.ruleSet,
    "decision.selfActor": facts.decision.selfActor,
    "decision.windowKind": facts.decision.windowKind,
    "decision.roundOrdinal": facts.decision.roundOrdinal,
    "visibleState.roundWind": facts.visibleState.roundWind,
    "visibleState.hand": facts.visibleState.hand,
    "visibleState.honba": facts.visibleState.honba,
    "visibleState.riichiSticks": facts.visibleState.riichiSticks,
    "visibleState.dealer": facts.visibleState.dealer,
    "visibleState.scores": facts.visibleState.scores,
    "visibleState.seatWinds": facts.visibleState.seatWinds,
    "visibleState.remainingDraws": facts.visibleState.remainingDraws,
    "visibleState.doraIndicators": facts.visibleState.doraIndicators,
    "visibleState.rivers": facts.visibleState.rivers,
    "visibleState.melds": facts.visibleState.melds,
    "visibleState.riichiStates": facts.visibleState.riichiStates,
    "visibleState.self.concealedTiles": facts.visibleState.self.concealedTiles,
    "visibleState.self.currentDraw": facts.visibleState.self.currentDraw,
    "visibleState.self.meldRefs": facts.visibleState.self.meldRefs,
    "visibleState.self.furiten": facts.visibleState.self.furiten,
    "visibleState.self.evidenceRefs": facts.visibleState.self.evidenceRefs,
    "visibleState.completeness.roundContext": facts.visibleState.completeness.roundContext,
    "visibleState.completeness.ruleSet": facts.visibleState.completeness.ruleSet,
    "visibleState.completeness.scores": facts.visibleState.completeness.scores,
    "visibleState.completeness.doraIndicators": facts.visibleState.completeness.doraIndicators,
    "visibleState.completeness.rivers": facts.visibleState.completeness.rivers,
    "visibleState.completeness.calledDiscardMarkers": facts.visibleState.completeness.calledDiscardMarkers,
    "visibleState.completeness.melds": facts.visibleState.completeness.melds,
    "visibleState.completeness.remainingDraws": facts.visibleState.completeness.remainingDraws,
    "visibleState.completeness.concealedTiles": facts.visibleState.completeness.concealedTiles,
    "visibleState.completeness.currentDraw": facts.visibleState.completeness.currentDraw,
    "visibleState.completeness.responseOpportunities": facts.visibleState.completeness.responseOpportunities,
    "visibleState.completeness.furiten": facts.visibleState.completeness.furiten,
    candidates: facts.candidates,
  } satisfies Record<ArenaRagVisibleFactPath, unknown>);
}

export function projectArenaRagVisibleFact(
  path: string,
  observation: ArenaBlindObservation,
): unknown {
  const parsed = ArenaRagVisibleFactPathSchema.parse(path);
  return arenaRagVisibleFacts(observation)[parsed];
}

/** Deterministic exception only: `complete-visibility-only` is either satisfied or not. */
export function isApplicabilityConditionSatisfied(
  condition: string,
  observation: ArenaBlindObservation,
): boolean {
  if (condition !== "complete-visibility-only") throw new Error("arena_rag_gated_condition_unsupported");
  const parsed = ArenaBlindObservationSchema.parse(observation);
  const completeness = parsed.visibleState.completeness;
  return ARENA_RAG_VISIBILITY_FIELDS.every((field) => completeness[field] === "complete");
}

/**
 * Visible evidence domain: opaque refs that actually occur in the blind DTO.
 * It is deliberately separate from the retrieved passage identity domain.
 */
export function arenaVisibleEvidenceRefs(observation: ArenaBlindObservation): ReadonlySet<string> {
  const state = ArenaBlindObservationSchema.parse(observation).visibleState;
  const optional = (value: string | null | undefined): string[] =>
    value === null || value === undefined ? [] : [value];
  const meldRefs = state.melds.flatMap((meld) => [
    meld.meldRef,
    meld.createdEventRef,
    meld.latestEventRef,
    ...("calledDiscardEventRef" in meld ? optional(meld.calledDiscardEventRef) : []),
    ...("upgradedPonEventRef" in meld ? optional(meld.upgradedPonEventRef) : []),
  ]);
  return new Set<string>([
    ...state.self.evidenceRefs,
    ...optional(state.self.currentDraw?.sourceRef),
    ...state.self.meldRefs,
    ...Object.values(state.self.furiten).flatMap((component) => component.evidenceIds),
    ...state.rivers.flatMap((river) => river.flatMap((discard) => [
      discard.sourceRef,
      ...optional(discard.riichiDeclarationRef),
      ...optional(discard.calledByRef),
    ])),
    ...meldRefs,
    ...state.riichiStates.flatMap((riichi) => [
      ...optional(riichi.declarationEventRef),
      ...optional(riichi.acceptanceEventRef),
    ]),
  ]);
}

export class ArenaRagApplicabilityBindingError extends Error {
  constructor(readonly code:
    | "arena_rag_verdict_count_mismatch"
    | "arena_rag_verdict_order_mismatch"
    | "arena_rag_verdict_ref_duplicate"
    | "arena_rag_evidence_ref_not_visible"
    | "arena_rag_fact_path_not_frozen"
    | "arena_rag_fact_value_mismatch") {
    super(code);
  }
}

/** Passage identity domain only: exactly one verdict per candidate, in candidate order. */
export function assertPassageBinding(
  verdicts: readonly { sourceRef: string }[],
  candidateSourceRefs: readonly string[],
): void {
  if (verdicts.length !== candidateSourceRefs.length) {
    throw new ArenaRagApplicabilityBindingError("arena_rag_verdict_count_mismatch");
  }
  verdicts.forEach((verdict, index) => {
    if (verdict.sourceRef !== candidateSourceRefs[index]) {
      throw new ArenaRagApplicabilityBindingError("arena_rag_verdict_order_mismatch");
    }
  });
  const refs = verdicts.map((verdict) => verdict.sourceRef);
  if (new Set(refs).size !== refs.length) {
    throw new ArenaRagApplicabilityBindingError("arena_rag_verdict_ref_duplicate");
  }
}

/**
 * Visible premises only: an evidence ref must belong to the blind DTO domain,
 * a fact premise must name a frozen path whose projected value matches.
 * Neither check looks at the retrieved passage refs.
 */
export function assertVisiblePremises(
  verdicts: readonly { premises: readonly ArenaRagApplicabilityPremise[] }[],
  observation: ArenaBlindObservation,
): void {
  const visibleRefs = arenaVisibleEvidenceRefs(observation);
  const facts = arenaRagVisibleFacts(observation);
  for (const verdict of verdicts) {
    for (const premise of verdict.premises) {
      if (premise.kind === "evidence-ref") {
        if (!visibleRefs.has(premise.ref)) {
          throw new ArenaRagApplicabilityBindingError("arena_rag_evidence_ref_not_visible");
        }
        continue;
      }
      if (!Object.hasOwn(facts, premise.path)) {
        throw new ArenaRagApplicabilityBindingError("arena_rag_fact_path_not_frozen");
      }
      const projected = facts[premise.path as ArenaRagVisibleFactPath];
      if (libriichiRuleCanonicalJson(premise.observedValue) !== libriichiRuleCanonicalJson(projected)) {
        throw new ArenaRagApplicabilityBindingError("arena_rag_fact_value_mismatch");
      }
    }
  }
}

export const ArenaRagApplicabilityBasisSchema = z.enum([
  "declared-condition-not-met",
  "visible-fact-mismatch",
  "context-mismatch",
]);
export type ArenaRagApplicabilityBasis = z.infer<typeof ArenaRagApplicabilityBasisSchema>;

const ArenaRagApplicabilityReasonSchema = z.string().trim().min(4).max(240);

export const ArenaRagApplicabilityEvidencePremiseSchema = z.object({
  kind: z.literal("evidence-ref"),
  ref: ArenaOpaqueReferenceSchema,
}).strict();

export const ArenaRagApplicabilityFactPremiseSchema = z.object({
  kind: z.literal("fact"),
  path: ArenaRagVisibleFactPathSchema,
  // `undefined` is rejected so a missing key fails closed instead of comparing as absent.
  observedValue: z.unknown().refine((value) => value !== undefined, "arena_rag_fact_observed_value_missing"),
}).strict();

export const ArenaRagApplicabilityPremiseSchema = z.discriminatedUnion("kind", [
  ArenaRagApplicabilityEvidencePremiseSchema,
  ArenaRagApplicabilityFactPremiseSchema,
]);
export type ArenaRagApplicabilityPremise = z.infer<typeof ArenaRagApplicabilityPremiseSchema>;

/**
 * `premises` is capped but not floored for `irrelevant`: an empty array is a
 * mechanical per-verdict downgrade (§4.3.3), not a whole-batch failure.
 */
const ArenaRagApplicabilityPremisesSchema = z.array(ArenaRagApplicabilityPremiseSchema).max(4);

export const ArenaRagApplicabilityVerdictSchema = z.discriminatedUnion("verdict", [
  z.object({
    sourceRef: ArenaOpaqueReferenceSchema,
    verdict: z.literal("relevant"),
    reason: ArenaRagApplicabilityReasonSchema,
    premises: ArenaRagApplicabilityPremisesSchema,
  }).strict(),
  z.object({
    sourceRef: ArenaOpaqueReferenceSchema,
    verdict: z.literal("uncertain"),
    reason: ArenaRagApplicabilityReasonSchema,
    premises: ArenaRagApplicabilityPremisesSchema,
  }).strict(),
  z.object({
    sourceRef: ArenaOpaqueReferenceSchema,
    verdict: z.literal("irrelevant"),
    reason: ArenaRagApplicabilityReasonSchema,
    basis: ArenaRagApplicabilityBasisSchema,
    premises: ArenaRagApplicabilityPremisesSchema,
  }).strict(),
]);
export type ArenaRagApplicabilityVerdict = z.infer<typeof ArenaRagApplicabilityVerdictSchema>;

export const ArenaRagApplicabilityVerdictsSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-rag-applicability-verdicts/v1"),
  caseRef: ArenaCaseRefSchema,
  retrievalDigest: Sha256Schema,
  verdicts: z.array(ArenaRagApplicabilityVerdictSchema).min(1).max(5),
}).strict();
export type ArenaRagApplicabilityVerdicts = z.infer<typeof ArenaRagApplicabilityVerdictsSchema>;

export const ArenaRagApplicabilityReflectionStatusSchema = z.enum([
  "applied",
  "degraded",
  "failed",
  "skipped",
]);
export type ArenaRagApplicabilityReflectionStatus = z.infer<typeof ArenaRagApplicabilityReflectionStatusSchema>;

/** Model-visible result: dropped passages, their refs, and the reasons never appear here. */
export const ArenaRagApplicabilityResultSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-rag-applicability-result/v1"),
  caseRef: ArenaCaseRefSchema,
  mode: z.literal("local"),
  status: z.enum(["filtered", "degraded", "no_hits"]),
  passages: z.array(ArenaRagPassageSchema).max(5),
  sourceRefs: z.array(ArenaOpaqueReferenceSchema).max(5),
  retrieval: ArenaRagRetrievalMetadataSchema,
  corpusVersion: z.string().trim().min(1).max(80),
  retrieverVersion: z.string().trim().min(1).max(80),
  gate: z.object({
    gateId: z.literal(ARENA_RAG_APPLICABILITY_GATE_ID),
    gateVersion: z.literal(ARENA_RAG_APPLICABILITY_GATE_VERSION),
    reflectionStatus: ArenaRagApplicabilityReflectionStatusSchema,
    failureCode: ArenaRagApplicabilityFailureCodeSchema.nullable(),
    candidateCount: z.number().int().nonnegative().max(5),
    retainedCount: z.number().int().nonnegative().max(5),
    droppedCount: z.number().int().nonnegative().max(5),
  }).strict(),
}).strict().superRefine((value, context) => {
  const passageRefs = value.passages.map((passage) => passage.sourceRef);
  if (JSON.stringify(value.sourceRefs) !== JSON.stringify(passageRefs) ||
      JSON.stringify(value.retrieval.resultRefs) !== JSON.stringify(passageRefs) ||
      new Set(passageRefs).size !== passageRefs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceRefs"], message: "arena_rag_applicability_refs_mismatch" });
  }
  if (value.gate.candidateCount !== value.gate.retainedCount + value.gate.droppedCount ||
      value.gate.retainedCount !== value.passages.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["gate"], message: "arena_rag_applicability_counts_mismatch" });
  }
  if ((value.status === "no_hits") !== (value.gate.candidateCount === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "arena_rag_applicability_status_invalid" });
  }
  value.passages.forEach((passage, index) => {
    if (passage.corpusVersion !== value.corpusVersion || passage.retrieverVersion !== value.retrieverVersion) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["passages", index], message: "arena_rag_applicability_passage_version_mismatch" });
    }
  });
});
export type ArenaRagApplicabilityResult = z.infer<typeof ArenaRagApplicabilityResultSchema>;

export const ArenaRagApplicabilityReceiptVerdictSchema = z.object({
  sourceRef: ArenaOpaqueReferenceSchema,
  /** What the selector said; kept next to the effective outcome for independent review. */
  verdict: z.enum(["relevant", "uncertain", "irrelevant"]),
  effectiveVerdict: z.enum(["relevant", "uncertain", "irrelevant"]),
  reason: ArenaRagApplicabilityReasonSchema,
  basis: ArenaRagApplicabilityBasisSchema.nullable(),
  premises: ArenaRagApplicabilityPremisesSchema,
  downgradeReason: z.string().trim().min(1).max(120).nullable(),
}).strict().superRefine((value, context) => {
  if (value.basis !== null && value.verdict !== "irrelevant") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["basis"], message: "arena_rag_receipt_basis_invalid" });
  }
  const downgraded = value.verdict !== value.effectiveVerdict;
  if ((value.downgradeReason !== null) !== downgraded) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["downgradeReason"], message: "arena_rag_receipt_downgrade_invalid" });
  }
});

export const ArenaRagApplicabilityReceiptSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-rag-applicability-receipt/v1"),
  caseRef: ArenaCaseRefSchema,
  gateVersion: z.literal(ARENA_RAG_APPLICABILITY_GATE_VERSION),
  promptVersion: z.literal(ARENA_RAG_APPLICABILITY_PROMPT_VERSION),
  retrievalDigest: Sha256Schema,
  status: ArenaRagApplicabilityReflectionStatusSchema,
  failureCode: ArenaRagApplicabilityFailureCodeSchema.nullable(),
  candidateCount: z.number().int().nonnegative().max(5),
  retainedCount: z.number().int().nonnegative().max(5),
  droppedCount: z.number().int().nonnegative().max(5),
  uncertainRetainedCount: z.number().int().nonnegative().max(5),
  downgradedVerdictCount: z.number().int().nonnegative().max(5),
  verdicts: z.array(ArenaRagApplicabilityReceiptVerdictSchema).max(5),
  droppedRefs: z.array(ArenaOpaqueReferenceSchema).max(5),
  usage: LlmTokenUsageSchema.nullable(),
  elapsedMs: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (value.candidateCount !== value.retainedCount + value.droppedCount ||
      value.droppedRefs.length !== value.droppedCount ||
      (value.verdicts.length !== 0 && value.verdicts.length !== value.candidateCount)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidateCount"], message: "arena_rag_receipt_counts_mismatch" });
  }
  if (value.uncertainRetainedCount !== value.verdicts.filter((entry) => entry.effectiveVerdict === "uncertain").length ||
      value.downgradedVerdictCount !== value.verdicts.filter((entry) => entry.verdict !== entry.effectiveVerdict).length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["uncertainRetainedCount"], message: "arena_rag_receipt_verdict_counts_mismatch" });
  }
});
export type ArenaRagApplicabilityReceipt = z.infer<typeof ArenaRagApplicabilityReceiptSchema>;

/**
 * Binds one verdict batch to exactly this retrieval result, so a stale or
 * transplanted batch can never be applied to a different candidate set.
 */
export function arenaRagRetrievalDigest(result: ArenaRagResult): string {
  const parsed = ArenaRagResultSchema.parse(result);
  return createHash("sha256").update(libriichiRuleCanonicalJson({
    caseRef: parsed.caseRef,
    retrieval: {
      query: parsed.retrieval.query,
      context: parsed.retrieval.context,
      filter: parsed.retrieval.filter,
      limit: parsed.retrieval.limit,
    },
    corpusVersion: parsed.corpusVersion,
    retrieverVersion: parsed.retrieverVersion,
    passages: parsed.passages.map((passage) => ({
      sourceRef: passage.sourceRef,
      sourceTitle: passage.sourceTitle,
      documentLocation: passage.documentLocation,
      content: passage.content,
      applicableWhen: passage.applicableWhen,
    })),
  }), "utf8").digest("hex");
}
