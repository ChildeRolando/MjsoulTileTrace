import { createHash } from "node:crypto";

/**
 * Artifact-only canonical JSON for this study harness.
 *
 * Every study digest (research subset, requests, candidates, exclusions,
 * schedule, prejudge, freeze) is computed over this serialization so the same
 * bytes always produce the same digest. It is deliberately NOT the Arena
 * `libriichiRuleCanonicalJson`: the retrieval digest that binds selector
 * verdicts belongs to the Arena owner (spec §4.2), not to this harness.
 */
export const SELF_RAG_STUDY_CANONICAL_JSON_VERSION = "selfrag-study-canonical-json/v1";

function canonicalValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("study_canonical_number_invalid");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item));
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined) continue;
      result[key] = canonicalValue(item);
    }
    return result;
  }
  throw new Error("study_canonical_value_invalid");
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(text, "utf8"));
}

export function digestOf(value) {
  return sha256Text(canonicalJson(value));
}
