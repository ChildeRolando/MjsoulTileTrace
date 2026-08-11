import { describe, expect, it } from "vitest";

import {
  createMainWindowOptions,
  isAllowedLocalRendererNavigation,
} from "../src/main.js";

describe("desktop main-window boundary", () => {
  it("uses a fixed local preload with an isolated renderer", () => {
    expect(createMainWindowOptions("C:\\app\\preload-entry.js")).toEqual({
      width: 920,
      height: 680,
      show: true,
      webPreferences: {
        preload: "C:\\app\\preload-entry.js",
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webviewTag: false,
        navigateOnDragDrop: false,
      },
    });
  });

  it("allows only the exact packaged renderer file", () => {
    const expected = "file:///C:/app/renderer/index.html";
    expect(isAllowedLocalRendererNavigation(expected, expected)).toBe(true);
    for (const value of [
      "https://game.maj-soul.com/1/",
      "file:///C:/app/renderer/other.html",
      "file:///C:/app/renderer/index.html#changed",
      "file:///C:/app/renderer/index.html?token=fake",
    ]) expect(isAllowedLocalRendererNavigation(value, expected)).toBe(false);
  });
});
