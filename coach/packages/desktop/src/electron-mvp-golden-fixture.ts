// Test-only main adapter for the Electron Golden Slice. Never load outside the
// explicit --mvp-golden-child runner. All source bytes come from a sanitized
// real record and pass through the production mapper/replay and package chain.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { libriichiRuleCanonicalJson, LibriichiRuleResponseSchema, AnalyzableRecordSummarySchema, type LibriichiRuleRequest, type LibriichiRuleResponse } from "@riichi-coach/contracts";
import { mapMahjongSoulRecord, unwrapGameDetailRecords, encodeMahjongSoulPerspectiveAccountId, type MahjongSoulRecordRuleEvidence, type MahjongSoulProtocolBundle } from "@riichi-coach/mahjong-soul-source";
import { replayCanonicalStream, projectContextGraph, type ReplayedDecision } from "@riichi-coach/reasoning";
import type { StructuredAnalysisPackage, ReviewSelectionResult } from "@riichi-coach/contracts";
import type { ManagedMortalRuntime } from "@riichi-coach/mortal-runtime";
import { createRecordAnalysisStore } from "./record-analysis-store.js";

const fixtureDigest = (value: unknown): string =>
  createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");

const localAnalysisRuntimeIdentity = {
  runtimeImplementation: "Equim-chan/Mortal" as const,
  runtimeRevision: "0".repeat(40),
  runtimeVersion: "Mortal V4" as const,
  runtimeArtifactSha256: "1".repeat(64),
  runtimeModelSha256: "2".repeat(64),
  runtimeEngineSha256: "3".repeat(64),
  checkpointRepository: "Yuchen1457/mortal-582500" as const,
  checkpointRevision: "4".repeat(40),
  checkpointModelTag: "mortal-hpc@582500" as const,
  checkpointFileSha256: "5".repeat(64),
  protocolVersion: "riichi-local-mortal-jsonl/v1" as const,
  adapterVersion: "local-mortal-adapter/v1" as const,
  nativeArtifactSha256: "6".repeat(64),
};

type CompleteRecordFixture = Readonly<{
  readonly recordId: string;
  readonly wire: string;
  readonly ruleEvidence: MahjongSoulRecordRuleEvidence;
}>;

function loadCompleteRecordFixture(): CompleteRecordFixture {
  return JSON.parse(readFileSync(new URL(
    "../tests/fixtures/real-record-complete.json",
    import.meta.url,
  ), "utf8")) as CompleteRecordFixture;
}

/**
 * Keep the production import regression small while using the public,
 * sanitized record mapper and a real multi-decision canonical prefix. The
 * prefix ends immediately after the third self discard, so every test still
 * exercises the same capture -> map -> replay path without shipping another
 * record or model asset.
 */
function createRealPrefixAnalysisStore(
  bundle: MahjongSoulProtocolBundle,
  fixture: CompleteRecordFixture,
) {
  return createRecordAnalysisStore({
    mapRecord: (input) => {
      const mapped = mapMahjongSoulRecord({
        ...input,
        bundle,
        ruleEvidence: fixture.ruleEvidence,
      });
      if (mapped.status !== "ready") return mapped;
      const allDecisions = replayCanonicalStream(mapped.stream);
      const thirdDecision = allDecisions[2];
      if (thirdDecision === undefined) throw new Error("fixture_prefix_missing_decision");
      const triggerIndex = mapped.stream.events.findIndex(
        (event) => event.eventId === thirdDecision.decisionEventRef,
      );
      if (triggerIndex < 0) throw new Error("fixture_prefix_missing_trigger");
      return {
        ...mapped,
        stream: {
          ...mapped.stream,
          events: mapped.stream.events.slice(0, triggerIndex + 2),
        },
      };
    },
    replay: replayCanonicalStream,
  });
}

type FrozenRuleQuery = Readonly<{
  decisionId: string;
  surface: "self" | "response";
  request: Omit<LibriichiRuleRequest, "requestId" | "identity">;
  response: FrozenRuleResponse;
}>;
type FrozenRuleResponse = LibriichiRuleResponse extends infer T
  ? T extends LibriichiRuleResponse ? Omit<T, "requestId" | "identity" | "resultId"> : never
  : never;

