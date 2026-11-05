import { z } from "zod";
import { TileIdSchema } from "./tiles.js";

import { canonicalActionRef } from "./action-codec.js";
import { RiichiActionSchema } from "./actions.js";
import { ActionRefSchema } from "./comparison.js";
import { LibriichiRuleIdentitySchema } from "./libriichi-rules.js";
import {
  LOCAL_MORTAL_SCORING_PROTOCOL_VERSION,
} from "./local-mortal-scoring.js";
import { ManagedMortalRuntimeIdentitySchema } from "./local-mortal-runtime.js";
import {
  CanonicalMeldV2Schema,
  DecisionSnapshotV2Schema,
  FieldCompletenessSchema,
  FuritenStateV2Schema,
  RiichiStateV2Schema,
} from "./round-state.js";
import { RuleSetV2Schema } from "./event-stream.js";
import { TileSchema } from "./tiles.js";

/** Independent inputs; dependencies describe protocol needs, never silently enable facts. */
export const ArenaExperimentConfigSchema = z.object({
  schemaVersion: z.literal("arena-experiment/v1"),
  submission: z.enum(["tool", "tile-red"]),
  legalCandidates: z.boolean(),
  helperFacts: z.boolean(),
  basicCalculations: z.boolean().optional(),
  helperForecasts: z.boolean().optional(),
  compactReferences: z.boolean().optional(),
  selectiveCalculation: z.enum(["control", "query"]).optional(),
  handStructureFacts: z.boolean().optional(),
  improvementFacts: z.boolean().optional(),
  defenseFacts: z.boolean().optional(),
  textbookInputBudget: z.boolean().optional(),
  wholeUnitFacts: z.boolean().optional(),
  fiveAxisFramework: z.boolean().optional(),
  fiveAxisFrameworkV1Forecast: z.boolean().optional(),
  structuredBrief: z.boolean().optional(),
  scenarioHint: z.boolean(),
  teaching: z.enum(["off", "on"]),
  materialRouting: z.enum(["fixed", "scenario"]),
  comparison: z.boolean(),
  explanation: z.boolean(),
  callableTools: z.array(z.enum(["analyze_candidates", "search_knowledge"])).max(2),
}).strict().superRefine((config, context) => {
  const reject = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (new Set(config.callableTools).size !== config.callableTools.length) reject("arena_duplicate_capability");
  if ((config.helperFacts || config.callableTools.includes("analyze_candidates")) && !config.legalCandidates) reject("arena_helper_requires_candidates");
  if (config.basicCalculations && (!config.legalCandidates || config.helperFacts || config.callableTools.length)) reject("arena_basic_calculations_requires_candidates_and_no_tools");
  if (config.helperForecasts && (!config.legalCandidates || !config.basicCalculations || config.helperFacts || config.handStructureFacts || config.improvementFacts || config.defenseFacts || config.wholeUnitFacts || config.textbookInputBudget || config.fiveAxisFramework || config.structuredBrief || config.callableTools.length || config.scenarioHint || config.teaching !== "off" || config.comparison || config.explanation || config.submission !== "tile-red")) reject("arena_helper_forecast_intervention_invalid");
  if (config.compactReferences && (!config.legalCandidates || !config.basicCalculations || config.helperFacts || config.helperForecasts || config.handStructureFacts || config.improvementFacts || config.defenseFacts || config.wholeUnitFacts || config.textbookInputBudget || config.fiveAxisFramework || config.structuredBrief || config.callableTools.length || config.scenarioHint || config.teaching !== "off" || config.comparison || config.explanation || config.submission !== "tile-red")) reject("arena_compact_references_intervention_invalid");
  if (config.fiveAxisFrameworkV1Forecast && (!config.helperForecasts || config.fiveAxisFramework || config.structuredBrief || config.compactReferences)) reject("arena_v1_forecast_intervention_invalid");
  if (config.selectiveCalculation && (!config.legalCandidates || config.submission !== "tile-red" || config.helperFacts || config.basicCalculations || config.helperForecasts || config.handStructureFacts || config.improvementFacts || config.defenseFacts || config.wholeUnitFacts || config.textbookInputBudget || config.fiveAxisFramework || config.fiveAxisFrameworkV1Forecast || config.structuredBrief || config.compactReferences || config.scenarioHint || config.teaching !== "off" || config.comparison || config.explanation || JSON.stringify(config.callableTools) !== JSON.stringify(config.selectiveCalculation === "query" ? ["analyze_candidates"] : []))) reject("arena_selective_calculation_invalid");
  if (config.handStructureFacts && (!config.legalCandidates || config.helperFacts || config.callableTools.length)) reject("arena_hand_structure_requires_candidates_and_no_tools");
  if (config.improvementFacts && (!config.legalCandidates || config.helperFacts || config.callableTools.length)) reject("arena_improvement_requires_candidates_and_no_tools");
  if (config.defenseFacts && (!config.legalCandidates || config.helperFacts || config.callableTools.length || config.handStructureFacts || config.improvementFacts || config.teaching === "on" || config.scenarioHint || config.comparison || config.explanation || config.submission !== "tile-red")) reject("arena_defense_requires_candidates_and_no_other_interventions");
  if ((config.textbookInputBudget || config.wholeUnitFacts) && (!config.legalCandidates || !config.basicCalculations || config.helperFacts || config.handStructureFacts || config.improvementFacts || config.defenseFacts || config.callableTools.length || config.scenarioHint || config.teaching !== "off" || config.comparison || config.explanation || config.submission !== "tile-red")) reject("arena_textbook_intervention_invalid");
  if (config.wholeUnitFacts && !config.textbookInputBudget) reject("arena_textbook_budget_required");
  if ((config.fiveAxisFramework || config.structuredBrief) && (!config.legalCandidates || !config.basicCalculations || config.helperFacts || config.handStructureFacts || config.improvementFacts || config.defenseFacts || config.wholeUnitFacts || config.textbookInputBudget || config.callableTools.length || config.scenarioHint || config.teaching !== "off" || config.comparison || config.explanation || config.submission !== "tile-red")) reject("arena_five_axis_intervention_invalid");
  if (config.submission === "tool" && (!config.legalCandidates || !config.explanation)) reject("arena_legacy_submission_requires_candidates_and_explanation");
  if (config.submission === "tile-red" && !config.selectiveCalculation && config.callableTools.length > 0) reject("arena_direct_submission_has_no_tool_loop");
  if (config.teaching === "off" && (config.materialRouting === "scenario" || config.callableTools.includes("search_knowledge"))) reject("arena_routing_requires_teaching");
});
export type ArenaExperimentConfig = z.infer<typeof ArenaExperimentConfigSchema>;
export const ARENA_RAW_BASELINE: ArenaExperimentConfig = Object.freeze({
  schemaVersion: "arena-experiment/v1", submission: "tile-red", legalCandidates: false,
  helperFacts: false, scenarioHint: false, teaching: "off", materialRouting: "fixed",
  comparison: false, explanation: false, callableTools: [],
});
Object.freeze(ARENA_RAW_BASELINE.callableTools);
export const ArenaDirectAnswerSchema = z.object({ tile: TileIdSchema, red: z.boolean() }).strict()
  .superRefine((answer, context) => {
    if (answer.red && !["5m", "5p", "5s"].includes(answer.tile)) context.addIssue({ code: z.ZodIssueCode.custom, message: "arena_red_only_five" });
  });
