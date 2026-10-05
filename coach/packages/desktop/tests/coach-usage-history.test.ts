import { describe, expect, it } from "vitest";
import {
  ReviewReportSchema,
  type ReviewReport,
} from "@riichi-coach/contracts";
import { aggregateCoachUsageHistory } from "../src/coach-usage-history.js";

type EntryInput = {
  decisionId: string;
  status: "ready" | "request_failed" | "invalid_output" | "provider_unavailable";
};

function reasoningNode(
  nodeKind: "CoachJudgment" | "Explanation",
  decisionId: string,
): ReviewReport["reasoningOverlay"]["nodes"][number] {
  const nodeId = `${nodeKind}:${decisionId}`;
  const common = {
    nodeId,
    nodeKind,
    partition: "reasoning" as const,
    origin: "llm_reasoning" as const,
    authority: "coach" as const,
    producer: "fixture",
    producerVersion: "v1",
    provenance: [],
  };
  if (nodeKind === "Explanation") {
    return {
      ...common,
      nodeKind,
      payload: { explanationId: nodeId, decisionId, text: "解说", claims: [] },
    };
  }
  return {
    ...common,
    nodeKind,
    payload: {
      judgmentId: nodeId,
      localId: `local-${decisionId}`,
      decisionId,
      recommendation: `action:${decisionId}`,
      confidence: "medium",
      premiseRefs: ["premise"],
    },
  };
}

function makeReport(options: {
  reportId?: string;
  packageId?: string;
  providerId?: string;
  entries?: readonly EntryInput[];
  explanationDecisionIds?: readonly string[];
  usage?: ReviewReport["audit"]["usage"];
} = {}): ReviewReport {
  const entries = options.entries ?? [];
  const readyEntries = entries.filter((entry) => entry.status === "ready");
  const generationStatus = readyEntries.length === 0
    ? "evidence_only"
    : readyEntries.length === entries.length
      ? "complete"
      : "partial";
  const explanationDecisionIds = new Set(options.explanationDecisionIds ?? readyEntries.map((entry) => entry.decisionId));
  const nodes = entries.flatMap((entry) => entry.status === "ready"
    ? [
      reasoningNode("CoachJudgment", entry.decisionId),
      ...(explanationDecisionIds.has(entry.decisionId)
        ? [reasoningNode("Explanation", entry.decisionId)]
        : []),
    ]
    : []);

  return ReviewReportSchema.parse({
    schemaVersion: "review-report/v1",
    reportId: options.reportId ?? "review-report:fixture",
    packageId: options.packageId ?? "package:fixture",
    selectorPolicyVersion: "deterministic-review-selector/v1",
    selectedDecisionIds: entries.map((entry) => entry.decisionId),
    generation: {
      providerId: options.providerId ?? "provider:fixture",
      model: "model:fixture",
      promptVersion: "coach-review-prompt/v2",
      draftSchemaVersion: "coach-reasoning-draft/v1",
      generatorVersion: "generator:v1",
      validatorVersion: "validator:v1",
      reportSchemaVersion: "review-report/v1",
    },
    generationStatus,
    decisionEntries: entries.map(({ decisionId, status }) => ({
      decisionId,
      explanationStatus: status,
    })),
    reasoningOverlay: { nodes, edges: [] },
    audit: {
      inputSliceHash: "sha256:input",
      outputHash: "sha256:output",
      transportRetries: 0,
      ...(options.usage === undefined ? {} : { usage: options.usage }),
    },
    diagnostics: [],
    generatedAt: "2026-10-06T00:00:00.000Z",
  });
}

function saved(
  reportRefId: string,
  recordId: string,
  report: ReviewReport,
) {
  return { reportRefId, recordId, report };
}

