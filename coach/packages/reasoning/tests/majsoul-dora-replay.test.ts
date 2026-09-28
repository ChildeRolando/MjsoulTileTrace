import { fileURLToPath } from "node:url";
import { parse } from "protobufjs";
import { describe, expect, it } from "vitest";
import { loadMahjongSoulProtocolBundle, mapMahjongSoulRecord } from "@riichi-coach/mahjong-soul-source";
import { replayCanonicalStream } from "../src/replay/stream-replayer.js";

async function mapRound(actions: readonly { name: string; data: Record<string, unknown> }[], selfActor: number) {
  const bundle = await loadMahjongSoulProtocolBundle(fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url)));
  const root = parse(bundle.protoText, { keepCase: true }).root;
  const wrapper = root.lookupType("lq.Wrapper");
  const records = root.lookupType("lq.GameDetailRecords");
  const recordBytes = records.encode(records.fromObject({ version: 210715, actions: actions.map(action => {
    const type = root.lookupType(`lq.${action.name}`);
    return { result: wrapper.encode(wrapper.fromObject({ name: `.lq.${action.name}`,
      data: type.encode(type.fromObject(action.data)).finish() })).finish() };
  }) })).finish();
  return mapMahjongSoulRecord({ gameId: "majsoul:dora-replay", selfActor,
    recordId: "000000-00000000-0000-0000-0000-000000000001", recordBytes, bundle });
}

// Synthetic protocol/replay regression, not a replacement for real source
// capture. The record finishes with another player's ron on our discard.
describe("Mahjong Soul kan indicator reaches the canonical decision", () => {
  it.each([
    { kind: "ankan", publication: "kan" },
    { kind: "ankan", publication: "draw" },
    { kind: "ankan", publication: "discard" },
    { kind: "daiminkan", publication: "draw" },
    { kind: "daiminkan", publication: "discard" },
  ] as const)("replays a complete mapped round: $kind / $publication", async ({ kind, publication }) => {
    const start = ["1m", "1m", "1m", "1m", "2p", "3p", "4p", "4s", "5s", "6s", "7s", "8s", "9s", "2p"];
    const other = ["7z", "6z", "5z", "4z", "3z", "2z", "1z", "1s", "2s", "3s", "4s", "5s", "6s"];
    const selfActor = kind === "ankan" ? 0 : 1;
    const beforeDraw = kind === "ankan" ? [
      { name: "RecordAnGangAddGang", data: { seat: 0, type: 3, tiles: "1m",
        ...(publication === "kan" ? { doras: ["1z", "2z"] } : {}) } },
    ] : [
      { name: "RecordDiscardTile", data: { seat: 0, tile: "1m", moqie: true } },
      { name: "RecordChiPengGang", data: { seat: 1, type: 2, tiles: ["1m", "1m", "1m", "1m"], froms: [1, 1, 1, 0] } },
    ];
    const actions = [
      { name: "RecordNewRound", data: { chang: 0, ju: 0, ben: 0, doras: ["1z"], scores: [25000, 25000, 25000, 25000],
        left_tile_count: 69, tiles0: kind === "ankan" ? start : [...other, "1m"],
        tiles1: kind === "ankan" ? other : start.slice(1), tiles2: other, tiles3: other } },
      ...beforeDraw,
      { name: "RecordDealTile", data: { seat: selfActor, tile: "5p", left_tile_count: 68,
        ...(publication !== "discard" ? { doras: ["1z", "2z"] } : {}) } },
      { name: "RecordDiscardTile", data: { seat: selfActor, tile: "5p", moqie: true, doras: ["1z", "2z"] } },
      { name: "RecordHule", data: { hules: [{ seat: 2, zimo: false, hu_tile: "5p" }],
        delta_scores: selfActor === 0 ? [-1000, 0, 1000, 0] : [0, -1000, 1000, 0] } },
    ];
    const mapped = await mapRound(actions, selfActor);
    expect(mapped.status).toBe("ready");
    if (mapped.status !== "ready") throw new Error("fixture");
    const decisions = replayCanonicalStream(mapped.stream);
    expect(decisions.map(decision => decision.actualAction?.kind)).toEqual(kind === "ankan" ? ["ankan", "discard"] : ["discard"]);
    if (kind === "ankan") expect(decisions[0]!.snapshot.publicState.doraIndicators).toEqual([{ id: "1z", red: false }]);
    expect(decisions.at(-1)!.snapshot.publicState.doraIndicators).toEqual([{ id: "1z", red: false }, { id: "2z", red: false }]);
    expect(mapped.stream.completeness.responseOpportunities).toBe("complete");
  });

  it("replays pon, post-call discard, then kakan without changing earlier dora knowledge", async () => {
    const hand = ["1m", "1m", "2p", "3p", "4p", "4s", "5s", "6s", "7s", "8s", "9s", "2p", "9p", "9p"];
    const other = ["7z", "6z", "5z", "4z", "3z", "2z", "1z", "1s", "2s", "3s", "4s", "5s", "6s"];
    const mapped = await mapRound([
      { name: "RecordNewRound", data: { chang: 0, ju: 0, ben: 0, doras: ["1z"], scores: [25000, 25000, 25000, 25000],
        left_tile_count: 69, tiles0: hand, tiles1: other, tiles2: other, tiles3: other } },
      { name: "RecordDiscardTile", data: { seat: 0, tile: "9p", moqie: true } },
      { name: "RecordDealTile", data: { seat: 1, tile: "1m", left_tile_count: 68 } },
      { name: "RecordDiscardTile", data: { seat: 1, tile: "1m", moqie: true } },
      { name: "RecordChiPengGang", data: { seat: 0, type: 1, tiles: ["1m", "1m", "1m"], froms: [0, 0, 1] } },
      { name: "RecordDiscardTile", data: { seat: 0, tile: "9p", moqie: false } },
      ...[1, 2, 3].flatMap(seat => [
        { name: "RecordDealTile", data: { seat, tile: `${seat + 2}z`, left_tile_count: 68 - seat } },
        { name: "RecordDiscardTile", data: { seat, tile: `${seat + 2}z`, moqie: true } },
      ]),
      { name: "RecordDealTile", data: { seat: 0, tile: "1m", left_tile_count: 64 } },
      { name: "RecordAnGangAddGang", data: { seat: 0, type: 2, tiles: "1m" } },
      { name: "RecordDealTile", data: { seat: 0, tile: "5p", left_tile_count: 63 } },
      { name: "RecordDiscardTile", data: { seat: 0, tile: "5p", moqie: true, doras: ["1z", "2z"] } },
      { name: "RecordHule", data: { hules: [{ seat: 2, zimo: false, hu_tile: "5p" }], delta_scores: [-1000, 0, 1000, 0] } },
    ], 0);
    expect(mapped.status).toBe("ready");
    if (mapped.status !== "ready") throw new Error("fixture");
    const decisions = replayCanonicalStream(mapped.stream);
    expect(decisions.map(decision => decision.actualAction?.kind)).toEqual(["discard", "discard", "kakan", "discard"]);
    expect(decisions.map(decision => decision.snapshot.publicState.doraIndicators)).toEqual([
      [{ id: "1z", red: false }], [{ id: "1z", red: false }], [{ id: "1z", red: false }],
      [{ id: "1z", red: false }, { id: "2z", red: false }],
    ]);
    expect(mapped.stream.completeness.doraIndicators).toBe("complete");
    expect(mapped.stream.completeness.responseOpportunities).toBe("complete");
  });
});
