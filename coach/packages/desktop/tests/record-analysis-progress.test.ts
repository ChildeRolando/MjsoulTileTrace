import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRecordAnalysisProgressTracker, type RecordAnalysisTimingHistory } from "../src/record-analysis-progress.js";
import { createRecordAnalysisTimingStore } from "../src/record-analysis-timing-store.js";
import { RECORD_ANALYSIS_STAGES, RecordAnalysisSnapshotSchema } from "../src/catalog-api.js";

describe("main-owned analysis phase history and estimates", () => {
  const history: RecordAnalysisTimingHistory = { version: 1, samples: [[
    { stage: "fetching", elapsedMs: 100, total: null },
    { stage: "replaying", elapsedMs: 200, total: null },
    { stage: "rules", elapsedMs: 1_000, total: 100 },
    { stage: "scoring", elapsedMs: 8_000, total: 20 },
    { stage: "facts", elapsedMs: 4_000, total: 100 },
    { stage: "packaging", elapsedMs: 500, total: null },
    { stage: "saving", elapsedMs: 300, total: null },
  ]] };

  it("keeps completed phase counts and durations without requiring a poll", () => {
    let tick = 0;
    const saved: RecordAnalysisTimingHistory[] = [];
    const tracker = createRecordAnalysisProgressTracker({ now: () => tick, onHistory: sample => saved.push(sample) });
    tracker.start();
    for (const [index, stage] of RECORD_ANALYSIS_STAGES.entries()) {
      tracker.update({ stage, completed: 0, total: 5 });
      tick += (index + 1) * 100;
      tracker.update({ stage, completed: 5, total: 5 });
    }
    tracker.update({ stage: "complete", completed: 1, total: 1 });
    const snapshot = tracker.snapshot();
    expect(snapshot.steps.map(step => [step.status, step.completed, step.elapsedMs])).toEqual(
      RECORD_ANALYSIS_STAGES.map((_, index) => ["complete", 5, (index + 1) * 100]));
    expect(snapshot.elapsedMs).toBe(2800);
    expect(snapshot.remainingMs).toBe(0);
    expect(saved).toHaveLength(1);
    tick += 100_000;
    expect(tracker.snapshot()).toEqual(snapshot);
    tracker.update({ stage: "facts", completed: 1, total: 5 });
    expect(tracker.snapshot()).toEqual(snapshot);
  });

  it("distinguishes unmeasured cold start, same-machine history and observed current rate", () => {
    let tick = 0;
    const cold = createRecordAnalysisProgressTracker({ now: () => tick });
    cold.start();
    tick = 1000;
    expect(cold.snapshot()).toMatchObject({ estimateSource: "learning", estimatedTotalMs: null, remainingMs: null, elapsedMs: 1000 });
    const tracker = createRecordAnalysisProgressTracker({ now: () => tick, history });
    tracker.start();
    expect(tracker.snapshot()).toMatchObject({ estimateSource: "history", estimatedTotalMs: 14100, remainingMs: 14100 });
    tick += 100;
    tracker.update({ stage: "replaying", completed: 0, total: null });
    tick += 200;
    tracker.update({ stage: "rules", completed: 0, total: 200 });
    tick += 1500;
    tracker.update({ stage: "rules", completed: 50, total: 200 });
    const observed = tracker.snapshot();
    expect(observed).toMatchObject({ estimateSource: "current_rate", elapsedMs: 1800, remainingMs: 29300, estimatedTotalMs: 31100 });
    expect(observed.steps.map(step => step.elapsedMs)).toEqual([100, 200, 1500, 0, 0, 0, 0]);
    tracker.update({ stage: "failed", completed: 0, total: null });
    expect(tracker.snapshot()).toMatchObject({ estimatedTotalMs: null, remainingMs: null });
    expect(tracker.snapshot().steps.map(step => step.status)).toEqual(["complete", "complete", "failed", "waiting", "waiting", "waiting", "waiting"]);
  });

  it("does not train on failure or unreported phases; freezes terminal times and rejects backwards updates", () => {
    let tick = 0;
    const saved: unknown[] = [];
    const tracker = createRecordAnalysisProgressTracker({ now: () => tick, onHistory: value => saved.push(value) });
    tracker.start();
    tick = 200;
    tracker.update({ stage: "scoring", completed: 3, total: 10 });
    expect(() => tracker.update({ stage: "rules", completed: 4, total: 10 })).toThrow();
    expect(() => tracker.update({ stage: "scoring", completed: 2, total: 10 })).toThrow();
    tracker.update({ stage: "failed", completed: 0, total: null });
    const failure = tracker.snapshot();
    tick = 10_000;
    expect(tracker.snapshot()).toEqual(failure);
    expect(saved).toEqual([]);
    tracker.start();
    tracker.update({ stage: "complete", completed: 1, total: 1 });
    expect(saved).toEqual([]);
    expect(tracker.snapshot().steps.map(step => step.status)).toEqual(["complete", "skipped", "skipped", "skipped", "skipped", "skipped", "skipped"]);
  });

  it("enforces strict phase identity/counts/estimate arithmetic at the preload payload boundary", () => {
    const tracker = createRecordAnalysisProgressTracker({ history });
    tracker.start();
    const snapshot = tracker.snapshot();
    for (const changed of [
      { ...snapshot, token: "private" },
      { ...snapshot, remainingMs: null },
      { ...snapshot, estimatedTotalMs: 123 },
      { ...snapshot, steps: snapshot.steps.toReversed() },
      { ...snapshot, steps: snapshot.steps.map((step, index) => index === 0 ? { ...step, accountId: 99 } : step) },
      { ...snapshot, steps: snapshot.steps.map((step, index) => index === 1 ? { ...step, status: "running" } : step) },
    ]) expect(RecordAnalysisSnapshotSchema.safeParse(changed).success).toBe(false);
  });

  it("persists only bounded timing references, restores after restart and ignores corrupt/oversize evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "coach-speed-reference-"));
    try {
      const store = createRecordAnalysisTimingStore(directory);
      expect(store.load()).toEqual({ version: 1, samples: [] });
      store.save(history);
      expect(createRecordAnalysisTimingStore(directory).load()).toEqual(history);
      const file = join(directory, "record-analysis-timings-v1.json");
      expect(Object.keys(JSON.parse(readFileSync(file, "utf8")))).toEqual(["version", "samples"]);
      expect(() => store.save({ ...history, rawRecord: "private" } as never)).toThrow();
      writeFileSync(file, JSON.stringify({ ...history, token: "private" }));
      expect(store.load().samples).toEqual([]);
      writeFileSync(file, "x".repeat(16_385));
      expect(store.load().samples).toEqual([]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
