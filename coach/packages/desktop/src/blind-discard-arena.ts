import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ActionRefSchema,
  ArenaCoachSubmissionSchema,
  ArenaBlindObservationSchema,
  ArenaCaseRefSchema,
  ArenaOpaqueReferenceSchema,
  ArenaReferenceLabelSchema,
  ArenaToolBindingSchema,
  DecisionSnapshotV2Schema,
  KnownGameFactsSchema,
  LibriichiRuleRequestSchema,
  LibriichiRuleResponseSchema,
  canonicalActionRef,
  libriichiRuleCanonicalJson,
  type ArenaBlindDiscardCandidate,
  type ArenaBlindObservation,
  type ArenaCoachSubmission,
  type ArenaCaseRef,
  type ArenaReferenceLabel,
  type ArenaToolBinding,
  type DecisionSnapshotV2,
  type LibriichiRuleRequest,
  type LibriichiRuleIdentity,
  type ManagedMortalRuntimeManifest,
} from "@riichi-coach/contracts";
import {
  bindLibriichiRuleResult,
  bindLocalMortalRuleScores,
  type LibriichiBoundAction,
} from "@riichi-coach/reasoning";

const AliasFactoryOutputSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

/** Run-local vault. The map is private and cannot be serialized into Coach metadata. */
export class ArenaRunAliasVault {
  readonly #aliases = new Map<string, string>();
  readonly #issued = new Set<string>();

  caseRef(sourceIdentity: string): ArenaCaseRef {
    return this.#alias("case", sourceIdentity, "arena-case:v1:") as ArenaCaseRef;
  }

  reference(sourceIdentity: string): string {
    return this.#alias("reference", sourceIdentity, "arena-ref:v1:");
  }

  #alias(kind: "case" | "reference", sourceIdentity: string, prefix: string): string {
    if (typeof sourceIdentity !== "string" || sourceIdentity.length === 0) {
      throw new Error("arena_alias_source_invalid");
    }
    const key = `${kind}\u0000${sourceIdentity}`;
    const existing = this.#aliases.get(key);
    if (existing !== undefined) return existing;

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const uuid = randomUUID();
      if (!AliasFactoryOutputSchema.safeParse(uuid).success) throw new Error("arena_alias_generation_failed");
      const alias = `${prefix}${uuid}`;
      const valid = kind === "case"
        ? ArenaCaseRefSchema.safeParse(alias).success
        : ArenaOpaqueReferenceSchema.safeParse(alias).success;
      if (!valid || this.#issued.has(alias)) continue;
      this.#issued.add(alias);
      this.#aliases.set(key, alias);
      return alias;
    }
    throw new Error("arena_alias_generation_failed");
  }
}

const ArenaDecisionInputSchema = z.object({
  canonicalDecisionOrder: z.number().int().nonnegative(),
  decision: z.object({
    decisionEventRef: z.string().min(1),
    snapshot: DecisionSnapshotV2Schema,
    facts: KnownGameFactsSchema,
  }).strict(),
  ruleRequest: LibriichiRuleRequestSchema,
  ruleResponse: LibriichiRuleResponseSchema,
}).strict();

const ArenaDecisionInputsSchema = z.array(ArenaDecisionInputSchema);

function arenaPrefixIdentity(request: LibriichiRuleRequest): string {
  return `sha256:${createHash("sha256").update(libriichiRuleCanonicalJson({
    protocolVersion: request.protocolVersion,
    operation: request.operation,
    identity: request.identity,
    eventPrefixSha256: request.eventPrefixSha256,
    decision: request.decision,
    ruleSet: request.ruleSet,
  })).digest("hex")}`;
}

