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
  it("fixture A: unwraps and decodes 978 stored actions with ordinal gaps, then maps the full game", async () => {
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

    // With ankan/kakan pinned by the real evidence (see the test below), the
    // full 9-round game maps end to end — no fail-closed stop at ordinal 561.
    const mapped = mapMahjongSoulRecord({
      gameId: "majsoul:real-record-fixture-a",
      selfActor: 0,
      recordId: fixture.recordId,
      recordBytes: inner,
      bundle,
    });
    expect(mapped.status).toBe("ready");
    if (mapped.status !== "ready") return;
    // EOF closing invariant: every started round is closed (9/9) and the
    // record ends with the settled game_ended, not in an active round.
    expect(mapped.stream.events.filter((event) => event.type === "round_started").length).toBe(9);
    expect(mapped.stream.events.filter((event) => event.type === "round_ended").length).toBe(9);
    expect(mapped.stream.events.filter((event) => event.type === "win_declared").length).toBe(9);
    expect(mapped.stream.events.filter((event) => event.type === "game_ended").length).toBe(1);
    expect(mapped.stream.events.at(-1)?.type).toBe("game_ended");
    // The two real kans map — provenance details are pinned by the dedicated
    // RecordAnGangAddGang test below.
    expect(mapped.stream.events.filter((event) => event.type === "ankan_declared").length).toBe(1);
    expect(mapped.stream.events.filter((event) => event.type === "kakan_declared").length).toBe(1);
  });

  // P0-4: the RecordAnGangAddGang enum mapping is pinned as a PROTOCOL fact,
  // not derived from game-state reasoning. The wire says type=3 at ordinal
  // 561 and type=2 at ordinal 1139; the mapper must turn those into
  // ankan_declared / kakan_declared with verifiable sourceRecordRef
  // provenance. Any other type stays unsupported_semantics (unit-tested in
  // canonical-mapper.test.ts).
  it("fixture A: maps both real RecordAnGangAddGang instances per the pinned type enum", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixture("real-record-wire");
    const inner = unwrapGameDetailRecords(bundle, wireBytes(fixture));
    const actions = decodeStoredRecordActions(bundle, inner);

    const kans = actions.filter((action) => action.name === "RecordAnGangAddGang");
    expect(kans.length).toBe(2);
    expect(kans.map((kan) => kan.sourceRecordOrdinal)).toEqual([561, 1139]);
    // Protocol facts on the wire: { seat, type, tiles } per instance.
    expect(kans.map((kan) => ({
      ordinal: kan.sourceRecordOrdinal,
      seat: kan.data.seat ?? 0,
      type: kan.data.type,
      tiles: kan.data.tiles,
    }))).toEqual([
      { ordinal: 561, seat: 2, type: 3, tiles: "3s" },
      { ordinal: 1139, seat: 3, type: 2, tiles: "7z" },
    ]);

    const mapped = mapMahjongSoulRecord({
      gameId: "majsoul:real-record-kan-provenance",
      selfActor: 0,
      recordId: fixture.recordId,
      recordBytes: inner,
      bundle,
    });
    expect(mapped.status).toBe("ready");
    if (mapped.status !== "ready") return;

    const ankan = mapped.stream.events.find((event) => event.type === "ankan_declared");
    if (ankan?.type !== "ankan_declared") throw new Error("expected ankan_declared");
    expect(ankan.actor).toBe(2);
    expect(ankan.tiles).toHaveLength(4);
    expect(ankan.tiles.every((tile) => tile.id === "3s" && tile.red === false)).toBe(true);
    expect(ankan.sourceRecordRef).toBe(`record:${recordId}:action:561`);

    const kakan = mapped.stream.events.find((event) => event.type === "kakan_declared");
    if (kakan?.type !== "kakan_declared") throw new Error("expected kakan_declared");
    expect(kakan.actor).toBe(3);
    expect(kakan.addedTile).toEqual({ id: "7z", red: false });
    // The upgraded pon must be the actor's own in-record pon of the same tile.
    const pon = mapped.stream.events.find((event) =>
      event.type === "pon_called" && event.actor === 3 && event.calledTile.id === "7z"
    );
    expect(pon).toBeDefined();
    expect(kakan.upgradedPonEventRef).toBe(pon?.eventId);
    expect(kakan.sourceRecordRef).toBe(`record:${recordId}:action:1139`);
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

  // Decoder-level real-wire facts for EVERY RecordChiPengGang in fixture A.
  // The full mapper fails closed at the first RecordAnGangAddGang (source
  // ordinal 561), which is after 3 of these calls, so the evidence for the
  // other 8 must not depend on the mapper reaching them.
  it("all 11 real RecordChiPengGang call the tile at the unique non-actor froms index", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixture("real-record-wire");
    const actions = decodeStoredRecordActions(
      bundle,
      unwrapGameDetailRecords(bundle, wireBytes(fixture)),
    );

    // proto3 default normalization: an absent seat/type decodes as undefined.
    const u32 = (value: unknown): number =>
      value === undefined || value === null ? 0 : value as number;

    const calls = actions.filter((action) => action.name === "RecordChiPengGang");
    expect(calls.length).toBe(11);

    const typeDistribution: Record<string, number> = {};
    const consumedDiscards = new Set<string>();
    for (const call of calls) {
      const actor = u32(call.data.seat);
      const type = u32(call.data.type);
      const tiles = call.data.tiles;
      const froms = call.data.froms;
      if (!Array.isArray(tiles) || !Array.isArray(froms)) {
        throw new Error("bad RecordChiPengGang fixture wire");
      }
      expect(froms.length).toBe(tiles.length);

      // Exactly one froms entry differs from the actor seat.
      const nonActor = froms
        .map((from, index) => ({ from: u32(from), index }))
        .filter(({ from }) => from !== actor);
      expect(nonActor.length).toBe(1);
      const calledIndex = nonActor[0]!.index;
      const target = nonActor[0]!.from;
      expect(calledIndex).toBeGreaterThanOrEqual(0);
      expect(calledIndex).toBeLessThan(tiles.length);

      // The called tile really is a discard the target made earlier in the
      // same record: find the latest unconsumed matching discard.
      const calledTile = tiles[calledIndex];
      const discard = [...actions]
        .filter((candidate) => candidate.sourceRecordOrdinal < call.sourceRecordOrdinal)
        .reverse()
        .find((candidate) =>
          candidate.name === "RecordDiscardTile"
          && u32(candidate.data.seat) === target
          && candidate.data.tile === calledTile
          && !consumedDiscards.has(`${candidate.sourceRecordOrdinal}`)
        );
      expect(discard).toBeDefined();
      consumedDiscards.add(`${discard!.sourceRecordOrdinal}`);

      const label = type === 0 ? "chi" : type === 1 ? "pon" : type === 2 ? "daiminkan" : `type${type}`;
      typeDistribution[label] = (typeDistribution[label] ?? 0) + 1;
    }

    // Real distribution for this record: 7 pon, 4 chi, no daiminkan sample.
    expect(typeDistribution).toEqual({ pon: 7, chi: 4 });
  });
});
