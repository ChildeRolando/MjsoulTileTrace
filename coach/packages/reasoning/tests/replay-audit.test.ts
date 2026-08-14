import { describe, expect, it } from "vitest";
import { replayCanonicalStream } from "../src/replay/stream-replayer.js";
import {
  buildMahjongSoulReplayAudit,
  MahjongSoulReplayAuditSchema,
  MAHJONG_SOUL_REPLAY_AUDIT_SCHEMA_VERSION,
  serializeMahjongSoulReplayAudit,
} from "../src/replay/replay-audit.js";
import { canonicalSelfDrawDiscardEvents, canonicalStream } from "./fixtures/canonical-stream.js";

const RECORD_ID = "260811-00000000-0000-0000-0000-000000000001";

function auditedStream() {
  // The fixture's placeholder record hash is not a sha256; the audit requires
  // the real mapper's `sha256:<64 hex>` identity hash.
  return {
    ...canonicalStream(canonicalSelfDrawDiscardEvents()),
    sourceRecordHash: `sha256:${"ab".repeat(32)}`,
  };
}

describe("Mahjong Soul replay audit", () => {
  it("builds a schema-valid, human-comparable audit for a replayed stream", () => {
    const stream = auditedStream();
    const audit = buildMahjongSoulReplayAudit({
      stream,
      decisions: replayCanonicalStream(stream),
      recordId: RECORD_ID,
      protocolVersion: "mahjong-soul-cn-protocol/v1",
      appVersion: "0.1.0",
      now: () => 1_700_000_000_000,
    });

    expect(audit.schemaVersion).toBe(MAHJONG_SOUL_REPLAY_AUDIT_SCHEMA_VERSION);
    expect(audit.recordId).toBe(RECORD_ID);
    expect(audit.selfSeat).toBe(0);
    expect(audit.streamHash).toBe(`sha256:${"ab".repeat(32)}`);
    expect(audit.rounds).toHaveLength(1);
    expect(audit.rounds[0]).toMatchObject({
      roundOrdinal: 0,
      roundWind: "E",
      dealer: 0,
      selfHand: expect.any(Array),
    });
    expect(audit.events).toHaveLength(4);
    expect(audit.events.map((event) => event.type)).toEqual([
      "game_started",
      "round_started",
      "tile_drawn",
      "tile_discarded",
    ]);
    expect(audit.decisions).toHaveLength(1);
    expect(audit.decisions[0]!.actualDiscard).toMatchObject({
      tile: { id: "5p" },
      discardMode: "tsumogiri",
    });
  });

  it("excludes secret and raw-payload fields and serializes deterministically", () => {
    const stream = auditedStream();
    const audit = buildMahjongSoulReplayAudit({
      stream,
      decisions: replayCanonicalStream(stream),
      recordId: RECORD_ID,
      protocolVersion: "mahjong-soul-cn-protocol/v1",
      appVersion: "0.1.0",
      now: () => 42,
    });

    // Pin the exact top-level shape so no secret field can silently appear.
    expect(Object.keys(audit).sort()).toEqual([
      "appVersion",
      "decisions",
      "events",
      "gameId",
      "generatedAt",
      "mapperVersion",
      "prefixHash",
      "protocolVersion",
      "recordId",
      "rounds",
      "schemaVersion",
      "selfSeat",
      "streamHash",
    ].sort());

    const serialized = serializeMahjongSoulReplayAudit(audit);
    expect(serialized).not.toContain("access_token");
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("account_id");
    expect(serialized).not.toContain("data_url");
    expect(serialized).not.toContain("nickname");

    expect(serialized.endsWith("\n")).toBe(true);
    expect(MahjongSoulReplayAuditSchema.safeParse(JSON.parse(serialized)).success)
      .toBe(true);
  });
});
