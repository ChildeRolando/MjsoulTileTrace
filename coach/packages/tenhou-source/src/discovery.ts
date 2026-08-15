/**
 * §14 discovery corpus policy — pure aggregation over raw Tenhou records.
 *
 * Local-only: raw logs in, aggregate + selection metadata out. Mortal is
 * NEVER called here (the discovery runner exists to pick candidate paipu/seats
 * for acceptance, not to search for rare events at the model). No filesystem
 * and no network live in this module; CLIs compose the real inputs.
 *
 * §23 privacy: the report carries only counts, opaque game ids, seat indexes,
 * and branch names — never raw player names, log URLs, or raw record bytes.
 */
import { censusCanonicalGame, TENHOU_COVERAGE_BRANCHES, type TenhouCoverageBranch } from "./census.js";
import { mapTenhouRecord } from "./record-mapper.js";

export interface DiscoveryInput {
  /** Raw mjloggm document text. */
  readonly raw: string;
  /** Opaque canonical game id (never a raw Tenhou log id/URL). */
  readonly gameId: string;
}

export interface DiscoveryOptions {
  /**
   * Cap on retained (gameId, seat) candidate samples per source-dependent
   * branch. Selection metadata only; ordinals/counts, no record content.
   */
  readonly maxCandidateSamples?: number;
}

export interface DiscoveryCandidateSample {
  readonly gameId: string;
  readonly seat: number;
  readonly damaRiichiCandidateWindows: number;
}

export interface DiscoveryReport {
  readonly gamesScanned: number;
  readonly seatsScanned: number;
  /** Aggregate failure counts by mapper diagnostic code. */
  readonly mapFailureCounts: Readonly<Record<string, number>>;
  /** All-seat local branch hit counts across the scanned corpus. */
  readonly localBranchHits: Readonly<Record<TenhouCoverageBranch, number>>;
  /**
   * Source-dependent branch candidates: (gameId, seat) pairs whose local
   * windows make them relevant for dama_with_riichi_candidate acceptance.
   * Whether Mortal contains the candidate is decided in acceptance, never
   * here.
   */
  readonly damaRiichiCandidates: readonly DiscoveryCandidateSample[];
  /** Honest zero: hand structure is the fact engine's authority. */
  readonly damaTsumoCandidateWindows: 0;
  readonly needsHandStructureEngine: true;
  /** Local branches with zero hits across the whole scanned corpus. */
  readonly uncoveredLocalBranches: readonly TenhouCoverageBranch[];
}

const DEFAULT_MAX_CANDIDATE_SAMPLES = 20;

/** Aggregate a corpus of raw records into the §14 discovery report. */
export function discoverTenhouCorpus(
  inputs: readonly DiscoveryInput[],
  options: DiscoveryOptions = {},
): DiscoveryReport {
  const maxSamples = options.maxCandidateSamples ?? DEFAULT_MAX_CANDIDATE_SAMPLES;
  const localBranchHits = {} as Record<TenhouCoverageBranch, number>;
  for (const branch of TENHOU_COVERAGE_BRANCHES) localBranchHits[branch] = 0;
  const mapFailureCounts: Record<string, number> = {};

  const candidateWindowCounts = new Map<string, DiscoveryCandidateSample>();
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
    census.damaRiichiCandidateWindowsBySeat.forEach((windows, seat) => {
      if (windows <= 0) return;
      const key = `${input.gameId}#${seat}`;
      const existing = candidateWindowCounts.get(key);
      if (existing === undefined) {
        candidateWindowCounts.set(key, {
          gameId: input.gameId,
          seat,
          damaRiichiCandidateWindows: windows,
        });
      }
    });
  }

  const damaRiichiCandidates = [...candidateWindowCounts.values()]
    .sort((left, right) =>
      right.damaRiichiCandidateWindows - left.damaRiichiCandidateWindows ||
      (left.gameId < right.gameId ? -1 : left.gameId > right.gameId ? 1 : left.seat - right.seat)
    )
    .slice(0, maxSamples);

  const uncoveredLocalBranches = TENHOU_COVERAGE_BRANCHES.filter(
    (branch) => localBranchHits[branch] === 0,
  );

  return {
    gamesScanned,
    seatsScanned: gamesScanned * 4,
    mapFailureCounts,
    localBranchHits,
    damaRiichiCandidates,
    damaTsumoCandidateWindows: 0,
    needsHandStructureEngine: true,
    uncoveredLocalBranches,
  };
}
