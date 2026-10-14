import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { StructuredAnalysisPackageSchema } from "@riichi-coach/contracts";
import { generateReviewReport, projectContextGraph, selectReviewDecisions, prepareDiscardLossInput, prepareValidatedStructuredAnalysisPackage, validateStructuredAnalysisPackage } from "@riichi-coach/reasoning";
import { createReviewSessionRepository } from "../src/review-session-repository.js";
import { createFixedReviewController } from "../src/fixed-review-controller.js";
import * as storage from "../src/package-artifact-storage.js";
import { presentFixedReviewDetailFromContext, presentFixedReviewSnapshotFromContext } from "../src/fixed-review-presenter.js";

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const pkg = StructuredAnalysisPackageSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/coach-package.json", import.meta.url), "utf8")));
const selection = selectReviewDecisions(pkg);
const controller = (repository: ReturnType<typeof createReviewSessionRepository>) => createFixedReviewController({
  repository, readPackage: async () => { throw new Error("unexpected external read"); },
  generateReport: async () => { throw new Error("unexpected provider"); },
});

it("prepares immutable validation results without trusting caller-frozen or deserialized objects", () => {
  const input = structuredClone(pkg);
  const prepared = prepareValidatedStructuredAnalysisPackage(input);
  expect(prepared).toEqual(pkg);
  expect(prepared).not.toBe(input);
  expect(prepareValidatedStructuredAnalysisPackage(prepared)).toBe(prepared);
  expect(() => { prepared.record.recordId = "changed"; }).toThrow();
  input.record.recordId = "changed";
  expect(prepared.record.recordId).toBe(pkg.record.recordId);
  expect(() => prepareValidatedStructuredAnalysisPackage(Object.freeze(input))).toThrow();
  const decoded = JSON.parse(JSON.stringify(prepared)); decoded.record.recordId = "changed";
  expect(() => validateStructuredAnalysisPackage(decoded)).toThrow();
});

it("saves a new package and presentation without immediately decoding the artifact again", () => {
  const root = mkdtempSync(join(tmpdir(), "coach-presentation-")); roots.push(root);
  const repository = createReviewSessionRepository({ root });
  const read = vi.spyOn(storage, "readPackageArtifact").mockImplementation(() => { throw new Error("unexpected readback"); });
  try {
    const state = repository.saveSession(pkg, selection);
    expect(state.analysisPackage).toEqual(pkg);
    expect(repository.openPresentation(pkg.packageId)?.details).toHaveLength(selection.selected.length);
    expect(repository.openByPackageId(pkg.packageId).analysisPackage).toBe(state.analysisPackage);
    expect(read).not.toHaveBeenCalled();
  } finally { repository.close(); read.mockRestore(); }
  const reopened = createReviewSessionRepository({ root });
  try { expect(reopened.openByPackageId(pkg.packageId).analysisPackage).toEqual(pkg); }
  finally { reopened.close(); }
});

it("rolls back failed staged writes and closes staging before a successful retry", () => {
  const root = mkdtempSync(join(tmpdir(), "coach-presentation-")); roots.push(root);
  const repository = createReviewSessionRepository({ root });
  const original = storage.stagePackageArtifact;
  const close = vi.fn();
  const stage = vi.spyOn(storage, "stagePackageArtifact").mockImplementation(value => {
    const staged = original(value);
    return { ...staged, insert(db, ref) { staged.insert(db, ref); throw new Error("test_write_failed"); },
      close() { staged.close(); close(); } };
  });
  try {
    expect(() => repository.saveSession(pkg, selection)).toThrow("test_write_failed");
    expect(close).toHaveBeenCalledTimes(1);
    expect(repository.listSessions()).toEqual([]);
    const db = new DatabaseSync(join(root, "library.sqlite"));
    try {
      expect(db.prepare("SELECT count(*) AS count FROM analysis_packages").get()!.count).toBe(0);
      expect(db.prepare("SELECT count(*) AS count FROM analysis_package_chunks").get()!.count).toBe(0);
    } finally { db.close(); }
    stage.mockRestore();
    expect(repository.saveSession(pkg, selection).analysisPackage).toEqual(pkg);
  } finally { stage.mockRestore(); repository.close(); }
});

it("reopens saved snapshot and every detail after restart without reading any package artifact", async () => {
  const root = mkdtempSync(join(tmpdir(), "coach-presentation-")); roots.push(root);
  let repository = createReviewSessionRepository({ root });
  const state = repository.saveSession(pkg, selection);
  const before = controller(repository);
  const snapshot = await before.openReview(pkg.packageId);
  const details = selection.selected.map(({ decisionId }) => before.getReviewDetail(pkg.packageId, decisionId, null));
  expect(snapshot).toEqual({ ...presentFixedReviewSnapshotFromContext(state.readBack, null), coachUsageHistory: repository.getCoachUsageHistory() });
  expect(details).toEqual(selection.selected.map(({ decisionId }) => presentFixedReviewDetailFromContext(state.readBack, decisionId, null)));
  repository.close();
  repository = createReviewSessionRepository({ root });
  try {
    const read = vi.spyOn(storage, "readPackageArtifact").mockImplementation(() => { throw new Error("must not read original package"); });
    const historyRead = vi.spyOn(storage, "readPackageRecordIdentity").mockImplementation(() => { throw new Error("must not scan other packages"); });
    const after = controller(repository);
    expect(await after.openReview(pkg.packageId)).toEqual(snapshot);
    expect(selection.selected.map(({ decisionId }) => after.getReviewDetail(pkg.packageId, decisionId, null))).toEqual(details);
    expect(after.reviewDiscardLossInput(pkg.packageId, selection.selected[0]!.decisionId)).toEqual(prepareDiscardLossInput(pkg, selection.selected[0]!.decisionId));
    after.leaveReview(pkg.packageId);
    expect(() => after.getReviewDetail(pkg.packageId, selection.selected[0]!.decisionId, null)).toThrow();
    expect(await after.openReview(pkg.packageId)).toEqual(snapshot);
    expect(read).not.toHaveBeenCalled();
    expect(historyRead).not.toHaveBeenCalled();
  } finally { repository.close(); }
});

