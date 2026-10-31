import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { startServer, validateResult, within } from './server.mjs';

test('tile codes are explicit, including red fives and Chinese honors', () => {
  assert.deepEqual(validateResult({ status: 'answered', tiles: '1m 9p 赤5s 东 白 中', orientation: '', note: '' }).tiles,
    ['1m', '9p', '0s', '1z', '5z', '7z']);
  for (const tiles of ['10m', '8z', '5?', '123m', '赤6p', '0z', '東風？']) {
    assert.throws(() => validateResult({ status: 'answered', tiles, orientation: '', note: '' }));
  }
  assert.throws(() => validateResult({ status: 'answered', tiles: '', orientation: '', note: '' }));
  assert.equal(validateResult({ status: 'unclear', tiles: '', orientation: '', note: '' }).status, 'unclear');
});

test('real HTTP persistence, restart, export, withdrawal and image binding in isolated storage', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'coach-label-test-'));
  let app;
  try {
    const root = path.join(dir, 'processing'); await mkdir(root);
    const bytes = Buffer.from('independent fixture image');
    const sha = createHash('sha256').update(bytes).digest('hex');
    await writeFile(path.join(root, 'image.png'), bytes);
    const queue = { schema: 'coach-tile-annotation-queue/1', items: [{ id: 'target-1', targetId: 'figure:unknown-1', canonical: 'chapter', imageSha256: sha, imagePath: 'image.png', position: '左河第4张', blocking: true }] };
    const queuePath = path.join(dir, 'queue.json'); await writeFile(queuePath, JSON.stringify(queue));
    const dataDir = path.join(dir, 'human');
    const start = async () => { app = await startServer({ root, queuePath, dataDir, port: 0 }); return `http://127.0.0.1:${app.server.address().port}`; };
    let base = await start();
    await assert.rejects(startServer({ root, queuePath, dataDir, port: 0 }), /已有服务占用/);
    assert.equal(app.server.address().address, '127.0.0.1');
    let state = await fetch(base + '/api/state').then(r => r.json());
    const submit = (body, headers = {}) => fetch(base + '/api/annotations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Annotation-Token': state.token, Origin: base, ...headers }, body: JSON.stringify(body) });
    const body = { id: 'target-1', imageSha256: sha, expectedRevision: 0, result: { status: 'answered', tiles: '赤5m 北', orientation: '向右横置', note: '测试' } };
    assert.equal((await submit({ ...body, imageSha256: 'wrong' })).status, 409);
    assert.equal((await submit({ ...body, id: '../secret' })).status, 404);
    assert.equal((await submit(body, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await submit(body, { 'X-Annotation-Token': 'bad' })).status, 403);
    assert.equal((await submit(body)).status, 200);
    assert.equal((await submit(body)).status, 409);
    assert.equal((await fetch(base + '/image/target-1')).status, 200);
    for (const url of ['/image/%2e%2e%2fsecret', '/image/target-1?path=../secret', '/../../secret']) {
      assert.notEqual((await fetch(base + url)).status, 200);
    }
    const badHostStatus = await new Promise(resolve => { const req = http.get(base + '/api/state', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', error => { throw error; }); });
    assert.equal(badHostStatus, 403);
    await app.close(); base = await start(); state = await fetch(base + '/api/state').then(r => r.json());
    assert.deepEqual(state.annotations['target-1'].result.tiles, ['0m', '4z']);
    const exported = await fetch(base + '/api/export').then(r => r.json());
    assert.equal(exported.events.length, 1); assert.equal(exported.events[0].canonical, 'chapter');
    assert.equal((await submit({ ...body, expectedRevision: 1, result: { status: 'withdrawn', tiles: '', orientation: '', note: '' } })).status, 200);
    const history = await fetch(base + '/api/export').then(r => r.json());
    assert.equal(history.events.length, 2); assert.equal(history.events[0].result.status, 'answered');
    assert.match(await readFile(path.join(dataDir, 'events.jsonl'), 'utf8'), /withdrawn/);
    await writeFile(path.join(root, 'image.png'), 'changed');
    assert.equal((await fetch(base + '/image/target-1')).status, 409);
    assert.equal((await submit({ ...body, expectedRevision: 2 })).status, 409);
    await app.close(); app = null;
    queue.items[0].imagePath = '../outside.png'; await writeFile(queuePath, JSON.stringify(queue));
    await assert.rejects(start(), /outside/);
  } finally { if (app) await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test('image paths reject traversal and directory junctions outside processing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'coach-label-path-'));
  try {
    const root = path.join(dir,'root'), outside = path.join(dir,'outside');
    await mkdir(root); await mkdir(outside); await writeFile(path.join(outside,'private.png'),'private');
    assert.throws(()=>within(root,'../outside/private.png'),/outside/);
    await symlink(outside,path.join(root,'link'),process.platform==='win32'?'junction':'dir');
    assert.throws(()=>within(root,'link/private.png'),/symlink outside/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
