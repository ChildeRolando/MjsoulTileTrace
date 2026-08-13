# Canonical Event Stream and Round Reducer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the versioned, visibility-safe canonical riichi event stream and deterministic round reducer that become the single game-state source for M2 facts and M5 Mahjong Soul replay.

**Architecture:** Add strict V2 contracts beside the legacy replay types, validate the full stream before reduction, and reduce immutable event prefixes into separate public and self-private state. Decision snapshots are hash-bound cached projections; a temporary legacy bridge proves East 1 turn 6/7 equivalence without becoming a production fallback.

**Tech Stack:** TypeScript, Zod, Vitest, Node.js crypto, existing `@riichi-coach/contracts` and `@riichi-coach/reasoning` workspaces.

---

## File map

### Contracts

- Create `coach/packages/contracts/src/event-stream.ts`: canonical stream identity, rule set, strict event union, stream-wide identity refinements.
- Create `coach/packages/contracts/src/round-state.ts`: public/private reducer state, meld/river/riichi state, per-field completeness, decision snapshot.
- Modify `coach/packages/contracts/src/index.ts`: public exports only.
- Create `coach/packages/contracts/tests/event-stream.test.ts`: event and stream boundary tests.
- Create `coach/packages/contracts/tests/round-state.test.ts`: state/snapshot boundary tests.

### Reasoning

- Create `coach/packages/reasoning/src/replay/canonical-event-validator.ts`: sequence, phase, reference and physical-ownership validation.
- Create `coach/packages/reasoning/src/replay/round-reducer.ts`: pure immutable reducer and prefix hashing.
- Create `coach/packages/reasoning/src/replay/decision-snapshot.ts`: freeze a `DecisionSnapshotV2` at an explicit window.
- Create `coach/packages/reasoning/src/import/legacy-event-stream-bridge.ts`: fixture-only conversion of current normalized events.
- Create `coach/packages/reasoning/src/factors/known-game-facts-v2.ts`: validated snapshot to current FactorPipeline boundary.
- Modify `coach/packages/reasoning/src/index.ts`: exports.
- Create focused tests beside existing replay/factor tests.

The reducer file owns transition orchestration. Event-shape validation stays in contracts; full-stream semantic validation stays in `canonical-event-validator.ts`; fact projection never mutates the reducer state.

---

### Task 1: Canonical stream identity and event contracts

**Files:**

- Create: `coach/packages/contracts/src/event-stream.ts`
- Modify: `coach/packages/contracts/src/index.ts`
- Test: `coach/packages/contracts/tests/event-stream.test.ts`

- [ ] **Step 1: Write the failing strict-schema tests**

Create tests with the following public imports and a minimal valid stream:

