import { describe, expect, it } from "vitest";

import {
  MahjongSoulDesktopApiSchema,
  parseMahjongSoulSessionStatus,
} from "../src/session-api.js";

const validStatus = Object.freeze({
  region: "cn" as const,
  status: "valid" as const,
  displayName: "测试用户",
  lastValidatedAt: 1_786_377_600_000,
});

describe("Mahjong Soul renderer-safe desktop API", () => {
  it("accepts exactly three no-argument methods returning safe statuses", async () => {
    const api = MahjongSoulDesktopApiSchema.parse({
      getSessionStatus: async () => validStatus,
      openMahjongSoulLogin: async () => ({ region: "cn", status: "authenticating" }),
      logoutMahjongSoul: async () => ({ region: "cn", status: "logged_out" }),
    });

    await expect(api.getSessionStatus()).resolves.toEqual(validStatus);
    await expect(api.openMahjongSoulLogin()).resolves.toEqual({
      region: "cn",
      status: "authenticating",
    });
    await expect(api.logoutMahjongSoul()).resolves.toEqual({
      region: "cn",
      status: "logged_out",
    });
    expect(Object.keys(api)).toEqual([
      "getSessionStatus",
      "openMahjongSoulLogin",
      "logoutMahjongSoul",
    ]);
  });

  it.each([
    ["accessToken", "fake-token"],
    ["cookie", "sid=fake"],
    ["authorization", "Bearer fake"],
    ["rawFrame", "020000"],
    ["accountId", 123],
    ["unknown", true],
  ])("rejects unsafe or unknown status field %s", async (field, value) => {
    const api = MahjongSoulDesktopApiSchema.parse({
      getSessionStatus: async () => ({ ...validStatus, [field]: value }),
      openMahjongSoulLogin: async () => ({ region: "cn", status: "authenticating" }),
      logoutMahjongSoul: async () => ({ region: "cn", status: "logged_out" }),
    });

    await expect(api.getSessionStatus()).rejects.toThrow();
  });

  it("rejects API expansion and non-functions", () => {
    expect(() => MahjongSoulDesktopApiSchema.parse({
      getSessionStatus: async () => validStatus,
      openMahjongSoulLogin: async () => validStatus,
      logoutMahjongSoul: async () => ({ region: "cn", status: "logged_out" }),
      invoke: async () => "fake-token",
    })).toThrow();

    expect(() => MahjongSoulDesktopApiSchema.parse({
      getSessionStatus: validStatus,
      openMahjongSoulLogin: async () => validStatus,
      logoutMahjongSoul: async () => ({ region: "cn", status: "logged_out" }),
    })).toThrow();
  });

  it("returns a frozen strict status snapshot", () => {
    const input = { ...validStatus };
    const parsed = parseMahjongSoulSessionStatus(input);

    expect(parsed).toEqual(validStatus);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed).not.toBe(input);
  });
});
