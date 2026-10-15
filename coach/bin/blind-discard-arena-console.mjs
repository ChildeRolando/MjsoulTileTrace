import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ArenaArchiveManifestSchema, ArenaArchiveSummarySchema, ArenaCaseCatalogSchema, parseArenaArchiveEvents, parseArenaCaseTrace, arenaTokenBudget } from '@riichi-coach/desktop/blind-discard-arena-archive';

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
  for (const [key, maximum] of Object.entries({ tokenWarningThreshold: Number.MAX_SAFE_INTEGER, maxProviderTurns: 12, maxToolCalls: 16, maxProviderOutputTokens: 2048, maxRunMs: 300000 })) {
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
  const catalog = async () => { try { return ArenaCaseCatalogSchema.parse(JSON.parse(await readFile(join(archiveRoot, 'case-catalog.json'), 'utf8'))); } catch { return null; } };
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
    const args = [cliPath, 'run', '--dataset', 'blind-discard-dev-v1', '--max-cases', String(snapshot.maxCases), '--case-offset', String(snapshot.caseOffset), '--rag', mode === 'fault' ? 'local' : mode,
      '--provider', snapshot.provider, '--model', snapshot.model, '--reasoning-effort', snapshot.reasoningEffort,
      '--token-warning-threshold', String(snapshot.tokenWarningThreshold), '--max-provider-turns', String(snapshot.maxProviderTurns),
      '--max-tool-calls', String(snapshot.maxToolCalls), '--max-provider-output-tokens', String(snapshot.maxProviderOutputTokens), '--max-run-ms', String(snapshot.maxRunMs)];
    if (snapshot.provider === 'openai-compatible') args.push('--base-url', snapshot.baseUrl);
    if (mode === 'fault') args.push('--fault', 'first-helper-timeout');
    if (mode === 'catalog') args.splice(0, args.length, cliPath, 'catalog');
    const step = { mode, status: 'running', startedAt: new Date().toISOString() }; job.steps.push(step);
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
    if (!['compare', 'off', 'local', 'fault', 'catalog'].includes(mode)) throw fail('请选择实验模式。');
    if (mode !== 'catalog' && config.provider === 'openai-compatible' && (!config.baseUrl || !apiKey)) throw fail('请先保存 API 地址和密钥。');
    const maxCases = selection.maxCases ?? 10, caseOffset = selection.caseOffset ?? 0;
    if (!Number.isSafeInteger(maxCases) || maxCases < 1 || maxCases > 128 || !Number.isSafeInteger(caseOffset) || caseOffset < 0 || caseOffset > 127) throw fail('请检查题量和起始题号。');
    const bank = await catalog();
    if (mode !== 'catalog' && bank && (caseOffset >= bank.cases.length || caseOffset + maxCases > bank.cases.length)) throw fail('所选范围超出题库，请减少题量或调整起始题号。');
    if (job?.status === 'running' || job?.status === 'stopping') throw fail('已有实验正在运行，请先停止或等待完成。', 409);
    const snapshot = { ...config, maxCases, caseOffset }, key = mode === 'catalog' ? '' : apiKey;
    job = { id: randomUUID(), mode, status: 'running', startedAt: new Date().toISOString(), steps: [], model: snapshot.model, provider: snapshot.provider, maxCases, caseOffset };
    stopping = false;
    const execute = async () => {
      try {
        for (const step of mode === 'compare' ? ['off', 'local'] : [mode]) { if (stopping || await runStep(step, snapshot, key) !== 'completed') break; }
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
      if (request.method === 'GET' && url.pathname === '/api/state') {
        const results = await runs(), bank = await catalog();
        return json(response, 200, { config: publicConfig(), job: publicJob(), runs: results,
          catalog: bank ? { availableCaseCount: bank.cases.length, developmentGames: bank.developmentGames, acceptanceGames: bank.acceptanceGames, createdAt: bank.createdAt } : null,
          budget: arenaTokenBudget(results.map(run => run.summary), config.tokenWarningThreshold) });
      }
      if (request.method === 'GET' && url.pathname === '/api/catalog') { const bank = await catalog(); if (!bank) throw fail('题库尚未建立，请先刷新题库。', 404); return json(response, 200, bank); }
      if (request.method === 'GET' && url.pathname.startsWith('/api/run/')) {
        const id = url.pathname.slice('/api/run/'.length); if (!UUID.test(id)) throw fail('找不到该实验。', 404);
        const results = await runs(), run = results.find(row => row.id === id); if (!run) throw fail('找不到该实验。', 404);
        let events = []; try { const text = await readFile(join(archiveRoot, id, 'events.jsonl'), 'utf8'); if (text.length <= 64 * 1024 * 1024) events = parseArenaArchiveEvents(text); } catch { /* partial events are not complete evidence */ }
        let trace = []; try { trace = parseArenaCaseTrace(await readFile(join(archiveRoot, id, 'case-trace.jsonl'), 'utf8'))
          .filter(row => row.caseOrdinal < run.manifest.dataset.selected.length); } catch { /* old or incomplete live trace; final records still own facts */ }
        return json(response, 200, { ...run, events, trace });
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
      const file = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.mjs': ['app.mjs', 'text/javascript; charset=utf-8'], '/presentation.mjs': ['presentation.mjs', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] }[url.pathname];
      if (request.method !== 'GET' || !file) throw fail('页面不存在。', 404);
      response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' }); response.end(await readFile(join(assets, file[0])));
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
