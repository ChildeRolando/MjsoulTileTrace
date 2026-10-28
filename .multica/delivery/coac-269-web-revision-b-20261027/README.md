# COAC-269 — B line: ordinary-web targeted revisions

Ticket-local evidence bundle for the Multica ticket `COAC-269` (line B of the parallel editing split
authorised 2026-10-27T09:23Z). Shared code, the unified register, selection and pointers were not modified.

Latest priority: **COAC-250's Windows checkout packaging repaired**, zero model calls (Batch22).
Its idle task branch was advanced from completed v29 `f1435b1` to packaging-only `a9e9faa` and pushed.
Actual same-branch checkout and full-tree guard pass at229 UTF16 characters, strictly below240.
The distinct283 semantic outcomes below are unchanged; path repair does not rebuild or re-review them.

Current state: **b1181 passed its real first target audit; b1017 remains needs-repair**.
Candidate `b90f7c4f…507458` extends actual `00074d1c…09cbe2` and is unchanged after review.
This allowance used **2 production +2 first independent audits =4/4, remaining0, failed/void0,
retry0**. Batch21 registered the results with **0 new model calls**. The independent1017 error
finds the added 小三元／大三元 parenthesis narrows the source term; preserve the error and raw,
without editing or re-reviewing this candidate. All1193 non-target blocks and524 figures,
including passed b0168/b0396/b0962 and table/Q8 scope, retain their parent bytes and order.
The ticket-local effective view has6 remaining blockers plus2 source-notes. Whole283 remains
needs-repair/unaccepted. See Batch20 for production and Batch21 for the genuine review outcomes.

b0396/b0962's independent first target passes remain valid. Their distinct previous allowance used
**2 production +2 independent first audits =4/4, remaining0, failed/void0, retry0** (Batch18/19).

b0168's earlier independent pass remains valid and its separate **2/2** allowance is exhausted
(Batch17). Six-table and Q8 accepted supplements are inherited by unchanged scope hashes with
their original limits, without re-review. The whole chapter remains needs-repair/unaccepted;
the ticket remains in_progress. No full-candidate branch override or formal active change occurred.

Earlier 183/236 outcomes remain unchanged: 183's full-context target-text re-review **passed**
and was handed to COAC-250, without claiming integration acceptance here. 236 retains its original
`needs-repair / uncertain` and source/fidelity diagnosis. That older allowance used **7/7 local
calls, remaining 0** (Batch 14); it is not available to the b0168 work.

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
  run immediately before each. The `11:51:30`/`11:51:37` runs covered pre-claim and claim. All six
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


## Batch 8 — 79-cn figure revisions (2026-10-27T12:35–12:45Z)

Owner dispatch 2026-10-27T12:23:19Z (comment `01a17d50`): line B takes exactly two chapters,
`79-cn-chapter-128-14` and `79-cn-chapter-145-4`, with the full canonical ids and error targets read
from COAC-244's `6145c9f` classification (`figure-targeted-executable`, `entryPass: true`,
`declaredErrorTargets: 1`). `79-cn-chapter-090-6` belongs to line A and was not claimed or touched.

### Entry (no new framework)

Both chapters are Chinese (`zh-CN`) **verbatim** parents, so the existing *figure-targeted* revision
entry of the frozen web production runner applies: for a Chinese source the runner derives
`figureIds` from the parent audit's own non-source-note `issue.targetId`s and requires every OTHER
figure to already carry a faithful `figureCheck`. Exactly one figure per chapter was re-transcribed;
the Chinese body and the other 6 / 4 figures are inherited byte-for-byte. Same runner, same flags,
same slot and same claim interface as batch 7 — no gate, runtime, dictionary, selection, pointer or
register was modified, and no mode was converted to reach an entry.

### Source verification before dispatch

Both error targets were re-read by this line directly from the bound source images
(original + nearest-neighbour / 4× zoom), independently of the parent audit and of the model:

| chapter | figure | parent transcription | bound source read |
| --- | --- | --- | --- |
| 128-14 | `cv1734739:b0013` | `2m 3m 4m 5m 6m …` | `2m 2m 4m 5m 6m …` (tiles 1–2 are both 二萬); dora indicator 3p unchanged |
| 145-4 | `cv1744266:b0005` | `… 9s 2z 7z` | `… 9s 1z 7z` (12th tile 東, 13th 中); ツモ 5s unchanged |

### Joint exclusion v3 (same three sources, both entries)

`artifacts/coac269-joint-exclusion-precheck-v3.mjs` is v2's mechanism with the canonical map extended
to the 79-cn body correspondence, so figure chapters are excluded by canonical original chapter id
too. Incident negative controls still pass (246/237/131 covered, 183 uncovered). Denominator for this
run: 231 mapped chapters (150 modern + 81 79-cn), 199 covered by the union, 32 uncovered; of the
uncovered, 26 are eligible repair targets under their own entry. Chapters outside both maps are
reported as outside the maps, not silently counted as uncovered.

It was re-run five times, each producing its own receipt: before the preflight, before the claim,
before taking the slot, and once immediately before **each** model dispatch (`b8-joint-exclusion-v3-*`).
The active preview pointer did not move during the batch (`2e85514b…` throughout).

Caveat worth recording: v3's figure-direction check mirrors the production entry (target figures +
faithful checks for every other figure). COAC-244's `6145c9f` classification additionally applied an
"imageCheck represented" criterion, so v3 lists a few more 79-cn chapters as revisable than 244 did
(109-4, 167-4, 311-18). That does not affect this batch — both dispatched chapters are in 244's
executable list — but it means v3's eligible list is not a substitute for 244's selection policy.

### Claims (shared first)

`parallel/claims/79-cn-chapter-128-14.json` (parent `2aec7345…`) and
`parallel/claims/79-cn-chapter-145-4.json` (parent `7557da59…`), both owner `COAC-269 Ticket executor`,
taken atomically through `parallel/slots.mjs claim` and read back before the ticket-local detail claims
were written (`b8-claims-batch.json`, `b8-claim-*.json`). No other lane held either chapter; line A's
`79-cn-chapter-217-4` claim was visible in the same run.

### Zero-call preflight

`b8-preflight.json` (`preflight-b8-3eefc864…`, `ok: true`): for each chapter — fresh joint exclusion
eligibility bound to the exact parent sha; source/parent/notes sha; `notes.production.sha256` = parent
file sha; `notes.source.sourceSha256` = source file sha; parent identity and `body.mode: verbatim`;
parent `needs-repair`; all source assets downloaded; the repair scope re-derived from the audit's own
issues = exactly one target figure; every other figure faithful; target asset sha verified; reuse-map
binding; variant output absent; no passed receipt for the current source sha; no STOP file; no live
maker-B slot.

The same run then executes the **real frozen entry** with `--preflight-only`, so the runner's own
`web_revision_is_not_isolated_figure_repair` gate and reuse binding run too:
`preflightPassed: true, figureRuns: 7 / 5, pendingFigureRuns: 1, modelCalls: 0` for both.

`b8-preflight-launcher-failure.json` is retained: the first preflight attempt passed every data check
but launched node with an extra `node` argument of its own (a launcher bug in the preflight script, not
a gate rejection) and produced 0 model calls. The receipt records the real failure; the script was
fixed and `b8-preflight-with-bindings.json` is the version with the claim-consumable binding block.

### Production (real calls, no retries)

Model `gpt-6.1-sol`, effort `high`; frozen runtime `textbook-production-web.mjs` +
`textbook-production-web-visual.py` (visual assistance present, 2 attachments per call).

| chapter | callId | in/out | duration | maker-B window | candidate SHA256 |
| --- | --- | --- | --- | --- | --- |
| 128-14 | `21f6e4f9-868e-4bcf-82ad-91d904d95cd6` | 16,565 / 267 | 101.1 s | `12:42:09.7`–`12:44:23.1Z` | `c14911aa47ebac539d45cf022332fe2cc7f2b05c08599f53bbb2525e3d0c27ae` |
| 145-4 | `c1a7d02f-b322-48df-96f9-a80a1ea8a8cf` | 15,670 / 515 | 30.4 s | (same hold) | `07a511d4efb0dc246763ba7d2b114ac7203ab9b7109f7fcc12cfe4302751d284` |

- 2 production calls for 2 chapters, 0 retries, both `success=true`; 32,235 in / 782 out total.
- maker-B acquired `12:42:09.725Z` and released `12:44:23.083Z`, both exit 0, status 0 live makers after.
- Legacy `production-lane.lock` never acquired, byte-identical before/after (`30`, unchanged mtime).
- Dispatch guards `b8-dispatch-guard-128-14.json` / `-145-4.json`: each dispatch had its own fresh
  joint exclusion and shared-claim owner/sha read-back, `ok: true`.
- Real concurrency: the two production calls ran back-to-back on the one B slot; no audit call and no
  A-line production call overlapped them in this window, so maker-vs-maker overlap stays 0 for this
  batch (nothing is claimed as concurrency that did not happen).

### Self-check (not the independent audit)

`b8-selfcheck.json` — `ok: true` for both, `modelCalls: 0`:
`verifyWebRevisionContent` ok, `verifyWebProductionCall` ok (real bound output: model/effort, raw
artifact sha, prompt/output sha, 2 visual inputs), `webDeterministicChecks` passed, exactly 1 attempt.

Structural: every text block of the verbatim body, the flow order and every non-target figure are
byte-identical to the parent; only the target figure differs.

Disclosed incidental changes — inside the target figure, the frozen entry lets the model re-emit
`kind/transcription/unknowns/caption/sourceNotes`, and it did:

| chapter | target transcription | other changed fields |
| --- | --- | --- |
| 128-14 | `2m 3m …` → `2m 2m …` | caption `例5：手牌与宝牌。` → `例5：手牌与宝牌` (trailing full stop dropped) |
| 145-4 | `… 9s 2z 7z` → `… 9s 1z 7z` | caption reworded to `例1：手牌及右侧摸入的5s。`; parent sourceNote `原图与近邻放大图为同一图像，仅计一次。` not re-emitted |

These are left exactly as the model produced them (hand-editing a bound production output would defeat
the entry) and are handed to 249 as explicit questions rather than presented as no-change.

### Handoff to COAC-249

- `web-production/v1/coac269-20261027/handoff/handoff-b8-0e18bc298e9a64b6.json`
  SHA256 `72af89a06da93bdcb80b4abf6ddcbe9ceeb29d9b70b0eaa5d155f29e91406a71` (bundle: `b8-handoff-249.json`)
- `web-production/v1/coac269-20261027/handoff/explicit-targets-b8-0b7c7d8ddbc6b99a.json`
  SHA256 `2098ab0e4e25d372372f0f1382ea72f935c1a1792f794392deaf2ee00097eef4` (bundle: `b8-explicit-targets-249.json`)
- Consumption proof through 249's own entry (`audit/audit-explicit-targets.mjs --select-only`):
  `pendingBefore: 2`, `terminalSkips: 0`, selected exactly the two candidate SHAs, `modelCalls: 0`
  (`b8-audit-select-only.json`).

### Boundaries

No shared list, selection, pointer, register or formal library was written; no gate or runtime was
edited; no model call beyond the two budgeted productions; no pass, no staging and no integration is
claimed here. Pass remains 249's and integration remains 250's.

## Batch 9 — second 79-cn figure dispatch: one chapter withheld, one produced and voided (2026-10-27T14:36–14:51Z)

Owner dispatch 2026-10-27T13:32:19Z (comment `01a17d8f`): line B takes exactly two chapters from
COAC-244's `6145c9f` classification — `79-cn-chapter-157-11` and `79-cn-chapter-205-5` — with the full
canonical ids resolved from that record (`figure-targeted-executable`, `entryPass: true`, declared
error targets 5 and 1). Neither chapter had been claimed by line A (`090-6`, `081-8`, `217-4`) and
neither overlaps the candidates already with COAC-249 (`128-14`, `145-4`).

The batch ended with **no revision handed to COAC-249 and no write to COAC-250**: one chapter was
withheld before dispatch because two readings of its figure conflict and no independent image audit
exists, and the other was produced with one budgeted call and then held back because this line reads
its output as contradicting the bound source. Both chapters stay `needs-repair`; nothing here is
claimed as passed, staged or integrated, and — per the 15:52Z correction recorded at the end of this
section — this line's visual readings are diagnostics, not semantic verdicts.

### 157-11 — withheld before dispatch (conflicting readings, no independent audit)

`artifacts/b9-157-11-source-conflict.json` (SHA256 `fe4021bf…97c0`), zero model calls.

The parent audit (`cv1751276` … `retry-1792948857228-d69c915c.json`) declares five `error` issues,
all the same claim: a hand tile transcribed as `4s` is really `6s` ("两列、每列三根索子"). **Producer-side
diagnostic only** (see the correction note at the end of this section): reading the five bound source
images — which are exact matches of the book pages per `chinese-source-body-correspondence.json`
`exactSourceMatches` — this line counts a **2 columns × 2 rows** bamboo tile in every one of them,
i.e. `4s`:

