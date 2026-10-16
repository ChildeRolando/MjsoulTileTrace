import {
  LabSampleSchema,
  LabLabelSchema,
  LAB_VERSION,
  type LabSample,
  type LabLabel,
  type QuestionLabConfig,
  type LabConstructRequest,
  type LabConstructResult,
} from "@riichi-coach/contracts";
import {
  createLibriichiRuleProjector,
  bindLibriichiRuleResult,
  projectResearchMortalRuleScoring,
  bindLocalMortalRuleScores,
} from "@riichi-coach/reasoning";
import { Archive } from "./archive.js";
import { createHash } from "node:crypto";
import { condition, digest, scanChoice } from "./config.js";
import {
  createBoard,
  controlledBoard,
  resolveScene,
  constructionRequest,
  handFamily,
  type ResolvedScene,
} from "./construct.js";
import {
  canonicalFromConstruction,
  pendingDecision,
  matchesScene,
  candidateFacts,
  featureVector,
  hypothesisVotes,
  observedFamily,
  observableComponents,
} from "./projection.js";
import type { Split } from "./groups.js";
import {
  createLabWorker,
  producerIdentity,
  type LabWorker,
} from "./runtime.js";

export type AttemptRecord = {
  attempt: number;
  round: number;
  status: string;
  sampleId?: string;
  durationMs: number;
};
// Content-bound reuse within one producer/config archive. Rehash every read;
// callers receive copies, so edits or consumer mutation cannot bypass validation.
const sampleCaches = new WeakMap<
  Archive,
  {
    entries: Map<string, { hash: string; sample: LabSample; bytes: number }>;
    bytes: number;
    hits: number;
    validations: number;
  }
