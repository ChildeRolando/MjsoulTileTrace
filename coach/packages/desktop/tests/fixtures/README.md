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
