/**
 * M6-C Slice 2: `buildStructuredAnalysisPackage` — the ONLY package build
 * entry (spec seam: "新增 seam = buildStructuredAnalysisPackage：直接消费整盘
 * review 结果，是 M6-C 唯一的构建入口；不新增第二套逐决策分析路径").
 *
 * The builder is a PURE PROJECTION over already-computed analysis:
 *
 *   coverage_ready review result (with retained full ready payloads)
 *   + canonical stream + replayed decisions (identity substrate)
 *   + component versions + explicit frozen policy snapshot
 *   → StructuredAnalysisPackage
 *
 * It is synchronous and its input type carries NO fact-engine port, NO Mortal
 * report fetch, and NO review service: assembling the package structurally
 * cannot re-run `runBoundMortalDecisionReview`, cannot call the fact engine,
 * and cannot access Mortal (spec Slice 2: "拼包过程不调用事实引擎、不访问
 * Mortal、不重跑 runBoundMortalDecisionReview"). One computation, one
 * authoritative artifact — never recompute.
 *
 * Identity semantics follow the frozen Slice 1 contract:
 *  - `decisionId` = game identity + self actor + surface + window kind +
 *    triggerEventRef (CR-4).
 *  - `analysisKey` = logical slot (record identity + self actor + provider),
 *    stable across model/fact-pipeline versions (CR-4 identity split).
 *  - `packageId` = artifact identity derived from analysisKey +
 *    componentVersions + the package-level analysis policy (CR-4). No
 *    wall-clock / artifact-creation metadata enters it.
 *  - `semanticContentHash` = deterministic content hash over the semantic
 *    content only; artifact creation metadata (createdAt, packageId and the
 *    wall-clock `detailPolicy.frozenAt` value) never participates (CR-5).
 *
 * Identity / hash derivation lives in the SHARED helper
 * `./package-identity.ts` (deriveAnalysisKey / derivePackageId /
 * deriveSemanticContentHash): the package validator (Slice 3 review repair
 * 3B/3C) recomputes packageId and semanticContentHash with the SAME functions
 * to independently verify the artifact.
 *
 * The evidence registry (CR-3) registers every referenced evidence id that
 * classifies into the frozen two kinds: canonical event refs (descriptor
 * resolved from the canonical stream, so the package is self-contained) and
 * production fact-engine request ids (kept as-is, no ID translation layer).
 * ANY referenced id outside those two vocabularies (e.g. opaque request
 * fragments such as stateHash / actionRef on legacy factor facts) fails the
 * build LOUDLY — a produced package may never embed an evidence id the
 * registry cannot resolve. The builder collects the CR-3 footprint from
 * KnownGameFacts, every candidate-ledger FactorFact, every FactorDifference
 * and the decision-level ids and verifies each one resolves.
 */
import {
  DecisionAnalysisSchema,
  FACT_ENGINE_ADAPTER_VERSION,
  FACT_ENGINE_PROTOCOL_VERSION,
  StructuredAnalysisPackageSchema,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type ComponentVersions,
  type DecisionAnalysis,
  type DetailPolicySnapshot,
  type EvidenceRegistry,
  type MortalDecisionOutcome,
  type RecordAnalysis,
  type StructuredAnalysisPackage,
  parseCanonicalEventRef,
} from "@riichi-coach/contracts";
import type { ReplayedDecision } from "../replay/stream-replayer.js";
import type {
  MortalFullGameLedgerEntry,
  MortalFullGameRetainedAnalysis,
  MortalFullGameReviewResult,
} from "./mortal-full-game-review.js";
import {
  deriveAnalysisKey,
  derivePackageId,
  deriveSemanticContentHash,
} from "./package-identity.js";

export type BuildStructuredAnalysisPackageInput = {
  /** The coverage_ready whole-game review result, with retained payloads. */
  readonly review: Extract<MortalFullGameReviewResult, { status: "coverage_ready" }>;
  /** The canonical stream the review consumed (identity + event descriptors).
   *  `stream.gameId` is the SOLE authority for the package's canonical record
   *  identity: `record.recordId`, `analysisKey` and every `decisionId` derive
   *  from it — no caller-supplied record id exists. */
  readonly stream: CanonicalEventStream;
  /** Self-surface replayed decisions, indexed by the review's decisionOrdinal. */
  readonly decisions: readonly ReplayedDecision[];
  /** Response-surface replayed decisions, indexed by the review's
   *  decisionOrdinal within the response partition. */
  readonly responseDecisions?: readonly ReplayedDecision[];
  /** Deterministic producer chain versions (D4) — explicit construction input. */
  readonly componentVersions: ComponentVersions;
  /** The frozen detail policy snapshot (threshold/unit/boundary/policyVersion/
   *  frozenAt) the review run used. Explicit construction input (CR-4/CR-5);
   *  participates in packageId, never in semanticContentHash. */
  readonly frozenPolicySnapshot: DetailPolicySnapshot;
  /** Wall-clock source for artifact creation metadata only (never identity). */
  readonly now?: () => number;
};

