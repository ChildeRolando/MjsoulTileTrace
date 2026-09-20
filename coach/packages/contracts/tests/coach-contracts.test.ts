/**
 * M6-D2 — coach contract tests (spec "Testing Decisions — contracts":
 * ReviewReport / reasoning payload / draft / provider DTO 接受最小合法样例；
 * 拒绝未知 status 值、payload 外字段、audit 外字段；provider DTO 与
 * descriptor 类型上不存在 key 材料字段；raw CoT / 完整 prompt / response /
 * key 材料在任何持久化产物中不可出现).
 */
import { describe, expect, it } from "vitest";
import {
  COACH_EXPLANATION_PLACEHOLDER_PATTERN,
  COACH_REASONING_DRAFT_SCHEMA_VERSION,
  COACH_REVIEW_PROMPT_VERSION,
  CoachDraftDecisionSchema,
  CoachEvidenceClaimSchema,
  CoachExplanationPayloadSchema,
  CoachGroundingCheckResultSchema,
  CoachGroundingDiagnosticSchema,
  CoachInferencePayloadSchema,
  CoachJudgmentPayloadSchema,
  GenerationStatusSchema,
  LlmCoachErrorCodeSchema,
  LlmCoachRequestSchema,
  LlmCoachResultSchema,
  LlmProviderDescriptorSchema,
  REASONING_GRAPH_NODE_KINDS,
  REASONING_PAYLOAD_SCHEMAS,
  REVIEW_REPORT_SCHEMA_VERSION,
  ReviewReportSchema,
  SELECTOR_POLICY_VERSION_V1,
  type LlmCoachProvider,
} from "../src/index.js";

const D1 = "decision:game:a:self0:self_turn:game:a/0/1/0";
const D2 = "decision:game:a:self0:self_turn:game:a/0/2/0";
const JUDGMENT_RECOMMENDATION = "action:v1:discard:5m";

function judgmentPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    judgmentId: "ctxg:CoachJudgment:test",
    localId: "j1",
    decisionId: D1,
    recommendation: JUDGMENT_RECOMMENDATION,
    confidence: "medium",
    premiseRefs: ["ctxg:FactorDifference:test"],
    ...overrides,
  };
}

function inferencePayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    inferenceId: "ctxg:CoachInference:test",
    localId: "i1",
    decisionId: D1,
    statement: "West looks tenpai-ish based on the discard flow",
    premiseRefs: ["ctxg:KnownGameFact:test"],
    ...overrides,
  };
}

function explanationPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    explanationId: "ctxg:Explanation:test",
    decisionId: D1,
    text: "Discarding 5m keeps {diff:fd:1.direction} over {candidate:action:v1:discard:5m.ukeire}.",
    claims: [
      { kind: "factor_difference", evidenceRef: "ctxg:FactorDifference:test" },
    ],
    ...overrides,
  };
}

function overlayNode(
  nodeKind: string,
  payload: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    nodeId: `ctxg:${nodeKind}:test`,
    nodeKind,
    partition: "reasoning",
    origin: "llm_reasoning",
    authority: "coach",
    producer: "coach-engine",
    producerVersion: "coach-engine/v1",
    payload,
    provenance: [],
    ...overrides,
  };
}

function overlayEdge(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    edgeId: "ctxg:edge:test-verbalizes",
    edgeKind: "verbalizes",
    from: "ctxg:Explanation:test",
    to: "ctxg:CoachJudgment:test",
    origin: "llm_reasoning",
    provenance: [],
    payload: {},
    ...overrides,
  };
}

function generationBlock(): Record<string, unknown> {
  return {
    providerId: "openai-compatible",
    model: "test-model",
    promptVersion: COACH_REVIEW_PROMPT_VERSION,
    draftSchemaVersion: COACH_REASONING_DRAFT_SCHEMA_VERSION,
    generatorVersion: "coach-engine/v1",
    validatorVersion: "coach-grounding/v1",
    reportSchemaVersion: REVIEW_REPORT_SCHEMA_VERSION,
  };
}

