const { app } = require("electron");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

app.whenReady().then(async () => {
  const { createReviewSessionRepository } = await import("../dist/review-session-repository.js");
  const contracts = await import("@riichi-coach/contracts");
  const reasoning = await import("@riichi-coach/reasoning");
  const root = mkdtempSync(join(tmpdir(), "riichi-electron-sqlite-"));
  let exitCode = 1;
  try {
    const fixture = contracts.StructuredAnalysisPackageSchema.parse(JSON.parse(
      readFileSync(join(__dirname, "fixtures", "coach-package.json"), "utf8"),
    ));
    const selection = reasoning.selectReviewDecisions(fixture);
    const report = await reasoning.generateReviewReport(
      reasoning.projectContextGraph(fixture), selection,
      {
        descriptor: () => ({ providerId: "unconfigured", model: "unconfigured" }),
        complete: async () => ({ errorCode: "provider_unavailable", transportRetries: 0 }),
      },
      "2026-09-23T00:00:00.000Z",
    );
    const repository = createReviewSessionRepository({ root, createId: () => "electron-session" });
    repository.saveSession(fixture, selection);
    repository.saveReport(fixture.packageId, report, "electron-report-ref", "electron-operation");
    repository.close();
    const reopened = createReviewSessionRepository({ root });
    const state = reopened.openByPackageId(fixture.packageId);
    if (state.activeReportRefId !== "electron-report-ref" || state.activeReport?.reportId !== report.reportId) {
      throw new Error("electron restart read-back mismatch");
    }
    reopened.close();
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
