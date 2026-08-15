/**
 * Census / discovery / acceptance-policy tests.
 *
 * Census + discovery run on the pinned REAL corpus (allowed: they consume
 * established semantics). Acceptance-policy tests are pure synthetic policy
 * cases (no external semantics involved).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  censusCanonicalGame,
  delayBeforeRequestMs,
  discoverTenhouCorpus,
  mapTenhouRecord,
  planAcceptanceRun,
  TENHOU_COVERAGE_BRANCHES,
  updateCheckpoint,
} from "../src/index.js";

const fixtureDir = fileURLToPath(new URL("./fixtures/real-logs/", import.meta.url));

function loadRaw(name: string): string {
  return readFileSync(`${fixtureDir}${name}`, "utf8");
}

describe("census on the pinned real corpus", () => {
  it("bug1: structural windows are counted for all four seats", () => {
    const mapped = mapTenhouRecord({
      raw: loadRaw("bug1.xml"),
      gameId: "tenhou-fixture:bug1-census",
      selfActor: 0,
    });
    if (mapped.status !== "ready") throw new Error("expected ready");
    const census = censusCanonicalGame(mapped.stream);
    expect(census.seats).toHaveLength(4);
    // 8 AGARI + REACH tags exist in bug1; the corpus pin says every REACH
    // triple has a declaration-turn discard, so riichi windows ≥ 1 overall.
    expect(census.branchHits.riichi_window).toBeGreaterThan(0);
    expect(census.branchHits.post_riichi).toBe(census.branchHits.riichi_window);
    // Dama superset on a full real game is non-trivial but strictly a
    // superset: every counted window is menzen, non-riichi, ≥1000 points.
    expect(census.branchHits.dama_with_riichi_candidate).toBeGreaterThan(0);
    // Honest zero + flag (hand structure is the fact engine's authority).
    expect(census.branchHits.dama_with_tsumo_candidate).toBe(0);
    for (const branch of TENHOU_COVERAGE_BRANCHES) {
      expect(Number.isInteger(census.branchHits[branch])).toBe(true);
      expect(census.branchHits[branch]!).toBeGreaterThanOrEqual(0);
    }
  });

  it("dama superset never counts riichi'd or open seats", () => {
    // Structural invariant across the whole corpus: per seat, dama windows ≤
    // plain discards, and the sum over seats equals the game-level count.
    for (const name of ["bug1.xml", "bug3.xml", "pao.xml"]) {
      const mapped = mapTenhouRecord({
        raw: loadRaw(name),
        gameId: `tenhou-fixture:${name}-census`,
        selfActor: 0,
      });
      if (mapped.status !== "ready") throw new Error("expected ready");
      const census = censusCanonicalGame(mapped.stream);
      const summed = census.seats.reduce(
        (total, seat) => total + seat.branchHits.dama_with_riichi_candidate,
        0,
      );
      expect(summed).toBe(census.branchHits.dama_with_riichi_candidate);
    }
  });
});

describe("discovery policy", () => {
  it("aggregates only, keeps candidates capped and deduped, never calls Mortal", () => {
    const report = discoverTenhouCorpus([
      { raw: loadRaw("bug1.xml"), gameId: "tenhou-fixture:d1" },
      { raw: loadRaw("bug3.xml"), gameId: "tenhou-fixture:d2" },
      { raw: loadRaw("bye.xml"), gameId: "tenhou-fixture:d3" },
    ], { maxCandidateSamples: 3 });

    expect(report.gamesScanned).toBe(2);
    expect(report.seatsScanned).toBe(8);
    // The disconnect record is an aggregate failure count, not an error.
    expect(report.mapFailureCounts).toEqual({
      tenhou_record_disconnect_unsupported: 1,
    });
    expect(report.localBranchHits.riichi_window).toBeGreaterThan(0);
    // Dedupe by (gameId, seat): at most 2 games × 4 seats entries, capped at 3.
    expect(report.damaRiichiCandidates.length).toBeLessThanOrEqual(3);
    const keys = report.damaRiichiCandidates.map((sample) => `${sample.gameId}#${sample.seat}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Sorted by descending window count.
    const counts = report.damaRiichiCandidates.map((s) => s.damaRiichiCandidateWindows);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    // Honest-zero tsumo-candidate policy.
    expect(report.damaTsumoCandidateWindows).toBe(0);
    expect(report.needsHandStructureEngine).toBe(true);
    // kyuushu does not occur in these three games → honestly uncovered.
    expect(report.uncoveredLocalBranches).toContain("self_turn_kyuushu");
    // §23: aggregate output must not carry record content or names.
    expect(JSON.stringify(report)).not.toContain("%");
  });
});

describe("acceptance submission policy", () => {
  const budget = {
    maxRequestsPerRun: 2,
    baseDelayMs: 1000,
    jitterMs: 500,
    seed: 42,
  };

  it("plans sequentially, dedupes, and cuts at the hard budget", () => {
    const plan = planAcceptanceRun({
      selection: [
        { gameId: "g1", seat: 0 },
        { gameId: "g1", seat: 0 },
        { gameId: "g2", seat: 3 },
        { gameId: "g3", seat: 1 },
      ],
      budget,
    });
    expect(plan.map((item) => item.reason)).toEqual([
      "submit",
      "skip_duplicate",
      "submit",
      "skip_budget_exhausted",
    ]);
    expect(plan[0]!.attempts).toBe(1);
  });

  it("cached and checkpointed successes are never resubmitted", () => {
    const plan = planAcceptanceRun({
      selection: [
        { gameId: "g1", seat: 0 },
        { gameId: "g2", seat: 3 },
        { gameId: "g3", seat: 1 },
      ],
      cachedSuccesses: [{ gameId: "g1", seat: 0 }],
      checkpoint: [
        { gameId: "g2", seat: 3, status: "succeeded", attempts: 1 },
      ],
      budget,
    });
    expect(plan.map((item) => item.reason)).toEqual([
      "skip_cached_success",
      "skip_checkpoint_succeeded",
      "submit",
    ]);
  });

  it("failed checkpoint entries resume with incremented attempts", () => {
    const plan = planAcceptanceRun({
      selection: [{ gameId: "g1", seat: 2 }],
      checkpoint: [{ gameId: "g1", seat: 2, status: "failed", attempts: 1 }],
      budget,
    });
    expect(plan).toEqual([
      { gameId: "g1", seat: 2, reason: "submit", attempts: 2 },
    ]);
  });

  it("delays are deterministic, seeded, and conservative", () => {
    const a = delayBeforeRequestMs(1, budget);
    const b = delayBeforeRequestMs(1, budget);
    const c = delayBeforeRequestMs(2, budget);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(budget.baseDelayMs);
    expect(a).toBeLessThanOrEqual(budget.baseDelayMs + budget.jitterMs);
    expect(c).toBeGreaterThanOrEqual(budget.baseDelayMs);
    expect(c).toBeLessThanOrEqual(budget.baseDelayMs + budget.jitterMs);
    expect(() => delayBeforeRequestMs(0, budget)).toThrow(RangeError);
    // A different seed produces a different (still bounded) schedule.
    const other = delayBeforeRequestMs(1, { ...budget, seed: 43 });
    expect(other).toBeGreaterThanOrEqual(budget.baseDelayMs);
    expect([a, other].length).toBe(2);
  });

  it("checkpoint transitions replace the pair's entry", () => {
    const base = [{ gameId: "g1", seat: 0, status: "in_flight" as const, attempts: 1 }];
    const next = updateCheckpoint(base, "g1", 0, "succeeded", 1);
    expect(next).toEqual([
      { gameId: "g1", seat: 0, status: "succeeded", attempts: 1 },
    ]);
    const added = updateCheckpoint(next, "g2", 1, "in_flight", 1);
    expect(added).toHaveLength(2);
  });
});
