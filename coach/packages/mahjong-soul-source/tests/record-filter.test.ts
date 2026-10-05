import { describe, expect, it } from "vitest";
import {
  filterAnalyzableRecord,
  type RawRecordListEntry,
} from "../src/record-filter.js";

const recordId = "260811-00000000-0000-0000-0000-000000000001";
const now = 1_754_887_700;

const validEntry: RawRecordListEntry = {
  version: 210715,
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
  standard_rule: 2,
  game_mode: 2,
  game_mode_ai: false,
  game_mode_extendinfo: "",
  game_mode_detail_rule_present: false,
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
      rule: {
        playerCount: 4,
        length: "south",
        modeId: 2,
        detailRuleHash: "sha256:7a53cc5deb60512f3dacacc7695dd5072077c6f4984dbedbff76e27092393b1c",
        displayLabel: "四人南风",
      },
      analysisStatus: "not_analyzed",
      lastSyncedAt: now,
    });
    expect(result.summary.players).toEqual([
      { seat: 0, displayName: "A", finalScore: 32_000, rank: 1, gradingScore: null, gradingScoreUnit: null },
      { seat: 1, displayName: "B", finalScore: 27_000, rank: 2, gradingScore: null, gradingScoreUnit: null },
      { seat: 2, displayName: "C", finalScore: 23_000, rank: 3, gradingScore: null, gradingScoreUnit: null },
      { seat: 3, displayName: "D", finalScore: 18_000, rank: 4, gradingScore: null, gradingScoreUnit: null },
    ]);
  });

  it("keeps room and score metadata display-only, including missing and unknown mode IDs", () => {
    const profileEntry: RawRecordListEntry = {
      ...validEntry,
      version: 202408,
      standard_rule: 1,
      catalog_rule_profile: "ranked_south_v1",
      game_mode_detail_rule_override: false,
      grading_score_by_seat: [8, null, 0, -5],
      grading_unit_by_seat: ["dan_pt", null, "soul_pearl", "unknown"],
      players: validEntry.players.map(player => ({ ...player, pt: "unmapped legacy value" })),
    };
    for (const modeId of [undefined, 0, 99, "future-mode"] as const) {
      const result = filterAnalyzableRecord({ ...profileEntry, ranked_mode_id: modeId }, 103, now);
      expect(result.status).toBe("analyzable");
      if (result.status !== "analyzable") continue;
      expect(result.summary.rankedMode).toEqual(
        typeof modeId === "number" ? { id: modeId, label: null } : null,
      );
      expect(result.summary.players.map(player => player.gradingScore)).toEqual([8, null, 0, -5]);
      expect(result.summary.players.map(player => player.gradingScoreUnit)).toEqual(["dan_pt", null, "soul_pearl", "unknown"]);
    }
  });

  it("does not interpret GameMode.mode=2 as a ranked room ID", () => {
    const result = filterAnalyzableRecord(validEntry, 103, now);
    expect(result.status).toBe("analyzable");
    if (result.status === "analyzable") expect(result.summary.rankedMode).toBeNull();
  });

  it("rejects an unsupported record version", () => {
    expect(filterAnalyzableRecord({ ...validEntry, version: 9 }, 103, now))
      .toEqual({ status: "not_analyzable", reason: "unsupported_record_version" });
    expect(filterAnalyzableRecord({ ...validEntry, version: 202408 }, 103, now))
      .toEqual({ status: "not_analyzable", reason: "unsupported_record_version" });
  });

  it("rejects a non-standard rule flag", () => {
    expect(filterAnalyzableRecord({ ...validEntry, standard_rule: 1 }, 103, now))
      .toEqual({ status: "not_analyzable", reason: "unsupported_standard_rule" });
    expect(filterAnalyzableRecord({ ...validEntry, standard_rule: 3,
      catalog_rule_profile: "unsupported", game_mode_detail_rule_override: false }, 103, now))
      .toEqual({ status: "not_analyzable", reason: "unsupported_standard_rule" });
  });

  it("requires positive four-player South mode evidence", () => {
    expect(filterAnalyzableRecord({ ...validEntry, game_mode: 1 }, 103, now))
      .toEqual({ status: "not_analyzable", reason: "unsupported_game_mode" });
    expect(filterAnalyzableRecord({ ...validEntry, game_mode: 12 }, 103, now))
      .toEqual({ status: "not_analyzable", reason: "unsupported_game_mode" });
    const withoutMode = { ...validEntry } as Record<string, unknown>;
    delete withoutMode.game_mode;
    expect(filterAnalyzableRecord(
      withoutMode as unknown as RawRecordListEntry,
      103,
      now,
    )).toEqual({ status: "not_analyzable", reason: "invalid_input" });
  });

  it("rejects a self account id that maps to zero or multiple seats", () => {
    expect(filterAnalyzableRecord(validEntry, 999, now))
      .toEqual({ status: "not_analyzable", reason: "account_not_in_record" });
    const duplicated = {
      ...validEntry,
      players: validEntry.players.map((player, index) =>
        index < 2 ? { ...player, account_id: 101 } : player
      ),
    };
    expect(filterAnalyzableRecord(duplicated, 101, now))
      .toEqual({ status: "not_analyzable", reason: "account_not_in_record" });
  });

  it("rejects duplicate player seats", () => {
    const duplicateSeat = {
      ...validEntry,
      players: validEntry.players.map((player) => ({ ...player, seat: 0 })),
    };
    expect(filterAnalyzableRecord(duplicateSeat, 103, now))
      .toEqual({ status: "not_analyzable", reason: "invalid_player_seats" });
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
    }, 103, now)).toEqual({ status: "not_analyzable", reason: "invalid_record_id" });
    expect(filterAnalyzableRecord({
      ...validEntry,
      uuid: "260811-00000000-0000-0000-0000-00000000000G",
    }, 103, now)).toEqual({ status: "not_analyzable", reason: "invalid_record_id" });
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
      .toEqual({ status: "not_analyzable", reason: "invalid_input" });
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
