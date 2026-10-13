import { fileURLToPath } from "node:url";
import { parse } from "protobufjs";
import { describe, expect, it } from "vitest";
import { loadMahjongSoulProtocolBundle, mapMahjongSoulRecord } from "@riichi-coach/mahjong-soul-source";
import { replayCanonicalStream } from "../src/replay/stream-replayer.js";
import { createLibriichiRuleProjector } from "../src/analysis/libriichi-rule-projection.js";
import { LIBRIICHI_RULE_NORMALIZATION_VERSION, type LibriichiRuleIdentity } from "@riichi-coach/contracts";

const identity: LibriichiRuleIdentity = {
  implementation: "Equim-chan/Mortal/libriichi", revision: "0".repeat(40), nativeArtifactSha256: "1".repeat(64),
  wrapperSha256: "2".repeat(64), normalizationVersion: LIBRIICHI_RULE_NORMALIZATION_VERSION,
};

async function mapRound(actions: readonly { name: string; data: Record<string, unknown> }[], selfActor: number, openingEmptyActions = 0) {
  const bundle = await loadMahjongSoulProtocolBundle(fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url)));
  const root = parse(bundle.protoText, { keepCase: true }).root;
  const wrapper = root.lookupType("lq.Wrapper");
  const records = root.lookupType("lq.GameDetailRecords");
  const recordBytes = records.encode(records.fromObject({ version: 210715, actions: actions.flatMap(action => {
    const type = root.lookupType(`lq.${action.name}`);
    const encoded = { result: wrapper.encode(wrapper.fromObject({ name: `.lq.${action.name}`,
      data: type.encode(type.fromObject(action.data)).finish() })).finish() };
    return [encoded, ...(action.name === "RecordNewRound" ? Array.from({ length: openingEmptyActions }, () => ({})) : [])];
  }) })).finish();
  return mapMahjongSoulRecord({ gameId: "majsoul:dora-replay", selfActor,
    recordId: "000000-00000000-0000-0000-0000-000000000001", recordBytes, bundle });
}

describe("Mahjong Soul dealer opening discard reaches replay", () => {
  it.each([0, 2])("replays the stored tedashi of the split fourteenth tile at seat %s", async dealer => {
    // Reproduces the opening boundary in the two 2026-10-07 captures. All
    // fourteen tiles are dealt together, so the stored first discard is
    // tedashi even when canonical replay split that tile into an initial draw.
    const hand = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"];
    const hands = [hand, hand, hand, hand].map((tiles, seat) => seat === dealer ? [...tiles, "3z"] : tiles);
    const mapped = await mapRound([
      { name: "RecordNewRound", data: { chang: 0, ju: dealer, doras: ["7z"],
        scores: [25000, 25000, 25000, 25000], left_tile_count: 69,
        tiles0: hands[0], tiles1: hands[1], tiles2: hands[2], tiles3: hands[3] } },
      { name: "RecordDiscardTile", data: { seat: dealer, tile: "3z", moqie: false } },
      { name: "RecordHule", data: { hules: [{ seat: (dealer + 1) % 4, zimo: false, hu_tile: "3z" }],
        delta_scores: [0, 1, 2, 3].map(seat => seat === dealer ? -1000 : seat === (dealer + 1) % 4 ? 1000 : 0) } },
    ], dealer, dealer === 0 ? 2 : 1);
    expect(mapped.status).toBe("ready");
    if (mapped.status !== "ready") throw new Error("fixture");
    const decisions = replayCanonicalStream(mapped.stream);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.actualAction).toMatchObject({ kind: "discard", tile: { id: "3z", red: false } });
    expect(decisions[0]!.snapshot.privateState.concealedTiles).toHaveLength(13);
    expect(decisions[0]!.snapshot.privateState.currentDraw?.tile).toEqual({ id: "3z", red: false });
    expect(decisions[0]!.snapshot.publicState.roundOrdinal).toBe(0);
    expect(mapped.stream.events.find(event => event.type === "tile_discarded")!.sourceRecordRef)
      .toBe(`record:000000-00000000-0000-0000-0000-000000000001:action:${dealer === 0 ? 4 : 3}`);
  });
});

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
    expect(decisions.at(-1)!.snapshot.publicState.doraIndicators).toEqual(publication === "discard"
      ? [{ id: "1z", red: false }]
      : [{ id: "1z", red: false }, { id: "2z", red: false }]);
    expect(mapped.stream.completeness.responseOpportunities).toBe("complete");
  });

  it("replays pon, post-call discard, then kakan without changing earlier dora knowledge", async () => {
    const hand = ["1m", "1m", "2p", "3p", "4p", "4s", "5s", "6s", "7s", "8s", "9s", "2p", "9p", "9p"];
    const other = ["7z", "6z", "5z", "4z", "3z", "2z", "1z", "1s", "2s", "3s", "4s", "5s", "6s"];
    const actions = [
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
      { name: "RecordAnGangAddGang", data: { seat: 0, type: 2, tiles: "1m", doras: ["1z"] } },
      { name: "RecordDealTile", data: { seat: 0, tile: "5p", left_tile_count: 63, doras: ["1z"] } },
      { name: "RecordDiscardTile", data: { seat: 0, tile: "5p", moqie: true, doras: ["1z", "2z"] } },
      { name: "RecordHule", data: { hules: [{ seat: 2, zimo: false, hu_tile: "5p" }], delta_scores: [-1000, 0, 1000, 0] } },
    ];
    const mapped = await mapRound(actions, 0);
    expect(mapped.status).toBe("ready");
    if (mapped.status !== "ready") throw new Error("fixture");
    const decisions = replayCanonicalStream(mapped.stream);
    expect(decisions.map(decision => decision.actualAction?.kind)).toEqual(["discard", "discard", "kakan", "discard"]);
    expect(decisions.map(decision => decision.snapshot.publicState.doraIndicators)).toEqual([
      [{ id: "1z", red: false }], [{ id: "1z", red: false }], [{ id: "1z", red: false }],
      [{ id: "1z", red: false }],
    ]);
    expect(mapped.stream.completeness.doraIndicators).toBe("complete");
    expect(mapped.stream.completeness.responseOpportunities).toBe("complete");
    const changed = structuredClone(actions);
    changed.at(-2)!.data.doras = ["1z", "3z"];
    const remapped = await mapRound(changed, 0);
    expect(remapped.status).toBe("ready");
    if (remapped.status !== "ready") throw new Error("fixture");
    const changedDecision = replayCanonicalStream(remapped.stream).at(-1)!;
    expect(changedDecision.snapshot.publicState).toEqual(decisions.at(-1)!.snapshot.publicState);
    expect(changedDecision.snapshot.privateState).toEqual(decisions.at(-1)!.snapshot.privateState);
    const firstRequest = createLibriichiRuleProjector(mapped.stream, identity)(decisions.at(-1)!);
    const secondRequest = createLibriichiRuleProjector(remapped.stream, identity)(changedDecision);
    expect(secondRequest.events).toEqual(firstRequest.events);
    expect(secondRequest.eventPrefixSha256).toBe(firstRequest.eventPrefixSha256);
    // The whole source content changes identity, while past observed inputs do not.
    expect(secondRequest.canonicalStreamIdentity).not.toBe(firstRequest.canonicalStreamIdentity);
  });
});
