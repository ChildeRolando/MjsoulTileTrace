import { readFile, readdir, mkdir, writeFile, unlink, appendFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoachProviderConfigSchema, ArenaLabelUnavailableReasonSchema } from '@riichi-coach/contracts';
import { ArenaRunAliasVault } from '@riichi-coach/desktop/blind-discard-arena';
import { createArenaRagRetriever } from '@riichi-coach/desktop/blind-discard-arena-rag';
import { runBlindCoachCase, createArenaRagRunnerTool } from '@riichi-coach/desktop/blind-discard-arena-runner';
import { createArenaToolCallProvider } from '@riichi-coach/desktop/llm-provider/service';
import { boundedRetriever } from '../scene-study/study.mjs';
import { arenaCorpus } from '../scene-study/knowledge.mjs';
import { hash, read, save, exists, ordered } from '../scene-study/common.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const assemblies = { baseline: { smallToBig: false, contextEnrichment: false }, combined: { smallToBig: true, contextEnrichment: true } };
export const unrequestedReference = { status: 'unavailable', reason: ArenaLabelUnavailableReasonSchema.parse('not_requested_in_scene_study') };
async function codeHash() {
  const files = ['scripts/context-rag/experiment.mjs', 'scripts/context-rag/prepare.mjs', 'scripts/scene-study/common.mjs', 'scripts/scene-study/study.mjs', 'scripts/scene-study/knowledge.mjs'];
  async function walk(dir) { for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
    if (e.isDirectory()) await walk(`${dir}/${e.name}`);
    else if (e.name.endsWith('.js')) files.push(`${dir}/${e.name}`);
  } }
  for (const p of ['contracts', 'reasoning', 'desktop']) await walk(`packages/${p}/dist`);
  return hash(await Promise.all(files.sort().map(async f => [f, hash(await readFile(join(root, f)))])));
}
export function corpus(knowledge) {
  const result = arenaCorpus(knowledge);
  return { ...result, passages: result.passages.map(p => ({ ...p, localSourcePath: `knowledge.json#${p.id}` })) };
}
export async function freeze(out, knowledgePath, settingsPath) {
  if (await exists(join(out, 'freeze.json'))) return verify(out);
  const dataset = await read(join(out, 'dataset.json')), knowledge = await read(knowledgePath);
  if (dataset.cases.length !== 10 || new Set(dataset.cases.map(c => c.gameId)).size !== 10 || dataset.cases.some(c => dataset.excludedGames.includes(c.gameId))) throw new Error('context_rag_sample_invalid');
  const defaultPath = join(process.env.APPDATA ?? '', 'Electron/coach-provider-settings-v1.json');
  const path = settingsPath ?? (await exists(defaultPath) ? defaultPath : null);
  const provider = CoachProviderConfigSchema.parse(path ? await read(path) : { providerId: 'codex-cli', modelName: 'gpt-6-luna', reasoningEffort: 'max' });
  const config = { version: 'arena-context-rag-study/v1', frozenAt: new Date().toISOString(), baseCommit: 'ff30658eaf9427e03fd00e565f492050f75f1b66', datasetHash: hash(dataset), knowledgeHash: hash(knowledge), codeHash: await codeHash(), provider, settingsSource: path ?? 'electron-entry.ts documented default', assemblies,
    schedule: ordered(dataset.cases.flatMap(c => Object.keys(assemblies).map(arm => ({ caseId: c.id, gameId: c.gameId, split: c.split, arm }))), x => x.caseId + x.arm, 'context-rag-arm-v1'),
    limits: { maxProviderTurns: 4, maxToolCalls: 2, maxProviderOutputTokens: 32768, maxRunElapsedMs: 300000 },
    retrievalBudget: { calls: 2, cardsPerCall: 3, uniqueParents: 6, maxPassageChars: 1000 },
    parameters: { temperature: 'adapter_default', seed: 'not_supported', patterns: false }, retries: 0,
    decision: 'Engineering pilot, not expert validation: compare paired retrieval coverage, returned source validity, tokens (target ratio <=1.3), elapsed and all failures. Do not tune on evaluation. Assistant needs annotations are diagnostic, not human gold.' };
  await save(join(out, 'knowledge.json'), knowledge);
  await save(join(out, 'freeze.json'), config);
  return config;
}
export async function verify(out) {
  const config = await read(join(out, 'freeze.json'));
  if (config.datasetHash !== hash(await read(join(out, 'dataset.json'))) || config.knowledgeHash !== hash(await read(join(out, 'knowledge.json'))) || config.codeHash !== await codeHash()) throw new Error('context_rag_frozen_input_changed_use_new_directory');
  return config;
}
export async function recover(out) {
  const path = join(out, 'active.lock');
  if (!(await exists(path))) return;
  const owner = await read(path);
  try { process.kill(owner.pid, 0); throw new Error('context_rag_process_still_active'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
  for (const name of await readdir(join(out, 'runs'))) if (name.endsWith('.started.json')) {
    const target = join(out, 'runs', name.replace('.started.json', '.json'));
    if (!(await exists(target))) await save(target, { ...await read(join(out, 'runs', name)), status: 'interrupted', usage: 'unknown' });
  }
  await unlink(path);
}
export async function run(out, split = 'pilot') {
  if (!['pilot', 'evaluation'].includes(split)) throw new Error('context_rag_invalid_split');
  const config = await verify(out), dataset = await read(join(out, 'dataset.json')), knowledge = await read(join(out, 'knowledge.json'));
  let needsHash = null;
  if (split === 'evaluation') {
    const needs = await read(join(out, 'needs.json'));
    if (needs.datasetHash !== hash(dataset) || needs.knowledgeHash !== hash(knowledge) || needs.cases.length !== 8 || new Set(needs.cases.map(c => c.caseId)).size !== 8 || dataset.cases.filter(c => c.split === 'evaluation').some(c => !needs.cases.some(n => n.caseId === c.id))) throw new Error('context_rag_needs_missing');
    needsHash = hash(needs);
    const receipt = join(out, 'needs-receipt.json');
    if (await exists(receipt)) { if ((await read(receipt)).hash !== needsHash) throw new Error('context_rag_needs_changed'); }
    else await save(receipt, { hash: needsHash, frozenAt: new Date().toISOString() });
  }
  await mkdir(join(out, 'runs'), { recursive: true });
  await writeFile(join(out, 'active.lock'), JSON.stringify({ pid: process.pid, split }), { flag: 'wx' });
  const jobs = config.schedule.filter(x => x.split === split);
  async function execute(item) {
    const name = `${item.split}-${item.caseId}-${item.arm}`, path = join(out, 'runs', name + '.json');
    if (await exists(path)) return;
    const started = join(out, 'runs', name + '.started.json');
    if (await exists(started)) { await save(path, { ...item, status: 'interrupted', usage: 'unknown' }); return; }
    const c = dataset.cases.find(c => c.id === item.caseId), aliases = new ArenaRunAliasVault(), retrieval = [], componentTrace = [], sourceMap = {};
    for (const card of knowledge.cards) sourceMap[aliases.reference(`blind-discard-arena-rag/v1\0${card.source.system}\0${card.id}`)] = card.id;
    const underlying = createArenaToolCallProvider({ settings: config.provider.providerId === 'codex-cli' ? null : config.provider,
      ...(config.provider.providerId === 'codex-cli' ? { arenaCodex: { modelName: config.provider.modelName, reasoningEffort: config.provider.reasoningEffort } } : {}), credentials: { readKey: async () => process.env.RIICHI_COACH_API_KEY ?? null }, fetchImpl: fetch });
    if (!underlying) throw new Error('context_rag_provider_unconfigured');
    let turn = 0;
    const provider = { descriptor: () => underlying.descriptor(), async request(request, signal) {
      await save(join(out, 'requests', `${name}-${++turn}.json`), request);
      const response = await underlying.request(request, signal);
      await save(join(out, 'responses', `${name}-${turn}.json`), response);
      return response;
    } };
    const observation = { ...c.observation, tools: { description: '可自主检索两套原始网页版教材；最多两次，每次三张，合计最多六张去重知识卡。可改写查询或不检索。', supportedCapabilities: ['search_knowledge'] } };
    const retriever = boundedRetriever(createArenaRagRetriever({ mode: 'local', caseRef: observation.caseRef, aliases, components: config.assemblies[item.arm], loadCorpus: async () => corpus(knowledge), onComponentTrace: t => componentTrace.push(t) }), retrieval, sourceMap);
    await save(started, { ...item, freezeHash: hash(config), needsHash, startedAt: new Date().toISOString(), provider: underlying.descriptor() });
    const startedMs = Date.now();
    try {
      const result = await runBlindCoachCase({ observation, sceneStudy: { facts: c.facts, enablePatterns: false }, grading: { binding: c.binding, reference: unrequestedReference }, provider,
        tools: [createArenaRagRunnerTool({ caseRef: observation.caseRef, retriever, maxPassagesPerQuery: 3 })], limits: config.limits,
        onEvent: event => appendFileSync(join(out, 'runs', name + '.events.jsonl'), JSON.stringify(event) + '\n') });
      await save(path, { ...item, freezeHash: hash(config), needsHash, status: result.status, result, retrieval, componentTrace, sourceMap });
      console.log(JSON.stringify({ ...item, status: result.status, elapsedMs: result.elapsedMs }));
    } catch (e) {
      await save(path, { ...item, freezeHash: hash(config), needsHash, status: 'runner_error', error: String(e.message), elapsedMs: Date.now() - startedMs, retrieval, componentTrace, sourceMap, usage: 'unknown' });
      console.log(JSON.stringify({ ...item, status: 'runner_error', error: String(e.message) }));
    }
  }
  // Fixed concurrency two, independent contexts; planned schedule retained and no automatic retries.
  try { await Promise.all([0, 1].map(async worker => { for (let i = worker; i < jobs.length; i += 2) await execute(jobs[i]); })); }
  finally { await unlink(join(out, 'active.lock')); }
}
