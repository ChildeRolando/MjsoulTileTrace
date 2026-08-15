import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { resolveMahjongSoulPaipuPerspective } from "../src/paipu-perspective.js";
import type { MahjongSoulCapturedRecordIdentity } from "../src/record-capture.js";

const fixture = JSON.parse(readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/paipu-identity.json",
), "utf8")) as {
  readonly parsed: { readonly recordId: string; readonly perspectiveId: number };
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
    perspectiveId: number;
    accounts: readonly { accountId: number; seat: number }[];
  }>,
) {
  return {
    parsedUrl: {
      recordId: overrides?.recordId ?? recordId,
      perspectiveId: overrides?.perspectiveId ?? 100003,
    },
    capturedIdentity: {
      recordId: overrides?.capturedRecordId ?? overrides?.recordId ?? recordId,
      accounts: overrides?.accounts ?? accounts,
    },
  };
}

describe("paipu perspective identity join", () => {
  test("sanitized fixture: the URL perspective account resolves to seat 3", () => {
    expect(resolveMahjongSoulPaipuPerspective(fixture.parsed
      ? { parsedUrl: fixture.parsed, capturedIdentity: fixture.captured }
      : identity())).toEqual({
      recordId: fixture.parsed.recordId,
      selfActor: 3,
    });
  });

  test("resolves the seat of the one matching account, order irrelevant", () => {
    for (const perspectiveId of [100001, 100002, 100003, 100004]) {
      expect(resolveMahjongSoulPaipuPerspective(
        identity({ perspectiveId }),
      )).toEqual({
        recordId,
        selfActor: accounts.find((a) => a.accountId === perspectiveId)!.seat,
      });
    }
    // Account order on the wire is irrelevant to the join.
    expect(resolveMahjongSoulPaipuPerspective(identity({
      accounts: [...accounts].reverse(),
      perspectiveId: 100004,
    }))).toEqual({ recordId, selfActor: 3 });
  });

  test.each([
    ["no matching account", identity({ perspectiveId: 999999 })],
    ["duplicate matching account", identity({
      accounts: [
        ...accounts.slice(0, 3),
        { accountId: 100003, seat: 1 },
        { accountId: 100003, seat: 2 },
      ],
      perspectiveId: 100003,
    })],
    ["invalid matched seat", identity({
      accounts: [{ accountId: 100003, seat: 7 }],
      perspectiveId: 100003,
    })],
    ["invalid matched seat (fraction)", identity({
      accounts: [{ accountId: 100003, seat: 1.5 }],
      perspectiveId: 100003,
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
    ["non-integer perspective account id", {
      parsedUrl: { recordId, perspectiveId: 1.5 },
      capturedIdentity: identity().capturedIdentity,
    } as never],
  ])("fails closed on identity mismatch (%s)", (_label, bad) => {
    expect(() => resolveMahjongSoulPaipuPerspective(bad))
      .toThrow("mahjong_soul_record_identity_mismatch");
  });
});
