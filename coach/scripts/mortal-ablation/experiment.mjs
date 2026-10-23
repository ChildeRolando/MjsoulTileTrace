import { readFile, readdir, mkdir, writeFile, unlink } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoachProviderConfigSchema, ArenaBlindObservationSchema, ScenePatternFactsSchema } from '@riichi-coach/contracts';
import { ArenaRunAliasVault } from '@riichi-coach/desktop/blind-discard-arena';
import { createArenaRagRetriever } from '@riichi-coach/desktop/blind-discard-arena-rag';
import { runBlindCoachCase, createArenaRagRunnerTool } from '@riichi-coach/desktop/blind-discard-arena-runner';
import { createArenaToolCallProvider } from '@riichi-coach/desktop/llm-provider/service';
import { boundedRetriever } from '../scene-study/study.mjs';
import { corpus, unrequestedReference, recover } from '../context-rag/experiment.mjs';
import { hash, read, save, exists, ordered } from '../scene-study/common.mjs';
export { recover };

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const assemblies = {
  A: { patterns: false, rag: 'none' }, B: { patterns: true, rag: 'none' },
  C: { patterns: false, rag: 'original' }, D: { patterns: true, rag: 'original' },
  E: { patterns: false, rag: 'enhanced' }, F: { patterns: true, rag: 'enhanced' },
};
export const armNames = { A: '无提示／无检索', B: '有提示／无检索', C: '无提示／原检索', D: '有提示／原检索', E: '无提示／增强检索', F: '有提示／增强检索' };
export function modelContext(c, arm) {
  const a = assemblies[arm]; if (!a) throw new Error('unknown_arm');
  return {
    observation: ArenaBlindObservationSchema.parse({ ...c.observation, tools: a.rag === 'none'
      ? { description: '本组不提供知识检索工具。', supportedCapabilities: [] }
      : { description: '可自主检索两套原始网页版教材；最多两次，每次三张，合计最多六张去重知识卡。可改写查询或不检索。', supportedCapabilities: ['search_knowledge'] } }),
    sceneStudy: { facts: ScenePatternFactsSchema.parse(c.facts), enablePatterns: a.patterns },
  };
}
async function codeHash() {
  const files = ['scripts/mortal-ablation/experiment.mjs', 'scripts/mortal-ablation/prepare.mjs', 'scripts/context-rag/experiment.mjs', 'scripts/scene-study/common.mjs', 'scripts/scene-study/study.mjs', 'scripts/scene-study/knowledge.mjs', 'scripts/replay-corpus/canonical.mjs', 'scripts/scene-study/prepare.mjs'];
  async function walk(dir) { for (const e of await readdir(join(root, dir), { withFileTypes: true })) { if (e.isDirectory()) await walk(`${dir}/${e.name}`); else if (e.name.endsWith('.js')) files.push(`${dir}/${e.name}`); } }
  for (const p of ['contracts', 'reasoning', 'desktop', 'mortal-runtime', 'question-lab']) await walk(`packages/${p}/dist`);
  return hash(await Promise.all(files.sort().map(async f => [f, hash(await readFile(join(root, f)))])));
}
export function validateDataset(dataset) {
  const cs = dataset.cases;
  if (cs.length !== 21 || new Set(cs.map(c => c.gameId)).size !== 21 || new Set(cs.map(c => c.sourceHash)).size !== 21 || new Set(cs.map(c => c.id)).size !== 21 || cs.filter(c => c.split === 'pilot').length !== 1 || cs.filter(c => c.split === 'evaluation' && c.stratum === 'random').length !== 12 || cs.filter(c => c.split === 'evaluation' && c.stratum === 'challenge').length !== 8 || cs.some(c => dataset.excludedGames.includes(c.gameId) || dataset.excludedHashes.includes(c.sourceHash))) throw new Error('mortal_ablation_sample_invalid');
  for (const c of cs) modelContext(c, 'A');
}
export async function freeze(out, knowledgePath, settingsPath) {
  if (await exists(join(out, 'freeze.json'))) return verify(out);
  const dataset = await read(join(out, 'dataset.json')), knowledge = await read(knowledgePath); validateDataset(dataset);
  const defaultPath = join(process.env.APPDATA ?? '', 'Electron/coach-provider-settings-v1.json');
  const path = settingsPath ?? (await exists(defaultPath) ? defaultPath : null);
  const provider = CoachProviderConfigSchema.parse(path ? await read(path) : { providerId: 'codex-cli', modelName: 'gpt-6-luna', reasoningEffort: 'max' });
  const config = { version: 'mortal-rag-ablation/v1', frozenAt: new Date().toISOString(), baseCommit: '53a70aad9f485d5f9c29d0ecbb8740590c963250', datasetHash: hash(dataset), knowledgeHash: hash(knowledge), codeHash: await codeHash(), provider, settingsSource: path ?? 'electron-entry.ts documented default', assemblies,
    schedule: ordered(dataset.cases.flatMap(c => Object.keys(assemblies).map(arm => ({ caseId: c.id, gameId: c.gameId, split: c.split, stratum: c.stratum, arm }))), x => x.caseId + x.arm, 'mortal-ablation-arms-v1'),
    limits: { maxProviderTurns: 4, maxToolCalls: 2, maxProviderOutputTokens: 32768, maxRunElapsedMs: 300000 },
    retrievalBudget: { calls: 2, cardsPerCall: 3, uniqueParents: 6, maxPassageChars: 1000 }, concurrency: 2, retries: 0,
    parameters: { temperature: 'adapter_default', seed: 'not_supported' },
    analysis: { primary: 'Mortal native preferred top-1 canonical candidate match / all 20 attempts per arm, failures retained; random 12 and challenge 8 separately', contrasts: ['B-A', 'D-C', 'F-E', 'E-C', 'F-D', '(F-E)-(D-C)'], intervals: 'paired game-cluster bootstrap 2000 draws, descriptive 95%; exact paired discordance test with Holm adjustment for five pooled simple contrasts; interaction and strata descriptive only', patternStrata: '18 per-hit supports and paired differences exploratory only; no individual causal attribution', tokenTargetRatio: 1.3, limitations: 'Mortal agreement is a model preference proxy, not expert or explanation correctness. One generation/model/arm; challenges enriched; no tuning on evaluation; not the old formal 60-scene study.' } };
  await save(join(out, 'knowledge.json'), knowledge); await save(join(out, 'freeze.json'), config); return config;
}
export async function verify(out) {
  const config = await read(join(out, 'freeze.json'));
  if (config.datasetHash !== hash(await read(join(out, 'dataset.json'))) || config.knowledgeHash !== hash(await read(join(out, 'knowledge.json'))) || config.codeHash !== await codeHash()) throw new Error('mortal_ablation_frozen_input_changed_use_new_directory');
  return config;
}
export async function run(out, split = 'pilot') {
  if (!['pilot', 'evaluation'].includes(split)) throw new Error('mortal_ablation_invalid_split');
  const config = await verify(out), dataset = await read(join(out, 'dataset.json')), knowledge = await read(join(out, 'knowledge.json'));
  if (split === 'evaluation') {
    for (const j of config.schedule.filter(j => j.split === 'pilot')) {
      const r = await read(join(out, 'runs', `${j.split}-${j.caseId}-${j.arm}.json`));
      if (!r.result || ['runner_error', 'interrupted'].includes(r.status)) throw new Error('mortal_ablation_pilot_engineering_failure');
    }
  }
  await mkdir(join(out, 'runs'), { recursive: true }); await writeFile(join(out, 'active.lock'), JSON.stringify({ pid: process.pid, split }), { flag: 'wx' });
  const jobs = config.schedule.filter(x => x.split === split);
  async function execute(item) {
    const name = `${item.split}-${item.caseId}-${item.arm}`, path = join(out, 'runs', name + '.json');
    if (await exists(path)) return;
    const started = join(out, 'runs', name + '.started.json');
    if (await exists(started)) { await save(path, { ...item, status: 'interrupted', usage: 'unknown' }); return; }
    const c = dataset.cases.find(c => c.id === item.caseId), a = config.assemblies[item.arm], aliases = new ArenaRunAliasVault(), retrieval = [], componentTrace = [], sourceMap = {};
    const context = modelContext(c, item.arm);
    for (const card of knowledge.cards) sourceMap[aliases.reference(`blind-discard-arena-rag/v1\0${card.source.system}\0${card.id}`)] = card.id;
    const underlying = createArenaToolCallProvider({ settings: config.provider.providerId === 'codex-cli' ? null : config.provider, ...(config.provider.providerId === 'codex-cli' ? { arenaCodex: { modelName: config.provider.modelName, reasoningEffort: config.provider.reasoningEffort } } : {}), credentials: { readKey: async () => process.env.RIICHI_COACH_API_KEY ?? null }, fetchImpl: fetch });
    if (!underlying) throw new Error('mortal_ablation_provider_unconfigured');
    let turn = 0;
    const provider = { descriptor: () => underlying.descriptor(), async request(request, signal) {
      await save(join(out, 'requests', `${name}-${++turn}.json`), request);
      const response = await underlying.request(request, signal);
      await save(join(out, 'responses', `${name}-${turn}.json`), response); return response;
    } };
    const retriever = a.rag === 'none' ? null : boundedRetriever(createArenaRagRetriever({ mode: 'local', caseRef: context.observation.caseRef, aliases, components: { smallToBig: a.rag === 'enhanced', contextEnrichment: a.rag === 'enhanced' }, loadCorpus: async () => corpus(knowledge), onComponentTrace: t => componentTrace.push(t) }), retrieval, sourceMap);
    await save(started, { ...item, freezeHash: hash(config), startedAt: new Date().toISOString(), provider: underlying.descriptor() });
    const startedMs = Date.now();
    try {
      // No label is loaded here. Grading happens offline after submission is locked.
      const result = await runBlindCoachCase({ ...context, grading: { binding: c.binding, reference: unrequestedReference }, provider, tools: retriever ? [createArenaRagRunnerTool({ caseRef: context.observation.caseRef, retriever, maxPassagesPerQuery: 3 })] : [], limits: config.limits, onEvent: event => appendFileSync(join(out, 'runs', name + '.events.jsonl'), JSON.stringify(event) + '\n') });
      await save(path, { ...item, freezeHash: hash(config), status: result.status, result, retrieval, componentTrace, sourceMap });
      console.log(JSON.stringify({ ...item, status: result.status, elapsedMs: result.elapsedMs }));
    } catch (e) {
      await save(path, { ...item, freezeHash: hash(config), status: 'runner_error', error: String(e.message), elapsedMs: Date.now() - startedMs, retrieval, componentTrace, sourceMap, usage: 'unknown' });
      console.log(JSON.stringify({ ...item, status: 'runner_error', error: String(e.message) }));
    }
  }
  try { await Promise.all(Array.from({ length: config.concurrency }, (_, worker) => (async () => { for (let i = worker; i < jobs.length; i += config.concurrency) await execute(jobs[i]); })())); }
  finally { await unlink(join(out, 'active.lock')); }
}
