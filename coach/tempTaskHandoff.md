M6-A3 FINAL CLOSING REPAIR HANDOFF
=================================

Repository:
  ChildeRolando/MjsoulTileTrace

Authoritative branch:
  codex/m6-a3-completion

Current HEAD:
  eedffe55e5aaf633bb16d8de4c5c3eaf2aa20096

Accepted M6-A2 base:
  586f5b27129850314e8af6f845824819137da6cd

Current status:
  M6-A3 = NOT CLOSED

This handoff supersedes earlier A3 completion instructions where they conflict.

==================================================
0. SCOPE
==================================================

This is the FINAL A3 closing round.

Do NOT reopen already accepted/fixed A3 work unless a deterministic regression
is discovered.

Already considered correct and should be preserved:

- tile-less model `declare_riichi`
- actual `riichi_discard(tile, mode)` remains local-authoritative
- explicit typed `riichi_discard -> realizes -> declare_riichi`
- Mortal score remains on `declare_riichi`
- `declare_riichi` rejected on actual origin
- post_call fuuros ↔ local meld identity
- post_riichi trigger = canonical `riichi_declared`
- post_riichi spec wording corrected
- terminal typed actuals
- A2 global bipartite binding / no-greedy / monotonicity
- Tenhou raw -> canonical importer
- local-only discovery architecture
- coverage evidence manifest
- H2 continuity baseline:
    local = 125
    source = 113
    bound = 113
    unbound = 0
    ambiguous = 0
- old A2 3 source enumeration-debt rows recovered

Do NOT start M6-A4.
Do NOT start Mortal product UI.
Do NOT start Akagi.

Remaining closing work is limited to:

1. fix §21 outcome precedence
2. make acceptance runner actually execute the Mortal E2E path
3. make discovery/selection capable of driving all A3 coverage branches
4. collect real independent E2E evidence and close the matrix
5. reconcile the remaining ComparisonSet contract inconsistency
6. rerun final gates + update handoff/docs

==================================================
1. P0 — FIX §21 OUTCOME PRECEDENCE
==================================================

CURRENT BUG
-----------

`runMortalFullGameReview()` currently claims precedence:

  binding integrity
  -> no source
  -> source actual/local actual mismatch
  -> unsupported action
  -> coverage gate

but actual execution currently performs:

  ambiguous
  -> no_mortal_entry
  -> effectiveSupport === unsupported
  -> mortalActualMatchesLocal(...)
  -> coverage gate

Therefore a bound row with BOTH:

  source actual mismatch
AND
  unsupported source candidate/action surface

can be incorrectly classified as:

  unsupported_action

instead of the stronger integrity result:

  binding_mismatch / mortal_actual_mismatch

This violates the frozen §21 rule that support/coverage classification must not
hide source/local integrity mismatches.

REQUIRED ORDER
--------------

Refactor the row classification so the effective precedence is:

1. global report identity/perspective failure
2. local/source binding ambiguity/order failure
3. no source entry
4. local actual representation support
5. source actual ↔ local actual correspondence
6. source/model candidate surface support
7. real coverage gate
8. model completeness/comparability
9. factor/assembly
10. analysis_ready

Important distinction:

LOCAL unsupported:
  local actual cannot be represented
  may be classified before source actual correspondence if there is no
  meaningful local action to compare.

SOURCE candidate unsupported:
  MUST NOT classify before source actual/local actual correspondence.

Do not keep one merged `effectiveSupport` variable if that obscures the
precedence.

Prefer separating:

  localSupport
  sourceCandidateSupport

TESTS REQUIRED
--------------

Add explicit combination tests.

A.
  bound row
  local actual valid
  source actual mismatch
  source candidate type unsupported

Expected:
  outcome = binding_mismatch
  reason = mortal_actual_mismatch

NOT:
  unsupported_action

B.
  bound row
  local actual valid
  source actual matches
  source candidate unsupported

Expected:
  unsupported_action
  reason = mortal_candidate_action_not_supported

C.
  bound row
  source actual mismatch
  coverage branch uncovered

Expected:
  binding_mismatch

D.
  no source
  local action unsupported

Expected:
  no_mortal_entry

Preserve existing ambiguity/order precedence regressions.

==================================================
2. P0 — COMPLETE THE LIVE ACCEPTANCE RUNNER
==================================================