>();
const SAMPLE_CACHE_BYTES = 256 * 1024 * 1024;
export function sampleValidationStats(archive: Archive) {
  const c = sampleCaches.get(archive);
  return {
    hits: c?.hits ?? 0,
    validations: c?.validations ?? 0,
    cachedSourceBytes: c?.bytes ?? 0,
    maxSourceBytes: SAMPLE_CACHE_BYTES,
  };
}
export function sampleIdentity(
  sample: Pick<
    LabSample,
    | "stream"
    | "ruleResult"
    | "factIdentity"
    | "candidates"
    | "features"
    | "hypotheses"
  >,
) {
  return digest({
    stream: sample.stream,
    ruleResult: sample.ruleResult,
    factIdentity: sample.factIdentity,
    candidates: sample.candidates.map(
      ({ result: _raw, ...candidate }) => candidate,
    ),
    features: sample.features,
    hypotheses: sample.hypotheses,
  });
}
export async function readSamples(archive: Archive, deadlineAt?: number): Promise<LabSample[]> {
  const manifest = await archive.read("manifest.json") as { identity?: { producers?: { facts?: unknown } } } | null;
  const expectedFacts = manifest?.identity?.producers?.facts;
  const checkProducer = (sample: LabSample) => {
    if (expectedFacts && digest(sample.factIdentity) !== digest(expectedFacts)) throw new Error("sample_fact_producer_mismatch");
  };
  let cache = sampleCaches.get(archive);
  if (!cache) {
    cache = { entries: new Map(), bytes: 0, hits: 0, validations: 0 };
    sampleCaches.set(archive, cache);
  }
  const out: LabSample[] = [];
  for (const name of await archive.list("samples")) {
    if (deadlineAt !== undefined && Date.now() >= deadlineAt) throw new Error("report_budget_exhausted");
    const source = await archive.readSource(`samples/${name}`);
    if (source === null) throw new Error("sample_unavailable");
    const bytes = Buffer.byteLength(source),
      hash = createHash("sha256").update(source).digest("hex"),
      cached = cache.entries.get(name);
    if (
      process.env.RIICHI_LAB_DISABLE_READ_CACHE !== "1" &&
      cached?.hash === hash
    ) {
      checkProducer(cached.sample);
      cache.hits++;
      cache.entries.delete(name);
      cache.entries.set(name, cached);
      out.push(structuredClone(cached.sample));
      continue;
    }
    const sample = LabSampleSchema.parse(JSON.parse(source));
    if (
      sample.sampleId !== sampleIdentity(sample) ||
      name !== `${sample.sampleId}.json`
    )
      throw new Error("sample_identity_mismatch");
    if (
      sample.factEvidenceSha256 !==
      digest(sample.candidates.map((c) => c.result))
    )
      throw new Error("sample_fact_evidence_mismatch");
    checkProducer(sample);
    const d = pendingDecision(sample.stream),
      bound = bindLibriichiRuleResult({
        request: sample.ruleRequest,
        response: sample.ruleResult,
        decision: d,
      });
    if (
      digest(
        createLibriichiRuleProjector(
          sample.stream,
          sample.ruleRequest.identity,
        )(d),
      ) !== digest(sample.ruleRequest)
    )
      throw new Error("sample_rule_request_mismatch");
    if (
      digest(bound.actions.map((a) => [a.actionRef, a.action])) !==
      digest(sample.candidates.map((a) => [a.actionRef, a.action]))
    )
      throw new Error("sample_candidates_mismatch");
    const rebuilt = await candidateFacts(
      d,
      bound.actions,
      null,
      sample.candidates,
    );
    if (digest(rebuilt) !== digest(sample.candidates))
      throw new Error("sample_facts_mismatch");
    if (digest(featureVector(d, sample.candidates)) !== digest(sample.features))
      throw new Error("sample_features_mismatch");
    cache.validations++;
    if (cached) {
      cache.entries.delete(name);
      cache.bytes -= cached.bytes;
    }
    if (bytes <= SAMPLE_CACHE_BYTES) {
      while (cache.bytes + bytes > SAMPLE_CACHE_BYTES) {
        const oldest = cache.entries.keys().next().value!;
        cache.bytes -= cache.entries.get(oldest)!.bytes;
        cache.entries.delete(oldest);
      }
      cache.entries.set(name, { hash, sample: structuredClone(sample), bytes });
      cache.bytes += bytes;
    }
    out.push(sample);
  }
  return out.sort((a, b) => a.attempt - b.attempt);
}
export async function readLabels(
  archive: Archive,
  samples: LabSample[],
  deadlineAt?: number,
): Promise<Map<string, LabLabel>> {
  const manifest = (await archive.read("manifest.json")) as {
    identity: { config: QuestionLabConfig; producers?: { model?: unknown } };
  };
  const sensitiveGap = manifest.identity.config.learning.sensitiveGap;
  const out = new Map<string, LabLabel>();
  for (const sample of samples) {
    if (deadlineAt !== undefined && Date.now() >= deadlineAt) throw new Error("report_budget_exhausted");
    const raw = await archive.read(`labels/${sample.sampleId}.json`);
    if (!raw) continue;
    const label = LabLabelSchema.parse(raw);
    if (manifest.identity.producers?.model && digest(label.request.identity) !== digest(manifest.identity.producers.model))
      throw new Error("label_model_producer_mismatch");
    if (label.sampleId !== sample.sampleId)
      throw new Error("label_sample_mismatch");
    {
      if (
        digest(label.request.ruleRequest) !== digest(sample.ruleRequest) ||
        digest(label.request.ruleResult) !== digest(sample.ruleResult)
      )
        throw new Error("label_input_mismatch");
      const bound = bindLocalMortalRuleScores({
        request: label.request,
        response: label.response,
        decision: pendingDecision(sample.stream),
      });
      if (
        bound.preferred.actionRef !== label.preferredActionRef ||
        digest(
          bound.actions.map((a) => ({
            actionRef: a.actionRef,
            qValue: a.qValue,
          })),
        ) !== digest(label.scores)
      )
        throw new Error("label_scores_mismatch");
      const best = Math.max(...bound.actions.map((a) => a.qValue)),
        sorted = bound.actions.map((a) => a.qValue).sort((a, b) => b - a),
        preferred = bound.actions
          .filter(
            (a) =>
              a.qValue === best &&
              (a.kanSelectionQValue === undefined ||
                a.kanSelectionQValue ===
                  Math.max(
                    ...bound.actions
                      .filter((k) => k.kanSelectionQValue !== undefined)
                      .map((k) => k.kanSelectionQValue!),
                  )),
          )
          .map((a) => a.actionRef);
      if (
        digest(label.preferredActionRefs) !== digest(preferred) ||
        label.bestGap !== (sorted.length > 1 ? best - sorted[1]! : 0) ||
        label.sensitive !==
          (sorted.length > 1 && label.bestGap < sensitiveGap) ||
        label.otherChoice !== (bound.preferred.action.kind !== "discard")
      )
        throw new Error("label_derived_fields_mismatch");
    }
    out.set(sample.sampleId, label);
  }
  return out;
}
function sourceFamily(
  scene: ResolvedScene,
  board: ReturnType<typeof createBoard>,
): string {
  return handFamily(scene.hand ?? board.haipai[scene.selfActor]!);
}
function sceneAt(
  config: QuestionLabConfig,
  attempt: number,
): {
  scene: ResolvedScene;
  board: ReturnType<typeof createBoard>;
  baseline: ResolvedScene;
  baseBoard: ReturnType<typeof createBoard>;
  groupId: string;
  variant: number;
  changed: string[];
} {
  const variant = attempt % config.experiment.variantsPerGroup,
    base = Math.floor(attempt / config.experiment.variantsPerGroup);
  const baseSeed = Number.parseInt(
      digest([config.seed, base, "base"]).slice(0, 8),
      16,
    ),
    variantSeed = Number.parseInt(
      digest([config.seed, attempt, "variant"]).slice(0, 8),
      16,
    );
  const scene = resolveScene(config.scene, baseSeed),
    baseBoard = createBoard(
      scene,
      baseSeed,
      config.experiment.mode === "random" ? "tile_shuffle" : "structured",
    ),
    groupId = sourceFamily(scene, baseBoard),
    initial = structuredClone(scene);
  if (variant > 0) {
    const next = resolveScene(config.scene, variantSeed);
    let stride = 1;
    for (const key of config.experiment.vary) {
      if (config.experiment.strategy === "scan") {
        const row = scanChoice(
          config.scene[key],
          initial[key],
          Math.floor(variant / stride),
        );
        (scene as unknown as Record<string, unknown>)[key] = row.value;
        stride *= row.size;
        continue;
      }
      (scene as unknown as Record<string, unknown>)[key] = structuredClone(
        next[key],
      );
    }
    if (
      config.experiment.vary.includes("players") &&
      !config.experiment.vary.includes("history")
    )
      scene.history = next.history;
  }
  const changed = Object.keys(scene).filter(
    (k) =>
      digest((scene as unknown as Record<string, unknown>)[k] ?? null) !==
      digest((initial as unknown as Record<string, unknown>)[k] ?? null),
  );
  // Every variant inherits its base witness; arbitrary hidden re-randomization cannot change public rivers.
  return {
    scene,
    board: variant > 0 ? controlledBoard(scene, baseBoard, initial) : baseBoard,
    baseline: initial,
    baseBoard,
    groupId,
    variant,
    changed,
  };
}
export class LabBatch {
  readonly #started = performance.now();
  readonly #constructions = new Map<string, Promise<LabConstructResult>>();
  #construct(worker: LabWorker, request: LabConstructRequest) {
    const cached = this.#constructions.get(request.requestId);
    if (cached) return cached;
    const result = worker.constructor.construct(request);
    this.#constructions.set(request.requestId, result);
    if (this.#constructions.size > 128)
      this.#constructions.delete(this.#constructions.keys().next().value!);
    return result;
  }
  private constructor(
    readonly config: QuestionLabConfig,
    readonly archive: Archive,
    readonly workers: LabWorker[],
    readonly priorActiveMs: number,
  ) {}
  get remainingMs() {
    return Math.max(
      0,
      this.config.budget.timeLimitSeconds * 1000 -
        this.priorActiveMs -
        (performance.now() - this.#started),
    );
  }
  async checkpointBudget() {
    await this.archive.write("budget.json", {
      activeMs: this.priorActiveMs + performance.now() - this.#started,
      timeLimitMs: this.config.budget.timeLimitSeconds * 1000,
    });
  }
  static async open(config: QuestionLabConfig, directory: string) {
    const workers: LabWorker[] = [];
    let archive: Archive | null = null;
    try {
      for (let i = 0; i < config.budget.concurrency; i++)
        workers.push(await createLabWorker());
      const producers = await producerIdentity(workers[0]!);
      archive = await Archive.open(directory, {
        version: LAB_VERSION,
        config,
        configHash: digest(config),
        producers,
      });
      const budget = (await archive.read("budget.json")) as {
        activeMs: number;
      } | null;
      return new LabBatch(config, archive, workers, budget?.activeMs ?? 0);
    } catch (error) {
      await Promise.allSettled(workers.map((w) => w.close()));
      if (archive) await archive.close();
      throw error;
    }
  }
  async close() {
    try {
      await this.checkpointBudget();
    } finally {
      await Promise.allSettled(this.workers.map((w) => w.close()));
      await this.archive.close();
    }
  }
  async #attempt(
    attempt: number,
    round: number,
    worker: LabWorker,
  ): Promise<{
    sample?: LabSample;
    witness?: LabConstructRequest;
    construction?: LabConstructResult;
    record: AttemptRecord;
  }> {
    const start = performance.now();
    let stage = start;
    const reject = (status: string) => ({
      record: { attempt, round, status, durationMs: performance.now() - start },
    });
    try {
      const {
          scene,
          board: spec,
          baseline,
          baseBoard,
          groupId,
          variant,
        } = sceneAt(this.config, attempt),
        baseAttempt = attempt - variant;
      const witness = constructionRequest(
        scene,
        spec,
        worker.constructor.identity,
        baseAttempt >>> 0,
        this.config.budget.maxSteps,
      );
      const result = await this.#construct(worker, witness);
      if (result.status !== "ok") {
        if (result.code === "construction_runtime_failed")
          throw new Error(result.code);
        return reject(result.code);
      }
      const constructionMs = performance.now() - stage;
      stage = performance.now();
      const stream = canonicalFromConstruction(result.events, scene.selfActor),
        decision = pendingDecision(stream);
      if (!matchesScene(scene, decision, result.events))
        return reject("target_not_reached");
      let changed: string[] = [];
      if (variant > 0) {
        const baseResult = await this.#construct(
          worker,
          constructionRequest(
            baseline,
            baseBoard,
            worker.constructor.identity,
            baseAttempt >>> 0,
            this.config.budget.maxSteps,
          ),
        );
        if (baseResult.status !== "ok")
          return reject("contrast_base_unreachable");
        const before = observableComponents(
            canonicalFromConstruction(baseResult.events, baseline.selfActor),
          ),
          after = observableComponents(stream);
        changed = Object.keys(after).filter(
          (k) => digest(before[k] ?? null) !== digest(after[k] ?? null),
        );
        for (const [variable, key] of [
          ["wall", "yama"],
          ["rinshan", "rinshan"],
          ["uraIndicators", "ura_indicators"],
        ] as const) {
          if (digest(spec[key]) !== digest(baseBoard[key])) {
            changed.push(`construction.${variable}`);
            if (this.config.experiment.hold.includes(variable))
              return reject("held_component_changed");
          }
        }
        if (
          this.config.experiment.hold.some(
            (k) =>
              k in before &&
              digest(before[k] ?? null) !== digest(after[k] ?? null),
          )
        )
          return reject("held_component_changed");
      }
      const ruleRequest = createLibriichiRuleProjector(
          stream,
          worker.mortal.ruleIdentity,
        )(decision),
        ruleResult = await worker.mortal.queryRules(ruleRequest);
      if (ruleResult.status !== "ok")
        throw new Error(
          ruleResult.status === "error" ? ruleResult.code : "rules_non_action",
        );
      const actions = bindLibriichiRuleResult({
        request: ruleRequest,
        response: ruleResult,
        decision,
      }).actions;
      const rulesMs = performance.now() - stage;
      stage = performance.now();
      const candidates = await candidateFacts(decision, actions, worker.engine),
        features = featureVector(decision, candidates);
      if (!condition(this.config.constraints, features))
        return reject("predicate_not_met");
      const hypotheses = hypothesisVotes(
        this.config.hypotheses,
        features,
        candidates,
      );
      const required = hypotheses.filter((h) =>
        this.config.experiment.requireHypotheses.includes(h.id),
      );
      if (required.some((h) => !h.applicable))
        return reject("hypothesis_not_applicable");
      if (
        this.config.experiment.mode === "conflict" &&
        new Set(required.map((h) => [...h.actionRefs].sort().join(","))).size <
          2
      )
        return reject("hypotheses_not_in_conflict");
      const data = {
        stream,
        ruleResult,
        factIdentity: await worker.engine.identity(),
        candidates,
        features,
        hypotheses,
      };
      const sample = LabSampleSchema.parse({
        schemaVersion: "question-lab-sample/v1",
        sampleId: sampleIdentity(data),
        factEvidenceSha256: digest(candidates.map((c) => c.result)),
        configHash: digest(this.config),
        groupId,
        attempt,
        variant,
        round,
        split: "train",
        changed,
        constructionId: witness.requestId,
        ...data,
        decisionRef: decision.decisionEventRef,
        ruleRequest,
        timings: {
          constructionMs,
          rulesMs,
          factsMs: performance.now() - stage,
        },
        naturalness: "constructed_legal_not_frequency_calibrated",
      });
      return {
        sample,
        witness,
        construction: result,
        record: {
          attempt,
          round,
          status: "accepted",
          sampleId: sample.sampleId,
          durationMs: performance.now() - start,
        },
      };
    } catch (error) {
      const code = (error as Error).message;
      if (code.startsWith("contradiction_")) return reject(code);
      throw error;
    }
  }
  async generate(
    round = 0,
    filter?: (sample: LabSample) => boolean,
  ): Promise<LabSample[]> {
    const samples = await readSamples(this.archive),
      known = new Set(samples.map((s) => s.sampleId));
    const records: AttemptRecord[] = [];
    for (const file of await this.archive.list("attempts"))
      records.push(
        (await this.archive.read(`attempts/${file}`)) as AttemptRecord,
      );
    let next = records.length
      ? Math.max(...records.map((r) => r.attempt)) + 1
      : 0;
    const count =
      round === 0
        ? this.config.budget.count
        : this.config.budget.refinementCount;
    let accepted = samples.filter((s) => s.round === round).length;
    const split = (await this.archive.read("split.json")) as Split | null;
    while (
      accepted < count &&
      next < this.config.budget.maxAttempts &&
      this.remainingMs > 0
    ) {
      const attempts = Array.from(
        {
          length: Math.min(
            this.workers.length,
            this.config.budget.maxAttempts - next,
          ),
        },
        (_, i) => next + i,
      );
      const results = await Promise.allSettled(
        attempts.map((n, i) => this.#attempt(n, round, this.workers[i]!)),
      );
      for (let i = 0; i < results.length; i++) {
        const result = results[i]!;
        if (result.status === "rejected") throw result.reason;
        const { record, witness, construction } = result.value;
        let { sample } = result.value;
        if (sample && known.has(sample.sampleId)) {
          record.status = "duplicate";
          sample = undefined;
        }
        if (
          sample &&
          round > 0 &&
          split &&
          (split.testGroups.includes(
            split.groupMap[sample.groupId] ?? sample.groupId,
          ) ||
            split.testGroups.includes(
              split.familyMap[observedFamily(sample)] ?? "",
            ))
        ) {
          record.status = "held_out_family";
          sample = undefined;
        }
        if (sample && accepted >= count) {
          record.status = "over_quota";
          sample = undefined;
        }
        if (sample && filter && !filter(sample)) {
          record.status = "outside_refinement_selection";
          sample = undefined;
        }
        if (sample) {
          await this.archive.write(`witnesses/${witness!.requestId}.json`, {
            request: witness,
            resolved: sceneAt(this.config, sample.attempt).scene,
            result: construction,
          });
          await this.archive.write(`samples/${sample.sampleId}.json`, sample);
          known.add(sample.sampleId);
          samples.push(sample);
          accepted++;
        }
        records.push(record);
        await this.archive.write(
          `attempts/${String(record.attempt).padStart(12, "0")}.json`,
          record,
        );
        next = record.attempt + 1;
        await this.checkpointBudget();
      }
      if (accepted % 10 === 0)
        process.stderr.write(`已生成 ${accepted}/${count}；尝试 ${next}\n`);
    }
    await this.archive.write("generation-summary.json", {
      schemaVersion: "question-lab-generation/v1",
      round,
      accepted,
      requested: count,
      totalSamples: samples.length,
      attempts: records.length,
      status: accepted >= count ? "complete" : "budget_exhausted",
      failures: Object.fromEntries(
        [...new Set(records.map((r) => r.status))].map((k) => [
          k,
          records.filter((r) => r.status === k).length,
        ]),
      ),
      durationMs: records.reduce((s, r) => s + r.durationMs, 0),
    });
    return samples;
  }
  async label(): Promise<Map<string, LabLabel>> {
    const samples = await readSamples(this.archive),
      labels = await readLabels(this.archive, samples);
    for (
      let offset = 0;
      offset < samples.length;
      offset += this.workers.length
    ) {
      if (this.remainingMs <= 0) break;
      const rows = samples.slice(offset, offset + this.workers.length);
      const results = await Promise.allSettled(
        rows.map(async (sample, i) => {
          if (labels.has(sample.sampleId)) return null;
          return scoreLabSample(sample, this.workers[i]!, this.config.learning.sensitiveGap);
        }),
      );
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
        if (result.value) {
          await this.archive.write(
            `labels/${result.value.sampleId}.json`,
            result.value,
          );
          labels.set(result.value.sampleId, result.value);
        }
      }
      await this.checkpointBudget();
    }
    return labels;
  }
  async summarize() {
    await this.checkpointBudget();
    const samples = await readSamples(this.archive),
      labels = await readLabels(this.archive, samples);
    const generation = (await this.archive.read("generation-summary.json")) as {
        status: string;
      } | null,
      budget = {
        activeMs: this.priorActiveMs + performance.now() - this.#started,
      };
    const boundaries = await this.archive.read("boundaries-final.json");
    const report = (await this.archive.read("report-timing.json")) as {
      durationMs: number;
    } | null;
    const learning = (await this.archive.read("learning-runs.json")) as
      { durationMs: number }[] | null;
    const summary = {
      schemaVersion: "question-lab-pipeline/v1",
      status:
        labels.size === samples.length &&
        generation?.status === "complete" &&
        boundaries !== null
          ? "complete"
          : "partial",
      sampleCount: samples.length,
      labelCount: labels.size,
      modelInferenceCount: [...labels.values()].filter(
        (l) => l.request !== null,
      ).length,
      sourceGroups: new Set(samples.map((s) => s.groupId)).size,
      testGroups: new Set(
        samples.filter((s) => s.split === "test").map((s) => s.groupId),
      ).size,
      timings: {
        activeWallMs: budget.activeMs,
        constructionWorkMs: samples.reduce(
          (n, s) => n + (s.timings.constructionMs ?? 0),
          0,
        ),
        rulesWorkMs: samples.reduce((n, s) => n + (s.timings.rulesMs ?? 0), 0),
        factsWorkMs: samples.reduce((n, s) => n + (s.timings.factsMs ?? 0), 0),
        modelWorkMs: [...labels.values()].reduce((n, l) => n + l.durationMs, 0),
        learningWorkMs: (learning ?? []).reduce((n, r) => n + r.durationMs, 0),
        reportWorkMs: report?.durationMs ?? 0,
      },
      throughputPerMinute:
        budget.activeMs > 0 ? labels.size / (budget.activeMs / 60000) : 0,
      validationCache: sampleValidationStats(this.archive),
    };
    await this.archive.write("pipeline-summary.json", summary);
    return summary;
  }
}

