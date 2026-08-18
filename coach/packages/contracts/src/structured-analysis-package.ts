/**
 * M6-C Slice 1: `StructuredAnalysisPackage` contract freeze.
 *
 * Spec: coach/docs/specs/2026-08-18-m6-c-structured-analysis-package-design.md
 * (Slice 1 — 冻结 contract; CR-1..CR-6, D4).
 *
 * The package is the whole-game, deterministically built, auditable analysis
 * artifact — the evidence source of truth for ContextGraph projection
 * (ADR-0004) and for ReviewReport generation (M6-D2). It is a locally safe /
 * renderer-safe evidence artifact and is NEVER an LLM transport boundary
 * (CR-1): only GraphContextSlice may cross the LLM boundary.
 *
 * This slice freezes:
 *  - CR-2 contract ownership: outcome / reason / proof schemas belong HERE, in
 *    the contracts package; the reasoning package imports them and owns no
 *    duplicate unions.
 *  - CR-3 evidence registry shape (self-contained, resolvable evidence).
 *  - CR-4 stable identity semantics (decisionId / packageId / evidenceId
 *    namespaces). Concrete string encodings beyond the rules below are builder
 *    (Slice 2) design.
 *  - CR-5 determinism / time semantics: semanticContentHash excludes artifact
 *    creation metadata; ModelEvaluation is auditable model evidence, not a
 *    hard Mahjong fact.
 *  - CR-6 schema validity ≠ analysis completeness: a structurally valid
 *    package may faithfully record an incomplete / failed analysis.
 *
 * 决策载荷一致性 (per-decision payload binding): only `analysis_ready`
 * decisions carry the full analysis payload (comparisonSet, ledgers,
 * differences, modelEvaluation); failed / skipped decisions carry their
 * reason / proof and no analysis payload — the discriminated union makes it
 * impossible to fake an analyzed shape on a failed decision.
 */
import { z } from "zod";
import { RiichiActionSchema } from "./actions.js";
import { parseCanonicalEventRef } from "./event-stream.js";
import { EngineIdentitySchema } from "./fact-engine.js";
import {
  CandidateFactorLedgerSchema,
  DeterministicPreferenceSchema,
  FactorDifferenceSchema,
} from "./factor-ledger.js";
import { KnownGameFactsSchema } from "./known-game-facts.js";
import { ModelEvaluationSchema } from "./model-evaluation.js";
import { StructuredComparisonSetSchema } from "./structured-comparison.js";

const ActorSchema = z.number().int().min(0).max(3);

// ---------------------------------------------------------------------------
// CR-2 — outcome / reason / proof schema (contract ownership)
// ---------------------------------------------------------------------------

/** The frozen seven-value Mortal decision outcome (M6-A4.0 superseded the
 *  six-value + "on demand" wording; the seven values are never reduced). */
export const MortalDecisionOutcomeSchema = z.enum([
  "analysis_ready",
  "unsupported_action",
  // M6-A4.0: a legal state decided purely by the local candidate enumeration
  // (count = 1 -> Mortal emits no row by definition) BEFORE any source lookup;
  // carries the single-candidate proof.
  "source_row_not_expected",
  // Integrity-failure semantics: a green acceptance run requires 0.
  "no_mortal_entry",
  "binding_mismatch",
  "model_output_incomplete",
  "analysis_blocked",
]);
export type MortalDecisionOutcome = z.infer<typeof MortalDecisionOutcomeSchema>;

export const MortalUnsupportedReasonSchema = z.enum([
  "local_actual_not_represented",
  "mortal_candidate_action_not_supported",
  "coverage_branch_uncovered",
]);
export type MortalUnsupportedReason = z.infer<
  typeof MortalUnsupportedReasonSchema
>;

export const MortalBindingMismatchReasonSchema = z.enum([
  "multiple_mortal_entries_for_decision",
  "mortal_entry_matches_multiple_decisions",
  "source_entry_reuse",
  "source_order_violation",
  "mortal_actual_mismatch",
  // M6-A4.0: a locally-proven single-candidate window expects NO source row; a
  // compatible source row existing anyway is an integrity failure.
  "unexpected_source_row_present",
]);
export type MortalBindingMismatchReason = z.infer<
  typeof MortalBindingMismatchReasonSchema
>;

