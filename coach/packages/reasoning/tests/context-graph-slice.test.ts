/**
 * M6-D1 — slice builder + slice validator tests (spec "按模块测试 — slice
 * builder（guard 3）" + "slice validator").
 *
 * The fixture package is a model-AGREEMENT case (the actual action is the
 * top-scored preferred action), so the real selector returns an empty
 * selection for it; the ordering / dedup tests therefore pass explicit
 * schema-valid `ReviewSelectionResult` inputs with frozen policy v1 ranks
 * (the selector contract: 1-based monotonic ranks — the builder must follow
 * the RANK order, not the array order). Same-source proofs are exercised
 * against the variant package (same decisions, different packageId).
 */
import { describe, expect, it } from "vitest";
import {
  SELECTOR_POLICY_VERSION_V1,
  type ContextGraph,
  type ReviewSelectionResult,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { deriveSliceId } from "../src/context-graph/context-graph-ids.js";
import { buildGraphContextSlice } from "../src/context-graph/build-graph-context-slice.js";
import { projectContextGraph } from "../src/context-graph/project-context-graph.js";
import { validateGraphContextSlice } from "../src/context-graph/validate-graph-context-slice.js";
import {
  buildSingleDecisionPackage,
  buildTwoDecisionPackage,
  buildTwoReadyPackage,
  buildVariantPackage,
} from "./fixtures/context-graph-package.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptySelection(pkg: StructuredAnalysisPackage): ReviewSelectionResult {
  return {
    policyVersion: SELECTOR_POLICY_VERSION_V1,
    analysisPackageId: pkg.packageId,
    analysisPackageStatus: pkg.record.status,
    selected: [],
  };
}

function selectionFor(
  pkg: StructuredAnalysisPackage,
  decisionIds: readonly string[],
): ReviewSelectionResult {
  return {
    policyVersion: SELECTOR_POLICY_VERSION_V1,
    analysisPackageId: pkg.packageId,
    analysisPackageStatus: pkg.record.status,
    selected: decisionIds.map((decisionId, index) => ({
      decisionId,
      rank: index + 1,
      selectionReason: "model_disagreement_above_threshold",
    })),
  };
}

