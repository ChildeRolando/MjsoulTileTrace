import {
  CoachUsageHistorySchema,
  ReviewReportSchema,
  type CoachUsageHistory,
  type ReviewReport,
} from "@riichi-coach/contracts";

type CoachUsageHistoryReportRef = {
  reportRefId: string;
  recordId: string;
  report: ReviewReport;
}

type TokenCounter = {
  known: number;
  unknownRequests: number;
};

type UsageCounterName = "inputTokens" | "outputTokens" | "totalTokens" | "cachedInputTokens";

const TOKEN_COUNTER_NAMES: readonly UsageCounterName[] = [
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "cachedInputTokens",
];

function addSafeInteger(left: number, right: number, label: string): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum) || sum < 0) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
  return sum;
}

/** Stable comparison for schema-parsed JSON data. Object key order is not data. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertSafeReportArrayLengths(report: ReviewReport): void {
  const lengths: readonly [string, number][] = [
    ["selectedDecisionIds", report.selectedDecisionIds.length],
    ["decisionEntries", report.decisionEntries.length],
    ["reasoningOverlay.nodes", report.reasoningOverlay.nodes.length],
    ["reasoningOverlay.edges", report.reasoningOverlay.edges.length],
    ["diagnostics", report.diagnostics.length],
  ];
  for (const [label, length] of lengths) {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError(`${label} length exceeds the safe integer range`);
    }
  }
}

/**
 * Aggregates saved ReviewReport instances without consulting a provider or
 * deriving identities from package/report strings. Each reportRefId is one
 * request instance; explanation coverage is deduplicated by record and the
 * explicit decisionId carried by the report.
 */
export function aggregateCoachUsageHistory(
  input: readonly CoachUsageHistoryReportRef[],
): CoachUsageHistory {
  if (!Array.isArray(input)) {
    throw new TypeError("usage history input must be an array");
  }
  if (!Number.isSafeInteger(input.length) || input.length < 0) {
    throw new RangeError("usage history input length exceeds the safe integer range");
  }

  const reportsByRef = new Map<string, {
    recordId: string;
    report: ReviewReport;
    signature: string;
  }>();

  for (const item of input) {
    if (item === null || typeof item !== "object") {
      throw new TypeError("usage history entries must be objects");
    }
    assertIdentifier(item.reportRefId, "reportRefId");
    assertIdentifier(item.recordId, "recordId");
    const report = ReviewReportSchema.parse(item.report);
    assertSafeReportArrayLengths(report);
    const signature = canonicalJson({ recordId: item.recordId, report });
    const existing = reportsByRef.get(item.reportRefId);
    if (existing !== undefined) {
      if (existing.signature !== signature) {
        throw new Error(`Conflicting saved data for reportRefId ${item.reportRefId}`);
      }
      continue;
    }
    reportsByRef.set(item.reportRefId, {
      recordId: item.recordId,
      report,
      signature,
    });
  }

  let requestCount = 0;
  let readyDecisionCount = 0;
  let explainedRecordCount = 0;
  const counters: Record<UsageCounterName, TokenCounter> = {
    inputTokens: { known: 0, unknownRequests: 0 },
    outputTokens: { known: 0, unknownRequests: 0 },
    totalTokens: { known: 0, unknownRequests: 0 },
    cachedInputTokens: { known: 0, unknownRequests: 0 },
  };
  const readyDecisionIdsByRecord = new Map<string, Set<string>>();
  const explainedRecordIds = new Set<string>();

  for (const { recordId, report } of reportsByRef.values()) {
    requestCount = addSafeInteger(requestCount, 1, "requestCount");

    const usage = report.audit.usage;
    for (const name of TOKEN_COUNTER_NAMES) {
      const value = usage?.[name];
      if (value === undefined) {
        counters[name].unknownRequests = addSafeInteger(
          counters[name].unknownRequests,
          1,
          `${name}.unknownRequests`,
        );
      } else {
        counters[name].known = addSafeInteger(counters[name].known, value, `${name}.known`);
      }
    }

    const explanationDecisionIds = new Set<string>();
    for (const node of report.reasoningOverlay.nodes) {
      if (node.nodeKind !== "Explanation" || node.payload === null || typeof node.payload !== "object") {
        continue;
      }
      const decisionId = (node.payload as { decisionId?: unknown }).decisionId;
      if (typeof decisionId === "string") explanationDecisionIds.add(decisionId);
    }

    for (const entry of report.decisionEntries) {
      if (entry.explanationStatus !== "ready" || !explanationDecisionIds.has(entry.decisionId)) {
        continue;
      }
      let decisionIds = readyDecisionIdsByRecord.get(recordId);
      if (decisionIds === undefined) {
        decisionIds = new Set<string>();
        readyDecisionIdsByRecord.set(recordId, decisionIds);
      }
      if (decisionIds.has(entry.decisionId)) continue;

      decisionIds.add(entry.decisionId);
      readyDecisionCount = addSafeInteger(readyDecisionCount, 1, "readyDecisionCount");
      if (!explainedRecordIds.has(recordId)) {
        explainedRecordIds.add(recordId);
        explainedRecordCount = addSafeInteger(explainedRecordCount, 1, "explainedRecordCount");
      }
    }
  }

  return CoachUsageHistorySchema.parse({
    schemaVersion: "coach-usage-history/v1",
    requestCount,
    readyDecisionCount,
    explainedRecordCount,
    inputTokens: counters.inputTokens,
    outputTokens: counters.outputTokens,
    totalTokens: counters.totalTokens,
    cachedInputTokens: counters.cachedInputTokens,
  });
}
