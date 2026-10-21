const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { zstdCompressSync, crc32 } from 'node:zlib';
import tar from 'tar-stream';
import { mapTenhouRecord } from '@riichi-coach/tenhou-source';
import { formatMjaiTile } from '@riichi-coach/mortal-source';
import { validateCanonicalEventStream } from '@riichi-coach/reasoning';
import { CanonicalEventStreamSchema } from '@riichi-coach/contracts';
import { prepareRecord, contentId, mjaiIdentityProjection, metadataFor, sha256 } from './identity.mjs';
import { CorpusStore } from './store.mjs';
import { importFile, lockDirectory } from './runner.mjs';
import { archiveRecords } from './archives.mjs';
import { downloadShard, retryAfterMs } from './network.mjs';
import { mapMjaiRecord } from './canonical.mjs';
import { orderJobs } from './sources.mjs';
import { enqueueIndex } from './tenhou.mjs';
import { main } from '../../bin/replay-corpus.mjs';

const fixture = name => new URL(`../../packages/tenhou-source/tests/fixtures/real-logs/${name}.xml`, import.meta.url);
const raw = await readFile(fixture('bug1'));
const temp = () => mkdtemp(join(tmpdir(), 'coach-corpus-test-'));
// Independent existing importer supplies expected semantics for cross-format
// checks. No ID projection code participates in building the MJAI fixture.
export function mjaiFromTenhou(bytes) {
  const streams = [0, 1, 2, 3].map(selfActor => {
    const m = mapTenhouRecord({ raw: bytes.toString(), gameId: 'fixture', selfActor });
    assert.equal(m.status, 'ready'); return m.stream;
  });
  const rows = []; let running;
  for (let i = 0; i < streams[0].events.length; i++) {
    const e = streams[0].events[i], t = formatMjaiTile;
    switch (e.type) {
      case 'game_started': rows.push({ type: 'start_game' }); break;
      case 'round_started': running = [...e.scores]; rows.push({ type: 'start_kyoku', bakaze: e.roundWind, kyoku: e.hand, honba: e.honba, kyotaku: e.riichiSticks, oya: e.dealer, scores: e.scores, dora_marker: t(e.doraIndicator), tehais: streams.map(s => s.events[i].selfHand.map(t)) }); break;
      case 'tile_drawn': rows.push({ type: 'tsumo', actor: e.actor, pai: t(streams[e.actor].events[i].tile.tile) }); break;
      case 'tile_discarded': rows.push({ type: 'dahai', actor: e.actor, pai: t(e.tile), tsumogiri: e.discardMode === 'tsumogiri' }); break;
      case 'riichi_declared': rows.push({ type: 'reach', actor: e.actor }); break;
      case 'riichi_accepted': running[e.actor] -= 1000; rows.push({ type: 'reach_accepted', actor: e.actor }); break;
      case 'chi_called': case 'pon_called': case 'daiminkan_called': rows.push({ type: e.type.replace('_called', ''), actor: e.actor, target: e.targetActor, pai: t(e.calledTile), consumed: e.consumedTiles.map(t) }); break;
      case 'ankan_declared': rows.push({ type: 'ankan', actor: e.actor, consumed: e.tiles.map(t) }); break;
      case 'kakan_declared': rows.push({ type: 'kakan', actor: e.actor, pai: t(e.addedTile) }); break;
      case 'dora_revealed': rows.push({ type: 'dora', dora_marker: t(e.indicator) }); break;
      case 'win_declared': {
        const settlement = streams[0].events.slice(i).find(x => x.type === 'scores_updated');
        rows.push({ type: 'hora', actor: e.winnerActor, target: e.targetActor ?? e.winnerActor, pai: t(e.winningTile), scores: settlement.scores }); break;
      }
      case 'round_drawn': {
        const reasons = { exhaustive: 'fanpai', kyuushu_kyuuhai: 'yao9', suufon_renda: 'kaze4', suucha_riichi: 'reach4', suukaikan: 'kan4', sancha_hou: 'ron3', nagashi_mangan: 'nm' };
        const settlement = streams[0].events.slice(i).find(x => x.type === 'scores_updated');
        rows.push({ type: 'ryukyoku', reason: reasons[e.reason], tenpais: [0, 1, 2, 3].map(p => e.tenpaiActors.includes(p)), scores: settlement.scores }); break;
      }
      case 'scores_updated': break;
      case 'round_ended': rows.push({ type: 'end_kyoku' }); break;
      case 'game_ended': rows.push({ type: 'end_game', scores: e.scores }); break;
      default: assert.fail(e.type);
    }
  }
  return rows;
}
const mjai = mjaiFromTenhou(raw);
const mjaiBytes = rows => Buffer.from(rows.map(r => JSON.stringify(r)).join('\n'));