CURRENT GAP
-----------

`scripts/tenhou-acceptance.mjs` currently only executes:

  raw Tenhou
  -> mapTenhouRecord
  -> canonical validation
  -> replay

and then reports:

  Mortal stage:
    "not wired in this runner"

This is NOT the acceptance runner required by the frozen A3 spec.

The spec requires executable:

  selected game+seat
    -> independent Tenhou raw -> canonical/replay

AND independently:

  same game+seat
    -> Mortal submission/result
    -> fetch/parse report
    -> fingerprint/perspective validation
    -> global binding
    -> structured comparison
    -> ModelEvaluation
    -> StructuredAnalysisAssembly
    -> redacted evidence
    -> coverage manifest candidate

The acceptance runner must own/orchestrate that complete flow.

"Compose the desktop pipeline elsewhere" is not sufficient for A3 closing.

==================================================
3. ACCEPTANCE TRANSPORT ARCHITECTURE
==================================================

Reuse existing M6-A2 Mortal production primitives wherever possible.

Do NOT create a second ad hoc Mortal parser/reviewer.

Required conceptual flow:

  selection item
    {
      opaqueGameId,
      seat,
      rawTenhouPath / source locator
    }

  A. LOCAL SIDE
    raw Tenhou
      -> mapTenhouRecord(selfActor=seat)
      -> validateCanonicalEventStream
      -> replayCanonicalStream

  B. MODEL SIDE
    submit selected paipu+seat to Mortal
      OR reuse cached successful report
      -> wait/poll according to existing supported workflow
      -> fetchMortalReport
      -> MortalFetchedReport

  C. E2E
    validateMortalReportBinding
    -> runMortalFullGameReview
    -> accepted branch evidence extraction
    -> redacted artifact
    -> evidence hash

The runner should call the SAME:
  fetchMortalReport
  runMortalFullGameReview
  StructuredMortal
  ModelEvaluation
  StructuredAnalysisAssembly

No bypass.

==================================================
4. MORTAL COMMUNITY-SERVICE SAFETY
==================================================

The previous rate-limit policy stays mandatory.

Live submission policy:

  sequential only
  max concurrency = 1
  conservative base delay
  deterministic/randomized jitter
  checkpoint every state transition
  game+seat dedupe
  cache successful reports
  never resubmit a successful cached pair
  hard per-run submission budget

Recommended default:
  maxRequestsPerRun = small (e.g. 2–3)
  baseDelay >= 10 s
  positive jitter

Do not increase throughput merely to finish A3 faster.

If the current Mortal submission mechanism cannot be automated safely:

  STOP
  report exact missing transport capability

Do NOT silently fake acceptance from local dry-run artifacts.

==================================================
5. CHECKPOINT STATE MUST REPRESENT BOTH HALVES
==================================================

Current checkpoint semantics only represent local planning/execution.

Extend the checkpoint so each selected pair can survive interruption across:

  local_ready
  mortal_submission_pending
  mortal_submitted
  report_pending
  report_ready
  review_complete
  accepted
  failed

Exact enum names are implementation choice.

Must persist enough opaque metadata to resume without resubmission.

Must NOT persist:
  raw report URL in public artifact
  names
  account identifiers

If a secret/result locator must exist for resume:
  store only in private job state
  0600
  never copy into final evidence manifest/handoff.

==================================================
6. P0 — COMPLETE DISCOVERY SELECTION FOR ALL BRANCHES
==================================================

CURRENT LIMITATION
------------------

Current discovery reports aggregate counts for all branches, but candidate
selection metadata is primarily implemented for:

  dama_with_riichi_candidate

Also:

  dama_with_tsumo_candidate = 0
  needsHandStructureEngine = true

This is insufficient for fully automated coverage-driven acceptance.

REQUIRED CHANGE
---------------

Discovery must be able to produce concrete candidate:

  (opaque game id, seat, branch, local decision locator)

for every locally discoverable A3 branch:

  riichi_window
  post_call_chi
  post_call_pon
  post_riichi
  self_turn_tsumo_actual
  self_turn_ankan
  self_turn_kakan
  self_turn_kyuushu

and suitable local windows for:

  dama_with_riichi_candidate
  dama_with_tsumo_candidate

Do not merely report aggregate hit counts.

