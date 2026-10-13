# COAC-3 package fixture

`coach-package.json` is an offline snapshot built with the existing reasoning
`tests/fixtures/structured-review.ts` canonical fixture and canned fact engine.
Its two model preferences are swapped: expected is the second (9m) candidate,
probabilities/Q values are 0.8/1 for expected and 0.2/0.1 for actual, with
`isEqual: false` and `actualIndex: 1`. `runFixtureReview` then
`buildStructuredAnalysisPackage` produce the snapshot using the existing frozen
clock and component versions. The desktop tests validate it with the production
`validateStructuredAnalysisPackage` before projection; the real selector selects
one disagreement. No real account, LLM, network or generated model text is used.

## Native request fixture mapper identity

`native-rule-responses-actor3.json` keeps the previously captured native rule
responses. The mapper v8 migration changes only their canonical stream identity:
the v8 stream with its mapper version replaced by v7 hashes to the original
`f02cf86512c91f6b4cde40d1359c71f8c248b0a5890873d9e330a89e044909fc`.
All source bytes, event prefixes, rule inputs and responses are unchanged. The
request binding test still compares every field of all twelve requests; this
identity migration is not a new native response capture.
