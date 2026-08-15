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
    await expect(value.service.ingest(id)).resolves.toMatchObject({ recordId: id, actionCount: 1 });
    expect(value.fetchCalls()).toBe(1);
    expect(value.closed()).toBe(true);
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