export async function scoreLabSample(sample: LabSample, w: LabWorker, sensitiveGap: number): Promise<LabLabel> {
  const start = performance.now(),
    d = pendingDecision(sample.stream);
  const request = projectResearchMortalRuleScoring({
    stream: sample.stream,
    decision: d,
    identity: w.mortal.identity,
    ruleRequest: sample.ruleRequest,
    ruleResult: sample.ruleResult,
  });
  const response = await w.mortal.scoreRules(request),
    bound = bindLocalMortalRuleScores({
      request,
      response,
      decision: d,
    });
  const best = Math.max(...bound.actions.map((a) => a.qValue)),
    sorted = bound.actions.map((a) => a.qValue).sort((a, b) => b - a),
    bestGap = sorted.length > 1 ? best - sorted[1]! : 0;
  const preferredActionRefs = bound.actions
    .filter(
      (a) =>
        a.qValue === best &&
        (a.kanSelectionQValue === undefined ||
          a.kanSelectionQValue ===
            Math.max(
              ...bound.actions
                .filter((k) => k.kanSelectionQValue !== undefined)
                .map((k) => k.kanSelectionQValue!),
            )),
    )
    .map((a) => a.actionRef);
  return LabLabelSchema.parse({
    schemaVersion: "question-lab-label/v1",
    sampleId: sample.sampleId,
    request: bound.request,
    response: bound.response,
    preferredActionRefs,
    preferredActionRef: bound.preferred.actionRef,
    scores: bound.actions.map((a) => ({
      actionRef: a.actionRef,
      qValue: a.qValue,
    })),
    bestGap,
    sensitive:
      sorted.length > 1 && bestGap < sensitiveGap,
    otherChoice: bound.preferred.action.kind !== "discard",
    durationMs: performance.now() - start,
  });
}
