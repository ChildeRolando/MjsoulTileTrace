/**
 * M6-D1 — `projectContextGraph`: the ONLY evidence-subgraph projection seam
 * (spec: 两个平级新增 seam 之一; 唯一 evidence-subgraph 构建入口).
 *
 *   schema-valid StructuredAnalysisPackage → deterministic ContextGraph
 *
 * The projector is a pure, synchronous, side-effect-free projection (no
 * wall-clock, no random, no traversal-order dependence — spec user stories
 * 1/23). It introduces NO analysis: every node/edge is derived from
 * package-stable fields (spec: 投影不引入新的分析计算，不生成 package 中不存在
 * 的事实或差异).
 *
 * Fail-closed contract (spec user story 24 / Testing Decisions):
 *  - the input is re-parsed with the frozen `StructuredAnalysisPackageSchema`
 *    as fail-fast (the M6-C package validator is NOT re-run — validation
 *    ownership stays in M6-C; the production path must
 *    `validateStructuredAnalysisPackage` first);
 *  - a schema-valid-but-cross-ref-invalid package (unresolvable evidenceId /
 *    actionRef / evidence sourceRef) fails closed with a named error instead
 *    of producing a graph with dangling edges.
 *
 * Node / edge ids derive through the SHARED `context-graph-ids` module, which
 * calls the M6-C `package-identity` deterministic serializer — no second
 * stringify exists here (guard 1).
 */
