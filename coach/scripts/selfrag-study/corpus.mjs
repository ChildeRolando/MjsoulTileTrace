import { statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { zstdDecompressSync } from "node:zlib";

/**
 * Read-only access to the public-replay corpus (spec §9.1.1).
 *
 * The database is the frozen input of another owner's ingestion pipeline:
 * this module never opens a write handle, never changes WAL state, and never
 * creates files next to it. `readOnly: true` is the only supported mode.
 */
export const SELF_RAG_STUDY_CORPUS_READER_VERSION = "public-replays-read-only/v1";

function corpusError(code, detail) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  return error;
}

function requireString(value, detail) {
  if (typeof value !== "string" || value.length === 0) throw corpusError("study_corpus_invalid", detail);
  return value;
}

function normalizeLimit(value, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 100_000) {
    throw corpusError("study_corpus_paging_invalid", String(value));
  }
  return value;
}

function normalizeOffset(value) {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) throw corpusError("study_corpus_paging_invalid", String(value));
  return value;
}

/**
 * @param {string} file absolute `corpus.sqlite` path
 * @param {{ openDatabase?: (path: string, options: { readOnly: boolean }) => unknown }} [options] test seam
 */
export function openReplayCorpus(file, options = {}) {
  const path = requireString(file, "file");
  const openDatabase = options.openDatabase ?? ((path, openOptions) => new DatabaseSync(path, openOptions));
  const database = openDatabase(path, { readOnly: true });
  let closed = false;

  const guarded = (operation) => {
    if (closed) throw corpusError("study_corpus_closed", path);
    return operation();
  };

  return Object.freeze({
    mode: "read_only",
    file: path,
    readerVersion: SELF_RAG_STUDY_CORPUS_READER_VERSION,
    identity() {
      return guarded(() => {
        const games = database.prepare("SELECT count(*) AS n FROM games").get().n;
        const variants = database.prepare("SELECT count(*) AS n FROM variants").get().n;
        const observations = database.prepare("SELECT count(*) AS n FROM observations").get().n;
        return { file: path, sizeBytes: statSync(path).size, gameCount: games, variantCount: variants, observationCount: observations };
      });
    },
    /** Deterministic order so prepare and verify enumerate the same sequence. */
    listGames({ limit = 1000, offset = 0 } = {}) {
      return guarded(() => {
        const rows = database.prepare(
          "SELECT games.id AS gameId, variants.hash AS sourceHash, variants.format AS format " +
          "FROM variants JOIN games ON games.id = variants.game_id " +
          "ORDER BY variants.hash ASC, games.id ASC LIMIT ? OFFSET ?",
        ).all(normalizeLimit(limit, 1000), normalizeOffset(offset));
        return rows.map((row) => ({ gameId: row.gameId, sourceHash: row.sourceHash, format: row.format }));
      });
    },
    readRecord({ gameId, sourceHash }) {
      return guarded(() => {
        const id = requireString(gameId, "gameId");
        const hash = requireString(sourceHash, "sourceHash");
        const row = database.prepare(
          "SELECT game_id AS gameId, hash AS sourceHash, format, data FROM variants WHERE game_id = ? AND hash = ?",
        ).get(id, hash);
        if (row === undefined) throw corpusError("study_corpus_record_missing", `${id}/${hash}`);
        return { gameId: row.gameId, sourceHash: row.sourceHash, format: row.format, raw: Buffer.from(zstdDecompressSync(row.data)) };
      });
    },
    close() {
      if (closed) return;
      closed = true;
      database.close();
    },
  });
}
