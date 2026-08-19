/**
 * M6-D1 — projector tests (spec "按模块测试 — projector" + "id derivation
 * (guard 1)").
 *
 * Per spec Prior art, these tests consume the M6-C-test-proven package
 * construction path (`runFixtureReview` + `buildStructuredAnalysisPackage`,
 * same as the M6-C Slice 2/3 tests) instead of re-running the M6-C whole-game
 * golden build chain — the two-decision package mirrors the golden's shape
 * (analysis_ready + failed decisions sharing evidence).
 *
 * The projector seam is the ONLY evidence-subgraph build entry: every positive
 * graph here comes from `projectContextGraph`.
 */
import { describe, expect, it } from "vitest";
import {
  ContextGraphSchema,
  type ContextGraph,
  type ContextGraphEdge,
  type ContextGraphNode,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { canonicalJson, sha256Hex } from "../src/analysis/package-identity.js";
import { deriveEdgeId, deriveNodeId, semanticKeyOfNode } from "../src/context-graph/context-graph-ids.js";
import { projectContextGraph } from "../src/context-graph/project-context-graph.js";
import { validateContextGraph } from "../src/context-graph/validate-context-graph.js";
import {
  buildFailedDecisionPackage,
  buildSingleDecisionPackage,
  buildTwoDecisionPackage,
} from "./fixtures/context-graph-package.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nodeOfKind(graph: ContextGraph, kind: ContextGraphNode["nodeKind"]): ContextGraphNode[] {
  return graph.nodes.filter((node) => node.nodeKind === kind);
}

/** The fixture's single analysis_ready decision (narrowed). */
function readyDecisionOf(pkg: StructuredAnalysisPackage) {
  const decision = pkg.decisions[0];
  if (decision === undefined || decision.outcome !== "analysis_ready") {
    throw new Error("fixture decision must be analysis_ready");
  }
  return decision;
}

function outgoing(graph: ContextGraph, nodeId: string): ContextGraphEdge[] {
  return graph.edges.filter((edge) => edge.from === nodeId);
}

/** The Evidence node whose payload carries the given evidenceId. */
function evidenceNodeOf(graph: ContextGraph, evidenceId: string): ContextGraphNode {
  const node = graph.nodes.find((candidate) =>
    candidate.nodeKind === "Evidence" &&
    (candidate.payload as { evidenceId?: unknown }).evidenceId === evidenceId,
  );
  if (node === undefined) throw new Error(`missing evidence node ${evidenceId}`);
  return node;
}

/** The CandidateAction node for (decisionId, actionRef). */
function candidateNodeOf(
  graph: ContextGraph,
  decisionId: string,
  actionRef: string,
): ContextGraphNode {
  const node = graph.nodes.find((candidate) =>
    candidate.nodeKind === "CandidateAction" &&
    (candidate.payload as { decisionId?: unknown }).decisionId === decisionId &&
    (candidate.payload as { actionRef?: unknown }).actionRef === actionRef,
  );
  if (node === undefined) throw new Error(`missing candidate node ${actionRef}`);
  return node;
}

