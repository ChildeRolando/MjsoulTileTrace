import { z } from "zod";
import { GraphAuthoritySchema, GraphOriginSchema } from "./context-graph.js";

/** The provider-neutral, compact teaching view derived from GraphContextSlice. */
export const COACH_CONTEXT_SCHEMA_VERSION = "coach-context/v1" as const;

export const CoachContextRefSchema = z.string().regex(/^(?:D|N|A|F|M|E)[1-9][0-9]*$/);
export type CoachContextRef = z.infer<typeof CoachContextRefSchema>;

export const COACH_CONTEXT_NODE_KINDS = Object.freeze([
  "Decision",
  "CandidateAction",
  "KnownGameFact",
  "FactorFact",
  "FactorDifference",
  "ModelEvaluation",
  "DeterministicPreference",
] as const);
export const CoachContextNodeKindSchema = z.enum(COACH_CONTEXT_NODE_KINDS);
export type CoachContextNodeKind = z.infer<typeof CoachContextNodeKindSchema>;

/** `GraphOrigin` carries useful teaching-source distinctions. Producer names,
 * versions and evidence provenance stay local; the source class survives. */
export const CoachContextSourceClassSchema = GraphOriginSchema.exclude(["llm_reasoning"]);
export type CoachContextSourceClass = z.infer<typeof CoachContextSourceClassSchema>;

/** KnownGameFacts.provenance is a separate semantic trust/source category.
 * Keep it under an explicit teaching name instead of dropping it with graph
 * provenance metadata. */
export const CoachFactSourceSchema = z.enum([
  "raw_replay",
  "user_asserted",
  "mixed",
  "legacy_regression_bridge_only",
]);
export type CoachFactSource = z.infer<typeof CoachFactSourceSchema>;

/** Second, deliberately explicit teaching allow-list. This is not derived
 * from GraphContextSlice's broader transport allow-list. Identity references
 * in these values are replaced by per-request aliases before serialization. */
export const COACH_CONTEXT_PAYLOAD_ALLOWLIST = Object.freeze({
  Decision: Object.freeze([
    "surface", "roundOrdinal", "normalizedDecisionContext", "automaticComparisonScope",
  ]),
  CandidateAction: Object.freeze(["actionRef", "action", "origins"]),
  KnownGameFact: Object.freeze([
    "factSource", "actor", "selfRiichi", "handStructureYakuContext", "decisionEventRef", "decisionWindow",
    "concealedTiles", "currentDraw", "melds", "doraIndicators", "rivers",
    "furitenSelfRiver", "threats", "defenseThreats", "roundWind", "seatWind",
    "dealer", "remainingDraws", "completeness",
  ]),
  FactorFact: Object.freeze([
    "factorKey", "dimension", "status", "evidenceClass", "preferenceEligibility",
    "value", "limitations",
  ]),
  FactorDifference: Object.freeze([
    "differenceId", "axis", "dimension", "leftActionRef", "rightActionRef", "direction",
    "valueRelation", "leftValue", "rightValue", "preferenceEligibility",
    "evidenceClass", "limitations",
  ]),
  ModelEvaluation: Object.freeze([
    "scoreMethod", "detailPolicy", "candidates", "preferredActions",
    "actualActionRef", "scoredActualModelActionRef", "errorGap", "modelReason",
  ]),
  DeterministicPreference: Object.freeze([
    "actionRefs", "scope", "decisiveDifferenceIds", "coverage",
  ]),
} as const satisfies Readonly<Record<CoachContextNodeKind, readonly string[]>>);

/** Fields whose values are producer/audit identities rather than teaching
 * facts. `eventRef` fields are intentionally absent: they are mapped to E# so
 * the existing timing and call/riichi relationships remain visible. */