```ts
import { describe, expect, it } from "vitest";
import {
  CanonicalEventStreamSchema,
  CanonicalGameEventSchema,
} from "../src/index.js";

const tile = (id: "1m" | "2m" | "3m" | "4m" | "5m" | "6m" | "7m" |
  "8m" | "9m" | "1p" | "2p" | "3p" | "4p") => ({ id, red: false });

const selfHand = [
  tile("1m"), tile("2m"), tile("3m"), tile("4m"), tile("5m"),
  tile("6m"), tile("7m"), tile("8m"), tile("9m"), tile("1p"),
  tile("2p"), tile("3p"), tile("4p"),
];

const base = {
  schemaVersion: "canonical-riichi-events/v2" as const,
  mapperVersion: "fixture/v1",
  gameId: "game:fixture",
  sourceKind: "fixture" as const,
  sourceRecordHash: "sha256:source",
  playerCount: 4 as const,
  selfActor: 0,
  ruleSet: {
    length: "south" as const,
    redFives: { man: 1, pin: 1, sou: 1 },
    openTanyao: true,
    atamahane: false,
    westExtension: "sudden_death" as const,
    ippatsuCancelledByAnkan: true,
  },
  events: [
    {
      type: "game_started" as const,
      eventId: "game:fixture/0/0/0",
      sourceRecordRef: "record:0",
    },
    {
      type: "round_started" as const,
      eventId: "game:fixture/0/1/0",
      sourceRecordRef: "record:1",
      roundOrdinal: 0,
      roundWind: "E" as const,
      hand: 1,
      honba: 0,
      riichiSticks: 0,
      dealer: 0,
      scores: [25000, 25000, 25000, 25000],
      doraIndicator: tile("1m"),
      selfHand,
      remainingDraws: 70,
    },
  ],
};

describe("canonical event stream", () => {
  it("accepts a strict, versioned four-player stream", () => {
    expect(CanonicalEventStreamSchema.parse(base).events).toHaveLength(2);
  });

  it("distinguishes an opponent hidden draw from missing data", () => {
    expect(CanonicalGameEventSchema.parse({
      type: "tile_drawn",
      eventId: "game:fixture/0/2/0",
      sourceRecordRef: "record:2",
      actor: 1,
      tile: { visibility: "hidden" },
      from: "live_wall",
    }).tile).toEqual({ visibility: "hidden" });
    expect(() => CanonicalGameEventSchema.parse({
      type: "tile_drawn",
      eventId: "game:fixture/0/2/0",
      sourceRecordRef: "record:2",
      actor: 1,
      from: "live_wall",
    })).toThrow();
  });

  it("rejects duplicate event IDs and unknown fields", () => {
    expect(() => CanonicalEventStreamSchema.parse({
      ...base,
      events: [...base.events, { ...base.events[1] }],
    })).toThrow("Canonical event IDs must be unique");
    expect(() => CanonicalEventStreamSchema.parse({ ...base, modelScore: 99 }))
      .toThrow();
  });

  it("rejects opponent-visible private draws", () => {
    expect(() => CanonicalEventStreamSchema.parse({
      ...base,
      events: [...base.events, {
        type: "tile_drawn",
        eventId: "game:fixture/0/2/0",
        sourceRecordRef: "record:2",
        actor: 1,
        tile: { visibility: "visible", tile: tile("1m") },
        from: "live_wall",
      }],
    })).toThrow("Only the self actor may expose a private draw");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
cd coach
npm test -- --run packages/contracts/tests/event-stream.test.ts
```

Expected: FAIL because `CanonicalEventStreamSchema` and `CanonicalGameEventSchema` are not exported.

- [ ] **Step 3: Implement the strict event schemas**

Define and export these exact constants/types in `event-stream.ts`:

```ts
export const CANONICAL_EVENT_SCHEMA_VERSION = "canonical-riichi-events/v2" as const;
export const CanonicalSourceKindSchema = z.enum([
  "mahjong_soul", "mjai", "user_asserted", "fixture",
]);
export const RuleSetV2Schema = z.object({
  length: z.enum(["east", "south"]),
  redFives: z.object({
    man: z.number().int().min(0).max(1),
    pin: z.number().int().min(0).max(1),
    sou: z.number().int().min(0).max(1),
  }).strict(),
  openTanyao: z.boolean(),
  atamahane: z.boolean(),
  westExtension: z.enum(["none", "sudden_death", "fixed"]),
  ippatsuCancelledByAnkan: z.boolean(),
}).strict();
```

Use a strict discriminated union with the event names and fields from sections 5.3–5.4 of the design spec. `tile_drawn.tile` must be a discriminated union of `{ visibility: "visible", tile: Tile }` and `{ visibility: "hidden" }`. `round_started.selfHand` must be exactly 13 tiles. Calls must carry `targetActor`, `calledTile`, `consumedTiles`, and `calledDiscardEventRef`; kakan must carry `upgradedPonEventRef`.

`CanonicalEventStreamSchema.superRefine` must enforce unique event IDs, first event `game_started`, self-only visible private draws, and source references that are nonempty. Export inferred types for every public schema.

Add `export * from "./event-stream.js";` to contracts `index.ts`.

- [ ] **Step 4: Run GREEN and typecheck**

Run:

```powershell
npm test -- --run packages/contracts/tests/event-stream.test.ts
npm run typecheck
```

Expected: event-stream tests PASS and typecheck PASS.

- [ ] **Step 5: Commit only Task 1 files**

```powershell
git add -- coach/packages/contracts/src/event-stream.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/event-stream.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: define canonical riichi event stream"
```

---

### Task 2: Public/private round-state contracts

**Files:**

- Create: `coach/packages/contracts/src/round-state.ts`
- Modify: `coach/packages/contracts/src/index.ts`
- Test: `coach/packages/contracts/tests/round-state.test.ts`

- [ ] **Step 1: Write failing state-boundary tests**

The tests must prove:

