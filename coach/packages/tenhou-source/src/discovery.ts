/**
 * §14 discovery corpus policy — pure aggregation over raw Tenhou records.
 *
 * Local-only: raw logs in, per-branch concrete candidates out. Mortal is
 * NEVER called here (the discovery runner exists to pick candidate paipu/seats
 * for acceptance, not to search for rare events at the model). No filesystem
 * and no network live in this module; CLIs compose the real inputs.
 *
 * §6 (closing round): discovery must be able to name a CONCRETE candidate —
 * (opaque game id, seat, branch, local decision locator) — for every locally
 * discoverable branch, not just aggregate hit counts. The census supplies
 * those locators for the eight structural branches and the dama_with_riichi
 * superset; dama_with_tsumo_candidate needs the seat's private tiles plus
 * the hand-structure fact engine, so it stays empty here and is filled by
 * merging the private pass (see mergeDamaTsumoCandidates) — never guessed.
 *
 * §23 privacy: the report carries only counts, opaque game ids, seat indexes,
 * branch names, and canonical decision locators (game id + position) — never
 * raw player names, log URLs, or raw record bytes.
 */
import {
  censusCanonicalGame,
  TENHOU_COVERAGE_BRANCHES,
  type BranchWindowLocators,
  type TenhouCoverageBranch,
} from "./census.js";
import { mapTenhouRecord } from "./record-mapper.js";

export interface DiscoveryInput {
  /** Raw mjloggm document text. */
  readonly raw: string;
  /** Opaque canonical game id (never a raw Tenhou log id/URL). */
  readonly gameId: string;
}

export interface DiscoveryOptions {
  /**
   * Cap on retained candidate samples per branch, and on selection pairs.
   * Selection metadata only; locators/counts, no record content.
   */
  readonly maxCandidateSamples?: number;
}

/** §6 concrete candidate: one local decision window, resolvable by replay. */
export interface DiscoveryBranchCandidate {
  readonly branch: TenhouCoverageBranch;
  readonly gameId: string;
  readonly seat: number;
  /**
   * Canonical event id of the window's trigger event — the decisionEventRef
   * the replay layer (and the acceptance runner) freezes for this window.
   */
  readonly decisionEventRef: string;
}

/** §8 selection unit: one (game, seat) pair may evidence several branches. */
export interface DiscoverySelectionPair {
  readonly gameId: string;
  readonly seat: number;
  readonly branches: readonly TenhouCoverageBranch[];
}

/** Stats from the private dama_with_tsumo pass (replay + fact engine). */
export interface DamaTsumoPassStats {
  /** (game, seat) pairs that reached replay classification. */
  readonly seatsReplayed: number;
  /** (game, seat) pairs whose per-seat mapping failed. */
  readonly seatsFailed: number;
  /** Windows the hand-structure engine classified (complete or not). */
  readonly windowsClassified: number;
  /** Windows skipped fail-closed because the engine errored. */
  readonly engineFailures: number;
  /** Marker so consumers can tell a classified report from a census-only one. */
  readonly engineUsed: true;
}

export interface DiscoveryReport {
  readonly gamesScanned: number;
  readonly seatsScanned: number;
  /** Aggregate failure counts by mapper diagnostic code. */
  readonly mapFailureCounts: Readonly<Record<string, number>>;
  /** All-seat local branch hit counts across the scanned corpus. */
  readonly localBranchHits: Readonly<Record<TenhouCoverageBranch, number>>;
  /**
   * §6 concrete candidates per branch: (branch, gameId, seat, locator),
   * deduped, scan-ordered, capped at maxCandidateSamples per branch.
   */
  readonly branchCandidates: Readonly<Record<TenhouCoverageBranch, readonly DiscoveryBranchCandidate[]>>;
  /**
   * §8 greedy minimal cover: (gameId, seat) pairs sorted so each pair adds
   * the most branches — one Mortal report per pair, never one per branch.
   */
  readonly selectionPairs: readonly DiscoverySelectionPair[];
  /** Classified dama_with_tsumo windows — 0 until the private pass merges. */
  readonly damaTsumoCandidateWindows: number;
  /** The per-branch candidate cap this report was built with. */
  readonly maxCandidateSamples: number;
  /** True until mergeDamaTsumoCandidates has run (hand structure is the fact engine's authority). */
  readonly needsHandStructureEngine: boolean;
  /** Private-pass stats once that pass has merged its candidates. */
  readonly damaTsumoPass?: DamaTsumoPassStats;
  /** Local branches with zero concrete candidates in this report. */
  readonly uncoveredLocalBranches: readonly TenhouCoverageBranch[];
}