const ActorSchema = z.number().int().min(0).max(3);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const OpaqueUuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/** These IDs are random per run and must never be derived from source identity. */
export const ArenaCaseRefSchema = z.string().regex(new RegExp(`^arena-case:v1:${OpaqueUuid}$`));
export type ArenaCaseRef = z.infer<typeof ArenaCaseRefSchema>;

/** Coach-visible event, evidence, and source references use this per-run alias. */
export const ArenaOpaqueReferenceSchema = z.string().regex(new RegExp(`^arena-ref:v1:${OpaqueUuid}$`));
export type ArenaOpaqueReference = z.infer<typeof ArenaOpaqueReferenceSchema>;

const ArenaDiscardActionSchema = z.object({
  kind: z.literal("discard"),
  tile: TileSchema,
  discardMode: z.enum(["tsumogiri", "tedashi"]),
}).strict();

export const ArenaBlindDiscardCandidateSchema = z.object({
  actionRef: ActionRefSchema,
  tile: TileSchema,
  discardMode: z.enum(["tsumogiri", "tedashi"]),
}).strict();
export type ArenaBlindDiscardCandidate = z.infer<typeof ArenaBlindDiscardCandidateSchema>;

const OpaqueMeldSchema = CanonicalMeldV2Schema.superRefine((meld, context) => {
  for (const key of ["meldRef", "createdEventRef", "latestEventRef"] as const) {
    if (!ArenaOpaqueReferenceSchema.safeParse(meld[key]).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "arena_reference_not_opaque" });
    }
  }
  if ("calledDiscardEventRef" in meld && !ArenaOpaqueReferenceSchema.safeParse(meld.calledDiscardEventRef).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["calledDiscardEventRef"], message: "arena_reference_not_opaque" });
  }
  if ("upgradedPonEventRef" in meld && !ArenaOpaqueReferenceSchema.safeParse(meld.upgradedPonEventRef).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["upgradedPonEventRef"], message: "arena_reference_not_opaque" });
  }
});

