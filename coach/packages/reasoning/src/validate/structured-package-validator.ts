/**
 * M6-C Slice 3 — `validateStructuredAnalysisPackage`: the package validator /
 * provenance gate (spec "Slice 3 — serialization / validator / provenance" and
 * "严格校验":  validator 做 schema 校验、引用完整性、版本字段非空、无 LLM
 * 产物字段、无 privileged 原始载荷、evidence registry 可解析；不因分析不完整
 * 拒绝 package). Slice 3 review repair (3 blockers) adds: producer-version
 * provenance coherence, ready-decision reference integrity, and independently
 * recomputable packageId / semanticContentHash.
 *
 * The validator is the audit gate between a builder-produced package and every
 * consumer (persistence M7-B, ContextGraph projection M6-D1, ReviewReport
 * generation M6-D2). It accepts UNTRUSTED input — e.g. a package read back
 * from disk — and validates:
 *
 *  1. SCHEMA VALIDITY (CR-6 split). Parses with the frozen
 *     `StructuredAnalysisPackageSchema`. Every object schema in the package is
 *     `.strict()`, so unknown keys — including LLM-artifact fields and
 *     explanation-side version fields — fail at the schema level. Failure /
 *     skipped decisions (no_mortal_entry etc.) NEVER cause rejection: schema
 *     validity is about structure; completeness is `record.status` (CR-6).
 *  2. NO LLM BOUNDARY (CR-1). A deep scan rejects any CoachJudgment /
 *     ExplanationBullet / CoachInference / ReviewReport artifact key smuggled
 *     anywhere in the package — reachable through the schema-unknown
 *     `EvidenceRecord.payload` sink.
 *  3. NO PRIVILEGED RAW PAYLOAD (CR-1). No http(s) URL string anywhere (paipu
 *     download URLs, tokens, cookies are privileged-process data); canonical
 *     event descriptors and fact-engine request payloads must match their
 *     frozen shapes exactly.
 *  4. VERSION VALIDATION (D4 + supersession). No blank version field;
 *     explanation-side versions (LLM provider/model, prompt, output schema,
 *     validator/generation) never ride in `componentVersions` — they belong to
 *     ReviewReport. `componentVersions.packageSchema` is pinned to the
 *     contract-owned literal `STRUCTURED_ANALYSIS_PACKAGE_SCHEMA_VERSION` (the
 *     validator executes exactly this schema, so the package cannot claim an
 *     arbitrary schema version).
 *  5. CROSS-REFERENCE RESOLUTION (CR-3). Every evidence id referenced anywhere
 *     (KnownGameFacts, every candidate-ledger FactorFact, every
 *     FactorDifference, decision-level) resolves in `evidenceRegistry`, and
 *     the registry is locally complete (no unreferenced nodes).
 *  6. RECORD-IDENTITY COHERENCE (CR-4, closure 4). `analysisKey`, every
 *     `decisionId` and every canonical-event evidence ref derive from
 *     `record.recordId` (the canonical stream's gameId) — no second record
 *     identity can exist in a valid package. Every `decisionId` is RECOMPUTED
 *     with the shared `deriveDecisionId` (record identity + self actor +
 *     surface + decision window kind + triggerEventRef) and must equal the
 *     stored value — a decision id that disagrees with its own decision
 *     context is rejected.
 *  7. SERIALIZABILITY (CR-5 / Slice 3). The package survives a JSON roundtrip
 *     unchanged; non-JSON values (NaN, undefined, BigInt, Date, ...) are
 *     rejected here, per the EvidenceRecord contract comment ("Payload
 *     JSON-serializability is validated at the serialization layer (Slice 3)").
 *  8. PRODUCER/PROVIDER PROVENANCE COHERENCE (repair 1 + closure 1). Wherever
 *     the package carries both a package-level `componentVersions` declaration
 *     AND payload-level producer identity/version metadata, the two must
 *     agree: the Mortal provider chain (`mortalSourceModel.identity ===
 *     "Mortal"`, every ready `ModelEvaluation.engineId === "mortal"`,
 *     `analysisProvider.kind === "mortal"`), every FactorFact /
 *     FactorDifference `engineIdentity` against `componentVersions.factEngine`
 *     field-by-field, every ModelEvaluation.adapterVersion against
 *     `componentVersions.mortalSourceModel.version`, and every
 *     evidence-registry `producerVersion` against the replay / fact-engine
 *     versions it encodes. Fields with no independent payload provenance
 *     (modelTag, ModelEvaluation.engineVersion, mapperAdapter, factorPipeline)
 *     stay declaration-only and are NOT invented into checks.
 *  9. READY-DECISION REFERENCE INTEGRITY (repair 2 + closure 2/3). One
 *     `analysis_ready` decision = one internally coherent candidate universe:
 *     comparisonSet ↔ modelEvaluation identity; ledgers = exactly the
 *     comparison candidates; the model candidate universe is a TRUE BIJECTION
 *     (comparison model-origin candidates == evaluation candidates as sets);
 *     FactorDifference / deterministicPreference refs inside the universe;
 *     `differenceId` values unique per decision and every
 *     `decisiveDifferenceIds` entry resolving to a FactorDifference of the
 *     SAME decision; ModelEvaluation action refs resolving through the
 *     comparison set's legal actual↔model correspondence.
 * 10. EVIDENCE PROVENANCE REFERENCES (closure 6). Registry `sourceRefs` are
 *     provenance references and must not dangle: canonical_event records are
 *     produced by the canonical replay producer with EMPTY sourceRefs;
 *     fact_engine_request records are produced by the fact-engine producer and
 *     every sourceRef must resolve to a canonical_event registry node, with
 *     no duplicates.
 * 11. ANALYSIS-POLICY AUTHORITY (repair 3A). `package.analysisPolicy` is the
 *     authoritative construction policy; every analysis_ready
 *     ModelEvaluation.detailPolicy must agree with it on the four semantic
 *     fields (wall-clock `frozenAt` excluded).
 * 12. RECORD STATUS TRUTH (closure 5). `record.status` is RECOMPUTED from the
 *     decision outcomes with the shared `deriveRecordStatus` (any
 *     binding_mismatch / no_mortal_entry → integrity_failed; else any
 *     non-analysis_ready → degraded; else complete) and must equal the stored
 *     value — a package that lies about its aggregate status is rejected,
 *     while the incomplete outcomes themselves never cause rejection.
 * 13. ARTIFACT IDENTITY (repair 3B/3C). `packageId` and `semanticContentHash`
 *     are RECOMPUTED from the package's own contents with the SAME shared
 *     derivation the builder uses (`./analysis/package-identity.ts`) and must
 *     match the stored values — mutating semantically meaningful content
 *     without updating its identity/hash fails validation. Runs LAST so every
 *     semantic tamper class surfaces its named error first.
 *
 * Error convention: every failure throws `m6c_validator_<kind>:<detail>`.
 */
