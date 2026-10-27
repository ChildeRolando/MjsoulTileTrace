# Incident 2026-10-27 — duplicate production of already-passed chapters

Batch 2 produced `246-1` and `237-1`; batch 3 produced `183-1` and `131-1`. Three of those four
(`246-1`, `237-1`, `131-1`) were already covered: passed, merged into the active preview and
`covered-effective` in the unified register. Those three productions are withdrawn here. The
artifacts and receipts are **not** deleted or rewritten.

## What was already true before batch 2

| chapter | article | passed candidate | passed audit | first active preview | register |
| --- | --- | --- | --- | --- | --- |
| nemata-jp-chapter-246-1 | chapter06-section002 | `chapter06-section002.rev1.json` `bbf15bbd…` | `passed` 2026-10-27T05:26:32Z | `06-08` (206 chapters) | covered-effective |
| nemata-jp-chapter-237-1 | chapter04-section016 | `chapter04-section016.rev1.json` `d14aac65…` | `passed` 2026-10-27T02:29:26Z | `03-38` / `04-01` (201 chapters) | covered-effective |
| nemata-jp-chapter-131-1 | chapter01-section049 | `chapter01-section049.rev1.json` `20e84a64…` | `passed` 2026-10-27T03:07:42Z | `03-38` / `04-01` (201 chapters) | covered-effective |

## Root cause

Three defects stacked, any one of which would have stopped it:

1. **Selection source was the wrong one.** The candidate list came from the old needs-repair parent
   audits (`audit/web/articles/modern-yabejp-ja/<article>.<displaySha>.json`, status
   `needs-repair`), then sorted by canonical chapter id. Nothing in that path consulted the
   *active preview* `selectedWeb`/unit-map or the *unified register*. A chapter whose `.display.json`
   parent was still `needs-repair` looked repairable even when a later revision of the same
   original chapter had already passed and been selected. The needs-repair list is a snapshot of
   *candidates*, not of *original chapters*.
2. **The claim key could not see a different revision.** The atomic claim file is named
   `claim-<parentCandidateSha>.json` and records `chapterId` plus the parent SHA. Atomicity
   therefore only prevented two writers on the *same parent candidate*. A different revision of
   the same original chapter (`<article>.rev1.json`) has a different SHA and was never compared.
3. **The preflight's `no_existing_variant` test only looked at the ticket's own output name.** It
   ran `existsSync('<article>.coac269rev1.json')`. That file did not exist, so the check passed —
   while the already-passed `<article>.rev1.json` sat next to it unexamined. The check could only
   ever detect a rerun of the same ticket variant, never another revision of the same chapter.

## No net gain from the three calls

Comparing each withdrawn candidate with the passed candidate it duplicates:

- `131-1`: **body is JSON-identical** to `chapter01-section049.rev1.json`. Only provenance differs.
- `237-1`: one text block differs by cosmetics (`做出`→`作出`, `就足够了`→`就可以`).
- `246-1`: one text block re-words the fix the passed candidate already applied
  (`不足30秒的时间内走出`→`行棋时间必须少于30秒`; `中盘至终盘`→`中盘和残局阶段`).

## Surplus cost (measured, not estimated)

| chapter | call id | input | cached | output | duration |
| --- | --- | --- | --- | --- | --- |
| 246-1 | `5bef56bd-fac6-4730-a40a-0aaed5071888` | 13,182 | 0 | 380 | 70.1 s |
| 237-1 | `394ff5d0-31fb-4f82-b30e-47b0dce5c3a3` | 12,812 | 0 | 808 | 57.1 s |
| 131-1 | `c045a2dc-bbca-4e75-ae8f-97b1c4d5110a` | 11,751 | 0 | 136 | 26.8 s |
| **surplus** | 3 calls | **37,745** | **0** | **1,324** | **154.0 s** |

Total surplus: **39,069 tokens**. All three calls had zero cached input, so they were billed at full
input price. No independent-audit tokens were spent on the duplicates: no audit receipt exists for
any of the three new candidate SHAs (`832aaae0…`, `04a4f6f8…`, `40da07ac…`). The fourth call,
`183-1` (`35508223-36a6-4982-a382-aa5d6683c9a1`, 12,597 in / 500 out, 12,416 cached), is **not**
surplus and is not withdrawn.

