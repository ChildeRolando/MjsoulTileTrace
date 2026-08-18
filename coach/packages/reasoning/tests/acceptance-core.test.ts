/**
 * Source-policy correction §20 tests A–F: acceptance evidence is valid from
 * ANY approved independent local authority (Mahjong Soul preferred, Tenhou
 * supplemental), never from Mortal's own mjai_log, and never without a named
 * provenance.
 */
import { describe, expect, it } from "vitest";
import type { MortalFetchedReport } from "@riichi-coach/mortal-source";
import type { MortalFullGameLedgerEntry } from "../src/analysis/mortal-full-game-review.js";
import {
  assertMortalAcceptanceLocalSourceType,
  buildRedactedAcceptanceArtifact,
  type AcceptanceReadyReview,
  type AcceptedBranchEvidence,
} from "../src/analysis/acceptance-evidence.js";
import {
  buildMortalCoverageEvidenceManifest,
  createMortalCoverageRegistryFromManifest,
  MORTAL_COVERAGE_EVIDENCE_MANIFEST_VERSION,
  type MortalCoverageEvidenceSample,
} from "../src/analysis/mortal-coverage-evidence-manifest.js";
import { MORTAL_COVERAGE_BRANCHES } from "../src/analysis/mortal-coverage-registry.js";
import {
  runMortalAcceptanceEvidence,
  validateAcceptanceLocalSource,
  type AcceptanceLocalSource,
} from "../src/analysis/acceptance-core.js";
import type { CanonicalEventStream } from "@riichi-coach/contracts";
import { CanonicalEventStreamSchema } from "@riichi-coach/contracts";
import type { ReplayedDecision } from "../src/replay/stream-replayer.js";
import type { HandStructureFactEnginePort } from "../src/fact-engine/port.js";

function makeReport(): MortalFetchedReport {
  return Object.freeze({
    reportId: "0123456789abcdef",
    adapterVersion: "mortal-source/2",
    engine: "Mortal" as const,
    version: "1.5.10",
    modelTag: "4.1b",
    playerId: 0,
    gameFingerprint: "mortal-game-fingerprint/v2:sha256:test",
    kyokus: Object.freeze([{
      roundOrdinal: 0,
      roundWind: "E" as const,
      dealer: 0,
      kyoku: 0,
      honba: 0,
      entries: Object.freeze([]),
    }]),
  });
}

function makeReview(): AcceptanceReadyReview {
  return {
    status: "coverage_ready",
    summary: {
      replayDecisionCount: 1,
      responseWindowCount: 0,
      mortalSelfEntryCount: 1,
      responseEntryCount: 0,
      localConservation: 1,
      sourceConservation: 1,
      outcomes: {
        analysis_ready: 1,
        unsupported_action: 0,
        source_row_not_expected: 0,
        no_mortal_entry: 0,
        binding_mismatch: 0,
        model_output_incomplete: 0,
        analysis_blocked: 0,
      },
      binding: { bound: 1, noMortalEntry: 0, ambiguous: 0 },
      supportedPairCount: 1,
      unsupportedReasons: {},
      modelIncompleteReasons: {},
      analysisBlockedReasons: {},
      sourceUnboundReasons: {},
      coverageBranchEncounters: {},
      coverageBranchUncoveredBlocks: {},
    },
    decisions: [{
      decisionOrdinal: 0,
      roundOrdinal: 0,
      surface: "self",
      binding: "bound",
      support: "supported",
      review: "analysis_ready",
      outcome: "analysis_ready",
      reason: null,
      sourceEntryRef: "sha256:x:0",
      sourceOrdinal: 0,
      modelSummary: {
        actualActionRef: "action:v1:discard:1p",
        preferredActions: ["action:v1:discard:1p"],
        topModelProbabilityPercent: 92,
        errorGap: 0,
        detailClass: "not_error",
        factorAnalysisMode: "structured",
        deterministicPreference: null,
      },
    }] as MortalFullGameLedgerEntry[],
    sourceCoverage: {
      mortalSelfEntryCount: 1,
      responseEntryCount: 0,
      boundMortalEntryCount: 1,
      unboundMortalEntryCount: 0,
      ambiguousMortalEntryCount: 0,
      entries: [],
      responseEntries: [],
      responseBoundEntryCount: 0,
      responseUnboundEntryCount: 0,
      responseAmbiguousEntryCount: 0,
    },
    retainedAnalyses: [],
  } as AcceptanceReadyReview;
}