function minimalReport(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: REVIEW_REPORT_SCHEMA_VERSION,
    reportId: "review-report:sha256:test",
    packageId: "package:sha256:test",
    selectorPolicyVersion: SELECTOR_POLICY_VERSION_V1,
    selectedDecisionIds: [D1],
    generation: generationBlock(),
    generationStatus: "complete",
    decisionEntries: [{ decisionId: D1, explanationStatus: "ready" }],
    reasoningOverlay: {
      nodes: [
        overlayNode("CoachJudgment", judgmentPayload()),
        overlayNode("CoachInference", inferencePayload()),
        overlayNode("Explanation", explanationPayload()),
      ],
      edges: [
        overlayEdge(),
        overlayEdge({
          edgeId: "ctxg:edge:test-opposes",
          edgeKind: "opposes",
          from: "ctxg:CoachJudgment:test",
          to: "ctxg:FactorFact:test",
        }),
      ],
    },
    audit: {
      inputSliceHash: "sha256:slice",
      outputHash: "sha256:output",
      transportRetries: 0,
    },
    diagnostics: [],
    generatedAt: "2026-08-24T12:00:00.000Z",
    ...overrides,
  };
}

function evidenceOnlyReport(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return minimalReport({
    generationStatus: "evidence_only",
    decisionEntries: [
      { decisionId: D1, explanationStatus: "provider_unavailable" },
    ],
    reasoningOverlay: { nodes: [], edges: [] },
    audit: {
      inputSliceHash: "sha256:slice",
      outputHash: "sha256:none",
      transportRetries: 0,
    },
    ...overrides,
  });
}

describe("M6-D2 coach version literals", () => {
  it("freezes the spec schema / prompt version literals", () => {
    expect(REVIEW_REPORT_SCHEMA_VERSION).toBe("review-report/v1");
    expect(COACH_REASONING_DRAFT_SCHEMA_VERSION).toBe(
      "coach-reasoning-draft/v1",
    );
    expect(COACH_REVIEW_PROMPT_VERSION).toBe("coach-review-prompt/v1");
  });
});

describe("M6-D2 reasoning payload contracts", () => {
  it("accepts minimal legal payloads for all three reasoning kinds", () => {
    expect(() =>
      CoachInferencePayloadSchema.parse(inferencePayload()),
    ).not.toThrow();
    expect(() =>
      CoachJudgmentPayloadSchema.parse(judgmentPayload()),
    ).not.toThrow();
    expect(() =>
      CoachExplanationPayloadSchema.parse(explanationPayload()),
    ).not.toThrow();
  });

  it("rejects payload-external fields, including raw CoT fields (strict)", () => {
    expect(() =>
      CoachJudgmentPayloadSchema.parse(
        judgmentPayload({ reasoning: "I think that..." }),
      ),
    ).toThrow(/reasoning/);
    expect(() =>
      CoachInferencePayloadSchema.parse(
        inferencePayload({ chainOfThought: "step by step" }),
      ),
    ).toThrow(/chainOfThought/);
    expect(() =>
      CoachExplanationPayloadSchema.parse(
        explanationPayload({ modelNotes: "internal" }),
      ),
    ).toThrow(/modelNotes/);
  });

  it("rejects empty CoachJudgment premiseRefs (hard layer 3)", () => {
    expect(() =>
      CoachJudgmentPayloadSchema.parse(judgmentPayload({ premiseRefs: [] })),
    ).toThrow();
  });

  it("rejects unknown confidence values and claim kinds", () => {
    expect(() =>
      CoachJudgmentPayloadSchema.parse(
        judgmentPayload({ confidence: "certain" }),
      ),
    ).toThrow();
    expect(() =>
      CoachEvidenceClaimSchema.parse({
        kind: "defense",
        evidenceRef: "ctxg:FactorFact:test",
      }),
    ).toThrow();
  });

  it("maps REASONING_PAYLOAD_SCHEMAS onto exactly the reasoning kinds", () => {
    expect([...Object.keys(REASONING_PAYLOAD_SCHEMAS).sort()]).toEqual(
      [...REASONING_GRAPH_NODE_KINDS].sort(),
    );
  });

  it("freezes the evidence placeholder grammar", () => {
    expect(COACH_EXPLANATION_PLACEHOLDER_PATTERN.test("{diff:fd:1.direction}"))
      .toBe(true);
    expect(
      COACH_EXPLANATION_PLACEHOLDER_PATTERN.test(
        "{candidate:action:v1:discard:5m.ukeire}",
      ),
    ).toBe(true);
    expect(COACH_EXPLANATION_PLACEHOLDER_PATTERN.test("{diff:fd:1.leftValue}"))
      .toBe(true);
    expect(COACH_EXPLANATION_PLACEHOLDER_PATTERN.test("{diff:nodot}"))
      .toBe(false);
    expect(COACH_EXPLANATION_PLACEHOLDER_PATTERN.test("{unrelated:x.y}"))
      .toBe(false);
    expect(
      COACH_EXPLANATION_PLACEHOLDER_PATTERN.test("{diff:{nested}.y}"),
    ).toBe(false);
    expect(COACH_EXPLANATION_PLACEHOLDER_PATTERN.test("plain text")).toBe(
      false,
    );
  });
});

