import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { createArenaConsole } from '../bin/blind-discard-arena-console.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'arena-console-test-'));
  const cliPath = join(root, 'experiment.mjs');
  await writeFile(cliPath, "import { writeFileSync } from 'node:fs'; writeFileSync('received-args.json', JSON.stringify(process.argv.slice(2))); setInterval(()=>{},1000);");
  const console = await createArenaConsole({ coachRoot: root, archiveRoot: join(root, 'archives'), cliPath });
  await new Promise(resolve => console.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${console.server.address().port}`;
  t.after(async () => { console.stop(); await new Promise(resolve => console.server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const post = (path, value, origin = url) => fetch(url + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const state = () => fetch(url + '/api/state').then(response => response.json());
  return { url, root, post, state };
}

test('console persists public settings, never returns or saves the API key, and rejects cross-origin control', async t => {
  const f = await fixture(t);
  assert.equal((await f.state()).config.reasoningEffort, 'high');
  const response = await f.post('/api/config', { provider: 'openai-compatible', model: 'tool-model', baseUrl: 'http://127.0.0.1:8000/v1', apiKey: 'PRIVATE_TEST_KEY' });
  assert.equal(response.status, 200); assert.equal((await response.json()).keyConfigured, true);
  assert.equal(JSON.stringify(await f.state()).includes('PRIVATE_TEST_KEY'), false);
  assert.equal((await readFile(join(f.root, 'archives/console-settings.json'), 'utf8')).includes('PRIVATE_TEST_KEY'), false);
  assert.equal((await f.post('/api/start', { mode: 'local' }, 'https://foreign.example')).status, 403);
  assert.equal((await f.post('/api/config', { maxProviderTurns: 13 })).status, 400);
  assert.equal((await f.post('/api/start', { mode: 'local', maxCases: 129 })).status, 400);
  assert.equal((await fetch(f.url + '/api/run/not-a-run')).status, 404);
});

test('console starts a real owned process once and stop waits for its exit', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('/api/start', { mode: 'compare', maxCases: 25, caseOffset: 10 })).status, 202);
  assert.equal((await f.state()).job.maxCases, 25); assert.equal((await f.state()).job.caseOffset, 10);
  assert.equal((await f.post('/api/start', { mode: 'local' })).status, 409);
  assert.equal((await f.state()).job.status, 'running');
  let args;
  for (let i = 0; i < 100; i++) { try { args = JSON.parse(await readFile(join(f.root, 'received-args.json'), 'utf8')); break; } catch { await setTimeout(50); } }
  assert.equal(args[args.indexOf('--dataset') + 1], 'blind-discard-dev-v1');
  assert.equal(args[args.indexOf('--max-cases') + 1], '25');
  assert.equal(args[args.indexOf('--case-offset') + 1], '10');
  assert.equal((await f.post('/api/stop', {})).status, 202);
  let job;
  for (let i = 0; i < 100; i++) { job = (await f.state()).job; if (job.status === 'stopped') break; await setTimeout(50); }
  assert.equal(job.status, 'stopped'); assert.equal(job.steps.length, 1); assert.equal(job.steps[0].status, 'stopped');
  assert.equal((await f.post('/api/stop', {})).status, 409);
});
