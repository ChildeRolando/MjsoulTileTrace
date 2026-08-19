/**
 * M6-D1 — reasoning overlay partition validator tests (spec "按模块测试 —
 * reasoning partition validator（guard 2）").
 *
 * D1 only FREEZES the reasoning overlay's schema/partition validation: there
 * is no `appendReasoningOverlay` implementation and the projector emits no
 * reasoning nodes/edges (guard 2). These tests validate the partition rules
 * against a proposed reasoning partition; they never test an append action —
 * none exists in D1.
 */
import * as reasoning from "../src/index.js";
import { describe, expect, it } from "vitest";
import type { ContextGraph, ContextGraphNode } from "@riichi-coach/contracts";
import { projectContextGraph } from "../src/context-graph/project-context-graph.js";
import { validateReasoningOverlayPartition } from "../src/context-graph/validate-reasoning-overlay-partition.js";
import { buildSingleDecisionPackage } from "./fixtures/context-graph-package.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reasoningNode(overrides: Record<string, unknown> = {}): ContextGraphNode {
  return {
    nodeId: "ctxg:CoachInference:test",
    nodeKind: "CoachInference",
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

describe("M6-D1 validateReasoningOverlayPartition", () => {
  it("guard 2: D1 exports no appendReasoningOverlay implementation", () => {
    expect("appendReasoningOverlay" in reasoning).toBe(false);
    expect("appendReasoningOverlay" in projectContextGraph).toBe(false);
  });

  it("accepts a legal reasoning partition (nodes + edges resolving to graph/batch nodes)", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const decisionNode = graph.nodes.find((node) => node.nodeKind === "Decision")!;
    const evidenceNode = graph.nodes.find((node) => node.nodeKind === "Evidence")!;
    const judgment = reasoningNode({
      nodeId: "ctxg:CoachJudgment:ok",
      nodeKind: "CoachJudgment",
      payload: { decisionId: (decisionNode.payload as { decisionId?: unknown }).decisionId },
    });
    const edges = [
      {
        edgeId: "ctxg:edge:ok-1",
        edgeKind: "qualifies" as const,
        from: judgment.nodeId,
        to: evidenceNode.nodeId,
        origin: "llm_reasoning",
        provenance: [],
        payload: {},
      },
      {
        edgeId: "ctxg:edge:ok-2",
        edgeKind: "verbalizes" as const,
        from: judgment.nodeId,
        to: "ctxg:CoachJudgment:ok",
        origin: "llm_reasoning",
        provenance: [],
        payload: {},
      },
    ];
    expect(() => validateReasoningOverlayPartition(graph, [judgment], edges)).not.toThrow();
  });

  it("rejects a reasoning node whose origin is not llm_reasoning", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    expect(() => validateReasoningOverlayPartition(
      graph,
      [reasoningNode({ origin: "factor_pipeline" })],
      [],
    )).toThrow(/m6d1_reasoning_partition_origin/);
  });

  it("rejects a reasoning node whose authority is not coach", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    expect(() => validateReasoningOverlayPartition(
      graph,
      [reasoningNode({ authority: "hard" })],
      [],
    )).toThrow(/m6d1_reasoning_partition_authority/);
  });

  it("rejects a reasoning node whose partition is not reasoning", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    expect(() => validateReasoningOverlayPartition(
      graph,
      [reasoningNode({ partition: "evidence" })],
      [],
    )).toThrow(/m6d1_reasoning_partition_partition/);
  });

  it("rejects a reasoning node whose kind is not one of the three reasoning kinds", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    expect(() => validateReasoningOverlayPartition(
      graph,
      [reasoningNode({ nodeKind: "Evidence", nodeId: "ctxg:Evidence:bad" })],
      [],
    )).toThrow(/m6d1_reasoning_partition_kind/);
  });

  it("rejects a reasoning edge that dangles (neither graph nor same-batch node)", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const judgment = reasoningNode();
    const edge = {
      edgeId: "ctxg:edge:dangling",
      edgeKind: "opposes" as const,
      from: judgment.nodeId,
      to: "ctxg:NoSuchNode:missing",
      origin: "llm_reasoning",
      provenance: [],
      payload: {},
    };
    expect(() => validateReasoningOverlayPartition(graph, [judgment], [edge]))
      .toThrow(/m6d1_reasoning_partition_edge_dangling/);
  });

  it("rejects a reasoning edge that starts from an evidence node", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const evidenceNode = graph.nodes.find((node) => node.nodeKind === "Evidence")!;
    const edge = {
      edgeId: "ctxg:edge:from-evidence",
      edgeKind: "verbalizes" as const,
      from: evidenceNode.nodeId,
      to: "ctxg:CoachInference:test",
      origin: "llm_reasoning",
      provenance: [],
      payload: {},
    };
    expect(() => validateReasoningOverlayPartition(graph, [reasoningNode()], [edge]))
      .toThrow(/m6d1_reasoning_partition_edge_from_evidence/);
  });

  it("rejects a reasoning edge whose kind is not reserved for the overlay", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const judgment = reasoningNode();
    const edge = {
      edgeId: "ctxg:edge:bad-kind",
      edgeKind: "derived_from" as const,
      from: judgment.nodeId,
      to: "ctxg:CoachInference:test",
      origin: "llm_reasoning",
      provenance: [],
      payload: {},
    };
    expect(() => validateReasoningOverlayPartition(graph, [judgment], [edge]))
      .toThrow(/m6d1_reasoning_partition_edge_kind/);
  });

  it("rejects malformed reasoning nodes/edges at schema parse", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    expect(() => validateReasoningOverlayPartition(
      graph,
      [clone(reasoningNode({ origin: "bogus_origin" }))],
      [],
    )).toThrow(/m6d1_reasoning_partition_schema/);
  });
});