describe("M6-D1 buildGraphContextSlice", () => {
  it("empty selection returns a legal empty slice bound to the graph packageId", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const slice = buildGraphContextSlice(graph, emptySelection(pkg));
    expect(slice.packageId).toBe(graph.packageId);
    expect(slice.selectedDecisionIds).toEqual([]);
    expect(slice.nodes).toEqual([]);
    expect(slice.edges).toEqual([]);
    expect(slice.schemaVersion).toBe("graph-context-slice/v1");
    expect(() => validateGraphContextSlice(slice, graph, emptySelection(pkg)))
      .not.toThrow();
  });

  it("same-source proof is packageId ONLY: a mismatched packageId fails closed (guard 3)", async () => {
    const base = await buildSingleDecisionPackage();
    const variant = await buildVariantPackage();
    // Same record / same decisions / same decisionIds — only the producer
    // chain differs → different packageId.
    expect(variant.packageId).not.toBe(base.packageId);
    expect(variant.decisions.map((decision) => decision.decisionId)).toEqual(
      base.decisions.map((decision) => decision.decisionId),
    );

    const baseGraph = projectContextGraph(base);
    const selection = selectionFor(variant, variant.decisions.map((d) => d.decisionId));
    expect(() => buildGraphContextSlice(baseGraph, selection))
      .toThrow(/m6d1_slice_builder_package_mismatch/);
  });

  it("a selected decisionId that does not resolve to a Decision node fails closed", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const selection = selectionFor(pkg, ["decision:does:not:exist"]);
    expect(() => buildGraphContextSlice(graph, selection))
      .toThrow(/m6d1_slice_builder_unknown_decision/);
  });

  it("selectedDecisionIds follow the selection RANK order (not the array order)", async () => {
    const pkg = await buildTwoReadyPackage();
    const graph = projectContextGraph(pkg);
    const decisionIds = pkg.decisions.map((decision) => decision.decisionId);
    const [first, second] = decisionIds;

    // Scrambled array order, correct ranks: the builder must emit rank order.
    const selection: ReviewSelectionResult = {
      policyVersion: SELECTOR_POLICY_VERSION_V1,
      analysisPackageId: pkg.packageId,
      analysisPackageStatus: pkg.record.status,
      selected: [
        { decisionId: second!, rank: 2, selectionReason: "model_disagreement_above_threshold" },
        { decisionId: first!, rank: 1, selectionReason: "model_disagreement_above_threshold" },
      ],
    };
    const slice = buildGraphContextSlice(graph, selection);
    expect(slice.selectedDecisionIds).toEqual([first, second]);
    expect(slice.packageId).toBe(graph.packageId);
  });

  it("deduplicates shared nodes/edges across selected decisions and sorts deterministically", async () => {
    const pkg = await buildTwoReadyPackage();
    const graph = projectContextGraph(pkg);
    const decisionIds = pkg.decisions.map((decision) => decision.decisionId);
    const slice = buildGraphContextSlice(graph, selectionFor(pkg, decisionIds));

    // Both decisions share the whole evidence registry → every Evidence node
    // appears exactly once, deduplicated by id.
    const evidenceIds = slice.nodes
      .filter((node) => node.nodeKind === "Evidence")
      .map((node) => (node.payload as { evidenceId?: unknown }).evidenceId);
    expect(new Set(evidenceIds).size).toBe(evidenceIds.length);
    expect(evidenceIds).toHaveLength(Object.keys(pkg.evidenceRegistry).length);

    // Sorted by id, deterministic across reruns.
    const nodeIds = slice.nodes.map((node) => node.nodeId);
    const edgeIds = slice.edges.map((edge) => edge.edgeId);
    expect([...nodeIds].sort()).toEqual(nodeIds);
    expect([...edgeIds].sort()).toEqual(edgeIds);
    expect(buildGraphContextSlice(graph, selectionFor(pkg, decisionIds))).toEqual(slice);
  });

  it("filters node payloads through the explicit allow-list (no decisionId/evidenceIds/frozenAt leak)", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const ready = pkg.decisions[0];
    if (ready === undefined || ready.outcome !== "analysis_ready") {
      throw new Error("fixture must be ready");
    }
    const slice = buildGraphContextSlice(graph, selectionFor(pkg, [ready.decisionId]));

    for (const node of slice.nodes) {
      const keys = Object.keys(node.payload as Record<string, unknown>);
      if (node.nodeKind === "CandidateAction") {
        expect(keys).toEqual(["actionRef", "action", "origins"]);
      }
      if (node.nodeKind === "KnownGameFact") {
        expect(keys).not.toContain("evidenceIds");
        expect(keys).not.toContain("decisionId");
      }
      if (node.nodeKind === "FactorFact") {
        expect(keys).not.toContain("evidenceIds");
        expect(keys).not.toContain("engineIdentity");
        expect(keys).not.toContain("actionRef");
      }
      if (node.nodeKind === "ModelEvaluation") {
        const detailPolicy = (node.payload as { detailPolicy?: unknown }).detailPolicy;
        expect(detailPolicy).not.toHaveProperty("frozenAt");
      }
    }
  });

  it("guard 1: sliceId derives through the shared serializer over (packageId, policyVersion, selectedDecisionIds)", async () => {
    const pkg = await buildTwoReadyPackage();
    const graph = projectContextGraph(pkg);
    const decisionIds = pkg.decisions.map((decision) => decision.decisionId);
    const selection = selectionFor(pkg, decisionIds);
    const slice = buildGraphContextSlice(graph, selection);
    expect(slice.sliceId).toBe(deriveSliceId({
      packageId: graph.packageId,
      policyVersion: SELECTOR_POLICY_VERSION_V1,
      selectedDecisionIds: slice.selectedDecisionIds,
    }));
  });
});