## Disposition

`web-production/v1/coac269-20261027/handoff/withdrawal-b2-b3-duplicates-20261027.json`
(sha256 `30fcf11bebba0c64e421859e0e32ac995adcbfd4c2ebb8118cef42eec5f4048d`):

- `disposition: withdrawn-superseded-keep-artifacts` for the three chapters
- `doNotAudit: true` — do not send these candidate SHAs to COAC-249
- `doNotIngestTo250: true` — never hand them to COAC-250; the ingested drafts stay untouched
- `accounting: no artifact deleted, rewritten or overwritten`

`183-1` stays valid: not covered, no passed candidate, parent audit `needs-repair`, register
`produced-needs-repair`, and no audit receipt for `50831436…`, so it is neither passed nor in
flight.

## Fix (durable, mechanical)

- `coac269-joint-exclusion-precheck.mjs` — zero-call selection gate. A canonical original chapter id
  is ineligible if it appears in **any** of: the active preview `selectedWeb`/`selectedPdf`/
  formal replacements/legacy audits/supplements and unit-map (via
  `accepted-preview-current.json`), the latest unified register (`covered-effective`), or any
  per-chapter passed audit receipt whose `source.sourceSha256` still equals the current source SHA.
  The article↔canonical map comes from `integration/modern-production-scope-v3.json`
  (`pdfChapterIds`), so exclusion is by original chapter, not by file name.
- `coac269-preflight-b4.mjs` — the batch preflight now refuses any chapter that the joint gate marks
  covered, binds the claim to `chapterId + current candidateSHA`, and carries the incident chapters
  as a built-in regression block. `no_existing_variant` is kept only as a secondary guard.
- `coac269-joint-exclusion.test.mjs` — regression test that reproduces the defect on the old
  receipts (batch-2/3 preflights accepted `246-1`, `237-1`, `131-1`) and then verifies the new gate
  refuses all three, that no covered chapter is offered as eligible, that batch 4 is bound to the
  two eligible chapters, and that `183-1` is neither covered nor audited.

Results (all zero model calls):

- joint exclusion: `artifacts/joint-exclusion-6df4fae82fdfa6f3.json` — 150 scope chapters,
  135 covered by the union, 15 uncovered; incident controls pass; eligible repair targets: 11.
- regression test: `artifacts/joint-exclusion-test-abad57d007eb1609.json` — `ok: true`,
  `defectReproduced: true`, `fixVerified: true`.
- batch-4 preflight: `artifacts/preflight-b4-e963005f17b62aaf.json` — `ok: true`, modelCalls 0,
  chapters `142-1`, `127-1`.

## Next batch (staged, not started)

Descending canonical chapter id among chapters that are uncovered **and** satisfy the revision-entry
guard:

| chapter | article | parent | target | figures (faithful) | parent audit |
| --- | --- | --- | --- | --- | --- |
| nemata-jp-chapter-142-1 | chapter01-section054 | `264116a9…` | b0173 | 84 (all) | `needs-repair` 2026-10-25T23:05Z |
| nemata-jp-chapter-127-1 | chapter01-section047 | `0dcafc25…` | b0030 | 72 (all) | `needs-repair` 2026-10-25T22:04Z |

This corrects the previous plan's `100-1`/`060-1`: `100-1` has no non-faithful text target at all
and `060-1` has two targets, so neither fits the single-text-block revision entry. `347-1` is
skipped per instruction (its r1 parent has 0 figureChecks for 27 figures). The 248 reservations,
`236-1`, `283-1`, chapters without an audited parent (`250-1`) and the already-claimed `183-1`
remain excluded.

Claims for `142-1`/`127-1` are **not** created yet; they are created in the production run, keyed by
`chapterId + current candidateSHA`, after re-reading the active-preview pointer (a preview build
`accepted-content-preview-2026-10-27T10-38-35-579Z` was still in progress when the gate ran, so the
gate must be re-run, not reused, at claim time).