function sample(
  overrides: Partial<MortalCoverageEvidenceSample> & { branch: string },
): MortalCoverageEvidenceSample {
  return {
    evidenceVersion: "m6-a3-acceptance/v1",
    evidenceHash: "sha256:aaaa",
    localSourceType: "mahjong_soul",
    modelAdapterVersion: "mortal-source/1",
    modelTag: "4.1b",
    ...overrides,
  } as MortalCoverageEvidenceSample;
}

describe("source-policy tests A/B/C (§20): approved sources lift via manifest", () => {
  it("A: mahjong_soul evidence → manifest validates → lifts", () => {
    const manifest = buildMortalCoverageEvidenceManifest([
      sample({ branch: "riichi_window", localSourceType: "mahjong_soul" }),
    ]);
    expect(manifest.schemaVersion).toBe(MORTAL_COVERAGE_EVIDENCE_MANIFEST_VERSION);
    const registry = createMortalCoverageRegistryFromManifest(manifest);
    for (const branch of MORTAL_COVERAGE_BRANCHES) {
      expect(registry.isCovered(branch)).toBe(branch === "riichi_window");
    }
  });

  it("B: tenhou evidence → the same manifest path lifts equally", () => {
    const manifest = buildMortalCoverageEvidenceManifest([
      sample({ branch: "riichi_window", localSourceType: "tenhou" }),
    ]);
    const registry = createMortalCoverageRegistryFromManifest(manifest);
    expect(registry.isCovered("riichi_window")).toBe(true);
  });

  it("C: a mixed-source manifest lifts the union of both sources' branches", () => {
    const manifest = buildMortalCoverageEvidenceManifest([
      sample({ branch: "riichi_window", localSourceType: "mahjong_soul" }),
      sample({ branch: "self_turn_ankan", localSourceType: "tenhou" }),
    ]);
    const registry = createMortalCoverageRegistryFromManifest(manifest);
    for (const branch of MORTAL_COVERAGE_BRANCHES) {
      expect(registry.isCovered(branch)).toBe(
        branch === "riichi_window" || branch === "self_turn_ankan",
      );
    }
    const byBranch = new Map(manifest.entries.map((entry) => [entry.branch, entry]));
    expect(byBranch.get("riichi_window")!.evidence[0]!.localSourceType).toBe("mahjong_soul");
    expect(byBranch.get("self_turn_ankan")!.evidence[0]!.localSourceType).toBe("tenhou");
  });
});

describe("source-policy test D (§20): same branch, both sources", () => {
  it("counts distinct evidence hashes, never double-counting one hash", () => {
    const manifest = buildMortalCoverageEvidenceManifest([
      sample({ branch: "riichi_window", localSourceType: "mahjong_soul", evidenceHash: "sha256:aaa" }),
      sample({ branch: "riichi_window", localSourceType: "tenhou", evidenceHash: "sha256:bbb" }),
      // Same hash repeated (majsoul) — deduped, not a third sample.
      sample({ branch: "riichi_window", localSourceType: "mahjong_soul", evidenceHash: "sha256:aaa" }),
    ]);
    const entry = manifest.entries.find((candidate) => candidate.branch === "riichi_window");
    expect(entry!.acceptedRealSampleCount).toBe(2);
    expect(entry!.evidence.map((record) => record.evidenceHash).sort()).toEqual([
      "sha256:aaa",
      "sha256:bbb",
    ]);
  });
});

