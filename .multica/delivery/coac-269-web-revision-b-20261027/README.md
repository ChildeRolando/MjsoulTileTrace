# COAC-269 — B line: ordinary-web targeted revisions

Ticket-local evidence bundle for the Multica ticket `COAC-269` (line B of the parallel editing split
authorised 2026-10-27T09:23Z). Shared code, the unified register, selection and pointers were not modified.

## Scope

- Line A (COAC-248) kept its in-flight and reserved chapters: 198/187/199/201, 215-4, 236, 283, PDF/metadata.
- Line B selected from the current `produced-needs-repair` ordinary-web chapters in
  `integration/coac250-unified-chapter-register-20261027b.json`, canonical chapterId descending,
  requiring an existing revision entry and a real parent `needs-repair` audit.
- Excluded in addition: terminal-passed chapters (174-1, 187-1, 198-1 at claim time), reserved numbers,
  metadata/cover rows, and `nemata-jp-chapter-347-1` whose parent audit has no `figureChecks`
  (the current revision guard rejects all 27 non-target figures).

## Chapters and results

| chapter | article | parent candidate SHA | parent audit SHA | target blocks | candidate SHA |
| --- | --- | --- | --- | --- | --- |
| nemata-jp-chapter-338-1 | archive01-section006 | 04ab76405f88fa1df61d68c2047cf3cb344b8db8644f193c520fee805b83c427 | 6d41a520affd04f57c515e02d37ef58746e88794149f385d701a9814c0be5597 | b0518 | ff5a9b524d8e10c62f97011bde7f6a5a837f58e8557230ca60c67581b426f782 |
| nemata-jp-chapter-273-1 | chapter06-exercise002-02 | c57c30e4ffddb9ea661295364ee46739438c2c17a4f4c772e5df0b8391c7576b | 3aa7dc1d73dbcf0caa710ca8a46799f69178435113c289ab53a8c4f44d9dd270 | b0263, b0545 | 42991d764c900c46cba313848cc1c5138789c60079e6a988d4f6df5e09da330e |

Candidates live in the data root (not duplicated here):
`web-production/v1/candidates/modern-yabejp-ja/<article>.coac269rev1.json`.

- 338-1: `b0518` 「場の安さ高さ」 no longer rendered as 牌的疏密; the block now states the
  cheap/expensive board evaluation and keeps the pointer to the reading section.
- 273-1: `b0263` comparison object added; `b0545` 「七対シャンテン」 rendered as 七对子一向听.
  The independent reviewer should re-judge `b0263`: the produced wording is 「立直与本方案相比…」,
  not the prior audit's suggested 「与切[3m]」 construction; the prior audit is a locator, not truth.

## Calls (actual, no retries)

- Model `gpt-6.1-sol`, effort `high`; frozen runner `4a5ce8ab…`, CLI `3da98f5f…`, audit `8660208d…`
  (full `scripts/scene-study` snapshot copied into the ticket namespace before dispatch).
- 338-1: call `7b9806f0-3aed-4175-b454-b60a81abcd91`, 12,333 in / 315 out, 57.5 s,
  raw `raw-calls/7b9806f0-….json` SHA `338e534912caa6266cf01a6ed5fe86484eaba06a8ad7d6157fec2ab584a3d63b`.
- 273-1: call `2529e8f3-0b02-4c6c-ab05-3d24deaddb79`, 12,369 in / 813 out, 94.4 s,
  raw `raw-calls/2529e8f3-….json` SHA `5a41124fa320c736712ed6bd0b85585a730be5f379e46e03f2e8ce7a34d45444`.
- The first launcher attempt made **0** model calls (missing transitive import in a partial frozen copy);
  it is retained as `production-attempt0-rejected-frozen-runtime-incomplete.json`.
- Both calls were dispatched only after acquiring the existing single maker lane lock
  (`production-lane.lock`), wait 0 s, released on completion. No dual slot was invented, no lock deleted
  or bypassed, and no second maker call ran during the production windows — real concurrency stayed at 1 maker.

## Verification

- Zero-call preflight: source/parent/audit/dependency SHAs, target projection, faithful block and figure
  checks, dictionary coverage, no existing variant (`artifacts/preflight.json`).
- Deterministic self-check after production (not the independent audit): only the target text blocks differ,
  all other text blocks and all figures are byte-identical to the parent apart from render-only
  `presentationAsset`, flow order unchanged, raw artifact SHAs re-verified (`artifacts/selfcheck.json`).
- Independent first audit is **pending** with COAC-249 (`artifacts/handoff-249.json`). Nothing is claimed
  as passed. After 249 passes a candidate, COAC-250 is the single writer for integration.
