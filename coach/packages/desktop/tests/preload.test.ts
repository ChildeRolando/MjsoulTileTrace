import { describe, expect, it } from "vitest";

import { createMahjongSoulPreloadApi } from "../src/preload.js";

describe("minimal Mahjong Soul preload", () => {
  it("exposes only three no-argument calls", async () => {
    const calls: Array<{ channel: string; args: unknown[] }> = [];
    const api = createMahjongSoulPreloadApi({
      invoke: async (channel, ...args) => {
        calls.push({ channel, args });
        return { region: "cn", status: "logged_out" };
      },
    });

    await api.getSessionStatus();
    await api.openMahjongSoulLogin();
    await api.logoutMahjongSoul();

    expect(Object.keys(api)).toEqual([
      "getSessionStatus",
      "openMahjongSoulLogin",
      "logoutMahjongSoul",
    ]);
    expect(calls).toEqual([
      { channel: "mahjong-soul:get-session-status", args: [] },
      { channel: "mahjong-soul:open-login", args: [] },
      { channel: "mahjong-soul:logout", args: [] },
    ]);
    expect(Object.isFrozen(api)).toBe(true);
  });

  it("snapshots the invoke capability once", async () => {
    let reads = 0;
    const port = Object.create(null) as { invoke(channel: string): Promise<unknown> };
    Object.defineProperty(port, "invoke", {
      get() {
        reads += 1;
        return async () => ({ region: "cn", status: "logged_out" });
      },
    });
    const api = createMahjongSoulPreloadApi(port);
    await api.getSessionStatus();
    await api.getSessionStatus();
    expect(reads).toBe(1);
  });
});
