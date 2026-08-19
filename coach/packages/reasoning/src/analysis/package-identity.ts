/**
 * M6-C Slice 3 review repair 3B — shared package identity / hash derivation.
 *
 * The Slice 2 builder's deterministic identity derivation is extracted here so
 * the builder AND the package validator use the SAME functions:
 *
 *   deriveAnalysisKey
 *   derivePackageId
 *   deriveSemanticContentHash
 *
 * The Slice 3 semantic-integrity closure adds the two remaining shared
 * derivations that must not drift between builder and validator:
 *
 *   deriveDecisionId
 *   deriveRecordStatus
 *
 * This abstraction is admitted (Abstraction Admission Rule) because it
 * prevents the two algorithms from drifting over time: the validator must be
 * able to RECOMPUTE `packageId` and `semanticContentHash` from the package's
 * own contents and require equality (3C), RECOMPUTE every `decisionId` from
 * the decision's own context (closure 4), and RECOMPUTE `record.status` from
 * the decision outcomes (closure 5). It is a narrowly scoped, deterministic,
 * pure helper — deliberately NOT a generic hashing framework and NOT a
 * general artifact-identity service.
 *
 * Identity semantics follow the frozen Slice 1 contract (CR-4 / CR-5):
 *  - `analysisKey` = logical slot (record identity + self actor + provider),
 *    stable across model/fact-pipeline versions.
 *  - `decisionId` = game identity + self actor + surface + decision window
 *    kind + triggerEventRef (CR-4) — the exact per-decision identity.
 *  - `packageId` = artifact identity derived from analysisKey +
 *    componentVersions + analysisPolicy (the package-level construction
 *    policy). No wall-clock / artifact-creation metadata enters it.
 *  - `semanticContentHash` = deterministic content hash over the semantic
 *    content only: analysisKey, record, componentVersions, analysisPolicy,
 *    decisions (with the wall-clock `detailPolicy.frozenAt` value nulled) and
 *    evidenceRegistry. createdAt / packageId / frozenAt never participate.
 *  - `record.status` = the aggregate truth over the decision outcomes:
 *    any binding_mismatch / no_mortal_entry → integrity_failed; else any
 *    non-analysis_ready outcome → degraded; else complete (CR-6).
 */
import { createHash } from "node:crypto";
import type {
  AnalysisPolicySnapshot,
  ComponentVersions,
  DecisionAnalysis,
  DecisionSurface,
  EvidenceRegistry,
  MortalDecisionOutcome,
  RecordAnalysis,
} from "@riichi-coach/contracts";

// ---------------------------------------------------------------------------
// Deterministic canonical serialization (sorted keys; locale-independent).
// ---------------------------------------------------------------------------

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(",")}}`;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The wall-clock `detailPolicy.frozenAt` value is artifact-creation metadata
 *  (CR-5): it never participates in the semantic content hash. The frozen
 *  policy snapshot's SEMANTIC values (threshold / unit / boundary /
 *  policyVersion) are deterministic construction inputs and DO participate —
 *  through each decision's detailPolicy AND through the package-level
 *  `analysisPolicy`. */
function withoutFrozenAt(decision: DecisionAnalysis): unknown {
  if (decision.outcome !== "analysis_ready") return decision;
  return {
    ...decision,
    modelEvaluation: {
      ...decision.modelEvaluation,
      detailPolicy: {
        ...decision.modelEvaluation.detailPolicy,
        frozenAt: null,
      },
    },
  };
}

/** The logical analysis slot (CR-4): record identity + self actor + analysis
 *  provider. Stable across reruns AND across model/fact-pipeline versions —
 *  it answers "which slot", not "which artifact". */
export function deriveAnalysisKey(input: {
  recordId: string;
  selfActor: number;
  provider: string;
}): string {
  return `analysis:${input.recordId}:actor${input.selfActor}:${input.provider}`;
}

/** The exact per-decision identity (CR-4): game identity + self actor +
 *  surface + decision window kind + triggerEventRef. The concrete string
 *  encoding is implementation design (frozen in Slice 2); the validator
 *  RECOMPUTES each `decisionId` from the decision's own
 *  normalizedDecisionContext with this SAME function and requires equality —
 *  a decision id that disagrees with its own context is rejected. */
export function deriveDecisionId(input: {
  recordId: string;
  selfActor: number;
  surface: DecisionSurface;
  windowKind: string;
  triggerEventRef: string;
}): string {
  return [
    "decision",
    input.recordId,
    `self${input.selfActor}`,
    input.surface,
    input.windowKind,
    input.triggerEventRef,
  ].join(":");
}

/** The aggregate analysis status (CR-6): the truthfulness summary over the
 *  decision outcomes, derived deterministically — any binding_mismatch or
 *  no_mortal_entry → integrity_failed (never disguise as success); else any
 *  non-analysis_ready outcome → degraded; else complete. The validator
 *  RECOMPUTES `record.status` from the package's own decisions with this SAME
 *  function and requires equality — a package that lies about its aggregate
 *  status is rejected (schema validity ≠ analysis completeness is preserved:
 *  incomplete outcomes themselves never cause rejection). */
export function deriveRecordStatus(
  outcomes: readonly MortalDecisionOutcome[],
): RecordAnalysis["status"] {
  if (outcomes.some((outcome) =>
    outcome === "binding_mismatch" || outcome === "no_mortal_entry"
  )) {
    return "integrity_failed";
  }
  if (outcomes.some((outcome) => outcome !== "analysis_ready")) {
    return "degraded";
  }
  return "complete";
}

/** The artifact identity (CR-4): analysisKey + componentVersions +
 *  analysisPolicy. The package-level construction policy participates, so a
 *  package with zero analysis_ready decisions still binds its policy into its
 *  artifact identity. The wall-clock frozenAt is artifact-creation metadata
 *  and never participates — the artifact reference is stable across reruns
 *  for the same semantic snapshot. */
export function derivePackageId(input: {
  analysisKey: string;
  componentVersions: ComponentVersions;
  analysisPolicy: AnalysisPolicySnapshot;
}): string {
  return `package:sha256:${sha256Hex(canonicalJson({
    analysisKey: input.analysisKey,
    componentVersions: input.componentVersions,
    analysisPolicy: input.analysisPolicy,
  }))}`;
}

/** The semantic content hash (CR-5): deterministic content hash over the
 *  semantic content only. Artifact creation metadata (createdAt, packageId,
 *  the wall-clock detailPolicy.frozenAt value) never participates. */
export function deriveSemanticContentHash(input: {
  analysisKey: string;
  record: RecordAnalysis;
  componentVersions: ComponentVersions;
  analysisPolicy: AnalysisPolicySnapshot;
  decisions: readonly DecisionAnalysis[];
  evidenceRegistry: EvidenceRegistry;
}): string {
  return `sha256:${sha256Hex(canonicalJson({
    analysisKey: input.analysisKey,
    record: input.record,
    componentVersions: input.componentVersions,
    analysisPolicy: input.analysisPolicy,
    decisions: input.decisions.map(withoutFrozenAt),
    evidenceRegistry: input.evidenceRegistry,
  }))}`;
}