```ts
expect(PublicRoundStateSchema.parse(publicState).rivers).toHaveLength(4);
expect(DecisionPrivateStateSchema.parse(privateState).selfActor).toBe(0);
expect(JSON.stringify(PublicRoundStateSchema.parse(publicState)))
  .not.toContain("concealedTiles");
expect(() => DecisionSnapshotV2Schema.parse({
  ...snapshot,
  streamPrefixHash: "",
})).toThrow();
expect(() => PublicRoundStateSchema.parse({
  ...publicState,
  fields: { ...publicState.fields, rivers: "complete" },
  rivers: [[{ ...discard, actor: 1 }], [], [], []],
})).toThrow("River actor must match its bucket");
```

Use one five-axis-independent snapshot fixture with `selfActor = 0`, a self-turn window, 14 self tiles split into 13 concealed plus current draw, no melds, and complete round context.

- [ ] **Step 2: Run RED**

```powershell
cd coach
npm test -- --run packages/contracts/tests/round-state.test.ts
```

Expected: FAIL because the V2 state schemas do not exist.

- [ ] **Step 3: Implement exact public types**

Export:

```ts
export const FieldCompletenessSchema = z.enum(["complete", "partial", "unknown"]);
export const RoundPhaseSchema = z.enum([
  "awaiting_draw",
  "awaiting_self_action",
  "awaiting_discard_responses",
  "awaiting_kan_responses",
  "awaiting_post_call_discard",
  "awaiting_rinshan_draw",
  "round_ended",
]);
export const RiichiStateV2Schema = z.object({
  actor: ActorSchema,
  status: z.enum(["none", "declared", "accepted"]),
  declarationEventRef: EventRefSchema.nullable(),
  acceptanceEventRef: EventRefSchema.nullable(),
  ippatsuAlive: z.boolean(),
}).strict();
```

Define strict `RiverDiscardV2`, `CanonicalMeldV2`, `PublicRoundState`, `DecisionPrivateState`, and `DecisionSnapshotV2`. `PublicRoundState` must not have a self hand or any generic concealed-hand field. `DecisionPrivateState` must require an actor equal to snapshot `selfActor`, a nullable current draw with event ref, one `DecisionWindow`, and field completeness. `DecisionSnapshotV2` must bind `decisionEventRef` to the window trigger and require nonempty stream/prefix hashes.

State melds reuse precise `TileSchema` but add immutable `meldRef`, event refs, target, and called-discard references. Kakan must contain `upgradedPonEventRef`; ankan must not contain target/called-discard refs.

- [ ] **Step 4: Run GREEN and typecheck**

```powershell
npm test -- --run packages/contracts/tests/round-state.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- coach/packages/contracts/src/round-state.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/round-state.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: define canonical round state"
```

---

### Task 3: Stream semantic validator

**Files:**

- Create: `coach/packages/reasoning/src/replay/canonical-event-validator.ts`
- Modify: `coach/packages/reasoning/src/index.ts`
- Test: `coach/packages/reasoning/tests/canonical-event-validator.test.ts`

- [ ] **Step 1: Write failing sequence/reference tests**

Build valid streams from a local test helper, then assert these exact diagnostic codes:

```ts
expect(validateCanonicalEventStream(validStream())).toEqual({ status: "valid" });
expect(validateCanonicalEventStream(streamWithDiscardBeforeDraw())).toEqual({
  status: "invalid",
  code: "unexpected_event_for_phase",
  eventRef: "game:fixture/0/2/0",
});
expect(validateCanonicalEventStream(streamWithDuplicateCalledDiscard())).toMatchObject({
  status: "invalid",
  code: "called_discard_already_consumed",
});
expect(validateCanonicalEventStream(streamWithOrphanKakan())).toMatchObject({
  status: "invalid",
  code: "kakan_pon_not_found",
});
expect(validateCanonicalEventStream(streamWithImpossibleSelfTile())).toMatchObject({
  status: "invalid",
  code: "self_tile_not_owned",
});
```

