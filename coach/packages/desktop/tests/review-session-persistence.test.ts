import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StructuredAnalysisPackageSchema } from "@riichi-coach/contracts";
import { generateReviewReport, projectContextGraph, selectReviewDecisions } from "@riichi-coach/reasoning";
import { createReviewSessionRepository } from "../src/review-session-repository.js";
import { createPrivilegedRawCache, rawCacheKey, type RawCacheIdentity } from "../src/privileged-raw-cache.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const root = () => { const value = mkdtempSync(join(tmpdir(), "riichi-review-")); roots.push(value); return value; };
const pkg = StructuredAnalysisPackageSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/coach-package.json", import.meta.url), "utf8")));
const selection = selectReviewDecisions(pkg);
const provider = {
  descriptor: () => ({ providerId: "unconfigured", model: "unconfigured" }),
  complete: async () => ({ errorCode: "provider_unavailable" as const, transportRetries: 0 as const }),
};
const report = await generateReviewReport(projectContextGraph(pkg), selection, provider, "2026-09-23T00:00:00.000Z");
const graph = projectContextGraph(pkg);
const selectedDecisionId = selection.selected[0]!.decisionId;
const decisionNodes = graph.nodes.filter((node) => (node.payload as { decisionId?: string }).decisionId === selectedDecisionId);
const candidate = decisionNodes.find((node) => node.nodeKind === "CandidateAction")!;
const premise = decisionNodes.find((node) => node.nodeKind === "KnownGameFact")!;
const difference = decisionNodes.find((node) => node.nodeKind === "FactorDifference" && typeof (node.payload as { leftValue?: { value?: unknown } }).leftValue?.value === "number")!;
const completeReport = await generateReviewReport(graph, selection, {
  descriptor: () => ({ providerId: "stub", model: "stub" }),
  complete: async () => ({
    content: JSON.stringify({ decisions: [{
      decisionId: selectedDecisionId,
      judgment: { localId: "judgment-0", recommendation: (candidate.payload as { actionRef: string }).actionRef, confidence: "medium", premiseRefs: [premise.nodeId] },
      explanations: [{ text: `牌效值 {diff:${(difference.payload as { differenceId: string }).differenceId}.leftValue.value}`, claims: [{ kind: "factor_difference", evidenceRef: difference.nodeId }], judgmentLocalRef: "judgment-0" }],
    }] }),
    transportRetries: 0 as const,
  }),
}, "2026-09-23T00:00:00.000Z");

