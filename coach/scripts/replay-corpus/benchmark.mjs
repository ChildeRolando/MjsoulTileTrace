#!/usr/bin/env node
import { writeFileSync, appendFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveRecords } from './archives.mjs';
import { prepareRecord, sha256 } from './identity.mjs';
import { CorpusStore } from './store.mjs';

const args = process.argv.slice(2), external = args[0], count = Number(args[1] ?? 1000), cacheKiB = Number(args[2] ?? 65536);
const samples = [];
if (external) {
  for await (const r of archiveRecords(external)) {
    if (r.error) continue;
    samples.push(r); if (samples.length >= count) break;
  }
} else {
  const dir = new URL('../../packages/tenhou-source/tests/fixtures/real-logs/', import.meta.url);
  for (const name of ['bug1', 'bug2', 'bug3', 'bug4', 'bug5', 'bug6', 'bug8', 'bug9', 'example', 'pao', 'shuffle']) samples.push({ name, raw: await readFile(new URL(`${name}.xml`, dir)), format: 'xml' });
}
if (!samples.length) throw new Error('benchmark_empty');
const runs = [], root = mkdtempSync(join(tmpdir(), 'coach-corpus-benchmark-'));
// Warm only code paths; every measured trial gets an empty storage directory.
for (const s of samples.slice(0, 20)) prepareRecord(s.raw, s.format, s);
for (let trial = 0; trial < 5; trial++) {
  const oldDir = join(root, `old-${trial}`); mkdirSync(oldDir);
  let start = performance.now(), legacyHashMs = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i], t = performance.now(), hash = sha256(s.raw);
    legacyHashMs += performance.now() - t;
    const file = join(oldDir, `${i}.raw`);
    writeFileSync(file, s.raw);
    appendFileSync(join(oldDir, 'downloads.ndjson'), JSON.stringify({ file, sha256: hash, bytes: s.raw.length }) + '\n');
  }
  const legacyMs = performance.now() - start;
  const store = new CorpusStore(join(root, `new-${trial}`), { cacheKiB });
  let normalizeMs = 0, hashMs = 0;
  start = performance.now();
  for (const s of samples) {
    const r = prepareRecord(s.raw, s.format, s);
    normalizeMs += r.timing.normalizeMs; hashMs += r.timing.hashMs;
    store.put(r, 'benchmark', s.name);
  }
  store.flush();
  const newMs = performance.now() - start, summary = store.summary();
  start = performance.now();
  for (const s of samples) store.put(prepareRecord(s.raw, s.format, s), 'mirror', s.name);
  store.flush();
  const duplicateMs = performance.now() - start;
  const times = { ...store.timings }; store.close();
  runs.push({ trial, count: samples.length, legacyMs, legacyHashMs, newMs, normalizeMs, hashMs, duplicateMs, ...times, games: summary.games, databaseBytes: (await stat(join(root, `new-${trial}`, 'corpus.sqlite'))).size });
}
const median = key => runs.map(r => r[key]).sort((a, b) => a - b)[2];
const result = { schemaVersion: 'corpus-benchmark/v1', input: external ?? '11 pinned real XML fixtures', count: samples.length, cacheKiB, repeats: 5,
  caveat: 'Old path writes raw files and byte hashes only. New path additionally parses, normalizes, deduplicates, compresses and indexes metadata. Network delay is excluded from both.',
  median: { legacyMs: median('legacyMs'), newMs: median('newMs'), normalizeMs: median('normalizeMs'), hashMs: median('hashMs'), hashPerGameMs: median('hashMs') / samples.length, recordsPerSecond: samples.length * 1000 / median('newMs'), duplicateMs: median('duplicateMs') }, runs };
console.log(JSON.stringify(result, null, 2));