Add cases for chi from a non-left actor, call target equal to caller, ankan with target, round event after `round_ended`, and more than four physical copies across self-owned and public tiles.

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run packages/reasoning/tests/canonical-event-validator.test.ts
```

Expected: FAIL because `validateCanonicalEventStream` is missing.

- [ ] **Step 3: Implement a typed fail-closed validator**

Export:

```ts
export type CanonicalStreamDiagnosticCode =
  | "unexpected_event_for_phase"
  | "event_actor_mismatch"
  | "call_target_invalid"
  | "chi_target_not_left"
  | "called_discard_not_found"
  | "called_discard_already_consumed"
  | "kakan_pon_not_found"
  | "self_tile_not_owned"
  | "physical_tile_overflow"
  | "event_after_round_end";

export type CanonicalStreamValidation =
  | { status: "valid" }
  | { status: "invalid"; code: CanonicalStreamDiagnosticCode; eventRef: string };

export function validateCanonicalEventStream(
  stream: CanonicalEventStream,
): CanonicalStreamValidation;
```

The validator walks once in event order and maintains only validation state: current phase, expected actor, self-owned multiset, public tile counts, open meld refs, and consumed discard refs. It must not return a repaired stream or reordered events. Any invalid condition returns the first stable code and event ref.

- [ ] **Step 4: Run GREEN and all contracts/reasoning typechecks**

```powershell
npm test -- --run packages/reasoning/tests/canonical-event-validator.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- coach/packages/reasoning/src/replay/canonical-event-validator.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/canonical-event-validator.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: validate canonical event sequences"
```

---

### Task 4: Immutable reducer core for rounds, draws, and discards

**Files:**

- Create: `coach/packages/reasoning/src/replay/round-reducer.ts`
- Test: `coach/packages/reasoning/tests/round-reducer-core.test.ts`

- [ ] **Step 1: Write RED tests around public/private separation**

Assert:

```ts
const states = reduceCanonicalEventStream(validSelfDrawDiscardStream());
const afterStart = states.at(1)!;
const afterDraw = states.at(2)!;
const afterDiscard = states.at(3)!;

expect(afterStart.privateState?.concealedTiles).toHaveLength(13);
expect(afterStart.publicState.phase).toBe("awaiting_draw");
expect(afterDraw.privateState?.currentDraw?.tile.id).toBe("5p");
expect(afterDraw.publicState.phase).toBe("awaiting_self_action");
expect(afterDiscard.privateState?.currentDraw).toBeNull();
expect(afterDiscard.publicState.rivers[0]?.at(-1)).toMatchObject({
  actor: 0,
  discardMode: "tsumogiri",
});
expect(JSON.stringify(afterDiscard.publicState)).not.toContain("concealedTiles");
expect(states.map((state) => state.streamPrefixHash))
  .toEqual([...states.map((state) => state.streamPrefixHash)]);
```

Add an opponent hidden-draw test proving no tile identity enters either public state or self-private state.

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run packages/reasoning/tests/round-reducer-core.test.ts
```

Expected: FAIL because the reducer is missing.

- [ ] **Step 3: Implement reducer API and hash binding**

Export:

```ts
export interface ReducedCanonicalState {
  eventRef: string;
  eventIndex: number;
  streamHash: string;
  streamPrefixHash: string;
  publicState: PublicRoundState;
  privateState: DecisionPrivateState | null;
}

export function reduceCanonicalEventStream(
  raw: CanonicalEventStream,
): readonly ReducedCanonicalState[];
```

Parse the stream, call `validateCanonicalEventStream`, throw a project-owned error carrying only the stable code on invalid input, then apply each event without mutating earlier states. Hash canonical JSON with SHA-256. `tile_drawn` decrements remaining draws when known. Self draw enters `currentDraw`; hidden opponent draw changes phase/actor only. Discard moves an exact self tile from current draw/concealed hand and appends a public river entry.

- [ ] **Step 4: Run GREEN plus mutation guard**

```powershell
npm test -- --run packages/reasoning/tests/round-reducer-core.test.ts
npm run typecheck
```

Expected: PASS. Tests must freeze the first returned state and prove later reductions do not change it.

- [ ] **Step 5: Commit**

```powershell
git add -- coach/packages/reasoning/src/replay/round-reducer.ts coach/packages/reasoning/tests/round-reducer-core.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: reduce canonical draw and discard events"
```

---

### Task 5: Calls, kans, called rivers, and post-call phases

**Files:**

- Modify: `coach/packages/reasoning/src/replay/round-reducer.ts`
- Test: `coach/packages/reasoning/tests/round-reducer-calls.test.ts`

- [ ] **Step 1: Write failing call-transition tests**

