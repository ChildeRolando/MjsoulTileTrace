import { describe, expect, it } from "vitest";

import { createMahjongSoulSessionService } from "../src/mahjong-soul-session-service.js";

describe("Electron Mahjong Soul session service", () => {
  it("does not start a new login while logout is still clearing local state", async () => {
    let releaseClear!: () => void;
    const clearBarrier = new Promise<void>((resolve) => { releaseClear = resolve; });
    let loginRuns = 0;
    const service = createMahjongSoulSessionService({
      vault: { restore: async () => null, save: async () => {}, markValidated: async () => {}, clear: async () => {} },
      loginProvider: {
        run: async () => { loginRuns += 1; return { status: "cancelled" }; },
        cancelActive: () => {},
      },
      browserSession: { clearStorageData: async () => { await clearBarrier; }, clearCache: async () => {} },
      cancelCatalogSync: async () => {},
      resumeCatalogSync: () => {},
      clearCatalog: async () => {},
      clock: () => 100,
    });

    const logout = service.logout();
    await Promise.resolve();
    const concurrentLogin = service.openLogin();
    expect(concurrentLogin).toBe(logout);
    expect(loginRuns).toBe(0);
    releaseClear();
    await expect(logout).resolves.toEqual({ region: "cn", status: "logged_out" });
    await expect(concurrentLogin).resolves.toEqual({ region: "cn", status: "logged_out" });
    expect(loginRuns).toBe(0);
  });

  it("resumes catalog synchronization only after a valid session is established", async () => {
    let resumes = 0;
    const service = createMahjongSoulSessionService({
      vault: {
        restore: async () => null,
        save: async () => {},
        markValidated: async () => {},
        clear: async () => {},
      },
      loginProvider: {
        run: async () => ({ status: "cancelled" }),
        cancelActive: () => {},
      },
      browserSession: { clearStorageData: async () => {}, clearCache: async () => {} },
      cancelCatalogSync: async () => {},
      resumeCatalogSync: () => { resumes += 1; },
      clearCatalog: async () => {},
      clock: () => 100,
    });

    await expect(service.initialize()).resolves.toEqual({ region: "cn", status: "logged_out" });
    await expect(service.openLogin()).resolves.toEqual({ region: "cn", status: "logged_out" });
    expect(resumes).toBe(0);
  });

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
      cancelCatalogSync: async () => { operations.push("catalog-sync"); },
      resumeCatalogSync: () => {},
      clearCatalog: async () => { operations.push("catalog"); },
      clock: () => 100,
    });

    await service.logout();
    expect(operations).toEqual(["cancel", "catalog-sync", "storage", "cache", "catalog", "vault"]);
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
      cancelCatalogSync: async () => { operations.push("catalog-sync"); },
      resumeCatalogSync: () => {},
      clearCatalog: async () => { operations.push("catalog"); },
      clock: () => 100,
    });

    await expect(service.logout()).rejects.toThrow(
      "mahjong_soul_session_storage_unavailable",
    );
    expect(operations).toEqual(["cancel", "catalog-sync", "storage"]);
  });

  it("keeps the vault when clearing the unanalysed catalog fails", async () => {
    const operations: string[] = [];
    const service = createMahjongSoulSessionService({
      vault: {
        restore: async () => null,
        save: async () => {},
        markValidated: async () => {},
        clear: async () => { operations.push("vault"); },
      },
      loginProvider: { run: async () => ({ status: "cancelled" }), cancelActive: () => {} },
      browserSession: { clearStorageData: async () => {}, clearCache: async () => {} },
      cancelCatalogSync: async () => {},
      resumeCatalogSync: () => {},
      clearCatalog: async () => { throw new Error("raw catalog failure"); },
      clock: () => 100,
    });
    await expect(service.logout()).rejects.toThrow("mahjong_soul_session_storage_unavailable");
    expect(operations).toEqual([]);
  });
});
