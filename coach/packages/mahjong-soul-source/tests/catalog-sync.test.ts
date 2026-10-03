import { describe, expect, it } from "vitest";
import { parse as parseProtobuf } from "protobufjs";
import { fileURLToPath } from "node:url";
import {
  filterAnalyzableRecord,
  MAHJONG_SOUL_SAFE_DIRECT_CALL_METHODS,
  createLiqiCodec,
  loadMahjongSoulProtocolBundle,
  syncRecentCatalog,
} from "../src/index.js";
import type { LobbyDirectCallMethod, MahjongSoulLobbySession } from "../src/lobby-session.js";

const bundleRoot = fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url));
const bundlePromise = loadMahjongSoulProtocolBundle(bundleRoot);
const currentRecordVersion = 202408;

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

function detail(uuid: string, mode = 2, standardRule = 2) {
  return {
    uuid,
    standard_rule: standardRule,
    config: { category: 2, mode: { mode, ai: false, extendinfo: "", detail_rule: null }, meta: { mode_id: 6 } },
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

function observedRankedEntry(uuid: string, startTime = 1): RawEntry {
  return { ...entry(uuid), version: currentRecordVersion, standard_rule: 1, start_time: startTime, end_time: startTime };
}

function observedRankedDetail(uuid: string, detailRule?: unknown, overrides: Record<string, unknown> = {}) {
  const { mode: modeOverrides, ...configOverrides } = overrides;
  return {
    uuid,
    // The decoded default is not a second standard-rule assertion. The list
    // entry owns this value; the record content version is a separate field.
    standard_rule: 0,
    config: {
      category: 2,
      mode: {
        mode: 2, ai: false, extendinfo: "", ...(detailRule === undefined ? {} : { detail_rule: detailRule }),
        ...(modeOverrides !== null && typeof modeOverrides === "object" && !Array.isArray(modeOverrides)
          ? modeOverrides as Record<string, unknown> : {}),
      },
      meta: { mode_id: 6 },
      ...configOverrides,
      ...(modeOverrides === null ? { mode: null } : {}),
    },
  };
}

const bundle = () => bundlePromise;

function fixtureRecordId(index: number): string {
  return `260811-${String(index).padStart(8, "0")}-0000-0000-0000-000000000001`;
}

function responseFrame(bundleValue: Awaited<ReturnType<typeof bundle>>, requestId: number, method: string,
  payload: Record<string, unknown>): Uint8Array {
  const route = bundleValue.rpcMap[method];
  if (route === undefined) throw new Error("missing fixture route");
  const root = parseProtobuf(bundleValue.protoText, { keepCase: true }).root;
  const responseType = root.lookupType(route.resp);
  const response = responseType.encode(responseType.fromObject(payload)).finish();
  const wrapper = root.lookupType("lq.Wrapper").encode({ name: "", data: response }).finish();
  return Uint8Array.from([3, requestId & 0xff, requestId >>> 8, ...wrapper]);
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
    const result = await syncRecentCatalog({ session, bundle: await bundle(), pageSize: 10, maxPages: 3 });

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
    await syncRecentCatalog({ session, bundle: await bundle() });
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
    await expect(syncRecentCatalog({ session, bundle: await bundle(), maxPages: 2 }))
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

    const result = await syncRecentCatalog({ session, bundle: await bundle(), pageSize: 20 });

    expect(result.entries).toHaveLength(30);
    expect(result.entries[0]?.uuid).toBe("recent-19");
    expect(result.entries.some((item) => item.uuid === "old-0")).toBe(false);
  });

  it("binds the requested time window and the server's acknowledged bounds", async () => {
    const { session, calls } = fakeSession([{ entries: [], next: false }]);
    await syncRecentCatalog({
      session,
      bundle: await bundle(),
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

    const result = await syncRecentCatalog({ session, bundle: await bundle() });

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
    await expect(syncRecentCatalog({ session, bundle: await bundle() }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("rejects a malformed entry instead of corrupting the catalog", async () => {
    const { session } = fakeSession([
      { entries: [entry("A"), { version: 210715, uuid: 42 } as unknown as RawEntry], next: false },
    ]);
    await expect(syncRecentCatalog({ session, bundle: await bundle() }))
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
    await expect(syncRecentCatalog({ session, bundle: await bundle() }))
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
    await expect(syncRecentCatalog({ session, bundle: await bundle() }))
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
    await expect(syncRecentCatalog({ session: expired.session, bundle: await bundle() }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");

    const malformed = fakeSession([{ entries: [entry("A")], next: false }]);
    const originalMalformedCall = malformed.session.call.bind(malformed.session);
    malformed.session.call = async (method, payload) => {
      const result = await originalMalformedCall(method, payload);
      return method === ".lq.Lobby.fetchNextGameRecordList"
        ? { ...result, next: "false" }
        : result;
    };
    await expect(syncRecentCatalog({ session: malformed.session, bundle: await bundle() }))
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
      await expect(syncRecentCatalog({ session, bundle: await bundle() }))
        .rejects.toThrow("mahjong_soul_catalog_sync_failed");
    }
    const { session } = fakeSession([{ entries: [entry("A")], next: false }]);
    const original = session.call.bind(session);
    session.call = async (method, payload) => method === ".lq.Lobby.fetchGameRecordsDetail"
      ? { record_list: [detail("A", 1)] }
      : await original(method, payload);
    await expect(syncRecentCatalog({ session, bundle: await bundle() })).resolves.toMatchObject({
      entries: [{ uuid: "A", game_mode: 1 }],
    });
  });

  it("rejects out-of-range page size and page count", async () => {
    const { session } = fakeSession([]);
    await expect(syncRecentCatalog({ session, bundle: await bundle(), pageSize: 0 }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
    await expect(syncRecentCatalog({ session, bundle: await bundle(), pageSize: 101 }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
    await expect(syncRecentCatalog({ session, bundle: await bundle(), maxPages: 11 }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it("rejects records outside the acknowledged window and conflicting duplicate UUIDs", async () => {
    const outside = fakeSession([{ entries: [entryAt("A", 999)], next: false }]);
    await expect(syncRecentCatalog({ session: outside.session, bundle: await bundle(), beginTime: 1_000, endTime: 2_000 }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");

    const conflicting = fakeSession([
      { entries: [entryAt("A", 1_500)], next: true },
      { entries: [entryAt("A", 1_600)], next: false },
    ]);
    await expect(syncRecentCatalog({ session: conflicting.session, bundle: await bundle(), beginTime: 1_000, endTime: 2_000 }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });

  it.each([
    ["omitted", undefined],
    ["empty", {}],
    ["explicit defaults", "explicit-defaults"],
  ] as const)("uses list standard_rule and accepts normalized protobuf defaults (%s)", async (_label, detailRule) => {
    const id = fixtureRecordId(1);
    let chosenRule: unknown = detailRule;
    if (detailRule === "explicit-defaults") {
      const loaded = await bundle();
      const root = parseProtobuf(loaded.protoText, { keepCase: true }).root;
      const type = root.lookupType("lq.GameDetailRule");
      chosenRule = type.toObject(type.create(), { defaults: true, arrays: true, objects: true });
    }
    const { session } = fakeSession([{ entries: [observedRankedEntry(id)], next: false }]);
    const original = session.call.bind(session);
    session.call = async (method, payload) => method === ".lq.Lobby.fetchGameRecordsDetail"
      ? { record_list: [observedRankedDetail(id, chosenRule)] }
      : await original(method, payload);

    const result = await syncRecentCatalog({ session, bundle: await bundle() });
    expect(result.entries[0]).toMatchObject({
      version: currentRecordVersion,
      standard_rule: 1,
      game_mode: 2,
      game_mode_ai: false,
      game_mode_extendinfo: "",
      game_mode_detail_rule_present: detailRule !== undefined,
      game_mode_detail_rule_override: false,
      catalog_rule_profile: "ranked_south_v1",
    });
    expect(filterAnalyzableRecord(result.entries[0]!, 103, 2_000).status).toBe("analyzable");
  });

  it("retains supported profile rows when one well-formed custom row is filtered", async () => {
    const rows = Array.from({ length: 30 }, (_, index) => observedRankedEntry(fixtureRecordId(index + 1), index + 1));
    const { session } = fakeSession([{ entries: rows, next: false }]);
    const original = session.call.bind(session);
    session.call = async (method, payload) => {
      if (method !== ".lq.Lobby.fetchGameRecordsDetail") return await original(method, payload);
      const ids = payload.uuid_list as string[];
      return { record_list: ids.map((id, index) => index === 29
        ? observedRankedDetail(id, { dora_count: 4 })
        : observedRankedDetail(id)) };
    };
    const result = await syncRecentCatalog({ session, bundle: await bundle() });
    const filtered = result.entries.map((item) => filterAnalyzableRecord(item, 103, 2_000));
    expect(filtered.filter((item) => item.status === "analyzable")).toHaveLength(29);
    expect(filtered.filter((item) => item.status === "not_analyzable" && item.reason === "unsupported_game_mode")).toHaveLength(1);
  });

  it("decodes the current catalog profile through the pinned Liqi codec before filtering", async () => {
    const loaded = await bundle();
    const methods = [
      ".lq.Lobby.fetchGameRecordListV2",
      ".lq.Lobby.fetchNextGameRecordList",
      ".lq.Lobby.fetchGameRecordsDetail",
    ];
    const codec = createLiqiCodec(loaded, { directCallMethods: methods, surfacedNotifications: [] });
    const id = fixtureRecordId(41);
    let requestId = 1;
    const session: MahjongSoulLobbySession = {
      async authenticate() {},
      async call(method, payload) {
        const currentId = requestId++;
        codec.encodeRequest({ requestId: currentId, method, payload });
        const responsePayload = method === ".lq.Lobby.fetchGameRecordListV2"
          ? { iterator: "fixture-iter", iterator_expire: 600, actual_begin_time: payload.begin_time, actual_end_time: payload.end_time }
          : method === ".lq.Lobby.fetchNextGameRecordList"
            ? { next: false, iterator_expire: 600, entries: [observedRankedEntry(id)] }
            : { record_list: [observedRankedDetail(id, {})] };
        const decoded = codec.decodeServerFrame(responseFrame(loaded, currentId, method, responsePayload));
        if (decoded.kind !== "response") throw new Error("unexpected codec fixture response");
        return decoded.payload;
      },
      async close() { codec.close(); },
    };

    const result = await syncRecentCatalog({ session, bundle: loaded });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ version: 202408, standard_rule: 1, catalog_rule_profile: "ranked_south_v1" });
    expect(filterAnalyzableRecord(result.entries[0]!, 103, 2_000).status).toBe("analyzable");
    codec.close();
  });

  it.each([
    ["AI", { mode: { ai: true } }],
    ["room", { meta: { room_id: 55 } }],
    ["contest", { meta: { contest_uid: 77 } }],
    ["category", { category: 1 }],
  ])("filters a valid but unsupported %s row without failing the catalog batch", async (_label, overrides) => {
    const id = fixtureRecordId(7);
    const { session } = fakeSession([{ entries: [observedRankedEntry(id)], next: false }]);
    const original = session.call.bind(session);
    session.call = async (method, payload) => method === ".lq.Lobby.fetchGameRecordsDetail"
      ? { record_list: [observedRankedDetail(id, undefined, overrides)] }
      : await original(method, payload);
    const result = await syncRecentCatalog({ session, bundle: await bundle() });
    expect(result.entries).toHaveLength(1);
    expect(filterAnalyzableRecord(result.entries[0]!, 103, 2_000).status).toBe("not_analyzable");
  });

  it("keeps legacy 210715 standard-rule-2 entries while unknown versions stay unsupported", async () => {
    const { session } = fakeSession([{ entries: [entry(fixtureRecordId(31)), { ...entry(fixtureRecordId(32)), version: 202409 }], next: false }]);
    const result = await syncRecentCatalog({ session, bundle: await bundle() });
    expect(filterAnalyzableRecord(result.entries[0]!, 103, 2_000).status).toBe("analyzable");
    expect(filterAnalyzableRecord(result.entries[1]!, 103, 2_000)).toEqual({ status: "not_analyzable", reason: "unsupported_record_version" });
  });

  it.each([
    ["nonzero standard rule mismatch", (id: string) => ({ ...observedRankedDetail(id), standard_rule: 2 })],
    ["malformed detail rule", (id: string) => observedRankedDetail(id, "not-a-proto-message")],
    ["unknown proto field", (id: string) => observedRankedDetail(id, undefined, { config_extra: true })],
    ["unknown nested mode field", (id: string) => observedRankedDetail(id, undefined, { mode: { unexpected_nested: true } })],
    ["unknown nested detail rule field", (id: string) => observedRankedDetail(id, { unknown_rule: true })],
    ["unknown nested metadata field", (id: string) => observedRankedDetail(id, undefined, { meta: { mode_id: 6, unknown_metadata: true } })],
    ["missing required mode fields", (id: string) => observedRankedDetail(id, undefined, { mode: null })],
  ])("fails closed for %s while decoding detail metadata", async (_label, detailFactory) => {
    const id = fixtureRecordId(8);
    const { session } = fakeSession([{ entries: [observedRankedEntry(id)], next: false }]);
    const original = session.call.bind(session);
    session.call = async (method, payload) => method === ".lq.Lobby.fetchGameRecordsDetail"
      ? { record_list: [detailFactory(id)] }
      : await original(method, payload);
    await expect(syncRecentCatalog({ session, bundle: await bundle() }))
      .rejects.toThrow("mahjong_soul_catalog_sync_failed");
  });
});
