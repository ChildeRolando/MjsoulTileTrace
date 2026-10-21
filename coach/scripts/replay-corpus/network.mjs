import { mkdir, open, stat, rename } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { sha256 } from './identity.mjs';
import { setTimeout as delay } from 'node:timers/promises';

export const USER_AGENT = 'RiichiCoach-public-corpus/1.0 (local research; single-session Tenhou)';
export function publicUrl(value) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('invalid_public_url');
  return u.href;
}
export function retryAfterMs(value, now = Date.now()) {
  if (!value) return 1000;
  return /^\d+$/.test(value) ? Number(value) * 1000 : Math.max(0, Date.parse(value) - now) || 1000;
}
export async function fetchPublic(url, options = {}) {
  return fetch(publicUrl(url), { ...options, headers: { 'User-Agent': USER_AGENT, ...options.headers }, signal: options.signal ?? AbortSignal.timeout(60_000) });
}
export async function fetchJson(url) {
  const res = await fetchPublic(url);
  if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP_${res.status}`); }
  // Discovery is bounded independently of the data-download budget.
  const chunks = []; let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > 8_000_000) throw new Error('metadata_response_too_large');
    chunks.push(chunk);
  }
  return { data: JSON.parse(Buffer.concat(chunks).toString()), link: res.headers.get('link') };
}

export async function downloadShard(job, store, { maxDownloadBytes = 10_000_000_000, signal, retries = 3 } = {}) {
  const key = sha256(job.url), folder = join(store.directory, 'downloads');
  await mkdir(folder, { recursive: true });
  const file = join(folder, `${key.slice(0, 24)}-${basename(job.name).replace(/[^\w.-]/g, '_')}`), part = `${file}.part`;
  let row = store.db.prepare('SELECT * FROM downloads WHERE key=?').get(key);
  if (row?.complete) {
    const s = await stat(file).catch(() => null);
    if (s?.size === row.size) return file;
    throw new Error('completed_download_missing_or_changed');
  }
  const update = store.db.prepare('INSERT INTO downloads VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET path=excluded.path,etag=excluded.etag,size=excluded.size,complete=excluded.complete');
  const hashFile = async path => {
    const h = createHash('sha256');
    for await (const chunk of createReadStream(path)) { signal?.throwIfAborted(); h.update(chunk); }
    return h.digest('hex');
  };
  // Recovery after a complete body was saved but before its final rename/receipt.
  if (job.sha256 && job.size && (await stat(part).catch(() => null))?.size === job.size) {
    if (await hashFile(part) !== job.sha256) throw new Error('download_checksum_mismatch');
    await rename(part, file); update.run(key, file, row?.etag ?? null, job.size, 1); return file;
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    signal?.throwIfAborted();
    row = store.db.prepare('SELECT * FROM downloads WHERE key=?').get(key);
    let offset = (await stat(part).catch(() => ({ size: 0 }))).size;
    const remaining = maxDownloadBytes - store.counter('downloadBytes');
    if (remaining <= 0 || (job.size && job.size - offset > remaining)) throw new Error('download_budget_exhausted');
    if (job.size && store.diskBytes() + job.size - offset + 1_000_000 > store.maxBytes) throw new Error('storage_budget_exhausted');
    const headers = offset && row?.etag ? { Range: `bytes=${offset}-`, 'If-Range': row.etag } : {};
    if (offset && !row?.etag) offset = 0;
    let handle;
    try {
      const response = await fetchPublic(job.url, { headers, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000) });
      if ([408, 429].includes(response.status) || response.status >= 500) {
        const wait = retryAfterMs(response.headers.get('retry-after'));
        await response.body?.cancel();
        if (attempt === retries || wait > 30_000) throw new Error(`retry_later_HTTP_${response.status}:${wait}`);
        await delay(Math.max(wait, 1000 * 2 ** attempt), undefined, { signal }); continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP_${response.status}`); }
      if (response.status === 206) {
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
        if (!range || Number(range[1]) !== offset || !offset || (job.size && Number(range[3]) !== job.size)
          || (response.headers.get('etag') && row?.etag && response.headers.get('etag') !== row.etag)) { await response.body.cancel(); throw new Error('invalid_resume_range'); }
      } else {
        // Range ignored or validator changed: truncate, never append a new body.
        offset = 0;
      }
      const existing = (await stat(part).catch(() => ({ size: 0 }))).size;
      if (!offset && existing) store.countBytes('archiveBytes', -existing);
      const etag = response.headers.get('etag') ?? response.headers.get('last-modified');
      update.run(key, file, etag, offset, 0);
      handle = await open(part, offset ? 'a' : 'w');
      for await (const chunk of response.body) {
        signal?.throwIfAborted();
        if (store.counter('downloadBytes') + chunk.length > maxDownloadBytes) throw new Error('download_budget_exhausted');
        if (store.diskBytes() + chunk.length + 1_000_000 > store.maxBytes) throw new Error('storage_budget_exhausted');
        // Count before writing: a crash can over-count slightly, never silently
        // grant a fresh 10 GB budget on resume. Counter increments also commit.
        store.flush();
        store.countBytes('downloadBytes', chunk.length);
        await handle.writeFile(chunk);
        store.countBytes('archiveBytes', chunk.length);
        offset += chunk.length;
      }
      await handle.close(); handle = null;
      if (job.size && offset !== job.size) throw new Error('download_size_mismatch');
      if (job.sha256) {
        if (await hashFile(part) !== job.sha256) throw new Error('download_checksum_mismatch');
      }
      await rename(part, file);
      update.run(key, file, etag, offset, 1);
      return file;
    } catch (error) {
      await handle?.close();
      if (signal?.aborted || /budget|HTTP_|range|checksum|size_mismatch/.test(error.message) || attempt === retries) throw error;
      await delay(1000 * 2 ** attempt, undefined, { signal });
    }
  }
  throw new Error('download_retry_exhausted');
}
