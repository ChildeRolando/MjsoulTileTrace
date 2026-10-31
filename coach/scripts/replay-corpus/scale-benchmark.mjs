#!/usr/bin/env node
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CorpusStore } from './store.mjs';
import { importFile } from './runner.mjs';

const [input, outputDirectory] = process.argv.slice(2);
if (!input || !outputDirectory) throw new Error('usage: scale-benchmark.mjs ARCHIVE EVIDENCE_DIRECTORY');
await mkdir(outputDirectory, { recursive: true });
const root = await mkdtemp(join(resolve(outputDirectory), 'sqlite-scale-')), runs = [];
for (let trial = 0; trial < 3; trial++) {
  for (const mode of ['default-4mb', 'bounded-64mb']) {
    const t = performance.now(), store = new CorpusStore(join(root, `${trial}-${mode}`));
    if (mode === 'default-4mb') store.db.exec('PRAGMA wal_autocheckpoint=1000');
    let result;
    try { result = await importFile(input, store, { source: 'benchmark', maxRecords: 5000 }); }
    finally { store.close(); }
    const run = { mode, trial, ...result, totalIncludingCloseMs: performance.now() - t, timings: store.timings };
    runs.push(run); console.error(JSON.stringify(run));
  }
}
const median = mode => runs.filter(r => r.mode === mode).map(r => r.totalIncludingCloseMs).sort((a, b) => a - b)[1];
const result = { input, count: 5000, repeats: 3, runs, medianBeforeMs: median('default-4mb'), medianAfterMs: median('bounded-64mb') };
await writeFile(join(outputDirectory, 'sqlite-scale-benchmark.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
