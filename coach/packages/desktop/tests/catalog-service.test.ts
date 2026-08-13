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
    version: 210715,
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
    standard_rule: 2,
    game_mode: 2,
    game_mode_ai: false,
    game_mode_extendinfo: "",
    game_mode_detail_rule_present: false,
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
  accountId: number | null = null;
  async replaceSummaries(accountId: number, next: readonly import("@riichi-coach/contracts").AnalyzableRecordSummary[]) {
    this.accountId = accountId;
    this.summaries = [...next];
  }
  async list(accountId: number) {
    return this.accountId === accountId ? this.summaries : [];
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
    async call(method, payload) {
      if (options.failSync) throw new Error("boom");
      if (method === ".lq.Lobby.fetchGameRecordListV2") {
        return {
          iterator: "iter-1",
          iterator_expire: 600,
          actual_begin_time: payload.begin_time,
          actual_end_time: payload.end_time,
        };
      }
      if (method === ".lq.Lobby.fetchNextGameRecordList") {
        return { next: false, entries, iterator_expire: 600 };
      }
      if (method === ".lq.Lobby.fetchGameRecordsDetail") {
        return {
          record_list: entries.map((entry) => ({
            uuid: entry.uuid,
            standard_rule: entry.standard_rule,
            config: { mode: {
              mode: entry.game_mode,
              ai: entry.game_mode_ai,
              extendinfo: entry.game_mode_extendinfo,
              detail_rule: null,
            } },
          })),
        };
      }
      throw new Error("unexpected method");
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
      clock: () => 2_000_000,
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
      clock: () => 2_000_000,
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
      clock: () => 2_000_000,
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
      clock: () => 2_000_000,
    });
    await service.syncAnalyzableRecords();
    const listed = await service.listAnalyzableRecords();
    expect(listed.map((entry) => entry.recordId)).toEqual([firstId]);
  });

  it("maps a session-factory failure to a fixed code", async () => {
    const store = new FakeCatalogStore();
    const service = createMahjongSoulCatalogService({
      vault: vaultReturning(storedSession),
      catalogStore: store,
      sessionFactory: async () => {
        throw new Error("transport not wired");
      },
      clock: () => 2_000_000,
    });
    await expect(service.syncAnalyzableRecords())
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("never exposes the token or account id in results", async () => {
    const store = new FakeCatalogStore();
    const { lobby } = lobbyReturning([rawEntry(firstId)]);
    const service = createMahjongSoulCatalogService({
      vault: vaultReturning(storedSession),
      catalogStore: store,
      sessionFactory: async () => lobby,
      clock: () => 2_000_000,
    });
    const summaries = await service.syncAnalyzableRecords();
    const serialized = JSON.stringify(summaries);
    expect(serialized).not.toContain("fake-access-token");
    expect(serialized).not.toContain("103");
  });

  it("coalesces concurrent sync requests into one authoritative refresh", async () => {
    const store = new FakeCatalogStore();
    const { lobby } = lobbyReturning([rawEntry(firstId)]);
    let factoryCalls = 0;
    const service = createMahjongSoulCatalogService({
      vault: vaultReturning(storedSession),
      catalogStore: store,
      sessionFactory: async () => { factoryCalls += 1; return lobby; },
      clock: () => 2_000_000,
    });
    const [left, right] = await Promise.all([
      service.syncAnalyzableRecords(),
      service.syncAnalyzableRecords(),
    ]);
    expect(factoryCalls).toBe(1);
    expect(left).toEqual(right);
  });

  it("cancels and drains an in-flight sync before it can repopulate the catalog", async () => {
    const store = new FakeCatalogStore();
    const { lobby, closed } = lobbyReturning([rawEntry(firstId)]);
    let releaseFactory!: () => void;
    const factoryBarrier = new Promise<void>((resolve) => {
      releaseFactory = resolve;
    });
    const service = createMahjongSoulCatalogService({
      vault: vaultReturning(storedSession),
      catalogStore: store,
      sessionFactory: async () => {
        await factoryBarrier;
        return lobby;
      },
      clock: () => 2_000_000,
    });

    const syncing = service.syncAnalyzableRecords();
    await Promise.resolve();
    const draining = service.cancelAndDrain();
    releaseFactory();

    await expect(syncing).rejects.toThrow("mahjong_soul_catalog_sync_failed");
    await expect(draining).resolves.toBeUndefined();
    expect(store.summaries).toEqual([]);
    expect(closed()).toBe(true);
  });

  it("stays quiesced after cancellation until the owner explicitly resumes it", async () => {
    const store = new FakeCatalogStore();
    const { lobby } = lobbyReturning([rawEntry(firstId)]);
    const service = createMahjongSoulCatalogService({
      vault: vaultReturning(storedSession),
      catalogStore: store,
      sessionFactory: async () => lobby,
      clock: () => 2_000_000,
    });

    await service.cancelAndDrain();
    await expect(service.syncAnalyzableRecords())
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
    service.resume();
    await expect(service.syncAnalyzableRecords()).resolves.toHaveLength(1);
  });

  it("expands older complete windows until it has the recent thirty games", async () => {
    const store = new FakeCatalogStore();
    let listCalls = 0;
    let currentEntries: RawRecordListEntry[] = [];
    const lobby = lobbyReturning([]).lobby;
    const originalCall = lobby.call.bind(lobby);
    lobby.call = async (method, payload) => {
      if (method === ".lq.Lobby.fetchGameRecordListV2") {
        listCalls += 1;
        currentEntries = Array.from({ length: listCalls === 1 ? 5 : 25 }, (_, index) => ({
          ...rawEntry(`260811-00000000-0000-0000-0000-${String(listCalls * 100 + index).padStart(12, "0")}`),
          start_time: Number(payload.end_time) - index,
          end_time: Number(payload.end_time) - index,
        }));
        return {
          iterator: `iter-${listCalls}`,
          iterator_expire: 600,
          actual_begin_time: payload.begin_time,
          actual_end_time: payload.end_time,
        };
      }
      if (method === ".lq.Lobby.fetchNextGameRecordList") {
        return { next: false, entries: currentEntries, iterator_expire: 600 };
      }
      if (method === ".lq.Lobby.fetchGameRecordsDetail") {
        const ids = payload.uuid_list as string[];
        return { record_list: ids.map((uuid) => ({
          uuid,
          standard_rule: 2,
          config: { mode: { mode: 2, ai: false, extendinfo: "", detail_rule: null } },
        })) };
      }
      return await originalCall(method, payload);
    };
    const service = createMahjongSoulCatalogService({
      vault: vaultReturning(storedSession),
      catalogStore: store,
      sessionFactory: async () => lobby,
      clock: () => 1_754_887_700_000,
    });

    await expect(service.syncAnalyzableRecords()).resolves.toHaveLength(30);
    expect(listCalls).toBe(2);
  });
});