| figure | disputed tile | parent | audit | source read (row bands × column bands) |
| --- | --- | --- | --- | --- |
| b0005 | hand #8 | 4s | 6s | 2 × 2 = 4 sticks |
| b0007 | hand #7 | 4s | 6s | 2 × 2 |
| b0009 | hand #5 | 4s | 6s | 2 × 2 |
| b0011 | hand #8 | 4s | 6s | 2 × 2 |
| b0013 | hand #8 | 4s | 6s | 2 × 2 |

Same-artwork references separate the two glyphs mechanically: the article's own `7s` tiles are
1 red + 6 green in 3 columns × 2 rows, and a same-book anchor pair (`cv1708627` b0008, transcribed
`… 4s 5s 6s 6s 7s`, unflagged) reads 2×2 for the `4s` and 3×2 for the `6s`. The audit's "每列三根"
does not match the pixels.

One further, **undeclared** doubt is recorded and deliberately not acted on: in `b0011` the dora
indicator is labelled `6s` while this line reads the same 2×2 glyph. It was not repaired and not added
as a target — expanding the target set by a producer read is exactly what the 15:52Z correction
forbids. Because the two readings conflict and no independent image audit exists for `cv1751276`,
the chapter was **not dispatched** (0 model calls, 0 candidate) and the conflict goes to adjudication
instead of into a revision.

### 205-5 — produced with the single budgeted call, then held back (producer accusation)

Entry, claim, preflight, slot and gates all behaved; the model output did not.

- Fresh three-source joint exclusion (v3) four times, each with its own receipt: preflight
  `14:40:49`, at claim `14:41:31`, pre-slot `14:46:05`, at dispatch `14:46:06`; incident controls
  green (246/237/131 covered, 183 uncovered) and the active preview pointer did not move.
- Atomic shared claim `parallel/claims/79-cn-chapter-205-5.json` (owner `COAC-269 Ticket executor`,
  candidate sha `181e5da0…`) read back before the ticket-local claim was written.
- Zero-call preflight `b9-preflight.json` (SHA256 `e2912ec7…fde90`, `ok: true`): bindings, verbatim
  body, 2 figures with 1 pending, target assets sha-verified, and the real frozen entry run with
  `--preflight-only` (`preflightPassed: true`, `figureRuns 2`, `pendingFigureRuns 1`, `modelCalls 0`).
- maker-B acquired `14:46:05.746Z`, released `14:51:12.895Z`, both exit 0; legacy
  `production-lane.lock` never acquired, byte-identical before/after.

| chapter | callId | in/out | duration | candidate SHA256 |
| --- | --- | --- | --- | --- |
| 205-5 | `358f4e70-5660-4e0c-8918-6ad8a4287011` | 16,342 / 7,186 | 306.0 s | `8c0cfff82dbf0c339dc1474ad84e51a4b9c55554ab62a64dfc472f6604a555ec` |

One production call for one chapter, 0 retries. The frozen gates pass — `verifyWebRevisionContent`,
`verifyWebProductionCall` and `webDeterministicChecks` are all ok in `b9-selfcheck.json` (SHA256
`250600ef…f9a54`) — because those gates verify bindings and scope, not whether the model read the
image correctly.

**Producer accusation — not a confirmed semantic failure.** `artifacts/b9-205-5-semantic-failure.json`
(SHA256 `d391d587…46e1`) re-reads the disputed areas against the bound screenshot and reads the model
as contradicting the source in at least five places:

| area | parent (and source) | model output |
| --- | --- | --- |
| 下侧手牌 #2 | 1m | 2m |
| 下侧手牌 #13 | 4s | 6s |
| 摸入牌 | 6s | 8s |
| 左下副露 | 2m、1m、3m 的吃 | 1m 1m 1m 的碰 |
| 下侧弃牌区第 2 行第 1 张 | 8s | 4s |
| 上侧弃牌区外侧一行第 3 张 | 9m（九萬） | 6m |

The audit-targeted tile (`左侧弃牌区第 2 行：8m 6s`, replacing `8m 未辨明索子牌` and dropping the
corresponding `unknowns` entry) reads as correct in the candidate; the five points above are what this
line reads as damage around it. Whether the candidate passes is an independent first-audit question,
not this line's: the candidate has no audit on its own SHA yet.

Consequences, per the batch rules (每章最多 1 次制作，失败 void 也计、不自动重试):

- the chapter's 1 production call is spent; the candidate and raw call are kept exactly as produced
  (no hand edits, no retry), and the candidate is **not** presented as a valid revision — its semantic
  status stays pending an independent first audit on its own SHA;
- it was **not** handed to COAC-249, so the first-audit budget for this chapter was not spent and no
  wrong candidate can reach 250;
- the parent remains the only `needs-repair` candidate on the current source sha; a further attempt
  needs a new budget decision from the owner, not an automatic retry from this line.

### Correction applied 2026-10-27T15:52Z (owner issue update)

The owner added to COAC-269's description: the old controller's "I looked / 6×–8× re-read / per-tile
check" conclusions are unsupported diagnostics; `Read` returning an image block does not prove the
upstream model received or understood it; Python pixel/band statistics are locators, not verdicts.
Visual reads may not modify tile codes, overturn an independent semantic audit, judge `passed`, or
declare a semantic failure. Semantic conclusions must cite an independent GPT image audit on the same
candidate SHA, with the input asset/hash, original + supplemental image order, complete output and
transport all checked.

This bundle was written before that correction and has been reframed accordingly:

- `b9-157-11-source-conflict.json` keeps the readings and the crop evidence but is now labelled a
  producer diagnostic; it no longer asserts that the audit is wrong or that the parent is faithful.
  The dispatch decision stands on a narrower, non-semantic ground: two readings conflict, no
  independent image audit exists for `cv1751276`, and the chapter therefore consumed no call and got
  no candidate. Unresolved items: the 4s/6s conflict on the five figures and the `b0011` dora label
  doubt (not a declared target, not expanded).
- `b9-205-5-semantic-failure.json` keeps the six per-area readings but is labelled a producer
  accusation; the candidate has **no independent first audit on its own SHA**, so its semantic status
  is pending, not failed. What remains decided is only the dispatch consequence: one production call
  spent (void), no retry, no handoff to 249/250 on mechanical ok alone, raw kept untouched.

Recovery entry and state, for COAC-244's scheduling (this line does not wake itself, poll, or spend
again): the `205-5` candidate `web-production/v1/candidates/79-bilibili-cn/cv1770234.coac269rev1.json`
(SHA256 `8c0cfff8…f55ec`) and its raw call `358f4e70` stay in place with the shared claim
`parallel/claims/79-cn-chapter-205-5.json`; maker-B was released at `14:51:12.895Z` and `slots.mjs
status` shows 0 live makers, so capacity is free. Actual batch usage: 1 call, 16,342 input / 7,186
output tokens, 306.0 s, 0 retries. `157-11` has no claim, no call and no artifact under the ticket
namespace; its adjudication is the open item.

### Boundaries

No shared list, selection, pointer, register or formal library was written; no gate or runtime was
edited. The only model call in the batch is the one `205-5` production above. `157-11` consumed none.
Pass remains 249's and integration remains 250's.

## Batch 10 — bounded inline Japanese glosses (2026-10-27)

Authorization: COAC-244 comment `01a17e4c-8ec2-73f3-8c59-92bb3f8910db`, dispatched to
COAC-269 by wakeup `01a17e5c-acab-70c6-bceb-f91ed968f733`. This batch uses the exact
`ticket-intake.json` SHA256 `6d0967d34d41734f00394aae057aa4452597a4d3c8aa0ec03d462c2976fa1a37`
under `web-production/v1/runs/coac244-inline-japanese-20261027/` in the processing data root.
The earlier batches and PR #73 evidence above remain historical records.

The only chapters are `79-cn-chapter-162-3` and `79-cn-chapter-234-12`. Each has one
production and one independent first-review slot; failed/void calls count, and the contract forbids retries.
The supplied scripts run sequentially from the processing root, using atomic chapter claims,
maker-B, and the independent audit guard. No 155/157/182/205/276 dispatch is authorized here.

### Frozen input and validation evidence

`artifacts/b10-inline/immutable-hashes.json` records 33 matching immutable path/hash checks:
the intake, 15 frozen v2 runtime files, three entry/helper scripts, both source/parent/audit/plan
chains, reuse maps and original parent audit calls. The runtime manifest and the two jobs also
match the intake. Both supplied production entries passed a fresh `--preflight-only` invocation
in this run with zero model calls. Current canonical preview/register, bound passed alternatives,
raw/dispatch markers, claims and platform runs were checked before dispatch; the scripts repeat
the canonical checks under the acquired claim and maker slot.

The snapshots, plans, dispatch/release receipts, exact text diffs and call records are in
`artifacts/b10-inline/`. `collect-evidence.py` only reads the data root and writes ticket evidence;
it cannot dispatch models or modify candidates/raw/shared integration state. Candidate and raw
payloads remain at their original processing-root paths, identified by SHA in the evidence.
The intake's existing regression/parent-proof evidence is retained; this run does not claim a
new execution of its 24 regression cases.

### 162-3

Only `b0004` and `b0034` gained `（吃牌延伸）` immediately after `食いのばし`. The original
Japanese, surrounding Chinese, spaces, source segments, emphasis and all 15 figures are unchanged.
Display candidate SHA256: `0d0d54818b5b686d34936a4a5f59ae90d83345dd636e33d423d34d9f5b16b481`.
Independent audit SHA256: `25c0966eecf2747e6401ae09c6677dc7de3c0ae90b936a4e231317d049281cb5`,
status `passed`, no issues. Method: `independent-target-text-review-plus-unchanged-parent-audit`;
the 15 figures inherit the authenticated full parent review and are not newly reviewed images.

The per-chapter COAC-250 handoff is
`web-production/v1/runs/coac244-inline-japanese-20261027/handoff-162-to250.json`,
SHA256 `8dc5c535b8a4ce9933ea0bb6411c76bd6d0bb7dbf209f6953501792984740753`.
Persistent wakeup `01a17e66-8893-766f-9603-b7c4733f5260` carries the exact candidate, plan,
parent/raw chains and frozen v2 verifier to the existing single writer. The handoff requires
actual MCP/Arena readback and forbids a formal active switch. It is not an integration receipt.

### 234-12

The sole wrapper dispatch `ba432ee3-0d28-42b9-ad34-cde09c97313e` timed out after 900,007 ms
(`2026-10-27T17:27:03.855Z` start, configured timeout 900,000 ms). There is no candidate,
no model output and no text diff to review. This is a transport failure, not a semantic verdict.
The original raw artifact remains
`web-production/v1/raw-calls/ba432ee3-0d28-42b9-ad34-cde09c97313e.json`, SHA256
`0c73fb1bf6957c0cc44f1b2ec5d705f4cd7152c425f311f28168492b62e47734`.
Usage is null. No 234 audit or handoff was dispatched, and the production was not re-dispatched.
Maker-B and both batch chapter claims were normally released; the audit guard is not held.

### Actual wrapper call ledger and transport limitation

| chapter / scope | call ID | start (UTC) | duration ms | input / output tokens | result |
| --- | --- | --- | --- | --- | --- |
| 162 production | bd7b1408-514a-4d7d-b674-18202fc0c556 | 17:20:45.216 | 185487 | 14366 / 408 | completed |
| 162 independent text audit | d47ebb3d-967e-4882-9f6e-59a52fb58803 | 17:24:06.297 | 121068 | 15580 / 518 | passed |
| 234 production | ba432ee3-0d28-42b9-ad34-cde09c97313e | 17:27:03.855 | 900007 | unknown / unknown | timeout |

There are **three wrapper call records** (two production, one audit), zero executor re-dispatches,
and no overlap among these three intervals. Known usage is 29,946 input / 926 output tokens for
162 only; the batch total is unknown because 234 has no usage record.

All three calls retain lower-level Codex CLI reconnect events: six routing-discovery timeouts
for 162 production, four TLS-handshake/stream reconnect events for its audit, and two request
timeout reconnect events for 234. These events are not separate local call IDs and do not prove
that extra model executions occurred. They also do not prove that no extra upstream execution
occurred. Therefore **network-layer zero retries and the total upstream request count cannot be
certified** from the local ledger. No provider/model/runtime setting was changed to suppress or
hide this fact. The original dispatch receipts' `automaticRetry: false` describes the supplied
wrapper configuration, not a verified absence of internal transport reconnects.

The bounded batch is incomplete: 162 has a real pass and a durable COAC-250 handoff; 234 has no
candidate and must not consume an independent-review slot. COAC-269 is `blocked`, pending a
decision on a new 234 production allowance and the unresolved transport accounting boundary.
No new batch/wakeup/retry is scheduled on COAC-269. Further integration and actual MCP/Arena
readback of 162 remain COAC-250's responsibility; neither this evidence nor a code PR is that receipt.

Monetary cost is unknown: the available call records expose tokens and elapsed time, not a bill.

## Batch 11: bounded 183/236 text production, 2026-10-28