Cover chi, pon, daiminkan, ankan, and kakan separately. Required assertions:

```ts
expect(afterPon.publicState.rivers[3]!.at(-1)?.calledByEventRef)
  .toBe("game:fixture/0/5/0");
expect(afterPon.publicState.melds[0]).toMatchObject({
  kind: "pon",
  actor: 0,
  targetActor: 3,
  calledDiscardEventRef: "game:fixture/0/4/0",
});
expect(afterPon.publicState.phase).toBe("awaiting_post_call_discard");
expect(afterDaiminkan.publicState.phase).toBe("awaiting_rinshan_draw");
expect(afterAnkan.publicState.melds[0]?.targetActor).toBeNull();
expect(afterKakan.publicState.melds).toHaveLength(1);
expect(afterKakan.publicState.melds[0]).toMatchObject({
  kind: "kakan",
  upgradedPonEventRef: "game:fixture/0/5/0",
});
```

Also prove that the called discard remains in river order and its tile still contributes once—not twice—to public visibility.

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run packages/reasoning/tests/round-reducer-calls.test.ts
```

Expected: FAIL because call transitions are not handled.

- [ ] **Step 3: Add minimal call/kan transitions**

Use exact event refs to locate the target discard and existing pon. Remove only self-consumed tiles from private ownership. Never remove the called tile from the river history. Store canonical meld tiles and refs. Chi/pon enter `awaiting_post_call_discard`; daiminkan/ankan enter `awaiting_rinshan_draw`; kakan enters `awaiting_kan_responses` before continuation.

- [ ] **Step 4: Run GREEN and the semantic validator suite**

```powershell
npm test -- --run packages/reasoning/tests/round-reducer-calls.test.ts packages/reasoning/tests/canonical-event-validator.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- coach/packages/reasoning/src/replay/round-reducer.ts coach/packages/reasoning/tests/round-reducer-calls.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: reduce canonical call and kan events"
```

---

### Task 6: Riichi, ippatsu, dora, settlement, and terminal phases

**Files:**

- Modify: `coach/packages/reasoning/src/replay/round-reducer.ts`
- Test: `coach/packages/reasoning/tests/round-reducer-round-flow.test.ts`

- [ ] **Step 1: Write failing round-flow tests**

Test the exact sequence declare → discard → accept. Assert declaration/acceptance refs, score `25000 → 24000`, riichi sticks `0 → 1`, and ippatsu alive. Then insert a pon before the riichi player’s next draw and assert ippatsu false. Add an ankan case whose expected result follows `ruleSet.ippatsuCancelledByAnkan` for both boolean values.

Add dora and terminal assertions:

```ts
expect(afterDora.publicState.doraIndicators).toEqual([
  tile("1m"), tile("2m"),
]);
expect(afterWin.publicState.phase).toBe("round_ended");
expect(afterWin.publicState.terminal).toMatchObject({ kind: "win" });
expect(afterScoreUpdate.publicState.scores).toEqual([27000, 23000, 25000, 25000]);
expect(afterDraw.publicState.terminal).toMatchObject({ kind: "draw" });
```

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run packages/reasoning/tests/round-reducer-round-flow.test.ts
```

Expected: FAIL on unhandled round-flow events.

- [ ] **Step 3: Implement the transitions**

Riichi declaration never deducts points. Acceptance deducts exactly 1000 from the actor and increments sticks. Calls cancel live ippatsu flags according to rule set. `dora_revealed` appends one exact public indicator. Win/draw sets terminal state and rejects later gameplay events; `scores_updated` is permitted only in terminal settlement and replaces all four scores from explicit source data.

- [ ] **Step 4: Run GREEN and full reducer group**

```powershell
npm test -- --run packages/reasoning/tests/round-reducer-core.test.ts packages/reasoning/tests/round-reducer-calls.test.ts packages/reasoning/tests/round-reducer-round-flow.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- coach/packages/reasoning/src/replay/round-reducer.ts coach/packages/reasoning/tests/round-reducer-round-flow.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: reduce canonical riichi and round flow"
```

---

### Task 7: Decision snapshots

**Files:**

- Create: `coach/packages/reasoning/src/replay/decision-snapshot.ts`
- Modify: `coach/packages/reasoning/src/index.ts`
- Test: `coach/packages/reasoning/tests/decision-snapshot.test.ts`

