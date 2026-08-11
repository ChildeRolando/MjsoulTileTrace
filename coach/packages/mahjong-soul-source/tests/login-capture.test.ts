import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createMahjongSoulLoginCapture,
  loadMahjongSoulProtocolBundle,
  type MahjongSoulProtocolBundle,
} from "../src/index.js";

const bundleRoot = fileURLToPath(new URL(
  "../../../vendor/mahjong-soul-protocol/",
  import.meta.url,
));
const fixtureUrl = new URL("./fixtures/official-bundle-frames.json", import.meta.url);
let bundle: MahjongSoulProtocolBundle;
let frames: Record<string, string>;

const bytes = (name: string) => Buffer.from(frames[name]!, "hex");

beforeAll(async () => {
  bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as {
    readonly frames: Record<string, string>;
  };
  frames = fixture.frames;
});

describe("correlated Mahjong Soul login capture", () => {
  it.each([
    ["login", "loginRequest", "loginResponse", 0],
    ["oauth2Login", "oauth2LoginRequest", "oauth2LoginResponse", 7],
  ] as const)("captures one %s success", (loginMethod, request, response, authType) => {
    const capture = createMahjongSoulLoginCapture({ bundle });

    expect(capture.observeClientFrame(bytes(request))).toEqual({
      kind: "request_observed",
      requestId: loginMethod === "login" ? 1 : 2,
      method: `.lq.Lobby.${loginMethod}`,
    });
    const result = capture.observeServerFrame(bytes(response));

    expect(result?.status).toBe("authenticated");
    if (result?.status !== "authenticated") throw new Error("unexpected result");
    expect({
      region: result.credential.region,
      loginMethod: result.credential.loginMethod,
      authType: result.credential.authType,
      accountId: result.credential.accountId,
      displayName: result.credential.displayName,
      accessToken: result.credential.accessToken.reveal(),
    }).toEqual({
      region: "cn",
      loginMethod,
      authType,
      accountId: 123_456_789,
      displayName: "ProtocolFixture",
      accessToken: "fixture-token-never-real",
    });
    expect(() => capture.observeServerFrame(bytes(response))).toThrow(
      "mahjong_soul_login_protocol_unsupported",
    );
  });

  it("returns a fixed rejection without upstream code or prose", () => {
    const capture = createMahjongSoulLoginCapture({ bundle });
    capture.observeClientFrame(bytes("hostileLoginRequest"));

    expect(capture.observeServerFrame(bytes("hostileLoginResponse"))).toEqual({
      status: "rejected",
    });
  });

  it("binds restore to the expected login method and account", () => {
    for (const expected of [
      { loginMethod: "oauth2Login" as const, accountId: 123_456_789 },
      { loginMethod: "login" as const, accountId: 1 },
    ]) {
      const capture = createMahjongSoulLoginCapture({ bundle, expected });
      capture.observeClientFrame(bytes("loginRequest"));
      expect(capture.observeServerFrame(bytes("loginResponse"))).toEqual({
        status: "rejected",
      });
    }
  });

  it("fails closed on response-before-request, malformed and post-close frames", () => {
    expect(() => createMahjongSoulLoginCapture({ bundle })
      .observeServerFrame(bytes("loginResponse"))).toThrow(
      "mahjong_soul_login_protocol_unsupported",
    );

    const malformed = createMahjongSoulLoginCapture({ bundle });
    expect(() => malformed.observeClientFrame(Uint8Array.from([2]))).toThrow(
      "mahjong_soul_login_protocol_unsupported",
    );
    expect(() => malformed.observeClientFrame(bytes("loginRequest"))).toThrow(
      "mahjong_soul_login_protocol_unsupported",
    );

    const closed = createMahjongSoulLoginCapture({ bundle });
    closed.close();
    expect(() => closed.observeClientFrame(bytes("loginRequest"))).toThrow(
      "mahjong_soul_login_protocol_unsupported",
    );
  });
});
