export type LegacyEffectiveTile = {
  id: string;
  remaining: number;
};

export type LegacyDiscardAnalysis = {
  discard: string;
  shanten: number;
  ukeire: number;
  effective: LegacyEffectiveTile[];
};

export function parseCompactHand(compact: string): number[];
export function analyzeDiscards(counts: number[]): LegacyDiscardAnalysis[];
