import { describe, expect, it } from "vitest";
import { sessionUiPolicy } from "../src/renderer/session-ui-policy.js";

describe("Mahjong Soul session UI policy", () => {
  it("keeps cached catalog read-only while the persisted session is offline", () => {
    expect(sessionUiPolicy("offline_unverified")).toEqual({
      showCatalog: true,
      showPaipuImport: true,
      allowSync: false,
      catalogNotice: "当前离线，仅显示上次缓存；恢复联网后可重新同步。",
    });
  });

  it("does not expose a broken sync action until production lobby restore exists", () => {
    expect(sessionUiPolicy("valid")).toEqual({
      showCatalog: true,
      showPaipuImport: true,
      allowSync: false,
      catalogNotice: null,
    });
    expect(sessionUiPolicy("valid", true).allowSync).toBe(true);
    expect(sessionUiPolicy("offline_unverified", true).allowSync).toBe(false);
    expect(sessionUiPolicy("logged_out").showCatalog).toBe(false);
  });

  it("only shows the paipu URL import for a connected session", () => {
    expect(sessionUiPolicy("valid").showPaipuImport).toBe(true);
    expect(sessionUiPolicy("offline_unverified").showPaipuImport).toBe(true);
    expect(sessionUiPolicy("logged_out").showPaipuImport).toBe(false);
    expect(sessionUiPolicy("authenticating").showPaipuImport).toBe(false);
    expect(sessionUiPolicy("session_validating").showPaipuImport).toBe(false);
  });
});
