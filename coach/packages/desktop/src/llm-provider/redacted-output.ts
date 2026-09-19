import { createHash } from "node:crypto";
import type { LlmCoachResult, LlmCoachSuccess } from "@riichi-coach/contracts";

// Main-process audit metadata only. Neither the frozen provider DTO nor any
// renderer payload gains a field. The weak association is per completion,
// stores no raw content, and cannot mix concurrent requests or retain results.
const hashes = new WeakMap<LlmCoachResult, string>();

export function redactCoachOutput(content: string): LlmCoachSuccess {
  const outputHash = `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
  const result = Object.freeze({ content: "{}" });
  hashes.set(result, outputHash);
  return result;
}

export function redactedOutputHash(result: LlmCoachResult): string | undefined {
  return hashes.get(result);
}