describe("M6-D1 validateGraphContextSlice", () => {
  async function readySlice(): Promise<{
    pkg: StructuredAnalysisPackage;
    graph: ContextGraph;
    selection: ReviewSelectionResult;
  }> {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const ready = pkg.decisions[0];
    if (ready === undefined || ready.outcome !== "analysis_ready") {
      throw new Error("fixture must be ready");
    }
    const selection = selectionFor(pkg, [ready.decisionId]);
    return { pkg, graph, selection };
  }

  it("accepts a builder-produced slice and its JSON roundtrip", async () => {
    const { graph, selection } = await readySlice();
    const slice = buildGraphContextSlice(graph, selection);
    expect(() => validateGraphContextSlice(slice, graph, selection)).not.toThrow();
    expect(() => validateGraphContextSlice(clone(slice), graph, selection)).not.toThrow();
  });

  it("rejects a slice node payload outside the allow-list", async () => {
    const { graph, selection } = await readySlice();
    const slice = clone(buildGraphContextSlice(graph, selection));
    const node = slice.nodes.find((candidate) => candidate.nodeKind === "Decision")!;
    // "createdAt" is not a forbidden LLM-boundary key, so the named
    // allow-list rejection fires (not the forbidden-key pre-scan).
    (node.payload as Record<string, unknown>).createdAt = "2026-08-20T00:00:00.000Z";
    expect(() => validateGraphContextSlice(slice, graph, selection))
      .toThrow(/m6d1_slice_validator_allowlist/);
  });

  it("rejects an http(s) URL anywhere in the slice", async () => {
    const { graph, selection } = await readySlice();
    const slice = clone(buildGraphContextSlice(graph, selection));
    const node = slice.nodes.find((candidate) => candidate.nodeKind === "Evidence")!;
    (node.payload as { payload?: Record<string, unknown> }).payload = {
      downloadUrl: "https://game.maj-soul.com/paipu/123",
    };
    expect(() => validateGraphContextSlice(slice, graph, selection))
      .toThrow(/m6d1_slice_validator_privileged_payload/);
  });

  it("rejects an LLM-boundary artifact key smuggled into the slice", async () => {
    const { graph, selection } = await readySlice();
    const slice = clone(buildGraphContextSlice(graph, selection));
    const node = slice.nodes.find((candidate) => candidate.nodeKind === "Evidence")!;
    (node.payload as { payload?: Record<string, unknown> }).payload = {
      CoachJudgment: { text: "should not cross" },
    };
    expect(() => validateGraphContextSlice(slice, graph, selection))
      .toThrow(/m6d1_slice_validator_forbidden_key/);
  });

  it("rejects a slice node that no longer matches its source graph node", async () => {
    const { graph, selection } = await readySlice();
    const slice = clone(buildGraphContextSlice(graph, selection));
    const node = slice.nodes.find((candidate) => candidate.nodeKind === "Decision")!;
    // "surface" is allow-listed, so this tamper passes the allow-list but
    // breaks the graph match.
    (node.payload as Record<string, unknown>).surface = "response";
    expect(() => validateGraphContextSlice(slice, graph, selection))
      .toThrow(/m6d1_slice_validator_node_mismatch/);
  });

  it("rejects a slice edge that no longer matches its source graph edge", async () => {
    const { graph, selection } = await readySlice();
    const slice = clone(buildGraphContextSlice(graph, selection));
    // A contains edge carries an empty payload; swapping in a compares-style
    // payload breaks the graph-edge match without touching the allow-list.
    const edge = slice.edges.find((candidate) => candidate.edgeKind === "contains")!;
    edge.payload = { side: "left" };
    expect(() => validateGraphContextSlice(slice, graph, selection))
      .toThrow(/m6d1_slice_validator_edge_mismatch/);
  });

  it("rejects a slice whose packageId disagrees with the graph", async () => {
    const { graph, selection } = await readySlice();
    const slice = clone(buildGraphContextSlice(graph, selection));
    slice.packageId = "package:sha256:other";
    expect(() => validateGraphContextSlice(slice, graph, selection))
      .toThrow(/m6d1_slice_validator_package_mismatch/);
  });

  it("rejects a stale sliceId", async () => {
    const { graph, selection } = await readySlice();
    const slice = clone(buildGraphContextSlice(graph, selection));
    slice.sliceId = "ctxg:slice:stale";
    expect(() => validateGraphContextSlice(slice, graph, selection))
      .toThrow(/m6d1_slice_validator_slice_id_mismatch/);
  });

  it("rejects selectedDecisionIds that disagree with the selection's rank order", async () => {
    const pkg = await buildTwoReadyPackage();
    const graph = projectContextGraph(pkg);
    const decisionIds = pkg.decisions.map((decision) => decision.decisionId);
    const selection = selectionFor(pkg, decisionIds);
    const slice = clone(buildGraphContextSlice(graph, selection));
    slice.selectedDecisionIds = [decisionIds[1]!, decisionIds[0]!];
    slice.sliceId = deriveSliceId({
      packageId: graph.packageId,
      policyVersion: SELECTOR_POLICY_VERSION_V1,
      selectedDecisionIds: slice.selectedDecisionIds,
    });
    expect(() => validateGraphContextSlice(slice, graph, selection))
      .toThrow(/m6d1_slice_validator_selection_mismatch/);
  });

  it("rejects a selectedDecisionId that does not resolve to a Decision node", async () => {
    const pkg = await buildSingleDecisionPackage();
    const graph = projectContextGraph(pkg);
    const selection = selectionFor(pkg, ["decision:ghost"]);
    // Hand-crafted slice that passes schema, packageId, sliceId and the
    // selection-order checks but references an unresolvable decision.
    const slice = {
      schemaVersion: "graph-context-slice/v1" as const,
      sliceId: deriveSliceId({
        packageId: graph.packageId,
        policyVersion: SELECTOR_POLICY_VERSION_V1,
        selectedDecisionIds: ["decision:ghost"],
      }),
      packageId: graph.packageId,
      selectedDecisionIds: ["decision:ghost"],
      nodes: [],
      edges: [],
    };
    expect(() => validateGraphContextSlice(slice, graph, selection))
      .toThrow(/m6d1_slice_validator_decision_unresolved/);
  });

  it("rejects a slice whose edges dangle inside the slice", async () => {
    const pkg = await buildTwoDecisionPackage();
    const graph = projectContextGraph(pkg);
    const ready = pkg.decisions.find((decision) => decision.outcome === "analysis_ready")!;
    const selection = selectionFor(pkg, [ready.decisionId]);
    const slice = clone(buildGraphContextSlice(graph, selection));
    // Removing a node while keeping its edges leaves the edges' endpoints
    // unresolvable INSIDE the slice (the edges themselves still match the
    // source graph edges).
    const target = slice.nodes.find((candidate) => candidate.nodeKind === "KnownGameFact")!;
    slice.nodes = slice.nodes.filter((node) => node.nodeId !== target.nodeId);
    expect(() => validateGraphContextSlice(slice, graph, selection))
      .toThrow(/m6d1_slice_validator_dangling_edge/);
  });
});
