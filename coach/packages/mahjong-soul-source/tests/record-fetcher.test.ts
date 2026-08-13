import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "protobufjs";
import { describe, expect, test } from "vitest";

import {
  fetchMahjongSoulRecord,
  type MahjongSoulLobbySession,
  type MahjongSoulProtocolBundle,
} from "../src/index.js";

const protoText = readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../vendor/mahjong-soul-protocol/akagi-v3/27e994ad8bacd87833856b3b36b146ebb7cccbbc/liqi.proto",
), "utf8");
const root = parse(protoText, { keepCase: true }).root;
const bytes = root.lookupType("lq.GameDetailRecords").encode({
  version: 210715,
  actions: [{ passed: 0, type: 1, result: Uint8Array.of(1, 2, 3) }],
}).finish();
const bundle = {
  protoText,
  endpoints: { recordDataPrefixes: ["https://record-old.maj-soul.com:9443/majsoul/game_record"] },
} as unknown as MahjongSoulProtocolBundle;
const uuid = "260811-00000000-0000-0000-0000-000000000001";

function lobby(response: Readonly<Record<string, unknown>>): MahjongSoulLobbySession {
  return { async authenticate() {}, async call() { return response; }, async close() {} };
}

describe("trusted Mahjong Soul full record fetch", () => {
  test("decodes inline bytes and binds their digest", async () => {
    const result = await fetchMahjongSoulRecord({
      session: lobby({ error: null, data: bytes, data_url: "" }), bundle, recordId: uuid,
      clientVersionString: "web-0.11.252.w", fetchImpl: async () => { throw new Error("unused"); },
    });
    expect(result).toMatchObject({ recordId: uuid, container: "actions", actionCount: 1 });
    expect(result.sha256).toBe(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
    expect([...result.recordBytes]).toEqual([...bytes]);
    expect(result.recordBytes).not.toBe(bytes);
  });

  test("downloads an allowlisted data URL without following redirects", async () => {
    let requested = "";
    const result = await fetchMahjongSoulRecord({
      session: lobby({ error: null, data: new Uint8Array(), data_url: "https://record-old.maj-soul.com:9443/majsoul/game_record/x" }),
      bundle, recordId: uuid, clientVersionString: "web-0.11.252.w",
      fetchImpl: async (url, init) => {
        requested = String(url);
        expect(init?.redirect).toBe("error");
        return new Response(Buffer.from(bytes), { status: 200 });
      },
    });
    expect(requested).toContain("record-old.maj-soul.com:9443");
    expect(result.actionCount).toBe(1);
  });

  test.each([
    { data_url: "http://record-old.maj-soul.com:9443/majsoul/game_record/x" },
    { data_url: "https://attacker.invalid/majsoul/game_record/x" },
  ])("rejects untrusted record URL $data_url", async ({ data_url }) => {
    await expect(fetchMahjongSoulRecord({
      session: lobby({ error: null, data: new Uint8Array(), data_url }), bundle, recordId: uuid,
      clientVersionString: "web-0.11.252.w", fetchImpl: async () => new Response(Buffer.from(bytes)),
    })).rejects.toThrow("mahjong_soul_record_fetch_failed");
  });

  test("rejects malformed and empty decoded containers", async () => {
    for (const data of [Uint8Array.of(255), root.lookupType("lq.GameDetailRecords").encode({ version: 210715 }).finish()]) {
      await expect(fetchMahjongSoulRecord({
        session: lobby({ error: null, data, data_url: "" }), bundle, recordId: uuid,
        clientVersionString: "web-0.11.252.w", fetchImpl: async () => new Response(),
      })).rejects.toThrow();
    }
  });
});
