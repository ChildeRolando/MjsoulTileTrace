// M6-A3 §16 P0 — versioned coverage evidence manifest.
//
// The production coverage registry may only be lifted from ACCEPTED REAL
// evidence, never from developer intent. This module defines that artifact:
// a versioned manifest listing, per semantic branch, every accepted real E2E
// sample (full chain: local independent pipeline → canonical → binding →
// comparison/ModelEvaluation/assembly → redacted output) with the audit fields
// the spec requires. `createMortalCoverageRegistryFromManifest` is the only
// sanctioned mechanical path from evidence to a lifted registry.
//
// Privacy (§16/§23): entries carry version/hash/source-type/adapter/model-tag
// metadata only — never raw report ids, URLs, nicknames, account ids, or any
// raw record bytes.
import { z } from "zod";
import {
  MORTAL_COVERAGE_BRANCHES,
  createMortalCoverageRegistry,
  type MortalCoverageBranch,
  type MortalCoverageRegistry,
} from "./mortal-coverage-registry.js";

export const MORTAL_COVERAGE_EVIDENCE_MANIFEST_VERSION =
  "mortal-coverage-evidence-manifest/v1" as const;

/** Local pipeline that independently produced the canonical side. */
export const MORTAL_COVERAGE_LOCAL_SOURCE_TYPES = [
  "tenhou",
  "mahjong_soul",
] as const;

export type MortalCoverageLocalSourceType =
  (typeof MORTAL_COVERAGE_LOCAL_SOURCE_TYPES)[number];

/** One accepted real E2E sample (audit metadata only, §16 minimum fields). */
export const MortalCoverageEvidenceRecordSchema = z.object({
  /** Versioned identity of the acceptance run that produced this sample. */
  evidenceVersion: z.string().min(1),
  /** Hash of the accepted redacted output for this sample. */
  evidenceHash: z.string().min(1),
  localSourceType: z.enum(MORTAL_COVERAGE_LOCAL_SOURCE_TYPES),
  modelAdapterVersion: z.string().min(1),
  modelTag: z.string().min(1).optional(),
}).strict();

export const MortalCoverageEvidenceEntrySchema = z.object({
  branch: z.enum(MORTAL_COVERAGE_BRANCHES),
  acceptedRealSampleCount: z.number().int().min(0),
  evidence: z.array(MortalCoverageEvidenceRecordSchema),
}).strict();

export const MortalCoverageEvidenceManifestSchema = z.object({
  schemaVersion: z.literal(MORTAL_COVERAGE_EVIDENCE_MANIFEST_VERSION),
  entries: z.array(MortalCoverageEvidenceEntrySchema),
}).strict();

export type MortalCoverageEvidenceRecord = z.infer<
  typeof MortalCoverageEvidenceRecordSchema
>;
export type MortalCoverageEvidenceEntry = z.infer<
  typeof MortalCoverageEvidenceEntrySchema
>;
export type MortalCoverageEvidenceManifest = z.infer<
  typeof MortalCoverageEvidenceManifestSchema
>;

/** Input accepted by the builder: a branch tag plus the §16 audit fields. */
export type MortalCoverageEvidenceSample = Readonly<
  MortalCoverageEvidenceRecord & { readonly branch: MortalCoverageBranch }
>;

const branchOrder: ReadonlyMap<string, number> = new Map(
  MORTAL_COVERAGE_BRANCHES.map((branch, index) => [branch, index]),
);

/**
 * Build a manifest from accepted real samples. Samples dedupe by
 * (branch, evidenceHash) — the same accepted output can be tallied once per
 * branch it exercises, but never twice for one branch. Branches without
 * accepted samples are omitted entirely: an empty manifest is the honest
 * artifact while no branch has been accepted, and it lifts nothing.
 */
export function buildMortalCoverageEvidenceManifest(
  samples: readonly MortalCoverageEvidenceSample[],
): MortalCoverageEvidenceManifest {
  const byBranch = new Map<MortalCoverageBranch, MortalCoverageEvidenceSample[]>();
  for (const sample of samples) {
    const list = byBranch.get(sample.branch) ?? [];
    list.push(sample);
    byBranch.set(sample.branch, list);
  }
  const entries = MORTAL_COVERAGE_BRANCHES.flatMap((branch) => {
    const list = byBranch.get(branch);
    if (list === undefined) return [];
    const seenHashes = new Set<string>();
    const evidence: MortalCoverageEvidenceRecord[] = [];
    for (const sample of list) {
      if (seenHashes.has(sample.evidenceHash)) continue;
      seenHashes.add(sample.evidenceHash);
      const { branch: _branch, ...record } = sample;
      evidence.push(record);
    }
    return [{
      branch,
      acceptedRealSampleCount: evidence.length,
      evidence,
    } satisfies MortalCoverageEvidenceEntry];
  });
  return {
    schemaVersion: MORTAL_COVERAGE_EVIDENCE_MANIFEST_VERSION,
    entries,
  };
}

/**
 * Derive the production registry from an evidence manifest. Unknown schema,
 * unknown branches, or count/evidence disagreement fail closed by throwing —
 * a manifest that cannot be validated may never lift anything. A branch is
 * covered exactly when it carries at least one accepted real sample.
 */
export function createMortalCoverageRegistryFromManifest(
  manifest: unknown,
): MortalCoverageRegistry {
  const parsed = MortalCoverageEvidenceManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new Error("mortal_coverage_evidence_manifest_invalid");
  }
  const covered: MortalCoverageBranch[] = [];
  for (const entry of parsed.data.entries) {
    if (entry.acceptedRealSampleCount !== entry.evidence.length) {
      // A hand-edited manifest with an inflated count is not evidence.
      throw new Error("mortal_coverage_evidence_manifest_invalid");
    }
    if (entry.acceptedRealSampleCount > 0) {
      covered.push(entry.branch);
    }
  }
  return createMortalCoverageRegistry(covered);
}