const OpaqueRiichiStateSchema = RiichiStateV2Schema.superRefine((state, context) => {
  for (const key of ["declarationEventRef", "acceptanceEventRef"] as const) {
    if (state[key] !== null && !ArenaOpaqueReferenceSchema.safeParse(state[key]).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "arena_reference_not_opaque" });
    }
  }
});

const OpaqueFuritenStateSchema = FuritenStateV2Schema.superRefine((state, context) => {
  for (const [componentName, component] of Object.entries(state)) {
    component.evidenceIds.forEach((ref, index) => {
      if (!ArenaOpaqueReferenceSchema.safeParse(ref).success) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [componentName, "evidenceIds", index], message: "arena_reference_not_opaque" });
      }
    });
  }
});

const ArenaRiverDiscardSchema = z.object({
  sourceRef: ArenaOpaqueReferenceSchema,
  actor: ActorSchema,
  tile: TileSchema,
  discardMode: z.enum(["tsumogiri", "tedashi"]),
  riichiDeclarationRef: ArenaOpaqueReferenceSchema.nullable(),
  calledByRef: ArenaOpaqueReferenceSchema.nullable(),
}).strict();

const ArenaObservationCompletenessSchema = z.object({
  roundContext: FieldCompletenessSchema,
  ruleSet: FieldCompletenessSchema,
  scores: FieldCompletenessSchema,
  doraIndicators: FieldCompletenessSchema,
  rivers: FieldCompletenessSchema,
  calledDiscardMarkers: FieldCompletenessSchema,
  melds: FieldCompletenessSchema,
  remainingDraws: FieldCompletenessSchema,
  concealedTiles: FieldCompletenessSchema,
  currentDraw: FieldCompletenessSchema,
  responseOpportunities: FieldCompletenessSchema,
  furiten: FieldCompletenessSchema,
}).strict();

/** Current-round decision-time events; source identifiers are always aliased. */
const HistoryBase = { eventRef: ArenaOpaqueReferenceSchema };
export const ArenaVisibleHistoryEventSchema = z.discriminatedUnion("type", [
  z.object({ ...HistoryBase, type: z.literal("draw"), actor: ActorSchema, tile: TileSchema.nullable(), from: z.enum(["live_wall", "rinshan"]) }).strict(),
  z.object({ ...HistoryBase, type: z.literal("discard"), actor: ActorSchema, tile: TileSchema, discardMode: z.enum(["tsumogiri", "tedashi"]) }).strict(),
  ...(["chi", "pon", "daiminkan"] as const).map(type => z.object({ ...HistoryBase, type: z.literal(type), actor: ActorSchema, targetActor: ActorSchema, calledTile: TileSchema, consumedTiles: z.array(TileSchema).min(2).max(3), calledDiscardRef: ArenaOpaqueReferenceSchema }).strict()),
  z.object({ ...HistoryBase, type: z.literal("ankan"), actor: ActorSchema, tiles: z.array(TileSchema).length(4) }).strict(),
  z.object({ ...HistoryBase, type: z.literal("kakan"), actor: ActorSchema, addedTile: TileSchema, upgradedPonRef: ArenaOpaqueReferenceSchema }).strict(),
  z.object({ ...HistoryBase, type: z.literal("dora"), indicator: TileSchema, kanRef: ArenaOpaqueReferenceSchema.nullable() }).strict(),
  z.object({ ...HistoryBase, type: z.literal("reach"), actor: ActorSchema }).strict(),
  z.object({ ...HistoryBase, type: z.literal("reach_accepted"), actor: ActorSchema, declarationRef: ArenaOpaqueReferenceSchema }).strict(),
]);

