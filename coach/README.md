# Riichi Coach strict reasoning core

This workspace currently contains the evidence-grounded reasoning milestone for
the local LLM riichi coach.

Implemented:

- Mortal report facts normalized with `modelReason: "unknown"`;
- opponent concealed draws redacted at the import boundary;
- decision-boundary replay using only information visible to the player;
- standard-hand shanten, with unadjusted ukeire kept as a non-ranking diagnostic;
- per-riichi-player genbutsu and ippatsu evidence;
- a versioned five-axis coverage catalog and isomorphic candidate ledgers;
- bilateral factor accounts that preserve evidence for model and actual actions;
- a fail-closed PF-03 policy gate that cannot read model/actual labels;
- replay evidence registry, trusted recomputation, and structural validation;
- emitted JavaScript packages for ordinary Node/Electron imports;
- deterministic Chinese explanations for the East 1 turn 6 and 7 regressions.
- unified comparison-request, analysis-frame, candidate-reference, model-evaluation,
  and preference-set contracts;
- replayable Mortal probability and Akagi Native softmax selection scores with a
  frozen per-evaluation detail threshold;
- a fixed agreement truth table for model and coach preference sets;
- strict structured contracts for discard, riichi discard, chi, pon, three
  kans, tsumo, ron, nine-terminals abort, and pass;
- canonical action references, four decision windows, and explicit projection
  to the legacy comparison view;
- shared user/MJAI/typed-engine candidate normalization with structural-invalid,
  ambiguity, known-fact conflict, and missing-fact states;
- same-action origin merging, cross-window rejection, and an isolated
  discard-only legacy bridge;
- a managed Go JSONL fact-engine sidecar pinned to mahjong-helper commit
  `514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0`;
- structured candidate projection for discards and completed hands, with one
  request and state hash bound to each canonical action;
- deterministic shanten, effective tiles, live remaining tiles, dora count,
  completed-hand points, riichi state, ippatsu, and per-threat genbutsu facts;
- versioned helper estimates for yaku IDs, dama/riichi points, wait speed,
  win-rate/furiten heuristics, round points, suji, wall, one-chance, and related
  structural risk classes, always marked heuristic-only;
- isomorphic five-axis factor ledgers, same-version candidate differences, and
  a Pareto resolver that returns no overall preference when deterministic axes
  conflict or required coverage is missing;
- real East 1 turn 6/7 regressions proving that 2p/7p are efficiency choices
  while 6s/8p are per-threat genbutsu defense choices.

Both current regression scenes remain incomplete. Exact public han/fu details,
calibrated deal-in probability, placement EV, option-value branch search,
flush/hand-composition inference, and discard-sequence behavioral inference are
explicit unsupported or missing-data dimensions. Therefore the applied East 1
decisions correctly keep `deterministicPreference: null` even though their
efficiency-only and defense-only preferences are available.

PF-03 is registered for audit but deliberately not activated in this milestone.
Activation requires scored-candidate normalization plus value, placement,
calibrated-risk, multi-threat, and option-value analyzers under separately
approved plans. The coach does not claim to enumerate every legal action.

Outside this milestone:

- production Mortal and Akagi Native report integration;
- production Akagi Native private-format parsing;
- complete legal-action enumeration and call-follow-up branch search;
- complete meld, furiten, remaining-tile, and called-discard state;
- calibrated placement, option-value, opponent-hand, and statistical-risk analyzers;
- persistence, LLM dialogue orchestration, and the three-column UI.

The structured path checks only contradictions supported by `KnownActionFacts`.
Missing facts remain `unknown_due_to_missing_facts`; they are not described as
illegal. “Whether to call” and “what to discard after calling” are separate
decision windows. The old discard-only strict analysis remains only as an
explicit regression oracle; production code must not silently fall back to it.

The fact engine is bundled below application resources; users do not configure
a Go runtime, executable path, model path, or mahjong-helper checkout. Its
machine boundary is strict JSONL. Responses bind request ID, canonical action,
projected-state hash, protocol version, adapter version, and pinned upstream
commit. Recommendation/ranking fields are not part of the protocol and strict
schemas reject unknown fields.

Developer verification:

```powershell
npm run test
npm run typecheck
npm run test:package-import
npm run build:fact-engine
npm run test:fact-engine
```

The upstream MIT notice and pinned source license are stored under
`tools/mahjong-facts`. The sidecar maps upstream calculations into facts only;
mahjong-helper recommendations or composite rankings never enter coach
preference.

The LLM consumes the validated package. It is not allowed to create factors,
change model facts, infer an engine motive, or provide a recommendation when the
policy gate is closed.
