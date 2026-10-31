import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { createGunzip, createZstdDecompress, gunzipSync, zstdDecompressSync, brotliDecompressSync } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import tar from 'tar-stream';
import yauzl from 'yauzl';
import { parquetReadObjects, parquetMetadataAsync, asyncBufferFromFile } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

export const nativeCompressors = { ...compressors,
  ZSTD: (bytes, size) => zstdDecompressSync(bytes, { maxOutputLength: size }),
  GZIP: (bytes, size) => gunzipSync(bytes, { maxOutputLength: size }),
  BROTLI: (bytes, size) => brotliDecompressSync(bytes, { maxOutputLength: size }),
};

export const MAX_RECORD_BYTES = 16 * 1024 * 1024;
export async function bufferStream(stream, limit = MAX_RECORD_BYTES) {
  const chunks = []; let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) { stream.destroy(); throw new Error('entry_too_large'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export function unpackRecord(bytes, name) {
  if (/\.(gz|gzip)$/i.test(name)) return gunzipSync(bytes, { maxOutputLength: MAX_RECORD_BYTES });
  if (/\.zst$/i.test(name)) return zstdDecompressSync(bytes, { maxOutputLength: MAX_RECORD_BYTES });
  if (bytes.length > MAX_RECORD_BYTES) throw new Error('entry_too_large');
  return bytes;
}
export function recordFormat(name, raw) {
  if (/\.(xml|mjlog)(\.(gz|zst))?$/i.test(name) || raw.subarray(0, 200).toString().trimStart().startsWith('<')) return 'xml';
  return 'mjai';
}
function accepted(name) { return /\.(xml|mjlog|json|jsonl|ndjson)(\.(gz|zst))?$/i.test(name); }

// No extraction to disk: member paths are metadata, never filesystem targets.
export async function* archiveRecords(file, { startAfter = -1, accept = accepted } = {}) {
  if (/\.parquet$/i.test(file)) {
    const buffer = await asyncBufferFromFile(file), metadata = await parquetMetadataAsync(buffer);
    const columns = metadata.schema.filter(x => x.name !== 'schema').map(x => x.name);
    if (!columns.includes('events')) throw new Error('parquet_missing_events');
    const total = Number(metadata.num_rows);
    let groupStart = 0;
    for (const group of metadata.row_groups) {
      const end = groupStart + Number(group.num_rows), offset = Math.max(groupStart, startAfter + 1);
      groupStart = end;
      if (offset >= end) continue;
      // Decode each physical row group once, not once per 64-row slice.
      if (Number(group.total_byte_size) > 256 * 1024 * 1024) throw new Error('parquet_row_group_too_large');
      const rows = await parquetReadObjects({ file: buffer, metadata, compressors: nativeCompressors, rowStart: offset, rowEnd: Math.min(end, total) });
      for (let i = 0; i < rows.length; i++) {
        const { events, ...metadata } = rows[i];
        const raw = Buffer.from(typeof events === 'string' ? events : JSON.stringify(events));
        if (raw.length > MAX_RECORD_BYTES) throw new Error('entry_too_large');
        yield { name: String(metadata.game_id ?? offset + i), raw, format: 'mjai', metadata, ordinal: offset + i };
      }
    }
    return;
  }
  if (/\.zip$/i.test(file)) {
    const zip = await new Promise((res, rej) => yauzl.open(file, { lazyEntries: true }, (e, z) => e ? rej(e) : res(z)));
    let ordinal = -1;
    try {
      while (true) {
        const entry = await new Promise((resolve, reject) => {
          const cleanup = () => { zip.removeListener('entry', onEntry); zip.removeListener('end', onEnd); zip.removeListener('error', onError); };
          const onEntry = e => { cleanup(); resolve(e); }, onEnd = () => { cleanup(); resolve(null); }, onError = e => { cleanup(); reject(e); };
          zip.once('entry', onEntry); zip.once('end', onEnd); zip.once('error', onError); zip.readEntry();
        });
        if (!entry) break;
        ordinal++;
        if (ordinal <= startAfter || !accept(entry.fileName)) continue;
        if (entry.uncompressedSize > MAX_RECORD_BYTES) { yield { ordinal, name: entry.fileName, error: 'entry_too_large' }; continue; }
        const stream = await new Promise((res, rej) => zip.openReadStream(entry, (e, s) => e ? rej(e) : res(s)));
        let raw;
        try { raw = unpackRecord(await bufferStream(stream), entry.fileName); }
        catch (e) { yield { ordinal, name: entry.fileName, error: e.message }; continue; }
        yield { ordinal, name: entry.fileName, raw, format: recordFormat(entry.fileName, raw) };
      }
    } finally { zip.close(); }
    return;
  }
  if (/\.(tar|tar\.gz|tgz|tar\.zst)$/i.test(file)) {
    const extract = tar.extract(), input = createReadStream(file);
    const streams = [input];
    if (/\.(gz|tgz)$/.test(file)) streams.push(createGunzip());
    if (/\.zst$/.test(file)) streams.push(createZstdDecompress());
    streams.push(extract);
    const done = pipeline(...streams);
    done.catch(() => {});
    let ordinal = -1;
    try {
      for await (const entry of extract) {
        ordinal++;
        const name = entry.header.name;
        if (ordinal <= startAfter || entry.header.type !== 'file' || !accept(name)) { entry.resume(); continue; }
        if (entry.header.size > MAX_RECORD_BYTES) { entry.resume(); yield { ordinal, name, error: 'entry_too_large' }; continue; }
        let raw;
        try { raw = unpackRecord(await bufferStream(entry), name); }
        catch (e) { yield { ordinal, name, error: e.message }; continue; }
        yield { ordinal, name, raw, format: recordFormat(name, raw) };
      }
      await done;
    } finally { input.destroy(); extract.destroy(); await done.catch(() => {}); }
    return;
  }
  if (startAfter < 0) {
    if ((await stat(file)).size > MAX_RECORD_BYTES) throw new Error('entry_too_large');
    const raw = unpackRecord(await readFile(file), file);
    yield { ordinal: 0, name: file, raw, format: recordFormat(file, raw) };
  }
}