it.each(["missing", "version", "malformed"])("rebuilds a %s cache once, then trusts it across restarts", async (kind) => {
  const root = mkdtempSync(join(tmpdir(), "coach-presentation-")); roots.push(root);
  let repository = createReviewSessionRepository({ root });
  repository.saveSession(pkg, selection); repository.close();
  const db = new DatabaseSync(join(root, "library.sqlite"));
  if (kind === "missing") db.exec("DELETE FROM review_presentation_cache");
  if (kind === "version") db.exec("UPDATE review_presentation_cache SET version='old'");
  if (kind === "malformed") db.exec("UPDATE review_presentation_cache SET payload='{}'");
  db.close();
  const read = vi.spyOn(storage, "readPackageArtifact");
  repository = createReviewSessionRepository({ root });
  try { await controller(repository).openReview(pkg.packageId); } finally { repository.close(); }
  expect(read).toHaveBeenCalledTimes(1);
  repository = createReviewSessionRepository({ root });
  try { await controller(repository).openReview(pkg.packageId); } finally { repository.close(); }
  expect(read).toHaveBeenCalledTimes(1);
});

it("refreshes cached report state after generation/activation and removes it with the session", async () => {
  const root = mkdtempSync(join(tmpdir(), "coach-presentation-")); roots.push(root);
  const repository = createReviewSessionRepository({ root });
  try {
    repository.saveSession(pkg, selection);
    const report = await generateReviewReport(projectContextGraph(pkg), selection, {
      descriptor: () => ({ providerId: "unconfigured", model: "unconfigured" }),
      complete: async () => ({ errorCode: "provider_unavailable" as const, transportRetries: 0 as const }),
    });
    const view = controller(repository);
    await view.openReview(pkg.packageId);
    repository.saveReport(pkg.packageId, report, "first", "op-first");
    expect(() => view.getReviewDetail(pkg.packageId, selection.selected[0]!.decisionId, null)).toThrow();
    const fresh = await view.openReview(pkg.packageId);
    expect(fresh.activeReportRefId).toBe("first");
    expect(() => view.getReviewDetail(pkg.packageId, selection.selected[0]!.decisionId, null)).toThrow();
    repository.saveReport(pkg.packageId, report, "second", "op-second");
    expect(view.activateReport(pkg.packageId, "first").activeReportRefId).toBe("first");
    expect((await view.openReview(pkg.packageId)).activeReportRefId).toBe("first");
    view.leaveReview(pkg.packageId);
    repository.deleteSession(pkg.packageId, "delete");
    expect(repository.openPresentation(pkg.packageId)).toBeNull();
    const db = new DatabaseSync(join(root, "library.sqlite"));
    expect(db.prepare("SELECT * FROM review_presentation_cache").all()).toEqual([]);
    db.close();
  } finally { repository.close(); }
});

it("loads full evidence on demand when generation starts from a restarted cached view", async () => {
  const root = mkdtempSync(join(tmpdir(), "coach-presentation-")); roots.push(root);
  let repository = createReviewSessionRepository({ root });
  repository.saveSession(pkg, selection); repository.close();
  repository = createReviewSessionRepository({ root });
  const read = vi.spyOn(storage, "readPackageArtifact");
  try {
    const generateReport = vi.fn(async (value, selected) => generateReviewReport(projectContextGraph(value), selected, {
      descriptor: () => ({ providerId: "unconfigured", model: "unconfigured" }),
      complete: async () => ({ errorCode: "provider_unavailable" as const, transportRetries: 0 as const }),
    }));
    const view = createFixedReviewController({ repository, readPackage: async () => { throw new Error("unexpected"); }, generateReport });
    await view.openReview(pkg.packageId);
    expect(read).not.toHaveBeenCalled();
    const result = await view.generateReview(pkg.packageId, "generation-after-restart");
    expect(result.status).toBe("ready");
    expect(read).toHaveBeenCalledTimes(1);
    expect(generateReport).toHaveBeenCalledTimes(1);
    view.leaveReview(pkg.packageId);
    expect((await view.openReview(pkg.packageId)).activeReportRefId).not.toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    repository.close();
    repository = createReviewSessionRepository({ root });
    read.mockClear();
    const historyRead = vi.spyOn(storage, "readPackageRecordIdentity").mockImplementation(() => { throw new Error("unexpected full history read"); });
    expect((await controller(repository).openReview(pkg.packageId)).coachUsageHistory?.requestCount).toBe(1);
    expect(read).not.toHaveBeenCalled();
    expect(historyRead).not.toHaveBeenCalled();
  } finally { repository.close(); }
});