test('XML and independent canonical-derived MJAI share the same full-game ID for real fixtures', async () => {
  for (const name of ['bug1', 'bug2', 'bug3', 'bug4', 'bug5', 'bug6', 'bug8', 'bug9', 'example', 'pao', 'shuffle']) {
    const bytes = await readFile(fixture(name));
    assert.equal(prepareRecord(bytes, 'xml').id, prepareRecord(mjaiBytes(mjaiFromTenhou(bytes)), 'mjai').id, name);
  }
});
test('formatting, header metadata and unordered starting hands do not change game identity', () => {
  const other = structuredClone(mjai);
  other[0].names = ['a', 'b', 'c', 'd']; other[0].date = '2026-01-01'; other[0].dan = [1, 2, 3, 4];
  for (const r of other) if (r.type === 'start_kyoku') r.tehais.forEach(h => h.reverse());
  assert.equal(prepareRecord(raw, 'xml').id, prepareRecord(Buffer.from(JSON.stringify(other, null, 2)), 'mjai').id);
});
test('changed actions, red tiles and round history are different games', () => {
  const id = contentId(mjaiIdentityProjection(mjai));
  for (const mutate of [r => { r.find(x => x.type === 'dahai').tsumogiri = !r.find(x => x.type === 'dahai').tsumogiri; }, r => { r.find(x => x.type === 'tsumo').pai = '5mr'; }, r => { r.find(x => x.type === 'start_kyoku').honba++; }]) {
    const rows = structuredClone(mjai); mutate(rows); assert.notEqual(contentId(mjaiIdentityProjection(rows)), id);
  }
});
test('a whole-game cyclic seat rotation has the same content ID', () => {
  const rows = structuredClone(mjai);
  for (const row of rows) {
    for (const key of ['actor', 'target', 'oya']) if (Number.isInteger(row[key])) row[key] = (row[key] + 1) % 4;
    for (const key of ['scores', 'deltas', 'tehais', 'tenpais']) if (Array.isArray(row[key])) row[key] = [row[key][3], ...row[key].slice(0, 3)];
  }
  assert.equal(contentId(mjaiIdentityProjection(rows)), contentId(mjaiIdentityProjection(mjai)));
});
test('converter dora timing does not split a game; raw variants remain distinct', () => {
  const rows = structuredClone(mjai), i = rows.findIndex(x => x.type === 'dora');
  assert.ok(i > 0); [rows[i], rows[i + 1]] = [rows[i + 1], rows[i]];
  assert.equal(contentId(mjaiIdentityProjection(rows)), contentId(mjaiIdentityProjection(mjai)));
  assert.notEqual(sha256(mjaiBytes(rows)), sha256(mjaiBytes(mjai)));
});
test('incomplete, hidden, unsupported and malformed games fail before ingestion', () => {
  assert.throws(() => prepareRecord(Buffer.from('<html>blocked</html>'), 'xml'));
  assert.throws(() => prepareRecord(mjaiBytes(mjai.slice(0, -1)), 'mjai'));
  const rows = structuredClone(mjai); rows[1].tehais[1][0] = '?';
  assert.throws(() => prepareRecord(mjaiBytes(rows), 'mjai'));
});
test('metadata retains rank codes and date precision without using them as ID', () => {
  assert.equal(metadataFor({ name: '2024010100gm-00a9-0000-005a39ba.xml' }).playedAt.precision, 'hour');
  assert.equal(metadataFor({ name: 'majsoul/190823_0c8903ea.mjai.json.zst' }).playedAt.value, '2019-08-23');
  const r = prepareRecord(raw, 'xml'); assert.equal(r.metadata.ranks.length, 4); assert.equal(r.metadata.rankSystem, 'tenhou-dan-code');
  assert.equal(metadataFor({ name: 'opaque-hash' }).playedAt, null);
});
test('same content retains both source observations and every distinct raw representation across restart', async () => {
  const dir = await temp(), record = prepareRecord(raw, 'xml');
  let store = new CorpusStore(dir);
  assert.equal(store.put(record, 'official', 'x'), true);
  assert.equal(store.put(record, 'mirror', 'y'), false);
  assert.equal(store.put(prepareRecord(mjaiBytes(mjai), 'mjai'), 'converted', 'z'), false);
  store.close(); store = new CorpusStore(dir);
  try { assert.deepEqual([store.summary().games, store.summary().variants, store.summary().observations], [1, 2, 3]); assert.deepEqual(store.read(record.id, record.rawHash).raw, raw); }
  finally { store.close(); }
});

