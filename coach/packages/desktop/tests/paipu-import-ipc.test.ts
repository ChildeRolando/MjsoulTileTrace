import { describe, expect, it } from "vitest";
import {
  MAHJONG_SOUL_PAIPU_IPC_CHANNELS,
  registerMahjongSoulPaipuImportIpc,
} from "../src/ipc.js";

class FakeIpcMain {
  readonly handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>): void {
    this.handlers.set(channel, handler);
  }
  removeHandler(channel: string): void { this.handlers.delete(channel); }
}

const trustedEvent = { sender: { id: 7 } };
const request = {
  shareUrl: "https://game.maj-soul.com/1/?paipu=260811-00000000-0000-0000-0000-000000000001_a123456",
  selfActor: 3,
};
const readyResult = {
  status: "analysis_ready",
  recordId: "260811-00000000-0000-0000-0000-000000000001",
  selfActor: 3,
  canonicalEventCount: 1024,
  replayDecisionCount: 116,
};

function register(
  service: { importPaipu: (input: unknown) => Promise<unknown> },
): FakeIpcMain {
  const ipc = new FakeIpcMain();
  registerMahjongSoulPaipuImportIpc({
    ipcMain: ipc,
    service: service as never,
    trustedSenderId: 7,
  });
  return ipc;
}

describe("paipu URL import IPC", () => {
  it("registers exactly one dedicated channel and disposes it", () => {
    const ipc = register({ importPaipu: async () => ({ status: "no_capture" }) });
    expect([...ipc.handlers.keys()])
      .toEqual([MAHJONG_SOUL_PAIPU_IPC_CHANNELS.importPaipuUrl]);
    expect(MAHJONG_SOUL_PAIPU_IPC_CHANNELS.importPaipuUrl)
      .toBe("mahjong-soul:import-paipu-url");
    // It must not overload the catalog analysis channel.
    expect(MAHJONG_SOUL_PAIPU_IPC_CHANNELS.importPaipuUrl)
      .not.toBe("mahjong-soul:start-record-analysis");
  });

  it("rejects untrusted senders, wrong arity, and malformed envelopes", async () => {
    const ipc = register({ importPaipu: async () => ({ status: "no_capture" }) });
    const handler = ipc.handlers.get("mahjong-soul:import-paipu-url")!;
    const calls: unknown[][] = [
      // untrusted sender
      [{ sender: { id: 8 } }, request],
      [{ sender: {} }, request],
      [{}],
      // wrong arity
      [trustedEvent],
      [trustedEvent, request, request],
      // not exactly one plain object
      [trustedEvent, "url"],
      [trustedEvent, null],
      // extra keys
      [trustedEvent, { ...request, token: "x" }],
      [trustedEvent, { ...request, extra: 1 }],
      // missing keys
      [trustedEvent, { shareUrl: request.shareUrl }],
      [trustedEvent, { selfActor: 0 }],
      // bad shareUrl
      [trustedEvent, { ...request, shareUrl: 5 }],
      [trustedEvent, { ...request, shareUrl: "" }],
      [trustedEvent, { ...request, shareUrl: "x".repeat(513) }],
      // bad selfActor
      [trustedEvent, { ...request, selfActor: "3" }],
      [trustedEvent, { ...request, selfActor: 4 }],
      [trustedEvent, { ...request, selfActor: 1.5 }],
    ];
    for (const args of calls) {
      await expect(handler(...args as [unknown]))
        .rejects.toThrow("mahjong_soul_login_protocol_unsupported");
    }
  });

  it("returns the fixed safe result for a valid trusted request", async () => {
    let seen: unknown = null;
    const ipc = register({
      importPaipu: async (input) => {
        seen = input;
        return readyResult;
      },
    });
    const handler = ipc.handlers.get("mahjong-soul:import-paipu-url")!;
    await expect(handler(trustedEvent, request)).resolves.toEqual(readyResult);
    expect(seen).toEqual(request);
  });

  it("refuses to let record bytes or credentials cross IPC in the result", async () => {
    const leaks = [
      { ...readyResult, recordBytes: new Uint8Array([1, 2, 3]) },
      { ...readyResult, rawRecord: "deadbeef" },
      { ...readyResult, accessToken: "x" },
      { status: "no_capture", frames: ["base64"] },
      { status: "evil" },
      null,
    ];
    for (const leak of leaks) {
      const ipc = register({ importPaipu: async () => leak });
      const handler = ipc.handlers.get("mahjong-soul:import-paipu-url")!;
      await expect(handler(trustedEvent, request))
        .rejects.toThrow("mahjong_soul_login_protocol_unsupported");
    }
  });

  it("collapses service exceptions to the fixed error", async () => {
    const ipc = register({
      importPaipu: async () => {
        throw new Error("internal leak");
      },
    });
    const handler = ipc.handlers.get("mahjong-soul:import-paipu-url")!;
    await expect(handler(trustedEvent, request))
      .rejects.toThrow("mahjong_soul_login_protocol_unsupported");
  });
});
