import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type RawCacheIdentity = Readonly<{
  sourceKind: string;
  stableRecordIdentityHash: string;
  perspective: string;
  sourceVersion: string;
  modelVersion: string;
  schemaVersion: string;
  parserVersion: string;
  validationVersion: string;
  requestParameters: Readonly<Record<string, string | number | boolean>>;
  authenticationPartitionHash?: string;
}>;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

function sha(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function rawCacheKey(identity: RawCacheIdentity): string {
  for (const value of [identity.sourceKind, identity.stableRecordIdentityHash, identity.perspective,
    identity.sourceVersion, identity.modelVersion, identity.schemaVersion, identity.parserVersion,
    identity.validationVersion]) if (value.length === 0) throw new Error("raw_cache_identity_incomplete");
  return sha(canonical(identity));
}

function controlledPath(root: string, relativePath: string): string {
  if (relativePath.length === 0 || isAbsolute(relativePath) || basename(relativePath) !== relativePath) throw new Error("raw_cache_path_invalid");
  const target = resolve(root, relativePath);
  const pathFromRoot = relative(resolve(root), target);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) throw new Error("raw_cache_path_invalid");
  return target;
}

export function createPrivilegedRawCache(input: { root: string; now?: () => string }) {
  const libraryRoot = resolve(input.root);
  const sourceRoot = join(libraryRoot, "source-cache");
  const stagingRoot = join(libraryRoot, "staging");
  mkdirSync(libraryRoot, { recursive: true, mode: 0o700 });
  const trustedLibraryRoot = realpathSync(libraryRoot);
  mkdirSync(sourceRoot, { recursive: true, mode: 0o700 });
  mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
  const assertControlledDirectory = (directory: string, expectedName: string): string => {
    if (realpathSync(libraryRoot) !== trustedLibraryRoot) throw new Error("raw_cache_path_invalid");
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("raw_cache_path_invalid");
    const real = realpathSync(directory);
    if (relative(trustedLibraryRoot, real) !== expectedName) throw new Error("raw_cache_path_invalid");
    return real;
  };
  const assertControlledDirectories = (): void => {
    assertControlledDirectory(sourceRoot, "source-cache");
    assertControlledDirectory(stagingRoot, "staging");
  };
  assertControlledDirectories();
  const db = new DatabaseSync(join(libraryRoot, "library.sqlite"));
  try { db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000"); }
  catch (error) { db.close(); throw error; }
  const now = input.now ?? (() => new Date().toISOString());

  const removeMaterial = (materialId: string, relativePath: string): void => {
    assertControlledDirectories();
    const target = controlledPath(sourceRoot, relativePath);
    if (existsSync(target)) {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink() || realpathSync(dirname(target)) !== realpathSync(sourceRoot)) throw new Error("raw_cache_path_invalid");
      unlinkSync(target);
    }
    db.prepare("DELETE FROM source_materials WHERE material_id=? AND state='deleting' AND NOT EXISTS(SELECT 1 FROM raw_cache_entries WHERE material_id=?)").run(materialId, materialId);
  };

  try { for (const row of db.prepare(`SELECT material_id,relative_path,state FROM source_materials
    WHERE state='deleting' OR NOT EXISTS(SELECT 1 FROM raw_cache_entries WHERE raw_cache_entries.material_id=source_materials.material_id)`).all() as Array<{ material_id: string; relative_path: string; state: string }>) {
    try {
      if (row.state !== "deleting") db.prepare("UPDATE source_materials SET state='deleting' WHERE material_id=?").run(row.material_id);
      removeMaterial(row.material_id, row.relative_path);
    } catch { /* retain deleting for explicit retry */ }
  } } catch (error) { db.close(); throw error; }

  return Object.freeze({
    put(identity: RawCacheIdentity, value: Uint8Array): string {
      assertControlledDirectories();
      const cacheKey = rawCacheKey(identity);
      const contentHash = sha(value);
      const materialId = `material:${contentHash}`;
      const relativePath = `${contentHash}.bin`;
      const target = controlledPath(sourceRoot, relativePath);
      if (!existsSync(target)) {
        const staging = join(stagingRoot, `${randomUUID()}.part`);
        const fd = openSync(staging, "wx", 0o600);
        try { writeFileSync(fd, value); fsyncSync(fd); } finally { closeSync(fd); }
        if (sha(readFileSync(staging)) !== contentHash) { unlinkSync(staging); throw new Error("raw_cache_write_invalid"); }
        assertControlledDirectories();
        try { renameSync(staging, target); } catch (error) {
          if (existsSync(target)) unlinkSync(staging); else throw error;
        }
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("INSERT OR IGNORE INTO source_materials VALUES(?,?,?,?, 'ready')").run(materialId, contentHash, value.byteLength, relativePath);
        const material = db.prepare("SELECT content_hash,byte_length,state FROM source_materials WHERE material_id=?").get(materialId) as { content_hash: string; byte_length: number; state: string };
        if (material.content_hash !== contentHash || material.byte_length !== value.byteLength || material.state !== "ready") throw new Error("raw_cache_material_conflict");
        db.prepare("INSERT OR REPLACE INTO raw_cache_entries VALUES(?,?,?,?,?,?,?)").run(cacheKey, materialId, identity.sourceKind, identity.stableRecordIdentityHash, identity.parserVersion, identity.validationVersion, now());
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
      return cacheKey;
    },

    get(identity: RawCacheIdentity): Uint8Array | null {
      const cacheKey = rawCacheKey(identity);
      const row = db.prepare(`SELECT e.source_kind,e.record_identity_hash,e.parser_version,e.validation_version,
        m.content_hash,m.byte_length,m.relative_path,m.state FROM raw_cache_entries e
        JOIN source_materials m ON m.material_id=e.material_id WHERE e.cache_key=?`).get(cacheKey) as {
          source_kind: string; record_identity_hash: string; parser_version: string; validation_version: string;
          content_hash: string; byte_length: number; relative_path: string; state: string;
        } | undefined;
      if (row === undefined || row.state !== "ready" || row.source_kind !== identity.sourceKind
        || row.record_identity_hash !== identity.stableRecordIdentityHash || row.parser_version !== identity.parserVersion
        || row.validation_version !== identity.validationVersion) return null;
      try {
        assertControlledDirectories();
        const target = controlledPath(sourceRoot, row.relative_path);
        const stat = lstatSync(target);
        if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(dirname(target)) !== realpathSync(sourceRoot)) return null;
        const value = readFileSync(target);
        return value.byteLength === row.byte_length && sha(value) === row.content_hash ? value : null;
      } catch { return null; }
    },

    clear(): Readonly<{ clearedEntries: number; pendingMaterials: number }> {
      assertControlledDirectories();
      const entries = db.prepare("SELECT cache_key,material_id FROM raw_cache_entries").all() as Array<{ cache_key: string; material_id: string }>;
      for (const entry of entries) db.prepare("DELETE FROM raw_cache_entries WHERE cache_key=?").run(entry.cache_key);
      const materials = db.prepare("SELECT material_id,relative_path FROM source_materials WHERE NOT EXISTS(SELECT 1 FROM raw_cache_entries WHERE raw_cache_entries.material_id=source_materials.material_id)").all() as Array<{ material_id: string; relative_path: string }>;
      let pendingMaterials = 0;
      for (const material of materials) {
        db.prepare("UPDATE source_materials SET state='deleting' WHERE material_id=?").run(material.material_id);
        try { removeMaterial(material.material_id, material.relative_path); } catch { pendingMaterials += 1; }
      }
      return Object.freeze({ clearedEntries: entries.length, pendingMaterials });
    },

    inspect(): Readonly<{ entries: number; materials: number }> {
      const entries = Number((db.prepare("SELECT COUNT(*) AS count FROM raw_cache_entries").get() as { count: number }).count);
      const materials = Number((db.prepare("SELECT COUNT(*) AS count FROM source_materials").get() as { count: number }).count);
      return Object.freeze({ entries, materials });
    },
    close(): void { db.close(); },
  });
}

export type PrivilegedRawCache = ReturnType<typeof createPrivilegedRawCache>;