export const MortalModelIncompleteReasonSchema = z.enum([
  "actual_action_not_scored",
  "duplicate_model_action",
  "invalid_model_candidate",
  "fewer_than_two_distinct_actions",
  "cross_decision_window",
  "candidate_normalization_failed",
  "terminal_window_action_unsupported",
]);
export type MortalModelIncompleteReason = z.infer<
  typeof MortalModelIncompleteReasonSchema
>;

export const MortalAnalysisBlockedReasonSchema = z.enum([
  "fact_engine_failure",
  "structured_analysis_assembly_failure",
]);
export type MortalAnalysisBlockedReason = z.infer<
  typeof MortalAnalysisBlockedReasonSchema
>;

/** The full Mortal decision reason union (CR-2: binding / unsupported /
 *  model-incomplete / analysis-blocked). */
export const MortalDecisionReasonSchema = z.union([
  MortalUnsupportedReasonSchema,
  MortalBindingMismatchReasonSchema,
  MortalModelIncompleteReasonSchema,
  MortalAnalysisBlockedReasonSchema,
]);
export type MortalDecisionReason = z.infer<typeof MortalDecisionReasonSchema>;

/** Proof that a decision window is single-candidate (M6-A4.0 / A4.2). The
 *  proof is a LOCAL expectation decided before any source lookup. */
export const SingleCandidateProofShapeSchema = z.enum([
  "riichi_accepted_forced_tsumogiri",
  "riichi_declaration_unique_tenpai_discard",
  // M6-A4.2: a response window whose isomorphic local enumeration proves only
  // `none` (pass) is legal.
  "response_single_candidate",
]);
export type SingleCandidateProofShape = z.infer<
  typeof SingleCandidateProofShapeSchema
>;

export const SingleCandidateProofSchema = z.object({
  shape: SingleCandidateProofShapeSchema,
  candidateCount: z.literal(1),
}).strict();
export type SingleCandidateProof = z.infer<typeof SingleCandidateProofSchema>;

/** The provider-scoped analysis verdict for the Mortal provider (CR-2). The
 *  seven-value outcome stays provider-scoped: it is never disguised as a
 *  provider-neutral truth shared by future models (e.g. Akagi). */
export const MortalAnalysisProviderSchema = z.object({
  kind: z.literal("mortal"),
  outcome: MortalDecisionOutcomeSchema,
  reason: MortalDecisionReasonSchema.nullable(),
  singleCandidateProof: SingleCandidateProofSchema.nullable().optional(),
}).strict();
export type MortalAnalysisProvider = z.infer<
  typeof MortalAnalysisProviderSchema
>;

/** Provider-scoped analysis verdict union. Discriminated by `kind` so a
 *  future `kind: "akagi"` variant is an additive extension — today anything
 *  other than "mortal" fails closed. */
export const AnalysisProviderSchema = z.discriminatedUnion("kind", [
  MortalAnalysisProviderSchema,
]);
export type AnalysisProvider = z.infer<typeof AnalysisProviderSchema>;

// ---------------------------------------------------------------------------
// CR-4 — stable decision identity semantics
// ---------------------------------------------------------------------------

/** Replay partition of a decision window: the reviewed player's own turn
 *  surface, or the response surface (triggered by an opponent's
 *  discard/kakan). */
export const DecisionSurfaceSchema = z.enum(["self", "response"]);
export type DecisionSurface = z.infer<typeof DecisionSurfaceSchema>;

/**
 * `decisionId` identity semantics (frozen in Slice 1, CR-4):
 *
 *   game identity + self actor + surface (self/response) + decision window
 *   kind + triggerEventRef
 *
 * The concrete string encoding is implementation design, but the semantic
 * requirements are contract:
 *  - same canonical stream + same decision window -> same `decisionId`;
 *  - stable across reruns (no wall-clock in the id);
 *  - NOT guaranteed stable across mapper versions — mapper-version changes
 *    that alter canonical event refs are recorded via `componentVersions`.
 */
export const DecisionIdSchema = z.string().min(1);
export type DecisionId = z.infer<typeof DecisionIdSchema>;

/** Frozen decision-window kinds (mirrors DecisionWindowSchema in actions.ts). */
export const DecisionWindowKindSchema = z.enum([
  "self_turn",
  "discard_response",
  "kan_response",
  "post_call_discard",
  "post_riichi_discard",
]);
export type DecisionWindowKind = z.infer<typeof DecisionWindowKindSchema>;

/** Renderer-safe / locally auditable normalized decision context (CR-1). Only
 *  anonymous seats/roles and the normalized fields rendering needs — no
 *  account IDs, nicknames, tokens, paipu download URLs, raw bytes, or
 *  cookies. */
