import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  ReviewReportSchema,
  ReviewSelectionResultSchema,
  type ReviewReport,
  type ReviewSelectionResult,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import {
  composeReviewReadBackContext,
  createReviewSessionReadBackComposer,
  selectReviewDecisions,
  validateStructuredAnalysisPackage,
  type ReviewReadBackContext,
  type ReviewSessionDecisionReportRef,
  type ReviewSessionReportInput,
  type ReviewSessionReadBackInput,
} from "@riichi-coach/reasoning";
import { describePackageArtifact, insertPackageChunks, readPackageArtifact, readPackageRecordIdentity } from "./package-artifact-storage.js";
import { aggregateCoachUsageHistory } from "./coach-usage-history.js";

const LIBRARY_FORMAT_VERSION = 4;

type SessionRow = {
  session_id: string;
  package_ref_id: string;
  selection_hash: string;
  selection_payload: Uint8Array;
  revision: number;
  created_at: string;
  updated_at: string;
  active_report_ref_id: string | null;
  decision_report_map_hash: string;
};

type ArtifactRow = {
  payload: Uint8Array;
  content_hash: string;
  schema_version: string;
};
type PackageArtifactRow = ArtifactRow & { package_ref_id: string; package_id: string };
type ReportArtifactRow = ArtifactRow & { report_id: string };
type ReportRefRow = Readonly<{
  report_ref_id: string;
  report_id: string;
  created_at: string;
}>;
type DecisionReportRow = Readonly<{
  decision_id: string;
  report_ref_id: string;
  package_ref_id: string;
}>;

type IntentRow = {
  session_id: string;
  operation_id: string;
  package_ref_id: string;
  target_report_ref_id: string;
  previous_report_ref_id: string | null;
  expected_revision: number;
};

type ReceiptRow = {
  state: string;
  kind: string;
  session_id: string;
  report_ref_id: string | null;
};

export type PersistedReviewState = Readonly<{
  sessionId: string;
  revision: number;
  analysisPackage: StructuredAnalysisPackage;
  selection: ReviewSelectionResult;
  activeReportRefId: string | null;
  activeReport: ReviewReport | null;
  reportRefs: readonly Readonly<{
    reportRefId: string;
    reportId: string;
    generatedAt: string;
  }>[];
  decisionReportRefs: readonly ReviewSessionDecisionReportRef[];
  /** Main-only, freshly validated from this read's actual disk bytes. Never persisted or sent over IPC. */
  readBack: ReviewReadBackContext;
}>;

export type ReviewSessionSummary = Readonly<{
  sessionId: string;
  packageId: string;
  analysisStatus: StructuredAnalysisPackage["record"]["status"];
  activeReportRefId: string | null;
  updatedAt: string;
}>;

function bytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function decisionReportMapHash(mappings: readonly ReviewSessionDecisionReportRef[]): string {
  const sorted = [...mappings].sort((left, right) =>
    left.decisionId < right.decisionId ? -1 : left.decisionId > right.decisionId ? 1
      : left.reportRefId < right.reportRefId ? -1 : left.reportRefId > right.reportRefId ? 1 : 0,
  );
  return hash(bytes(sorted.map(({ decisionId, reportRefId }) => ({ decisionId, reportRefId }))));
}

function decode(value: Uint8Array): unknown {
  return JSON.parse(Buffer.from(value).toString("utf8"));
}

function assertHash(row: ArtifactRow, code: string): unknown {
  if (hash(row.payload) !== row.content_hash) throw new Error(code);
  return decode(row.payload);
}

