import { createHash } from "node:crypto";
import {
  FACT_ENGINE_ADAPTER_VERSION,
  FACT_ENGINE_PROTOCOL_VERSION,
  LOCAL_MORTAL_ADAPTER_VERSION,
  MAHJONG_HELPER_COMMIT,
  NATIVE_STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION,
  managedLocalMortalEngineVersion,
  type CanonicalEventStream,
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
}) {
  return Object.freeze({
    async analyze(request: LocalMortalAnalysisInput): Promise<LocalMortalAnalysisResult> {
      const rules = await queryCanonicalLibriichiRules({
        stream: request.stream,
        identity: input.runtime.ruleIdentity,
        port: input.runtime,
      });
      const entries: MortalReportDecisionEntry[] = [];
      const all = [
        ...rules.decisions.map((decision) => ({ decision, surface: "self" as const })),
        ...rules.responseDecisions.map((decision) => ({ decision, surface: "response" as const })),
      ];
      for (const row of all) {
        const resolved = rules.rules.get(row.decision.decisionEventRef);
        if (resolved === undefined || resolved.request === null || resolved.response.status !== "ok") {
          continue;
        }
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
        const review = await runMortalFullGameReview({
          stream: request.stream,
          decisions: rules.decisions,
          responseDecisions: rules.responseDecisions,
          report,
          engine: factEngine,
          ...(input.now === undefined ? {} : { now: input.now }),
          libriichi: { identity: input.runtime.ruleIdentity, results: rules.rules },
        });
        if (review.status !== "coverage_ready") throw new Error(review.code);
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
            factorPipeline: "factor-pipeline/v1",
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