export const NormalizedDecisionContextSchema = z.object({
  decisionWindowKind: DecisionWindowKindSchema,
  /** Anonymous seat (0-3); never an account identifier. */
  selfActor: ActorSchema,
  triggerEventRef: z.string().min(1),
  /** The typed local actual action (local-authoritative, ADR-0001); null for
   *  a pure round end with no representable self action. */
  actualAction: RiichiActionSchema.nullable(),
}).strict();
export type NormalizedDecisionContext = z.infer<
  typeof NormalizedDecisionContextSchema
>;

// ---------------------------------------------------------------------------
// CR-3 — EvidenceId and the evidence registry
// ---------------------------------------------------------------------------

/** `EvidenceId = string` is not enough for provenance architecture (CR-3):
 *  every referenced evidence resolves into the package's evidence registry. */
export const EvidenceIdSchema = z.string().min(1);
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;

export const EvidenceKindSchema = z.enum([
  "canonical_event",
  "fact_engine_request",
]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

/**
 * CR-4 evidence-id namespace rule (frozen): canonical-event evidence reuses
 * the existing canonical event ref namespace (gameId/round/source/sub — see
 * event-stream.ts), which production canonical events already satisfy. No
 * forced rename is imposed on other kinds: the registry's kind/producer/
 * producerVersion already distinguish evidence types, and existing
 * fact-engine request IDs (e.g. `<factSetId>:hand-structure:<stateHash>`)
 * must resolve as-is without an ID-translation layer. Registry keys must be
 * globally unique; per-kind namespaced identities are only introduced if a
 * real collision risk is ever observed.
 */
export const EvidenceRecordSchema = z.object({
  evidenceId: EvidenceIdSchema,
  kind: EvidenceKindSchema,
  producer: z.string().min(1),
  producerVersion: z.string().min(1),
  sourceRefs: z.array(z.string().min(1)),
  /** Sanitized, resolvable descriptor/payload kept INSIDE the package so it
   *  is self-contained for audit: a bare event ref that depends on the raw
   *  cache is not enough. Payload JSON-serializability is validated at the
   *  serialization layer (Slice 3). */
  payload: z.unknown(),
}).strict().superRefine((record, context) => {
  if (
    record.kind === "canonical_event"
    && parseCanonicalEventRef(record.evidenceId) === null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Canonical-event evidence must use the canonical event ref namespace",
      path: ["evidenceId"],
    });
  }
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

/** The package's evidence registry (CR-3 shape, frozen in Slice 1): every
 *  referenced evidence (FactorFact.evidenceIds, FactorDifference.evidenceIds,
 *  KnownGameFacts.evidenceIds, decision-level evidenceIds) resolves to a
 *  record here. Cross-reference resolution of all referenced ids is validated
 *  by the package validator (Slice 3); the registry key is globally unique by
 *  construction and must equal its record's evidenceId. */
export const EvidenceRegistrySchema = z.record(
  EvidenceIdSchema,
  EvidenceRecordSchema,
).superRefine((registry, context) => {
  for (const [key, record] of Object.entries(registry)) {
    if (record.evidenceId !== key) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evidence registry key must equal its record's evidenceId",
        path: [key],
      });
    }
  }
});
export type EvidenceRegistry = z.infer<typeof EvidenceRegistrySchema>;

// ---------------------------------------------------------------------------
// CR-5 / D4 — component versions (deterministic producer chain only)
// ---------------------------------------------------------------------------

/** Version identity of the Mortal source/model used by the analysis (D4:
 *  "Mortal source/model identity/tag"; the report carries `version` and
 *  `review.model_tag`). */
export const MortalModelVersionSchema = z.object({
  identity: z.string().min(1),
  version: z.string().min(1),
  modelTag: z.string().min(1),
}).strict();
export type MortalModelVersion = z.infer<typeof MortalModelVersionSchema>;

/** Component versions carried by the package (D4 + supersession note): ONLY
 *  the deterministic/source/model-analysis production chain. LLM
 *  provider/model, prompt version, output schema version, and
 *  validator/generation versions belong to ReviewReport — the same package
 *  may be re-consumed by different LLM/prompt generations. */
export const ComponentVersionsSchema = z.object({
  packageSchema: z.string().min(1),
  canonicalReplay: z.string().min(1),
  /** Mapper/source adapter version — present when a source mapper applies. */
  mapperAdapter: z.string().min(1).optional(),
  factEngine: EngineIdentitySchema,
  factorPipeline: z.string().min(1),
  mortalSourceModel: MortalModelVersionSchema,
}).strict();
export type ComponentVersions = z.infer<typeof ComponentVersionsSchema>;

