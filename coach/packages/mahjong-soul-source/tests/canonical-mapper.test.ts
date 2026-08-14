import { fileURLToPath } from "node:url";
import { parse as parseProtobuf } from "protobufjs";
import { describe, expect, it } from "vitest";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  type MahjongSoulProtocolBundle,
} from "../src/index.js";

const bundleRoot = fileURLToPath(
  new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url),
);

const recordId = "260811-00000000-0000-0000-0000-000000000001";

// Stored records wrap each GameAction.result in lq.Wrapper{name:".lq.Record*"}.
function encodeRecord(
  bundle: MahjongSoulProtocolBundle,
  actions: ReadonlyArray<{ name: string; data: Record<string, unknown> }>,
): Uint8Array {
  const root = parseProtobuf(bundle.protoText, { keepCase: true }).root;
  const wrapperType = root.lookupType("lq.Wrapper");
  const gameActionType = root.lookupType("lq.GameAction");
  const recordsType = root.lookupType("lq.GameDetailRecords");
  const gameActions = actions.map(({ name, data }) => {
    const actionType = root.lookupType(`lq.${name}`);
    const actionBytes = actionType.encode(actionType.fromObject(data)).finish();
    const wrapper = wrapperType.fromObject({ name: `.lq.${name}`, data: actionBytes });
    const wrapperBytes = wrapperType.encode(wrapper).finish();
    return gameActionType.fromObject({ result: wrapperBytes });
  });
  return recordsType.encode(recordsType.fromObject({
    version: 210715,
    actions: gameActions,
  })).finish();
}

const selfHand = [
  "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
  "1p", "2p", "3p", "4p",
];

function newRound(selfActor: number, dealer: number): Record<string, unknown> {
  const other = ["7z", "6z", "5z", "4z", "3z", "2z", "1z", "1s", "2s", "3s", "4s", "5s", "6s"];
  const tiles: string[][] = [];
  for (let seat = 0; seat < 4; seat += 1) {
    if (seat === dealer) tiles.push([...selfHand, "1z"]);
    else if (seat === selfActor) tiles.push([...selfHand]);
    else tiles.push([...other]);
  }
  return {
    chang: 0, ju: dealer, ben: 0, doras: ["1z"],
    scores: [25000, 25000, 25000, 25000], liqibang: 0, left_tile_count: 69,
    tiles0: tiles[0], tiles1: tiles[1], tiles2: tiles[2], tiles3: tiles[3],
  };
}

