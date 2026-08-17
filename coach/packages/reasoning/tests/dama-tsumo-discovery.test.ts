/**
 * M6-A3 closing round (§7): dama_with_tsumo local discovery tests.
 *
 * The classifier is tested at its seam — replayed decisions in, one
 * hand-structure question out per structurally eligible window. The engine
 * is faked (the real Go engine is exercised by the discovery runner on the
 * real corpus); these tests pin the local logic: which windows get asked,
 * what verdict promotes a window, and which windows never reach the engine.
 */
import { describe, expect, it } from "vitest";
import type { HandStructureResultV2 } from "@riichi-coach/contracts";
import {
  collectDamaTsumoWindows,
  type ReplayedDecision,
} from "../src/index.js";

// A real 14-tile holding: 123m 456m 789m 123p + 4p drawn onto 4p — i.e.
// concealed 1m-9m + 1p-4p (13) plus a drawn second 4p. Discarding 9m keeps
// 123m 456m 78m 123p 44p: tenpai waiting on 6m/9m, so 9m was a winning tile.
const CONCEALED_13 = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"];
const DRAWN = "4p";
const DISCARDED = "9m"; // 34-index 8

function fakeDecision(overrides: {
  windowKind?: string;
  actualKind?: string | null;
  selfRiichi?: boolean;
  meldCount?: number;
  hasDraw?: boolean;
  discardedTile?: string;
  concealed?: string[];
  drawnTile?: string;
}): ReplayedDecision {
  const discarded = overrides.discardedTile ?? DISCARDED;
  const drawn = overrides.drawnTile ?? DRAWN;
  const concealed = overrides.concealed ?? CONCEALED_13;
  const kind = overrides.actualKind;
  const action = kind === "tsumo"
    ? { kind: "tsumo" as const, winningTile: { id: drawn, red: false }, drawEventRef: "game:g/0/1/0" }
    : kind === "riichi_discard"
    ? { kind: "riichi_discard" as const, tile: { id: discarded, red: false }, discardMode: "tedashi" as const }
    : { kind: "discard" as const, tile: { id: discarded, red: false }, discardMode: "tedashi" as const };
  return {
    decisionEventRef: "game:g/0/1/0",
    snapshot: {
      privateState: {
        decisionWindow: { kind: overrides.windowKind ?? "self_turn" },
      },
    },
    facts: {
      selfRiichi: overrides.selfRiichi ?? false,
      melds: Array.from({ length: overrides.meldCount ?? 0 }),
      concealedTiles: concealed.map((id) => ({ id, red: false })),
      currentDraw: overrides.hasDraw === false
        ? null
        : { tile: { id: drawn, red: false }, eventRef: "game:g/0/1/0" },
    },
    actualAction: action,
  } as unknown as ReplayedDecision;
}

interface CapturedRequest {
  readonly handTiles34: number[];
  readonly melds: unknown[];
  readonly leftTiles34: unknown;
  readonly yakuContext: { riichiStatus: string; windsStatus: string };
  readonly ronContext: string;
  readonly actionRef: string;
  readonly requestId: string;
  readonly stateHash: string;
}

function fakeEngine(
  respond: (request: CapturedRequest) => {
    overallShanten: number;
    waits: { tile34: number }[];
  } | Error,
): {
  engine: { analyzeHandStructure: (request: unknown) => Promise<HandStructureResultV2> };
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  return {
    requests,
    engine: {
      analyzeHandStructure: async (request: unknown) => {
        const captured = request as CapturedRequest;
        requests.push(captured);
        const answer = respond(captured);
        if (answer instanceof Error) throw answer;
        return answer as HandStructureResultV2;
      },
    },
  };
}

