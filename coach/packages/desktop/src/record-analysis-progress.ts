import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  createIdleRecordAnalysisSnapshot, RECORD_ANALYSIS_STAGES,
  RecordAnalysisProgressSchema, RecordAnalysisSnapshotSchema,
  type RecordAnalysisProgress, type RecordAnalysisSnapshot,
} from "./catalog-api.js";

// Operational timing only, never analysis evidence or a source identity.
const TimingSchema = z.object({
  stage: z.enum(RECORD_ANALYSIS_STAGES),
  elapsedMs: z.number().int().nonnegative().max(604_800_000),
  total: z.number().int().nonnegative().nullable(),
}).strict();
export const RecordAnalysisTimingHistorySchema = z.object({
  version: z.literal(1),
  samples: z.array(z.array(TimingSchema).length(7).refine(sample =>
    sample.every((timing, index) => timing.stage === RECORD_ANALYSIS_STAGES[index]))).max(5),
}).strict();
export type RecordAnalysisTimingHistory = z.infer<typeof RecordAnalysisTimingHistorySchema>;

export function createRecordAnalysisProgressTracker(input: {
  now?: () => number;
  history?: RecordAnalysisTimingHistory;
  onHistory?: (history: RecordAnalysisTimingHistory) => void;
} = {}) {
  const clock = input.now ?? (() => performance.now());
  let history = RecordAnalysisTimingHistorySchema.parse(input.history ?? { version: 1, samples: [] });
  let state = createIdleRecordAnalysisSnapshot();
  let startedAt = 0;
  let phaseStartedAt = 0;
  let lastNow = 0;
  const now = () => {
    const value = clock();
    if (!Number.isFinite(value)) throw new Error("analysis_progress_invalid");
    lastNow = Math.max(lastNow, value);
    return lastNow;
  };
  const activeIndex = () => RECORD_ANALYSIS_STAGES.findIndex(stage => stage === state.stage);
  const elapsed = (value: number) => Math.max(0, Math.floor(value));
  return {
    start(): void {
      state = createIdleRecordAnalysisSnapshot();
      startedAt = phaseStartedAt = now();
      state.stage = "fetching";
      state.steps[0]!.status = "running";
    },
    update(value: RecordAnalysisProgress): void {
      const update = RecordAnalysisProgressSchema.parse(value);
      if (["idle", "complete", "failed"].includes(state.stage)) return;
      const tick = now();
      const previousIndex = activeIndex();
      const index = RECORD_ANALYSIS_STAGES.findIndex(stage => stage === update.stage);
      if (update.stage === "idle" || (index >= 0 && index < previousIndex)
        || (index === previousIndex && update.completed < state.completed)) throw new Error("analysis_progress_invalid");
      const previous = state.steps[previousIndex]!;
      if (update.stage !== state.stage) {
        previous.elapsedMs = elapsed(tick - phaseStartedAt);
        previous.status = update.stage === "failed" ? "failed" : "complete";
        const nextIndex = index < 0 ? state.steps.length : index;
        if (update.stage !== "failed") {
          for (let skipped = previousIndex + 1; skipped < nextIndex; skipped++) state.steps[skipped]!.status = "skipped";
        }
        phaseStartedAt = tick;
      }
      state.stage = update.stage;
      state.completed = update.completed;
      state.total = update.total;
      if (index >= 0) Object.assign(state.steps[index]!, { status: "running", completed: update.completed, total: update.total });
      if (update.stage === "complete" || update.stage === "failed") {
        state.elapsedMs = elapsed(tick - startedAt);
        if (update.stage === "complete" && state.steps.every(step => step.status === "complete")) {
          const candidate = RecordAnalysisTimingHistorySchema.safeParse({ version: 1,
            samples: [...history.samples, state.steps.map(({ stage, elapsedMs, total }) => ({ stage, elapsedMs, total }))].slice(-5) });
          // Failure to save a timing reference cannot invalidate a review.
          if (candidate.success) {
            history = candidate.data;
            try { input.onHistory?.(structuredClone(history)); } catch { /* optional telemetry */ }
          }
        }
      }
    },
    snapshot(): RecordAnalysisSnapshot {
      const result = structuredClone(state);
      const index = activeIndex();
      if (index >= 0) {
        const tick = now();
        result.elapsedMs = elapsed(tick - startedAt);
        result.steps[index]!.elapsedMs = elapsed(tick - phaseStartedAt);
      }
      result.estimateSource = "learning";
      result.estimatedTotalMs = result.remainingMs = null;
      if (result.stage === "complete") {
        result.estimatedTotalMs = result.elapsedMs;
        result.remainingMs = 0;
        result.estimateSource = "history";
      } else if (index >= 0 && history.samples.length > 0) {
        const reference = history.samples[history.samples.length - 1]!;
        const rulesTotal = result.steps[2]!.total;
        const scale = rulesTotal !== null && reference[2]!.total !== null && reference[2]!.total! > 0
          ? rulesTotal / reference[2]!.total! : 1;
        let remaining = 0;
        for (let future = index; future < reference.length; future++) {
          const step = result.steps[future]!;
          const historical = reference[future]!;
          const amount = step.total !== null && historical.total !== null && historical.total > 0
            ? step.total / historical.total : (future >= 2 && future <= 4 ? scale : 1);
          let estimatedDuration = historical.elapsedMs * amount;
          if (future === index && step.completed >= 3 && step.total !== null && step.total > 0 && step.elapsedMs >= 1000) {
            estimatedDuration = step.elapsedMs / step.completed * step.total;
            result.estimateSource = "current_rate";
          }
          // A stage running past its reference remains visibly uncertain and
          // gets a rolling remainder; it never claims completion from time.
          remaining += future === index
            ? (step.elapsedMs >= estimatedDuration ? 1000 : estimatedDuration - step.elapsedMs)
            : estimatedDuration;
        }
        result.remainingMs = Math.min(Number.MAX_SAFE_INTEGER - result.elapsedMs, Math.ceil(remaining));
        result.estimatedTotalMs = result.elapsedMs + result.remainingMs;
        if (result.estimateSource === "learning") result.estimateSource = "history";
      }
      return RecordAnalysisSnapshotSchema.parse(result);
    },
  };
}
