import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { digestOf, studyError } from "./canonical.mjs";

/**
 * Pre-declared run order and the append-only attempts ledger (spec §9.3).
 *
 * The schedule is written before any model call and is never adjusted. The
 * ledger is the duplicate-run guard: a failed, cancelled, or interrupted run
 * stays claimed, so it cannot be silently retried or removed from the
 * denominator.
 */
export const SELF_RAG_STUDY_SCHEDULE_VERSION = "selfrag-study-schedule/v1";
export const SELF_RAG_STUDY_ARMS = Object.freeze(["baseline", "selfrag"]);
export const SELF_RAG_STUDY_ATTEMPT_VERSION = "selfrag-study-attempt/v1";

export function buildSchedule(caseIds) {
  if (!Array.isArray(caseIds) || caseIds.length === 0) throw studyError("study_schedule_invalid", "caseIds");
  if (new Set(caseIds).size !== caseIds.length) throw studyError("study_schedule_invalid", "duplicate_case");
  const rows = [];
  let ordinal = 0;
  for (const caseId of caseIds) {
    for (const arm of SELF_RAG_STUDY_ARMS) {
      ordinal += 1;
      rows.push({ ordinal, caseId, arm });
    }
  }
  const schedule = { schemaVersion: SELF_RAG_STUDY_SCHEDULE_VERSION, cases: [...caseIds], rows };
  return Object.freeze({ ...schedule, digest: digestOf(schedule) });
}

export function assertScheduleShape(schedule, caseIds) {
  const expected = buildSchedule(caseIds);
  if (schedule?.schemaVersion !== expected.schemaVersion ||
      digestOf({ schemaVersion: schedule.schemaVersion, cases: schedule.cases, rows: schedule.rows }) !== expected.digest ||
      schedule.digest !== expected.digest) {
    throw studyError("study_schedule_mismatch");
  }
  return schedule;
}

/** Pure duplicate-run decision; IO is handled by `claimAttempt`. */
export function planAttempt({ existing, caseId, arm, pilotRerun = false }) {
  if (typeof caseId !== "string" || caseId.length === 0) throw studyError("study_attempt_invalid", "caseId");
  if (!SELF_RAG_STUDY_ARMS.includes(arm)) throw studyError("study_attempt_invalid", `arm:${arm}`);
  if (typeof pilotRerun !== "boolean") throw studyError("study_attempt_invalid", "pilotRerun");
  const previous = existing.filter((entry) => entry.caseId === caseId && entry.arm === arm);
  if (previous.length > 0 && !pilotRerun) throw studyError("study_attempt_duplicate", `${caseId}/${arm}`);
  return {
    caseId,
    arm,
    attempt: previous.length + 1,
    pilotRerun: previous.length > 0,
    key: `${caseId}/${arm}/${previous.length + 1}`,
  };
}

export async function readAttempts(ledgerPath, readFileImpl = readFile) {
  let text;
  try {
    text = await readFileImpl(ledgerPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const entries = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (line.trim().length === 0) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      throw studyError("study_attempt_ledger_corrupt", `line:${index + 1}`);
    }
    if (entry?.schemaVersion !== SELF_RAG_STUDY_ATTEMPT_VERSION) {
      throw studyError("study_attempt_ledger_corrupt", `line:${index + 1}`);
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * Claims an attempt before any provider request is made. The returned entry is
 * persisted immediately, so a crash leaves a claimed (not a retryable) run.
 */
export async function claimAttempt(input) {
  const ledgerPath = input.ledgerPath;
  if (typeof ledgerPath !== "string" || ledgerPath.length === 0) throw studyError("study_attempt_invalid", "ledgerPath");
  const existing = await readAttempts(ledgerPath, input.readFile);
  const plan = planAttempt({
    existing,
    caseId: input.caseId,
    arm: input.arm,
    pilotRerun: input.pilotRerun ?? false,
  });
  const entry = {
    schemaVersion: SELF_RAG_STUDY_ATTEMPT_VERSION,
    ...plan,
    phase: input.phase,
    status: "claimed",
    claimedAt: input.claimedAt ?? new Date().toISOString(),
  };
  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
  return entry;
}

/** Records the terminal state of a claimed attempt without deleting anything. */
export async function settleAttempt(input) {
  const entry = {
    schemaVersion: SELF_RAG_STUDY_ATTEMPT_VERSION,
    caseId: input.caseId,
    arm: input.arm,
    attempt: input.attempt,
    pilotRerun: input.pilotRerun ?? false,
    key: input.key,
    phase: input.phase,
    status: input.status,
    claimedAt: input.claimedAt,
    settledAt: input.settledAt ?? new Date().toISOString(),
    ...(input.failureCode === undefined ? {} : { failureCode: input.failureCode }),
    ...(input.runFile === undefined ? {} : { runFile: input.runFile }),
  };
  if (!["completed", "failed", "cancelled", "interrupted"].includes(entry.status)) {
    throw studyError("study_attempt_invalid", `status:${entry.status}`);
  }
  await mkdir(dirname(input.ledgerPath), { recursive: true });
  await appendFile(input.ledgerPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
  return entry;
}
