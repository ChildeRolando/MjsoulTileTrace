import { describe, expect, it } from "vitest";
import { readCliFlag } from "../src/diagnostic-flags.js";

// Electron 43 on Windows dies before app code when a space-separated switch
// carries an http(s):// value with further args behind it, so URLs must use
// the attached `--name=value` form. These tests pin BOTH accepted shapes and
// the absent-flag contract the required-flag checks rely on.
describe("diagnostic CLI flag reading", () => {
  it("reads a space-separated value", () => {
    expect(readCliFlag(
      ["electron.exe", "app.js", "--paipu-url", "https://game.maj-soul.com/1/?paipu=x_a1"],
      "paipu-url",
    )).toBe("https://game.maj-soul.com/1/?paipu=x_a1");
  });

  it("reads an attached --name=value, the form URLs must use", () => {
    expect(readCliFlag(
      [
        "electron.exe", "app.js",
        "--diagnose-mahjong-soul-capture-record",
        "--paipu-url=https://game.maj-soul.com/1/?paipu=x_a1",
        "--self-actor=3",
      ],
      "paipu-url",
    )).toBe("https://game.maj-soul.com/1/?paipu=x_a1");
    expect(readCliFlag(
      ["app.js", "--self-actor=2", "--paipu-url=https://example.invalid/x"],
      "self-actor",
    )).toBe("2");
  });

  it("keeps = signs inside the value of the attached form", () => {
    expect(readCliFlag(["app.js", "--paipu-url=https://x/?a=b&c=d"], "paipu-url"))
      .toBe("https://x/?a=b&c=d");
  });

  it("reports absent flags, empty values, and trailing flags without values", () => {
    expect(readCliFlag(["app.js"], "paipu-url")).toBeUndefined();
    expect(readCliFlag(["app.js", "--paipu-url="], "paipu-url")).toBeUndefined();
    expect(readCliFlag(["app.js", "--paipu-url"], "paipu-url")).toBeUndefined();
    // The next token being another flag means no value was provided.
    expect(readCliFlag(["app.js", "--paipu-url", "--self-actor", "3"], "paipu-url"))
      .toBeUndefined();
  });

  it("does not match longer flag names or other flags", () => {
    expect(readCliFlag(["app.js", "--paipu-url-extended=1"], "paipu-url")).toBeUndefined();
    expect(readCliFlag(["app.js", "--record-id=abc", "--self-actor=1"], "paipu-url"))
      .toBeUndefined();
    expect(readCliFlag(["app.js", "--record-id=abc", "--self-actor=1"], "record-id"))
      .toBe("abc");
  });
});
