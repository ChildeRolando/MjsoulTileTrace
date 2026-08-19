/**
 * M6-C Slice 3 — `validateStructuredAnalysisPackage`: the package validator /
 * provenance gate (spec "Slice 3 — serialization / validator / provenance" and
 * "严格校验":  validator 做 schema 校验、引用完整性、版本字段非空、无 LLM
 * 产物字段、无 privileged 原始载荷、evidence registry 可解析；不因分析不完整
 * 拒绝 package).
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
 *     ReviewReport.
 *  5. CROSS-REFERENCE RESOLUTION (CR-3). Every evidence id referenced anywhere
 *     (KnownGameFacts, every candidate-ledger FactorFact, every
 *     FactorDifference, decision-level) resolves in `evidenceRegistry`, and
 *     the registry is locally complete (no unreferenced nodes).
 *  6. RECORD-IDENTITY COHERENCE (CR-4). `analysisKey`, every `decisionId` and
 *     every canonical-event evidence ref derive from `record.recordId` (the
 *     canonical stream's gameId) — no second record identity can exist in a
 *     valid package.
 *  7. SERIALIZABILITY (CR-5 / Slice 3). The package survives a JSON roundtrip
 *     unchanged; non-JSON values (NaN, undefined, BigInt, Date, ...) are
 *     rejected here, per the EvidenceRecord contract comment ("Payload
 *     JSON-serializability is validated at the serialization layer (Slice 3)").
 *
 * Error convention: every failure throws `m6c_validator_<kind>:<detail>`.
 */
import { isDeepStrictEqual } from "node:util";
import {
  parseCanonicalEventRef,
  StructuredAnalysisPackageSchema,
  type EvidenceRecord,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";

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
 *  second record identity can exist in a valid package. */
function validateIdentity(pkg: StructuredAnalysisPackage): void {
  const recordId = pkg.record.recordId;
  if (!pkg.analysisKey.startsWith(`analysis:${recordId}:actor${pkg.record.selfActor}:`)) {
    throw new Error(
      "m6c_validator_analysis_key_identity: analysisKey must derive from the canonical record identity and self actor",
    );
  }
  for (const decision of pkg.decisions) {
    if (!decision.decisionId.startsWith(`decision:${recordId}:`)) {
      throw new Error(
        `m6c_validator_decision_identity:${decision.decisionId}`,
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
}
