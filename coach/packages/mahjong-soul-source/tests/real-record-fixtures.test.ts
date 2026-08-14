import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  decodeStoredRecordActions,
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
} from "../src/index.js";

const bundleRoot = fileURLToPath(
  new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url),
);

// Synthetic, schema-shaped id written by the fixture generator; never a real
// replay identifier (scripts/generate-mahjong-soul-real-fixtures.mjs).
const recordId = "000000-00000000-0000-0000-0000-000000000001";

interface RealRecordFixture {
  readonly fixtureVersion: string;
  readonly description: string;
  readonly recordId: string;
  readonly wire: string;
}

function loadFixture(name: string): RealRecordFixture {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"),
  ) as RealRecordFixture;
}

function wireBytes(fixture: RealRecordFixture): Uint8Array {
  return Uint8Array.from(Buffer.from(fixture.wire, "hex"));
}

describe("sanitized real stored-record fixtures", () => {
  it("fixture A: unwraps and decodes 978 stored actions with ordinal gaps, then fails closed as unsupported_semantics", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixture("real-record-wire");
    expect(fixture.recordId).toBe(recordId);

    const inner = unwrapGameDetailRecords(bundle, wireBytes(fixture));
    const actions = decodeStoredRecordActions(bundle, inner);
    expect(actions.length).toBe(978);

    // Empty GameAction.result entries are skipped WITHOUT compressing ordinals:
    // the first stored action sits at source index 9, so its 1-based ordinal is 10.
    expect(actions[0]?.sourceRecordOrdinal).toBe(10);
    const ordinals = actions.map((action) => action.sourceRecordOrdinal);
    for (let index = 1; index < ordinals.length; index += 1) {
      expect(ordinals[index]).toBeGreaterThan(ordinals[index - 1]!);
    }
    expect(ordinals.some((ordinal, index) => index > 0 && ordinal > ordinals[index - 1]! + 1))
      .toBe(true);
    expect(ordinals[ordinals.length - 1]).toBeLessThanOrEqual(1616);

    const distribution = new Map<string, number>();
    for (const action of actions) {
      distribution.set(action.name, (distribution.get(action.name) ?? 0) + 1);
    }
    expect(Object.fromEntries(distribution)).toEqual({
      RecordNewRound: 9,
      RecordDealTile: 466,
      RecordDiscardTile: 481,
      RecordChiPengGang: 11,
      RecordAnGangAddGang: 2,
      RecordHule: 9,
    });

    const mapped = mapMahjongSoulRecord({
      gameId: "majsoul:real-record-fixture-a",
      selfActor: 0,
      recordId: fixture.recordId,
      recordBytes: inner,
      bundle,
    });
    expect(mapped).toEqual({
      status: "invalid",
      code: "mahjong_soul_canonical_unsupported_semantics",
    });
  });

  it("fixture B: a fully supported real round maps to a ready canonical stream", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixture("real-supported-round");
    expect(fixture.recordId).toBe(recordId);

    const inner = unwrapGameDetailRecords(bundle, wireBytes(fixture));
    const actions = decodeStoredRecordActions(bundle, inner);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0]?.sourceRecordOrdinal).toBe(1);
    expect(actions[0]?.name).toBe("RecordNewRound");
    const supported = new Set([
      "RecordNewRound",
      "RecordDealTile",
      "RecordDiscardTile",
      "RecordChiPengGang",
      "RecordHule",
    ]);
    for (const action of actions) {
      expect(supported.has(action.name)).toBe(true);
    }

    const mapped = mapMahjongSoulRecord({
      gameId: "majsoul:real-record-fixture-b",
      selfActor: 0,
      recordId: fixture.recordId,
      recordBytes: inner,
      bundle,
    });
    expect(mapped.status).toBe("ready");
  });
});
