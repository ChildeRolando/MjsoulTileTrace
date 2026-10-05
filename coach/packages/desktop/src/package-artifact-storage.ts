import { createHash } from "node:crypto";
import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from "node:zlib";
import type { DatabaseSync } from "node:sqlite";
import { JSONParser } from "@streamparser/json";
import { RecordAnalysisSchema, type RecordAnalysis } from "@riichi-coach/contracts";
import { writeCanonicalJson } from "@riichi-coach/reasoning";

/** Maximum payload size enforced by analysis_package_chunks. */
export const PACKAGE_CHUNK_BYTES = 64 * 1024;
/** Bound on the raw bytes held and encoded as one independent storage block. */
export const PACKAGE_RAW_BLOCK_BYTES = 4 * 1024 * 1024;
const RAW_ROW_BYTES = PACKAGE_CHUNK_BYTES - 5;
const ROW_HEADER_BYTES = 5;
const MAGIC_V1 = Buffer.from("RCPKG01\0", "ascii");
const MAGIC_V2 = Buffer.from("RCPKG02\0", "ascii");
const CODEC_RAW = 0;
const CODEC_BROTLI = 1;
const BROTLI_OPTIONS = { params: {
  [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
  [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
} };

export type PackageArtifactRow = {
  package_ref_id: string;
  payload: Uint8Array;
  content_hash: string;
};

type Description = { payload: Buffer; contentHash: string; byteLength: number; chunks: number };
type StreamReceipt = { digest?: string };

function encodeRow(flag: number, rawLength: number, data: Uint8Array): Buffer {
  if (!Number.isSafeInteger(rawLength) || rawLength < 1 || rawLength > PACKAGE_RAW_BLOCK_BYTES) {
    throw new Error("package_chunks_invalid");
  }
  const row = Buffer.allocUnsafe(ROW_HEADER_BYTES + data.byteLength);
  row[0] = flag;
  row.writeUInt32LE(rawLength, 1);
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(row, ROW_HEADER_BYTES);
  return row;
}

function serialize(value: unknown, consume?: (chunk: Buffer, ordinal: number) => void): Description {
  const rawBlock = Buffer.allocUnsafe(PACKAGE_RAW_BLOCK_BYTES);
  const hash = createHash("sha256");
  let used = 0;
  let byteLength = 0;
  let chunks = 0;
  const writeRow = (row: Buffer) => {
    if (row.length > PACKAGE_CHUNK_BYTES) throw new Error("package_chunks_invalid");
    consume?.(row, chunks);
    chunks++;
  };
  const flush = (raw: Buffer) => {
    hash.update(raw);
    byteLength += raw.length;
    const compressed = brotliCompressSync(raw, BROTLI_OPTIONS);
    if (compressed.length < raw.length && compressed.length <= RAW_ROW_BYTES) {
      writeRow(encodeRow(CODEC_BROTLI, raw.length, compressed));
      return;
    }
    for (let offset = 0; offset < raw.length; offset += RAW_ROW_BYTES) {
      const part = raw.subarray(offset, Math.min(offset + RAW_ROW_BYTES, raw.length));
      writeRow(encodeRow(CODEC_RAW, part.length, part));
    }
  };
  writeCanonicalJson(value, part => {
    const bytes = Buffer.from(part, "utf8");
    for (let offset = 0; offset < bytes.length;) {
      const count = Math.min(rawBlock.length - used, bytes.length - offset);
      bytes.copy(rawBlock, used, offset, offset + count);
      offset += count;
      used += count;
      if (used === rawBlock.length) {
        flush(rawBlock);
        used = 0;
      }
    }
  });
  if (used > 0) flush(rawBlock.subarray(0, used));
  const payload = Buffer.alloc(24);
  MAGIC_V2.copy(payload);
  payload.writeBigUInt64LE(BigInt(chunks), 8);
  payload.writeBigUInt64LE(BigInt(byteLength), 16);
  return { payload, contentHash: hash.digest("hex"), byteLength, chunks };
}

/** First pass fixes canonical bytes/hash and the exact storage-row count before the repository transaction. */
export function describePackageArtifact(value: unknown): Description {
  return serialize(value);
}

/** Called inside the same transaction that inserts the immutable parent row. */
export function insertPackageChunks(db: DatabaseSync, ref: string, value: unknown, expected: Description): void {
  const insert = db.prepare("INSERT INTO analysis_package_chunks(package_ref_id,ordinal,payload) VALUES(?,?,?)");
  const written = serialize(value, (chunk, ordinal) => { insert.run(ref, ordinal, chunk); });
  if (written.contentHash !== expected.contentHash || !written.payload.equals(expected.payload)) {
    throw new Error("package_write_mismatch");
  }
}

/** Synchronous streaming parser: no whole-document string, no early exposure.
 * The caller still runs the complete package/domain/read-back validators. */
export function parsePackageJsonChunks(chunks: Iterable<Uint8Array>): unknown {
  const parser = new JSONParser({ stringBufferSize: 64 * 1024 });
  let value: unknown;
  let complete = false;
  parser.onValue = result => {
    let parsed = result.value;
    // push-built arrays retain spare capacity. Once a JSON array closes, no
    // parser can append to it again; a dense copy keeps only its actual slots.
    // Do not share mutable arrays or change their values/JSON representation.
    if (Array.isArray(parsed)) {
      parsed = parsed.slice();
      if (result.parent !== undefined) {
        Object.defineProperty(result.parent, result.key!, {
          value: parsed, enumerable: true, writable: true, configurable: true,
        });
      }
    }
    if (result.parent === undefined) { value = parsed; complete = true; }
  };
  // Evidence/action IDs and short enum values repeat throughout ledgers and
  // differences. Share all equal immutable strings within this one read, with
  // a bounded FIFO dictionary; short strings dominate complete real packages.
  // This caches representation, never validation or analysis conclusions.
  const strings = new Map<string, string>();
  parser.onToken = token => {
    if (typeof token.value !== "string") return;
    const existing = strings.get(token.value);
    if (existing !== undefined) token.value = existing;
    else {
      if (strings.size >= 65_536) strings.delete(strings.keys().next().value!);
      strings.set(token.value, token.value);
    }
  };
  try {
    for (const chunk of chunks) parser.write(chunk);
    if (!parser.isEnded) parser.end();
    if (!complete) throw new Error("incomplete");
    return value;
  } catch { throw new Error("package_payload_invalid"); }
}

function parseChunkHeader(header: Buffer): { count: number; byteLength: number } {
  if (header.length !== 24) throw new Error("package_storage_version_mismatch");
  const count = Number(header.readBigUInt64LE(8));
  const byteLength = Number(header.readBigUInt64LE(16));
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(byteLength)
    || count < 1 || byteLength < 1 || count > byteLength) {
    throw new Error("package_chunks_invalid");
  }
  return { count, byteLength };
}

function* legacyChunks(db: DatabaseSync, ref: string, count: number, byteLength: number, receipt: StreamReceipt): Generator<Uint8Array> {
  if (count !== Math.ceil(byteLength / PACKAGE_CHUNK_BYTES)) throw new Error("package_chunks_invalid");
  let seen = 0;
  let bytes = 0;
  const hash = createHash("sha256");
  for (const raw of db.prepare("SELECT ordinal,payload FROM analysis_package_chunks WHERE package_ref_id=? ORDER BY ordinal").iterate(ref)) {
    const chunk = raw.payload as Uint8Array;
    const expectedLength = seen === count - 1 ? byteLength - seen * PACKAGE_CHUNK_BYTES : PACKAGE_CHUNK_BYTES;
    if (raw.ordinal !== seen || seen >= count || !(chunk instanceof Uint8Array) || chunk.length !== expectedLength) {
      throw new Error("package_chunks_invalid");
    }
    hash.update(chunk);
    bytes += chunk.length;
    seen++;
    yield chunk;
  }
  if (seen !== count || bytes !== byteLength) throw new Error("package_chunks_invalid");
  receipt.digest = hash.digest("hex");
}

function decodeV2Row(payload: Uint8Array): Buffer {
  const row = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  if (row.length <= ROW_HEADER_BYTES || row.length > PACKAGE_CHUNK_BYTES) throw new Error("package_chunks_invalid");
  const flag = row[0]!;
  const rawLength = row.readUInt32LE(1);
  const data = row.subarray(ROW_HEADER_BYTES);
  if (!Number.isSafeInteger(rawLength) || rawLength < 1 || rawLength > PACKAGE_RAW_BLOCK_BYTES) {
    throw new Error("package_chunks_invalid");
  }
  if (flag === CODEC_RAW) {
    if (rawLength > RAW_ROW_BYTES || data.length !== rawLength) throw new Error("package_chunks_invalid");
    return data;
  }
  if (flag !== CODEC_BROTLI || data.length > RAW_ROW_BYTES || data.length >= rawLength) {
    throw new Error("package_chunks_invalid");
  }
  try {
    const decompressWithInfo = brotliDecompressSync as unknown as (
      input: Uint8Array,
      options: { maxOutputLength: number; info: true },
    ) => { buffer: Buffer; engine: { bytesWritten: number } };
    const decoded = decompressWithInfo(data, { maxOutputLength: rawLength, info: true });
    if (decoded.engine.bytesWritten !== data.length || decoded.buffer.length !== rawLength) {
      throw new Error("package_chunks_invalid");
    }
    return decoded.buffer;
  } catch {
    throw new Error("package_chunks_invalid");
  }
}

function* compressedChunks(db: DatabaseSync, ref: string, count: number, byteLength: number, receipt: StreamReceipt): Generator<Uint8Array> {
  let seen = 0;
  let bytes = 0;
  const hash = createHash("sha256");
  for (const raw of db.prepare("SELECT ordinal,payload FROM analysis_package_chunks WHERE package_ref_id=? ORDER BY ordinal").iterate(ref)) {
    if (raw.ordinal !== seen || seen >= count) throw new Error("package_chunks_invalid");
    const chunk = decodeV2Row(raw.payload as Uint8Array);
    if (bytes + chunk.length > byteLength) throw new Error("package_chunks_invalid");
    hash.update(chunk);
    bytes += chunk.length;
    seen++;
    yield chunk;
  }
  if (seen !== count || bytes !== byteLength) throw new Error("package_chunks_invalid");
  receipt.digest = hash.digest("hex");
}

export function readPackageArtifact(db: DatabaseSync, row: PackageArtifactRow): unknown {
  const header = Buffer.from(row.payload);
  if (header.subarray(0, MAGIC_V2.length).equals(MAGIC_V2)) {
    const { count, byteLength } = parseChunkHeader(header);
    const receipt: StreamReceipt = {};
    const decoded = compressedChunks(db, row.package_ref_id, count, byteLength, receipt);
    const value = parsePackageJsonChunks(decoded);
    if (receipt.digest !== row.content_hash) throw new Error("package_hash_mismatch");
    return value;
  }
  if (header.subarray(0, MAGIC_V1.length).equals(MAGIC_V1)) {
    const { count, byteLength } = parseChunkHeader(header);
    const receipt: StreamReceipt = {};
    const decoded = legacyChunks(db, row.package_ref_id, count, byteLength, receipt);
    const value = parsePackageJsonChunks(decoded);
    if (receipt.digest !== row.content_hash) throw new Error("package_hash_mismatch");
    return value;
  }
  if (header.subarray(0, 5).equals(MAGIC_V2.subarray(0, 5)) || header.subarray(0, 5).equals(MAGIC_V1.subarray(0, 5))) {
    if (db.prepare("SELECT 1 FROM analysis_package_chunks WHERE package_ref_id=? LIMIT 1").get(row.package_ref_id)) {
      throw new Error("package_chunks_invalid");
    }
    throw new Error("package_storage_version_mismatch");
  }
  if (db.prepare("SELECT 1 FROM analysis_package_chunks WHERE package_ref_id=? LIMIT 1").get(row.package_ref_id)) {
    throw new Error("package_chunks_invalid");
  }
  if (createHash("sha256").update(header).digest("hex") !== row.content_hash) throw new Error("package_hash_mismatch");
  try { return JSON.parse(header.toString("utf8")); }
  catch { throw new Error("package_payload_invalid"); }
}

/** Read only the record identity for historical usage. Validate storage bytes
 * without materializing the analysis/evidence trees or sending them to UI. */
export function readPackageRecordIdentity(db: DatabaseSync, row: PackageArtifactRow & { package_id: string; schema_version: string }): RecordAnalysis {
  const header = Buffer.from(row.payload);
  const receipt: StreamReceipt = {};
  let chunks: Iterable<Uint8Array>;
  if (header.subarray(0, MAGIC_V2.length).equals(MAGIC_V2)) {
    const { count, byteLength } = parseChunkHeader(header);
    chunks = compressedChunks(db, row.package_ref_id, count, byteLength, receipt);
  } else if (header.subarray(0, MAGIC_V1.length).equals(MAGIC_V1)) {
    const { count, byteLength } = parseChunkHeader(header);
    chunks = legacyChunks(db, row.package_ref_id, count, byteLength, receipt);
  } else {
    if (header.subarray(0, 5).equals(MAGIC_V2.subarray(0, 5)) ||
      db.prepare("SELECT 1 FROM analysis_package_chunks WHERE package_ref_id=? LIMIT 1").get(row.package_ref_id)) {
      throw new Error("package_storage_version_mismatch");
    }
    receipt.digest = createHash("sha256").update(header).digest("hex");
    chunks = [header];
  }
  const parser = new JSONParser({ paths: ["$.record", "$.packageId", "$.componentVersions.packageSchema"], keepStack: false, stringBufferSize: 64 * 1024 });
  let record: unknown;
  let packageId: unknown;
  let packageSchema: unknown;
  parser.onValue = value => {
    if (value.key === "record") record = value.value;
    if (value.key === "packageId") packageId = value.value;
    if (value.key === "packageSchema") packageSchema = value.value;
  };
  try {
    for (const chunk of chunks) parser.write(chunk);
    if (!parser.isEnded) parser.end();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("package_")) throw error;
    throw new Error("package_payload_invalid");
  }
  if (receipt.digest !== row.content_hash) throw new Error("package_hash_mismatch");
  if (packageId !== row.package_id) throw new Error("package_identity_mismatch");
  if (packageSchema !== row.schema_version) throw new Error("package_version_mismatch");
  return RecordAnalysisSchema.parse(record);
}
