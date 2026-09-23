const { app } = require("electron");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

app.whenReady().then(async () => {
  const { createReviewSessionRepository } = await import("../dist/review-session-repository.js");
  const root = mkdtempSync(join(tmpdir(), "riichi-electron-sqlite-"));
  let exitCode = 1;
  try {
    const repository = createReviewSessionRepository({ root });
    repository.close();
    const db = new DatabaseSync(join(root, "library.sqlite"));
    const values = {
      foreignKeys: Number(db.prepare("PRAGMA foreign_keys").get().foreign_keys),
      journalMode: String(db.prepare("PRAGMA journal_mode").get().journal_mode),
      synchronous: Number(db.prepare("PRAGMA synchronous").get().synchronous),
      userVersion: Number(db.prepare("PRAGMA user_version").get().user_version),
    };
    db.close();
    if (values.foreignKeys !== 1 || values.journalMode !== "wal" || values.synchronous !== 2 || values.userVersion !== 1) {
      throw new Error(`unexpected sqlite pragmas: ${JSON.stringify(values)}`);
    }
    console.log(`[electron-persistence] PASS electron=${process.versions.electron} node=${process.versions.node}`);
    exitCode = 0;
  } catch (error) {
    console.error("[electron-persistence] FAIL", error instanceof Error ? error.message : String(error));
  } finally {
    rmSync(root, { recursive: true, force: true });
    app.exit(exitCode);
  }
}).catch((error) => {
  console.error("[electron-persistence] FAIL", error instanceof Error ? error.message : String(error));
  app.exit(1);
});