- **Update 2026-10-27T10:02Z**: COAC-249 independently audited both candidates and returned `passed`
  (338-1 audit `74b93630…` at 10:01:45Z; 273-1 audit `0553be30…` at 10:02:55Z). Both are handed to
  COAC-250 as `artifacts/b2-intake-250-batch1.json`; 250 remains the only integration writer.

## Namespace

Data artifacts: `E:/AgentData/Coach/knowledge/processing/web-production/v1/coac269-20261027/`
(`claims/`, `preflight/`, `receipts/`, `handoff/`, `frozen-runtime/`). This bundle copies the receipts and
scripts only; candidate and raw payloads stay in the data root referenced by SHA.

## Batch 2 — verified dual-slot entry (2026-10-27T10:06–10:11Z)

Batch 1 did not wait for its audit before the next mutually exclusive batch. The COAC-244 dual-slot
mechanism was checked first, then used.

### Dual-slot entry check

- `parallel/slots.mjs` (SHA `360298d7302fa17972f2460b93717ff274047624d80a7bef0bc7862c196bb077`) plus
  `parallel/CONTRACT.md` and `parallel/verification-20261027.json`:
  15/15 verified cases (concurrent race yields at most 2 live slots, third refused `maker_slot_limit_reached`,
  same-lane re-entry refused, foreign release refused, normal-exit release, stale-slot recovery only with
  dead-owner evidence, live owner cannot be recovered, claim single-owner, A skips B's claim).
- Fixed owners: A `COAC-248 Mika`, B `COAC-269 Ticket executor`; max 2 maker slots.
- **Integration with the legacy lock**: `slots.mjs` has zero references to `production-lane.lock`. The legacy
  file is untouched by this batch — SHA `5feceb66…` (one byte `30`), mtime 2026-10-25T15:40:57Z, identical
  before and after. Under the COAC-244 contract B's capacity record is the `maker-B` slot; the old lock is
  neither deleted, rewritten nor released. No filesystem lock was deleted or bypassed.
- B acquired `maker-B` at 2026-10-27T10:08:42.306Z (pid-based, owner-exact) and released it at
  10:10:49.848Z; `status` afterwards shows 0 live maker slots. Evidence:
  `artifacts/b2-dual-slot-entry-check.json`.

### Chapters and results

| chapter | article | parent candidate SHA | parent audit SHA | target blocks | candidate SHA |
| --- | --- | --- | --- | --- | --- |
| nemata-jp-chapter-246-1 | chapter06-section002 | eb4caf1b93fc906a5a7286419009256337e9f886ce82123091931c8c5e5c4fc4 | 53f38a52975a3a4545ff4c405f981127e706aaef104fe1b173505d84a4d22dab | b0070 | 832aaae0860ab8792778355b0259469f30d633336ac84cc142ffbb9546a938c4 |
| nemata-jp-chapter-237-1 | chapter04-section016 | 5c4048adf1b398f2a202dbdd0a1485cdaa539ad2ad4fd80e053dd0f2db17a959 | 26e737619dfca6c940aeac348645802e2feebb240a6d38a2d917e4ef5b1fc41c | b0002 | 04a4f6f881b10f9f18c55132e9c771214d877235267bc5f3b5daec2c2eb05295 |

- Selection: same descending rule, after the batch-1 chapters. 347-1 (r1 parent audit has 0 `figureChecks`
  and 38 unchecked non-target text blocks), 319-1 and 335-1 (already terminal-passed) and the chapters whose
  parent targets are not single text blocks (232-1, 224-1, 213-1, 193-1) were skipped and recorded in the
  preflight. 248's reservations, metadata/PDF and already claimed chapters were excluded.
- 246-1 `b0070`: the 30-second rule after the 15-minute base time is stated as 每步的行棋时间必须少于30秒;
  the tail is 中盘和残局阶段.
- 237-1 `b0002`: the emphasis is now `*若供托或积棒较多，就重视和牌率*`, keeping the
  “积棒多且对手已抢得先手则重视避免放铳” branch.

### Calls and concurrency (actual)

- Model `gpt-6.1-sol`, effort `high`; frozen runner `4a5ce8ab…`, CLI `3da98f5f…` (same frozen snapshot).
- 246-1: call `5bef56bd-fac6-4730-a40a-0aaed5071888`, 13,182 in / 380 out, 70.1 s, raw SHA `07b18610…`.
- 237-1: call `394ff5d0-31fb-4f82-b30e-47b0dce5c3a3`, 12,812 in / 808 out, 57.1 s, raw SHA `21069d01…`.
- One production call per chapter, 0 retries, both `success=true`. Budget: 2 production calls allowed,
  2 used.
- **Real overlap: 0.** The two production calls ran 10:08:42–10:09:52Z and 10:09:52–10:10:49Z (sequential on
  the single B maker slot). COAC-249's audits of batch 1 ran 10:01–10:04Z, before this window, and no A-line
  production call ran inside it. Real maker concurrency therefore stayed at 1 for this batch; the second slot
  was available and used by B, but no two model calls overlapped. This is measured from call
  `startedAt`+`durationMs`, not from agents being runnable.

### Verification

- Zero-call preflight passed (`artifacts/b2-preflight.json`): source/parent/audit/dependency SHAs, target
  projection, faithful non-target text and all figures, dictionary coverage (0 unbound images), no existing
  variant, no STOP file, no live maker-B slot.
- Deterministic self-check passed (`artifacts/b2-selfcheck.json`): only the target text block changed in each
  chapter; all other text blocks, flow order and figures are identical to the parent (apart from render-only
  `presentationAsset`); raw artifact SHAs re-verified.
- Handoff to COAC-249: `artifacts/b2-explicit-targets-249.json` (driver-compatible explicit targets) and
  `artifacts/b2-handoff-249.json`. Independent verdict is pending; self-check is not a pass.

## Batch 3 — next mutually exclusive batch on the same maker-B entry (2026-10-27T10:17–10:19Z)

Started immediately after batch 2 was handed off, without waiting for its audit.

| chapter | article | parent candidate SHA | parent audit SHA | target blocks | candidate SHA |
| --- | --- | --- | --- | --- | --- |
| nemata-jp-chapter-183-1 | chapter03-section003 | 889adf0d0f694bc09475a5c35d83d758493e94af90c3e389dfdebfa5bf205b02 | c66a9bab86228f8f865d1f74b1c2d033de57f133892f87e2205480a09628373a | b0018 | 5083143622906fd318dfd9847c1a446f59deb78ff613a31adb44dd81df299ccd |
| nemata-jp-chapter-131-1 | chapter01-section049 | 470217d79cd1acd28f234a1e691d4d950ae99d0c0463e6bd0211561c95de28ac | 8875bb9c2dec37ce1ca1dcc36edc24d7a04ec489ffe604d9dd610e04b77ba552 | b0123 | 40da07ac8cac2acd378963d8e297d28be52d894d31b35712c1ce9f87c4995096 |

- Selection continued the descending rule after 237-1: 232-1/224-1/213-1/193-1 still fail the single-target
  guard, 347-1 still lacks figure coverage, and 248 reservations, passed chapters and claimed chapters stay
  excluded.
- 183-1 `b0018`: 能看到1张 → 可见1张; the motivation clause is now 牌手会受到客风牌单骑更容易争取荣和这一想法的影响.
- 131-1 `b0123`: 失去七对子的可能性也不太令人介意 → 七对子方面的损失也不太令人介意.
- Calls: `35508223-36a6-4982-a382-aa5d6683c9a1` (61.5 s, 12,597 in / 500 out) and
  `c045a2dc-bbca-4e75-ae8f-97b1c4d5110a` (26.8 s, 11,751 in / 136 out), one per chapter, 0 retries.
- B held `maker-B` 10:17:06.929Z–10:18:35.570Z and released it; the legacy lock is again byte-identical.
- Real model-call overlap in this batch: **1 production/audit pair × 2 calls.** An audit-ledger call
  `95502be0-996e-40be-bcec-1d37e4dbb695` ran 10:17:25.809Z–10:21:46.721Z and overlapped the 183-1
  production call by 42.7 s and the 131-1 production call by 26.8 s. Its artifact was written after the
  production receipt snapshot, so the receipt itself listed none; the corrected measurement is in
  `artifacts/b3-concurrency-observation.json` and `artifacts/b3-dual-slot-entry-check.json`.
  No A-line production call ran inside the window, so maker-vs-maker concurrency stayed 1.
- Preflight, claims, production, self-check and 249 handoff receipts: `artifacts/b3-*.json`.

## Incident 2026-10-27 — duplicate production withdrawn

`246-1`, `237-1` and `131-1` in batches 2 and 3 were already passed, merged into the active preview
and `covered-effective` in the unified register. Those three productions are withdrawn (artifacts kept,
not erased); `183-1` remains valid. Root cause, measured surplus (39,069 tokens), the canonical
joint-exclusion gate, the regression test and the staged next batch (`142-1`, `127-1`) are documented
in `INCIDENT-20261027-duplicate-production.md`.

## Batch 5 — 2026-10-27 after the duplicate-production correction

Executed on the member's explicit resume instruction (comment `01a17d04-0b7e-71d4-b962-d36a2ae49981`):
two fixable chapters, one production call plus one first-audit quota each, no guessing on undecided
source, and no report-first stall.

| chapter | article | parent candidate SHA | target | candidate SHA | production call | in / out | duration |
| --- | --- | --- | --- | --- | --- | --- | --- |
| nemata-jp-chapter-142-1 | chapter01-section054 | `264116a9…` | b0173 | `f3570e7bbe61e0ef99e45a2f4185ed3f0c1fe1840f670783c7fd2402352dedca` | `1e6b913f-714d-4417-8ca4-d46915d06a2c` | 11,894 / 419 | 50.1 s |
| nemata-jp-chapter-127-1 | chapter01-section047 | `0dcafc25…` | b0030 | `363fd45cc99f099cfbaec296a1102af0d6dd5519596af707697c21154280c86d` | `154b724a-171f-48ab-85c9-270b82c22579` | 11,966 / 293 | 45.1 s |

- **Selection was re-derived, not reused.** The three-source joint exclusion ran four times:
  `11:02:10` (initial), `11:03:38` (the active-preview pointer had moved to
  `accepted-content-preview-2026-10-27T10-38-35-579Z` at `11:03:12`, and the claim gate refused the
  stale pointer — see `b5-joint-exclusion-11-03-38-r2-after-pointer-move.json`), `11:05:38` (after the
  gate defect below was fixed), and `11:05:54` immediately before dispatch. The `10:38` preflight was
  never reused: `coac269-preflight-b5.mjs` hard-fails a joint receipt older than 900 s, one that
  predates the active pointer, or one computed against a different pointer/register sha.
- **Gate defect found and fixed before any call.** The first pre-dispatch run
  (`11:04:32`, `b5-joint-exclusion-11-04-32-refused-by-self-claim.json`) aborted with zero model calls
  because the joint exclusion treated the ticket's *own* claim as a competing claim and dropped both
  chapters. The claim rule is now explicit: another owner's claim blocks, this line's own claim is the
  reservation. A ticket-level denylist was added at the same time: a chapter with a pending-adjudication
  or withdrawn-duplicate record can never become an eligible repair target again.
- **Claims** are keyed `chapterId + current candidate SHA` (`claim-b5-…`, `b5-claims-batch.json`) and
  re-prove at claim time that no other candidate of the article has a passed audit bound to the current
  source sha (`passedCandidatesForArticle: 0`).
- **Capacity**: maker-B slot held `11:05:54.4`–`11:07:30.0Z`, acquire/release exit 0, legacy
  `production-lane.lock` never acquired and byte-identical (`unchanged: true`). Two real calls, one per
  chapter, zero retries. No audit-side call overlapped the window, so this batch claims **no**
  production/audit concurrency — the earlier 42.7 s / 26.8 s overlap was batch 3 and is not re-claimed here.
- **Revisions**:
  - 142-1 `b0173` — parent dropped 「引きでも」; now 「，摸到其中任意一张也能形成两面听牌。」
  - 127-1 `b0030` — untranslated 「立直nomi」; now 「处于希望避免仅有立直一役的愚形立直的局面」.
- **Self-check** (`selfcheck-b5-31d78fb246d54415.json`, `ok: true`): exactly the one target text block
  changed per chapter; every other text block, the body flow order and all 84 / 72 figures are identical
  to the parent; candidate self-sha, source/parent/notes bindings and raw-artifact sha all verified; one
  attempt per candidate. This is not the independent audit.
- **Handed to COAC-249**: `handoff-b5-efc4945f29d89376.json` + `explicit-targets-b5-c6f8abb95f3a0e90.json`
  (actual consumption — independent audits `5a8a41e7…`/`05be99be…` and the driver's terminal skips —
  is recorded in `coac249-delivery-4e7a7266904e4b52.json` and in *Review round 1* below).
  (one first audit per candidate sha; do not re-audit passed SHAs).

### 183-1 moved to pending adjudication

Per the member's ruling (249 confirmed the parent audit is only `uncertain` and forbids unconfirmed
rewriting), the batch-3 revision is evidence, not a candidate:

