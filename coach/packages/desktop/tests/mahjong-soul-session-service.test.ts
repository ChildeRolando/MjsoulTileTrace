import { describe, expect, it } from "vitest";

import { createMahjongSoulSessionService } from "../src/mahjong-soul-session-service.js";

describe("Electron Mahjong Soul session service", () => {
  it("clears the dedicated partition storage and cache in order", async () => {
    const operations: string[] = [];
    const service = createMahjongSoulSessionService({
      vault: {
        restore: async () => null,
        save: async () => {},
        markValidated: async () => {},
        clear: async () => { operations.push("vault"); },
      },
      loginProvider: {
        run: async () => ({ status: "cancelled" }),
        cancelActive: () => { operations.push("cancel"); },
      },
      browserSession: {
        clearStorageData: async () => { operations.push("storage"); },
        clearCache: async () => { operations.push("cache"); },
      },
      clock: () => 100,
    });

    await service.logout();
    expect(operations).toEqual(["cancel", "storage", "cache", "vault"]);
  });

  it("does not clear the vault after a partition clearing failure", async () => {
    const operations: string[] = [];
    const service = createMahjongSoulSessionService({
      vault: {
        restore: async () => null,
        save: async () => {},
        markValidated: async () => {},
        clear: async () => { operations.push("vault"); },
      },
      loginProvider: {
        run: async () => ({ status: "cancelled" }),
        cancelActive: () => { operations.push("cancel"); },
      },
      browserSession: {
        clearStorageData: async () => { operations.push("storage"); throw new Error("raw"); },
        clearCache: async () => { operations.push("cache"); },
      },
      clock: () => 100,
    });

    await expect(service.logout()).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );
    expect(operations).toEqual(["cancel", "storage"]);
  });
});
