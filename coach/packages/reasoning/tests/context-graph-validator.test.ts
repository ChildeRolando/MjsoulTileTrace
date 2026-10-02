/**
 * M6-D1 — graph validator + per-decision subgraph tests (spec "按模块测试 —
 * graph validator" + "decision subgraph").
 */
import { describe, expect, it } from "vitest";
import type { ContextGraph, ContextGraphNode } from "@riichi-coach/contracts";
import { deriveEdgeId } from "../src/context-graph/context-graph-ids.js";
import { getDecisionSubgraph } from "../src/context-graph/get-decision-subgraph.js";
import { projectContextGraph } from "../src/context-graph/project-context-graph.js";
import { validateContextGraph } from "../src/context-graph/validate-context-graph.js";
import {
  buildSingleDecisionPackage,
  buildTwoDecisionPackage,
} from "./fixtures/context-graph-package.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reasoningNode(overrides: Record<string, unknown> = {}): ContextGraphNode {
  return {
    nodeId: "ctxg:CoachJudgment:test",
    nodeKind: "CoachJudgment",
    partition: "reasoning",
    origin: "llm_reasoning",
    authority: "coach",
    producer: "llm-provider/v1",
    producerVersion: "1",
    payload: { decisionId: "d1" },
    provenance: [],
    ...overrides,
  } as ContextGraphNode;
}

