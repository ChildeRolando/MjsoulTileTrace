import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, type Type } from "protobufjs";
import { describe, expect, test } from "vitest";
import type { MahjongSoulProtocolBundle } from "../src/protocol-bundle.js";
import { createMahjongSoulRecordCapture } from "../src/record-capture.js";

const fixtureDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const protoText = readFileSync(resolve(fixtureDir, "minimal-liqi.proto"), "utf8");
const rpcMap = JSON.parse(
  readFileSync(resolve(fixtureDir, "minimal-rpc-map.json"), "utf8"),
) as Record<string, { req: string; resp: string }>;
const root = parse(protoText, { keepCase: true }).root;
const wrapperType = root.lookupType("lq.Wrapper");

const bundle = { protoText, rpcMap } as MahjongSoulProtocolBundle;

function encode(type: Type, value: Record<string, unknown>): Uint8Array {
  const message = type.fromObject(value);
  const error = type.verify(message);
  if (error !== null) throw new Error(error);
  return type.encode(message).finish();
}

function gameDetailWrapper(inner: Uint8Array): Uint8Array {
  return encode(wrapperType, { name: ".lq.GameDetailRecords", data: inner });
}

// Mirrors the real lq.RecordGame identity shape (synthetic account ids).
function recordHead(recordId: string, accounts: ReadonlyArray<{ accountId: number; seat: number }>) {
  return {
    uuid: recordId,
    accounts: accounts.map((account) => ({
      account_id: account.accountId,
      seat: account.seat,
      nickname: "redacted", // must never surface in the capture result
    })),
  };
}

const syntheticAccounts = [
  { accountId: 100001, seat: 0 },
  { accountId: 100002, seat: 1 },
  { accountId: 100004, seat: 2 },
  { accountId: 100003, seat: 3 },
];

function requestFrame(requestId: number, method: string, payload: Record<string, unknown>): Uint8Array {
  const route = rpcMap[method]!;
  const body = encode(root.lookupType(route.req), payload);
  const wrapped = encode(wrapperType, { name: method, data: body });
  const output = new Uint8Array(3 + wrapped.length);
  output[0] = 2;
  output[1] = requestId & 0xff;
  output[2] = requestId >>> 8;
  output.set(wrapped, 3);
  return output;
}

function responseFrame(requestId: number, responseTypeName: string, payload: Record<string, unknown>): Uint8Array {
  const body = encode(root.lookupType(responseTypeName), payload);
  const wrapped = encode(wrapperType, { name: "", data: body });
  const output = new Uint8Array(3 + wrapped.length);
  output[0] = 3;
  output[1] = requestId & 0xff;
  output[2] = requestId >>> 8;
  output.set(wrapped, 3);
  return output;
}

describe("passive Mahjong Soul record capture", () => {
  test("captures an inline fetchGameRecord response with its record identity", () => {
    const capture = createMahjongSoulRecordCapture({ bundle });
    const recordBytes = Uint8Array.of(10, 20, 30, 40);

    expect(capture.observeClientFrame(requestFrame(
      7,
      ".lq.Lobby.fetchGameRecord",
      { game_uuid: "fixture-uuid" },
    ))).toEqual({
      kind: "request_observed",
      requestId: 7,
      method: ".lq.Lobby.fetchGameRecord",
    });

    const result = capture.observeServerFrame(responseFrame(
      7,
      ".lq.ResGameRecord",
      {
        head: recordHead("fixture-record-id", syntheticAccounts),
        data: gameDetailWrapper(recordBytes),
      },
    ));
    // The identity comes from the SAME response and carries ONLY the join
    // fields — uuid + account ids + seats, never nicknames.
    expect(result).toEqual({
      status: "record_captured",
      recordBytes,
      recordIdentity: {
        recordId: "fixture-record-id",
        accounts: syntheticAccounts,
      },
    });
    if (result?.status !== "record_captured") throw new Error("unexpected");
    expect(result.recordBytes).toEqual(recordBytes);
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("redacted");
  });

  test("fails closed when the response data wrapper has the wrong name", () => {
    const capture = createMahjongSoulRecordCapture({ bundle });
    capture.observeClientFrame(requestFrame(9, ".lq.Lobby.fetchGameRecord", { game_uuid: "x" }));
    const wrongData = encode(wrapperType, { name: ".lq.WrongType", data: Uint8Array.of(1) });
    expect(() => capture.observeServerFrame(responseFrame(
      9,
      ".lq.ResGameRecord",
      { head: recordHead("fixture-record-id", syntheticAccounts), data: wrongData },
    ))).toThrow("mahjong_soul_login_protocol_unsupported");
  });

  test.each([
    ["no head", undefined],
    ["head without uuid", { accounts: syntheticAccounts }],
    ["head with empty uuid", { uuid: "", accounts: syntheticAccounts }],
    ["head without accounts", { uuid: "fixture-record-id" }],
    ["head with empty accounts", { uuid: "fixture-record-id", accounts: [] }],
    ["account without id", { uuid: "fixture-record-id", accounts: [{ seat: 0 }] }],
    // (Non-integer account/seat values are unreachable through a real
    // protobuf uint32 decode — the extraction guards stay as defense, but
    // they cannot be driven through the wire encoder.)
  ])("fails closed when the record metadata is malformed (%s)", (_label, head) => {
    const capture = createMahjongSoulRecordCapture({ bundle });
    capture.observeClientFrame(requestFrame(11, ".lq.Lobby.fetchGameRecord", { game_uuid: "x" }));
    expect(() => capture.observeServerFrame(responseFrame(
      11,
      ".lq.ResGameRecord",
      { head, data: gameDetailWrapper(Uint8Array.of(1, 2)) },
    ))).toThrow("mahjong_soul_login_protocol_unsupported");
  });

  test("ignores a list response instead of treating it as a record", () => {
    const capture = createMahjongSoulRecordCapture({ bundle });
    expect(capture.observeClientFrame(requestFrame(
      3,
      ".lq.Lobby.fetchGameRecordListV2",
      {},
    ))).toEqual({
      kind: "request_observed",
      requestId: 3,
      method: ".lq.Lobby.fetchGameRecordListV2",
    });
    expect(capture.observeServerFrame(responseFrame(
      3,
      ".lq.ResEmpty",
      {},
    ))).toBeNull();
  });

  test("returns null for a fetchGameRecord response without inline data", () => {
    const capture = createMahjongSoulRecordCapture({ bundle });
    capture.observeClientFrame(requestFrame(5, ".lq.Lobby.fetchGameRecord", { game_uuid: "x" }));
    const result = capture.observeServerFrame(responseFrame(
      5,
      ".lq.ResGameRecord",
      { head: recordHead("fixture-record-id", syntheticAccounts), data: new Uint8Array() },
    ));
    expect(result).toBeNull();
  });
});