/** Strict white-list DTO: never derive it by removing fields from a report. */
export const ArenaBlindObservationSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-observation/v1"),
  caseRef: ArenaCaseRefSchema,
  rawEventOrder: z.array(ArenaOpaqueReferenceSchema).max(1000).optional(),
  rawVisibleHistory: z.array(ArenaVisibleHistoryEventSchema).max(1000).optional(),
  ruleSet: RuleSetV2Schema,
  decision: z.object({
    selfActor: ActorSchema,
    windowKind: z.enum(["self_turn", "post_call_discard", "post_riichi_discard"]),
    roundOrdinal: z.number().int().nonnegative(),
  }).strict(),
  visibleState: z.object({
    roundWind: z.enum(["E", "S", "W"]),
    hand: z.number().int().min(1).max(4),
    honba: z.number().int().nonnegative(),
    riichiSticks: z.number().int().nonnegative(),
    dealer: ActorSchema,
    scores: z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]),
    seatWinds: z.tuple([z.enum(["E", "S", "W", "N"]), z.enum(["E", "S", "W", "N"]), z.enum(["E", "S", "W", "N"]), z.enum(["E", "S", "W", "N"])]),
    remainingDraws: z.number().int().nonnegative().nullable(),
    doraIndicators: z.array(TileSchema),
    rivers: z.tuple([
      z.array(ArenaRiverDiscardSchema), z.array(ArenaRiverDiscardSchema),
      z.array(ArenaRiverDiscardSchema), z.array(ArenaRiverDiscardSchema),
    ]),
    melds: z.array(OpaqueMeldSchema),
    riichiStates: z.tuple([
      OpaqueRiichiStateSchema, OpaqueRiichiStateSchema,
      OpaqueRiichiStateSchema, OpaqueRiichiStateSchema,
    ]),
    self: z.object({
      concealedTiles: z.array(TileSchema),
      currentDraw: z.object({
        tile: TileSchema,
        sourceRef: ArenaOpaqueReferenceSchema,
        from: z.enum(["live_wall", "rinshan"]),
      }).strict().nullable(),
      meldRefs: z.array(ArenaOpaqueReferenceSchema),
      furiten: OpaqueFuritenStateSchema,
      evidenceRefs: z.array(ArenaOpaqueReferenceSchema),
    }).strict(),
    completeness: ArenaObservationCompletenessSchema,
  }).strict(),
  candidates: z.array(ArenaBlindDiscardCandidateSchema).min(2).max(46),
  tools: z.object({
    description: z.string().max(1000),
    supportedCapabilities: z.array(z.string().min(1).max(80)).max(32),
  }).strict(),
}).strict().superRefine((observation, context) => {
  for (const [i, event] of (observation.rawVisibleHistory ?? []).entries()) {
    if (event.type === "draw" && ((event.actor === observation.decision.selfActor) !== (event.tile !== null))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["rawVisibleHistory", i], message: "arena_history_draw_visibility_invalid" });
    }

  }
  const refs = observation.candidates.map((candidate) => candidate.actionRef);
  if (new Set(refs).size !== refs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates"], message: "arena_candidates_not_unique" });
  }
  observation.candidates.forEach((candidate, index) => {
    if (candidate.actionRef !== canonicalActionRef({ kind: "discard", tile: candidate.tile, discardMode: candidate.discardMode })) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates", index, "actionRef"], message: "arena_candidate_action_ref_mismatch" });
    }
  });
  for (const [actor, river] of observation.visibleState.rivers.entries()) {
    river.forEach((discard, index) => {
      if (discard.actor !== actor) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["visibleState", "rivers", actor, index, "actor"], message: "arena_river_actor_mismatch" });
      }
    });
  }
  if (observation.rawEventOrder) {
    const state = observation.visibleState;
    const visible = new Set([
      state.self.currentDraw?.sourceRef,
      ...state.rivers.flatMap(river => river.flatMap(row => [row.sourceRef, row.riichiDeclarationRef, row.calledByRef])),
      ...state.melds.flatMap(meld => [meld.createdEventRef, meld.latestEventRef]),
      ...state.riichiStates.flatMap(row => [row.declarationEventRef, row.acceptanceEventRef]),
    ]);
    if (new Set(observation.rawEventOrder).size !== observation.rawEventOrder.length || observation.rawEventOrder.some(ref => !visible.has(ref))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["rawEventOrder"], message: "arena_raw_event_not_visible" });
    }
  }
});
export type ArenaBlindObservation = z.infer<typeof ArenaBlindObservationSchema>;