function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function initialize(db: DatabaseSync, now: string): void {
  db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
  const version = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  if (version > LIBRARY_FORMAT_VERSION) throw new Error("library_newer_version");
  if (version === 0) transaction(db, () => {
    db.exec(`
      CREATE TABLE library_meta(singleton INTEGER PRIMARY KEY CHECK(singleton=1), format_version INTEGER NOT NULL CHECK(format_version=1), created_at TEXT NOT NULL);
      CREATE TABLE analysis_packages(package_ref_id TEXT PRIMARY KEY, package_id TEXT NOT NULL UNIQUE, content_hash TEXT NOT NULL, schema_version TEXT NOT NULL, payload BLOB NOT NULL);
      CREATE TABLE review_sessions(session_id TEXT PRIMARY KEY, package_ref_id TEXT NOT NULL UNIQUE REFERENCES analysis_packages(package_ref_id), selection_hash TEXT NOT NULL, selection_payload BLOB NOT NULL, revision INTEGER NOT NULL CHECK(revision>=0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(session_id,package_ref_id));
      CREATE TABLE review_reports(report_ref_id TEXT PRIMARY KEY, package_ref_id TEXT NOT NULL REFERENCES analysis_packages(package_ref_id), report_id TEXT NOT NULL, content_hash TEXT NOT NULL, schema_version TEXT NOT NULL, payload BLOB NOT NULL, created_at TEXT NOT NULL, UNIQUE(report_ref_id,package_ref_id));
      CREATE INDEX review_reports_report_id ON review_reports(report_id);
      CREATE TABLE session_report_refs(session_id TEXT NOT NULL, package_ref_id TEXT NOT NULL, report_ref_id TEXT NOT NULL UNIQUE, append_ordinal INTEGER NOT NULL CHECK(append_ordinal>=1), PRIMARY KEY(session_id,report_ref_id), UNIQUE(session_id,append_ordinal), UNIQUE(session_id,package_ref_id,report_ref_id), FOREIGN KEY(session_id,package_ref_id) REFERENCES review_sessions(session_id,package_ref_id), FOREIGN KEY(report_ref_id,package_ref_id) REFERENCES review_reports(report_ref_id,package_ref_id));
      CREATE TABLE session_active_report(session_id TEXT PRIMARY KEY, package_ref_id TEXT NOT NULL, active_report_ref_id TEXT NULL, FOREIGN KEY(session_id,package_ref_id) REFERENCES review_sessions(session_id,package_ref_id), FOREIGN KEY(session_id,package_ref_id,active_report_ref_id) REFERENCES session_report_refs(session_id,package_ref_id,report_ref_id));
      CREATE TABLE activation_intents(session_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, package_ref_id TEXT NOT NULL, target_report_ref_id TEXT NOT NULL, previous_report_ref_id TEXT NULL, expected_revision INTEGER NOT NULL, FOREIGN KEY(session_id,package_ref_id,target_report_ref_id) REFERENCES session_report_refs(session_id,package_ref_id,report_ref_id), FOREIGN KEY(session_id,package_ref_id,previous_report_ref_id) REFERENCES session_report_refs(session_id,package_ref_id,report_ref_id));
      CREATE TABLE operation_receipts(operation_id TEXT PRIMARY KEY, kind TEXT NOT NULL, session_id TEXT NOT NULL, report_ref_id TEXT NULL, state TEXT NOT NULL CHECK(state IN ('report_saved','activated','deleted')), committed_revision INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE source_materials(material_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, byte_length INTEGER NOT NULL, relative_path TEXT NOT NULL UNIQUE, state TEXT NOT NULL CHECK(state IN ('ready','deleting')));
      CREATE TABLE raw_cache_entries(cache_key TEXT PRIMARY KEY, material_id TEXT NOT NULL REFERENCES source_materials(material_id), source_kind TEXT NOT NULL, record_identity_hash TEXT NOT NULL, parser_version TEXT NOT NULL, validation_version TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TRIGGER immutable_package BEFORE UPDATE ON analysis_packages BEGIN SELECT RAISE(ABORT,'immutable_artifact'); END;
      CREATE TRIGGER immutable_report BEFORE UPDATE ON review_reports BEGIN SELECT RAISE(ABORT,'immutable_artifact'); END;
    `);
    db.prepare("INSERT INTO library_meta VALUES(1,1,?)").run(now);
    db.exec("PRAGMA user_version=1");
  });
  // v1 deletion receipts lost their package when the artifact was deleted.
  // Preserve them, but never guess a missing binding for an old receipt.
  if (version < 2) transaction(db, () => {
    const meta = db.prepare("SELECT format_version FROM library_meta WHERE singleton=1").get();
    if (meta?.format_version !== 1) throw new Error("library_version_mismatch");
    db.exec(`ALTER TABLE operation_receipts ADD COLUMN package_id TEXT;
      CREATE TABLE library_meta_v2(singleton INTEGER PRIMARY KEY CHECK(singleton=1), format_version INTEGER NOT NULL CHECK(format_version=2), created_at TEXT NOT NULL);
      INSERT INTO library_meta_v2 SELECT singleton,2,created_at FROM library_meta;
      DROP TABLE library_meta;
      ALTER TABLE library_meta_v2 RENAME TO library_meta;
      PRAGMA user_version=2;`);
  });
  if (version < 3) transaction(db, () => {
    const meta = db.prepare("SELECT format_version FROM library_meta WHERE singleton=1").get();
    if (meta?.format_version !== 2) throw new Error("library_version_mismatch");
    db.exec(`
      CREATE TABLE analysis_package_chunks(
        package_ref_id TEXT NOT NULL REFERENCES analysis_packages(package_ref_id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL CHECK(ordinal>=0),
        payload BLOB NOT NULL CHECK(length(payload)>0 AND length(payload)<=65536),
        PRIMARY KEY(package_ref_id,ordinal)
      );
      CREATE TRIGGER immutable_package_chunk BEFORE UPDATE ON analysis_package_chunks BEGIN SELECT RAISE(ABORT,'immutable_artifact'); END;
      CREATE TABLE library_meta_v3(singleton INTEGER PRIMARY KEY CHECK(singleton=1), format_version INTEGER NOT NULL CHECK(format_version=3), created_at TEXT NOT NULL);
      INSERT INTO library_meta_v3 SELECT singleton,3,created_at FROM library_meta;
      DROP TABLE library_meta;
      ALTER TABLE library_meta_v3 RENAME TO library_meta;
      PRAGMA user_version=3;
    `);
  });
  if (version < 4) transaction(db, () => {
    const meta = db.prepare("SELECT format_version FROM library_meta WHERE singleton=1").get();
    if (meta?.format_version !== 3) throw new Error("library_version_mismatch");
    db.exec(`
      CREATE TABLE session_decision_reports(
        session_id TEXT NOT NULL,
        package_ref_id TEXT NOT NULL,
        decision_id TEXT NOT NULL,
        report_ref_id TEXT NOT NULL,
        PRIMARY KEY(session_id,decision_id),
        FOREIGN KEY(session_id,package_ref_id) REFERENCES review_sessions(session_id,package_ref_id) ON DELETE CASCADE,
        FOREIGN KEY(session_id,package_ref_id,report_ref_id) REFERENCES session_report_refs(session_id,package_ref_id,report_ref_id) ON DELETE CASCADE
      );
      ALTER TABLE review_sessions ADD COLUMN decision_report_map_hash TEXT NOT NULL DEFAULT '';
    `);
    const activeRows = db.prepare(`SELECT s.session_id,s.package_ref_id,s.selection_hash,s.selection_payload,
        p.package_id,a.active_report_ref_id
      FROM review_sessions s JOIN analysis_packages p ON p.package_ref_id=s.package_ref_id
      JOIN session_active_report a ON a.session_id=s.session_id
      WHERE a.active_report_ref_id IS NOT NULL ORDER BY s.session_id`).all() as Array<{
        session_id: string; package_ref_id: string; selection_hash: string; selection_payload: Uint8Array;
        package_id: string; active_report_ref_id: string;
      }>;
    const reportForRef = db.prepare(`SELECT r.report_ref_id,r.report_id,r.content_hash,r.schema_version,r.payload
      FROM review_reports r JOIN session_report_refs x
        ON x.report_ref_id=r.report_ref_id AND x.package_ref_id=r.package_ref_id
      WHERE x.session_id=? AND x.package_ref_id=? AND x.report_ref_id=?`);
    const insertMapping = db.prepare("INSERT INTO session_decision_reports VALUES(?,?,?,?)");
    for (const session of activeRows) {
      if (hash(session.selection_payload) !== session.selection_hash) throw new Error("selection_hash_mismatch");
      const selection = ReviewSelectionResultSchema.parse(decode(session.selection_payload));
      if (selection.analysisPackageId !== session.package_id) throw new Error("m7a_read_back_selection_package_mismatch");
      const row = reportForRef.get(session.session_id, session.package_ref_id, session.active_report_ref_id) as ReportArtifactRow & { report_ref_id: string } | undefined;
      if (row === undefined) throw new Error("migration_active_report_unresolved");
      const report = ReviewReportSchema.parse(assertHash(row, "report_hash_mismatch"));
      if (report.reportId !== row.report_id) throw new Error("report_identity_mismatch");
      if (report.schemaVersion !== row.schema_version) throw new Error("report_version_mismatch");
      const selectedIds = selection.selected.map((item) => item.decisionId);
      if (report.packageId !== session.package_id
        || report.selectorPolicyVersion !== selection.policyVersion
        || report.selectedDecisionIds.length !== selectedIds.length
        || report.selectedDecisionIds.some((decisionId, index) => decisionId !== selectedIds[index])) {
        throw new Error("migration_active_report_selection_mismatch");
      }
      for (const decisionId of selectedIds) {
        insertMapping.run(session.session_id, session.package_ref_id, decisionId, session.active_report_ref_id);
      }
    }
    const mapSessions = db.prepare("SELECT session_id FROM review_sessions ORDER BY session_id").all() as Array<{ session_id: string }>;
    const mapRows = db.prepare("SELECT decision_id,report_ref_id FROM session_decision_reports WHERE session_id=? ORDER BY decision_id");
    const saveMapHash = db.prepare("UPDATE review_sessions SET decision_report_map_hash=? WHERE session_id=?");
    for (const session of mapSessions) {
      const rows = mapRows.all(session.session_id) as Array<{
        decision_id: string; report_ref_id: string;
      }>;
      saveMapHash.run(decisionReportMapHash(rows.map((row) => ({ decisionId: row.decision_id, reportRefId: row.report_ref_id }))), session.session_id);
    }
    db.exec(`
      CREATE TABLE library_meta_v4(singleton INTEGER PRIMARY KEY CHECK(singleton=1), format_version INTEGER NOT NULL CHECK(format_version=4), created_at TEXT NOT NULL);
      INSERT INTO library_meta_v4 SELECT singleton,4,created_at FROM library_meta;
      DROP TABLE library_meta;
      ALTER TABLE library_meta_v4 RENAME TO library_meta;
      PRAGMA user_version=4;
    `);
  });
  const meta = db.prepare("SELECT format_version FROM library_meta WHERE singleton=1").get() as { format_version?: number } | undefined;
  if (meta?.format_version !== LIBRARY_FORMAT_VERSION) throw new Error("library_version_mismatch");
  const integrity = db.prepare("PRAGMA quick_check").get() as { quick_check?: string };
  if (integrity.quick_check !== "ok") throw new Error("library_integrity_failed");
  if (db.prepare("PRAGMA foreign_key_check").all().length !== 0) throw new Error("library_foreign_key_failed");
}