- `pending-adjudication-183-1.json` (schema `coac269-pending-adjudication/1`) records
  `doNotAudit`, `doNotIngestTo250`, `doNotOverwriteParent`, `furtherPaidCalls: 0`, `evidencePreserved: true`
  and the surviving artifact shas.
- `notice-249-do-not-audit-183-1.json` tells COAC-249 to stop the registered first audit for
  `chapter03-section003.coac269rev1.json` (`50831436…`).
- Batch 5's joint exclusion now skips the chapter with reason `ticket-pending-adjudication`, even though
  the chapter is not in the coverage union.

## Batch 6 — 2026-10-27, the next batch at the end of the batch-5 stage

The member's instruction was to hand the two fixable chapters over and then keep the next batch
moving instead of turning the report into a permanent wait. Batch 6 therefore ran in the same
session, immediately after the batch-5 handoff.

Only **one** chapter still passes the revision entry guard:

| chapter | article | parent candidate SHA | target | candidate SHA | production call | in / out | duration |
| --- | --- | --- | --- | --- | --- | --- | --- |
| nemata-jp-chapter-027-1 | chapter01-section010 | `7ebd1f97…` | b0056 | `44ce506db642a287d8becffe155bf287a147032cc11b0b0b992fa7a85eace50c` | `daa27aa1-c3a2-43e1-80b4-81026bfe6667` | 15,470 / 301 | 42.6 s |

