/**
 * Pure winning-shape check over a 34-kind tile count vector.
 *
 * Purpose: a conservative PREFILTER in front of the hand-structure fact
 * engine. The equivalence it relies on (see dama-tsumo-discovery): a 13-tile
 * hand is tenpai waiting on tile X  <=>  hand + X is a complete winning hand.
 * A window whose 14-tile holding has no winning shape can therefore never be
 * promoted by the engine, and can be skipped without an engine roundtrip.
 *
 * Fail-safe direction: PERMISSIVE, never strict. The checker accepts a shape
 * whenever any standard form, chiitoitsu, or kokushi decomposition exists,
 * and chiitoitsu is deliberately loose (any all-even counts, so a four-of-a-
 * kind read as two pairs still reaches the engine). A false "complete" only
 * costs one extra engine call; a false "incomplete" would silently drop a
 * real candidate, so the decomposition search is exhaustive.
 */

const ORPHAN_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

function canFormSets(counts: number[], startIndex: number, setsNeeded: number): boolean {
  let index = startIndex;
  while (index < 34 && counts[index] === 0) index += 1;
  if (index >= 34) return setsNeeded === 0;
  if (setsNeeded === 0) return false;
  if (counts[index]! >= 3) {
    counts[index] = counts[index]! - 3;
    const done = canFormSets(counts, index, setsNeeded - 1);
    counts[index] = counts[index]! + 3;
    if (done) return true;
  }
  // Runs exist only inside a suit, never across its 9-kind boundary and
  // never in honors (kinds 27..33).
  if (
    index < 27
    && index % 9 <= 6
    && counts[index + 1]! > 0
    && counts[index + 2]! > 0
  ) {
    counts[index] = counts[index]! - 1;
    counts[index + 1] = counts[index + 1]! - 1;
    counts[index + 2] = counts[index + 2]! - 1;
    const done = canFormSets(counts, index, setsNeeded - 1);
    counts[index] = counts[index]! + 1;
    counts[index + 1] = counts[index + 1]! + 1;
    counts[index + 2] = counts[index + 2]! + 1;
    if (done) return true;
  }
  return false;
}

export function isCompleteHandShape(counts34: readonly number[]): boolean {
  if (counts34.length !== 34) return false;
  let total = 0;
  for (const count of counts34) {
    if (!Number.isInteger(count) || count < 0 || count > 4) return false;
    total += count;
  }
  if (total !== 14) return false;

  // Kokushi musou: exactly the 13 orphan kinds — twelve singles plus one
  // pair (a tripled orphan is NOT kokushi and must not pass here).
  let orphansPresent = 0;
  let doubledOrphans = 0;
  for (const kind of ORPHAN_KINDS) {
    const count = counts34[kind]!;
    if (count === 1) orphansPresent += 1;
    else if (count === 2) {
      orphansPresent += 1;
      doubledOrphans += 1;
    }
  }
  if (orphansPresent === 13 && doubledOrphans === 1) return true;

  // Chiitoitsu, deliberately loose: every kind count even (7 distinct pairs
  // AND the illegal four-of-a-kind-as-two-pairs both pass; the engine rules).
  if (counts34.every((count) => count % 2 === 0)) return true;

  // Standard form: every pair choice + an exhaustive decomposition of the
  // remaining 12 kinds into 4 sets (triplets / runs).
  const counts = [...counts34];
  for (let pair = 0; pair < 34; pair += 1) {
    if (counts[pair]! < 2) continue;
    counts[pair] = counts[pair]! - 2;
    const done = canFormSets(counts, 0, 4);
    counts[pair] = counts[pair]! + 2;
    if (done) return true;
  }
  return false;
}
