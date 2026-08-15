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
}

/** A (game, seat) pair with an existing successful Mortal report. */
export interface AcceptanceCachedSuccess {
  readonly gameId: string;
  readonly seat: number;
}

export type AcceptanceCheckpointStatus =
  | "pending"
  | "in_flight"
  | "succeeded"
  | "failed";

export interface AcceptanceCheckpointEntry {
  readonly gameId: string;
  readonly seat: number;
  readonly status: AcceptanceCheckpointStatus;
  readonly attempts: number;
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
  | "skip_budget_exhausted";

export interface PlannedAcceptanceItem {
  readonly gameId: string;
  readonly seat: number;
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

function pairKey(gameId: string, seat: number): string {
  return `${gameId}#${seat}`;
}

/**
 * Plan one acceptance run: preserve selection order, dedupe by (game, seat),
 * skip pairs whose successful report is already cached or checkpointed, and
 * cut off new submissions at the hard budget. Everything the runner must NOT
 * do is encoded here so the transport loop stays dumb.
 */
export function planAcceptanceRun(input: AcceptancePlanInput): PlannedAcceptanceItem[] {
  const cached = new Set(
    (input.cachedSuccesses ?? []).map((entry) => pairKey(entry.gameId, entry.seat)),
  );
  const checkpointByKey = new Map<string, AcceptanceCheckpointEntry>();
  for (const entry of input.checkpoint ?? []) {
    checkpointByKey.set(pairKey(entry.gameId, entry.seat), entry);
  }

  const seen = new Set<string>();
  let budgetRemaining = Math.max(0, Math.trunc(input.budget.maxRequestsPerRun));
  const plan: PlannedAcceptanceItem[] = [];

  for (const entry of input.selection) {
    const key = pairKey(entry.gameId, entry.seat);
    if (seen.has(key)) {
      plan.push({ ...entry, reason: "skip_duplicate", attempts: 0 });
      continue;
    }
    seen.add(key);
    if (cached.has(key)) {
      plan.push({ ...entry, reason: "skip_cached_success", attempts: 0 });
      continue;
    }
    const checkpointEntry = checkpointByKey.get(key);
    if (checkpointEntry?.status === "succeeded") {
      plan.push({
        ...entry,
        reason: "skip_checkpoint_succeeded",
        attempts: checkpointEntry.attempts,
      });
      continue;
    }
    if (budgetRemaining <= 0) {
      plan.push({
        ...entry,
        reason: "skip_budget_exhausted",
        attempts: checkpointEntry?.attempts ?? 0,
      });
      continue;
    }
    budgetRemaining -= 1;
    plan.push({
      ...entry,
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
): AcceptanceCheckpointEntry[] {
  const key = pairKey(gameId, seat);
  const next = checkpoint.filter((entry) => pairKey(entry.gameId, entry.seat) !== key);
  next.push({ gameId, seat, status, attempts });
  return next;
}