/** The analysis provider kind this package is scoped to (CR-2). */
const ANALYSIS_PROVIDER = "mortal" as const;

// ---------------------------------------------------------------------------
// Evidence classification (CR-3 / CR-4 namespace rules, Slice 1 review Blocker 2)
// ---------------------------------------------------------------------------

const FACT_ENGINE_REQUEST_SEGMENTS = [
  "hand13",
  "completed",
  "hand-structure",
  "risk",
] as const;

/** The fact-engine API segment embedded in a production request id
 *  (`<factSetId>:hand13:<hash>` etc.), or null when the id is not a
 *  fact-engine request id. */
function factEngineRequestSegment(id: string): string | null {
  for (const segment of FACT_ENGINE_REQUEST_SEGMENTS) {
    if (id.includes(`:${segment}:`)) return segment;
  }
  return null;
}

/** A canonical event's compact, renderer-safe descriptor: the ref plus the
 *  key public facts (type, actor, visible tile). The ref alone is not enough
 *  (CR-3: a bare eventRef that depends on the raw cache is not self-contained). */
function canonicalEventDescriptor(event: CanonicalGameEvent): Record<string, unknown> {
  const descriptor: Record<string, unknown> = {
    eventId: event.eventId,
    type: event.type,
  };
  if ("actor" in event && typeof event.actor === "number") {
    descriptor.actor = event.actor;
  }
  if (event.type === "tile_drawn" && event.tile.visibility === "visible") {
    descriptor.tile = event.tile.tile;
  } else if (event.type === "tile_discarded") {
    descriptor.tile = event.tile;
  } else if (event.type === "win_declared") {
    descriptor.tile = event.winningTile;
  }
  return descriptor;
}

type PendingRequestRecord = {
  kind: "fact_engine_request";
  segment: string;
  producerVersion: string | null;
  sourceRefs: string[];
};

/** Registry accumulator: canonical records keep a membership set (descriptors
 *  are resolved from the stream at assembly time); request records keep their
 *  descriptor parts until the assembly resolves producer versions. */
type RegistryAccumulator = {
  canonical: Set<string>;
  requests: Map<string, PendingRequestRecord>;
};

function classifyEvidenceIds(
  ids: readonly string[],
  accumulator: RegistryAccumulator,
  fallbackEngineVersion: string | null,
): string[] {
  const registered = new Set<string>();
  const canonicalRefsInSet = new Set<string>();
  for (const id of ids) {
    if (parseCanonicalEventRef(id) !== null) canonicalRefsInSet.add(id);
  }
  for (const id of ids) {
    if (parseCanonicalEventRef(id) !== null) {
      accumulator.canonical.add(id);
      registered.add(id);
      continue;
    }
    const segment = factEngineRequestSegment(id);
    if (segment !== null) {
      const existing = accumulator.requests.get(id);
      if (existing === undefined) {
        accumulator.requests.set(id, {
          kind: "fact_engine_request",
          segment,
          producerVersion: fallbackEngineVersion,
          sourceRefs: [...canonicalRefsInSet].sort(),
        });
      } else if (fallbackEngineVersion !== null && existing.producerVersion === null) {
        existing.producerVersion = fallbackEngineVersion;
      }
      registered.add(id);
      continue;
    }
    // CR-3 fail-loud: the frozen EvidenceKind vocabulary has exactly two
    // kinds (canonical_event, fact_engine_request). An id that classifies
    // into neither (e.g. an opaque request fragment such as stateHash /
    // actionRef / factSetId on a factor fact) could never resolve through
    // this package's registry, so the package must not be produced.
    throw new Error(`m6c_builder_unresolvable_evidence:${id}`);
  }
  return [...registered].sort();
}

// ---------------------------------------------------------------------------
// Decision projection (7-value outcome + payload binding, CR-2)
// ---------------------------------------------------------------------------

function decisionIdFor(input: {
  stream: CanonicalEventStream;
  surface: "self" | "response";
  windowKind: string;
  triggerEventRef: string;
}): string {
  return [
    "decision",
    input.stream.gameId,
    `self${input.stream.selfActor}`,
    input.surface,
    input.windowKind,
    input.triggerEventRef,
  ].join(":");
}

