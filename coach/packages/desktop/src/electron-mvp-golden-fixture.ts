// Test-only main adapter for the Electron Golden Slice. Never load outside the
// explicit --mvp-golden-child runner. All source bytes come from a sanitized
// real record and pass through the production mapper/replay and package chain.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { libriichiRuleCanonicalJson, AnalyzableRecordSummarySchema, type LibriichiRuleRequest, type LibriichiRuleResponse } from "@riichi-coach/contracts";
import { mapMahjongSoulRecord, unwrapGameDetailRecords, encodeMahjongSoulPerspectiveAccountId, type MahjongSoulRecordRuleEvidence, type MahjongSoulProtocolBundle } from "@riichi-coach/mahjong-soul-source";
import { replayCanonicalStream, projectContextGraph, type ReplayedDecision } from "@riichi-coach/reasoning";
import type { StructuredAnalysisPackage, ReviewSelectionResult } from "@riichi-coach/contracts";
import { formatMjaiTile } from "@riichi-coach/mortal-source";
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

function runtimeTileIndex(tile: { readonly id: string; readonly red: boolean }): number {
  const rank = Number(tile.id[0]);
  const suit = tile.id[1];
  if (tile.red) return 34 + (suit === "m" ? 0 : suit === "p" ? 1 : 2);
  if (suit === "m") return rank - 1;
  if (suit === "p") return 9 + rank - 1;
  if (suit === "s") return 18 + rank - 1;
  return 27 + rank - 1;
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
  const decisionByRef = new Map(decisions.map((decision) => [decision.decisionEventRef, decision]));
  let failNextRule = false;
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
        throw new Error("injected_rule_runtime_failure");
      }
      if (request.decision.surface === "response") {
        const content = {
          protocolVersion: request.protocolVersion,
          requestId: request.requestId,
          identity: request.identity,
          status: "non_action" as const,
          reason: "native_cannot_act" as const,
        };
        return { ...content, resultId: fixtureDigest(content) };
      }
      const decision = decisionByRef.get(request.decision.decisionId);
      const actual = decision?.actualAction;
      if (decision === undefined || actual === null || actual === undefined || actual.kind !== "discard") {
        throw new Error("fixture_runtime_unknown_decision");
      }
      const alternateTile = decision.snapshot.privateState.concealedTiles.find((tile) =>
        tile.id !== actual.tile.id || tile.red !== actual.tile.red);
      if (alternateTile === undefined) throw new Error("fixture_runtime_missing_alternate");
      const actions = [
        {
          runtimeAction: { index: runtimeTileIndex(actual.tile), variant: null },
          mjaiActionJson: JSON.stringify({
            type: "dahai",
            actor: request.decision.selfActor,
            pai: formatMjaiTile(actual.tile),
            tsumogiri: actual.discardMode === "tsumogiri",
          }),
        },
        {
          runtimeAction: { index: runtimeTileIndex(alternateTile), variant: null },
          mjaiActionJson: JSON.stringify({
            type: "dahai",
            actor: request.decision.selfActor,
            pai: formatMjaiTile(alternateTile),
            tsumogiri: false,
          }),
        },
      ];
      const content = {
        protocolVersion: request.protocolVersion,
        requestId: request.requestId,
        identity: request.identity,
        status: "ok" as const,
        actions,
      };
      return { ...content, resultId: fixtureDigest(content) };
    },
    scoreRules: async (request: Parameters<ManagedMortalRuntime["scoreRules"]>[0]) => {
      stats.scoreCalls += 1;
      const candidates = request.ruleResult.actions.map((row, index) => ({
        runtimeAction: row.runtimeAction,
        ruleActionId: fixtureDigest({
          runtimeAction: row.runtimeAction,
          mjaiActionJson: row.mjaiActionJson,
          ...(row.physicalAliases === undefined ? {} : { physicalAliases: row.physicalAliases }),
        }),
        qValue: index === 0 ? 0 : 1,
      }));
      return {
        protocolVersion: "riichi-local-mortal-scoring-jsonl/v2" as const,
        requestId: request.requestId,
        identity: request.identity,
        status: "ok" as const,
        ruleResultId: request.ruleResult.resultId,
        candidates,
        preferredRuntimeAction: candidates[1]!.runtimeAction,
      };
    },
    close: async () => undefined,
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
