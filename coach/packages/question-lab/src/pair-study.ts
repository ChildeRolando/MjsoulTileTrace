import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LAB_FEATURES, PAIR_FEATURES, PAIR_DELTAS, PairFitResultSchema, PairObservationSchema,
  PairTargetSchema, PairSvrModelSchema, PairScanCoordinateSchema, QuestionLabConfigSchema,
  type PairStudyConfig, type PairFitResult, type LabSample, type LabLabel, type PairScanCoordinate,
  LabConstructResultSchema,
  type LabConstructRequest, type LabConstructResult } from "@riichi-coach/contracts";
import { Archive } from "./archive.js";
import { digest, Random } from "./config.js";
import { coachRoot, createLabWorker, producerIdentity, type LabWorker } from "./runtime.js";
import { readSamples, readLabels, scoreLabSample } from "./batch.js";
import { createBoard, resolveScene, constructionRequest } from "./construct.js";
import { constructPairSample } from "./pair-native.js";
import { orderedRecommendations, pairObservations, pairTargets, predictPair, pairWeights, PAIR_POLICIES } from "./pair-features.js";
import { observedFamily, pendingDecision } from "./projection.js";
import { previousIndicator, requestWith, retargetDora, scanCoordinates, threatCoordinates,
  scanRequest, verifyScan, repairThreatDraw, jointCoordinates, baselineScanPoints, type Witness } from "./pair-scans.js";
import { pythonOperation } from "./learning.js";
import { TILES } from "./construct.js";

export type PairSource = { sameShanten?: boolean; phase: "initial" | "development" | "scan" | "refinement" | "threat";
  round?: number; coordinate?: PairScanCoordinate; anchorId?: string; acquisition?: "boundary" | "exploration";
  sourceArchive?: string; sourceSampleId?: string; sourceWitnessHash?: string; changed?: string[] };