// ---------------------------------------------------------------------------
// RecordAnalysis (CR-6)
// ---------------------------------------------------------------------------

/** Aggregate status of one whole-game analysis. `integrity_failed` never
 *  disguises a failed analysis as success. */
export const RecordAnalysisStatusSchema = z.enum([
  "complete",
  "degraded",
  "integrity_failed",
]);
export type RecordAnalysisStatus = z.infer<
  typeof RecordAnalysisStatusSchema
>;

export const RecordAnalysisSchema = z.object({
  recordId: z.string().min(1),
  selfActor: ActorSchema,
  status: RecordAnalysisStatusSchema,
}).strict();
export type RecordAnalysis = z.infer<typeof RecordAnalysisSchema>;

// ---------------------------------------------------------------------------
// DecisionAnalysis (CR-2 + 决策载荷一致性)
// ---------------------------------------------------------------------------

const DecisionContextShape = {
  decisionId: DecisionIdSchema,
  surface: DecisionSurfaceSchema,
  roundOrdinal: z.number().int().nonnegative(),
  normalizedDecisionContext: NormalizedDecisionContextSchema,
  knownGameFacts: KnownGameFactsSchema,
  analysisProvider: MortalAnalysisProviderSchema,
};

/** An `analysis_ready` decision carries the full analysis payload: the
 *  action-bound `StructuredComparisonSet` (which preserves the actionRef →
 *  RiichiAction semantics and the actual ↔ model realization correspondence
 *  — e.g. riichi_discard → declare_riichi — that ModelEvaluation alone cannot
 *  express), ledgers, differences, the optional deterministic preference, and
 *  the ModelEvaluation. `reason` is null by definition. The package validator
 *  (Slice 3) cross-checks comparisonSet ↔ ledgers ↔ modelEvaluation identity
 *  and the correspondence; the contract only fixes the presence here. */
export const AnalysisReadyDecisionSchema = z.object({
  ...DecisionContextShape,
  outcome: z.literal("analysis_ready"),
  comparisonSet: StructuredComparisonSetSchema,
  candidateFactorLedgers: z.array(CandidateFactorLedgerSchema).min(1),
  factorDifferences: z.array(FactorDifferenceSchema),
  /** Null exactly when axes conflict (US 8: preference is optional and null
   *  leaves the trade-off to the coach-judgment layer). */
  deterministicPreference: DeterministicPreferenceSchema.nullable(),
  modelEvaluation: ModelEvaluationSchema,
  /** Decision-level footprint of referenced evidence; every id resolves into
   *  the package evidence registry (CR-3). */
  evidenceIds: z.array(EvidenceIdSchema).min(1),
}).strict();
export type AnalysisReadyDecision = z.infer<typeof AnalysisReadyDecisionSchema>;

const MORTAL_FAILURE_OUTCOMES = [
  "unsupported_action",
  "source_row_not_expected",
  "no_mortal_entry",
  "binding_mismatch",
  "model_output_incomplete",
  "analysis_blocked",
] as const;
type MortalFailureOutcome = typeof MORTAL_FAILURE_OUTCOMES[number];

/** A failed / skipped decision carries its reason/proof and NO analysis
 *  payload — the absent fields make it impossible to fake an analyzed shape.
 *  The decision context (identity, renderer-safe context, KnownGameFacts) is
 *  still present so the renderer can show these states (CR-6 / US 13). */
function failureDecision<const T extends MortalFailureOutcome>(outcome: T) {
  return z.object({
    ...DecisionContextShape,
    outcome: z.literal(outcome),
  }).strict();
}

export const UnsupportedActionDecisionSchema = failureDecision("unsupported_action");
export const SourceRowNotExpectedDecisionSchema = failureDecision("source_row_not_expected");
export const NoMortalEntryDecisionSchema = failureDecision("no_mortal_entry");
export const BindingMismatchDecisionSchema = failureDecision("binding_mismatch");
export const ModelOutputIncompleteDecisionSchema = failureDecision("model_output_incomplete");
export const AnalysisBlockedDecisionSchema = failureDecision("analysis_blocked");