describe("Mahjong Soul stored Record* mapper", () => {
  it("maps a minimal round with the dealer draw and a self draw", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordDealTile", data: { seat: 1, tile: "5p", left_tile_count: 68 } },
      { name: "RecordDiscardTile", data: { seat: 1, tile: "1m", moqie: false } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const types = result.stream.events.map((event) => event.type);
    expect(types).toEqual([
      "game_started", "round_started", "tile_drawn", "tile_drawn", "tile_discarded",
    ]);
    // dealer draw (self=1, dealer=0) is hidden; self draw is visible.
    const draws = result.stream.events.filter((event) => event.type === "tile_drawn");
    expect(draws[0]?.tile).toEqual({ visibility: "hidden" });
    expect(draws[1]?.tile).toEqual({ visibility: "visible", tile: { id: "5p", red: false } });
  });

  it.each([0, 1, 2, 3] as const)("selects tiles%d as the self hand for selfActor=%d", async (selfActor) => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(selfActor, 0) },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const roundStarted = result.stream.events.find((event) => event.type === "round_started");
    expect(roundStarted).toBeDefined();
    if (roundStarted?.type !== "round_started") return;
    expect(roundStarted.selfHand.map((tile) => tile.id)).toEqual(selfHand.map((tile) => tile.replace("0", "5")));
  });

  it("maps a non-self draw with a missing tile as hidden", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordDealTile", data: { seat: 2 } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const draw = result.stream.events.findLast((event) => event.type === "tile_drawn");
    expect(draw?.tile).toEqual({ visibility: "hidden" });
  });

  it("emits a riichi declaration before the riichi discard", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordDiscardTile", data: { seat: 0, tile: "9m", is_liqi: true, moqie: false } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const types = result.stream.events.map((event) => event.type);
    expect(types).toEqual([
      "game_started", "round_started", "tile_drawn", "riichi_declared", "tile_discarded",
      "riichi_accepted",
    ]);
    const discard = result.stream.events.findLast((event) => event.type === "tile_discarded");
    if (discard?.type !== "tile_discarded") throw new Error("expected discard");
    expect(discard.riichiDeclarationEventRef).not.toBeNull();
    const accepted = result.stream.events.findLast((event) => event.type === "riichi_accepted");
    if (accepted?.type !== "riichi_accepted") throw new Error("expected riichi_accepted");
    expect(accepted.declarationEventRef).toBe(discard.riichiDeclarationEventRef);
  });

  it("maps chi and pon calls with their target discard", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordDiscardTile", data: { seat: 0, tile: "4m", moqie: false } },
      { name: "RecordChiPengGang", data: { seat: 1, type: 0, tiles: ["2m", "3m", "4m"], froms: [1, 1, 0] } },
      { name: "RecordDiscardTile", data: { seat: 0, tile: "5m", moqie: false } },
      { name: "RecordChiPengGang", data: { seat: 2, type: 1, tiles: ["5m", "5m", "5m"], froms: [2, 2, 0] } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const types = result.stream.events.map((event) => event.type);
    expect(types).toContain("chi_called");
    expect(types).toContain("pon_called");
  });

  it("maps a tsumo win and derives NoTile tenpai seats", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const winBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordDealTile", data: { seat: 1, tile: "5m" } },
      {
        name: "RecordHule",
        data: {
          hules: [{ seat: 1, zimo: true, hu_tile: "5m" }],
          delta_scores: [3000, -1000, -1000, -1000],
        },
      },
    ]);
    const win = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes: winBytes, bundle,
    });
    expect(win.status).toBe("ready");
    if (win.status !== "ready") return;
    expect(win.stream.events.at(-1)?.type).toBe("win_declared");

    const drawBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      {
        name: "RecordNoTile",
        data: { players: [{ tingpai: true }, { tingpai: false }, { tingpai: true }, { tingpai: false }] },
      },
    ]);
    const draw = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes: drawBytes, bundle,
    });
    expect(draw.status).toBe("ready");
    if (draw.status !== "ready") return;
    const roundDrawn = draw.stream.events.findLast((event) => event.type === "round_drawn");
    if (roundDrawn?.type !== "round_drawn") throw new Error("expected round_drawn");
    expect(roundDrawn.tenpaiActors).toEqual([0, 2]);
  });

  it("rejects RecordLiuJu as unsupported semantics", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordLiuJu", data: { type: 0 } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.code).toBe("mahjong_soul_canonical_unsupported_semantics");
  });

  it("rejects RecordAnGangAddGang with an unattested type as unsupported semantics", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordAnGangAddGang", data: { seat: 0, type: 0, tiles: "1m1m1m1m" } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.code).toBe("mahjong_soul_canonical_unsupported_semantics");
  });

  it("maps type 3 RecordAnGangAddGang to ankan and marks the next draw rinshan", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordDealTile", data: { seat: 2, tile: "3s" } },
      { name: "RecordAnGangAddGang", data: { seat: 2, type: 3, tiles: "3s" } },
      { name: "RecordDealTile", data: { seat: 2, tile: "4z" } },
      { name: "RecordDiscardTile", data: { seat: 2, tile: "4z", moqie: true } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const ankan = result.stream.events.find((event) => event.type === "ankan_declared");
    expect(ankan).toBeDefined();
    if (ankan?.type !== "ankan_declared") throw new Error("expected ankan_declared");
    expect(ankan.actor).toBe(2);
    expect(ankan.tiles).toEqual([
      { id: "3s", red: false }, { id: "3s", red: false },
      { id: "3s", red: false }, { id: "3s", red: false },
    ]);
    // The replacement draw after the kan comes from rinshan, not live_wall.
    const kanIndex = result.stream.events.findIndex((event) => event.type === "ankan_declared");
    const nextDraw = result.stream.events[kanIndex + 1];
    if (nextDraw?.type !== "tile_drawn") throw new Error("expected rinshan draw after kan");
    expect(nextDraw.actor).toBe(2);
    expect(nextDraw.from).toBe("rinshan");
    // A live-wall draw by another seat afterwards is still live_wall.
    const laterDraw = result.stream.events
      .slice(kanIndex + 1)
      .find((event) => event.type === "tile_drawn" && event.actor !== 2);
    if (laterDraw !== undefined) {
      if (laterDraw.type !== "tile_drawn") throw new Error("expected tile_drawn");
      expect(laterDraw.from).toBe("live_wall");
    }
  });

  it("maps type 2 RecordAnGangAddGang to kakan upgrading the prior pon", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordDiscardTile", data: { seat: 0, tile: "1z", moqie: false } },
      { name: "RecordChiPengGang", data: { seat: 2, type: 1, tiles: ["1z", "1z", "1z"], froms: [2, 2, 0] } },
      { name: "RecordDiscardTile", data: { seat: 2, tile: "6s", moqie: false } },
      { name: "RecordDealTile", data: { seat: 2, tile: "1z" } },
      { name: "RecordAnGangAddGang", data: { seat: 2, type: 2, tiles: "1z" } },
      { name: "RecordDealTile", data: { seat: 2, tile: "4z" } },
      { name: "RecordDiscardTile", data: { seat: 2, tile: "4z", moqie: true } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const pon = result.stream.events.find((event) => event.type === "pon_called");
    const kakan = result.stream.events.find((event) => event.type === "kakan_declared");
    expect(pon).toBeDefined();
    expect(kakan).toBeDefined();
    if (kakan?.type !== "kakan_declared") throw new Error("expected kakan_declared");
    expect(kakan.actor).toBe(2);
    expect(kakan.addedTile).toEqual({ id: "1z", red: false });
    expect(kakan.upgradedPonEventRef).toBe(pon?.eventId);
    const kanIndex = result.stream.events.findIndex((event) => event.type === "kakan_declared");
    const nextDraw = result.stream.events[kanIndex + 1];
    if (nextDraw?.type !== "tile_drawn") throw new Error("expected rinshan draw after kakan");
    expect(nextDraw.from).toBe("rinshan");
  });

  it("fails a kakan whose pon does not exist", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordDealTile", data: { seat: 2, tile: "1z" } },
      { name: "RecordAnGangAddGang", data: { seat: 2, type: 2, tiles: "1z" } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.code).toBe("mahjong_soul_canonical_mapping_failed");
  });

  it("fails an ankan of a five closed: the red placement is not on the wire", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordAnGangAddGang", data: { seat: 2, type: 3, tiles: "5s" } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.code).toBe("mahjong_soul_canonical_unsupported_semantics");
  });

  it("synthesizes round_ended between a hule and the next round_started", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordDealTile", data: { seat: 0, tile: "1z" } },
      {
        name: "RecordHule",
        data: {
          hules: [{ seat: 0, zimo: true, hu_tile: "1z" }],
          delta_scores: [3000, -1000, -1000, -1000],
        },
      },
      { name: "RecordNewRound", data: { ...newRound(1, 1), chang: 0, ju: 1, ben: 0 } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const win = result.stream.events.findLast((event) => event.type === "win_declared");
    const roundEnded = result.stream.events.find((event) => event.type === "round_ended");
    expect(win).toBeDefined();
    expect(roundEnded).toBeDefined();
    if (roundEnded?.type !== "round_ended") throw new Error("expected round_ended");
    expect(roundEnded.terminalEventRef).toBe(win?.eventId);
    const winIndex = result.stream.events.findIndex((event) => event.type === "win_declared");
    const nextRoundIndex = result.stream.events.findIndex(
      (event, index) => index > winIndex && event.type === "round_started",
    );
    expect(result.stream.events[winIndex + 1]?.type).toBe("round_ended");
    expect(result.stream.events[nextRoundIndex - 1]?.type).toBe("round_ended");
  });

  it("rejects RecordHule with malformed score deltas", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      { name: "RecordNewRound", data: newRound(1, 0) },
      { name: "RecordDealTile", data: { seat: 1, tile: "5m" } },
      { name: "RecordHule", data: { hules: [{ seat: 1, zimo: true, hu_tile: "5m" }], delta_scores: [3000, -1000, -1000] } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.code).toBe("mahjong_soul_canonical_mapping_failed");
  });

  it("rejects an empty record", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, []);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 0, recordId, recordBytes, bundle,
    });
    expect(result.status).toBe("invalid");
  });
});
