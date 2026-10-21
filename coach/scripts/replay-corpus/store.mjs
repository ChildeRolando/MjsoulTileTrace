import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { zstdCompressSync, zstdDecompressSync, constants } from 'node:zlib';
import { ID_VERSION } from './identity.mjs';

export class CorpusStore {
  constructor(directory, { batchSize = 256, maxBytes = 10_000_000_000, cacheKiB = 65536 } = {}) {
    mkdirSync(directory, { recursive: true });
    this.directory = directory; this.file = join(directory, 'corpus.sqlite');
    this.batchSize = batchSize; this.maxBytes = maxBytes; this.pending = 0;
    this.db = new DatabaseSync(this.file);
    if (!Number.isInteger(cacheKiB) || cacheKiB < 1024 || cacheKiB > 262144) throw new Error('invalid_database_cache');
    this.db.exec(`PRAGMA cache_size=-${cacheKiB}`);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=0; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, first_seen TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS variants(hash TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id), format TEXT NOT NULL, data BLOB NOT NULL);
      CREATE INDEX IF NOT EXISTS variants_game ON variants(game_id);
      CREATE TABLE IF NOT EXISTS observations(source TEXT NOT NULL, locator TEXT NOT NULL, hash TEXT NOT NULL REFERENCES variants(hash), metadata TEXT NOT NULL, PRIMARY KEY(source,locator,hash));
      CREATE INDEX IF NOT EXISTS observations_hash ON observations(hash);
      CREATE TABLE IF NOT EXISTS jobs(key TEXT PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT -1, state TEXT NOT NULL DEFAULT 'pending', error TEXT);
      CREATE TABLE IF NOT EXISTS failures(job TEXT NOT NULL, ordinal INTEGER NOT NULL, locator TEXT NOT NULL, error TEXT NOT NULL, PRIMARY KEY(job,ordinal));
      CREATE TABLE IF NOT EXISTS downloads(key TEXT PRIMARY KEY, path TEXT NOT NULL, etag TEXT, size INTEGER NOT NULL DEFAULT 0, complete INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS counters(key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS indexes(url TEXT PRIMARY KEY, size INTEGER, fetched_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS queue(id TEXT PRIMARY KEY, url TEXT NOT NULL, metadata TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', error TEXT);`);
    const previous = this.db.prepare('SELECT value FROM settings WHERE key=?').get('identity');
    if (previous && previous.value !== ID_VERSION) { this.db.close(); throw new Error('corpus_identity_version_mismatch'); }
    this.db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('identity', ID_VERSION);
    this.findVariant = this.db.prepare('SELECT game_id FROM variants WHERE hash=?');
    this.insertGame = this.db.prepare('INSERT OR IGNORE INTO games VALUES (?,?)');
    this.insertVariant = this.db.prepare('INSERT OR IGNORE INTO variants VALUES (?,?,?,?)');
    this.insertObservation = this.db.prepare('INSERT OR IGNORE INTO observations VALUES (?,?,?,?)');
    this.timings = { compressMs: 0, databaseMs: 0, commitMs: 0, checkpointMs: 0, diskCheckMs: 0 };
  }
  begin() { if (!this.pending) { this.db.exec('BEGIN IMMEDIATE'); this.pending = 1; } }
  flush() {
    if (this.pending) {
      const t = performance.now(); this.db.exec('COMMIT'); this.pending = 0; this.timings.commitMs += performance.now() - t;
      // Default 4 MB auto-checkpoint dominated Windows ingestion (11.28 s of
      // 15.75 s / 5,000 games). Bound WAL at 64 MB and amortize the disk sync.
      if (statSync(`${this.file}-wal`).size >= 64 * 1024 * 1024) this.checkpoint();
    }
  }
  checkpoint() { const t = performance.now(); this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); this.timings.checkpointMs += performance.now() - t; }
  tick() { if (++this.pending >= this.batchSize) this.flush(); }
  counter(key) { return this.db.prepare('SELECT value FROM counters WHERE key=?').get(key)?.value ?? 0; }
  countBytes(key, amount) { this.db.prepare('INSERT INTO counters VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=value+excluded.value').run(key, amount); }
  diskBytes() {
    const t = performance.now();
    const size = p => { try { return statSync(p).size; } catch { return 0; } };
    const result = size(this.file) + size(`${this.file}-wal`) + this.counter('archiveBytes');
    this.timings.diskCheckMs += performance.now() - t;
    return result;
  }
  put(record, source, locator) {
    const start = performance.now(), compressionBefore = this.timings.compressMs;
    const known = this.findVariant.get(record.rawHash);
    this.begin();
    let inserted = false;
    if (!known) {
      const c = performance.now();
      const data = zstdCompressSync(record.raw, { params: { [constants.ZSTD_c_compressionLevel]: 1 } });
      this.timings.compressMs += performance.now() - c;
      if (this.diskBytes() + data.length * 2 + 16384 > this.maxBytes) throw new Error('storage_budget_exhausted');
      inserted = !!this.insertGame.run(record.id, new Date().toISOString()).changes;
      this.insertVariant.run(record.rawHash, record.id, record.format, data);
    } else if (known.game_id !== record.id) throw new Error('identity_inconsistent');
    this.insertObservation.run(source, locator, record.rawHash, JSON.stringify(record.metadata));
    this.timings.databaseMs += performance.now() - start - (this.timings.compressMs - compressionBefore);
    this.tick();
    return inserted;
  }
  job(key) {
    this.db.prepare('INSERT OR IGNORE INTO jobs(key) VALUES (?)').run(key);
    return this.db.prepare('SELECT * FROM jobs WHERE key=?').get(key);
  }
  progress(key, cursor, state = 'running', error = null) {
    this.begin();
    this.db.prepare('UPDATE jobs SET cursor=?,state=?,error=? WHERE key=?').run(cursor, state, error, key);
    this.tick();
  }
  failure(key, ordinal, locator, error) {
    this.begin();
    this.db.prepare('INSERT OR REPLACE INTO failures VALUES (?,?,?,?)').run(key, ordinal, locator, String(error).slice(0, 500));
    this.progress(key, ordinal);
  }
  read(id, hash) {
    const row = hash ? this.db.prepare('SELECT * FROM variants WHERE game_id=? AND hash=?').get(id, hash)
      : this.db.prepare("SELECT * FROM variants WHERE game_id=? ORDER BY CASE format WHEN 'xml' THEN 0 ELSE 1 END, hash LIMIT 1").get(id);
    if (!row) throw new Error('record_not_found');
    return { ...row, raw: zstdDecompressSync(row.data), observations: this.db.prepare('SELECT source,locator,metadata FROM observations WHERE hash=?').all(row.hash).map(r => ({ ...r, metadata: JSON.parse(r.metadata) })) };
  }
  summary() {
    const count = table => this.db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
    return { games: count('games'), variants: count('variants'), observations: count('observations'), rejected: count('failures'), jobs: this.db.prepare('SELECT state,count(*) AS count FROM jobs GROUP BY state').all(), liveQueue: this.db.prepare('SELECT state,count(*) AS count FROM queue GROUP BY state').all(), downloadedBytes: this.counter('downloadBytes'), diskBytes: this.diskBytes() };
  }
  close() { this.flush(); this.checkpoint(); this.db.close(); }
}
