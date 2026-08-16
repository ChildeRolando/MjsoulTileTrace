/**
 * M6-A3 §5 — resumable acceptance checkpoint states.
 *
 * Every (game, seat) acceptance pair walks one fixed pipeline so an
 * interrupted run resumes exactly where it stopped:
 *
 *   local_ready → mortal_submission_pending → mortal_submitted →
 *   report_pending → report_ready → review_complete → accepted
 *
 * Any non-terminal state may fail (terminal `failed`, carrying an opaque
 * reason code — never a secret or a locator); `retry` moves a failed pair
 * back to local_ready under the same per-run budget that governs new
 * submissions. `accepted` is terminal: a cached success is never
 * resubmitted (§4).
 *
 * This module owns ONLY the state shapes and transition legality. File I/O,
 * network transport, and evidence hashing live in the CLI runner. Nothing
 * here can talk to Mortal, and no field here may carry a report id, URL,
 * account id, or raw record bytes (§15) — the runner keeps those in the
 * private cache files, never in the checkpoint.
 */
import type { AcceptanceBudget } from "./acceptance-policy.js";

export const MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION =
  "mortal-acceptance-checkpoint/v1" as const;

/**
 * Local pipelines allowed to own an acceptance pair's canonical side. This
 * MUST stay in lockstep with reasoning's MORTAL_COVERAGE_LOCAL_SOURCE_TYPES
 * (the manifest schema's authority) — a test pins the two unions together.
 * §13: pair identity is source-aware, so the same content digest arriving
 * via two platforms is TWO pairs, never one colliding entry.
 */
export const ACCEPTANCE_LOCAL_SOURCE_TYPES = ["tenhou", "mahjong_soul"] as const;

export type AcceptanceLocalSourceType =
  (typeof ACCEPTANCE_LOCAL_SOURCE_TYPES)[number];

/** Legacy normalization: checkpoints written before source-aware identity
 *  exist only from the Tenhou runner, so a missing sourceType parses as
 *  "tenhou" (resumability preserved; anything else fails closed). */
function normalizeLegacyPairRecord(
  record: MortalAcceptancePairRecord,
): MortalAcceptancePairRecord {
  return record.sourceType === undefined
    ? { ...record, sourceType: "tenhou" }
    : record;
}

export const MORTAL_ACCEPTANCE_PIPELINE_STATES = [
  "local_ready",
  "mortal_submission_pending",
  "mortal_submitted",
  "report_pending",
  "report_ready",
  "review_complete",
  "accepted",
] as const;

export type MortalAcceptancePipelineState =
  (typeof MORTAL_ACCEPTANCE_PIPELINE_STATES)[number];

export type MortalAcceptanceState =
  | MortalAcceptancePipelineState
  | "failed";

export type AcceptanceTransitionEvent =
  | "select_for_submission"
  | "submission_confirmed"
  | "poll_started"
  | "report_fetched"
  | "review_finished"
  | "evidence_recorded"
  | "retry"
  | "fail";

const TRANSITIONS: Readonly<
  Record<MortalAcceptanceState, Partial<Record<AcceptanceTransitionEvent, MortalAcceptanceState>>>
> = {
  local_ready: {
    select_for_submission: "mortal_submission_pending",
    fail: "failed",
  },
  mortal_submission_pending: {
    submission_confirmed: "mortal_submitted",
    fail: "failed",
  },
  mortal_submitted: {
    poll_started: "report_pending",
    fail: "failed",
  },
  report_pending: {
    report_fetched: "report_ready",
    fail: "failed",
  },
  report_ready: {
    review_finished: "review_complete",
    fail: "failed",
  },
  review_complete: {
    evidence_recorded: "accepted",
    fail: "failed",
  },
  accepted: {},
  failed: { retry: "local_ready" },
};

export function isTerminalAcceptanceState(state: MortalAcceptanceState): boolean {
  return state === "accepted" || state === "failed";
}

export function canTransitionAcceptance(
  from: MortalAcceptanceState,
  event: AcceptanceTransitionEvent,
): boolean {
  return TRANSITIONS[from][event] !== undefined;
}

/**
 * Apply one transition. Illegal transitions throw — a runner that tries to
 * skip a stage (e.g. claim `accepted` straight from `report_ready`) is a
 * bug, and the checkpoint must fail closed rather than record it.
 */
export function transitionAcceptanceState(
  from: MortalAcceptanceState,
  event: AcceptanceTransitionEvent,
): MortalAcceptanceState {
  if (!canTransitionAcceptance(from, event)) {
    throw new Error(`acceptance_transition_invalid:${from}:${event}`);
  }
  return TRANSITIONS[from][event]!;
}

/** One (game, seat) pair's resumable state. Opaque fields only (§15). */
export interface MortalAcceptancePairRecord {
  /** Opaque content-hash game id — never a raw record id or file name. */
  readonly gameId: string;
  /** Which local pipeline owns this pair's canonical side (§13 identity). */
  readonly sourceType?: AcceptanceLocalSourceType;
  readonly seat: number;
  readonly state: MortalAcceptanceState;
  /** Submission attempts (new submissions + retries) charged to this pair. */
  readonly attempts: number;
  /** Opaque failure code; required iff state === "failed". */
  readonly failureReason: string | null;
  /** sha256 of the redacted acceptance artifact; required iff accepted. */
  readonly evidenceHash: string | null;
  /** Version tag of the acceptance run that recorded the evidence. */
  readonly evidenceVersion: string | null;
  /** Branches lifted by this pair's accepted sample (subset of the matrix). */
  readonly branches: readonly string[];
  /** ISO timestamp of the last transition (audit only). */
  readonly updatedAt: string | null;
}