The acceptance planner needs to know WHICH game+seat to submit.

==================================================
7. Dama-with-tsumo DISCOVERY
==================================================

Frozen branch:

  dama_with_tsumo_candidate

means:

  local actual = discard
  model candidate set contains tsumo/hora

Local discovery does NOT need to prove the Mortal candidate exists.

But it must identify windows where the player could legally win by tsumo
before choosing discard.

This requires hand-structure/completion knowledge.

Current hard-coded:

  damaTsumoCandidateWindows = 0
  needsHandStructureEngine = true

is honest but does not close the milestone.

Integrate the existing hand-structure fact engine or another already-trusted
local fact path.

Required logic:

  self-turn draw
  -> locally complete winning hand / legal tsumo opportunity
  -> actual action is discard
  -> select as acceptance candidate

Then Mortal acceptance decides whether:
  model candidate contains hora/agari.

Do not infer this branch solely from Mortal.

==================================================
8. BRANCH-SPECIFIC DISCOVERY SELECTION
==================================================

Produce a selection structure conceptually like:

  {
    branch: "self_turn_kakan",
    gameId: "...",
    seat: 2,
    decisionLocator: ...
  }

Selection dedupe should allow one game+seat to cover multiple branches.

Optimize for:
  minimum Mortal reports
while preserving:
  semantic coverage completeness.

A single accepted report may contribute evidence to multiple branches if the
actual E2E review contains qualifying rows.

Do not artificially submit one report per branch.

==================================================
9. P0 — REAL COVERAGE ACCEPTANCE
==================================================

Authoritative 10 branches:

  1. riichi_window
  2. dama_with_riichi_candidate
  3. post_call_chi
  4. post_call_pon
  5. post_riichi
  6. self_turn_tsumo_actual
  7. dama_with_tsumo_candidate
  8. self_turn_ankan
  9. self_turn_kakan
  10. self_turn_kyuushu

A branch lifts only after:

  REAL
  independent-source
  E2E
  accepted evidence

where E2E means:

  Tenhou raw
    -> own canonical mapper
    -> replay
    -> Mortal report from same game/seat
    -> fingerprint/perspective validation
    -> deterministic binding
    -> actual/source correspondence
    -> StructuredComparisonSet
    -> ModelEvaluation
    -> StructuredAnalysisAssembly
    -> redacted evidence artifact

No synthetic evidence can lift.

The existing H2 Mahjong Soul sample remains continuity evidence but does not
replace the independent Tenhou acceptance requirement.

==================================================
10. EVIDENCE MANIFEST
==================================================

Reuse:

  MortalCoverageEvidenceManifest
  createMortalCoverageRegistryFromManifest

Do not introduce a second lift mechanism.

For every accepted branch/sample:

  compute hash from the REDACTED accepted artifact

record:

  branch
  evidenceVersion
  evidenceHash
  localSourceType = tenhou
  modelAdapterVersion
  modelTag/version if available

Then build manifest mechanically.

Production registry derives ONLY from this manifest.

No:
  createMortalCoverageRegistry(["all branches"])
hard-coded shortcut.

==================================================
11. Kyuushu POLICY
==================================================

Current spec still contains an unresolved downgrade suggestion.

Do NOT silently invoke it.

Preferred path:
  local discovery keeps scanning until a real kyuushu sample is found.

Because discovery is local and does not load Mortal, large scans are acceptable
subject to the public raw-log source's own usage policy.

If after a materially large corpus no kyuushu is found:

  STOP and report:
    games scanned
    seats scanned
    zero kyuushu hits

Do NOT close A3 unless:
  the user/spec explicitly approves the downgrade clause.

Until then:
  self_turn_kyuushu remains fail-closed
  A3 remains NOT CLOSED.

==================================================
12. P1 — RECONCILE LEGACY ComparisonSet CONTRACT
==================================================

CURRENT INCONSISTENCY
---------------------

`StructuredComparisonSetSchema` now correctly allows:

  declare_riichi:
    origins=["model"]

  riichi_discard(tile):
    origins=["actual"]

  correspondence:
    actual -> model

But legacy:

  ComparisonSetSchema

still requires every automatic-review candidate to include `"model"` origin.

`toComparisonSet()` accepts a `StructuredComparisonSet` and maps it into that
legacy schema, which means a valid A3 riichi comparison can fail at runtime.