/** Trusted main-process binding for the helper server; never send this DTO to a model. */
export const ArenaToolBindingSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-tool-binding/v1"),
  caseRef: ArenaCaseRefSchema,
  decisionSnapshot: DecisionSnapshotV2Schema,
  ruleIdentity: LibriichiRuleIdentitySchema,
  candidates: z.array(z.object({
    actionRef: ActionRefSchema,
    action: ArenaDiscardActionSchema,
    physicalRealizations: z.array(z.object({
      actionRef: ActionRefSchema,
      action: ArenaDiscardActionSchema,
    }).strict()).min(1).max(2),
  }).strict()).min(2).max(46),
}).strict().superRefine((binding, context) => {
  const allRefs: string[] = [];
  binding.candidates.forEach((candidate, index) => {
    if (candidate.actionRef !== canonicalActionRef(candidate.action)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates", index, "actionRef"], message: "arena_candidate_action_ref_mismatch" });
    }
    let carriesPrimary = false;
    candidate.physicalRealizations.forEach((realization, realizationIndex) => {
      allRefs.push(realization.actionRef);
      if (realization.actionRef !== canonicalActionRef(realization.action) ||
          realization.action.tile.id !== candidate.action.tile.id ||
          realization.action.tile.red !== candidate.action.tile.red ||
          (realization.actionRef !== candidate.actionRef && realization.action.discardMode === candidate.action.discardMode)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates", index, "physicalRealizations", realizationIndex], message: "arena_physical_realization_invalid" });
      }
      if (realization.actionRef === candidate.actionRef &&
          JSON.stringify(realization.action) === JSON.stringify(candidate.action)) carriesPrimary = true;
    });
    if (!carriesPrimary) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates", index, "physicalRealizations"], message: "arena_primary_action_missing_from_realizations" });
    }
  });
  if (new Set(allRefs).size !== allRefs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates"], message: "arena_equivalence_mapping_not_unique" });
  }
});
export type ArenaToolBinding = z.infer<typeof ArenaToolBindingSchema>;

/** Grader-private reference; contains no Q values, probability, or ranking. */
export const ArenaReferenceLabelSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-reference/v1"),
  caseRef: ArenaCaseRefSchema,
  actionRef: ActionRefSchema,
  runtimeIdentity: ManagedMortalRuntimeIdentitySchema,
  runtimeConfigSha256: Sha256Schema,
  ruleIdentity: LibriichiRuleIdentitySchema,
  scoringProtocolVersion: z.literal(LOCAL_MORTAL_SCORING_PROTOCOL_VERSION),
}).strict();
export type ArenaReferenceLabel = z.infer<typeof ArenaReferenceLabelSchema>;

const ArenaSubmissionAlternativeSchema = z.object({
  actionRef: ActionRefSchema,
  reasonNotChosen: z.string().trim().min(1).max(500),
}).strict();

/** Coach's locked answer. Evidence/source refs must be aliases observed in this run. */
export const ArenaCoachSubmissionSchema = z.object({
  caseRef: ArenaCaseRefSchema,
  actionRef: ActionRefSchema,
  rationale: z.string().trim().min(1).max(2000),
  evidenceRefs: z.array(ArenaOpaqueReferenceSchema).max(64),
  sourceRefs: z.array(ArenaOpaqueReferenceSchema).max(64),
  mainAlternative: ArenaSubmissionAlternativeSchema.nullable(),
  uncertainty: z.string().trim().max(1000),
}).strict().superRefine((submission, context) => {
  for (const [name, refs] of [["evidenceRefs", submission.evidenceRefs], ["sourceRefs", submission.sourceRefs]] as const) {
    if (new Set(refs).size !== refs.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [name], message: "arena_submission_refs_not_unique" });
    }
  }
  if (submission.mainAlternative?.actionRef === submission.actionRef) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["mainAlternative", "actionRef"], message: "arena_alternative_must_differ" });
  }
});
export type ArenaCoachSubmission = z.infer<typeof ArenaCoachSubmissionSchema>;