- Joint exclusion re-run three more times (`11:10:54`, `11:11:19`, `11:11:40` immediately before
  dispatch), each with its own receipt sha. The preflight rejected its own first attempt
  (`b6-preflight-rejected-missing-notes-sha.json`): the case table did not yet pin
  `expectedNotesSha`, and the guard refused to proceed — that is the gate working, not a retry budget.
- Claim keyed `chapterId + current candidate SHA`; `passedCandidatesForArticle: 0`.
- maker-B held `11:11:41.0`–`11:12:23.8Z`, acquire/release exit 0, legacy lock byte-identical,
  one real call, no retries, no audit-side overlap in the window.
- Revision: b0056 was 「的情况与此不同：若打出」 — the comparison subject was ambiguous and risked
  merging the two tile shapes of figure b0055 into one eight-tile shape. It now reads
  「与后一个牌形不同，前一个牌形若打出」, i.e. the first four tiles of b0055 are the example and the
  last four are the comparison object. The parent audit had suggested restating the tile codes
  (1344m / 1124m); this candidate keeps the shape-relative wording because the source 「と違って打」
  does not repeat tile codes. **COAC-249 must judge the referent ordering against b0055** — that is
  the open semantic question, not something this line declared.
- Self-check `selfcheck-b6-b7470d87d4fe34cc.json`, `ok: true`: only the target block changed, all 77
  figures and the body flow identical to the parent, one attempt, raw-artifact sha verified.