export interface MortalAcceptanceCheckpointFile {
  readonly schemaVersion: typeof MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION;
  /** The budget this checkpoint has already charged new submissions against. */
  readonly budget: AcceptanceBudget | null;
  readonly pairs: readonly MortalAcceptancePairRecord[];
}

export function createEmptyAcceptanceCheckpoint(): MortalAcceptanceCheckpointFile {
  return { schemaVersion: MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION, budget: null, pairs: [] };
}

function validatePairRecord(record: MortalAcceptancePairRecord): void {
  if (record.gameId.length === 0) {
    throw new Error("acceptance_checkpoint_invalid:game_id_empty");
  }
  if (
    record.sourceType !== undefined
    && !(ACCEPTANCE_LOCAL_SOURCE_TYPES as readonly string[]).includes(record.sourceType)
  ) {
    throw new Error("acceptance_checkpoint_invalid:source_type_unknown");
  }
  if (!Number.isInteger(record.seat) || record.seat < 0 || record.seat > 3) {
    throw new Error("acceptance_checkpoint_invalid:seat_out_of_range");
  }
  if (!Number.isInteger(record.attempts) || record.attempts < 0) {
    throw new Error("acceptance_checkpoint_invalid:attempts_negative");
  }
  if (record.state === "accepted") {
    if (record.evidenceHash === null || record.evidenceVersion === null) {
      throw new Error("acceptance_checkpoint_invalid:accepted_without_evidence");
    }
    if (record.failureReason !== null) {
      throw new Error("acceptance_checkpoint_invalid:accepted_with_failure_reason");
    }
  } else if (record.evidenceHash !== null || record.evidenceVersion !== null) {
    throw new Error("acceptance_checkpoint_invalid:evidence_on_unaccepted_pair");
  }
  if (record.state === "failed" && record.failureReason === null) {
    throw new Error("acceptance_checkpoint_invalid:failed_without_reason");
  }
  if (record.state !== "failed" && record.failureReason !== null) {
    throw new Error("acceptance_checkpoint_invalid:reason_on_live_pair");
  }
}

/** §13 identity: (sourceType, gameId, seat). Absent sourceType is the
 *  legacy Tenhou-only form; anything written after the source-policy
 *  correction carries it explicitly. */
function pairSource(pair: MortalAcceptancePairRecord): AcceptanceLocalSourceType {
  return pair.sourceType ?? "tenhou";
}

function samePairIdentity(
  a: MortalAcceptancePairRecord,
  gameId: string,
  seat: number,
  sourceType: AcceptanceLocalSourceType,
): boolean {
  return a.gameId === gameId && a.seat === seat && pairSource(a) === sourceType;
}

/**
 * Replace (or insert) one pair record, keyed by (sourceType, gameId, seat).
 * Every record is validated before it enters the checkpoint: a hand-edited
 * or corrupt checkpoint fails closed at the next write/load instead of
 * silently recording an impossible state (e.g. accepted without evidence).
 */
export function upsertAcceptancePair(
  checkpoint: MortalAcceptanceCheckpointFile,
  record: MortalAcceptancePairRecord,
): MortalAcceptanceCheckpointFile {
  validatePairRecord(record);
  const sourceType = pairSource(record);
  const next = checkpoint.pairs.filter(
    (pair) => !samePairIdentity(pair, record.gameId, record.seat, sourceType),
  );
  next.push(record);
  return {
    ...checkpoint,
    pairs: next.sort((a, b) =>
      a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : a.seat - b.seat,
    ),
  };
}

export function findAcceptancePair(
  checkpoint: MortalAcceptanceCheckpointFile,
  gameId: string,
  seat: number,
  sourceType: AcceptanceLocalSourceType = "tenhou",
): MortalAcceptancePairRecord | null {
  return checkpoint.pairs.find(
    (pair) => samePairIdentity(pair, gameId, seat, sourceType),
  ) ?? null;
}

/** Parse and validate a loaded checkpoint file; anything else fails closed. */
export function parseAcceptanceCheckpointFile(json: unknown): MortalAcceptanceCheckpointFile {
  if (typeof json !== "object" || json === null) {
    throw new Error("acceptance_checkpoint_invalid:not_an_object");
  }
  const candidate = json as Partial<MortalAcceptanceCheckpointFile>;
  if (candidate.schemaVersion !== MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION) {
    throw new Error("acceptance_checkpoint_invalid:schema_version");
  }
  if (!Array.isArray(candidate.pairs)) {
    throw new Error("acceptance_checkpoint_invalid:pairs_not_array");
  }
  const file: MortalAcceptanceCheckpointFile = {
    schemaVersion: MORTAL_ACCEPTANCE_CHECKPOINT_SCHEMA_VERSION,
    budget: candidate.budget ?? null,
    pairs: candidate.pairs.map(normalizeLegacyPairRecord),
  };
  for (const pair of file.pairs) validatePairRecord(pair);
  return file;
}