describe("M6-D1 projectContextGraph", () => {
  it("projects the whole-game-style package to a schema-valid, deterministic ContextGraph with the evidence node kinds the package carries", async () => {
    const pkg = await buildTwoDecisionPackage();
    const graph = projectContextGraph(pkg);
    const ready = pkg.decisions.find((decision) => decision.outcome === "analysis_ready")!;

    // Schema-valid and bound to the source package identity.
    expect(() => ContextGraphSchema.parse(graph)).not.toThrow();
    expect(graph.schemaVersion).toBe("context-graph/v1");
    expect(graph.packageId).toBe(pkg.packageId);
    expect(graph.graphId).toBe(`context-graph:${pkg.packageId}`);

    // The evidence node kinds mirror the package content: the analysis_ready
    // decision carries candidates / ledgers / differences / model evaluation,
    // plus DeterministicPreference exactly when the package has one; NO
    // reasoning node exists (D1 guard: the projection emits no reasoning).
    const kinds = new Set(graph.nodes.map((node) => node.nodeKind));
    const expectedKinds: ContextGraphNode["nodeKind"][] = [
      "Decision", "CandidateAction", "KnownGameFact", "FactorFact",
      "FactorDifference", "ModelEvaluation", "Evidence",
    ];
    if (ready.deterministicPreference !== null) {
      expectedKinds.push("DeterministicPreference");
    }
    for (const kind of expectedKinds) {
      expect(kinds.has(kind)).toBe(true);
    }
    expect(kinds.has("DeterministicPreference"))
      .toBe(ready.deterministicPreference !== null);
    for (const node of graph.nodes) {
      expect(node.partition).toBe("evidence");
    }

    // Deterministically sorted by id.
    const nodeIds = graph.nodes.map((node) => node.nodeId);
    const edgeIds = graph.edges.map((edge) => edge.edgeId);
    expect([...nodeIds].sort()).toEqual(nodeIds);
    expect([...edgeIds].sort()).toEqual(edgeIds);
  });

  it("is deterministic: the same package projects to a deep-equal graph across reruns and JSON roundtrips", async () => {
    const pkg = await buildSingleDecisionPackage();
    const first = projectContextGraph(pkg);
    const roundtripped = clone(pkg);
    const second = projectContextGraph(roundtripped);
    expect(second).toEqual(first);
  });

  it("fails closed on a schema-invalid package instead of producing a partial graph", async () => {
    const pkg = await buildSingleDecisionPackage();
    const tampered = clone(pkg);
    // Deleting a decision keeps the object schema-invalid (decisions min(1)).
    tampered.decisions = [];
    expect(() => projectContextGraph(tampered)).toThrow(/m6d1_projector_schema/);
  });

  it("failed / skipped decisions project only Decision + KnownGameFact + Evidence (no analysis payload)", async () => {
    const pkg = await buildTwoDecisionPackage();
    const failed = pkg.decisions.find((decision) => decision.outcome !== "analysis_ready")!;
    const graph = projectContextGraph(pkg);

    // The failed decision has exactly a Decision node and a KnownGameFact node.
    const failedDecisionNodes = graph.nodes.filter((node) =>
      (node.payload as { decisionId?: unknown }).decisionId === failed.decisionId,
    );
    const failedKinds = failedDecisionNodes.map((node) => node.nodeKind).sort();
    expect(failedKinds).toEqual(["Decision", "KnownGameFact"]);

    // Its Decision node contains exactly its KnownGameFact node.
    const decisionNode = failedDecisionNodes.find((node) => node.nodeKind === "Decision")!;
    const containsTargets = outgoing(graph, decisionNode.nodeId)
      .filter((edge) => edge.edgeKind === "contains")
      .map((edge) => edge.to);
    expect(containsTargets).toEqual([failedDecisionNodes
      .find((node) => node.nodeKind === "KnownGameFact")!.nodeId]);

    // No analysis node may carry the failed decision's id.
    const analysisKinds = new Set([
      "CandidateAction", "FactorFact", "FactorDifference",
      "ModelEvaluation", "DeterministicPreference",
    ]);
    expect(failedDecisionNodes.some((node) => analysisKinds.has(node.nodeKind)))
      .toBe(false);
  });

  it("projects every Evidence node from the registry with the registry's own producer provenance", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const evidenceNodes = nodeOfKind(graph, "Evidence");
    expect(evidenceNodes).toHaveLength(Object.keys(pkg.evidenceRegistry).length);
    for (const [evidenceId, record] of Object.entries(pkg.evidenceRegistry)) {
      const node = evidenceNodeOf(graph, evidenceId);
      expect(node.producer).toBe(record.producer);
      expect(node.producerVersion).toBe(record.producerVersion);
      expect(node.provenance).toEqual([]);
      expect((node.payload as { kind?: unknown }).kind).toBe(record.kind);
    }
  });

  it("Decision contains edges mirror the package exactly (KGF always; analysis nodes only for analysis_ready)", async () => {
    const pkg = await buildTwoDecisionPackage();
    const graph = projectContextGraph(pkg);
    for (const decision of pkg.decisions) {
      const decisionNode = graph.nodes.find((node) =>
        node.nodeKind === "Decision" &&
        (node.payload as { decisionId?: unknown }).decisionId === decision.decisionId,
      )!;
      const contains = outgoing(graph, decisionNode.nodeId)
        .filter((edge) => edge.edgeKind === "contains")
        .map((edge) => edge.to)
        .sort();

      const expected: string[] = [
        // KnownGameFact node of this decision.
        ...graph.nodes
          .filter((node) =>
            node.nodeKind === "KnownGameFact" &&
            (node.payload as { decisionId?: unknown }).decisionId === decision.decisionId,
          )
          .map((node) => node.nodeId),
      ];
      if (decision.outcome === "analysis_ready") {
        expected.push(
          ...decision.comparisonSet.candidates.map(
            (candidate) => candidateNodeOf(graph, decision.decisionId, candidate.actionRef).nodeId,
          ),
          ...decision.candidateFactorLedgers.flatMap((ledger) =>
            ledger.axes.flatMap((axis) => axis.facts.map((fact) => {
              const node = graph.nodes.find((candidate) =>
                candidate.nodeKind === "FactorFact" &&
                (candidate.payload as { decisionId?: unknown }).decisionId === decision.decisionId &&
                (candidate.payload as { factorKey?: unknown }).factorKey === fact.factorKey &&
                (candidate.payload as { actionRef?: unknown }).actionRef === ledger.actionRef,
              )!;
              return node.nodeId;
            })),
          ),
          ...decision.factorDifferences.map((difference) => {
            const node = graph.nodes.find((candidate) =>
              candidate.nodeKind === "FactorDifference" &&
              (candidate.payload as { decisionId?: unknown }).decisionId === decision.decisionId &&
              (candidate.payload as { differenceId?: unknown }).differenceId === difference.differenceId,
            )!;
            return node.nodeId;
          }),
          ...(graph.nodes
            .filter((node) =>
              node.nodeKind === "ModelEvaluation" &&
              (node.payload as { decisionId?: unknown }).decisionId === decision.decisionId,
            )
            .map((node) => node.nodeId)),
        );
        if (decision.deterministicPreference !== null) {
          expected.push(...graph.nodes
            .filter((node) =>
              node.nodeKind === "DeterministicPreference" &&
              (node.payload as { decisionId?: unknown }).decisionId === decision.decisionId,
            )
            .map((node) => node.nodeId));
        }
      }
      expect(contains).toEqual([...expected].sort());
    }
  });

  it("FactorFact applies_to its ledger's CandidateAction and FactorDifference compares/supports the correct directions", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const decision = readyDecisionOf(pkg);

    for (const ledger of decision.candidateFactorLedgers) {
      const candidateId = candidateNodeOf(graph, decision.decisionId, ledger.actionRef).nodeId;
      for (const axis of ledger.axes) {
        for (const fact of axis.facts) {
          const factNode = graph.nodes.find((node) =>
            node.nodeKind === "FactorFact" &&
            (node.payload as { decisionId?: unknown }).decisionId === decision.decisionId &&
            (node.payload as { actionRef?: unknown }).actionRef === ledger.actionRef &&
            (node.payload as { factorKey?: unknown }).factorKey === fact.factorKey,
          )!;
          const appliesTo = outgoing(graph, factNode.nodeId)
            .filter((edge) => edge.edgeKind === "applies_to");
          expect(appliesTo).toHaveLength(1);
          expect(appliesTo[0]!.to).toBe(candidateId);
        }
      }
    }

    for (const difference of decision.factorDifferences) {
      const differenceNode = graph.nodes.find((node) =>
        node.nodeKind === "FactorDifference" &&
        (node.payload as { decisionId?: unknown }).decisionId === decision.decisionId &&
        (node.payload as { differenceId?: unknown }).differenceId === difference.differenceId,
      )!;
      const leftId = candidateNodeOf(graph, decision.decisionId, difference.leftActionRef).nodeId;
      const rightId = candidateNodeOf(graph, decision.decisionId, difference.rightActionRef).nodeId;
      const compares = outgoing(graph, differenceNode.nodeId)
        .filter((edge) => edge.edgeKind === "compares");
      expect(compares).toHaveLength(2);
      expect(compares.find((edge) => (edge.payload as { side?: unknown }).side === "left")!.to)
        .toBe(leftId);
      expect(compares.find((edge) => (edge.payload as { side?: unknown }).side === "right")!.to)
        .toBe(rightId);

      const supports = outgoing(graph, differenceNode.nodeId)
        .filter((edge) => edge.edgeKind === "supports");
      if (difference.direction === "supports_left") {
        expect(supports).toHaveLength(1);
        expect(supports[0]!.to).toBe(leftId);
      } else if (difference.direction === "supports_right") {
        expect(supports).toHaveLength(1);
        expect(supports[0]!.to).toBe(rightId);
      } else {
        expect(supports).toHaveLength(0);
      }
    }
  });

  it("ModelEvaluation and DeterministicPreference recommend their preferred CandidateActions", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const decision = readyDecisionOf(pkg);

    const evaluationNode = graph.nodes.find((node) =>
      node.nodeKind === "ModelEvaluation" &&
      (node.payload as { decisionId?: unknown }).decisionId === decision.decisionId,
    )!;
    const recommended = outgoing(graph, evaluationNode.nodeId)
      .filter((edge) => edge.edgeKind === "recommends")
      .map((edge) => edge.to)
      .sort();
    const expected = decision.modelEvaluation.preferredActions
      .map((actionRef) => candidateNodeOf(graph, decision.decisionId, actionRef).nodeId)
      .sort();
    expect(recommended).toEqual(expected);

    if (decision.deterministicPreference !== null) {
      const preferenceNode = graph.nodes.find((node) =>
        node.nodeKind === "DeterministicPreference" &&
        (node.payload as { decisionId?: unknown }).decisionId === decision.decisionId,
      )!;
      const preferenceRecommended = outgoing(graph, preferenceNode.nodeId)
        .filter((edge) => edge.edgeKind === "recommends")
        .map((edge) => edge.to)
        .sort();
      const expectedPreference = decision.deterministicPreference.actionRefs
        .map((actionRef) => candidateNodeOf(graph, decision.decisionId, actionRef).nodeId)
        .sort();
      expect(preferenceRecommended).toEqual(expectedPreference);
    }
  });

  it("derived_from covers every evidenceId of every evidence-bearing node, and fact-engine Evidence derives from its canonical sourceRefs", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);

    const evidenceBearingNodes = graph.nodes.filter((node) =>
      node.nodeKind === "KnownGameFact" ||
      node.nodeKind === "FactorFact" ||
      node.nodeKind === "FactorDifference",
    );
    expect(evidenceBearingNodes.length).toBeGreaterThan(0);
    for (const node of evidenceBearingNodes) {
      const derived = outgoing(graph, node.nodeId)
        .filter((edge) => edge.edgeKind === "derived_from")
        .map((edge) => edge.to)
        .sort();
      const expected = (node.provenance as string[])
        .map((evidenceId) => evidenceNodeOf(graph, evidenceId).nodeId)
        .sort();
      expect(derived).toEqual(expected);
    }

    // fact_engine_request evidence → canonical sourceRefs.
    for (const [evidenceId, record] of Object.entries(pkg.evidenceRegistry)) {
      if (record.kind !== "fact_engine_request") continue;
      const node = evidenceNodeOf(graph, evidenceId);
      const derived = outgoing(graph, node.nodeId)
        .filter((edge) => edge.edgeKind === "derived_from")
        .map((edge) => edge.to)
        .sort();
      const expected = record.sourceRefs
        .map((sourceRef) => evidenceNodeOf(graph, sourceRef).nodeId)
        .sort();
      expect(derived).toEqual(expected);
    }
  });

  it("deduplicates duplicate fact-engine sourceRefs (schema-valid but M6-C-invalid package never makes the projector reject its own output)", async () => {
    const pkg = await buildSingleDecisionPackage();
    // EvidenceRecordSchema does not enforce sourceRef uniqueness (the M6-C
    // validator does), so this tampered package is still schema-valid.
    const tampered = clone(pkg);
    const requestKey = Object.keys(tampered.evidenceRegistry)
      .find((key) => tampered.evidenceRegistry[key]!.kind === "fact_engine_request")!;
    const record = tampered.evidenceRegistry[requestKey]!;
    if (record.sourceRefs.length === 0) {
      throw new Error("fixture must carry a fact_engine_request with sourceRefs");
    }
    record.sourceRefs = [record.sourceRefs[0]!, ...record.sourceRefs];

    const graph = projectContextGraph(tampered);
    const node = evidenceNodeOf(graph, requestKey);
    const derived = outgoing(graph, node.nodeId)
      .filter((edge) => edge.edgeKind === "derived_from");
    // One edge per UNIQUE source ref, and the graph stays validator-clean.
    expect(derived).toHaveLength(new Set(record.sourceRefs).size);
    expect(() => validateContextGraph(graph)).not.toThrow();
  });

  it("guard 1: node ids derive through the shared deterministic serializer (no second stringify)", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);

    // Every evidence node id equals the shared-helper derivation from its own
    // payload — the same path the graph validator recomputes.
    for (const node of graph.nodes) {
      const expected = deriveNodeId(node.nodeKind, semanticKeyOfNode(node.nodeKind, node.payload));
      expect(node.nodeId).toBe(expected);
    }
    for (const edge of graph.edges) {
      const expected = deriveEdgeId({
        from: edge.from,
        to: edge.to,
        edgeKind: edge.edgeKind,
        payload: edge.payload,
      });
      expect(edge.edgeId).toBe(expected);
    }

    // Fixed golden: the shared canonical serializer + SHA-256 produces this
    // exact digest for a fixed input, and the id format is ctxg:<kind>:<hex>.
    expect(canonicalJson({ nodeKind: "Decision", key: "d1" }))
      .toBe('{"key":"d1","nodeKind":"Decision"}');
    expect(sha256Hex('{"key":"d1","nodeKind":"Decision"}'))
      .toBe("88e1de2602309460550e58b93a95812082cf809598d9fe43dfad3e2d9244906c");
    expect(deriveNodeId("Decision", "d1"))
      .toBe("ctxg:Decision:88e1de2602309460550e58b93a95812082cf809598d9fe43dfad3e2d9244906c");
  });

  it("projects a failed-only package to Decision + KnownGameFact + Evidence only", async () => {
    const pkg = await buildFailedDecisionPackage();
    const graph = projectContextGraph(pkg);
    expect(nodeOfKind(graph, "CandidateAction")).toHaveLength(0);
    expect(nodeOfKind(graph, "FactorFact")).toHaveLength(0);
    expect(nodeOfKind(graph, "FactorDifference")).toHaveLength(0);
    expect(nodeOfKind(graph, "ModelEvaluation")).toHaveLength(0);
    expect(nodeOfKind(graph, "DeterministicPreference")).toHaveLength(0);
    expect(nodeOfKind(graph, "Decision")).toHaveLength(1);
    expect(nodeOfKind(graph, "KnownGameFact")).toHaveLength(1);
    expect(nodeOfKind(graph, "Evidence").length).toBeGreaterThan(0);
  });

  it("projects every source package field deterministically: the graph is a pure projection (no analysis added)", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    // Spot-check origin/authority mapping (spec table) on the fixture:
    // decision → canonical_replay/structural; model evaluation →
    // model_evaluation/model with the Mortal provider identity.
    const decisionNode = nodeOfKind(graph, "Decision")[0]!;
    expect(decisionNode.origin).toBe("canonical_replay");
    expect(decisionNode.authority).toBe("structural");
    expect(decisionNode.producer).toBe("canonical-replay");
    expect(decisionNode.producerVersion).toBe(pkg.componentVersions.canonicalReplay);

    const evaluationNode = nodeOfKind(graph, "ModelEvaluation")[0]!;
    expect(evaluationNode.origin).toBe("model_evaluation");
    expect(evaluationNode.authority).toBe("model");
    expect(evaluationNode.producer).toBe(pkg.componentVersions.mortalSourceModel.identity);
    expect(evaluationNode.producerVersion).toBe(pkg.componentVersions.mortalSourceModel.version);

    // Every FactorFact with engine identity is a fact-engine producer; every
    // FactorFact without one is the canonical replay producer.
    for (const node of nodeOfKind(graph, "FactorFact")) {
      const fact = node.payload as { engineIdentity?: unknown };
      if (fact.engineIdentity !== undefined) {
        expect(node.producer).toBe("fact-engine");
      } else {
        expect(node.producer).toBe("canonical-replay");
      }
    }
  });
});
