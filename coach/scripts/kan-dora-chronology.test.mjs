import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { parse } from "protobufjs";
import { describe, expect, it } from "vitest";
import { loadMahjongSoulProtocolBundle, mapMahjongSoulRecord } from "@riichi-coach/mahjong-soul-source";
import { replayCanonicalStream } from "@riichi-coach/reasoning";
import { mapTenhouRecord, tokenizeMjlog, tenhouTileCode } from "@riichi-coach/tenhou-source";

const bundleRoot = fileURLToPath(new URL("../vendor/mahjong-soul-protocol/", import.meta.url));

// Synthetic, physically conserved hands. The asserted authority is the explicit
// public indicator snapshot in each source record, not a rule-engine answer.
async function daiminkanRecord(publication, newIndicator = "2z") {
  const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
  const root = parse(bundle.protoText, { keepCase: true }).root;
  const wrapper = root.lookupType("lq.Wrapper");
  const gameAction = root.lookupType("lq.GameAction");
  const records = root.lookupType("lq.GameDetailRecords");
  const selfHand = ["1z", "1z", "1z", "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p"];
  const winnerHand = ["2m", "3m", "4m", "6s", "7s", "8s", "2s", "2s", "2s", "7s", "7s", "4p", "6p"];
  const stock = ["m", "p", "s", "z"].flatMap(suit =>
    Array.from({ length: suit === "z" ? 7 : 9 }, (_, i) => Array(4).fill(`${i + 1}${suit}`)).flat());
  for (const tile of [...selfHand, ...winnerHand, "6z", newIndicator, "5p", "1z"]) {
    const index = stock.indexOf(tile);
    if (index < 0) throw new Error("fixture exceeds four copies");
    stock.splice(index, 1);
  }
  const actions = [
    { name: "RecordNewRound", data: {
      chang: 0, ju: 0, ben: 0, doras: ["6z"], scores: [25000, 25000, 25000, 25000],
      liqibang: 0, left_tile_count: 69, tiles0: [...stock.splice(0, 13), "1z"],
      tiles1: selfHand, tiles2: winnerHand, tiles3: stock.splice(0, 13),
    } },
    { name: "RecordDiscardTile", data: { seat: 0, tile: "1z", moqie: true, doras: ["6z"] } },
    { name: "RecordChiPengGang", data: { seat: 1, type: 2, tiles: ["1z", "1z", "1z", "1z"], froms: [1, 1, 1, 0] } },
    { name: "RecordDealTile", data: { seat: 1, tile: "5p", left_tile_count: 68,
      doras: publication === "draw" ? ["6z", newIndicator] : ["6z"] } },
    { name: "RecordDiscardTile", data: { seat: 1, tile: "5p", moqie: true, doras: ["6z", newIndicator] } },
    { name: "RecordHule", data: { hules: [{ seat: 2, zimo: false, hu_tile: "5p" }], delta_scores: [0, -1000, 1000, 0] } },
  ];
  const encoded = actions.map(({ name, data }) => {
    const type = root.lookupType(`lq.${name}`);
    return gameAction.fromObject({ result: wrapper.encode(wrapper.fromObject({
      name: `.lq.${name}`, data: type.encode(type.fromObject(data)).finish(),
    })).finish() });
  });
  const result = mapMahjongSoulRecord({
    gameId: "game:dora-chronology", recordId: "260928-00000000-0000-0000-0000-000000000001",
    selfActor: 1, bundle, recordBytes: records.encode(records.fromObject({ version: 210715, actions: encoded })).finish(),
  });
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("fixture mapping failed");
  return result.stream;
}

describe("kan indicator publication chronology", () => {
  it("changing a future indicator cannot change the earlier visible decision state", async () => {
    const first = replayCanonicalStream(await daiminkanRecord("discard", "2z"))[0];
    const second = replayCanonicalStream(await daiminkanRecord("discard", "3z"))[0];
    expect(first.snapshot.publicState).toEqual(second.snapshot.publicState);
    expect(first.snapshot.privateState).toEqual(second.snapshot.privateState);
    expect(first.actualAction).toEqual(second.actualAction);
  });

  it("retains the real Tenhou DORA tag's position and does not move it into an earlier draw", () => {
    const raw = readFileSync(new URL("../packages/tenhou-source/tests/fixtures/real-logs/bug1.xml", import.meta.url), "utf8");
    const tokens = tokenizeMjlog(raw);
    const publication = tokens.findIndex(token => token.tag === "DORA");
    expect(publication).toBe(226);
    expect(tokens[publication - 1].tag).toBe("T132");
    const mapped = mapTenhouRecord({ raw, gameId: "game:tenhou-dora", selfActor: 0 });
    expect(mapped.status).toBe("ready");
    if (mapped.status !== "ready") throw new Error("fixture mapping failed");
    const reveal = mapped.stream.events.find(event => event.type === "dora_revealed");
    expect(reveal.sourceRecordRef).toBe(`record:game:tenhou-dora:tag:${publication}`);
    const decision = replayCanonicalStream(mapped.stream).find(row => row.decisionEventRef.endsWith(`/${publication - 1}/0`));
    expect(decision).toBeDefined();
    const roundStart = tokens.slice(0, publication).findLast(token => token.tag === "INIT");
    const initialIndicator = Number(roundStart.attrs.seed.split(",")[5]);
    expect(decision.snapshot.publicState.doraIndicators).toEqual([tenhouTileCode(initialIndicator, true)]);
  });

  it.each(["draw", "discard"])("uses only indicators published by the self decision: %s", async publication => {
    const stream = await daiminkanRecord(publication);
    const decisions = replayCanonicalStream(stream);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].snapshot.publicState.doraIndicators.map(tile => tile.id))
      .toEqual(publication === "draw" ? ["6z", "2z"] : ["6z"]);
    expect(decisions[0].actualAction).toMatchObject({ kind: "discard", tile: { id: "5p", red: false }, discardMode: "tsumogiri" });
    const reveals = stream.events.filter(event => event.type === "dora_revealed");
    expect(reveals).toHaveLength(1);
    expect(reveals[0].sourceRecordRef).toMatch(new RegExp(`:action:${publication === "draw" ? 4 : 5}$`));
    expect(stream.completeness.doraIndicators).toBe("complete");
  });
});