function reasonCategoryMatches(
  outcome: MortalFailureOutcome,
  reason: MortalDecisionReason,
): boolean {
  switch (outcome) {
    case "unsupported_action":
      return MortalUnsupportedReasonSchema.options.includes(
        reason as MortalUnsupportedReason,
      );
    case "binding_mismatch":
      return MortalBindingMismatchReasonSchema.options.includes(
        reason as MortalBindingMismatchReason,
      );
    case "model_output_incomplete":
      return MortalModelIncompleteReasonSchema.options.includes(
        reason as MortalModelIncompleteReason,
      );
    case "analysis_blocked":
      return MortalAnalysisBlockedReasonSchema.options.includes(
        reason as MortalAnalysisBlockedReason,
      );
    default:
      return false;
  }
}

/** One decision entry of the whole-game package (output shape, declared
 *  explicitly from the named variant schemas so declaration emit stays
 *  bounded). The `outcome` discriminator binds the payload at the type
 *  level: only `analysis_ready` carries the comparisonSet + ledgers +
 *  differences + modelEvaluation analysis payload (决策载荷一致性). */
export type DecisionAnalysis =
  | z.infer<typeof AnalysisReadyDecisionSchema>
  | z.infer<typeof UnsupportedActionDecisionSchema>
  | z.infer<typeof SourceRowNotExpectedDecisionSchema>
  | z.infer<typeof NoMortalEntryDecisionSchema>
  | z.infer<typeof BindingMismatchDecisionSchema>
  | z.infer<typeof ModelOutputIncompleteDecisionSchema>
  | z.infer<typeof AnalysisBlockedDecisionSchema>;

/** Input shape for DecisionAnalysisSchema (declared from the named variant
 *  schemas so declaration emit stays bounded; outputs carry zod brands where
 *  inputs do not). */
type DecisionAnalysisInput =
  | z.input<typeof AnalysisReadyDecisionSchema>
  | z.input<typeof UnsupportedActionDecisionSchema>
  | z.input<typeof SourceRowNotExpectedDecisionSchema>
  | z.input<typeof NoMortalEntryDecisionSchema>
  | z.input<typeof BindingMismatchDecisionSchema>
  | z.input<typeof ModelOutputIncompleteDecisionSchema>
  | z.input<typeof AnalysisBlockedDecisionSchema>;

export const DecisionAnalysisSchema: z.ZodType<
  DecisionAnalysis,
  z.ZodTypeDef,
  DecisionAnalysisInput