function recordStatusFor(
  outcomes: readonly MortalDecisionOutcome[],
): RecordAnalysis["status"] {
  if (outcomes.some((outcome) =>
    outcome === "binding_mismatch" || outcome === "no_mortal_entry"
  )) {
    // CR-6: no_mortal_entry keeps integrity-failure semantics; a binding
    // mismatch is a binding-integrity failure. Never disguise as success.
    return "integrity_failed";
  }
  if (outcomes.some((outcome) => outcome !== "analysis_ready")) {
    return "degraded";
  }
  return "complete";
}

function analysisProviderFor(
  row: MortalFullGameLedgerEntry,
): Record<string, unknown> {
  return {
    kind: ANALYSIS_PROVIDER,
    outcome: row.outcome,
    reason: row.reason,
    ...(row.singleCandidateProof === null || row.singleCandidateProof === undefined
      ? {}
      : { singleCandidateProof: row.singleCandidateProof }),
  };
}

function projectDecision(input: {
  stream: CanonicalEventStream;
  decision: ReplayedDecision;
  surface: "self" | "response";
  row: MortalFullGameLedgerEntry;
  retained: MortalFullGameRetainedAnalysis | null;
  accumulator: RegistryAccumulator;
}): unknown {
  const { stream, decision, surface, row, retained, accumulator } = input;
  const window = decision.snapshot.privateState.decisionWindow;
  const facts = decision.facts;

  const base = {
    decisionId: decisionIdFor({
      stream,
      surface,
      windowKind: window.kind,
      triggerEventRef: decision.decisionEventRef,
    }),
    surface,
    roundOrdinal: decision.snapshot.publicState.roundOrdinal,
    normalizedDecisionContext: {
      decisionWindowKind: window.kind,
      selfActor: facts.actor,
      triggerEventRef: decision.decisionEventRef,
      actualAction: decision.actualAction,
    },
    knownGameFacts: facts,
    analysisProvider: analysisProviderFor(row),
    outcome: row.outcome,
  };

  if (row.outcome !== "analysis_ready") {
    if (retained !== null) {
      throw new Error(
        `m6c_builder_internal: non-analysis_ready row has a retained payload (${row.outcome})`,
      );
    }
    // Failure / skipped decisions carry their reason/proof and NO analysis
    // payload; the discriminated union makes an analyzed shape impossible.
    classifyEvidenceIds(facts.evidenceIds, accumulator, null);
    return base;
  }

  if (retained === null) {
    throw new Error(
      "m6c_builder_missing_retained_payload: an analysis_ready ledger row has no retained full result",
    );
  }

  // Collect every evidence id this decision references (CR-3 footprint): the
  // known game facts, every candidate ledger fact, and every factor
  // difference. Registered ids become the decision-level footprint.
  const referencedIds: string[] = [...facts.evidenceIds];
  for (const ledger of retained.factorResult.ledgers) {
    for (const axis of ledger.axes) {
      for (const fact of axis.facts) {
        referencedIds.push(...fact.evidenceIds);
      }
    }
  }
  const differences = [
    ...retained.factorResult.differences.deterministic,
    ...retained.factorResult.differences.heuristic,
  ];
  for (const difference of differences) {
    referencedIds.push(...difference.evidenceIds);
  }

  const fallbackEngineVersion =
    retained.factorResult.ledgers.flatMap((ledger) =>
      ledger.axes.flatMap((axis) => axis.facts)
    ).find((fact) => fact.engineIdentity !== undefined)?.engineIdentity
      ?.adapterVersion ?? null;

  const registeredIds = classifyEvidenceIds(
    referencedIds,
    accumulator,
    fallbackEngineVersion ?? FACT_ENGINE_ADAPTER_VERSION,
  );
  if (registeredIds.length === 0) {
    throw new Error(
      "m6c_builder_no_resolvable_evidence: an analysis_ready decision references no registry-resolvable evidence",
    );
  }

  return {
    ...base,
    comparisonSet: retained.comparisonSet,
    candidateFactorLedgers: retained.factorResult.ledgers,
    factorDifferences: differences,
    deterministicPreference: retained.factorResult.deterministicPreference,
    modelEvaluation: retained.modelEvaluation,
    evidenceIds: registeredIds,
  };
}

// ---------------------------------------------------------------------------
// buildStructuredAnalysisPackage
// ---------------------------------------------------------------------------

