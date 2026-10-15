const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { createArenaConsole } from '../bin/blind-discard-arena-console.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'arena-console-test-'));
  const cliPath = join(root, 'experiment.mjs');
  await mkdir(join(root, 'packages/desktop/src/renderer/tiles'), { recursive: true });
  await writeFile(join(root, 'packages/desktop/src/renderer/tiles/0p.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(cliPath, "import { writeFileSync } from 'node:fs'; writeFileSync('received-args.json', JSON.stringify(process.argv.slice(2))); setInterval(()=>{},1000);");
  const console = await createArenaConsole({ coachRoot: root, archiveRoot: join(root, 'archives'), cliPath });
  await new Promise(resolve => console.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${console.server.address().port}`;
  const after = callback => typeof t.after === 'function' ? t.after(callback) : t.onTestFinished(callback);
  after(async () => { console.stop(); await new Promise(resolve => console.server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const post = (path, value, origin = url) => fetch(url + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const state = () => fetch(url + '/api/state').then(response => response.json());
  return { url, root, post, state };
}

test('console persists public settings, never returns or saves the API key, and rejects cross-origin control', async t => {
  const f = await fixture(t);
  assert.equal((await f.state()).config.reasoningEffort, 'high');
  assert.equal((await f.post('/api/config', { maxProviderOutputTokens: 8192 })).status, 200);
  assert.equal((await f.state()).config.maxProviderOutputTokens, 8192);
  const info = await fetch(f.url + '/api/model-info').then(r => r.json());
  assert.equal(info.limits.maxProviderOutputTokens, 8192);
  assert.match(info.codexInstructions, /8192 output tokens/);
  assert.match(info.systemPrompt, /blind riichi-mahjong/);
  assert.ok(info.mcp.dimensions.includes('ukeire'));
  assert.ok(info.rag.corpus.passages.length > 0);
  assert.equal((await fetch(f.url + '/model-info')).status, 200);
  for (const limit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal((await f.post('/api/config', { maxProviderOutputTokens: limit })).status, 400);
  const response = await f.post('/api/config', { provider: 'openai-compatible', model: 'tool-model', baseUrl: 'http://127.0.0.1:8000/v1', apiKey: 'PRIVATE_TEST_KEY' });
  assert.equal(response.status, 200); assert.equal((await response.json()).keyConfigured, true);
  assert.equal(JSON.stringify(await f.state()).includes('PRIVATE_TEST_KEY'), false);
  assert.equal((await fetch(f.url + '/api/model-info').then(r => r.text())).includes('PRIVATE_TEST_KEY'), false);
  assert.equal((await readFile(join(f.root, 'archives/console-settings.json'), 'utf8')).includes('PRIVATE_TEST_KEY'), false);
  assert.equal((await f.post('/api/start', { mode: 'local' }, 'https://foreign.example')).status, 403);
  assert.equal((await f.post('/api/config', { maxProviderTurns: 13 })).status, 400);
  assert.equal((await f.post('/api/start', { mode: 'local', maxCases: 129 })).status, 400);
  assert.equal((await f.post('/api/start', { mode: 'local', experimentType: 'unknown' })).status, 400);
  assert.equal((await fetch(f.url + '/api/catalog?type=unknown')).status, 400);
  assert.equal((await f.state()).catalogs.spatial.datasetId, 'blind-discard-spatial-v1');
  assert.equal((await f.state()).catalogs.flat.ready, false);
  assert.equal((await fetch(f.url + '/api/run/not-a-run')).status, 404);
  assert.equal((await fetch(f.url + '/presentation.mjs')).status, 200);
  for (const path of ['/mistakes', '/mistakes.mjs', '/case-view.mjs']) assert.equal((await fetch(f.url + path)).status, 200);
  const mistakes = await fetch(f.url + '/api/mistakes').then(r => r.json());
  assert.equal(mistakes.questions.length, 0);
  assert.equal(mistakes.totals.errors, 0);
  assert.equal((await fetch(f.url + '/api/mistakes?type=invalid')).status, 400);
  const tile = await fetch(f.url + '/tiles/0p.svg');
  assert.equal(tile.status, 200); assert.equal(tile.headers.get('content-type'), 'image/svg+xml');
  assert.equal((await fetch(f.url + '/tiles/8z.svg')).status, 404);
});

test('console starts a real owned process once and stop waits for its exit', async t => {
  const f = await fixture(t);
  await f.post('/api/config', { maxProviderOutputTokens: 8192 });
  assert.equal((await f.post('/api/start', { mode: 'compare', experimentType: 'spatial', maxCases: 25, caseOffset: 10 })).status, 202);
  assert.equal((await f.state()).job.maxCases, 25); assert.equal((await f.state()).job.caseOffset, 10);
  assert.equal((await f.post('/api/start', { mode: 'local' })).status, 409);
  assert.equal((await f.state()).job.status, 'running');
  assert.equal((await f.post('/api/shutdown', {})).status, 409);
  let args;
  for (let i = 0; i < 100; i++) { try { args = JSON.parse(await readFile(join(f.root, 'received-args.json'), 'utf8')); break; } catch { await setTimeout(50); } }
  assert.equal(args[args.indexOf('--dataset') + 1], 'blind-discard-spatial-v1');
  assert.equal((await f.state()).job.experimentType, 'spatial');
  assert.equal(args[args.indexOf('--max-cases') + 1], '25');
  assert.equal(args[args.indexOf('--max-provider-output-tokens') + 1], '8192');
  assert.equal(args[args.indexOf('--case-offset') + 1], '10');
  assert.equal((await f.post('/api/stop', {})).status, 202);
  let job;
  for (let i = 0; i < 100; i++) { job = (await f.state()).job; if (job.status === 'stopped') break; await setTimeout(50); }
  assert.equal(job.status, 'stopped'); assert.equal(job.steps.length, 1); assert.equal(job.steps[0].status, 'stopped');
  assert.equal((await f.post('/api/stop', {})).status, 409);
});

test('idle console shuts down through its same-origin lifecycle hook', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('/api/shutdown', {}, 'https://foreign.example')).status, 403);
  const response = await f.post('/api/shutdown', {});
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { status: 'shutting_down' });
  await assert.rejects(() => f.state());
});