import { isDeepStrictEqual } from "node:util";
import {
  CANONICAL_REPLAY_PRODUCER,
  FACT_ENGINE_PRODUCER,
  MORTAL_PROVIDER_IDENTITY,
  parseCanonicalEventRef,
  StructuredAnalysisPackageSchema,
  type DecisionAnalysis,
  type EngineIdentity,
  type EvidenceRecord,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import {
  deriveAnalysisKey,
  deriveDecisionId,
  derivePackageId,
  deriveRecordStatus,
  deriveSemanticContentHash,
} from "../analysis/package-identity.js";

/** LLM-boundary artifact keys (CR-1): CoachJudgment / ExplanationBullet /
 *  CoachInference live in ReviewReport and REFERENCE package content by
 *  decisionId + evidenceId — they are never embedded in the package. */
const LLM_BOUNDARY_KEYS = [
  "CoachJudgment",
  "CoachInference",
  "ExplanationBullet",
  "ReviewReport",
  "coachJudgement",
  "coachJudgment",
  "coachInference",
  "explanationBullets",
  "reviewReport",
] as const;

/** Explanation-side / ReviewReport version keys (D4 supersession note):
 *  LLM provider/model, prompt version, output schema version and
 *  validator/generation versions belong to ReviewReport; the same package may
 *  be re-consumed by different LLM/prompt generations, so these never ride in
 *  the package's `componentVersions`. */
const EXPLANATION_VERSION_KEYS = [
  "llmProviderVersion",
  "promptVersion",
  "outputSchemaVersion",
  "validatorVersion",
  "generationVersion",
] as const;

// ---------------------------------------------------------------------------
// Deep scans (reachable through schema-unknown sinks: registry payloads)
// ---------------------------------------------------------------------------

function containsForbiddenKey(
  value: unknown,
  forbidden: readonly string[],
): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = containsForbiddenKey(entry, forbidden);
      if (hit !== null) return hit;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (forbidden.includes(key)) return key;
    const hit = containsForbiddenKey(record[key], forbidden);
    if (hit !== null) return hit;
  }
  return null;
}

function containsUrl(value: unknown): boolean {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower.includes("http://") || lower.includes("https://");
  }
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => containsUrl(entry));
  return Object.values(value as Record<string, unknown>)
    .some((entry) => containsUrl(entry));
}

/** Explanation-side versions are rejected before schema parse so the failure
 *  names the offending key (the strict ComponentVersionsSchema would otherwise
 *  report the same tampering as a generic unrecognized key). */
