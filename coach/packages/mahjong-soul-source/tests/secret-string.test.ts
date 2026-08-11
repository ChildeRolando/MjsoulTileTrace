import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import {
  MahjongSoulSourceError,
  SecretString,
} from "../src/index.js";

describe("SecretString", () => {
  it("redacts string, JSON, and nested util.inspect output", () => {
    const secret = SecretString.from("test-token-not-secret");

    expect(String(secret)).toBe("[REDACTED]");
    expect(JSON.stringify({ secret })).toBe('{"secret":"[REDACTED]"}');
    expect(inspect({ nested: { secret } })).toContain("[REDACTED]");
    expect(inspect({ nested: { secret } })).not.toContain(
      "test-token-not-secret",
    );
  });

  it("has no enumerable properties and reveals only explicitly", () => {
    const secret = SecretString.from("test-token-not-secret");

    expect(Object.keys(secret)).toEqual([]);
    expect(secret.reveal()).toBe("test-token-not-secret");
    expect(Object.isFrozen(secret)).toBe(true);
  });

  it.each([undefined, null, {}, []])(
    "rejects non-string secret input without coercion %#",
    (value) => {
      const coercionSpy = {
        toString: () => {
          throw new Error("must not coerce");
        },
      };
      const input = typeof value === "object" && value !== null && !Array.isArray(value)
        ? coercionSpy
        : value;

      expect(() => SecretString.from(input as never)).toThrow(
        "mahjong_soul_login_protocol_unsupported",
      );
    },
  );

  it.each([
    ["1234567", false],
    ["12345678", true],
    ["x".repeat(4096), true],
    ["x".repeat(4097), false],
  ])("enforces the 8 through 4096 character boundary %#", (value, valid) => {
    const operation = () => SecretString.from(value);

    if (valid) {
      expect(operation().reveal()).toBe(value);
    } else {
      expect(operation).toThrow("mahjong_soul_login_protocol_unsupported");
    }
  });
});

describe("MahjongSoulSourceError", () => {
  it("carries only a project-owned error code", () => {
    const error = new MahjongSoulSourceError(
      "mahjong_soul_login_protocol_unsupported",
    );

    expect(error.name).toBe("MahjongSoulSourceError");
    expect(error.message).toBe("mahjong_soul_login_protocol_unsupported");
    expect(JSON.stringify(error)).not.toContain("token");
    expect(Object.keys(error)).not.toContain("details");
  });

  it("does not accept an upstream detail argument", () => {
    const ErrorConstructor = MahjongSoulSourceError as unknown as new (
      ...arguments_: string[]
    ) => MahjongSoulSourceError;

    expect(() => new ErrorConstructor(
      "mahjong_soul_login_protocol_unsupported",
      "server said token=secret",
    )).toThrowError(TypeError);
  });

  it("rejects non-contract error prose without reflecting it", () => {
    const ErrorConstructor = MahjongSoulSourceError as unknown as new (
      code: string
    ) => MahjongSoulSourceError;

    expect(() => new ErrorConstructor("server said token=secret")).toThrow(
      "mahjong_soul_login_protocol_unsupported",
    );
  });
});
