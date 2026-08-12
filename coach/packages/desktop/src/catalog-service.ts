import type { AnalyzableRecordSummary } from "@riichi-coach/contracts";
import {
  MahjongSoulSourceError,
  filterAnalyzableRecord,
  syncRecentCatalog,
  type MahjongSoulCatalogStore,
  type MahjongSoulLobbySession,
  type MahjongSoulSessionVault,
  type StoredMahjongSoulSession,
} from "@riichi-coach/mahjong-soul-source";

const SESSION_INVALID = "mahjong_soul_session_invalid" as const;

export interface MahjongSoulCatalogServiceInput {
  readonly vault: MahjongSoulSessionVault;
  readonly catalogStore: MahjongSoulCatalogStore;
  readonly sessionFactory: (
    session: StoredMahjongSoulSession,
  ) => Promise<MahjongSoulLobbySession>;
  readonly clock: () => number;
}

export interface MahjongSoulCatalogService {
  syncAnalyzableRecords(): Promise<AnalyzableRecordSummary[]>;
  listAnalyzableRecords(): Promise<AnalyzableRecordSummary[]>;
}

function invalid(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(SESSION_INVALID);
}

function isObjectLike(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createMahjongSoulCatalogService(
  input: MahjongSoulCatalogServiceInput,
): MahjongSoulCatalogService {
  const vault = input.vault;
  const catalogStore = input.catalogStore;
  const sessionFactory = input.sessionFactory;
  const clock = input.clock;
  if (
    !isObjectLike(vault)
    || typeof vault.restore !== "function"
    || !isObjectLike(catalogStore)
    || typeof catalogStore.mergeSummaries !== "function"
    || typeof catalogStore.list !== "function"
    || typeof sessionFactory !== "function"
    || typeof clock !== "function"
  ) {
    throw invalid();
  }

  return Object.freeze({
    async syncAnalyzableRecords() {
      const stored = await vault.restore();
      if (stored === null) throw invalid();
      const lobby = await sessionFactory(stored);
      try {
        const { entries } = await syncRecentCatalog({ session: lobby });
        const now = clock();
        if (typeof now !== "number" || !Number.isSafeInteger(now) || now < 0) {
          throw invalid();
        }
        const summaries = entries.flatMap((entry) => {
          const result = filterAnalyzableRecord(entry, stored.accountId, now);
          return result.status === "analyzable" ? [result.summary] : [];
        });
        await catalogStore.mergeSummaries(summaries);
        return summaries;
      } catch (error) {
        if (error instanceof MahjongSoulSourceError) throw error;
        throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
      } finally {
        await lobby.close();
      }
    },
    async listAnalyzableRecords() {
      return await catalogStore.list();
    },
  });
}
