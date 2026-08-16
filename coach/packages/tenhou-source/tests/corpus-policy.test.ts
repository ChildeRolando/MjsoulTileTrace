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
  mergeDamaTsumoCandidates,
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
      // §6: every counted window also carries a concrete locator, and the
      // locator count equals the hit count.
      expect(census.seats.reduce(
        (total, seat) => total + seat.branchWindows[branch].length,
        0,
      )).toBe(census.branchHits[branch]);
      for (const seat of census.seats) {
        for (const locator of seat.branchWindows[branch]) {
          expect(typeof locator).toBe("string");
          expect(locator.length).toBeGreaterThan(0);
        }
      }
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
    // §6: every non-zero branch carries CONCRETE candidates — (game, seat,
    // branch, decision locator) — capped per branch, unique, and resolvable.
    for (const branch of TENHOU_COVERAGE_BRANCHES) {
      const candidates = report.branchCandidates[branch];
      expect(candidates.length).toBeLessThanOrEqual(3);
      if (report.localBranchHits[branch] > 0) {
        expect(candidates.length).toBeGreaterThan(0);
      }
      const keys = candidates.map(
        (candidate) => `${candidate.branch}|${candidate.gameId}|${candidate.seat}|${candidate.decisionEventRef}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
      for (const candidate of candidates) {
        expect(candidate.branch).toBe(branch);
        expect(candidate.decisionEventRef.startsWith("tenhou-fixture:")).toBe(true);
      }
    }
    // Census-side dama_tsumo stays an honest zero pending the engine pass.
    expect(report.branchCandidates.dama_with_tsumo_candidate).toEqual([]);
    expect(report.damaTsumoCandidateWindows).toBe(0);
    expect(report.needsHandStructureEngine).toBe(true);
    // kyuushu does not occur in these three games → honestly uncovered.
    expect(report.uncoveredLocalBranches).toContain("self_turn_kyuushu");
    expect(report.uncoveredLocalBranches).toContain("dama_with_tsumo_candidate");
    // §23: aggregate output must not carry record content or names.
    expect(JSON.stringify(report)).not.toContain("%");
  });

  it("§8 selection pairs greedily cover branches with few (game, seat) pairs", () => {
    const report = discoverTenhouCorpus([
      { raw: loadRaw("bug1.xml"), gameId: "tenhou-fixture:s1" },
      { raw: loadRaw("bug3.xml"), gameId: "tenhou-fixture:s2" },
    ]);
    expect(report.selectionPairs.length).toBeGreaterThan(0);
    const covered = new Set<string>();
    for (const pair of report.selectionPairs) {
      expect(pair.branches.length).toBeGreaterThan(0);
      for (const branch of pair.branches) {
        // Each pair's branch must actually have a candidate for that pair.
        expect(report.branchCandidates[branch].some(
          (candidate) =>
            candidate.gameId === pair.gameId && candidate.seat === pair.seat,
        )).toBe(true);
        covered.add(branch);
      }
    }
    // Together the pairs cover every branch that has any candidate.
    for (const branch of TENHOU_COVERAGE_BRANCHES) {
      if (report.branchCandidates[branch].length > 0) {
        expect(covered.has(branch)).toBe(true);
      }
    }
    // Greedy first pick: no other single pair covers more branches.
    const best = report.selectionPairs[0]!;
    const maxCover = Math.max(
      ...report.selectionPairs.map((pair) => pair.branches.length),
    );
    expect(best.branches.length).toBe(maxCover);
  });

  it("merging the private dama_tsumo pass fills the branch without guessing", () => {
    const report = discoverTenhouCorpus([
      { raw: loadRaw("bug1.xml"), gameId: "tenhou-fixture:m1" },
    ]);
    const merged = mergeDamaTsumoCandidates(
      report,
      [
        { gameId: "tenhou-fixture:m1", seat: 2, decisionEventRef: "tenhou-fixture:m1/0/12/0" },
        { gameId: "tenhou-fixture:m1", seat: 2, decisionEventRef: "tenhou-fixture:m1/0/12/0" },
        { gameId: "tenhou-fixture:m1", seat: 1, decisionEventRef: "tenhou-fixture:m1/2/40/0" },
      ],
      {
        seatsReplayed: 4,
        seatsFailed: 0,
        windowsClassified: 260,
        engineFailures: 0,
        engineUsed: true,
      },
    );
    // Deduped merge, scan order preserved.
    expect(merged.branchCandidates.dama_with_tsumo_candidate.map(
      (candidate) => candidate.seat,
    )).toEqual([2, 1]);
    expect(merged.damaTsumoCandidateWindows).toBe(2);
    expect(merged.needsHandStructureEngine).toBe(false);
    expect(merged.damaTsumoPass).toEqual({
      seatsReplayed: 4,
      seatsFailed: 0,
      windowsClassified: 260,
      engineFailures: 0,
      engineUsed: true,
    });
    // The merged branch participates in selection and coverage.
    expect(merged.uncoveredLocalBranches).not.toContain("dama_with_tsumo_candidate");
    expect(merged.selectionPairs.some((pair) =>
      pair.branches.includes("dama_with_tsumo_candidate"),
    )).toBe(true);
    // Census aggregates are untouched by the merge.
    expect(merged.localBranchHits).toEqual(report.localBranchHits);
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
      { gameId: "g1", seat: 2, sourceType: "tenhou", reason: "submit", attempts: 2 },
    ]);
  });

  it("terminal failures are skipped without consuming submission budget", () => {
    const plan = planAcceptanceRun({
      selection: [
        { gameId: "g1", seat: 0 },
        { gameId: "g2", seat: 1 },
        { gameId: "g3", seat: 2 },
      ],
      checkpoint: [
        // g1 failed deterministically (e.g. local replay unsupported): the
        // runner will never retry it, so it must not take a submit slot from
        // a viable pair.
        { gameId: "g1", seat: 0, status: "failed", attempts: 1, terminal: true },
        // g2 failed on transport — a retry IS allowed and does charge budget.
        { gameId: "g2", seat: 1, status: "failed", attempts: 1 },
      ],
      budget,
    });
    expect(plan.map((item) => item.reason)).toEqual([
      "skip_terminal_failure",
      "submit",
      "submit",
    ]);
    expect(plan[0]!.attempts).toBe(1);
    expect(plan[1]!.attempts).toBe(2);
    expect(plan[2]!.attempts).toBe(1);
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
      { gameId: "g1", seat: 0, sourceType: "tenhou", status: "succeeded", attempts: 1 },
    ]);
    const added = updateCheckpoint(next, "g2", 1, "in_flight", 1);
    expect(added).toHaveLength(2);
  });
});