test('MJAI wrapper dates and ranks survive without changing game identity', () => {
  const wrapped = prepareRecord(Buffer.from(JSON.stringify({ events: mjai, date: '2024-05-06', ranks: [1, 2, 3, 4] })), 'mjai');
  assert.equal(wrapped.id, prepareRecord(mjaiBytes(mjai), 'mjai').id);
  assert.equal(wrapped.metadata.playedAt.value, '2024-05-06');
  assert.deepEqual(wrapped.metadata.ranks, [1, 2, 3, 4]);
});
test('MJAI canonical export uses existing schema/validator and hides every other private draw', () => {
  for (let selfActor = 0; selfActor < 4; selfActor++) {
    const stream = mapMjaiRecord(mjaiBytes(mjai), 'fixture', selfActor);
    assert.equal(validateCanonicalEventStream(stream).status, 'valid');
    assert.equal(stream.completeness.ruleSet, 'partial');
    assert.ok(stream.events.filter(e => e.type === 'tile_drawn' && e.actor !== selfActor).every(e => e.tile.visibility === 'hidden'));
  }
});
test('missing draw metadata is unknown and cannot claim complete settlement', () => {
  const rows = structuredClone(mjai);
  for (const r of rows) if (r.type === 'ryukyoku') { delete r.reason; delete r.tenpais; }
  const stream = mapMjaiRecord(mjaiBytes(rows), 'fixture', 0);
  assert.equal(stream.completeness.settlement, 'partial');
  assert.ok(stream.events.some(e => e.type === 'round_drawn' && e.reason === 'unknown' && e.tenpaiActors === null));
  assert.equal(CanonicalEventStreamSchema.safeParse({ ...stream, completeness: { ...stream.completeness, settlement: 'complete' } }).success, false);
});
async function pack(file, entries) {
  const p = tar.pack(), done = pipeline(p, createWriteStream(file));
  for (const [name, data] of entries) await new Promise((r, j) => p.entry({ name }, data, e => e ? j(e) : r()));
  p.finalize(); await done;
}
test('tar streams zstd members; checkpoint resumes after a committed member and preserves failures', async () => {
  const dir = await temp(), file = join(dir, 'test.tar');
  await pack(file, [['a.xml', raw], ['broken.xml', Buffer.from('bad')], ['third.mjai.json.zst', zstdCompressSync(mjaiBytes(mjai))]]);
  let store = new CorpusStore(join(dir, 'state'));
  await importFile(file, store, { maxRecords: 1 }); store.close();
  store = new CorpusStore(join(dir, 'state'));
  try {
    const result = await importFile(file, store);
    assert.equal(result.duplicates, 1); assert.equal(result.rejected, 1);
    assert.equal(store.summary().games, 1); assert.equal(store.summary().observations, 2);
    assert.equal((await importFile(file, store)).skipped, true);
  } finally { store.close(); }
});
test('task queue survives index completion and includes four-player east games', async () => {
  const store = new CorpusStore(await temp());
  try {
    enqueueIndex(store, '2024010100gm-00a9-0000-005a39ba 2024010100gm-00a1-0000-005a39bb 2024010100gm-00b9-0000-005a39bc');
    enqueueIndex(store, '2024010100gm-00a9-0000-005a39ba');
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM queue').get().n, 2);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM queue WHERE state='pending'").get().n, 2);
    assert.equal(store.summary().liveQueue[0].state, 'pending');
    assert.equal(store.summary().liveQueue[0].count, 2);
  } finally { store.close(); }
});
test('whole datasets are ordered before indexes and live items', () => {
  assert.deepEqual(orderJobs([{ name: 'live', priority: 2 }, { name: 'index', priority: 1 }, { name: 'bulk', priority: 0 }]).map(j => j.name), ['bulk', 'index', 'live']);
});
test('one state directory has one live writer', async () => {
  const dir = await temp(), unlock = await lockDirectory(dir);
  try { await assert.rejects(lockDirectory(dir), /already_running/); } finally { await unlock(); }
});
async function withServer(handler, run) {
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
}
test('download is bounded, verified, cached and durable across restart', async () => {
  let requests = 0;
  await withServer((req, res) => { requests++; res.writeHead(200, { 'Content-Length': raw.length, ETag: '"v1"' }); res.end(raw); }, async base => {
    const dir = await temp(), store = new CorpusStore(dir), job = { url: base + '/game.xml', name: 'game.xml', size: raw.length, sha256: sha256(raw) };
    try {
      await assert.rejects(downloadShard(job, store, { maxDownloadBytes: raw.length - 1 }), /budget/); assert.equal(requests, 0);
      const file = await downloadShard(job, store, { maxDownloadBytes: raw.length }); assert.deepEqual(await readFile(file), raw);
      assert.equal(await downloadShard(job, store, { maxDownloadBytes: raw.length }), file); assert.equal(requests, 1);
      assert.equal(store.counter('downloadBytes'), raw.length);
    } finally { store.close(); }
  });
});
test('resume verifies Content-Range and appends exactly once', async () => {
  await withServer((req, res) => {
    assert.equal(req.headers.range, 'bytes=100-');
    res.writeHead(206, { 'Content-Range': `bytes 100-${raw.length - 1}/${raw.length}`, ETag: '"v1"' }); res.end(raw.subarray(100));
  }, async base => {
    const store = new CorpusStore(await temp()), url = base + '/r.xml', key = sha256(url);
    const folder = join(store.directory, 'downloads'), file = join(folder, `${key.slice(0, 24)}-r.xml`);
    await mkdir(folder); await writeFile(file + '.part', raw.subarray(0, 100));
    store.db.prepare('INSERT INTO downloads VALUES (?,?,?,?,?)').run(key, file, '"v1"', 100, 0); store.countBytes('archiveBytes', 100);
    try { assert.deepEqual(await readFile(await downloadShard({ url, name: 'r.xml', size: raw.length }, store)), raw); }
    finally { store.close(); }
  });
});
test('permanent HTTP errors are not retried and Retry-After is parsed', async () => {
  let requests = 0;
  await withServer((req, res) => { requests++; res.writeHead(403); res.end(); }, async base => {
    const store = new CorpusStore(await temp());
    try { await assert.rejects(downloadShard({ url: base + '/forbidden', name: 'x.xml' }, store), /HTTP_403/); assert.equal(requests, 1); }
    finally { store.close(); }
  });
  assert.equal(retryAfterMs('120'), 120000);
});