/** Public, checkable summary only; it is not private reasoning. */
const briefText = (maximum: number) => z.string().refine(value => { const n = [...value].length; return n >= 1 && n <= maximum; });
export const ArenaDecisionBriefSchema = z.object({
  observations: z.array(briefText(120)).max(3),
  alternatives: z.array(z.object({ tile: TileIdSchema, red: z.boolean(), benefit: briefText(120), cost: briefText(120) }).strict()).min(2).max(3),
  tradeoff: briefText(240), uncertainty: briefText(160),
}).strict();
export const ArenaStructuredBriefAnswerSchema = z.object({ decisionBrief: ArenaDecisionBriefSchema, tile: TileIdSchema, red: z.boolean() }).strict();
export const ArenaDecisionBriefQualitySchema = z.object({ duplicateAlternatives: z.number().int().nonnegative(), illegalAlternatives: z.number().int().nonnegative(), claimsGrounding: z.literal("not_evaluated") }).strict();

/** Backend legal mapping, explicitly distinct from a model-authored rationale. */
export const ArenaDirectSubmissionSchema = z.object({
  format: z.literal("tile-red/v1"), caseRef: ArenaCaseRefSchema, actionRef: ActionRefSchema,
  tile: TileIdSchema, red: z.boolean(),
  rationale: z.string().min(1).max(2000).optional(),
  decisionBrief: ArenaDecisionBriefSchema.optional(),
  decisionBriefQuality: ArenaDecisionBriefQualitySchema.optional(),
  evidenceRefs: z.never().optional(), sourceRefs: z.never().optional(),
  mainAlternative: z.never().optional(), uncertainty: z.never().optional(),
}).strict();
export const ArenaLockedSubmissionSchema = z.union([ArenaCoachSubmissionSchema, ArenaDirectSubmissionSchema]);

export const ArenaSubmissionStatusSchema = z.enum([
  "submitted", "invalid_submission", "missing_submission", "provider_unavailable",
  "provider_error", "timeout", "cancelled", "tool_failure", "budget_exhausted",
]);
export type ArenaSubmissionStatus = z.infer<typeof ArenaSubmissionStatusSchema>;

export const ArenaLabelUnavailableReasonSchema = z.enum([
  "mortal_unavailable", "mortal_error", "mortal_timeout",
]);
export const ArenaLabelBindingFailureReasonSchema = z.enum([
  "candidate_mismatch", "runtime_identity_mismatch", "protocol_invalid",
]);

const ArenaScoringCandidateSchema = z.object({
  actionRef: ActionRefSchema,
  action: ArenaDiscardActionSchema,
  physicalRealizations: z.array(z.object({ actionRef: ActionRefSchema, action: ArenaDiscardActionSchema }).strict()).min(1).max(2),
}).strict();