export function buildStructuredAnalysisPackage(
  input: BuildStructuredAnalysisPackageInput,
): StructuredAnalysisPackage {
  const now = input.now ?? Date.now;
  const stream = input.stream;
  const responseDecisions = input.responseDecisions ?? [];

  if (input.review.status !== "coverage_ready") {
    throw new Error("m6c_builder_requires_coverage_ready_review");
  }
  if (stream.selfActor !== input.decisions[0]?.snapshot.selfActor) {
    // Defensive: the review already validated this; the builder stays total.
    throw new Error("m6c_builder_stream_actor_mismatch");
  }

  // Index the retained full payloads by surface + decisionOrdinal (the same
  // keys the ledger rows carry) — the only analysis inputs the builder may
  // consume. No engine, no report, no review service is reachable from here.
  const retainedByKey = new Map<string, MortalFullGameRetainedAnalysis>();
  for (const retained of input.review.retainedAnalyses) {
    retainedByKey.set(`${retained.surface}:${retained.decisionOrdinal}`, retained);
  }

  const accumulator: RegistryAccumulator = {
    canonical: new Set(),
    requests: new Map(),
  };

  const projectedDecisions: unknown[] = [];
  for (const row of input.review.decisions) {
    const partition =
      row.surface === "self" ? input.decisions : responseDecisions;
    const decision = partition[row.decisionOrdinal];
    if (decision === undefined) {
      throw new Error(
        `m6c_builder_decision_missing:${row.surface}:${row.decisionOrdinal}`,
      );
    }
    const retained = retainedByKey.get(`${row.surface}:${row.decisionOrdinal}`) ?? null;
    projectedDecisions.push(projectDecision({
      stream,
      decision,
      surface: row.surface,
      row,
      retained,
      accumulator,
    }));
  }
  if (projectedDecisions.length === 0) {
    throw new Error("m6c_builder_no_decisions");
  }

  // Resolve canonical event descriptors from the stream so the package is a
  // self-contained audit artifact (CR-3). A canonical ref the stream does not
  // carry fails loud rather than silently degrading the descriptor.
  const registry: EvidenceRegistry = {};
  for (const id of [...accumulator.canonical].sort()) {
    const event = stream.events.find((candidate) => candidate.eventId === id);
    if (event === undefined) {
      throw new Error(`m6c_builder_canonical_event_missing:${id}`);
    }
    registry[id] = {
      evidenceId: id,
      kind: "canonical_event",
      producer: "canonical-replay",
      producerVersion: input.componentVersions.canonicalReplay,
      sourceRefs: [],
      payload: canonicalEventDescriptor(event),
    };
  }
  for (const [id, pending] of [...accumulator.requests.entries()].sort(
    ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
  )) {
    registry[id] = {
      evidenceId: id,
      kind: pending.kind,
      producer: "fact-engine",
      producerVersion: pending.producerVersion ?? FACT_ENGINE_PROTOCOL_VERSION,
      sourceRefs: pending.sourceRefs,
      payload: { requestId: id, kind: pending.segment },
    };
  }

  const selfActor = stream.selfActor;
  // Single record-identity authority (Fix 2): the canonical stream's gameId
  // IS the package's canonical record identity — record.recordId, analysisKey
  // and every decisionId derive from it, so no caller-supplied record id can
  // ever disagree with the evidence the package embeds.
  const recordId = stream.gameId;
  const analysisKey = deriveAnalysisKey({
    recordId,
    selfActor,
    provider: ANALYSIS_PROVIDER,
  });
  // The package-level construction policy (Slice 3 review repair 3A): the
  // AUTHORITATIVE semantic policy snapshot, derived from the explicit frozen
  // policy input. The wall-clock frozenAt is artifact-creation metadata
  // (CR-4/CR-5) and never participates in identity — it lives only in each
  // ModelEvaluation.detailPolicy.frozenAt.
  const frozenPolicy = input.frozenPolicySnapshot;
  const analysisPolicy = {
    threshold: frozenPolicy.threshold,
    unit: frozenPolicy.unit,
    boundary: frozenPolicy.boundary,
    policyVersion: frozenPolicy.policyVersion,
  };
  // packageId = analysisKey + componentVersions + analysisPolicy (shared
  // derivation, ./package-identity.ts): the artifact reference is stable
  // across reruns for the same semantic snapshot, while a different
  // model/fact-pipeline version still yields a different packageId.
  const packageId = derivePackageId({
    analysisKey,
    componentVersions: input.componentVersions,
    analysisPolicy,
  });

  const record: RecordAnalysis = {
    recordId,
    selfActor,
    status: recordStatusFor(input.review.decisions.map((row) => row.outcome)),
  };

  const decisions = projectedDecisions.map((decision) =>
    DecisionAnalysisSchema.parse(decision) as DecisionAnalysis,
  );

  const semanticContentHash = deriveSemanticContentHash({
    analysisKey,
    record,
    componentVersions: input.componentVersions,
    analysisPolicy,
    decisions,
    evidenceRegistry: registry,
  });

  return StructuredAnalysisPackageSchema.parse({
    analysisKey,
    packageId,
    createdAt: new Date(now()).toISOString(),
    semanticContentHash,
    record,
    componentVersions: input.componentVersions,
    analysisPolicy,
    decisions,
    evidenceRegistry: registry,
  });
}