describe("M6-D1 validateContextGraph", () => {
  it.each(["hidden-toJSON", "getter", "hidden-property", "symbol"])(
    "rejects %s before executing or dropping graph payload properties", async kind => {
      const graph = projectContextGraph(await buildSingleDecisionPackage());
      const payload = graph.nodes[0]!.payload as Record<string | symbol, unknown>;
      let calls = 0;
      if (kind === "hidden-toJSON") Object.defineProperty(payload, "toJSON", {
        value: () => { calls++; return {}; }, enumerable: false,
      });
      if (kind === "getter") Object.defineProperty(payload, "synthetic", {
        get: () => { calls++; return 1; }, enumerable: true,
      });
      if (kind === "hidden-property") Object.defineProperty(payload, "synthetic", {value:1,enumerable:false});
      if (kind === "symbol") payload[Symbol("synthetic")] = 1;
      expect(() => validateContextGraph(graph)).toThrow(/m6d1_graph_validator_roundtrip_mismatch/);
      expect(calls).toBe(0);
    },
  );

  it.each(["negative-zero", "undefined", "sparse-array", "array-property", "cycle"])(
    "rejects JSON-changing %s without whole-graph serialization", async kind => {
      const graph = projectContextGraph(await buildSingleDecisionPackage());
      const payload = graph.nodes[0]!.payload as Record<string, unknown>;
      if (kind === "negative-zero") payload.synthetic = -0;
      if (kind === "undefined") payload.synthetic = undefined;
      if (kind === "sparse-array") payload.synthetic = new Array(1);
      if (kind === "array-property") payload.synthetic = Object.assign([], {extra:1});
      if (kind === "cycle") payload.synthetic = payload;
      expect(() => validateContextGraph(graph)).toThrow(/m6d1_graph_validator_roundtrip_mismatch/);
    },
  );

  it("accepts a builder-produced graph and its JSON roundtrip", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    expect(() => validateContextGraph(graph)).not.toThrow();
    expect(() => validateContextGraph(clone(graph))).not.toThrow();
  });

  it("accepts frozen plain data and shared acyclic payloads without modifying them", async () => {
    const graph = projectContextGraph(await buildSingleDecisionPackage());
    const payload = graph.nodes[0]!.payload as Record<string, unknown>;
    const shared = Object.freeze({ text: "unchanged", values: Object.freeze([1, null, true]) });
    payload.first = shared;
    payload.second = shared;
    Object.freeze(payload);
    Object.freeze(graph.nodes);
    Object.freeze(graph.edges);
    Object.freeze(graph);
    const before = JSON.stringify(graph);
    expect(() => validateContextGraph(graph)).not.toThrow();
    expect(JSON.stringify(graph)).toBe(before);
    expect(payload.first).toBe(payload.second);
  });

  it.each(["header", "node", "edge", "nodes-array", "edges-array"])(
    "retains strict schema rejection for %s", async kind => {
      const graph = projectContextGraph(await buildSingleDecisionPackage());
      const raw = graph as unknown as Record<string, unknown>;
      if (kind === "header") raw.extra = 1;
      if (kind === "node") (graph.nodes[0] as unknown as Record<string, unknown>).extra = 1;
      if (kind === "edge") (graph.edges[0] as unknown as Record<string, unknown>).extra = 1;
      if (kind === "nodes-array") raw.nodes = {};
      if (kind === "edges-array") raw.edges = {};
      expect(() => validateContextGraph(graph)).toThrow(/m6d1_graph_validator_schema/);
    },
  );

  it("rejects a tampered nodeId that no longer matches the payload (guard 1)", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    const decisionNode = graph.nodes.find((node) => node.nodeKind === "Decision")!;
    decisionNode.nodeId = "ctxg:Decision:not-the-digest";
    expect(() => validateContextGraph(graph))
      .toThrow(/m6d1_graph_validator_node_id_mismatch/);
  });

  it("rejects a payload tamper that removes the semantic key field", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    const decisionNode = graph.nodes.find((node) => node.nodeKind === "Decision")!;
    delete (decisionNode.payload as Record<string, unknown>).decisionId;
    expect(() => validateContextGraph(graph))
      .toThrow(/m6d1_graph_validator_node_key_missing/);
  });

  it("rejects a tampered edgeId", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    graph.edges[0]!.edgeId = "ctxg:edge:tampered";
    expect(() => validateContextGraph(graph))
      .toThrow(/m6d1_graph_validator_edge_id_mismatch/);
  });

  it("rejects duplicate node ids", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    const first = graph.nodes[0]!;
    graph.nodes.push(clone(first));
    expect(() => validateContextGraph(graph))
      .toThrow(/m6d1_graph_validator_duplicate_node_id/);
  });

  it("rejects a dangling edge endpoint", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    const sample = graph.edges.find((candidate) => candidate.edgeKind === "contains")!;
    // A NEW edge with a CORRECTLY DERIVED edgeId but an unresolvable target:
    // the id recompute passes, the endpoint resolution must fail.
    graph.edges.push({
      edgeId: deriveEdgeId({
        from: sample.from,
        to: "ctxg:NoSuchNode:missing",
        edgeKind: "contains",
        payload: {},
      }),
      edgeKind: "contains",
      from: sample.from,
      to: "ctxg:NoSuchNode:missing",
      origin: "package_projection",
      provenance: [],
      payload: {},
    });
    expect(() => validateContextGraph(graph))
      .toThrow(/m6d1_graph_validator_dangling_edge/);
  });

  it("rejects an inserted `causes` edge with a named error", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    graph.edges.push({
      edgeId: "ctxg:edge:causes",
      edgeKind: "causes" as ContextGraph["edges"][number]["edgeKind"],
      from: graph.nodes[0]!.nodeId,
      to: graph.nodes[1]!.nodeId,
      origin: "package_projection",
      provenance: [],
      payload: {},
    });
    expect(() => validateContextGraph(graph))
      .toThrow(/m6d1_graph_validator_causes_edge/);
  });

  it("rejects an unknown edge kind at schema parse", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    graph.edges[0]!.edgeKind = "implies" as ContextGraph["edges"][number]["edgeKind"];
    expect(() => validateContextGraph(graph))
      .toThrow(/m6d1_graph_validator_schema/);
  });

  it("rejects evidence nodes with LLM origin or coach authority", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    const evidenceNode = graph.nodes.find((node) => node.nodeKind === "Evidence")!;
    evidenceNode.origin = "llm_reasoning";
    expect(() => validateContextGraph(graph))
      .toThrow(/m6d1_graph_validator_evidence_origin/);

    const fresh = clone(projectContextGraph(pkg));
    const evidence = fresh.nodes.find((node) => node.nodeKind === "Evidence")!;
    evidence.authority = "coach";
    expect(() => validateContextGraph(fresh))
      .toThrow(/m6d1_graph_validator_evidence_authority/);
  });

  it("rejects reasoning nodes with wrong partition rules", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    graph.nodes.push(reasoningNode());
    expect(() => validateContextGraph(graph)).not.toThrow();

    const wrongOrigin = clone(projectContextGraph(pkg));
    wrongOrigin.nodes.push(reasoningNode({ origin: "factor_pipeline" }));
    expect(() => validateContextGraph(wrongOrigin))
      .toThrow(/m6d1_graph_validator_reasoning_origin/);

    const wrongAuthority = clone(projectContextGraph(pkg));
    wrongAuthority.nodes.push(reasoningNode({ authority: "structural" }));
    expect(() => validateContextGraph(wrongAuthority))
      .toThrow(/m6d1_graph_validator_reasoning_authority/);

    const wrongKind = clone(projectContextGraph(pkg));
    wrongKind.nodes.push(reasoningNode({ nodeKind: "Evidence", nodeId: "ctxg:Evidence:test" }));
    expect(() => validateContextGraph(wrongKind))
      .toThrow(/m6d1_graph_validator_reasoning_kind/);
  });

  it("rejects a reasoning edge that dangles", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    const judgment = reasoningNode();
    graph.nodes.push(judgment);
    graph.edges.push({
      edgeId: deriveEdgeId({
        from: judgment.nodeId,
        to: "ctxg:NoSuchNode:missing",
        edgeKind: "opposes",
        payload: {},
      }),
      edgeKind: "opposes",
      from: judgment.nodeId,
      to: "ctxg:NoSuchNode:missing",
      origin: "llm_reasoning",
      provenance: [],
      payload: {},
    });
    expect(() => validateContextGraph(graph))
      .toThrow(/m6d1_graph_validator_dangling_edge/);
  });

  it("rejects a graphId that is not deterministically derived from the packageId", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    graph.graphId = "context-graph:package:sha256:other";
    expect(() => validateContextGraph(graph))
      .toThrow(/m6d1_graph_validator_graph_id_mismatch/);
  });

  it("rejects a graph that changes under JSON roundtrip", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = clone(projectContextGraph(pkg));
    // NaN serializes to null → roundtrip mismatch.
    (graph.nodes[0]!.payload as Record<string, unknown>).roundOrdinal = Number.NaN;
    expect(() => validateContextGraph(graph))
      .toThrow(/m6d1_graph_validator_roundtrip_mismatch/);
  });
});