export const COACH_CONTEXT_LOCAL_ONLY_KEYS = Object.freeze([
  "nodeId", "edgeId", "graphId", "packageId", "sliceId", "partition", "origin",
  "producer", "producerVersion", "provenance", "sourceRef", "sourceRefs",
  "evidenceRef", "evidenceRefs", "evidenceId", "evidenceIds", "factSetId", "decisionId",
  "stateHash", "sourceStateHash", "streamPrefixHash", "sourceStreamPrefixHash",
  "hash", "semanticContentHash", "requestId", "evaluationId",
  "comparisonSetId", "decisionLayerRef", "engineId", "engineVersion",
  "adapterVersion", "engineIdentity", "projectedStateRef",
] as const);

export const COACH_CONTEXT_EVENT_REFERENCE_KEYS = Object.freeze([
  "decisionEventRef", "decisionEventId", "triggerEventRef", "eventRef", "eventId",
  "eventRefs", "eventIds", "riverEventRef", "riverEventId", "calledEventId",
  "afterRiichiEventIds", "declarationEventId",
  "drawEventRef", "responseEventRef", "calledByEventRef", "calledDiscardEventRef",
  "riichiDeclarationEventRef", "createdEventRef", "latestEventRef",
  "upgradedPonEventRef", "declarationEventRef", "acceptanceEventRef",
  "appliedEventRef", "appliedEventRefs", "canonicalEventRefs", "riichiAcceptanceEventRef",
  "closingEventRef", "sourceEventRef", "sourceEventRefs", "winSourceEventRef",
  "settlementEventRef", "terminalEventRef", "kanEventRef",
] as const);

export const COACH_CONTEXT_MELD_REFERENCE_KEYS = Object.freeze([
  "meldRef", "existingMeldRef", "openMeldRefs", "selfMeldRefs",
] as const);

const coachContextEdgePayloadSchemas = {
  contains: z.object({}).strict(),
  applies_to: z.object({}).strict(),
  compares: z.object({ side: z.enum(["left", "right"]) }).strict(),
  supports: z.object({ direction: z.enum(["supports_left", "supports_right"]) }).strict(),
  recommends: z.object({}).strict(),
} as const;

export const CoachContextEdgeSchema = z.discriminatedUnion("edgeKind", [
  z.object({ edgeKind: z.literal("contains"), fromRef: CoachContextRefSchema, toRef: CoachContextRefSchema, payload: coachContextEdgePayloadSchemas.contains }).strict(),
  z.object({ edgeKind: z.literal("applies_to"), fromRef: CoachContextRefSchema, toRef: CoachContextRefSchema, payload: coachContextEdgePayloadSchemas.applies_to }).strict(),
  z.object({ edgeKind: z.literal("compares"), fromRef: CoachContextRefSchema, toRef: CoachContextRefSchema, payload: coachContextEdgePayloadSchemas.compares }).strict(),
  z.object({ edgeKind: z.literal("supports"), fromRef: CoachContextRefSchema, toRef: CoachContextRefSchema, payload: coachContextEdgePayloadSchemas.supports }).strict(),
  z.object({ edgeKind: z.literal("recommends"), fromRef: CoachContextRefSchema, toRef: CoachContextRefSchema, payload: coachContextEdgePayloadSchemas.recommends }).strict(),
]);
export type CoachContextEdge = z.infer<typeof CoachContextEdgeSchema>;

