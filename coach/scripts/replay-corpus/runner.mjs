import { stat, open, unlink, readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { archiveRecords } from './archives.mjs';
import { prepareRecord, sha256, ID_VERSION } from './identity.mjs';
import { downloadShard } from './network.mjs';
import { orderJobs } from './sources.mjs';
import { collectTenhou, enqueueIndex } from './tenhou.mjs';

export async function lockDirectory(directory) {
  await mkdir(directory, { recursive: true });
  const file = join(directory, '.crawler.lock');
  try {
    const handle = await open(file, 'wx');
    await handle.writeFile(String(process.pid)); await handle.close();
    return async () => { await unlink(file); };
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const owner = Number(await readFile(file, 'utf8'));
    if (!Number.isInteger(owner) || owner <= 0) throw new Error('crawler_lock_invalid');
    try { process.kill(owner, 0); } catch (error) {
      if (error.code === 'ESRCH') { await unlink(file); return lockDirectory(directory); }
    }
    throw new Error(`crawler_already_running:${owner}`);
  }
}

export async function importFile(file, store, { source = 'local', metadata = {}, sourceKey, signal, maxRecords = Infinity, onProgress = () => {}, index = false } = {}) {
  const info = await stat(file);
  const key = sha256(JSON.stringify([ID_VERSION, source, sourceKey ?? resolve(file), info.size, sourceKey ? null : info.mtimeMs, metadata, index]));
  const previous = store.job(key);
  if (previous.state === 'done') return { skipped: true, imported: 0, duplicates: 0, rejected: 0 };
  let cursor = previous.cursor, imported = 0, duplicates = 0, rejected = 0, seen = 0, normalizeMs = 0, hashMs = 0;
  const started = performance.now(); let lastUpdate = started;
  try {
    for await (const entry of archiveRecords(file, { startAfter: previous.cursor, ...(index ? { accept: n => /(?:^|\/)sc[cef].*\.(html|log)(\.gz)?$/i.test(n) } : {}) })) {
      signal?.throwIfAborted();
      if (seen >= maxRecords) { store.progress(key, cursor, 'paused'); store.flush(); return { imported, duplicates, rejected, normalizeMs, hashMs, elapsedMs: performance.now() - started, paused: true }; }
      try {
        if (entry.error) throw new Error(entry.error);
        if (index) enqueueIndex(store, entry.raw.toString('utf8'));
        else {
          const record = prepareRecord(entry.raw, entry.format, { name: entry.name, metadata: { ...metadata, ...entry.metadata } });
          normalizeMs += record.timing.normalizeMs; hashMs += record.timing.hashMs;
          if (store.put(record, source, `${sourceKey ?? resolve(file)}#${entry.name}`)) imported++;
          else duplicates++;
        }
        cursor = entry.ordinal; store.progress(key, cursor);
      } catch (e) {
        if (/budget|identity_inconsistent|SQLITE/.test(e.message) || e.code?.startsWith('ERR_SQLITE')) throw e;
        rejected++; store.failure(key, entry.ordinal, entry.name, e.message); cursor = entry.ordinal;
      }
      seen++;
      if (seen % 128 === 0) await yieldLoop();
      if (performance.now() - lastUpdate > 5000) {
        lastUpdate = performance.now(); onProgress({ file, imported, duplicates, rejected, recordsPerSecond: seen / ((lastUpdate - started) / 1000) });
      }
    }
    if (seen === 0 && previous.cursor === -1) throw new Error('archive_no_supported_records');
    store.progress(key, cursor, 'done'); store.flush();
    return { imported, duplicates, rejected, normalizeMs, hashMs, elapsedMs: performance.now() - started };
  } catch (e) {
    store.progress(key, cursor, /budget|abort/i.test(e.message) ? 'paused' : 'failed', e.message); store.flush(); throw e;
  }
}

export async function* localFiles(input) {
  const info = await stat(input);
  if (info.isFile()) { yield input; return; }
  // Directory iteration avoids materialising a million filename list.
  const { opendir } = await import('node:fs/promises');
  const dir = await opendir(input);
  for await (const entry of dir) {
    if (entry.isSymbolicLink()) continue;
    const path = join(input, entry.name);
    if (entry.isDirectory()) yield* localFiles(path);
    else if (entry.isFile() && /\.(xml|mjlog|json|jsonl|ndjson|gz|zst|tar|tgz|zip|parquet)$/i.test(entry.name)) yield path;
  }
}

export async function runJobs(jobs, store, options = {}) {
  const results = [];
  // Whole shards are scheduled before indexes/live sources. One downloader
  // plus streaming conversion keeps memory bounded and the remote polite.
  // Parallelism is CPU/disk-independent future pressure, not a default gamble.
  for (const job of orderJobs(jobs)) {
    options.signal?.throwIfAborted();
    options.onProgress?.({ stage: 'download', source: job.source, name: job.name, bytes: job.size });
    try {
      const file = job.path ?? await downloadShard(job, store, options);
      const result = await importFile(file, store, { ...options, source: job.source, metadata: job.metadata, sourceKey: job.url ?? job.path, index: job.kind === 'tenhou-index' });
      results.push({ source: job.source, name: job.name, ...result });
      if (result.paused) break;
    } catch (e) {
      results.push({ source: job.source, name: job.name, error: e.message });
      // Insufficient remaining budget can still fit a later smaller shard.
      if (/download_budget|storage_budget/.test(e.message)) continue;
      if (options.signal?.aborted) break;
    }
  }
  if (options.live && !results.some(x => x.error || x.paused)) {
    const release = await lockDirectory(join(tmpdir(), 'riichi-coach-tenhou-single-session'));
    try { results.push({ source: 'tenhou-live', ...await collectTenhou(store, options) }); }
    finally { await release(); }
  }
  return results;
}