- Handed to COAC-249: `handoff-b6-5455076a53c6565c.json` + `explicit-targets-b6-36667349329f7dfb.json`
  (consumed: independent audit `bdb29387…` passed at 11:27:18Z; delivery record
  `coac249-delivery-4e7a7266904e4b52.json`).

### The ordinary-web repair pool looked exhausted under a single-target reading of the entry

> **Correction (2026-10-27T11:35Z, batch 7).** The two text rows below were wrong: this ticket's
> `entryCheck` heuristic (and the batch-6 wording) treated "more than one non-faithful text block" as
> unrepairable, but the real entry was never single-target. `verifyWebRevisionContent` takes
> `textBlockIds` as an array, and COAC-244 re-verified 089-1 (4 blocks) and 060-1 (2 blocks) against the
> frozen runtime with zero model calls. Both were produced in batch 7. The figure rows stand: a text
> revision cannot also carry figures (`ids.length && texts.length`), and figure revisions require a
> `verbatim` parent.

Latest joint exclusion (`11:11:40`). Of the remaining uncovered chapters, none was a valid repair
target under this ticket's then-current single-target heuristic:

| chapter | why it was skipped at batch 6 |
| --- | --- |
| 347-1 | revisable by the guard, but skipped per the standing instruction (parent-audit figure gap is a root-level decision) |
| 232-1 | 2 non-faithful text targets, plus 1 figure without a faithful check (text+figure mixed: still not one revision) |
| 224-1 | 0 text targets, 1 figure without a faithful check |
| 213-1 | 1 figure without a faithful check |
| 193-1 | 1 figure without a faithful check |
| 100-1 | 0 non-faithful text targets |
| 089-1 | 4 non-faithful text targets — **wrong: multi-target text revision is supported; produced in batch 7** |
| 060-1 | 2 non-faithful text targets — **wrong: multi-target text revision is supported; produced in batch 7** |

`183-1` is under pending adjudication, `236-1`/`283-1` are COAC-248 reservations and `250-1` has no
audited parent candidate. Continuing past the figure rows still needs either a root decision on 347-1,
a runtime change for mixed text+figure or missing figure checks, or chapters from another source —
none of which this ticket may decide on its own.

## Review round 1 — CHANGES_REQUIRED (PR #71, head `8a97ffe`) and its fixes

The independent review of head `8a97ffe` accepted the nine artifacts and their SHA bindings but
returned three P2 findings. All three are fixed below with **zero new model calls, zero new
production calls and no re-audit**; the existing candidates, raw calls and receipts are untouched.

### R1 — the batch-5/batch-6 claim was invisible to line A

- **Was:** `coac269-claim-b5.mjs` (and its b6 variant) wrote `claim-b5-…` / `claim-b6-…` only into
  the ticket namespace. `parallel/events.jsonl` has no claim row for 142-1, 127-1 or 027-1, and
  `parallel/claims/` never contained them, so COAC-248's `slots.mjs check-chapter` returned
  `held:false` (exit 0) instead of exit 7 — line A could have produced the same chapters again.
