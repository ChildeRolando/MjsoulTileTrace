/**
 * M6-A4.3 — response-surface pure-event discovery census (source-agnostic).
 *
 * The A4 spec's discovery policy (ADR-0002 / A3 §14 prior art, extended):
 * chankan's pure-event scan starts EARLIEST because it is the only wave-1
 * branch without a degradation fallback, and the whole discovery pass is
 * zero-Mortal-cost: raw records in, concrete (game, seat, branch, locator)
 * candidates out, so the acceptance flow can pick submission pairs.
 *
 * Unlike the A3 structural census (which walks PUBLIC windows for all four
 * seats), the response surface's acceptance facts are ACTUAL-DRIVEN: a
 * resp_chi_actual etc. is proven by the reviewed player's explicit call or
 * win event in the canonical stream, so a pure event walk over one mapped
 * stream already names every seat's candidates — no per-seat private tiles,
 * no replay, no fact engine. Pass branches (resp_pass_on_discard /
 * resp_pass_on_kakan) are deliberately NOT enumerated here: a pass is the
 * absence of a call, which needs the per-seat candidate enumeration
 * (enumerateResponseCandidates) — that is the acceptance E2E's authority,
 * not a discovery guess. The discovery report therefore lists pass branches
 * as locally un-discoverable (uncoveredLocalBranches), exactly like the A3
 * census reports dama_with_tsumo_candidate zero until the private pass runs.
 *
 * Counting (degradation clause): qualifiedGameCount is decided by the CALLER
 * (the CLI), because qualification is per-source mapper-acceptance +
 * canonical replay success. This module aggregates only what the stream
 * itself proves — response actual hits and concrete candidates.
 *
 * §23 privacy: output carries opaque game ids, seats, branch names, and
 * canonical decision locators only — never raw record ids, log URLs, or
 * record bytes.
 */
import type { CanonicalEventStream } from "@riichi-coach/contracts";

/** The A4 response-surface discovery branches (actual-driven only). */
export const RESPONSE_SURFACE_DISCOVERY_BRANCHES = [
  "resp_chi_actual",
  "resp_pon_actual",
  "resp_daiminkan_actual",
  "resp_hora_actual",
  "resp_chankan_actual",
] as const;

export type ResponseSurfaceDiscoveryBranch =
  (typeof RESPONSE_SURFACE_DISCOVERY_BRANCHES)[number];

/** One concrete candidate: the window's trigger event (the discard/kan that
 *  opened the response), resolvable by the response replay. */
export interface ResponseSurfaceCandidate {
  readonly branch: ResponseSurfaceDiscoveryBranch;
  readonly gameId: string;
  readonly seat: number;
  /** Canonical event id of the response window's trigger event. */
  readonly decisionEventRef: string;
}

/** Per-branch hit counts across all seats of one scanned stream. */
export type ResponseSurfaceHits = Record<ResponseSurfaceDiscoveryBranch, number>;

export function zeroResponseSurfaceHits(): ResponseSurfaceHits {
  const hits = {} as ResponseSurfaceHits;
  for (const branch of RESPONSE_SURFACE_DISCOVERY_BRANCHES) hits[branch] = 0;
  return hits;
}

export interface ResponseSurfaceGameDiscovery {
  readonly gameId: string;
  readonly hits: ResponseSurfaceHits;
  readonly candidates: readonly ResponseSurfaceCandidate[];
}

export interface ResponseSurfaceCorpusDiscovery {
  /** Number of canonical streams aggregated (qualified counting is the
   *  caller's job — mapper + replay success). */
  readonly streamsScanned: number;
  /** All-stream summed per-branch actual hits (all seats). */
  readonly branchHits: ResponseSurfaceHits;
  /** Concrete candidates per branch, scan-ordered, capped per branch. */
  readonly branchCandidates: Readonly<
    Record<ResponseSurfaceDiscoveryBranch, readonly ResponseSurfaceCandidate[]>
  >;
  /** Discovery branches with zero concrete candidates in this corpus. */
  readonly uncoveredLocalBranches: readonly ResponseSurfaceDiscoveryBranch[];
}

export interface ResponseSurfaceDiscoveryOptions {
  /** Cap on retained candidate samples per branch. */
  readonly maxCandidateSamples?: number;
}