type Sources = Record<string, PairSource>;
type Split = { testGroups: string[]; developmentGroups: string[]; initialGroups: string[] };
type SourceCatalog = { directory: string; manifestHash: string; samplesHash: string; samples: LabSample[] };
export class PairStudy {
  readonly samples: LabSample[] = [];
  readonly sources: Sources = {};
  labels = new Map<string, LabLabel>();
  split: Split | null = null;
  calls = 0;
  #storeTail: Promise<unknown> = Promise.resolve();
  #inferences = new Map<string, Promise<LabLabel>>();
  #started = performance.now();
  #priorMs = 0;
  #work = { constructionMs: 0, rulesMs: 0, factsMs: 0, learningMs: 0 };
  get timings() { return { activeWallMs: this.#priorMs + performance.now() - this.#started, ...this.#work, mortalMs: [...this.labels.values()].reduce((n, l) => n + l.durationMs, 0) }; }
  private constructor(readonly config: PairStudyConfig, readonly archive: Archive, readonly workers: LabWorker[],
    readonly catalogs: SourceCatalog[], started: number) { this.#started = started; }
  get remainingMs() { return Math.max(0, this.config.budget.timeLimitSeconds * 1000 - this.#priorMs - (performance.now() - this.#started)); }
  get searching() { return this.remainingMs > this.config.budget.reserveSeconds * 1000 && this.calls < this.config.budget.maxAttempts; }
  static async open(config: PairStudyConfig, directory: string) {
    const started = performance.now(), workers: LabWorker[] = [];
    let archive: Archive | undefined;
    try {
      const catalogs: SourceCatalog[] = [];
      for (const dir of config.developmentArchives) {
        const directory = resolve(coachRoot, dir), source = Archive.readOnly(directory);
        const manifest = await source.readSource("manifest.json");
        if (!manifest) throw new Error("development_archive_missing");
        const samples = await readSamples(source);
        catalogs.push({ directory, manifestHash: digest(manifest), samplesHash: digest(samples), samples });
      }
      for (let i = 0; i < config.budget.concurrency; i++) workers.push(await createLabWorker());
      // The native carrier is v1, the study and derived observations have their own v2 identity.
      const nativeConfig = QuestionLabConfigSchema.parse({ schemaVersion: "question-lab-config/v1", seed: config.seed,
        learning: { sensitiveGap: config.learning.sensitiveGap } });
      const producers = await producerIdentity(workers[0]!);
      archive = await Archive.open(directory, { version: "question-lab-pairs/v2", config: nativeConfig,
        study: config, configHash: digest(config), producers,
        developmentSources: catalogs.map(({ samples: _, ...identity }) => identity), policies: PAIR_POLICIES });
      const study = new PairStudy(config, archive, workers, catalogs, started);
      const budget = await archive.read("budget.json") as { activeMs: number; nativeCalls: number; work?: { constructionMs: number; rulesMs: number; factsMs: number; learningMs: number } } | null;
      if (budget?.work) study.#work = budget.work;
      study.#priorMs = budget?.activeMs ?? 0; study.calls = budget?.nativeCalls ?? 0;
      study.samples.push(...await readSamples(archive));
      study.samples.sort((a, b) => a.round - b.round || a.attempt - b.attempt || a.sampleId.localeCompare(b.sampleId));
      study.labels = await readLabels(archive, study.samples);
      study.split = await archive.read("split.json") as Split | null;
      if (study.split && (new Set(study.split.testGroups).size !== study.split.testGroups.length ||
          study.split.testGroups.some(g => study.split!.developmentGroups.includes(g)))) throw new Error("pair_holdout_development_collision");
      for (const s of study.samples) {
        const sourceRecord = await archive.read(`sources/${s.sampleId}.json`) as { source: PairSource; hash: string } | null;
        const source = sourceRecord?.source;
        if (sourceRecord && sourceRecord.hash !== digest(source)) throw new Error("pair_source_identity_mismatch");
        if (!source) throw new Error("pair_sample_source_missing");
        if (s.groupId !== observedFamily(s) || (study.split && s.split !== (study.split.testGroups.includes(s.groupId) ? "test" : "train")))
          throw new Error("pair_split_identity_mismatch");
        study.sources[s.sampleId] = source;
        if (s.configHash !== digest(config)) throw new Error("pair_sample_config_mismatch");
        const expected = pairObservations(s).pairs;
        const prior = await archive.read(`pairs/${s.sampleId}.json`);
        if (prior && digest(prior) !== digest(expected.map(p => PairObservationSchema.parse(p)))) throw new Error("pair_features_mismatch");
        if (!prior) await archive.write(`pairs/${s.sampleId}.json`, expected);
        if (study.labels.has(s.sampleId)) await study.writeTargets(s);
      }
      await archive.write("config.expanded.json", config);
      return study;
    } catch (e) { await Promise.allSettled(workers.map(w => w.close())); if (archive) await archive.close(); throw e; }
  }
  async checkpoint() {
    await this.archive.write("budget.json", { activeMs: this.#priorMs + performance.now() - this.#started,
      nativeCalls: this.calls, work: { ...this.#work }, timeLimitMs: this.config.budget.timeLimitSeconds * 1000 });
  }
  async close() { try { await this.checkpoint(); } finally { await Promise.allSettled(this.workers.map(w => w.close())); await this.archive.close(); } }
  async native(request: LabConstructRequest, worker: LabWorker) {
    const path = `constructions/${request.requestId}.json`, prior = await this.archive.read(path) as { request: LabConstructRequest; result: LabConstructResult; resultHash: string } | null;
    if (prior) {
      if (digest(prior.request) !== digest(request) || prior.resultHash !== digest(prior.result)) throw new Error("pair_construction_cache_mismatch");
      const result = LabConstructResultSchema.parse(prior.result);
      if (result.requestId !== request.requestId || (result.status === "ok" && digest(result.identity) !== digest(request.identity)))
        throw new Error("pair_construction_cache_mismatch");
      return result;
    }
    if (!this.searching) return null;
    this.calls++; await this.checkpoint();
    const start = performance.now(), result = await worker.constructor.construct(request);
    if (result.status === "error" && result.code === "construction_runtime_failed") {
      await this.archive.write(`construction-failures/${this.calls}.json`, { requestId: request.requestId, code: result.code });
      throw new Error(result.code);
    }
    const durationMs = performance.now() - start; this.#work.constructionMs += durationMs;
    await this.archive.write(path, { request, result, resultHash: digest(result), durationMs });
    return result;
  }
  async evaluate(request: LabConstructRequest, worker: LabWorker, attempt: number, round = 0): Promise<{ sample?: LabSample; result: LabConstructResult | null; reason?: string }> {
    const result = await this.native(request, worker);
    if (!result) return { result: null, reason: "budget_exhausted" };
    const evaluated = await constructPairSample({ request, result, worker, configHash: digest(this.config), attempt, round });
    if (evaluated.sample) { this.#work.rulesMs += evaluated.sample.timings.rulesMs ?? 0; this.#work.factsMs += evaluated.sample.timings.factsMs ?? 0; }
    return evaluated;
  }
  store(sample: LabSample, request: LabConstructRequest, result: Extract<LabConstructResult, { status: "ok" }>, source: PairSource): Promise<boolean> {
    const job = this.#storeTail.then(() => this.commitSample(sample, request, result, source));
    this.#storeTail = job.catch(() => undefined);
    return job;
  }
  private async commitSample(sample: LabSample, request: LabConstructRequest, result: Extract<LabConstructResult, { status: "ok" }>, source: PairSource) {
    if (this.samples.some(s => s.sampleId === sample.sampleId)) return false;
    if (source.phase !== "threat" && (await this.archive.read("research-frozen.json") || await this.archive.read("fit-final.json")))
      throw new Error("holdout_already_evaluated_create_new_experiment");
    const family = observedFamily(sample);
    if (source.phase !== "initial" && this.split?.testGroups.includes(family)) throw new Error("pair_holdout_family_collision");
    sample.groupId = family;
    sample.split = this.split?.testGroups.includes(family) ? "test" : "train";
    const pairs = pairObservations(sample).pairs;
    if (["initial", "refinement"].includes(source.phase) && !pairs.length) throw new Error("pair_store_without_conflict");
    await this.archive.write(`witnesses/${request.requestId}.json`, { request, result });
    source.sameShanten = pairs[0]?.features.deltaS === 0;
    await this.archive.write(`sources/${sample.sampleId}.json`, { source, hash: digest(source) });
    await this.archive.write(`samples/${sample.sampleId}.json`, sample);
    await this.archive.write(`pairs/${sample.sampleId}.json`, pairs);
    this.sources[sample.sampleId] = source; this.samples.push(sample);
    this.samples.sort((a, b) => a.round - b.round || a.attempt - b.attempt || a.sampleId.localeCompare(b.sampleId));
    return true;
  }
  async importDevelopment() {
    if (await this.archive.read("development-complete.json")) return;
    for (const catalog of this.catalogs) {
      const source = Archive.readOnly(catalog.directory);
      for (const old of catalog.samples) {
        if (!this.searching) return;
        if (old.split !== "train" || !pairObservations(old).pairs.length || old.features.threats || old.features.meldCount) continue;
        const oldWitness = await source.read(`witnesses/${old.constructionId}.json`) as Witness | null;
        if (!oldWitness || digest(oldWitness.request.identity) !== digest(this.workers[0]!.constructor.identity)) throw new Error("development_witness_identity_mismatch");
        const request = oldWitness.request, evaluated = await this.evaluate(request, this.workers[0]!, this.samples.length);
        if (evaluated.sample && evaluated.result?.status === "ok") {
          if (digest(evaluated.sample.stream) !== digest(old.stream)) throw new Error("development_visible_replay_mismatch");
          await this.store(evaluated.sample, request, evaluated.result, { phase: "development", sourceArchive: catalog.directory,
            sourceSampleId: old.sampleId, sourceWitnessHash: digest(oldWitness) });
        }
      }
    }
    await this.archive.write("development-complete.json", { complete: true });
  }
  async freezeSplit() {
    if (this.split) return;
    const developmentGroups = [...new Set(this.catalogs.flatMap(c => c.samples.map(observedFamily)))];
    const groups = [...new Set(this.samples.filter(s => this.sources[s.sampleId]!.phase === "initial").map(s => s.groupId))]
      .filter(g => !developmentGroups.includes(g)).sort((a, b) => digest([this.config.seed, a, "holdout"]).localeCompare(digest([this.config.seed, b, "holdout"])));
    if (!this.samples.length) return; // Never freeze an empty dataset.
    this.split = { testGroups: groups.length >= 5 ? groups.slice(0, Math.round(groups.length * .2)) : [], developmentGroups, initialGroups: groups };
    await this.archive.write("split.json", this.split);
    for (const s of this.samples) {
      s.split = this.split.testGroups.includes(s.groupId) ? "test" : "train";
      await this.archive.write(`samples/${s.sampleId}.json`, s);
      await this.archive.write(`pairs/${s.sampleId}.json`, pairObservations(s).pairs);
    }
  }
  async generate(round = 0, acquisition?: PairFitResult | null) {
    if (round === 0) await this.importDevelopment();
    const phase = round === 0 ? "initial" : "refinement";
    const target = round === 0 ? this.config.initialCount : this.config.budget.refinementCount;
    const counts = () => {
      const rows = this.samples.filter(s => this.sources[s.sampleId]!.phase === phase && (round === 0 || s.round === round));
      return { rows, same: rows.filter(s => this.sources[s.sampleId]!.sameShanten).length };
    };
    const existingAttempts = await this.archive.list(`attempts/round-${round}`);
    let next = existingAttempts.length ? Math.max(...existingAttempts.map(n => Number(n.slice(0, -5)))) + 1 : 0;
    while (counts().rows.length < target && this.searching) {
      const jobs = Array.from({ length: this.workers.length }, (_, i) => next + i);
      const results = await Promise.allSettled(jobs.map(async (n, i) => {
        const seed = Number.parseInt(digest([this.config.seed, round, n]).slice(0, 8), 16), rng = new Random(seed);
        const config = QuestionLabConfigSchema.parse({ schemaVersion: "question-lab-config/v1", seed,
          scene: { turn: { range: [3, 10] }, selfActor: { oneOf: [0, 1, 2, 3] }, round: { oneOf: [0, 3, 4, 7] },
            honba: { fixed: 0 }, riichiSticks: { fixed: 0 }, scores: { fixed: [25000, 25000, 25000, 25000] } } });
        const scene = resolveScene(config.scene, seed), spec = createBoard(scene, seed), worker = this.workers[i]!;
        let request = constructionRequest(scene, spec, worker.constructor.identity, seed, 512);
        let evaluated = await this.evaluate(request, worker, n, round);
        if (evaluated.sample && n % 5 !== 0) {
          const e = orderedRecommendations(evaluated.sample.candidates.filter(c => c.action.kind === "discard" && c.status === "ready"), PAIR_POLICIES.efficiency);
          if (e.length && evaluated.result?.status === "ok") {
            const selected = e[rng.int(e.length)]!;
            request = retargetDora({ request, result: evaluated.result }, previousIndicator(TILES[selected.metrics.tile34!]!));
            evaluated = await this.evaluate(request, worker, n, round);
          }
        }
        return { request, evaluated };
      }));
      for (let i = 0; i < jobs.length; i++) {
        const n = jobs[i]!, row = results[i]!;
        let status = "rejected";
        if (row.status === "rejected") {
          const code = (row.reason as Error).message;
          if (!code.startsWith("scan_") && !code.startsWith("contradiction_")) throw row.reason;
          status = code;
        } else {
          const { request, evaluated } = row.value, s = evaluated.sample;
          status = evaluated.reason ?? "construction_failed";
          if (s && evaluated.result?.status === "ok") {
            const info = pairObservations(s), c = counts(); status = info.reason;
            const source: PairSource = { phase, round };
            if (info.pairs.length && c.rows.length < target) {
              if (this.split?.testGroups.includes(s.groupId)) status = "held_out_family";
              else if (round === 0 && (info.pairs[0]!.features.deltaS === 0 ? c.same : c.rows.length - c.same) >= target / 2) status = "stratum_full";
              else {
                let accept = true;
                if (round > 0) {
                  const near = c.rows.filter(x => this.sources[x.sampleId]!.acquisition === "boundary").length;
                  const exploration = c.rows.length - near, model = acquisition?.models.full?.model;
                  if (model && near < target / 2 && (near <= exploration || exploration >= target / 2)) {
                    accept = info.pairs.some(p => Math.abs(predictPair(model, p.features)) <= this.config.learning.boundaryGap);
                    source.acquisition = "boundary";
                  } else source.acquisition = "exploration";
                }
                if (!accept) status = "outside_predicted_boundary";
                else status = await this.store(s, request, evaluated.result, source) ? "accepted" : "duplicate";
              }
            }
          }
        }
        await this.archive.write(`attempts/round-${round}/${String(n).padStart(12, "0")}.json`, { n, round, status });
      }
      next += jobs.length; await this.checkpoint();
      if (next % 50 === 0) process.stderr.write(`配对研究 ${phase} ${counts().rows.length}/${target}；提议 ${next}；原生调用 ${this.calls}\n`);
    }
    const c = counts();
    const result = { round, actual: c.rows.length, requested: target, sameShanten: c.same, acrossShanten: c.rows.length - c.same,
      boundary: c.rows.filter(s => this.sources[s.sampleId]!.acquisition === "boundary").length,
      exploration: c.rows.filter(s => this.sources[s.sampleId]!.acquisition === "exploration").length,
      boundaryGap: this.config.learning.boundaryGap, complete: c.rows.length >= target };
    await this.archive.write(`generation/round-${round}.json`, result);
    return result;
  }
  async writeTargets(sample: LabSample) {
    const label = this.labels.get(sample.sampleId)!;
    const data = pairTargets(sample, label, this.config.learning.sensitiveGap);
    const prior = await this.archive.read(`pair-labels/${sample.sampleId}.json`);
    if (prior && digest(prior) !== digest(data)) throw new Error("pair_targets_mismatch");
    if (!prior) await this.archive.write(`pair-labels/${sample.sampleId}.json`, data);
    return data;
  }
  async ensureLabel(s: LabSample, worker: LabWorker): Promise<LabLabel> {
    const existing = this.labels.get(s.sampleId);
    if (existing) return existing;
    let job = this.#inferences.get(s.sampleId);
    if (!job) {
      job = (async () => {
        const label = await scoreLabSample(s, worker, this.config.learning.sensitiveGap);
        await this.archive.write(`labels/${s.sampleId}.json`, label); this.labels.set(s.sampleId, label);
        return label;
      })();
      this.#inferences.set(s.sampleId, job);
    }
    try { return await job; } finally { this.#inferences.delete(s.sampleId); }
  }
  async label() {
    await this.freezeSplit();
    for (let offset = 0; offset < this.samples.length && this.remainingMs > 0; offset += this.workers.length) {
      const rows = this.samples.slice(offset, offset + this.workers.length);
      const results = await Promise.allSettled(rows.map(async (s, i) => this.ensureLabel(s, this.workers[i]!)));
      for (let i = 0; i < rows.length; i++) {
        const r = results[i]!; if (r.status === "rejected") throw r.reason;
        await this.writeTargets(rows[i]!);
      }
      await this.checkpoint();
    }
  }
  learningRows() {
    return this.samples.filter(s => this.sources[s.sampleId]!.phase !== "threat" && this.labels.has(s.sampleId)).flatMap(s => {
      const targets = new Map(pairTargets(s, this.labels.get(s.sampleId)!, this.config.learning.sensitiveGap).targets.map(t => [t.pairId, t]));
      return pairObservations(s).pairs.map(p => ({ ...p, y: targets.get(p.pairId)!.y }));
    }).sort((a, b) => a.pairId.localeCompare(b.pairId));
  }
  async fit(evaluate = false) {
    if (!evaluate && await this.archive.read("fit-final.json")) throw new Error("holdout_already_evaluated_create_new_experiment");
    const rows = this.learningRows();
    if (!rows.length) return null;
    if (this.samples.filter(s => this.sources[s.sampleId]!.phase !== "threat").some(s => !this.labels.has(s.sampleId))) throw new Error("learning_requires_complete_labels");
    const inputHash = digest(rows);
    const path = evaluate ? "fit-final.json" : "fit.json";
    const writeWeights = async (result: PairFitResult) => {
      const training = rows.filter(r => r.split === "train"), selected = new Set(result.trainingPairIds);
      await this.archive.write(evaluate ? "pair-weights-final.json" : "pair-weights.json", {
        inputHash, convention: "mean-one; equal source group, state, pair",
        fit: pairWeights(training.filter(r => selected.has(r.pairId))), train: pairWeights(training),
        ...(evaluate ? { test: pairWeights(rows.filter(r => r.split === "test")) } : {}),
      });
    };
    const prior = await this.archive.read(path) as { inputHash: string; result: PairFitResult; resultHash: string } | null;
    if (prior && prior.resultHash !== digest(prior.result)) throw new Error("pair_fit_identity_mismatch");
    if (prior?.inputHash === inputHash) {
      const result = PairFitResultSchema.parse(prior.result); await writeWeights(result); return result;
    }
    if (evaluate && prior) throw new Error("holdout_already_evaluated_create_new_experiment");
    if (this.remainingMs <= 0) return null;
    const start = performance.now();
    const result = PairFitResultSchema.parse(await pythonOperation({ operation: "fit_pairs", rows,
      allFeatures: PAIR_FEATURES, featureSets: { global: LAB_FEATURES, deltas: [...LAB_FEATURES, ...PAIR_DELTAS], full: PAIR_FEATURES },
      options: this.config.learning, evaluate }, Math.min(300000, this.remainingMs)));
    if (result.evaluated !== evaluate) throw new Error("pair_fit_evaluation_mismatch");
    for (const model of Object.values(result.models)) if (model.model) PairSvrModelSchema.parse(model.model);
    const durationMs = performance.now() - start; this.#work.learningMs += durationMs;
    await this.archive.write(path, { schemaVersion: "question-lab-fit-archive/v2", inputHash, result, resultHash: digest(result), durationMs });
    await writeWeights(result);
    await this.checkpoint(); return result;
  }
  async selectAnchors() {
    const prior = await this.archive.read("anchors.json") as { ids: string[] } | null;
    if (prior) return prior.ids;
    if (!this.split) throw new Error("anchors_require_frozen_split");
    const eligible = this.samples.filter(s => s.split === "train" && this.labels.has(s.sampleId) && pairObservations(s).pairs.length)
      .map(s => ({ s, summary: pairTargets(s, this.labels.get(s.sampleId)!, this.config.learning.sensitiveGap).summary }))
      .filter(r => ["efficiency", "dora"].includes(r.summary.side) && !r.summary.thirdTied && (r.summary.outsideGap ?? 0) > this.config.learning.robustGap);
    const chosen: string[] = [], groups = new Set<string>(), coverage = new Map<string, number>();
    for (const side of ["efficiency", "dora"]) {
      const pool = eligible.filter(r => r.summary.side === side);
      for (let i = 0; i < this.config.scans.anchorCount / 2; i++) {
        const sliceKey = (s: LabSample) => `${pairObservations(s).pairs[0]!.features.deltaS! > 0}:${Math.floor(s.features.turn! / 3)}:${pairObservations(s).pairs[0]!.features.deltaD}`;
        pool.sort((a, b) => (coverage.get(sliceKey(a.s)) ?? 0) - (coverage.get(sliceKey(b.s)) ?? 0) || a.s.sampleId.localeCompare(b.s.sampleId));
        const row = pool.find(r => !groups.has(r.s.groupId)); if (!row) break;
        chosen.push(row.s.sampleId); groups.add(row.s.groupId); const key = sliceKey(row.s); coverage.set(key, (coverage.get(key) ?? 0) + 1);
      }
    }
    await this.archive.write("anchors.json", { ids: chosen, requested: this.config.scans.anchorCount,
      trainingInputHash: digest(this.samples.filter(s => s.split === "train").map(s => [s.sampleId, this.labels.get(s.sampleId) ?? null])) });
    return chosen;
  }
  private async scanPlan(path: string, inputHash: string, create: () => PairScanCoordinate[]) {
    const saved = await this.archive.read(path) as { inputHash: string; coordinates: PairScanCoordinate[]; hash: string } | null;
    if (saved) {
      if (saved.inputHash !== inputHash || saved.hash !== digest(saved.coordinates)) throw new Error("scan_plan_identity_mismatch");
      return saved.coordinates.map(c => {
        const coordinate = PairScanCoordinateSchema.parse(c);
        if (coordinate.id !== digest({ anchorId: coordinate.anchorId, axis: coordinate.axis, values: coordinate.values, phase: coordinate.phase }))
          throw new Error("scan_coordinate_identity_mismatch");
        return coordinate;
      });
    }
    const coordinates = create(); await this.archive.write(path, { inputHash, coordinates, hash: digest(coordinates) });
    return coordinates;
  }
  async scan(threats = false) {
    if (!threats && await this.archive.read("fit-final.json")) throw new Error("holdout_already_evaluated_create_new_experiment");
    const ids = await this.selectAnchors();
    for (const id of ids) {
      if (!this.searching) break;
      const base = this.samples.find(s => s.sampleId === id)!;
      if (base.split !== "train") throw new Error("scan_anchor_is_holdout");
      const witness = await this.archive.read(`witnesses/${base.constructionId}.json`) as Witness;
      const path = `scan-plans/${threats ? "threat-" : ""}${id}.json`;
      const planIdentity = digest({ anchor: base.sampleId, witnessHash: digest(witness), config: this.config.scans });
      const plan = await this.scanPlan(path, planIdentity, () => threats ? threatCoordinates(base) : scanCoordinates(base).slice(0, Math.min(36, this.config.scans.variantsPerAnchor)));
      const execute = async (coordinate: PairScanCoordinate, worker: LabWorker) => {
        const resultPath = `scan-results/${coordinate.id}.json`;
        const saved = await this.archive.read(resultPath) as { recordHash: string; coordinate: PairScanCoordinate; [key: string]: unknown } | null;
        if (saved) {
          const { recordHash, ...content } = saved;
          if (recordHash !== digest(content) || digest(saved.coordinate) !== digest(coordinate)) throw new Error("scan_result_identity_mismatch");
          return;
        }
        if (!this.searching) return;
        let record: Record<string, unknown> = { coordinate, status: "failed" };
        try {
          let request = scanRequest(witness, base, coordinate);
          let evaluated = await this.evaluate(request, worker, Number.parseInt(coordinate.id.slice(0, 12), 16), threats ? 100 : 10);
          if (threats && evaluated.result?.status === "ok") {
            const repair = repairThreatDraw(witness, request, evaluated.result);
            if (repair) { request = repair; evaluated = await this.evaluate(request, worker, Number.parseInt(coordinate.id.slice(0, 12), 16), 100); }
          }
          if (evaluated.sample && evaluated.result?.status === "ok") {
            const s = evaluated.sample;
            const changed = verifyScan(base, s, coordinate, witness, request);
            s.changed = changed;
            await this.store(s, request, evaluated.result, { phase: threats ? "threat" : "scan", coordinate, anchorId: id, changed });
            await this.ensureLabel(s, worker);
            const data = await this.writeTargets(s);
            record = { coordinate, status: "ok", sampleId: s.sampleId, changed, summary: data.summary, conflict: pairObservations(s).pairs.length > 0 };
          } else record.reason = evaluated.reason ?? "budget_exhausted";
        } catch (e) {
          const reason = (e as Error).message;
          if (!reason.startsWith("scan_") && !reason.startsWith("contradiction_")) throw e;
          record.reason = reason;
        }
        await this.archive.write(resultPath, { ...record, recordHash: digest(record) }); await this.checkpoint();
      };
      for (let i = 0; i < plan.length; i += this.workers.length) {
        const settled = await Promise.allSettled(plan.slice(i, i + this.workers.length).map((c, j) => execute(c, this.workers[j]!)));
        for (const r of settled) if (r.status === "rejected") throw r.reason;
      }
      if (!threats && this.config.scans.variantsPerAnchor > 36) {
        const extraPath = `scan-plans/fine-${id}.json`;
        // Never freeze a refinement plan based on only a partial coarse scan.
        const records = await Promise.all(plan.map(c => this.archive.read(`scan-results/${c.id}.json`)));
        if (records.some(r => !r)) continue;
        const extra = await this.scanPlan(extraPath, digest({ planIdentity, records, baseline: pairTargets(base, this.labels.get(base.sampleId)!, this.config.learning.sensitiveGap) }), () => jointCoordinates(id, records.filter(r => (r as { status: string }).status === "ok").map(r => {
            const row = r as { coordinate: PairScanCoordinate; sampleId: string };
            const s = this.samples.find(s => s.sampleId === row.sampleId)!;
            const basePairs = pairObservations(base).pairs, pairs = pairObservations(s).pairs;
            const same = pairs.find(p => p.eAction === basePairs[0]?.eAction && p.dAction === basePairs[0]?.dAction);
            const data = pairTargets(s, this.labels.get(s.sampleId)!, this.config.learning.sensitiveGap);
            return { coordinate: row.coordinate, gap: same ? data.targets.find(t => t.pairId === same.pairId)!.y : null };
          }).concat(baselineScanPoints(base, pairTargets(base, this.labels.get(base.sampleId)!, this.config.learning.sensitiveGap).targets[0]!.y))).slice(0, this.config.scans.variantsPerAnchor - 36));
        for (const c of extra) await execute(c, this.workers[0]!);
      }
    }
    await this.archive.write(threats ? "threat-stage.json" : "scan-stage.json", { anchors: ids, stopped: !this.searching });
  }
  async refine() {
    if (await this.archive.read("fit-final.json")) throw new Error("holdout_already_evaluated_create_new_experiment");
    for (let round = 1; round <= this.config.budget.refinementRounds && this.searching; round++) {
      const done = await this.archive.read(`generation/round-${round}.json`) as { complete: boolean } | null;
      if (done?.complete) continue;
      const path = `acquisition/round-${round}.json`;
      let saved = await this.archive.read(path) as { inputHash: string; result: PairFitResult | null; modelHash: string } | null;
      const inputHash = digest(this.learningRows().filter(r => r.split === "train").filter(r => this.samples.find(s => s.sampleId === r.sampleId)!.round < round || this.sources[r.sampleId]!.phase !== "refinement"));
      if (!saved) {
        if (this.samples.some(s => this.sources[s.sampleId]!.phase === "refinement" && s.round === round)) throw new Error("refinement_snapshot_missing");
        const result = await this.fit(false);
        saved = { inputHash, result, modelHash: digest(result) }; await this.archive.write(path, saved);
      }
      if (saved.inputHash !== inputHash || saved.modelHash !== digest(saved.result)) throw new Error("refinement_snapshot_mismatch");
      if (saved.result) PairFitResultSchema.parse(saved.result);
      const result = await this.generate(round, saved.result);
      await this.label();
      if (!result.complete) break;
    }
  }
}
