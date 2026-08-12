import { describe, expect, it } from "vitest";
import {
  MAHJONG_SOUL_CN_CLIENT_VERSION,
  MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION,
  SecretString,
  type MahjongSoulCatalogStore,
  type MahjongSoulLobbySession,
  type MahjongSoulSessionVault,
  type RawRecordListEntry,
  type StoredMahjongSoulSession,
} from "@riichi-coach/mahjong-soul-source";
import { createMahjongSoulCatalogService } from "../src/catalog-service.js";

const firstId = "260811-00000000-0000-0000-0000-000000000001";
const secondId = "260811-00000000-0000-0000-0000-000000000002";

function rawEntry(id: string): RawRecordListEntry {
  return {
    version: 1,
    uuid: id,
    start_time: 1_000,
    end_time: 2_000,
    tag: 0,
    subtag: 0,
    players: [
      { rank: 1, account_id: 101, nickname: "A", seat: 0, point: 32_000 },
      { rank: 2, account_id: 102, nickname: "B", seat: 1, point: 27_000 },
      { rank: 3, account_id: 103, nickname: "C", seat: 2, point: 23_000 },
      { rank: 4, account_id: 104, nickname: "D", seat: 3, point: 18_000 },
    ],
    standard_rule: 0,
  };
}

const storedSession: StoredMahjongSoulSession = {
  region: "cn",
  loginMethod: "oauth2Login",
  authType: 7,
  accountId: 103,
  displayName: "C",
  accessToken: SecretString.from("fake-access-token"),
  adapterVersion: MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION,
  clientVersion: MAHJONG_SOUL_CN_CLIENT_VERSION,
  createdAt: 1,
  lastValidatedAt: 1,
};

class FakeCatalogStore implements MahjongSoulCatalogStore {
  summaries: import("@riichi-coach/contracts").AnalyzableRecordSummary[] = [];
  async mergeSummaries(next: readonly import("@riichi-coach/contracts").AnalyzableRecordSummary[]) {
    this.summaries = [...next];
  }
  async list() {
    return this.summaries;
  }
  async clear() {
    this.summaries = [];
  }
}

function vaultReturning(session: StoredMahjongSoulSession | null): MahjongSoulSessionVault {
  return {
    async restore() {
      return session;
    },
    async save() {},
    async markValidated() {},
    async clear() {},
  } as MahjongSoulSessionVault;
}

function lobbyReturning(
  entries: RawRecordListEntry[],
  options: { failSync?: boolean } = {},
): { lobby: MahjongSoulLobbySession; closed: () => boolean } {
  let isClosed = false;
  const lobby: MahjongSoulLobbySession = {
    async authenticate() {},
    async call(method) {
      if (options.failSync) throw new Error("boom");
      if (method === ".lq.Lobby.fetchGameRecordListV2") {
        return { iterator: "iter-1" };
      }
      return { next: false, entries };
    },
    async close() {
      isClosed = true;
    },
  };
  return { lobby, closed: () => isClosed };
}

describe("Mahjong Soul catalog service", () => {
  it("syncs, filters, and merges analyzable entries only", async () => {
    const store = new FakeCatalogStore();
    const { lobby, closed } = lobbyReturning([
      rawEntry(firstId),
      { ...rawEntry(secondId), version: 9 },
    ]);
    const service = createMahjongSoulCatalogService({
      vault: vaultReturning(storedSession),
      catalogStore: store,
      sessionFactory: async () => lobby,
      clock: () => 5_000,
    });

    const summaries = await service.syncAnalyzableRecords();
    expect(summaries.map((entry) => entry.recordId)).toEqual([firstId]);
    expect(store.summaries.map((entry) => entry.recordId)).toEqual([firstId]);
    expect(closed()).toBe(true);
  });

  it("fails closed when no session is restored", async () => {
    const store = new FakeCatalogStore();
    const { lobby } = lobbyReturning([]);
    const service = createMahjongSoulCatalogService({
      vault: vaultReturning(null),
      catalogStore: store,
      sessionFactory: async () => lobby,
      clock: () => 5_000,
    });
    await expect(service.syncAnalyzableRecords())
      .rejects.toThrow("mahjong_soul_session_invalid");
  });

  it("maps a sync failure to a fixed code and still closes the lobby", async () => {
    const store = new FakeCatalogStore();
    const { lobby, closed } = lobbyReturning([], { failSync: true });
    const service = createMahjongSoulCatalogService({
      vault: vaultReturning(storedSession),
      catalogStore: store,
      sessionFactory: async () => lobby,
      clock: () => 5_000,
    });
    await expect(service.syncAnalyzableRecords())
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
    expect(closed()).toBe(true);
  });

  it("lists the stored catalog without re-syncing", async () => {
    const store = new FakeCatalogStore();
    const { lobby } = lobbyReturning([rawEntry(firstId)]);
    const service = createMahjongSoulCatalogService({
      vault: vaultReturning(storedSession),
      catalogStore: store,
      sessionFactory: async () => lobby,
      clock: () => 5_000,
    });
    await service.syncAnalyzableRecords();
    const listed = await service.listAnalyzableRecords();
    expect(listed.map((entry) => entry.recordId)).toEqual([firstId]);
  });

  it("never exposes the token or account id in results", async () => {
    const store = new FakeCatalogStore();
    const { lobby } = lobbyReturning([rawEntry(firstId)]);
    const service = createMahjongSoulCatalogService({
      vault: vaultReturning(storedSession),
      catalogStore: store,
      sessionFactory: async () => lobby,
      clock: () => 5_000,
    });
    const summaries = await service.syncAnalyzableRecords();
    const serialized = JSON.stringify(summaries);
    expect(serialized).not.toContain("fake-access-token");
    expect(serialized).not.toContain("103");
  });
});
