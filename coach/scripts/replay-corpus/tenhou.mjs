import { gunzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { fetchPublic } from './network.mjs';
import { prepareRecord } from './identity.mjs';

export const TENHOU_REFRESH_MS = 20 * 60 * 1000;
export function parseTenhouIndex(text) {
  const out = [];
  for (const match of text.matchAll(/\b(\d{10}gm-([\da-f]{4})-[\da-f]{4}-[\da-f]{8})\b/gi)) {
    if (parseInt(match[2], 16) & 0x10) continue;
    out.push(match[1]);
  }
  return [...new Set(out)];
}
export function enqueueIndex(store, text) {
  const add = store.db.prepare('INSERT OR IGNORE INTO queue(id,url,metadata) VALUES (?,?,?)');
  store.begin();
  for (const line of text.split(/\r?\n/)) {
    const time = /^\s*(\d{2}:\d{2})\b/.exec(line)?.[1];
    for (const id of parseTenhouIndex(line)) {
      const playedAt = time ? { value: `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${time}:00+09:00`, precision: 'minute', sourceField: 'tenhou-index' } : undefined;
      add.run(id, `https://tenhou.net/0/log/?${id}`, JSON.stringify({ platform: 'tenhou', ...(playedAt ? { playedAt } : {}) }));
    }
  }
  store.flush();
}
async function getBytes(url, store, options) {
  options.signal?.throwIfAborted();
  if (store.counter('downloadBytes') >= options.maxDownloadBytes) throw new Error('download_budget_exhausted');
  const r = await fetchPublic(url, { signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error(`HTTP_${r.status}${r.headers.has('retry-after') ? ':retry-after=' + r.headers.get('retry-after') : ''}`);
  }
  const chunks = []; let bytes = 0;
  for await (const chunk of r.body) {
    bytes += chunk.length;
    if (bytes > 16_000_000) throw new Error('tenhou_response_too_large');
    if (store.counter('downloadBytes') + chunk.length > options.maxDownloadBytes) throw new Error('download_budget_exhausted');
    store.flush(); store.countBytes('downloadBytes', chunk.length); chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function collectTenhou(store, { maxIndex = 10, maxLogs = 1000, old = false, delayMs = 1000, ...options } = {}) {
  options.maxDownloadBytes ??= 10_000_000_000;
  if (delayMs < 1000) throw new Error('tenhou_minimum_delay_1000ms');
  const url = `https://tenhou.net/sc/raw/list.cgi${old ? '?old' : ''}`;
  const state = store.db.prepare('SELECT * FROM indexes WHERE url=?');
  const mark = store.db.prepare('INSERT OR REPLACE INTO indexes VALUES (?,?,?)');
  const now = Date.now();
  let refreshed = 0;
  if (now - (state.get(url)?.fetched_at ?? 0) >= TENHOU_REFRESH_MS) {
    const text = (await getBytes(url, store, options)).toString('utf8');
    const files = [...text.matchAll(/file\s*:\s*['"]([^'"]+)['"]\s*,\s*size\s*:\s*(\d+)/g)]
      .map(m => ({ name: m[1], size: Number(m[2]) }))
      .filter(e => /(?:^|\/)sc[cef]/.test(e.name) && /\.(?:html|log)\.gz$/.test(e.name) && !e.name.includes('..'));
    if (!files.length) throw new Error('tenhou_file_index_empty_or_changed');
    let considered = 0;
    for (const file of files) {
      const fileUrl = `https://tenhou.net/sc/raw/dat/${file.name}`;
      const previous = state.get(fileUrl);
      if (previous?.size === file.size) continue;
      if (considered++ >= maxIndex) break;
      await delay(delayMs, undefined, { signal: options.signal });
      const raw = await getBytes(fileUrl, store, options);
      const content = raw[0] === 31 && raw[1] === 139 ? gunzipSync(raw, { maxOutputLength: 16_000_000 }) : raw;
      // Tasks are persisted before marking the index complete. A crash or
      // max-logs cutoff never loses undispatched IDs as the scratch script did.
      enqueueIndex(store, content.toString('utf8'));
      mark.run(fileUrl, file.size, Date.now()); refreshed++;
    }
    mark.run(url, null, Date.now());
  }
  const pending = store.db.prepare("SELECT * FROM queue WHERE state='pending' ORDER BY id LIMIT ?").all(maxLogs);
  let downloaded = 0, rejected = 0;
  for (const task of pending) {
    await delay(delayMs, undefined, { signal: options.signal });
    let raw;
    try { raw = await getBytes(task.url, store, options); }
    catch (e) {
      if (/HTTP_(404|410)/.test(e.message)) { store.db.prepare("UPDATE queue SET state='failed',error=? WHERE id=?").run(e.message, task.id); rejected++; continue; }
      throw e; // 429/5xx stop the single session; retry the pending task later.
    }
    try {
      const record = prepareRecord(raw, 'xml', { name: task.id, metadata: JSON.parse(task.metadata) });
      store.put(record, 'tenhou-live', task.id);
      store.begin(); store.db.prepare("UPDATE queue SET state='done',error=NULL WHERE id=?").run(task.id); store.flush();
      downloaded++;
    } catch (e) {
      if (/budget|identity_inconsistent|SQLITE/.test(e.message) || e.code?.startsWith('ERR_SQLITE')) throw e;
      store.db.prepare("UPDATE queue SET state='failed',error=? WHERE id=?").run(e.message, task.id);
      rejected++;
    }
  }
  return { refreshed, downloaded, rejected, pending: store.db.prepare("SELECT count(*) AS n FROM queue WHERE state='pending'").get().n };
}