- **Now:** `artifacts/coac269-claim-shared.mjs` takes the atomic **shared** claim first
  (`parallel/slots.mjs claim --chapter <id> --candidate-sha <parentSha> --lane B --owner …`), reads
  the record back and verifies owner + candidate sha, and only then writes the ticket-local detail
  claim (schema `coac269-candidate-claim/3`) carrying the shared path and sha. A claim held by
  another lane, or for another parent sha, refuses with zero calls.
  `artifacts/coac269-dispatch-guard.mjs` re-verifies that shared ownership **per dispatch**, so no
  future production can run on a ticket-only claim.
- **No retroactive claim.** The three chapters passed independent audit before this fix round
  (11:25:33Z / 11:27:18Z), so the reservation is finished; writing a claim now would mark completed
  chapters as in flight for line A without protecting anything. The historical gap is recorded, with
  its real timestamps and no backdating, in
  `shared-claim-history-gap-b5b6-5b7278aa7dc6d78a.json` (per chapter: production call ids,
  ticket-local claim sha, `sharedClaimAtProduction: null`, the passed audit, and why no retro claim).
  The attempt to claim through the fixed path is also kept as `shared-claims-b5-e02cde03b41e0ed9.json`:
  the gate refused all three because by then they were covered — the gate working, not a bypass.
- **Why line A still cannot re-produce them:** the fresh joint exclusion at `11:33:54Z`
  (`joint-exclusion-2026-10-27T11-33-54-678Z-e17cc5c1.json`) drops all three from
  `eligibleRepairTargets` through `latest-passed-audit-current-source` (denominator 150 scope
  chapters = 138 covered + 12 uncovered; the uncovered 12 are 8 eligible + 4 skipped, none of them
  these three).

### R2 — the COAC-249 handoff was a file, not a delivery

- **Was:** b5/b6 printed their handoff paths and the README said "Handed to COAC-249", but no
  consumption by the reviewer's entry was recorded at review time.
- **Now:** `artifacts/coac269-handoff-deliver.mjs` binds every delivered candidate to the audit
  receipt actually produced for that exact SHA and to COAC-249's own incremental handoff to
  COAC-250, then runs the real audit driver in `--select-only` mode through the shared entry
  (`audit/audit-explicit-targets.mjs`) — zero model calls. Delivery record
  `coac249-delivery-4e7a7266904e4b52.json`:

  | chapter | candidate sha | independent audit | audit sha | status | recorded |
  | --- | --- | --- | --- | --- | --- |
  | 142-1 | `f3570e7b…` | `chapter01-section054.f3570e7b….json` | `5a8a41e7…` | passed | 11:25:33Z |
  | 127-1 | `363fd45c…` | `chapter01-section047.363fd45c….json` | `05be99be…` | passed | 11:27:18Z |
  | 027-1 | `44ce506d…` | `chapter01-section010.44ce506d….json` | `bdb29387…` | passed | 11:27:18Z |

  - Driver consumption with the combined config
    (`explicit-targets-b5b6-combined-7d7dbdaf92140e8a.json`): `selected 0`, `pendingBefore 0`,
    `terminalSkips 3` (all `passed`), `modelCalls 0`. Same SHAs cannot be dispatched again.
  - COAC-249 handed the three, plus already-passed 199-1, to COAC-250 as
    `integration/coac249-incremental-269-b5b6-20261027.json` (batchSize 4, 11:29:58Z) and that
    receipt references this ticket's `handoff-b5-…` / `handoff-b6-…` and all three candidate SHAs.
    COAC-250 remains the only integration writer; this line wrote no register, selection or pointer.
  - The 183-1 do-not-audit notice was honoured: COAC-249 reports no audit for `50831436…`.
  - The first run of the delivery verifier failed its own assertion (it compared the driver's
    `terminalSkips` array against a count) and is kept as `coac249-delivery-9204f58d17fc6390.json`;
    the passing run is the one cited above.

### R3 — the joint exclusion ran once per batch, not per dispatch

- **Was:** `coac269-produce-b5.py` called `joint_run('pre-dispatch')` once before the loop; the
  second chapter reused that receipt (`jointExclusionAtDispatch` identical for 142-1 and 127-1,
  both bound to the `11:05:54.336Z` `dd7928dc…` receipt).
- **Now:** both producers call `dispatch_guard(c)` **inside** the loop immediately before each
  model dispatch. The guard runs its **own** fresh three-source joint exclusion, then checks the
  pointer sha, the shared claim (owner + parent sha), the ticket-local claim binding, the ticket
  denylist and output absence. Any drift refuses the dispatch with zero calls and its own receipt
  (`preflight/dispatch-guard-<ts>-<sha8>.json`); each chapter's `jointExclusionAtDispatch` now comes
  from its own guard receipt. The batch-level run remains only as a pre-slot capacity check
  (`preSlotJointExclusion`) and no longer authorizes a dispatch.
