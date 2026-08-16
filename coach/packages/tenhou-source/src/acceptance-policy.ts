/**
 * §15 acceptance submission policy — pure planning, no network.
 *
 * The acceptance runner submits independent paipu/seats to Mortal strictly
 * sequentially with conservative delays and deterministic seeded jitter,
 * checkpoints every state transition, caches existing successful reports and
 * never resubmits them, dedupes by (game, seat), and obeys a hard per-run
 * request budget. Mortal is a scarce acceptance oracle, never a rare-event
 * search engine — every rule in this module exists to keep it that way.
 *
 * This module owns ONLY the policy. Transport (fetch/report submission) is
 * injected by the CLI so the package stays free of network behavior.
 */

export interface AcceptanceSelectionEntry {
  readonly gameId: string;
  readonly seat: number;
  /**
   * Local pipeline that owns this pair's canonical side (§13 identity).
   * Omitted means "tenhou" (the legacy, pre-correction form); the Mahjong
   * Soul adapter MUST set "mahjong_soul" explicitly so same-digest pairs
   * from the two platforms never collide.
   */
  readonly sourceType?: "tenhou" | "mahjong_soul";
}

/** A (game, seat) pair with an existing successful Mortal report. */
export interface AcceptanceCachedSuccess {
  readonly gameId: string;
  readonly seat: number;
  readonly sourceType?: "tenhou" | "mahjong_soul";
}

export type AcceptanceCheckpointStatus =
  | "pending"
  | "in_flight"
  | "succeeded"
  | "failed";

export interface AcceptanceCheckpointEntry {
  readonly gameId: string;
  readonly seat: number;
  /** §13 source-aware identity; omitted = legacy "tenhou". */
  readonly sourceType?: "tenhou" | "mahjong_soul";
  readonly status: AcceptanceCheckpointStatus;
  readonly attempts: number;
  /**
   * A failure the runner will never retry (e.g. a deterministic local-stage
   * failure). Terminal failures must not consume submission budget: the
   * runner refuses to execute them, so a plan slot spent on one is a slot
   * taken from a viable pair for nothing.
   */
  readonly terminal?: boolean;
}

export interface AcceptanceBudget {
  /** Hard cap on NEW submissions in one run. */
  readonly maxRequestsPerRun: number;
  /** Conservative base delay between requests. */
  readonly baseDelayMs: number;
  /** Deterministic jitter window (0..jitterMs, seeded — never Math.random). */
  readonly jitterMs: number;
  /** Seed for the deterministic jitter sequence. */
  readonly seed: number;
}

export type AcceptancePlanReason =
  | "submit"
  | "skip_duplicate"
  | "skip_cached_success"
  | "skip_checkpoint_succeeded"
  | "skip_terminal_failure"
  | "skip_budget_exhausted";

export interface PlannedAcceptanceItem {
  readonly gameId: string;
  readonly seat: number;
  /** §13 source-aware identity (spelled out on every planned item). */
  readonly sourceType: "tenhou" | "mahjong_soul";
  readonly reason: AcceptancePlanReason;
  /** Carry-over attempt count from the checkpoint, for the next checkpoint. */
  readonly attempts: number;
}

export interface AcceptancePlanInput {
  readonly selection: readonly AcceptanceSelectionEntry[];
  readonly cachedSuccesses?: readonly AcceptanceCachedSuccess[];
  readonly checkpoint?: readonly AcceptanceCheckpointEntry[];
  readonly budget: AcceptanceBudget;
}

type PolicySourceType = NonNullable<AcceptanceSelectionEntry["sourceType"]>;

function entrySource(
  entry: { readonly sourceType?: PolicySourceType },
): PolicySourceType {
  return entry.sourceType ?? "tenhou";
}

function pairKey(
  gameId: string,
  seat: number,
  sourceType: PolicySourceType = "tenhou",
): string {
  return `${sourceType}:${gameId}#${seat}`;
}

