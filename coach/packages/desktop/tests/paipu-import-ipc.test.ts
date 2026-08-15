import { describe, expect, it } from "vitest";
import {
  MAHJONG_SOUL_PAIPU_IPC_CHANNELS,
  registerMahjongSoulPaipuImportIpc,
} from "../src/ipc.js";
import type { PaipuImportResult } from "../src/paipu-import-service.js";

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
};
const internalReady: PaipuImportResult = {
  status: "analysis_ready",
  recordId: "260811-00000000-0000-0000-0000-000000000001",
  selfActor: 3,
  canonicalEventCount: 1024,
  replayDecisionCount: 116,
};
// What the renderer is allowed to see: no seat.
const rendererReady = {
  status: "analysis_ready",
  recordId: "260811-00000000-0000-0000-0000-000000000001",
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
      // extra keys — including the removed manual seat
      [trustedEvent, { ...request, selfActor: 3 }],
      [trustedEvent, { ...request, seat: 3 }],
      [trustedEvent, { ...request, token: "x" }],
      // missing key
      [trustedEvent, {}],
      [trustedEvent, { selfActor: 3 }],
      // bad shareUrl
      [trustedEvent, { shareUrl: 5 }],
      [trustedEvent, { shareUrl: "" }],
      [trustedEvent, { shareUrl: "x".repeat(513) }],
    ];
    for (const args of calls) {
      await expect(handler(...args as [unknown]))
        .rejects.toThrow("mahjong_soul_login_protocol_unsupported");
    }
  });

  it("returns the fixed safe result (seat stripped) for a valid trusted request", async () => {
    let seen: unknown = null;
    const ipc = register({
      importPaipu: async (input) => {
        seen = input;
        return internalReady;
      },
    });
    const handler = ipc.handlers.get("mahjong-soul:import-paipu-url")!;
    await expect(handler(trustedEvent, request)).resolves.toEqual(rendererReady);
    expect(seen).toEqual(request);
  });

  it("cannot let record bytes, identity data, or the seat cross IPC", async () => {
    // The handler PROJECTS the internal result onto the exact safe fields,
    // so extra fields on an analysis_ready result are dropped, never
    // forwarded — even if the main-process service misbehaves.
    for (const extra of [
      { recordBytes: new Uint8Array([1, 2, 3]) },
      { recordIdentity: { recordId: "x", accounts: [{ accountId: 1, seat: 0 }] } },
      { perspectiveAccountId: 123 },
      { accounts: [{ accountId: 1, seat: 0 }] },
    ]) {
      const ipc = register({ importPaipu: async () => ({ ...internalReady, ...extra }) });
      const handler = ipc.handlers.get("mahjong-soul:import-paipu-url")!;
      await expect(handler(trustedEvent, request)).resolves.toEqual(rendererReady);
    }
    // Non-ready results must be exactly one key — anything riding along is
    // rejected outright.
    for (const leak of [
      { status: "no_capture", frames: ["base64"] },
      { status: "identity_mismatch", accountId: 1 },
      { status: "evil" },
      null,
    ]) {
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