- [ ] **Step 1: Write failing decision-boundary tests**

For each window, request a snapshot at the state after its trigger and before its action:

```ts
expect(freezeDecisionSnapshot(stream, {
  kind: "self_turn",
  actor: 0,
  triggerEventRef: "game:fixture/0/2/0",
})).toMatchObject({
  decisionEventRef: "game:fixture/0/2/0",
  privateState: { currentDraw: { eventRef: "game:fixture/0/2/0" } },
});
expect(freezeDecisionSnapshot(discardStream, responseWindow).publicState
  .rivers[1]!.at(-1)?.eventRef).toBe(responseWindow.triggerEventRef);
expect(freezeDecisionSnapshot(callStream, postCallWindow).publicState.phase)
  .toBe("awaiting_post_call_discard");
expect(() => freezeDecisionSnapshot(stream, mismatchedActorWindow))
  .toThrow("decision_window_state_mismatch");
```

Add a serialization roundtrip proving snapshot hashes and red identities are stable.

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run packages/reasoning/tests/decision-snapshot.test.ts
```

Expected: FAIL because `freezeDecisionSnapshot` is missing.

- [ ] **Step 3: Implement the snapshot freezer**

Export:

```ts
export function freezeDecisionSnapshot(
  stream: CanonicalEventStream,
  window: DecisionWindow,
): DecisionSnapshotV2;
```

Locate exactly one trigger event, reduce through that event, verify actor/window/phase/source/tile binding, and parse the output through `DecisionSnapshotV2Schema`. Copy state into a new object; do not expose mutable reducer internals.

- [ ] **Step 4: Run GREEN**

```powershell
npm test -- --run packages/reasoning/tests/decision-snapshot.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- coach/packages/reasoning/src/replay/decision-snapshot.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/decision-snapshot.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: freeze canonical decision snapshots"
```

---

### Task 8: Legacy fixture bridge and V2 fact projection

**Files:**

- Create: `coach/packages/reasoning/src/import/legacy-event-stream-bridge.ts`
- Create: `coach/packages/reasoning/src/factors/known-game-facts-v2.ts`
- Modify: `coach/packages/reasoning/src/index.ts`
- Test: `coach/packages/reasoning/tests/legacy-event-stream-bridge.test.ts`
- Test: `coach/packages/reasoning/tests/known-game-facts-v2.test.ts`

- [ ] **Step 1: Write failing East 1 bridge tests**

Load `coach/fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json`, convert its current normalized events through an explicitly named fixture-only bridge, freeze both decisions, and assert:

```ts
expect(turn6.privateState.currentDraw?.tile.id).toBe("6s");
expect(turn6.publicState.riichiStates[2]).toMatchObject({
  status: "accepted",
  ippatsuAlive: true,
});
expect(turn7.privateState.currentDraw?.tile.id).toBe("8p");
expect(turn7.publicState.riichiStates[2]?.ippatsuAlive).toBe(false);
expect(turn6.publicState.scores).toEqual([25000, 25000, 24000, 25000]);
```

Projection tests must assert the current Slice 3 `KnownGameFactsSchema` receives the same actor/window/hand/rivers/threat evidence and that bridge provenance is explicit. A malformed legacy fixture must return a typed import diagnostic, not synthesize defaults.

- [ ] **Step 2: Run RED**

```powershell
npm test -- --run packages/reasoning/tests/legacy-event-stream-bridge.test.ts packages/reasoning/tests/known-game-facts-v2.test.ts
```

Expected: FAIL because bridge and projector are missing.

- [ ] **Step 3: Implement bridge and projector**

Export:

```ts
export type LegacyEventStreamBridgeResult =
  | { status: "ready"; stream: CanonicalEventStream; provenance: "legacy_regression_bridge_only" }
  | { status: "invalid_source"; code: string };

export function bridgeLegacyRegressionEvents(
  events: readonly NormalizedEvent[],
  selfActor: number,
): LegacyEventStreamBridgeResult;