Resolve this contract mismatch.

Preferred choices:

A. evolve ComparisonSetSchema to support the same explicit correspondence /
   actual-only realization semantics

OR

B. formally deprecate/restrict `toComparisonSet()` so it cannot claim to
   convert every legal StructuredComparisonSet

Do not silently re-add model origin to concrete riichi_discard.

Tests required:

  valid structured riichi comparison
  -> legacy conversion either:
       succeeds under evolved contract
     OR
       is explicitly unavailable by type/API contract

No runtime surprise for a nominally valid input.

==================================================
13. FINAL H2 CONTINUITY REGRESSION
==================================================

After code changes, rerun the exact accepted H2 sample.

Expected baseline from previous A3 run:

  local decisions = 125
  source entries = 113

Require:

  local count = actual measured value
  source total = 113

  bound = 113
  unbound = 0
  ambiguous = 0

  binding_mismatch = 0

With EMPTY coverage registry:
  unsupported coverage rows may still appear.

With final accepted manifest-derived registry:
  all A3 branches encountered in the H2 sample that are covered by accepted
  evidence should pass the coverage gate.

Do not force:
  no_mortal_entry = 0

Current known 12 no-source local windows may remain if Mortal simply emitted
no corresponding review row.

Record exact final counts.

==================================================
14. FINAL COVERAGE-DRIVEN RUN
==================================================

Execute:

Phase A — discovery

  scan real Tenhou corpus
  -> per-branch hit counts
  -> selected game+seat candidates
  -> uncovered local branches

Phase B — acceptance

  selected candidates
  -> cached reports reused
  -> only necessary new Mortal submissions
  -> E2E reviews
  -> evidence manifest

Repeat A/B only as needed until:

  coverage matrix has no unapproved gap

Do not use a fixed "100 games" stopping condition.

Report:
  discovery games scanned
  seats scanned
  raw local hits per branch
  selected unique game+seat pairs
  Mortal reports reused
  Mortal reports newly submitted
  accepted E2E hits per branch

==================================================
15. PRIVACY
==================================================

Final acceptance output may contain:

  opaque game hash
  seat
  branch
  decision ordinal
  outcome
  model summary
  evidence hash
  aggregate counts

Must not contain:

  raw Tenhou log id
  raw Tenhou URL
  player names
  Mortal report id
  Mortal result URL
  account identifiers
  raw mjai_log
  split_logs

Private resumable transport state may contain operational locator data only
when necessary, must be:
  0600
  excluded from repository
  excluded from handoff
  excluded from evidence manifest

==================================================
16. FULL VERIFICATION
==================================================

Run at final code HEAD:

  npm run build
  npx vitest run
  all existing node --test suites
  npm run typecheck

Record exact:
  files
  tests
  node suites

Also inspect:
  GitHub combined status
  GitHub workflow runs

If none:
  state exactly:
    No remote CI evidence.

==================================================
17. DOCUMENTATION
==================================================

Update the existing:

  coach/docs/handoffs/2026-08-16-m6-a3-completion-handoff.md

Do not create another confusing parallel "final-final" handoff unless repository
convention requires it.

Correct prior statements that currently imply:

  acceptance runner is ready for live submission

if the implementation was previously only local-half wired.

Final handoff must record:

  exact final SHA
  §21 precedence fix
  legacy ComparisonSet resolution
  live acceptance transport implementation
  discovery changes
  real corpus size
  actual Mortal request count
  cache reuse count
  full 10-branch matrix
  manifest hash/version
  final H2 continuity
  privacy audit
  tests
  CI status

Update ROADMAP only when final truth is known.

==================================================
18. FINAL ACCEPTANCE GATE
==================================================

M6-A3 CLOSED / PASS requires ALL:

CORE SEMANTICS
  [ ] riichi fidelity remains correct
  [ ] declare_riichi candidate-only
  [ ] post_call fuuros identity
  [ ] post_riichi timing pinned
  [ ] terminal semantics preserved

PRECEDENCE
  [ ] actual/source mismatch cannot be hidden by source candidate unsupported
  [ ] coverage cannot hide integrity failures
  [ ] explicit combination regressions pass