Authorized by comment `01a17eba-f0e3-71c8-9f5f-5fc8853ec674`, this batch used only the
COAC-244 snapshot `coac244-text-uncertain-183236-v1-20261028`, manifest SHA256
`fdac719dc8237db59f7a2abd6cd2bdac44f895a03519abe67cf408242e392548`.
All 16 runtime files match commit `394b830d7cd76ac3c97f480e93a54b14913501f4` byte for byte.
The original source/parent/audit SHA bindings, complete real parent chains, two fresh zero-call
preflights and all 18 parent/scope/uncertain regressions passed. The original audit severity
remains `uncertain`; a new uncertain review would still block acceptance.

Both authorized single production calls completed, but **neither output meets the exact text
whitelist**. These are production-scope rejections, not independent semantic audit verdicts:

- `nemata-jp-chapter-183-1/b0018`, bound to `source.v2.json`: the model changed
  `能看到1张` to `可见1张` and `比客风牌低` to `低于客风牌`, and added no ambiguity note.
  This violates the append-only requirement. Candidate SHA256
  `ca6e867649ca33f8e28c6e06329cf687e3ca18eaddc93325c684e3282994c003` is retained and withheld.
- `nemata-jp-chapter-236-1/b0003`: the model removed `剩余`, but also changed
  `结束时` to `一旦结束，` and `相当大的优势` to `意外不小的优势`, and added no timing note.
  This violates the single-phrase removal plus appended-note requirement. Candidate SHA256
  `52f0caa9dc57c3d4cd3fc64e1c194a3eccc3e5f7a0ede6456301eee218c17062` is retained and withheld.

The unchanged frozen production prompt asks for isolated retranslation and treats previous issues
as locators; it does not transmit the new append-only/exact-prefix whitelist. This is a request-scope
gap for the COAC-244 owner to address before any separately authorized future production. This
batch did not alter the snapshot, notes, sources, original raw, model/provider, or candidate output.
No independent audit, COAC-249 handoff, integration, display conversion or retry was performed.
The package explicitly forbids spending the audit allowance on an output that violates its whitelist.

| chapter / scope | call ID | start UTC | duration ms | input / output tokens | result |
| --- | --- | --- | --- | --- | --- |
| 183 production | 629d37ab-fdc9-462f-a29a-061ae3293fb0 | 2026-10-27 19:04:49.299 | 36780 | 12788 / 349 | completed; whitelist rejected |
| 236 production | abef6c4b-02ff-416f-b61d-1fe821402f1a | 2026-10-27 19:05:55.602 | 30842 | 13723 / 634 | completed; whitelist rejected |

Both real requests were pure text, `gpt-6.1-sol/high`, with empty image payloads. There are two
new local call records and zero new audits, out of the authorized maximum four; the two unused
audit allowances cannot be reassigned to production retries. Known usage totals 26,511 input /
983 output tokens, zero cached input. No reconnect events were observed; 183 stderr records a
model-list refresh timeout before a successfully completed turn. Actual upstream request count,
remote backend weights and monetary cost remain unknown. The calls ran sequentially.

The existing 183 claim belonged to this same Ticket executor and exact parent SHA; active-run
inspection confirmed no other COAC-269 run. It was resumed without deleting a lock. Both chapter
claims and maker-B were normally released. A post-call evidence collector initially encountered an
unrelated ledger row without `sourceId`; only read-only collection was rerun after correcting its
filter. Neither production was repeated.

Evidence is in `artifacts/b11-text-183236/`, including the original intake, frozen manifest, fresh
18-case parent proof, source/parent/raw checks, exact diffs, genuine candidate/raw copies, dispatch
and release receipts, and complete call accounting. Original processing receipts are under
`web-production/v1/runs/coac269-text-183236-20261028/`.
COAC-269 remains blocked: no newly acceptable candidate exists, production allowances are spent,
and the unchanged 244 request needs the exact output constraints before any future authorized call.
Old 162 pass, 234 timeout, other accepted chapters and formal active remain untouched.

## Batch 12: authorized exact-text continuation of 183/236, 2026-10-28

User comment `01a17ed7-c04d-71e7-82eb-57aed9c7b3e1` explicitly adds **two production calls**,
one per chapter. The original two first-audit allowances remain audit-only. Including Batch 11's
two failed productions, this 183/236 batch has a lifetime maximum of six local calls; failed/void
calls count, and no automatic retry is allowed. The unrelated 234 timeout has no new allowance.

The exact COAC-244 runtime `coac244-text-exact-183236-v2-20261028` is unchanged, with manifest
SHA256 `0b75f6f6bb31d38344077753d402716b01d83cbbd57709720b753963408ef684`. All 19 files,
including the manifest, byte-match commit `8ea8e86efa6c1b3c778b7cbf3efca1da372352fb`.
The 27 zero-call checks were rerun successfully, including actual producer request construction,
both old-raw rejections, punctuation/extra-target/figure/note rejection, and rejection of invented
parent-plus-note composites. Both new entry preflights and request-only checks passed. Each real
raw request then matched its request-only closed prompt exactly, and the real output matched the
single allowed full-text enum. No frozen runtime, parent/source/audit, raw, or model output was edited.

COAC-244's investigation clarifies the old failure: the previous request already contained quoted
parent text and an audit suggestion mentioning notes. The missing requirement was an enforceable
exact character whitelist with an explicit non-author note, rather than a complete absence of context.
The new entry enforces this after saving raw/ledger and before assigning target text or writing a
candidate. It also rejects resuming the old invalid output. This is production scope validation;
the independent semantic gate and original `uncertain` remain unchanged.

Both new real productions satisfy the contract:

- `nemata-jp-chapter-183-1/b0018` uses the candidate-bound `source.v2.json`. Every original
  paragraph character is retained, followed by two newlines and the exact `【校注（非原文）：…】`
  comparing 4%=4%, role tiles 2% versus guest wind tiles 3%, and the unresolved “见1张” count.
  Display SHA256: `973bbc3eb85dedaed18a5b11903b8002b8dffcade1e6d3a3f7bb25cd1684d45a`.
  Intermediate candidate SHA256: `d1050bb0d666393e063cf3381e8faf767292db4f101189e3abe9eefdd06c14c8`.
- `nemata-jp-chapter-236-1/b0003` deletes only the specified `剩余` in author text, then appends
  two newlines and an explicit non-author note that elapsed versus remaining turns is unresolved.
  Display SHA256: `6193212639b7c8abb42adf64b69759a5d00effc67c1f20d2c9ae681ded121a28`.
  Intermediate candidate SHA256: `e805b23bee71280bf113b499236cbe92ab440fc6c7e632d3d3b7592bcf369a08`.

All non-target body objects, sourceSegments, emphasis, source bindings and zero-figure sequences
remain unchanged. The frozen verifier independently authenticated both new production/raw records
and their complete real parent-review inheritance. Display conversion is the existing deterministic
renderer, not a manually derived translation. Neither candidate is called semantically passed here.

| chapter / scope | call ID | start UTC | duration ms | input / output tokens | result |
| --- | --- | --- | --- | --- | --- |
| 183 new production | cf82e6c3-ca38-4f6e-98bc-5c81fb4a3428 | 2026-10-27 19:32:22.378 | 20887 | 14867 / 225 | completed; exact whitelist passed |
| 236 new production | 62c5c6f7-d54c-45c1-92af-da36349b1f80 | 2026-10-27 19:33:39.049 | 57082 | 15104 / 330 | completed; exact whitelist passed |

Both calls used the real unchanged `gpt-6.1-sol/high` CLI path with empty image payloads. New
production usage totals 29,971 input / 555 output / zero cached input. Including the two preserved
Batch 11 failures, production usage is 56,482 input / 1,538 output, with four production call records.
No audit was dispatched by this executor and no production was retried automatically. Neither new
call has reconnect events; 236 stderr records a model-list refresh timeout before normal completion.
Upstream request count, remote backend weights and monetary cost remain unknown.

Each chapter was handed individually to COAC-249 immediately after its own mechanical verification:

- `web-production/v1/runs/coac269-exact-183236-v2-20261028/handoff-183-to249.json`, SHA256
  `a2d264e0294c9b2103b756f9b2391bdf5d6eac4ffaf8b805782fc3467028d39f`;
  persistent wakeup `01a17eda-9a52-7597-bdd3-54f3a1062499`.
- `web-production/v1/runs/coac269-exact-183236-v2-20261028/handoff-236-to249.json`, SHA256
  `deb9b0b7e67b0bc19c936eb02ae4dd463379600ef2083c2eb1ebcca9ceed9b5d`;
  persistent wakeup `01a17edb-c235-7225-9c84-c218f6200166`.

The handoffs bind exact display SHA, source/parent/uncertain audit/raw, frozen validator and contract,
and authorize only one real first target-text review each. An independent `uncertain` still blocks.
Only a verified real pass can go to COAC-250 for single-writer integration and MCP/Arena readback;
formal active is not switched. Wakeup registration/dispatch is not an audit receipt or acceptance.
The collector records any audit calls/terminal receipts visible at its timestamp, separately from
these four production calls; it does not assume queued requests have consumed the review allowances.

The maker-B slot and both new chapter claims were normally released. No run-owned request remains.
COAC-269 continues `in_progress` while the independent first reviews and any valid integration remain
pending. Evidence is in `artifacts/b12-exact-183236/`; `collect-evidence.py` only reads model/data
artifacts and writes receipt copies and accounting. The existing draft PR carries the evidence and
does not replace textbook review or qualify this issue for automatic closure.

## Batch 13: record terminal 183/236 independent review return, 2026-10-28

This run adds **zero model calls**. It consumes the existing COAC-249 handoff
`integration/coac249-reviewed-exact-183236-20261028.json`, SHA256
`5f18539ffe7bdda16cbceb5306797209a98fbf1ed711b2da39fd8b966f6ebee5`.
Both final display candidates have real independent target-text reviews, with both `modelChecks`
and `effectiveModelChecks` false. Neither is eligible for COAC-250 or a passed-chapter count.
The original parent `uncertain`, new `uncertain`, candidates, notes and all raw outputs stay unchanged.

| canonical / target | display SHA | audit SHA | independent call | result |
| --- | --- | --- | --- | --- |
| nemata-jp-chapter-183-1 / b0018 | 973bbc3eb85dedaed18a5b11903b8002b8dffcade1e6d3a3f7bb25cd1684d45a | 2cd72bb8ba1482b8b529a864ab3b927303f565e419ccb174a27dda10fd8217e2 | 018687de-2b4f-4af5-b82f-f4934c12f974 | needs-repair / uncertain |
| nemata-jp-chapter-236-1 / b0003 | 6193212639b7c8abb42adf64b69759a5d00effc67c1f20d2c9ae681ded121a28 | d2c9dfe09838a15c845ae3bab8f698729bd99a22878bbb23af1f268849948aeb | 7a1363b3-906b-4155-9643-2a3924d3dfd1 | needs-repair / uncertain |

The remaining list for this batch is:

| canonical / target | precise remaining blocker | next evidence needed; no new call authorized |
| --- | --- | --- |
| nemata-jp-chapter-183-1 / b0018 | Author text was judged faithful and complete. The review could not verify the editorial statistics because its actual projection included only b0016-b0019. The original “１枚切れ１枚見え” counting condition also remains unresolved. | Preserve the numbers and the uncertain review. Any future review needs separately authorized budget and the actual source/hash-bound b0007/b0008/b0011/b0012 statistical rows in its request; locating those rows alone is not semantic acceptance or a resolution of the counting ambiguity. |
| nemata-jp-chapter-236-1 / b0003 | Other claims, conditions, modality and exceptions were judged faithful/complete; “巡目が僅か” still does not settle early/elapsed versus remaining turns. | Keep the neutral author text and explicit non-author note. Obtain source-authoritative clarification before any separately authorized change/review; do not choose either timing reading or downgrade the uncertain issue. |

The 183 supplement is
`integration/coac249-183-source-context-supplement-20261028.json`, SHA256
`62c6215bffe24c3b1e8fa202c4c593032bd7d68db949c0f2dd490fd320ad3313`.
Its source `source.v2.json` SHA remains
`cb73d3a88d017081031a4de4961ae1a431c7ea24a384eed91865ac70a94b3cf3`.
Directly checking the bound source confirms b0007/b0008 contain `１枚切れ０枚持ち` role/guest
wind tiles at 4%/4%, and b0011/b0012 contain `１枚切れ１枚持ち` guest/role tiles at 3%/2%.
The raw first-review projection really omits all four rows. This establishes a review-context
visibility gap, **not an established numerical error**. Do not mechanically delete source-supported
numbers, upgrade to passed without review, alter old raw, or change severity to error/source-note.

Both independent calls used `gpt-6.1-sol/high`, empty image payloads and
`independent-target-text-review-plus-unchanged-parent-audit` from the unchanged 244 exact runtime.
The 18 dependencies and manifest remain SHA-bound. New audit raw SHA256 values are respectively
`60a24e84b6dc00b39f79281fae0b7fd1a120b1ade8f175c5985c0b348452e272` and
`8c08adf2edcc9391b697b78ba61922ee3ffb69aa715194f7df9abcd588d28039`.

