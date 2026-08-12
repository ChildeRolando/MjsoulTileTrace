import { describe, expect, it } from "vitest";
import {
  filterAnalyzableRecord,
  type RawRecordListEntry,
} from "../src/record-filter.js";

const recordId = "260811-00000000-0000-0000-0000-000000000001";
const now = 1_754_887_700;

const validEntry: RawRecordListEntry = {
  version: 1,
  uuid: recordId,
  start_time: 1_754_877_600,
  end_time: 1_754_887_600,
  tag: 0,
  subtag: 0,
  players: [
    { rank: 1, account_id: 101, nickname: "A", seat: 0, point: 32_000 },
    { rank: 2, account_id: 102, nickname: "B", seat: 1, point: 27_000 },
    { rank: 3, account_id: 103, nickname: "C", seat: 2, point: 23_000 },
    { rank: 4, account_id: 104, nickname: "D", seat: 3, point: 18_000 },
  ],
  standard_rule: 0,
};

describe("analyzable Mahjong Soul record filter", () => {
  it("accepts a canonical four-player South standard entry", () => {
    const result = filterAnalyzableRecord(validEntry, 103, now);
    expect(result.status).toBe("analyzable");
    if (result.status !== "analyzable") return;
    expect(result.summary).toMatchObject({
      recordId,
      shareUrl: `https://game.maj-soul.com/1/?paipu=${recordId}_a1`,
      startedAt: 1_754_877_600,
      selfSeat: 2,
      rule: { playerCount: 4, length: "south", displayLabel: "四人南风" },
      analysisStatus: "not_analyzed",
      lastSyncedAt: now,
    });
    expect(result.summary.players).toEqual([
      { seat: 0, displayName: "A", finalScore: 32_000, rank: 1 },
      { seat: 1, displayName: "B", finalScore: 27_000, rank: 2 },
      { seat: 2, displayName: "C", finalScore: 23_000, rank: 3 },
      { seat: 3, displayName: "D", finalScore: 18_000, rank: 4 },
    ]);
  });

  it("rejects an unsupported record version", () => {
    expect(filterAnalyzableRecord({ ...validEntry, version: 9 }, 103, now))
      .toEqual({ status: "not_analyzable" });
  });

  it("rejects a non-standard rule flag", () => {
    expect(filterAnalyzableRecord({ ...validEntry, standard_rule: 1 }, 103, now))
      .toEqual({ status: "not_analyzable" });
  });

  it("rejects a self account id that maps to zero or multiple seats", () => {
    expect(filterAnalyzableRecord(validEntry, 999, now))
      .toEqual({ status: "not_analyzable" });
    const duplicated = {
      ...validEntry,
      players: validEntry.players.map((player, index) =>
        index < 2 ? { ...player, account_id: 101 } : player
      ),
    };
    expect(filterAnalyzableRecord(duplicated, 101, now))
      .toEqual({ status: "not_analyzable" });
  });

  it("rejects duplicate player seats", () => {
    const duplicateSeat = {
      ...validEntry,
      players: validEntry.players.map((player) => ({ ...player, seat: 0 })),
    };
    expect(filterAnalyzableRecord(duplicateSeat, 103, now))
      .toEqual({ status: "not_analyzable" });
  });

  it("normalizes a reverse-ordered player list by seat", () => {
    const reversed = {
      ...validEntry,
      players: [...validEntry.players].reverse(),
    };
    const result = filterAnalyzableRecord(reversed, 103, now);
    expect(result.status).toBe("analyzable");
    if (result.status !== "analyzable") return;
    expect(result.summary.players.map((player) => player.seat)).toEqual([0, 1, 2, 3]);
    expect(result.summary.players.map((player) => player.displayName))
      .toEqual(["A", "B", "C", "D"]);
  });

  it("rejects a non-canonical record uuid", () => {
    expect(filterAnalyzableRecord({
      ...validEntry,
      uuid: "not-a-record-id",
    }, 103, now)).toEqual({ status: "not_analyzable" });
    expect(filterAnalyzableRecord({
      ...validEntry,
      uuid: "260811-00000000-0000-0000-0000-00000000000G",
    }, 103, now)).toEqual({ status: "not_analyzable" });
  });

  it.each([
    {},
    null,
    { ...validEntry, players: validEntry.players.slice(0, 3) },
    { ...validEntry, players: [{ ...validEntry.players[0]!, seat: 9 }] },
    { ...validEntry, players: [{ ...validEntry.players[0]!, rank: 0 }] },
    { ...validEntry, players: [{ ...validEntry.players[0]!, nickname: "" }] },
    { ...validEntry, players: [{ ...validEntry.players[0]!, point: 1.5 }] },
    { ...validEntry, uuid: 42 },
  ])("rejects malformed or hostile input %#", (value) => {
    expect(filterAnalyzableRecord(value as unknown as RawRecordListEntry, 103, now))
      .toEqual({ status: "not_analyzable" });
  });

  it("never includes account id, token, or raw fields in the summary", () => {
    const result = filterAnalyzableRecord(validEntry, 103, now);
    expect(result.status).toBe("analyzable");
    if (result.status !== "analyzable") return;
    const serialized = JSON.stringify(result.summary);
    expect(serialized).not.toContain("account_id");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("standard_rule");
    expect(serialized).not.toContain("subtag");
    expect(serialized).not.toContain("103");
  });
});