test('long Retry-After stops downloads without another request or spending the budget', async () => {
  let requests = 0;
  await withServer((req, res) => { requests++; res.writeHead(429, { 'Retry-After': '120' }); res.end(); }, async base => {
    const store = new CorpusStore(await temp());
    try {
      await assert.rejects(downloadShard({ url: base + '/limited', name: 'x.xml' }, store), /retry_later_HTTP_429:120000/);
      assert.equal(requests, 1); assert.equal(store.counter('downloadBytes'), 0);
    } finally { store.close(); }
  });
});

test('ZIP members stream into the same content identity without extraction', async () => {
  const name = Buffer.from('nested/game.xml'), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc32(raw), 14);
  local.writeUInt32LE(raw.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc32(raw), 16); central.writeUInt32LE(raw.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + raw.length, 16);
  const dir = await temp(), file = join(dir, 'sample.zip');
  await writeFile(file, Buffer.concat([local, name, raw, central, name, end]));
  const records = [];
  for await (const record of archiveRecords(file)) records.push(record);
  assert.equal(records.length, 1); assert.equal(records[0].name, 'nested/game.xml');
  assert.equal(prepareRecord(records[0].raw, records[0].format).id, prepareRecord(raw, 'xml').id);
});

test('a server ignoring Range restarts safely instead of concatenating two bodies', async () => {
  await withServer((req, res) => { res.writeHead(200, { ETag: '"v2"' }); res.end(raw); }, async base => {
    const store = new CorpusStore(await temp()), url = base + '/x.xml', key = sha256(url);
    const folder = join(store.directory, 'downloads'), file = join(folder, `${key.slice(0, 24)}-x.xml`);
    await mkdir(folder); await writeFile(file + '.part', raw.subarray(0, 100));
    store.db.prepare('INSERT INTO downloads VALUES (?,?,?,?,?)').run(key, file, '"v1"', 100, 0); store.countBytes('archiveBytes', 100);
    try {
      assert.deepEqual(await readFile(await downloadShard({ url, name: 'x.xml', size: raw.length, sha256: sha256(raw) }, store)), raw);
      assert.equal(store.counter('archiveBytes'), raw.length);
    } finally { store.close(); }
  });
});
test('a saved full body recovers without another request', async () => {
  const store = new CorpusStore(await temp()), url = 'http://127.0.0.1:1/x.xml', key = sha256(url);
  const folder = join(store.directory, 'downloads'), file = join(folder, `${key.slice(0, 24)}-x.xml`);
  await mkdir(folder); await writeFile(file + '.part', raw);
  store.db.prepare('INSERT INTO downloads VALUES (?,?,?,?,?)').run(key, file, '"v1"', raw.length, 0); store.countBytes('archiveBytes', raw.length);
  try { assert.deepEqual(await readFile(await downloadShard({ url, name: 'x.xml', size: raw.length, sha256: sha256(raw) }, store)), raw); }
  finally { store.close(); }
});
test('budget exhaustion preserves the current member for the next run', async () => {
  const dir = await temp(), file = join(dir, 'one.xml'); await writeFile(file, raw);
  const store = new CorpusStore(join(dir, 'state'), { maxBytes: 1 });
  try {
    await assert.rejects(importFile(file, store), /storage_budget/);
    assert.equal(store.db.prepare('SELECT cursor FROM jobs').get().cursor, -1);
    assert.equal(store.summary().games, 0);
    store.maxBytes = 10_000_000;
    assert.equal((await importFile(file, store)).imported, 1);
  } finally { store.close(); }
});
test('a damaged archive cannot be marked done and path members never extract outside the corpus', async () => {
  const dir = await temp(), file = join(dir, 'bad.tar');
  await writeFile(file, 'not a tar');
  const store = new CorpusStore(join(dir, 'state'));
  try { await assert.rejects(importFile(file, store)); assert.equal(store.db.prepare('SELECT state FROM jobs').get().state, 'failed'); }
  finally { store.close(); }
  const tarFile = join(dir, 'paths.tar'); await pack(tarFile, [['../../escape.xml', raw]]);
  const entries = [];
  for await (const r of archiveRecords(tarFile)) entries.push(r);
  assert.equal(entries.length, 1); assert.deepEqual(entries[0].raw, raw);
});

