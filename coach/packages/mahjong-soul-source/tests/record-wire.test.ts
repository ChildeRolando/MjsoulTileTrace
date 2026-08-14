import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type Type } from "protobufjs";
import { describe, expect, test } from "vitest";
import type { MahjongSoulProtocolBundle } from "../src/protocol-bundle.js";
import { unwrapGameDetailRecords } from "../src/record-wire.js";

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const protoText = readFileSync(resolve(fixtureDir, "minimal-liqi.proto"), "utf8");
const root = parse(protoText, { keepCase: true }).root;
const wrapperType = root.lookupType("lq.Wrapper");
const bundle = { protoText } as MahjongSoulProtocolBundle;
const fixedCode = "mahjong_soul_record_container_invalid";

function encode(type: Type, value: Record<string, unknown>): Uint8Array {
  const message = type.fromObject(value);
  const error = type.verify(message);
  if (error !== null) throw new Error(error);
  return type.encode(message).finish();
}

function wrapper(name: string, data: Uint8Array): Uint8Array {
  return encode(wrapperType, { name, data });
}

describe("strict GameDetailRecords unwrap", () => {
  test("returns the inner bytes for a correctly named wrapper", () => {
    const inner = Uint8Array.of(10, 20, 30);
    const result = unwrapGameDetailRecords(
      bundle,
      wrapper(".lq.GameDetailRecords", inner),
    );
    expect(result).toEqual(inner);
  });

  test("fails closed on a wrong wrapper name", () => {
    expect(() => unwrapGameDetailRecords(
      bundle,
      wrapper(".lq.WrongType", Uint8Array.of(1)),
    )).toThrow(fixedCode);
  });

  test("fails closed on empty inner data", () => {
    expect(() => unwrapGameDetailRecords(
      bundle,
      wrapper(".lq.GameDetailRecords", new Uint8Array()),
    )).toThrow(fixedCode);
  });

  test("fails closed on empty input", () => {
    expect(() => unwrapGameDetailRecords(bundle, new Uint8Array()))
      .toThrow(fixedCode);
  });

  test("fails closed on bytes that are not a Wrapper", () => {
    expect(() => unwrapGameDetailRecords(
      bundle,
      Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0xff),
    )).toThrow(fixedCode);
  });
});