import {
  CANONICAL_REPLAY_PRODUCER,
  FACT_ENGINE_PRODUCER,
  StructuredAnalysisPackageSchema,
  type AnalysisReadyDecision,
  type ComponentVersions,
  type ContextGraph,
  type ContextGraphEdge,
  type ContextGraphNode,
  type DecisionAnalysis,
  type EvidenceRecord,
  type GraphAuthority,
  type GraphNodeKind,
  type GraphOrigin,
  type KnownGameFacts,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import {
  compareIds,
  deriveEdgeId,
  deriveNodeId,
  semanticKeyOfNode,
} from "./context-graph-ids.js";

/** Producer chain names for package-level projection nodes (spec origin/
 *  authority 投影规则: "package schema 生产者" / "factor pipeline 版本"). */
const PACKAGE_PROJECTION_PRODUCER = "structured-analysis-package" as const;
const FACTOR_PIPELINE_PRODUCER = "factor-pipeline" as const;
const USER_ASSERTION_PRODUCER = "user-assertion" as const;
const LEGACY_BRIDGE_PRODUCER = "legacy-regression-bridge" as const;

// ---------------------------------------------------------------------------
// Node factories
// ---------------------------------------------------------------------------

function makeNode(input: {
  nodeKind: GraphNodeKind;
  partition: "evidence" | "reasoning";
  origin: GraphOrigin;
  authority: GraphAuthority;
  producer: string;
  producerVersion: string;
  payload: unknown;
  provenance: readonly string[];
}): ContextGraphNode {
  return {
    nodeId: deriveNodeId(
      input.nodeKind,
      semanticKeyOfNode(input.nodeKind, input.payload),
    ),
    nodeKind: input.nodeKind,
    partition: input.partition,
    origin: input.origin,
    authority: input.authority,
    producer: input.producer,
    producerVersion: input.producerVersion,
    payload: input.payload,
    provenance: [...input.provenance],
  };
}

function decisionNodeOf(
  decision: DecisionAnalysis,
  versions: ComponentVersions,
): ContextGraphNode {
  return makeNode({
    nodeKind: "Decision",
    partition: "evidence",
    origin: "canonical_replay",
    authority: "structural",
    producer: CANONICAL_REPLAY_PRODUCER,
    producerVersion: versions.canonicalReplay,
    payload: {
      decisionId: decision.decisionId,
      surface: decision.surface,
      roundOrdinal: decision.roundOrdinal,
      normalizedDecisionContext: decision.normalizedDecisionContext,
    },
    provenance: [],
  });
}

function knownGameFactNodeOf(
  decision: DecisionAnalysis,
  versions: ComponentVersions,
): ContextGraphNode {
  const facts: KnownGameFacts = decision.knownGameFacts;
  let origin: GraphOrigin;
  let producer: string;
  let producerVersion: string;
  if (facts.provenance === "user_asserted") {
    origin = "user_assertion";
    producer = USER_ASSERTION_PRODUCER;
    producerVersion = "user-asserted";
  } else if (facts.provenance === "legacy_regression_bridge_only") {
    origin = "legacy_regression_bridge";
    producer = LEGACY_BRIDGE_PRODUCER;
    producerVersion = versions.mapperAdapter ?? "legacy-regression-bridge";
  } else {
    // raw_replay / mixed → canonical replay provenance.
    origin = "canonical_replay";
    producer = CANONICAL_REPLAY_PRODUCER;
    producerVersion = versions.canonicalReplay;
  }
  return makeNode({
    nodeKind: "KnownGameFact",
    partition: "evidence",
    origin,
    authority: "hard",
    producer,
    producerVersion,
    payload: {
      decisionId: decision.decisionId,
      ...facts,
    },
    provenance: facts.evidenceIds,
  });
}

function candidateNodeOf(
  decisionId: string,
  candidate: AnalysisReadyDecision["comparisonSet"]["candidates"][number],
  versions: ComponentVersions,
): ContextGraphNode {
  return makeNode({
    nodeKind: "CandidateAction",
    partition: "evidence",
    origin: "package_projection",
    authority: "structural",
    producer: PACKAGE_PROJECTION_PRODUCER,
    producerVersion: versions.packageSchema,
    payload: {
      decisionId,
      actionRef: candidate.actionRef,
      action: candidate.action,
      origins: candidate.origins,
    },
    provenance: [],
  });
}

function factorFactNodeOf(
  decisionId: string,
  actionRef: string,
  fact: AnalysisReadyDecision["candidateFactorLedgers"][number]["axes"][number]["facts"][number],
  versions: ComponentVersions,
): ContextGraphNode {
  const engineBased = fact.engineIdentity !== undefined;
  return makeNode({
    nodeKind: "FactorFact",
    partition: "evidence",
    origin: "factor_pipeline",
    authority:
      fact.evidenceClass === "versioned_upstream_estimate" ? "advisory" : "hard",
    producer: engineBased ? FACT_ENGINE_PRODUCER : CANONICAL_REPLAY_PRODUCER,
    producerVersion: engineBased
      ? fact.engineIdentity!.adapterVersion
      : versions.canonicalReplay,
    payload: {
      decisionId,
      actionRef,
      ...fact,
    },
    provenance: fact.evidenceIds,
  });
}

function factorDifferenceNodeOf(
  decisionId: string,
  difference: AnalysisReadyDecision["factorDifferences"][number],
  versions: ComponentVersions,
): ContextGraphNode {
  const engineBased = difference.engineIdentity !== undefined;
  return makeNode({
    nodeKind: "FactorDifference",
    partition: "evidence",
    origin: "factor_pipeline",
    authority:
      difference.kind === "heuristic_difference" ? "advisory" : "hard",
    producer: engineBased ? FACT_ENGINE_PRODUCER : CANONICAL_REPLAY_PRODUCER,
    producerVersion: engineBased
      ? difference.engineIdentity!.adapterVersion
      : versions.canonicalReplay,
    payload: {
      decisionId,
      ...difference,
    },
    provenance: difference.evidenceIds,
  });
}

function modelEvaluationNodeOf(
  decisionId: string,
  evaluation: AnalysisReadyDecision["modelEvaluation"],
  versions: ComponentVersions,
): ContextGraphNode {
  return makeNode({
    nodeKind: "ModelEvaluation",
    partition: "evidence",
    origin: "model_evaluation",
    authority: "model",
    producer: versions.mortalSourceModel.identity,
    producerVersion: versions.mortalSourceModel.version,
    payload: {
      decisionId,
      ...evaluation,
    },
    provenance: [],
  });
}

function deterministicPreferenceNodeOf(
  decisionId: string,
  preference: NonNullable<AnalysisReadyDecision["deterministicPreference"]>,
  versions: ComponentVersions,
): ContextGraphNode {
  return makeNode({
    nodeKind: "DeterministicPreference",
    partition: "evidence",
    origin: "factor_pipeline",
    authority: "structural",
    producer: FACTOR_PIPELINE_PRODUCER,
    producerVersion: versions.factorPipeline,
    payload: {
      decisionId,
      ...preference,
    },
    provenance: [],
  });
}

function evidenceNodeOf(evidenceId: string, record: EvidenceRecord): ContextGraphNode {
  const canonical = record.kind === "canonical_event";
  return makeNode({
    nodeKind: "Evidence",
    partition: "evidence",
    origin: canonical ? "canonical_replay" : "factor_pipeline",
    authority: canonical ? "hard" : "advisory",
    producer: record.producer,
    producerVersion: record.producerVersion,
    payload: { ...record },
    provenance: [],
  });
}

// ---------------------------------------------------------------------------
// Edge factories
// ---------------------------------------------------------------------------

function makeEdge(
  edgeKind: ContextGraphEdge["edgeKind"],
  from: string,
  to: string,
  payload: unknown,
): ContextGraphEdge {
  return {
    edgeId: deriveEdgeId({ from, to, edgeKind, payload }),
    edgeKind,
    from,
    to,
    origin: "package_projection",
    provenance: [],
    payload,
  };
}

function containsEdge(from: string, to: string): ContextGraphEdge {
  return makeEdge("contains", from, to, {});
}

function appliesToEdge(from: string, to: string): ContextGraphEdge {
  return makeEdge("applies_to", from, to, {});
}

function comparesEdge(from: string, to: string, side: "left" | "right"): ContextGraphEdge {
  return makeEdge("compares", from, to, { side });
}

function supportsEdge(
  from: string,
  to: string,
  direction: "supports_left" | "supports_right",
): ContextGraphEdge {
  return makeEdge("supports", from, to, { direction });
}

function recommendsEdge(from: string, to: string): ContextGraphEdge {
  return makeEdge("recommends", from, to, {});
}

function derivedFromEdge(from: string, to: string): ContextGraphEdge {
  return makeEdge("derived_from", from, to, {});
}

// ---------------------------------------------------------------------------
// projectContextGraph
// ---------------------------------------------------------------------------

/** The evidence-subgraph projection seam (spec seam 1). Pure and
 *  deterministic: the same schema-valid package always produces the same
 *  deep-equal graph. */
export function projectContextGraph(
  packageInput: StructuredAnalysisPackage,
): ContextGraph {
  // Fail-fast / fail closed on schema-invalid input (spec: projector 对
  // schema-invalid package fail closed，而不是产出部分 graph).
  let pkg: StructuredAnalysisPackage;
  try {
    pkg = StructuredAnalysisPackageSchema.parse(packageInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`m6d1_projector_schema:${message}`);
  }

  const versions = pkg.componentVersions;
  const nodes: ContextGraphNode[] = [];
  const edges: ContextGraphEdge[] = [];

  // Evidence nodes: EVERY registry record is projected, regardless of which
  // decision references it (spec: 从 package.evidenceRegistry 投影全部
  // Evidence 节点；registry key 必须与 evidenceId 一致 — the schema enforces
  // the key/record agreement).
  const evidenceNodeIds = new Map<string, string>();
  for (const [evidenceId, record] of Object.entries(pkg.evidenceRegistry)) {
    const node = evidenceNodeOf(evidenceId, record);
    evidenceNodeIds.set(evidenceId, node.nodeId);
    nodes.push(node);
  }

  /** Fail-closed resolver: a referenced evidence id that is not in the
   *  registry would produce a dangling derived_from edge — never allowed. */
  const resolveEvidence = (evidenceId: string): string => {
    const nodeId = evidenceNodeIds.get(evidenceId);
    if (nodeId === undefined) {
      throw new Error(`m6d1_projector_unresolved_evidence:${evidenceId}`);
    }
    return nodeId;
  };

  for (const decision of pkg.decisions) {
    const decisionNode = decisionNodeOf(decision, versions);
    nodes.push(decisionNode);
    const decisionNodeId = decisionNode.nodeId;

    // Every decision projects its Decision node and its KnownGameFact node
    // (spec 投影算法: 对每个 package decision 投影 Decision 节点与其
    // KnownGameFact 节点).
    const factsNode = knownGameFactNodeOf(decision, versions);
    nodes.push(factsNode);
    edges.push(containsEdge(decisionNodeId, factsNode.nodeId));
    for (const evidenceId of decision.knownGameFacts.evidenceIds) {
      edges.push(derivedFromEdge(factsNode.nodeId, resolveEvidence(evidenceId)));
    }

    // Only analysis_ready decisions project candidates / ledgers /
    // differences / model evaluation / preference (spec: 仅 analysis_ready
    // 决策投影候选、账本、差异、模型评价与偏好节点).
    if (decision.outcome !== "analysis_ready") continue;
    projectReadyDecision(decision, versions, decisionNodeId, nodes, edges, resolveEvidence);
  }

  // fact_engine_request Evidence nodes derive from their canonical source
  // refs (spec D1 投影边规则最后一条).
  for (const record of Object.values(pkg.evidenceRegistry)) {
    if (record.kind !== "fact_engine_request") continue;
    const from = resolveEvidence(record.evidenceId);
    for (const sourceRef of record.sourceRefs) {
      const to = evidenceNodeIds.get(sourceRef);
      if (to === undefined) {
        throw new Error(
          `m6d1_projector_unresolved_evidence_source_ref:${record.evidenceId}:${sourceRef}`,
        );
      }
      edges.push(derivedFromEdge(from, to));
    }
  }

  // Deterministic assembly: nodes / edges sorted by id (spec: node 与 edge 在
  // 图中分别按 nodeId / edgeId 确定性排序).
  nodes.sort((left, right) => compareIds(left.nodeId, right.nodeId));
  edges.sort((left, right) => compareIds(left.edgeId, right.edgeId));

  return {
    schemaVersion: "context-graph/v1",
    graphId: `context-graph:${pkg.packageId}`,
    packageId: pkg.packageId,
    nodes,
    edges,
  };
}

function projectReadyDecision(
  decision: Extract<DecisionAnalysis, { outcome: "analysis_ready" }>,
  versions: ComponentVersions,
  decisionNodeId: string,
  nodes: ContextGraphNode[],
  edges: ContextGraphEdge[],
  resolveEvidence: (evidenceId: string) => string,
): void {
  const comparison = decision.comparisonSet;

  // CandidateAction nodes: one per comparison candidate, per decision
  // (identity = decisionId + actionRef).
  const candidateNodes = new Map<string, ContextGraphNode>();
  const candidateNodeId = new Map<string, string>();
  for (const candidate of comparison.candidates) {
    const node = candidateNodeOf(decision.decisionId, candidate, versions);
    candidateNodes.set(candidate.actionRef, node);
    candidateNodeId.set(candidate.actionRef, node.nodeId);
    nodes.push(node);
    edges.push(containsEdge(decisionNodeId, node.nodeId));
  }
  const resolveCandidate = (actionRef: string): string => {
    const nodeId = candidateNodeId.get(actionRef);
    if (nodeId === undefined) {
      throw new Error(
        `m6d1_projector_unresolved_action_ref:${decision.decisionId}:${actionRef}`,
      );
    }
    return nodeId;
  };

  // FactorFact nodes: one per ledger axis fact; the fact applies_to its
  // ledger's CandidateAction; every evidenceId gets a derived_from edge.
  for (const ledger of decision.candidateFactorLedgers) {
    const candidateId = resolveCandidate(ledger.actionRef);
    for (const axis of ledger.axes) {
      for (const fact of axis.facts) {
        const node = factorFactNodeOf(
          decision.decisionId,
          ledger.actionRef,
          fact,
          versions,
        );
        nodes.push(node);
        edges.push(containsEdge(decisionNodeId, node.nodeId));
        edges.push(appliesToEdge(node.nodeId, candidateId));
        for (const evidenceId of fact.evidenceIds) {
          edges.push(derivedFromEdge(node.nodeId, resolveEvidence(evidenceId)));
        }
      }
    }
  }

  // FactorDifference nodes: compares both sides (payload side: left|right),
  // supports the direction-supported side when directional.
  for (const difference of decision.factorDifferences) {
    const node = factorDifferenceNodeOf(decision.decisionId, difference, versions);
    nodes.push(node);
    edges.push(containsEdge(decisionNodeId, node.nodeId));
    const leftId = resolveCandidate(difference.leftActionRef);
    const rightId = resolveCandidate(difference.rightActionRef);
    edges.push(comparesEdge(node.nodeId, leftId, "left"));
    edges.push(comparesEdge(node.nodeId, rightId, "right"));
    if (difference.direction === "supports_left") {
      edges.push(supportsEdge(node.nodeId, leftId, "supports_left"));
    } else if (difference.direction === "supports_right") {
      edges.push(supportsEdge(node.nodeId, rightId, "supports_right"));
    }
    for (const evidenceId of difference.evidenceIds) {
      edges.push(derivedFromEdge(node.nodeId, resolveEvidence(evidenceId)));
    }
  }

  // ModelEvaluation node: recommends every preferred CandidateAction.
  const evaluationNode = modelEvaluationNodeOf(
    decision.decisionId,
    decision.modelEvaluation,
    versions,
  );
  nodes.push(evaluationNode);
  edges.push(containsEdge(decisionNodeId, evaluationNode.nodeId));
  for (const preferred of decision.modelEvaluation.preferredActions) {
    edges.push(recommendsEdge(evaluationNode.nodeId, resolveCandidate(preferred)));
  }

  // DeterministicPreference node (only when non-null): recommends each of its
  // actionRefs' CandidateActions.
  if (decision.deterministicPreference !== null) {
    const preferenceNode = deterministicPreferenceNodeOf(
      decision.decisionId,
      decision.deterministicPreference,
      versions,
    );
    nodes.push(preferenceNode);
    edges.push(containsEdge(decisionNodeId, preferenceNode.nodeId));
    for (const actionRef of decision.deterministicPreference.actionRefs) {
      edges.push(recommendsEdge(preferenceNode.nodeId, resolveCandidate(actionRef)));
    }
  }
}