export const CoachContextNodeSchema = z.object({
  ref: CoachContextRefSchema,
  decisionRef: CoachContextRefSchema.regex(/^D[1-9][0-9]*$/),
  nodeKind: CoachContextNodeKindSchema,
  sourceClass: CoachContextSourceClassSchema,
  authority: GraphAuthoritySchema,
  payload: z.record(z.string(), z.unknown()),
}).strict().superRefine((node, context) => {
  const expectedPrefix = node.nodeKind === "Decision" ? "D"
    : node.nodeKind === "CandidateAction" ? "A"
      : node.nodeKind === "FactorDifference" ? "F" : "N";
  if (!node.ref.startsWith(expectedPrefix)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `${node.nodeKind} ref must use ${expectedPrefix} namespace`, path: ["ref"] });
  }
  if (node.nodeKind === "Decision" && node.ref !== node.decisionRef) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Decision ref must equal its decisionRef", path: ["decisionRef"] });
  }
  const allowed = new Set<string>(COACH_CONTEXT_PAYLOAD_ALLOWLIST[node.nodeKind]);
  for (const key of Object.keys(node.payload)) {
    if (!allowed.has(key)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Payload key ${key} is outside the CoachContext allow-list`, path: ["payload", key] });
    }
  }
  if (node.nodeKind === "KnownGameFact" && !CoachFactSourceSchema.safeParse(node.payload.factSource).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "KnownGameFact must retain its teaching factSource", path: ["payload", "factSource"] });
  }
  if (node.nodeKind === "CandidateAction" && node.payload.actionRef !== node.ref) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "CandidateAction actionRef must equal its ref", path: ["payload", "actionRef"] });
  }
  if (node.nodeKind === "FactorDifference" && node.payload.differenceId !== node.ref) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "FactorDifference differenceId must equal its ref", path: ["payload", "differenceId"] });
  }
  rejectLocalOnlyFields(node.payload, context, ["payload"]);
  validateShortReferenceRoles(node.payload, node.decisionRef, context, ["payload"]);
});
export type CoachContextNode = z.infer<typeof CoachContextNodeSchema>;

const LOCAL_ONLY_KEY_SET = new Set<string>(COACH_CONTEXT_LOCAL_ONLY_KEYS);
const EVENT_KEY_SET = new Set<string>(COACH_CONTEXT_EVENT_REFERENCE_KEYS);
const MELD_KEY_SET = new Set<string>(COACH_CONTEXT_MELD_REFERENCE_KEYS);
const SHORT_REF_PREFIX_BY_KEY: Readonly<Record<string, string>> = Object.freeze({
  decisionRef: "D",
  actionRef: "A", actualActionRef: "A", scoredActualModelActionRef: "A",
  leftActionRef: "A", rightActionRef: "A", differenceId: "F",
  meldRef: "M", existingMeldRef: "M", eventRef: "E", eventId: "E",
});
const SHORT_REF_ARRAY_PREFIX_BY_KEY: Readonly<Record<string, string>> = Object.freeze({
  actionRefs: "A", preferredActions: "A", decisiveDifferenceIds: "F",
  openMeldRefs: "M", selfMeldRefs: "M", sourceEventRefs: "E", eventRefs: "E",
  eventIds: "E", afterRiichiEventIds: "E", appliedEventRef: "E", appliedEventRefs: "E",
  canonicalEventRefs: "E",
});

function rejectLocalOnlyFields(value: unknown, context: z.RefinementCtx, path: (string | number)[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectLocalOnlyFields(entry, context, [...path, index]));
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (LOCAL_ONLY_KEY_SET.has(key)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Local-only field ${key} crossed the CoachContext boundary`, path: [...path, key] });
      }
      rejectLocalOnlyFields(entry, context, [...path, key]);
    }
  }
}

function refHasPrefix(value: unknown, prefix: string): boolean {
  return typeof value === "string" && new RegExp(`^${prefix}[1-9][0-9]*$`).test(value);
}

function validateShortReferenceRoles(value: unknown, decisionRef: string, context: z.RefinementCtx, path: (string | number)[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateShortReferenceRoles(entry, decisionRef, context, [...path, index]));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const eventField = EVENT_KEY_SET.has(key);
    const meldField = MELD_KEY_SET.has(key);
    if (eventField && entry !== null) {
      const values = Array.isArray(entry) ? entry : [entry];
      if (values.some((item) => !refHasPrefix(item, "E"))) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `${key} must use compact event refs`, path: [...path, key] });
      }
    }
    if (meldField && entry !== null) {
      const values = Array.isArray(entry) ? entry : [entry];
      if (values.some((item) => !refHasPrefix(item, "M"))) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `${key} must use compact meld refs`, path: [...path, key] });
      }
    }
    if (!eventField && !meldField && SHORT_REF_PREFIX_BY_KEY[key] !== undefined && !refHasPrefix(entry, SHORT_REF_PREFIX_BY_KEY[key]!)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `${key} must be a compact role reference`, path: [...path, key] });
    } else if (!eventField && !meldField && SHORT_REF_ARRAY_PREFIX_BY_KEY[key] !== undefined) {
      const expectedPrefix = SHORT_REF_ARRAY_PREFIX_BY_KEY[key]!;
      if (!Array.isArray(entry) || entry.some((item) => !refHasPrefix(item, expectedPrefix))) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `${key} must contain compact role references`, path: [...path, key] });
      }
    }
    if (key === "automaticComparisonScope" && entry !== undefined) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "automaticComparisonScope must be an object", path: [...path, key] });
      } else {
        const refs = (entry as Record<string, unknown>).actionRefs;
        if (!Array.isArray(refs) || refs.length !== 2 || refs.some((item) => !refHasPrefix(item, "A"))) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: "automaticComparisonScope actionRefs must be two compact action refs", path: [...path, key, "actionRefs"] });
        }
      }
    }
    if (key === "decisionRef" && entry !== decisionRef) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Nested decisionRef must match the owning decision", path: [...path, key] });
    }
    validateShortReferenceRoles(entry, decisionRef, context, [...path, key]);
  }
}

