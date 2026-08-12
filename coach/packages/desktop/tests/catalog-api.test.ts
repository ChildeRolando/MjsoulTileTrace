import { describe, expect, it } from "vitest";
import type { AnalyzableRecordSummary } from "@riichi-coach/contracts";
import {
  MahjongSoulCatalogApiSchema,
  parseAnalyzableRecordSummaries,
} from "../src/catalog-api.js";
import { registerMahjongSoulCatalogIpc } from "../src/ipc.js";
import { createMahjongSoulCatalogPreloadApi } from "../src/preload.js";

const recordId = "260811-00000000-0000-0000-0000-000000000001";

function summary(): AnalyzableRecordSummary {
  return {
    recordId,
    shareUrl: `https://game.maj-soul.com/1/?paipu=${recordId}_a1`,
    startedAt: 1_000,
    players: [
      { seat: 0, displayName: "A", finalScore: 32_000, rank: 1 },
      { seat: 1, displayName: "B", finalScore: 27_000, rank: 2 },
      { seat: 2, displayName: "C", finalScore: 23_000, rank: 3 },
      { seat: 3, displayName: "D", finalScore: 18_000, rank: 4 },
    ],
    selfSeat: 2,
    rule: { playerCount: 4, length: "south", displayLabel: "四人南风" },
    analysisStatus: "not_analyzed",
    lastSyncedAt: 1_100,
  };
}

describe("Mahjong Soul renderer-safe catalog API", () => {
  it("accepts exactly two no-argument methods returning summaries", async () => {
    const api = MahjongSoulCatalogApiSchema.parse({
      syncAnalyzableRecords: async () => [summary()],
      listAnalyzableRecords: async () => [],
    });
    await expect(api.syncAnalyzableRecords()).resolves.toEqual([summary()]);
    await expect(api.listAnalyzableRecords()).resolves.toEqual([]);
    expect(Object.keys(api)).toEqual([
      "syncAnalyzableRecords",
      "listAnalyzableRecords",
    ]);
  });

  it.each([
    ["accountId", 103],
    ["accessToken", "token"],
    ["downloadUrl", "https://example.invalid"],
    ["rawRecord", "bytes"],
  ])("rejects a summary leaking %s", async (field, value) => {
    const api = MahjongSoulCatalogApiSchema.parse({
      syncAnalyzableRecords: async () => [{ ...summary(), [field]: value }],
      listAnalyzableRecords: async () => [],
    });
    await expect(api.syncAnalyzableRecords()).rejects.toThrow();
  });

  it("rejects catalog API expansion", () => {
    expect(() => MahjongSoulCatalogApiSchema.parse({
      syncAnalyzableRecords: async () => [],
      listAnalyzableRecords: async () => [],
      invoke: async () => "token",
    })).toThrow();
  });

  it("parses and freezes a strict summary snapshot", () => {
    const parsed = parseAnalyzableRecordSummaries([summary()]);
    expect(parsed).toEqual([summary()]);
    expect(Object.isFrozen(parsed[0])).toBe(true);
    expect(() => parseAnalyzableRecordSummaries([{ ...summary(), token: "x" }]))
      .toThrow();
  });
});

describe("safe Mahjong Soul catalog IPC", () => {
  class FakeIpcMain {
    readonly handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
    handle(channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>): void {
      this.handlers.set(channel, handler);
    }
    removeHandler(channel: string): void { this.handlers.delete(channel); }
  }

  it("registers two trusted no-argument catalog operations", async () => {
    const ipc = new FakeIpcMain();
    const service = {
      syncAnalyzableRecords: async () => [summary()],
      listAnalyzableRecords: async () => [summary()],
    };
    const registration = registerMahjongSoulCatalogIpc({
      ipcMain: ipc,
      service,
      trustedSenderId: 7,
    });
    expect([...ipc.handlers.keys()]).toEqual([
      "mahjong-soul:sync-analyzable-records",
      "mahjong-soul:list-analyzable-records",
    ]);
    await expect(ipc.handlers.get("mahjong-soul:sync-analyzable-records")?.({ sender: { id: 7 } }))
      .resolves.toEqual([summary()]);
    registration.dispose();
    expect(ipc.handlers.size).toBe(0);
  });

  it("rejects foreign senders, payloads, and unsafe results", async () => {
    const ipc = new FakeIpcMain();
    registerMahjongSoulCatalogIpc({
      ipcMain: ipc,
      trustedSenderId: 7,
      service: {
        syncAnalyzableRecords: async () => [summary()],
        listAnalyzableRecords: async () => [summary()],
      },
    });
    const handler = ipc.handlers.get("mahjong-soul:list-analyzable-records")!;
    await expect(handler({ sender: { id: 8 } }))
      .rejects.toThrow("mahjong_soul_login_protocol_unsupported");
    await expect(handler({ sender: { id: 7 } }, { token: "x" }))
      .rejects.toThrow("mahjong_soul_login_protocol_unsupported");

    const unsafe = new FakeIpcMain();
    registerMahjongSoulCatalogIpc({
      ipcMain: unsafe,
      trustedSenderId: 7,
      service: {
        syncAnalyzableRecords: async () => [summary()],
        listAnalyzableRecords: async () => [{ ...summary(), accessToken: "t" } as never],
      },
    });
    await expect(unsafe.handlers.get("mahjong-soul:list-analyzable-records")?.({ sender: { id: 7 } }))
      .rejects.toThrow("mahjong_soul_login_protocol_unsupported");
  });
});

describe("Mahjong Soul catalog preload API", () => {
  it("exposes exactly the two catalog channels", async () => {
    const calls: string[] = [];
    const api = createMahjongSoulCatalogPreloadApi({
      invoke: async (channel: string) => {
        calls.push(channel);
        return [summary()];
      },
    });
    await api.syncAnalyzableRecords();
    await api.listAnalyzableRecords();
    expect(calls).toEqual([
      "mahjong-soul:sync-analyzable-records",
      "mahjong-soul:list-analyzable-records",
    ]);
    expect(Object.keys(api)).toEqual([
      "syncAnalyzableRecords",
      "listAnalyzableRecords",
    ]);
  });

  it("rejects an unsafe result through the preload boundary", async () => {
    const api = createMahjongSoulCatalogPreloadApi({
      invoke: async () => [{ ...summary(), token: "x" }],
    });
    await expect(api.listAnalyzableRecords()).rejects.toThrow(
      "mahjong_soul_login_protocol_unsupported",
    );
  });
});
