export const TILE_IDS = [
  "1m","2m","3m","4m","5m","6m","7m","8m","9m",
  "1p","2p","3p","4p","5p","6p","7p","8p","9p",
  "1s","2s","3s","4s","5s","6s","7s","8s","9s",
  "1z","2z","3z","4z","5z","6z","7z"
];

const TILE_INDEX = new Map(TILE_IDS.map((id, index) => [id, index]));

export function parseCompactHand(text) {
  if (typeof text !== "string") {
    throw new TypeError("hand must be a string");
  }
  const counts = Array(34).fill(0);
  let digits = "";
  for (const character of text.replace(/\s+/g, "")) {
    if (/[1-9]/.test(character)) {
      digits += character;
      continue;
    }
    if (!/[mpsz]/.test(character) || digits.length === 0) {
      throw new Error(`invalid compact hand near "${character}"`);
    }
    for (const digit of digits) {
      const number = Number(digit);
      if (character === "z" && number > 7) {
        throw new Error(`invalid honor tile ${digit}z`);
      }
      const id = `${digit}${character}`;
      const index = TILE_INDEX.get(id);
      counts[index] += 1;
      if (counts[index] > 4) {
        throw new Error(`more than four copies of ${id}`);
      }
    }
    digits = "";
  }
  if (digits.length > 0) {
    throw new Error("compact hand ends without a suit marker");
  }
  return counts;
}

function validateCounts(counts) {
  if (!Array.isArray(counts) || counts.length !== 34) {
    throw new TypeError("tile counts must be an array of length 34");
  }
  for (const count of counts) {
    if (!Number.isInteger(count) || count < 0 || count > 4) {
      throw new RangeError("every tile count must be an integer from 0 to 4");
    }
  }
}

export function standardShanten(inputCounts) {
  validateCounts(inputCounts);
  const counts = [...inputCounts];
  let minimum = 8;

  function search(start, mentsu, taatsu, pair) {
    while (start < 34 && counts[start] === 0) start += 1;
    if (start >= 34) {
      const usableTaatsu = Math.min(taatsu, 4 - mentsu);
      minimum = Math.min(minimum, 8 - (mentsu * 2) - usableTaatsu - pair);
      return;
    }

    const suitPosition = start % 9;
    const isSuited = start < 27;

    if (counts[start] >= 3) {
      counts[start] -= 3;
      search(start, mentsu + 1, taatsu, pair);
      counts[start] += 3;
    }

    if (isSuited && suitPosition <= 6 && counts[start + 1] > 0 && counts[start + 2] > 0) {
      counts[start] -= 1;
      counts[start + 1] -= 1;
      counts[start + 2] -= 1;
      search(start, mentsu + 1, taatsu, pair);
      counts[start] += 1;
      counts[start + 1] += 1;
      counts[start + 2] += 1;
    }

    if (counts[start] >= 2) {
      if (pair === 0) {
        counts[start] -= 2;
        search(start, mentsu, taatsu, 1);
        counts[start] += 2;
      }
      counts[start] -= 2;
      search(start, mentsu, taatsu + 1, pair);
      counts[start] += 2;
    }

    if (isSuited && suitPosition <= 7 && counts[start + 1] > 0) {
      counts[start] -= 1;
      counts[start + 1] -= 1;
      search(start, mentsu, taatsu + 1, pair);
      counts[start] += 1;
      counts[start + 1] += 1;
    }

    if (isSuited && suitPosition <= 6 && counts[start + 2] > 0) {
      counts[start] -= 1;
      counts[start + 2] -= 1;
      search(start, mentsu, taatsu + 1, pair);
      counts[start] += 1;
      counts[start + 2] += 1;
    }

    counts[start] -= 1;
    search(start, mentsu, taatsu, pair);
    counts[start] += 1;
  }

  search(0, 0, 0, 0);
  return minimum;
}

export function effectiveTiles(counts) {
  validateCounts(counts);
  const current = standardShanten(counts);
  const result = [];
  for (let index = 0; index < 34; index += 1) {
    if (counts[index] >= 4) continue;
    counts[index] += 1;
    const next = standardShanten(counts);
    counts[index] -= 1;
    if (next < current) {
      result.push({
        id: TILE_IDS[index],
        index,
        shanten: next,
        remaining: 4 - counts[index]
      });
    }
  }
  return result;
}

export function remainingCopies(id, handCounts, visibleCounts = Array(34).fill(0)) {
  validateCounts(handCounts);
  validateCounts(visibleCounts);
  const index = TILE_INDEX.get(id);
  if (index === undefined) {
    throw new Error(`unknown tile ${id}`);
  }
  return Math.max(0, 4 - handCounts[index] - visibleCounts[index]);
}

export function analyzeDiscards(handCounts, visibleCounts = Array(34).fill(0)) {
  validateCounts(handCounts);
  validateCounts(visibleCounts);
  const results = [];
  for (let discardIndex = 0; discardIndex < 34; discardIndex += 1) {
    if (handCounts[discardIndex] === 0) continue;
    const afterDiscard = [...handCounts];
    afterDiscard[discardIndex] -= 1;
    const knownVisible = [...visibleCounts];
    knownVisible[discardIndex] += 1;
    const shanten = standardShanten(afterDiscard);
    const effective = effectiveTiles(afterDiscard).map((tile) => ({
      ...tile,
      remaining: remainingCopies(tile.id, afterDiscard, knownVisible)
    }));
    const ukeire = effective.reduce((sum, tile) => sum + tile.remaining, 0);
    results.push({
      discard: TILE_IDS[discardIndex],
      discardIndex,
      shanten,
      ukeire,
      effective
    });
  }
  results.sort((left, right) =>
    left.shanten - right.shanten ||
    right.ukeire - left.ukeire ||
    left.discardIndex - right.discardIndex
  );
  return results;
}
