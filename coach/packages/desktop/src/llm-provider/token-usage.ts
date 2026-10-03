import { LlmTokenUsageSchema, type LlmTokenUsage } from "@riichi-coach/contracts";

/** Adapters map their wire names to these counters. Other layers only consume
 * this provider-independent contract. Invalid or absent counters stay unknown. */
export function normalizeTokenUsage(value: {
  inputTokens?: unknown; cachedInputTokens?: unknown; outputTokens?: unknown; totalTokens?: unknown;
}, deriveTotal = false): LlmTokenUsage | undefined {
  const usage: LlmTokenUsage = {};
  for (const name of ["inputTokens", "cachedInputTokens", "outputTokens", "totalTokens"] as const) {
    const counter = value[name];
    if (typeof counter === "number" && Number.isSafeInteger(counter) && counter >= 0) usage[name] = counter;
  }
  if (usage.cachedInputTokens !== undefined && usage.inputTokens !== undefined && usage.cachedInputTokens > usage.inputTokens) delete usage.cachedInputTokens;
  if (deriveTotal && usage.inputTokens !== undefined && usage.outputTokens !== undefined) {
    const total = usage.inputTokens + usage.outputTokens;
    if (Number.isSafeInteger(total)) usage.totalTokens = total;
  }
  return Object.keys(usage).length === 0 ? undefined : LlmTokenUsageSchema.parse(usage);
}

/** Sum only received counters from outer attempts, not estimated usage of
 * unreported attempts. Display labels must retain that qualification. */
export function combineReportedTokenUsage(first: LlmTokenUsage | undefined, second: LlmTokenUsage | undefined): LlmTokenUsage | undefined {
  if (first === undefined) return second;
  if (second === undefined) return first;
  const values: Record<string, number> = {};
  for (const name of ["inputTokens", "cachedInputTokens", "outputTokens", "totalTokens"] as const) {
    if (first[name] === undefined && second[name] === undefined) continue;
    const sum = (first[name] ?? 0) + (second[name] ?? 0);
    if (Number.isSafeInteger(sum)) values[name] = sum;
  }
  return normalizeTokenUsage(values);
}
