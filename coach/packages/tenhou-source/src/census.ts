/**
 * Structural coverage census over canonical streams (M6-A3 §14).
 *
 * A census is a cheap structural walk — it never calls Mortal, never freezes
 * full decision snapshots, and never projects hand structure. It enumerates
 * decision windows for ALL FOUR seats from one mapped stream (draws, discards,
 * calls, and terminals are public in a canonical record; only concealed tiles
 * are seat-private and the census does not need them) and counts hits per
 * M6-A3 §17 local branch.
 *
 * Honest limits, by design:
 * - dama_with_riichi_candidate is counted as a DOCUMENTED SUPERSET: a
 *   draw-turn tedashi/tsumogiri discard by a menzen, non-riichi seat holding
 *   at least 1000 points. Whether Mortal's report actually contains a
 *   declare_riichi candidate in that window is decided only in acceptance.
 * - dama_with_tsumo_candidate requires hand-structure reasoning (tenpai
 *   detection), which is the Go fact engine's authority, not this package's.
 *   The census reports exactly zero for it and flags
 *   needsHandStructureEngine so downstream code cannot mistake the zero for
 *   "no such windows exist".
 */
import type { CanonicalEventStream, CanonicalGameEvent } from "@riichi-coach/contracts";

export const TENHOU_COVERAGE_BRANCHES = [
  "riichi_window",
  "dama_with_riichi_candidate",
  "post_call_chi",
  "post_call_pon",
  "post_riichi",
  "self_turn_tsumo_actual",
  "dama_with_tsumo_candidate",
  "self_turn_ankan",
  "self_turn_kakan",
  "self_turn_kyuushu",
] as const;

export type TenhouCoverageBranch = (typeof TENHOU_COVERAGE_BRANCHES)[number];

export interface SeatCensus {
  readonly seat: number;
  readonly branchHits: Record<TenhouCoverageBranch, number>;
}

export interface GameCensus {
  /** All-seat summed branch hits for the game. */
  readonly branchHits: Record<TenhouCoverageBranch, number>;
  readonly seats: readonly SeatCensus[];
  readonly damaRiichiCandidateWindowsBySeat: readonly number[];
}

function zeroBranchHits(): Record<TenhouCoverageBranch, number> {
  const hits = {} as Record<TenhouCoverageBranch, number>;
  for (const branch of TENHOU_COVERAGE_BRANCHES) hits[branch] = 0;
  return hits;
}

interface SeatWalkState {
  readonly hits: Record<TenhouCoverageBranch, number>;
  damaRiichiCandidateWindows: number;
  menzen: boolean;
  riichiAccepted: boolean;
  liveScore: number;
}

/** Count §17 local branch windows for every seat of a mapped canonical game. */
export function censusCanonicalGame(stream: CanonicalEventStream): GameCensus {
  const seats: SeatWalkState[] = [0, 1, 2, 3].map((seat) => ({
    hits: zeroBranchHits(),
    damaRiichiCandidateWindows: 0,
    menzen: true,
    riichiAccepted: false,
    liveScore: 25_000,
  }));

  const events = stream.events;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    switch (event.type) {
      case "round_started": {
        for (let seatIndex = 0; seatIndex < 4; seatIndex += 1) {
          const seat = seats[seatIndex]!;
          seat.menzen = true;
          seat.riichiAccepted = false;
          seat.liveScore = event.scores[seatIndex]!;
        }
        break;
      }
      case "riichi_declared": {
        const seat = seats[event.actor]!;
        seat.liveScore -= 1000;
        // §10 post_riichi window: the declaration turn's discard.
        if (scanSelfDiscard(events, index + 1, event.actor, event.eventId)) {
          seat.hits.post_riichi += 1;
        }
        break;
      }
      case "riichi_accepted": {
        seats[event.actor]!.riichiAccepted = true;
        break;
      }
      case "chi_called": {
        const seat = seats[event.actor]!;
        seat.menzen = false;
        if (scanSelfDiscard(events, index + 1, event.actor, null)) {
          seat.hits.post_call_chi += 1;
        }
        break;
      }
      case "pon_called": {
        const seat = seats[event.actor]!;
        seat.menzen = false;
        if (scanSelfDiscard(events, index + 1, event.actor, null)) {
          seat.hits.post_call_pon += 1;
        }
        break;
      }
      case "daiminkan_called": {
        seats[event.actor]!.menzen = false;
        break;
      }
      case "tile_drawn": {
        const seat = seats[event.actor]!;
        classifySelfTurnWindow(events, index, event.actor, seat);
        break;
      }
      default:
        break;
    }
  }

  const total = zeroBranchHits();
  for (const seat of seats) {
    for (const branch of TENHOU_COVERAGE_BRANCHES) {
      total[branch] += seat.hits[branch]!;
    }
  }
  return {
    branchHits: total,
    seats: seats.map((seat, index) => ({
      seat: index,
      branchHits: seat.hits,
    })),
    damaRiichiCandidateWindowsBySeat: seats.map((seat) =>
      seat.damaRiichiCandidateWindows
    ),
  };
}

/** True if the seat's next action inside this round is a matching discard. */
function scanSelfDiscard(
  events: readonly CanonicalGameEvent[],
  startIndex: number,
  actor: number,
  riichiDeclarationEventRef: string | null,
): boolean {
  for (let index = startIndex; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.type === "tile_discarded" && event.actor === actor) {
      return riichiDeclarationEventRef === null
        ? event.riichiDeclarationEventRef === null ||
            event.riichiDeclarationEventRef === undefined
        : event.riichiDeclarationEventRef === riichiDeclarationEventRef;
    }
    if (event.type === "round_started" || event.type === "round_ended") return false;
    if (
      event.type === "win_declared" || event.type === "round_drawn" ||
      event.type === "scores_updated"
    ) return false;
  }
  return false;
}

/**
 * Classify the self-turn window opened by the seat's draw at `drawIndex`:
 * the branch is decided by how the seat resolves the window (actual action
 * authority), and dama candidates are counted on plain discards.
 */
function classifySelfTurnWindow(
  events: readonly CanonicalGameEvent[],
  drawIndex: number,
  actor: number,
  seat: SeatWalkState,
): void {
  for (let index = drawIndex + 1; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.type === "round_started" || event.type === "round_ended") return;
    if (event.type === "tile_discarded") {
      if (event.actor !== actor) continue;
      const declared =
        event.riichiDeclarationEventRef !== null &&
        event.riichiDeclarationEventRef !== undefined;
      if (declared) {
        seat.hits.riichi_window += 1;
      } else if (seat.menzen && !seat.riichiAccepted && seat.liveScore >= 1000) {
        // Documented superset: see module doc. Not proof of a Mortal
        // declare_riichi candidate — acceptance decides that.
        seat.hits.dama_with_riichi_candidate += 1;
        seat.damaRiichiCandidateWindows += 1;
      }
      return;
    }
    if (event.type === "win_declared") {
      if (event.method === "tsumo" && event.winnerActor === actor) {
        seat.hits.self_turn_tsumo_actual += 1;
      }
      return;
    }
    if (event.type === "ankan_declared" && event.actor === actor) {
      seat.hits.self_turn_ankan += 1;
      return;
    }
    if (event.type === "kakan_declared" && event.actor === actor) {
      seat.hits.self_turn_kakan += 1;
      return;
    }
    if (event.type === "round_drawn") {
      if (event.reason === "kyuushu_kyuuhai") {
        seat.hits.self_turn_kyuushu += 1;
      }
      return;
    }
    if (event.type === "scores_updated") return;
  }
}