const DEFAULT_MAX_CANDIDATE_SAMPLES = 20;

function emptyBranchCandidates(): Record<
  ResponseSurfaceDiscoveryBranch,
  ResponseSurfaceCandidate[]
> {
  const candidates = {} as Record<ResponseSurfaceDiscoveryBranch, ResponseSurfaceCandidate[]>;
  for (const branch of RESPONSE_SURFACE_DISCOVERY_BRANCHES) candidates[branch] = [];
  return candidates;
}

/**
 * Walk ONE canonical stream's events (public only) and classify every
 * response-surface actual: explicit calls (chi/pon/daiminkan) name their
 * trigger discard directly; a ron win names its source event, so a kakan
 * source is a chankan and any other source is a discard-response hora. The
 * win source is resolved against the SAME stream (single pass, exact hits).
 */
export function discoverResponseSurfaceGame(
  stream: CanonicalEventStream,
): ResponseSurfaceGameDiscovery {
  const hits = zeroResponseSurfaceHits();
  const candidates: ResponseSurfaceCandidate[] = [];
  const events = stream.events;
  const record = (
    branch: ResponseSurfaceDiscoveryBranch,
    seat: number,
    decisionEventRef: string,
  ): void => {
    hits[branch] += 1;
    candidates.push({ branch, gameId: stream.gameId, seat, decisionEventRef });
  };

  for (const event of events) {
    switch (event.type) {
      case "chi_called": {
        record("resp_chi_actual", event.actor, event.calledDiscardEventRef);
        break;
      }
      case "pon_called": {
        record("resp_pon_actual", event.actor, event.calledDiscardEventRef);
        break;
      }
      case "daiminkan_called": {
        record("resp_daiminkan_actual", event.actor, event.calledDiscardEventRef);
        break;
      }
      case "win_declared": {
        if (event.method !== "ron" || event.targetActor === null) break;
        // Chankan = ron whose win source is the kakan that added the tile;
        // every other ron source is a discard-response win.
        const source = events.find((e) => e.eventId === event.winSourceEventRef);
        record(
          source?.type === "kakan_declared" ? "resp_chankan_actual" : "resp_hora_actual",
          event.winnerActor,
          event.winSourceEventRef,
        );
        break;
      }
      default:
        break;
    }
  }
  return { gameId: stream.gameId, hits, candidates };
}

/** Aggregate a corpus of already-mapped canonical streams (§23-safe). */
export function discoverResponseSurfaceCorpus(
  streams: readonly CanonicalEventStream[],
  options: ResponseSurfaceDiscoveryOptions = {},
): ResponseSurfaceCorpusDiscovery {
  const maxSamples = options.maxCandidateSamples ?? DEFAULT_MAX_CANDIDATE_SAMPLES;
  const branchHits = zeroResponseSurfaceHits();
  const allCandidates = emptyBranchCandidates();

  for (const stream of streams) {
    const game = discoverResponseSurfaceGame(stream);
    for (const branch of RESPONSE_SURFACE_DISCOVERY_BRANCHES) {
      branchHits[branch] += game.hits[branch]!;
    }
    for (const candidate of game.candidates) {
      allCandidates[candidate.branch].push(candidate);
    }
  }

  const branchCandidates = {} as Record<
    ResponseSurfaceDiscoveryBranch,
    readonly ResponseSurfaceCandidate[]
  >;
  for (const branch of RESPONSE_SURFACE_DISCOVERY_BRANCHES) {
    const seenKeys = new Set<string>();
    branchCandidates[branch] = allCandidates[branch]
      .filter((candidate) => {
        const key = candidateKey(candidate);
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      })
      .slice(0, maxSamples);
  }
  const uncoveredLocalBranches = RESPONSE_SURFACE_DISCOVERY_BRANCHES.filter(
    (branch) => branchCandidates[branch]!.length === 0,
  );
  return {
    streamsScanned: streams.length,
    branchHits,
    branchCandidates,
    uncoveredLocalBranches,
  };
}

function candidateKey(candidate: ResponseSurfaceCandidate): string {
  return `${candidate.gameId}#${candidate.seat}#${candidate.decisionEventRef}`;
}
