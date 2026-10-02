import { describe, expect, test } from "vitest";

import {
  SecretString,
  type MahjongSoulCatalogStore,
  type MahjongSoulFetchedRecord,
  type MahjongSoulLobbySession,
  type MahjongSoulSessionVault,
  type StoredMahjongSoulSession,
} from "@riichi-coach/mahjong-soul-source";
import {
  createAccountRecordReviewHandoff,
  createMahjongSoulRecordIngestionService,
  requireCatalogSelfSeat,
} from "../src/record-ingestion-service.js";

const id = "260811-00000000-0000-0000-0000-000000000001";
const secondId = "260811-00000000-0000-0000-0000-000000000002";
const recoveryContext = { device: { platform: "pc", hardware: "pc", os: "windows", osVersion: "10", isBrowser: true, software: "Chrome", salePlatform: "web", hardwareVendor: "fixture", modelNumber: "fixture", screenWidth: 1, screenHeight: 1, userAgent: "fixture", screenType: 0 }, clientVersion: { resource: "0.11.252.w", package: "" }, currencyPlatforms: [2], version: 1, clientVersionString: "web-0.11.252.w", tag: "chs_t" } as const;
const stored: StoredMahjongSoulSession = { region: "cn", loginMethod: "login", authType: 7, accountId: 123, displayName: "Fixture", accessToken: SecretString.from("fixture-token"), recoveryContext, adapterVersion: "0.1.0", clientVersion: "0.11.252.w", createdAt: 1, lastValidatedAt: 1 };
const summary = { recordId: id, shareUrl: `https://game.maj-soul.com/1/?paipu=${id}`, startedAt: 1, players: [0,1,2,3].map((seat) => ({ displayName: `P${seat}`, finalPoints: 25000, placement: seat + 1 })), selfSeat: 0, rule: { playerCount: 4, length: "south", standardRule: 2, modeId: 2, detailRuleHash: "sha256:0f96998906705f9f3280a9b62e751a6b691a7bf05b1c33c0026db176c25855df" }, analysisStatus: "not_started", lastSyncedAt: 1 } as const;

function setup(list: readonly unknown[] = [summary]) {
  let closed = false;
  const lobby: MahjongSoulLobbySession = { async authenticate() {}, async call() { return {}; }, async close() { closed = true; } };
  const vault: MahjongSoulSessionVault = { async restore() { return stored; }, async save() {}, async markValidated() {}, async clear() {} };
  const catalogStore: MahjongSoulCatalogStore = { async replaceSummaries() {}, async list() { return list as never; }, async clear() {} };
  let fetchCalls = 0;
  const service = createMahjongSoulRecordIngestionService({
    vault, catalogStore, createSession: async () => lobby,
    authenticate: async () => "authenticated",
    fetchRecord: async (_lobby, _stored, recordId) => {
      fetchCalls += 1;
      return Object.freeze({ recordId, sha256: `sha256:${"a".repeat(64)}`, container: "actions", actionCount: 1, recordBytes: Uint8Array.of(1) });
    },
  });
  return { service, closed: () => closed, fetchCalls: () => fetchCalls };
}

