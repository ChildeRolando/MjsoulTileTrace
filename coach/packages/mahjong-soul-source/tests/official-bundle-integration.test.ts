import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAHJONG_SOUL_SAFE_DIRECT_CALL_METHODS,
  createLiqiCodec,
  extractCapturedLoginCredential,
  loadMahjongSoulProtocolBundle,
} from "../src/index.js";

const bundleRoot = fileURLToPath(new URL(
  "../../../vendor/mahjong-soul-protocol/",
  import.meta.url,
));
const fixtureUrl = new URL(
  "./fixtures/official-bundle-frames.json",
  import.meta.url,
);
const recordId = "260811-01234567-89ab-cdef-0123-456789abcdef";
const fixedCode = "mahjong_soul_login_protocol_unsupported";

interface FrameFixture {
  readonly fixtureVersion: "mahjong-soul-official-bundle-frames/v1";
  readonly frames: Readonly<Record<string, string>>;
}

function fromHex(value: string): Uint8Array {
  expect(value).toMatch(/^(?:[0-9a-f]{2})+$/u);
  return Buffer.from(value, "hex");
}

function toHex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}

describe("official Mahjong Soul bundle synthetic frames", () => {
  it("decodes the fixed official wire surface without network or credentials", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as FrameFixture;
    expect(fixture.fixtureVersion)
      .toBe("mahjong-soul-official-bundle-frames/v1");
    expect(Object.values(fixture.frames)).toHaveLength(14);
    for (const frame of Object.values(fixture.frames)) fromHex(frame);

    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const codec = createLiqiCodec(bundle, {
      directCallMethods: MAHJONG_SOUL_SAFE_DIRECT_CALL_METHODS,
      surfacedNotifications: [],
    });

    expect(codec.decodeClientFrame(fromHex(fixture.frames.loginRequest!)))
      .toEqual({
        kind: "request_observed",
        requestId: 1,
        method: ".lq.Lobby.login",
      });
    const login = extractCapturedLoginCredential(
      codec.decodeServerFrame(fromHex(fixture.frames.loginResponse!)),
    );
    expect({
      region: login.region,
      loginMethod: login.loginMethod,
      authType: login.authType,
      accountId: login.accountId,
      displayName: login.displayName,
      accessToken: login.accessToken.reveal(),
    }).toEqual({
      region: "cn",
      loginMethod: "login",
      authType: 0,
      accountId: 123456789,
      displayName: "ProtocolFixture",
      accessToken: "fixture-token-never-real",
    });

    expect(codec.decodeClientFrame(fromHex(fixture.frames.oauth2LoginRequest!)))
      .toEqual({
        kind: "request_observed",
        requestId: 2,
        method: ".lq.Lobby.oauth2Login",
      });
    const oauth = extractCapturedLoginCredential(
      codec.decodeServerFrame(fromHex(fixture.frames.oauth2LoginResponse!)),
    );
    expect(oauth.loginMethod).toBe("oauth2Login");
    expect(oauth.authType).toBe(7);
    expect(oauth.accessToken.reveal()).toBe("fixture-token-never-real");

    expect(toHex(codec.encodeRequest({
      requestId: 10,
      method: ".lq.Lobby.fetchGameRecordListV2",
      payload: { tag: 0, begin_time: 1, end_time: 2 },
    }))).toBe(fixture.frames.listV2Request);
    expect(codec.decodeServerFrame(fromHex(fixture.frames.listV2Response!)))
      .toMatchObject({
        kind: "response",
        requestId: 10,
        method: ".lq.Lobby.fetchGameRecordListV2",
        payload: {
          iterator: "fixture-iterator",
          iterator_expire: 600,
          actual_begin_time: 1,
          actual_end_time: 2,
        },
      });

    expect(toHex(codec.encodeRequest({
      requestId: 11,
      method: ".lq.Lobby.fetchNextGameRecordList",
      payload: { iterator: "fixture-iterator", count: 30 },
    }))).toBe(fixture.frames.nextListRequest);
    const next = codec.decodeServerFrame(fromHex(fixture.frames.nextListResponse!));
    expect(next).toMatchObject({
      kind: "response",
      requestId: 11,
      method: ".lq.Lobby.fetchNextGameRecordList",
      payload: {
        next: false,
        entries: [{
          version: 210715,
          uuid: recordId,
          players: [{
            account_id: 123456789,
            nickname: "ProtocolFixture",
            point: 35000,
          }],
          standard_rule: 2,
        }],
      },
    });

    expect(toHex(codec.encodeRequest({
      requestId: 12,
      method: ".lq.Lobby.fetchGameRecord",
      payload: {
        game_uuid: recordId,
        client_version_string: "web-0.11.252.w",
      },
    }))).toBe(fixture.frames.recordInlineRequest);
    const inline = codec.decodeServerFrame(
      fromHex(fixture.frames.recordInlineResponse!),
    );
    expect(inline.kind).toBe("response");
    if (inline.kind !== "response") throw new Error("unexpected fixture");
    expect(inline.payload.data).toEqual(Uint8Array.from([1, 2, 3, 4]));
    expect(inline.payload.data_url).toBe("");

    expect(toHex(codec.encodeRequest({
      requestId: 13,
      method: ".lq.Lobby.fetchGameRecord",
      payload: {
        game_uuid: recordId,
        client_version_string: "web-0.11.252.w",
      },
    }))).toBe(fixture.frames.recordUrlRequest);
    const dataUrl = codec.decodeServerFrame(
      fromHex(fixture.frames.recordUrlResponse!),
    );
    expect(dataUrl).toMatchObject({
      kind: "response",
      requestId: 13,
      payload: {
        data_url:
          "https://record-old.maj-soul.com:9443/majsoul/game_record/fixture",
      },
    });

    codec.decodeClientFrame(fromHex(fixture.frames.hostileLoginRequest!));
    const hostile = codec.decodeServerFrame(
      fromHex(fixture.frames.hostileLoginResponse!),
    );
    expect(() => extractCapturedLoginCredential(hostile)).toThrowError(
      fixedCode,
    );
    try {
      extractCapturedLoginCredential(hostile);
    } catch (error) {
      expect((error as Error).message).not.toContain(
        "hostile-server-token-prose",
      );
    }
    codec.close();
  });
});