/** Remove the source's full-game fingerprint before a native Arena rule query. */
export function createArenaBlindRuleRequest(raw: unknown): LibriichiRuleRequest {
  const request = LibriichiRuleRequestSchema.parse(raw);
  const { requestId: _requestId, ...content } = request;
  const blindContent = { ...content, canonicalStreamIdentity: arenaPrefixIdentity(request) };
  return LibriichiRuleRequestSchema.parse({
    ...blindContent,
    requestId: createHash("sha256").update(libriichiRuleCanonicalJson(blindContent)).digest("hex"),
  });
}

export const ArenaExclusionReasonSchema = z.enum([
  "rules_unavailable",
  "non_action",
  "not_pre_action_snapshot",
  "fewer_than_two_candidates",
  "contains_non_discard_action",
  "invalid_action_binding",
  "case_limit_reached",
]);
export type ArenaExclusionReason = z.infer<typeof ArenaExclusionReasonSchema>;

export type ArenaSelectedDecision = Readonly<{
  canonicalDecisionOrder: number;
  snapshot: DecisionSnapshotV2;
  ruleIdentity: LibriichiRuleIdentity;
  candidates: readonly LibriichiBoundAction[];
}>;

export type ArenaDecisionScreening = Readonly<{
  selected: readonly ArenaSelectedDecision[];
  excluded: readonly Readonly<{ canonicalDecisionOrder: number; reason: ArenaExclusionReason }>[];
  exclusionCounts: Readonly<Record<ArenaExclusionReason, number>>;
}>;

