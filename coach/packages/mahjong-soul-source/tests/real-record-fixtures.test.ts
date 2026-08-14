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
    expect(mapped.stream.events.filter((event) => event.type === "round_started").length).toBe(9);
    expect(mapped.stream.events.filter((event) => event.type === "round_ended").length).toBe(8);
    expect(mapped.stream.events.filter((event) => event.type === "win_declared").length).toBe(9);
    // The two real kans map with their provenance.
    const ankan = mapped.stream.events.find((event) => event.type === "ankan_declared");
    const kakan = mapped.stream.events.find((event) => event.type === "kakan_declared");
    if (ankan?.type !== "ankan_declared" || kakan?.type !== "kakan_declared") {
      throw new Error("expected one ankan and one kakan");
    }
    expect(ankan.actor).toBe(2);
    expect(ankan.tiles.every((tile) => tile.id === "3s")).toBe(true);
    expect(ankan.sourceRecordRef.endsWith(":action:561")).toBe(true);
    expect(kakan.actor).toBe(3);
    expect(kakan.addedTile.id).toBe("7z");
    expect(kakan.sourceRecordRef.endsWith(":action:1139")).toBe(true);
    const pon = mapped.stream.events.find((event) =>
      event.type === "pon_called" && event.actor === 3 && event.calledTile.id === "7z"
    );
    expect(pon).toBeDefined();
    expect(kakan.upgradedPonEventRef).toBe(pon?.eventId);
  });

  // P3 evidence: the wire facts that pin the RecordAnGangAddGang `type` enum.
  // Both real instances are proven from full game-state reconstruction, not
  // assumed: the type-3 kan is four concealed copies with no prior meld, the
  // type-2 kan upgrades an in-round pon of the same tile.
  it("fixture A: proves the ankan/kakan semantics of both real RecordAnGangAddGang instances", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = loadFixture("real-record-wire");
    const actions = decodeStoredRecordActions(
      bundle,
      unwrapGameDetailRecords(bundle, wireBytes(fixture)),
    );
    const kans = actions.filter((action) => action.name === "RecordAnGangAddGang");
    expect(kans.length).toBe(2);
    expect(kans.map((kan) => kan.sourceRecordOrdinal)).toEqual([561, 1139]);

    const u32 = (value: unknown): number =>
      value === undefined || value === null ? 0 : value as number;
    const roundStarts = actions
      .filter((action) => action.name === "RecordNewRound")
      .map((action) => action.sourceRecordOrdinal);

    for (const kan of kans) {
      const seat = u32(kan.data.seat);
      const type = u32(kan.data.type);
      const tile = kan.data.tiles;
      expect(typeof tile).toBe("string");
      const roundStart = [...roundStarts]
        .reverse()
        .find((ordinal) => ordinal <= kan.sourceRecordOrdinal)!;
      const inRound = actions.filter((action) =>
        action.sourceRecordOrdinal >= roundStart
        && action.sourceRecordOrdinal <= kan.sourceRecordOrdinal
      );
      const priorPonOfTile = inRound.filter((action) =>
        action.name === "RecordChiPengGang"
        && u32(action.data.seat) === seat
        && u32(action.data.type) === 1
        && Array.isArray(action.data.tiles)
        && action.data.tiles.some((entry) => entry === tile)
      );
      if (type === 3) {
        // Ankan: the actor held all four concealed copies.
        expect(priorPonOfTile.length).toBe(0);
        expect(seat).toBe(2);
        expect(tile).toBe("3s");
        const initialHand = inRound
          .find((action) => action.name === "RecordNewRound")!.data[`tiles${seat}`];
        expect(Array.isArray(initialHand)).toBe(true);
        const initial = (initialHand as string[]).filter((entry) => entry === tile).length;
        const draws = inRound.filter((action) =>
          action.name === "RecordDealTile"
          && u32(action.data.seat) === seat
          && action.data.tile === tile
        ).length;
        const discards = inRound.filter((action) =>
          action.name === "RecordDiscardTile"
          && u32(action.data.seat) === seat
          && action.data.tile === tile
        ).length;
        const meldedAway = inRound.filter((action) =>
          action.name === "RecordChiPengGang" && u32(action.data.seat) === seat
        ).length;
        expect(initial + draws - discards - meldedAway).toBe(4);
      } else if (type === 2) {
        // Kakan: upgrades the actor's earlier pon of the same tile in-round.
        expect(seat).toBe(3);
        expect(tile).toBe("7z");
        expect(priorPonOfTile.map((pon) => pon.sourceRecordOrdinal)).toEqual([1053]);
      } else {
        throw new Error(`unattested AnGangAddGang type ${type}`);
      }
    }
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