describe("M6-D2 coach reasoning draft contract", () => {
  const draftDecision = {
    decisionId: D1,
    judgment: {
      localId: "j1",
      recommendation: JUDGMENT_RECOMMENDATION,
      confidence: "medium",
      premiseRefs: ["ctxg:FactorDifference:test"],
    },
    inferences: [
      {
        localId: "i1",
        statement: "West looks tenpai-ish based on the discard flow",
        premiseRefs: ["ctxg:KnownGameFact:test"],
      },
    ],
    explanations: [
      {
        text: "Discarding 5m keeps {diff:fd:1.direction}.",
        claims: [
          {
            kind: "factor_difference",
            evidenceRef: "ctxg:FactorDifference:test",
          },
        ],
        judgmentLocalRef: "j1",
      },
    ],
  };

  it("accepts a minimal legal draft", () => {
    expect(() => CoachDraftDecisionSchema.parse(draftDecision)).not.toThrow();
  });

  it("rejects a draft that forges a nodeId (strict: no identity fields)", () => {
    expect(() =>
      CoachDraftDecisionSchema.parse({
        ...draftDecision,
        judgment: { ...draftDecision.judgment, nodeId: "ctxg:CoachJudgment:forged" },
      }),
    ).toThrow(/nodeId/);
  });

  it("rejects unknown confidence and empty premiseRefs on the draft judgment", () => {
    expect(() =>
      CoachDraftDecisionSchema.parse({
        ...draftDecision,
        judgment: { ...draftDecision.judgment, confidence: "high-ish" },
      }),
    ).toThrow();
    expect(() =>
      CoachDraftDecisionSchema.parse({
        ...draftDecision,
        judgment: { ...draftDecision.judgment, premiseRefs: [] },
      }),
    ).toThrow();
  });
});

