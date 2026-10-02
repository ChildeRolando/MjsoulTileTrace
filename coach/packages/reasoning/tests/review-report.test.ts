/**
 * M6-D2 — ReviewReport assembly tests (spec "Solution" items 1–2: the
 * deterministic half of `generateReviewReport` + `appendReasoningOverlay`).
 *
 * The golden test locks the WHOLE frozen shape: row statuses, the generation
 * block, engine-derived overlay identities (local ids never survive as node
 * ids), verbalizes edges, the hash-only audit, and the reportId formula
 * recomputed independently through the shared M6-C serializer. The degrade
 * tests lock grill E4/E9: every LLM failure leaves the analysis package (and
 * its projected graph) untouched, statuses live on the ReviewReport alone, and
 * a rejected decision cascades its whole overlay content away while other
 * decisions stay ready.
 */
import { describe, expect, it } from "vitest";
import {
  COACH_REASONING_DRAFT_SCHEMA_VERSION,
  COACH_REVIEW_PROMPT_VERSION,
  REVIEW_REPORT_SCHEMA_VERSION,
  ReviewReportSchema,
  SELECTOR_POLICY_VERSION_V1,
  type ContextGraph,
  type ContextGraphNode,
  type LlmCoachResult,
  type LlmProviderDescriptor,
  type ReviewReport,
  type ReviewSelectionResult,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { canonicalJson, sha256Hex } from "../src/analysis/package-identity.js";
import { buildGraphContextSlice } from "../src/context-graph/build-graph-context-slice.js";
import { projectContextGraph } from "../src/context-graph/project-context-graph.js";
import { validateContextGraph } from "../src/context-graph/validate-context-graph.js";
import { validateReviewReport } from "../src/groundingValidator.js";
import {
  assembleReviewReport,
  appendReasoningOverlay,
  coachRequestOutcomeFromLlmResult,
  COACH_ENGINE_VERSION,
  COACH_GROUNDING_VALIDATOR_VERSION,
  UNCONFIGURED_COACH_PROVIDER,
  type CoachRequestOutcome,
} from "../src/reviewReport.js";
import {
  buildSingleDecisionPackage,
  buildTwoReadyPackage,
  buildVariantPackage,
} from "./fixtures/context-graph-package.js";

// ---------------------------------------------------------------------------
// Fixture plumbing (same conventions as the M6-D1 graph tests)
// ---------------------------------------------------------------------------

const GENERATED_AT = "2026-08-24T12:00:00.000Z";
const PROVIDER: LlmProviderDescriptor = Object.freeze({
  providerId: "openai",
  model: "gpt-test",
});

interface GraphRefs {
  decisionId: string;
  kgfNodeId: string;
  factNodeId: string;
  differenceNodeId: string;
  differenceId: string;
  actionRef: string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function emptySelection(pkg: StructuredAnalysisPackage): ReviewSelectionResult {
  return {
    policyVersion: SELECTOR_POLICY_VERSION_V1,
    analysisPackageId: pkg.packageId,
    analysisPackageStatus: pkg.record.status,
    selected: [],
  };
}

function nodeOfKindForDecision(
  graph: ContextGraph,
  kind: ContextGraphNode["nodeKind"],
  decisionId: string,
): ContextGraphNode {
  const node = graph.nodes.find(
    (candidate) =>
      candidate.nodeKind === kind &&
      (candidate.payload as { decisionId?: unknown }).decisionId === decisionId,
  );
  if (node === undefined) {
    throw new Error(`fixture graph must carry a ${kind} node for ${decisionId}`);
  }
  return node;
}

function refsOf(graph: ContextGraph, decisionId: string): GraphRefs {
  const kgf = nodeOfKindForDecision(graph, "KnownGameFact", decisionId);
  const fact = nodeOfKindForDecision(graph, "FactorFact", decisionId);
  const difference = nodeOfKindForDecision(graph, "FactorDifference", decisionId);
  const candidate = nodeOfKindForDecision(graph, "CandidateAction", decisionId);
  return {
    decisionId,
    kgfNodeId: kgf.nodeId,
    factNodeId: fact.nodeId,
    differenceNodeId: difference.nodeId,
    differenceId: (difference.payload as { differenceId: string }).differenceId,
    actionRef: (candidate.payload as { actionRef: string }).actionRef,
  };
}

/** A schema-valid positive draft decision (mirrors grounding-validator.test). */
function baseDecision(refs: GraphRefs) {
  return {
    decisionId: refs.decisionId,
    judgment: {
      localId: "j1",
      recommendation: refs.actionRef,
      confidence: "medium",
      premiseRefs: [refs.kgfNodeId, "i1"],
    },
    inferences: [
      {
        localId: "i1",
        statement: "牌河与危险牌信息构成防御依据。",
        premiseRefs: [refs.factNodeId],
      },
    ],
    explanations: [
      {
        // Two placeholder kinds (candidate + diff); kept under the frozen
        // 500-char soft length limit — the fixture ids are long hashes.
        text:
          `候选 {candidate:${refs.actionRef}.actionRef} 的方向为 ` +
          `{diff:${refs.differenceId}.direction}。`,
        claims: [
          { kind: "factor_difference", evidenceRef: refs.differenceNodeId },
        ],
        judgmentLocalRef: "j1",
      },
    ],
  };
}

function generatedOutcome(
  draftObject: unknown,
  transportRetries: 0 | 1 = 0,
): CoachRequestOutcome {
  return {
    kind: "generated",
    content: JSON.stringify(draftObject),
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    transportRetries,
  };
}

interface GoldenFixture {
  pkg: StructuredAnalysisPackage;
  graph: ContextGraph;
  refs: GraphRefs;
  selection: ReviewSelectionResult;
  content: string;
  report: ReviewReport;
}

async function goldenFixture(): Promise<GoldenFixture> {
  const pkg = await buildSingleDecisionPackage();
  const graph = projectContextGraph(pkg);
  const ready = pkg.decisions[0];
  if (ready === undefined || ready.outcome !== "analysis_ready") {
    throw new Error("fixture must carry an analysis_ready decision");
  }
  const refs = refsOf(graph, ready.decisionId);
  const selection = selectionFor(pkg, [ready.decisionId]);
  const content = JSON.stringify({ decisions: [baseDecision(refs)] });
  const report = assembleReviewReport({
    graph,
    selection,
    outcome: {
      kind: "generated",
      content,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      transportRetries: 0,
    },
    provider: PROVIDER,
    generatedAt: GENERATED_AT,
  });
  return { pkg, graph, refs, selection, content, report };
}

// ---------------------------------------------------------------------------
// coachRequestOutcomeFromLlmResult
// ---------------------------------------------------------------------------

describe("M6-D2 coachRequestOutcomeFromLlmResult", () => {
  it("maps a success (with or without usage) onto the generated outcome", () => {
    expect(coachRequestOutcomeFromLlmResult(
      { content: "x", usage: { inputTokens: 1 }, transportRetries: 1 } as LlmCoachResult,
    )).toEqual({
      kind: "generated",
      content: "x",
      usage: { inputTokens: 1 },
      transportRetries: 1,
    });
    expect(coachRequestOutcomeFromLlmResult({ content: "x", transportRetries: 0 })).toEqual({
      kind: "generated",
      content: "x",
      transportRetries: 0,
    });
  });

  it("maps provider_unavailable (pre-request) and transport failures", () => {
    expect(coachRequestOutcomeFromLlmResult({ errorCode: "provider_unavailable", transportRetries: 0 }))
      .toEqual({ kind: "provider_unavailable" });
    expect(coachRequestOutcomeFromLlmResult({ errorCode: "timeout", transportRetries: 1 }))
      .toEqual({ kind: "request_failed", transportRetries: 1 });
  });
});

// ---------------------------------------------------------------------------
// appendReasoningOverlay
// ---------------------------------------------------------------------------

describe("M6-D2 appendReasoningOverlay", () => {
  it("returns a NEW validated graph: evidence deep-equal, reasoning appended, graphId unchanged, input unmutated", async () => {
    const { graph, report } = await goldenFixture();
    const graphBefore = clone(graph);
    const appended = appendReasoningOverlay(
      graph,
      report.reasoningOverlay.nodes,
      report.reasoningOverlay.edges,
    );

    expect(graph).toEqual(graphBefore); // input never mutated
    expect(appended).not.toBe(graph);
    expect(appended.graphId).toBe(graph.graphId);
    expect(appended.packageId).toBe(graph.packageId);
    expect(appended.schemaVersion).toBe(graph.schemaVersion);

    // Evidence partition deep-equal; reasoning appended on top.
    expect(appended.nodes.filter((node) => node.partition === "evidence"))
      .toEqual(graph.nodes);
    expect(appended.nodes).toHaveLength(
      graph.nodes.length + report.reasoningOverlay.nodes.length,
    );
    expect(appended.edges).toHaveLength(
      graph.edges.length + report.reasoningOverlay.edges.length,
    );

    // Deterministically sorted and validator-clean.
    const nodeIds = appended.nodes.map((node) => node.nodeId);
    expect([...nodeIds].sort()).toEqual(nodeIds);
    expect(() => validateContextGraph(appended)).not.toThrow();
    expect(() => validateContextGraph(clone(appended))).not.toThrow();
  });

  it("fails closed on a non-reasoning node (partition validator wrapped)", async () => {
    const { graph } = await goldenFixture();
    const evidenceNode = clone(graph.nodes[0]!);
    expect(() => appendReasoningOverlay(graph, [evidenceNode], []))
      .toThrow(/m6d2_overlay_partition/);
  });

  it("fails closed on a reasoning node id colliding with an existing graph node", async () => {
    const { graph, report } = await goldenFixture();
    const colliding = clone(report.reasoningOverlay.nodes[0]!);
    colliding.nodeId = graph.nodes[0]!.nodeId;
    expect(() => appendReasoningOverlay(graph, [colliding], []))
      .toThrow(/m6d2_overlay_partition/);
  });
});

// ---------------------------------------------------------------------------
// assembleReviewReport — the golden report
// ---------------------------------------------------------------------------

describe("M6-D2 assembleReviewReport (golden)", () => {
  it("assembles the frozen complete report shape (rows, generation, overlay, audit, reportId)", async () => {
    const { graph, refs, selection, content, report } = await goldenFixture();

    // Schema-valid as a whole.
    expect(() => ReviewReportSchema.parse(report)).not.toThrow();

    // Row assembly: statuses live on the report (never on the package).
    expect(report.generationStatus).toBe("complete");
    expect(report.decisionEntries)
      .toEqual([{ decisionId: refs.decisionId, explanationStatus: "ready" }]);
    expect(report.selectedDecisionIds).toEqual([refs.decisionId]);

    // Generation block: the report is the sole owner of LLM-side versions.
    expect(report.generation).toEqual({
      providerId: PROVIDER.providerId,
      model: PROVIDER.model,
      promptVersion: COACH_REVIEW_PROMPT_VERSION,
      draftSchemaVersion: COACH_REASONING_DRAFT_SCHEMA_VERSION,
      generatorVersion: COACH_ENGINE_VERSION,
      validatorVersion: COACH_GROUNDING_VALIDATOR_VERSION,
      reportSchemaVersion: REVIEW_REPORT_SCHEMA_VERSION,
    });

    // Overlay kinds: one judgment + one inference + one explanation, all on
    // the frozen reasoning partition values and the engine producer.
    const kinds = report.reasoningOverlay.nodes.map((node) => node.nodeKind).sort();
    expect(kinds).toEqual(["CoachInference", "CoachJudgment", "Explanation"]);
    for (const node of report.reasoningOverlay.nodes) {
      expect(node.partition).toBe("reasoning");
      expect(node.origin).toBe("llm_reasoning");
      expect(node.authority).toBe("coach");
      expect(node.producer).toBe("coach-engine");
      expect(node.producerVersion).toBe(COACH_ENGINE_VERSION);
    }

    // Identity discipline: local ids never survive as ids/refs — the judgment
    // premises carry the engine-derived CoachInference node id.
    const judgmentNode = report.reasoningOverlay.nodes
      .find((node) => node.nodeKind === "CoachJudgment")!;
    const inferenceNode = report.reasoningOverlay.nodes
      .find((node) => node.nodeKind === "CoachInference")!;
    const explanationNode = report.reasoningOverlay.nodes
      .find((node) => node.nodeKind === "Explanation")!;
    const judgmentPayload = judgmentNode.payload as {
      judgmentId: string;
      localId: string;
      recommendation: string;
      premiseRefs: string[];
    };
    expect(judgmentPayload.judgmentId).toBe(judgmentNode.nodeId);
    expect(judgmentPayload.localId).toBe("j1");
    expect(judgmentPayload.recommendation).toBe(refs.actionRef);
    expect(judgmentPayload.premiseRefs).toContain(refs.kgfNodeId);
    expect(judgmentPayload.premiseRefs).toContain(inferenceNode.nodeId);
    expect(judgmentPayload.premiseRefs).not.toContain("i1");
    expect(inferenceNode.nodeId).toMatch(/^ctxg:CoachInference:/);
    expect((inferenceNode.payload as { localId: string }).localId).toBe("i1");
    expect(judgmentNode.nodeId).toMatch(/^ctxg:CoachJudgment:/);

    // Provenance = deduped CANONICALLY SORTED union of the referenced graph
    // nodes' provenance — the model's premiseRef order never leaks into node
    // content (inference unions its evidence premises; judgment unions theirs
    // through the mapped node ids).
    const kgfNode = graph.nodes.find((node) => node.nodeId === refs.kgfNodeId)!;
    const factNode = graph.nodes.find((node) => node.nodeId === refs.factNodeId)!;
    expect(inferenceNode.provenance)
      .toEqual([...new Set(factNode.provenance)].sort());
    expect(judgmentNode.provenance).toEqual(
      [...new Set([...kgfNode.provenance, ...factNode.provenance])].sort(),
    );

    // Edges: Explanation verbalizes the judgment AND the factor_difference
    // claim target; reasoning edges never start from an evidence node.
    const verbalizes = report.reasoningOverlay.edges;
    expect(verbalizes.map((edge) => edge.to).sort())
      .toEqual([judgmentNode.nodeId, refs.differenceNodeId].sort());
    for (const edge of verbalizes) {
      expect(edge.edgeKind).toBe("verbalizes");
      expect(edge.origin).toBe("llm_reasoning");
      expect(edge.from).toBe(explanationNode.nodeId);
    }

    // Hash-only audit over the shared serializer.
    const slice = buildGraphContextSlice(graph, selection);
    expect(report.audit.inputSliceHash)
      .toBe(`sha256:${sha256Hex(canonicalJson(slice))}`);
    expect(report.audit.outputHash).toBe(`sha256:${sha256Hex(content)}`);
    expect(report.audit.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    expect(report.audit.transportRetries).toBe(0);

    // reportId recomputed independently from the frozen formula.
    expect(report.reportId).toBe(`review-report:${sha256Hex(canonicalJson({
      packageId: report.packageId,
      selectorPolicyVersion: report.selectorPolicyVersion,
      generation: report.generation,
      decisionEntries: report.decisionEntries,
      reasoningOverlay: report.reasoningOverlay,
    }))}`);
    expect(report.generatedAt).toBe(GENERATED_AT);
    expect(report.diagnostics).toEqual([]);
  });

  it("is deterministic: the same inputs assemble a deep-equal report", async () => {
    const first = await goldenFixture();
    const second = await goldenFixture();
    expect(second.report).toEqual(first.report);
  });

  it("generatedAt is display-only and never participates in reportId; the provider does", async () => {
    const base = await goldenFixture();
    const laterTime = assembleReviewReport({
      graph: base.graph,
      selection: base.selection,
      outcome: generatedOutcome({ decisions: [baseDecision(base.refs)] }),
      provider: PROVIDER,
      generatedAt: "2026-08-24T18:30:00.000Z",
    });
    expect(laterTime.reportId).toBe(base.report.reportId);
    expect(laterTime.generatedAt).not.toBe(base.report.generatedAt);

    const otherProvider = assembleReviewReport({
      graph: base.graph,
      selection: base.selection,
      outcome: generatedOutcome({ decisions: [baseDecision(base.refs)] }),
      provider: { providerId: "anthropic", model: "claude-test" },
      generatedAt: GENERATED_AT,
    });
    expect(otherProvider.reportId).not.toBe(base.report.reportId);
  });

  it("isolates same-localId reports and switches A→B→A from the base graph", async () => {
    const base = await goldenFixture();
    const draftA = baseDecision(base.refs);
    const draftB = baseDecision(base.refs);
    draftB.judgment.confidence = "high";
    draftB.inferences[0]!.statement = "报告 B 的独立推断内容。";
    draftB.explanations[0]!.text =
      `报告 B：{candidate:${base.refs.actionRef}.actionRef}，` +
      `{diff:${base.refs.differenceId}.direction}。`;

    const reportA = assembleReviewReport({
      graph: base.graph,
      selection: base.selection,
      outcome: generatedOutcome({ decisions: [draftA] }),
      provider: PROVIDER,
      generatedAt: GENERATED_AT,
    });
    const reportB = assembleReviewReport({
      graph: base.graph,
      selection: base.selection,
      outcome: generatedOutcome({ decisions: [draftB] }),
      provider: PROVIDER,
      generatedAt: GENERATED_AT,
    });

    const node = (report: ReviewReport, kind: ContextGraphNode["nodeKind"]) =>
      report.reasoningOverlay.nodes.find((candidate) => candidate.nodeKind === kind)!;
    expect(node(reportA, "CoachJudgment").nodeId)
      .toBe(node(reportB, "CoachJudgment").nodeId);
    expect(node(reportA, "CoachInference").nodeId)
      .toBe(node(reportB, "CoachInference").nodeId);
    expect(node(reportA, "Explanation").nodeId)
      .not.toBe(node(reportB, "Explanation").nodeId);
    expect(reportA.reportId).not.toBe(reportB.reportId);

    expect(() => validateReviewReport(reportA, base.graph)).not.toThrow();
    expect(() => validateReviewReport(reportB, base.graph)).not.toThrow();

    const switchTo = (report: ReviewReport) => appendReasoningOverlay(
      base.graph,
      report.reasoningOverlay.nodes,
      report.reasoningOverlay.edges,
    );
    const graphA1 = switchTo(reportA);
    const graphB = switchTo(reportB);
    const graphA2 = switchTo(reportA);

    const inferenceStatement = (graph: ContextGraph) =>
      (graph.nodes.find((candidate) => candidate.nodeKind === "CoachInference")!
        .payload as { statement: string }).statement;
    expect(inferenceStatement(graphA1)).toBe(draftA.inferences[0]!.statement);
    expect(inferenceStatement(graphB)).toBe(draftB.inferences[0]!.statement);
    expect(inferenceStatement(graphA2)).toBe(draftA.inferences[0]!.statement);
    expect(graphA2).toEqual(graphA1);

    for (const report of [reportA, reportB]) {
      const composed = switchTo(report);
      const ids = new Set(composed.nodes.map((candidate) => candidate.nodeId));
      const judgment = node(report, "CoachJudgment");
      const explanation = node(report, "Explanation");
      for (const ref of (judgment.payload as { premiseRefs: string[] }).premiseRefs) {
        expect(ids.has(ref)).toBe(true);
      }
      for (const claim of (explanation.payload as {
        claims: { evidenceRef: string }[];
      }).claims) {
        expect(ids.has(claim.evidenceRef)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// assembleReviewReport — degrade paths (grill E4/E9)
// ---------------------------------------------------------------------------

describe("M6-D2 assembleReviewReport (LLM failure degrades)", () => {
  async function degradeFixture(): Promise<GoldenFixture> {
    return goldenFixture();
  }

  it("provider_unavailable: all rows degrade, unconfigured provider recorded, package and graph untouched", async () => {
    const { pkg, graph, refs, selection } = await degradeFixture();
    const pkgBefore = clone(pkg);
    const graphBefore = clone(graph);
    const report = assembleReviewReport({
      graph,
      selection,
      outcome: { kind: "provider_unavailable" },
      generatedAt: GENERATED_AT,
    });

    expect(report.generationStatus).toBe("evidence_only");
    expect(report.decisionEntries)
      .toEqual([{ decisionId: refs.decisionId, explanationStatus: "provider_unavailable" }]);
    expect(report.generation.providerId).toBe(UNCONFIGURED_COACH_PROVIDER.providerId);
    expect(report.generation.model).toBe(UNCONFIGURED_COACH_PROVIDER.model);
    expect(report.reasoningOverlay).toEqual({ nodes: [], edges: [] });
    expect(report.diagnostics).toEqual([]);
    expect(report.audit).toEqual({
      inputSliceHash: report.audit.inputSliceHash,
      outputHash: `sha256:${sha256Hex("")}`,
      transportRetries: 0,
    });

    // The analysis package content is never polluted by an LLM failure.
    expect(pkg).toEqual(pkgBefore);
    expect(graph).toEqual(graphBefore);
  });

  it("an empty selection assembles a legal evidence_only report with no rows", async () => {
    const { pkg, graph } = await degradeFixture();
    const report = assembleReviewReport({
      graph,
      selection: emptySelection(pkg),
      outcome: { kind: "provider_unavailable" },
      generatedAt: GENERATED_AT,
    });
    expect(report.decisionEntries).toEqual([]);
    expect(report.selectedDecisionIds).toEqual([]);
    expect(report.generationStatus).toBe("evidence_only");
    expect(report.reasoningOverlay).toEqual({ nodes: [], edges: [] });
    expect(() => ReviewReportSchema.parse(report)).not.toThrow();
  });

  it("request_failed: rows degrade, transport retries recorded, empty output hash", async () => {
    const { graph, refs, selection } = await degradeFixture();
    const report = assembleReviewReport({
      graph,
      selection,
      outcome: { kind: "request_failed", transportRetries: 1 },
      generatedAt: GENERATED_AT,
    });
    expect(report.generationStatus).toBe("evidence_only");
    expect(report.decisionEntries)
      .toEqual([{ decisionId: refs.decisionId, explanationStatus: "request_failed" }]);
    expect(report.audit.transportRetries).toBe(1);
    expect(report.audit.outputHash).toBe(`sha256:${sha256Hex("")}`);
    expect(report.audit.usage).toBeUndefined();
    expect(report.reasoningOverlay).toEqual({ nodes: [], edges: [] });
  });

  it("unparseable model output: all rows invalid_output with a diagnostic, never retried", async () => {
    const { graph, refs, selection } = await degradeFixture();
    const report = assembleReviewReport({
      graph,
      selection,
      outcome: { kind: "generated", content: "not json {{", transportRetries: 1 },
      generatedAt: GENERATED_AT,
    });
    expect(report.generationStatus).toBe("evidence_only");
    expect(report.decisionEntries)
      .toEqual([{ decisionId: refs.decisionId, explanationStatus: "invalid_output" }]);
    expect(report.reasoningOverlay).toEqual({ nodes: [], edges: [] });
    expect(report.diagnostics).toEqual([{
      kind: "grounding_rejected",
      code: "invalid_payload",
      detail: "model output is not a schema-valid coach-reasoning-draft/v1",
    }]);
    // The raw output is still hashed (audit truth), but nothing entered the overlay.
    expect(report.audit.outputHash).toBe(`sha256:${sha256Hex("not json {{")}`);
    expect(report.audit.transportRetries).toBe(1);
  });

  it("per-decision grounding rejection: partial report, E9 cascade drops the whole decision's overlay content", async () => {
    const pkg = await buildTwoReadyPackage();
    const graph = projectContextGraph(pkg);
    const [first, second] = pkg.decisions;
    if (first === undefined || second === undefined) {
      throw new Error("fixture must carry two decisions");
    }
    const refsA = refsOf(graph, first.decisionId);
    const refsB = refsOf(graph, second.decisionId);
    const pkgBefore = clone(pkg);
    const graphBefore = clone(graph);

    const good = baseDecision(refsA);
    const bad = baseDecision(refsB);
    bad.judgment.premiseRefs = [refsB.kgfNodeId, "nowhere"]; // dangling_ref

    const report = assembleReviewReport({
      graph,
      selection: selectionFor(pkg, [first.decisionId, second.decisionId]),
      outcome: generatedOutcome({ decisions: [good, bad] }),
      provider: PROVIDER,
      generatedAt: GENERATED_AT,
    });

    expect(report.generationStatus).toBe("partial");
    expect(report.decisionEntries).toEqual([
      { decisionId: first.decisionId, explanationStatus: "ready" },
      { decisionId: second.decisionId, explanationStatus: "invalid_output" },
    ]);

    // E9 cascade: the rejected decision's judgments AND explanations are gone;
    // only the ready decision's content entered the overlay.
    const overlayDecisionIds = report.reasoningOverlay.nodes.map(
      (node) => (node.payload as { decisionId: string }).decisionId,
    );
    expect(new Set(overlayDecisionIds)).toEqual(new Set([first.decisionId]));

    // The validator's violations are stored verbatim as diagnostics.
    const rejected = report.diagnostics.filter(
      (item) => item.kind === "grounding_rejected" && item.decisionId === second.decisionId,
    );
    expect(rejected.map((item) => item.code)).toContain("dangling_ref");

    // Analysis package untouched.
    expect(pkg).toEqual(pkgBefore);
    expect(graph).toEqual(graphBefore);
  });

  it("a selected decision with no draft entry is missing_judgment + invalid_output", async () => {
    const pkg = await buildTwoReadyPackage();
    const graph = projectContextGraph(pkg);
    const [first, second] = pkg.decisions;
    if (first === undefined || second === undefined) {
      throw new Error("fixture must carry two decisions");
    }
    const refsA = refsOf(graph, first.decisionId);

    const report = assembleReviewReport({
      graph,
      selection: selectionFor(pkg, [first.decisionId, second.decisionId]),
      outcome: generatedOutcome({ decisions: [baseDecision(refsA)] }),
      provider: PROVIDER,
      generatedAt: GENERATED_AT,
    });
    expect(report.generationStatus).toBe("partial");
    expect(report.decisionEntries).toEqual([
      { decisionId: first.decisionId, explanationStatus: "ready" },
      { decisionId: second.decisionId, explanationStatus: "invalid_output" },
    ]);
    expect(report.diagnostics).toContainEqual({
      kind: "grounding_rejected",
      code: "missing_judgment",
      decisionId: second.decisionId,
      detail: "selected decision has no draft decision entry",
    });
  });

  it("a draft entry outside the selection is dropped with a dangling_ref diagnostic and never enters the overlay", async () => {
    const pkg = await buildTwoReadyPackage();
    const graph = projectContextGraph(pkg);
    const [first, second] = pkg.decisions;
    if (first === undefined || second === undefined) {
      throw new Error("fixture must carry two decisions");
    }
    const refsA = refsOf(graph, first.decisionId);
    const refsB = refsOf(graph, second.decisionId);

    const report = assembleReviewReport({
      graph,
      selection: selectionFor(pkg, [first.decisionId]),
      outcome: generatedOutcome({ decisions: [baseDecision(refsA), baseDecision(refsB)] }),
      provider: PROVIDER,
      generatedAt: GENERATED_AT,
    });

    // Only the selected decision has a row; the report stays complete.
    expect(report.decisionEntries)
      .toEqual([{ decisionId: first.decisionId, explanationStatus: "ready" }]);
    expect(report.generationStatus).toBe("complete");
    const overlayDecisionIds = report.reasoningOverlay.nodes.map(
      (node) => (node.payload as { decisionId: string }).decisionId,
    );
    expect(new Set(overlayDecisionIds)).toEqual(new Set([first.decisionId]));
    expect(report.diagnostics).toContainEqual({
      kind: "grounding_rejected",
      code: "dangling_ref",
      decisionId: second.decisionId,
      detail: `draft decision ${second.decisionId} is outside the selection`,
    });
  });

  it("soft findings ride along as diagnostics and never degrade a row", async () => {
    const { graph, refs, selection } = await degradeFixture();
    const decision = baseDecision(refs);
    decision.explanations = [
      { text: "期望打点约 3900 点。", claims: [], judgmentLocalRef: "j1" },
    ];
    const report = assembleReviewReport({
      graph,
      selection,
      outcome: generatedOutcome({ decisions: [decision] }),
      provider: PROVIDER,
      generatedAt: GENERATED_AT,
    });
    expect(report.generationStatus).toBe("complete");
    expect(report.decisionEntries[0]!.explanationStatus).toBe("ready");
    expect(report.diagnostics).toEqual([
      {
        kind: "soft_finding",
        code: "free_text_number",
        decisionId: refs.decisionId,
        detail: "free text numeral outside placeholders",
      },
    ]);
    expect(report.reasoningOverlay.nodes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// assembleReviewReport — input guards
// ---------------------------------------------------------------------------

describe("M6-D2 assembleReviewReport (input guards)", () => {
  it("fails closed on a schema-invalid selection", async () => {
    const { graph, selection } = await goldenFixture();
    const tampered = { ...selection, selected: "not-an-array" } as unknown as ReviewSelectionResult;
    expect(() => assembleReviewReport({
      graph,
      selection: tampered,
      outcome: { kind: "provider_unavailable" },
      generatedAt: GENERATED_AT,
    })).toThrow(/m6d2_report_selection_schema/);
  });

  it("fails closed on a selection bound to another package (same-source proof)", async () => {
    const { graph } = await goldenFixture();
    const variant = await buildVariantPackage();
    expect(() => assembleReviewReport({
      graph,
      selection: selectionFor(variant, ["decision:unused"]),
      outcome: { kind: "provider_unavailable" },
      generatedAt: GENERATED_AT,
    })).toThrow(/m6d2_report_package_mismatch/);
  });
});