CORPUS INFRASTRUCTURE
  [ ] Tenhou mapper real input works
  [ ] discovery returns concrete candidates for target branches
  [ ] dama-tsumo local candidate discovery exists
  [ ] live acceptance runner is actually wired
  [ ] checkpoint/resume/cache/budget work
  [ ] Mortal remains selective and rate-limited

REAL ACCEPTANCE
  [ ] riichi_window >=1 accepted real E2E
  [ ] dama_with_riichi_candidate >=1
  [ ] post_call_chi >=1
  [ ] post_call_pon >=1
  [ ] post_riichi >=1
  [ ] self_turn_tsumo_actual >=1
  [ ] dama_with_tsumo_candidate >=1
  [ ] self_turn_ankan >=1
  [ ] self_turn_kakan >=1
  [ ] self_turn_kyuushu >=1
      OR an explicitly user-approved documented downgrade exists

MANIFEST
  [ ] evidence manifest generated from accepted outputs
  [ ] registry derives only from manifest
  [ ] no manual lift

CONTINUITY
  [ ] H2 local conservation
  [ ] source conservation = 113
  [ ] bound = 113
  [ ] unbound = 0
  [ ] ambiguous = 0
  [ ] unexplained binding mismatch = 0

CONTRACTS
  [ ] legacy ComparisonSet inconsistency resolved

PRIVACY
  [ ] PASS

DOCS
  [ ] ROADMAP truthful
  [ ] final handoff truthful

GATES
  [ ] build PASS
  [ ] vitest PASS
  [ ] node suites PASS
  [ ] typecheck PASS
  [ ] CI accurately characterized

If any required checkbox remains false:

  FINAL VERDICT:
    M6-A3 NOT CLOSED

Do not weaken the acceptance rule to obtain CLOSED.

==================================================
19. FINAL REPORT FORMAT
==================================================

M6-A3 FINAL CLOSING REPORT
--------------------------

Branch:
  codex/m6-a3-completion

Starting SHA:
  eedffe55e5aaf633bb16d8de4c5c3eaf2aa20096

Final code SHA:
  <sha>

Final docs SHA:
  <sha>

1. §21 precedence
  actual mismatch > source unsupported:
    PASS/FAIL

  combination regression:
    PASS/FAIL

2. Comparison contracts
  StructuredComparisonSet:
    ...

  legacy ComparisonSet:
    ...

3. Discovery

  games scanned:
    N

  seats scanned:
    N

  local hits:
    riichi_window = N
    dama_with_riichi_candidate = N
    post_call_chi = N
    post_call_pon = N
    post_riichi = N
    self_turn_tsumo_actual = N
    dama_with_tsumo_candidate = N
    self_turn_ankan = N
    self_turn_kakan = N
    self_turn_kyuushu = N

  selected unique game+seat:
    N

4. Mortal acceptance

  cached reports reused:
    N

  new reports submitted:
    N

  failed submissions:
    N

  accepted reports:
    N

5. Accepted E2E coverage

  riichi_window                  N
  dama_with_riichi_candidate     N
  post_call_chi                  N
  post_call_pon                  N
  post_riichi                    N
  self_turn_tsumo_actual         N
  dama_with_tsumo_candidate      N
  self_turn_ankan                N
  self_turn_kakan                N
  self_turn_kyuushu              N / UNRESOLVED

6. Coverage manifest

  schema:
    ...

  accepted branches:
    ...

  registry derivation:
    PASS/FAIL

7. H2 continuity

  local decisions:
    N

  source entries:
    113

  local outcomes:
    analysis_ready = N
    unsupported_action = N
    no_mortal_entry = N
    binding_mismatch = N
    model_output_incomplete = N
    analysis_blocked = N

  source:
    bound = N
    unbound = N
    ambiguous = N

  local conservation:
    PASS/FAIL

  source conservation:
    PASS/FAIL

8. Privacy
  PASS/FAIL

9. Verification

  build:
    ...

  vitest:
    ...

  node:
    ...

  typecheck:
    ...

  GitHub CI:
    ...

10. Remaining fail-closed

  none

or:

  <exact branch/reason>

FINAL VERDICT:

  M6-A3 CLOSED / PASS

or

  M6-A3 NOT CLOSED

==================================================
20. STOP RULE
==================================================

If A3 closes:

  STOP at the exact accepted A3 SHA.

Do not begin M6-A4 in this task.

M6-A4 must branch from that exact accepted SHA.