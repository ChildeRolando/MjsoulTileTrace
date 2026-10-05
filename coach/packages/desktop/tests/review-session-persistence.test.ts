import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StructuredAnalysisPackageSchema } from "@riichi-coach/contracts";
import { generateReviewReport, projectContextGraph, selectReviewDecisions } from "@riichi-coach/reasoning";
import {
  createReviewSessionRepository,
  persistValidatedReviewSession,
} from "../src/review-session-repository.js";
import { createPrivilegedRawCache, rawCacheKey, type RawCacheIdentity } from "../src/privileged-raw-cache.js";
import { createFixedReviewController } from "../src/fixed-review-controller.js";
import { presentFixedReviewSnapshot } from "../src/fixed-review-presenter.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const root = () => { const value = mkdtempSync(join(tmpdir(), "riichi-review-")); roots.push(value); return value; };
const pkg = StructuredAnalysisPackageSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/coach-package.json", import.meta.url), "utf8")));
const selection = selectReviewDecisions(pkg);
/** Manufacture the previous on-disk representation, including its exact bytes. */
function restoreV2Storage(db: DatabaseSync): Buffer {
  const payload = Buffer.from(JSON.stringify(pkg));
  db.exec("DROP TRIGGER immutable_package");
  db.prepare("UPDATE analysis_packages SET payload=?,content_hash=? WHERE package_id=?")
    .run(payload,createHash("sha256").update(payload).digest("hex"),pkg.packageId);
  db.exec(`CREATE TRIGGER immutable_package BEFORE UPDATE ON analysis_packages BEGIN SELECT RAISE(ABORT,'immutable_artifact'); END;
    DROP TABLE analysis_package_chunks;
    DROP TABLE session_decision_reports;
    ALTER TABLE review_sessions DROP COLUMN decision_report_map_hash;
    DROP TABLE library_meta;
    CREATE TABLE library_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1),format_version INTEGER CHECK(format_version=2),created_at TEXT);
    INSERT INTO library_meta VALUES(1,2,'original'); PRAGMA user_version=2;`);
  return payload;
}
function restoreV3Storage(db: DatabaseSync): void {
  const createdAt = String(db.prepare("SELECT created_at FROM library_meta WHERE singleton=1").get()!.created_at);
  db.exec(`DROP TABLE session_decision_reports;
    ALTER TABLE review_sessions DROP COLUMN decision_report_map_hash;
    DROP TABLE library_meta;
    CREATE TABLE library_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1), format_version INTEGER NOT NULL CHECK(format_version=3), created_at TEXT NOT NULL);`);
  db.prepare("INSERT INTO library_meta VALUES(1,3,?)").run(createdAt);
  db.exec("PRAGMA user_version=3");
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}
const fixtureHash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
function withFactorPipeline(source: typeof pkg, factorPipeline: string): typeof pkg {
  const componentVersions = { ...source.componentVersions, factorPipeline };
  const decisions = source.decisions.map((decision) => decision.outcome === "analysis_ready"
    ? { ...decision, modelEvaluation: { ...decision.modelEvaluation, detailPolicy: { ...decision.modelEvaluation.detailPolicy, frozenAt: null } } }
    : decision);
  const semanticContent = {
    analysisKey: source.analysisKey,
    record: source.record,
    componentVersions,
    analysisPolicy: source.analysisPolicy,
    decisions,
    evidenceRegistry: source.evidenceRegistry,
    ...(source.legalActionEvidence === undefined ? {} : { legalActionEvidence: source.legalActionEvidence }),
  };
  return StructuredAnalysisPackageSchema.parse({
    ...source,
    componentVersions,
    packageId: `package:sha256:${fixtureHash({
      analysisKey: source.analysisKey,
      componentVersions,
      analysisPolicy: source.analysisPolicy,
    })}`,
    semanticContentHash: `sha256:${fixtureHash(semanticContent)}`,
  });
}
function addSecondReadyDecision(source: typeof pkg): typeof pkg {
  const result = structuredClone(source);
  const second = structuredClone(result.decisions[0]!);
  if (second.outcome !== "analysis_ready") throw new Error("fixture_decision_not_ready");
  const triggerEventRef = second.normalizedDecisionContext.triggerEventRef;
  second.decisionId = ["decision", result.record.recordId, `self${result.record.selfActor}`, "self", "post_riichi_discard", triggerEventRef].join(":");
  second.normalizedDecisionContext = { ...second.normalizedDecisionContext, decisionWindowKind: "post_riichi_discard" };
  second.knownGameFacts = { ...second.knownGameFacts, decisionWindow: { ...second.knownGameFacts.decisionWindow, kind: "post_riichi_discard" } };
  second.comparisonSet = { ...second.comparisonSet, decisionWindow: { ...second.comparisonSet.decisionWindow, kind: "post_riichi_discard" } };
  result.decisions.push(second);
  const decisions = result.decisions.map((decision) => decision.outcome === "analysis_ready"
    ? { ...decision, modelEvaluation: { ...decision.modelEvaluation, detailPolicy: { ...decision.modelEvaluation.detailPolicy, frozenAt: null } } }
    : decision);
  result.semanticContentHash = `sha256:${fixtureHash({
    analysisKey: result.analysisKey, record: result.record, componentVersions: result.componentVersions,
    analysisPolicy: result.analysisPolicy, decisions, evidenceRegistry: result.evidenceRegistry,
  })}`;
  return StructuredAnalysisPackageSchema.parse(result);
}
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
  descriptor: () => ({ providerId: "codex-cli", model: "gpt-6-luna", reasoningEffort: "max" as const, samplingMode: "provider_default" as const }),
  complete: async () => ({
    content: JSON.stringify({ decisions: [{
      decisionId: selectedDecisionId,
      judgment: { localId: "judgment-0", recommendation: (candidate.payload as { actionRef: string }).actionRef, confidence: "medium", premiseRefs: [premise.nodeId] },
      explanations: [{ text: `牌效值 {diff:${(difference.payload as { differenceId: string }).differenceId}.leftValue.value}`, claims: [{ kind: "factor_difference", evidenceRef: difference.nodeId }], judgmentLocalRef: "judgment-0" }],
    }] }),
    transportRetries: 0 as const,
    usage: { inputTokens: 1200, cachedInputTokens: 300, outputTokens: 80, totalTokens: 1280 },
  }),
}, "2026-09-23T00:00:00.000Z");