describe("account-bound Mahjong Soul record ingestion", () => {
  test("fetches only a record in the current account catalog and closes lobby", async () => {
    const value = setup();
    await expect(value.service.ingest(id)).resolves.toMatchObject({ recordId: id, actionCount: 1, selfActor: 0 });
    expect(value.fetchCalls()).toBe(1);
    expect(value.closed()).toBe(true);
  });

  test("binds account seat before fetch, deduplicates within one account, and separates another account", async () => {
    let activeAccountId = 111;
    let releaseFirstFetch!: () => void;
    let markFirstFetchStarted!: () => void;
    const firstFetchStarted = new Promise<void>((resolve) => { markFirstFetchStarted = resolve; });
    const firstFetchGate = new Promise<void>((resolve) => { releaseFirstFetch = resolve; });
    const fetchContexts: Array<{ accountId: number; selfActor: number }> = [];
    const cacheReads: Array<{ accountId: number; selfActor: number }> = [];
    const service = createMahjongSoulRecordIngestionService({
      vault: {
        async restore() { return { ...stored, accountId: activeAccountId }; },
        async save() {}, async markValidated() {}, async clear() {},
      },
      catalogStore: {
        async replaceSummaries() {},
        async list(accountId) { return [{ ...summary, selfSeat: accountId === 111 ? 1 : 3 }] as never; },
        async clear() {},
      },
      createSession: async () => ({ async authenticate() {}, async call() { return {}; }, async close() {} }),
      authenticate: async () => "authenticated",
      readCachedRecord: async (session, recordId, selfActor) => {
        cacheReads.push({ accountId: session.accountId, selfActor });
        expect(recordId).toBe(id);
        return null;
      },
      fetchRecord: async (_lobby, session, recordId, selfActor) => {
        fetchContexts.push({ accountId: session.accountId, selfActor });
        if (session.accountId === 111) {
          markFirstFetchStarted();
          await firstFetchGate;
        }
        const byte = session.accountId === 111 ? 11 : 22;
        return Object.freeze({ recordId, sha256: `sha256:${String(byte).repeat(64)}`, container: "actions" as const, actionCount: 1, recordBytes: Uint8Array.of(byte) });
      },
    });

    const firstAccountRequest = service.ingest(id);
    await firstFetchStarted;
    const sameAccountRequest = service.ingest(id);
    activeAccountId = 222;
    const secondAccountRequest = service.ingest(id);
    releaseFirstFetch();

    const [firstAccount, sameAccount, secondAccount] = await Promise.all([
      firstAccountRequest, sameAccountRequest, secondAccountRequest,
    ]);
    expect.soft(fetchContexts).toHaveLength(2);
    expect.soft(fetchContexts).toContainEqual({ accountId: 111, selfActor: 1 });
    expect.soft(fetchContexts).toContainEqual({ accountId: 222, selfActor: 3 });
    expect.soft(cacheReads).toHaveLength(2);
    expect.soft(cacheReads).toContainEqual({ accountId: 111, selfActor: 1 });
    expect.soft(cacheReads).toContainEqual({ accountId: 222, selfActor: 3 });
    expect.soft(firstAccount.selfActor).toBe(1);
    expect.soft(firstAccount.recordBytes).toEqual(Uint8Array.of(11));
    expect.soft(sameAccount.selfActor).toBe(1);
    expect.soft(sameAccount.recordBytes).toEqual(Uint8Array.of(11));
    expect.soft(secondAccount.selfActor).toBe(3);
    expect.soft(secondAccount.recordBytes).toEqual(Uint8Array.of(22));
  });

  test("keeps a cache hit bound to its captured account seat when the vault changes", async () => {
    let activeAccountId = 111;
    let restoreCalls = 0;
    let cacheContext: { accountId: number; selfActor: number } | undefined;
    const cached = Object.freeze({
      recordId: id,
      sha256: `sha256:${"c".repeat(64)}` as const,
      container: "actions" as const,
      actionCount: 1,
      recordBytes: Uint8Array.of(33),
    });
    const service = createMahjongSoulRecordIngestionService({
      vault: {
        async restore() { restoreCalls++; return activeAccountId === 0 ? null : { ...stored, accountId: activeAccountId }; },
        async save() {}, async markValidated() {}, async clear() {},
      },
      catalogStore: {
        async replaceSummaries() {},
        async list(accountId) { return [{ ...summary, selfSeat: accountId === 111 ? 1 : 3 }] as never; },
        async clear() {},
      },
      createSession: async () => { throw new Error("cache hit must not open a lobby"); },
      authenticate: async () => "authenticated",
      readCachedRecord: async (session, recordId, selfActor) => {
        cacheContext = { accountId: session.accountId, selfActor };
        expect(recordId).toBe(id);
        activeAccountId = 222;
        return cached;
      },
      fetchRecord: async () => { throw new Error("cache hit must not fetch"); },
    });

    const result = await service.ingest(id);
    expect(result).toMatchObject({ recordId: id, selfActor: 1, recordBytes: Uint8Array.of(33) });
    expect({ cacheContext, restoreCalls, activeAccountId }).toEqual({
      cacheContext: { accountId: 111, selfActor: 1 }, restoreCalls: 1, activeAccountId: 222,
    });
  });

  test.each([
    { name: "switches to account B", nextAccountId: 222 as number | null },
    { name: "logs out", nextAccountId: null },
  ])("passes the ingested seat through analysis and review when $name", async ({ nextAccountId }) => {
    let activeAccountId: number | null = 111;
    let restoreCalls = 0;
    const fetchContexts: Array<{ accountId: number; selfActor: number }> = [];
    let analyzed: { recordId: string; selfActor: number; recordBytes: Uint8Array } | undefined;
    let prepared: { recordId: string; selfActor: number } | undefined;
    const service = createMahjongSoulRecordIngestionService({
      vault: {
        async restore() {
          restoreCalls++;
          return activeAccountId === null ? null : { ...stored, accountId: activeAccountId };
        },
        async save() {}, async markValidated() {}, async clear() {},
      },
      catalogStore: {
        async replaceSummaries() {},
        async list(accountId) { return [{ ...summary, selfSeat: accountId === 111 ? 1 : 3 }] as never; },
        async clear() {},
      },
      createSession: async () => ({ async authenticate() {}, async call() { return {}; }, async close() {} }),
      authenticate: async () => "authenticated",
      readCachedRecord: async () => null,
      fetchRecord: async (_lobby, session, recordId, selfActor) => {
        fetchContexts.push({ accountId: session.accountId, selfActor });
        return Object.freeze({
          recordId, sha256: `sha256:${"d".repeat(64)}`, container: "actions" as const,
          actionCount: 1, recordBytes: Uint8Array.of(44),
        });
      },
    });
    const handoff = createAccountRecordReviewHandoff({
      ingest: async (recordId) => {
        const ingested = await service.ingest(recordId);
        activeAccountId = nextAccountId;
        return ingested;
      },
      analysisStore: {
        analyzeRecord(input) {
          analyzed = { recordId: input.recordId, selfActor: input.selfActor, recordBytes: input.recordBytes };
          return { status: "analysis_ready", stream: {} as never, decisions: [] };
        },
      },
      prepareReview: async (input) => {
        prepared = { recordId: input.recordId, selfActor: input.selfActor };
        return { sessionId: "session-account-a", packageId: "package-account-a" };
      },
    });

    await expect(handoff(id)).resolves.toEqual({
      status: "review_ready", sessionId: "session-account-a", packageId: "package-account-a",
    });
    expect(fetchContexts).toEqual([{ accountId: 111, selfActor: 1 }]);
    expect(analyzed).toEqual({ recordId: id, selfActor: 1, recordBytes: Uint8Array.of(44) });
    expect(prepared).toEqual({ recordId: id, selfActor: 1 });
    expect({ restoreCalls, activeAccountId }).toEqual({ restoreCalls: 1, activeAccountId: nextAccountId });
  });

  test("rejects a foreign record before opening or fetching", async () => {
    const value = setup([]);
    await expect(value.service.ingest(id)).rejects.toThrow("mahjong_soul_record_not_analyzable");
    expect(value.fetchCalls()).toBe(0);
    expect(value.closed()).toBe(false);
  });

  test("rejects an unverified lobby and closes it", async () => {
    const value = setup();
    const service = createMahjongSoulRecordIngestionService({
      vault: { async restore() { return stored; }, async save() {}, async markValidated() {}, async clear() {} },
      catalogStore: { async replaceSummaries() {}, async list() { return [summary] as never; }, async clear() {} },
      createSession: async () => ({ async authenticate() {}, async call() { return {}; }, async close() {} }),
      authenticate: async () => "unverified",
      fetchRecord: async () => { throw new Error("must not fetch"); },
    });
    await expect(service.ingest(id)).rejects.toThrow("mahjong_soul_record_fetch_failed");
  });

  test("does not merge concurrent requests for different records", async () => {
    const secondSummary = { ...summary, recordId: secondId, shareUrl: `https://game.maj-soul.com/1/?paipu=${secondId}` };
    const value = setup([summary, secondSummary]);
    const [first, second] = await Promise.all([
      value.service.ingest(id),
      value.service.ingest(secondId),
    ]);
    expect([first.recordId, second.recordId]).toEqual([id, secondId]);
    expect(value.fetchCalls()).toBe(2);
  });

  test("uses a validated cache hit across service restarts without opening a lobby", async () => {
    const cached = Object.freeze({
      recordId: id,
      sha256: `sha256:${"b".repeat(64)}` as const,
      container: "actions" as const,
      actionCount: 1,
      recordBytes: Uint8Array.of(2),
    });
    let sessions = 0;
    let fetches = 0;
    let writes = 0;
    const service = createMahjongSoulRecordIngestionService({
      vault: { async restore() { return stored; }, async save() {}, async markValidated() {}, async clear() {} },
      catalogStore: { async replaceSummaries() {}, async list() { return [summary] as never; }, async clear() {} },
      createSession: async () => { sessions += 1; return { async authenticate() {}, async call() { return {}; }, async close() {} }; },
      authenticate: async () => "authenticated",
      readCachedRecord: async () => cached,
      writeCachedRecord: async () => { writes += 1; },
      fetchRecord: async () => { fetches += 1; return cached; },
    });
    await expect(service.ingest(id)).resolves.toMatchObject({ ...cached, selfActor: 0 });
    expect({ sessions, fetches, writes }).toEqual({ sessions: 0, fetches: 0, writes: 0 });
  });
});

describe("requireCatalogSelfSeat (account route seat resolution)", () => {
  test("returns the catalog summary's seat when it exists and is valid", () => {
    expect(requireCatalogSelfSeat([{ recordId: id, selfSeat: 2 }], id)).toBe(2);
    expect(requireCatalogSelfSeat(
      [{ recordId: secondId, selfSeat: 1 }, { recordId: id, selfSeat: 0 }],
      id,
    )).toBe(0);
  });

  test("fails closed when the summary is missing — never a silent seat 0", () => {
    expect(() => requireCatalogSelfSeat([], id))
      .toThrow("mahjong_soul_record_not_analyzable");
    expect(() => requireCatalogSelfSeat([{ recordId: secondId, selfSeat: 0 }], id))
      .toThrow("mahjong_soul_record_not_analyzable");
  });

  test.each([
    ["negative seat", -1],
    ["seat above 3", 4],
    ["fractional seat", 1.5],
    ["non-integer seat", Number.NaN],
  ])("fails closed on an invalid summary seat (%s)", (_label, selfSeat) => {
    expect(() => requireCatalogSelfSeat([{ recordId: id, selfSeat }], id))
      .toThrow("mahjong_soul_record_not_analyzable");
  });
});
