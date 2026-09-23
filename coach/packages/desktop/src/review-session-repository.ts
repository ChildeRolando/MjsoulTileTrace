import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  ReviewReportSchema,
  ReviewSelectionResultSchema,
  StructuredAnalysisPackageSchema,
  type ReviewReport,
  type ReviewSelectionResult,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import {
  composeReviewReadBackContext,
  validateStructuredAnalysisPackage,
} from "@riichi-coach/reasoning";

const LIBRARY_FORMAT_VERSION = 1;

type SessionRow = {
  session_id: string;
  package_ref_id: string;
  selection_hash: string;
  selection_payload: Uint8Array;
  revision: number;
  created_at: string;
  updated_at: string;
  active_report_ref_id: string | null;
};

type ArtifactRow = {
  payload: Uint8Array;
  content_hash: string;
  schema_version: string;
};

type IntentRow = {
  session_id: string;
  operation_id: string;
  package_ref_id: string;
  target_report_ref_id: string;
  previous_report_ref_id: string | null;
  expected_revision: number;
};

export type PersistedReviewState = Readonly<{
  sessionId: string;
  revision: number;
  analysisPackage: StructuredAnalysisPackage;
  selection: ReviewSelectionResult;
  activeReportRefId: string | null;
  activeReport: ReviewReport | null;
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
      CREATE TABLE operation_receipts(operation_id TEXT PRIMARY KEY, kind TEXT NOT NULL, session_id TEXT NOT NULL REFERENCES review_sessions(session_id), report_ref_id TEXT NULL REFERENCES review_reports(report_ref_id), state TEXT NOT NULL CHECK(state IN ('report_saved','activated','deleted')), committed_revision INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE source_materials(material_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, byte_length INTEGER NOT NULL, relative_path TEXT NOT NULL UNIQUE, state TEXT NOT NULL CHECK(state IN ('ready','deleting')));
      CREATE TABLE raw_cache_entries(cache_key TEXT PRIMARY KEY, material_id TEXT NOT NULL REFERENCES source_materials(material_id), source_kind TEXT NOT NULL, record_identity_hash TEXT NOT NULL, parser_version TEXT NOT NULL, validation_version TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TRIGGER immutable_package BEFORE UPDATE ON analysis_packages BEGIN SELECT RAISE(ABORT,'immutable_artifact'); END;
      CREATE TRIGGER immutable_report BEFORE UPDATE ON review_reports BEGIN SELECT RAISE(ABORT,'immutable_artifact'); END;
    `);
    db.prepare("INSERT INTO library_meta VALUES(1,1,?)").run(now);
    db.exec("PRAGMA user_version=1");
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

  const packageRowForSession = (sessionId: string) => db.prepare(`
    SELECT p.payload,p.content_hash,p.schema_version FROM analysis_packages p
    JOIN review_sessions s ON s.package_ref_id=p.package_ref_id WHERE s.session_id=?
  `).get(sessionId) as ArtifactRow | undefined;

  const read = (session: SessionRow): PersistedReviewState => {
    const packageRow = packageRowForSession(session.session_id);
    if (packageRow === undefined) throw new Error("review_unavailable");
    const packageRaw = assertHash(packageRow, "package_hash_mismatch");
    validateStructuredAnalysisPackage(packageRaw);
    const analysisPackage = StructuredAnalysisPackageSchema.parse(packageRaw);
    if (analysisPackage.componentVersions.packageSchema !== packageRow.schema_version) throw new Error("package_version_mismatch");
    if (hash(session.selection_payload) !== session.selection_hash) throw new Error("selection_hash_mismatch");
    const selection = ReviewSelectionResultSchema.parse(decode(session.selection_payload));
    let activeReport: ReviewReport | null = null;
    if (session.active_report_ref_id !== null) {
      const reportRow = db.prepare(`SELECT r.payload,r.content_hash,r.schema_version FROM review_reports r
        JOIN session_report_refs x ON x.report_ref_id=r.report_ref_id
        WHERE x.session_id=? AND x.package_ref_id=? AND x.report_ref_id=?`).get(
        session.session_id, session.package_ref_id, session.active_report_ref_id,
      ) as ArtifactRow | undefined;
      if (reportRow === undefined) throw new Error("review_unavailable");
      activeReport = ReviewReportSchema.parse(assertHash(reportRow, "report_hash_mismatch"));
      if (activeReport.schemaVersion !== reportRow.schema_version) throw new Error("report_version_mismatch");
    }
    composeReviewReadBackContext(analysisPackage, selection, activeReport);
    return Object.freeze({
      sessionId: session.session_id,
      revision: session.revision,
      analysisPackage,
      selection,
      activeReportRefId: session.active_report_ref_id,
      activeReport,
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

  const activate = (operationId: string): PersistedReviewState => {
    const receipt = db.prepare("SELECT state,session_id FROM operation_receipts WHERE operation_id=?").get(operationId) as { state: string; session_id: string } | undefined;
    if (receipt?.state === "activated") {
      const row = db.prepare("SELECT s.*,a.active_report_ref_id FROM review_sessions s JOIN session_active_report a ON a.session_id=s.session_id WHERE s.session_id=?").get(receipt.session_id) as SessionRow;
      return read(row);
    }
    const intent = db.prepare("SELECT * FROM activation_intents WHERE operation_id=?").get(operationId) as IntentRow | undefined;
    if (intent === undefined) throw new Error("activation_unavailable");
    const session = db.prepare("SELECT s.*,a.active_report_ref_id FROM review_sessions s JOIN session_active_report a ON a.session_id=s.session_id WHERE s.session_id=?").get(intent.session_id) as SessionRow;
    const target = db.prepare("SELECT payload,content_hash,schema_version FROM review_reports WHERE report_ref_id=? AND package_ref_id=?").get(intent.target_report_ref_id, intent.package_ref_id) as ArtifactRow | undefined;
    if (target === undefined) throw new Error("activation_unavailable");
    const packageRow = packageRowForSession(session.session_id);
    if (packageRow === undefined) throw new Error("activation_unavailable");
    const packageRaw = assertHash(packageRow, "package_hash_mismatch");
    const selectionRaw = decode(session.selection_payload);
    const reportRaw = assertHash(target, "report_hash_mismatch");
    composeReviewReadBackContext(packageRaw, selectionRaw, reportRaw);
    transaction(db, () => {
      const result = db.prepare("UPDATE session_active_report SET active_report_ref_id=? WHERE session_id=? AND package_ref_id=? AND active_report_ref_id IS ?").run(intent.target_report_ref_id, intent.session_id, intent.package_ref_id, intent.previous_report_ref_id);
      if (Number(result.changes) !== 1) throw new Error("activation_conflict");
      const revision = db.prepare("UPDATE review_sessions SET revision=revision+1,updated_at=? WHERE session_id=? AND revision=?").run(now(), intent.session_id, intent.expected_revision);
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
      const analysisPackage = StructuredAnalysisPackageSchema.parse(analysisPackageInput);
      const selection = ReviewSelectionResultSchema.parse(selectionInput);
      composeReviewReadBackContext(analysisPackage, selection, null);
      const packagePayload = bytes(analysisPackage);
      const selectionPayload = bytes(selection);
      const existing = sessionByPackageId(analysisPackage.packageId);
      if (existing !== undefined) {
        const existingPackage = packageRowForSession(existing.session_id);
        if (existingPackage === undefined || existingPackage.content_hash !== hash(packagePayload)
          || existing.selection_hash !== hash(selectionPayload)) throw new Error("identity_conflict");
        return read(existing);
      }
      const packageRefId = `package:${hash(Buffer.from(analysisPackage.packageId))}`;
      const sessionId = createId();
      const timestamp = now();
      transaction(db, () => {
        const byId = db.prepare("SELECT content_hash FROM analysis_packages WHERE package_id=?").get(analysisPackage.packageId) as { content_hash: string } | undefined;
        if (byId !== undefined && byId.content_hash !== hash(packagePayload)) throw new Error("identity_conflict");
        db.prepare("INSERT OR IGNORE INTO analysis_packages VALUES(?,?,?,?,?)").run(packageRefId, analysisPackage.packageId, hash(packagePayload), analysisPackage.componentVersions.packageSchema, packagePayload);
        db.prepare("INSERT INTO review_sessions VALUES(?,?,?,?,?,?,?)").run(sessionId, packageRefId, hash(selectionPayload), selectionPayload, 0, timestamp, timestamp);
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

    saveReport(packageId: string, reportInput: unknown, reportRefId: string, operationId: string): PersistedReviewState {
      const prior = db.prepare("SELECT state,session_id FROM operation_receipts WHERE operation_id=?").get(operationId) as { state: string; session_id: string } | undefined;
      if (prior !== undefined) return prior.state === "activated" ? read(sessionByPackageId(packageId)!) : activate(operationId);
      const state = this.openByPackageId(packageId);
      const report = ReviewReportSchema.parse(reportInput);
      composeReviewReadBackContext(state.analysisPackage, state.selection, report);
      const payload = bytes(report);
      const session = sessionByPackageId(packageId)!;
      const timestamp = now();
      transaction(db, () => {
        const ordinal = Number((db.prepare("SELECT COALESCE(MAX(append_ordinal),0)+1 AS value FROM session_report_refs WHERE session_id=?").get(session.session_id) as { value: number }).value);
        db.prepare("INSERT INTO review_reports VALUES(?,?,?,?,?,?,?)").run(reportRefId, session.package_ref_id, report.reportId, hash(payload), report.schemaVersion, payload, timestamp);
        db.prepare("INSERT INTO session_report_refs VALUES(?,?,?,?)").run(session.session_id, session.package_ref_id, reportRefId, ordinal);
        db.prepare("INSERT INTO activation_intents VALUES(?,?,?,?,?,?)").run(session.session_id, operationId, session.package_ref_id, reportRefId, session.active_report_ref_id, session.revision + 1);
        const revision = db.prepare("UPDATE review_sessions SET revision=revision+1,updated_at=? WHERE session_id=? AND revision=?").run(timestamp, session.session_id, session.revision);
        if (Number(revision.changes) !== 1) throw new Error("save_conflict");
        db.prepare("INSERT INTO operation_receipts VALUES(?,?,?,?,?,?,?)").run(operationId, "append_and_activate", session.session_id, reportRefId, "report_saved", session.revision + 1, timestamp);
      });
      input.beforeActivationReadBack?.(operationId);
      return activate(operationId);
    },

    activateExisting(packageId: string, reportRefId: string, operationId: string): PersistedReviewState {
      const state = this.openByPackageId(packageId);
      const session = sessionByPackageId(packageId)!;
      transaction(db, () => {
        db.prepare("INSERT INTO activation_intents VALUES(?,?,?,?,?,?)").run(session.session_id, operationId, session.package_ref_id, reportRefId, session.active_report_ref_id, session.revision);
        db.prepare("INSERT INTO operation_receipts VALUES(?,?,?,?,?,?,?)").run(operationId, "activate", session.session_id, reportRefId, "report_saved", state.revision, now());
      });
      return activate(operationId);
    },

    inspect(packageId: string) {
      const session = sessionByPackageId(packageId);
      if (session === undefined) throw new Error("review_unavailable");
      const refs = db.prepare(`SELECT x.report_ref_id,x.append_ordinal,r.report_id,r.created_at
        FROM session_report_refs x JOIN review_reports r ON r.report_ref_id=x.report_ref_id
        WHERE x.session_id=? ORDER BY x.append_ordinal`).all(session.session_id);
      const intents = db.prepare("SELECT operation_id,target_report_ref_id FROM activation_intents WHERE session_id=?").all(session.session_id);
      const receipts = db.prepare("SELECT operation_id,report_ref_id,state,committed_revision FROM operation_receipts WHERE session_id=? ORDER BY created_at").all(session.session_id);
      const reportRefs = refs.map((row) => ({
        reportRefId: String(row.report_ref_id),
        appendOrdinal: Number(row.append_ordinal),
        reportId: String(row.report_id),
        packageId,
        generatedAt: String(row.created_at),
      }));
      return Object.freeze({ activeReportRefId: session.active_report_ref_id, revision: session.revision, reportRefs, refs, intents, receipts });
    },

    close(): void { db.close(); },
  });
}

export type ReviewSessionRepository = ReturnType<typeof createReviewSessionRepository>;
