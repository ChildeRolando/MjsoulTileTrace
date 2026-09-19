/**
 * M6-D2 — grounding validator tests (spec "Grounding validator": hard layers
 * 1–6 + the forged-identity guard; soft layer never blocks; grill E5/E7/E8).
 *
 * The allow-list scope of a draft decision is EXACTLY the decision subgraph
 * with slice-filtered payloads (what the model was shown), so these tests
 * prove both directions: references that live inside the sent slice pass, and
 * references that only exist in the RAW graph — another decision's node, or a
 * field the allow-list strips — fail closed.
 *
 * `validateReviewReport` (the same module's read-back validator) is exercised
 * at the bottom against an engine-assembled golden report and mechanical
 * tampers; the assembly itself is covered by review-report.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  CoachReasoningDraftSchema,
  SELECTOR_POLICY_VERSION_V1,
  type CoachReasoningDraft,
  type ContextGraph,
  type ContextGraphNode,
  type ReviewReport,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { canonicalJson, sha256Hex } from "../src/analysis/package-identity.js";
import { deriveEdgeId } from "../src/context-graph/context-graph-ids.js";
import { projectContextGraph } from "../src/context-graph/project-context-graph.js";
import {
  validateCoachGrounding,
  validateReviewReport,
} from "../src/groundingValidator.js";
import { assembleReviewReport } from "../src/reviewReport.js";
import {
  buildSingleDecisionPackage,
  buildTwoReadyPackage,
  buildVariantPackage,
} from "./fixtures/context-graph-package.js";

// ---------------------------------------------------------------------------
// Fixture plumbing (same conventions as the M6-D1 graph tests)
// ---------------------------------------------------------------------------

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

/** A schema-valid positive draft decision (evidence + local-inference
 *  premises, one inference, one explanation with resolvable placeholders). */
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
        // One diff + one candidate placeholder (the fixture ids are long
        // hashes — keep the drafted text under the 500-char soft limit).
        text: `在 {diff:${refs.differenceId}.axis} 轴上，候选 {candidate:${refs.actionRef}.actionRef}。`,
        claims: [
          { kind: "factor_difference", evidenceRef: refs.differenceNodeId },
        ],
        judgmentLocalRef: "j1",
      },
    ],
  };
}

function draftOf(decisions: unknown[]): CoachReasoningDraft {
  return CoachReasoningDraftSchema.parse({ decisions });
}

async function singleDecisionSetup(): Promise<{
  pkg: StructuredAnalysisPackage;
  graph: ContextGraph;
  refs: GraphRefs;
}> {
  const pkg = await buildSingleDecisionPackage();
  const graph = projectContextGraph(pkg);
  const ready = pkg.decisions[0];
  if (ready === undefined || ready.outcome !== "analysis_ready") {
    throw new Error("fixture must carry an analysis_ready decision");
  }
  return { pkg, graph, refs: refsOf(graph, ready.decisionId) };
}

function codesOf(violations: { code: string }[]): string[] {
  return violations.map((violation) => violation.code);
}

function recomputeReportId(report: ReviewReport): void {
  report.reportId = `review-report:${sha256Hex(canonicalJson({
    packageId: report.packageId,
    selectorPolicyVersion: report.selectorPolicyVersion,
    generation: report.generation,
    decisionEntries: report.decisionEntries,
    reasoningOverlay: report.reasoningOverlay,
  }))}`;
}

function recomputeOverlayEdgeIds(report: ReviewReport): void {
  for (const edge of report.reasoningOverlay.edges) {
    edge.edgeId = deriveEdgeId({
      from: edge.from,
      to: edge.to,
      edgeKind: edge.edgeKind,
      payload: edge.payload,
    });
  }
  report.reasoningOverlay.edges.sort((left, right) =>
    left.edgeId.localeCompare(right.edgeId),
  );
}

// ---------------------------------------------------------------------------
// validateCoachGrounding — hard layers
// ---------------------------------------------------------------------------