| stage / chapter | call ID | input / output tokens | duration ms | outcome |
| --- | --- | --- | --- | --- |
| original production / 183 | 629d37ab-fdc9-462f-a29a-061ae3293fb0 | 12788 / 349 | 36780 | whitelist rejected |
| original production / 236 | abef6c4b-02ff-416f-b61d-1fe821402f1a | 13723 / 634 | 30842 | whitelist rejected |
| authorized new production / 183 | cf82e6c3-ca38-4f6e-98bc-5c81fb4a3428 | 14867 / 225 | 20887 | exact output; review uncertain |
| authorized new production / 236 | 62c5c6f7-d54c-45c1-92af-da36349b1f80 | 15104 / 330 | 57082 | exact output; review uncertain |
| first independent audit / 183 | 018687de-2b4f-4af5-b82f-f4934c12f974 | 13075 / 1153 | 39055 | needs-repair / uncertain |
| first independent audit / 236 | 7a1363b3-906b-4155-9643-2a3924d3dfd1 | 14300 / 1289 | 44055 | needs-repair / uncertain |

The six distinct local call records consume the entire authorization: **6/6, remaining 0**,
including failed/void outcomes. Audit-only usage is 27,375 input / 2,442 output; whole-batch known
usage is **83,857 input / 3,980 output / zero cached input**. Executor automatic retries remain zero.
Actual upstream execution count and monetary cost are unknown. No 234 or other chapter was dispatched,
no new consumer/wakeup was created, and formal active and shared selection/register are unchanged.
The one-shot return wakeup is already disabled after firing; it requires no recurring continuation.

`artifacts/b13-exact-review-return/verify-return.mjs` verifies existing evidence without a dispatch
path: handoff/supplement and 42 immutable references; exact raw/request/schema/projection/output and
candidate bindings; transport/usage; one audit ledger entry per display SHA; frozen checks retaining
uncertain; unchanged non-target blocks; and the six-call budget. It stores byte-exact copies of both
raw reviews/audits, handoff and supplement, plus the terminal result and remaining list. The original
review worktree request-boundary files were reclaimed; their exact bytes were recovered from existing
COAC-249 commit `722b23e` and match the original bound SHA. No request or review was reconstructed.

The ticket is **blocked**, with the finite batch exhausted and semantic/source ambiguities unresolved.
The existing draft PR is evidence delivery, not textbook approval or permission to close the issue.

## Batch 14: record 183 full-context pass and 236 fidelity diagnosis, 2026-10-28

This run adds **zero model calls** and consumes only existing COAC-249 evidence. The new 183
handoff is `integration/coac249-reviewed183-stat-context-v3-20261028.json`, SHA256
`9ff0d4891ae521a0d389686c3c0689967e3aceeb9ea073a0af8d21ceb078aac7`.
Its separate authorization is comment `01a17ef3-c615-7239-adda-3feb1b432e6f`, which added exactly
one full-context review. This changes the cumulative allowance from six to seven; it does not
erase or reclassify any of the original six calls.

The unchanged `nemata-jp-chapter-183-1` display SHA
`973bbc3eb85dedaed18a5b11903b8002b8dffcade1e6d3a3f7bb25cd1684d45a` now has a real independent
**passed** target-text receipt. All original 19 source blocks, including b0003 definitions and
b0005-b0013 statistics, actually appeared in the new request. Only b0018 is newly reviewed;
other content inherits the authenticated parent audit. The new reviewer found the neutral
author translation and explicit non-author note faithful and complete, retaining the author
counting doubt as a `source-note`. This is the new model's judgment, not a zero-call severity
edit. The old first review `018687de…`, its uncertain issue and every raw remain unchanged.

- New call: `2c2ab5c6-372c-46d9-bc12-7af409803ea0`, `gpt-6.1-sol/high`, images empty,
  17,042 input / 7,808 cached-input / 714 output tokens, 46,550 ms.
- New audit SHA256: `20bdc51f1fd8b7afbfafa5d550c186d5571e779a8e538de433021536e56c7d61`.
- New raw SHA256: `cb47737edc719765d5f76165a8e6190ba5279ce4ae8fe665a29a90cce97906c9`.
- Runtime: `coac249-stat183-context-v3-20261028`, manifest SHA256
  `f7da16a28767707dde26cd1020063c067374901844a153daf4cac297342e047b`.
  Its verifier consumes the separately bound context sidecar; the old frozen runtime does not.
- The existing COAC-249 handoff to COAC-250 requires the same display SHA, v3 verifier and
  source/parent/raw chain, with real MCP/Arena readback including the note and emphasis.
  No duplicate integration handoff was sent here and no integration success is claimed.

For `nemata-jp-chapter-236-1`, this phase adds **zero calls**. The existing diagnosis
`integration/coac249-236-fidelity-diagnosis-20261028.json` was already sent to COAC-244.
It mechanically confirms the approved deletion of the two characters `剩余`, all other author
characters/sourceSegments unchanged, and an explicit non-author note disclosing the unresolved
timing. The original review finds context and completeness faithful, while its uncertain issue
says “即使巡数很少” retains the source's early/remaining ambiguity and cannot confirm the
author's intended timing. It identifies no verifiable added timing assertion, omitted condition,
incorrect number or strengthened certainty in this neutral candidate. Distinguish that source
ambiguity from a proven translation defect; do not require invention of an unstated author fact.
This diagnosis is not a new semantic verdict: original call `7a1363b3…`, audit SHA `d2c9dfe0…`
and its `needs-repair / uncertain` status stay unchanged. No forced pass, rewording or review occurs.

Current remaining/acceptance state:

| canonical | current evidence | remaining owner action; no new call authorized |
| --- | --- | --- |
| nemata-jp-chapter-183-1 | New target-text review passed with all 19 source blocks as context; author ambiguity is explicitly retained as a source-note. | COAC-250 owns integration and actual MCP/Arena acceptance. Keep the same candidate and note; do not silently replace “见1张” with “持有1张”. |
| nemata-jp-chapter-236-1 | Original uncertain remains; zero-call diagnosis identifies no concrete new translation defect in the approved neutral wording. | COAC-244 owns assessment of fidelity versus recovery of an unstated source meaning. Preserve the old review and note; do not invent early/remaining timing, zero-call relabel it, or dispatch without separate authorization. |

Seven distinct local call records now consume **7/7, remaining 0**: four productions (including
the two whitelist failures), two original first reviews and one explicitly authorized 183 context
re-review. Known usage is **100,899 input / 7,808 cached input / 4,694 output tokens**; cached input
is included in input, not added again. Executor automatic retry remains zero. Monetary cost,
actual upstream execution count and remote weights remain unknown. The new handoff records that
an OS child process was not observed during this extra call; the request configuration and complete
raw are verified, and no stronger backend/process claim is made here.

Evidence in `artifacts/b14-stat183-return/` includes byte-exact handoff/new audit/raw, context
manifest, 236 diagnosis, seven-call result and verification. `verify-update.mjs` passes 37 immutable
reference checks, the actual 19-block projection/request/raw bindings and new v3 pass verification,
preserves the old reviews, checks 236's unchanged text/receipt and totals the seven-call budget.
It has no model dispatch path. This run does not repeat production, alter source/raw/frozen files,
create a consumer/wakeup, touch 234/other chapters, change shared registers or switch formal active.
The existing PR remains an evidence draft; this ticket and the whole-book goal are not complete.

## Batch 15 — 283 Q12 b0168 production (historical pre-audit state; see Batch 17)

Authorization `01a17f08-ea29-7998-9b93-505223235e4e` permits one production and one independent
first target audit, with failed/void calls counted and zero automatic retries. It excludes Q8,
the six tables and all other targets. The 244 evidence at commit `4376e441…` binds the complete
Q12 Japanese/Chinese context and the North-dora / 4s originals. Source, parent and old audit were
rehashed before dispatch; their raw files and all older failed calls remain unchanged.

| item | actual result |
| --- | --- |
| candidate | `chapter06-exercise003.coac269b0168r1.json`, SHA `b2417de19a50ec85609f75a4e07f07e002cf636785e1427948c06000a0967c2f` |
| only change | b0168 `摸到后再改为③即可，（由于摸入宝牌` → `摸到后再改为③即可，（由于摸入宝牌或` |
| preserved content | Other 1194 blocks, all 524 figure objects and flow order; no presentation conversion or manual candidate repair |
| real production | `ae79bc97-e5d0-426c-9845-4c5a1bd17135`, `gpt-6.1-sol/high`, actual images `[]` |
| raw | SHA `fd023633f265c3936839308224de763755bb3085675464c600ded6038bc74091`; actual prompt/schema equals the zero-call request boundary |
| usage / duration | 40,273 input / 0 cached input / 77 output; 12,913 ms |
| allowance | Production 1, independent audit 0 here; only 1 first audit remains for COAC-249; 0 retries; cost and upstream execution count unknown |
| handoff | `integration/coac269-283-b0168-handoff-249-20261028.json`, SHA `6010b8f24a800ca43699e0a631e301290fcd246db0e0a15774ced8c3f9dd2a4a` |
| queued existing owner | COAC-249 one-shot wakeup `01a17f12-b8fa-7851-a6ff-882447fa3922`; no extra consumer or duplicate assignment |

The frozen production entry uses the official 244 vision CLI unchanged. Its only production
extension is a bound exact-text request/schema and output guard, which rejects missing `或`,
punctuation changes, extra blocks or figures before writing a candidate. The original deferred
finding verifier used only batch/target/severity as a key; two distinct old errors on b0785 collide.
The scoped snapshot also includes the original issue SHA in that key. Both errors remain, along
with all 16 non-target deferred findings. Regression cases show omitted, modified and duplicate
deferred findings still reject. No severity or semantic acceptance rule was changed.

Production snapshot `coac269-283-b0168-exact-v1-20261028` manifest SHA is
`b1adb8d85258c8518f1f4df731debe48c20b180241fce8e9f56d7592433d55f4`.
It was not changed after dispatch. The separate **review-only** snapshot
`coac269-283-b0168-review-v1-20261028` manifest SHA is
`80aa8e8b361d01515d73e6728c4e63d32613ea0a3198ae7e09c21414efde4a3c`.
It retains the two original Q12 image attachments despite their unchanged-parent inheritance,
only for this exact source/parent/audit/group/target binding. The zero-call constructed request
contains all 45 Q12 source/Chinese blocks, only b0168 as a text target and no figure targets.
All other inputs use the prior scope behavior. CLI/model routing remains byte-identical to 244's
verified vision snapshot: that future two-image request must actually use **terra/max**.
This is prepared configuration, not evidence of a completed independent call.

`artifacts/b15-283-b0168/` contains the exact diff, raw, frozen manifests, narrow patches,
request boundaries, inheritance proof, slot/claim release receipts and 249 delivery record.
Actual checks run: `node preflight.mjs` (14 zero-call cases) and `node check-production.mjs`
(passed: exact single change, immutable inputs/manifests, production/raw/ledger validation,
full Q12 context, two image hashes, routing and isolation of the context exception).
`python run-production.py` completed once with exit 0; its atomic dispatch marker prevents reruns.
The early construction and old-entry rejections were zero-call checks, preserved separately.

COAC-249 must verify the actual request/response, including terra/max arguments and both images,
under its existing guard before returning a first target checkpoint. Passed batch010's 113 blocks
are inherited. Even if b0168 passes, the chapter stays `needs-repair` while unrelated original
findings remain; the exact checkpoint goes to the existing 244/250 aggregation. PR review is
separate from this textbook audit. No whole-chapter or integration acceptance is claimed.

## Batch 16 — unblock COAC-248 Windows checkout, delivery packaging only

User authorization `01a17f1a-05a6-7bd8-8179-837449191d83` identifies run
`01a17f16-8947-7e89-971e-fdea09027ce6`: environment preparation failed before `started_at`
because four delivery audit-copy paths exceeded Windows checkout limits (274–276 characters).
248's last owner run completed at `8baacd3`; current 248 active runs were empty and its branch
was not checked out. These owner/run checks were repeated before an expected-parent update.

The packaging-only fix is commit `a7f5201e90aa8846051c7f06f22e0bdac482968c`, normally pushed
to the original `agent/mika/coac-248` branch. The current task's HEAD stayed on
`agent/ticket/coac-269`: a private Git index prepared the foreign commit, then a compare-and-swap
updated only the idle 248 ref. No reset, clean, force push, global Git/OS setting change or
modification of a shared working tree occurred.

In `.multica/delivery/coac248-p217-admitted-20261028/`, four historical audit copies now use
`evidence/{parentAudit,rev1Audit,rev2Audit,rev3Audit}/audit.json` (Git reports four R100 renames).
The rebuilt ZIP uses the same paths. `path-map.json` preserves all 29 original processing paths,
original package paths, full SHA256 values and short package locations. Immutable admission,
candidate, source/raw/audit JSON references remain unchanged; package readers resolve their
logical paths through this map. The package-local attributes prevent checkout EOL conversion
from changing evidence hashes; no global setting was changed. The original build/finalize and
runtime scripts were left untouched and were not executed.

