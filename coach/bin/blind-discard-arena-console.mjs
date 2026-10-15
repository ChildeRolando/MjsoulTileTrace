import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readArenaMistakes } from './arena-mistakes.mjs';
import { arenaPage } from './arena-pages.mjs';
import { visibleArenaMortalDetails, ArenaArchiveManifestSchema, ArenaArchiveSummarySchema, ArenaCaseCatalogSchema, parseArenaArchiveEvents, parseArenaCaseTrace, arenaTokenBudget, ARENA_EXPERIMENTS } from '@riichi-coach/desktop/blind-discard-arena-archive';

import { ARENA_TOOL_CALL_PROMPT, ARENA_TOOL_CALL_PROMPT_VERSION, arenaCodexTurnInstructions } from '@riichi-coach/desktop/blind-discard-arena-provider';
import { ARENA_MCP_TOOL_DESCRIPTION, ARENA_MCP_LIMITS_V1, SupportedDimensionSchema } from '@riichi-coach/desktop/blind-discard-arena-mcp';
import { ARENA_RUN_LIMITS_V1, ARENA_RAG_TOOL_PARAMETERS } from '@riichi-coach/desktop/blind-discard-arena-runner';
import { ARENA_RAG_LIMITS_V1, ARENA_RAG_RETRIEVER_VERSION } from '@riichi-coach/desktop/blind-discard-arena-rag';
import { BLIND_DISCARD_ARENA_RAG_SEED_CORPUS } from '@riichi-coach/desktop/blind-discard-arena-rag-seed';

const DEFAULTS = { provider: 'codex-cli', model: 'gpt-6-luna', reasoningEffort: 'high', baseUrl: '',
  tokenWarningThreshold: 100_000_000, maxProviderTurns: 6, maxToolCalls: 4, maxProviderOutputTokens: 2048, maxRunMs: 300000 };
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const assets = fileURLToPath(new URL('../arena-console/', import.meta.url));
const json = (response, status, body) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
const fail = (code, status = 400) => Object.assign(new Error(code), { status });

function settings(raw) {
  const value = { ...DEFAULTS, ...raw };
  if (!['codex-cli', 'openai-compatible'].includes(value.provider) || typeof value.model !== 'string' || !value.model.trim() || value.model.length > 200
    || !['low', 'medium', 'high', 'xhigh', 'max'].includes(value.reasoningEffort)) throw fail('请检查服务类型、模型名称和推理强度。');
  if (typeof value.baseUrl !== 'string') throw fail('接口地址格式不正确。');
  if (value.baseUrl) { const url = new URL(value.baseUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw fail('接口地址仅支持不含凭据的 HTTP 或 HTTPS 地址。'); }
  for (const [key, maximum] of Object.entries({ tokenWarningThreshold: Number.MAX_SAFE_INTEGER, maxProviderTurns: 12, maxToolCalls: 16, maxProviderOutputTokens: Number.MAX_SAFE_INTEGER, maxRunMs: 300000 })) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 1 || value[key] > maximum) throw fail('实验预算超出支持范围。');
  }
  return Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, typeof value[key] === 'string' ? value[key].trim() : value[key]]));
}

