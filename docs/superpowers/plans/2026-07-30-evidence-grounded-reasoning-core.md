# Evidence-Grounded Riichi Reasoning Core Implementation Plan

> **For agentic workers:** This plan records the completed strict-reasoning
> milestone. Follow-up analyzers require their own approved specifications and
> TDD plans; do not expand PF-03 or add teaching rules from examples alone.

**Goal:** Convert normalized Mortal decisions and visible replay context into a
serializable, auditable five-axis analysis package without guessing the model's
reason or issuing advice from incomplete evidence.

**Architecture:** The importer, scene replayer, analyzers, comparator, policy
gate, evidence registry, renderer, and validator form a one-way trusted
pipeline. The policy gate sees only factors, candidate ledgers, coverage, and
the runtime rule registry. The validator replays visible events and recomputes
all deterministic outputs rather than trusting package-supplied rules or text.

**Tech Stack:** TypeScript 5.9, Zod 3.25, Vitest 3.2, npm workspaces.

---

## Authoritative strict-mode decisions

- `modelReason` is always `unknown`.
- Mortal and Akagi Native are interchangeable engine facts, not sources of
  explanations.
- Factors are bilateral: model-supporting, actual-supporting, and neutral
  evidence remain visible together.
- Every legal model candidate has an isomorphic five-axis ledger.
- Unsupported and missing dimensions remain explicit; an LLM cannot fill them.
- Safety is stored separately for every riichi actor.
- Teaching rules cannot receive raw scenes, model/actual labels, model scores,
  or report identifiers.
- PF-03@1 is the only registered rule. It fails closed unless complete value,
  placement, calibrated risk, option-value, ippatsu, shanten, and all-threat
  safety prerequisites are explicit.
- PF-04 is not specified and does not exist.
- Both East 1 regressions return `coachJudgement: null`.
- Core validation uses structured recomputation, never free-text regexes.

## Completed file structure

```text
coach/
  fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json
  packages/contracts/src/
    decisions.ts
    events.ts
    evidence.ts
    scene.ts
    tiles.ts
  packages/reasoning/src/
    analysis/
    compare/action-comparator.ts
    coverage/dimension-catalog.ts
    evidence/evidence-registry.ts
    explain/deterministic-explanation.ts
    import/mortal-report.ts
    package/build-strict-analysis-package.ts
    policy/teaching-policy.ts
    replay/scene-replayer.ts
    validate/package-validator.ts
    index.ts
  packages/reasoning/tests/
```

## Completed implementation tasks

### Task 1: Strict contracts and isolated workspace

- [x] Create the npm workspace and strict Zod contracts.
- [x] Preserve red-five action identity.
- [x] Reject hidden opponent concealed hands.
- [x] Constrain evidence provenance, confidence, and calibrated probability
  metadata.
- [x] Add structured actor references to threat factors.
- [x] Commit as `7f1638e`, `57479a9`, and the contract portion of `a35cb2b`.

### Task 2: Real Mortal fixture and decision import

- [x] Capture the two East 1 decisions from report
  `c1924cad66f66dd9`.
- [x] Normalize model/actual actions, probabilities, q-values, and replay event
  IDs.
- [x] Redact every opponent concealed draw before it enters normalized events.
- [x] Force `modelReason: "unknown"`.
- [x] Commit as `7bacb3a`.

### Task 3: Visible decision-scene replay

- [x] Replay scores, riichi sticks, rivers, self hand, current draw, riichi, and
  ippatsu state up to the decision boundary.
- [x] Carry `selfActor` explicitly.
- [x] Mark the current fixture incomplete and enumerate missing meld, furiten,
  legal-action, remaining-tile, called-discard, and kan-dora state.
- [x] Commit as `11b840c`, `377405a`, and `d4d9383`.

### Task 4: Deterministic efficiency and player-specific safety

- [x] Compute standard-hand shanten after every candidate discard.
- [x] Keep unadjusted ukeire as a diagnostic that cannot rank equal-shanten
  actions.