describe("M6-D2 validateCoachGrounding (hard layers)", () => {
  it("accepts a grounded draft: evidence premises, local inference premises, resolvable placeholders, kind-agreeing claims", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const result = validateCoachGrounding(graph, draftOf([baseDecision(refs)]));
    expect(result.violations).toEqual([]);
    expect(result.softFindings).toEqual([]);
  });

  it("is deterministic: the same (graph, draft) produces the same deep-equal result", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const draft = draftOf([baseDecision(refs)]);
    expect(validateCoachGrounding(graph, draft))
      .toEqual(validateCoachGrounding(graph, draft));
  });

  it("accepts an empty draft (nothing selected → nothing to ground)", async () => {
    const { graph } = await singleDecisionSetup();
    const result = validateCoachGrounding(graph, draftOf([]));
    expect(result.violations).toEqual([]);
    expect(result.softFindings).toEqual([]);
  });

  it("layer 1: an unresolvable premiseRef is dangling_ref", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.judgment.premiseRefs = [refs.kgfNodeId, "nowhere"];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["dangling_ref"]);
    expect(result.violations[0]!.decisionId).toBe(refs.decisionId);
  });

  it("layer 1: a draft decisionId that resolves to no Decision node is dangling_ref", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.decisionId = "decision:game:ghost";
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["dangling_ref"]);
  });

  it("layer 1: a premise from ANOTHER decision's subgraph is cross_decision_ref (slice scope, not raw graph)", async () => {
    const pkg = await buildTwoReadyPackage();
    const graph = projectContextGraph(pkg);
    const [first, second] = pkg.decisions;
    if (first === undefined || second === undefined) {
      throw new Error("fixture must carry two decisions");
    }
    const refsA = refsOf(graph, first.decisionId);
    const refsB = refsOf(graph, second.decisionId);
    expect(refsB.factNodeId).not.toBe(refsA.factNodeId);

    const decision = baseDecision(refsA);
    decision.judgment.premiseRefs = [refsA.kgfNodeId, refsB.factNodeId];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["cross_decision_ref"]);
  });

  it("layer 1: a claim evidenceRef from another decision is cross_decision_ref", async () => {
    const pkg = await buildTwoReadyPackage();
    const graph = projectContextGraph(pkg);
    const [first, second] = pkg.decisions;
    if (first === undefined || second === undefined) {
      throw new Error("fixture must carry two decisions");
    }
    const refsA = refsOf(graph, first.decisionId);
    const refsB = refsOf(graph, second.decisionId);

    const decision = baseDecision(refsA);
    decision.explanations = [
      { text: "说明文本。", claims: [{ kind: "factor_fact", evidenceRef: refsB.factNodeId }], judgmentLocalRef: "j1" },
    ];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["cross_decision_ref"]);
  });

  it("layer 2: a recommendation outside the decision's CandidateAction set is recommendation_not_in_candidates", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.judgment.recommendation = "action:v1:discard:9z";
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["recommendation_not_in_candidates"]);
  });

  it("layer 3: an inference premising on another inference is invalid_premise_kind", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.inferences = [
      { localId: "i1", statement: "第一条推断。", premiseRefs: [refs.factNodeId] },
      { localId: "i2", statement: "第二条推断。", premiseRefs: ["i1"] },
    ];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["invalid_premise_kind"]);
  });

  it("layer 3: a judgment premising on itself is invalid_premise_kind", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.judgment.premiseRefs = [refs.kgfNodeId, "j1"];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["invalid_premise_kind"]);
  });

  it("layer 4: a factor_fact claim against a FactorDifference node is claim_kind_mismatch", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.explanations = [
      {
        text: "说明文本。",
        claims: [{ kind: "factor_fact", evidenceRef: refs.differenceNodeId }],
        judgmentLocalRef: "j1",
      },
    ];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["claim_kind_mismatch"]);
  });

  it("layer 5: malformed / unknown / ghost placeholders are unresolvable_placeholder", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const badTexts = [
      `{diff:${refs.differenceId}.nope}`,   // field not in the payload
      "{foo:bar}",                          // not the placeholder grammar
      "{diff:ghost.axis}",                  // id resolves to no scoped node
      "{diff}",                             // no field path
    ];
    for (const text of badTexts) {
      const decision = baseDecision(refs);
      decision.explanations = [{ text, claims: [], judgmentLocalRef: "j1" }];
      const result = validateCoachGrounding(graph, draftOf([decision]));
      expect(codesOf(result.violations)).toEqual(["unresolvable_placeholder"]);
    }
  });

  it("layer 5 (slice boundary): a placeholder field the allow-list strips from the sent slice fails closed", async () => {
    // decisionId EXISTS on the raw FactorDifference payload but is NOT in
    // GRAPH_SLICE_PAYLOAD_ALLOWLIST — the model never saw it, so referencing
    // it is a grounding failure, not a pass.
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.explanations = [
      { text: `{diff:${refs.differenceId}.decisionId}`, claims: [], judgmentLocalRef: "j1" },
    ];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["unresolvable_placeholder"]);
  });

  it("identity guard: a self-minted ctxg: premise ref is forged_node_id", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.judgment.premiseRefs = [refs.kgfNodeId, "ctxg:CoachJudgment:deadbeef"];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["forged_node_id"]);
  });

  it("layer 6: a draft that no longer parses strictly is a single invalid_payload", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const bogus = {
      decisions: [{ ...baseDecision(refs), note: "chain-of-thought" }],
    };
    const result = validateCoachGrounding(
      graph,
      bogus as unknown as CoachReasoningDraft,
    );
    expect(codesOf(result.violations)).toEqual(["invalid_payload"]);
  });

  it("layer 6: duplicate draft decision entries are invalid_payload", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    const result = validateCoachGrounding(graph, draftOf([decision, { ...decision }]));
    expect(codesOf(result.violations)).toEqual(["invalid_payload"]);
  });

  it("layer 6: colliding local ids are invalid_payload (engine-derived node ids would collide)", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.inferences = [
      { localId: "i1", statement: "第一条推断。", premiseRefs: [refs.factNodeId] },
      { localId: "i1", statement: "重名推断。", premiseRefs: [refs.kgfNodeId] },
    ];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["invalid_payload"]);
  });

  it("layer 6: duplicate explanation content is invalid_payload (content-derived node id would collide)", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    const explanation = decision.explanations[0]!;
    decision.explanations = [explanation, { ...explanation }];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["invalid_payload"]);
  });

  it("layer 1: a judgmentLocalRef that misses the decision judgment is dangling_ref", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.explanations = [
      { text: "说明文本。", claims: [], judgmentLocalRef: "j9" },
    ];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(codesOf(result.violations)).toEqual(["dangling_ref"]);
  });
});

