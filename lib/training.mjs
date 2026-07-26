import { parseCompactHand, TILE_IDS } from "./mahjong.mjs";

const SUITS = ["m","p","s"];
const SUIT_PERMUTATIONS = [
  [0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]
];

function countsToCompact(counts) {
  let compact = "";
  for (let suitIndex = 0; suitIndex < 3; suitIndex += 1) {
    let digits = "";
    for (let numberIndex = 0; numberIndex < 9; numberIndex += 1) {
      const count = counts[(suitIndex * 9) + numberIndex];
      digits += String(numberIndex + 1).repeat(count);
    }
    if (digits) compact += `${digits}${SUITS[suitIndex]}`;
  }
  let honors = "";
  for (let honorIndex = 0; honorIndex < 7; honorIndex += 1) {
    honors += String(honorIndex + 1).repeat(counts[27 + honorIndex]);
  }
  if (honors) compact += `${honors}z`;
  return compact;
}

function transformCounts(source, permutation, mirrored) {
  const target = Array(34).fill(0);
  for (let sourceSuit = 0; sourceSuit < 3; sourceSuit += 1) {
    const targetSuit = permutation[sourceSuit];
    for (let sourceNumber = 0; sourceNumber < 9; sourceNumber += 1) {
      const targetNumber = mirrored ? 8 - sourceNumber : sourceNumber;
      target[(targetSuit * 9) + targetNumber] = source[(sourceSuit * 9) + sourceNumber];
    }
  }
  for (let honor = 0; honor < 7; honor += 1) target[27 + honor] = source[27 + honor];
  return target;
}

export function generateTrainingVariants(baseHands) {
  const variants = [];
  const sources = baseHands.map((compact) => parseCompactHand(compact));
  SUIT_PERMUTATIONS.forEach((permutation, permutationIndex) => {
    for (const mirrored of [false,true]) {
      sources.forEach((source, baseIndex) => {
        const counts = transformCounts(source,permutation,mirrored);
        variants.push({
          baseIndex,
          permutationIndex,
          mirrored,
          counts,
          compact: countsToCompact(counts),
          ids: counts.flatMap((count,index) => Array(count).fill(TILE_IDS[index]))
        });
      });
    }
  });
  return variants;
}

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left,right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeMastery(attempts) {
  const recent100 = attempts.slice(-100);
  const recent50 = attempts.slice(-50);
  const accuracy = recent100.length === 0
    ? 0
    : recent100.filter((attempt) => attempt.correct).length / recent100.length;
  const medianMs = median(recent50.map((attempt) => attempt.elapsedMs));
  let currentStreak = 0;
  for (let index = attempts.length - 1; index >= 0 && attempts[index].correct; index -= 1) currentStreak += 1;
  const errors = {};
  for (const attempt of recent100) {
    if (!attempt.correct) {
      const reason = attempt.reason || "direct";
      errors[reason] = (errors[reason] || 0) + 1;
    }
  }
  return {
    attempts: attempts.length,
    last100Count: recent100.length,
    last100Accuracy: accuracy,
    last50Count: recent50.length,
    last50MedianMs: medianMs,
    currentStreak,
    errors,
    graduated: attempts.length >= 100 && accuracy >= 0.9 && medianMs !== null && medianMs <= 5000
  };
}