/** Offline scoring input retains every included case and its terminal outcome. */
export const ArenaScoringCaseInputSchema = z.object({
  caseRef: ArenaCaseRefSchema,
  candidates: z.array(ArenaScoringCandidateSchema).min(2).max(46),
  reference: z.discriminatedUnion("status", [
    z.object({ status: z.literal("available"), label: ArenaReferenceLabelSchema }).strict(),
    z.object({ status: z.literal("unavailable"), reason: ArenaLabelUnavailableReasonSchema }).strict(),
    z.object({ status: z.literal("binding_failure"), reason: ArenaLabelBindingFailureReasonSchema }).strict(),
  ]),
  attempt: z.discriminatedUnion("status", [
    z.object({ status: z.literal("submitted"), submission: ArenaLockedSubmissionSchema }).strict(),
    z.object({ status: z.literal("invalid_submission") }).strict(),
    z.object({ status: z.literal("missing_submission") }).strict(),
    z.object({ status: z.literal("provider_unavailable") }).strict(),
    z.object({ status: z.literal("provider_error") }).strict(),
    z.object({ status: z.literal("timeout") }).strict(),
    z.object({ status: z.literal("cancelled") }).strict(),
    z.object({ status: z.literal("tool_failure") }).strict(),
    z.object({ status: z.literal("budget_exhausted") }).strict(),
  ]),
}).strict().superRefine((entry, context) => {
  const refs = entry.candidates.map((candidate) => candidate.actionRef);
  if (new Set(refs).size !== refs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates"], message: "arena_candidates_not_unique" });
  }
  const physicalRefs = entry.candidates.flatMap((candidate) => candidate.physicalRealizations.map((realization) => realization.actionRef));
  if (new Set(physicalRefs).size !== physicalRefs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates"], message: "arena_equivalence_mapping_not_unique" });
  }
  entry.candidates.forEach((candidate, index) => {
    if (candidate.actionRef !== canonicalActionRef(candidate.action)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates", index, "actionRef"], message: "arena_candidate_action_ref_mismatch" });
    }
    let carriesPrimary = false;
    candidate.physicalRealizations.forEach((realization, realizationIndex) => {
      if (realization.actionRef !== canonicalActionRef(realization.action) ||
          realization.action.tile.id !== candidate.action.tile.id ||
          realization.action.tile.red !== candidate.action.tile.red ||
          (realization.actionRef !== candidate.actionRef && realization.action.discardMode === candidate.action.discardMode)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates", index, "physicalRealizations", realizationIndex], message: "arena_physical_realization_invalid" });
      }
      if (realization.actionRef === candidate.actionRef && JSON.stringify(realization.action) === JSON.stringify(candidate.action)) carriesPrimary = true;
    });
    if (!carriesPrimary) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["candidates", index, "physicalRealizations"], message: "arena_primary_action_missing_from_realizations" });
    }
  });
});
export type ArenaScoringCaseInput = z.infer<typeof ArenaScoringCaseInputSchema>;

export const ArenaMatchStatusSchema = z.enum(["matched", "not_matched", "unscorable"]);
export const ArenaCaseScoreSchema = z.object({
  caseRef: ArenaCaseRefSchema,
  status: ArenaMatchStatusSchema,
  reason: z.string().min(1).max(80).nullable(),
}).strict();
export type ArenaCaseScore = z.infer<typeof ArenaCaseScoreSchema>;

export const ArenaRateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("available"), numerator: z.number().int().nonnegative(), denominator: z.number().int().positive(), value: z.number().min(0).max(1) }).strict(),
  z.object({ status: z.literal("not_available"), numerator: z.literal(0), denominator: z.literal(0), value: z.null() }).strict(),
]);
export type ArenaRate = z.infer<typeof ArenaRateSchema>;

export const ArenaFailureCountsSchema = z.object({
  invalidSubmission: z.number().int().nonnegative(),
  missingSubmission: z.number().int().nonnegative(),
  providerUnavailable: z.number().int().nonnegative(),
  providerError: z.number().int().nonnegative(),
  timeout: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  toolFailure: z.number().int().nonnegative(),
  budgetExhausted: z.number().int().nonnegative(),
  labelUnavailable: z.number().int().nonnegative(),
  labelBindingFailure: z.number().int().nonnegative(),
}).strict();

export const ArenaBatchScoreSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-batch-score/v1"),
  includedCaseCount: z.number().int().nonnegative(),
  matchedCaseCount: z.number().int().nonnegative(),
  unmatchedCaseCount: z.number().int().nonnegative(),
  labelAvailableCaseCount: z.number().int().nonnegative(),
  primaryMatchRate: ArenaRateSchema,
  conditionalMatchRate: ArenaRateSchema,
  failures: ArenaFailureCountsSchema,
  cases: z.array(ArenaCaseScoreSchema),
}).strict();
export type ArenaBatchScore = z.infer<typeof ArenaBatchScoreSchema>;

export const ArenaRagModeSchema = z.enum(["off", "local"]);
export type ArenaRagMode = z.infer<typeof ArenaRagModeSchema>;

export const ArenaRagStatusSchema = z.enum(["disabled", "no_hits", "hits"]);
export type ArenaRagStatus = z.infer<typeof ArenaRagStatusSchema>;