// ---------------------------------------------------------------------------
// validateCoachGrounding — soft layer (never blocks)
// ---------------------------------------------------------------------------

describe("M6-D2 validateCoachGrounding (soft findings never block)", () => {
  it("free-text numerals outside placeholders are a soft finding only", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.explanations = [{ text: "期望打点约 3900 点。", claims: [], judgmentLocalRef: "j1" }];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(result.violations).toEqual([]);
    expect(result.softFindings.map((finding) => finding.code))
      .toEqual(["free_text_number"]);
  });

  it("numerals INSIDE placeholders are not flagged", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    // The differenceId may carry digits; it lives inside the placeholder.
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(result.softFindings).toEqual([]);
  });

  it("direction words are a soft finding only", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.explanations = [{ text: "这样进张更快。", claims: [], judgmentLocalRef: "j1" }];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(result.violations).toEqual([]);
    expect(result.softFindings.map((finding) => finding.code))
      .toEqual(["direction_word"]);
  });

  it("over-length text is a soft finding only", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.explanations = [{ text: "长".repeat(501), claims: [], judgmentLocalRef: "j1" }];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(result.violations).toEqual([]);
    expect(result.softFindings.map((finding) => finding.code))
      .toEqual(["length"]);
  });

  it("a raw graph id leaked into text is a soft finding only", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    decision.explanations = [
      { text: "参见节点 ctxg:KnownGameFact:deadbeef 的牌河信息。", claims: [], judgmentLocalRef: "j1" },
    ];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(result.violations).toEqual([]);
    expect(result.softFindings.map((finding) => finding.code))
      .toEqual(["style"]);
  });

  it("same text with DIFFERENT claims is a soft duplicate (identical text+claims stays hard)", async () => {
    const { graph, refs } = await singleDecisionSetup();
    const decision = baseDecision(refs);
    // Numeral-free text (a numeral would add a free_text_number finding).
    decision.explanations = [
      { text: "同样的说明。", claims: [], judgmentLocalRef: "j1" },
      {
        text: "同样的说明。",
        claims: [{ kind: "factor_difference", evidenceRef: refs.differenceNodeId }],
        judgmentLocalRef: "j1",
      },
    ];
    const result = validateCoachGrounding(graph, draftOf([decision]));
    expect(result.violations).toEqual([]);
    expect(result.softFindings.map((finding) => finding.code))
      .toEqual(["duplicate"]);
  });
});

