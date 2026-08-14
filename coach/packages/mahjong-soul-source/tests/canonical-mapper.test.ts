import { fileURLToPath } from "node:url";
import { parse as parseProtobuf, type Root } from "protobufjs";
import { describe, expect, it } from "vitest";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  type MahjongSoulProtocolBundle,
} from "../src/index.js";

const bundleRoot = fileURLToPath(
  new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url),
);

function encodeRecord(
  bundle: MahjongSoulProtocolBundle,
  actions: ReadonlyArray<{ name: string; data: Record<string, unknown> }>,
): Uint8Array {
  const root = parseProtobuf(bundle.protoText, { keepCase: true }).root;
  const prototypeType = root.lookupType("lq.ActionPrototype");
  const gameActionType = root.lookupType("lq.GameAction");
  const recordsType = root.lookupType("lq.GameDetailRecords");
  const gameActions = actions.map(({ name, data }) => {
    const actionType = root.lookupType(`lq.${name}`);
    const actionBytes = actionType.encode(actionType.fromObject(data)).finish();
    const prototype = prototypeType.fromObject({ step: 0, name, data: actionBytes });
    const prototypeBytes = prototypeType.encode(prototype).finish();
    return gameActionType.fromObject({ result: prototypeBytes });
  });
  return recordsType.encode(recordsType.fromObject({ actions: gameActions })).finish();
}

const selfHand = [
  "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
  "1p", "2p", "3p", "4p",
];

