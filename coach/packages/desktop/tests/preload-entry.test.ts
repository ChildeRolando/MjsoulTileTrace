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
  assertSafePaipuImportResult,
  assertSafeSessionStatus,
  assertSafeSummaries,
} from "../src/preload-entry.js";
import {
  MAHJONG_SOUL_CATALOG_IPC_CHANNELS,
  MAHJONG_SOUL_IPC_CHANNELS,
  MAHJONG_SOUL_PAIPU_IPC_CHANNELS,
} from "../src/ipc.js";

describe("self-contained sandboxed preload", () => {
  it("exposes exactly three renderer globals with the right methods", () => {
    expect([...exposed.keys()].sort()).toEqual([
      "riichiCoach",
      "riichiCoachCatalog",
      "riichiCoachPaipu",
    ]);
    const session = exposed.get("riichiCoach") as Record<string, unknown>;
    const catalog = exposed.get("riichiCoachCatalog") as Record<string, unknown>;
    const paipu = exposed.get("riichiCoachPaipu") as Record<string, unknown>;
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
    expect(Object.keys(paipu).sort()).toEqual(["importPaipu"]);
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
    expect(PRELOAD_CHANNELS.importPaipuUrl)
      .toBe(MAHJONG_SOUL_PAIPU_IPC_CHANNELS.importPaipuUrl);
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

  it("passes every fixed source error code through verbatim", async () => {
    const passthrough = [
      "mahjong_soul_record_container_invalid",
      "mahjong_soul_canonical_unsupported_semantics",
      "mahjong_soul_canonical_mapping_failed",
      "mahjong_soul_canonical_validation_failed",
      "mahjong_soul_record_identity_mismatch",
      "mahjong_soul_login_protocol_unsupported",
    ];
    const paipu = exposed.get("riichiCoachPaipu") as {
      importPaipu(input: unknown): Promise<unknown>;
    };
    const request = {
      shareUrl: "https://game.maj-soul.com/1/?paipu=260811-00000000-0000-0000-0000-000000000001_a1",
    };
    for (const code of passthrough) {
      invoke.mockImplementationOnce(() => { throw new Error(code); });
      await expect(paipu.importPaipu(request)).rejects.toThrow(code);
    }
  });

  it("accepts only the fixed safe paipu import result shape", () => {
    const ready = {
      status: "analysis_ready",
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      canonicalEventCount: 1024,
      replayDecisionCount: 116,
    };
    expect(assertSafePaipuImportResult(ready)).toBeDefined();
    for (const status of ["invalid_url", "identity_mismatch", "no_capture", "unsupported_semantics", "analysis_failed"]) {
      expect(assertSafePaipuImportResult({ status })).toBeDefined();
      // Exactly one key: a status plus anything else is refused.
      expect(() => assertSafePaipuImportResult({ status, extra: 1 }))
        .toThrow("mahjong_soul_login_protocol_unsupported");
    }
    // Raw bytes / credential / identity fields can never ride along — and
    // neither can the auto-resolved seat.
    for (const key of [
      "recordBytes", "rawRecord", "accessToken", "token", "accountId",
      "endpoint", "cookies", "selfActor", "perspectiveAccountId", "accounts",
    ]) {
      expect(() => assertSafePaipuImportResult({ ...ready, [key]: "secret" }))
        .toThrow("mahjong_soul_login_protocol_unsupported");
    }
    // Wrong shapes for the ready payload.
    expect(() => assertSafePaipuImportResult({ ...ready, canonicalEventCount: 1.5 }))
      .toThrow("mahjong_soul_login_protocol_unsupported");
    expect(() => assertSafePaipuImportResult({ status: "evil" }))
      .toThrow("mahjong_soul_login_protocol_unsupported");
    expect(() => assertSafePaipuImportResult(null))
      .toThrow("mahjong_soul_login_protocol_unsupported");
  });

  it("validates the shareUrl-only import envelope before invoking, and forwards the dedicated channel", async () => {
    invoke.mockClear();
    const paipu = exposed.get("riichiCoachPaipu") as {
      importPaipu(input: unknown): Promise<unknown>;
    };
    const request = {
      shareUrl: "https://game.maj-soul.com/1/?paipu=260811-00000000-0000-0000-0000-000000000001_a1",
    };
    for (const bad of [
      undefined,
      null,
      "url",
      // The removed manual seat is an extra key and must be rejected.
      { ...request, selfActor: 2 },
      { ...request, seat: "2" },
      { ...request, extra: true },
      { shareUrl: "" },
      { shareUrl: "x".repeat(513) },
      {},
    ]) {
      await expect(paipu.importPaipu(bad)).rejects.toThrow("mahjong_soul_login_protocol_unsupported");
    }
    expect(invoke).not.toHaveBeenCalled();

    invoke.mockResolvedValueOnce({ status: "no_capture" });
    await expect(paipu.importPaipu(request)).resolves.toEqual({ status: "no_capture" });
    expect(invoke).toHaveBeenCalledWith("mahjong-soul:import-paipu-url", request);

    // Arbitrary error messages collapse to the fixed protocol error.
    invoke.mockImplementationOnce(() => { throw new Error("leaky message"); });
    await expect(paipu.importPaipu(request)).rejects.toThrow("mahjong_soul_login_protocol_unsupported");
    // Fixed source error codes pass through.
    invoke.mockImplementationOnce(() => { throw new Error("mahjong_soul_canonical_unsupported_semantics"); });
    await expect(paipu.importPaipu(request)).rejects.toThrow("mahjong_soul_canonical_unsupported_semantics");
  });
});
