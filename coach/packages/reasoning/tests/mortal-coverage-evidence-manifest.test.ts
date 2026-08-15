/**
 * M6-A3 §16 — coverage evidence manifest tests.
 *
 * The manifest is the only sanctioned lift path from accepted real evidence
 * to a production registry. These tests pin: the §16 minimum audit fields,
 * dedupe semantics, branch ordering, fail-closed validation, and that an
 * empty manifest (the current honest state) lifts nothing.
 */
import { describe, expect, it } from "vitest";
import {
  MORTAL_COVERAGE_BRANCHES,
  createMortalCoverageRegistry,
} from "../src/analysis/mortal-coverage-registry.js";
import {
  MORTAL_COVERAGE_EVIDENCE_MANIFEST_VERSION,
  MortalCoverageEvidenceManifestSchema,
  buildMortalCoverageEvidenceManifest,
  createMortalCoverageRegistryFromManifest,
  type MortalCoverageEvidenceSample,
} from "../src/analysis/mortal-coverage-evidence-manifest.js";

const sample = (branch: string, hash: string, extra: Partial<MortalCoverageEvidenceSample> = {}): MortalCoverageEvidenceSample => ({
  branch: branch as MortalCoverageEvidenceSample["branch"],
  evidenceVersion: "acceptance-run/v1",
  evidenceHash: hash,
  localSourceType: "tenhou",
  modelAdapterVersion: "mortal-adapter/v3",
  modelTag: "4.1b",
  ...extra,
});

describe("buildMortalCoverageEvidenceManifest", () => {
  it("empty input produces an empty manifest that lifts nothing", () => {
    const manifest = buildMortalCoverageEvidenceManifest([]);
    expect(manifest.entries).toEqual([]);
    expect(() => MortalCoverageEvidenceManifestSchema.parse(manifest)).not.toThrow();
    const registry = createMortalCoverageRegistryFromManifest(manifest);
    for (const branch of MORTAL_COVERAGE_BRANCHES) {
      expect(registry.isCovered(branch)).toBe(false);
    }
  });

  it("groups per branch, counts accepted samples, and dedupes by evidence hash", () => {
    const manifest = buildMortalCoverageEvidenceManifest([
      sample("riichi_window", "a"),
      sample("riichi_window", "a"), // same accepted output twice → one sample
      sample("riichi_window", "b", { localSourceType: "mahjong_soul" }),
      sample("post_riichi", "c"),
    ]);
    expect(manifest.entries).toHaveLength(2);
    const riichi = manifest.entries[0]!;
    expect(riichi.branch).toBe("riichi_window");
    expect(riichi.acceptedRealSampleCount).toBe(2);
    expect(riichi.evidence.map((record) => record.evidenceHash).sort()).toEqual(["a", "b"]);
    // Heterogeneous real examples are the point — both source types survive.
    expect(new Set(riichi.evidence.map((record) => record.localSourceType))).toEqual(
      new Set(["tenhou", "mahjong_soul"]),
    );
    expect(manifest.entries[1]!.branch).toBe("post_riichi");
    expect(manifest.entries[1]!.acceptedRealSampleCount).toBe(1);
  });

  it("orders entries by the canonical branch order and drops untouched branches", () => {
    const manifest = buildMortalCoverageEvidenceManifest([
      sample("self_turn_kyuushu", "z"),
      sample("post_call_chi", "y"),
    ]);
    expect(manifest.entries.map((entry) => entry.branch)).toEqual([
      "post_call_chi",
      "self_turn_kyuushu",
    ]);
  });
});

describe("createMortalCoverageRegistryFromManifest", () => {
  it("covers exactly the branches with at least one accepted real sample", () => {
    const registry = createMortalCoverageRegistryFromManifest(
      buildMortalCoverageEvidenceManifest([
        sample("post_call_pon", "h1"),
        sample("post_call_pon", "h2"),
        sample("dama_with_tsumo_candidate", "h3"),
      ]),
    );
    expect(registry.isCovered("post_call_pon")).toBe(true);
    expect(registry.isCovered("dama_with_tsumo_candidate")).toBe(true);
    expect(registry.isCovered("post_call_chi")).toBe(false);
    expect(registry.isCovered("riichi_window")).toBe(false);
    // Same coverage set as the explicit constructor over the same branches.
    const explicit = createMortalCoverageRegistry([
      "post_call_pon",
      "dama_with_tsumo_candidate",
    ]);
    for (const branch of MORTAL_COVERAGE_BRANCHES) {
      expect(registry.isCovered(branch)).toBe(explicit.isCovered(branch));
    }
  });

  it("round-trips through serialized JSON", () => {
    const manifest = buildMortalCoverageEvidenceManifest([
      sample("riichi_window", "a"),
    ]);
    const revived = JSON.parse(JSON.stringify(manifest)) as unknown;
    expect(() => MortalCoverageEvidenceManifestSchema.parse(revived)).not.toThrow();
    expect(
      createMortalCoverageRegistryFromManifest(revived).isCovered("riichi_window"),
    ).toBe(true);
  });

  it("fails closed on invalid manifests", () => {
    // Wrong schema version.
    expect(() =>
      createMortalCoverageRegistryFromManifest({
        schemaVersion: "mortal-coverage-evidence-manifest/v0",
        entries: [],
      }),
    ).toThrow("mortal_coverage_evidence_manifest_invalid");
    // Unknown branch name can never lift anything.
    expect(() =>
      createMortalCoverageRegistryFromManifest({
        schemaVersion: MORTAL_COVERAGE_EVIDENCE_MANIFEST_VERSION,
        entries: [{ branch: "not_a_branch", acceptedRealSampleCount: 1, evidence: [] }],
      }),
    ).toThrow("mortal_coverage_evidence_manifest_invalid");
    // Inflated count vs evidence length = hand-edited manifest, not evidence.
    expect(() =>
      createMortalCoverageRegistryFromManifest({
        schemaVersion: MORTAL_COVERAGE_EVIDENCE_MANIFEST_VERSION,
        entries: [{
          branch: "riichi_window",
          acceptedRealSampleCount: 5,
          evidence: [sample("riichi_window", "only-one")].map(
            ({ branch: _branch, ...record }) => record,
          ),
        }],
      }),
    ).toThrow("mortal_coverage_evidence_manifest_invalid");
    // Zero-count entry is valid but lifts nothing.
    const registry = createMortalCoverageRegistryFromManifest({
      schemaVersion: MORTAL_COVERAGE_EVIDENCE_MANIFEST_VERSION,
      entries: [{
        branch: "post_riichi",
        acceptedRealSampleCount: 0,
        evidence: [],
      }],
    });
    expect(registry.isCovered("post_riichi")).toBe(false);
  });

  it("entries are strict: privacy-forbidden raw fields are rejected", () => {
    const manifest = buildMortalCoverageEvidenceManifest([sample("riichi_window", "a")]);
    const poisoned = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
    const entry = (poisoned.entries as Array<Record<string, unknown>>)[0]!;
    entry.reportId = "raw-report-id";
    expect(() =>
      MortalCoverageEvidenceManifestSchema.parse(poisoned),
    ).toThrow();
  });
});