function isCanonicalBoundAction(action: LibriichiBoundAction): boolean {
  if (action.actionRef !== canonicalActionRef(action.action) || action.physicalRealizations.length === 0) return false;
  if (!action.physicalRealizations.some((item) => item.actionRef === action.actionRef &&
      libriichiRuleCanonicalJson(item.action) === libriichiRuleCanonicalJson(action.action))) return false;
  return action.physicalRealizations.every((item) => {
    if (item.actionRef !== canonicalActionRef(item.action) || item.action.kind !== "discard" || action.action.kind !== "discard") return false;
    return item.action.tile.id === action.action.tile.id && item.action.tile.red === action.action.tile.red;
  });
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Screen only frozen decision state plus the complete, already-bound native
 * rule result. No actual action or Mortal label can enter this DTO.
 */
export function screenArenaDecisions(raw: unknown, options: { readonly maxIncluded?: number } = {}): ArenaDecisionScreening {
  const parsed = ArenaDecisionInputsSchema.safeParse(raw);
  if (!parsed.success) throw new Error("arena_screen_input_invalid");
  if (parsed.data.some((input) => libriichiRuleCanonicalJson(input.ruleRequest) !==
      libriichiRuleCanonicalJson(createArenaBlindRuleRequest(input.ruleRequest)))) {
    throw new Error("arena_screen_input_invalid");
  }
  const maxIncluded = options.maxIncluded ?? 3;
  if (!Number.isInteger(maxIncluded) || maxIncluded < 1 || maxIncluded > 100) {
    throw new Error("arena_case_limit_invalid");
  }
  const inputs = [...parsed.data].sort((left, right) => left.canonicalDecisionOrder - right.canonicalDecisionOrder);
  if (new Set(inputs.map((input) => input.canonicalDecisionOrder)).size !== inputs.length) {
    throw new Error("arena_screen_input_invalid");
  }

  const selected: ArenaSelectedDecision[] = [];
  const excluded: { canonicalDecisionOrder: number; reason: ArenaExclusionReason }[] = [];
  const exclusionCounts: Record<ArenaExclusionReason, number> = {
    rules_unavailable: 0,
    non_action: 0,
    not_pre_action_snapshot: 0,
    fewer_than_two_candidates: 0,
    contains_non_discard_action: 0,
    invalid_action_binding: 0,
    case_limit_reached: 0,
  };
  const exclude = (canonicalDecisionOrder: number, reason: ArenaExclusionReason) => {
    excluded.push({ canonicalDecisionOrder, reason });
    exclusionCounts[reason] += 1;
  };

  for (const input of inputs) {
    const { snapshot } = input.decision;
    if (snapshot.publicState.terminal !== null || snapshot.publicState.phase === "round_ended" || snapshot.publicState.phase === "game_ended") {
      exclude(input.canonicalDecisionOrder, "not_pre_action_snapshot");
      continue;
    }
    if (input.ruleResponse.status === "error") {
      exclude(input.canonicalDecisionOrder, "rules_unavailable");
      continue;
    }
    if (input.ruleResponse.status === "non_action") {
      exclude(input.canonicalDecisionOrder, "non_action");
      continue;
    }

    let bound: ReturnType<typeof bindLibriichiRuleResult>;
    try {
      bound = bindLibriichiRuleResult({
        request: input.ruleRequest,
        response: input.ruleResponse,
        decision: input.decision,
      });
    } catch {
      exclude(input.canonicalDecisionOrder, "invalid_action_binding");
      continue;
    }
    if (bound.response.status !== "ok") {
      exclude(input.canonicalDecisionOrder, "non_action");
      continue;
    }
    if (bound.actions.length < 2) {
      exclude(input.canonicalDecisionOrder, "fewer_than_two_candidates");
      continue;
    }
    if (bound.actions.some((action) => action.action.kind !== "discard")) {
      exclude(input.canonicalDecisionOrder, "contains_non_discard_action");
      continue;
    }
    if (bound.actions.some((action) => !isCanonicalBoundAction(action)) ||
        new Set(bound.actions.map((action) => action.actionRef)).size !== bound.actions.length) {
      exclude(input.canonicalDecisionOrder, "invalid_action_binding");
      continue;
    }
    if (selected.length >= maxIncluded) {
      exclude(input.canonicalDecisionOrder, "case_limit_reached");
      continue;
    }
    selected.push({
      canonicalDecisionOrder: input.canonicalDecisionOrder,
      snapshot,
      ruleIdentity: input.ruleRequest.identity,
      candidates: [...bound.actions].sort((left, right) => compareStable(left.actionRef, right.actionRef)),
    });
  }
  return { selected, excluded, exclusionCounts };
}

export type ArenaToolDescription = Readonly<{
  description: string;
  supportedCapabilities: readonly string[];
}>;

function aliasedMeld(meld: DecisionSnapshotV2["publicState"]["melds"][number], aliases: ArenaRunAliasVault) {
  return {
    ...meld,
    meldRef: aliases.reference(meld.meldRef),
    createdEventRef: aliases.reference(meld.createdEventRef),
    latestEventRef: aliases.reference(meld.latestEventRef),
    ...( "calledDiscardEventRef" in meld ? { calledDiscardEventRef: aliases.reference(meld.calledDiscardEventRef) } : {}),
    ...( "upgradedPonEventRef" in meld ? { upgradedPonEventRef: aliases.reference(meld.upgradedPonEventRef) } : {}),
  };
}

function aliasedRiichiState(state: DecisionSnapshotV2["publicState"]["riichiStates"][number], aliases: ArenaRunAliasVault) {
  return {
    ...state,
    declarationEventRef: state.declarationEventRef === null ? null : aliases.reference(state.declarationEventRef),
    acceptanceEventRef: state.acceptanceEventRef === null ? null : aliases.reference(state.acceptanceEventRef),
  };
}

function aliasedFuritenState(state: DecisionSnapshotV2["privateState"]["furiten"], aliases: ArenaRunAliasVault) {
  return Object.fromEntries(Object.entries(state).map(([key, component]) => [key, {
    ...component,
    evidenceIds: component.evidenceIds.map((ref) => aliases.reference(ref)),
  }])) as DecisionSnapshotV2["privateState"]["furiten"];
}

/** Explicitly project decision-time information and alias every visible source identity. */
export function createArenaBlindObservation(input: {
  readonly selected: ArenaSelectedDecision;
  readonly aliases: ArenaRunAliasVault;
  readonly tools?: ArenaToolDescription;
}): ArenaBlindObservation {
  const { snapshot } = input.selected;
  const caseRef = input.aliases.caseRef(`${snapshot.gameId}\u0000${snapshot.decisionEventRef}`);
  const rules = DecisionSnapshotV2Schema.parse(snapshot);
  const publicState = rules.publicState;
  const privateState = rules.privateState;
  const observation = {
    schemaVersion: "blind-discard-arena-observation/v1" as const,
    caseRef,
    ruleSet: publicState.ruleSet,
    decision: {
      selfActor: rules.selfActor,
      windowKind: privateState.decisionWindow.kind,
      roundOrdinal: publicState.roundOrdinal,
    },
    visibleState: {
      roundWind: publicState.roundWind,
      hand: publicState.hand,
      honba: publicState.honba,
      riichiSticks: publicState.riichiSticks,
      dealer: publicState.dealer,
      scores: publicState.scores,
      seatWinds: publicState.seatWinds,
      remainingDraws: publicState.remainingDraws,
      doraIndicators: publicState.doraIndicators,
      rivers: publicState.rivers.map((river) => river.map((discard) => ({
        sourceRef: input.aliases.reference(discard.eventRef),
        actor: discard.actor,
        tile: discard.tile,
        discardMode: discard.discardMode,
        riichiDeclarationRef: discard.riichiDeclarationEventRef === null ? null : input.aliases.reference(discard.riichiDeclarationEventRef),
        calledByRef: discard.calledByEventRef === null ? null : input.aliases.reference(discard.calledByEventRef),
      }))),
      melds: publicState.melds.map((meld) => aliasedMeld(meld, input.aliases)),
      riichiStates: publicState.riichiStates.map((state) => aliasedRiichiState(state, input.aliases)),
      self: {
        concealedTiles: privateState.concealedTiles,
        currentDraw: privateState.currentDraw === null ? null : {
          tile: privateState.currentDraw.tile,
          sourceRef: input.aliases.reference(privateState.currentDraw.eventRef),
          from: privateState.currentDraw.from,
        },
        meldRefs: privateState.selfMeldRefs.map((ref) => input.aliases.reference(ref)),
        furiten: aliasedFuritenState(privateState.furiten, input.aliases),
        evidenceRefs: privateState.evidenceIds.map((ref) => input.aliases.reference(ref)),
      },
      completeness: {
        roundContext: publicState.fields.roundContext,
        ruleSet: publicState.fields.ruleSet,
        scores: publicState.fields.scores,
        doraIndicators: publicState.fields.doraIndicators,
        rivers: publicState.fields.rivers,
        calledDiscardMarkers: publicState.fields.calledDiscardMarkers,
        melds: publicState.fields.melds,
        remainingDraws: publicState.fields.remainingDraws,
        concealedTiles: privateState.fields.concealedTiles,
        currentDraw: privateState.fields.currentDraw,
        responseOpportunities: privateState.fields.responseOpportunities,
        furiten: privateState.fields.furiten,
      },
    },
    candidates: input.selected.candidates.map((candidate): ArenaBlindDiscardCandidate => {
      if (candidate.action.kind !== "discard") throw new Error("arena_case_contains_non_discard_action");
      return {
        actionRef: ActionRefSchema.parse(candidate.actionRef),
        tile: candidate.action.tile,
        discardMode: candidate.action.discardMode,
      };
    }),
    tools: {
      description: input.tools?.description ?? "No Arena tools are available for this case yet.",
      supportedCapabilities: [...(input.tools?.supportedCapabilities ?? [])],
    },
  };
  return ArenaBlindObservationSchema.parse(observation);
}

/** Trusted binding for a future read-only MCP server; it contains no label or score. */
export function createArenaToolBinding(input: {
  readonly caseRef: string;
  readonly selected: ArenaSelectedDecision;
}): ArenaToolBinding {
  const binding = {
    schemaVersion: "blind-discard-arena-tool-binding/v1" as const,
    caseRef: input.caseRef,
    decisionSnapshot: input.selected.snapshot,
    ruleIdentity: input.selected.ruleIdentity,
    candidates: input.selected.candidates.map((candidate) => ({
      actionRef: candidate.actionRef,
      action: candidate.action,
      physicalRealizations: candidate.physicalRealizations,
    })),
  };
  return ArenaToolBindingSchema.parse(binding);
}

export type ArenaSubmissionValidation =
  | Readonly<{ status: "valid"; submission: ArenaCoachSubmission }>
  | Readonly<{ status: "invalid"; reason: "schema_invalid" | "case_mismatch" | "action_not_offered" | "alternative_not_offered" | "reference_not_observed" }>;

/** Validate final output against this case and only the citations observed in this run. */
export function validateArenaSubmission(input: {
  readonly raw: unknown;
  readonly observation: ArenaBlindObservation;
  readonly additionalEvidenceRefs?: readonly string[];
  readonly additionalSourceRefs?: readonly string[];
}): ArenaSubmissionValidation {
  const parsed = ArenaCoachSubmissionSchema.safeParse(input.raw);
  if (!parsed.success) return { status: "invalid", reason: "schema_invalid" };
  const submission = parsed.data;
  if (submission.caseRef !== input.observation.caseRef) return { status: "invalid", reason: "case_mismatch" };
  const offered = new Set(input.observation.candidates.map((candidate) => candidate.actionRef));
  if (!offered.has(submission.actionRef)) return { status: "invalid", reason: "action_not_offered" };
  if (submission.mainAlternative !== null && !offered.has(submission.mainAlternative.actionRef)) {
    return { status: "invalid", reason: "alternative_not_offered" };
  }
  const allowedEvidence = new Set([
    ...input.observation.visibleState.self.evidenceRefs,
    ...(input.additionalEvidenceRefs ?? []),
  ]);
  const allowedSources = new Set(input.additionalSourceRefs ?? []);
  if (submission.evidenceRefs.some((ref) => !allowedEvidence.has(ref)) ||
      submission.sourceRefs.some((ref) => !allowedSources.has(ref))) {
    return { status: "invalid", reason: "reference_not_observed" };
  }
  return { status: "valid", submission };
}

type BoundMortalScores = ReturnType<typeof bindLocalMortalRuleScores>;

/** Project only the validated native preferredRuntimeAction into the private label. */
export function createArenaReferenceLabel(input: {
  readonly caseRef: string;
  readonly boundScores: BoundMortalScores;
  readonly runtimeManifest: ManagedMortalRuntimeManifest;
}): ArenaReferenceLabel {
  const runtimeIdentity = input.boundScores.response.identity;
  const { nativeArtifactSha256: _nativeArtifactSha256, ...staticRuntimeIdentity } = runtimeIdentity;
  if (libriichiRuleCanonicalJson(staticRuntimeIdentity) !== libriichiRuleCanonicalJson(input.runtimeManifest.identity) ||
      !input.boundScores.actions.some((candidate) => candidate.actionRef === input.boundScores.preferred.actionRef)) {
    throw new Error("arena_reference_runtime_identity_mismatch");
  }
  const runtimeConfigSha256 = createHash("sha256").update(libriichiRuleCanonicalJson({
    geometry: input.runtimeManifest.geometry,
    inference: input.runtimeManifest.inference,
  })).digest("hex");
  return ArenaReferenceLabelSchema.parse({
    schemaVersion: "blind-discard-arena-reference/v1",
    caseRef: input.caseRef,
    actionRef: input.boundScores.preferred.actionRef,
    runtimeIdentity,
    runtimeConfigSha256,
    ruleIdentity: input.boundScores.request.ruleRequest.identity,
    scoringProtocolVersion: input.boundScores.response.protocolVersion,
  });
}