test('retry-failed rewinds a paused job and retains evidence until the record succeeds', async () => {
  const dir = await temp(), file = join(dir, 'retry.tar'), state = join(dir, 'state');
  await pack(file, [['bad.xml', Buffer.from('bad')], ['good.xml', raw]]);
  let store = new CorpusStore(state);
  await importFile(file, store, { maxRecords: 1 }); store.close();
  const previousExitCode = process.exitCode;
  try { await main(['import', '--state-dir', state, '--input', file, '--retry-failed', '--max-records', '1']); }
  finally { process.exitCode = previousExitCode; }
  store = new CorpusStore(state);
  try {
    assert.equal(store.summary().rejected, 1);
    assert.equal(store.db.prepare('SELECT cursor FROM jobs').get().cursor, 0);
    assert.equal(store.summary().games, 0);
    const goodFile = join(dir, 'good.xml'); await writeFile(goodFile, raw);
    await importFile(goodFile, store);
    const goodKey = store.db.prepare("SELECT key FROM jobs WHERE state='done'").get().key;
    store.failure(goodKey, 0, goodFile, 'previous_mapper_error');
    store.progress(goodKey, 0, 'paused'); store.retryFailures();
    assert.equal(store.summary().rejected, 2);
    assert.equal((await importFile(goodFile, store)).duplicates, 1);
    assert.equal(store.summary().rejected, 1);
  } finally { store.close(); }
});

