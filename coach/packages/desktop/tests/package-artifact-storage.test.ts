import { createHash } from "node:crypto";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createReviewSessionRepository } from "../src/review-session-repository.js";
import { describePackageArtifact, insertPackageChunks, parsePackageJsonChunks, readPackageArtifact, PACKAGE_CHUNK_BYTES, PACKAGE_RAW_BLOCK_BYTES } from "../src/package-artifact-storage.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive:true, force:true }); });
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function database() {
  const root = mkdtempSync(join(tmpdir(), "package-chunks-"));
  roots.push(root);
  createReviewSessionRepository({root}).close();
  return new DatabaseSync(join(root, "library.sqlite"));
}
function store(db: DatabaseSync, value: unknown) {
  const description = describePackageArtifact(value);
  const row = {package_ref_id:"test-ref", payload:description.payload, content_hash:description.contentHash};
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO analysis_packages VALUES(?,?,?,?,?)").run(row.package_ref_id,"test-id",row.content_hash,"test-schema",row.payload);
    insertPackageChunks(db,row.package_ref_id,value,description);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return row;
}
function highEntropyValue() {
  const entropy = Buffer.alloc(100_000);
  let state = 0x5eed1234;
  for (let index = 0; index < entropy.length; index++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    entropy[index] = state & 0xff;
  }
  return { payload: entropy.toString("base64") };
}