describe("M6-D2 grounding diagnostic contracts", () => {
  it("accepts grounding_rejected and soft_finding diagnostics", () => {
    expect(() =>
      CoachGroundingDiagnosticSchema.parse({
        kind: "grounding_rejected",
        code: "cross_decision_ref",
        decisionId: D1,
        detail: "premise points into another decision subgraph",
      }),
    ).not.toThrow();
    expect(() =>
      CoachGroundingDiagnosticSchema.parse({
        kind: "soft_finding",
        code: "free_text_number",
        decisionId: D2,
      }),
    ).not.toThrow();
  });

  it("rejects unknown kinds, codes and diagnostic-external fields", () => {
    expect(() =>
      CoachGroundingDiagnosticSchema.parse({
        kind: "hard_rejection",
        code: "dangling_ref",
      }),
    ).toThrow();
    expect(() =>
      CoachGroundingDiagnosticSchema.parse({
        kind: "grounding_rejected",
        code: "hallucination",
      }),
    ).toThrow();
    expect(() =>
      CoachGroundingDiagnosticSchema.parse({
        kind: "soft_finding",
        code: "style",
        rawOutput: "...",
      }),
    ).toThrow(/rawOutput/);
  });

  it("accepts a grounding check result and rejects a stored pass flag", () => {
    expect(() =>
      CoachGroundingCheckResultSchema.parse({
        violations: [],
        softFindings: [
          { kind: "soft_finding", code: "duplicate", decisionId: D1 },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      CoachGroundingCheckResultSchema.parse({
        violations: [],
        softFindings: [],
        passed: true,
      }),
    ).toThrow();
  });
});

describe("M6-D2 LLM provider port DTOs", () => {
  it("descriptor carries identity only — no key material", () => {
    expect(() =>
      LlmProviderDescriptorSchema.parse({
        providerId: "openai-compatible",
        model: "test-model",
      }),
    ).not.toThrow();
    expect(() =>
      LlmProviderDescriptorSchema.parse({
        providerId: "openai-compatible",
        model: "test-model",
        apiKey: "sk-secret",
      }),
    ).toThrow(/apiKey/);
  });

  it("request freezes versions and temperature 0, and carries no key material", () => {
    expect(() =>
      LlmCoachRequestSchema.parse({
        promptVersion: COACH_REVIEW_PROMPT_VERSION,
        draftSchemaVersion: COACH_REASONING_DRAFT_SCHEMA_VERSION,
        prompt: "frozen template + slice canonical JSON",
        temperature: 0,
        maxOutputTokens: 4096,
      }),
    ).not.toThrow();
    expect(() =>
      LlmCoachRequestSchema.parse({
        promptVersion: COACH_REVIEW_PROMPT_VERSION,
        draftSchemaVersion: COACH_REASONING_DRAFT_SCHEMA_VERSION,
        prompt: "p",
        temperature: 0.7,
        maxOutputTokens: 4096,
      }),
    ).toThrow();
    expect(() =>
      LlmCoachRequestSchema.parse({
        promptVersion: "coach-review-prompt/v2",
        draftSchemaVersion: COACH_REASONING_DRAFT_SCHEMA_VERSION,
        prompt: "p",
        temperature: 0,
        maxOutputTokens: 4096,
      }),
    ).toThrow();
    expect(() =>
      LlmCoachRequestSchema.parse({
        promptVersion: COACH_REVIEW_PROMPT_VERSION,
        draftSchemaVersion: COACH_REASONING_DRAFT_SCHEMA_VERSION,
        prompt: "p",
        temperature: 0,
        maxOutputTokens: 4096,
        apiKey: "sk-secret",
      }),
    ).toThrow(/apiKey/);
  });

  it("result parses the success and failure variants; rejects unknown error codes and CoT fields", () => {
    expect(() =>
      LlmCoachResultSchema.parse({
        content: "{\"decisions\":[]}",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        transportRetries: 0,
      }),
    ).not.toThrow();
    for (const errorCode of LlmCoachErrorCodeSchema.options) {
      expect(() => LlmCoachResultSchema.parse({ errorCode, transportRetries: 0 })).not.toThrow();
    }
    expect(() => LlmCoachResultSchema.parse({ errorCode: "malformed" }))
      .toThrow();
    expect(() =>
      LlmCoachResultSchema.parse({
        content: "ok",
        transportRetries: 0,
        reasoningContent: "raw chain of thought",
      }),
    ).toThrow(/reasoningContent/);
  });

  it("LlmCoachProvider is implementable without any key material", () => {
    const provider: LlmCoachProvider = {
      descriptor: () => ({
        providerId: "openai-compatible",
        model: "test-model",
      }),
      complete: async () => ({ errorCode: "provider_unavailable", transportRetries: 0 }),
    };
    expect(LlmProviderDescriptorSchema.parse(provider.descriptor())).toEqual({
      providerId: "openai-compatible",
      model: "test-model",
    });
  });
});

describe("M6-D2 ReviewReport contract", () => {
  it("accepts a minimal complete report", () => {
    expect(() => ReviewReportSchema.parse(minimalReport())).not.toThrow();
  });

  it("accepts an evidence_only degrade report", () => {
    expect(() => ReviewReportSchema.parse(evidenceOnlyReport())).not.toThrow();
  });

  it("rejects a report claiming more than the provider's one automatic retry", () => {
    const report = minimalReport();
    expect(() => ReviewReportSchema.parse({
      ...report,
      audit: { ...(report.audit as Record<string, unknown>), transportRetries: 2 },
    })).toThrow();
  });

  it("accepts an empty-selection report (no request sent)", () => {
    expect(() =>
      ReviewReportSchema.parse(
        evidenceOnlyReport({
          selectedDecisionIds: [],
          decisionEntries: [],
        }),
      ),
    ).not.toThrow();
  });

  it("accepts a partial report (one ready row, one request_failed row)", () => {
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          selectedDecisionIds: [D1, D2],
          generationStatus: "partial",
          decisionEntries: [
            { decisionId: D1, explanationStatus: "ready" },
            { decisionId: D2, explanationStatus: "request_failed" },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("rejects unknown generation / explanation status values and a second schema version", () => {
    expect(() => GenerationStatusSchema.parse("failed")).toThrow();
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          decisionEntries: [
            { decisionId: D1, explanationStatus: "degraded" },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({ schemaVersion: "review-report/v2" }),
      ),
    ).toThrow();
  });

  it("rejects raw CoT and full prompt/response persistence (guard 3 / grill E2)", () => {
    expect(() =>
      ReviewReportSchema.parse(minimalReport({ chainOfThought: "..." })),
    ).toThrow(/chainOfThought/);
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          audit: {
            inputSliceHash: "sha256:slice",
            outputHash: "sha256:output",
            transportRetries: 0,
            prompt: "the full prompt",
          },
        }),
      ),
    ).toThrow(/prompt/);
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          audit: {
            inputSliceHash: "sha256:slice",
            outputHash: "sha256:output",
            transportRetries: 0,
            response: "the full model response",
          },
        }),
      ),
    ).toThrow(/response/);
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          generation: { ...generationBlock(), rawResponse: "..." },
        }),
      ),
    ).toThrow(/rawResponse/);
  });

  it("rejects a non-datetime generatedAt", () => {
    expect(() =>
      ReviewReportSchema.parse(minimalReport({ generatedAt: "today" })),
    ).toThrow();
  });

  it("rejects row/selection mismatches: missing, extra and duplicate rows", () => {
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          selectedDecisionIds: [D1, D2],
          decisionEntries: [{ decisionId: D1, explanationStatus: "ready" }],
        }),
      ),
    ).toThrow(/Missing decision entry/);
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          generationStatus: "partial",
          decisionEntries: [
            { decisionId: D1, explanationStatus: "ready" },
            { decisionId: D2, explanationStatus: "not_selected" },
          ],
        }),
      ),
    ).toThrow(/outside selectedDecisionIds/);
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          generationStatus: "partial",
          decisionEntries: [
            { decisionId: D1, explanationStatus: "ready" },
            { decisionId: D1, explanationStatus: "request_failed" },
          ],
        }),
      ),
    ).toThrow(/Duplicate decision entry/);
  });

  it("rejects generationStatus inconsistent with the row statuses", () => {
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({ generationStatus: "partial" }),
      ),
    ).toThrow(/generationStatus/);
    expect(() =>
      ReviewReportSchema.parse(
        evidenceOnlyReport({ generationStatus: "complete" }),
      ),
    ).toThrow(/generationStatus/);
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          selectedDecisionIds: [D1, D2],
          decisionEntries: [
            { decisionId: D1, explanationStatus: "ready" },
            { decisionId: D2, explanationStatus: "request_failed" },
          ],
        }),
      ),
    ).toThrow(/generationStatus/);
  });

  it("rejects a ready row without a CoachJudgment in the overlay (hard layer 8)", () => {
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          reasoningOverlay: {
            nodes: [
              overlayNode("CoachInference", inferencePayload()),
              overlayNode("Explanation", explanationPayload()),
            ],
            edges: [],
          },
        }),
      ),
    ).toThrow(/CoachJudgment/);
  });

  it("rejects judgments and explanations for non-ready rows (grill E9 cascade)", () => {
    expect(() =>
      ReviewReportSchema.parse(
        evidenceOnlyReport({
          reasoningOverlay: {
            nodes: [overlayNode("CoachJudgment", judgmentPayload())],
            edges: [],
          },
        }),
      ),
    ).toThrow(/ready/);
    expect(() =>
      ReviewReportSchema.parse(
        evidenceOnlyReport({
          reasoningOverlay: {
            nodes: [overlayNode("Explanation", explanationPayload())],
            edges: [],
          },
        }),
      ),
    ).toThrow(/cascade/);
  });

  it("rejects reasoning payloads whose decisionId is outside the selection", () => {
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          reasoningOverlay: {
            nodes: [
              overlayNode("CoachJudgment", judgmentPayload()),
              overlayNode(
                "CoachInference",
                inferencePayload({ decisionId: D2 }),
              ),
            ],
            edges: [],
          },
        }),
      ),
    ).toThrow(/outside selectedDecisionIds/);
  });

  it("rejects non-reasoning nodes and wrong partition values in the overlay", () => {
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          reasoningOverlay: {
            nodes: [
              overlayNode("CoachJudgment", judgmentPayload()),
              overlayNode(
                "Decision",
                { decisionId: D1 },
                { partition: "evidence", origin: "package_projection" },
              ),
            ],
            edges: [],
          },
        }),
      ),
    ).toThrow(/not a reasoning-overlay kind/);
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          reasoningOverlay: {
            nodes: [
              overlayNode("CoachJudgment", judgmentPayload(), {
                partition: "evidence",
              }),
            ],
            edges: [],
          },
        }),
      ),
    ).toThrow(/partition/);
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          reasoningOverlay: {
            nodes: [
              overlayNode("CoachJudgment", judgmentPayload(), {
                origin: "user_assertion",
              }),
            ],
            edges: [],
          },
        }),
      ),
    ).toThrow(/origin/);
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          reasoningOverlay: {
            nodes: [
              overlayNode("CoachJudgment", judgmentPayload(), {
                authority: "advisory",
              }),
            ],
            edges: [],
          },
        }),
      ),
    ).toThrow(/authority/);
  });

  it("rejects projection edge kinds in the overlay", () => {
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          reasoningOverlay: {
            nodes: [overlayNode("CoachJudgment", judgmentPayload())],
            edges: [overlayEdge({ edgeKind: "contains" })],
          },
        }),
      ),
    ).toThrow(/not a reasoning-overlay kind/);
  });

  it("rejects a CoachJudgment node whose payload does not match its kind schema", () => {
    expect(() =>
      ReviewReportSchema.parse(
        minimalReport({
          reasoningOverlay: {
            nodes: [overlayNode("CoachJudgment", explanationPayload())],
            edges: [],
          },
        }),
      ),
    ).toThrow(/CoachJudgment schema/);
  });
});
