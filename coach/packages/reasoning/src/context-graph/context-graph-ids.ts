/**
 * M6-D1 — shared ContextGraph identity derivation (guard 1).
 *
 * The projector, the slice builder, the graph/slice validators and the
 * reasoning partition validator ALL derive ids through exactly this module,
 * which in turn calls the SINGLE M6-C `package-identity` deterministic
 * serializer (`canonicalJson` + `sha256Hex`) — no second canonicalization /
 * stringify exists in the M6-D1 layer (spec "统一 deterministic serializer
 * (guard)": 禁止 projector 或 slice builder 自行 JSON.stringify、自行排序键或
 * 另写一套 canonicalization).
 *
 * Id formats (spec "Node / Edge / Slice 身份派生"):
 *  - nodeId  = `ctxg:<nodeKind>:<sha256(canonicalJson({nodeKind, key}))>`
 *  - edgeId  = `ctxg:edge:<sha256(canonicalJson({from, to, edgeKind,
 *    payload}))>`
 *  - sliceId = `ctxg:slice:<sha256(canonicalJson({packageId, policyVersion,
 *    selectedDecisionIds}))>`
 *
 * The semantic node key is derived from the node payload with the SINGLE
 * `semanticKeyOfNode` implementation shared by projector and graph validator,
 * so a payload tamper that leaves a stale nodeId is always caught.
 */
import type { GraphEdgeKind, GraphNodeKind } from "@riichi-coach/contracts";
import { canonicalJson, sha256Hex } from "../analysis/package-identity.js";

/** Locale-independent id ordering (same rule as the selector's total order). */
export function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** A missing semantic key field cannot derive an id — fail closed with the
 *  field name so the caller can name the error (guard 1). */
function requireKey(value: unknown, field: string): unknown {
  if (value === undefined || value === null) {
    throw new Error(`missing semantic key field ${field}`);
  }
  return value;
}

/**
 * The stable semantic key of one node (spec: 语义键必须是 package 内已经稳定
 * 存在的字段 — decisionId / actionRef / factorKey / differenceId / evidenceId /
 * factSetId 等 — 不得含 wall-clock、数组下标、遍历顺序). Composite keys are
 * arrays of stable package fields so every node id is globally unique within
 * the package. Reasoning kinds have no D1 derivation (D2 defines it).
 */
export function semanticKeyOfNode(
  nodeKind: GraphNodeKind,
  payload: unknown,
): unknown {
  const record = payload as Record<string, unknown>;
  switch (nodeKind) {
    case "Decision":
      return requireKey(record.decisionId, "decisionId");
    case "CandidateAction":
      return [
        requireKey(record.decisionId, "decisionId"),
        requireKey(record.actionRef, "actionRef"),
      ];
    case "KnownGameFact":
      return [
        requireKey(record.decisionId, "decisionId"),
        requireKey(record.factSetId, "factSetId"),
      ];
    case "FactorFact":
      return [
        requireKey(record.decisionId, "decisionId"),
        requireKey(record.actionRef, "actionRef"),
        requireKey(record.factorKey, "factorKey"),
      ];
    case "FactorDifference":
      return [
        requireKey(record.decisionId, "decisionId"),
        requireKey(record.differenceId, "differenceId"),
      ];
    case "ModelEvaluation":
      return [
        requireKey(record.decisionId, "decisionId"),
        requireKey(record.evaluationId, "evaluationId"),
      ];
    case "DeterministicPreference":
      return [
        requireKey(record.decisionId, "decisionId"),
        "deterministic-preference",
      ];
    case "Evidence":
      return requireKey(record.evidenceId, "evidenceId");
    default:
      // CoachInference / CoachJudgment / Explanation: D1 never derives
      // reasoning node ids (no append implementation; D2 owns the derivation).
      throw new Error(
        `m6d1_id_derivation_reasoning_kind:${nodeKind}: reasoning node ids are a D2 concern`,
      );
  }
}

/** The stable node id: `ctxg:<nodeKind>:<digest>`. */
export function deriveNodeId(nodeKind: GraphNodeKind, semanticKey: unknown): string {
  return `ctxg:${nodeKind}:${sha256Hex(canonicalJson({
    nodeKind,
    key: semanticKey,
  }))}`;
}

/** The stable edge id: `ctxg:edge:<digest>` over (from, to, edgeKind,
 *  payload). */
export function deriveEdgeId(input: {
  from: string;
  to: string;
  edgeKind: GraphEdgeKind;
  payload: unknown;
}): string {
  return `ctxg:edge:${sha256Hex(canonicalJson(input))}`;
}

/** The stable slice id: `ctxg:slice:<digest>` over (packageId, policyVersion,
 *  selectedDecisionIds). */
export function deriveSliceId(input: {
  packageId: string;
  policyVersion: string;
  selectedDecisionIds: readonly string[];
}): string {
  return `ctxg:slice:${sha256Hex(canonicalJson(input))}`;
}
