import {
  MahjongSoulRecordIdSchema,
  type CanonicalEventStream,
} from "@riichi-coach/contracts";
import {
  filterAnalyzableRecord,
  type MahjongSoulCanonicalMapperResult,
  type MahjongSoulFetchedRecord,
  type MahjongSoulLobbySession,
  type MahjongSoulSessionVault,
  type RawRecordListEntry,
  type StoredMahjongSoulSession,
} from "@riichi-coach/mahjong-soul-source";
import type { ReplayedDecision } from "@riichi-coach/reasoning";

// A one-shot, human-acceptance diagnostic: restore the stored session, sync the
// recent catalog, pick the most recent analyzable record (or a strict
// --record-id), fetch → map → replay → audit, and write a sanitized audit file.
// It never opens a login window: a missing session is a fixed `login_required`.
export type MahjongSoulReplayDiagnosticStatus =
  | "replay_audit_written"
  | "login_required"
  | "session_restore_failed"
  | "catalog_sync_failed"
  | "no_analyzable_record"
  | "record_not_analyzable"
  | "record_fetch_failed"
  | "unsupported_record_semantics"
  | "replay_validation_failed"
  | "audit_write_failed"
  | "inconclusive";

export type MahjongSoulReplayDiagnosticResult = Readonly<{
  readonly status: MahjongSoulReplayDiagnosticStatus;
  readonly auditPath?: string;
}>;

function result(
  status: MahjongSoulReplayDiagnosticStatus,
  auditPath?: string,
): MahjongSoulReplayDiagnosticResult {
  return auditPath === undefined
    ? Object.freeze({ status })
    : Object.freeze({ status, auditPath });
}

export function replayDiagnosticExitCode(
  status: MahjongSoulReplayDiagnosticStatus,
): number {
  switch (status) {
    case "replay_audit_written": return 0;
    case "login_required": return 10;
    case "session_restore_failed": return 11;
    case "catalog_sync_failed": return 12;
    case "no_analyzable_record": return 13;
    case "record_not_analyzable": return 14;
    case "record_fetch_failed": return 15;
    case "unsupported_record_semantics": return 16;
    case "replay_validation_failed": return 17;
    case "audit_write_failed": return 18;
    case "inconclusive": return 29;
  }
}

export interface MahjongSoulReplayDiagnosticPorts {
  readonly vault: MahjongSoulSessionVault;
  readonly createSession: () => Promise<MahjongSoulLobbySession>;
  readonly authenticate: (
    lobby: MahjongSoulLobbySession,
    stored: StoredMahjongSoulSession,
  ) => Promise<"authenticated" | "rejected" | "unverified">;
  readonly syncCatalog: (
    session: MahjongSoulLobbySession,
    now: number,
  ) => Promise<RawRecordListEntry[]>;
  readonly fetchRecord: (
    session: MahjongSoulLobbySession,
    stored: StoredMahjongSoulSession,
    recordId: string,
  ) => Promise<MahjongSoulFetchedRecord>;
  readonly mapRecord: (input: {
    readonly gameId: string;
    readonly selfActor: number;
    readonly recordId: string;
    readonly recordBytes: Uint8Array;
  }) => MahjongSoulCanonicalMapperResult;
  readonly replay: (stream: CanonicalEventStream) => ReplayedDecision[];
  readonly serializeAudit: (
    stream: CanonicalEventStream,
    decisions: readonly ReplayedDecision[],
    recordId: string,
  ) => string;
  readonly writeAudit: (serialized: string, recordId: string) => Promise<string>;
  readonly now: () => number;
  readonly recordId?: string | undefined;
}

function pickEntry(
  entries: readonly RawRecordListEntry[],
  accountId: number,
  now: number,
  recordId: string | undefined,
): { status: "analyzable"; recordId: string; selfSeat: number } | { status: "not_analyzable" } {
  const candidates = [...entries].sort((left, right) =>
    right.start_time - left.start_time || left.uuid.localeCompare(right.uuid)
  );
  if (recordId !== undefined) {
    const entry = candidates.find((candidate) => candidate.uuid === recordId);
    if (entry === undefined) return { status: "not_analyzable" };
    const filtered = filterAnalyzableRecord(entry, accountId, now);
    return filtered.status === "analyzable"
      ? { status: "analyzable", recordId, selfSeat: filtered.summary.selfSeat }
      : { status: "not_analyzable" };
  }
  for (const entry of candidates) {
    const filtered = filterAnalyzableRecord(entry, accountId, now);
    if (filtered.status === "analyzable") {
      return {
        status: "analyzable",
        recordId: entry.uuid,
        selfSeat: filtered.summary.selfSeat,
      };
    }
  }
  return { status: "not_analyzable" };
}

export async function runMahjongSoulReplayDiagnostic(
  ports: MahjongSoulReplayDiagnosticPorts,
): Promise<MahjongSoulReplayDiagnosticResult> {
  const requestedRecordId = ports.recordId;
  if (
    requestedRecordId !== undefined
    && !MahjongSoulRecordIdSchema.safeParse(requestedRecordId).success
  ) {
    return result("record_not_analyzable");
  }

  let stored: StoredMahjongSoulSession | null;
  try {
    stored = await ports.vault.restore();
  } catch {
    return result("login_required");
  }
  if (stored === null) return result("login_required");

  let session: MahjongSoulLobbySession | null = null;
  try {
    try {
      session = await ports.createSession();
    } catch {
      return result("session_restore_failed");
    }
    if (await ports.authenticate(session, stored) !== "authenticated") {
      return result("session_restore_failed");
    }

    const now = ports.now();
    let entries: RawRecordListEntry[];
    try {
      entries = await ports.syncCatalog(session, now);
    } catch {
      return result("catalog_sync_failed");
    }

    const picked = pickEntry(entries, stored.accountId, now, requestedRecordId);
    if (picked.status !== "analyzable") {
      return result(
        requestedRecordId === undefined
          ? "no_analyzable_record"
          : "record_not_analyzable",
      );
    }

    let fetched: MahjongSoulFetchedRecord;
    try {
      fetched = await ports.fetchRecord(session, stored, picked.recordId);
    } catch {
      return result("record_fetch_failed");
    }

    let decisions: ReplayedDecision[];
    let serialized: string;
    try {
      const mapped = ports.mapRecord({
        gameId: `majsoul:${picked.recordId}`,
        selfActor: picked.selfSeat,
        recordId: picked.recordId,
        recordBytes: fetched.recordBytes,
      });
      if (mapped.status !== "ready") {
        return mapped.code === "mahjong_soul_canonical_unsupported_semantics"
          ? result("unsupported_record_semantics")
          : result("replay_validation_failed");
      }
      decisions = ports.replay(mapped.stream);
      serialized = ports.serializeAudit(mapped.stream, decisions, picked.recordId);
    } catch {
      return result("replay_validation_failed");
    }

    let auditPath: string;
    try {
      auditPath = await ports.writeAudit(serialized, picked.recordId);
    } catch {
      return result("audit_write_failed");
    }
    return result("replay_audit_written", auditPath);
  } catch {
    return result("inconclusive");
  } finally {
    if (session !== null) {
      try {
        await session.close();
      } catch {
        // A diagnostic result never exposes transport shutdown details.
      }
    }
  }
}