Read-only package verification passes all 29 input hashes, 48 unchanged Git-blob file hashes and
ZIP mappings. Five negative cases reject missing/duplicate/traversal mappings, wrong hashes and
modified audit bytes. One original path refers to an already removed old Multica worktree;
its admitted processing-root evidence copy matches the same recorded SHA. This was checked
without rewriting either original references or processing-root data.

A real clean checkout of the **same 248 branch** succeeded in a new owned Windows worktree
with exactly the failed run's path depth: 1,625 tracked files, maximum full path **250 UTF-16
characters**, and the read-only package verifier passed from that checkout. Only that clean
test worktree was removed through Git afterward. Unknown directories were not removed.

`artifacts/b16-pathfix/` records the exact foreign commit, owner exclusion, four rename/hash
proofs, manifest, patch, tests, actual checkout output and one-shot recovery of the original
wakeup. The original failed run remains in history. Recovery uses the existing rule and original
222 result-registration instruction, adding the fixed commit and retaining **3/3 used, 0 left**;
it authorizes no new production, review, paid probe or retry. Its actual runtime outcome is in
`recovery-result.json`. This fix makes zero textbook model calls and does not redo b0168 or
change textbook semantic/integration acceptance.

Recovery was observed actually **running**, with `started_at=2026-10-27T20:52:13Z`, as task
`01a17f22-6168-79e8-9a35-a079d7257485`. Its real worktree was checked read-only: branch
`agent/mika/coac-248`, HEAD containing `a7f5201`. The original rule fired exactly once and is
disabled; a guarded manual-trigger attempt stopped before dispatch because the rule had already
fired. The downstream task's final result-registration outcome remains owned by 248.

## Batch 17 — 283 b0168 first independent target review passed; zero-call registration

COAC-249 returned `integration/coac249-b0168-reviewed-target-20261028.json`, SHA
`3e718558ce87ec9476d1965defc9d3d81d1c5b98644ca5f1d44e95cc218db98c`.
The same candidate `b2417de1…967c2f` has a **passed target checkpoint**, not whole-chapter
acceptance. The reviewer finds the sole target faithful, its context faithful,
`completeTargetScopeCompared=true`, and no new issues. Its full modelReview is retained.

| actual call | configuration / images | input / cached / output | duration |
| --- | --- | --- | --- |
| production `ae79bc97-e5d0-426c-9845-4c5a1bd17135` | sol/high; 0 | 40,273 / 0 / 77 | 12,913 ms |
| first independent target audit `3bbbff33-f638-4b9c-ae03-01b8d77e2a5a` | terra/max; North-dora and 4s original PNGs, 2 | 51,957 / 0 / 7,936 | 109,070 ms |

Total: **2/2 calls, remaining 0, retry 0**, 92,230 input / 0 cached / 8,013 output tokens,
121,983 ms summed call duration. Failed/void would count; the audit really completed successfully.
Money, upstream execution count and remote weights remain unknown. Both maker and audit guards
have their original normal-release receipts. This run only reads and records results.

The aggregate audit SHA is `d7c8b54d6b4bef37a4c6c0a97b88831a551ce4be8eb938fe51823a9ea1e401df`;
the target checkpoint SHA is `311df0ca752e1b34dfea16e2f07192f61dd886905b0a87fbdf8cf7d167314e5e`;
the independent raw SHA is `4f7193e61c9dd86512e8cd6ec86c7d2840176c92e127d46b6933a4bc365443db`.
All three are copied byte-for-byte into `artifacts/b17-b0168-return/` alongside the handoff,
31-file runtime manifest, actual process argv, guard release and original verifier results.

`node artifacts/b17-b0168-return/verify-return.mjs` passed **95 immutable SHA checks**, plus
exact candidate diff, schema/prompt/image equality with the published request boundary, both
original image hashes/bytes/order, actual terra/max argv, session completion, one audit ledger
entry for this SHA and complete non-target review inheritance. The 127-block group projection
contains all 45 Q12 Japanese/Chinese blocks; only b0168 is a text target, with no figure targets.
The caller's sol/high defaults are recorded honestly; the unchanged 244 CLI resolves images to
the actual terra/max request. Planner/transport image path separators are aliases; actual
transport strings match the published boundary. No labels, raw or frozen runtime were changed.

Both original verification boundaries were exercised without model dispatch. The same frozen
`verifyGroupRevisionAudit` validates checkpoint/raw/parent inheritance and aggregate assembly.
The generic `verifyAuditForWebCandidate` rejects with `web_audit_not_passed_or_inputs_changed`
because the aggregate is still needs-repair. The original wrapper exit 1 therefore does **not**
mean a failed model call and does not authorize retry or a fabricated whole-article pass.

All **16 non-target original deferred findings** remain in this aggregate, plus the inherited
source notes and original non-target checks. Batch010's **113 passed blocks** are inherited.
Q8 b0099, other texts b0396/b0502/b0962/b1017/b1181, complex figures b0785/b0947 and table
findings stay with the existing 244/250 owners; the six-table 66-target supplement has its own
source/candidate binding and cannot be silently applied by replacing a full candidate here.
The target checkpoint may be aggregated only within these precise SHA and scope boundaries.

COAC-249 already dispatched this exact evidence to 244 (`01a17f24-da49-7a9c-be0a-3781506faf14`)
and 250 (`01a17f24-dff8-7161-baa0-ebe156f42689`). Their original dispatch receipts are retained;
no duplicate wakeup or consumer was created. Do not integrate this needs-repair chapter, re-review
1195 blocks, reuse the exhausted allowance or change active. The received one-shot 269 wakeup
was already disabled after firing. Prior 183/236/234 records and the Windows path repair remain
unchanged. The whole ticket and book are not complete; textbook review is separate from PR review.

## Batch18 — exact b0396/b0962 production on the b0168 candidate chain

Authorization `01a17f45-77b4-7734-91bc-d2fbcc796af6` permits two text targets, each at most one
production and one first independent target audit, maximum4 new calls, failed/void included,
zero retry. Packets from244 commit `3e036cc` were SHA-checked. The real parent is `b2417de1…`,
with aggregate `d7c8b54d…` and its actual passed b0168 checkpoint. This does not fork the old parent.

New candidate `chapter06-exercise003.coac269t396962r1.json` SHA:
`00074d1c55051aa61e463d466a3ae43c2e4c5a9967c3aa291996656d2e09cbe2`.

| target | exact produced change | retained context |
| --- | --- | --- |
| b0396 | `选择进张宽的④。即使是失算的` → `选择进张宽的④。即使出现不利的` | Complete Q24,13 original PNGs; 5s/三色 and adjacent source/translation/image sequence unchanged |
| b0962 | Two enumeration `、` characters between 立直/断幺九/平和 become fullwidth `＋` | Complete Q61,12 original PNGs; combination, alternative345三色 and both 染手 judgments unchanged |

The existing producer/verifier requires one real raw per revised group. Groups004/009 ran
sequentially within **one candidate**; a single call cannot legally substitute for two group raw
records. No extra calls were made to use up the allowance.

| production call | actual model/effort/images | input/cached/output | duration | raw SHA |
| --- | --- | --- | --- | --- |
| `c62e2ea9-2a46-4312-bb4d-8840d5c267e3` | terra/max/13 | 54291/0/160 | 26586ms | `8fe5f41c5617129a61eaafad08d0d10bd54ff22c49b9a13191351993073fe801` |
| `afb88d4f-143c-4fcc-a2be-204d577d7019` | terra/max/12 | 55801/0/243 | 33498ms | `8ee9cb6cdddcffa902d12df62cf53e8f7ff1cbd9dfe7fe4e53a8060d82c9ff21` |

Total **110092 input/0 cached/403 output**,60084ms summed call duration. Production used2,
audit0 here, only two first target audits remain. Both calls completed;0retry/0failed/0void.
Fees, upstream execution count and remote weights are unknown. Maker-B and claim released normally.

Runtime `coac269-283-396962-v1-20261028` manifest SHA:
`f3823e2c50caf5248bc7757eb07c4b3cb363b5b4606505458e44817d7d3f47d3`.
CLI is byte-identical to244's verified vision-production-schema-v2; provider/credentials/gateway
unchanged. Actual prompt/schema use only the exact per-target contract, with no generic retranslation
or Markdown instruction. Output is checked before assignment, full candidate whitelist before writing,
and frozen dependency/source/parent/audit/image SHA plus STOP before each dispatch.

The old group entry rejects an incremental parent and non-target errors in a revised group. The
minimal continuation is bound only to this exact parent/audit and two IDs/groups. It validates the
real parent production/raw and b0168 independent checkpoint, follows the original eleven-group
chain and verified plan, and defers every other original issue by SHA. No fabricated full-parent
receipt or severity change. Other scopes keep their old rejection. Future review inherits nine
unchanged groups, including b0168 and batch010's113 passed blocks;14 original non-target issues
remain in the raw deferred list. Separately accepted table/Q8 proofs retain their bindings and limits.

`node preflight.mjs` passed **32 zero-call checks**: old-entry refusal, real full parent chain,
missing/modified/duplicate deferred refusal, wrong parent/foreign targets, stale text, punctuation,
Markdown, extra output, non-target text/figure/order/tableContext changes, and both actual schema-v2
request constructions with13/12 images. Early plan-loader and reused request-output-folder errors
were fixed before dispatch with0model calls. `python run.py` ran once,exit0. `node selfcheck.mjs`
passed actual raw/ledger/request/output bindings, two changed/1193 unchanged blocks, all524 figures,
b0168 preservation, review-request construction, table scope identity and Q8 receipt/raw/limits
inheritance. Source, old candidate/raw/audit and old frozen files were not rewritten.

Handoff `integration/coac269-283-396962-handoff-249-20261028.json` SHA:
`de65ecb2fb34c5213514e438796ae60f01a489232c53e5667cbcac2a119f7262`.
Shared run-directory request boundaries avoid ephemeral worktree dependencies. Wakeup
`01a17f51-13e0-730c-82ba-507b742ae1b8` queues the existing249 consumer only. It must deduplicate
same-SHA raw/ledger/checkpoints, use its existing guard, and spend at most one first audit per group,
terra/max with actual13/12 originals. Only b0396/b0962 are targets, no figure targets. After collection,
same-runtime `verifyGroupRevisionAudit` validates target checkpoints and merge. Whole-chapter
needs-repair refusal is preserved, not a transport failure/retry reason. Results go to269 and
existing244/250 per-target aggregation. No independent pass or whole-chapter acceptance is claimed.

## Batch19 — register b0396/b0962 independent target passes (zero new calls)

Both real first target checkpoints on candidate
`00074d1c55051aa61e463d466a3ae43c2e4c5a9967c3aa291996656d2e09cbe2` passed.
The aggregate audit remains **needs-repair**, SHA
`81313304a429d04c4895798824756d0be0b23d0c03dc0ab6e7f4aa77aa1699f8`.
No production, review, image reading or integration consumer was dispatched in this return.

| target | first independent call | actual configuration | input/cache/output | ms | checkpoint SHA |
| --- | --- | --- | --- | --- | --- |
| b0396/group004 | c500112c-2e65-418d-bda9-8948ea4d6e16 | gpt-6.1-terra/max,13 original PNG | 53785/0/1236 | 19486 | e0bce7ea57114babe0e0adfe650f659f98b491d6fd69ecd7d982cb2113d8b726 |
| b0962/group009 | 1ca0aa10-d2d0-489c-8f89-ca667e4cba4f | gpt-6.1-terra/max,12 original PNG | 55104/0/2182 | 33026 | 882344e39af1888d3367ebb5154642cb09e5f9f20cd1a0cc6d8fa8fe721762f0 |

Both original reviews say faithful, complete target scope compared, context faithful, issues empty.
Actual transport prompt/schema match Batch18's published requests; actual argv/model/effort and
all image paths/SHA/bytes/order are verified, with session events and successful CLI results retained.
`verifyGroupRevisionAudit` verifies the checkpoints, raw calls, parent chain and aggregate.
`verifyAuditForWebCandidate` still rejects `web_audit_not_passed_or_inputs_changed`; that expected
whole-chapter refusal is not a transport failure or reason to retry. No audit or raw was rewritten.

`artifacts/b19-return/capture.py` captured96 immutable files with full path/SHA mapping and short
filenames. `node artifacts/b19-return/verify-return.mjs` passed391 hash checks, including before/after
source/parent/raw/runtime checks and all32 frozen files. It independently checks the exact two text
changes,1193 unchanged blocks,524 unchanged figure objects,9 inherited groups and batch010's113
passed blocks. Six-table137 blocks/94 figures, Q8's21 blocks/7 figures and mandatory unknown limits,
and b0168's passed scope remain unchanged, bound by249's explicit scope inheritance proof.

The ticket-local `effective-remaining.json` applies only these two checkpoints to the pinned250
register (SHA `d4026baa2839fde5692aaae971ec2194dba4bb29797ec10d2f4a1d7c379abe9c`).
Every other issue row, original issue SHA/severity and its supplement evidence is preserved.
Of19 original findings,10 are resolved by existing evidence,7 blocking findings remain across
`b0785:figure`(3), `b0947:figure`(2), `b1017`(1), `b1181`(1), plus2 unchanged source-notes.
The aggregate's14 non-target blocking raw findings remain present;7 already have accepted separate
supplements. This is an effective view, not a mutation of250's shared register or whole-chapter pass.

