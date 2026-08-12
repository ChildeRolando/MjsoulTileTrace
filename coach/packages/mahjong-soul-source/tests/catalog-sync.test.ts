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

function entry(uuid: string): RawEntry {
  return {
    version: 1,
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
    standard_rule: 0,
  };
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
        return { iterator: "iter-1", iterator_expire: 0 };
      }
      const page = pages[pageIndex];
      if (page === undefined) return { next: false, entries: [] };
      pageIndex += 1;
      return { next: page.next, entries: page.entries };
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
    expect(calls[0]).toMatchObject({ method: ".lq.Lobby.fetchGameRecordListV2" });
    expect(calls[1]).toMatchObject({
      method: ".lq.Lobby.fetchNextGameRecordList",
      payload: { iterator: "iter-1", count: 10 },
    });
    expect(calls[2]).toMatchObject({
      method: ".lq.Lobby.fetchNextGameRecordList",
      payload: { iterator: "iter-1", count: 10 },
    });
    expect(calls).toHaveLength(3);
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

  it("stops at the page bound even when next stays true", async () => {
    const { session, calls } = fakeSession([
      { entries: [entry("A")], next: true },
      { entries: [entry("B")], next: true },
    ]);
    const result = await syncRecentCatalog({ session, maxPages: 2 });
    expect(result.entries.map((e) => e.uuid)).toEqual(["A", "B"]);
    expect(calls.filter((c) =>
      c.method === ".lq.Lobby.fetchNextGameRecordList"
    )).toHaveLength(2);
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
      { entries: [entry("A"), { version: 1, uuid: 42 } as unknown as RawEntry], next: false },
    ]);
    await expect(syncRecentCatalog({ session }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("rejects a non-array entries payload", async () => {
    const session: MahjongSoulLobbySession = {
      async authenticate() {},
      async call(method) {
        if (method === ".lq.Lobby.fetchGameRecordListV2") return { iterator: "x" };
        return { next: false, entries: "not-an-array" };
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
          return { iterator: "x", error: { code: 1005 } };
        }
        return { next: false, entries: [] };
      },
      async close() {},
    };
    await expect(syncRecentCatalog({ session }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
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
});