describe("Mahjong Soul canonical record mapper", () => {
  it("maps a minimal round of draw and discard", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      {
        name: "ActionNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
          scores: [25000, 25000, 25000, 25000],
          liqibang: 0, left_tile_count: 69,
        },
      },
      { name: "ActionDealTile", data: { seat: 0, tile: "1s", left_tile_count: 68 } },
      { name: "ActionDiscardTile", data: { seat: 0, tile: "1s", moqie: true } },
    ]);

    const result = mapMahjongSoulRecord({
      gameId: "game:test",
      selfActor: 1,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes,
      bundle,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const types = result.stream.events.map((event) => event.type);
    expect(types).toEqual([
      "game_started",
      "round_started",
      "tile_drawn",
      "tile_discarded",
    ]);

    const roundStarted = result.stream.events[1]!;
    expect(roundStarted).toMatchObject({
      type: "round_started",
      roundOrdinal: 0,
      roundWind: "E",
      hand: 1,
      honba: 0,
      riichiSticks: 0,
      dealer: 0,
    });
    expect(result.stream.selfActor).toBe(1);
    expect(result.stream.events[0]!.eventId).toBe("game:test/0/0/0");
    expect(result.stream.events[1]!.eventId).toBe("game:test/0/1/0");
    expect(result.stream.events[2]!.eventId).toBe("game:test/0/2/0");
    expect(result.stream.events[3]!.eventId).toBe("game:test/0/3/0");
  });

  it("hides non-self draws and reveals the self draw", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      {
        name: "ActionNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
          scores: [25000, 25000, 25000, 25000], liqibang: 0, left_tile_count: 69,
        },
      },
      { name: "ActionDealTile", data: { seat: 0, tile: "1s" } },
      { name: "ActionDealTile", data: { seat: 1, tile: "5p" } },
    ]);

    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const draws = result.stream.events.filter((event) => event.type === "tile_drawn");
    expect(draws[0]?.tile).toEqual({ visibility: "hidden" });
    expect(draws[1]?.tile).toEqual({ visibility: "visible", tile: { id: "5p", red: false } });
  });

  it("emits a riichi declaration before the riichi discard", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      {
        name: "ActionNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
          scores: [25000, 25000, 25000, 25000], liqibang: 0, left_tile_count: 69,
        },
      },
      { name: "ActionDiscardTile", data: { seat: 0, tile: "9m", is_liqi: true, moqie: false } },
    ]);

    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const types = result.stream.events.map((event) => event.type);
    expect(types).toEqual([
      "game_started", "round_started", "riichi_declared", "tile_discarded",
    ]);
    const discard = result.stream.events[3]!;
    if (discard.type !== "tile_discarded") throw new Error("expected discard");
    expect(discard.riichiDeclarationEventRef).toBe("game:test/0/2/0");
  });

  it("maps a chi call with its target discard", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      {
        name: "ActionNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
          scores: [25000, 25000, 25000, 25000], liqibang: 0,
        },
      },
      { name: "ActionDiscardTile", data: { seat: 0, tile: "4m", moqie: false } },
      {
        name: "ActionChiPengGang",
        data: { seat: 1, type: 0, tiles: ["4m", "2m", "3m"], froms: [0, 1, 1] },
      },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const types = result.stream.events.map((event) => event.type);
    expect(types).toEqual(["game_started", "round_started", "tile_discarded", "chi_called"]);
    const chi = result.stream.events[3]!;
    if (chi.type !== "chi_called") throw new Error("expected chi");
    expect(chi.targetActor).toBe(0);
    expect(chi.calledDiscardEventRef).toBe("game:test/0/2/0");
  });

  it("maps a pon call", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      {
        name: "ActionNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
          scores: [25000, 25000, 25000, 25000], liqibang: 0,
        },
      },
      { name: "ActionDiscardTile", data: { seat: 0, tile: "5m", moqie: false } },
      {
        name: "ActionChiPengGang",
        data: { seat: 2, type: 1, tiles: ["5m", "5m", "5m"], froms: [0, 2, 2] },
      },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes, bundle,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const types = result.stream.events.map((event) => event.type);
    expect(types).toEqual(["game_started", "round_started", "tile_discarded", "pon_called"]);
  });

  it("maps a tsumo win and an exhaustive draw", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const winBytes = encodeRecord(bundle, [
      {
        name: "ActionNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
          scores: [25000, 25000, 25000, 25000], liqibang: 0,
        },
      },
      { name: "ActionDealTile", data: { seat: 1, tile: "5m" } },
      {
        name: "ActionHule",
        data: {
          hules: [{ seat: 1, zimo: true, hu_tile: "5m" }],
          delta_scores: [3000, -1000, -1000, -1000],
        },
      },
    ]);
    const win = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes: winBytes, bundle,
    });
    expect(win.status).toBe("ready");
    if (win.status !== "ready") return;
    expect(win.stream.events.at(-1)?.type).toBe("win_declared");

    const drawBytes = encodeRecord(bundle, [
      {
        name: "ActionNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
          scores: [25000, 25000, 25000, 25000], liqibang: 0,
        },
      },
      { name: "ActionNoTile", data: { liujumanguan: false } },
    ]);
    const draw = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes: drawBytes, bundle,
    });
    expect(draw.status).toBe("ready");
    if (draw.status !== "ready") return;
    expect(draw.stream.events.at(-1)?.type).toBe("round_drawn");
  });

  it("rejects an empty or unknown action record", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const empty = encodeRecord(bundle, []);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 0,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes: empty, bundle,
    });
    expect(result.status).toBe("invalid");
  });

  it("rejects ActionLiuJu as unsupported semantics instead of guessing a draw reason", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      {
        name: "ActionNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
          scores: [25000, 25000, 25000, 25000], liqibang: 0,
        },
      },
      { name: "ActionLiuJu", data: { type: 0, seat: 0 } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes, bundle,
    });
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.code).toBe("mahjong_soul_canonical_unsupported_semantics");
  });

  it("rejects ActionAnGangAddGang instead of guessing ankan from type 0/2", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      {
        name: "ActionNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
          scores: [25000, 25000, 25000, 25000], liqibang: 0,
        },
      },
      { name: "ActionAnGangAddGang", data: { seat: 0, type: 0, tiles: "1m1m1m1m" } },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes, bundle,
    });
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.code).toBe("mahjong_soul_canonical_unsupported_semantics");
  });

  it("rejects ActionHule with malformed score deltas", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      {
        name: "ActionNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
          scores: [25000, 25000, 25000, 25000], liqibang: 0,
        },
      },
      { name: "ActionDealTile", data: { seat: 1, tile: "5m" } },
      {
        name: "ActionHule",
        data: {
          hules: [{ seat: 1, zimo: true, hu_tile: "5m" }],
          delta_scores: [3000, -1000, -1000],
        },
      },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes, bundle,
    });
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.code).toBe("mahjong_soul_canonical_mapping_failed");
  });

  it("rejects ActionHule with an out-of-range winner seat", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle, [
      {
        name: "ActionNewRound",
        data: {
          chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
          scores: [25000, 25000, 25000, 25000], liqibang: 0,
        },
      },
      { name: "ActionDealTile", data: { seat: 1, tile: "5m" } },
      {
        name: "ActionHule",
        data: {
          hules: [{ seat: 5, zimo: true, hu_tile: "5m" }],
          delta_scores: [3000, -1000, -1000, -1000],
        },
      },
    ]);
    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 1,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes, bundle,
    });
    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") return;
    expect(result.code).toBe("mahjong_soul_canonical_mapping_failed");
  });

  it("rejects an unknown action name", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const root = parseProtobuf(bundle.protoText, { keepCase: true }).root;
    const prototypeType = root.lookupType("lq.ActionPrototype");
    const gameActionType = root.lookupType("lq.GameAction");
    const recordsType = root.lookupType("lq.GameDetailRecords");
    const valid = encodeRecord(bundle, [{
      name: "ActionNewRound",
      data: {
        chang: 0, ju: 0, ben: 0, tiles: selfHand, dora: "1z",
        scores: [25000, 25000, 25000, 25000], liqibang: 0,
      },
    }]);
    const validActions = recordsType.toObject(recordsType.decode(valid), {
      arrays: true, bytes: Uint8Array, defaults: true,
    }) as { actions: unknown[] };
    const unknownProto = prototypeType.encode(prototypeType.fromObject({
      step: 0, name: "ActionDoesNotExist", data: new Uint8Array(0),
    })).finish();
    const recordBytes = recordsType.encode(recordsType.fromObject({
      actions: [
        ...validActions.actions,
        gameActionType.fromObject({ result: unknownProto }),
      ],
    })).finish();

    const result = mapMahjongSoulRecord({
      gameId: "game:test", selfActor: 0,
      recordId: "260811-00000000-0000-0000-0000-000000000001",
      recordBytes, bundle,
    });
    expect(result.status).toBe("invalid");
  });
});