const DEFAULT_MAX_CANDIDATE_SAMPLES = 20;

function emptyBranchCandidates(): Record<TenhouCoverageBranch, DiscoveryBranchCandidate[]> {
  const candidates = {} as Record<TenhouCoverageBranch, DiscoveryBranchCandidate[]>;
  for (const branch of TENHOU_COVERAGE_BRANCHES) candidates[branch] = [];
  return candidates;
}

function candidateKey(candidate: DiscoveryBranchCandidate): string {
  return `${candidate.gameId}#${candidate.seat}#${candidate.decisionEventRef}`;
}

/**
 * Greedy set cover over (gameId, seat) pairs: repeatedly pick the pair that
 * covers the most still-uncovered branches (tie-break: more total branches,
 * then game id, then seat — all deterministic). Minimizes Mortal reports for
 * a requested branch set (§8): one accepted report per pair can evidence
 * every branch that pair covers.
 */
function selectMinimalPairs(
  candidates: Readonly<Record<TenhouCoverageBranch, readonly DiscoveryBranchCandidate[]>>,
  cap: number,
): DiscoverySelectionPair[] {
  const pairBranches = new Map<
    string,
    { gameId: string; seat: number; branches: Set<TenhouCoverageBranch> }
  >();
  for (const branch of TENHOU_COVERAGE_BRANCHES) {
    for (const candidate of candidates[branch]) {
      const key = `${candidate.gameId}#${candidate.seat}`;
      let entry = pairBranches.get(key);
      if (entry === undefined) {
        entry = { gameId: candidate.gameId, seat: candidate.seat, branches: new Set() };
        pairBranches.set(key, entry);
      }
      entry.branches.add(branch);
    }
  }
  const remaining = [...pairBranches.values()];
  const covered = new Set<TenhouCoverageBranch>();
  const selected: DiscoverySelectionPair[] = [];
  while (covered.size < TENHOU_COVERAGE_BRANCHES.length && selected.length < cap) {
    let bestIndex = -1;
    let bestGain = 0;
    for (let index = 0; index < remaining.length; index += 1) {
      const entry = remaining[index]!;
      let gain = 0;
      for (const branch of entry.branches) {
        if (!covered.has(branch)) gain += 1;
      }
      if (gain === 0) continue;
      const incumbent = bestIndex >= 0 ? remaining[bestIndex]! : null;
      const better = incumbent === null ||
        gain > bestGain ||
        (gain === bestGain &&
          (entry.branches.size > incumbent.branches.size ||
            (entry.branches.size === incumbent.branches.size &&
              (entry.gameId < incumbent.gameId ||
                (entry.gameId === incumbent.gameId &&
                  entry.seat < incumbent.seat)))));
      if (better) {
        bestGain = gain;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    const best = remaining[bestIndex]!;
    remaining.splice(bestIndex, 1);
    for (const branch of best.branches) covered.add(branch);
    selected.push({
      gameId: best.gameId,
      seat: best.seat,
      branches: TENHOU_COVERAGE_BRANCHES.filter((branch) => best.branches.has(branch)),
    });
  }
  return selected;
}

function buildReport(
  gamesScanned: number,
  mapFailureCounts: Record<string, number>,
  localBranchHits: Record<TenhouCoverageBranch, number>,
  allCandidates: Record<TenhouCoverageBranch, DiscoveryBranchCandidate[]>,
  maxSamples: number,
  damaTsumo: { windows: number; merged: boolean; stats?: DamaTsumoPassStats },
): DiscoveryReport {
  const branchCandidates = {} as Record<
    TenhouCoverageBranch,
    readonly DiscoveryBranchCandidate[]
  >;
  for (const branch of TENHOU_COVERAGE_BRANCHES) {
    const seen = new Set<string>();
    branchCandidates[branch] = allCandidates[branch]
      .filter((candidate) => {
        const key = candidateKey(candidate);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, maxSamples);
  }
  const uncoveredLocalBranches = TENHOU_COVERAGE_BRANCHES.filter(
    (branch) => branchCandidates[branch]!.length === 0,
  );
  return {
    gamesScanned,
    seatsScanned: gamesScanned * 4,
    mapFailureCounts,
    localBranchHits,
    branchCandidates,
    selectionPairs: selectMinimalPairs(branchCandidates, maxSamples),
    damaTsumoCandidateWindows: damaTsumo.windows,
    maxCandidateSamples: maxSamples,
    needsHandStructureEngine: !damaTsumo.merged,
    ...(damaTsumo.stats === undefined ? {} : { damaTsumoPass: damaTsumo.stats }),
    uncoveredLocalBranches,
  };
}

/** Aggregate a corpus of raw records into the §14 discovery report. */
export function discoverTenhouCorpus(
  inputs: readonly DiscoveryInput[],
  options: DiscoveryOptions = {},
): DiscoveryReport {
  const maxSamples = options.maxCandidateSamples ?? DEFAULT_MAX_CANDIDATE_SAMPLES;
  const localBranchHits = {} as Record<TenhouCoverageBranch, number>;
  for (const branch of TENHOU_COVERAGE_BRANCHES) localBranchHits[branch] = 0;
  const mapFailureCounts: Record<string, number> = {};
  const allCandidates = emptyBranchCandidates();

  let gamesScanned = 0;
  for (const input of inputs) {
    const mapped = mapTenhouRecord({ raw: input.raw, gameId: input.gameId, selfActor: 0 });
    if (mapped.status !== "ready") {
      mapFailureCounts[mapped.code] = (mapFailureCounts[mapped.code] ?? 0) + 1;
      continue;
    }
    gamesScanned += 1;
    const census = censusCanonicalGame(mapped.stream);
    for (const branch of TENHOU_COVERAGE_BRANCHES) {
      localBranchHits[branch] += census.branchHits[branch]!;
    }
    for (const seatCensus of census.seats) {
      const windows: BranchWindowLocators = seatCensus.branchWindows;
      for (const branch of TENHOU_COVERAGE_BRANCHES) {
        for (const locator of windows[branch]) {
          allCandidates[branch].push({
            branch,
            gameId: input.gameId,
            seat: seatCensus.seat,
            decisionEventRef: locator,
          });
        }
      }
    }
  }

  return buildReport(
    gamesScanned,
    mapFailureCounts,
    localBranchHits,
    allCandidates,
    maxSamples,
    { windows: 0, merged: false },
  );
}

/**
 * Merge the private-pass dama_with_tsumo candidates (replay + hand-structure
 * engine verdicts) into a census-only report. The census cannot see private
 * tiles, so the branch stays empty until this merge — the zero is never
 * guessed into existence, and after the merge the report stops claiming
 * needsHandStructureEngine.
 */
export function mergeDamaTsumoCandidates(
  report: DiscoveryReport,
  candidates: readonly {
    gameId: string;
    seat: number;
    decisionEventRef: string;
  }[],
  stats: DamaTsumoPassStats,
): DiscoveryReport {
  const allCandidates = emptyBranchCandidates();
  for (const branch of TENHOU_COVERAGE_BRANCHES) {
    allCandidates[branch] = [...report.branchCandidates[branch]];
  }
  const seen = new Set(
    allCandidates.dama_with_tsumo_candidate.map(candidateKey),
  );
  for (const candidate of candidates) {
    const full = { branch: "dama_with_tsumo_candidate" as const, ...candidate };
    const key = candidateKey(full);
    if (seen.has(key)) continue;
    seen.add(key);
    allCandidates.dama_with_tsumo_candidate.push(full);
  }
  return buildReport(
    report.gamesScanned,
    { ...report.mapFailureCounts },
    { ...report.localBranchHits },
    allCandidates,
    report.maxCandidateSamples,
    {
      windows: Math.min(
        allCandidates.dama_with_tsumo_candidate.length,
        report.maxCandidateSamples,
      ),
      merged: true,
      stats,
    },
  );
}
