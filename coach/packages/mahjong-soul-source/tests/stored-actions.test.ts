import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type Type } from "protobufjs";
import { describe, expect, test } from "vitest";
import type { MahjongSoulProtocolBundle } from "../src/protocol-bundle.js";
import { decodeStoredRecordActions } from "../src/stored-actions.js";

const protoText = readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/liqi.proto",
), "utf8");
const root = parse(protoText, { keepCase: true }).root;
const wrapperType = root.lookupType("lq.Wrapper");
const recordsType = root.lookupType("lq.GameDetailRecords");
const bundle = { protoText } as MahjongSoulProtocolBundle;
const fixedCode = "mahjong_soul_record_container_invalid";

function encode(type: Type, value: Record<string, unknown>): Uint8Array {
  const message = type.fromObject(value);
  const error = type.verify(message);
  if (error !== null) throw new Error(error);
  return type.encode(message).finish();
}

function recordWrapper(name: string, data: Uint8Array): Uint8Array {
  return encode(wrapperType, { name, data });
}

function gameDetail(actions: ReadonlyArray<{ result: Uint8Array }>): Uint8Array {
  return encode(recordsType, { version: 210715, actions: [...actions] });
}

describe("stored Record* action decoder", () => {
  test("decodes a RecordNewRound action and keeps its 1-based ordinal", () => {
    const round = encode(root.lookupType("lq.RecordNewRound"), {
      chang: 1, ju: 2, ben: 0, dora: "1z", liqibang: 0,
      tiles0: ["1m"], tiles1: ["2m"], tiles2: ["3m"], tiles3: ["4m"],
    });
    const actions = decodeStoredRecordActions(bundle, gameDetail([
      { result: recordWrapper(".lq.RecordNewRound", round) },
    ]));
    expect(actions).toHaveLength(1);
    expect(actions[0]!.sourceRecordOrdinal).toBe(1);
    expect(actions[0]!.name).toBe("RecordNewRound");
    expect(actions[0]!.data.chang).toBe(1);
    expect(actions[0]!.data.ju).toBe(2);
    expect(actions[0]!.data.tiles0).toEqual(["1m"]);
    expect(actions[0]!.data.tiles3).toEqual(["4m"]);
    expect(Object.isFrozen(actions[0])).toBe(true);
  });

  test("skips empty results without compressing the ordinal", () => {
    const round = encode(root.lookupType("lq.RecordNewRound"), {
      chang: 0, ju: 0, ben: 0, dora: "1z", tiles0: ["1m"],
    });
    const actions = decodeStoredRecordActions(bundle, gameDetail([
      { result: new Uint8Array() },
      { result: recordWrapper(".lq.RecordNewRound", round) },
    ]));
    expect(actions).toHaveLength(1);
    expect(actions[0]!.sourceRecordOrdinal).toBe(2);
    expect(actions[0]!.name).toBe("RecordNewRound");
  });

  test("fails closed on a non-Record action name", () => {
    const liveRound = encode(root.lookupType("lq.ActionNewRound"), {
      chang: 0, ju: 0, ben: 0, tiles: ["1m"],
    });
    expect(() => decodeStoredRecordActions(bundle, gameDetail([
      { result: recordWrapper(".lq.ActionNewRound", liveRound) },
    ]))).toThrow(fixedCode);
  });

  test("fails closed on a result that is not a Wrapper", () => {
    expect(() => decodeStoredRecordActions(bundle, gameDetail([
      { result: Uint8Array.of(0xff, 0xff) },
    ]))).toThrow(fixedCode);
  });
});