- [x] Compute genbutsu separately for every riichi threat.
- [x] Emit replay-grounded neutral riichi/ippatsu factors.
- [x] Commit as `36a4ee4`, `8e9a3bd`, and the comparator portion of `a35cb2b`.

### Task 5: Versioned five-axis candidate ledgers

- [x] Define the `1.1.0` dimension catalog across efficiency, value, defense,
  placement, and option value.
- [x] Include calibrated deal-in probability explicitly as unsupported.
- [x] Give every candidate real efficiency and per-threat defense consequences.
- [x] Keep unimplemented value, placement, and option-value consequences as
  `unsupported + null`.
- [x] Generate bilateral factors in both safety directions.
- [x] Commit as `1e48998`.

### Task 6: Fail-closed teaching policy

- [x] Register PF-03@1 with sources, prerequisites, counterconditions, and
  limitations.
- [x] Restrict policy input to factors, candidate ledgers, coverage, and the
  versioned registry.
- [x] Prove that swapping attached model/actual labels cannot change policy
  output.
- [x] Prove that genbutsu against one player cannot satisfy a multi-threat
  requirement.
- [x] Return `coachJudgement: null` for both incomplete regressions.
- [x] Commit as `a35cb2b`.

### Task 7: Evidence graph and public analysis package

- [x] Resolve every factor evidence ID to a visible normalized replay event.
- [x] Reject duplicate, missing, future, and dangling evidence.
- [x] Return full factor objects, candidate ledgers, coverage, rule
  evaluations, primary axes, visible events, and deterministic text.
- [x] Derive primary axes from directional factors.
- [x] Render the exact East 1 efficiency/safety tradeoff in Chinese, including
  the standard-hand scope and ippatsu state.
- [x] Preserve red-five identity and render safety advantages symmetrically.
- [x] Commit as `0b7b5a2`, `c93ae72`, and `dd23649`.

### Task 8: Trusted structural validation

- [x] Recompute the scene from the complete visible event prefix.
- [x] Recompute candidate ledgers, factor buckets, coverage, policy output, and
  deterministic explanation.
- [x] Require the internal rule registry rather than a package-supplied variant.
- [x] Require the model action to be a highest-probability candidate.
- [x] Reject duplicated factors, altered consequences, altered factor claims,
  forged rules, forged advice, altered prose, unknown fields, hidden-information
  smuggling, and scene/event disagreement.
- [x] Validate JSON serialization round trips through the public pipeline.
- [x] Commit as `dd23649`.

## Regression truths

### East 1 turn 6

- Actual `discard:2p:tedashi` leaves standard-hand shanten 2.
- Model `discard:6s:tsumogiri` leaves standard-hand shanten 3.
- The 6-sou discard is genbutsu against actor 2 only.
- Actor 2's ippatsu window is alive.
- Efficiency supports the actual action; deterministic per-player safety
  supports the model action.
- Full value, placement outcome paths, calibrated deal-in probability, and
  other PF-03 prerequisites are unavailable, so the coach gives no conclusion.

### East 1 turn 7

- Actual `discard:7p:tedashi` leaves standard-hand shanten 1.
- Model `discard:8p:tsumogiri` leaves standard-hand shanten 2.
- The 8-pin discard is genbutsu against actor 2 only.
- The ippatsu window has ended after the call.
- Efficiency supports the actual action; deterministic per-player safety
  supports the model action.
- PF-03 does not apply and no non-ippatsu companion rule exists.

## Verification commands

```powershell
cd coach
npm test
npm run typecheck
npm audit
cd ..
node --test tests/*.test.mjs
git diff --check
git status --short
```

Expected results:

- all coach tests pass;
- TypeScript reports no errors;
- npm reports no known vulnerabilities;
- all legacy Node tests pass;
- unrelated `RESOURCES.md` and `overlay/` work remains untouched.

## Follow-up boundary

This milestone does not authorize a positive PF-03 recommendation in the two
fixtures. A future positive advice path requires separate specifications and
tests for complete meld/furiten/legal-action state, full hand value, placement
outcome paths, calibrated risk, option value, and any additional teaching rule.
Production engine adapters, history storage, LLM dialogue orchestration, and UI
also remain separate milestones.