describe("aggregateCoachUsageHistory", () => {
  it("counts each saved request once and distinguishes reported zero from unknown per counter", () => {
    const failedWithZero = makeReport({
      providerId: "provider:one",
      entries: [{ decisionId: "decision-a", status: "request_failed" }],
      usage: { inputTokens: 0, cachedInputTokens: 0 },
    });
    const invalidWithPartialUsage = makeReport({
      providerId: "provider:two",
      entries: [{ decisionId: "decision-b", status: "invalid_output" }],
      usage: { outputTokens: 7, totalTokens: 9 },
    });

    expect(aggregateCoachUsageHistory([
      saved("ref-one", "record-one", failedWithZero),
      saved("ref-one", "record-one", structuredClone(failedWithZero)),
      saved("ref-two", "record-two", invalidWithPartialUsage),
    ])).toEqual({
      schemaVersion: "coach-usage-history/v1",
      requestCount: 2,
      readyDecisionCount: 0,
      explainedRecordCount: 0,
      inputTokens: { known: 0, unknownRequests: 1 },
      outputTokens: { known: 7, unknownRequests: 1 },
      totalTokens: { known: 9, unknownRequests: 1 },
      cachedInputTokens: { known: 0, unknownRequests: 1 },
    });
  });

  it("deduplicates explained decisions by record and explicit decisionId across reports and packages", () => {
    const first = makeReport({
      packageId: "package:first",
      entries: [
        { decisionId: "decision-a", status: "ready" },
        { decisionId: "decision-b", status: "ready" },
      ],
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, cachedInputTokens: 1 },
    });
    const second = makeReport({
      reportId: "review-report:second",
      packageId: "package:first",
      entries: [
        { decisionId: "decision-b", status: "ready" },
        { decisionId: "decision-c", status: "ready" },
      ],
      usage: { inputTokens: 3, outputTokens: 1, totalTokens: 4, cachedInputTokens: 0 },
    });
    const reanalysis = makeReport({
      reportId: "review-report:reanalysis",
      packageId: "package:second",
      entries: [{ decisionId: "decision-a", status: "ready" }],
      usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3, cachedInputTokens: 1 },
    });
    const otherRecordSameDecision = makeReport({
      reportId: "review-report:other-record",
      entries: [{ decisionId: "decision-a", status: "ready" }],
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cachedInputTokens: 0 },
    });

    expect(aggregateCoachUsageHistory([
      saved("ref-first", "record-one", first),
      saved("ref-second", "record-one", second),
      saved("ref-reanalysis", "record-one", reanalysis),
      saved("ref-other-record", "record-two", otherRecordSameDecision),
    ])).toEqual({
      schemaVersion: "coach-usage-history/v1",
      requestCount: 4,
      readyDecisionCount: 4,
      explainedRecordCount: 2,
      inputTokens: { known: 10, unknownRequests: 0 },
      outputTokens: { known: 5, unknownRequests: 0 },
      totalTokens: { known: 15, unknownRequests: 0 },
      cachedInputTokens: { known: 2, unknownRequests: 0 },
    });
  });

  it("counts repeated reportId instances by ref and does not count ready rows without a bound Explanation", () => {
    const sameContent = makeReport({
      reportId: "review-report:reused",
      entries: [{ decisionId: "decision-a", status: "ready" }],
      explanationDecisionIds: [],
      usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7, cachedInputTokens: 1 },
    });

    const result = aggregateCoachUsageHistory([
      saved("ref-first", "record-one", sameContent),
      saved("ref-second", "record-one", structuredClone(sameContent)),
    ]);
    expect(result.requestCount).toBe(2);
    expect(result.inputTokens).toEqual({ known: 10, unknownRequests: 0 });
    expect(result.readyDecisionCount).toBe(0);
    expect(result.explainedRecordCount).toBe(0);
  });

  it("rejects different data or record identity under the same reportRefId", () => {
    const report = makeReport({ usage: { inputTokens: 3 } });
    expect(() => aggregateCoachUsageHistory([
      saved("same-ref", "record-one", report),
      saved("same-ref", "record-one", { ...report, audit: { ...report.audit, usage: { inputTokens: 4 } } }),
    ])).toThrow(/Conflicting saved data/);
    expect(() => aggregateCoachUsageHistory([
      saved("same-ref", "record-one", report),
      saved("same-ref", "record-two", report),
    ])).toThrow(/Conflicting saved data/);
  });

  it("rejects empty report and record identities", () => {
    const report = makeReport();
    expect(() => aggregateCoachUsageHistory([saved("", "record-one", report)])).toThrow(/reportRefId/);
    expect(() => aggregateCoachUsageHistory([saved("ref-one", "", report)])).toThrow(/recordId/);
  });

  it("rejects invalid reports and token sums above the safe integer limit", () => {
    const valid = makeReport({ usage: { inputTokens: Number.MAX_SAFE_INTEGER } });
    expect(() => aggregateCoachUsageHistory([
      saved("ref-valid", "record-one", valid),
      saved("ref-overflow", "record-two", makeReport({ usage: { inputTokens: 1 } })),
    ])).toThrow(/safe integer range/);

    const invalid = {
      ...makeReport(),
      audit: { ...makeReport().audit, usage: { inputTokens: -1 } },
    } as unknown as ReviewReport;
    expect(() => aggregateCoachUsageHistory([saved("ref-invalid", "record-one", invalid)]))
      .toThrow();
  });

  it("leaves the caller's saved reports unchanged", () => {
    const source = makeReport({
      entries: [{ decisionId: "decision-a", status: "ready" }],
      usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
    });
    const input = [saved("ref-one", "record-one", source)];
    const before = structuredClone(input);

    aggregateCoachUsageHistory(input);

    expect(input).toEqual(before);
  });
});