describe("M6-D1 getDecisionSubgraph", () => {
  it("returns the deterministic reachable subgraph for a decision (from the Decision outward)", async () => {
    const pkg = await buildTwoDecisionPackage();
    const graph = projectContextGraph(pkg);
    const ready = pkg.decisions.find((decision) => decision.outcome === "analysis_ready")!;
    const failed = pkg.decisions.find((decision) => decision.outcome !== "analysis_ready")!;

    const readySubgraph = getDecisionSubgraph(graph, ready.decisionId);
    const failedSubgraph = getDecisionSubgraph(graph, failed.decisionId);

    // Deterministic: repeated calls are identical.
    expect(getDecisionSubgraph(graph, ready.decisionId)).toEqual(readySubgraph);

    // Ready subgraph contains its Decision, KGF, candidates, factors,
    // differences, model evaluation, (preference) and shared evidence.
    const readyIds = new Set(readySubgraph.nodes.map((node) => node.nodeId));
    expect(readySubgraph.nodes.some((node) =>
      node.nodeKind === "Decision" &&
      (node.payload as { decisionId?: unknown }).decisionId === ready.decisionId,
    )).toBe(true);
    expect(readySubgraph.nodes.some((node) => node.nodeKind === "CandidateAction")).toBe(true);
    expect(readySubgraph.nodes.some((node) => node.nodeKind === "FactorFact")).toBe(true);
    expect(readySubgraph.nodes.some((node) => node.nodeKind === "FactorDifference")).toBe(true);
    expect(readySubgraph.nodes.some((node) => node.nodeKind === "ModelEvaluation")).toBe(true);
    expect(readySubgraph.nodes.some((node) => node.nodeKind === "Evidence")).toBe(true);

    // Failed subgraph contains its Decision + KGF + shared Evidence only.
    const failedKinds = new Set(failedSubgraph.nodes.map((node) => node.nodeKind));
    expect(failedKinds).toEqual(new Set(["Decision", "KnownGameFact", "Evidence"]));

    // No cross-contamination: shared Evidence never pulls the other
    // decision's nodes in (spec: 两个决策共享 Evidence 时不会互相拉入对方的
    // Decision/Factor 节点).
    expect(readySubgraph.nodes.some((node) =>
      node.nodeKind === "Decision" &&
      (node.payload as { decisionId?: unknown }).decisionId === failed.decisionId,
    )).toBe(false);
    expect(failedSubgraph.nodes.some((node) =>
      node.nodeKind === "Decision" &&
      (node.payload as { decisionId?: unknown }).decisionId === ready.decisionId,
    )).toBe(false);
    expect(failedSubgraph.nodes.some((node) => node.nodeKind === "FactorFact")).toBe(false);

    // The shared Evidence node IS in both subgraphs (it is reachable from
    // each Decision), while the other decision's nodes are not.
    const sharedEvidenceIds = new Set(
      failed.knownGameFacts.evidenceIds.filter((id) =>
        ready.knownGameFacts.evidenceIds.includes(id),
      ),
    );
    expect(sharedEvidenceIds.size).toBeGreaterThan(0);
    for (const evidenceId of sharedEvidenceIds) {
      const evidenceNode = graph.nodes.find((node) =>
        node.nodeKind === "Evidence" &&
        (node.payload as { evidenceId?: unknown }).evidenceId === evidenceId,
      )!;
      expect(readyIds.has(evidenceNode.nodeId)).toBe(true);
      expect(new Set(failedSubgraph.nodes.map((node) => node.nodeId)).has(evidenceNode.nodeId))
        .toBe(true);
    }
  });

  it("fails closed on an unknown decisionId", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    expect(() => getDecisionSubgraph(graph, "decision:nonexistent"))
      .toThrow(/m6d1_subgraph_unknown_decision/);
  });
});