Full batch ledger in `verification.json`: maker2 + independent first review2 = **4/4**, remaining0,
failed/void0, retry0;218981 input/0 cached/3821 output tokens,112596ms summed call durations.
Money, remote weights and upstream actual execution count are unknown. Original guard release
and existing244/250 dispatch receipts are captured. Existing wakeups
`01a17f62-5724-7cf6-96ae-788556431ef6` and `01a17f62-5acb-74e2-a8a4-93f2565325cd`
own downstream aggregation; no duplicate wakeup was created. Other chapters and branch scopes
were untouched, including159/242 and PDF218–220. The ticket remains in_progress; no full-chapter
integration or active-pointer change was made.

## Batch20 — exact b1017/b1181 production and first-audit handoff

Authorization:269 comment `01a17f72-535c-762b-b136-2bbacd5c6cae`, maximum two existing clear-error
text targets, each one production and one first audit, maximum4 real calls, failed/void counted,
zero retries. The actual250 effective register SHA
`6d122aa508b6eb57a4122472c52bd96ee78e1b54ec8d1299ac77c0aa1e688617` retains7 blocking findings.
The two qualifying text errors have complete source/conditions; complex b0785/b0947 figure errors,
public unknowns and source-notes remain untouched. Neither severity nor unknown status was changed.

Parent SHA `00074d1c55051aa61e463d466a3ae43c2e4c5a9967c3aa291996656d2e09cbe2`, real parent audit
`81313304a429d04c4895798824756d0be0b23d0c03dc0ab6e7f4aa77aa1699f8`.
New candidate SHA `b90f7c4fbedb5b6498a1a783cf514303c23288eae36e73624788d2142f507458`.

- `modern-yabejp-ja:chapter06-exercise003:b1017` (group009): only `三元牌役种` becomes
  `三元役（小三元／大三元）`. Complete Q65 b1008–b1021 and11 original PNGs bind the source term,
  white/red dragon pairs, single green dragon, dora, honitsu/toitoi and discard conditions.
  The parentheses expand a translated source term; they are not represented as verbatim Japanese
  or a separate authorial claim/editorial note.
- `modern-yabejp-ja:chapter06-exercise003:b1181` (group011): only the text becomes
  `这一条件即使不成立，也应优先于其他对子保留双两面形。`. It joins the unchanged preceding
  b1179 `宝牌` and b1180 3m figure into an explicit concession. Complete Q78 b1169–b1189 and15
  original PNGs preserve double-sided shape and duplicate-acceptance reasoning. Adjacent text,
  image sequence and all original numerical/hand conditions are unchanged.

| target | production call | actual model/effort/images | input/cache/output | ms | raw SHA |
| --- | --- | --- | --- | --- | --- |
| b1017 | 7bfe50e0-73ac-4d57-b3eb-c0a1bb6937f1 | gpt-6.1-terra/max/11 | 24642/0/106 | 35985 | ba2804c56a1a0cb4a218beb99e56484dc45cc98b5bb29df5e685287fe546b1db |
| b1181 | 2ba838ef-ba1a-4f63-af3a-e5f6b7ab9de1 | gpt-6.1-terra/max/15 | 28278/0/129 | 8350 | 7f8f7c33f0b09686a41296dbd0ab6eb1717b7ce490d62cc93d58afd1dfe5f322 |

Totals:52920 input/0 cached/235 output tokens,44335ms, production2/first-audit0 here, two first
audits reserved; failed/void0, retry0. Money and upstream actual executions are unknown. Producer
completed once with exit0; original maker-B and chapter claim released normally. Full raw including
requestExecution/actual CLI args, ordered image SHA/bytes, session/events/schema/prompt/output is retained.

Frozen `audit/runtimes/coac269-283-10171181-v1-20261028/runtime-manifest.json` SHA
`c339edcd5c38e35473ab1c726197730ae92675fe761bc548ee24c59182b19718` binds32 files. CLI is byte-identical
to244's verified vision production schema-v2. The exact producer helper is reused with the new
fixed contract, overriding the generic retranslation prompt before actual request construction and
restricting schema text to the single expected value. Output and complete-candidate checks reject
non-whitelisted punctuation, Markdown, notes, blocks, images, sourceSegments/tableContext or order.
The audit adapter preserves previous exact-parent validation and adds only this current parent/notes,
two IDs/groups, real parent audit verification and unchanged original batch-plan inheritance. All
other errors remain deferred by original issue SHA/severity. No old frozen runtime/raw was rewritten.

`node artifacts/b20-10171181/preflight.mjs` passed34 zero-call cases, including old-entry refusal,
real original/parent review chain, missing/modified/duplicate deferred rejection, foreign scope,
changed original passed targets, extra text/notes/figures/order/tableContext, and both actual schema-v2
requests (11/15 images, exact enum). Before dispatch, the initial local plan check refused the new
incremental parent; an exact byte-bound ancestor-plan case resolved it. A local register assertion
then refused the unified row's original rev1 SHA; the runner now requires both that original binding
and250's pinned latest-candidate/latest-audit sidecar. Both refusals were before dispatch and0 model
calls; they are not failed/void remote calls or paid retries. Final frozen bytes passed before dispatch
and after collection. `python run.py` then completed two successful model calls; `node selfcheck.mjs`
passed actual request/raw/ledger/output and recursive production/parent-audit checks.

Selfcheck independently preserves1193 body blocks, all524 figure objects, passed0168/0396/0962 scopes,
six-table137 blocks/94 figures and the original read-only supplement verifier, Q8's receipt/raw and
mandatory unknown limits, batch010113 blocks and tableContext. Complete standard parent receipts
and raw remain inherited; group009's new1017 target does not re-review0962.

Shared handoff `integration/coac269-283-10171181-handoff-249-20261028.json` SHA
`25dc6daa874ad5425a49c57e60d793080616de9a807776aec301c1d291f57a9a` publishes exact review requests
and shared immutable paths, avoiding a temporary worktree dependency. The initial249 snapshot had
no active run, matching wakeup, same-SHA audit ledger call or standard audit. Its one-shot wakeup
`01a17f78-c13a-7ee3-83f7-1a4088f383a1` carries only the reserved two first audits and existing guard.
The same rule was explicitly triggered once (`triggered:true`); readback still reports fire_count0,
last_task_id null, with another249 run active and another queued. Therefore this handoff is durably
registered pending249, not an audit start or result. No second rule/consumer or further trigger was added.
It must recheck deduplication/guard, use real terra/max image payloads, and preserve all failed calls.
Both target and generic whole-article verifier outcomes must be collected; expected whole-chapter
needs-repair refusal cannot cause a retry. Genuine results return to this authorization thread and
existing244/250 item aggregation. No new independent pass, reduced effective blocking count,
whole-chapter integration or active-pointer change is claimed here. Ticket and draft PR remain open.

## Batch21 — register mixed1017/1181 first-audit results (zero new calls)

COAC-249 completed both real first target audits on the exact Batch20 candidate. Result
`integration/coac249-283-10171181-reviewed-20261028.json` SHA
`6b466c5f6ec7552960fd321f74c4016fd51f62c802437e4ca7657623ca80cf1f`; explicit scope inheritance
`integration/coac249-283-10171181-scope-inheritance-20261028.json` SHA
`a5765f56d01f99f16a54819a0c2ff674e2828a861acf234e8cc1d148336efae9`.

| target | first independent call | actual model/effort/images | input/cache/output | ms | status |
| --- | --- | --- | --- | --- | --- |
| b1017/group009 | 53722d02-3924-4fba-b304-68df1b2b45f0 | gpt-6.1-terra/max/11 | 54986/0/2925 | 62530 | needs-repair |
| b1181/group011 | 236cb892-1825-4c9d-801e-e889c71681d5 | gpt-6.1-terra/max/15 | 35773/0/1189 | 26866 | passed |

1017's complete new review says the source 三元役 is not explicitly restricted to 小三元／大三元;
the added parenthesis introduces an unsupported restriction. Its actual error and modelChecks=false
are retained. Independent minimal suggestion: remove the parenthesis, retaining 三元役 rather than
the old 三元牌役种. This is recorded only for future authorized work; no candidate edit, production,
retry or re-review is authorized by this return. Q65's dora6s, honitsu/toitoi,2m comparison and
context continuity were faithful. Checkpoint SHA
`109b6aefd9597ea6c0b74c3d1069515a7edfb9a69761ddab9a6bd1bb00085c49`, raw SHA
`da68153eccbd6de19017bafd73c67404e0c31f56dbcda103264d9a6167c2b1e9`.

1181's review confirms the concession even if3m is not dora, preserving the comparison direction
and complete Q78 duplicate-acceptance reasoning. Checkpoint SHA
`a7d7d184db39c9bb4ea73ae7bf0a895fe555e0b5fdce9ec44fc24d2d71e268c3`, raw SHA
`a9d691972b6443f956e81277717ed1f26f518bbf8309879bf3a87ae85626914e`.

The standard aggregate SHA is
`93366b71af9e39d56305d20f7cf2b88a9a5b84ce24b80c2cbcf135008f0616df`, still needs-repair.
`node artifacts/b21-return/verify-return.mjs` passed424 hash checks before/after read-only validation,
including99 captured immutable files and all32 frozen dependencies. It verifies both checkpoints,
full modelReview/raw/session/events, actual CLI model/effort/image arguments and11/15 image hashes,
byte sizes and order against Batch20's published review requests. Same-SHA standard ledger has
exactly these two independent calls. `verifyGroupRevisionAudit` verifies the real checkpoints,
parent chain and merged aggregate; `verifyAuditForWebCandidate` still rejects
`web_audit_not_passed_or_inputs_changed`. Expected whole-chapter refusal is not transport failure.