export function createReviewSessionRepository(input: {
  root: string;
  now?: () => string;
  createId?: () => string;
  beforeActivationReadBack?: (operationId: string) => void;
}) {
  mkdirSync(input.root, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(input.root, "library.sqlite"));
  const now = input.now ?? (() => new Date().toISOString());
  const createId = input.createId ?? randomUUID;
  try { initialize(db, now()); }
  catch (error) { db.close(); throw error; }

  // One immutable package at a time. PRAGMA data_version changes on writes by
  // other connections (including tamper); report writes on this connection do
  // not invalidate the unchanged package. No persisted validation receipt is
  // trusted, and a new process always reads and validates the actual bytes.
  let preparedPackage: {
    binding: string;
    dataVersion: number;
    composer: ReturnType<typeof createReviewSessionReadBackComposer>;
  } | null = null;
  let storageReclaimPending = false;
  const dataVersion = () => Number(db.prepare("PRAGMA data_version").get()!.data_version);
  const usageRecordIdentities = new Map<string, { contentHash: string; dataVersion: number; recordId: string }>();
  const recompose = (state: PersistedReviewState, sessionInput: ReviewSessionReadBackInput) => {
    if (preparedPackage === null || preparedPackage.composer.analysisPackage !== state.analysisPackage
      || preparedPackage.dataVersion !== dataVersion()) throw new Error("review_changed_during_read");
    return preparedPackage.composer.compose(sessionInput);
  };
  const compactLegacyPackage = (row: PackageArtifactRow, value: StructuredAnalysisPackage, expectedDataVersion: number): void => {
    const oldHeader = Buffer.from(row.payload);
    if (oldHeader.length !== 24 || oldHeader.subarray(0, 8).toString("ascii") !== "RCPKG01\0") return;
    const compact = describePackageArtifact(value);
    if (compact.payload.equals(oldHeader)) return;
    // Only the storage representation changes: decoded canonical bytes must
    // keep their original hash. Inline legacy byte encodings are untouched.
    if (compact.contentHash !== row.content_hash) throw new Error("package_compaction_hash_mismatch");
    transaction(db, () => {
      if (dataVersion() !== expectedDataVersion) throw new Error("review_changed_during_read");
      const current = db.prepare("SELECT payload,content_hash FROM analysis_packages WHERE package_ref_id=?").get(row.package_ref_id);
      if (current?.content_hash !== row.content_hash || !Buffer.from(current.payload as Uint8Array).equals(oldHeader)) throw new Error("package_compaction_conflict");
      // The schema lock and rollback cover the temporary removal of this
      // repository-owned trigger. Report/session identities are never touched.
      db.exec("DROP TRIGGER immutable_package");
      db.prepare("DELETE FROM analysis_package_chunks WHERE package_ref_id=?").run(row.package_ref_id);
      db.prepare("UPDATE analysis_packages SET payload=? WHERE package_ref_id=?").run(compact.payload, row.package_ref_id);
      insertPackageChunks(db, row.package_ref_id, value, compact);
      db.exec("CREATE TRIGGER immutable_package BEFORE UPDATE ON analysis_packages BEGIN SELECT RAISE(ABORT,'immutable_artifact'); END");
    });
    storageReclaimPending = true;
  };

  const packageRowForSession = (sessionId: string) => db.prepare(`
    SELECT p.package_ref_id,p.package_id,p.payload,p.content_hash,p.schema_version FROM analysis_packages p
    JOIN review_sessions s ON s.package_ref_id=p.package_ref_id WHERE s.session_id=?
  `).get(sessionId) as PackageArtifactRow | undefined;

  const reportRowForRef = (sessionId: string, packageRefId: string, reportRefId: string) => db.prepare(`
    SELECT r.report_ref_id,r.report_id,r.payload,r.content_hash,r.schema_version FROM review_reports r
    JOIN session_report_refs x ON x.report_ref_id=r.report_ref_id AND x.package_ref_id=r.package_ref_id
    WHERE x.session_id=? AND x.package_ref_id=? AND x.report_ref_id=?
  `).get(sessionId, packageRefId, reportRefId) as (ReportArtifactRow & { report_ref_id: string }) | undefined;

  const validatedReportForRef = (sessionId: string, packageRefId: string, reportRefId: string): ReviewReport => {
    const row = reportRowForRef(sessionId, packageRefId, reportRefId);
    if (row === undefined || row.report_ref_id !== reportRefId) throw new Error("review_unavailable");
    const report = ReviewReportSchema.parse(assertHash(row, "report_hash_mismatch"));
    if (report.reportId !== row.report_id) throw new Error("report_identity_mismatch");
    if (report.schemaVersion !== row.schema_version) throw new Error("report_version_mismatch");
    return report;
  };

  const read = (session: SessionRow): PersistedReviewState => {
    const version = dataVersion();
    const freshSession = db.prepare(`SELECT s.*,a.active_report_ref_id FROM review_sessions s
      JOIN session_active_report a ON a.session_id=s.session_id WHERE s.session_id=?`).get(session.session_id) as SessionRow | undefined;
    if (freshSession === undefined || freshSession.package_ref_id !== session.package_ref_id) throw new Error("review_unavailable");
    session = freshSession;
    const packageRow = packageRowForSession(session.session_id);
    if (packageRow === undefined) throw new Error("review_unavailable");
    if (hash(session.selection_payload) !== session.selection_hash) throw new Error("selection_hash_mismatch");
    const selection = ReviewSelectionResultSchema.parse(decode(session.selection_payload));
    const binding = JSON.stringify([packageRow.package_ref_id, packageRow.package_id,
      packageRow.content_hash, packageRow.schema_version, session.selection_hash]);
    if (preparedPackage?.binding !== binding || preparedPackage.dataVersion !== version) {
      preparedPackage = null;
      const raw = readPackageArtifact(db, packageRow);
      const identity = raw as Partial<StructuredAnalysisPackage> | null;
      if (identity?.packageId !== undefined && identity.packageId !== packageRow.package_id) throw new Error("package_identity_mismatch");
      if (identity?.componentVersions?.packageSchema !== undefined
        && identity.componentVersions.packageSchema !== packageRow.schema_version) throw new Error("package_version_mismatch");
      const composer = createReviewSessionReadBackComposer(raw, selection);
      if (composer.analysisPackage.packageId !== packageRow.package_id) throw new Error("package_identity_mismatch");
      if (composer.analysisPackage.componentVersions.packageSchema !== packageRow.schema_version) throw new Error("package_version_mismatch");
      if (dataVersion() !== version) throw new Error("review_changed_during_read");
      compactLegacyPackage(packageRow, composer.analysisPackage, version);
      preparedPackage = { binding, dataVersion: version, composer };
    }
    const analysisPackage = preparedPackage.composer.analysisPackage;
    usageRecordIdentities.set(packageRow.package_ref_id, {
      contentHash: packageRow.content_hash, dataVersion: version, recordId: analysisPackage.record.recordId,
    });
    const reportRefs = db.prepare(`SELECT x.report_ref_id,r.report_id,r.created_at
      FROM session_report_refs x JOIN review_reports r ON r.report_ref_id=x.report_ref_id AND r.package_ref_id=x.package_ref_id
      WHERE x.session_id=? AND x.package_ref_id=? ORDER BY x.append_ordinal`).all(
      session.session_id, session.package_ref_id,
    ) as ReportRefRow[];
    const reportRefIds = new Set(reportRefs.map((row) => row.report_ref_id));
    const mappingRows = db.prepare(`SELECT session_id,package_ref_id,decision_id,report_ref_id
      FROM session_decision_reports WHERE session_id=? ORDER BY decision_id`).all(session.session_id) as Array<{
        session_id: string; package_ref_id: string; decision_id: string; report_ref_id: string;
      }>;
    const decisionReportRefs: ReviewSessionDecisionReportRef[] = mappingRows.map((row) => {
      if (row.package_ref_id !== session.package_ref_id || !reportRefIds.has(row.report_ref_id)) {
        throw new Error("decision_report_mapping_identity_mismatch");
      }
      return Object.freeze({ decisionId: row.decision_id, reportRefId: row.report_ref_id });
    });
    if (decisionReportMapHash(decisionReportRefs) !== session.decision_report_map_hash) {
      throw new Error("decision_report_mapping_hash_mismatch");
    }
    const refsToLoad = new Set(decisionReportRefs.map((mapping) => mapping.reportRefId));
    if (session.active_report_ref_id !== null) refsToLoad.add(session.active_report_ref_id);
    const reports: ReviewSessionReportInput[] = [];
    for (const reportRef of reportRefs) {
      if (!refsToLoad.has(reportRef.report_ref_id)) continue;
      reports.push(Object.freeze({
        reportRefId: reportRef.report_ref_id,
        report: validatedReportForRef(session.session_id, session.package_ref_id, reportRef.report_ref_id),
      }));
    }
    const readBack = preparedPackage.composer.compose({
        reports,
        decisionReportRefs,
        activeReportRefId: session.active_report_ref_id,
      });
    if (dataVersion() !== version) { preparedPackage = null; throw new Error("review_changed_during_read"); }
    return Object.freeze({
      sessionId: session.session_id,
      revision: session.revision,
      analysisPackage,
      selection: readBack.selection,
      activeReportRefId: session.active_report_ref_id,
      activeReport: readBack.report,
      reportRefs: Object.freeze(reportRefs.map((row) => Object.freeze({
        reportRefId: row.report_ref_id,
        reportId: row.report_id,
        generatedAt: row.created_at,
      }))),
      decisionReportRefs: Object.freeze(decisionReportRefs),
      readBack,
    });
  };

  const sessionByPackageId = (packageId: string): SessionRow | undefined => db.prepare(`
    SELECT s.*,a.active_report_ref_id FROM review_sessions s
    JOIN analysis_packages p ON p.package_ref_id=s.package_ref_id
    JOIN session_active_report a ON a.session_id=s.session_id WHERE p.package_id=?
  `).get(packageId) as SessionRow | undefined;

  const recover = (sessionId: string): void => {
    const intent = db.prepare("SELECT * FROM activation_intents WHERE session_id=?").get(sessionId) as IntentRow | undefined;
    if (intent !== undefined) activate(intent.operation_id);
  };

  const validateActivationReadBack = (intent: IntentRow, session: SessionRow): Readonly<{
    targetDecisionIds: readonly string[];
    decisionReportRefs: readonly ReviewSessionDecisionReportRef[];
  }> => {
    if (session.session_id !== intent.session_id || session.package_ref_id !== intent.package_ref_id) {
      throw new Error("activation_unavailable");
    }
    const current = read(session);
    const targetReport = validatedReportForRef(session.session_id, session.package_ref_id, intent.target_report_ref_id);
    const targetDecisionIds = [...targetReport.selectedDecisionIds];
    const targetIds = new Set(targetDecisionIds);
    const nextMappings = current.decisionReportRefs.filter((mapping) => !targetIds.has(mapping.decisionId));
    for (const decisionId of targetDecisionIds) {
      nextMappings.push(Object.freeze({ decisionId, reportRefId: intent.target_report_ref_id }));
    }
    const reportsByRef = new Map(current.readBack.reports
      .filter((item) => item.reportRefId !== null)
      .map((item) => [item.reportRefId!, item.report] as const));
    reportsByRef.set(intent.target_report_ref_id, targetReport);
    const neededRefs = new Set(nextMappings.map((mapping) => mapping.reportRefId));
    neededRefs.add(intent.target_report_ref_id);
    const reports: ReviewSessionReportInput[] = [...neededRefs].map((reportRefId) => {
      const report = reportsByRef.get(reportRefId);
      if (report === undefined) throw new Error("activation_unavailable");
      return Object.freeze({ reportRefId, report });
    });
    recompose(current, {
      reports,
      decisionReportRefs: nextMappings,
      activeReportRefId: intent.target_report_ref_id,
    });
    return Object.freeze({
      targetDecisionIds: Object.freeze(targetDecisionIds),
      decisionReportRefs: Object.freeze(nextMappings),
    });
  };

  const activate = (operationId: string): PersistedReviewState => {
    const receipt = db.prepare("SELECT state,kind,session_id,report_ref_id FROM operation_receipts WHERE operation_id=?").get(operationId) as ReceiptRow | undefined;
    if (receipt?.state === "activated") {
      const row = db.prepare("SELECT s.*,a.active_report_ref_id FROM review_sessions s JOIN session_active_report a ON a.session_id=s.session_id WHERE s.session_id=?").get(receipt.session_id) as SessionRow;
      return read(row);
    }
    const intent = db.prepare("SELECT * FROM activation_intents WHERE operation_id=?").get(operationId) as IntentRow | undefined;
    if (intent === undefined) throw new Error("activation_unavailable");
    if (receipt === undefined || receipt.session_id !== intent.session_id
      || receipt.report_ref_id !== intent.target_report_ref_id
      || (receipt.kind !== "append_and_activate" && receipt.kind !== "activate")) {
      throw new Error("operation_identity_conflict");
    }
    const session = db.prepare("SELECT s.*,a.active_report_ref_id FROM review_sessions s JOIN session_active_report a ON a.session_id=s.session_id WHERE s.session_id=?").get(intent.session_id) as SessionRow;
    const activationReadBack = validateActivationReadBack(intent, session);
    transaction(db, () => {
      const updateDecisionReport = db.prepare(`INSERT INTO session_decision_reports
        (session_id,package_ref_id,decision_id,report_ref_id) VALUES(?,?,?,?)
        ON CONFLICT(session_id,decision_id) DO UPDATE SET
          package_ref_id=excluded.package_ref_id,report_ref_id=excluded.report_ref_id`);
      for (const decisionId of activationReadBack.targetDecisionIds) {
        updateDecisionReport.run(intent.session_id, intent.package_ref_id, decisionId, intent.target_report_ref_id);
      }
      const result = db.prepare("UPDATE session_active_report SET active_report_ref_id=? WHERE session_id=? AND package_ref_id=? AND active_report_ref_id IS ?").run(intent.target_report_ref_id, intent.session_id, intent.package_ref_id, intent.previous_report_ref_id);
      if (Number(result.changes) !== 1) throw new Error("activation_conflict");
      const revision = db.prepare(`UPDATE review_sessions SET revision=revision+1,updated_at=?,decision_report_map_hash=?
        WHERE session_id=? AND revision=?`).run(
        now(), decisionReportMapHash(activationReadBack.decisionReportRefs), intent.session_id, intent.expected_revision,
      );
      if (Number(revision.changes) !== 1) throw new Error("activation_conflict");
      db.prepare("DELETE FROM activation_intents WHERE operation_id=?").run(operationId);
      db.prepare("UPDATE operation_receipts SET state='activated',committed_revision=? WHERE operation_id=? AND state='report_saved'").run(intent.expected_revision + 1, operationId);
    });
    const updated = db.prepare("SELECT s.*,a.active_report_ref_id FROM review_sessions s JOIN session_active_report a ON a.session_id=s.session_id WHERE s.session_id=?").get(intent.session_id) as SessionRow;
    return read(updated);
  };

  return Object.freeze({
    saveSession(analysisPackageInput: unknown, selectionInput: unknown): PersistedReviewState {
      validateStructuredAnalysisPackage(analysisPackageInput);
      // Validation and serialization are synchronous and never mutate/freeze
      // the caller's package. The returned state owns a fresh disk read.
      const analysisPackage = analysisPackageInput;
      const selection = ReviewSelectionResultSchema.parse(selectionInput);
      composeReviewReadBackContext(analysisPackage, selection, null);
      const packageArtifact = describePackageArtifact(analysisPackage);
      const selectionPayload = bytes(selection);
      const existing = sessionByPackageId(analysisPackage.packageId);
      if (existing !== undefined) {
        const existingPackage = packageRowForSession(existing.session_id);
        if (existingPackage === undefined) throw new Error("identity_conflict");
        // packageId is the stable artifact reference, while createdAt and the
        // per-decision detailPolicy.frozenAt are intentionally volatile
        // metadata. Re-importing the same semantic package at a later wall
        // clock must reopen the existing immutable artifact/session instead
        // of trying to insert a byte-different copy. A same-id, different
        // semanticContentHash collision remains fail-closed.
        const existingAnalysisPackage = readPackageArtifact(db, existingPackage);
        validateStructuredAnalysisPackage(existingAnalysisPackage);
        if (
          existingAnalysisPackage.packageId !== analysisPackage.packageId
          || existingAnalysisPackage.semanticContentHash !== analysisPackage.semanticContentHash
          || existing.selection_hash !== hash(selectionPayload)
        ) throw new Error("identity_conflict");
        return read(existing);
      }
      const packageRefId = `package:${hash(Buffer.from(analysisPackage.packageId))}`;
      const sessionId = createId();
      const timestamp = now();
      transaction(db, () => {
        const byId = db.prepare("SELECT * FROM analysis_packages WHERE package_id=?").get(analysisPackage.packageId) as PackageArtifactRow | undefined;
        if (byId !== undefined && describePackageArtifact(readPackageArtifact(db, byId)).contentHash !== packageArtifact.contentHash) throw new Error("identity_conflict");
        const inserted = db.prepare("INSERT OR IGNORE INTO analysis_packages VALUES(?,?,?,?,?)").run(packageRefId, analysisPackage.packageId, packageArtifact.contentHash, analysisPackage.componentVersions.packageSchema, packageArtifact.payload);
        if (Number(inserted.changes) === 1) insertPackageChunks(db, packageRefId, analysisPackage, packageArtifact);
        db.prepare(`INSERT INTO review_sessions
          (session_id,package_ref_id,selection_hash,selection_payload,revision,created_at,updated_at,decision_report_map_hash)
          VALUES(?,?,?,?,?,?,?,?)`).run(sessionId, packageRefId, hash(selectionPayload), selectionPayload, 0, timestamp, timestamp, decisionReportMapHash([]));
        db.prepare("INSERT INTO session_active_report VALUES(?,?,NULL)").run(sessionId, packageRefId);
      });
      return read(sessionByPackageId(analysisPackage.packageId)!);
    },

    openByPackageId(packageId: string): PersistedReviewState {
      const session = sessionByPackageId(packageId);
      if (session === undefined) throw new Error("review_unavailable");
      recover(session.session_id);
      return read(sessionByPackageId(packageId)!);
    },

    tryOpenByPackageId(packageId: string): PersistedReviewState | null {
      const session = sessionByPackageId(packageId);
      if (session === undefined) return null;
      recover(session.session_id);
      return read(sessionByPackageId(packageId)!);
    },

    listSessions(): readonly ReviewSessionSummary[] {
      const rows = db.prepare(`SELECT s.session_id,p.package_id,s.selection_payload,a.active_report_ref_id,s.updated_at
        FROM review_sessions s JOIN analysis_packages p ON p.package_ref_id=s.package_ref_id
        JOIN session_active_report a ON a.session_id=s.session_id ORDER BY s.updated_at DESC,s.session_id`).all() as Array<{
          session_id: string; package_id: string; selection_payload: Uint8Array; active_report_ref_id: string | null; updated_at: string;
        }>;
      return Object.freeze(rows.map((row) => Object.freeze({
        sessionId: row.session_id,
        packageId: row.package_id,
        analysisStatus: ReviewSelectionResultSchema.parse(decode(row.selection_payload)).analysisPackageStatus,
        activeReportRefId: row.active_report_ref_id,
        updatedAt: row.updated_at,
      })));
    },

    getCoachUsageHistory() {
      const version = dataVersion();
      const history: Parameters<typeof aggregateCoachUsageHistory>[0][number][] = [];
      const rows = db.prepare(`SELECT r.report_ref_id,r.report_id,r.package_ref_id,r.payload,r.content_hash,r.schema_version,
        p.package_id,p.payload AS package_payload,p.content_hash AS package_content_hash,p.schema_version AS package_schema_version
        FROM review_reports r JOIN session_report_refs x ON x.report_ref_id=r.report_ref_id AND x.package_ref_id=r.package_ref_id
        JOIN review_sessions s ON s.session_id=x.session_id AND s.package_ref_id=x.package_ref_id
        JOIN analysis_packages p ON p.package_ref_id=r.package_ref_id`).iterate();
      for (const raw of rows) {
        const row = raw as ReportArtifactRow & { report_ref_id: string; package_ref_id: string; package_id: string; package_payload: Uint8Array; package_content_hash: string; package_schema_version: string };
        const report = ReviewReportSchema.parse(assertHash(row, "report_hash_mismatch"));
        if (report.reportId !== row.report_id || report.packageId !== row.package_id || report.schemaVersion !== row.schema_version) {
          throw new Error("report_identity_mismatch");
        }
        let identity = usageRecordIdentities.get(row.package_ref_id);
        if (identity?.contentHash !== row.package_content_hash || identity.dataVersion !== version) {
          const record = readPackageRecordIdentity(db, { package_ref_id: row.package_ref_id, payload: row.package_payload,
            content_hash: row.package_content_hash, package_id: row.package_id, schema_version: row.package_schema_version });
          identity = { contentHash: row.package_content_hash, dataVersion: version, recordId: record.recordId };
          usageRecordIdentities.set(row.package_ref_id, identity);
        }
        history.push({ reportRefId: row.report_ref_id, recordId: identity.recordId, report });
      }
      if (dataVersion() !== version) throw new Error("review_changed_during_read");
      return aggregateCoachUsageHistory(history);
    },

    saveReport(
      packageId: string,
      reportInput: unknown,
      reportRefId: string,
      operationId: string,
      expectedSession?: Readonly<{ sessionId: string; revision: number }>,
      expectedDecisionIds?: readonly string[],
    ): PersistedReviewState {
      const prior = db.prepare("SELECT state,session_id,report_ref_id FROM operation_receipts WHERE operation_id=?").get(operationId) as { state: string; session_id: string; report_ref_id: string | null } | undefined;
      if (prior !== undefined) {
        const current = sessionByPackageId(packageId);
        if (current === undefined || prior.session_id !== current.session_id || prior.report_ref_id !== reportRefId) throw new Error("operation_identity_conflict");
        return prior.state === "activated" ? read(current) : activate(operationId);
      }
      const state = this.openByPackageId(packageId);
      if (expectedSession !== undefined
        && (state.sessionId !== expectedSession.sessionId || state.revision !== expectedSession.revision)) {
        throw new Error("session_binding_conflict");
      }
      const report = ReviewReportSchema.parse(reportInput);
      if (state.reportRefs.some((item) => item.reportRefId === reportRefId)) throw new Error("duplicate_report_ref");
      if (expectedDecisionIds !== undefined
        && (report.selectedDecisionIds.length !== expectedDecisionIds.length
          || report.selectedDecisionIds.some((decisionId, index) => decisionId !== expectedDecisionIds[index]))) {
        throw new Error("report_selection_mismatch");
      }
      const targetIds = new Set(report.selectedDecisionIds);
      const nextMappings = state.decisionReportRefs.filter((mapping) => !targetIds.has(mapping.decisionId));
      for (const decisionId of report.selectedDecisionIds) {
        nextMappings.push(Object.freeze({ decisionId, reportRefId }));
      }
      const reportsByRef = new Map(state.readBack.reports
        .filter((item) => item.reportRefId !== null)
        .map((item) => [item.reportRefId!, item.report] as const));
      if (reportsByRef.has(reportRefId)) throw new Error("duplicate_report_ref");
      reportsByRef.set(reportRefId, report);
      const neededRefs = new Set(nextMappings.map((mapping) => mapping.reportRefId));
      neededRefs.add(reportRefId);
      const reports: ReviewSessionReportInput[] = [...neededRefs].map((refId) => {
        const existing = reportsByRef.get(refId);
        if (existing === undefined) throw new Error("report_selection_unavailable");
        return Object.freeze({ reportRefId: refId, report: existing });
      });
      recompose(state, {
        reports,
        decisionReportRefs: nextMappings,
        activeReportRefId: reportRefId,
      });
      const payload = bytes(report);
      const timestamp = now();
      transaction(db, () => {
        const session = sessionByPackageId(packageId);
        if (session === undefined) throw new Error("session_binding_conflict");
        if (expectedSession !== undefined
          && (session.session_id !== expectedSession.sessionId || session.revision !== expectedSession.revision)) {
          throw new Error("session_binding_conflict");
        }
        const ordinal = Number((db.prepare("SELECT COALESCE(MAX(append_ordinal),0)+1 AS value FROM session_report_refs WHERE session_id=?").get(session.session_id) as { value: number }).value);
        db.prepare("INSERT INTO review_reports VALUES(?,?,?,?,?,?,?)").run(reportRefId, session.package_ref_id, report.reportId, hash(payload), report.schemaVersion, payload, timestamp);
        db.prepare("INSERT INTO session_report_refs VALUES(?,?,?,?)").run(session.session_id, session.package_ref_id, reportRefId, ordinal);
        db.prepare("INSERT INTO activation_intents VALUES(?,?,?,?,?,?)").run(session.session_id, operationId, session.package_ref_id, reportRefId, session.active_report_ref_id, session.revision + 1);
        const revision = db.prepare("UPDATE review_sessions SET revision=revision+1,updated_at=? WHERE session_id=? AND revision=?").run(timestamp, session.session_id, session.revision);
        if (Number(revision.changes) !== 1) throw new Error("save_conflict");
        db.prepare("INSERT INTO operation_receipts VALUES(?,?,?,?,?,?,?,?)").run(operationId, "append_and_activate", session.session_id, reportRefId, "report_saved", session.revision + 1, timestamp, packageId);
      });
      input.beforeActivationReadBack?.(operationId);
      return activate(operationId);
    },

    activateExisting(packageId: string, reportRefId: string, operationId: string): PersistedReviewState {
      const prior = db.prepare("SELECT state,kind,session_id,report_ref_id FROM operation_receipts WHERE operation_id=?").get(operationId) as ReceiptRow | undefined;
      if (prior !== undefined) {
        const current = sessionByPackageId(packageId);
        if (current === undefined || prior.kind !== "activate" || prior.session_id !== current.session_id
          || prior.report_ref_id !== reportRefId) throw new Error("operation_identity_conflict");
        return prior.state === "activated" ? read(current) : activate(operationId);
      }
      const state = this.openByPackageId(packageId);
      const session = sessionByPackageId(packageId)!;
      transaction(db, () => {
        db.prepare("INSERT INTO activation_intents VALUES(?,?,?,?,?,?)").run(session.session_id, operationId, session.package_ref_id, reportRefId, session.active_report_ref_id, session.revision);
        db.prepare("INSERT INTO operation_receipts VALUES(?,?,?,?,?,?,?,?)").run(operationId, "activate", session.session_id, reportRefId, "report_saved", state.revision, now(), packageId);
      });
      return activate(operationId);
    },

    deleteSession(packageId: string, operationId: string): Readonly<{ status: "deleted" }> {
      preparedPackage = null;
      const prior = db.prepare("SELECT state,kind,session_id,package_id FROM operation_receipts WHERE operation_id=?").get(operationId) as (ReceiptRow & { package_id: string | null }) | undefined;
      const session = sessionByPackageId(packageId);
      if (prior !== undefined) {
        if (prior.state !== "deleted" || prior.kind !== "delete" || prior.package_id !== packageId
          || session !== undefined) throw new Error("operation_identity_conflict");
        return Object.freeze({ status: "deleted" as const });
      }
      if (session === undefined) throw new Error("review_unavailable");
      transaction(db, () => {
        db.prepare("UPDATE session_active_report SET active_report_ref_id=NULL WHERE session_id=?").run(session.session_id);
        db.prepare("DELETE FROM activation_intents WHERE session_id=?").run(session.session_id);
        db.prepare("DELETE FROM session_decision_reports WHERE session_id=?").run(session.session_id);
        db.prepare("DELETE FROM session_report_refs WHERE session_id=?").run(session.session_id);
        db.prepare("DELETE FROM review_reports WHERE package_ref_id=?").run(session.package_ref_id);
        db.prepare("DELETE FROM session_active_report WHERE session_id=?").run(session.session_id);
        const deleted = db.prepare("DELETE FROM review_sessions WHERE session_id=? AND revision=?").run(session.session_id, session.revision);
        if (Number(deleted.changes) !== 1) throw new Error("delete_conflict");
        db.prepare("DELETE FROM analysis_packages WHERE package_ref_id=? AND NOT EXISTS(SELECT 1 FROM review_sessions WHERE package_ref_id=?)").run(session.package_ref_id, session.package_ref_id);
        db.prepare("INSERT INTO operation_receipts VALUES(?,?,?,?,?,?,?,?)").run(operationId, "delete", session.session_id, null, "deleted", session.revision, now(), packageId);
      });
      return Object.freeze({ status: "deleted" as const });
    },

    inspect(packageId: string) {
      const session = sessionByPackageId(packageId);
      if (session === undefined) throw new Error("review_unavailable");
      const refs = db.prepare(`SELECT x.report_ref_id,x.append_ordinal,r.report_id,r.created_at
        FROM session_report_refs x JOIN review_reports r ON r.report_ref_id=x.report_ref_id
        WHERE x.session_id=? ORDER BY x.append_ordinal`).all(session.session_id);
      const intents = db.prepare("SELECT operation_id,target_report_ref_id FROM activation_intents WHERE session_id=?").all(session.session_id);
      const receipts = db.prepare("SELECT operation_id,kind,report_ref_id,state,committed_revision FROM operation_receipts WHERE session_id=? ORDER BY created_at,operation_id").all(session.session_id);
      const decisionMappings = db.prepare(`SELECT decision_id,report_ref_id FROM session_decision_reports
        WHERE session_id=? ORDER BY decision_id`).all(session.session_id);
      const reportRefs = refs.map((row) => ({
        reportRefId: String(row.report_ref_id),
        appendOrdinal: Number(row.append_ordinal),
        reportId: String(row.report_id),
        packageId,
        generatedAt: String(row.created_at),
      }));
      return Object.freeze({ activeReportRefId: session.active_report_ref_id, revision: session.revision, reportRefs, refs, intents, receipts, decisionMappings });
    },

    /** Background owner calls after a successful cold open, never in renderer.
     * Busy readers may defer reclamation; canonical data is already durable. */
    reclaimUnusedStorage(): boolean {
      if (!storageReclaimPending) return false;
      try {
        db.exec("VACUUM");
        const checkpoint = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
        if (Number(checkpoint?.busy) !== 0) return false;
        storageReclaimPending = false;
        return true;
      } catch { return false; }
    },

    close(): void { preparedPackage = null; db.close(); },
  });
}

/** Main-composition seam used by account/share producers. Selection is always
 * derived from the validated package, so reruns can reuse the repository's
 * semantic package/session identity without a second persistence policy. */
export function persistValidatedReviewSession(
  repository: Pick<ReturnType<typeof createReviewSessionRepository>, "saveSession">,
  analysisPackage: StructuredAnalysisPackage,
): Readonly<{ sessionId: string; packageId: string }> {
  const persisted = repository.saveSession(
    analysisPackage,
    selectReviewDecisions(analysisPackage),
  );
  return Object.freeze({
    sessionId: persisted.sessionId,
    packageId: analysisPackage.packageId,
  });
}

export type ReviewSessionRepository = ReturnType<typeof createReviewSessionRepository>;