export const CoachContextEventSchema = z.object({
  ref: CoachContextRefSchema.regex(/^E[1-9][0-9]*$/),
  /** Present only when canonical replay refs carried verifiable chronology. */
  sequenceGroup: z.number().int().positive().optional(),
  sequence: z.number().int().positive().optional(),
}).strict().superRefine((event, context) => {
  if ((event.sequenceGroup === undefined) !== (event.sequence === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Event chronology requires both sequenceGroup and sequence" });
  }
});
export type CoachContextEvent = z.infer<typeof CoachContextEventSchema>;

export const CoachContextSchema = z.object({
  schemaVersion: z.literal(COACH_CONTEXT_SCHEMA_VERSION),
  selectedDecisionRefs: z.array(CoachContextRefSchema.regex(/^D[1-9][0-9]*$/)),
  nodes: z.array(CoachContextNodeSchema),
  edges: z.array(CoachContextEdgeSchema),
  events: z.array(CoachContextEventSchema),
}).strict().superRefine((coachContext, context) => {
  if (new Set(coachContext.selectedDecisionRefs).size !== coachContext.selectedDecisionRefs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "CoachContext selected decisions must be unique", path: ["selectedDecisionRefs"] });
  }
  const nodeByRef = new Map<string, CoachContextNode>();
  coachContext.nodes.forEach((node, index) => {
    if (nodeByRef.has(node.ref)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate CoachContext ref ${node.ref}`, path: ["nodes", index, "ref"] });
    } else nodeByRef.set(node.ref, node);
  });
  const eventRefs = new Set<string>();
  coachContext.events.forEach((event, index) => {
    if (eventRefs.has(event.ref)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate CoachContext event ref ${event.ref}`, path: ["events", index, "ref"] });
    eventRefs.add(event.ref);
  });
  const decisionRefs = new Set(coachContext.selectedDecisionRefs);
  const decisionNodes = coachContext.nodes.filter((node) => node.nodeKind === "Decision");
  if (decisionNodes.length !== decisionRefs.size || decisionNodes.some((node) => !decisionRefs.has(node.ref))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "CoachContext decision nodes must match selectedDecisionRefs", path: ["nodes"] });
  }
  const candidatesByDecision = new Map<string, Set<string>>();
  const differencesByDecision = new Map<string, Set<string>>();
  const meldsByDecision = new Map<string, Set<string>>();
  const allNodeRefsByDecision = new Map<string, Set<string>>();
  for (const [index, node] of coachContext.nodes.entries()) {
    if (!decisionRefs.has(node.decisionRef)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Node ${node.ref} is outside the selected decisions`, path: ["nodes", index, "decisionRef"] });
    }
    const add = (map: Map<string, Set<string>>, owner: string, ref: string) => {
      const set = map.get(owner) ?? new Set<string>();
      set.add(ref);
      map.set(owner, set);
    };
    add(allNodeRefsByDecision, node.decisionRef, node.ref);
    if (node.nodeKind === "CandidateAction") add(candidatesByDecision, node.decisionRef, node.ref);
    if (node.nodeKind === "FactorDifference") add(differencesByDecision, node.decisionRef, node.ref);
    if (node.nodeKind === "KnownGameFact" && Array.isArray(node.payload.melds)) {
      for (const meld of node.payload.melds) {
        if (meld !== null && typeof meld === "object" && typeof (meld as Record<string, unknown>).meldRef === "string") {
          add(meldsByDecision, node.decisionRef, (meld as Record<string, unknown>).meldRef as string);
        }
      }
    }
  }
  const checkPayloadRefs = (value: unknown, owner: string, path: (string | number)[]) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => checkPayloadRefs(entry, owner, [...path, index]));
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entry === "string") {
        const prefix = EVENT_KEY_SET.has(key) ? "E"
          : MELD_KEY_SET.has(key) ? "M"
            : SHORT_REF_PREFIX_BY_KEY[key];
        if (prefix !== undefined) {
          const registry = prefix === "E" ? eventRefs
            : prefix === "M" ? meldsByDecision.get(owner)
              : prefix === "A" ? candidatesByDecision.get(owner)
                : prefix === "F" ? differencesByDecision.get(owner)
                  : prefix === "D" ? decisionRefs
                    : allNodeRefsByDecision.get(owner);
          if (!registry?.has(entry)) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: `${key} reference is not registered for this decision`, path: [...path, key] });
          }
        }
      } else if (Array.isArray(entry)) {
        const prefix = EVENT_KEY_SET.has(key) ? "E"
          : MELD_KEY_SET.has(key) ? "M"
            : SHORT_REF_ARRAY_PREFIX_BY_KEY[key];
        if (prefix !== undefined) {
          const registry = prefix === "E" ? eventRefs
            : prefix === "M" ? meldsByDecision.get(owner)
              : prefix === "A" ? candidatesByDecision.get(owner)
                : prefix === "F" ? differencesByDecision.get(owner)
                  : allNodeRefsByDecision.get(owner);
          entry.forEach((item, itemIndex) => {
            if (typeof item !== "string" || !registry?.has(item)) {
              context.addIssue({ code: z.ZodIssueCode.custom, message: `${key} reference is not registered for this decision`, path: [...path, key, itemIndex] });
            }
          });
        }
      }
      checkPayloadRefs(entry, owner, [...path, key]);
    }
  };
  coachContext.nodes.forEach((node, index) => checkPayloadRefs(node.payload, node.decisionRef, ["nodes", index, "payload"]));

  for (const [index, edge] of coachContext.edges.entries()) {
    const from = nodeByRef.get(edge.fromRef);
    const to = nodeByRef.get(edge.toRef);
    if (from === undefined || to === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "CoachContext edge endpoint is unresolved", path: ["edges", index] });
      continue;
    }
    if (from.decisionRef !== to.decisionRef) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "CoachContext edge cannot cross decisions", path: ["edges", index] });
      continue;
    }
    const validShape = edge.edgeKind === "contains"
      ? from.nodeKind === "Decision" && to.nodeKind !== "Decision"
      : edge.edgeKind === "applies_to"
        ? from.nodeKind === "FactorFact" && to.nodeKind === "CandidateAction"
        : edge.edgeKind === "compares" || edge.edgeKind === "supports"
          ? from.nodeKind === "FactorDifference" && to.nodeKind === "CandidateAction"
          : (from.nodeKind === "ModelEvaluation" || from.nodeKind === "DeterministicPreference") && to.nodeKind === "CandidateAction";
    if (!validShape) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `CoachContext ${edge.edgeKind} endpoints have invalid teaching roles`, path: ["edges", index] });
    }
  }
});
export type CoachContext = z.infer<typeof CoachContextSchema>;

/** Persist only compact-request measurements and its hash; never a prompt,
 * context payload, or local identity dictionary. */
export const CoachRequestContextAuditSchema = z.object({
  coachContextVersion: z.literal(COACH_CONTEXT_SCHEMA_VERSION),
  inputContextHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  promptBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  contextBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  decisionCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  nodeCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  semanticEdgeCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type CoachRequestContextAudit = z.infer<typeof CoachRequestContextAuditSchema>;
