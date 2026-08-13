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
    rule: {
      playerCount: 4,
      length: "south",
      modeId: 2,
      detailRuleHash: "sha256:7a53cc5deb60512f3dacacc7695dd5072077c6f4984dbedbff76e27092393b1c",
      displayLabel: "四人南风",
    },
    analysisStatus: "not_analyzed",
    lastSyncedAt: 1_100,
  };
}

function fetchedRecord() {
  return {
    recordId,
    sha256: `sha256:${"0".repeat(64)}` as const,
    container: "actions" as const,
    actionCount: 1,
    recordBytes: new Uint8Array([1]),
  };
}

describe("Mahjong Soul renderer-safe catalog API", () => {
  it("accepts exactly two catalog methods and one narrow analysis trigger", async () => {
    const api = MahjongSoulCatalogApiSchema.parse({
      syncAnalyzableRecords: async () => [summary()],
      listAnalyzableRecords: async () => [],
      startRecordAnalysis: async () => ({ status: "record_fetched" as const }),
    });
    await expect(api.syncAnalyzableRecords()).resolves.toEqual([summary()]);
    await expect(api.listAnalyzableRecords()).resolves.toEqual([]);
    await expect(api.startRecordAnalysis(recordId)).resolves.toEqual({ status: "record_fetched" });
    expect(Object.keys(api)).toEqual([
      "syncAnalyzableRecords",
      "listAnalyzableRecords",
      "startRecordAnalysis",
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
      startRecordAnalysis: async () => ({ status: "record_fetched" as const }),
    });
    await expect(api.syncAnalyzableRecords()).rejects.toThrow();
  });

  it("rejects catalog API expansion", () => {
    expect(() => MahjongSoulCatalogApiSchema.parse({
      syncAnalyzableRecords: async () => [],
      listAnalyzableRecords: async () => [],
      startRecordAnalysis: async () => ({ status: "record_fetched" as const }),
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

  it("registers two trusted catalog operations and one narrow analysis trigger", async () => {
    const ipc = new FakeIpcMain();
    const service = {
      syncAnalyzableRecords: async () => [summary()],
      listAnalyzableRecords: async () => [summary()],
      ingest: async () => fetchedRecord(),
    };
    const registration = registerMahjongSoulCatalogIpc({
      ipcMain: ipc,
      service,
      trustedSenderId: 7,
    });
    expect([...ipc.handlers.keys()]).toEqual([
      "mahjong-soul:sync-analyzable-records",
      "mahjong-soul:list-analyzable-records",
      "mahjong-soul:start-record-analysis",
    ]);
    await expect(ipc.handlers.get("mahjong-soul:start-record-analysis")?.({ sender: { id: 7 } }, recordId))
      .resolves.toEqual({ status: "record_fetched" });
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
        ingest: async () => fetchedRecord(),
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
        ingest: async () => fetchedRecord(),
      },
    });
    await expect(unsafe.handlers.get("mahjong-soul:list-analyzable-records")?.({ sender: { id: 7 } }))
      .rejects.toThrow("mahjong_soul_login_protocol_unsupported");
  });
});

describe("Mahjong Soul catalog preload API", () => {
  it("exposes exactly the catalog channels", async () => {
    const calls: string[] = [];
    const api = createMahjongSoulCatalogPreloadApi({
      invoke: async (channel: string) => {
        calls.push(channel);
        return channel.endsWith("start-record-analysis")
          ? { status: "record_fetched" }
          : [summary()];
      },
    });
    await api.syncAnalyzableRecords();
    await api.listAnalyzableRecords();
    await api.startRecordAnalysis(recordId);
    expect(calls).toEqual([
      "mahjong-soul:sync-analyzable-records",
      "mahjong-soul:list-analyzable-records",
      "mahjong-soul:start-record-analysis",
    ]);
    expect(Object.keys(api)).toEqual([
      "syncAnalyzableRecords",
      "listAnalyzableRecords",
      "startRecordAnalysis",
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
