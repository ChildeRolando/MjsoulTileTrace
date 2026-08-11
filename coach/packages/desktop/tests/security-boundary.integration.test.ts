import { describe, expect, it } from "vitest";

import { SecretString, type CapturedMahjongSoulCredential } from "@riichi-coach/mahjong-soul-source";
import { registerMahjongSoulIpc } from "../src/ipc.js";
import { createMahjongSoulPreloadApi } from "../src/preload.js";

const FORBIDDEN = [
  "boundary-fixture-token",
  "123456789",
  "Cookie:",
  "Authorization:",
  "020000deadbeef",
  "hostile upstream prose",
];

describe("privileged session boundary", () => {
  it("never returns credential material through IPC, preload, JSON or errors", async () => {
    const credential: CapturedMahjongSoulCredential = Object.freeze({
      region: "cn",
      loginMethod: "login",
      authType: 0,
      accountId: 123_456_789,
      displayName: "安全测试",
      accessToken: SecretString.from("boundary-fixture-token"),
    });
    void credential;
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
    registerMahjongSoulIpc({
      ipcMain: {
        handle: (channel, handler) => { handlers.set(channel, handler); },
        removeHandler: (channel) => { handlers.delete(channel); },
      },
      trustedSenderId: 9,
      service: {
        getStatus: () => ({ region: "cn", status: "valid", displayName: "安全测试", lastValidatedAt: 1 }),
        openLogin: async () => ({ region: "cn", status: "valid", displayName: "安全测试", lastValidatedAt: 1 }),
        logout: async () => { throw new Error("hostile upstream prose boundary-fixture-token"); },
      },
    });
    const api = createMahjongSoulPreloadApi({
      invoke: async (channel, ...args) => await handlers.get(channel)?.({ sender: { id: 9 } }, ...args),
    });
    const observed: string[] = [];
    observed.push(JSON.stringify(await api.getSessionStatus()));
    observed.push(JSON.stringify(await api.openMahjongSoulLogin()));
    try { await api.logoutMahjongSoul(); } catch (error) { observed.push(String(error)); }

    const output = observed.join("\n");
    for (const forbidden of FORBIDDEN) expect(output).not.toContain(forbidden);
    expect(output).toContain("mahjong_soul_login_protocol_unsupported");
  });
});
