# Record title metadata handoff

## Scope and locality

This change adds presentation-only Mahjong Soul room/grade metadata and saved Mortal agreement statistics to catalog and saved-review titles. The metadata stays in `RecordLabel` and catalog summaries; it does not enter analysis support decisions, coach prompts, or game facts.

Catalog sync projects the already fetched `RecordGame` detail. It does not add an RPC or load analysis archives while rendering the catalog. Historical saved-review statistics are read from package artifacts on `coach-service-worker`'s Node Worker, then persisted in the small `review_session_labels` sidecar.

## Evidence and display rules

- Room labels use `GameMetaData.mode_id`; `GameMode.mode` is game length and is not used as a room identifier. The isolated, versioned resolver maps sourced mode IDs and displays “段位房间未知” for unknown IDs. It retains the numeric ID in metadata for audit, not in the user title.
- One detail response supplies `GameEndResult.players[*].grading_score` by seat and `accounts[*].level.id` / `level3.id`. `total_point` and `RecordPlayerResult.pt` are not treated as rank points. Missing grading-score wire fields stay unknown; omitted seat zero remains valid.
- Rank units use the same response's player-count-specific level ID and ranked mode. Ordinary rank IDs and the pre-pearl Soul IDs display `pt`; post-pearl Soul IDs display `魂珠` with raw values divided by 100. Unrecognized or incomplete evidence displays “段位变化单位未知”.
- Room and rank ID mappings follow the majsoul-api reverse-engineered source tables, read 2026-10-06: [牌譜を読むにゃ](https://wikiwiki.jp/majsoul-api/%E7%89%8C%E8%AD%9C%E3%82%92%E8%AA%AD%E3%82%80%E3%81%AB%E3%82%83) and [定数一覧にゃ](https://wikiwiki.jp/majsoul-api/%E5%AE%9A%E6%95%B0%E4%B8%80%E8%A6%A7%E3%81%AB%E3%82%83). Mapping versions are stored next to their resolvers.
- Mortal's denominator includes only validated `analysis_ready` Mortal evaluations with at least two distinct candidates and a valid `scoredActualModelActionRef` among them. Unscored and single-candidate decisions are excluded. A decision agrees when the scored actual model action is in Mortal's preferred set; ties count. Coach preferences are never read. Catalog titles use the newest matching saved session by `updatedAt`; a conflicting newest-time tie is unavailable, and a newest pending result stays pending.

## Identity and recovery

Catalog metrics bind only when the archive's streamed record identity is canonical `majsoul:<recordId>` and `selfActor` matches the catalog seat. Legacy raw-ID sidecars are preserved and canonicalized only after that archive check. Generic/raw-ID packages and wrong-seat packages cannot bind to catalog rows.

The streaming reader validates package identity, schema, and content hash while projecting only record identity and the fields needed for agreement. Missing or corrupt labels are persisted as pending, queued for the Worker, then replaced with ready or unavailable. Renderer polling refreshes the label list without resetting its page.

Canonical recovery applies to old nonterminal labels. A verified generic package whose ID happens to match a catalog UUID remains generic, and its ready/unavailable statistics remain terminal; repeated polling must not restart a full package scan solely because that UUID also exists in the catalog.

Saved-label refresh is optional enrichment: its failure cannot turn a successful catalog sync into a catalog failure. Background refresh may redraw the catalog only after a catalog response has been loaded, so it cannot clear an existing visible cache while catalog sync is failing. Both behaviors have renderer/native Electron regressions.

## Verification

Focused regressions cover agreement arithmetic, metadata unit/mode maps, codec field presence, catalog projection, saved-label recovery, latest-session selection, tie conflicts, page-preserving polling, and identity/seat mismatches. The real Worker tests cover missing, corrupt, and legacy raw-ID sidecars. Root owns final build and full gate results; do not treat this handoff as a substitute for those gates.

## Recovery

All title data is optional local presentation metadata. If mapping or package validation fails, the UI keeps the saved review and reports unknown/unavailable. The feature can be rolled back by removing the label projections and resolvers; it does not alter stored analysis packages or require model re-analysis.
