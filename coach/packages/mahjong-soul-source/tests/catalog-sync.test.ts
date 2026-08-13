import { describe, expect, it } from "vitest";
import {
  syncRecentCatalog,
} from "../src/catalog-sync.js";
import type { LobbyDirectCallMethod, MahjongSoulLobbySession } from "../src/lobby-session.js";

type RawEntry = {
  version: number;
  uuid: string;
  start_time: number;
  end_time: number;
  tag: number;
  subtag: number;
  players: unknown[];
  standard_rule: number;
};

function detail(uuid: string, mode = 2) {
  return {
    uuid,
    standard_rule: 2,
    config: { mode: { mode, ai: false, extendinfo: "", detail_rule: null } },
  };
}

function entry(uuid: string): RawEntry {
  return {
    version: 210715,
    uuid,
    start_time: 1,
    end_time: 2,
    tag: 0,
    subtag: 0,
    players: [
      { rank: 1, account_id: 101, nickname: "A", seat: 0, point: 32000 },
      { rank: 2, account_id: 102, nickname: "B", seat: 1, point: 27000 },
      { rank: 3, account_id: 103, nickname: "C", seat: 2, point: 23000 },
      { rank: 4, account_id: 104, nickname: "D", seat: 3, point: 18000 },
    ],
    standard_rule: 2,
  };
}

function entryAt(uuid: string, startTime: number): RawEntry {
  return { ...entry(uuid), start_time: startTime, end_time: startTime };
}

function fakeSession(pages: { entries: RawEntry[]; next: boolean }[]): {
  session: MahjongSoulLobbySession;
  calls: Array<{ method: LobbyDirectCallMethod; payload: Record<string, unknown> }>;
} {
  const calls: Array<{ method: LobbyDirectCallMethod; payload: Record<string, unknown> }> = [];
  let pageIndex = 0;
  const session: MahjongSoulLobbySession = {
    async authenticate() {},
    async call(method, payload) {
      calls.push({ method, payload: { ...payload } });
      if (method === ".lq.Lobby.fetchGameRecordListV2") {
        return {
          iterator: "iter-1",
          iterator_expire: 600,
          actual_begin_time: payload.begin_time,
          actual_end_time: payload.end_time,
        };
      }
      if (method === ".lq.Lobby.fetchGameRecordsDetail") {
        const uuidList = payload.uuid_list as string[];
        return { record_list: uuidList.map((uuid) => detail(uuid)) };
      }
      const page = pages[pageIndex];
      if (page === undefined) return { next: false, entries: [] };
      pageIndex += 1;
      return { next: page.next, entries: page.entries, iterator_expire: 600 };
    },
    async close() {},
  };
  return { session, calls };
}

