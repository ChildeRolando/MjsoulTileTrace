/**
 * M6-D1 — Typed Context Graph substrate contract freeze.
 *
 * Spec: coach/docs/specs/2026-08-19-m6-d1-context-graph-substrate-design.md
 * (模块与依赖: contracts 包新增 ContextGraph / GraphContextSlice 契约: node/edge
 * schema、node kind / edge kind / origin / authority 枚举、allow-list 常量、
 * schema 版本字面量; contracts 不新增任何依赖).
 *
 * This module freezes:
 *  - the v1 node kind / edge kind / partition / origin / authority enums;
 *  - `ContextGraph` / `ContextGraphNode` / `ContextGraphEdge` schemas;
 *  - `GraphContextSlice` schema (the LLM transport boundary, ADR-0004);
 *  - the schema version literals;
 *  - `GRAPH_SLICE_PAYLOAD_ALLOWLIST` — the single explicit allow-list owner of
 *    what may cross the LLM boundary per node kind. The slice schema rejects
 *    allow-list-external payload keys at parse time; the reasoning package's
 *    slice builder filters with the same constant and its slice validator
 *    re-checks untrusted slices.
 *
 * `causes` is deliberately NOT an edge kind (ADR-0004 / design §8/§11): any
 * `causes` string fails the edge enum at parse time and the graph validator
 * pre-scans for a named error. The graph node payload is opaque
 * (`z.unknown()`, like `EvidenceRecord.payload`) — the typed per-kind payload
 * projection lives in the reasoning projector, and the id-recomputation check
 * (shared serializer) + the slice allow-list enforce the per-kind shape.
 */
import { z } from "zod";

/** The current ContextGraph schema version (contract-owned literal). */
export const CONTEXT_GRAPH_SCHEMA_VERSION = "context-graph/v1" as const;

/** The current GraphContextSlice schema version (contract-owned literal). */
export const GRAPH_CONTEXT_SLICE_SCHEMA_VERSION = "graph-context-slice/v1" as const;

// ---------------------------------------------------------------------------
// v1 enums
// ---------------------------------------------------------------------------

/** v1 node kinds: 8 evidence-subgraph kinds + 3 reasoning-overlay kinds
 *  (D2 append-only). */
export const GraphNodeKindSchema = z.enum([
  "Decision",
  "CandidateAction",
  "KnownGameFact",
  "FactorFact",
  "FactorDifference",
  "ModelEvaluation",
  "DeterministicPreference",
  "Evidence",
  "CoachInference",
  "CoachJudgment",
  "Explanation",
]);
export type GraphNodeKind = z.infer<typeof GraphNodeKindSchema>;

/** The evidence-subgraph node kinds: origin is never LLM and the partition is
 *  immutable under the reasoning overlay. */
export const EVIDENCE_GRAPH_NODE_KINDS: readonly GraphNodeKind[] = Object.freeze([
  "Decision",
  "CandidateAction",
  "KnownGameFact",
  "FactorFact",
  "FactorDifference",
  "ModelEvaluation",
  "DeterministicPreference",
  "Evidence",
]);

/** The reasoning-overlay node kinds (spec "Reasoning overlay 分区校验"): only
 *  D2 may append them, with origin `llm_reasoning` and authority `coach`. */
export const REASONING_GRAPH_NODE_KINDS: readonly GraphNodeKind[] = Object.freeze([
  "CoachInference",
  "CoachJudgment",
  "Explanation",
]);

/** v1 edge kinds. The first six are produced by the D1 projection; the last
 *  three are reserved for the reasoning overlay (D2) — the D1 projector never
 *  produces them (spec "Edge 模型"). `causes` is absent by design. */
export const GraphEdgeKindSchema = z.enum([
  "contains",
  "applies_to",
  "compares",
  "supports",
  "recommends",
  "derived_from",
  "opposes",
  "qualifies",
  "verbalizes",
]);
export type GraphEdgeKind = z.infer<typeof GraphEdgeKindSchema>;

/** The projection edge kinds (D1). */
export const PROJECTION_GRAPH_EDGE_KINDS: readonly GraphEdgeKind[] = Object.freeze([
  "contains",
  "applies_to",
  "compares",
  "supports",
  "recommends",
  "derived_from",
]);

/** The reasoning-overlay edge kinds (D2 reserved). */
export const REASONING_GRAPH_EDGE_KINDS: readonly GraphEdgeKind[] = Object.freeze([
  "opposes",
  "qualifies",
  "verbalizes",
]);

export const GraphPartitionSchema = z.enum(["evidence", "reasoning"]);
export type GraphPartition = z.infer<typeof GraphPartitionSchema>;