> = z.discriminatedUnion("outcome", [
  AnalysisReadyDecisionSchema,
  UnsupportedActionDecisionSchema,
  SourceRowNotExpectedDecisionSchema,
  NoMortalEntryDecisionSchema,
  BindingMismatchDecisionSchema,
  ModelOutputIncompleteDecisionSchema,
  AnalysisBlockedDecisionSchema,
]).superRefine((decision, context) => {
  // Identity coherence (Slice 1 review Blocker 3B): the normalized
  // renderer-safe context, KnownGameFacts, and the surface must agree — the
  // package is the authoritative contract ContextGraph/selector/ReviewReport/
  // UI all trust, so these invariants are compiled into the schema, not left
  // to the builder's discipline.
  const contextView = decision.normalizedDecisionContext;
  const facts = decision.knownGameFacts;
  if (contextView.selfActor !== facts.actor) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Normalized decision context self actor must equal the known self actor",
      path: ["normalizedDecisionContext", "selfActor"],
    });
  }
  if (contextView.triggerEventRef !== facts.decisionEventRef) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Normalized decision context trigger event must equal the known decision event",
      path: ["normalizedDecisionContext", "triggerEventRef"],
    });
  }
  if (contextView.decisionWindowKind !== facts.decisionWindow.kind) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Normalized decision window kind must equal the known decision window kind",
      path: ["normalizedDecisionContext", "decisionWindowKind"],
    });
  }
  const expectedSurface = contextView.decisionWindowKind === "self_turn"
      || contextView.decisionWindowKind === "post_call_discard"
      || contextView.decisionWindowKind === "post_riichi_discard"
    ? "self"
    : "response";
  if (decision.surface !== expectedSurface) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Surface must be inferred from the decision window kind",
      path: ["surface"],
    });
  }

  const provider = decision.analysisProvider;
  if (provider.outcome !== decision.outcome) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provider-scoped outcome must equal the decision outcome",
      path: ["analysisProvider", "outcome"],
    });
  }

  if (
    decision.outcome === "source_row_not_expected"
    && provider.singleCandidateProof == null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "source_row_not_expected decisions require a single-candidate proof",
      path: ["analysisProvider", "singleCandidateProof"],
    });
  }

  if (
    decision.outcome === "analysis_ready"
    || decision.outcome === "source_row_not_expected"
    || decision.outcome === "no_mortal_entry"
  ) {
    if (provider.reason !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${decision.outcome} decisions cannot carry a failure reason`,
        path: ["analysisProvider", "reason"],
      });
    }
  } else {
    if (provider.reason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${decision.outcome} decisions require a reason`,
        path: ["analysisProvider", "reason"],
      });
    } else if (!reasonCategoryMatches(decision.outcome, provider.reason)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Reason does not match the ${decision.outcome} outcome`,
        path: ["analysisProvider", "reason"],
      });
    }
  }
});

// ---------------------------------------------------------------------------
// StructuredAnalysisPackage (CR-4 / CR-5 / CR-6)
// ---------------------------------------------------------------------------

/**
 * The whole-game, deterministic, auditable analysis artifact — evidence source
 * of truth (CONTEXT.md: StructuredAnalysisPackage). Locally safe /
 * renderer-safe; NEVER an LLM transport boundary (CR-1).
 *
 * CR-4 identity split (Slice 1 review Blocker 3A):
 *  - `analysisKey` = the LOGICAL analysis slot: record identity + self actor +
 *    analysis provider. Stable across reruns AND across model/fact-pipeline
 *    versions — it answers "which slot", not "which artifact".
 *  - `packageId` = the ARTIFACT identity, derived from `analysisKey` +
 *    `componentVersions` + the explicit frozen policy snapshot. Two analyses
 *    of the same slot with different model/fact-pipeline versions therefore
 *    yield DIFFERENT packageIds — no semantic collision for ReviewSession
 *    references. Stable across reruns; no wall-clock or artifact-creation
 *    metadata. packageId ≠ semanticContentHash: the hash is content-based
 *    dedupe/comparison, packageId is the artifact reference.
 *
 * CR-5 semanticContentHash: computed over the deterministic semantic content
 * only; createdAt / artifact metadata is provenance and never participates in
 * the hash (frozenAt's semantic policy snapshot is an explicit construction
 * input and lives inside ModelEvaluation.detailPolicy). The package is
 * deterministic-to-construct and non-LLM authoritative; model scores are
 * auditable model evidence, not hard Mahjong facts.
 *
 * CR-6: a structurally valid package may faithfully record an incomplete /
 * failed analysis; `record.status` marks the aggregate truth.
 */
export type StructuredAnalysisPackage = {
  analysisKey: string;
  packageId: string;
  /** Artifact creation metadata (provenance only; excluded from
   *  semanticContentHash). */
  createdAt: string;
  semanticContentHash: string;
  record: RecordAnalysis;
  componentVersions: ComponentVersions;
  decisions: DecisionAnalysis[];
  evidenceRegistry: EvidenceRegistry;
};

export const StructuredAnalysisPackageSchema: z.ZodType<
  StructuredAnalysisPackage,
  z.ZodTypeDef,
  {
    analysisKey: string;
    packageId: string;
    createdAt: string;
    semanticContentHash: string;
    record: RecordAnalysis;
    componentVersions: ComponentVersions;
    decisions: DecisionAnalysisInput[];
    evidenceRegistry: EvidenceRegistry;
  }
> = z.object({
  analysisKey: z.string().min(1),
  packageId: z.string().min(1),
  /** Artifact creation metadata (provenance only; excluded from
   *  semanticContentHash). */
  createdAt: z.string().datetime(),
  semanticContentHash: z.string().min(1),
  record: RecordAnalysisSchema,
  componentVersions: ComponentVersionsSchema,
  decisions: z.array(DecisionAnalysisSchema).min(1),
  evidenceRegistry: EvidenceRegistrySchema,
}).strict().superRefine((pkg, context) => {
  // Package-level identity coherence (Slice 1 review Blocker 3B).
  const seenDecisionIds = new Set<string>();
  pkg.decisions.forEach((decision, index) => {
    if (seenDecisionIds.has(decision.decisionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Decision IDs must be globally unique within a package",
        path: ["decisions", index, "decisionId"],
      });
    }
    seenDecisionIds.add(decision.decisionId);
    if (decision.knownGameFacts.actor !== pkg.record.selfActor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every decision's known self actor must equal the record self actor",
        path: ["decisions", index, "knownGameFacts", "actor"],
      });
    }
  });
});