function rejectExplanationSideVersions(input: unknown): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return;
  }
  const versions = (input as Record<string, unknown>).componentVersions;
  if (versions === null || typeof versions !== "object" || Array.isArray(versions)) {
    return;
  }
  for (const key of EXPLANATION_VERSION_KEYS) {
    if (key in (versions as Record<string, unknown>)) {
      throw new Error(`m6c_validator_explanation_side_version:${key}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Schema validity (CR-6 split) + serializability (CR-5 / Slice 3)
// ---------------------------------------------------------------------------

function assertJsonRoundtrip(pkg: unknown): void {
  let roundtripped: unknown;
  try {
    roundtripped = JSON.parse(JSON.stringify(pkg));
  } catch {
    throw new Error(
      "m6c_validator_not_json_serializable: package contains a non-JSON value",
    );
  }
  if (!isDeepStrictEqual(roundtripped, pkg)) {
    throw new Error(
      "m6c_validator_json_roundtrip_mismatch: package changes under JSON serialization",
    );
  }
}

// ---------------------------------------------------------------------------
// Version validation (D4)
// ---------------------------------------------------------------------------

function rejectBlankVersions(pkg: StructuredAnalysisPackage): void {
  const versions = pkg.componentVersions;
  const blank: string[] = [];
  const check = (path: string, value: string | undefined): void => {
    if (value !== undefined && value.trim().length === 0) blank.push(path);
  };
  check("packageSchema", versions.packageSchema);
  check("canonicalReplay", versions.canonicalReplay);
  check("mapperAdapter", versions.mapperAdapter);
  check("factorPipeline", versions.factorPipeline);
  check("factEngine.engine", versions.factEngine.engine);
  check("factEngine.upstreamCommit", versions.factEngine.upstreamCommit);
  check("factEngine.adapterVersion", versions.factEngine.adapterVersion);
  check("factEngine.protocolVersion", versions.factEngine.protocolVersion);
  check("mortalSourceModel.identity", versions.mortalSourceModel.identity);
  check("mortalSourceModel.version", versions.mortalSourceModel.version);
  check("mortalSourceModel.modelTag", versions.mortalSourceModel.modelTag);
  if (blank.length > 0) {
    throw new Error(`m6c_validator_empty_version:${blank.join(",")}`);
  }
}

// ---------------------------------------------------------------------------
// Record-identity coherence (CR-4 / Slice 2 Fix 2)
// ---------------------------------------------------------------------------

/** The canonical stream's gameId is the SOLE canonical record identity: the
 *  logical analysis slot, every decision id and every canonical event evidence
 *  ref derive from it. A package whose identities disagree is rejected — no
 *  second record identity can exist in a valid package. The analysisKey is
 *  recomputed exactly (shared derivation) instead of prefix-checked, and every
 *  decisionId is RECOMPUTED with the shared deriveDecisionId (record identity
 *  + self actor + surface + decision window kind + triggerEventRef, CR-4):
 *  keeping the correct record-id prefix while altering the surface /
 *  window / event suffix is a decision-identity failure. */
function validateIdentity(pkg: StructuredAnalysisPackage): void {
  const recordId = pkg.record.recordId;
  // Every valid package is provider-scoped to "mortal" (the frozen
  // AnalysisProviderSchema has a single kind), so the analysisKey's provider
  // segment is fully determined.
  const expectedAnalysisKey = deriveAnalysisKey({
    recordId,
    selfActor: pkg.record.selfActor,
    provider: "mortal",
  });
  if (pkg.analysisKey !== expectedAnalysisKey) {
    throw new Error(
      "m6c_validator_analysis_key_identity: analysisKey must derive from the canonical record identity and self actor",
    );
  }
  for (const decision of pkg.decisions) {
    const expectedDecisionId = deriveDecisionId({
      recordId,
      selfActor: pkg.record.selfActor,
      surface: decision.surface,
      windowKind: decision.normalizedDecisionContext.decisionWindowKind,
      triggerEventRef: decision.normalizedDecisionContext.triggerEventRef,
    });
    if (decision.decisionId !== expectedDecisionId) {
      throw new Error(
        `m6c_validator_decision_identity:${decision.decisionId}: decisionId must derive from the record identity + self actor + surface + decision window kind + trigger event ref`,
      );
    }
  }
  for (const [key, record] of Object.entries(pkg.evidenceRegistry)) {
    if (record.kind !== "canonical_event") continue;
    const parsed = parseCanonicalEventRef(key);
    if (parsed === null || parsed.gameId !== recordId) {
      throw new Error(
        `m6c_validator_evidence_identity:${key}: canonical evidence must bind the canonical record identity`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Cross-reference resolution (CR-3)
// ---------------------------------------------------------------------------

/** The FULL CR-3 footprint: KnownGameFacts, every nested candidate-ledger
 *  FactorFact, every FactorDifference, and the decision-level ids — not just
 *  DecisionAnalysis.evidenceIds. */
function collectReferencedEvidenceIds(
  pkg: StructuredAnalysisPackage,
): Set<string> {
  const referenced = new Set<string>();
  for (const decision of pkg.decisions) {
    for (const id of decision.knownGameFacts.evidenceIds) referenced.add(id);
    if (decision.outcome !== "analysis_ready") continue;
    for (const id of decision.evidenceIds) referenced.add(id);
    for (const ledger of decision.candidateFactorLedgers) {
      for (const axis of ledger.axes) {
        for (const fact of axis.facts) {
          for (const id of fact.evidenceIds) referenced.add(id);
        }
      }
    }
    for (const difference of decision.factorDifferences) {
      for (const id of difference.evidenceIds) referenced.add(id);
    }
  }
  return referenced;
}

/** Self-contained, renderer-safe evidence payloads (CR-1/CR-3): the canonical
 *  event descriptor keeps exactly {eventId, type, actor?, tile?} with a
 *  Tile-shaped tile, and a fact-engine request record keeps exactly
 *  {requestId, kind}. Anything beyond these frozen shapes (raw paipu bytes,
 *  download URLs, account ids, ...) is a privileged payload and fails. */
function validateEvidencePayload(id: string, record: EvidenceRecord): void {
  const payload = record.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(
      `m6c_validator_evidence_payload:${id}: payload must be a plain object`,
    );
  }
  const fields = payload as Record<string, unknown>;
  if (record.kind === "canonical_event") {
    const allowed = new Set(["eventId", "type", "actor", "tile"]);
    for (const key of Object.keys(fields)) {
      if (!allowed.has(key)) {
        throw new Error(
          `m6c_validator_evidence_payload:${id}: canonical_event descriptor has unknown key ${key}`,
        );
      }
    }
    if (fields.eventId !== id) {
      throw new Error(
        `m6c_validator_evidence_payload:${id}: canonical_event descriptor eventId mismatch`,
      );
    }
    if (typeof fields.type !== "string" || fields.type.length === 0) {
      throw new Error(
        `m6c_validator_evidence_payload:${id}: canonical_event descriptor requires a type`,
      );
    }
    if (fields.actor !== undefined) {
      if (
        typeof fields.actor !== "number" ||
        !Number.isInteger(fields.actor) ||
        fields.actor < 0 ||
        fields.actor > 3
      ) {
        throw new Error(
          `m6c_validator_evidence_payload:${id}: canonical_event descriptor actor must be an anonymous seat 0-3`,
        );
      }
    }
    if (fields.tile !== undefined) {
      if (
        fields.tile === null ||
        typeof fields.tile !== "object" ||
        Array.isArray(fields.tile)
      ) {
        throw new Error(
          `m6c_validator_evidence_payload:${id}: canonical_event descriptor tile must be a Tile`,
        );
      }
      const tile = fields.tile as Record<string, unknown>;
      if (
        Object.keys(tile).sort().join(",") !== "id,red" ||
        typeof tile.id !== "string" ||
        tile.id.length === 0 ||
        typeof tile.red !== "boolean"
      ) {
        throw new Error(
          `m6c_validator_evidence_payload:${id}: canonical_event descriptor tile must be a Tile`,
        );
      }
    }
    return;
  }
  // fact_engine_request — exactly {requestId, kind}; no opaque fragments
  // (stateHash / actionRef / factSetId) may ride as payload fields.
  const keys = Object.keys(fields).sort();
  if (keys.length !== 2 || keys[0] !== "kind" || keys[1] !== "requestId") {
    throw new Error(
      `m6c_validator_evidence_payload:${id}: fact_engine_request payload must be exactly {requestId, kind}`,
    );
  }
  if (fields.requestId !== id) {
    throw new Error(
      `m6c_validator_evidence_payload:${id}: fact_engine_request payload requestId mismatch`,
    );
  }
  if (typeof fields.kind !== "string" || fields.kind.length === 0) {
    throw new Error(
      `m6c_validator_evidence_payload:${id}: fact_engine_request payload requires a kind`,
    );
  }
}

function validateCrossReferences(pkg: StructuredAnalysisPackage): void {
  const referenced = collectReferencedEvidenceIds(pkg);
  const registered = new Set(Object.keys(pkg.evidenceRegistry));
  for (const id of [...referenced].sort()) {
    if (!registered.has(id)) {
      throw new Error(`m6c_validator_unresolved_evidence:${id}`);
    }
  }
  // Registry locality: every registered evidence must be cited somewhere in
  // the package (builder output satisfies this by construction).
  for (const key of Object.keys(pkg.evidenceRegistry)) {
    if (!referenced.has(key)) {
      throw new Error(`m6c_validator_unreferenced_evidence:${key}`);
    }
    validateEvidencePayload(key, pkg.evidenceRegistry[key]!);
  }
}

// ---------------------------------------------------------------------------
// Producer-version provenance coherence (Slice 3 review repair 1)
// ---------------------------------------------------------------------------

/** Package-level `componentVersions` declarations must agree with the producer
 *  identity/version metadata the package payload itself carries, wherever
 *  existing contracts actually represent the overlap. A structurally valid
 *  package may no longer claim arbitrary producer versions. The Mortal
 *  provider chain (closure 1) is part of this coherence: the declaration's
 *  `mortalSourceModel.identity` must be the canonical "Mortal" provider, and
 *  every ready decision's `ModelEvaluation.engineId` must be the Mortal
 *  engine. Fields with no independent payload provenance (modelTag,
 *  ModelEvaluation.engineVersion, mapperAdapter, factorPipeline) are
 *  intentionally NOT invented into checks. */
function validateProducerVersions(pkg: StructuredAnalysisPackage): void {
  // Provider-chain agreement (closure 1): WHO produced the model evidence.
  // The declaration must claim the canonical Mortal provider identity; the
  // provider-scoped verdict kind and the model evaluation engine are
  // cross-checked per decision.
  if (
    pkg.componentVersions.mortalSourceModel.identity !== MORTAL_PROVIDER_IDENTITY
  ) {
    throw new Error(
      "m6c_validator_provider_mismatch:mortalSourceModel:identity",
    );
  }
  for (const decision of pkg.decisions) {
    // analysisProvider.kind is schema-pinned to "mortal" by the literal
    // AnalysisProviderSchema — defense-in-depth, like the fact-engine checks.
    if (decision.analysisProvider.kind !== "mortal") {
      throw new Error(
        `m6c_validator_provider_mismatch:${decision.decisionId}:analysisProvider.kind`,
      );
    }
    if (decision.outcome !== "analysis_ready") continue;
    // ModelEvaluation.engineId admits a future "akagi_native" variant at the
    // schema level; a MORTAL package may not carry non-Mortal model evidence.
    if (decision.modelEvaluation.engineId !== "mortal") {
      throw new Error(
        `m6c_validator_provider_mismatch:${decision.decisionId}:engineId`,
      );
    }
  }

  // Evidence-registry provenance (builder-written, CR-3): a canonical_event
  // record's producerVersion IS the canonical replay version, and a
  // fact_engine_request record's producerVersion IS the fact-engine adapter
  // version — the registry may not contradict the package-level declaration.
  for (const [key, record] of Object.entries(pkg.evidenceRegistry)) {
    if (record.kind === "canonical_event") {
      if (record.producerVersion !== pkg.componentVersions.canonicalReplay) {
        throw new Error(
          `m6c_validator_producer_version_mismatch:canonicalReplay:${key}`,
        );
      }
    } else if (
      record.producerVersion !== pkg.componentVersions.factEngine.adapterVersion
    ) {
      throw new Error(
        `m6c_validator_producer_version_mismatch:factEngine:request:${key}`,
      );
    }
  }

  for (const decision of pkg.decisions) {
    if (decision.outcome !== "analysis_ready") continue;
    // Per-fact engine provenance: every FactorFact carrying engineIdentity
    // must agree with componentVersions.factEngine field-by-field. Today the
    // literal EngineIdentitySchema already pins both sides to the same
    // constants, so this is defense-in-depth that becomes live if the frozen
    // literal schema is ever relaxed (e.g. a second engine or versioned
    // adapter is admitted) — a schema-valid package can never claim arbitrary
    // fact-engine versions either way.
    for (const ledger of decision.candidateFactorLedgers) {
      for (const axis of ledger.axes) {
        for (const fact of axis.facts) {
          if (fact.engineIdentity === undefined) continue;
          assertEngineIdentityAgrees(
            fact.engineIdentity,
            pkg.componentVersions.factEngine,
            `factEngine:fact:${decision.decisionId}:${fact.factorKey}`,
          );
        }
      }
    }
    // Per-difference engine provenance.
    for (const difference of decision.factorDifferences) {
      if (difference.engineIdentity === undefined) continue;
      assertEngineIdentityAgrees(
        difference.engineIdentity,
        pkg.componentVersions.factEngine,
        `factEngine:difference:${decision.decisionId}:${difference.differenceId}`,
      );
    }
    // Mortal/model provenance: ModelEvaluation.adapterVersion is the Mortal
    // source adapter version — the same semantic value as
    // componentVersions.mortalSourceModel.version (both are the report's
    // adapterVersion / MORTAL_ADAPTER_VERSION in the producer chain).
    if (
      decision.modelEvaluation.adapterVersion !==
      pkg.componentVersions.mortalSourceModel.version
    ) {
      throw new Error(
        `m6c_validator_producer_version_mismatch:mortalSourceModel:${decision.decisionId}:adapterVersion`,
      );
    }
  }
}

function assertEngineIdentityAgrees(
  identity: EngineIdentity,
  declared: EngineIdentity,
  location: string,
): void {
  const fields: ReadonlyArray<readonly [string, string, string]> = [
    ["engine", identity.engine, declared.engine],
    ["upstreamCommit", identity.upstreamCommit, declared.upstreamCommit],
    ["adapterVersion", identity.adapterVersion, declared.adapterVersion],
    ["protocolVersion", identity.protocolVersion, declared.protocolVersion],
  ];
  for (const [field, actual, expected] of fields) {
    if (actual !== expected) {
      throw new Error(
        `m6c_validator_producer_version_mismatch:${location}:${field}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Evidence provenance references (Slice 3 semantic-integrity closure 6)
// ---------------------------------------------------------------------------

/** `EvidenceRecord.sourceRefs` are THEMSELVES provenance references and must
 *  not be allowed to dangle. For the frozen two-kind model:
 *
 *   canonical_event:      produced by the canonical replay producer
 *                         (CANONICAL_REPLAY_PRODUCER), sourceRefs EMPTY (the
 *                         canonical stream is the root authority);
 *   fact_engine_request:  produced by the fact-engine producer
 *                         (FACT_ENGINE_PRODUCER), every sourceRef resolves to
 *                         an evidenceRegistry entry of kind canonical_event,
 *                         and sourceRefs contain no duplicates.
 *
 *  Deliberately not a generic provenance graph: exactly the two frozen kinds,
 *  one reference direction (request → canonical events), no recursion. */
function validateEvidenceProvenance(pkg: StructuredAnalysisPackage): void {
  const registered = new Set(Object.keys(pkg.evidenceRegistry));
  for (const [key, record] of Object.entries(pkg.evidenceRegistry)) {
    if (record.kind === "canonical_event") {
      if (record.producer !== CANONICAL_REPLAY_PRODUCER) {
        throw new Error(`m6c_validator_evidence_producer:${key}`);
      }
      if (record.sourceRefs.length > 0) {
        throw new Error(`m6c_validator_evidence_source_refs_nonempty:${key}`);
      }
      continue;
    }
    // fact_engine_request
    if (record.producer !== FACT_ENGINE_PRODUCER) {
      throw new Error(`m6c_validator_evidence_producer:${key}`);
    }
    const seen = new Set<string>();
    for (const ref of record.sourceRefs) {
      if (seen.has(ref)) {
        throw new Error(
          `m6c_validator_evidence_source_ref_duplicate:${key}:${ref}`,
        );
      }
      seen.add(ref);
      const target = pkg.evidenceRegistry[ref];
      if (target === undefined) {
        throw new Error(
          `m6c_validator_evidence_source_ref_dangling:${key}:${ref}`,
        );
      }
      if (target.kind !== "canonical_event") {
        throw new Error(
          `m6c_validator_evidence_source_ref_kind:${key}:${ref}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Ready-decision reference integrity (Slice 3 review repair 2)
// ---------------------------------------------------------------------------

/** One `analysis_ready` decision = one internally coherent candidate universe:
 *  the StructuredComparisonSet, every candidate ledger, every FactorDifference
 *  and the ModelEvaluation must describe the SAME comparison. Invariants are
 *  frozen from what production actually guarantees (runBoundMortalDecisionReview
 *  + runStructuredFactorPipeline): one ledger per comparison candidate
 *  (blocked projections included), evaluation candidates = the model-origin
 *  candidates, differences / preference refs inside the candidate universe. */
function validateReadyDecisionReferences(
  decision: Extract<DecisionAnalysis, { outcome: "analysis_ready" }>,
): void {
  const comparison = decision.comparisonSet;
  const evaluation = decision.modelEvaluation;

  // Comparison identity: the model evaluation describes the SAME comparison.
  if (comparison.comparisonSetId !== evaluation.comparisonSetId) {
    throw new Error(
      `m6c_validator_comparison_identity:${decision.decisionId}:comparisonSetId`,
    );
  }
  if (comparison.decisionLayerRef !== evaluation.decisionLayerRef) {
    throw new Error(
      `m6c_validator_comparison_identity:${decision.decisionId}:decisionLayerRef`,
    );
  }

  // Candidate universe: the comparison set's candidate action refs, and the
  // legal scored-model subset (candidates carrying the model origin).
  const universe = new Set(
    comparison.candidates.map((candidate) => candidate.actionRef),
  );
  const modelCandidates = new Set(
    comparison.candidates
      .filter((candidate) => candidate.origins.includes("model"))
      .map((candidate) => candidate.actionRef),
  );

  // Candidate ledgers: production emits exactly one ledger per comparison
  // candidate, so the ledger refs must be a bijection onto the universe.
  const seenLedgerRefs = new Set<string>();
  for (const ledger of decision.candidateFactorLedgers) {
    if (seenLedgerRefs.has(ledger.actionRef)) {
      throw new Error(
        `m6c_validator_ledger_duplicate:${decision.decisionId}:${ledger.actionRef}`,
      );
    }
    seenLedgerRefs.add(ledger.actionRef);
    if (!universe.has(ledger.actionRef)) {
      throw new Error(
        `m6c_validator_ledger_candidate_extra:${decision.decisionId}:${ledger.actionRef}`,
      );
    }
  }
  for (const candidate of comparison.candidates) {
    if (!seenLedgerRefs.has(candidate.actionRef)) {
      throw new Error(
        `m6c_validator_ledger_candidate_missing:${decision.decisionId}:${candidate.actionRef}`,
      );
    }
  }

  // FactorDifference references (closure 3): differenceId values are unique
  // within the decision (they are the reference targets of
  // deterministicPreference.decisiveDifferenceIds), and both sides of every
  // difference belong to the candidate universe.
  const seenDifferenceIds = new Set<string>();
  for (const difference of decision.factorDifferences) {
    if (seenDifferenceIds.has(difference.differenceId)) {
      throw new Error(
        `m6c_validator_difference_duplicate:${decision.decisionId}:${difference.differenceId}`,
      );
    }
    seenDifferenceIds.add(difference.differenceId);
    if (!universe.has(difference.leftActionRef)) {
      throw new Error(
        `m6c_validator_difference_action_ref:${decision.decisionId}:${difference.leftActionRef}`,
      );
    }
    if (!universe.has(difference.rightActionRef)) {
      throw new Error(
        `m6c_validator_difference_action_ref:${decision.decisionId}:${difference.rightActionRef}`,
      );
    }
  }

  // DeterministicPreference refs belong to the candidate universe (production
  // derives the maximal set from the ledger/difference candidate refs), and
  // every decisiveDifferenceIds entry must resolve to a FactorDifference of
  // the SAME decision (closure 3 — reference-integrity only; which differences
  // SHOULD be decisive is never inferred or recomputed).
  if (decision.deterministicPreference !== null) {
    for (const actionRef of decision.deterministicPreference.actionRefs) {
      if (!universe.has(actionRef)) {
        throw new Error(
          `m6c_validator_preference_action_ref:${decision.decisionId}:${actionRef}`,
        );
      }
    }
    for (const differenceId of
      decision.deterministicPreference.decisiveDifferenceIds
    ) {
      if (!seenDifferenceIds.has(differenceId)) {
        throw new Error(
          `m6c_validator_preference_difference_ref:${decision.decisionId}:${differenceId}`,
        );
      }
    }
  }

  // ModelEvaluation action references resolve through the comparison set's
  // legal model/action correspondence (ADR-0001): scored entries and
  // preferences are model-origin candidates; the actual action is the
  // comparison set's actual candidate.
  const evaluationRefs = new Set(
    evaluation.candidates.map((candidate) => candidate.actionRef),
  );
  for (const candidate of evaluation.candidates) {
    if (!modelCandidates.has(candidate.actionRef)) {
      throw new Error(
        `m6c_validator_evaluation_action_ref:${decision.decisionId}:${candidate.actionRef}`,
      );
    }
  }
  // Closure 2: the model candidate universe is a TRUE BIJECTION — the
  // comparison set's model-origin candidates and the evaluation candidates are
  // the SAME set. Production builds the scores by filtering the model origin,
  // so a model-origin comparison candidate without a model score (or an
  // evaluation candidate outside the comparison set) is a contradiction. An
  // actual-only realization candidate (bound by correspondence) is NOT a
  // model-origin candidate and never requires a model score of its own.
  for (const ref of modelCandidates) {
    if (!evaluationRefs.has(ref)) {
      throw new Error(
        `m6c_validator_evaluation_candidate_missing:${decision.decisionId}:${ref}`,
      );
    }
  }
  for (const actionRef of evaluation.preferredActions) {
    if (!modelCandidates.has(actionRef)) {
      throw new Error(
        `m6c_validator_evaluation_action_ref:${decision.decisionId}:${actionRef}`,
      );
    }
  }
  if (!modelCandidates.has(evaluation.scoredActualModelActionRef)) {
    throw new Error(
      `m6c_validator_evaluation_action_ref:${decision.decisionId}:${evaluation.scoredActualModelActionRef}`,
    );
  }
  if (!universe.has(evaluation.actualActionRef)) {
    throw new Error(
      `m6c_validator_evaluation_action_ref:${decision.decisionId}:${evaluation.actualActionRef}`,
    );
  }
  const actualCandidates = comparison.candidates.filter((candidate) =>
    candidate.origins.includes("actual"),
  );
  if (
    actualCandidates.length === 1 &&
    evaluation.actualActionRef !== actualCandidates[0]!.actionRef
  ) {
    throw new Error(
      `m6c_validator_evaluation_action_ref:${decision.decisionId}:${evaluation.actualActionRef}`,
    );
  }

  // The scored actual-model carrier must match the comparison set's
  // actual↔model correspondence: when the actual realizes a model alternative
  // of different granularity (riichi_discard → declare_riichi, kakan → ankan,
  // ADR-0001), the scored carrier is the correspondence's scored model ref; a
  // directly scored actual carries its own ref. Actual and model refs are NOT
  // assumed identical.
  const correspondence = comparison.correspondences?.[0];
  const expectedScoredCarrier = correspondence === undefined
    ? evaluation.actualActionRef
    : correspondence.scoredModelActionRef;
  if (evaluation.scoredActualModelActionRef !== expectedScoredCarrier) {
    throw new Error(
      `m6c_validator_evaluation_action_ref:${decision.decisionId}:${evaluation.scoredActualModelActionRef}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Analysis-policy authority (Slice 3 review repair 3A)
// ---------------------------------------------------------------------------

/** `package.analysisPolicy` is the AUTHORITATIVE construction policy; every
 *  analysis_ready `ModelEvaluation.detailPolicy` must agree with it on the
 *  four semantic fields. The wall-clock `detailPolicy.frozenAt` is excluded
 *  from semantic identity (CR-5) and never compared. */
function validateAnalysisPolicy(pkg: StructuredAnalysisPackage): void {
  const policy = pkg.analysisPolicy;
  for (const decision of pkg.decisions) {
    if (decision.outcome !== "analysis_ready") continue;
    const detail = decision.modelEvaluation.detailPolicy;
    const checks: ReadonlyArray<readonly [string, unknown, unknown]> = [
      ["threshold", policy.threshold, detail.threshold],
      ["unit", policy.unit, detail.unit],
      ["boundary", policy.boundary, detail.boundary],
      ["policyVersion", policy.policyVersion, detail.policyVersion],
    ];
    for (const [field, expected, actual] of checks) {
      if (expected !== actual) {
        throw new Error(
          `m6c_validator_policy_mismatch:${decision.decisionId}:${field}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Record status truth (Slice 3 semantic-integrity closure 5)
// ---------------------------------------------------------------------------

/** `record.status` must TRUTHFULLY summarize the decisions using the shared
 *  builder derivation (`deriveRecordStatus`): any binding_mismatch /
 *  no_mortal_entry → integrity_failed; else any non-analysis_ready outcome →
 *  degraded; else complete. A package that lies about its aggregate status is
 *  rejected. Schema validity remains distinct from analysis completeness —
 *  the incomplete outcomes themselves never cause rejection, only a status
 *  that contradicts them does. */
function validateRecordStatus(pkg: StructuredAnalysisPackage): void {
  const expected = deriveRecordStatus(
    pkg.decisions.map((decision) => decision.analysisProvider.outcome),
  );
  if (pkg.record.status !== expected) {
    throw new Error("m6c_validator_status_mismatch");
  }
}

// ---------------------------------------------------------------------------
// Artifact identity recomputation (Slice 3 review repair 3B/3C)
// ---------------------------------------------------------------------------

/** `packageId` and `semanticContentHash` are independently recomputable from
 *  the package's own contents using the SAME shared derivation the builder
 *  uses (./analysis/package-identity.ts). Keeping a stale identity after
 *  mutating semantically meaningful content is a validation failure. */
function assertPackageIdentity(pkg: StructuredAnalysisPackage): void {
  const expectedPackageId = derivePackageId({
    analysisKey: pkg.analysisKey,
    componentVersions: pkg.componentVersions,
    analysisPolicy: pkg.analysisPolicy,
  });
  if (pkg.packageId !== expectedPackageId) {
    throw new Error("m6c_validator_package_id_mismatch");
  }
  const expectedHash = deriveSemanticContentHash({
    analysisKey: pkg.analysisKey,
    record: pkg.record,
    componentVersions: pkg.componentVersions,
    analysisPolicy: pkg.analysisPolicy,
    decisions: pkg.decisions,
    evidenceRegistry: pkg.evidenceRegistry,
  });
  if (pkg.semanticContentHash !== expectedHash) {
    throw new Error("m6c_validator_semantic_hash_mismatch");
  }
}

// ---------------------------------------------------------------------------
// validateStructuredAnalysisPackage
// ---------------------------------------------------------------------------

export function validateStructuredAnalysisPackage(input: unknown): void {
  // Spec-named rejections with dedicated messages, run on the RAW input before
  // schema parse so the failure names the offending key/artifact.
  rejectExplanationSideVersions(input);
  const llmKey = containsForbiddenKey(input, LLM_BOUNDARY_KEYS);
  if (llmKey !== null) {
    throw new Error(`m6c_validator_llm_boundary:${llmKey}`);
  }
  if (containsUrl(input)) {
    throw new Error(
      "m6c_validator_privileged_payload: package contains an http(s) URL",
    );
  }

  // SCHEMA VALIDITY (CR-6 split): a structurally valid package may faithfully
  // record an incomplete / failed analysis — no_mortal_entry and friends never
  // cause rejection here. Strict schemas reject unknown keys at every level.
  let pkg: StructuredAnalysisPackage;
  try {
    pkg = StructuredAnalysisPackageSchema.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`m6c_validator_schema:${message}`);
  }
  if (!isDeepStrictEqual(pkg, input)) {
    throw new Error(
      "m6c_validator_schema_normalization: schema parse must not reshape the package",
    );
  }

  // SERIALIZABILITY (CR-5 / Slice 3): the artifact survives JSON roundtrip.
  assertJsonRoundtrip(pkg);

  // VERSION VALIDATION (D4): no blank version; explanation-side versions were
  // already rejected on the raw input above.
  rejectBlankVersions(pkg);

  // RECORD-IDENTITY COHERENCE (CR-4) then CROSS-REFERENCE RESOLUTION (CR-3).
  validateIdentity(pkg);
  validateCrossReferences(pkg);

  // PRODUCER/PROVIDER PROVENANCE COHERENCE (repair 1 + closure 1):
  // componentVersions must agree with the payload's own producer
  // identity/version metadata and the Mortal provider chain.
  validateProducerVersions(pkg);

  // EVIDENCE PROVENANCE REFERENCES (closure 6): registry sourceRefs must not
  // dangle; producers must match the frozen two-kind chain.
  validateEvidenceProvenance(pkg);

  // READY-DECISION REFERENCE INTEGRITY (repair 2 + closure 2/3): one
  // analysis_ready decision = one internally coherent candidate universe.
  for (const decision of pkg.decisions) {
    if (decision.outcome === "analysis_ready") {
      validateReadyDecisionReferences(decision);
    }
  }

  // ANALYSIS-POLICY AUTHORITY (repair 3A): package.analysisPolicy is the
  // construction authority; every detailPolicy agrees with it.
  validateAnalysisPolicy(pkg);

  // RECORD STATUS TRUTH (closure 5): record.status is recomputed from the
  // decision outcomes and must match — a package may not lie about its
  // aggregate status (schema validity ≠ completeness is preserved).
  validateRecordStatus(pkg);

  // ARTIFACT IDENTITY (repair 3B/3C): packageId + semanticContentHash are
  // recomputed from the package's own contents and must match. Runs LAST so
  // every semantic tamper class surfaces its named error first.
  assertPackageIdentity(pkg);
}
