#!/usr/bin/env node
// Compatibility entry: persistent queue replaces the old scratch collector.
// New bulk-first usage: npm run corpus -- help.
import { CorpusStore } from './replay-corpus/store.mjs';
import { runJobs, lockDirectory } from './replay-corpus/runner.mjs';

const args = process.argv.slice(2), options = { live: true, maxDownloadBytes: 10_000_000_000 };
let directory;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--state-dir') directory = args[++i];
  else if (arg === '--old') options.old = true;
  else if (['--max-index', '--max-logs', '--delay-ms'].includes(arg)) {
    const value = Number(args[++i]);
    if (!Number.isInteger(value) || value < 0) throw new Error('invalid_option:' + arg);
    options[{ '--max-index': 'maxIndex', '--max-logs': 'maxLogs', '--delay-ms': 'delayMs' }[arg]] = value;
  } else throw new Error('unknown_option:' + arg);
}
if (!directory) throw new Error('--state-dir required; use npm run corpus -- help for bulk-first ingestion');
const release = await lockDirectory(directory);
let store;
try {
  store = new CorpusStore(directory);
  const results = await runJobs([], store, options);
  console.log(JSON.stringify({ ...store.summary(), results }, null, 2));
  if (results.some(r => r.error || r.rejected)) process.exitCode = 1;
} finally { store?.close(); await release(); }