function loadFrozenNativeRules(): readonly FrozenRuleQuery[] {
  const data = JSON.parse(readFileSync(new URL(
    "../tests/fixtures/native-rule-responses-actor3.json", import.meta.url,
  ), "utf8")) as { provenance: { selfActor: number; eventCount: number }; queries: FrozenRuleQuery[] };
  if (data.provenance.selfActor !== 3 || data.provenance.eventCount !== 26 || data.queries.length !== 12) {
    throw new Error("golden_native_rule_fixture_scope_mismatch");
  }
  const selfCounts = data.queries.filter((query) => query.surface === "self")
    .map((query) => query.response.status === "ok" ? query.response.actions.length : 0);
  const responseStatuses = data.queries.filter((query) => query.surface === "response")
    .map((query) => query.response.status);
  if (libriichiRuleCanonicalJson(selfCounts) !== libriichiRuleCanonicalJson([13, 13, 12]) ||
      responseStatuses.filter((status) => status === "ok").length !== 1 ||
      responseStatuses.filter((status) => status === "non_action").length !== 8) {
    throw new Error("golden_native_rule_fixture_actions_mismatch");
  }
  return data.queries;
}

type FixtureRuntimeHarness = Readonly<{
  readonly runtime: ManagedMortalRuntime;
  readonly stats: {
    queryCalls: number;
    scoreCalls: number;
    failNextRule(): void;
  };
}>;

function createFixtureLocalMortalRuntime(
  decisions: readonly ReplayedDecision[],
): FixtureRuntimeHarness {
  const ruleIdentity = {
    implementation: "Equim-chan/Mortal/libriichi" as const,
    revision: localAnalysisRuntimeIdentity.runtimeRevision,
    nativeArtifactSha256: localAnalysisRuntimeIdentity.nativeArtifactSha256,
    wrapperSha256: localAnalysisRuntimeIdentity.runtimeArtifactSha256,
    normalizationVersion: "libriichi-actions/v2" as const,
  };
  const frozenQueries = loadFrozenNativeRules();
  const queryByDecisionId = new Map(frozenQueries.map((query) => [query.decisionId, query]));
  if (queryByDecisionId.size !== frozenQueries.length ||
      decisions.some((decision) => !queryByDecisionId.has(decision.decisionEventRef))) {
    throw new Error("golden_native_rule_fixture_decision_mismatch");
  }
  let failNextRule = false;
  let injectedRuleFailure = false;
  const stats = {
    queryCalls: 0,
    scoreCalls: 0,
    failNextRule: () => { failNextRule = true; },
  };
  const runtime = {
    identity: localAnalysisRuntimeIdentity,
    ruleIdentity,
    queryRules: async (request: LibriichiRuleRequest): Promise<LibriichiRuleResponse> => {
      stats.queryCalls += 1;
      if (failNextRule) {
        failNextRule = false;
        injectedRuleFailure = true;
        throw new Error("injected_rule_runtime_failure");
      }
      const query = queryByDecisionId.get(request.decision.decisionId);
      if (query === undefined || query.surface !== request.decision.surface) {
        throw new Error("golden_native_rule_fixture_unknown_decision");
      }
      const { requestId: _requestId, identity: _identity, ...boundRequest } = request;
      if (libriichiRuleCanonicalJson(boundRequest) !== libriichiRuleCanonicalJson(query.request)) {
        throw new Error(`golden_native_rule_fixture_request_mismatch:${request.decision.decisionId}`);
      }
      const content = {
        ...query.response,
        requestId: request.requestId,
        identity: request.identity,
      };
      return LibriichiRuleResponseSchema.parse({ ...content, resultId: fixtureDigest(content) });
    },
    scoreRules: async (request: Parameters<ManagedMortalRuntime["scoreRules"]>[0]) => {
      stats.scoreCalls += 1;
      const preferredNativeIndex = Math.max(...request.ruleResult.actions.map((row) => row.runtimeAction.index));
      const candidates = request.ruleResult.actions.map((row) => ({
        runtimeAction: row.runtimeAction,
        ruleActionId: fixtureDigest({
          runtimeAction: row.runtimeAction,
          mjaiActionJson: row.mjaiActionJson,
          ...(row.physicalAliases === undefined ? {} : { physicalAliases: row.physicalAliases }),
        }),
        // Deterministic scoring fixture: a rule action's native index determines
        // the rank, independently of the action actually taken in the record.
        qValue: row.runtimeAction.index === preferredNativeIndex ? 1 : 0,
      }));
      const preferred = candidates.reduce((best, candidate) =>
        candidate.qValue > best.qValue ? candidate : best);
      return {
        protocolVersion: "riichi-local-mortal-scoring-jsonl/v2" as const,
        requestId: request.requestId,
        identity: request.identity,
        status: "ok" as const,
        ruleResultId: request.ruleResult.resultId,
        candidates,
        preferredRuntimeAction: preferred.runtimeAction,
      };
    },
    close: async () => {
      if (!injectedRuleFailure && (stats.queryCalls !== 12 || stats.scoreCalls !== 4)) {
        throw new Error(`golden_native_rule_fixture_coverage_mismatch:${stats.queryCalls}:${stats.scoreCalls}`);
      }
    },
  } as unknown as ManagedMortalRuntime;
  return { runtime, stats };
}


