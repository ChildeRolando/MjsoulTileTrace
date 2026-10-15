import { spawn } from "node:child_process";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import {
  LabBoundariesSchema,
  type QuestionLabConfig,
  type LabSample,
} from "@riichi-coach/contracts";
import { readSamples, readLabels, type LabBatch } from "./batch.js";
import { Archive } from "./archive.js";
import { digest } from "./config.js";
import { labRoot } from "./runtime.js";
import { groupedSplit, type Split } from "./groups.js";
import { observedFamily } from "./projection.js";

export const learningPython = () =>
  process.env.RIICHI_QUESTION_LAB_PYTHON ??
  join(
    process.env.LOCALAPPDATA ?? "",
    "RiichiCoach/question-lab/learning-python/Scripts/python.exe",
  );
export type SvmModel = {
  mean: number[];
  scale: number[];
  classes: string[];
  supportVectors: number[][];
  dualCoefficients: number[][];
  intercepts: number[];
  supportCounts: number[];
  kernel: "linear" | "rbf";
  gamma: number;
  C: number;
};
export type BoundaryTask = {
  status: "fitted" | "insufficient_evidence";
  featureNames: string[];
  model?: SvmModel;
  marginReference?: number;
  [key: string]: unknown;
};
export type Boundaries = {
  schemaVersion: "question-lab-boundaries/v1";
  status: string;
  evaluated: boolean;
  tasks: Record<string, BoundaryTask>;
  [key: string]: unknown;
};
export async function pythonOperation(
  input: unknown,
  timeoutMs = 300000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(learningPython(), [join(labRoot, "python/learn.py")], {
      stdio: "pipe",
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
        OMP_NUM_THREADS: "1",
        OPENBLAS_NUM_THREADS: "1",
        MKL_NUM_THREADS: "1",
      },
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("learning_timeout"));
    }, timeoutMs);
    let output = "",
      error = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > 64 * 1024 * 1024) {
        child.kill();
        reject(new Error("learning_output_too_large"));
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      error = (error + chunk).slice(-4000);
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("learning_runtime_unavailable_run_setup"));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`learning_failed: ${error}`));
        return;
      }
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error("learning_protocol_invalid"));
      }
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(JSON.stringify(input));
  });
}
export async function freezeSplit(archive: Archive, samples: LabSample[]) {
  const prior = (await archive.read("split.json")) as Split | null,
    split = groupedSplit(
      samples.map((s) => ({ groupId: s.groupId, family: observedFamily(s) })),
      prior,
    );
  await archive.write("split.json", split);
  for (const sample of samples) {
    const group = split.groupMap[sample.groupId] ?? sample.groupId,
      expected = split.testGroups.includes(group) ? "test" : "train";
    if (sample.split !== expected || sample.groupId !== group) {
      sample.split = expected;
      sample.groupId = group;
      await archive.write(`samples/${sample.sampleId}.json`, sample);
    }
  }
  return split;
}
export async function fitBoundaries(
  archive: Archive,
  config: QuestionLabConfig,
  evaluate = false,
): Promise<Boundaries> {
  const samples = await readSamples(archive),
    labels = await readLabels(archive, samples),
    split = await freezeSplit(archive, samples);
  const request = {
    operation: "fit",
    samples,
    labels: [...labels.values()],
    hypotheses: config.hypotheses,
    options: config.learning,
    evaluate,
  };
  const budget = (await archive.read("budget.json")) as {
      activeMs: number;
    } | null,
    remaining = config.budget.timeLimitSeconds * 1000 - (budget?.activeMs ?? 0);
  if (remaining <= 0) throw new Error("experiment_budget_exhausted");
  const started = performance.now();
  const result = LabBoundariesSchema.parse(
    await pythonOperation(request, Math.min(remaining, 300000)),
  ) as Boundaries;
  const durationMs = performance.now() - started;
  await archive.write("budget.json", {
    activeMs: (budget?.activeMs ?? 0) + durationMs,
    timeLimitMs: config.budget.timeLimitSeconds * 1000,
  });
  const runs = (await archive.read("learning-runs.json")) as unknown[] | null;
  await archive.write("learning-runs.json", [
    ...(runs ?? []),
    {
      sampleCount: samples.length,
      labelCount: labels.size,
      evaluate,
      durationMs,
    },
  ]);
  if (
    result.schemaVersion !== "question-lab-boundaries/v1" ||
    typeof result.tasks !== "object" ||
    result.evaluated !== evaluate
  )
    throw new Error("learning_result_invalid");
  const report = {
    ...result,
    datasetHash: digest(samples.map((s) => [s.sampleId, s.groupId, s.split])),
    labelsHash: digest([...labels.values()]),
    split,
    learningSourceHash: digest(
      await readFile(join(labRoot, "python/learn.py"), "utf8"),
    ),
    featureAuthority: "visible_facts_only",
  };
  await archive.write(
    evaluate ? "boundaries-final.json" : "boundaries.json",
    report,
  );
  return report;
}
export function boundaryDistance(
  task: BoundaryTask,
  features: Record<string, number>,
): number | null {
  const m = task.model;
  if (task.status !== "fitted" || !m) return null;
  const x = task.featureNames.map(
    (f, i) => (features[f]! - m.mean[i]!) / m.scale[i]!,
  );
  const kernel = m.supportVectors.map((v) =>
    m.kernel === "linear"
      ? v.reduce((n, z, i) => n + z * x[i]!, 0)
      : Math.exp(-m.gamma * v.reduce((n, z, i) => n + (z - x[i]!) ** 2, 0)),
  );
  const starts = [0];
  for (const n of m.supportCounts) starts.push(starts.at(-1)! + n);
  const distances: number[] = [];
  let k = 0;
  for (let i = 0; i < m.classes.length; i++)
    for (let j = i + 1; j < m.classes.length; j++) {
      let value = m.intercepts[k++]!;
      for (let p = starts[i]!; p < starts[i + 1]!; p++)
        value += kernel[p]! * m.dualCoefficients[j - 1]![p]!;
      for (let p = starts[j]!; p < starts[j + 1]!; p++)
        value += kernel[p]! * m.dualCoefficients[i]![p]!;
      distances.push(Math.abs(value));
    }
  return Math.min(...distances);
}
export async function refineBatch(batch: LabBatch) {
  if (await batch.archive.read("boundaries-final.json"))
    throw new Error("holdout_already_evaluated_create_new_experiment");
  let boundaries = await fitBoundaries(batch.archive, batch.config, false);
  const rounds = (await batch.archive.read("refinements.json")) as {
    completed: number;
    rounds: unknown[];
  } | null;
  const records = rounds?.rounds ?? [];
  for (
    let round = (rounds?.completed ?? 0) + 1;
    round <= batch.config.budget.refinementRounds;
    round++
  ) {
    if (batch.remainingMs <= 0) break;
    const previous = await readSamples(batch.archive);
    let near = previous.filter(
        (s) => s.round === round && s.acquisition === "boundary",
      ).length,
      explore = previous.filter(
        (s) => s.round === round && s.acquisition === "exploration",
      ).length;
    const fitted = Object.values(boundaries.tasks).filter(
        (t) => t.status === "fitted",
      ),
      target = Math.floor(batch.config.budget.refinementCount / 2);
    const filter = (sample: LabSample) => {
      if (fitted.length === 0) {
        sample.acquisition = "exploration";
        explore++;
        return true;
      }
      if (
        near < target &&
        (near <= explore ||
          explore >= batch.config.budget.refinementCount - target)
      ) {
        const close = fitted.some((t) => {
          const d = boundaryDistance(t, sample.features);
          return d !== null && d <= Math.max(t.marginReference ?? 0, 1e-6);
        });
        if (!close) return false;
        sample.acquisition = "boundary";
        near++;
        return true;
      }
      sample.acquisition = "exploration";
      explore++;
      return true;
    };
    const samples = await batch.generate(round, filter);
    await batch.label();
    await batch.checkpointBudget();
    if (batch.remainingMs > 0)
      boundaries = await fitBoundaries(batch.archive, batch.config, false);
    records.push({
      round,
      nearBoundary: fitted.length ? near : 0,
      exploration: explore,
      actual: samples.filter((s) => s.round === round).length,
      mode: fitted.length
        ? "half_boundary_half_exploration"
        : "insufficient_model_exploration_only",
    });
    const complete =
      samples.filter((s) => s.round === round).length >=
      batch.config.budget.refinementCount;
    await batch.archive.write("refinements.json", {
      completed: complete ? round : round - 1,
      rounds: records,
      ...(!complete ? { stopped: "budget_exhausted" } : {}),
    });
    if (!complete) break;
  }
  return boundaries;
}