export const GraphOriginSchema = z.enum([
  "canonical_replay",
  "factor_pipeline",
  "model_evaluation",
  "package_projection",
  "user_assertion",
  "legacy_regression_bridge",
  "llm_reasoning",
]);
export type GraphOrigin = z.infer<typeof GraphOriginSchema>;

export const GraphAuthoritySchema = z.enum([
  "hard",
  "advisory",
  "model",
  "coach",
  "structural",
]);
export type GraphAuthority = z.infer<typeof GraphAuthoritySchema>;

// ---------------------------------------------------------------------------
// Node / edge / graph schemas
// ---------------------------------------------------------------------------

export const ContextGraphNodeSchema = z.object({
  /** Stable, globally unique id: `ctxg:<nodeKind>:<sha256(canonicalJson(
   *  semanticKey))>` (spec "Node / Edge / Slice 身份派生"). */
  nodeId: z.string().min(1),
  nodeKind: GraphNodeKindSchema,
  partition: GraphPartitionSchema,
  origin: GraphOriginSchema,
  authority: GraphAuthoritySchema,
  /** Deterministic producer chain name of the node payload. */
  producer: z.string().min(1),
  /** Deterministic producer version of the node payload. */
  producerVersion: z.string().min(1),
  /** Kind-specific projection payload (opaque at the contract level). */
  payload: z.unknown(),
  /** Evidence ids this node is derived from (evidence-bearing nodes) or []
   *  (structural / evidence nodes). */
  provenance: z.array(z.string().min(1)),
}).strict();
export type ContextGraphNode = z.infer<typeof ContextGraphNodeSchema>;

export const ContextGraphEdgeSchema = z.object({
  /** Stable, globally unique id: `ctxg:edge:<sha256(canonicalJson(
   *  {from,to,edgeKind,payload}))>` (spec "Node / Edge / Slice 身份派生"). */
  edgeId: z.string().min(1),
  edgeKind: GraphEdgeKindSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  origin: GraphOriginSchema,
  /** Evidence ids the edge is derived from ([] for D1 projection edges). */
  provenance: z.array(z.string().min(1)),
  /** Kind-specific edge payload (D1: compares {side}, supports
   *  {direction}). */
  payload: z.unknown(),
}).strict();
export type ContextGraphEdge = z.infer<typeof ContextGraphEdgeSchema>;

export const ContextGraphSchema = z.object({
  schemaVersion: z.literal(CONTEXT_GRAPH_SCHEMA_VERSION),
  /** `context-graph:<packageId>` — deterministically derived from the source
   *  package (spec "Graph 总体形状"). */
  graphId: z.string().min(1),
  packageId: z.string().min(1),
  nodes: z.array(ContextGraphNodeSchema),
  edges: z.array(ContextGraphEdgeSchema),
}).strict();
export type ContextGraph = z.infer<typeof ContextGraphSchema>;

// ---------------------------------------------------------------------------
// GraphContextSlice + LLM-safe allow-list
// ---------------------------------------------------------------------------

/**
 * The explicit LLM-safe payload allow-list (spec "GraphContextSlice
 * allow-list" table) — the single owner of what crosses the LLM boundary per
 * node kind. The slice schema rejects payload keys outside this list at parse
 * time; the reasoning slice builder filters with it and the slice validator
 * re-checks untrusted slices.
 *
 * Deliberately NOT derived from the M6-C payload schemas: the LLM surface must
 * not silently expand when a graph/payload field is added — widening the
 * boundary is a deliberate contract change (spec user story 7).
 *
 * Evidence ids ride on `node.provenance`, never in slice payloads;
 * `ModelEvaluation.detailPolicy` rides WITHOUT the wall-clock `frozenAt`.
 * Reasoning kinds have an EMPTY allow-list: D1 never slices reasoning nodes
 * (the projection emits none), so no reasoning payload can cross the boundary.
 */
