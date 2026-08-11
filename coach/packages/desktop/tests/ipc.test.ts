import { describe, expect, it } from "vitest";

import { registerMahjongSoulIpc } from "../src/ipc.js";

class FakeIpcMain {
  readonly handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>): void {
    this.handlers.set(channel, handler);
  }
  removeHandler(channel: string): void { this.handlers.delete(channel); }
}

describe("safe Mahjong Soul IPC", () => {
  it("registers exactly three trusted no-argument operations", async () => {
    const ipc = new FakeIpcMain();
    const service = {
      getStatus: () => ({ region: "cn" as const, status: "logged_out" as const }),
      openLogin: async () => ({ region: "cn" as const, status: "authenticating" as const }),
      logout: async () => ({ region: "cn" as const, status: "logged_out" as const }),
    };
    const registration = registerMahjongSoulIpc({
      ipcMain: ipc,
      service,
      trustedSenderId: 7,
    });

    expect([...ipc.handlers.keys()]).toEqual([
      "mahjong-soul:get-session-status",
      "mahjong-soul:open-login",
      "mahjong-soul:logout",
    ]);
    await expect(ipc.handlers.get("mahjong-soul:get-session-status")?.({ sender: { id: 7 } }))
      .resolves.toEqual({ region: "cn", status: "logged_out" });
    await expect(ipc.handlers.get("mahjong-soul:open-login")?.({ sender: { id: 7 } }))
      .resolves.toEqual({ region: "cn", status: "authenticating" });

    registration.dispose();
    expect(ipc.handlers.size).toBe(0);
  });

  it("rejects foreign senders, payloads and unsafe results with fixed prose", async () => {
    for (const variant of ["sender", "payload", "result"] as const) {
      const ipc = new FakeIpcMain();
      registerMahjongSoulIpc({
        ipcMain: ipc,
        trustedSenderId: 7,
        service: {
          getStatus: () => variant === "result"
            ? ({ region: "cn", status: "valid", accessToken: "fake-token" } as never)
            : ({ region: "cn", status: "logged_out" }),
          openLogin: async () => ({ region: "cn", status: "logged_out" }),
          logout: async () => ({ region: "cn", status: "logged_out" }),
        },
      });
      const handler = ipc.handlers.get("mahjong-soul:get-session-status")!;
      const call = variant === "sender"
        ? handler({ sender: { id: 8 } })
        : variant === "payload"
          ? handler({ sender: { id: 7 } }, { token: "fake-token" })
          : handler({ sender: { id: 7 } });
      await expect(call).rejects.toThrow("mahjong_soul_login_protocol_unsupported");
    }
  });

  it("snapshots service capabilities at registration", async () => {
    const reads = new Map<string, number>();
    const service = Object.create(null) as {
      getStatus(): { region: "cn"; status: "logged_out" };
      openLogin(): Promise<{ region: "cn"; status: "logged_out" }>;
      logout(): Promise<{ region: "cn"; status: "logged_out" }>;
    };
    for (const method of ["getStatus", "openLogin", "logout"] as const) {
      Object.defineProperty(service, method, {
        get() {
          reads.set(method, (reads.get(method) ?? 0) + 1);
          return method === "getStatus"
            ? () => ({ region: "cn", status: "logged_out" })
            : async () => ({ region: "cn", status: "logged_out" });
        },
      });
    }
    const ipc = new FakeIpcMain();
    registerMahjongSoulIpc({ ipcMain: ipc, service, trustedSenderId: 7 });
    await ipc.handlers.get("mahjong-soul:get-session-status")?.({ sender: { id: 7 } });
    expect(Object.fromEntries(reads)).toEqual({
      getStatus: 1,
      openLogin: 1,
      logout: 1,
    });
  });
});