export function projectKnownGameFactsV2(
  snapshot: DecisionSnapshotV2,
): KnownGameFacts;
```

The bridge may only accept `fixture` callers and must never be selected by a production source kind. The projector maps precise melds, dora, rivers, riichi threats, winds, remaining draws, completeness, and evidence refs; it must not invent furiten/legal actions or collapse partial completeness to true.

- [ ] **Step 4: Run GREEN and East 1 factor regression**

```powershell
npm test -- --run packages/reasoning/tests/legacy-event-stream-bridge.test.ts packages/reasoning/tests/known-game-facts-v2.test.ts packages/reasoning/tests/structured-factor-regression.test.ts
npm run typecheck
```

Expected: PASS, including the existing efficiency-versus-defense assertions.

- [ ] **Step 5: Commit**

```powershell
git add -- coach/packages/reasoning/src/import/legacy-event-stream-bridge.ts coach/packages/reasoning/src/factors/known-game-facts-v2.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/legacy-event-stream-bridge.test.ts coach/packages/reasoning/tests/known-game-facts-v2.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: project canonical replay facts"
```

---

### Task 9: Invariance, package exports, documentation, and acceptance

**Files:**

- Modify: `coach/packages/reasoning/tests/structured-factor-regression.test.ts`
- Create: `coach/packages/reasoning/tests/canonical-replay-invariance.test.ts`
- Modify: `coach/README.md`
- Create: `coach/docs/handoffs/2026-08-08-canonical-event-stream-round-reducer-handoff.md`

- [ ] **Step 1: Write failing transformation tests**

Assert:

```ts
expect(reduceCanonicalEventStream(JSON.parse(JSON.stringify(stream))))
  .toEqual(reduceCanonicalEventStream(stream));
expect(factsWithModelEvaluation).toEqual(factsWithoutModelEvaluation);
expect(snapshotAfterRemovingRiichi.publicState.riichiStates[2]?.status)
  .toBe("none");
expect(snapshotAfterChangingThreatActor.publicState.riichiStates[1]?.status)
  .toBe("accepted");
expect(JSON.stringify(snapshot)).not.toContain("opponentConcealed");
```

Move the East 1 test input from its old replay projector to the V2 snapshot projector while keeping golden sidecar results unchanged. Keep the legacy test separately until removal is approved by a future cleanup plan.

- [ ] **Step 2: Run RED and confirm it detects the old path**

```powershell
npm test -- --run packages/reasoning/tests/canonical-replay-invariance.test.ts packages/reasoning/tests/structured-factor-regression.test.ts
```

Expected: FAIL until the new production regression path is wired.

- [ ] **Step 3: Wire the V2 regression and document boundaries**

Update `coach/README.md` with:

- canonical stream is authoritative;
- public/private separation;
- source adapters only map records to events;
- legacy bridge is fixture-only;
- behavior/wait river inference remains unsupported in this batch.

Create the handoff with final commit list, schema version, test counts, known unsupported dimensions, protected workspace changes, and the next hand-structure/furiten plan entry point.

- [ ] **Step 4: Run complete acceptance**

```powershell
cd coach
npm test
npm run typecheck
npm run test:package-import
npm audit --omit=dev
cd ..
node --test tests/*.mjs
```

Expected: all coach tests PASS, typecheck PASS, package import PASS, audit reports zero vulnerabilities, and all root tests PASS.

- [ ] **Step 5: Request complete-slice code review**

Use the `requesting-code-review` skill against the diff from the plan’s starting commit. Fix every Critical and Important finding with a new failing test before implementation. Repeat focused and full acceptance after fixes.

- [ ] **Step 6: Commit final docs and handoff**

```powershell
git add -- coach/packages/reasoning/tests/structured-factor-regression.test.ts coach/packages/reasoning/tests/canonical-replay-invariance.test.ts coach/README.md coach/docs/handoffs/2026-08-08-canonical-event-stream-round-reducer-handoff.md
git diff --cached --name-only
git diff --cached --check
git commit -m "docs: hand off canonical round replay"
```

---

## Plan self-review

- Spec coverage: event identity, strict visibility, public/private states, calls/kans, riichi/ippatsu, dora, terminal settlement, snapshots, migration, invariance and East 1 gates all map to tasks.
- Deliberate follow-on scope: hand-family decomposition/furiten and defense-matrix algorithms are separate implementation plans because they consume this reducer but do not affect its event semantics.
- No runtime fallback: the only legacy bridge is explicitly fixture-only.
- Type consistency: event refs, actor range, tiles, decision windows, completeness and hashes use the canonical contracts throughout.
- Protected files: no task stages `overlay/cv重做.md` or `overlay/prompt.md`.