export const GRAPH_SLICE_PAYLOAD_ALLOWLIST = Object.freeze({
  Decision: Object.freeze([
    "decisionId",
    "surface",
    "roundOrdinal",
    "normalizedDecisionContext",
  ]),
  CandidateAction: Object.freeze(["actionRef", "action", "origins"]),
  KnownGameFact: Object.freeze([
    "factSetId",
    "provenance",
    "actor",
    "selfRiichi",
    "handStructureYakuContext",
    "decisionEventRef",
    "decisionWindow",
    "concealedTiles",
    "currentDraw",
    "melds",
    "doraIndicators",
    "rivers",
    "furitenSelfRiver",
    "threats",
    "defenseThreats",
    "roundWind",
    "seatWind",
    "dealer",
    "remainingDraws",
    "completeness",
  ]),
  FactorFact: Object.freeze([
    "factorKey",
    "dimension",
    "status",
    "evidenceClass",
    "preferenceEligibility",
    "value",
    "limitations",
  ]),
  FactorDifference: Object.freeze([
    "differenceId",
    "axis",
    "dimension",
    "leftActionRef",
    "rightActionRef",
    "direction",
    "valueRelation",
    "leftValue",
    "rightValue",
    "preferenceEligibility",
    "evidenceClass",
    "limitations",
  ]),
  ModelEvaluation: Object.freeze([
    "evaluationId",
    "comparisonSetId",
    "decisionLayerRef",
    "engineId",
    "engineVersion",
    "adapterVersion",
    "scoreMethod",
    "detailPolicy",
    "candidates",
    "preferredActions",
    "actualActionRef",
    "scoredActualModelActionRef",
    "errorGap",
    "modelReason",
  ]),
  DeterministicPreference: Object.freeze([
    "actionRefs",
    "scope",
    "decisiveDifferenceIds",
    "coverage",
  ]),
  Evidence: Object.freeze([
    "evidenceId",
    "kind",
    "producer",
    "producerVersion",
    "sourceRefs",
    "payload",
  ]),
  CoachInference: Object.freeze([]),
  CoachJudgment: Object.freeze([]),
  Explanation: Object.freeze([]),
}) as Readonly<Record<GraphNodeKind, readonly string[]>>;

/** ModelEvaluation's wall-clock `detailPolicy.frozenAt` never crosses the LLM
 *  boundary (spec allow-list: "detailPolicy（不含 frozenAt）"). */
export const GRAPH_SLICE_MODEL_EVALUATION_STRIP_FROZEN_AT = true as const;

/**
 * Allow-list violations of one slice payload (shared by the slice schema
 * refine and the reasoning slice validator). Returns an empty list when the
 * payload conforms:
 *  - payload must be a plain object;
 *  - every key must be in `GRAPH_SLICE_PAYLOAD_ALLOWLIST[nodeKind]`;
 *  - `ModelEvaluation.detailPolicy` must be a plain object without the
 *    wall-clock `frozenAt`.
 */
export function slicePayloadViolations(
  payload: unknown,
  nodeKind: GraphNodeKind,
): string[] {
  const violations: string[] = [];
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return ["payload must be a plain object"];
  }
  const record = payload as Record<string, unknown>;
  const allowed = new Set(GRAPH_SLICE_PAYLOAD_ALLOWLIST[nodeKind]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) violations.push(`unknown key "${key}"`);
  }
  if (nodeKind === "ModelEvaluation" && record.detailPolicy !== undefined) {
    const detailPolicy = record.detailPolicy;
    if (
      detailPolicy === null ||
      typeof detailPolicy !== "object" ||
      Array.isArray(detailPolicy)
    ) {
      violations.push("detailPolicy must be a plain object");
    } else if ("frozenAt" in (detailPolicy as Record<string, unknown>)) {
      violations.push("detailPolicy must not carry the wall-clock frozenAt");
    }
  }
  return violations;
}

/**
 * The single LLM transport boundary (ADR-0004 / design §9): only
 * `GraphContextSlice` may cross it — never the full ContextGraph, never the
 * raw package, never the raw Mortal report or raw replay bytes. Slice payloads
 * are allow-list filtered at parse time.
 */
export const GraphContextSliceSchema = z.object({
  schemaVersion: z.literal(GRAPH_CONTEXT_SLICE_SCHEMA_VERSION),
  /** `ctxg:slice:<sha256(canonicalJson({packageId, policyVersion,
   *  selectedDecisionIds}))>` (spec "Node / Edge / Slice 身份派生"). */
  sliceId: z.string().min(1),
  /** Copied from the source graph's packageId — never recomputed, never taken
   *  from a third source (guard 3). */
  packageId: z.string().min(1),
  /** Rank-ordered selected decision ids (builder contract; the slice does not
   *  carry ranks — the selection is the rank authority). */
  selectedDecisionIds: z.array(z.string().min(1)),
  nodes: z.array(ContextGraphNodeSchema),
  edges: z.array(ContextGraphEdgeSchema),
}).strict().superRefine((slice, context) => {
  // Allow-list gate at parse time (spec: contracts 拒绝 allow-list 外字段).
  slice.nodes.forEach((node, index) => {
    const violations = slicePayloadViolations(node.payload, node.nodeKind);
    for (const violation of violations) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: violation,
        path: ["nodes", index, "payload"],
      });
    }
  });
  // Selected decision ids are unique; the rank order itself is a builder
  // contract verified by the reasoning slice validator against the selection.
  if (new Set(slice.selectedDecisionIds).size !== slice.selectedDecisionIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Selected decision ids must be unique",
      path: ["selectedDecisionIds"],
    });
  }
});
export type GraphContextSlice = z.infer<typeof GraphContextSliceSchema>;
