import { canonicalJson, digestOf, studyError } from "./canonical.mjs";

/**
 * Real corpus rule provenance for the study adapter.
 *
 * The public-replay corpus stores MJAI variants without rule-set fields, so the
 * mapper would otherwise mark every rule unknown and libriichi refuses the
 * request (`rules_input_incomplete`). The only accepted evidence is the Tenhou
 * GO locator of a `nikke-tenhou` observation on the exact variant hash, the
 * same profile the product `tenhou-source` importer uses. Rules the locator
 * does not carry (`westExtension`, `ippatsuCancelledByAnkan`) stay unknown;
 * nothing here fills in a standard profile from common knowledge.
 */
export const SELF_RAG_STUDY_CORPUS_RULES_VERSION = "tenhou-go-locator-rules/v1";
export const SELF_RAG_STUDY_RULE_SOURCE = "nikke-tenhou";

const TENHOU_GO_LOCATOR = /\d{10}gm-([0-9a-f]{4})-/u;

/** Tenhou GO locator bitfield → rule set (四麻/东南, 赤牌, 食断). */
export function tenhouGoRules(locator) {
  if (typeof locator !== "string" || locator.length === 0) throw studyError("rule_source_locator_unparseable", "locator");
  const match = TENHOU_GO_LOCATOR.exec(locator);
  if (match === null) throw studyError("rule_source_locator_unparseable", "locator");
  const bits = Number.parseInt(match[1], 16);
  if ((bits & 16) !== 0) throw studyError("rule_source_three_player", match[1]);
  if ((bits & 1) === 0) throw studyError("rule_source_not_four_player", match[1]);
  if ((bits & 8) === 0) throw studyError("rule_source_not_south", match[1]);
  const red = (bits & 2) === 0 ? 1 : 0;
  return {
    length: "south",
    redFives: { man: red, pin: red, sou: red },
    openTanyao: (bits & 4) === 0,
    atamahane: false,
    westExtension: "unknown",
    ippatsuCancelledByAnkan: "unknown",
  };
}

function ruleSourceDigest(ruleSource) {
  return digestOf({
    version: SELF_RAG_STUDY_CORPUS_RULES_VERSION,
    source: SELF_RAG_STUDY_RULE_SOURCE,
    locator: ruleSource.locator,
    rules: ruleSource.rules,
  });
}

/**
 * Resolve one corpus variant to the rules its own observations prove.
 *
 * Returns `status: "ok"` with the frozen rule source, or `status: "excluded"`
 * with a stable reason so the caller can record why the game never reached the
 * mapper. Never invents rules for a variant without decodable evidence, and
 * refuses evidence that disagrees with itself.
 */
export function resolveCorpusGameRules(input) {
  const format = input?.format;
  if (format !== "mjai") return { status: "excluded", reason: "format_unsupported", detail: String(format) };
  if (!Array.isArray(input?.observations)) throw studyError("study_input_invalid", "observations");

  const decodable = [];
  let undecodable = null;
  for (const observation of input.observations) {
    if (observation?.source !== SELF_RAG_STUDY_RULE_SOURCE) continue;
    try {
      decodable.push({ locator: observation.locator, rules: tenhouGoRules(observation.locator) });
    } catch (error) {
      if (undecodable === null && typeof error?.message === "string") {
        undecodable = { reason: error.message, detail: observation.locator };
      }
    }
  }
  if (decodable.length === 0) {
    return undecodable === null
      ? { status: "excluded", reason: "rule_source_missing", detail: SELF_RAG_STUDY_RULE_SOURCE }
      : { status: "excluded", reason: undecodable.reason, detail: undecodable.detail };
  }

  // Observations for one hash must agree; conflicting rule evidence is refused
  // rather than resolved by picking the first row.
  const profiles = new Map(decodable.map((entry) => [canonicalJson(entry.rules), entry]));
  if (profiles.size > 1) {
    return {
      status: "excluded",
      reason: "rule_source_conflict",
      detail: decodable.map((entry) => entry.locator).join("|"),
    };
  }
  const observed = [...profiles.values()][0];
  const ruleSource = {
    version: SELF_RAG_STUDY_CORPUS_RULES_VERSION,
    source: SELF_RAG_STUDY_RULE_SOURCE,
    locator: observed.locator,
    rules: observed.rules,
  };
  return { status: "ok", ruleSource: { ...ruleSource, digest: ruleSourceDigest(ruleSource) } };
}

/** Recompute a frozen rule source; any drift from its locator invalidates it. */
export function verifyFrozenRuleSource(ruleSource) {
  if (ruleSource === null || typeof ruleSource !== "object" || Array.isArray(ruleSource)) {
    throw studyError("verify_rule_source_mismatch", "ruleSource");
  }
  if (ruleSource.version !== SELF_RAG_STUDY_CORPUS_RULES_VERSION || ruleSource.source !== SELF_RAG_STUDY_RULE_SOURCE) {
    throw studyError("verify_rule_source_mismatch", "identity");
  }
  let recomputed;
  try {
    recomputed = tenhouGoRules(ruleSource.locator);
  } catch (error) {
    throw studyError("verify_rule_source_mismatch", error?.message ?? "locator");
  }
  if (canonicalJson(recomputed) !== canonicalJson(ruleSource.rules)) {
    throw studyError("verify_rule_source_mismatch", "rules");
  }
  if (ruleSource.digest !== ruleSourceDigest(ruleSource)) throw studyError("verify_rule_source_mismatch", "digest");
  return ruleSource;
}
