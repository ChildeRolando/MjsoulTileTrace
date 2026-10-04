import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  AnalyzableRecordSummarySchema,
  MahjongSoulRecordIdSchema,
  RecordLabelSchema,
  type AnalyzableRecordSummary,
  type RecordLabel,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import type { ReviewSessionSummary } from "./review-session-repository.js";

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

function catalogRecordId(recordId: string): string | null {
  if (MahjongSoulRecordIdSchema.safeParse(recordId).success) return recordId;
  const prefix = "majsoul:";
  if (!recordId.startsWith(prefix)) return null;
  const rawRecordId = recordId.slice(prefix.length);
  return MahjongSoulRecordIdSchema.safeParse(rawRecordId).success ? rawRecordId : null;
}

function sameRecordId(left: string, right: string): boolean {
  const normalizedLeft = catalogRecordId(left);
  const normalizedRight = catalogRecordId(right);
  if (normalizedLeft !== null && normalizedRight !== null) return normalizedLeft === normalizedRight;
  return left === right;
}

function dateFromMahjongSoulRecordId(recordId: string): string | null {
  const rawRecordId = catalogRecordId(recordId);
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

function labelFromSummary(summary: AnalyzableRecordSummary): RecordLabel {
  const started = formatLocalStart(summary.startedAt);
  const title = started === null
    ? `雀魂牌谱 · ${summary.rule.displayLabel}`
    : `${started} · ${summary.rule.displayLabel}`;
  return RecordLabelSchema.parse({
    title,
    recordId: summary.recordId,
    selfSeat: summary.selfSeat,
    startedAt: summary.startedAt,
    players: summary.players.map(player => ({
      seat: player.seat,
      displayName: player.displayName,
      finalScore: player.finalScore,
      rank: player.rank,
    })),
  });
}

function labelWithoutCatalog(recordId: string, selfSeat: number): RecordLabel {
  const date = dateFromMahjongSoulRecordId(recordId);
  return RecordLabelSchema.parse({
    title: date === null ? "雀魂牌谱 · 日期未知" : `雀魂牌谱 · ${date}`,
    recordId,
    selfSeat,
    startedAt: null,
    players: unknownPlayers(),
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
    },

    observePackage(pkg) {
      if (db === null || !isPackageLabelIdentity(pkg)) return;
      const identity = PackageLabelIdentitySchema.parse({
        packageId: pkg.packageId,
        recordId: pkg.record.recordId,
        selfActor: pkg.record.selfActor,
      });
      const sourceRecordId = catalogRecordId(identity.recordId);
      const summary = sourceRecordId === null ? undefined : catalogByRecordId.get(sourceRecordId);
      const label = summary !== undefined && summary.selfSeat === identity.selfActor
        ? labelFromSummary(summary)
        : labelWithoutCatalog(identity.recordId, identity.selfActor);
      try {
        const rows = db.prepare(`SELECT s.session_id,s.package_ref_id
          FROM review_sessions s JOIN analysis_packages p ON p.package_ref_id=s.package_ref_id
          WHERE p.package_id=? LIMIT 2`).all(identity.packageId) as Array<{ session_id: string; package_ref_id: string }>;
        if (rows.length !== 1) return;
        const row = rows[0]!;
        const existing = db.prepare(`SELECT label_payload FROM review_session_labels
          WHERE session_id=? AND package_ref_id=?`).get(row.session_id, row.package_ref_id) as { label_payload: string } | undefined;
        if (existing !== undefined) {
          const parsedExisting = RecordLabelSchema.safeParse(JSON.parse(existing.label_payload));
          if (!parsedExisting.success
            || parsedExisting.data.recordId === null
            || !sameRecordId(parsedExisting.data.recordId, identity.recordId)
            || parsedExisting.data.selfSeat !== identity.selfActor) return;
          if (summary === undefined || summary.selfSeat !== identity.selfActor) return;
        }
        const payload = JSON.stringify(label);
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
      if (db !== null) {
        try {
          const row = db.prepare(`SELECT l.label_payload FROM review_session_labels l
            JOIN review_sessions s ON s.session_id=l.session_id AND s.package_ref_id=l.package_ref_id
            JOIN analysis_packages p ON p.package_ref_id=s.package_ref_id
            WHERE s.session_id=? AND p.package_id=?`).get(summary.sessionId, summary.packageId) as { label_payload: string } | undefined;
          if (row !== undefined) {
            const parsed = RecordLabelSchema.safeParse(JSON.parse(row.label_payload));
            if (parsed.success) return Object.freeze({ ...summary, recordLabel: parsed.data });
          }
        } catch {
          // Older/corrupt optional labels fall back without reading package bytes.
        }
      }
      return Object.freeze({ ...summary, recordLabel: labelForMissingSessionDate(summary.updatedAt) });
    },

    close() {
      try { db?.close(); } catch { /* Shutdown should not hide a usable saved session. */ }
      db = null;
      catalogByRecordId = new Map();
    },
  };
  return Object.freeze(store);
}
