import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createReviewSessionRepository } from "../src/review-session-repository.js";
import { describePackageArtifact, insertPackageChunks, parsePackageJsonChunks, readPackageArtifact, PACKAGE_CHUNK_BYTES } from "../src/package-artifact-storage.js";

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

describe("complete package bytes in bounded SQLite chunks", () => {
  it.each([1,2,3,17,PACKAGE_CHUNK_BYTES])("preserves native JSON semantics across %i-byte boundaries", width => {
    const text = '{"__proto__":{"kept":true},"constructor":"plain","number":-1.25e+4,"tiles":"白🀄\\n\\\"","values":[null,false,0] }';
    const bytes = Buffer.from(text);
    function* chunks() { for(let i=0;i<bytes.length;i+=width) yield bytes.subarray(i,i+width); }
    const actual = parsePackageJsonChunks(chunks()) as Record<string,unknown>;
    expect(actual).toStrictEqual(JSON.parse(text));
    expect(Object.getPrototypeOf(actual)).toBe(Object.prototype);
    expect(Object.hasOwn(actual,"__proto__")).toBe(true);
  });

  it.each(['', '{"x":', '{}{}', '{} trailing', '{"x":NaN}', '[1,]'])("rejects malformed/incomplete/multiple roots: %s", text => {
    expect(() => parsePackageJsonChunks([Buffer.from(text)])).toThrow("package_payload_invalid");
  });

  it("roundtrips every field, exact canonical bytes and SHA across multiple chunks", () => {
    const value = {a:[true,null,1.25], z:"白🀄\\\"\n".repeat(30_000)};
    const expected = Buffer.from(JSON.stringify(value));
    const db = database();
    try {
      const row = store(db,value);
      const chunks = db.prepare("SELECT ordinal,payload FROM analysis_package_chunks ORDER BY ordinal").all();
      expect(chunks.length).toBeGreaterThan(2);
      expect(chunks.every((chunk,index)=>chunk.ordinal===index && (chunk.payload as Uint8Array).length<=PACKAGE_CHUNK_BYTES)).toBe(true);
      const bytes = Buffer.concat(chunks.map(chunk=>Buffer.from(chunk.payload as Uint8Array)));
      expect(bytes).toEqual(expected);
      expect(row.content_hash).toBe(hash(expected));
      expect(readPackageArtifact(db,row)).toStrictEqual(value);
      expect(() => db.prepare("UPDATE analysis_package_chunks SET payload=? WHERE ordinal=0").run(Buffer.from("changed"))).toThrow("immutable_artifact");
    } finally { db.close(); }
  });

  it.each(["missing","truncated","changed","extra","header"])("rejects %s chunks without exposing a partial value", kind => {
    const db=database();
    try {
      const row=store(db,{value:"x".repeat(PACKAGE_CHUNK_BYTES*3)});
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
      expect(() => store(db,{value:"x".repeat(PACKAGE_CHUNK_BYTES*3)})).toThrow("injected_write_failure");
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
