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

function makeReport(): MortalFetchedReport {
  return Object.freeze({
    reportId: "0123456789abcdef",
    adapterVersion: "mortal-source/1",
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
      mortalSelfEntryCount: 1,
      localConservation: 1,
      sourceConservation: 1,
      outcomes: {
        analysis_ready: 1,
        unsupported_action: 0,
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
      boundMortalEntryCount: 1,
      unboundMortalEntryCount: 0,
      ambiguousMortalEntryCount: 0,
      entries: [],
    },
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
        evidence: { branches: [], analysisReadyRowCount: 0 } as AcceptedBranchEvidence,
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
        evidence: { branches: [], analysisReadyRowCount: 0 } as AcceptedBranchEvidence,
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