/**
 * Plan one acceptance run: preserve selection order, dedupe by
 * (sourceType, gameId, seat), skip pairs whose successful report is already
 * cached or checkpointed, and cut off new submissions at the hard budget.
 * Everything the runner must NOT do is encoded here so the transport loop
 * stays dumb.
 */
export function planAcceptanceRun(input: AcceptancePlanInput): PlannedAcceptanceItem[] {
  const cached = new Set(
    (input.cachedSuccesses ?? []).map(
      (entry) => pairKey(entry.gameId, entry.seat, entrySource(entry)),
    ),
  );
  const checkpointByKey = new Map<string, AcceptanceCheckpointEntry>();
  for (const entry of input.checkpoint ?? []) {
    checkpointByKey.set(pairKey(entry.gameId, entry.seat, entrySource(entry)), entry);
  }

  const seen = new Set<string>();
  let budgetRemaining = Math.max(0, Math.trunc(input.budget.maxRequestsPerRun));
  const plan: PlannedAcceptanceItem[] = [];

  for (const entry of input.selection) {
    const sourceType = entrySource(entry);
    const key = pairKey(entry.gameId, entry.seat, sourceType);
    if (seen.has(key)) {
      plan.push({ ...entry, sourceType, reason: "skip_duplicate", attempts: 0 });
      continue;
    }
    seen.add(key);
    if (cached.has(key)) {
      plan.push({ ...entry, sourceType, reason: "skip_cached_success", attempts: 0 });
      continue;
    }
    const checkpointEntry = checkpointByKey.get(key);
    if (checkpointEntry?.status === "succeeded") {
      plan.push({
        ...entry,
        sourceType,
        reason: "skip_checkpoint_succeeded",
        attempts: checkpointEntry.attempts,
      });
      continue;
    }
    if (checkpointEntry?.status === "failed" && checkpointEntry.terminal === true) {
      plan.push({
        ...entry,
        sourceType,
        reason: "skip_terminal_failure",
        attempts: checkpointEntry.attempts,
      });
      continue;
    }
    if (budgetRemaining <= 0) {
      plan.push({
        ...entry,
        sourceType,
        reason: "skip_budget_exhausted",
        attempts: checkpointEntry?.attempts ?? 0,
      });
      continue;
    }
    budgetRemaining -= 1;
    plan.push({
      ...entry,
      sourceType,
      reason: "submit",
      attempts: (checkpointEntry?.attempts ?? 0) + 1,
    });
  }
  return plan;
}

/** Deterministic seeded LCG step (mulberry32-style single round). */
function lcg(state: number): number {
  return (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
}

/**
 * Delay before the (1-based) request ordinal: base + seeded jitter in
 * [0, jitterMs]. Same seed ⇒ same schedule, so runs are reproducible and
 * auditable; jitter only ever slows the run down (conservative by design).
 */
export function delayBeforeRequestMs(
  requestOrdinal: number,
  budget: AcceptanceBudget,
): number {
  if (!Number.isInteger(requestOrdinal) || requestOrdinal < 1) {
    throw new RangeError("requestOrdinal must be a positive integer");
  }
  let state = budget.seed >>> 0;
  for (let step = 0; step < requestOrdinal; step += 1) {
    state = lcg(state);
  }
  const jitter = budget.jitterMs > 0 ? state % (budget.jitterMs + 1) : 0;
  return Math.max(0, Math.trunc(budget.baseDelayMs)) + jitter;
}

/** Record a transition into a checkpoint list (returns the updated list). */
export function updateCheckpoint(
  checkpoint: readonly AcceptanceCheckpointEntry[],
  gameId: string,
  seat: number,
  status: AcceptanceCheckpointStatus,
  attempts: number,
  sourceType: PolicySourceType = "tenhou",
): AcceptanceCheckpointEntry[] {
  const key = pairKey(gameId, seat, sourceType);
  const next = checkpoint.filter(
    (entry) => pairKey(entry.gameId, entry.seat, entrySource(entry)) !== key,
  );
  next.push({ gameId, seat, sourceType, status, attempts });
  return next;
}
