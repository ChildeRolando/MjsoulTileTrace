import { describe, expect, it } from "vitest";
import {
  MORTAL_REPORT_MAX_BYTES,
  fetchMortalReport,
} from "../src/report-fetcher.js";
import { MortalSourceError } from "../src/errors.js";

const REPORT_ID = "0123456789abcdef";
const REPORT_URL = `https://mjai.ekyu.moe/report/${REPORT_ID}.json`;

function mjaiLog() {
  return [
    { type: "start_game", names: ["A", "B", "C", "D"], kyoku_first: 0, aka_flag: true },
    {
      type: "start_kyoku",
      bakaze: "E",
      dora_marker: "6p",
      kyoku: 0,
      honba: 0,
      kyotaku: 0,
      oya: 0,
      scores: [25000, 25000, 25000, 25000],
      tehais: [
        ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"],
        ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"],
        ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"],
        ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"],
      ],
    },
  ];
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    junme: 6,
    tiles_left: 70,
    last_actor: 1,
    tile: "4p",
    state: {
      tehai: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p", "4p"],
      fuuros: [],
    },
    at_self_chi_pon: false,
    at_self_riichi: false,
    at_opponent_kakan: false,
    expected: { type: "dahai", actor: 1, pai: "4p", tsumogiri: true },
    actual: { type: "dahai", actor: 1, pai: "4p", tsumogiri: true },
    is_equal: true,
    details: [
      { action: { type: "dahai", actor: 1, pai: "4p", tsumogiri: true }, q_value: 0.5, prob: 0.6 },
      { action: { type: "dahai", actor: 1, pai: "1p", tsumogiri: false }, q_value: 0.2, prob: 0.4 },
    ],
    shanten: 1,
    at_furiten: false,
    actual_index: 0,
    ...overrides,
  };
}

function opponentEntry() {
  return entry({
    last_actor: 0,
    tile: "7m",
    state: {
      tehai: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p", "7m"],
      fuuros: [],
    },
    expected: { type: "none" },
    actual: { type: "none" },
  });
}

function rawReport(overrides: Record<string, unknown> = {}) {
  return {
    engine: "Mortal",
    version: "1.5.10",
    player_id: 1,
    review: {
      model_tag: "4.1b",
      kyokus: [{
        kyoku: 0,
        honba: 0,
        end_status: [],
        relative_scores: [],
        entries: [entry(), opponentEntry()],
      }],
      total_reviewed: 1,
      total_matches: 1,
      rating: 0,
      temperature: 0,
      relative_phi_matrix: [],
    },
    mjai_log: mjaiLog(),
    lang: "zh-CN",
    show_rating: false,
    game_length: "Hanchan",
    loading_time: "0",
    review_time: "0",
    split_logs: [],
    ...overrides,
  };
}

function jsonResponse(
  body: string,
  init: ResponseInit = {},
): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("fetchMortalReport", () => {
  it("fetches, validates, and projects only self-perspective entries", async () => {
    const calls: string[] = [];
    const result = await fetchMortalReport({
      url: REPORT_URL,
      fetchImpl: (async (input) => {
        calls.push(String(input));
        return jsonResponse(JSON.stringify(rawReport()));
      }) as typeof fetch,
    });

    expect(result.reportId).toBe(REPORT_ID);
    expect(result.engine).toBe("Mortal");
    expect(result.version).toBe("1.5.10");
    expect(result.modelTag).toBe("4.1b");
    expect(result.playerId).toBe(1);
    expect(result.kyokus).toHaveLength(1);
    expect(result.kyokus[0]!.entries).toHaveLength(1);
    expect(result.kyokus[0]!.entries[0]!.lastActor).toBe(1);
    expect(result.kyokus[0]!.entries[0]!.tehai).toHaveLength(14);
    expect(result.gameFingerprint).toContain("mortal-game-fingerprint/v1:sha256:");
    expect(calls).toEqual([REPORT_URL]);
  });

  it("follows and re-validates redirects on the approved host", async () => {
    const calls: string[] = [];
    const result = await fetchMortalReport({
      url: REPORT_URL,
      fetchImpl: (async (input) => {
        calls.push(String(input));
        if (calls.length === 1) {
          return new Response(null, {
            status: 302,
            headers: {
              location: `https://mjai.ekyu.moe/report/${REPORT_ID}.json`,
            },
          });
        }
        return jsonResponse(JSON.stringify(rawReport()));
      }) as typeof fetch,
    });

    expect(result.reportId).toBe(REPORT_ID);
    expect(calls).toHaveLength(2);
  });

  it("rejects redirects to a non-approved host", async () => {
    await expect(fetchMortalReport({
      url: REPORT_URL,
      fetchImpl: (async () => new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/report/0123456789abcdef.json" },
      })) as typeof fetch,
    })).rejects.toMatchObject({ code: "mortal_result_url_invalid" });
  });

  it("rejects a missing redirect location", async () => {
    await expect(fetchMortalReport({
      url: REPORT_URL,
      fetchImpl: (async () => new Response(null, {
        status: 302,
        headers: {},
      })) as typeof fetch,
    })).rejects.toMatchObject({ code: "mortal_result_redirect_rejected" });
  });

  it("rejects oversized content-length before reading the body", async () => {
    await expect(fetchMortalReport({
      url: REPORT_URL,
      fetchImpl: (async () => new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": String(MORTAL_REPORT_MAX_BYTES + 1),
        },
      })) as typeof fetch,
    })).rejects.toMatchObject({ code: "mortal_result_size_exceeded" });
  });

  it("rejects non-JSON content types", async () => {
    await expect(fetchMortalReport({
      url: REPORT_URL,
      fetchImpl: (async () => new Response("{}", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as typeof fetch,
    })).rejects.toMatchObject({ code: "mortal_result_content_type_rejected" });
  });

  it("rejects invalid JSON with a fixed diagnostic", async () => {
    await expect(fetchMortalReport({
      url: REPORT_URL,
      fetchImpl: (async () => jsonResponse("{not json")) as typeof fetch,
    })).rejects.toMatchObject({ code: "mortal_result_invalid_json" });
  });

  it("rejects reports that no longer match the pinned schema", async () => {
    const bad = rawReport();
    delete (bad.review as Record<string, unknown>).model_tag;
    await expect(fetchMortalReport({
      url: REPORT_URL,
      fetchImpl: (async () => jsonResponse(JSON.stringify(bad))) as typeof fetch,
    })).rejects.toMatchObject({ code: "mortal_report_schema_unsupported" });
  });

  it("fails closed on invalid player_id", async () => {
    await expect(fetchMortalReport({
      url: REPORT_URL,
      fetchImpl: (async () => jsonResponse(JSON.stringify(
        rawReport({ player_id: 4 }),
      ))) as typeof fetch,
    })).rejects.toMatchObject({ code: "mortal_report_schema_unsupported" });
  });

  it("never leaks the URL or raw JSON through errors", async () => {
    const error = await fetchMortalReport({
      url: REPORT_URL,
      fetchImpl: (async () => new Response(null, {
        status: 302,
        headers: {},
      })) as typeof fetch,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MortalSourceError);
    const message = (error as Error).message;
    expect(message).not.toContain(REPORT_ID);
    expect(message).not.toContain("https://");
    expect(message).not.toContain("mjai_log");
  });
});
