import { createHash } from "node:crypto";
import type { LlmCoachSuccess } from "@riichi-coach/contracts";

// Main-process audit metadata only. The raw reflected bytes are replaced by a
// safe invalid draft; only their non-reversible digest crosses the provider
// boundary into report audit metadata.
export function redactCoachOutput(
  content: string,
  transportRetries: 0 | 1,
): LlmCoachSuccess {
  const outputHash = `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
  return Object.freeze({ content: "{}", outputHash, transportRetries });
}