describe("ReviewSession SQLite persistence", () => {
  it("reopens the same active immutable report offline without selector or provider calls", () => {
    const dir = root();
    const first = createReviewSessionRepository({ root: dir, createId: () => "session-a", now: () => "2026-09-23T00:00:00.000Z" });
    first.saveSession(pkg, selection);
    const saved = first.saveReport(pkg.packageId, completeReport, "report-ref-a", "operation-a");
    expect(saved.activeReportRefId).toBe("report-ref-a");
    first.close();

    const network = vi.fn();
    const reopened = createReviewSessionRepository({ root: dir });
    const state = reopened.openByPackageId(pkg.packageId);
    reopened.close();
    expect(state.activeReportRefId).toBe("report-ref-a");
    expect(state.selection).toEqual(selection);
    expect(state.activeReport).toEqual(completeReport);
    expect(state.activeReport?.generationStatus).toBe("complete");
    expect(state.activeReport?.decisionEntries[0]).toMatchObject({ explanationStatus: "ready" });
    expect(state.activeReport?.reasoningOverlay.nodes.map((node) => node.nodeKind)).toEqual(
      expect.arrayContaining(["CoachJudgment", "Explanation"]),
    );
    expect(network).not.toHaveBeenCalled();
  });

  it("keeps duplicate reportId instances separately addressable and switches by exact ref", () => {
    const repository = createReviewSessionRepository({ root: root(), createId: () => "session-a" });
    repository.saveSession(pkg, selection);
    repository.saveReport(pkg.packageId, report, "report-ref-a", "operation-a");
    expect(repository.saveReport(pkg.packageId, report, "report-ref-a", "operation-a").activeReportRefId).toBe("report-ref-a");
    expect(() => repository.saveReport(pkg.packageId, report, "different-ref", "operation-a")).toThrow("operation_identity_conflict");
    const duplicate = { ...report, generatedAt: "2026-09-23T00:01:00.000Z" };
    repository.saveReport(pkg.packageId, duplicate, "report-ref-b", "operation-b");
    expect(repository.inspect(pkg.packageId).reportRefs.map((ref) => [ref.reportRefId, ref.reportId])).toEqual([
      ["report-ref-a", report.reportId], ["report-ref-b", report.reportId],
    ]);
    expect(repository.activateExisting(pkg.packageId, "report-ref-a", "activate-a").activeReportRefId).toBe("report-ref-a");
    expect(repository.activateExisting(pkg.packageId, "report-ref-b", "activate-b").activeReportRefId).toBe("report-ref-b");
    expect(repository.activateExisting(pkg.packageId, "report-ref-a", "activate-a2").activeReportRefId).toBe("report-ref-a");
    repository.close();
  });

  it("recovers a committed report_saved intent locally and idempotently after restart", () => {
    const dir = root();
    const first = createReviewSessionRepository({
      root: dir, createId: () => "session-a",
      beforeActivationReadBack: () => { throw new Error("simulated_crash"); },
    });
    first.saveSession(pkg, selection);
    expect(() => first.saveReport(pkg.packageId, report, "report-ref-a", "operation-a")).toThrow("simulated_crash");
    expect(first.inspect(pkg.packageId)).toMatchObject({ activeReportRefId: null, intents: [{ operation_id: "operation-a" }], receipts: [{ state: "report_saved" }] });
    first.close();

    const second = createReviewSessionRepository({ root: dir });
    expect(second.openByPackageId(pkg.packageId).activeReportRefId).toBe("report-ref-a");
    expect(second.inspect(pkg.packageId)).toMatchObject({ intents: [], receipts: [{ state: "activated" }] });
    second.close();
  });

  it("fails closed for newer storage versions without overwriting the database", () => {
    const dir = root();
    const databasePath = join(dir, "library.sqlite");
    const db = new DatabaseSync(databasePath);
    db.exec("PRAGMA user_version=2");
    db.close();
    expect(() => createReviewSessionRepository({ root: dir })).toThrow("library_newer_version");
    const verify = new DatabaseSync(databasePath);
    expect((verify.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(2);
    verify.close();
  });

  it("rejects the same package identity with different canonical artifact bytes", () => {
    const repository = createReviewSessionRepository({ root: root(), createId: () => "session-a" });
    repository.saveSession(pkg, selection);
    expect(() => repository.saveSession({ ...pkg, createdAt: "2026-09-23T01:00:00.000Z" }, selection)).toThrow("identity_conflict");
    repository.close();
  });

  it("deletes session refs and artifacts atomically without scanning the raw cache", () => {
    const dir = root();
    const repository = createReviewSessionRepository({ root: dir, createId: () => "session-a" });
    repository.saveSession(pkg, selection);
    repository.saveReport(pkg.packageId, report, "report-ref-a", "operation-a");
    const cache = createPrivilegedRawCache({ root: dir });
    cache.put({
      sourceKind: "mortal", stableRecordIdentityHash: "record-hash", perspective: "self:0",
      sourceVersion: "source/v1", modelVersion: "model/v1", schemaVersion: "schema/v1",
      parserVersion: "parser/v1", validationVersion: "validator/v1", requestParameters: {},
    }, Buffer.from("independent cache material"));
    expect(repository.deleteSession(pkg.packageId, "delete-a")).toEqual({ status: "deleted" });
    expect(repository.deleteSession(pkg.packageId, "delete-a")).toEqual({ status: "deleted" });
    expect(repository.tryOpenByPackageId(pkg.packageId)).toBeNull();
    expect(repository.listSessions()).toEqual([]);
    expect(cache.inspect()).toEqual({ entries: 1, materials: 1 });
    cache.close();
    repository.close();
  });
});

describe("main-only raw source cache", () => {
  const identity: RawCacheIdentity = {
    sourceKind: "mortal", stableRecordIdentityHash: "record-hash", perspective: "self:0",
    sourceVersion: "source/v1", modelVersion: "model/v1", schemaVersion: "schema/v1",
    parserVersion: "parser/v1", validationVersion: "validator/v1", requestParameters: { mode: "review" },
  };

  it("validates hits, deduplicates bytes, never auto-evicts, and explicitly clears", () => {
    const dir = root();
    const repository = createReviewSessionRepository({ root: dir }); repository.close();
    let cache = createPrivilegedRawCache({ root: dir });
    const payload = Buffer.from("private raw fixture");
    expect(cache.put(identity, payload)).toBe(rawCacheKey(identity));
    expect(cache.put({ ...identity, perspective: "self:1" }, payload)).not.toBe(rawCacheKey(identity));
    expect(cache.inspect()).toEqual({ entries: 2, materials: 1 });
    expect(Buffer.from(cache.get(identity)!)).toEqual(payload);
    cache.close();
    cache = createPrivilegedRawCache({ root: dir });
    expect(cache.inspect()).toEqual({ entries: 2, materials: 1 });
    expect(cache.clear()).toEqual({ clearedEntries: 2, pendingMaterials: 0 });
    expect(cache.get(identity)).toBeNull();
    cache.close();
  });

  it("treats tampered material as a miss and never returns its bytes", () => {
    const dir = root();
    const repository = createReviewSessionRepository({ root: dir }); repository.close();
    const cache = createPrivilegedRawCache({ root: dir });
    cache.put(identity, Buffer.from("original"));
    const db = new DatabaseSync(join(dir, "library.sqlite"));
    const row = db.prepare("SELECT relative_path FROM source_materials").get() as { relative_path: string };
    db.close();
    writeFileSync(join(dir, "source-cache", row.relative_path), "tampered");
    expect(cache.get(identity)).toBeNull();
    cache.close();
  });

  it("recovers a registered but unreferenced material after restart", () => {
    const dir = root();
    const repository = createReviewSessionRepository({ root: dir }); repository.close();
    let cache = createPrivilegedRawCache({ root: dir });
    cache.put(identity, Buffer.from("orphan after interrupted clear"));
    cache.close();
    const db = new DatabaseSync(join(dir, "library.sqlite"));
    db.exec("DELETE FROM raw_cache_entries");
    db.close();
    cache = createPrivilegedRawCache({ root: dir });
    expect(cache.inspect()).toEqual({ entries: 0, materials: 0 });
    cache.close();
  });
});