test('metadata serialization precedes mutations and preserves Parquet 64-bit identifiers', async () => {
  const store = new CorpusStore(await temp()), record = prepareRecord(raw, 'xml');
  try {
    const circular = {}; circular.self = circular;
    assert.throws(() => store.put({ ...record, metadata: circular }, 'x', 'bad'));
    assert.equal(store.summary().games, 0);
    store.put({ ...record, metadata: { game_id: 9007199254740993n, ranks: [1, 2, 3, 4] } }, 'parquet', 'row');
    assert.equal(store.read(record.id).observations[0].metadata.game_id, '9007199254740993');
  } finally { store.close(); }
});

test('a partial 206 segment without manifest size cannot be marked a completed shard', async () => {
  await withServer((req, res) => { res.writeHead(206, { 'Content-Range': 'bytes 100-199/300', ETag: '"v1"' }); res.end(Buffer.alloc(100)); }, async base => {
    const store = new CorpusStore(await temp()), url = base + '/partial', key = sha256(url);
    const folder = join(store.directory, 'downloads'), file = join(folder, `${key.slice(0, 24)}-x.xml`);
    await mkdir(folder); await writeFile(file + '.part', Buffer.alloc(100));
    store.db.prepare('INSERT INTO downloads VALUES (?,?,?,?,?)').run(key, file, '"v1"', 100, 0); store.countBytes('archiveBytes', 100);
    try {
      await assert.rejects(downloadShard({ url, name: 'x.xml' }, store), /incomplete_resume_range/);
      assert.equal(store.db.prepare('SELECT complete FROM downloads WHERE key=?').get(key).complete, 0);
    } finally { store.close(); }
  });
});

test('a completed download cannot satisfy a changed manifest checksum', async () => {
  let requests = 0;
  await withServer((req, res) => { requests++; res.end(raw); }, async base => {
    const store = new CorpusStore(await temp()), job = { url: base + '/archive', name: 'game.xml', size: raw.length, sha256: sha256(raw) };
    try {
      await downloadShard(job, store);
      await assert.rejects(downloadShard({ ...job, sha256: sha256('new revision') }, store), /cached_download_manifest_mismatch/);
      assert.equal(requests, 1);
    } finally { store.close(); }
  });
});