describe("ReviewSession SQLite persistence", () => {
  it("persists cumulative usage, deduplicates explanations and does not charge reopens or operation replay", async () => {
    const dir = root();
    let repository = createReviewSessionRepository({ root: dir });
    try {
      repository.saveSession(pkg, selection);
      expect(repository.getCoachUsageHistory()).toMatchObject({ requestCount: 0, readyDecisionCount: 0, explainedRecordCount: 0 });
      repository.saveReport(pkg.packageId, completeReport, "history-1", "history-op-1");
      repository.saveReport(pkg.packageId, completeReport, "history-1", "history-op-1");
      repository.saveReport(pkg.packageId, completeReport, "history-2", "history-op-2");
      const counts = { known: 2560, unknownRequests: 0 };
      const expected = repository.getCoachUsageHistory();
      expect(expected).toMatchObject({ requestCount: 2, readyDecisionCount: 1, explainedRecordCount: 1,
        totalTokens: counts, inputTokens: { known: 2400, unknownRequests: 0 }, cachedInputTokens: { known: 600, unknownRequests: 0 } });
      repository.openByPackageId(pkg.packageId);
      expect(repository.getCoachUsageHistory()).toEqual(expected);
      repository.close();
      repository = createReviewSessionRepository({ root: dir });
      expect(repository.getCoachUsageHistory()).toEqual(expected);
      const controller = createFixedReviewController({ readPackage: async () => pkg, generateReport: async () => completeReport, repository });
      expect((await controller.openReview(pkg.packageId)).coachUsageHistory).toEqual(expected);
      expect(repository.getCoachUsageHistory()).toEqual(expected);
    } finally { repository.close(); }
  });

  it("keeps the stored v1 artifact open while saving same-record v2 under a distinct package identity", () => {
    expect(pkg.componentVersions.factorPipeline).toBe("factor-pipeline/v1");
    const refreshed = withFactorPipeline(pkg, "factor-pipeline/v2");
    expect(refreshed.analysisKey).toBe(pkg.analysisKey);
    expect(refreshed.record).toEqual(pkg.record);
    expect(refreshed.packageId).not.toBe(pkg.packageId);

    const repository = createReviewSessionRepository({ root: root() });
    try {
      repository.saveSession(pkg, selection);
      expect(repository.openByPackageId(pkg.packageId).analysisPackage).toEqual(pkg);

      const savedV2 = repository.saveSession(refreshed, selectReviewDecisions(refreshed));
      expect(savedV2.analysisPackage.packageId).toBe(refreshed.packageId);
      expect(repository.openByPackageId(refreshed.packageId).analysisPackage).toEqual(refreshed);
      expect(repository.openByPackageId(pkg.packageId).analysisPackage).toEqual(pkg);
      expect(repository.listSessions().map((session) => session.packageId)).toEqual(
        expect.arrayContaining([pkg.packageId, refreshed.packageId]),
      );
    } finally { repository.close(); }
  });

  it.each([false, true])("compacts legacy chunks losslessly and atomically, injected failure=%s", fail => {
    const dir = root();
    let repository = createReviewSessionRepository({ root: dir });
    repository.saveSession(pkg, selection);
    repository.saveReport(pkg.packageId, completeReport, "compact-report", "compact-op");
    repository.close();
    const db = new DatabaseSync(join(dir, "library.sqlite"));
    const original = db.prepare("SELECT * FROM analysis_packages").get()!;
    const reports = db.prepare("SELECT * FROM review_reports").all();
    const mappings = db.prepare("SELECT * FROM session_decision_reports").all();
    const bytes = Buffer.from(canonical(pkg));
    const header = Buffer.alloc(24);
    header.write("RCPKG01\0");
    header.writeBigUInt64LE(BigInt(Math.ceil(bytes.length / 65536)), 8);
    header.writeBigUInt64LE(BigInt(bytes.length), 16);
    db.exec("DROP TRIGGER immutable_package; DELETE FROM analysis_package_chunks");
    db.prepare("UPDATE analysis_packages SET payload=?").run(header);
    const insert = db.prepare("INSERT INTO analysis_package_chunks VALUES(?,?,?)");
    for (let offset = 0; offset < bytes.length; offset += 65536) {
      insert.run(original.package_ref_id!, offset / 65536, bytes.subarray(offset, offset + 65536));
    }
    db.exec("CREATE TRIGGER immutable_package BEFORE UPDATE ON analysis_packages BEGIN SELECT RAISE(ABORT,'immutable_artifact'); END");
    if (fail) db.exec("CREATE TRIGGER fail_compact BEFORE INSERT ON analysis_package_chunks BEGIN SELECT RAISE(ABORT,'injected_compaction_failure'); END");
    repository = createReviewSessionRepository({ root: dir });
    try {
      if (fail) {
        expect(() => repository.openByPackageId(pkg.packageId)).toThrow("injected_compaction_failure");
        expect(Buffer.from(db.prepare("SELECT payload FROM analysis_packages").get()!.payload as Uint8Array)).toEqual(header);
        expect(Buffer.concat(db.prepare("SELECT payload FROM analysis_package_chunks ORDER BY ordinal").all().map(row => Buffer.from(row.payload as Uint8Array)))).toEqual(bytes);
        expect(() => db.exec("UPDATE analysis_packages SET content_hash='wrong'")).toThrow("immutable_artifact");
        db.exec("DROP TRIGGER fail_compact");
      }
      const reopened = repository.openByPackageId(pkg.packageId);
      expect(reopened.analysisPackage).toEqual(pkg);
      expect(reopened.activeReportRefId).toBe("compact-report");
      const compact = db.prepare("SELECT * FROM analysis_packages").get()!;
      expect(Buffer.from(compact.payload as Uint8Array).subarray(0, 8).toString()).toBe("RCPKG02\0");
      expect(compact.content_hash).toBe(original.content_hash);
      expect(compact.package_id).toBe(original.package_id);
      expect(db.prepare("SELECT * FROM review_reports").all()).toEqual(reports);
      expect(db.prepare("SELECT * FROM session_decision_reports").all()).toEqual(mappings);
      expect(repository.reclaimUnusedStorage()).toBe(true);
      expect(repository.reclaimUnusedStorage()).toBe(false);
    } finally { repository.close(); db.close(); }
    repository = createReviewSessionRepository({ root: dir });
    try { expect(repository.openByPackageId(pkg.packageId).analysisPackage).toEqual(pkg); }
    finally { repository.close(); }
  });

  it("reuses only the owned immutable package and graph while validating fresh report mappings", () => {
    const repository = createReviewSessionRepository({root: root()});
    try {
      const first = repository.saveSession(pkg, selection);
      const reopened = repository.openByPackageId(pkg.packageId);
      expect(reopened.analysisPackage).toBe(first.analysisPackage);
      expect(reopened.readBack.baseGraph).toBe(first.readBack.baseGraph);
      expect(Object.isFrozen(first.analysisPackage.decisions[0])).toBe(true);
      expect(Object.isFrozen(first.readBack.baseGraph.nodes)).toBe(true);
      const generated = repository.saveReport(pkg.packageId, completeReport, "cache-report", "cache-op");
      expect(generated.analysisPackage).toBe(first.analysisPackage);
      expect(generated.readBack.baseGraph).toBe(first.readBack.baseGraph);
      expect(generated.activeReportRefId).toBe("cache-report");
      expect(generated.decisionReportRefs).toEqual(selection.selected.map(row => ({decisionId: row.decisionId, reportRefId: "cache-report"})));
    } finally { repository.close(); }
  });

  it("invalidates owned package reuse after an external write and rejects subsequent damaged bytes", () => {
    const dir = root();
    const repository = createReviewSessionRepository({root: dir});
    const external = new DatabaseSync(join(dir, "library.sqlite"));
    try {
      const first = repository.saveSession(pkg, selection);
      external.prepare("UPDATE review_sessions SET updated_at=?").run("2026-10-05T00:00:00.000Z");
      const reread = repository.openByPackageId(pkg.packageId);
      expect(reread.analysisPackage).not.toBe(first.analysisPackage);
      expect(reread.analysisPackage).toEqual(first.analysisPackage);
      external.exec("DROP TRIGGER immutable_package_chunk");
      external.exec("UPDATE analysis_package_chunks SET payload=zeroblob(length(payload)) WHERE ordinal=0");
      expect(() => repository.openByPackageId(pkg.packageId)).toThrow();
    } finally { external.close(); repository.close(); }
  });

  it.each([false,true])("migrates v2 inline artifacts without rewriting bytes, rollback=%s", fail => {
    const dir=root();
    const repository=createReviewSessionRepository({root:dir});
    repository.saveSession(pkg,selection);
    repository.close();
    const db=new DatabaseSync(join(dir,"library.sqlite"));
    const legacyBytes=restoreV2Storage(db);
    if(fail) db.exec("CREATE TABLE library_meta_v3(sentinel TEXT); INSERT INTO library_meta_v3 VALUES('preserve')");
    db.close();
    if(fail) expect(()=>createReviewSessionRepository({root:dir})).toThrow();
    else {
      const reopened=createReviewSessionRepository({root:dir});
      try {
        expect(reopened.openByPackageId(pkg.packageId).analysisPackage).toEqual(pkg);
        expect(reopened.saveSession(pkg,selection).analysisPackage).toEqual(pkg);
        expect(reopened.saveSession({...pkg,createdAt:"2026-09-29T00:00:00.000Z"},selection).analysisPackage).toEqual(pkg);
      } finally { reopened.close(); }
    }
    const verify=new DatabaseSync(join(dir,"library.sqlite"));
    try {
      expect(Buffer.from(verify.prepare("SELECT payload FROM analysis_packages").get()!.payload as Uint8Array)).toEqual(legacyBytes);
      expect(verify.prepare("PRAGMA user_version").get()?.user_version).toBe(fail?2:4);
      if(fail) {
        expect(verify.prepare("SELECT sentinel FROM library_meta_v3").get()?.sentinel).toBe("preserve");
        expect(verify.prepare("SELECT name FROM sqlite_master WHERE name='analysis_package_chunks'").get()).toBeUndefined();
      }
    } finally { verify.close(); }
  });

  it("commits chunks with the session and deletes them only with their owning package", () => {
    const dir=root();
    const repository=createReviewSessionRepository({root:dir});
    const db=new DatabaseSync(join(dir,"library.sqlite"));
    try {
      db.exec("CREATE TRIGGER fail_chunk BEFORE INSERT ON analysis_package_chunks BEGIN SELECT RAISE(ABORT,'injected_write_failure'); END");
      expect(()=>repository.saveSession(pkg,selection)).toThrow("injected_write_failure");
      expect(repository.listSessions()).toEqual([]);
      expect(db.prepare("SELECT COUNT(*) AS n FROM analysis_packages").get()?.n).toBe(0);
      db.exec("DROP TRIGGER fail_chunk");
      repository.saveSession(pkg,selection);
      expect(db.prepare("SELECT COUNT(*) AS n FROM analysis_package_chunks").get()!.n).toBeGreaterThan(0);
      repository.deleteSession(pkg.packageId,"delete-chunked");
      expect(db.prepare("SELECT COUNT(*) AS n FROM analysis_package_chunks").get()?.n).toBe(0);
    } finally { db.close(); repository.close(); }
  });

  it("saves a complete package without materializing one whole-package JSON string", () => {
    const repository = createReviewSessionRepository({ root: root() });
    const stringify = JSON.stringify;
    const guard = vi.spyOn(JSON, "stringify").mockImplementation(((value: unknown, ...args: unknown[]) => {
      if (value !== null && typeof value === "object" && "packageId" in value && "decisions" in value) {
        throw new RangeError("whole_package_string_limit");
      }
      return Reflect.apply(stringify, JSON, [value, ...args]);
    }) as typeof JSON.stringify);
    try {
      expect(repository.saveSession(pkg, selection).analysisPackage).toEqual(pkg);
      expect(repository.openByPackageId(pkg.packageId).analysisPackage).toEqual(pkg);
    } finally { guard.mockRestore(); repository.close(); }
  });

  it("owns immutable read-back contexts and revalidates disk on every reopen", () => {
    const dir = root();
    const repository = createReviewSessionRepository({ root: dir, createId: () => "session-a" });
    try {
      repository.saveSession(pkg, selection);
      const first = repository.saveReport(pkg.packageId, completeReport, "report-a", "operation-a");
      const second = repository.openByPackageId(pkg.packageId);
      expect(first.readBack).toBeDefined();
      expect(second.readBack).not.toBe(first.readBack);
      expect(second.readBack.analysisPackage).toBe(second.analysisPackage);
      expect(second.readBack.selection).toBe(second.selection);
      expect(second.readBack.report).toBe(second.activeReport);
      expect(() => { second.analysisPackage.record.recordId = "tampered"; }).toThrow();
      expect(() => { second.selection.selected[0]!.rank = 99; }).toThrow();
      expect(() => { second.readBack.currentGraph.nodes[0]!.nodeId = "tampered"; }).toThrow();
      expect(() => { second.activeReport!.reasoningOverlay.nodes[0]!.nodeId = "tampered"; }).toThrow();
      expect(Object.isFrozen(pkg.record)).toBe(false);
      expect(Object.isFrozen(completeReport.reasoningOverlay.nodes)).toBe(false);
      const db = new DatabaseSync(join(dir, "library.sqlite"));
      db.prepare("UPDATE review_sessions SET selection_hash='invalid' WHERE session_id='session-a'").run();
      db.close();
      expect(() => repository.openByPackageId(pkg.packageId)).toThrow("selection_hash_mismatch");
    } finally { repository.close(); }
  });

  it("isolates saved bytes and read-back from later mutations of the save input", () => {
    const repository = createReviewSessionRepository({ root: root() });
    const input = structuredClone(pkg);
    try {
      const saved = repository.saveSession(input, selection);
      expect(saved.analysisPackage).not.toBe(input);
      expect(saved.analysisPackage.decisions[0]).not.toBe(input.decisions[0]);
      input.record.recordId = "caller-mutated";
      input.decisions[0]!.knownGameFacts.actor = 3;
      expect(saved.analysisPackage).toEqual(pkg);
      expect(repository.openByPackageId(pkg.packageId).analysisPackage).toEqual(pkg);
      expect(() => repository.saveSession(input, selection)).toThrow();
      expect(repository.openByPackageId(pkg.packageId).analysisPackage).toEqual(pkg);
    } finally { repository.close(); }
  });

  it("migrates v1 receipts without guessing deleted package bindings and rolls back failed migration", () => {
    for (const fail of [false, true]) {
      const dir = root();
      const repository = createReviewSessionRepository({ root: dir });
      repository.saveSession(pkg, selection);
      repository.close();
      const db = new DatabaseSync(join(dir, "library.sqlite"));
      restoreV2Storage(db);
      db.exec(`ALTER TABLE operation_receipts DROP COLUMN package_id;
        DROP TABLE library_meta;
        CREATE TABLE library_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1), format_version INTEGER CHECK(format_version=1), created_at TEXT);
        INSERT INTO library_meta VALUES(1,1,'original');
        INSERT INTO operation_receipts VALUES('old-delete','delete','old-session',NULL,'deleted',0,'original');
        PRAGMA user_version=1;`);
      if (fail) db.exec("CREATE TABLE library_meta_v2(sentinel TEXT); INSERT INTO library_meta_v2 VALUES('preserve')");
      db.close();
      if (fail) {
        expect(() => createReviewSessionRepository({ root: dir })).toThrow();
        const verify = new DatabaseSync(join(dir, "library.sqlite"));
        try {
          expect(verify.prepare("PRAGMA user_version").get()?.user_version).toBe(1);
          expect(verify.prepare("PRAGMA table_info(operation_receipts)").all().some((column) => column.name === "package_id")).toBe(false);
          expect(verify.prepare("SELECT sentinel FROM library_meta_v2").get()?.sentinel).toBe("preserve");
        } finally { verify.close(); }
      } else {
        const reopened = createReviewSessionRepository({ root: dir });
        try {
          expect(reopened.openByPackageId(pkg.packageId).analysisPackage).toEqual(pkg);
          expect(() => reopened.deleteSession(pkg.packageId, "old-delete")).toThrow("operation_identity_conflict");
        } finally { reopened.close(); }
      }
    }
  });

  it("migrates a v3 active report to explicit decision mappings without rewriting artifacts", () => {
    const dir = root();
    const repository = createReviewSessionRepository({ root: dir, createId: () => "session-v3" });
    repository.saveSession(pkg, selection);
    repository.saveReport(pkg.packageId, completeReport, "report-v3", "operation-v3");
    repository.close();
    const db = new DatabaseSync(join(dir, "library.sqlite"));
    const reportBytes = Buffer.from(db.prepare("SELECT payload FROM review_reports WHERE report_ref_id='report-v3'").get()!.payload as Uint8Array);
    restoreV3Storage(db);
    db.close();

    const migrated = createReviewSessionRepository({ root: dir });
    try {
      const state = migrated.openByPackageId(pkg.packageId);
      expect(state.activeReportRefId).toBe("report-v3");
      expect(state.decisionReportRefs).toEqual(selection.selected.map((item) => ({ decisionId: item.decisionId, reportRefId: "report-v3" })));
      expect(state.readBack.reports.map((item) => item.report)).toEqual([completeReport]);
      const verify = new DatabaseSync(join(dir, "library.sqlite"));
      try {
        expect(Buffer.from(verify.prepare("SELECT payload FROM review_reports WHERE report_ref_id='report-v3'").get()!.payload as Uint8Array)).toEqual(reportBytes);
        expect(verify.prepare("PRAGMA user_version").get()?.user_version).toBe(4);
      } finally { verify.close(); }
    } finally { migrated.close(); }
  });

  it("rolls back v3 migration when an old active report has a partial or mismatched scope", async () => {
    const legacyPackage = addSecondReadyDecision(pkg);
    const legacySelection = selectReviewDecisions(legacyPackage);
    const onlyFirst = { ...legacySelection, selected: [{ ...legacySelection.selected[0]!, rank: 1 }] };
    const partial = await generateReviewReport(projectContextGraph(legacyPackage), onlyFirst, provider, "2026-09-23T00:00:00.000Z");
    const dir = root();
    const repository = createReviewSessionRepository({ root: dir, createId: () => "session-v3-bad" });
    repository.saveSession(legacyPackage, legacySelection);
    repository.saveReport(legacyPackage.packageId, partial, "report-v3-bad", "operation-v3-bad", undefined,
      [legacySelection.selected[0]!.decisionId]);
    repository.close();
    const db = new DatabaseSync(join(dir, "library.sqlite"));
    const reportBytes = Buffer.from(db.prepare("SELECT payload FROM review_reports WHERE report_ref_id='report-v3-bad'").get()!.payload as Uint8Array);
    restoreV3Storage(db);
    db.close();

    expect(() => createReviewSessionRepository({ root: dir })).toThrow("migration_active_report_selection_mismatch");
    const verify = new DatabaseSync(join(dir, "library.sqlite"));
    try {
      expect(verify.prepare("PRAGMA user_version").get()?.user_version).toBe(3);
      expect(verify.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_decision_reports'").get()).toBeUndefined();
      expect(verify.prepare("PRAGMA table_info(review_sessions)").all().some((column) => column.name === "decision_report_map_hash")).toBe(false);
      expect(Buffer.from(verify.prepare("SELECT payload FROM review_reports WHERE report_ref_id='report-v3-bad'").get()!.payload as Uint8Array)).toEqual(reportBytes);
    } finally { verify.close(); }
  });

  it("fails closed when an explicit decision mapping row is deleted", () => {
    const dir = root();
    const repository = createReviewSessionRepository({ root: dir });
    repository.saveSession(pkg, selection);
    repository.saveReport(pkg.packageId, completeReport, "report-map", "operation-map");
    repository.close();
    const db = new DatabaseSync(join(dir, "library.sqlite"));
    // The artifact ref is unique within this session and identifies its mapping rows.
    db.prepare("DELETE FROM session_decision_reports WHERE decision_id=?").run(selection.selected[0]!.decisionId);
    db.close();
    const reopened = createReviewSessionRepository({ root: dir });
    try { expect(() => reopened.openByPackageId(pkg.packageId)).toThrow("decision_report_mapping_hash_mismatch"); }
    finally { reopened.close(); }
  });
  it("binds deletion retries to both the original package and session across restart (R4-P2-1)", () => {
    const dir = root();
    let repository = createReviewSessionRepository({ root: dir });
    const changed = { ...pkg, componentVersions: { ...pkg.componentVersions, mapperAdapter: "fixture/v2" } };
    const { analysisKey, componentVersions, analysisPolicy, record, evidenceRegistry } = changed;
    const decisions = changed.decisions.map((decision) => decision.outcome === "analysis_ready"
      ? { ...decision, modelEvaluation: { ...decision.modelEvaluation, detailPolicy: { ...decision.modelEvaluation.detailPolicy, frozenAt: null } } }
      : decision);
    const other = {
      ...changed,
      packageId: `package:sha256:${fixtureHash({ analysisKey, componentVersions, analysisPolicy })}`,
      semanticContentHash: `sha256:${fixtureHash({ analysisKey, componentVersions, analysisPolicy, record, evidenceRegistry, decisions })}`,
    };
    repository.saveSession(pkg, selection);
    repository.saveSession(other, selectReviewDecisions(other));
    repository.deleteSession(pkg.packageId, "delete-bound");
    repository.close();
    repository = createReviewSessionRepository({ root: dir });
    try {
      expect(repository.deleteSession(pkg.packageId, "delete-bound")).toEqual({ status: "deleted" });
      expect(() => repository.deleteSession(other.packageId, "delete-bound")).toThrow("operation_identity_conflict");
      expect(repository.openByPackageId(other.packageId).analysisPackage).toEqual(other);
      const replacement = repository.saveSession(pkg, selection);
      expect(() => repository.deleteSession(pkg.packageId, "delete-bound")).toThrow("operation_identity_conflict");
      expect(repository.openByPackageId(pkg.packageId).sessionId).toBe(replacement.sessionId);
    } finally { repository.close(); }
  });
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
    const snapshot = presentFixedReviewSnapshot({ analysisPackage: state.analysisPackage, selection: state.selection, activeReport: state.activeReport, activeReportRefId: state.activeReportRefId });
    expect(snapshot.coachUsage).toEqual({ inputTokens: 1200, cachedInputTokens: 300, outputTokens: 80, totalTokens: 1280 });
    expect(snapshot.coachProvider).toEqual({ providerId: "codex-cli", model: "gpt-6-luna", reasoningEffort: "max", samplingMode: "provider_default" });
    const withoutUsage = presentFixedReviewSnapshot({ analysisPackage: pkg, selection, activeReport: report, activeReportRefId: "other" });
    expect(withoutUsage.coachUsage).toBeNull();
    expect(presentFixedReviewSnapshot({ analysisPackage: pkg, selection }).coachProvider).toBeNull();
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
    expect(repository.activateExisting(pkg.packageId, "report-ref-a", "activate-a2").activeReportRefId).toBe("report-ref-a");
    expect(() => repository.activateExisting(pkg.packageId, "report-ref-b", "activate-a2")).toThrow("operation_identity_conflict");
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

  it("recovers a committed report before duplicate-operation replay without another provider call", async () => {
    const dir = root();
    const first = createReviewSessionRepository({
      root: dir, createId: () => "session-a",
      beforeActivationReadBack: () => { throw new Error("simulated_crash"); },
    });
    first.saveSession(pkg, selection);
    expect(() => first.saveReport(pkg.packageId, report, "report-ref-a", "operation-a")).toThrow("simulated_crash");
    first.close();

    const repository = createReviewSessionRepository({ root: dir });
    const generateReport = vi.fn(async () => report);
    const controller = createFixedReviewController({
      readPackage: async () => pkg,
      generateReport,
      repository,
      createReportRefId: () => "must-not-be-created",
    });
    expect(await controller.generateReview(pkg.packageId, "operation-a")).toEqual({
      status: "failed", code: "generation_failed",
    });
    expect(generateReport).not.toHaveBeenCalled();
    expect(repository.inspect(pkg.packageId)).toMatchObject({
      activeReportRefId: "report-ref-a", intents: [], receipts: [{ state: "activated" }],
    });
    repository.close();
  });

  it("validates every stored hash and version before committing an activation", () => {
    const dir = root();
    const first = createReviewSessionRepository({
      root: dir, createId: () => "session-a",
      beforeActivationReadBack: () => { throw new Error("simulated_crash"); },
    });
    first.saveSession(pkg, selection);
    expect(() => first.saveReport(pkg.packageId, report, "report-ref-a", "operation-a")).toThrow("simulated_crash");
    first.close();

    const db = new DatabaseSync(join(dir, "library.sqlite"));
    db.prepare("UPDATE review_sessions SET selection_hash='invalid' WHERE session_id='session-a'").run();
    db.close();
    const second = createReviewSessionRepository({ root: dir });
    expect(() => second.openByPackageId(pkg.packageId)).toThrow("selection_hash_mismatch");
    expect(second.inspect(pkg.packageId)).toMatchObject({
      activeReportRefId: null,
      intents: [{ operation_id: "operation-a" }],
      receipts: [{ state: "report_saved" }],
    });
    expect(second.inspect(pkg.packageId).revision).toBe(1);
    second.close();
  });

  it.each([
    ["report hash", (db: DatabaseSync) => { db.exec("DROP TRIGGER immutable_report"); db.prepare("UPDATE review_reports SET content_hash='invalid' WHERE report_ref_id='report-ref-a'").run(); }, "report_hash_mismatch"],
    ["stored report version", (db: DatabaseSync) => { db.exec("DROP TRIGGER immutable_report"); db.prepare("UPDATE review_reports SET schema_version='review-report/unsupported' WHERE report_ref_id='report-ref-a'").run(); }, "report_version_mismatch"],
    ["read-back identity", (db: DatabaseSync) => {
      const invalid = Buffer.from(JSON.stringify({ ...selection, analysisPackageId: "wrong-package" }), "utf8");
      const digest = createHash("sha256").update(invalid).digest("hex");
      db.prepare("UPDATE review_sessions SET selection_payload=?,selection_hash=? WHERE session_id='session-a'").run(invalid, digest);
    }, "m7a_read_back_selection_package_mismatch"],
  ])("preserves report_saved recovery state when %s validation fails", (_label, corrupt, expected) => {
    const dir = root();
    const first = createReviewSessionRepository({
      root: dir, createId: () => "session-a",
      beforeActivationReadBack: () => { throw new Error("simulated_crash"); },
    });
    first.saveSession(pkg, selection);
    expect(() => first.saveReport(pkg.packageId, report, "report-ref-a", "operation-a")).toThrow("simulated_crash");
    first.close();
    const db = new DatabaseSync(join(dir, "library.sqlite"));
    corrupt(db);
    db.close();
    const second = createReviewSessionRepository({ root: dir });
    expect(() => second.openByPackageId(pkg.packageId)).toThrow(expected);
    expect(second.inspect(pkg.packageId)).toMatchObject({
      activeReportRefId: null,
      revision: 1,
      intents: [{ operation_id: "operation-a" }],
      receipts: [{ state: "report_saved" }],
    });
    second.close();
  });

  it("fails closed for newer storage versions without overwriting the database", () => {
    const dir = root();
    const databasePath = join(dir, "library.sqlite");
    const db = new DatabaseSync(databasePath);
    db.exec("PRAGMA user_version=5");
    db.close();
    expect(() => createReviewSessionRepository({ root: dir })).toThrow("library_newer_version");
    const verify = new DatabaseSync(databasePath);
    expect((verify.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(5);
    verify.close();
  });

  it("reuses one session across wall-clock metadata while preserving its immutable report", () => {
    const repository = createReviewSessionRepository({ root: root(), createId: () => "session-a" });
    try {
      const first = persistValidatedReviewSession(repository, pkg);
      repository.saveReport(pkg.packageId, completeReport, "report-ref-a", "operation-a");
      const withLaterMetadata = structuredClone(pkg);
      withLaterMetadata.createdAt = "2026-10-01T00:00:00.000Z";
      for (const decision of withLaterMetadata.decisions) {
        if (decision.outcome === "analysis_ready") {
          decision.modelEvaluation.detailPolicy.frozenAt = "2026-10-01T00:00:00.000Z";
        }
      }
      const reused = persistValidatedReviewSession(repository, withLaterMetadata);
      expect(reused.sessionId).toBe(first.sessionId);
      expect(repository.openByPackageId(pkg.packageId).activeReportRefId).toBe("report-ref-a");
      expect(repository.openByPackageId(pkg.packageId).analysisPackage).toEqual(pkg);
      expect(repository.openByPackageId(pkg.packageId).analysisPackage.createdAt).toBe(pkg.createdAt);
    } finally {
      repository.close();
    }
  });

  it("rejects a same-package semantic collision without replacing the active report", () => {
    const repository = createReviewSessionRepository({ root: root(), createId: () => "session-a" });
    try {
      const first = persistValidatedReviewSession(repository, pkg);
      repository.saveReport(pkg.packageId, completeReport, "report-ref-a", "operation-a");
      const changed = structuredClone(pkg);
      // This deterministic fact is part of the validated semantic payload but
      // does not participate in packageId, making it a valid same-id semantic
      // collision without breaking the model-score contract.
      const firstDecision = changed.decisions[0];
      if (firstDecision === undefined || firstDecision.knownGameFacts.remainingDraws === null) {
        throw new Error("fixture_missing_remaining_draws");
      }
      changed.decisions = [
        {
          ...firstDecision,
          knownGameFacts: {
            ...firstDecision.knownGameFacts,
            remainingDraws: firstDecision.knownGameFacts.remainingDraws + 1,
          },
        },
        ...changed.decisions.slice(1),
      ];
      const semanticDecisions = changed.decisions.map((decision) => decision.outcome === "analysis_ready"
        ? {
          ...decision,
          modelEvaluation: {
            ...decision.modelEvaluation,
            detailPolicy: { ...decision.modelEvaluation.detailPolicy, frozenAt: null },
          },
        }
        : decision);
      changed.semanticContentHash = `sha256:${fixtureHash({
        analysisKey: changed.analysisKey,
        record: changed.record,
        componentVersions: changed.componentVersions,
        analysisPolicy: changed.analysisPolicy,
        decisions: semanticDecisions,
        evidenceRegistry: changed.evidenceRegistry,
      })}`;
      expect(changed.packageId).toBe(pkg.packageId);
      expect(changed.semanticContentHash).not.toBe(pkg.semanticContentHash);
      expect(() => persistValidatedReviewSession(repository, changed)).toThrow("identity_conflict");
      const state = repository.openByPackageId(pkg.packageId);
      expect(state.sessionId).toBe(first.sessionId);
      expect(state.activeReportRefId).toBe("report-ref-a");
      expect(state.analysisPackage).toEqual(pkg);
    } finally {
      repository.close();
    }
  });

  it("fails closed when indexed package/report identities disagree with immutable payloads (R3-P2-1)", () => {
    const packageDir = root();
    let repository = createReviewSessionRepository({ root: packageDir, createId: () => "session-a" });
    repository.saveSession(pkg, selection);
    repository.close();
    let db = new DatabaseSync(join(packageDir, "library.sqlite"));
    db.exec("DROP TRIGGER immutable_package");
    db.prepare("UPDATE analysis_packages SET package_id='wrong-index-id'").run();
    db.close();
    repository = createReviewSessionRepository({ root: packageDir });
    expect(() => repository.openByPackageId("wrong-index-id")).toThrow("package_identity_mismatch");
    repository.close();

    const reportDir = root();
    repository = createReviewSessionRepository({ root: reportDir, createId: () => "session-b" });
    repository.saveSession(pkg, selection);
    repository.saveReport(pkg.packageId, report, "report-ref-a", "operation-a");
    repository.close();
    db = new DatabaseSync(join(reportDir, "library.sqlite"));
    db.exec("DROP TRIGGER immutable_report");
    db.prepare("UPDATE review_reports SET report_id='wrong-report-id'").run();
    db.close();
    repository = createReviewSessionRepository({ root: reportDir });
    expect(() => repository.openByPackageId(pkg.packageId)).toThrow("report_identity_mismatch");
    repository.close();
  });

  it("rejects a generated result bound to a deleted and recreated durable session (R3-P2-2)", async () => {
    const ids = ["session-a", "session-b"];
    const repository = createReviewSessionRepository({ root: root(), createId: () => ids.shift()! });
    let release!: (value: unknown) => void;
    const generateReport = vi.fn(() => new Promise<unknown>((resolve) => { release = resolve; }));
    const controller = createFixedReviewController({
      readPackage: async () => pkg,
      generateReport,
      repository,
      createReportRefId: () => "stale-report-ref",
    });
    await controller.openReview(pkg.packageId);
    const pending = controller.generateReview(pkg.packageId, "stale-operation");
    await vi.waitFor(() => expect(generateReport).toHaveBeenCalledOnce());
    repository.deleteSession(pkg.packageId, "delete-a");
    const replacement = repository.saveSession(pkg, selection);
    expect(replacement.sessionId).toBe("session-b");
    release(report);
    expect(await pending).toEqual({ status: "failed", code: "generation_failed" });
    expect(repository.openByPackageId(pkg.packageId).sessionId).toBe("session-b");
    expect(repository.inspect(pkg.packageId)).toMatchObject({
      activeReportRefId: null,
      reportRefs: [],
    });
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

  it("rejects a source-cache directory redirected outside the trusted library root", () => {
    const dir = root();
    const outside = root();
    const repository = createReviewSessionRepository({ root: dir }); repository.close();
    rmSync(join(dir, "source-cache"), { recursive: true, force: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "must-survive.bin"), "outside");
    symlinkSync(outside, join(dir, "source-cache"), process.platform === "win32" ? "junction" : "dir");
    expect(() => createPrivilegedRawCache({ root: dir })).toThrow("raw_cache_path_invalid");
    expect(readFileSync(join(outside, "must-survive.bin"), "utf8")).toBe("outside");
  });
});