// ---------------------------------------------------------------------------
// validateReviewReport (read-back validator over an engine-assembled report)
// ---------------------------------------------------------------------------

describe("M6-D2 validateReviewReport", () => {
  const GENERATED_AT = "2026-08-24T12:00:00.000Z";

  async function goldenReport(): Promise<{
    graph: ContextGraph;
    report: ReviewReport;
  }> {
    const { pkg, graph, refs } = await singleDecisionSetup();
    const selection = {
      policyVersion: SELECTOR_POLICY_VERSION_V1,
      analysisPackageId: pkg.packageId,
      analysisPackageStatus: pkg.record.status,
      selected: [{
        decisionId: refs.decisionId,
        rank: 1,
        selectionReason: "model_disagreement_above_threshold" as const,
      }],
    };
    const report = assembleReviewReport({
      graph,
      selection,
      outcome: {
        kind: "generated",
        content: JSON.stringify({ decisions: [baseDecision(refs)] }),
        transportRetries: 0,
      },
      provider: { providerId: "openai", model: "gpt-test" },
      generatedAt: GENERATED_AT,
    });
    return { graph, report };
  }

  it("accepts the engine-assembled golden report and its JSON roundtrip", async () => {
    const { graph, report } = await goldenReport();
    expect(() => validateReviewReport(report, graph)).not.toThrow();
    expect(() => validateReviewReport(clone(report), graph)).not.toThrow();
  });

  it("accepts explicit valid opposes/qualifies read-back edges without producer support", async () => {
    const { graph, report } = await goldenReport();
    const readBack = clone(report);
    const judgment = readBack.reasoningOverlay.nodes
      .find((node) => node.nodeKind === "CoachJudgment")!;
    const decisionId = (judgment.payload as { decisionId: string }).decisionId;
    const evidence = graph.nodes.find(
      (node) => node.nodeKind === "FactorFact" &&
        (node.payload as { decisionId?: string }).decisionId === decisionId,
    )!;

    for (const edgeKind of ["opposes", "qualifies"] as const) {
      const edge = {
        edgeKind,
        from: judgment.nodeId,
        to: evidence.nodeId,
        origin: "llm_reasoning" as const,
        provenance: [],
        payload: {},
      };
      readBack.reasoningOverlay.edges.push({
        ...edge,
        edgeId: deriveEdgeId({
          from: edge.from,
          to: edge.to,
          edgeKind: edge.edgeKind,
          payload: edge.payload,
        }),
      });
    }
    readBack.reasoningOverlay.edges.sort((left, right) =>
      left.edgeId.localeCompare(right.edgeId),
    );
    recomputeReportId(readBack);

    expect(() => validateReviewReport(readBack, graph)).not.toThrow();
  });

  it("rejects a report bound to a different source package (same-source proof)", async () => {
    const { report } = await goldenReport();
    const variant = await buildVariantPackage();
    const variantGraph = projectContextGraph(variant);
    expect(() => validateReviewReport(report, variantGraph))
      .toThrow(/m6d2_report_package_mismatch/);
  });

  it("rejects schema-level tampering (status no longer matches the row mapping)", async () => {
    const { graph, report } = await goldenReport();
    const tampered = clone(report) as { generationStatus: string };
    tampered.generationStatus = "evidence_only";
    expect(() => validateReviewReport(tampered, graph))
      .toThrow(/m6d2_report_schema/);
  });

  it("rejects a selected decision that resolves to no Decision node", async () => {
    const { graph, report } = await goldenReport();
    const tampered = clone(report) as {
      selectedDecisionIds: string[];
      decisionEntries: { decisionId: string; explanationStatus: string }[];
      generationStatus: string;
    };
    tampered.selectedDecisionIds = [...tampered.selectedDecisionIds, "decision:game:ghost"];
    tampered.decisionEntries = [
      ...tampered.decisionEntries,
      { decisionId: "decision:game:ghost", explanationStatus: "invalid_output" },
    ];
    tampered.generationStatus = "partial";
    expect(() => validateReviewReport(tampered, graph))
      .toThrow(/m6d2_report_decision_unresolved/);
  });

  it("rejects a tampered overlay edge payload (edge id no longer recomputable)", async () => {
    const { graph, report } = await goldenReport();
    const tampered = clone(report) as {
      reasoningOverlay: {
        nodes: unknown[];
        edges: { payload: Record<string, unknown> }[];
      };
    };
    tampered.reasoningOverlay.edges[0]!.payload = { side: "left" };
    expect(() => validateReviewReport(tampered, graph))
      .toThrow(/m6d2_report_overlay_edge_id_mismatch/);
  });

  it("rejects an Explanation whose content-derived node identity is stale", async () => {
    const { graph, report } = await goldenReport();
    const tampered = clone(report);
    const explanation = tampered.reasoningOverlay.nodes
      .find((node) => node.nodeKind === "Explanation")!;
    (explanation.payload as { text: string }).text += " 已篡改";
    expect(() => validateReviewReport(tampered, graph))
      .toThrow(/m6d2_report_overlay_node_id_mismatch/);
  });

  it("rejects synchronized CoachJudgment / CoachInference nodeId and payload self-id forgery", async () => {
    const { graph, report } = await goldenReport();
    for (const [nodeKind, selfIdKey] of [
      ["CoachJudgment", "judgmentId"],
      ["CoachInference", "inferenceId"],
    ] as const) {
      const tampered = clone(report);
      const node = tampered.reasoningOverlay.nodes
        .find((candidate) => candidate.nodeKind === nodeKind)!;
      const previousId = node.nodeId;
      const forgedId = `ctxg:${nodeKind}:forged`;
      node.nodeId = forgedId;
      (node.payload as Record<string, unknown>)[selfIdKey] = forgedId;
      for (const edge of tampered.reasoningOverlay.edges) {
        if (edge.from === previousId) edge.from = forgedId;
        if (edge.to === previousId) edge.to = forgedId;
      }
      recomputeOverlayEdgeIds(tampered);
      recomputeReportId(tampered);

      expect(() => validateReviewReport(tampered, graph))
        .toThrow(/m6d2_report_overlay_node_id_mismatch/);
    }
  });

  it("rejects an Explanation payload self-id tamper even with a recomputed reportId", async () => {
    const { graph, report } = await goldenReport();
    const tampered = clone(report);
    const explanation = tampered.reasoningOverlay.nodes
      .find((node) => node.nodeKind === "Explanation")!;
    (explanation.payload as { explanationId: string }).explanationId =
      "ctxg:Explanation:forged";
    recomputeReportId(tampered);

    expect(() => validateReviewReport(tampered, graph))
      .toThrow(/m6d2_report_schema/);
  });

  it("rejects endpoint-kind violations for verbalizes / opposes / qualifies", async () => {
    const { graph, report } = await goldenReport();
    const judgment = report.reasoningOverlay.nodes
      .find((node) => node.nodeKind === "CoachJudgment")!;
    const explanation = report.reasoningOverlay.nodes
      .find((node) => node.nodeKind === "Explanation")!;
    const decisionId = (judgment.payload as { decisionId: string }).decisionId;
    const evidence = nodeOfKindForDecision(graph, "FactorFact", decisionId);

    for (const [edgeKind, from] of [
      ["verbalizes", judgment.nodeId],
      ["opposes", explanation.nodeId],
      ["qualifies", explanation.nodeId],
    ] as const) {
      const tampered = clone(report);
      tampered.reasoningOverlay.edges.push({
        edgeId: deriveEdgeId({ from, to: evidence.nodeId, edgeKind, payload: {} }),
        edgeKind,
        from,
        to: evidence.nodeId,
        origin: "llm_reasoning",
        provenance: [],
        payload: {},
      });
      tampered.reasoningOverlay.edges.sort((left, right) =>
        left.edgeId.localeCompare(right.edgeId),
      );
      recomputeReportId(tampered);

      expect(() => validateReviewReport(tampered, graph))
        .toThrow(/m6d2_report_overlay_edge_endpoint_kind/);
    }
  });

  it("rejects a valid-kind edge whose endpoints belong to different decisions", async () => {
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
      selection: {
        policyVersion: SELECTOR_POLICY_VERSION_V1,
        analysisPackageId: pkg.packageId,
        analysisPackageStatus: pkg.record.status,
        selected: [first, second].map((decision, index) => ({
          decisionId: decision.decisionId,
          rank: index + 1,
          selectionReason: "model_disagreement_above_threshold" as const,
        })),
      },
      outcome: {
        kind: "generated",
        content: JSON.stringify({ decisions: [baseDecision(refsA), baseDecision(refsB)] }),
        transportRetries: 0,
      },
      provider: { providerId: "openai", model: "gpt-test" },
      generatedAt: GENERATED_AT,
    });
    const judgmentA = report.reasoningOverlay.nodes.find(
      (node) => node.nodeKind === "CoachJudgment" &&
        (node.payload as { decisionId: string }).decisionId === first.decisionId,
    )!;
    const evidenceB = nodeOfKindForDecision(graph, "FactorFact", second.decisionId);
    report.reasoningOverlay.edges.push({
      edgeId: deriveEdgeId({
        from: judgmentA.nodeId,
        to: evidenceB.nodeId,
        edgeKind: "opposes",
        payload: {},
      }),
      edgeKind: "opposes",
      from: judgmentA.nodeId,
      to: evidenceB.nodeId,
      origin: "llm_reasoning",
      provenance: [],
      payload: {},
    });
    report.reasoningOverlay.edges.sort((left, right) =>
      left.edgeId.localeCompare(right.edgeId),
    );
    recomputeReportId(report);

    expect(() => validateReviewReport(report, graph))
      .toThrow(/m6d2_report_overlay_edge_cross_decision/);
  });

  it("rejects an overlay payload grounding violation with the frozen code", async () => {
    const { graph, report } = await goldenReport();
    const tampered = clone(report) as {
      reasoningOverlay: {
        nodes: {
          nodeKind: string;
          payload: { premiseRefs?: string[] };
        }[];
        edges: unknown[];
      };
    };
    const judgment = tampered.reasoningOverlay.nodes
      .find((node) => node.nodeKind === "CoachJudgment")!;
    judgment.payload.premiseRefs = [...judgment.payload.premiseRefs!, "nowhere"];
    expect(() => validateReviewReport(tampered, graph))
      .toThrow(/m6d2_report_grounding:dangling_ref/);
  });

  it("rejects a stale reportId (checked after grounding, so only the id is stale)", async () => {
    const { graph, report } = await goldenReport();
    const tampered = clone(report) as { reportId: string };
    tampered.reportId = "review-report:deadbeef";
    expect(() => validateReviewReport(tampered, graph))
      .toThrow(/m6d2_report_id_mismatch/);
  });
});
