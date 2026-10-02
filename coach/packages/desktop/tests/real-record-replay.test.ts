import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
  decodeStoredRecordActions,
} from "@riichi-coach/mahjong-soul-source";
import {
  buildMahjongSoulReplayAudit,
  replayCanonicalStream,
  serializeMahjongSoulReplayAudit,
  validateCanonicalEventStream,
} from "@riichi-coach/reasoning";
import { parseCanonicalEventRef } from "@riichi-coach/contracts";
import { describe, expect, it } from "vitest";

const bundleRoot = fileURLToPath(
  new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url),
);
const fixtureUrl = new URL(
  "../../mahjong-soul-source/tests/fixtures/real-supported-round.json",
  import.meta.url,
);

interface RealSupportedRoundFixture {
  readonly fixtureVersion: string;
  readonly description: string;
  readonly recordId: string;
  readonly wire: string;
}

describe("real supported round: full map → replay → audit chain", () => {
  it("produces a replayed decision set and a serializable replay audit", async () => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8")) as RealSupportedRoundFixture;
    const recordBytes = unwrapGameDetailRecords(
      bundle,
      Uint8Array.from(Buffer.from(fixture.wire, "hex")),
    );

    const mapped = mapMahjongSoulRecord({
      gameId: "majsoul:real-supported-round",
      selfActor: 0,
      recordId: fixture.recordId,
      recordBytes,
      bundle,
    });
    expect(mapped.status).toBe("ready");
    if (mapped.status !== "ready") return;

    const decisions = replayCanonicalStream(mapped.stream);
    // The replay must surface at least one frozen self-turn decision for the
    // auditable fact layer; a ready stream that yields nothing is not replayable.
    expect(decisions.length).toBeGreaterThan(0);

    const audit = buildMahjongSoulReplayAudit({
      stream: mapped.stream,
      decisions,
      recordId: fixture.recordId,
      protocolVersion: "fixture",
      appVersion: "fixture",
      now: () => 1_700_000_000_000,
    });
    expect(audit.recordId).toBe(fixture.recordId);
    expect(audit.selfSeat).toBe(0);
    expect(audit.gameId).toBe("majsoul:real-supported-round");
    expect(audit.streamHash).toBe(mapped.stream.sourceRecordHash);
    expect(audit.rounds.length).toBe(1);
    expect(audit.events.length).toBe(mapped.stream.events.length);
    expect(audit.decisions.length).toBe(decisions.length);

    const serialized = serializeMahjongSoulReplayAudit(audit);
    expect(JSON.parse(serialized) as { recordId: string }).toEqual(
      expect.objectContaining({ recordId: fixture.recordId }),
    );
  });

  it.each([0,1,2,3])("full real game actor %i preserves source wall counts at decision boundaries", async selfActor => {
    const bundle = await loadMahjongSoulProtocolBundle(bundleRoot);
    const fixture = JSON.parse(readFileSync(new URL(
      "../../mahjong-soul-source/tests/fixtures/real-record-wire.json",
      import.meta.url,
    ), "utf8")) as RealSupportedRoundFixture;
    const recordBytes = unwrapGameDetailRecords(
      bundle,
      Uint8Array.from(Buffer.from(fixture.wire, "hex")),
    );
    const mapped = mapMahjongSoulRecord({
      gameId: "majsoul:real-record-full-game",
      selfActor,
      recordId: fixture.recordId,
      recordBytes,
      bundle,
    });
    expect(mapped.status).toBe("ready");
    if (mapped.status !== "ready") return;
    expect(mapped.stream.events.length).toBe(1024);
    expect(validateCanonicalEventStream(mapped.stream)).toEqual({ status: "valid" });
    const rawActions=new Map(decodeStoredRecordActions(bundle,recordBytes).map(action=>[action.sourceRecordOrdinal,action]));
    const decisions=replayCanonicalStream(mapped.stream);
    const draws=decisions.filter(decision=>decision.snapshot.privateState.decisionWindow.kind==="self_turn");
    expect(draws.length).toBeGreaterThan(100);
    for(const decision of draws) {
      const position=parseCanonicalEventRef(decision.decisionEventRef)!.position;
      const source=rawActions.get(position.sourceRecordOrdinal)!;
      expect(["RecordNewRound","RecordDealTile"]).toContain(source.name);
      expect(decision.snapshot.publicState.remainingDraws).toBe(source.data.left_tile_count ?? 0);
      expect(decision.snapshot.publicState.fields.remainingDraws).toBe("complete");
    }
  });
});
