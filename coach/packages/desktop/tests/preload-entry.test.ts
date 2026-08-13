import { describe, expect, it, vi } from "vitest";

const { exposed, invoke } = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown) => {
      exposed.set(key, value);
    },
  },
  ipcRenderer: { invoke },
}));

import {
  PRELOAD_CHANNELS,
  assertSafeSessionStatus,
  assertSafeSummaries,
} from "../src/preload-entry.js";
import {
  MAHJONG_SOUL_CATALOG_IPC_CHANNELS,
  MAHJONG_SOUL_IPC_CHANNELS,
} from "../src/ipc.js";

describe("self-contained sandboxed preload", () => {
  it("exposes exactly two renderer globals with the right methods", () => {
    expect([...exposed.keys()].sort()).toEqual(["riichiCoach", "riichiCoachCatalog"]);
    const session = exposed.get("riichiCoach") as Record<string, unknown>;
    const catalog = exposed.get("riichiCoachCatalog") as Record<string, unknown>;
    expect(Object.keys(session).sort()).toEqual([
      "getSessionStatus",
      "logoutMahjongSoul",
      "openMahjongSoulLogin",
    ]);
    expect(Object.keys(catalog).sort()).toEqual([
      "listAnalyzableRecords",
      "startRecordAnalysis",
      "syncAnalyzableRecords",
    ]);
  });

  it("keeps channel names in lockstep with the main-process IPC registry", () => {
    expect(PRELOAD_CHANNELS.getStatus).toBe(MAHJONG_SOUL_IPC_CHANNELS.getStatus);
    expect(PRELOAD_CHANNELS.openLogin).toBe(MAHJONG_SOUL_IPC_CHANNELS.openLogin);
    expect(PRELOAD_CHANNELS.logout).toBe(MAHJONG_SOUL_IPC_CHANNELS.logout);
    expect(PRELOAD_CHANNELS.syncRecords)
      .toBe(MAHJONG_SOUL_CATALOG_IPC_CHANNELS.syncAnalyzableRecords);
    expect(PRELOAD_CHANNELS.listRecords)
      .toBe(MAHJONG_SOUL_CATALOG_IPC_CHANNELS.listAnalyzableRecords);
    expect(PRELOAD_CHANNELS.startAnalysis)
      .toBe(MAHJONG_SOUL_CATALOG_IPC_CHANNELS.startRecordAnalysis);
  });

  it("rejects a credential-bearing session status at the renderer boundary", () => {
    expect(assertSafeSessionStatus({
      region: "cn",
      status: "valid",
      displayName: "P",
      lastValidatedAt: 1,
    })).toBeDefined();
    for (const key of ["accessToken", "accountId", "cookie", "token", "rawFrame"]) {
      expect(() => assertSafeSessionStatus({
        region: "cn",
        status: "valid",
        displayName: "P",
        lastValidatedAt: 1,
        [key]: "secret",
      })).toThrow("mahjong_soul_login_protocol_unsupported");
    }
    expect(() => assertSafeSessionStatus({ region: "cn", status: "evil" }))
      .toThrow("mahjong_soul_login_protocol_unsupported");
  });

  it("rejects a credential-bearing summary array at the renderer boundary", () => {
    const recordId = "260811-00000000-0000-0000-0000-000000000001";
    const summary = {
      recordId,
      shareUrl: `https://game.maj-soul.com/1/?paipu=${recordId}_a1`,
      startedAt: 1,
      players: [],
      selfSeat: 0,
      rule: {
        playerCount: 4,
        length: "south",
        modeId: 2,
        detailRuleHash: "sha256:7a53cc5deb60512f3dacacc7695dd5072077c6f4984dbedbff76e27092393b1c",
        displayLabel: "四人南风",
      },
      analysisStatus: "not_analyzed",
      lastSyncedAt: 1,
    };
    expect(assertSafeSummaries([summary])).toBeDefined();
    expect(() => assertSafeSummaries([{ ...summary, accessToken: "x" }]))
      .toThrow("mahjong_soul_login_protocol_unsupported");
    expect(() => assertSafeSummaries("not-an-array"))
      .toThrow("mahjong_soul_login_protocol_unsupported");
  });

  it("invokes the correct channel and validates the returned status", async () => {
    invoke.mockResolvedValueOnce({ region: "cn", status: "logged_out" });
    const session = exposed.get("riichiCoach") as {
      getSessionStatus(): Promise<unknown>;
    };
    await session.getSessionStatus();
    expect(invoke).toHaveBeenCalledWith("mahjong-soul:get-session-status");
  });
});