describe("recent Mahjong Soul catalog sync", () => {
  it("iterates the list until next is false and dedupes by uuid", async () => {
    const { session, calls } = fakeSession([
      { entries: [entry("A"), entry("B"), entry("C")], next: true },
      { entries: [entry("D"), entry("A")], next: false },
    ]);
    const result = await syncRecentCatalog({ session, pageSize: 10, maxPages: 3 });

    expect(result.entries.map((e) => e.uuid)).toEqual(["A", "B", "C", "D"]);
    expect(result.entries.every((e) => e.game_mode === 2)).toBe(true);
    expect(calls[0]).toMatchObject({ method: ".lq.Lobby.fetchGameRecordListV2" });
    expect(calls[1]).toMatchObject({
      method: ".lq.Lobby.fetchNextGameRecordList",
      payload: { iterator: "iter-1", count: 10 },
    });
    expect(calls[2]).toMatchObject({
      method: ".lq.Lobby.fetchNextGameRecordList",
      payload: { iterator: "iter-1", count: 10 },
    });
    expect(calls[3]).toMatchObject({
      method: ".lq.Lobby.fetchGameRecordsDetail",
      payload: { uuid_list: ["A", "B", "C", "D"] },
    });
    expect(calls).toHaveLength(4);
  });

  it("carries the same iterator across pages", async () => {
    const { session, calls } = fakeSession([
      { entries: [entry("A")], next: true },
      { entries: [entry("B")], next: true },
      { entries: [entry("C")], next: false },
    ]);
    await syncRecentCatalog({ session });
    const nextCalls = calls.filter((c) =>
      c.method === ".lq.Lobby.fetchNextGameRecordList"
    );
    for (const call of nextCalls) {
      expect(call.payload.iterator).toBe("iter-1");
    }
  });

  it("fails closed at the page bound instead of committing a partial snapshot", async () => {
    const { session, calls } = fakeSession([
      { entries: [entry("A")], next: true },
      { entries: [entry("B")], next: true },
    ]);
    await expect(syncRecentCatalog({ session, maxPages: 2 }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
    expect(calls.filter((c) =>
      c.method === ".lq.Lobby.fetchNextGameRecordList"
    )).toHaveLength(2);
  });

  it("sorts the complete recent window by start time before selecting thirty", async () => {
    const old = Array.from({ length: 20 }, (_, index) =>
      entryAt(`old-${index}`, 100 + index));
    const recent = Array.from({ length: 20 }, (_, index) =>
      entryAt(`recent-${index}`, 1_000 + index));
    const { session } = fakeSession([
      { entries: old, next: true },
      { entries: recent, next: false },
    ]);

    const result = await syncRecentCatalog({ session, pageSize: 20 });

    expect(result.entries).toHaveLength(30);
    expect(result.entries[0]?.uuid).toBe("recent-19");
    expect(result.entries.some((item) => item.uuid === "old-0")).toBe(false);
  });

  it("binds the requested time window and the server's acknowledged bounds", async () => {
    const { session, calls } = fakeSession([{ entries: [], next: false }]);
    await syncRecentCatalog({
      session,
      beginTime: 1_000,
      endTime: 2_000,
    });
    expect(calls[0]).toEqual({
      method: ".lq.Lobby.fetchGameRecordListV2",
      payload: { tag: 0, begin_time: 1_000, end_time: 2_000 },
    });
  });

  it("continues past duplicate pages until it collects the recent thirty unique records", async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) => entry(`A${index}`));
    const pages = [
      { entries: firstPage, next: true },
      { entries: [...firstPage], next: true },
      { entries: Array.from({ length: 10 }, (_, index) => entry(`B${index}`)), next: true },
      { entries: Array.from({ length: 10 }, (_, index) => entry(`C${index}`)), next: false },
    ];
    const { session, calls } = fakeSession(pages);

    const result = await syncRecentCatalog({ session });

    expect(result.entries).toHaveLength(30);
    expect(calls.filter((call) =>
      call.method === ".lq.Lobby.fetchNextGameRecordList"
    )).toHaveLength(4);
  });

  it("rejects a missing iterator", async () => {
    const calls: Array<{ method: string }> = [];
    const session: MahjongSoulLobbySession = {
      async authenticate() {},
      async call(method) {
        calls.push({ method });
        return {};
      },
      async close() {},
    };
    await expect(syncRecentCatalog({ session }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("rejects a malformed entry instead of corrupting the catalog", async () => {
    const { session } = fakeSession([
      { entries: [entry("A"), { version: 210715, uuid: 42 } as unknown as RawEntry], next: false },
    ]);
    await expect(syncRecentCatalog({ session }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("rejects a non-array entries payload", async () => {
    const session: MahjongSoulLobbySession = {
      async authenticate() {},
      async call(method) {
        if (method === ".lq.Lobby.fetchGameRecordListV2") {
          return { iterator: "x", iterator_expire: 600 };
        }
        return { next: false, entries: "not-an-array", iterator_expire: 600 };
      },
      async close() {},
    };
    await expect(syncRecentCatalog({ session }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("rejects a server-side error response", async () => {
    const session: MahjongSoulLobbySession = {
      async authenticate() {},
      async call(method) {
        if (method === ".lq.Lobby.fetchGameRecordListV2") {
          return { iterator: "x", iterator_expire: 600, error: { code: 1005 } };
        }
        return { next: false, entries: [] };
      },
      async close() {},
    };
    await expect(syncRecentCatalog({ session }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("rejects expired iterators and non-boolean pagination state", async () => {
    const expired = fakeSession([{ entries: [entry("A")], next: false }]);
    const originalExpiredCall = expired.session.call.bind(expired.session);
    expired.session.call = async (method, payload) => {
      const result = await originalExpiredCall(method, payload);
      return method === ".lq.Lobby.fetchGameRecordListV2"
        ? { ...result, iterator_expire: 0 }
        : result;
    };
    await expect(syncRecentCatalog({ session: expired.session }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");

    const malformed = fakeSession([{ entries: [entry("A")], next: false }]);
    const originalMalformedCall = malformed.session.call.bind(malformed.session);
    malformed.session.call = async (method, payload) => {
      const result = await originalMalformedCall(method, payload);
      return method === ".lq.Lobby.fetchNextGameRecordList"
        ? { ...result, next: "false" }
        : result;
    };
    await expect(syncRecentCatalog({ session: malformed.session }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("rejects missing or foreign detail evidence but preserves proven East mode", async () => {
    for (const recordList of [
      [],
      [detail("foreign")],
    ]) {
      const { session } = fakeSession([{ entries: [entry("A")], next: false }]);
      const original = session.call.bind(session);
      session.call = async (method, payload) => method === ".lq.Lobby.fetchGameRecordsDetail"
        ? { record_list: recordList }
        : await original(method, payload);
      await expect(syncRecentCatalog({ session }))
        .rejects.toThrow("mahjong_soul_catalog_sync_failed");
    }
    const { session } = fakeSession([{ entries: [entry("A")], next: false }]);
    const original = session.call.bind(session);
    session.call = async (method, payload) => method === ".lq.Lobby.fetchGameRecordsDetail"
      ? { record_list: [detail("A", 1)] }
      : await original(method, payload);
    await expect(syncRecentCatalog({ session })).resolves.toMatchObject({
      entries: [{ uuid: "A", game_mode: 1 }],
    });
  });

  it("rejects out-of-range page size and page count", async () => {
    const { session } = fakeSession([]);
    await expect(syncRecentCatalog({ session, pageSize: 0 }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
    await expect(syncRecentCatalog({ session, pageSize: 101 }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
    await expect(syncRecentCatalog({ session, maxPages: 11 }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("rejects records outside the acknowledged window and conflicting duplicate UUIDs", async () => {
    const outside = fakeSession([{ entries: [entryAt("A", 999)], next: false }]);
    await expect(syncRecentCatalog({ session: outside.session, beginTime: 1_000, endTime: 2_000 }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");

    const conflicting = fakeSession([
      { entries: [entryAt("A", 1_500)], next: true },
      { entries: [entryAt("A", 1_600)], next: false },
    ]);
    await expect(syncRecentCatalog({ session: conflicting.session, beginTime: 1_000, endTime: 2_000 }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });
});