describe("source-policy tests E/F (§20): provenance is named or rejected", () => {
  it("E: a Mortal-mjai-derived 'local source' is structurally rejected", () => {
    // The approved-local-authority allowlist has no entry for Mortal's own
    // mjai_log/split_logs — deriving the canonical side from the report
    // under review cannot even be NAMED, let alone accepted.
    expect(() =>
      assertMortalAcceptanceLocalSourceType("mortal_mjai"),
    ).toThrowError("mortal_acceptance_artifact_source_type_invalid");
    expect(() =>
      buildRedactedAcceptanceArtifact({
        gameId: "majsoul-g:abc123",
        seat: 1,
        // @ts-expect-error intentionally invalid provenance
        localSourceType: "mortal_mjai",
        report: makeReport(),
        review: makeReview(),
        evidence: { branches: [], analysisReadyRowCount: 0, responsePassFamilies: [] } as AcceptedBranchEvidence,
      }),
    ).toThrowError("mortal_acceptance_artifact_source_type_invalid");
    // And the manifest side refuses the record outright.
    const manifest = buildMortalCoverageEvidenceManifest([]);
    (manifest.entries as unknown[]).push({
      branch: "riichi_window",
      acceptedRealSampleCount: 1,
      evidence: [{
        evidenceVersion: "v",
        evidenceHash: "sha256:x",
        localSourceType: "mortal_mjai",
        modelAdapterVersion: "mortal-source/1",
      }],
    });
    expect(() => createMortalCoverageRegistryFromManifest(manifest)).toThrowError(
      "mortal_coverage_evidence_manifest_invalid",
    );
  });

  it("F: a missing localSourceType rejects the artifact AND the manifest", () => {
    // Artifact: omission fails closed.
    expect(() =>
      buildRedactedAcceptanceArtifact({
        gameId: "tenhou-g:abc123",
        seat: 0,
        report: makeReport(),
        review: makeReview(),
        evidence: { branches: [], analysisReadyRowCount: 0, responsePassFamilies: [] } as AcceptedBranchEvidence,
        // @ts-expect-error localSourceType deliberately omitted
        localSourceType: undefined,
      }),
    ).toThrowError("mortal_acceptance_artifact_source_type_invalid");
    // Manifest: a record without the provenance field is invalid schema.
    const manifest = buildMortalCoverageEvidenceManifest([]);
    (manifest.entries as unknown[]).push({
      branch: "riichi_window",
      acceptedRealSampleCount: 1,
      evidence: [{
        evidenceVersion: "v",
        evidenceHash: "sha256:x",
        modelAdapterVersion: "mortal-source/1",
      }],
    });
    expect(() => createMortalCoverageRegistryFromManifest(manifest)).toThrowError(
      "mortal_coverage_evidence_manifest_invalid",
    );
  });
});