describe("complete package bytes in bounded SQLite chunks", () => {
  it("does not retain array growth capacity for repeated evidence lists", () => {
    const moduleUrl = new URL("../src/package-artifact-storage.ts", import.meta.url).href;
    const script = `
      import assert from 'node:assert/strict';
      import { parsePackageJsonChunks } from ${JSON.stringify(moduleUrl)};
      const values = Array.from({length:18}, (_, index) => 'evidence-' + index);
      const count = 750_000;
      const block = Buffer.from(JSON.stringify(values) + ',');
      function* chunks() {
        yield Buffer.from('[');
        for (let i = 1; i < count; i++) yield block;
        yield block.subarray(0, block.length - 1);
        yield Buffer.from(']');
      }
      const actual = parsePackageJsonChunks(chunks());
      assert.equal(actual.length, count);
      for (const row of actual) assert.deepEqual(row, values);
      console.log('complete-lists-preserved');
    `;
    const result = spawnSync(process.execPath, ["--max-old-space-size=192", "--experimental-strip-types", "--input-type=module", "--eval", script], {
      encoding: "utf8", timeout: 30_000, windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("complete-lists-preserved");
  }, 35_000);

  it("reads repeated short evidence strings within a bounded process heap", () => {
    const moduleUrl = new URL("../src/package-artifact-storage.ts", import.meta.url).href;
    const script = `
      import assert from 'node:assert/strict';
      import { parsePackageJsonChunks } from ${JSON.stringify(moduleUrl)};
      const values = ['evidence:' + 'a'.repeat(23), 'decision:' + 'b'.repeat(39), 'candidate:' + 'c'.repeat(53)];
      const count = 1_500_000;
      const block = Buffer.from(values.map(value => JSON.stringify(value)).join(',') + ',');
      function* chunks() {
        yield Buffer.from('[');
        for (let i = 0; i < count / values.length - 1; i++) yield block;
        yield block.subarray(0, block.length - 1);
        yield Buffer.from(']');
      }
      const actual = parsePackageJsonChunks(chunks());
      assert.equal(actual.length, count);
      for (let i = 0; i < actual.length; i++) assert.equal(actual[i], values[i % values.length]);
      console.log('complete-values-preserved');
    `;
    const result = spawnSync(process.execPath, ["--max-old-space-size=96", "--experimental-strip-types", "--input-type=module", "--eval", script], {
      encoding: "utf8", timeout: 20_000, windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("complete-values-preserved");
  }, 25_000);

  it.each([1,2,3,17,PACKAGE_CHUNK_BYTES])("preserves native JSON semantics across %i-byte boundaries", width => {
    const text = '{"__proto__":{"kept":true},"constructor":"plain","number":-1.25e+4,"tiles":"白🀄\\n\\\"","values":[null,false,0] }';
    const bytes = Buffer.from(text);
    function* chunks() { for(let i=0;i<bytes.length;i+=width) yield bytes.subarray(i,i+width); }
    const actual = parsePackageJsonChunks(chunks()) as Record<string,unknown>;
    expect(actual).toStrictEqual(JSON.parse(text));
    expect(Object.getPrototypeOf(actual)).toBe(Object.prototype);
    expect(Object.hasOwn(actual,"__proto__")).toBe(true);
  });

  it.each(['null', 'false', '0', '""', '[]', '[[1],[2,[]]]', '{"__proto__":[1],"a":[2],"a":[3]}'])(
    "preserves complete root/array semantics: %s", text => {
      function* chunks() { for (const byte of Buffer.from(text)) yield Uint8Array.of(byte); }
      expect(parsePackageJsonChunks(chunks())).toStrictEqual(JSON.parse(text));
    },
  );

  it("does not share mutable arrays with equal contents", () => {
    const actual = parsePackageJsonChunks([Buffer.from('{"a":[1],"b":[1]}')]) as {a:number[];b:number[]};
    actual.a.push(2);
    expect(actual).toEqual({a:[1,2],b:[1]});
  });

  it.each(['', '{"x":', '{}{}', '{} trailing', '{"x":NaN}', '[1,]'])("rejects malformed/incomplete/multiple roots: %s", text => {
    expect(() => parsePackageJsonChunks([Buffer.from(text)])).toThrow("package_payload_invalid");
  });

  it("roundtrips every field, exact canonical bytes and SHA across multiple chunks", () => {
    const value = {a:[true,null,1.25], z:"白🀄\\\"\n".repeat(1_000_000)};
    const expected = Buffer.from(JSON.stringify(value));
    const db = database();
    try {
      const row = store(db,value);
      const chunks = db.prepare("SELECT ordinal,payload FROM analysis_package_chunks ORDER BY ordinal").all();
      expect(chunks.length).toBeGreaterThan(2);
      expect(chunks.every((chunk,index)=>chunk.ordinal===index && (chunk.payload as Uint8Array).length<=PACKAGE_CHUNK_BYTES)).toBe(true);
      expect(Buffer.from(row.payload).subarray(0, 8).toString("ascii")).toBe("RCPKG02\0");
      expect(chunks.every(chunk => Buffer.from(chunk.payload as Uint8Array)[0] === 1)).toBe(true);
      expect(row.payload.readBigUInt64LE(8)).toBe(BigInt(chunks.length));
      expect(row.payload.readBigUInt64LE(16)).toBe(BigInt(expected.length));
      expect(row.content_hash).toBe(hash(expected));
      expect(readPackageArtifact(db,row)).toStrictEqual(value);
      expect(() => db.prepare("UPDATE analysis_package_chunks SET payload=? WHERE ordinal=0").run(Buffer.from("changed"))).toThrow("immutable_artifact");
    } finally { db.close(); }
  });

  it("stores high-entropy canonical JSON as bounded raw fallback rows", () => {
    const value = highEntropyValue();
    const db = database();
    try {
      const row = store(db, value);
      const chunks = db.prepare("SELECT ordinal,payload FROM analysis_package_chunks ORDER BY ordinal").all();
      expect(chunks.length).toBeGreaterThan(1);
      for (const item of chunks) {
        const payload = Buffer.from(item.payload as Uint8Array);
        expect(item.ordinal).toBe(chunks.indexOf(item));
        expect(payload.length).toBeLessThanOrEqual(PACKAGE_CHUNK_BYTES);
        expect(payload[0]).toBe(0);
        expect(payload.readUInt32LE(1)).toBeLessThanOrEqual(PACKAGE_CHUNK_BYTES - 5);
        expect(payload.length).toBe(5 + payload.readUInt32LE(1));
      }
      expect(readPackageArtifact(db, row)).toStrictEqual(value);
    } finally { db.close(); }
  });

  it.each(["bad-flag", "trailing", "truncated", "oversized-output", "wrong-count"])("rejects malformed RCPKG02 rows: %s", kind => {
    const db = database();
    try {
      const row = store(db, { payload: "repeated-evidence:".repeat(20_000) });
      const first = db.prepare("SELECT payload FROM analysis_package_chunks WHERE ordinal=0").get()!.payload as Uint8Array;
      const payload = Buffer.from(first);
      expect(payload[0]).toBe(1);
      db.exec("DROP TRIGGER immutable_package_chunk");
      if (kind === "bad-flag") { payload[0] = 2; }
      if (kind === "trailing") { db.prepare("UPDATE analysis_package_chunks SET payload=? WHERE ordinal=0").run(Buffer.concat([payload, Buffer.from([0])])); }
      if (kind === "truncated") { db.prepare("UPDATE analysis_package_chunks SET payload=? WHERE ordinal=0").run(payload.subarray(0, payload.length - 1)); }
      if (kind === "oversized-output") { payload.writeUInt32LE(PACKAGE_RAW_BLOCK_BYTES + 1, 1); }
      if (kind === "wrong-count") { row.payload.writeBigUInt64LE(2n, 8); }
      if (kind !== "trailing" && kind !== "truncated" && kind !== "wrong-count") {
        db.prepare("UPDATE analysis_package_chunks SET payload=? WHERE ordinal=0").run(payload);
      }
      expect(() => readPackageArtifact(db, row)).toThrow(/package_(chunks_invalid|payload_invalid)/);
    } finally { db.close(); }
  });

  it("rejects a complete Brotli frame with trailing bytes", () => {
    const encoded = brotliCompressSync(Buffer.from("x".repeat(1000)), { params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
    } });
    const db = database();
    try {
      const row = store(db, { value: "x".repeat(90_000) });
      const first = db.prepare("SELECT payload FROM analysis_package_chunks WHERE ordinal=0").get()!.payload as Uint8Array;
      const payload = Buffer.from(first);
      payload[0] = 1;
      payload.writeUInt32LE(1000, 1);
      const forged = Buffer.concat([payload.subarray(0, 5), encoded, Buffer.from([0])]);
      db.exec("DROP TRIGGER immutable_package_chunk");
      db.prepare("UPDATE analysis_package_chunks SET payload=? WHERE ordinal=0").run(forged);
      expect(() => readPackageArtifact(db, row)).toThrow(/package_(chunks_invalid|payload_invalid)/);
    } finally { db.close(); }
  });

  it("checks the complete canonical SHA after successful RCPKG02 decompression", () => {
    const db = database();
    try {
      const row = store(db, { value: "verified compressed payload".repeat(500) });
      row.content_hash = "0".repeat(64);
      expect(() => readPackageArtifact(db, row)).toThrow("package_hash_mismatch");
    } finally { db.close(); }
  });

  it.each(["missing","truncated","changed","extra","header"])("rejects %s chunks without exposing a partial value", kind => {
    const db=database();
    try {
      const row=store(db,highEntropyValue());
      if(kind==="missing") db.exec("DELETE FROM analysis_package_chunks WHERE ordinal=1");
      if(kind==="truncated") db.exec("DELETE FROM analysis_package_chunks WHERE ordinal=(SELECT MAX(ordinal) FROM analysis_package_chunks)");
      if(kind==="changed") {
        db.exec("DROP TRIGGER immutable_package_chunk");
        db.prepare("UPDATE analysis_package_chunks SET payload=? WHERE ordinal=1").run(Buffer.alloc(PACKAGE_CHUNK_BYTES, "y"));
      }
      if(kind==="extra") db.prepare("INSERT INTO analysis_package_chunks VALUES(?,?,?)").run(row.package_ref_id,4,Buffer.from(" "));
      if(kind==="header") row.payload.writeBigUInt64LE(999n,16);
      expect(() => readPackageArtifact(db,row)).toThrow(/package_(chunks_invalid|payload_invalid|hash_mismatch)/);
    } finally { db.close(); }
  });

  it("rolls back the parent and earlier chunks after a later write fails", () => {
    const db=database();
    try {
      db.exec("CREATE TRIGGER fail_chunk BEFORE INSERT ON analysis_package_chunks WHEN NEW.ordinal=1 BEGIN SELECT RAISE(ABORT,'injected_write_failure'); END");
      expect(() => store(db,highEntropyValue())).toThrow("injected_write_failure");
      expect(db.prepare("SELECT COUNT(*) AS n FROM analysis_packages").get()?.n).toBe(0);
      expect(db.prepare("SELECT COUNT(*) AS n FROM analysis_package_chunks").get()?.n).toBe(0);
    } finally { db.close(); }
  });

  it("reads existing inline JSON bytes without rewriting them", () => {
    const db=database();
    try {
      const payload=Buffer.from('{ "z": [1,true], "a": "白" }');
      const row={package_ref_id:"old-ref",payload,content_hash:hash(payload)};
      db.prepare("INSERT INTO analysis_packages VALUES(?,?,?,?,?)").run(row.package_ref_id,"old-id",row.content_hash,"old-schema",payload);
      expect(readPackageArtifact(db,row)).toStrictEqual(JSON.parse(payload.toString()));
      expect(Buffer.from(db.prepare("SELECT payload FROM analysis_packages").get()!.payload as Uint8Array)).toEqual(payload);
      expect(db.prepare("SELECT COUNT(*) AS n FROM analysis_package_chunks").get()?.n).toBe(0);
    } finally { db.close(); }
  });

  it("reads existing RCPKG01 chunked bytes without rewriting them", () => {
    const db = database();
    try {
      const bytes = Buffer.from(JSON.stringify({ old: "v1 bytes".repeat(20_000) }));
      const count = Math.ceil(bytes.length / PACKAGE_CHUNK_BYTES);
      const header = Buffer.alloc(24);
      Buffer.from("RCPKG01\0", "ascii").copy(header);
      header.writeBigUInt64LE(BigInt(count), 8);
      header.writeBigUInt64LE(BigInt(bytes.length), 16);
      const row = { package_ref_id: "legacy-ref", payload: header, content_hash: hash(bytes) };
      db.prepare("INSERT INTO analysis_packages VALUES(?,?,?,?,?)")
        .run(row.package_ref_id, "legacy-id", row.content_hash, "legacy-schema", header);
      for (let ordinal = 0; ordinal < count; ordinal++) {
        db.prepare("INSERT INTO analysis_package_chunks VALUES(?,?,?)")
          .run(row.package_ref_id, ordinal, bytes.subarray(ordinal * PACKAGE_CHUNK_BYTES, Math.min((ordinal + 1) * PACKAGE_CHUNK_BYTES, bytes.length)));
      }
      expect(readPackageArtifact(db, row)).toStrictEqual(JSON.parse(bytes.toString("utf8")));
      expect(Buffer.from(db.prepare("SELECT payload FROM analysis_packages").get()!.payload as Uint8Array)).toEqual(header);
    } finally { db.close(); }
  });

  it("rejects mixed legacy and chunked representations", () => {
    const db = database();
    try {
      const payload = Buffer.from('{"kept":true}');
      const row = { package_ref_id: "mixed-ref", payload, content_hash: hash(payload) };
      db.prepare("INSERT INTO analysis_packages VALUES(?,?,?,?,?)")
        .run(row.package_ref_id, "mixed-id", row.content_hash, "old-schema", payload);
      db.prepare("INSERT INTO analysis_package_chunks VALUES(?,?,?)")
        .run(row.package_ref_id, 0, payload);
      expect(() => readPackageArtifact(db, row)).toThrow("package_chunks_invalid");
    } finally { db.close(); }
  });
});
