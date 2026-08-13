import {
  MahjongSoulSourceError,
  type MahjongSoulCatalogStore,
  type MahjongSoulFetchedRecord,
  type MahjongSoulLobbySession,
  type MahjongSoulSessionVault,
  type StoredMahjongSoulSession,
} from "@riichi-coach/mahjong-soul-source";

const RECORD_ID = /^\d{6}-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;

export interface MahjongSoulRecordIngestionService {
  ingest(recordId: string): Promise<MahjongSoulFetchedRecord>;
}

function error(code: "mahjong_soul_record_not_analyzable" | "mahjong_soul_record_fetch_failed") {
  return new MahjongSoulSourceError(code);
}

export function createMahjongSoulRecordIngestionService(input: {
  readonly vault: MahjongSoulSessionVault;
  readonly catalogStore: MahjongSoulCatalogStore;
  readonly createSession: () => Promise<MahjongSoulLobbySession>;
  readonly authenticate: (
    lobby: MahjongSoulLobbySession,
    stored: StoredMahjongSoulSession,
  ) => Promise<"authenticated" | "rejected" | "unverified">;
  readonly fetchRecord: (
    lobby: MahjongSoulLobbySession,
    stored: StoredMahjongSoulSession,
    recordId: string,
  ) => Promise<MahjongSoulFetchedRecord>;
}): MahjongSoulRecordIngestionService {
  const active = new Map<string, Promise<MahjongSoulFetchedRecord>>();
  return Object.freeze({
    ingest(recordId: string): Promise<MahjongSoulFetchedRecord> {
      const existing = active.get(recordId);
      if (existing !== undefined) return existing;
      const operation = (async () => {
        if (typeof recordId !== "string" || !RECORD_ID.test(recordId)) {
          throw error("mahjong_soul_record_not_analyzable");
        }
        const stored = await input.vault.restore();
        if (stored === null) throw error("mahjong_soul_record_not_analyzable");
        const summaries = await input.catalogStore.list(stored.accountId);
        if (!summaries.some((entry) => entry.recordId === recordId)) {
          throw error("mahjong_soul_record_not_analyzable");
        }
        let lobby: MahjongSoulLobbySession | null = null;
        try {
          lobby = await input.createSession();
          if (await input.authenticate(lobby, stored) !== "authenticated") {
            throw error("mahjong_soul_record_fetch_failed");
          }
          return await input.fetchRecord(lobby, stored, recordId);
        } catch (cause) {
          if (cause instanceof MahjongSoulSourceError) throw cause;
          throw error("mahjong_soul_record_fetch_failed");
        } finally {
          if (lobby !== null) await lobby.close().catch(() => undefined);
        }
      })().finally(() => {
        if (active.get(recordId) === operation) active.delete(recordId);
      });
      active.set(recordId, operation);
      return operation;
    },
  });
}
