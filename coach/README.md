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
- shared user/MJAI/typed-engine candidate normalization with ambiguity,
  known-fact conflict, and missing-fact states;
- same-action origin merging, cross-window rejection, and an isolated
  discard-only legacy bridge;

Both current regression scenes remain incomplete. Full value, placement outcome
paths, option-value analysis, calibrated deal-in probability, structural river
safety, and behavioral/wait inference are explicit unsupported or
missing-data dimensions. Therefore both packages correctly return
`coachJudgement: null`.

PF-03 is registered for audit but deliberately not activated in this milestone.
Activation requires scored-candidate normalization plus value, placement,
calibrated-risk, multi-threat, and option-value analyzers under separately
approved plans. The coach does not claim to enumerate every legal action.

Outside this milestone:

- production Mortal and Akagi Native report integration;
- production Akagi Native private-format parsing;
- complete legal-action enumeration and call-follow-up branch search;
- complete meld, furiten, remaining-tile, and called-discard state;
- full value, placement, option-value, river, wait, and calibrated-risk analyzers;
- persistence, LLM dialogue orchestration, and the three-column UI.

The structured path checks only contradictions supported by `KnownActionFacts`.
Missing facts remain `unknown_due_to_missing_facts`; they are not described as
illegal. “Whether to call” and “what to discard after calling” are separate
decision windows. The old discard-only strict analysis remains the active
regression pipeline until the later factor-pipeline migration.

The LLM consumes the validated package. It is not allowed to create factors,
change model facts, infer an engine motive, or provide a recommendation when the
policy gate is closed.