async function body(request) {
  const chunks = []; let bytes = 0;
  for await (const chunk of request) { bytes += chunk.length; if (bytes > 16384) throw fail('配置内容过长。', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('请提交有效配置。'); }
}

/** Local console for the existing CLI; one owned experiment at a time, no new queue. */
export async function createArenaConsole({ coachRoot = fileURLToPath(new URL('../', import.meta.url)), archiveRoot = join(coachRoot, 'reports/blind-discard-arena'), cliPath = join(coachRoot, 'bin/blind-discard-arena.mjs') } = {}) {
  await mkdir(archiveRoot, { recursive: true });
  const configPath = join(archiveRoot, 'console-settings.json');
  let config = { ...DEFAULTS }, apiKey = '', job = null, child = null, stopping = false;
  try { config = settings(JSON.parse(await readFile(configPath, 'utf8'))); } catch { /* first launch uses documented defaults */ }
  const publicConfig = () => ({ ...config, keyConfigured: apiKey.length > 0 });
  const publicJob = () => job === null ? null : structuredClone(job);
  const catalog = async (type = 'legacy') => {
    try {
      const bank = ArenaCaseCatalogSchema.parse(JSON.parse(await readFile(join(archiveRoot, type === 'legacy' ? 'case-catalog.json' : `case-catalog-${type}.json`), 'utf8')));
      return bank.datasetId === (type === 'legacy' ? 'blind-discard-dev-v1' : ARENA_EXPERIMENTS[type]?.datasetId) ? bank : null;
    } catch { return null; }
  };
  const runs = async () => {
    const found = [];
    for (const entry of await readdir(archiveRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !UUID.test(entry.name)) continue;
      try {
        const manifest = ArenaArchiveManifestSchema.parse(JSON.parse(await readFile(join(archiveRoot, entry.name, 'manifest.json'), 'utf8')));
        let summary = null;
        try { summary = ArenaArchiveSummarySchema.parse(JSON.parse(await readFile(join(archiveRoot, entry.name, 'summary.json'), 'utf8'))); } catch { /* interrupted archives stay visibly incomplete */ }
        found.push({ id: entry.name, manifest, summary, incomplete: summary === null });
      } catch { /* incomplete manifest is not a readable run */ }
    }
    return found.sort((a, b) => b.manifest.startedAt.localeCompare(a.manifest.startedAt));
  };
  const persistJob = () => writeFile(join(archiveRoot, 'console-last-job.json'), JSON.stringify(publicJob(), null, 2));
  const terminate = () => {
    if (!child || child.exitCode !== null) return;
    if (process.platform === 'win32') spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); } }
  };
  const runStep = (mode, snapshot, key) => new Promise(resolveStep => {
    const args = [cliPath, 'run', '--dataset', snapshot.replay?.datasetId ?? ARENA_EXPERIMENTS[snapshot.experimentType === 'mistakes' ? 'flat' : snapshot.experimentType].datasetId, '--max-cases', String(snapshot.replay ? 1 : snapshot.maxCases), '--case-offset', String(snapshot.replay ? 0 : snapshot.caseOffset), '--rag', mode === 'fault' ? 'local' : mode,
      '--provider', snapshot.provider, '--model', snapshot.model, '--reasoning-effort', snapshot.reasoningEffort,
      '--token-warning-threshold', String(snapshot.tokenWarningThreshold), '--max-provider-turns', String(snapshot.maxProviderTurns),
      '--max-tool-calls', String(snapshot.maxToolCalls), '--max-provider-output-tokens', String(snapshot.maxProviderOutputTokens), '--max-run-ms', String(snapshot.maxRunMs)];
    if (snapshot.provider === 'openai-compatible') args.push('--base-url', snapshot.baseUrl);
    if (mode === 'fault') args.push('--fault', 'first-helper-timeout');
    if (mode === 'mortal-details') args.splice(0, args.length, cliPath, 'mortal-details', snapshot.runId);
    if (mode === 'catalog') args.splice(0, args.length, cliPath, 'catalog');
    if (snapshot.replay) args.push('--replay-run', snapshot.replay.runId, '--replay-case', String(snapshot.replay.caseOrdinal));
    const step = { mode, status: 'running', startedAt: new Date().toISOString(), ...(snapshot.replay ? { questionId: snapshot.replay.questionId } : {}) }; job.steps.push(step);
    let stdout = '', stderr = '', exceeded = false;
    const owned = spawn(process.execPath, args, { cwd: coachRoot, env: { ...process.env, RIICHI_COACH_API_KEY: key },
      windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    child = owned;
    owned.stdout.on('data', data => { if (stdout.length + data.length > 1024 * 1024) { exceeded = true; terminate(); } else stdout += data; });
    owned.stderr.on('data', data => { if (stderr.length < 8192) stderr += data; });
    const complete = code => {
      if (step.status !== 'running') return;
      step.endedAt = new Date().toISOString(); step.exitCode = code;
      step.status = stopping ? 'stopped' : code === 0 && !exceeded ? 'completed' : 'failed';
      if (step.status === 'completed') { try { step.runId = JSON.parse(stdout).runId; } catch { step.status = 'failed'; } }
      if (step.status === 'failed') step.error = stderr.split(/\r?\n/).find(line => /^[a-z][a-z0-9_]+$/.test(line)) ?? 'arena_run_failed';
      child = null; void persistJob(); resolveStep(step.status);
    };
    owned.on('error', () => complete(null)); owned.on('close', complete);
  });
  const start = async (mode, selection = {}) => {
    if (job?.status === 'running' || job?.status === 'stopping') throw fail('已有实验正在运行，请先停止或等待完成。', 409);
    if (!['compare', 'off', 'local', 'fault', 'catalog', 'mortal-details'].includes(mode)) throw fail('请选择实验模式。');
    const maintenance = ['catalog', 'mortal-details'].includes(mode);
    if (mode === 'mortal-details' && (!UUID.test(selection.runId ?? '') || !(await runs()).some(r => r.id === selection.runId))) throw fail('找不到该实验。', 404);
    const experimentType = selection.experimentType ?? 'flat';
    if (typeof experimentType !== 'string' || (!Object.hasOwn(ARENA_EXPERIMENTS, experimentType) && experimentType !== 'mistakes')) throw fail('请选择有效题库。');
    if (experimentType === 'mistakes' && !['compare', 'off', 'local'].includes(mode)) throw fail('错题重跑支持 Off、Local 或对照实验。');
    if (!maintenance && config.provider === 'openai-compatible' && (!config.baseUrl || !apiKey)) throw fail('请先保存 API 地址和密钥。');
    const maxCases = selection.maxCases ?? 10, caseOffset = selection.caseOffset ?? 0;
    if (!Number.isSafeInteger(maxCases) || maxCases < 1 || maxCases > 128 || !Number.isSafeInteger(caseOffset) || caseOffset < 0 || caseOffset > 127) throw fail('请检查题量和起始题号。');
    const bank = experimentType === 'mistakes' ? null : await catalog(experimentType);
    if (!maintenance && bank && (caseOffset >= bank.cases.length || caseOffset + maxCases > bank.cases.length)) throw fail('所选范围超出题库，请减少题量或调整起始题号。');
    let replayCases;
    if (experimentType === 'mistakes') {
      const report = await readArenaMistakes(archiveRoot, await runs(), {});
      const ids = selection.questionIds;
      if (ids !== undefined && (!Array.isArray(ids) || !ids.length || ids.length > 128 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)))) throw fail('错题选择无效。');
      const questions = ids ? ids.map(id => report.questions.find(q => q.id === id)) : report.questions.slice(caseOffset, caseOffset + maxCases);
      if (!questions.length || questions.some(q => !q)) throw fail('所选错题已不存在，请刷新错题集。');
      replayCases = questions.map(q => ({ ...q.snapshots[0], questionId: q.id }));
    }
    if (job?.status === 'running' || job?.status === 'stopping') throw fail('已有实验正在运行，请先停止或等待完成。', 409);
    const snapshot = { ...config, maxCases, caseOffset, experimentType, runId: selection.runId }, key = maintenance ? '' : apiKey;
    job = { id: randomUUID(), mode, experimentType, status: 'running', startedAt: new Date().toISOString(), steps: [], model: snapshot.model, provider: snapshot.provider, maxCases: replayCases?.length ?? maxCases, caseOffset };
    stopping = false;
    const execute = async () => {
      try {
        const steps = mode === 'compare' ? ['off', 'local'] : [mode];
        execution: for (const replay of replayCases ?? [undefined]) for (const step of steps) {
          if (stopping || await runStep(step, { ...snapshot, replay }, key) !== 'completed') break execution;
        }
        job.status = stopping ? 'stopped' : job.steps.every(step => step.status === 'completed') ? 'completed' : 'failed';
      } catch { job.status = 'failed'; }
      finally { job.endedAt = new Date().toISOString(); await persistJob(); }
    };
    void execute(); await persistJob(); return publicJob();
  };
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = request.headers.host;
      if (host !== `127.0.0.1:${server.address().port}` && host !== `localhost:${server.address().port}`) throw fail('仅支持本机访问。', 403);
      const url = new URL(request.url, `http://${host}`);
      if (request.method === 'POST' && request.headers.origin !== `http://${host}`) throw fail('请从本机控制台提交操作。', 403);
      if (request.method === 'GET' && url.pathname === '/api/model-info') return json(response, 200, {
        scope: 'current', config: publicConfig(), promptVersion: ARENA_TOOL_CALL_PROMPT_VERSION,
        systemPrompt: ARENA_TOOL_CALL_PROMPT,
        codexInstructions: config.provider === 'codex-cli' ? arenaCodexTurnInstructions(config.maxProviderOutputTokens) : null,
        mcp: { name: 'analyze_candidates', transport: 'stdio', description: ARENA_MCP_TOOL_DESCRIPTION,
          dimensions: SupportedDimensionSchema.options, limits: ARENA_MCP_LIMITS_V1 },
        rag: { retrieverVersion: ARENA_RAG_RETRIEVER_VERSION, limits: ARENA_RAG_LIMITS_V1,
          parameters: ARENA_RAG_TOOL_PARAMETERS, corpus: BLIND_DISCARD_ARENA_RAG_SEED_CORPUS },
        limits: { ...ARENA_RUN_LIMITS_V1, maxProviderOutputTokens: config.maxProviderOutputTokens,
          maxProviderTurns: config.maxProviderTurns, maxToolCalls: config.maxToolCalls, maxRunElapsedMs: config.maxRunMs }
      });
      if (request.method === 'GET' && url.pathname === '/api/state') {
        const results = await runs(), bank = await catalog();
        const catalogs = {};
        for (const [type, definition] of Object.entries(ARENA_EXPERIMENTS)) {
          const typedBank = await catalog(type);
          catalogs[type] = { ...definition, ready: typedBank !== null, availableCaseCount: typedBank?.cases.length ?? 0,
            developmentGames: typedBank?.developmentGames ?? 0, acceptanceGames: typedBank?.acceptanceGames ?? 0, createdAt: typedBank?.createdAt ?? null };
        }
        const mistakes = await readArenaMistakes(archiveRoot, results, {});
        return json(response, 200, { config: publicConfig(), job: publicJob(), runs: results,
          mistakeBank: { availableCaseCount: mistakes.questions.length, questionIds: mistakes.questions.map(q => q.id) },
          catalogs,
          catalog: bank ? { availableCaseCount: bank.cases.length, developmentGames: bank.developmentGames, acceptanceGames: bank.acceptanceGames, createdAt: bank.createdAt } : null,
          budget: arenaTokenBudget(results.map(run => run.summary), config.tokenWarningThreshold) });
      }
      if (request.method === 'GET' && url.pathname === '/api/catalog') {
        const type = url.searchParams.get('type') ?? 'legacy';
        if (type !== 'legacy' && !Object.hasOwn(ARENA_EXPERIMENTS, type)) throw fail('题库类型无效。');
        const bank = await catalog(type); if (!bank) throw fail('该类型题库尚未建立，请先刷新题库。', 404); return json(response, 200, bank);
      }
      if (request.method === 'GET' && url.pathname === '/api/mistakes') {
        const filters = { type: url.searchParams.get('type') ?? 'all', model: url.searchParams.get('model') ?? 'all',
          rag: url.searchParams.get('rag') ?? 'all', includeFaults: url.searchParams.get('faults') === 'include' };
        if (!['all', 'flat', 'spatial', 'legacy', 'holdout'].includes(filters.type) || !['all', 'off', 'local'].includes(filters.rag) || filters.model.length > 200) throw fail('错题筛选条件无效。');
        return json(response, 200, await readArenaMistakes(archiveRoot, await runs(), filters));
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/run/')) {
        const id = url.pathname.slice('/api/run/'.length); if (!UUID.test(id)) throw fail('找不到该实验。', 404);
        const results = await runs(), run = results.find(row => row.id === id); if (!run) throw fail('找不到该实验。', 404);
        let events = []; try { const text = await readFile(join(archiveRoot, id, 'events.jsonl'), 'utf8'); if (text.length <= 64 * 1024 * 1024) events = parseArenaArchiveEvents(text); } catch { /* partial events are not complete evidence */ }
        let trace = []; try { trace = parseArenaCaseTrace(await readFile(join(archiveRoot, id, 'case-trace.jsonl'), 'utf8'))
          .filter(row => row.caseOrdinal < run.manifest.dataset.selected.length); } catch { /* old or incomplete live trace; final records still own facts */ }
        let mortalDetails = null;
        try {
          mortalDetails = visibleArenaMortalDetails(JSON.parse(await readFile(join(archiveRoot, id, 'mortal-details.json'), 'utf8')), run.manifest, events);
        } catch { /* old runs can rebuild display evidence without changing the original archive */ }
        return json(response, 200, { ...run, events, trace, mortalDetails });
      }
      if (request.method === 'POST' && url.pathname === '/api/config') {
        const raw = await body(request), next = settings(raw);
        if (raw.apiKey !== undefined && (typeof raw.apiKey !== 'string' || raw.apiKey.length > 4096)) throw fail('密钥格式不正确。');
        if (raw.clearApiKey === true) apiKey = ''; else if (raw.apiKey?.trim()) apiKey = raw.apiKey.trim();
        await writeFile(configPath, JSON.stringify(next, null, 2)); config = next; return json(response, 200, publicConfig());
      }
      if (request.method === 'POST' && url.pathname === '/api/start') { const raw = await body(request); return json(response, 202, await start(raw.mode, raw)); }
      if (request.method === 'POST' && url.pathname === '/api/shutdown') {
        if (job?.status === 'running' || job?.status === 'stopping') throw fail('实验运行中，请先停止或等待完成再关闭控制台。', 409);
        json(response, 202, { status: 'shutting_down' });
        server.close(); server.closeIdleConnections();
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/stop') {
        if (!child || !job || job.status !== 'running') throw fail('当前没有正在运行的实验。', 409);
        stopping = true; job.status = 'stopping'; terminate(); await persistJob(); return json(response, 202, publicJob());
      }
      if (request.method === 'GET' && /^\/tiles\/(?:[0-9][mps]|[1-7]z)\.svg$/.test(url.pathname)) {
        const svg = await readFile(join(coachRoot, 'packages/desktop/src/renderer', url.pathname.slice(1)));
        response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
        return response.end(svg);
      }
      const file = { '/results': ['results.html', 'text/html; charset=utf-8'], '/results.mjs': ['results.mjs', 'text/javascript; charset=utf-8'], '/settings': ['settings.html', 'text/html; charset=utf-8'], '/settings.mjs': ['settings.mjs', 'text/javascript; charset=utf-8'], '/client.mjs': ['client.mjs', 'text/javascript; charset=utf-8'], '/mistakes': ['mistakes.html', 'text/html; charset=utf-8'], '/mistakes.mjs': ['mistakes.mjs', 'text/javascript; charset=utf-8'], '/case-view.mjs': ['case-view.mjs', 'text/javascript; charset=utf-8'], '/model-info': ['model-info.html', 'text/html; charset=utf-8'], '/model-info.mjs': ['model-info.mjs', 'text/javascript; charset=utf-8'], '/': ['index.html', 'text/html; charset=utf-8'], '/console-page.mjs': ['console-page.mjs', 'text/javascript; charset=utf-8'], '/presentation.mjs': ['presentation.mjs', 'text/javascript; charset=utf-8'], '/layout.css': ['layout.css', 'text/css; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] }[url.pathname];
      if (request.method !== 'GET' || !file) throw fail('页面不存在。', 404);
      response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' });
      const content = await readFile(join(assets, file[0]));
      response.end(file[1].startsWith('text/html') ? arenaPage(content.toString('utf8'), url.pathname) : content);
    } catch (error) { json(response, error.status ?? 500, { error: error.status ? error.message : '操作未完成，请检查配置或稍后重试。' }); }
  });
  return { server, stop: () => { stopping = true; terminate(); }, publicConfig };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, stop } = await createArenaConsole();
  const port = Number(process.env.ARENA_CONSOLE_PORT ?? 4318);
  server.listen(port, '127.0.0.1', () => console.log(`Arena Lab http://127.0.0.1:${server.address().port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stop(); server.close(); });
}
