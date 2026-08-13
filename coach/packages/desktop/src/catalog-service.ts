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
const RECENT_CATALOG_LIMIT = 30;
const INITIAL_WINDOW_SECONDS = 30 * 24 * 60 * 60;
const MAX_WINDOWS = 8;

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
  cancelAndDrain(): Promise<void>;
  resume(): void;
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
    || typeof catalogStore.replaceSummaries !== "function"
    || typeof catalogStore.list !== "function"
    || typeof sessionFactory !== "function"
    || typeof clock !== "function"
  ) {
    throw invalid();
  }

  let activeSync: Promise<AnalyzableRecordSummary[]> | null = null;
  let activeLobby: MahjongSoulLobbySession | null = null;
  let generation = 0;
  let quiesced = false;

  async function synchronize(expectedGeneration: number): Promise<AnalyzableRecordSummary[]> {
    const stored = await vault.restore();
    if (stored === null || generation !== expectedGeneration) throw invalid();
    let lobby: MahjongSoulLobbySession | null = null;
    try {
      lobby = await sessionFactory(stored);
      activeLobby = lobby;
      if (generation !== expectedGeneration) {
        throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
      }
      const now = clock();
      if (typeof now !== "number" || !Number.isSafeInteger(now) || now < 0) {
        throw invalid();
      }
      let endTime = Math.min(0xffff_ffff, Math.floor(now / 1_000));
      let windowSeconds = INITIAL_WINDOW_SECONDS;
      const entriesById = new Map<string, Awaited<ReturnType<typeof syncRecentCatalog>>["entries"][number]>();
      for (let window = 0; window < MAX_WINDOWS && endTime >= 1; window += 1) {
        const beginTime = Math.max(1, endTime - windowSeconds + 1);
        const result = await syncRecentCatalog({ session: lobby, beginTime, endTime });
        for (const entry of result.entries) {
          const existing = entriesById.get(entry.uuid);
          if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(entry)) {
            throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
          }
          entriesById.set(entry.uuid, entry);
        }
        if (entriesById.size >= RECENT_CATALOG_LIMIT || beginTime === 1) break;
        endTime = beginTime - 1;
        windowSeconds *= 2;
      }
      const entries = [...entriesById.values()]
        .sort((left, right) => right.start_time - left.start_time || left.uuid.localeCompare(right.uuid))
        .slice(0, RECENT_CATALOG_LIMIT);
      if (generation !== expectedGeneration) {
        throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
      }
      const summaries = entries.flatMap((entry) => {
        const result = filterAnalyzableRecord(entry, stored.accountId, now);
        return result.status === "analyzable" ? [result.summary] : [];
      });
      const current = await vault.restore();
      if (
        generation !== expectedGeneration
        || current === null
        || current.accountId !== stored.accountId
      ) {
        throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
      }
      await catalogStore.replaceSummaries(stored.accountId, summaries);
      return await catalogStore.list(stored.accountId);
    } catch (error) {
      if (error instanceof MahjongSoulSourceError) throw error;
      throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
    } finally {
      if (activeLobby === lobby) activeLobby = null;
      if (lobby !== null) await lobby.close();
    }
  }

  return Object.freeze({
    async syncAnalyzableRecords() {
      if (quiesced) {
        throw new MahjongSoulSourceError("mahjong_soul_catalog_sync_failed");
      }
      if (activeSync !== null) return await activeSync;
      const operation = synchronize(generation);
      activeSync = operation;
      try {
        return await operation;
      } finally {
        if (activeSync === operation) activeSync = null;
      }
    },
    async listAnalyzableRecords() {
      const stored = await vault.restore();
      if (stored === null) return [];
      return await catalogStore.list(stored.accountId);
    },
    async cancelAndDrain() {
      quiesced = true;
      generation += 1;
      const operation = activeSync;
      const lobby = activeLobby;
      if (lobby !== null) {
        try {
          await lobby.close();
        } catch {
          // The in-flight operation is still drained below and maps its own error.
        }
      }
      if (operation !== null) {
        try {
          await operation;
        } catch {
          // Cancellation deliberately turns the in-flight result into a fixed failure.
        }
      }
    },
    resume() {
      quiesced = false;
    },
  });
}
