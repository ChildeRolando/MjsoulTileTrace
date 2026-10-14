import type { DatabaseSync } from "node:sqlite";
import { FixedReviewDetailSchema, FixedReviewSnapshotSchema, type FixedReviewDetailDto, type FixedReviewSnapshotDto } from "@riichi-coach/contracts";
import { prepareDiscardLossInput, type DiscardLossInput } from "@riichi-coach/reasoning";
import type { PersistedReviewState } from "./review-session-repository.js";
import { presentFixedReviewDetailFromContext, presentFixedReviewSnapshotFromContext, presentReviewMelds } from "./fixed-review-presenter.js";

// Bump validation when previously accepted evidence must be rechecked; bump
// presentation when DTO projection or discard-loss input semantics change.
export const REVIEW_VALIDATION_VERSION = "validation/1";
export const REVIEW_PRESENTATION_VERSION = `${REVIEW_VALIDATION_VERSION}:presentation/3`;
const PREVIOUS_PRESENTATION_VERSION = "validation/1:presentation/2";
export type ReviewPresentation = {
  sessionId: string;
  revision: number;
  snapshot: FixedReviewSnapshotDto;
  details: FixedReviewDetailDto[];
  lossInputs: Record<string, DiscardLossInput>;
};

/** Disposable derived data owned by the same repository as the source artifacts.
 * Local application writes/revisions are trusted; opening does not audit bytes. */
export function createReviewPresentationCache(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS review_presentation_cache(
    session_id TEXT PRIMARY KEY REFERENCES review_sessions(session_id) ON DELETE CASCADE,
    version TEXT NOT NULL, binding TEXT NOT NULL, payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS package_record_identities(
    package_ref_id TEXT PRIMARY KEY REFERENCES analysis_packages(package_ref_id) ON DELETE CASCADE,
    content_hash TEXT NOT NULL, record_id TEXT NOT NULL
  );`);
  const identity = (packageId: string) => db.prepare(`SELECT s.session_id,s.revision,s.selection_hash,
    s.decision_report_map_hash,p.package_ref_id,p.content_hash,p.schema_version,a.active_report_ref_id
    FROM review_sessions s JOIN analysis_packages p ON p.package_ref_id=s.package_ref_id
    JOIN session_active_report a ON a.session_id=s.session_id WHERE p.package_id=?`).get(packageId);
  const load = (packageId: string): ReviewPresentation | null => {
    const current = identity(packageId);
    if (!current) return null;
    const row = db.prepare("SELECT version,binding,payload FROM review_presentation_cache WHERE session_id=?").get(current.session_id!);
    if (!row || (row.version !== REVIEW_PRESENTATION_VERSION && row.version !== PREVIOUS_PRESENTATION_VERSION)
      || row.binding !== JSON.stringify(current)) return null;
    try {
      const value = JSON.parse(String(row.payload)) as ReviewPresentation;
      value.snapshot = FixedReviewSnapshotSchema.parse(value.snapshot);
      value.details = value.details.map(detail => FixedReviewDetailSchema.parse(detail));
      if (value.sessionId !== current.session_id || value.revision !== current.revision
        || value.snapshot.packageId !== packageId || value.snapshot.activeReportRefId !== current.active_report_ref_id) return null;
      const selected = value.snapshot.selection.items;
      if (value.details.length !== selected.length || value.details.some((detail, index) =>
        detail.packageId !== packageId || detail.decisionId !== selected[index]!.decisionId
        || detail.activeReportRefId !== value.snapshot.activeReportRefId
        || !value.lossInputs?.[detail.decisionId])) return null;
      if (row.version === PREVIOUS_PRESENTATION_VERSION) {
        // v2 already saved validated local facts for discard-loss calculation.
        // Reproject only the new display fields; no package read or graph rebuild.
        value.details = value.details.map(detail => {
          if (!detail.board) return detail;
          const facts = value.lossInputs[detail.decisionId]!.decision?.knownGameFacts;
          if (!facts) throw new Error("presentation_upgrade_unavailable");
          return FixedReviewDetailSchema.parse({ ...detail, board: { ...detail.board, melds: presentReviewMelds(facts) } });
        });
        db.prepare("UPDATE review_presentation_cache SET version=?,payload=? WHERE session_id=? AND version=? AND binding=?")
          .run(REVIEW_PRESENTATION_VERSION, JSON.stringify(value), value.sessionId, row.version!, row.binding!);
      }
      return value;
    } catch { return null; }
  };
  return {
    load,
    save(state: PersistedReviewState): void {
      const pkg = state.analysisPackage;
      const current = identity(pkg.packageId);
      if (!current || current.session_id !== state.sessionId || current.revision !== state.revision) throw new Error("review_changed_during_read");
      db.prepare(`INSERT INTO package_record_identities VALUES(?,?,?) ON CONFLICT(package_ref_id)
        DO UPDATE SET content_hash=excluded.content_hash,record_id=excluded.record_id`)
        .run(current.package_ref_id!, current.content_hash!, pkg.record.recordId);
      const binding = JSON.stringify(current);
      const prior = db.prepare("SELECT version,binding FROM review_presentation_cache WHERE session_id=?").get(state.sessionId);
      if (prior?.version === REVIEW_PRESENTATION_VERSION && prior.binding === binding) return;
      const value: ReviewPresentation = {
        sessionId: state.sessionId, revision: state.revision,
        snapshot: presentFixedReviewSnapshotFromContext(state.readBack, state.activeReportRefId),
        details: state.selection.selected.map(({ decisionId }) => presentFixedReviewDetailFromContext(state.readBack, decisionId, state.activeReportRefId)),
        lossInputs: Object.fromEntries(state.selection.selected.map(({ decisionId }) => [decisionId, prepareDiscardLossInput(pkg, decisionId)])),
      };
      db.prepare(`INSERT INTO review_presentation_cache VALUES(?,?,?,?) ON CONFLICT(session_id)
        DO UPDATE SET version=excluded.version,binding=excluded.binding,payload=excluded.payload`)
        .run(state.sessionId, REVIEW_PRESENTATION_VERSION, binding, JSON.stringify(value));
    },
    invalidate(packageId: string): void {
      const current = identity(packageId);
      if (current) db.prepare("DELETE FROM review_presentation_cache WHERE session_id=?").run(current.session_id!);
    },
  };
}