describe("final-closing §2: wrapper/stream provenance coherence fails closed", () => {
  // Schema-valid synthetic stream — the guard runs before binding/review, so
  // the engine is never touched for the mismatch cases (stub is enough).
  function coherenceStream(overrides: {
    sourceKind?: "mahjong_soul" | "tenhou";
    gameId?: string;
    selfActor?: 0 | 1 | 2 | 3;
  }): CanonicalEventStream {
    const gameId = overrides.gameId ?? "majsoul-g:coherence01";
    return CanonicalEventStreamSchema.parse({
      schemaVersion: "canonical-riichi-events/v2",
      mapperVersion: "coherence-fixture/v1",
      gameId,
      sourceKind: overrides.sourceKind ?? "mahjong_soul",
      sourceRecordHash: "sha256:coherence",
      playerCount: 4,
      selfActor: overrides.selfActor ?? 1,
      completeness: {
        eventSequence: "complete",
        ruleSet: "complete",
        scores: "complete",
        doraIndicators: "complete",
        rivers: "complete",
        calledDiscardMarkers: "complete",
        melds: "complete",
        remainingDraws: "complete",
        settlement: "complete",
        responseOpportunities: "complete",
      },
      ruleSet: {
        length: "south",
        redFives: { man: 1, pin: 1, sou: 1 },
        openTanyao: true,
        atamahane: false,
        westExtension: "sudden_death",
        ippatsuCancelledByAnkan: true,
      },
      events: [
        {
          type: "game_started",
          eventId: `${gameId}/0/0/0`,
          sourceRecordRef: "record:0",
        },
      ],
    });
  }

  function coherentLocal(): AcceptanceLocalSource {
    return {
      sourceKind: "mahjong_soul",
      opaqueGameId: "majsoul-g:coherence01",
      selfActor: 1,
      canonicalStream: coherenceStream({}),
      replayedDecisions: [] as readonly ReplayedDecision[],
    };
  }

  const stubEngine = {} as HandStructureFactEnginePort;

  it("A: mahjong_soul wrapper over a tenhou stream → acceptance_local_source_kind_mismatch", async () => {
    const local: AcceptanceLocalSource = {
      ...coherentLocal(),
      canonicalStream: coherenceStream({ sourceKind: "tenhou" }),
    };
    expect(() => validateAcceptanceLocalSource(local)).toThrowError(
      "acceptance_local_source_kind_mismatch",
    );
    const run = await runMortalAcceptanceEvidence({
      local,
      report: makeReport(),
      engine: stubEngine,
      evidenceVersion: "m6-a3-acceptance/v1",
    });
    expect(run).toEqual({
      status: "local_source_incoherent",
      code: "acceptance_local_source_kind_mismatch",
    });
  });

  it("B: opaqueGameId mismatch → acceptance_local_game_id_mismatch", async () => {
    const local: AcceptanceLocalSource = {
      ...coherentLocal(),
      canonicalStream: coherenceStream({ gameId: "majsoul-g:someother" }),
    };
    expect(() => validateAcceptanceLocalSource(local)).toThrowError(
      "acceptance_local_game_id_mismatch",
    );
    const run = await runMortalAcceptanceEvidence({
      local,
      report: makeReport(),
      engine: stubEngine,
      evidenceVersion: "m6-a3-acceptance/v1",
    });
    expect(run).toEqual({
      status: "local_source_incoherent",
      code: "acceptance_local_game_id_mismatch",
    });
  });

  it("C: selfActor mismatch → acceptance_local_self_actor_mismatch", async () => {
    const local: AcceptanceLocalSource = {
      ...coherentLocal(),
      canonicalStream: coherenceStream({ selfActor: 2 }),
    };
    expect(() => validateAcceptanceLocalSource(local)).toThrowError(
      "acceptance_local_self_actor_mismatch",
    );
    const run = await runMortalAcceptanceEvidence({
      local,
      report: makeReport(),
      engine: stubEngine,
      evidenceVersion: "m6-a3-acceptance/v1",
    });
    expect(run).toEqual({
      status: "local_source_incoherent",
      code: "acceptance_local_self_actor_mismatch",
    });
  });

  it("D: exact wrapper/stream match proceeds past the guard into review", async () => {
    // Coherent input flows through to the full-game review — which then fails
    // on its own semantics (the synthetic fixture carries no replayed
    // decisions, so validateFullGameInputs rejects it), NOT on provenance.
    // Identical pre-hardening behavior is exactly what "proceeds normally"
    // means here: the guard only ever blocks incoherent wrappers.
    const run = await runMortalAcceptanceEvidence({
      local: coherentLocal(),
      report: makeReport(),
      engine: stubEngine,
      evidenceVersion: "m6-a3-acceptance/v1",
    });
    expect(run.status).not.toBe("local_source_incoherent");
    expect(run.status).toBe("review_failed");
    if (run.status === "review_failed") {
      expect(run.code).toBe("mortal_full_game_input_invalid");
    }
  });
});
