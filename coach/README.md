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

Both current regression scenes remain incomplete. Full value, placement outcome
paths, option-value analysis, calibrated deal-in probability, structural river
safety, and behavioral/wait inference are explicit unsupported or
missing-data dimensions. Therefore both packages correctly return
`coachJudgement: null`.

PF-03 is registered for audit but deliberately not activated in this milestone.
Activation requires complete legal-action, value, placement, calibrated-risk,
multi-threat, and option-value analyzers under a separately approved plan.

Outside this milestone:

- production Mortal and Akagi Native adapters;
- complete meld, furiten, legal-action, remaining-tile, and called-discard state;
- full value, placement, option-value, river, wait, and calibrated-risk analyzers;
- persistence, LLM dialogue orchestration, and the three-column UI.

The LLM consumes the validated package. It is not allowed to create factors,
change model facts, infer an engine motive, or provide a recommendation when the
policy gate is closed.
