import { replayCanonicalStream } from "@riichi-coach/reasoning";

import { mapMjaiRecord } from "../replay-corpus/canonical.mjs";

/**
 * Adapter entry for one real corpus record.
 *
 * Kept apart from `corpus-rules.mjs` so the rule-provenance logic stays free of
 * workspace packages and stays unit-testable without a build. A resolved rule
 * source is passed straight into the mapper; a null one maps exactly as before
 * (every rule unknown), which is what `rules_input_incomplete` used to hide.
 */
export function replayCorpusGame(input) {
  const { raw, gameId, ruleSource, selfActor } = input;
  const stream = ruleSource === null || ruleSource === undefined
    ? mapMjaiRecord(raw, gameId, selfActor)
    : mapMjaiRecord(raw, gameId, selfActor, ruleSource.rules);
  return { stream, decisions: replayCanonicalStream(stream) };
}