describe("collectDamaTsumoWindows (§7 local dama_with_tsumo discovery)", () => {
  it("promotes a window only when the kept hand was tenpai waiting on the discard", async () => {
    const { engine, requests } = fakeEngine(() => ({
      overallShanten: 0,
      waits: [{ tile34: 5 }, { tile34: 8 }],
    }));
    const result = await collectDamaTsumoWindows([fakeDecision({})], engine);
    expect(result.windows).toEqual([
      { decisionEventRef: "game:g/0/1/0", discardedWaitTile34: 8 },
    ]);
    expect(result.classifiedWindows).toBe(1);
    expect(result.skippedWindows).toBe(0);
    expect(result.engineFailures).toBe(0);
    expect(requests).toHaveLength(1);

    // The request is the 13-tile menzen projection (14 held minus the
    // discard) with the same projector shape the review pipeline uses.
    const request = requests[0]!;
    const expected = Array<number>(34).fill(0);
    for (let index = 0; index <= 7; index += 1) expected[index] = 1; // 1m-8m
    expected[9] = 1; // 1p
    expected[10] = 1; // 2p
    expected[11] = 1; // 3p
    expected[12] = 2; // 4p4p
    expect(request.handTiles34).toEqual(expected);
    expect(request.melds).toEqual([]);
    expect(request.leftTiles34).toBeNull();
    expect(request.yakuContext.riichiStatus).toBe("inactive");
    expect(request.yakuContext.windsStatus).toBe("unknown");
    expect(request.ronContext).toBe("unknown_future");
    expect(request.actionRef.startsWith("action:v1:")).toBe(true);
    expect(request.requestId).toBe(
      `dama-tsumo-discovery:game:g/0/1/0:hand-structure:${request.stateHash}`,
    );
  });

  it("tenpai waiting on a DIFFERENT tile is not a declined win", async () => {
    const { engine } = fakeEngine(() => ({ overallShanten: 0, waits: [{ tile34: 3 }] }));
    const result = await collectDamaTsumoWindows([fakeDecision({})], engine);
    expect(result.windows).toEqual([]);
    expect(result.classifiedWindows).toBe(1);
  });

  it("non-tenpai hands are asked but never promoted", async () => {
    const { engine } = fakeEngine(() => ({ overallShanten: 1, waits: [] }));
    const result = await collectDamaTsumoWindows([fakeDecision({})], engine);
    expect(result.windows).toEqual([]);
    expect(result.classifiedWindows).toBe(1);
  });

  it("open hands, riichi'd seats, riichi discards, and non-self windows skip the engine", async () => {
    const { engine, requests } = fakeEngine(() => ({
      overallShanten: 0,
      waits: [{ tile34: 8 }],
    }));
    const result = await collectDamaTsumoWindows(
      [
        fakeDecision({ meldCount: 1 }),
        fakeDecision({ selfRiichi: true }),
        fakeDecision({ actualKind: "riichi_discard" }),
        fakeDecision({ actualKind: "tsumo" }),
        fakeDecision({ windowKind: "post_call_discard" }),
        fakeDecision({ hasDraw: false }),
        // Structurally eligible control — this one MUST be asked.
        fakeDecision({}),
      ],
      engine,
    );
    expect(result.classifiedWindows).toBe(1);
    // Counted skips: open hand, riichi'd seat, missing draw. The tsumo
    // resolution, the riichi_discard resolution, and the post-call window
    // are not dama candidates at all and exit before the skip accounting.
    expect(result.skippedWindows).toBe(3);
    expect(result.engineFailures).toBe(0);
    expect(requests).toHaveLength(1);
  });

  it("engine failures skip the window fail-closed", async () => {
    const { engine, requests } = fakeEngine(() => new Error("engine down"));
    const result = await collectDamaTsumoWindows([fakeDecision({})], engine);
    expect(result.windows).toEqual([]);
    expect(result.classifiedWindows).toBe(1);
    expect(result.engineFailures).toBe(1);
    expect(requests).toHaveLength(1);
  });

  it("a discard not physically present in hand+draw is skipped, not guessed", async () => {
    const { engine, requests } = fakeEngine(() => ({
      overallShanten: 0,
      waits: [{ tile34: 26 }],
    }));
    const result = await collectDamaTsumoWindows(
      [fakeDecision({ discardedTile: "9s" })],
      engine,
    );
    expect(result.windows).toEqual([]);
    expect(result.classifiedWindows).toBe(0);
    expect(result.skippedWindows).toBe(1);
    expect(requests).toHaveLength(0);
  });

  it("incomplete private facts (not 14 held tiles) are skipped", async () => {
    const { engine, requests } = fakeEngine(() => ({
      overallShanten: 0,
      waits: [{ tile34: 8 }],
    }));
    const result = await collectDamaTsumoWindows(
      [fakeDecision({ concealed: CONCEALED_13.slice(0, 10) })],
      engine,
    );
    expect(result.windows).toEqual([]);
    expect(result.classifiedWindows).toBe(0);
    expect(result.skippedWindows).toBe(1);
    expect(requests).toHaveLength(0);
  });

  // Prefilter: (hand minus X) + X is the holding itself, so a holding with
  // no winning shape can never be promoted — the engine is not asked.
  it("prefilters a non-winning holding without an engine roundtrip", async () => {
    const { engine, requests } = fakeEngine(() => ({
      overallShanten: 0,
      waits: [{ tile34: 8 }],
    }));
    // Default holding with 1p replaced by 1s: no standard/chiitoi/kokushi
    // shape (1s floats), yet the 9m discard is physically present.
    const result = await collectDamaTsumoWindows(
      [
        fakeDecision({
          concealed: CONCEALED_13.map((id) => (id === "1p" ? "1s" : id)),
        }),
      ],
      engine,
    );
    expect(result.windows).toEqual([]);
    expect(result.classifiedWindows).toBe(0);
    expect(result.prefilteredWindows).toBe(1);
    expect(result.skippedWindows).toBe(0);
    expect(requests).toHaveLength(0);
  });

  it("still asks the engine for chiitoitsu and kokushi holdings", async () => {
    const { engine, requests } = fakeEngine((request) => ({
      overallShanten: 0,
      waits: request.handTiles34
        .map((count, tile34) => ({ count, tile34 }))
        .filter((entry) => entry.count === 1)
        .map((entry) => ({ tile34: entry.tile34 })),
    }));
    const result = await collectDamaTsumoWindows(
      [
        // Chiitoi: 7 pairs, discard one copy of the last pair.
        fakeDecision({
          concealed: ["1m", "1m", "3m", "3m", "5m", "5m", "2p", "2p", "4p", "4p", "6s", "6s", "8s"],
          drawnTile: "8s",
          discardedTile: "8s",
        }),
        // Kokushi: all 13 orphans, doubled 7z discarded.
        fakeDecision({
          concealed: ["1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "4z", "5z", "6z", "7z"],
          drawnTile: "7z",
          discardedTile: "7z",
        }),
      ],
      engine,
    );
    expect(result.classifiedWindows).toBe(2);
    expect(result.prefilteredWindows).toBe(0);
    expect(requests).toHaveLength(2);
    expect(result.windows).toEqual([
      { decisionEventRef: "game:g/0/1/0", discardedWaitTile34: 25 }, // 8s
      { decisionEventRef: "game:g/0/1/0", discardedWaitTile34: 33 }, // 7z
    ]);
  });
});
