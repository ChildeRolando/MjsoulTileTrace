import { createHash } from "node:crypto";
import {
  FACT_ENGINE_ADAPTER_VERSION,
  FACT_ENGINE_PROTOCOL_VERSION,
  LOCAL_MORTAL_ADAPTER_VERSION,
  MAHJONG_HELPER_COMMIT,
  NATIVE_STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,
  managedLocalMortalEngineVersion,
  type CanonicalEventStream,
  type LibriichiRuleRequest,
  type LibriichiRuleResponse,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import {
  buildStructuredAnalysisPackage,
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
  localMortalRuleScoresToReportEntry,
  projectLocalMortalRuleScoring,
  queryCanonicalLibriichiRules,
  runMortalFullGameReview,
  validateStructuredAnalysisPackage,
  type LibriichiResolvedDecision,
  type ReplayedDecision,
} from "@riichi-coach/reasoning";
import { computeCanonicalGameFingerprint, type MortalReportDecisionEntry, type MortalReportKyoku } from "@riichi-coach/mortal-source";
import type { ManagedMortalRuntime } from "@riichi-coach/mortal-runtime";

/**
 * Main-process-only production composition for a captured canonical record.
 * The service consumes canonical/replay data and the managed runtime; it does
 * not know how Mahjong Soul bytes were captured and it never crosses IPC.
 */
export type LocalMortalAnalysisInput = Readonly<{
  readonly recordId: string;
  readonly selfActor: number;
  readonly stream: CanonicalEventStream;
  readonly decisions: readonly ReplayedDecision[];
}>;

export type LocalMortalAnalysisResult = Readonly<{
  readonly package: StructuredAnalysisPackage;
  readonly canonicalEventCount: number;
  readonly replayDecisionCount: number;
}>;

type UsableLibriichiResolvedDecision = Extract<
  LibriichiResolvedDecision,
  { readonly request: LibriichiRuleRequest }
> & {
  readonly response: Exclude<LibriichiRuleResponse, { readonly status: "error" }>;
};

type LocalMortalCoverageReadyReview = Extract<
  Awaited<ReturnType<typeof runMortalFullGameReview>>,
  { readonly status: "coverage_ready" }
>;

/**
 * A rules census may contain a legal response non-action, but it may not
 * silently turn a missing/error boundary into a degraded package. Keep this
 * guard at the production analysis owner so every caller gets the same
 * fail-closed handoff to the import service's safe analysis_failed path.
 */
export function assertUsableLocalMortalRuleResult(
  resolved: LibriichiResolvedDecision | undefined,
): asserts resolved is UsableLibriichiResolvedDecision {
  if (resolved === undefined) throw new Error("rules_result_missing");
  if (resolved.request === null) {
    if (resolved.response.status === "error") throw new Error(resolved.response.code);
    throw new Error("rules_result_missing");
  }
  if (resolved.response.status === "error") {
    throw new Error(resolved.response.code);
  }
}

/**
 * `coverage_ready` describes a complete diagnostic census, not necessarily a
 * usable production package. The whole-game review intentionally retains
 * faithful rows for diagnostics; the local production seam rejects execution
 * failures and source-binding faults. Legal non-action/singleton rows and
 * truthful degraded analysis remain valid when no integrity failure exists.
 */
function assertProductionAnalysisUsable(
  review: LocalMortalCoverageReadyReview,
): void {
  for (const reason of ["fact_engine_failure", "structured_analysis_assembly_failure"] as const) {
    if ((review.summary.analysisBlockedReasons[reason] ?? 0) > 0) {
      throw new Error(reason);
    }
  }

  // A complete diagnostic census can still carry source-side binding faults.
  // Ambiguous rows, unsupported source semantics, identity mismatches, and
  // response rows without a replayed window cannot authorize production
  // review. A local terminal row that is explicitly not replayed remains a
  // truthful degraded-evidence case.
  if (
    review.summary.binding.ambiguous > 0
    || review.sourceCoverage.ambiguousMortalEntryCount > 0
    || review.sourceCoverage.responseAmbiguousEntryCount > 0
    || review.sourceCoverage.responseUnboundEntryCount > 0
    || review.sourceCoverage.entries.some((entry) =>
      entry.disposition === "unbound"
      && entry.unboundReason !== "local_terminal_action_not_replayed"
    )
  ) {
    throw new Error("mortal_source_binding_invalid");
  }
}

function reportId(stream: CanonicalEventStream, selfActor: number): string {
  return `managed-local-mortal:${createHash("sha256")
    .update(`${stream.gameId}#${selfActor}`, "utf8")
    .digest("hex")}`;
}

function reportKyokuKey(entry: MortalReportDecisionEntry): string {
  return [entry.roundOrdinal, entry.roundWind, entry.dealer, entry.kyoku, entry.honba].join(":");
}

function buildReport(input: {
  readonly stream: CanonicalEventStream;
  readonly selfActor: number;
  readonly runtime: ManagedMortalRuntime;
  readonly entries: readonly MortalReportDecisionEntry[];
}) {
  const groups = new Map<string, {
    roundOrdinal: number;
    roundWind: "E" | "S" | "W";
    dealer: number;
    kyoku: number;
    honba: number;
    entries: MortalReportDecisionEntry[];
  }>();
  const eventOrder = new Map(input.stream.events.map((event, index) => [event.eventId, index]));
  const ordered = [...input.entries].sort((left, right) => {
    const leftRef = left.localDecisionIdentity?.triggerEventRef ?? "";
    const rightRef = right.localDecisionIdentity?.triggerEventRef ?? "";
    return (eventOrder.get(leftRef) ?? Number.MAX_SAFE_INTEGER)
      - (eventOrder.get(rightRef) ?? Number.MAX_SAFE_INTEGER);
  });
  for (const entry of ordered) {
    const key = reportKyokuKey(entry);
    const current = groups.get(key) ?? {
      roundOrdinal: entry.roundOrdinal,
      roundWind: entry.roundWind,
      dealer: entry.dealer,
      kyoku: entry.kyoku,
      honba: entry.honba,
      entries: [],
    };
    current.entries.push(entry);
    groups.set(key, current);
  }
  const kyokus: MortalReportKyoku[] = [...groups.values()].map((group) => ({
    ...group,
    entries: Object.freeze([...group.entries]),
  }));
  const identity = input.runtime.identity;
  return {
    reportId: reportId(input.stream, input.selfActor),
    adapterVersion: LOCAL_MORTAL_ADAPTER_VERSION,
    engine: "Mortal" as const,
    version: managedLocalMortalEngineVersion(identity),
    modelTag: identity.checkpointModelTag,
    playerId: input.selfActor,
    gameFingerprint: computeCanonicalGameFingerprint(input.stream),
    kyokus: Object.freeze(kyokus),
  };
}

export function createLocalMortalAnalysisService(input: {
  readonly runtime: ManagedMortalRuntime;
  readonly factEngineResourcesDir: string;
  readonly now?: () => number;
  readonly onProgress?: (progress: import("./catalog-api.js").RecordAnalysisProgress) => void;
}) {
  return Object.freeze({
    async analyze(request: LocalMortalAnalysisInput): Promise<LocalMortalAnalysisResult> {
      input.onProgress?.({ stage: "rules", completed: 0, total: null });
      const rules = await queryCanonicalLibriichiRules({
        stream: request.stream,
        identity: input.runtime.ruleIdentity,
        port: input.runtime,
        onProgress: counts => input.onProgress?.({ stage: "rules", ...counts }),
      });
      const entries: MortalReportDecisionEntry[] = [];
      const all = [
        ...rules.decisions.map((decision) => ({ decision, surface: "self" as const })),
        ...rules.responseDecisions.map((decision) => ({ decision, surface: "response" as const })),
      ];
      const scoringTotal = all.filter(row => {
        const resolved = rules.rules.get(row.decision.decisionEventRef);
        return resolved?.response.status === "ok" && resolved.actions.length >= 2;
      }).length;
      input.onProgress?.({ stage: "scoring", completed: 0, total: scoringTotal });
      for (const row of all) {
        const resolved = rules.rules.get(row.decision.decisionEventRef);
        // A legal native non-action is only valid on a response window. Every
        // other missing/error result is an analysis/runtime failure: the
        // importer must fail closed instead of allowing a partial rules census
        // to become a persisted degraded package.
        assertUsableLocalMortalRuleResult(resolved);
        if (resolved.response.status === "non_action") continue;
        // A one-action boundary is accounted for by the existing native-rule
        // proof and does not need model scores or a synthetic report row.
        if (resolved.actions.length < 2) continue;
        const scoringRequest = projectLocalMortalRuleScoring({
          stream: request.stream,
          decision: row.decision,
          identity: input.runtime.identity,
          ruleRequest: resolved.request,
          ruleResult: resolved.response,
        });
        const scoringResponse = await input.runtime.scoreRules(scoringRequest);
        if (scoringResponse.status !== "ok") throw new Error(scoringResponse.code);
        entries.push(localMortalRuleScoresToReportEntry({
          request: scoringRequest,
          response: scoringResponse,
          decision: row.decision,
        }));
        input.onProgress?.({ stage: "scoring", completed: entries.length, total: scoringTotal });
      }
      if (entries.length === 0) throw new Error("mortal_output_incomplete");

      const report = buildReport({
        stream: request.stream,
        selfActor: request.selfActor,
        runtime: input.runtime,
        entries,
      });
      const factEngine = new JsonlFactEngineClient(
        new ManagedFactEngineTransport(input.factEngineResourcesDir),
      );
      try {
        input.onProgress?.({ stage: "facts", completed: 0, total: all.length });
        const review = await runMortalFullGameReview({
          stream: request.stream,
          decisions: rules.decisions,
          responseDecisions: rules.responseDecisions,
          report,
          engine: factEngine,
          onProgress: counts => input.onProgress?.({ stage: "facts", ...counts }),
          ...(input.now === undefined ? {} : { now: input.now }),
          libriichi: { identity: input.runtime.ruleIdentity, results: rules.rules },
        });
        if (review.status !== "coverage_ready") throw new Error(review.code);
        assertProductionAnalysisUsable(review);
        input.onProgress?.({ stage: "packaging", completed: 0, total: null });
        const retained = review.retainedAnalyses[0];
        if (retained === undefined) throw new Error("mortal_output_incomplete");
        const pkg = buildStructuredAnalysisPackage({
          review,
          stream: request.stream,
          decisions: rules.decisions,
          responseDecisions: rules.responseDecisions,
          componentVersions: {
            packageSchema: NATIVE_STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,
            legalActionRules: input.runtime.ruleIdentity,
            canonicalReplay: "canonical-riichi-events/v2",
            mapperAdapter: request.stream.mapperVersion,
            factEngine: {
              engine: "mahjong-helper",
              upstreamCommit: MAHJONG_HELPER_COMMIT,
              adapterVersion: FACT_ENGINE_ADAPTER_VERSION,
              protocolVersion: FACT_ENGINE_PROTOCOL_VERSION,
            },
            factorPipeline: "factor-pipeline/v3",
            mortalSourceModel: {
              identity: "Mortal",
              version: LOCAL_MORTAL_ADAPTER_VERSION,
              modelTag: input.runtime.identity.checkpointModelTag,
              evidenceSource: { kind: "managed_local_runtime", identity: input.runtime.identity },
            },
          },
          frozenPolicySnapshot: retained.modelEvaluation.detailPolicy,
          ...(input.now === undefined ? {} : { now: input.now }),
        });
        validateStructuredAnalysisPackage(pkg);
        // Reuse the package builder/validator's authoritative aggregate
        // integrity status. Diagnostic packages with this truthful status
        // remain valid artifacts; they simply cannot cross the production
        // import/save boundary.
        if (pkg.record.status === "integrity_failed") {
          throw new Error("analysis_integrity_failed");
        }
        return Object.freeze({
          package: pkg,
          canonicalEventCount: request.stream.events.length,
          replayDecisionCount: request.decisions.length,
        });
      } finally {
        await factEngine.close();
      }
    },
  });
}