The verifier independently preserves1193 non-target blocks and524 figure objects,9 inherited groups
including batch010113 passed blocks,0168/0396/0962 original passed evidence (0962 remains inherited
despite009's new1017 target), six-table137 blocks/94 figures, and Q8's21 blocks/7 figures and original
unknown limits. All12 original non-target deferred blocking issues and2 source-notes retain their
original issue SHA/severity;1017's new independent error is separately preserved, not overwritten
with its older suggested repair. No source/candidate/raw/audit/frozen runtime was modified.

`artifacts/b21-return/effective-remaining.json` is a ticket-local view of the exact pinned250
7-blocker register plus these two real review results. It closes only1181;1017 remains open with
its complete current independent issue and SHA, while preserving the original issue/SHA as lineage.
All other rows are byte-equivalent as JSON objects. Of19 original findings,11 are resolved,
6 blockers remain across b0785:figure(3), b0947:figure(2), b1017(1), plus2 unchanged source-notes.
The aggregate still retains12 non-target blocking findings (7 already have separate accepted
supplements) plus the current1017 error. Historical raw findings are not new remaining gaps.
Shared244/250 registers, other branches, integration selection and active pointer remain untouched.

Final batch ledger: maker2 + first independent audit2 = **4/4, remaining0, failed/void0, retry0**.
Totals143679 input/0 cached/4349 output tokens,133731ms summed durations. Both audits completed
transport successfully;1017's semantic needs-repair does not erase its call. Money, remote weights
and upstream actual execution total are unknown.249 reports its original guard released normally.
Original249 wakeup fired once; the current return rule is once/already disabled, so no extra wakeup
was created. Existing244 wakeup `01a17f8b-0142-783a-9187-28224a55f195` and250 wakeup
`01a17f8b-04d6-7d86-8359-fb7f6fb1e66d` have each fired once for this evidence. No new consumer,
model call, chapter admission or full-chapter pass was added here. Ticket remains in_progress while
existing owners aggregate the exact results; the draft software PR is not textbook acceptance.

## Batch22 — unblock250 Windows checkout, packaging only

User instruction `01a17f92-9b94-7ecd-a75b-3bfacf6565fe` identifies250 run
`01a17f90-dd76-7202-b0b2-d4f39be097e0`: environment preparation failed before started_at.
The exact failed run, original wakeup and latest250 owner completion were read. Active250 runs
were empty and its branch was not checked out; those checks were repeated immediately before
the expected-parent ref update. There was no active writer whose worktree or changes were edited.

The packaging fix is `a9e9faa581480d956701ac0b2c01e24f33811a33`, normally pushed to
`agent/mika/coac-250`, directly on `f1435b192a5ce02935b5145b6cb19f9b2a5ed2b3`.
The private Git index/commit-tree method used for248 was reused; only the idle250 ref was updated
by compare-and-swap.269's HEAD and index remained unchanged on `agent/ticket/coac-269` throughout
the foreign-branch operation. No reset, clean, force push, shared-worktree switch or global Git/OS
configuration change occurred. The completed v29/238-chapter integration was not rebuilt.

The whole3153-file original tree was checked at the real managed Windows root, not just the four
reported images. Eight paths violated the new strict <240 limit: four267-character image paths
and four256–258-character audit-copy paths. Twelve image copies across all three217 display asset
directories now use `a01.png`–`a04.png`; four upstream audit copies now use `audit.json` in their
separate directories. All16 renamed files retain their original Git blob IDs, complete SHA256,
bytes and image order. No raw/candidate/source/independent receipt bytes or severities changed.

Eight local wrapper files changed: image src and enlargement href references, relative image paths
in two display corpus/body pairs, the local archive hash index, and the package README. Inverse
alias checks reproduce original HTML bytes and original JSON objects exactly. Absolute data-root
references and historical original receipt/body hashes remain provenance, not new audit results.
`_analysis/path250/manifest.json` records full original paths, blob IDs/SHA and new aliases plus
original/current wrapper hashes. Its original record is pinned to f1435b1, so no evidence is lost.
Only local packaging attributes prevent EOL conversion of the new manifest/checker; global settings
were read but not changed. Production/staging/build scripts and live data were not executed or edited.

`verify-package.py --tree <old-parent> --checkout-root <real-root>` reproduces checkout_path_length
on267-character paths. The same guard passes the prepared fixed tree. It verifies16 byte-identical
moves,8 wrapper edits,196 archive index entries,32 local image URLs and every tracked path. During
preflight it also caught a stale README archive hash and missing enlargement href alias; both were
corrected before any branch update or recovery, without weakening assertions or changing evidence.

Actual `git worktree add <managed-root>/coac-250-pfix49520001/worktree agent/mika/coac-250` passed.
That root has exactly the failed run's113-character depth. All3157 files check out cleanly; longest
full path is229 UTF16 characters, leaving11 characters below the240 boundary and31 below260.
The checked-out16 file hashes and new manifest SHA match Git objects. New ignored245-character files
in both `_analysis` and `.multica/delivery` were rejected by the guard, proving future packaging
checks include new files rather than only the old commit. Only those owned test files and the known,
clean test worktree were normally removed with no force. Unknown worktrees/directories were not deleted.

Before new delivery/_analysis packaging is committed or dispatched,250 must run
`python _analysis/path250/verify.py` from its task checkout. It scans the entire tracked tree plus
working files in both packaging trees using the actual managed root; alternative future roots can
be supplied with --checkout-root. It refuses paths at or above240 before a later worktree startup.

After push and another no-active-writer check, only the original once-only wakeup
`01a17f8f-d0c4-7d0f-a846-70af665c93e9` was restored once, preserving its complete zero-model
frontmatter registration instruction. Recovery task `01a17f9e-a0f7-78f2-9f88-f1df09ef5bd3` is tracked
through real platform started_at/branch ancestry, not inferred from registration. No second consumer,
model budget, re-OCR/review, v29 rebuild or automatic recovery retry was added. Original startup-failed
runs remain unchanged. Final startup proof is in `artifacts/b22-path250/started250.json`.

Recovery startup verified: `01a17f9e-a0f7-78f2-9f88-f1df09ef5bd3` actually started at `2026-10-27T23:23:00Z`.
Its real250 checkout HEAD `9830323a52ab656732e7ecdddd89f61b97efb3b3` contains the packaging fix; the single original
wakeup has fired once. This is actual started_at/branch evidence, not merely a queued task.
Only the restored original zero-model registration continues; this repair's work is complete.

## Batch23 — b1017 exact deletion, first target audit handed to249

Authorization `01a17f97-7b92-7797-8d8f-14284b6fa298` adds at most one maker and one
first target audit, two actual calls total, failed/void counted and zero retries. The250 path
recovery above completed before this phase. The latest effective register from244 has six
blocking findings; the newer1017 error, rather than its superseded historical suggestion,
is bound to the real independent call `53722d02-3924-4fba-b304-68df1b2b45f0` and original raw.

Current parent is `b90f7c4fbedb5b6498a1a783cf514303c23288eae36e73624788d2142f507458`,
parent audit `93366b71af9e39d56305d20f7cf2b88a9a5b84ce24b80c2cbcf135008f0616df`.
Only `modern-yabejp-ja:chapter06-exercise003:b1017` changes: delete
`（小三元／大三元）`, retaining `三元役` and every condition. Complete Q65 b1008–b1021
and11 original PNGs are bound. The existing web entry has no applicable deterministic text
raw derivation; one real maker was used, with no invented derivative receipt.

The frozen runtime `coac269-283-1017-v2-20261028` pins32 files plus the preceding snapshot
and244 schema-v2 manifest. Its new exact-parent adapter recursively verifies the existing
real production/review chain and binds only the current parent audit and this single target.
The244 CLI transport/provider configuration is byte-identical. The actual production request
uses a one-value expected-text enum before dispatch; output and candidate checks run before
candidate creation.25 zero-call checks pass, including the old entry's refusal, exact scope,
deferred issue hashes, wrong text/target, extra output, punctuation/emphasis, figures, order,
table fields and the real prompt/schema/model/image request construction. No source or raw
was rewritten and no gate was relaxed.

Real maker call `05ea64d4-b72a-4280-af42-a97fe5d88230` completed successfully:
**gpt-6.1-terra/max**,11 original images,25202 input/0 cached/138 output tokens,8651ms.
Raw SHA `1334bcd512640b35c6f31df7a515aacb0b6921f4fbd1801b947ff37690f941d2`;
candidate SHA `de3c0fa24705cbe88a7a7fd3b0da8de5b09d009db43227776aef4d90e444f95c`.
`selfcheck.mjs` verifies the actual closed prompt/schema, image order/SHA/bytes and session
events against the preflight, the unique ledger/raw and real production provenance. Exactly
one body block differs;1194 other blocks and524 complete figure objects remain identical.
b1181/0168/0396/0962 passed content, six-table137-block94-image scope, Q8 limitations,
tableContext/sourceSegments/order and batch010 inherit their original evidence. The maker-B
slot and chapter claim both released normally.

Shared handoff `integration/coac269-283-1017-repair-handoff-249-20261028.json` has SHA
`9d94cb1b0cc0c7b4f7638af347338aad6e9d376f7e112bacaf21933efcfc0877`.
Before enqueueing,249 was idle, with no same-SHA audit ledger, receipt, checkpoint or duplicate
handoff rule. Existing249 owner wakeup `01a17fb4-e2b4-7927-8de6-681ce7ed5bd3` receives the
published `review-requests.json` boundary, frozen verifier, full parent/raw chain and one
remaining first-audit allowance for group009/b1017 only. No new consumer or full-chapter
review was created. Its actual image request must use terra/max; caller labels are insufficient.

The effective six blockers remain open pending independent acceptance; this production does
not close1017. Original12 non-target deferred findings and two source-notes remain byte-bound.
The generic whole-chapter verifier's needs-repair refusal is expected and must remain visible;
the scoped verifier authenticates target checkpoints without declaring the chapter passed.
0785/0947 and all other chapters were untouched. No chapter was integrated or switched active.
This run used1/2 calls, zero failures/voids and zero retries; only one first target review remains.
Money, remote weights and upstream execution total are unknown. Evidence and executable checks
are in `artifacts/b23-1017`; all new package paths are checked at the real Windows root against
the strict240-character boundary before push. Ticket remains in_progress; draft PR74 is software
delivery evidence, not independent textbook acceptance.

The once-only249 wakeup has now fired exactly once. Its actual task
`01a17fb5-f985-78db-9011-b23a57c6f731` started at `2026-10-27T23:33:21Z` and was observed
running; `artifacts/b23-1017/handoff-started.json` records the real platform state. No independent
result or audit call is invented from that startup signal. The one reserved target-audit allowance
belongs exclusively to this249 handoff; this executor will not dispatch a second audit.

## Batch24 — b0785 seat repair, one real maker and bounded249 handoff

Authorization `01a18193-7e18-7193-8ca8-89c80dae4edd` confirms quota reset and adds exactly
one maker here plus at most one independent target call by existing249. Failed/void count;
zero automatic retries. This supersedes historical exhausted-budget summaries only for this
target. The prior b1017 repair is now independently passed: real call
`3a171a7b-e469-40ca-beeb-8495d353ce9b`, terra/max with11 images, checkpoint
`23e0fda1196b42064570ffe9cea5a2155c08f23a9b08fcfcb88dd8d9c578a5e8`.
Its candidate `de3c0fa24705cbe88a7a7fd3b0da8de5b09d009db43227776aef4d90e444f95c`
is this batch's current parent; b1017 is closed rather than awaiting another review.

244's recovery run failed during final reporting but its pushed commit
`5c7092a9d4cad1e40f74a561ecb7b0177cd56197` and51-file package are real. Every file
hash/size was recomputed; the shared manifest matches the pushed Git manifest byte-for-byte,
SHA `e72683343d3dae50758617467c2d1edfb25876a6ca886c66ef763a1325560c1d`.
The original recovery recorded84 evidence checks and27 preflight checks; this executor
read those results and independently ran39 bounded zero-call checks, without rerunning a
script that would rewrite the frozen recovery artifacts.

Only `modern-yabejp-ja:chapter06-exercise003:b0785:figure` changes. The explicitly bound
reviewed donor is rev2 `849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3`;
real original maker `9f557ee3-0c5e-4b7e-9f17-013466f46aa3` and independent audit
`51d6b447-2446-4afa-9c30-5d1d1b4dfcc5` authenticate its hand/hidden-hand distinction
and retained unknowns. Their actual historical sol/high labels remain unchanged; old raw
does not contain structured argv proof, which is not invented. The fixed new figure changes
only the donor's `左上东、右上北、左下南、右下西` to `左上西、右上北、左下南、右下东`.
The reviewed hand12355789m34688s, draw5s, hidden-hand/wall distinction, all seven unknowns,
caption/sourceNotes and other donor characters remain identical. This is an explicit
parent-and-reviewed-donor assembly, not a claim that the current parent's old hand was correct.

The frozen `coac269-283-0785-v1-20261028` manifest
`d167ab2e2beab21dda23336b40e341e1972ffbd894b2413702f04f8d08b3a4bb` pins34 files.
The preceding32 runtime files and244 schema-v2 CLI retain their bytes; the two additions are
only this exact target's contract and bounded entry. The original full-chapter gate remains
unchanged and the parent's `web_audit_not_passed_or_inputs_changed` refusal is preserved.
The new entry verifies genuine current-parent/donor production, audits, raw and source chains;
it does not invent a generic whole-chapter pass or broaden production permissions.

`preflight.mjs` passed39 zero-model checks before dispatch, including actual closed prompt,
portable schema-v2, argv model/effort/image order,16 complete ordered source/candidate pairs
(nine definitions and Q48 b0784–b0790), tableContext and all conditions. Wrong source/parent,
donor/context/table/image bindings, extra text/figures, wrong target, punctuation/unknown edits,
non-target body/figure/order/source changes and altered actual request configuration fail closed.
The output's one-value exact transcription constraint is wired into the real production request.

Real maker `2969ad28-e823-41dc-8b63-45523e78c4b5` completed successfully on
**gpt-6.1-terra/max**,4 ordered images: original JPG, original inline8s, original nearest-neighbor
x2 and central seat-panel x4. Usage30456 input/0 cached/1634 output,32623ms.
Raw SHA `a47e36013f7de9811cc0f37fb5b4c369bd3088e77e06e85a4b9953f81543bd43`;
new candidate SHA `434120af284195ddf27b491a1c2c4cd9ea25072d40e9c6a366bcd8ac3cb03b9b`.
The standard production ledger has exactly one matching real call. `selfcheck.mjs` verifies
raw execution/closed prompt/schema/images against the published request, completed session
events, immutable runtime/inputs, true provenance and the exact candidate diff. Its zero-call
review preview also constructs the actual terra/max four-image request without sending it.
All1195 body blocks and523 non-target complete figure objects are identical to the current parent;
0168/0396/0962/1181/1017/six-table/Q8/batch010 content inherits its existing evidence unchanged.
maker-B and canonical claim both released normally. No raw/source/parent receipt was rewritten.

Shared handoff `integration/coac269-283-0785-handoff-249-20261028.json` has SHA
`d9fb437f24d6c446c969be4abb7b519b50be7b7e5ad5c703488571a11a95646c`.
249 was idle and this candidate had no audit ledger row, receipt, checkpoint or duplicate rule
before the once-only existing-owner wakeup `01a181a8-86b1-7c8a-a106-e18c1cad6277` was created.
Only249 may consume the remaining one first target call; this executor made no independent call.
The published exact request and frozen `prepare0785Review`/`verify0785ReviewExecution` separate
seat fidelity from retained-unknown teaching impact. A target seat pass must not be represented
as unknown resolution, ordinary whole-chapter acceptance or permission to change active.

The recovery register contains19 original283 issues:12 supplemented, five not assembled and
two source-notes. Its real supplemental evidence, rather than counts of old deferred raw rows,
controls effective remaining findings. This production alone closes none. b0947's existing
real rev2 production/review belongs to244/250's separate exact inheritance assembly and was
neither repeated nor funded from this two-call batch. Other chapters, data roots, active and
other task branches were untouched. The issue stays in_progress; draft PR74 carries software
and evidence, not independent textbook acceptance. Maker1/2 used, failures/voids0, retries0;
one target audit is reserved exclusively to249. Money, remote weights and upstream total are
unknown. Evidence, raw and executable checks are in `artifacts/b24-0785`.

The249 once-only wakeup fired exactly once. Task `01a181aa-2362-75a5-b519-20a4a746d7f0`
actually started at `2026-10-28T08:41:35Z` and was observed running, recorded in
`artifacts/b24-0785/handoff-dispatched.json`. This is startup evidence only; no independent
call or acceptance result is inferred from it. This executor's real production count remains one.
The completed package's longest new Windows checkout path is207 characters at the actual
113-character root, below the strict240 limit. PR74 remains draft and the business issue in_progress.

## Batch25 —109/167 exact figure repairs and independent impact handoffs

Authorization `01a181af-e1d9-7e64-8dcf-1607be707075` adds two separate bounded chapters:
each may use one maker here and one combined repair/unknown-impact audit by existing249,
four actual calls maximum, failed/void counted and zero automatic retries. Their allowance
is independent of283/b0785 and248's182/201. This executor made two makers and no audits.
Neither chapter is accepted by production or software PR review.

The upstream244 ready package became available during this run; no model or slot was used
while it was unfinished. Its45 files were individually rehashed against manifest
`d8e012c8ca1112782678992dab142d91c51a940aa77aa39fb60702ec8dbe6d7b` in
`integration/coac244-ready109167-zero-20261028`.244 subsequently reported pushed commit
`eea024537dfecd396b088dc5f1ba6978b8db27da`. Its original24 negative checks are preparatory
evidence; the executable adapter and actual production request checks below are this run's work.
The ready templates were never submitted with a missing real candidate SHA.

The frozen `coac269-109167-exact-v1-20261028` runtime has30 files and final manifest
`814df700d298188dea14d20fd84ac818d1ded9a706e370bc7a1714141ad6a7a9`.
Its bounded adapter recognizes only the two literal article/source/parent/audit SHA tuples,
rehashes the full package, source HTML/main/assets, original maker/raw, auditor snapshot,
completed original independent raw/projection/schema and unique audit ledger, and validates
the complete parent review including every original uncertain. The unchanged generic entry's
`web_revision_notes_scope` rejection is explicitly tested. No256 exception or generic rewrite
permission is added; the original production/audit gates and provider configuration are unchanged.

76 zero-model checks passed before either dispatch. They cover exact output leaves and complete
context in the actual closed prompt/schema, actual terra/max argv and ordered image hashes/bytes;
wrong source/parent/audit, missing/reordered context, removed uncertain, altered unknowns,
extra/missing/duplicate/wrong targets, punctuation, caption/sourceNotes/kind/provenance, body,
figures/order/table/source changes and incorrect actual transport settings are rejected.
Two pre-call implementation checks first caught an array-valued ordered source pairing and
the legacy projection-v2 target-mark flag; these were corrected to match the real original
packet and frozen verifier semantics. Both unsubmitted manifests are archived, no raw/candidate
or call was created for those failed checks. The final runtime was unchanged across real calls.

109 is `79-cn-chapter-109-4` /`79-bilibili-cn:cv1729038`. Source
`b41f36cb12ccdfe98e4cde9633aa5b55a11fbb6931fcd11da475ac6d4fe3bdbc`, parent
`ba8f4468945fda73ed357ba1ec879fdcf2a1db5770fa490ee085e7af4fa00e22`, original audit
`254405ec0e5e50e057a662509f8ac087e4d1ed84c0e60b40e185182585130eda` remain bound.
Only the first6m becomes5m in b0004/b0006 transcription, preserving every other field/character.
All17 body blocks and five non-target figure objects remain identical. b0012's three original
unknowns and independent uncertain are untouched; their teaching impact is explicitly pending.
Real maker `ef137f7f-b64c-478d-befd-b3bb3f4975d0`: **terra/max, two original PNGs**,
27133 input/0 cached/466 output,12264ms. Candidate
`3cfe3a27bd799782d6ac8e626fcf97d26e1724ce544b6ccf26bcd740bd259dcb`.

167 is `79-cn-chapter-167-4` /`79-bilibili-cn:cv1754620`. Source
`e844d2f6c325b3cf0c2e23e23d92d5a2708b4c7ee73f9d56c9ca7118c442a3b9`, parent
`7279ba3604f55bb2fe84a8210b4d7f222f8391b284e8603f6cff4d79e6f30737`, original audit
`8c52da176b472a79f63b7cce50f29ce66710718beea7631b1cf3b0a2a9910c73` remain bound.
Only b0005's three approved direction/declaration descriptions change: distinguish the north
player's sideways7p riichi declaration from that player's other discards and remove the
contradictory no-sideways-card statement. All six body blocks, source/condition/numeric fields,
other figure fields and the south river's unknown manzu stay identical. The original single-frame
GIF and existing PNG alias were checked equal in size and every RGBA pixel, with zero image writes.
Real maker `11d4590c-c1f6-4f07-9479-1bea5db990b3`: **terra/max, one existing lossless PNG**,
23984 input/0 cached/1547 output,28384ms. Candidate
`5bfa90e3e15deb0c3f868ee1811fe50cdba75357f2805b3c37ed5f1d86538a58`.

Each `collect.mjs` run validates the genuine maker/raw/ledger/provenance, unchanged body and
non-target figures, original unknowns, closed prompt/schema/image bindings and completed session
events, then constructs the actual independent request without invoking it.109's review has all
17 ordered source/candidate/figure pairs and three images, including b0012;167's has all six
pairs and the one lossless image. Conditions/tableContext/sourceSegments/order remain in place.
The independent schema separates repair fidelity from explicit per-unknown author-claim impact
and mandatory display limits; it never silently converts the original uncertain to source-note,
error or ordinary chapter pass. Any limitation must be enforced by later lawful admission.

Shared handoffs (both target-only and bound to their real new candidate/raw) are:

- `integration/coac269-109167-109-handoff-249-20261028.json`, SHA
  `665ff5a899ba8d4abda41a3c1abb44af8dc83ba5f3b2c923586648928937568b`;
  existing-owner once rule `01a181ba-a13e-778c-8c22-5b546b3f18da`.
- `integration/coac269-109167-167-handoff-249-20261028.json`, SHA
  `8fba2f5d24de3012d723eed29bd8df86f255eea835503353dc7118058ba90e4b`;
  existing-owner once rule `01a181bb-978a-72b2-8c2d-89d90837ef1c`.

Before each handoff, the exact new SHA had no independent ledger row/receipt/checkpoint or
duplicate rule. Existing249 activity on other authorized chapters stays serialized by its
existing audit guard; no consumer, claim deletion, retry or duplicate independent call is added.
Each rule reserves at most one call for its own chapter. Registration is not a completed audit.
Both maker-B slots and chapter claims released normally before waiting for any independent result.
Original raw/failed receipts/unknowns remain immutable. No248 chapter or283 assembly/integration,
other branch, active switch or whole-chapter re-review was performed. Money, remote weights and
upstream execution counts are unknown. Evidence, actual raw, candidates, exact diffs and executable
checks are in `artifacts/b25-109167`; final Windows packaging uses strict paths below240 characters.
Issue remains in_progress and draft PR74 is software/evidence delivery only.

## Batch26 — consume b0785's real independent result, zero new calls

Wakeup `01a181b4-1e4a-7250-94cc-4fc9494e8813` delivers only the existing249 result to
the original authorization thread `01a18193-7e18-7193-8ca8-89c80dae4edd`. It is a completed
once rule, already disabled, and grants no new production/review/OCR calls. The earlier batch24
pending result is now replaced by the following three distinct actual outcomes:

- `seatVerdict=faithful`: upper-left west, upper-right north, lower-left south, lower-right east.
- `contextFaithful=true`, `unknownTeachingImpact=nonblocking-with-limits`,
  `limitedUnknownOkay=true`: the known hand and Q48 text support presenting the author's
  qualitative cut8s-riichi argument under the four exact display limitations.
- The original one `uncertain` remains unchanged, so the frozen verifier returns
  **`targetPassed=false`**, status `needs-repair-or-uncertain`. There is no ordinary target,
  whole-chapter or admission pass. No issue or verifier was edited to produce a better result.

Exact evidence was rehashed and actually verified: receipt
`49dc8c91614a3a4b726b41e69f3c2ddcdbd581c31973763930b222c11bd88b36`, raw
`15d6f153d54e1beb35b2405caa8943d6cf79ccb180a8badfd58917a676b1b9c5`, and inheritance
`bd8e040789cef358c4b615a3a97a2e6ee4edf896a8b7353ab418a4a56b4191a7`.
Candidate remains `434120af284195ddf27b491a1c2c4cd9ea25072d40e9c6a366bcd8ac3cb03b9b`.
The actual independent call `4690455a-50a9-4675-8572-27e789204cc6` used
**gpt-6.1-terra/max**, four ordered real images,25359 input/0 cached/9786 output,178648ms.
Exactly one standard audit ledger row exists for this new SHA. Actual argv/images/hash/bytes,
closed prompt/schema, full completed session and output match the frozen request. The original
maker `2969ad28-e823-41dc-8b63-45523e78c4b5` remains30456/0/1634 tokens,32623ms.
The batch is therefore maker1+review1=2/2, remaining0, retries0. This registration run adds0
model calls. Money, remote weights and upstream execution counts remain unknown.

`artifacts/b26-0785-result/consume.mjs` calls the original frozen `verify0785Production`,
`prepare0785Review` and `verify0785ReviewExecution` as read-only verifiers, matches the real
plan/raw/ledger, verifies all34 runtime files and original handoff, and authenticates the existing
inheritance references.1195 body blocks and523 non-target figure objects are identical to the
parent;0168/0396/0962/1181/1017, six tables137 blocks94 figures, Q8 and its limits, and batch010
retain their exact evidence. The candidate, source, parent/raw/audit, unknown/caption/sourceNotes
and runtime remain unchanged. No other chapter, in-flight109/167 work or283 source is produced.

Dedup found250 had already consumed this exact receipt in
`integration/coac250-b0785-evidence-intake-20261028.json`; it records display-contract pending,
not accepted.244 has already prepared the lawful non-author display contract at
`integration/coac244-283-bounded-merge-20261028/b0785-display-contract.json`, SHA
`1c8fefac153094fbde93e234961ef4475259ba38dbae3298779e542d271905ba`.
This run reuses its contract and read-only verifier; it does not rerun its builder, reassemble
b0947, write another branch or create a consumer/wakeup. That contract binds the unchanged
b0785 target object `a5920c978ed6c4d5893f7cb017f93200e2d9de672dfe8f1c969c813d144b841d`
on244's existing derived candidate `ff3b1f36ffbd8daa23509a7375d0aaee533648299d636af2fa51be47657965d7`.
The derived SHA is an explicit separately proven composition, not an alias for this production SHA.

All four actual `mandatoryLimits` are matched verbatim to the raw JSON fields and UTF8 quote
bindings. The existing contract labels them `来源限制（编者说明，非作者原文）`, anchors them
after Q48 heading b0784 and before target figure b0785, and binds unchanged default-condition
source blocks b0003–b0005. It preserves the full seven unknowns and original uncertain. The limits are:

1. 保留三张万子数字、受遮挡副露牌、三家隐手、骰点及裁切内容为未知，不补猜。
2. 区分正文默认条件与截图实况；不得用默认条件填补图中未知牌，或断言截图无鸣、牌河只有幺九字牌。
3. 不得由现有转录断言精确可见张数、牌山存量、改良概率或所有实战场况下的最优选择。
4. 本结论仅覆盖 b0785 的方位、保留未知及其对 Q48 论证呈现的影响。

The current accepted preview does not select this source chapter. The existing contract explicitly
has `actualMcpArenaReadback=null`; the read-only composition verifier returns
`displayInstalled=false`, `admissionGranted=false`, `wholeChapterAccepted=false`. Contract
mapping is ready, actual display is **not verified**. The next action belongs to existing250:
install all four exact non-author strings with Q48, verify defaults are distinguished from the
screenshot, preserve every unknown and inherited restriction, and perform real MCP/Arena readback
before any lawful chapter admission. This is display acceptance work, not another low-resolution
tile-reading or paid semantic task. Existing244's proof separates16 independently evidenced
original issues, one limited-unknown display acceptance item and two source-notes; this run does
not rewrite its account or convert the original raw issue to a different severity.

11 additional zero-model negative checks reject forged target/chapter pass, deleted/relabelled
uncertain, missing/paraphrased limits, author-note mislabelling, guessed unknowns, unanchored
notes, removed default conditions and invented readback. `verify-pack.py` rehashes the protected
evidence/runtime, validates artifact syntax and checks strict Windows paths below240 characters.
The own-namespace consumption report is `integration/coac269-b0785-result-consumed-20261028.json`;
its repo copy and immutable input copies are in `artifacts/b26-0785-result`. Status stays
in_progress; PR74 remains draft. Neither display installation nor independent textbook acceptance
is inferred from this successful zero-model registration.