export const ArenaRagTopicSchema = z.enum(["tile-efficiency", "shape-flexibility"]);
export type ArenaRagTopic = z.infer<typeof ArenaRagTopicSchema>;

export const ArenaRagApplicabilitySchema = z.enum([
  "general-discard-choice",
  "complete-visibility-only",
]);
export type ArenaRagApplicability = z.infer<typeof ArenaRagApplicabilitySchema>;

export const ArenaRagContextSchema = z.object({
  topic: ArenaRagTopicSchema.optional(),
  appliesTo: ArenaRagApplicabilitySchema.optional(),
}).strict();
export type ArenaRagContext = z.infer<typeof ArenaRagContextSchema>;

export const ArenaRagFilterSchema = z.object({
  topics: z.array(ArenaRagTopicSchema).max(2).optional(),
  appliesTo: z.array(ArenaRagApplicabilitySchema).max(2).optional(),
}).strict();
export type ArenaRagFilter = z.infer<typeof ArenaRagFilterSchema>;

/** Query fields intentionally exclude snapshots, records, paths, and tool permissions. */
export const ArenaRagRequestSchema = z.object({
  query: z.string().trim().min(1).max(400),
  context: ArenaRagContextSchema.optional(),
  filter: ArenaRagFilterSchema.optional(),
  limit: z.number().int().min(1).max(5),
}).strict();
export type ArenaRagRequest = z.infer<typeof ArenaRagRequestSchema>;

export const ArenaRagPassageSchema = z.object({
  sourceRef: ArenaOpaqueReferenceSchema,
  sourceTitle: z.string().trim().min(1).max(160),
  documentLocation: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(1000),
  applicableWhen: z.array(ArenaRagApplicabilitySchema).max(4),
  corpusVersion: z.string().trim().min(1).max(80),
  retrieverVersion: z.string().trim().min(1).max(80),
}).strict();
export type ArenaRagPassage = z.infer<typeof ArenaRagPassageSchema>;

export const ArenaRagRetrievalMetadataSchema = z.object({
  query: z.string().trim().min(1).max(400),
  context: ArenaRagContextSchema.nullable(),
  filter: ArenaRagFilterSchema.nullable(),
  limit: z.number().int().min(1).max(5),
  resultRefs: z.array(ArenaOpaqueReferenceSchema).max(5),
}).strict();
export type ArenaRagRetrievalMetadata = z.infer<typeof ArenaRagRetrievalMetadataSchema>;

export const ArenaRagResultSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-rag-result/v1"),
  caseRef: ArenaCaseRefSchema,
  mode: ArenaRagModeSchema,
  status: ArenaRagStatusSchema,
  passages: z.array(ArenaRagPassageSchema).max(5),
  sourceRefs: z.array(ArenaOpaqueReferenceSchema).max(5),
  retrieval: ArenaRagRetrievalMetadataSchema,
  corpusVersion: z.string().trim().min(1).max(80).nullable(),
  retrieverVersion: z.string().trim().min(1).max(80),
}).strict().superRefine((result, context) => {
  const passageRefs = result.passages.map((passage) => passage.sourceRef);
  const refsMatch = JSON.stringify(result.sourceRefs) === JSON.stringify(passageRefs) &&
    JSON.stringify(result.retrieval.resultRefs) === JSON.stringify(passageRefs);
  if (!refsMatch || new Set(passageRefs).size !== passageRefs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceRefs"], message: "arena_rag_refs_mismatch" });
  }

  if (result.mode === "off") {
    if (result.status !== "disabled" || result.passages.length !== 0 || result.corpusVersion !== null ||
        result.retrieverVersion !== "disabled") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "arena_rag_disabled_result_invalid" });
    }
  } else if (result.status === "disabled" || result.corpusVersion === null ||
             (result.status === "hits") !== (result.passages.length > 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "arena_rag_local_result_invalid" });
  }

  result.passages.forEach((passage, index) => {
    if (passage.corpusVersion !== result.corpusVersion || passage.retrieverVersion !== result.retrieverVersion) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["passages", index], message: "arena_rag_passage_version_mismatch" });
    }
  });
});
export type ArenaRagResult = z.infer<typeof ArenaRagResultSchema>;
