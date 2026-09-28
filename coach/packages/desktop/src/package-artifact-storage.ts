import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { JSONParser } from "@streamparser/json";
import { writeCanonicalJson } from "@riichi-coach/reasoning";

/** Storage representation only: domain package schemas and identities do not change. */
export const PACKAGE_CHUNK_BYTES = 64 * 1024;
const MAGIC = Buffer.from("RCPKG01\0", "ascii");

export type PackageArtifactRow = {
  package_ref_id: string;
  payload: Uint8Array;
  content_hash: string;
};

type Description = { payload: Buffer; contentHash: string; byteLength: number; chunks: number };

function serialize(value: unknown, consume?: (chunk: Buffer, ordinal: number) => void): Description {
  const buffer = Buffer.allocUnsafe(PACKAGE_CHUNK_BYTES);
  const hash = createHash("sha256");
  let used = 0;
  let byteLength = 0;
  let chunks = 0;
  const flush = () => {
    const chunk = buffer.subarray(0, used);
    hash.update(chunk);
    consume?.(chunk, chunks);
    byteLength += used;
    chunks++;
    used = 0;
  };
  writeCanonicalJson(value, part => {
    const bytes = Buffer.from(part, "utf8");
    for (let offset = 0; offset < bytes.length;) {
      const count = Math.min(buffer.length - used, bytes.length - offset);
      bytes.copy(buffer, used, offset, offset + count);
      offset += count;
      used += count;
      if (used === buffer.length) flush();
    }
  });
  if (used > 0) flush();
  const payload = Buffer.alloc(24);
  MAGIC.copy(payload);
  payload.writeBigUInt64LE(BigInt(chunks), 8);
  payload.writeBigUInt64LE(BigInt(byteLength), 16);
  return { payload, contentHash: hash.digest("hex"), byteLength, chunks };
}

/** First pass fixes bytes/hash before entering the repository's transaction. */
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
  const parser = new JSONParser({ paths: ["$"], stringBufferSize: 64 * 1024 });
  let value: unknown;
  let complete = false;
  parser.onValue = result => { value = result.value; complete = true; };
  // Evidence/action IDs repeat throughout ledgers and differences. Share equal
  // immutable strings within this one read, with a bounded FIFO dictionary.
  // This caches representation, never validation or analysis conclusions.
  const strings = new Map<string, string>();
  parser.onToken = token => {
    if (typeof token.value !== "string" || token.value.length < 64) return;
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

export function readPackageArtifact(db: DatabaseSync, row: PackageArtifactRow): unknown {
  const header = Buffer.from(row.payload);
  if (!header.subarray(0, 5).equals(MAGIC.subarray(0, 5))) {
    // v1/v2 immutable bytes remain untouched and retain their original hash.
    if (db.prepare("SELECT 1 FROM analysis_package_chunks WHERE package_ref_id=? LIMIT 1").get(row.package_ref_id)) {
      throw new Error("package_chunks_invalid");
    }
    if (createHash("sha256").update(header).digest("hex") !== row.content_hash) throw new Error("package_hash_mismatch");
    try { return JSON.parse(header.toString("utf8")); }
    catch { throw new Error("package_payload_invalid"); }
  }
  if (header.length !== 24 || !header.subarray(0, 8).equals(MAGIC)) throw new Error("package_storage_version_mismatch");
  const count = Number(header.readBigUInt64LE(8));
  const byteLength = Number(header.readBigUInt64LE(16));
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(byteLength) || count < 1
    || byteLength < 1 || count !== Math.ceil(byteLength / PACKAGE_CHUNK_BYTES)) throw new Error("package_chunks_invalid");
  const hash = createHash("sha256");
  let seen = 0;
  let bytes = 0;
  function* chunks(): Generator<Uint8Array> {
    for (const raw of db.prepare("SELECT ordinal,payload FROM analysis_package_chunks WHERE package_ref_id=? ORDER BY ordinal").iterate(row.package_ref_id)) {
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
  }
  // Parser failures and framing failures stay unavailable; no partial package escapes.
  const value = parsePackageJsonChunks(chunks());
  if (seen !== count || bytes !== byteLength) throw new Error("package_chunks_invalid");
  if (hash.digest("hex") !== row.content_hash) throw new Error("package_hash_mismatch");
  return value;
}
