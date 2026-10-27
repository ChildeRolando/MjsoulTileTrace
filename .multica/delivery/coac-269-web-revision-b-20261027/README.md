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
