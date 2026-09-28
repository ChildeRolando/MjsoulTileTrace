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
  it.each(["draw", "discard"] as const)("preserves daiminkan replacement draw and indicator: %s", async publication => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const result = mapMahjongSoulRecord({ gameId: "game:daiminkan", selfActor: 1, recordId, bundle,
      recordBytes: encodeRecord(bundle, [
        { name: "RecordNewRound", data: newRound(1, 0) },
        { name: "RecordDiscardTile", data: { seat: 0, tile: "1z", moqie: true } },
        { name: "RecordChiPengGang", data: { seat: 1, type: 2, tiles: ["1z", "1z", "1z", "1z"], froms: [1, 1, 1, 0] } },
        { name: "RecordDealTile", data: { seat: 1, tile: "5p", left_tile_count: 68,
          ...(publication === "draw" ? { doras: ["1z", "2z"] } : {}) } },
        { name: "RecordDiscardTile", data: { seat: 1, tile: "5p", moqie: true, doras: ["1z", "2z"] } },
      ]) });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("fixture");
    const kanIndex = result.stream.events.findIndex(event => event.type === "daiminkan_called");
    expect(result.stream.events.slice(kanIndex, kanIndex + 4).map(event => event.type))
      .toEqual(["daiminkan_called", "dora_revealed", "tile_drawn", "tile_discarded"]);
    expect(result.stream.events[kanIndex + 1]).toMatchObject({
      kanEventRef: result.stream.events[kanIndex]!.eventId, indicator: { id: "2z", red: false },
    });
    expect(result.stream.events[kanIndex + 2]).toMatchObject({ actor: 1, from: "rinshan" });
    expect(result.stream.completeness.doraIndicators).toBe("complete");
  });

  it.each([true, false])("attests response history only when each observed round is closed: %s", async closed => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const actions = [
      { name: "RecordNewRound", data: newRound(0, 0) },
      { name: "RecordDiscardTile", data: { seat: 0, tile: "1z", moqie: true } },
      ...(closed ? [{ name: "RecordHule", data: { hules: [{ seat: 1, zimo: false, hu_tile: "1z" }], delta_scores: [-1000, 1000, 0, 0] } }] : []),
    ];
    const result = mapMahjongSoulRecord({ gameId: "game:history", selfActor: 0, recordId, bundle,
      recordBytes: encodeRecord(bundle, actions) });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("fixture");
    expect(result.stream.completeness.responseOpportunities).toBe(closed ? "complete" : "unknown");
    expect(result.stream.completeness.ruleSet).toBe("unknown");
  });

  it.each([true, false])("does not let a closed final round hide an unclosed earlier round: %s", async firstClosed => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const end = { name: "RecordHule", data: { hules: [{ seat: 1, zimo: false, hu_tile: "1z" }], delta_scores: [-1000, 1000, 0, 0] } };
    const result = mapMahjongSoulRecord({ gameId: "game:history-multi", selfActor: 0, recordId, bundle,
      recordBytes: encodeRecord(bundle, [
        { name: "RecordNewRound", data: newRound(0, 0) },
        { name: "RecordDiscardTile", data: { seat: 0, tile: "1z", moqie: true } },
        ...(firstClosed ? [end] : []),
        { name: "RecordNewRound", data: { ...newRound(0, 0), ben: 1 } },
        { name: "RecordDiscardTile", data: { seat: 0, tile: "1z", moqie: true } }, end,
      ]) });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("fixture");
    expect(result.stream.completeness.responseOpportunities).toBe(firstClosed ? "complete" : "unknown");
  });

  it.each(["kan", "draw", "discard"] as const)("preserves a kakan indicator with its pon and replacement draw: %s", async publication => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const result = mapMahjongSoulRecord({ gameId: "game:kakan-dora", selfActor: 1, recordId, bundle,
      recordBytes: encodeRecord(bundle, [
        { name: "RecordNewRound", data: newRound(1, 0) },
        { name: "RecordDiscardTile", data: { seat: 0, tile: "1z", moqie: true } },
        { name: "RecordChiPengGang", data: { seat: 1, type: 1, tiles: ["1z", "1z", "1z"], froms: [1, 1, 0] } },
        { name: "RecordDiscardTile", data: { seat: 1, tile: "1m", moqie: false } },
        { name: "RecordDealTile", data: { seat: 1, tile: "1z", left_tile_count: 68 } },
        { name: "RecordAnGangAddGang", data: { seat: 1, type: 2, tiles: "1z",
          ...(publication === "kan" ? { doras: ["1z", "2z"] } : {}) } },
        { name: "RecordDealTile", data: { seat: 1, tile: "5p", left_tile_count: 67,
          ...(publication !== "discard" ? { doras: ["1z", "2z"] } : {}) } },
        { name: "RecordDiscardTile", data: { seat: 1, tile: "5p", moqie: true, doras: ["1z", "2z"] } },
      ]) });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("fixture");
    const events = result.stream.events;
    const index = events.findIndex(event => event.type === "kakan_declared");
    expect(events[index]).toMatchObject({ upgradedPonEventRef: events.find(event => event.type === "pon_called")!.eventId });
    expect(events[index + 1]).toMatchObject({ type: "dora_revealed", kanEventRef: events[index]!.eventId, indicator: { id: "2z", red: false } });
    expect(events[index + 2]).toMatchObject({ type: "tile_drawn", actor: 1, from: "rinshan" });
    expect(events.filter(event => event.type === "dora_revealed")).toHaveLength(1);
    expect(result.stream.completeness.doraIndicators).toBe("complete");
  });

  it.each(["shrink", "other-actor", "after-discard"] as const)("rejects unbound or late kan indicators: %s", async variant => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const result = mapMahjongSoulRecord({ gameId: "game:dora-late", selfActor: 0, recordId, bundle,
      recordBytes: encodeRecord(bundle, [
        { name: "RecordNewRound", data: newRound(0, 0) },
        { name: "RecordAnGangAddGang", data: { seat: 0, type: 3, tiles: "1m",
          ...(variant === "shrink" ? { doras: ["1z", "2z"] } : {}) } },
        { name: "RecordDealTile", data: { seat: 0, tile: "5p", left_tile_count: 68 } },
        ...(variant === "after-discard" ? [{ name: "RecordDiscardTile", data: { seat: 0, tile: "5p", moqie: true } }] : []),
        { name: "RecordDiscardTile", data: { seat: variant === "other-actor" ? 1 : 0, tile: "5p", moqie: true,
          doras: variant === "shrink" ? ["1z"] : ["1z", "2z"] } },
      ]) });
    expect(result).toEqual({ status: "invalid", code: "mahjong_soul_canonical_mapping_failed" });
  });

  it("keeps missing indicators incomplete across a round reset", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const result = mapMahjongSoulRecord({ gameId: "game:dora-reset", selfActor: 0, recordId, bundle,
      recordBytes: encodeRecord(bundle, [
        { name: "RecordNewRound", data: newRound(0, 0) },
        { name: "RecordAnGangAddGang", data: { seat: 0, type: 3, tiles: "1m" } },
        { name: "RecordDealTile", data: { seat: 0, tile: "5p", left_tile_count: 68 } },
        { name: "RecordHule", data: { hules: [{ seat: 0, zimo: true, hu_tile: "5p" }], delta_scores: [3000, -1000, -1000, -1000] } },
        { name: "RecordNewRound", data: { ...newRound(0, 0), ben: 1 } },
      ]) });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("fixture");
    expect(result.stream.completeness.doraIndicators).toBe("partial");
    expect(result.stream.events.filter(event => event.type === "dora_revealed")).toEqual([]);
    expect(result.stream.events.filter(event => event.type === "round_started")).toHaveLength(2);
  });

  it.each(["kan", "draw", "discard"] as const)(
    "preserves a published kan dora once in the canonical kan slot: %s", async publishedAt => {
      const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
      const start = newRound(0, 0);
      start.tiles0 = ["1m", "1m", "1m", "1m", "2p", "3p", "4p", "4s", "5s", "6s", "7s", "8s", "9s", "2p"];
      const result = mapMahjongSoulRecord({ gameId: "game:dora", selfActor: 0, recordId, bundle,
        recordBytes: encodeRecord(bundle, [
          { name: "RecordNewRound", data: start },
          { name: "RecordAnGangAddGang", data: { seat: 0, type: 3, tiles: "1m",
            ...(publishedAt === "kan" ? { doras: ["1z", "2z"] } : {}) } },
          { name: "RecordDealTile", data: { seat: 0, tile: "5p", left_tile_count: 68,
            ...(publishedAt !== "discard" ? { doras: ["1z", "2z"] } : {}) } },
          { name: "RecordDiscardTile", data: { seat: 0, tile: "5p", moqie: true, doras: ["1z", "2z"] } },
        ]) });
      expect(result.status).toBe("ready");
      if (result.status !== "ready") throw new Error("fixture");
      const events = result.stream.events;
      const kan = events.find(event => event.type === "ankan_declared")!;
      const updates = events.filter(event => event.type === "dora_revealed");
      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({ indicator: { id: "2z", red: false }, kanEventRef: kan.eventId });
      // Canonical normalizes the reveal next to its kan; the original source
      // bytes (including the later cumulative snapshot) remain hash-bound.
      expect(updates[0]!.sourceRecordRef).toBe(kan.sourceRecordRef);
      const following = events[events.indexOf(updates[0]!) + 1];
      expect(following?.type).toBe("tile_drawn");
      expect(result.stream.completeness.doraIndicators).toBe("complete");
    },
  );

  it("keeps missing kan indicators partial without inventing a reveal", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const result = mapMahjongSoulRecord({ gameId: "game:dora-missing", selfActor: 0, recordId, bundle,
      recordBytes: encodeRecord(bundle, [
        { name: "RecordNewRound", data: newRound(0, 0) },
        { name: "RecordAnGangAddGang", data: { seat: 0, type: 3, tiles: "1m" } },
        { name: "RecordDealTile", data: { seat: 0, tile: "5p", left_tile_count: 68 } },
      ]) });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("fixture");
    expect(result.stream.completeness.doraIndicators).toBe("partial");
    expect(result.stream.events.filter(event => event.type === "dora_revealed")).toEqual([]);
  });

  it.each(["changed-prefix", "unexplained-growth"] as const)(
    "rejects contradictory source dora snapshots: %s", async variant => {
      const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
      const result = mapMahjongSoulRecord({ gameId: "game:dora-invalid", selfActor: 0, recordId, bundle,
        recordBytes: encodeRecord(bundle, [
          { name: "RecordNewRound", data: newRound(0, 0) },
          { name: "RecordDiscardTile", data: { seat: 0, tile: "1z", moqie: true,
            doras: variant === "changed-prefix" ? ["2z"] : ["1z", "2z"] } },
        ]) });
      expect(result).toEqual({ status: "invalid", code: "mahjong_soul_canonical_mapping_failed" });
    },
  );

  it("projects the pre-dealer-draw wall from explicit source counts", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const recordBytes = encodeRecord(bundle,[
      {name:"RecordNewRound",data:newRound(1,0)},
      {name:"RecordDiscardTile",data:{seat:0,tile:"1z",moqie:true}},
      {name:"RecordDealTile",data:{seat:1,tile:"5p",left_tile_count:68}},
    ]);
    const result=mapMahjongSoulRecord({gameId:"game:wall",selfActor:1,recordId,recordBytes,bundle});
    expect(result.status).toBe("ready");
    if(result.status!=="ready") throw new Error("fixture");
    expect(result.stream.completeness.remainingDraws).toBe("complete");
    expect(result.stream.events[1]).toMatchObject({type:"round_started",remainingDraws:70});
    expect(result.stream.events.filter(event=>event.type==="tile_drawn")).toHaveLength(2);
  });

  it.each(["missing-start", "missing-draw", "contradictory-start", "contradictory-draw"])("does not fabricate wall evidence: %s", variant => {
    return loadMahjongSoulProtocolBundle(bundleRoot).then(bundle=>{
      const start=newRound(1,0);
      const draw: Record<string,unknown>={seat:1,tile:"5p",left_tile_count:68};
      if(variant==="missing-start") delete start.left_tile_count;
      if(variant==="missing-draw") delete draw.left_tile_count;
      if(variant==="contradictory-start") start.left_tile_count=68;
      if(variant==="contradictory-draw") draw.left_tile_count=67;
      const result=mapMahjongSoulRecord({gameId:"game:wall",selfActor:1,recordId,bundle,
        recordBytes:encodeRecord(bundle,[{name:"RecordNewRound",data:start},{name:"RecordDealTile",data:draw}])});
      if(variant.startsWith("contradictory")) {
        expect(result).toEqual({status:"invalid",code:"mahjong_soul_canonical_mapping_failed"});
      } else {
        expect(result.status).toBe("ready");
        if(result.status!=="ready") throw new Error("fixture");
        expect(result.stream.completeness.remainingDraws).toBe("unknown");
      }
    });
  });

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
    // EOF closing: the record ends win -> round_ended -> game_ended with the
    // settled scores (25000 + [-1000,3000,-1000,-1000] applied once).
    expect(win.stream.events.slice(-3).map((event) => event.type)).toEqual([
      "win_declared", "round_ended", "game_ended",
    ]);
    const gameEnded = win.stream.events.at(-1);
    if (gameEnded?.type !== "game_ended") throw new Error("expected game_ended");
    // delta_scores are seat-indexed and applied verbatim.
    expect(gameEnded.scores).toEqual([28000, 24000, 24000, 24000]);

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
    // A drawn final carries no sanitized payment data: the round is closed
    // but no game_ended scores are fabricated.
    expect(draw.stream.events.at(-1)?.type).toBe("round_ended");
    expect(draw.stream.events.some((event) => event.type === "game_ended")).toBe(false);
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
