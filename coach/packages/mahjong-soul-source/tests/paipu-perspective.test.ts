import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  decodeMahjongSoulPerspectiveToken,
  encodeMahjongSoulPerspectiveAccountId,
  resolveMahjongSoulPaipuPerspective,
} from "../src/paipu-perspective.js";
import type { MahjongSoulCapturedRecordIdentity } from "../src/record-capture.js";

const fixture = JSON.parse(readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/paipu-identity.json",
), "utf8")) as {
  readonly parsed: { readonly recordId: string; readonly perspectiveToken: number };
  readonly captured: MahjongSoulCapturedRecordIdentity;
  readonly expected: { readonly selfActor: number };
};

const recordId = "260811-00000000-0000-0000-0000-000000000001";
const accounts = [
  { accountId: 100001, seat: 0 },
  { accountId: 100002, seat: 1 },
  { accountId: 100003, seat: 2 },
  { accountId: 100004, seat: 3 },
];

function identity(
  overrides?: Partial<{
    recordId: string;
    capturedRecordId: string;
    accountId: number;
    token: number;
    accounts: readonly { accountId: number; seat: number }[];
  }>,
) {
  const accountId = overrides?.accountId ?? 100003;
  return {
    parsedUrl: {
      recordId: overrides?.recordId ?? recordId,
      perspectiveToken: overrides?.token ?? encodeMahjongSoulPerspectiveAccountId(accountId),
    },
    capturedIdentity: {
      recordId: overrides?.capturedRecordId ?? overrides?.recordId ?? recordId,
      accounts: overrides?.accounts ?? accounts,
    },
  };
}

describe("share token deobfuscation", () => {
  test("decode and encode are exact inverses", () => {
    // Account ids the transform can express: 7*id + 1117113 must stay in
    // int32 (real Mahjong Soul ids are ~1e8, far inside).
    for (const accountId of [1, 7, 100003, 15986753, 23664228]) {
      const token = encodeMahjongSoulPerspectiveAccountId(accountId);
      expect(Number.isInteger(token)).toBe(true);
      expect(token).toBeGreaterThan(0);
      expect(decodeMahjongSoulPerspectiveToken(token)).toBe(accountId);
    }
    // An account too large for the int32 XOR stage cannot be encoded and
    // fails closed rather than wrapping.
    expect(() => encodeMahjongSoulPerspectiveAccountId(429_496_729))
      .toThrow("mahjong_soul_record_identity_mismatch");
    // The fixture's token is exactly the transform of its seat-3 account.
    expect(encodeMahjongSoulPerspectiveAccountId(100003))
      .toBe(fixture.parsed.perspectiveToken);
  });

  test.each([
    ["zero", 0],
    ["negative", -5],
    ["fractional", 1.5],
    ["above uint32", 4_294_967_296],
    ["non-decoding small token", 1],
    ["non-decoding mid token", 123_456_789],
  ])("fails closed on a token that is not a valid encoding (%s)", (_label, token) => {
    expect(() => decodeMahjongSoulPerspectiveToken(token as number))
      .toThrow("mahjong_soul_record_identity_mismatch");
  });
});

describe("paipu perspective identity join", () => {
  test("sanitized fixture: the share token resolves to the seat-3 account", () => {
    expect(resolveMahjongSoulPaipuPerspective({
      parsedUrl: fixture.parsed,
      capturedIdentity: fixture.captured,
    })).toEqual({
      recordId: fixture.parsed.recordId,
      selfActor: 3,
    });
  });

  test("resolves the seat of the decoded account, order irrelevant", () => {
    for (const accountId of [100001, 100002, 100003, 100004]) {
      expect(resolveMahjongSoulPaipuPerspective(
        identity({ accountId }),
      )).toEqual({
        recordId,
        selfActor: accounts.find((a) => a.accountId === accountId)!.seat,
      });
    }
    // Account order on the wire is irrelevant to the join.
    expect(resolveMahjongSoulPaipuPerspective(identity({
      accounts: [...accounts].reverse(),
      accountId: 100004,
    }))).toEqual({ recordId, selfActor: 3 });
  });

  test.each([
    ["decoded account not in the record", identity({ accountId: 9_999_999 })],
    ["raw token compared without decoding never matches", identity({
      // A token that IS an account id in the record would be the old broken
      // direct-join model: it must fail (it is not a valid encoding of any
      // account, or decodes elsewhere) — proving the decode step is load-
      // bearing.
      token: 100003,
    })],
    ["duplicate matching account", identity({
      accounts: [
        ...accounts.slice(0, 3),
        { accountId: 100003, seat: 1 },
        { accountId: 100003, seat: 2 },
      ],
      accountId: 100003,
    })],
    ["invalid matched seat", identity({
      accounts: [{ accountId: 100003, seat: 7 }],
      accountId: 100003,
    })],
    ["invalid matched seat (fraction)", identity({
      accounts: [{ accountId: 100003, seat: 1.5 }],
      accountId: 100003,
    })],
    ["invalid other account seat", identity({
      accounts: [...accounts.slice(0, 3), { accountId: 100004, seat: -1 }],
    })],
    ["invalid account id", identity({
      accounts: [{ accountId: 0, seat: 0 }, ...accounts.slice(1)],
    })],
    ["empty accounts", identity({ accounts: [] })],
    ["captured recordId mismatch", identity({
      capturedRecordId: "260811-00000000-0000-0000-0000-000000000002",
    })],
    ["missing captured identity", { parsedUrl: identity().parsedUrl } as never],
    ["missing parsed url", { capturedIdentity: identity().capturedIdentity } as never],
    ["non-integer token", {
      parsedUrl: { recordId, perspectiveToken: 1.5 },
      capturedIdentity: identity().capturedIdentity,
    } as never],
  ])("fails closed on identity mismatch (%s)", (_label, bad) => {
    expect(() => resolveMahjongSoulPaipuPerspective(bad))
      .toThrow("mahjong_soul_record_identity_mismatch");
  });
});