- Existing b5/b6 receipts are unchanged and still show what actually happened; the producers were
  patched after the fact and no production was re-run.

### Regression test (zero model calls)

`artifacts/coac269-dispatch-guard.test.mjs` — 17 assertions, all passing
(`regression-dispatch-guard.json`):

- *Defect phase*, against the reviewed commit `8a97ffe`: the old claim script has no shared-interface
  call and the old producer has exactly one `joint_run` outside the loop. These assertions fail on
  the fixed files and pass on the old ones, so they really pin the defect.
- *Fix phase*: the claim script's shared-then-local ordering; the guard refusing a missing, foreign
  or wrong-sha shared claim; a real two-lane race in a temporary `COACH_PARALLEL_ROOT` through the
  actual `slots.mjs` (first claimant wins, second exits 7, the loser's `check-chapter` sees the
  winner's claim, a second revision of the same chapter is also refused); and drift injected between
  dispatches — new passed receipt, pointer move, foreign claim, stale receipt, parent-sha drift —
  each blocking the second dispatch with its own recorded receipt age.

### Fix-round verification actually run

- `node coac269-dispatch-guard.test.mjs` → 17/17, `modelCalls: 0`.
- `node coac269-handoff-deliver.mjs` → `ok: true`, driver `--select-only` selected 0 / terminalSkips 3 / modelCalls 0.
- `node coac269-write-shared-claim-gap.mjs` → gap record written, `sharedClaimEvents: 0` for all three.
- `node coac269-dispatch-guard.mjs --case <027-1>` on the real data root → exit 1 with
  `joint_eligible` (027-1 is now covered), `shared_claim_present` (no shared claim) and
  `output_absent`; fresh joint receipt `4143a369…` (`dispatch-guard-live-027-1.json`).
- `node coac269-claim-shared.mjs --batch b5 --register-produced` → refused all three (already covered);
  the fix-round gate refused rather than claiming completed chapters.
- `python -m py_compile coac269-produce-b5.py coac269-produce-b6.py` → OK.
- Patched producer executed once in refuse mode: `python coac269-produce-b6.py nemata-jp-chapter-027-1`
  → `aborted-not-eligible` at the pre-slot capacity check (027-1 is now covered), zero model calls,
  no maker-B slot acquired (`production-b6-not-eligible-196c45012ac05e5a.json`).
- No model call, no audit call, no production call, no shared register/selection/pointer write in
  this round. The remaining uncovered-chapter pool is unchanged from the batch-6 section above.

## Batch 7 — multi-target text revision dispatched by COAC-244 (2026-10-27T11:47–11:57Z)

COAC-244's short coordination (`parallel/next-batch-20261027T1135/dispatch-B-coac269.json`) verified,
with zero model calls against the frozen runtime's `verifyWebRevisionContent`, that multi-target text
revision was already supported and handed line B `089-1` plus `060-1` as `nextInQueue`, two chapters max.
Nothing about the gate, runtime, selection, pointer or register was changed; the old single-target
heuristic in this ticket's own `entryCheck` was the only thing that had ever said otherwise.

| chapter | article | parent candidate SHA | parent audit SHA | targets | candidate SHA |
| --- | --- | --- | --- | --- | --- |
| nemata-jp-chapter-089-1 | chapter01-section031 | `9fa0255f1dbe…` | `38463b0c66018574…` | b0042, b0084, b0102, b0153 | `c5317d995648afeefdb370b314047e36f0368609a19a2db6be103385646565a6` |
| nemata-jp-chapter-060-1 | chapter01-section021-06 | `ff1f57ff633d…` | `f13f9da62cd633bf…` | b0027, b0033 | `6de46bfb824281e9facea8bd30eebf1498b7ae047e4c006250aeaa2800b0c64c` |

- **089-1**: all four target blocks had a parent-audit error that the translation had weakened
  「が有力」 into 「值得考虑的选择」. The candidate restores 「有力选择」 in `b0042/b0084/b0102/b0153`
  and keeps the three-colour condition (`b0042`: 「只在没有其他宝牌、且点棒状况需要高分时追求三色即可」,
  matching 「のみで良いとみる」).
- **060-1**: `b0027` now names the comparison the parent only pointed at (「理由与往上数第二个比较
  （好形1,300点＞愚形2,600点）相同」); `b0033` restores the 1-vs-2 ordinary-tile asymmetry
  (两面听役牌＋赤宝牌1张＋普通宝牌1张 对 宝牌单骑役牌＋赤宝牌1张＋普通宝牌2张) and renders
  「中盤過ぎると微妙になる」 as 「过了中盘后，优劣就变得微妙了」.
- `figureIds` is empty for both, `body.mode` stays `translated`, and no non-target text, figure,
  provenance field or DOM position changed (self-check below).

### Calls and capacity (actual, no retries)

- Model `gpt-6.1-sol`, effort `high`; the same frozen snapshot as batches 2–6
  (runner `4a5ce8ab…`, CLI `3da98f5f…`, audit `8660208d…`).
- 089-1: call `42af685b-9eba-47ff-8758-70c121ea1a12`, 15,204 in / 493 out, 32.5 s,
  raw `raw-calls/42af685b-….json` SHA `36bf3470aff373808ce949f09afb433e9a4e8dd6b932c6e254dc6e91a704ce8d`.
- 060-1: call `0823a000-cd88-4c75-a2d2-a0b03fcf42b6`, 15,738 in / 947 out, 48.4 s,
  raw SHA `49f40ac678bd73d7c77194b56be3b9adc69382b72b4116614c3ed0e95012f332`.
- maker-B held `11:52:08.307`–`11:52:41.456Z` (089-1) and `11:53:06.502`–`11:53:55.554Z` (060-1),
  acquire/release exit 0 both times. The legacy `production-lane.lock` was never acquired and stayed
  byte-identical (`unchanged: true`); line A held `maker-A` in the same window.
- **Real production/audit overlap:** the audit-ledger call `563fb29b-10ba-471f-bb8c-e91e1e2cb224`
  (`cv1721475`, `textbook-web-article-audit`) ran `11:51:51.834`–`11:53:34.855Z` and overlapped the
  089-1 production by 32.5 s and the 060-1 production by 27.9 s. The 060-1 receipt listed only its own
  27.9 s because the audit artifact landed at ~11:53:34, after the 089-1 receipt snapshot at 11:52:41;
  both real overlaps are recorded in `b7-concurrency-observation.json`. No other web-production call
  ran inside either window (the nearest, `cv1721475` production, ended 11:51:02.494Z), so maker-vs-maker
  concurrency stayed at 0 overlapping calls in this batch; the measured concurrency is audit-side with
  production, which the COAC-244 capacity allows.
- Both producers re-ran the three-source joint exclusion per dispatch (not once per batch):
  `11:52:08.666` for 089-1 and `11:53:06.864` for 060-1, each with its own receipt, plus a pre-slot
  run immediately before each. The `11:51:30`/`11:51:37` runs covered pre-claim and claim. All eight
  receipts are in `artifacts/b7-joint-exclusion-*.json`.
- Claims went through the shared interface first (`parallel/claims/nemata-jp-chapter-089-1.json`,
  `…-060-1.json`, owner `COAC-269 Ticket executor`, parent sha bound), then the ticket-local detail
  claim; each dispatch re-verified the shared claim through `coac269-dispatch-guard.mjs`
  (`b7-dispatch-guard-089-1.json`, `b7-dispatch-guard-060-1.json`, both `ok: true`).

### Verification (zero model calls)

- Preflight (`b7-preflight.json`): source/parent/notes/dependency SHAs, the exact 4+2 target set,
  entry parity (complete-article comparison, faithful DOM order, every image check represented,
  every non-target block faithful, all 75/50 figures faithful), dictionary coverage (0 unbound
  images), no existing variant.
- Self-check (`b7-selfcheck.json`, `ok: true`): exactly the target blocks changed in each chapter,
  every other text block byte-identical, body flow order and all figures identical to the parent
  (apart from render-only `presentationAsset`), candidate self-sha and raw-artifact sha verified,
  one attempt per candidate. This is not the independent audit.
- Handoff consumption proven without an audit: `audit/audit-explicit-targets.mjs --config
  explicit-targets-b7-….json --max-targets 2 --select-only` → `pendingBefore 2`, `terminalSkips 0`,
  `selected` exactly the two candidate SHAs, `modelCalls 0` (`b7-audit-select-only.json`).
- Handed to COAC-249: `handoff-b7-c81eda014b33072e.json` +
  `explicit-targets-b7-a214ee48cbccfb88.json`, with a COAC-249 handoff comment and an
  `at +1m` wakeup for agent `b144c077…`. Independent verdict is **pending**; nothing here is a pass.

### Remaining queue

After batch 7 the still-uncovered scope chapters are 347-1, 232-1, 224-1, 213-1, 193-1 and 100-1
(plus 183-1 under pending adjudication and the COAC-248 reservations). Every remaining text-capable
chapter is now produced; what is left needs a figure revision under a `verbatim` parent, a mixed
text+figure revision, a parent-audit figure coverage repair, or a root decision on 347-1 — none of
which this ticket can decide alone.