export function createGoldenFixture(bundle: MahjongSoulProtocolBundle) {
  const fixture = loadCompleteRecordFixture();
  const recordBytes = unwrapGameDetailRecords(bundle, Uint8Array.from(Buffer.from(fixture.wire, "hex")));
  const analysis = createRealPrefixAnalysisStore(bundle, fixture);
  const initial = analysis.analyzeRecord({ recordId: fixture.recordId, selfActor: 3, recordBytes, ruleEvidence: fixture.ruleEvidence });
  if (initial.status !== "analysis_ready" || initial.decisions.length !== 3) throw new Error("golden_fixture_schema_invalid");
  const summary = AnalyzableRecordSummarySchema.parse({
    recordId: fixture.recordId,
    shareUrl: `https://game.maj-soul.com/1/?paipu=${fixture.recordId}_a${encodeMahjongSoulPerspectiveAccountId(123_456_789)}`,
    startedAt: 1_754_877_600,
    players: ["A", "B", "C", "D"].map((displayName, seat) => ({ seat, displayName, finalScore: 25_000, rank: seat + 1 })),
    selfSeat: 3,
    rule: { playerCount: 4 as const, length: "south" as const, modeId: 2, detailRuleHash: "sha256:7a53cc5deb60512f3dacacc7695dd5072077c6f4984dbedbff76e27092393b1c", displayLabel: "四人南风" },
    analysisStatus: "not_analyzed" as const,
    lastSyncedAt: 1_754_887_700,
  });
  const createProvider = (pkg: StructuredAnalysisPackage, selection: ReviewSelectionResult) => {
    const graph = projectContextGraph(pkg);
    const degraded = process.env.RIICHI_MVP_GOLDEN_REPORT === "evidence_only";
    return {
      descriptor: () => ({ providerId: "electron-golden-stub", model: degraded ? "degraded" : "complete" }),
      complete: async () => degraded ? { errorCode: "provider_unavailable" as const, transportRetries: 0 as const } : {
        content: JSON.stringify({ decisions: selection.selected.map(({ decisionId }, index) => {
          const nodes = graph.nodes.filter((node) => (node.payload as { decisionId?: string } | null)?.decisionId === decisionId);
          const scope = (nodes.find((node) => node.nodeKind === "Decision")?.payload as { automaticComparisonScope?: { actionRefs: string[] } } | undefined)?.automaticComparisonScope;
          const candidate = nodes.find((node) => node.nodeKind === "CandidateAction" && (scope === undefined || scope.actionRefs[0] === (node.payload as { actionRef?: string } | null)?.actionRef));
          const premise = nodes.find((node) => node.nodeKind === "KnownGameFact");
          const difference = nodes.find((node) => node.nodeKind === "FactorDifference");
          if (!candidate || !premise || !difference) throw new Error("golden_evidence_missing");
          return {
            decisionId,
            judgment: { localId: `golden-judgment-${index}`, recommendation: (candidate.payload as { actionRef: string }).actionRef, confidence: "medium", premiseRefs: [premise.nodeId] },
            explanations: [{ text: "这条判断由真实牌谱的可审计差异支持。", claims: [{ kind: "factor_difference", evidenceRef: difference.nodeId }], judgmentLocalRef: `golden-judgment-${index}` }],
          };
        }) }), transportRetries: 0 as const,
      },
    };
  };
  return Object.freeze({ fixture, recordBytes, analysis, summary, createProvider, createRuntime: (decisions: readonly ReplayedDecision[]) => {
    const harness = createFixtureLocalMortalRuntime(decisions);
    if (process.env.RIICHI_MVP_GOLDEN_FAIL_ANALYSIS === "1") harness.stats.failNextRule();
    return harness.runtime;
  } });
}
