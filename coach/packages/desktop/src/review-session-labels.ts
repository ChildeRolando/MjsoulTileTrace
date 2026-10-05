import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isMainThread } from "node:worker_threads";
import { z } from "zod";
import {
  AnalyzableRecordSummarySchema,
  MahjongSoulRecordIdSchema,
  RecordLabelSchema,
  type AnalyzableRecordSummary,
  type RecordLabel,
  type RecordLabelMortalAgreement,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import type { ReviewSessionSummary } from "./review-session-repository.js";
import { readPackageMortalAgreementMetadata } from "./package-artifact-storage.js";
import { summarizeMortalAgreement } from "./record-mortal-agreement.js";

const PackageLabelIdentitySchema = z.object({
  packageId: z.string().min(1).max(200),
  recordId: z.string().min(1).max(128),
  selfActor: z.number().int().min(0).max(3),
}).strict();

export type ReviewSessionLabelStore = Readonly<{
  rememberCatalog(summaries: readonly AnalyzableRecordSummary[]): void;
  observePackage(pkg: StructuredAnalysisPackage): void;
  enrichSession(summary: ReviewSessionSummary): ReviewSessionSummary & { recordLabel: RecordLabel };
  close(): void;
}>;

function unknownPlayers() {
  return Array.from({ length: 4 }, (_, seat) => ({
    seat,
    displayName: null,
    finalScore: null,
    rank: null,
  }));
}

function formatLocalStart(startedAt: number): string | null {
  const date = new Date(startedAt * 1_000);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function packageCatalogRecordId(recordId: string): string | null {
  const prefix = "majsoul:";
  if (!recordId.startsWith(prefix)) return null;
  const rawRecordId = recordId.slice(prefix.length);
  return MahjongSoulRecordIdSchema.safeParse(rawRecordId).success ? rawRecordId : null;
}

function sameRecordId(left: string, right: string): boolean {
  // `right` is the actual loaded package identity. A legacy raw-ID sidecar
  // may be retained only after that package establishes its majsoul namespace.
  const sourceRecordId = packageCatalogRecordId(right);
  return left === right || (sourceRecordId !== null && left === sourceRecordId);
}

function dateFromMahjongSoulRecordId(recordId: string): string | null {
  const rawRecordId = packageCatalogRecordId(recordId);
  if (rawRecordId === null) return null;
  const match = /^(\d{2})(\d{2})(\d{2})-/u.exec(rawRecordId);
  if (match === null) return null;
  const year = 2_000 + Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function labelFromSummary(summary: AnalyzableRecordSummary, packageRecordId = summary.recordId): RecordLabel {
  const started = formatLocalStart(summary.startedAt);
  const title = started === null
    ? `雀魂牌谱 · ${summary.rule.displayLabel}`
    : `${started} · ${summary.rule.displayLabel}`;
  return RecordLabelSchema.parse({
    title,
    recordId: packageRecordId,
    selfSeat: summary.selfSeat,
    startedAt: summary.startedAt,
    players: summary.players.map(player => ({
      seat: player.seat,
      displayName: player.displayName,
      finalScore: player.finalScore,
      rank: player.rank,
      gradingScore: player.gradingScore,
      gradingScoreUnit: player.gradingScoreUnit,
    })),
    rankedMode: summary.rankedMode,
    mortalAgreementStatus: "not_applicable",
    mortalAgreement: null,
  });
}

function labelWithMortalAgreement(
  label: RecordLabel,
  status: RecordLabel["mortalAgreementStatus"],
  agreement: RecordLabelMortalAgreement | null,
): RecordLabel {
  return RecordLabelSchema.parse({
    ...label,
    mortalAgreementStatus: status,
    mortalAgreement: agreement,
  });
}

function labelWithoutCatalog(recordId: string, selfSeat: number): RecordLabel {
  const rawRecordId = packageCatalogRecordId(recordId);
  const date = rawRecordId === null ? null : dateFromMahjongSoulRecordId(recordId);
  return RecordLabelSchema.parse({
    title: rawRecordId === null
      ? "牌谱 · 日期未知"
      : date === null ? "雀魂牌谱 · 日期未知" : `雀魂牌谱 · ${date}`,
    recordId,
    selfSeat,
    startedAt: null,
    players: unknownPlayers(),
    rankedMode: null,
    mortalAgreementStatus: "pending",
    mortalAgreement: null,
  });
}

function labelForMissingSessionDate(updatedAt: string): RecordLabel {
  const date = /^\d{4}-\d{2}-\d{2}$/u.test(updatedAt.slice(0, 10))
    ? updatedAt.slice(0, 10)
    : "日期未知";
  return RecordLabelSchema.parse({
    title: `牌谱复盘 · 保存于 ${date}`,
    recordId: null,
    selfSeat: null,
    startedAt: null,
    players: unknownPlayers(),
    rankedMode: null,
    mortalAgreementStatus: "not_applicable",
    mortalAgreement: null,
  });
}

function isPackageLabelIdentity(pkg: StructuredAnalysisPackage): boolean {
  if (pkg === null || typeof pkg !== "object" || pkg.record === null || typeof pkg.record !== "object") return false;
  return PackageLabelIdentitySchema.safeParse({
    packageId: pkg.packageId,
    recordId: pkg.record.recordId,
    selfActor: pkg.record.selfActor,
  }).success;
}

function readStoredLabel(payload: string | null | undefined): RecordLabel | null {
  if (payload === null || payload === undefined) return null;
  try {
    const parsed = RecordLabelSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The label table is a presentation-only sidecar. It deliberately reads the
 * package/session index, never package payloads, while enriching session lists.
 */
export function createReviewSessionLabelStore(input: { readonly root: string }): ReviewSessionLabelStore {
  const databasePath = join(input.root, "library.sqlite");
  let db: DatabaseSync | null = null;
  try {
    if (existsSync(databasePath)) {
      db = new DatabaseSync(databasePath);
      db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;");
      db.exec(`CREATE TABLE IF NOT EXISTS review_session_labels(
        session_id TEXT NOT NULL,
        package_ref_id TEXT NOT NULL,
        label_payload TEXT NOT NULL CHECK(length(label_payload)<=8192),
        PRIMARY KEY(session_id,package_ref_id),
        FOREIGN KEY(session_id,package_ref_id)
          REFERENCES review_sessions(session_id,package_ref_id) ON DELETE CASCADE
      );`);
    }
  } catch {
    try { db?.close(); } catch { /* Keep display metadata optional. */ }
    db = null;
  }

  let catalogByRecordId = new Map<string, AnalyzableRecordSummary>();
  type BackfillSession = Pick<ReviewSessionSummary, "sessionId" | "packageId" | "updatedAt">;
  const backfillQueue: BackfillSession[] = [];
  const queuedBackfills = new Set<string>();
  let backfillRunning = false;

  const enqueueBackfill = (summary: ReviewSessionSummary): void => {
    // listReviewSessions runs in coach-service-worker's Node Worker. Guard the
    // storage scan here as well so a future main-process caller can never
    // synchronously walk package chunks on Electron's UI thread.
    if (isMainThread || db === null) return;
    const key = `${summary.sessionId}\0${summary.packageId}`;
    if (queuedBackfills.has(key)) return;
    queuedBackfills.add(key);
    backfillQueue.push({ sessionId: summary.sessionId, packageId: summary.packageId, updatedAt: summary.updatedAt });
    if (!backfillRunning) {
      backfillRunning = true;
      setImmediate(runNextBackfill);
    }
  };

  const writeBackfillLabel = (
    summary: BackfillSession,
    label: RecordLabel,
    database: DatabaseSync,
  ): void => {
    const row = database.prepare(`SELECT s.package_ref_id FROM review_sessions s
      JOIN analysis_packages p ON p.package_ref_id=s.package_ref_id
      WHERE s.session_id=? AND p.package_id=?`).get(summary.sessionId, summary.packageId) as { package_ref_id: string } | undefined;
    if (row === undefined) return;
    const payload = JSON.stringify(label);
    database.prepare(`INSERT INTO review_session_labels(session_id,package_ref_id,label_payload)
      VALUES(?,?,?) ON CONFLICT(session_id,package_ref_id) DO UPDATE SET label_payload=excluded.label_payload`)
      .run(summary.sessionId, row.package_ref_id, payload);
  };

  function runNextBackfill(): void {
    const summary = backfillQueue.shift();
    if (summary === undefined || db === null) {
      backfillRunning = false;
      return;
    }
    const database = db;
    const key = `${summary.sessionId}\0${summary.packageId}`;
    try {
      const row = database.prepare(`SELECT p.package_ref_id,p.payload,p.content_hash,
          p.package_id,p.schema_version
        FROM review_sessions s JOIN analysis_packages p ON p.package_ref_id=s.package_ref_id
        WHERE s.session_id=? AND p.package_id=?`).get(summary.sessionId, summary.packageId) as {
          package_ref_id: string; payload: Uint8Array; content_hash: string; package_id: string; schema_version: string;
        } | undefined;
      if (row === undefined) throw new Error("package_identity_missing");
      const metadata = readPackageMortalAgreementMetadata(database, row);
      const currentRow = database.prepare(`SELECT label_payload FROM review_session_labels
        WHERE session_id=? AND package_ref_id=?`).get(summary.sessionId, row.package_ref_id) as { label_payload: string } | undefined;
      const current = readStoredLabel(currentRow?.label_payload);
      const identity = PackageLabelIdentitySchema.safeParse({
        packageId: summary.packageId,
        recordId: metadata.record.recordId,
        selfActor: metadata.record.selfActor,
      });
      if (!identity.success) throw new Error("package_identity_missing");
      const sourceRecordId = packageCatalogRecordId(identity.data.recordId);
      const catalogSummary = sourceRecordId === null ? undefined : catalogByRecordId.get(sourceRecordId);
      const currentIdMatchesPackage = current !== null && (
        current.recordId === identity.data.recordId
        || (sourceRecordId !== null && current.recordId === sourceRecordId)
      );
      const currentMatchesPackage = currentIdMatchesPackage && current?.selfSeat === identity.data.selfActor;
      const preservedCurrent = currentMatchesPackage && current !== null
        ? RecordLabelSchema.parse({ ...current, recordId: identity.data.recordId })
        : null;
      const base = catalogSummary !== undefined && catalogSummary.selfSeat === identity.data.selfActor
        ? labelFromSummary(catalogSummary, identity.data.recordId)
        : preservedCurrent !== null
          ? preservedCurrent
          : labelWithoutCatalog(identity.data.recordId, identity.data.selfActor);
      writeBackfillLabel(summary, labelWithMortalAgreement(base, "ready", metadata.agreement), database);
    } catch {
      try {
        if (db !== database) throw new Error("label_store_closed");
        const packageRow = database.prepare(`SELECT p.package_ref_id FROM review_sessions s
          JOIN analysis_packages p ON p.package_ref_id=s.package_ref_id
          WHERE s.session_id=? AND p.package_id=?`).get(summary.sessionId, summary.packageId) as { package_ref_id: string } | undefined;
        if (packageRow !== undefined) {
          const currentRow = database.prepare(`SELECT label_payload FROM review_session_labels
            WHERE session_id=? AND package_ref_id=?`).get(summary.sessionId, packageRow.package_ref_id) as { label_payload: string } | undefined;
          const parsed = readStoredLabel(currentRow?.label_payload);
          const base = parsed !== null
            ? parsed
            : labelWithMortalAgreement(labelForMissingSessionDate(summary.updatedAt), "pending", null);
          if (base.mortalAgreementStatus === "pending") {
            writeBackfillLabel(summary, labelWithMortalAgreement(base, "unavailable", null), database);
          }
        }
      } catch {
        // A missing/corrupt optional label cannot hide the saved review.
      }
    } finally {
      queuedBackfills.delete(key);
      if (backfillQueue.length === 0) backfillRunning = false;
      else setImmediate(runNextBackfill);
    }
  }

  const store: ReviewSessionLabelStore = {
    rememberCatalog(summaries) {
      const next = new Map<string, AnalyzableRecordSummary>();
      const ambiguous = new Set<string>();
      for (const candidate of summaries) {
        const parsed = AnalyzableRecordSummarySchema.safeParse(candidate);
        if (!parsed.success) continue;
        if (ambiguous.has(parsed.data.recordId)) continue;
        const existing = next.get(parsed.data.recordId);
        if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(parsed.data)) {
          next.delete(parsed.data.recordId);
          ambiguous.add(parsed.data.recordId);
          continue;
        }
        if (!next.has(parsed.data.recordId)) next.set(parsed.data.recordId, parsed.data);
      }
      catalogByRecordId = next;
      if (db !== null) {
        try {
          const rows = db.prepare(`SELECT session_id,package_ref_id,label_payload
            FROM review_session_labels`).all() as Array<{
              session_id: string; package_ref_id: string; label_payload: string;
            }>;
          for (const row of rows) {
            const existing = readStoredLabel(row.label_payload);
            if (existing === null || existing.recordId === null || existing.selfSeat === null) continue;
            const recordId = packageCatalogRecordId(existing.recordId);
            if (recordId === null) continue;
            const summary = next.get(recordId);
            if (summary === undefined || summary.selfSeat !== existing.selfSeat) continue;
            const refreshed = labelWithMortalAgreement(
              labelFromSummary(summary, existing.recordId),
              existing.mortalAgreementStatus,
              existing.mortalAgreement,
            );
            const payload = JSON.stringify(refreshed);
            if (payload !== row.label_payload) {
              db.prepare(`UPDATE review_session_labels SET label_payload=?
                WHERE session_id=? AND package_ref_id=?`).run(payload, row.session_id, row.package_ref_id);
            }
          }
        } catch {
          // A presentation-only refresh never blocks catalog synchronization.
        }
      }
    },

    observePackage(pkg) {
      if (db === null || !isPackageLabelIdentity(pkg)) return;
      const identity = PackageLabelIdentitySchema.parse({
        packageId: pkg.packageId,
        recordId: pkg.record.recordId,
        selfActor: pkg.record.selfActor,
      });
      const sourceRecordId = packageCatalogRecordId(identity.recordId);
      const summary = sourceRecordId === null ? undefined : catalogByRecordId.get(sourceRecordId);
      const label = summary !== undefined && summary.selfSeat === identity.selfActor
        ? labelFromSummary(summary, identity.recordId)
        : labelWithoutCatalog(identity.recordId, identity.selfActor);
      let storedLabel = label;
      try {
        storedLabel = labelWithMortalAgreement(label, "ready", summarizeMortalAgreement(pkg.decisions));
      } catch {
        storedLabel = labelWithMortalAgreement(label, "unavailable", null);
      }
      try {
        const rows = db.prepare(`SELECT s.session_id,s.package_ref_id
          FROM review_sessions s JOIN analysis_packages p ON p.package_ref_id=s.package_ref_id
          WHERE p.package_id=? LIMIT 2`).all(identity.packageId) as Array<{ session_id: string; package_ref_id: string }>;
        if (rows.length !== 1) return;
        const row = rows[0]!;
        const existing = db.prepare(`SELECT label_payload FROM review_session_labels
          WHERE session_id=? AND package_ref_id=?`).get(row.session_id, row.package_ref_id) as { label_payload: string } | undefined;
        if (existing !== undefined) {
          const parsedExisting = readStoredLabel(existing.label_payload);
          if (parsedExisting !== null
            && parsedExisting.recordId !== null
            && sameRecordId(parsedExisting.recordId, identity.recordId)
            && parsedExisting.selfSeat === identity.selfActor
            && (summary === undefined || summary.selfSeat !== identity.selfActor)) {
            storedLabel = labelWithMortalAgreement(
              RecordLabelSchema.parse({ ...parsedExisting, recordId: identity.recordId }),
              storedLabel.mortalAgreementStatus,
              storedLabel.mortalAgreement,
            );
          }
        }
        const payload = JSON.stringify(storedLabel);
        if (existing === undefined) {
          db.prepare(`INSERT INTO review_session_labels(session_id,package_ref_id,label_payload)
            VALUES(?,?,?)`).run(row.session_id, row.package_ref_id, payload);
        } else if (existing.label_payload !== payload) {
          db.prepare(`UPDATE review_session_labels SET label_payload=?
            WHERE session_id=? AND package_ref_id=?`).run(payload, row.session_id, row.package_ref_id);
        }
      } catch {
        // Metadata storage is optional; session/package availability is owned elsewhere.
      }
    },

    enrichSession(summary) {
      let label = labelForMissingSessionDate(summary.updatedAt);
      let needsBackfill = false;
      if (db !== null) {
        try {
          const row = db.prepare(`SELECT l.label_payload FROM review_session_labels l
            JOIN review_sessions s ON s.session_id=l.session_id AND s.package_ref_id=l.package_ref_id
            JOIN analysis_packages p ON p.package_ref_id=s.package_ref_id
            WHERE s.session_id=? AND p.package_id=?`).get(summary.sessionId, summary.packageId) as { label_payload: string } | undefined;
          if (row !== undefined) {
            const parsed = readStoredLabel(row.label_payload);
            if (parsed !== null) {
              label = parsed;
              const rawSidecarId = MahjongSoulRecordIdSchema.safeParse(label.recordId);
              const cachedCatalog = rawSidecarId.success ? catalogByRecordId.get(rawSidecarId.data) : undefined;
              const requiresCanonicalIdentityRecovery = cachedCatalog !== undefined
                && cachedCatalog.selfSeat === label.selfSeat
                && label.mortalAgreementStatus === "not_applicable";
              needsBackfill = label.mortalAgreementStatus === "pending" || requiresCanonicalIdentityRecovery;
              if (requiresCanonicalIdentityRecovery) {
                label = labelWithMortalAgreement(label, "pending", null);
              }
              if (!needsBackfill) return Object.freeze({ ...summary, recordLabel: label });
            } else {
              label = labelWithMortalAgreement(label, "pending", null);
              needsBackfill = true;
            }
          } else {
            label = labelWithMortalAgreement(label, "pending", null);
            needsBackfill = true;
          }
        } catch {
          // Older/corrupt optional labels fall back to a safe async backfill.
          label = labelWithMortalAgreement(label, "pending", null);
          needsBackfill = true;
        }
      }
      if (needsBackfill) {
        if (db !== null) {
          try { writeBackfillLabel(summary, label, db); } catch { /* The next worker read retries this small sidecar write. */ }
        }
        enqueueBackfill(summary);
      }
      return Object.freeze({ ...summary, recordLabel: label });
    },

    close() {
      try { db?.close(); } catch { /* Shutdown should not hide a usable saved session. */ }
      db = null;
      catalogByRecordId = new Map();
      backfillQueue.splice(0);
      queuedBackfills.clear();
    },
  };
  return Object.freeze(store);
}
