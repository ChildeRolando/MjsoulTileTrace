import type { Tile } from "@riichi-coach/contracts";
import { tileIdTo34 } from "../factors/tile34.js";
import { isCompleteHandShapeWithSets } from "../factors/win-shape.js";

/**
 * M6-A4.1 response window eligibility — pure local checks, engine-free.
 *
 * A response window (discard_response / kan_response) is a decision point for
 * the reviewed player when they hold at least one LEGAL non-pass response
 * candidate on the offered tile (Mortal entry semantics: a row exists at
 * legal-candidate >= 2, i.e. non-pass >= 1, counting `none` as one candidate).
 * These helpers decide that from canonical events + the local hand alone —
 * never from any Mortal source marker (开窗权威分离).
 *
 * Fail-safe direction: PERMISSIVE. A false "eligible" only opens one extra
 * window that A4.2 classifies as single-candidate (source_row_not_expected);
 * a false "ineligible" would silently drop a real decision point (source row
 * present but local window missing → conservation failure). Ron eligibility is
 * therefore win-shape-only (no yaku / furiten refinement) — those constraints
 * are A4.2's isomorphic enumeration; over-approximation here is safe.
 */

/** Draw-order seat distance from the source actor to a responder. */
export function seatDistance(from: number, to: number): number {
  return (to - from + 4) % 4;
}

function countId(concealed: readonly Tile[], offered: Tile): number {
  // Red fives are the same rank tile for meld formation (the canonical pon
  // validation compares by id only) — count by id, ignoring red.
  let count = 0;
  for (const tile of concealed) {
    if (tile.id === offered.id) count += 1;
  }
  return count;
}

/** Chi: the offered tile is a suited number completing a run with 2 concealed tiles. */
export function canChi(concealed: readonly Tile[], offered: Tile): boolean {
  if (offered.id.endsWith("z")) return false;
  const suit = offered.id[1]!;
  const rank = Number(offered.id[0]);
  const counts = new Map<string, number>();
  for (const tile of concealed) {
    counts.set(tile.id, (counts.get(tile.id) ?? 0) + 1);
  }
  const completions: ReadonlyArray<readonly [number, number]> = [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ];
  for (const [low, high] of completions) {
    if (low < 1 || high > 9) continue;
    if ((counts.get(`${low}${suit}`) ?? 0) >= 1 &&
      (counts.get(`${high}${suit}`) ?? 0) >= 1) {
      return true;
    }
  }
  return false;
}

/** Pon: the offered tile completes a pair from the concealed hand. */
export function canPon(concealed: readonly Tile[], offered: Tile): boolean {
  return countId(concealed, offered) >= 2;
}

/** Daiminkan: the offered tile completes a concealed triplet. */
export function canDaiminkan(
  concealed: readonly Tile[],
  offered: Tile,
): boolean {
  return countId(concealed, offered) >= 3;
}

/**
 * Ron: (concealed + offered) is a complete winning shape given the number of
 * exposed melds. Win-shape only — furiten / yaku legality is A4.2's
 * isomorphic enumeration; over-approximation is safe (extra windows classify
 * as source_row_not_expected), under-approximation is not.
 */
export function canRon(
  concealed: readonly Tile[],
  meldCount: number,
  offered: Tile,
): boolean {
  const counts = Array<number>(34).fill(0);
  for (const tile of concealed) {
    counts[tileIdTo34(tile.id)] = counts[tileIdTo34(tile.id)]! + 1;
  }
  counts[tileIdTo34(offered.id)] = counts[tileIdTo34(offered.id)]! + 1;
  return isCompleteHandShapeWithSets(counts, 4 - meldCount);
}
