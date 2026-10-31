import { mkdtempSync, readFileSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { zstdCompressSync } from "node:zlib";

/** Temporary read-only corpus fixture; deleted by `cleanup`. */
export function createCorpusFixture(records) {
  const directory = mkdtempSync(join(tmpdir(), "selfrag-study-corpus-"));
  const file = join(directory, "corpus.sqlite");
  const database = new DatabaseSync(file);
  database.exec(`
    CREATE TABLE games(id TEXT PRIMARY KEY, first_seen TEXT NOT NULL);
    CREATE TABLE variants(hash TEXT PRIMARY KEY, game_id TEXT NOT NULL, format TEXT NOT NULL, data BLOB NOT NULL);
    CREATE TABLE observations(source TEXT NOT NULL, locator TEXT NOT NULL, hash TEXT NOT NULL, metadata TEXT NOT NULL,
      PRIMARY KEY(source, locator, hash));
  `);
  for (const record of records) {
    database.prepare("INSERT INTO games VALUES (?, ?)").run(record.gameId, "2026-10-22T00:00:00.000Z");
    database.prepare("INSERT INTO variants VALUES (?, ?, ?, ?)").run(
      record.sourceHash, record.gameId, record.format ?? "mjai",
      zstdCompressSync(Buffer.from(record.raw, "utf8")),
    );
    database.prepare("INSERT INTO observations VALUES (?, ?, ?, ?)").run(
      "fixture", `${record.gameId}.mjai`, record.sourceHash, "{}",
    );
  }
  database.close();
  return {
    directory,
    file,
    sizeBytes: statSync(file).size,
    fileBytes: readFileSync(file),
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function sidecarExists(file, suffix) {
  return existsSync(`${file}${suffix}`);
}
