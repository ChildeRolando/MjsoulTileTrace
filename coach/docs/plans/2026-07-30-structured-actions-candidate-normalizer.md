# Structured Actions and Candidate Normalizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict structured riichi actions, canonical action references, decision-window-aware candidate normalization, typed source adapters, and an explicit legacy discard bridge without changing the existing strict reasoning pipeline.

**Architecture:** Keep every trusted data shape, action invariant, canonical codec, and structured-comparison cross-field check in `@riichi-coach/contracts`; keep ambiguity resolution, known-fact consistency, origin merging, source adaptation, and legacy bridging as pure functions in `@riichi-coach/reasoning`. The new path projects explicitly to the slice-1 `ComparisonSet`, while the existing `ActionId`, `NormalizedDecision`, `FactorEvidence`, Mortal regression facade, analyzers, explanations, and validators remain untouched until the later `FactorPipeline` slice.

**Tech Stack:** TypeScript 5.9, NodeNext ESM, Zod 3.25, Vitest 3.2, Node.js test runner, npm workspaces.

---

## Scope and workspace safety

Implement only slice 2 from:

- `docs/superpowers/specs/2026-07-30-structured-actions-candidate-normalizer-design.md`

In scope:

- strict schemas for all eleven initial action variants;
- strict decision-window schemas and the allowed-action matrix;
- a single canonical `ActionRef` codec in `@riichi-coach/contracts`;
- `StructuredComparisonSetSchema` with action/ref rebinding checks;
- explicit `toComparisonSet` projection to the slice-1 contract;
- `ActionDraft`, `UserActionDraft`, `KnownActionFacts`, normalization-result, source-adaptation, and set-build contracts;
- ambiguity resolution and direct-known-fact three-state consistency;
- origin merging and explicit cross-window `not_comparable`;
- MJAI actions, atomic `reach + dahai`, five call forms, `hora`, nine-terminals abort, and `none`;
- a typed adapter port and Akagi conformance fixture without a private JSON parser;
- legacy discard bridges and a generic structured Mortal/MJAI importer;
- package exports, emitted-JavaScript smoke coverage, README, audit, and full regression.

Out of scope:

- changing or deleting `ActionIdSchema`;
- changing `NormalizedDecisionSchema`, `FactorEvidenceSchema`, `DecisionExplanationSchema`, or `StrictAnalysisPackage`;
- changing `compareDecision`, any five-axis analyzer, the teaching policy, explanation renderer, or package validator;
- legal-action enumeration, yaku validation, furiten validation, nine-terminals eligibility, or kan-wall/dora validation;
- production Akagi Native private JSON parsing;
- allowing an LLM free-text answer to instantiate a trusted `RiichiAction`;
- removing legacy `split(":")` calls from the old discard-only analyzers in this slice.

The worktree already contains unrelated user work in `RESOURCES.md` and `overlay/`. Before every commit, stage only the exact `coach/` files listed in that task. Never stage, rewrite, format, or delete `RESOURCES.md` or any path below `overlay/`.

## File map

Create:

- `coach/packages/contracts/src/actions.ts` — eleven strict actions, four decision windows, and action/window compatibility.
- `coach/packages/contracts/src/action-codec.ts` — the only canonical action tuple and `ActionRef` encoder.
- `coach/packages/contracts/src/structured-comparison.ts` — structured candidates, strict set invariants, and the legacy-view projection.
- `coach/packages/contracts/src/candidate-contracts.ts` — action drafts, user drafts, known facts, adapter results, normalization results, and set-build diagnostics.
- `coach/packages/contracts/tests/actions.test.ts`
- `coach/packages/contracts/tests/action-codec.test.ts`
- `coach/packages/contracts/tests/structured-comparison.test.ts`
- `coach/packages/contracts/tests/candidate-contracts.test.ts`
- `coach/packages/reasoning/src/candidate/user-action-draft.ts` — Chinese action-name and compact-tile conversion.
- `coach/packages/reasoning/src/candidate/candidate-normalizer.ts` — structural completion and direct-fact consistency.
- `coach/packages/reasoning/src/candidate/comparison-set-builder.ts` — cross-window rejection and same-action origin merging.
- `coach/packages/reasoning/src/candidate/legacy-action-bridge.ts` — explicit discard-only compatibility in both directions.
- `coach/packages/reasoning/src/import/action-adapter-port.ts` — typed adapter boundary shared by MJAI and Akagi conformance tests.
- `coach/packages/reasoning/src/import/mjai-action.ts` — public MJAI semantic adapter.
- `coach/packages/reasoning/src/import/structured-mortal.ts` — generic structured comparison plus score mapping.
- `coach/packages/reasoning/tests/user-action-draft.test.ts`
- `coach/packages/reasoning/tests/candidate-normalizer.test.ts`
- `coach/packages/reasoning/tests/comparison-set-builder.test.ts`
- `coach/packages/reasoning/tests/mjai-action.test.ts`
- `coach/packages/reasoning/tests/action-adapter-port.test.ts`
- `coach/packages/reasoning/tests/structured-mortal.test.ts`
- `coach/packages/reasoning/tests/legacy-action-bridge.test.ts`

Modify:

- `coach/packages/contracts/src/tiles.ts` — make the existing tile object reject undeclared fields.
- `coach/packages/contracts/src/index.ts` — export the structured contract path.
- `coach/packages/reasoning/src/index.ts` — export the new pure functions without changing `analyzeRegressionFixture`.
- `coach/smoke/package-import-smoke.mjs` — prove emitted JavaScript exposes both old and new APIs.
- `coach/README.md` — document the structured-action milestone and its explicit limits.

Do not modify:

- `coach/packages/contracts/src/decisions.ts`
- `coach/packages/contracts/src/evidence.ts`
- `coach/packages/reasoning/src/analysis/**`
- `coach/packages/reasoning/src/compare/action-comparator.ts`
- `coach/packages/reasoning/src/explain/deterministic-explanation.ts`
- `coach/packages/reasoning/src/import/mortal-report.ts`
- `coach/packages/reasoning/src/package/build-strict-analysis-package.ts`
- `coach/packages/reasoning/src/validate/package-validator.ts`

## Preflight

- [ ] Run `git status --short` from `E:\文档\日麻教学`.

Expected: `RESOURCES.md` and/or `overlay/` may be dirty. Record their exact state and leave it unchanged and unstaged.

- [ ] Run the existing coach baseline.

Run:

```powershell
npm test
npm run typecheck
npm run test:package-import
```

Working directory: `E:\文档\日麻教学\coach`

Expected: all existing Vitest tests pass; TypeScript reports no errors; the emitted package-import smoke test passes.

- [ ] Run the legacy course baseline.

Run:

```powershell
node --test tests/*.test.mjs
```

Working directory: `E:\文档\日麻教学`

Expected: exactly 18 legacy tests pass with 0 failures.

### Task 1: Strict actions and decision windows

**Files:**

- Create: `coach/packages/contracts/tests/actions.test.ts`
- Create: `coach/packages/contracts/src/actions.ts`
- Modify: `coach/packages/contracts/src/tiles.ts`
- Modify: `coach/packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing action-contract tests**

Create `coach/packages/contracts/tests/actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DecisionWindowSchema,
  RiichiActionSchema,
  actionWindowConflictCodes,
  type RiichiAction,
} from "../src/index.js";

const tile = (id: "1m" | "2m" | "3m" | "5p" | "7z", red = false) => ({
  id,
  red,
});

const actions: RiichiAction[] = [
  { kind: "discard", tile: tile("5p"), discardMode: "tedashi" },
  {
    kind: "riichi_discard",
    tile: tile("5p", true),
    discardMode: "tsumogiri",
  },
  {
    kind: "chi",
    calledTile: tile("2m"),
    consumedTiles: [tile("1m"), tile("3m")],
    targetActor: 1,
    responseEventRef: "event:discard",
  },
  {
    kind: "pon",
    calledTile: tile("5p"),
    consumedTiles: [tile("5p"), tile("5p", true)],
    targetActor: 1,
    responseEventRef: "event:discard",
  },
  {
    kind: "daiminkan",
    calledTile: tile("5p"),
    consumedTiles: [tile("5p"), tile("5p"), tile("5p", true)],
    targetActor: 1,
    responseEventRef: "event:discard",
  },
  {
    kind: "ankan",
    tiles: [
      tile("5p"),
      tile("5p"),
      tile("5p"),
      tile("5p", true),
    ],
  },
  {
    kind: "kakan",
    addedTile: tile("5p", true),
    existingMeldRef: "meld:pon:5p",
  },
  {
    kind: "tsumo",
    winningTile: tile("5p", true),
    drawEventRef: "event:draw",
  },
  {
    kind: "ron",
    winningTile: tile("5p"),
    targetActor: 1,
    responseEventRef: "event:discard",
    winContext: "discard",
  },
  {
    kind: "kyuushu_kyuuhai",
    drawEventRef: "event:draw",
  },
  {
    kind: "pass",
    responseEventRef: "event:discard",
    responseKind: "discard",
  },
];

describe("structured riichi actions", () => {
  it("round-trips all eleven action variants", () => {
    expect(actions.map((action) =>
      RiichiActionSchema.parse(JSON.parse(JSON.stringify(action))).kind
    )).toEqual([
      "discard",
      "riichi_discard",
      "chi",
      "pon",
      "daiminkan",
      "ankan",
      "kakan",
      "tsumo",
      "ron",
      "kyuushu_kyuuhai",
      "pass",
    ]);
  });

  it("rejects undeclared fields at both action and tile boundaries", () => {
    expect(() => RiichiActionSchema.parse({
      kind: "discard",
      tile: { id: "5p", red: false, hiddenOwner: 2 },
      discardMode: "tedashi",
    })).toThrow();
    expect(() => RiichiActionSchema.parse({
      kind: "discard",
      tile: tile("5p"),
      discardMode: "tedashi",
      modelReason: "defense",
    })).toThrow();
  });

  it("rejects malformed chi, pon, daiminkan, ankan, and kakan identities", () => {
    expect(() => RiichiActionSchema.parse({
      kind: "chi",
      calledTile: tile("2m"),
      consumedTiles: [tile("2m"), tile("3m")],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toThrow(/consecutive/);
    expect(() => RiichiActionSchema.parse({
      kind: "pon",
      calledTile: tile("5p"),
      consumedTiles: [tile("5p"), tile("7z")],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toThrow(/same tile ID/);
    expect(() => RiichiActionSchema.parse({
      kind: "daiminkan",
      calledTile: tile("5p"),
      consumedTiles: [tile("5p"), tile("5p"), tile("7z")],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toThrow(/same tile ID/);
    expect(() => RiichiActionSchema.parse({
      kind: "ankan",
      tiles: [tile("5p"), tile("5p"), tile("5p"), tile("7z")],
    })).toThrow(/same tile ID/);
    expect(() => RiichiActionSchema.parse({
      kind: "kakan",
      addedTile: tile("5p"),
      existingMeldRef: "",
    })).toThrow();
  });

  it("requires canonical tile order for consumed call tiles", () => {
    expect(() => RiichiActionSchema.parse({
      kind: "chi",
      calledTile: tile("2m"),
      consumedTiles: [tile("3m"), tile("1m")],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toThrow(/canonical tile order/);
    expect(() => RiichiActionSchema.parse({
      kind: "pon",
      calledTile: tile("5p"),
      consumedTiles: [tile("5p", true), tile("5p")],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toThrow(/canonical tile order/);
  });
});

describe("decision windows", () => {
  it("parses all four strict window variants", () => {
    expect([
      DecisionWindowSchema.parse({
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "event:draw",
      }),
      DecisionWindowSchema.parse({
        kind: "discard_response",
        actor: 0,
        triggerEventRef: "event:discard",
        sourceActor: 1,
        offeredTile: tile("5p"),
      }),
      DecisionWindowSchema.parse({
        kind: "kan_response",
        actor: null,
        triggerEventRef: "event:kakan",
        sourceActor: null,
        offeredTile: tile("5p", true),
        kanKind: "kakan",
      }),
      DecisionWindowSchema.parse({
        kind: "post_call_discard",
        actor: 0,
        triggerEventRef: "event:chi",
      }),
    ].map((window) => window.kind)).toEqual([
      "self_turn",
      "discard_response",
      "kan_response",
      "post_call_discard",
    ]);
  });

  it("enforces the action/window matrix and response binding", () => {
    const discardResponse = DecisionWindowSchema.parse({
      kind: "discard_response",
      actor: 0,
      triggerEventRef: "event:discard",
      sourceActor: 1,
      offeredTile: tile("5p"),
    });
    const postCall = DecisionWindowSchema.parse({
      kind: "post_call_discard",
      actor: 0,
      triggerEventRef: "event:chi",
    });

    expect(actionWindowConflictCodes(actions[2]!, discardResponse)).toEqual([]);
    expect(actionWindowConflictCodes(actions[7]!, discardResponse)).toContain(
      "action_not_allowed_in_window",
    );
    expect(actionWindowConflictCodes(actions[2]!, postCall)).toContain(
      "action_not_allowed_in_window",
    );
    expect(actionWindowConflictCodes(
      { kind: "discard", tile: tile("5p"), discardMode: "tsumogiri" },
      postCall,
    )).toContain("post_call_discard_requires_tedashi");
    expect(actionWindowConflictCodes(
      {
        kind: "pass",
        responseEventRef: "event:other",
        responseKind: "kakan",
      },
      discardResponse,
    )).toEqual([
      "response_event_mismatch",
      "response_kind_mismatch",
    ]);
    expect(actionWindowConflictCodes(
      {
        kind: "chi",
        calledTile: tile("3m"),
        consumedTiles: [tile("1m"), tile("2m")],
        targetActor: 2,
        responseEventRef: "event:discard",
      },
      discardResponse,
    )).toEqual([
      "response_source_actor_mismatch",
      "response_tile_mismatch",
    ]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```powershell
npx vitest run packages/contracts/tests/actions.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because `RiichiActionSchema`, `DecisionWindowSchema`, and `actionWindowConflictCodes` are not exported.

- [ ] **Step 3: Make tiles strict and implement the action/window contracts**

Apply this patch to `coach/packages/contracts/src/tiles.ts`:

```diff
 export const TileSchema = z.object({
   id: TileIdSchema,
   red: z.boolean(),
-}).superRefine((tile, context) => {
+}).strict().superRefine((tile, context) => {
```

Create `coach/packages/contracts/src/actions.ts`:

```ts
import { z } from "zod";
import { TileSchema, type Tile } from "./tiles.js";

const ActorSchema = z.number().int().min(0).max(3);
const EventRefSchema = z.string().min(1);
const MeldRefSchema = z.string().min(1);
const DiscardModeSchema = z.enum(["tsumogiri", "tedashi"]);

const DiscardActionSchema = z.object({
  kind: z.literal("discard"),
  tile: TileSchema,
  discardMode: DiscardModeSchema,
}).strict();

const RiichiDiscardActionSchema = z.object({
  kind: z.literal("riichi_discard"),
  tile: TileSchema,
  discardMode: DiscardModeSchema,
}).strict();

const ChiActionSchema = z.object({
  kind: z.literal("chi"),
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema]),
  targetActor: ActorSchema,
  responseEventRef: EventRefSchema,
}).strict();

const PonActionSchema = z.object({
  kind: z.literal("pon"),
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema]),
  targetActor: ActorSchema,
  responseEventRef: EventRefSchema,
}).strict();

const DaiminkanActionSchema = z.object({
  kind: z.literal("daiminkan"),
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema, TileSchema]),
  targetActor: ActorSchema,
  responseEventRef: EventRefSchema,
}).strict();

const AnkanActionSchema = z.object({
  kind: z.literal("ankan"),
  tiles: z.tuple([TileSchema, TileSchema, TileSchema, TileSchema]),
}).strict();

const KakanActionSchema = z.object({
  kind: z.literal("kakan"),
  addedTile: TileSchema,
  existingMeldRef: MeldRefSchema,
}).strict();

const TsumoActionSchema = z.object({
  kind: z.literal("tsumo"),
  winningTile: TileSchema,
  drawEventRef: EventRefSchema,
}).strict();

const RonActionSchema = z.object({
  kind: z.literal("ron"),
  winningTile: TileSchema,
  targetActor: ActorSchema,
  responseEventRef: EventRefSchema,
  winContext: z.enum(["discard", "kakan", "ankan"]),
}).strict();

const KyuushuKyuuhaiActionSchema = z.object({
  kind: z.literal("kyuushu_kyuuhai"),
  drawEventRef: EventRefSchema,
}).strict();

const PassActionSchema = z.object({
  kind: z.literal("pass"),
  responseEventRef: EventRefSchema,
  responseKind: z.enum(["discard", "kakan", "ankan"]),
}).strict();

const RiichiActionObjectSchema = z.discriminatedUnion("kind", [
  DiscardActionSchema,
  RiichiDiscardActionSchema,
  ChiActionSchema,
  PonActionSchema,
  DaiminkanActionSchema,
  AnkanActionSchema,
  KakanActionSchema,
  TsumoActionSchema,
  RonActionSchema,
  KyuushuKyuuhaiActionSchema,
  PassActionSchema,
]);

function tileOrder(tile: Tile): number {
  const suit = tile.id[1] as "m" | "p" | "s" | "z";
  const suitOffset = { m: 0, p: 9, s: 18, z: 27 }[suit];
  return suitOffset * 2 + (Number(tile.id[0]) - 1) * 2 + Number(tile.red);
}

export function sortTilesCanonical<T extends readonly Tile[]>(tiles: T): T {
  return [...tiles].sort((left, right) =>
    tileOrder(left) - tileOrder(right)
  ) as unknown as T;
}

function isCanonicalTileOrder(tiles: readonly Tile[]): boolean {
  const sorted = sortTilesCanonical(tiles);
  return tiles.every((tile, index) =>
    tile.id === sorted[index]!.id && tile.red === sorted[index]!.red
  );
}

function sameTileId(tiles: readonly Tile[]): boolean {
  return tiles.every((tile) => tile.id === tiles[0]!.id);
}

function sameTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function isChiSequence(action: z.infer<typeof ChiActionSchema>): boolean {
  const tiles = [action.calledTile, ...action.consumedTiles];
  if (tiles.some((tile) => tile.id.endsWith("z"))) {
    return false;
  }
  const suits = new Set(tiles.map((tile) => tile.id[1]));
  const ranks = [...new Set(tiles.map((tile) => Number(tile.id[0])))].sort(
    (left, right) => left - right,
  );
  return suits.size === 1 &&
    ranks.length === 3 &&
    ranks[1] === ranks[0]! + 1 &&
    ranks[2] === ranks[1]! + 1;
}

export const RiichiActionSchema = RiichiActionObjectSchema.superRefine(
  (action, context) => {
    if (action.kind === "chi" && !isChiSequence(action)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chi tiles must form one suited consecutive sequence",
        path: ["consumedTiles"],
      });
    }
    if (
      (action.kind === "pon" || action.kind === "daiminkan") &&
      !sameTileId([action.calledTile, ...action.consumedTiles])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${action.kind} tiles must have the same tile ID`,
        path: ["consumedTiles"],
      });
    }
    if (action.kind === "ankan" && !sameTileId(action.tiles)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ankan tiles must have the same tile ID",
        path: ["tiles"],
      });
    }
    if (
      (action.kind === "chi" ||
        action.kind === "pon" ||
        action.kind === "daiminkan") &&
      !isCanonicalTileOrder(action.consumedTiles)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Consumed tiles must use canonical tile order",
        path: ["consumedTiles"],
      });
    }
    if (action.kind === "ankan" && !isCanonicalTileOrder(action.tiles)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ankan tiles must use canonical tile order",
        path: ["tiles"],
      });
    }
  },
);
export type RiichiAction = z.infer<typeof RiichiActionSchema>;
export type RiichiActionKind = RiichiAction["kind"];

const SelfTurnWindowSchema = z.object({
  kind: z.literal("self_turn"),
  actor: ActorSchema.nullable(),
  triggerEventRef: EventRefSchema,
}).strict();

const DiscardResponseWindowSchema = z.object({
  kind: z.literal("discard_response"),
  actor: ActorSchema.nullable(),
  triggerEventRef: EventRefSchema,
  sourceActor: ActorSchema.nullable(),
  offeredTile: TileSchema,
}).strict();

const KanResponseWindowSchema = z.object({
  kind: z.literal("kan_response"),
  actor: ActorSchema.nullable(),
  triggerEventRef: EventRefSchema,
  sourceActor: ActorSchema.nullable(),
  offeredTile: TileSchema,
  kanKind: z.enum(["kakan", "ankan"]),
}).strict();

const PostCallDiscardWindowSchema = z.object({
  kind: z.literal("post_call_discard"),
  actor: ActorSchema.nullable(),
  triggerEventRef: EventRefSchema,
}).strict();

export const DecisionWindowSchema = z.discriminatedUnion("kind", [
  SelfTurnWindowSchema,
  DiscardResponseWindowSchema,
  KanResponseWindowSchema,
  PostCallDiscardWindowSchema,
]);
export type DecisionWindow = z.infer<typeof DecisionWindowSchema>;

const allowedKinds: Record<DecisionWindow["kind"], readonly RiichiActionKind[]> = {
  self_turn: [
    "discard",
    "riichi_discard",
    "ankan",
    "kakan",
    "tsumo",
    "kyuushu_kyuuhai",
  ],
  discard_response: ["chi", "pon", "daiminkan", "ron", "pass"],
  kan_response: ["ron", "pass"],
  post_call_discard: ["discard"],
};

export type ActionWindowConflictCode =
  | "action_not_allowed_in_window"
  | "post_call_discard_requires_tedashi"
  | "response_event_mismatch"
  | "response_kind_mismatch"
  | "response_source_actor_mismatch"
  | "response_tile_mismatch"
  | "draw_event_mismatch";

export function actionWindowConflictCodes(
  action: RiichiAction,
  window: DecisionWindow,
): ActionWindowConflictCode[] {
  const conflicts: ActionWindowConflictCode[] = [];
  if (!allowedKinds[window.kind].includes(action.kind)) {
    conflicts.push("action_not_allowed_in_window");
    return conflicts;
  }
  if (
    window.kind === "post_call_discard" &&
    action.kind === "discard" &&
    action.discardMode !== "tedashi"
  ) {
    conflicts.push("post_call_discard_requires_tedashi");
  }
  if (
    (action.kind === "chi" ||
      action.kind === "pon" ||
      action.kind === "daiminkan" ||
      action.kind === "ron" ||
      action.kind === "pass") &&
    action.responseEventRef !== window.triggerEventRef
  ) {
    conflicts.push("response_event_mismatch");
  }
  if (
    (action.kind === "tsumo" || action.kind === "kyuushu_kyuuhai") &&
    action.drawEventRef !== window.triggerEventRef
  ) {
    conflicts.push("draw_event_mismatch");
  }
  if (
    (window.kind === "discard_response" ||
      window.kind === "kan_response") &&
    (action.kind === "chi" ||
      action.kind === "pon" ||
      action.kind === "daiminkan" ||
      action.kind === "ron")
  ) {
    if (
      window.sourceActor !== null &&
      action.targetActor !== window.sourceActor
    ) {
      conflicts.push("response_source_actor_mismatch");
    }
    const responseTile =
      action.kind === "ron" ? action.winningTile : action.calledTile;
    if (!sameTile(responseTile, window.offeredTile)) {
      conflicts.push("response_tile_mismatch");
    }
  }
  if (action.kind === "ron") {
    const expected =
      window.kind === "discard_response"
        ? "discard"
        : window.kind === "kan_response"
          ? window.kanKind
          : null;
    if (action.winContext !== expected) {
      conflicts.push("response_kind_mismatch");
    }
  }
  if (action.kind === "pass") {
    const expected =
      window.kind === "discard_response"
        ? "discard"
        : window.kind === "kan_response"
          ? window.kanKind
          : null;
    if (action.responseKind !== expected) {
      conflicts.push("response_kind_mismatch");
    }
  }
  return conflicts;
}
```

Apply this patch to `coach/packages/contracts/src/index.ts`:

```diff
 export * from "./analysis-request.js";
+export * from "./actions.js";
```

- [ ] **Step 4: Run the focused tests and typecheck**

Run:

```powershell
npx vitest run packages/contracts/tests/actions.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: action and window tests PASS; typecheck PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add -- coach/packages/contracts/src/actions.ts coach/packages/contracts/src/tiles.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/actions.test.ts
git diff --cached --check
git commit -m "feat: define structured riichi actions"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the four listed files. `RESOURCES.md` and `overlay/` remain unstaged.

### Task 2: Canonical action codec and structured comparison sets

**Files:**

- Create: `coach/packages/contracts/tests/action-codec.test.ts`
- Create: `coach/packages/contracts/tests/structured-comparison.test.ts`
- Create: `coach/packages/contracts/src/action-codec.ts`
- Create: `coach/packages/contracts/src/structured-comparison.ts`
- Modify: `coach/packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing codec and structured-set tests**

Create `coach/packages/contracts/tests/action-codec.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canonicalActionRef,
  canonicalActionTuple,
  type RiichiAction,
} from "../src/index.js";

const normalFive = { id: "5p" as const, red: false };
const redFive = { id: "5p" as const, red: true };

describe("canonical action codec", () => {
  it("is stable across object field insertion order", () => {
    const first: RiichiAction = {
      kind: "discard",
      tile: normalFive,
      discardMode: "tedashi",
    };
    const second = {
      discardMode: "tedashi",
      tile: { red: false, id: "5p" },
      kind: "discard",
    } as unknown as RiichiAction;

    expect(canonicalActionTuple(first)).toEqual([
      "discard",
      ["5p", false],
      "tedashi",
    ]);
    expect(canonicalActionRef(first)).toBe(canonicalActionRef(second));
    expect(canonicalActionRef(first)).toMatch(/^action:v1:/);
  });

  it("changes for every consequence-bearing discard identity field", () => {
    const refs = [
      canonicalActionRef({
        kind: "discard",
        tile: normalFive,
        discardMode: "tedashi",
      }),
      canonicalActionRef({
        kind: "discard",
        tile: redFive,
        discardMode: "tedashi",
      }),
      canonicalActionRef({
        kind: "discard",
        tile: normalFive,
        discardMode: "tsumogiri",
      }),
      canonicalActionRef({
        kind: "riichi_discard",
        tile: normalFive,
        discardMode: "tedashi",
      }),
    ];

    expect(new Set(refs).size).toBe(4);
  });

  it("preserves call composition, red choice, event, actor, and meld references", () => {
    const base = {
      kind: "pon" as const,
      calledTile: normalFive,
      consumedTiles: [normalFive, redFive] as const,
      targetActor: 1,
      responseEventRef: "event:discard",
    };
    expect(canonicalActionRef(base)).not.toBe(canonicalActionRef({
      ...base,
      consumedTiles: [normalFive, normalFive],
    }));
    expect(canonicalActionRef(base)).not.toBe(canonicalActionRef({
      ...base,
      targetActor: 2,
    }));
    expect(canonicalActionRef(base)).not.toBe(canonicalActionRef({
      ...base,
      responseEventRef: "event:other",
    }));
    expect(canonicalActionRef({
      kind: "chi",
      calledTile: { id: "4p", red: false },
      consumedTiles: [
        { id: "3p", red: false },
        normalFive,
      ],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).not.toBe(canonicalActionRef({
      kind: "chi",
      calledTile: { id: "4p", red: false },
      consumedTiles: [
        { id: "3p", red: false },
        redFive,
      ],
      targetActor: 1,
      responseEventRef: "event:discard",
    }));
    expect(canonicalActionRef({
      kind: "kakan",
      addedTile: redFive,
      existingMeldRef: "meld:a",
    })).not.toBe(canonicalActionRef({
      kind: "kakan",
      addedTile: redFive,
      existingMeldRef: "meld:b",
    }));
  });
});
```

Create `coach/packages/contracts/tests/structured-comparison.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  StructuredComparisonSetSchema,
  canonicalActionRef,
  toComparisonSet,
  type RiichiAction,
} from "../src/index.js";

const modelAction: RiichiAction = {
  kind: "discard",
  tile: { id: "6s", red: false },
  discardMode: "tsumogiri",
};
const actualAction: RiichiAction = {
  kind: "discard",
  tile: { id: "2p", red: false },
  discardMode: "tedashi",
};

const validAutomaticSet = {
  comparisonSetId: "comparison:e1:t6:structured",
  origin: "automatic_review",
  decisionLayerRef: "decision-layer:e1:t6",
  decisionWindow: {
    kind: "self_turn",
    actor: 3,
    triggerEventRef: "event-50",
  },
  candidates: [
    {
      actionRef: canonicalActionRef(modelAction),
      action: modelAction,
      origins: ["model"],
    },
    {
      actionRef: canonicalActionRef(actualAction),
      action: actualAction,
      origins: ["model", "actual"],
    },
  ],
} as const;

describe("structured comparison sets", () => {
  it("accepts an action-bound automatic comparison and projects it explicitly", () => {
    const structured = StructuredComparisonSetSchema.parse(validAutomaticSet);
    const legacyView = toComparisonSet(structured);

    expect(legacyView).toEqual({
      comparisonSetId: validAutomaticSet.comparisonSetId,
      origin: "automatic_review",
      decisionLayerRef: validAutomaticSet.decisionLayerRef,
      candidates: structured.candidates.map(({ actionRef, origins }) => ({
        actionRef,
        origins,
      })),
    });
    expect(Object.keys(legacyView)).not.toContain("decisionWindow");
    expect(Object.keys(legacyView.candidates[0]!)).not.toContain("action");
  });

  it("recomputes ActionRef and rejects a forged action/ref binding", () => {
    expect(() => StructuredComparisonSetSchema.parse({
      ...validAutomaticSet,
      candidates: [
        {
          ...validAutomaticSet.candidates[0],
          actionRef: canonicalActionRef(actualAction),
        },
        validAutomaticSet.candidates[1],
      ],
    })).toThrow(/canonical codec/);
  });

  it("rejects duplicate actions and invalid automatic origins", () => {
    expect(() => StructuredComparisonSetSchema.parse({
      ...validAutomaticSet,
      candidates: [
        validAutomaticSet.candidates[0],
        {
          ...validAutomaticSet.candidates[0],
          origins: ["model", "actual"],
        },
      ],
    })).toThrow(/unique structured actions/);
    expect(() => StructuredComparisonSetSchema.parse({
      ...validAutomaticSet,
      candidates: [
        validAutomaticSet.candidates[0],
        {
          ...validAutomaticSet.candidates[1],
          origins: ["actual"],
        },
      ],
    })).toThrow(/must come from the model/);
  });

  it("rejects actions that do not belong to the frozen window", () => {
    const chi: RiichiAction = {
      kind: "chi",
      calledTile: { id: "2m", red: false },
      consumedTiles: [
        { id: "1m", red: false },
        { id: "3m", red: false },
      ],
      targetActor: 1,
      responseEventRef: "event:discard",
    };
    expect(() => StructuredComparisonSetSchema.parse({
      comparisonSetId: "comparison:wrong-window",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:wrong-window",
      decisionWindow: {
        kind: "post_call_discard",
        actor: 0,
        triggerEventRef: "event:chi",
      },
      candidates: [
        {
          actionRef: canonicalActionRef(chi),
          action: chi,
          origins: ["user"],
        },
        {
          actionRef: canonicalActionRef(actualAction),
          action: actualAction,
          origins: ["user"],
        },
      ],
    })).toThrow(/action_not_allowed_in_window/);
  });

  it("rejects response-event and kan-kind mismatches", () => {
    const wrongRon: RiichiAction = {
      kind: "ron",
      winningTile: { id: "5p", red: true },
      targetActor: 1,
      responseEventRef: "event:other",
      winContext: "ankan",
    };
    const pass: RiichiAction = {
      kind: "pass",
      responseEventRef: "event:kakan",
      responseKind: "kakan",
    };
    expect(() => StructuredComparisonSetSchema.parse({
      comparisonSetId: "comparison:kan-response",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:kan-response",
      decisionWindow: {
        kind: "kan_response",
        actor: 0,
        triggerEventRef: "event:kakan",
        sourceActor: 1,
        offeredTile: { id: "5p", red: true },
        kanKind: "kakan",
      },
      candidates: [
        {
          actionRef: canonicalActionRef(wrongRon),
          action: wrongRon,
          origins: ["user"],
        },
        {
          actionRef: canonicalActionRef(pass),
          action: pass,
          origins: ["user"],
        },
      ],
    })).toThrow(/response_event_mismatch|response_kind_mismatch/);
  });
});
```

- [ ] **Step 2: Run both focused tests and verify failure**

Run:

```powershell
npx vitest run packages/contracts/tests/action-codec.test.ts packages/contracts/tests/structured-comparison.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because the canonical codec and structured comparison exports do not exist.

- [ ] **Step 3: Implement the one canonical codec**

Create `coach/packages/contracts/src/action-codec.ts`:

```ts
import { ActionRefSchema, type ActionRef } from "./comparison.js";
import {
  RiichiActionSchema,
  type RiichiAction,
} from "./actions.js";
import type { Tile } from "./tiles.js";

type CanonicalTileTuple = readonly [Tile["id"], boolean];
type CanonicalActionTuple = readonly unknown[];

function tileTuple(tile: Tile): CanonicalTileTuple {
  return [tile.id, tile.red];
}

export function canonicalActionTuple(
  rawAction: RiichiAction,
): CanonicalActionTuple {
  const action = RiichiActionSchema.parse(rawAction);
  switch (action.kind) {
    case "discard":
    case "riichi_discard":
      return [action.kind, tileTuple(action.tile), action.discardMode];
    case "chi":
    case "pon":
    case "daiminkan":
      return [
        action.kind,
        tileTuple(action.calledTile),
        action.consumedTiles.map(tileTuple),
        action.targetActor,
        action.responseEventRef,
      ];
    case "ankan":
      return [action.kind, action.tiles.map(tileTuple)];
    case "kakan":
      return [
        action.kind,
        tileTuple(action.addedTile),
        action.existingMeldRef,
      ];
    case "tsumo":
      return [action.kind, tileTuple(action.winningTile), action.drawEventRef];
    case "ron":
      return [
        action.kind,
        tileTuple(action.winningTile),
        action.targetActor,
        action.responseEventRef,
        action.winContext,
      ];
    case "kyuushu_kyuuhai":
      return [action.kind, action.drawEventRef];
    case "pass":
      return [action.kind, action.responseEventRef, action.responseKind];
  }
}

export function canonicalActionRef(rawAction: RiichiAction): ActionRef {
  const encoded = encodeURIComponent(
    JSON.stringify(canonicalActionTuple(rawAction)),
  );
  return ActionRefSchema.parse(`action:v1:${encoded}`);
}
```

- [ ] **Step 4: Implement strict structured sets and the explicit legacy projection**

Create `coach/packages/contracts/src/structured-comparison.ts`:

```ts
import { z } from "zod";
import {
  ActionRefSchema,
  CandidateOriginSchema,
  ComparisonSetSchema,
  DecisionLayerRefSchema,
  type ComparisonSet,
} from "./comparison.js";
import {
  DecisionWindowSchema,
  RiichiActionSchema,
  actionWindowConflictCodes,
} from "./actions.js";
import { canonicalActionRef } from "./action-codec.js";

const StructuredCandidateOriginsSchema = z.array(CandidateOriginSchema).min(1)
  .superRefine((origins, context) => {
    if (new Set(origins).size !== origins.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Structured candidate origins must be unique",
      });
    }
  });

export const StructuredComparisonCandidateSchema = z.object({
  actionRef: ActionRefSchema,
  action: RiichiActionSchema,
  origins: StructuredCandidateOriginsSchema,
}).strict().superRefine((candidate, context) => {
  if (candidate.actionRef !== canonicalActionRef(candidate.action)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ActionRef must equal the contracts canonical codec result",
      path: ["actionRef"],
    });
  }
});
export type StructuredComparisonCandidate = z.infer<
  typeof StructuredComparisonCandidateSchema
>;

export const StructuredComparisonSetSchema = z.object({
  comparisonSetId: z.string().min(1),
  origin: z.enum(["automatic_review", "user_comparison"]),
  decisionLayerRef: DecisionLayerRefSchema,
  decisionWindow: DecisionWindowSchema,
  candidates: z.array(StructuredComparisonCandidateSchema).min(2),
}).strict().superRefine((comparisonSet, context) => {
  const refs = comparisonSet.candidates.map((candidate) => candidate.actionRef);
  if (new Set(refs).size !== refs.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Comparison candidates must contain unique structured actions",
      path: ["candidates"],
    });
  }
  const actual = comparisonSet.candidates.filter(
    (candidate) => candidate.origins.includes("actual"),
  );
  if (actual.length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A structured comparison may contain at most one actual action",
      path: ["candidates"],
    });
  }
  if (comparisonSet.origin === "automatic_review") {
    if (actual.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Automatic review requires exactly one actual action",
        path: ["candidates"],
      });
    }
    comparisonSet.candidates.forEach((candidate, index) => {
      if (!candidate.origins.includes("model")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Every automatic-review candidate must come from the model",
          path: ["candidates", index, "origins"],
        });
      }
    });
  }
  comparisonSet.candidates.forEach((candidate, index) => {
    const conflicts = actionWindowConflictCodes(
      candidate.action,
      comparisonSet.decisionWindow,
    );
    for (const conflict of conflicts) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: conflict,
        path: ["candidates", index, "action"],
      });
    }
  });
});
export type StructuredComparisonSet = z.infer<
  typeof StructuredComparisonSetSchema
>;

export function toComparisonSet(
  rawStructured: StructuredComparisonSet,
): ComparisonSet {
  const structured = StructuredComparisonSetSchema.parse(rawStructured);
  return ComparisonSetSchema.parse({
    comparisonSetId: structured.comparisonSetId,
    origin: structured.origin,
    decisionLayerRef: structured.decisionLayerRef,
    candidates: structured.candidates.map(({ actionRef, origins }) => ({
      actionRef,
      origins,
    })),
  });
}
```

Apply this patch to `coach/packages/contracts/src/index.ts`:

```diff
 export * from "./actions.js";
+export * from "./action-codec.js";
+export * from "./structured-comparison.js";
```

- [ ] **Step 5: Run contract tests, typecheck, and rebuild emitted contracts**

Run:

```powershell
npx vitest run packages/contracts/tests/action-codec.test.ts packages/contracts/tests/structured-comparison.test.ts
npx vitest run packages/contracts/tests
npm run typecheck
npm run build -w @riichi-coach/contracts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: focused and full contract tests PASS; typecheck PASS; contract build PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```powershell
git add -- coach/packages/contracts/src/action-codec.ts coach/packages/contracts/src/structured-comparison.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/action-codec.test.ts coach/packages/contracts/tests/structured-comparison.test.ts
git diff --cached --check
git commit -m "feat: bind canonical structured actions"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the five listed files. `RESOURCES.md` and `overlay/` remain unstaged.

### Task 3: Draft, fact, adapter, and result contracts

**Files:**

- Create: `coach/packages/contracts/tests/candidate-contracts.test.ts`
- Create: `coach/packages/contracts/src/candidate-contracts.ts`
- Modify: `coach/packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing boundary-contract tests**

Create `coach/packages/contracts/tests/candidate-contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ActionDraftSchema,
  CandidateNormalizationResultSchema,
  KnownActionFactsSchema,
  SourceActionAdaptationResultSchema,
  StructuredComparisonBuildResultSchema,
  UserActionDraftSchema,
} from "../src/index.js";

describe("candidate boundary contracts", () => {
  it("accepts an intentionally incomplete typed draft without trusting it", () => {
    expect(ActionDraftSchema.parse({
      kind: "riichi_discard",
    })).toEqual({ kind: "riichi_discard" });
    expect(ActionDraftSchema.parse({
      kind: "discard",
      tile: { id: "5p" },
    })).toEqual({
      kind: "discard",
      tile: { id: "5p" },
    });
  });

  it("accepts Chinese action names and compact m/p/s/z notation", () => {
    expect(UserActionDraftSchema.parse({
      actionName: "吃",
      calledTile: "3m",
      consumedTiles: ["1m", "2m"],
      targetActor: 1,
    })).toEqual({
      actionName: "吃",
      calledTile: "3m",
      consumedTiles: ["1m", "2m"],
      targetActor: 1,
    });
    expect(UserActionDraftSchema.parse({
      actionName: "切牌",
      tile: "5pr",
      discardMode: "tedashi",
    }).tile).toBe("5pr");
    expect(() => UserActionDraftSchema.parse({
      actionName: "切牌",
      tile: "0p",
    })).toThrow();
  });

  it("distinguishes missing facts from known-empty facts", () => {
    const missing = KnownActionFactsSchema.parse({
      decisionWindow: {
        kind: "self_turn",
        actor: null,
        triggerEventRef: "user_asserted:draw",
      },
    });
    const knownEmpty = KnownActionFactsSchema.parse({
      decisionWindow: {
        kind: "self_turn",
        actor: null,
        triggerEventRef: "user_asserted:draw",
      },
      concealedTiles: [],
      currentDraw: null,
      melds: [],
    });

    expect("concealedTiles" in missing).toBe(false);
    expect(knownEmpty).toMatchObject({
      concealedTiles: [],
      currentDraw: null,
      melds: [],
    });
    expect(Object.is(KnownActionFactsSchema.parse(knownEmpty), knownEmpty))
      .toBe(false);
  });

  it("parses every single-candidate result state", () => {
    expect(CandidateNormalizationResultSchema.parse({
      status: "needs_clarification",
      ambiguousFields: ["tile.red"],
    }).status).toBe("needs_clarification");
    expect(CandidateNormalizationResultSchema.parse({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["tsumogiri_draw_mismatch"],
      evidenceRefs: ["event:draw"],
    }).status).toBe("inconsistent_with_known_facts");
    expect(CandidateNormalizationResultSchema.parse({
      status: "unsupported_source_action",
      sourceType: "mystery_extension",
    }).status).toBe("unsupported_source_action");
  });

  it("keeps source-import and set-build diagnostics explicit", () => {
    expect(SourceActionAdaptationResultSchema.parse({
      status: "incomplete",
      sourceType: "mjai:reach",
      diagnosticCode: "reach_without_dahai",
      missingFields: ["tile", "discardMode"],
      factRefs: ["event:reach"],
    }).diagnosticCode).toBe("reach_without_dahai");
    expect(StructuredComparisonBuildResultSchema.parse({
      status: "not_comparable",
      code: "cross_decision_window",
      actionRefs: [],
      windowKinds: ["discard_response", "post_call_discard"],
    }).status).toBe("not_comparable");
  });

  it("rejects undeclared fields on drafts and known facts", () => {
    expect(() => ActionDraftSchema.parse({
      kind: "pass",
      responseEventRef: "event:discard",
      modelReason: "defense",
    })).toThrow();
    expect(() => KnownActionFactsSchema.parse({
      decisionWindow: {
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "event:draw",
      },
      opponentHands: [[]],
    })).toThrow();
    expect(() => KnownActionFactsSchema.parse({
      decisionWindow: {
        kind: "self_turn",
        actor: 0,
        triggerEventRef: "event:draw",
      },
      melds: [{
        meldRef: "meld:forged-pon",
        kind: "pon",
        tiles: [
          { id: "5p", red: false },
          { id: "5p", red: true },
          { id: "7z", red: false },
        ],
      }],
    })).toThrow(/Known pon tiles/);
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/contracts/tests/candidate-contracts.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because the candidate boundary schemas do not exist.

- [ ] **Step 3: Implement strict typed drafts and user drafts**

Create `coach/packages/contracts/src/candidate-contracts.ts`:

```ts
import { z } from "zod";
import {
  DecisionWindowSchema,
} from "./actions.js";
import {
  ActionRefSchema,
  CandidateOriginSchema,
} from "./comparison.js";
import {
  StructuredComparisonCandidateSchema,
  StructuredComparisonSetSchema,
} from "./structured-comparison.js";
import {
  TileIdSchema,
  TileSchema,
} from "./tiles.js";

export const DraftTileSchema = z.object({
  id: TileIdSchema,
  red: z.boolean().optional(),
}).strict();
export type DraftTile = z.infer<typeof DraftTileSchema>;

const ActorSchema = z.number().int().min(0).max(3);
const EventRefSchema = z.string().min(1);
const DiscardModeSchema = z.enum(["tsumogiri", "tedashi"]);

export const ActionDraftSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("discard"),
    tile: DraftTileSchema.optional(),
    discardMode: DiscardModeSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("riichi_discard"),
    tile: DraftTileSchema.optional(),
    discardMode: DiscardModeSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("chi"),
    calledTile: DraftTileSchema.optional(),
    consumedTiles: z.tuple([
      DraftTileSchema,
      DraftTileSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("pon"),
    calledTile: DraftTileSchema.optional(),
    consumedTiles: z.tuple([
      DraftTileSchema,
      DraftTileSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("daiminkan"),
    calledTile: DraftTileSchema.optional(),
    consumedTiles: z.tuple([
      DraftTileSchema,
      DraftTileSchema,
      DraftTileSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("ankan"),
    tiles: z.tuple([
      DraftTileSchema,
      DraftTileSchema,
      DraftTileSchema,
      DraftTileSchema,
    ]).optional(),
  }).strict(),
  z.object({
    kind: z.literal("kakan"),
    addedTile: DraftTileSchema.optional(),
    existingMeldRef: z.string().min(1).optional(),
  }).strict(),
  z.object({
    kind: z.literal("tsumo"),
    winningTile: DraftTileSchema.optional(),
    drawEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("ron"),
    winningTile: DraftTileSchema.optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
    winContext: z.enum(["discard", "kakan", "ankan"]).optional(),
  }).strict(),
  z.object({
    kind: z.literal("kyuushu_kyuuhai"),
    drawEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("pass"),
    responseEventRef: EventRefSchema.optional(),
    responseKind: z.enum(["discard", "kakan", "ankan"]).optional(),
  }).strict(),
]);
export type ActionDraft = z.infer<typeof ActionDraftSchema>;

export const CompactTileNotationSchema = z.string().regex(
  /^(?:[1-9][mps]|5[mps][rn]|[1-7]z)$/,
);

export const UserActionDraftSchema = z.discriminatedUnion("actionName", [
  z.object({
    actionName: z.literal("切牌"),
    tile: CompactTileNotationSchema.optional(),
    discardMode: DiscardModeSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("立直切牌"),
    tile: CompactTileNotationSchema.optional(),
    discardMode: DiscardModeSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("吃"),
    calledTile: CompactTileNotationSchema.optional(),
    consumedTiles: z.tuple([
      CompactTileNotationSchema,
      CompactTileNotationSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("碰"),
    calledTile: CompactTileNotationSchema.optional(),
    consumedTiles: z.tuple([
      CompactTileNotationSchema,
      CompactTileNotationSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("大明杠"),
    calledTile: CompactTileNotationSchema.optional(),
    consumedTiles: z.tuple([
      CompactTileNotationSchema,
      CompactTileNotationSchema,
      CompactTileNotationSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("暗杠"),
    tiles: z.tuple([
      CompactTileNotationSchema,
      CompactTileNotationSchema,
      CompactTileNotationSchema,
      CompactTileNotationSchema,
    ]).optional(),
  }).strict(),
  z.object({
    actionName: z.literal("加杠"),
    addedTile: CompactTileNotationSchema.optional(),
    existingMeldRef: z.string().min(1).optional(),
  }).strict(),
  z.object({
    actionName: z.literal("自摸"),
    winningTile: CompactTileNotationSchema.optional(),
    drawEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("荣和"),
    winningTile: CompactTileNotationSchema.optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
    winContext: z.enum(["discard", "kakan", "ankan"]).optional(),
  }).strict(),
  z.object({
    actionName: z.literal("九种九牌"),
    drawEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("过"),
    responseEventRef: EventRefSchema.optional(),
    responseKind: z.enum(["discard", "kakan", "ankan"]).optional(),
  }).strict(),
]);
export type UserActionDraft = z.infer<typeof UserActionDraftSchema>;

export const KnownMeldSchema = z.object({
  meldRef: z.string().min(1),
  kind: z.enum(["chi", "pon", "daiminkan", "ankan"]),
  tiles: z.array(TileSchema).min(3).max(4),
}).strict().superRefine((meld, context) => {
  const expectedLength = meld.kind === "chi" || meld.kind === "pon" ? 3 : 4;
  if (meld.tiles.length !== expectedLength) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Known ${meld.kind} must contain ${expectedLength} tiles`,
      path: ["tiles"],
    });
    return;
  }
  if (meld.kind !== "chi") {
    if (!meld.tiles.every((tile) => tile.id === meld.tiles[0]!.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Known ${meld.kind} tiles must have the same tile ID`,
        path: ["tiles"],
      });
    }
    return;
  }
  if (meld.tiles.some((tile) => tile.id.endsWith("z"))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Known chi tiles must be suited",
      path: ["tiles"],
    });
    return;
  }
  const suits = new Set(meld.tiles.map((tile) => tile.id[1]));
  const ranks = [...new Set(
    meld.tiles.map((tile) => Number(tile.id[0])),
  )].sort((left, right) => left - right);
  if (
    suits.size !== 1 ||
    ranks.length !== 3 ||
    ranks[1] !== ranks[0]! + 1 ||
    ranks[2] !== ranks[1]! + 1
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Known chi tiles must form one consecutive sequence",
      path: ["tiles"],
    });
  }
});
export type KnownMeld = z.infer<typeof KnownMeldSchema>;

export const KnownActionFactsSchema = z.object({
  decisionWindow: DecisionWindowSchema,
  concealedTiles: z.array(TileSchema).optional(),
  currentDraw: z.object({
    tile: TileSchema,
    eventRef: z.string().min(1),
  }).strict().nullable().optional(),
  melds: z.array(KnownMeldSchema).optional(),
}).strict();
export type KnownActionFacts = z.infer<typeof KnownActionFactsSchema>;

const UniqueStringsSchema = z.array(z.string().min(1)).min(1)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Diagnostic fields must be unique",
      });
    }
  });

export const CandidateNormalizationResultSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("ready"),
      candidate: StructuredComparisonCandidateSchema,
      consistency: z.enum([
        "consistent",
        "unknown_due_to_missing_facts",
      ]),
      skippedChecks: z.array(z.string().min(1)),
    }).strict(),
    z.object({
      status: z.literal("needs_clarification"),
      ambiguousFields: UniqueStringsSchema,
    }).strict(),
    z.object({
      status: z.literal("inconsistent_with_known_facts"),
      conflictCodes: UniqueStringsSchema,
      evidenceRefs: z.array(z.string().min(1)),
    }).strict(),
    z.object({
      status: z.literal("unsupported_source_action"),
      sourceType: z.string().min(1),
    }).strict(),
  ],
);
export type CandidateNormalizationResult = z.infer<
  typeof CandidateNormalizationResultSchema
>;

export const SourceAdapterContextSchema = z.object({
  decisionWindow: DecisionWindowSchema,
  existingMeldRef: z.string().min(1).optional(),
}).strict();
export type SourceAdapterContext = z.infer<
  typeof SourceAdapterContextSchema
>;

export const SourceActionAdaptationResultSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("ready"),
      sourceType: z.string().min(1),
      draft: ActionDraftSchema,
      factRefs: z.array(z.string().min(1)),
    }).strict(),
    z.object({
      status: z.literal("incomplete"),
      sourceType: z.string().min(1),
      diagnosticCode: z.string().min(1),
      missingFields: UniqueStringsSchema,
      factRefs: z.array(z.string().min(1)),
    }).strict(),
    z.object({
      status: z.literal("unsupported"),
      sourceType: z.string().min(1),
    }).strict(),
  ],
);
export type SourceActionAdaptationResult = z.infer<
  typeof SourceActionAdaptationResultSchema
>;

export interface TypedActionAdapterPort<RawAction> {
  readonly sourceType: string;
  adapt(
    rawAction: RawAction,
    context: SourceAdapterContext,
  ): SourceActionAdaptationResult;
}

export const StructuredComparisonBuildResultSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("ready"),
      comparisonSet: StructuredComparisonSetSchema,
    }).strict(),
    z.object({
      status: z.literal("not_comparable"),
      code: z.enum([
        "cross_decision_window",
        "fewer_than_two_distinct_actions",
      ]),
      actionRefs: z.array(ActionRefSchema),
      windowKinds: z.array(z.enum([
        "self_turn",
        "discard_response",
        "kan_response",
        "post_call_discard",
      ])),
    }).strict(),
  ],
);
export type StructuredComparisonBuildResult = z.infer<
  typeof StructuredComparisonBuildResultSchema
>;

export const CandidateInputOriginSchema = CandidateOriginSchema;
```

Apply this patch to `coach/packages/contracts/src/index.ts`:

```diff
 export * from "./structured-comparison.js";
+export * from "./candidate-contracts.js";
```

- [ ] **Step 4: Run the focused tests and typecheck**

Run:

```powershell
npx vitest run packages/contracts/tests/candidate-contracts.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: candidate boundary tests PASS; typecheck PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add -- coach/packages/contracts/src/candidate-contracts.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/candidate-contracts.test.ts
git diff --cached --check
git commit -m "feat: define candidate normalization boundaries"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files. `RESOURCES.md` and `overlay/` remain unstaged.

### Task 4: Constrained Chinese user drafts

**Files:**

- Create: `coach/packages/reasoning/tests/user-action-draft.test.ts`
- Create: `coach/packages/reasoning/src/candidate/user-action-draft.ts`
- Modify: `coach/packages/reasoning/src/index.ts`

The constrained draft notation keeps bare `5p` ambiguous, uses `5pr` for an
explicit red five, and uses internal `5pn` for an explicit ordinary five. The
LLM/UI adapter emits this notation; users are not required to learn the `n`
suffix.

- [ ] **Step 1: Write the failing user-draft conversion tests**

Create `coach/packages/reasoning/tests/user-action-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseCompactDraftTile,
  userActionDraftToActionDraft,
} from "../src/candidate/user-action-draft.js";

describe("constrained user action drafts", () => {
  it("keeps a suited five ambiguous unless the red marker is explicit", () => {
    expect(parseCompactDraftTile("5p")).toEqual({ id: "5p" });
    expect(parseCompactDraftTile("5pr")).toEqual({
      id: "5p",
      red: true,
    });
    expect(parseCompactDraftTile("5pn")).toEqual({
      id: "5p",
      red: false,
    });
    expect(parseCompactDraftTile("6s")).toEqual({
      id: "6s",
      red: false,
    });
  });

  it("maps Chinese discard names without inventing missing fields", () => {
    expect(userActionDraftToActionDraft({
      actionName: "切牌",
      tile: "5p",
    })).toEqual({
      kind: "discard",
      tile: { id: "5p" },
    });
    expect(userActionDraftToActionDraft({
      actionName: "立直切牌",
      tile: "5pr",
      discardMode: "tsumogiri",
    })).toEqual({
      kind: "riichi_discard",
      tile: { id: "5p", red: true },
      discardMode: "tsumogiri",
    });
  });

  it("maps call composition and response fields exactly", () => {
    expect(userActionDraftToActionDraft({
      actionName: "吃",
      calledTile: "3m",
      consumedTiles: ["1m", "2m"],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).toEqual({
      kind: "chi",
      calledTile: { id: "3m", red: false },
      consumedTiles: [
        { id: "1m", red: false },
        { id: "2m", red: false },
      ],
      targetActor: 1,
      responseEventRef: "event:discard",
    });
    expect(userActionDraftToActionDraft({
      actionName: "过",
    })).toEqual({ kind: "pass" });
  });

  it("rejects free-form action names and invalid notation", () => {
    expect(() => userActionDraftToActionDraft({
      actionName: "我觉得应该防守",
    } as never)).toThrow();
    expect(() => parseCompactDraftTile("red-five-p")).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/reasoning/tests/user-action-draft.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because `user-action-draft.ts` does not exist.

- [ ] **Step 3: Implement deterministic compact-notation conversion**

Create `coach/packages/reasoning/src/candidate/user-action-draft.ts`:

```ts
import {
  ActionDraftSchema,
  CompactTileNotationSchema,
  UserActionDraftSchema,
  type ActionDraft,
  type DraftTile,
  type UserActionDraft,
} from "@riichi-coach/contracts";

export function parseCompactDraftTile(value: string): DraftTile {
  const notation = CompactTileNotationSchema.parse(value);
  const explicitRed = notation.endsWith("r");
  const explicitNormal = notation.endsWith("n");
  const id = explicitRed || explicitNormal
    ? notation.slice(0, -1)
    : notation;
  return {
    id: id as DraftTile["id"],
    ...(explicitRed
      ? { red: true }
      : explicitNormal
        ? { red: false }
      : id.startsWith("5") && !id.endsWith("z")
        ? {}
        : { red: false }),
  };
}

function tile(value: string | undefined): DraftTile | undefined {
  return value === undefined ? undefined : parseCompactDraftTile(value);
}

function tiles<T extends readonly string[]>(
  values: T | undefined,
): { [K in keyof T]: DraftTile } | undefined {
  return values === undefined
    ? undefined
    : values.map(parseCompactDraftTile) as unknown as {
        [K in keyof T]: DraftTile;
      };
}

function present<K extends string, V>(
  key: K,
  value: V | undefined,
): { [P in K]?: V } {
  return value === undefined ? {} : { [key]: value } as { [P in K]?: V };
}

export function userActionDraftToActionDraft(
  rawDraft: UserActionDraft,
): ActionDraft {
  const draft = UserActionDraftSchema.parse(rawDraft);
  const converted: unknown = (() => {
    switch (draft.actionName) {
      case "切牌":
      case "立直切牌":
        return {
          kind: draft.actionName === "切牌" ? "discard" : "riichi_discard",
          ...present("tile", tile(draft.tile)),
          ...present("discardMode", draft.discardMode),
        };
      case "吃":
      case "碰":
        return {
          kind: draft.actionName === "吃" ? "chi" : "pon",
          ...present("calledTile", tile(draft.calledTile)),
          ...present("consumedTiles", tiles(draft.consumedTiles)),
          ...present("targetActor", draft.targetActor),
          ...present("responseEventRef", draft.responseEventRef),
        };
      case "大明杠":
        return {
          kind: "daiminkan",
          ...present("calledTile", tile(draft.calledTile)),
          ...present("consumedTiles", tiles(draft.consumedTiles)),
          ...present("targetActor", draft.targetActor),
          ...present("responseEventRef", draft.responseEventRef),
        };
      case "暗杠":
        return {
          kind: "ankan",
          ...present("tiles", tiles(draft.tiles)),
        };
      case "加杠":
        return {
          kind: "kakan",
          ...present("addedTile", tile(draft.addedTile)),
          ...present("existingMeldRef", draft.existingMeldRef),
        };
      case "自摸":
        return {
          kind: "tsumo",
          ...present("winningTile", tile(draft.winningTile)),
          ...present("drawEventRef", draft.drawEventRef),
        };
      case "荣和":
        return {
          kind: "ron",
          ...present("winningTile", tile(draft.winningTile)),
          ...present("targetActor", draft.targetActor),
          ...present("responseEventRef", draft.responseEventRef),
          ...present("winContext", draft.winContext),
        };
      case "九种九牌":
        return {
          kind: "kyuushu_kyuuhai",
          ...present("drawEventRef", draft.drawEventRef),
        };
      case "过":
        return {
          kind: "pass",
          ...present("responseEventRef", draft.responseEventRef),
          ...present("responseKind", draft.responseKind),
        };
    }
  })();
  return ActionDraftSchema.parse(converted);
}
```

Apply this patch to `coach/packages/reasoning/src/index.ts`:

```diff
 export * from "./validate/package-validator.js";
+export * from "./candidate/user-action-draft.js";
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npx vitest run packages/reasoning/tests/user-action-draft.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: user-draft tests PASS; typecheck PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```powershell
git add -- coach/packages/reasoning/src/candidate/user-action-draft.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/user-action-draft.test.ts
git diff --cached --check
git commit -m "feat: constrain user action drafts"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files. `RESOURCES.md` and `overlay/` remain unstaged.

### Task 5: CandidateNormalizer ambiguity and three-state consistency

**Files:**

- Create: `coach/packages/reasoning/tests/candidate-normalizer.test.ts`
- Create: `coach/packages/reasoning/src/candidate/candidate-normalizer.ts`
- Modify: `coach/packages/reasoning/src/index.ts`

- [ ] **Step 1: Write failing ambiguity and known-fact tests**

Create `coach/packages/reasoning/tests/candidate-normalizer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeCandidate,
} from "../src/candidate/candidate-normalizer.js";

const fiveNormal = { id: "5p" as const, red: false };
const fiveRed = { id: "5p" as const, red: true };
const sixSou = { id: "6s" as const, red: false };

describe("CandidateNormalizer ambiguity", () => {
  it("asks only tile.red when both five instances remain possible", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "5p" },
        discardMode: "tedashi",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [fiveNormal, fiveRed],
        currentDraw: { tile: sixSou, eventRef: "event:draw" },
      },
    })).toEqual({
      status: "needs_clarification",
      ambiguousFields: ["tile.red"],
    });
  });

  it("asks only discardMode when both hand-cut and draw-cut remain possible", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "5p", red: false },
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [fiveNormal],
        currentDraw: { tile: fiveNormal, eventRef: "event:draw" },
      },
    })).toEqual({
      status: "needs_clarification",
      ambiguousFields: ["discardMode"],
    });
  });

  it("asks only consumedTiles when a call composition is absent", () => {
    expect(normalizeCandidate({
      draft: { kind: "chi" },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "discard_response",
          actor: 0,
          triggerEventRef: "event:discard",
          sourceActor: 1,
          offeredTile: { id: "2m", red: false },
        },
        concealedTiles: [
          { id: "1m", red: false },
          { id: "3m", red: false },
        ],
      },
    })).toEqual({
      status: "needs_clarification",
      ambiguousFields: ["consumedTiles"],
    });
  });

  it("uses a unique known tile instance to resolve red identity", () => {
    const result = normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "5p" },
        discardMode: "tedashi",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [fiveRed],
        currentDraw: { tile: sixSou, eventRef: "event:draw" },
      },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.candidate.action).toMatchObject({
        tile: fiveRed,
        discardMode: "tedashi",
      });
      expect(result.consistency).toBe("consistent");
    }
  });
});

describe("CandidateNormalizer direct-known-fact consistency", () => {
  it("returns unknown, not illegal, when concealed-hand facts are absent", () => {
    const result = normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tedashi",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: null,
          triggerEventRef: "user_asserted:draw",
        },
      },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.consistency).toBe("unknown_due_to_missing_facts");
      expect(result.skippedChecks).toEqual(["tedashi_concealed_tile"]);
    }
  });

  it("rejects a known missing hand tile and a wrong tsumogiri tile", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tedashi",
      },
      origin: "actual",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [],
        currentDraw: null,
      },
    })).toMatchObject({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["tedashi_tile_missing"],
    });

    expect(normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tsumogiri",
      },
      origin: "actual",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [sixSou],
        currentDraw: { tile: fiveRed, eventRef: "event:draw" },
      },
    })).toEqual({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["tsumogiri_draw_mismatch"],
      evidenceRefs: ["event:draw"],
    });
  });

  it("checks response event, source actor, and offered tile directly", () => {
    const result = normalizeCandidate({
      draft: {
        kind: "ron",
        winningTile: { id: "6s", red: false },
        targetActor: 2,
        responseEventRef: "event:other",
        winContext: "discard",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "discard_response",
          actor: 0,
          triggerEventRef: "event:discard",
          sourceActor: 1,
          offeredTile: fiveRed,
        },
      },
    });

    expect(result).toEqual({
      status: "inconsistent_with_known_facts",
      conflictCodes: [
        "response_event_mismatch",
        "response_source_actor_mismatch",
        "response_tile_mismatch",
      ],
      evidenceRefs: ["event:discard"],
    });
  });

  it("checks kakan meld existence, pon kind, and tile identity", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "kakan",
        addedTile: { id: "5p", red: true },
        existingMeldRef: "meld:chi",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        melds: [{
          meldRef: "meld:chi",
          kind: "chi",
          tiles: [
            { id: "3p", red: false },
            { id: "4p", red: false },
            { id: "5p", red: false },
          ],
        }],
      },
    })).toMatchObject({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["existing_meld_not_pon"],
      evidenceRefs: ["meld:chi"],
    });
  });

  it("cannot read hidden current-scene state in a standalone hypothesis", () => {
    const standaloneFacts = {
      decisionWindow: {
        kind: "self_turn" as const,
        actor: null,
        triggerEventRef: "user_asserted:draw",
      },
    };
    const result = normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tedashi",
      },
      origin: "user",
      facts: standaloneFacts,
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.consistency).toBe("unknown_due_to_missing_facts");
    }
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/reasoning/tests/candidate-normalizer.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because `candidate-normalizer.ts` does not exist.

- [ ] **Step 3: Implement deterministic structural completion**

Create `coach/packages/reasoning/src/candidate/candidate-normalizer.ts`:

```ts
import {
  ActionDraftSchema,
  CandidateNormalizationResultSchema,
  CandidateOriginSchema,
  KnownActionFactsSchema,
  RiichiActionSchema,
  StructuredComparisonCandidateSchema,
  TileSchema,
  actionWindowConflictCodes,
  canonicalActionRef,
  sortTilesCanonical,
  type ActionDraft,
  type CandidateNormalizationResult,
  type CandidateOrigin,
  type DraftTile,
  type KnownActionFacts,
  type RiichiAction,
  type Tile,
} from "@riichi-coach/contracts";

type Completion = {
  action?: RiichiAction;
  ambiguousFields: string[];
};

function sameTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function knownAvailableTiles(facts: KnownActionFacts): Tile[] | undefined {
  if (facts.concealedTiles === undefined || facts.currentDraw === undefined) {
    return undefined;
  }
  return [
    ...facts.concealedTiles,
    ...(facts.currentDraw === null ? [] : [facts.currentDraw.tile]),
  ];
}

function resolveTile(
  draft: DraftTile | undefined,
  knownTiles: readonly Tile[] | undefined,
  missingField: string,
  redField: string,
  ambiguousFields: string[],
): Tile | undefined {
  if (draft === undefined) {
    ambiguousFields.push(missingField);
    return undefined;
  }
  if (draft.red !== undefined) {
    return TileSchema.parse(draft);
  }
  if (!["5m", "5p", "5s"].includes(draft.id)) {
    return TileSchema.parse({ id: draft.id, red: false });
  }
  if (knownTiles !== undefined) {
    const matching = knownTiles.filter((tile) => tile.id === draft.id);
    const redValues = [...new Set(matching.map((tile) => tile.red))];
    if (redValues.length === 1) {
      return TileSchema.parse({ id: draft.id, red: redValues[0]! });
    }
    if (redValues.length === 0) {
      return TileSchema.parse({ id: draft.id, red: false });
    }
  }
  ambiguousFields.push(redField);
  return undefined;
}

function resolveTiles<T extends readonly DraftTile[]>(
  drafts: T | undefined,
  knownTiles: readonly Tile[] | undefined,
  field: string,
  ambiguousFields: string[],
): { [K in keyof T]: Tile } | undefined {
  if (drafts === undefined) {
    ambiguousFields.push(field);
    return undefined;
  }
  const resolved = drafts.map((draft) =>
    resolveTile(draft, knownTiles, field, field, ambiguousFields)
  );
  return resolved.some((tile) => tile === undefined)
    ? undefined
    : resolved as unknown as { [K in keyof T]: Tile };
}

function inferDiscardMode(
  tile: Tile | undefined,
  draftMode: "tsumogiri" | "tedashi" | undefined,
  facts: KnownActionFacts,
  ambiguousFields: string[],
): "tsumogiri" | "tedashi" | undefined {
  if (draftMode !== undefined) {
    return draftMode;
  }
  if (facts.decisionWindow.kind === "post_call_discard") {
    return "tedashi";
  }
  if (facts.currentDraw === null) {
    return "tedashi";
  }
  if (facts.currentDraw !== undefined && tile !== undefined) {
    if (!sameTile(facts.currentDraw.tile, tile)) {
      return "tedashi";
    }
    const concealedMatch = facts.concealedTiles?.some((item) =>
      sameTile(item, tile)
    );
    if (concealedMatch === false) {
      return "tsumogiri";
    }
  }
  ambiguousFields.push("discardMode");
  return undefined;
}

function sourceActor(facts: KnownActionFacts): number | undefined {
  const window = facts.decisionWindow;
  return (
      window.kind === "discard_response" || window.kind === "kan_response"
    ) && window.sourceActor !== null
    ? window.sourceActor
    : undefined;
}

function offeredTile(facts: KnownActionFacts): Tile | undefined {
  const window = facts.decisionWindow;
  return window.kind === "discard_response" || window.kind === "kan_response"
    ? window.offeredTile
    : undefined;
}

function responseKind(
  facts: KnownActionFacts,
): "discard" | "kakan" | "ankan" | undefined {
  const window = facts.decisionWindow;
  return window.kind === "discard_response"
    ? "discard"
    : window.kind === "kan_response"
      ? window.kanKind
      : undefined;
}

function requireValue<T>(
  value: T | undefined,
  field: string,
  ambiguousFields: string[],
): T | undefined {
  if (value === undefined) {
    ambiguousFields.push(field);
  }
  return value;
}

function completeAction(
  rawDraft: ActionDraft,
  facts: KnownActionFacts,
): Completion {
  const draft = ActionDraftSchema.parse(rawDraft);
  const ambiguousFields: string[] = [];
  const available = knownAvailableTiles(facts);
  const concealed = facts.concealedTiles;
  let candidate: unknown;

  switch (draft.kind) {
    case "discard":
    case "riichi_discard": {
      const actionTile = resolveTile(
        draft.tile,
        available,
        "tile",
        "tile.red",
        ambiguousFields,
      );
      const discardMode = inferDiscardMode(
        actionTile,
        draft.discardMode,
        facts,
        ambiguousFields,
      );
      candidate = {
        kind: draft.kind,
        tile: actionTile,
        discardMode,
      };
      break;
    }
    case "chi":
    case "pon":
    case "daiminkan": {
      const windowTile = offeredTile(facts);
      const calledTile = resolveTile(
        draft.calledTile ??
          (windowTile === undefined
            ? undefined
            : { id: windowTile.id, red: windowTile.red }),
        windowTile === undefined ? undefined : [windowTile],
        "calledTile",
        "calledTile.red",
        ambiguousFields,
      );
      const consumedTiles = resolveTiles(
        draft.consumedTiles,
        concealed,
        "consumedTiles",
        ambiguousFields,
      );
      candidate = {
        kind: draft.kind,
        calledTile,
        consumedTiles: consumedTiles === undefined
          ? undefined
          : sortTilesCanonical(consumedTiles),
        targetActor: requireValue(
          draft.targetActor ?? sourceActor(facts),
          "targetActor",
          ambiguousFields,
        ),
        responseEventRef:
          draft.responseEventRef ?? facts.decisionWindow.triggerEventRef,
      };
      break;
    }
    case "ankan": {
      const tiles = resolveTiles(
        draft.tiles,
        available,
        "tiles",
        ambiguousFields,
      );
      candidate = {
        kind: "ankan",
        tiles: tiles === undefined ? undefined : sortTilesCanonical(tiles),
      };
      break;
    }
    case "kakan":
      candidate = {
        kind: "kakan",
        addedTile: resolveTile(
          draft.addedTile,
          available,
          "addedTile",
          "addedTile.red",
          ambiguousFields,
        ),
        existingMeldRef: requireValue(
          draft.existingMeldRef,
          "existingMeldRef",
          ambiguousFields,
        ),
      };
      break;
    case "tsumo": {
      const knownDraw = facts.currentDraw;
      candidate = {
        kind: "tsumo",
        winningTile: resolveTile(
          draft.winningTile ??
            (knownDraw === null || knownDraw === undefined
              ? undefined
              : { id: knownDraw.tile.id, red: knownDraw.tile.red }),
          knownDraw ? [knownDraw.tile] : undefined,
          "winningTile",
          "winningTile.red",
          ambiguousFields,
        ),
        drawEventRef:
          draft.drawEventRef ?? facts.decisionWindow.triggerEventRef,
      };
      break;
    }
    case "ron": {
      const windowTile = offeredTile(facts);
      candidate = {
        kind: "ron",
        winningTile: resolveTile(
          draft.winningTile ??
            (windowTile && { id: windowTile.id, red: windowTile.red }),
          windowTile ? [windowTile] : undefined,
          "winningTile",
          "winningTile.red",
          ambiguousFields,
        ),
        targetActor: requireValue(
          draft.targetActor ?? sourceActor(facts),
          "targetActor",
          ambiguousFields,
        ),
        responseEventRef:
          draft.responseEventRef ?? facts.decisionWindow.triggerEventRef,
        winContext: requireValue(
          draft.winContext ?? responseKind(facts),
          "winContext",
          ambiguousFields,
        ),
      };
      break;
    }
    case "kyuushu_kyuuhai":
      candidate = {
        kind: "kyuushu_kyuuhai",
        drawEventRef:
          draft.drawEventRef ?? facts.decisionWindow.triggerEventRef,
      };
      break;
    case "pass":
      candidate = {
        kind: "pass",
        responseEventRef:
          draft.responseEventRef ?? facts.decisionWindow.triggerEventRef,
        responseKind: requireValue(
          draft.responseKind ?? responseKind(facts),
          "responseKind",
          ambiguousFields,
        ),
      };
      break;
  }

  if (ambiguousFields.length > 0) {
    return { ambiguousFields: unique(ambiguousFields) };
  }
  return {
    action: RiichiActionSchema.parse(candidate),
    ambiguousFields: [],
  };
}

function containsMultiset(
  available: readonly Tile[],
  required: readonly Tile[],
): boolean {
  const remaining = [...available];
  for (const tile of required) {
    const index = remaining.findIndex((item) => sameTile(item, tile));
    if (index < 0) {
      return false;
    }
    remaining.splice(index, 1);
  }
  return true;
}

function checkConsistency(
  action: RiichiAction,
  facts: KnownActionFacts,
): {
  conflictCodes: string[];
  evidenceRefs: string[];
  skippedChecks: string[];
} {
  const conflicts: string[] = [
    ...actionWindowConflictCodes(action, facts.decisionWindow),
  ];
  const evidenceRefs: string[] = conflicts.length > 0
    ? [facts.decisionWindow.triggerEventRef]
    : [];
  const skippedChecks: string[] = [];

  if (action.kind === "discard" || action.kind === "riichi_discard") {
    if (action.discardMode === "tsumogiri") {
      if (facts.currentDraw === undefined) {
        skippedChecks.push("tsumogiri_current_draw");
      } else if (
        facts.currentDraw === null ||
        !sameTile(action.tile, facts.currentDraw.tile)
      ) {
        conflicts.push("tsumogiri_draw_mismatch");
        if (facts.currentDraw !== null) {
          evidenceRefs.push(facts.currentDraw.eventRef);
        }
      }
    } else if (facts.concealedTiles === undefined) {
      skippedChecks.push("tedashi_concealed_tile");
    } else if (!containsMultiset(facts.concealedTiles, [action.tile])) {
      conflicts.push("tedashi_tile_missing");
    }
  }

  if (
    action.kind === "chi" ||
    action.kind === "pon" ||
    action.kind === "daiminkan"
  ) {
    if (facts.concealedTiles === undefined) {
      skippedChecks.push("call_consumed_tiles");
    } else if (!containsMultiset(
      facts.concealedTiles,
      action.consumedTiles,
    )) {
      conflicts.push("consumed_tiles_missing");
    }
  }

  const window = facts.decisionWindow;
  if (
    window.kind === "discard_response" ||
    window.kind === "kan_response"
  ) {
    if (
      (action.kind === "chi" ||
        action.kind === "pon" ||
        action.kind === "daiminkan" ||
        action.kind === "ron") &&
      window.sourceActor !== null &&
      action.targetActor !== window.sourceActor
    ) {
      conflicts.push("response_source_actor_mismatch");
      evidenceRefs.push(window.triggerEventRef);
    }
    const responseTile =
      action.kind === "chi" ||
        action.kind === "pon" ||
        action.kind === "daiminkan"
        ? action.calledTile
        : action.kind === "ron"
          ? action.winningTile
          : null;
    if (responseTile !== null && !sameTile(responseTile, window.offeredTile)) {
      conflicts.push("response_tile_mismatch");
      evidenceRefs.push(window.triggerEventRef);
    }
  }

  if (action.kind === "ankan") {
    const available = knownAvailableTiles(facts);
    if (available === undefined) {
      skippedChecks.push("ankan_known_tiles");
    } else if (!containsMultiset(available, action.tiles)) {
      conflicts.push("ankan_tiles_missing");
    }
  }

  if (action.kind === "kakan") {
    if (facts.melds === undefined) {
      skippedChecks.push("kakan_existing_meld");
    } else {
      const meld = facts.melds.find(
        (item) => item.meldRef === action.existingMeldRef,
      );
      if (meld === undefined) {
        conflicts.push("existing_meld_missing");
      } else {
        evidenceRefs.push(meld.meldRef);
        if (meld.kind !== "pon") {
          conflicts.push("existing_meld_not_pon");
        } else if (meld.tiles.some((tile) => tile.id !== action.addedTile.id)) {
          conflicts.push("kakan_tile_mismatch");
        }
      }
    }
  }

  if (action.kind === "tsumo") {
    if (facts.currentDraw === undefined) {
      skippedChecks.push("tsumo_current_draw");
    } else if (
      facts.currentDraw === null ||
      !sameTile(action.winningTile, facts.currentDraw.tile)
    ) {
      conflicts.push("tsumo_draw_mismatch");
      if (facts.currentDraw !== null) {
        evidenceRefs.push(facts.currentDraw.eventRef);
      }
    }
  }

  return {
    conflictCodes: unique(conflicts),
    evidenceRefs: unique(evidenceRefs),
    skippedChecks: unique(skippedChecks),
  };
}

export function normalizeCandidate(input: {
  draft: ActionDraft;
  origin: CandidateOrigin;
  facts: KnownActionFacts;
}): CandidateNormalizationResult {
  const facts = KnownActionFactsSchema.parse(input.facts);
  const origin = CandidateOriginSchema.parse(input.origin);
  const completion = completeAction(input.draft, facts);
  if (completion.action === undefined) {
    return CandidateNormalizationResultSchema.parse({
      status: "needs_clarification",
      ambiguousFields: completion.ambiguousFields,
    });
  }
  const consistency = checkConsistency(completion.action, facts);
  if (consistency.conflictCodes.length > 0) {
    return CandidateNormalizationResultSchema.parse({
      status: "inconsistent_with_known_facts",
      conflictCodes: consistency.conflictCodes,
      evidenceRefs: consistency.evidenceRefs,
    });
  }
  const candidate = StructuredComparisonCandidateSchema.parse({
    actionRef: canonicalActionRef(completion.action),
    action: completion.action,
    origins: [origin],
  });
  return CandidateNormalizationResultSchema.parse({
    status: "ready",
    candidate,
    consistency: consistency.skippedChecks.length > 0
      ? "unknown_due_to_missing_facts"
      : "consistent",
    skippedChecks: consistency.skippedChecks,
  });
}
```

Apply this patch to `coach/packages/reasoning/src/index.ts`:

```diff
 export * from "./candidate/user-action-draft.js";
+export * from "./candidate/candidate-normalizer.js";
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npx vitest run packages/reasoning/tests/candidate-normalizer.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: normalizer tests PASS; typecheck PASS. Missing facts produce `unknown_due_to_missing_facts`; known contradictions produce `inconsistent_with_known_facts`; neither is labeled “illegal.”

- [ ] **Step 5: Commit Task 5**

Run:

```powershell
git add -- coach/packages/reasoning/src/candidate/candidate-normalizer.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/candidate-normalizer.test.ts
git diff --cached --check
git commit -m "feat: normalize candidates against known facts"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files. `RESOURCES.md` and `overlay/` remain unstaged.

### Task 6: Origin merging and cross-window comparability

**Files:**

- Create: `coach/packages/reasoning/tests/comparison-set-builder.test.ts`
- Create: `coach/packages/reasoning/src/candidate/comparison-set-builder.ts`
- Modify: `coach/packages/reasoning/src/index.ts`

- [ ] **Step 1: Write failing merge and `not_comparable` tests**

Create `coach/packages/reasoning/tests/comparison-set-builder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildStructuredComparisonSet,
} from "../src/candidate/comparison-set-builder.js";
import {
  normalizeCandidate,
} from "../src/candidate/candidate-normalizer.js";

const selfTurn = {
  kind: "self_turn" as const,
  actor: 0,
  triggerEventRef: "event:draw",
};

function discard(
  id: "2p" | "6s",
  origin: "model" | "actual" | "user",
) {
  const result = normalizeCandidate({
    draft: {
      kind: "discard",
      tile: { id, red: false },
      discardMode: "tedashi",
    },
    origin,
    facts: {
      decisionWindow: selfTurn,
      concealedTiles: [
        { id: "2p", red: false },
        { id: "6s", red: false },
      ],
      currentDraw: null,
    },
  });
  if (result.status !== "ready") {
    throw new Error(`fixture did not normalize: ${result.status}`);
  }
  return { result, decisionWindow: selfTurn };
}

describe("structured comparison set builder", () => {
  it("merges model, actual, and user origins for one canonical action", () => {
    const built = buildStructuredComparisonSet({
      comparisonSetId: "comparison:merged",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:self-turn",
      candidates: [
        discard("2p", "model"),
        discard("2p", "actual"),
        discard("2p", "user"),
        discard("6s", "model"),
      ],
    });

    expect(built.status).toBe("ready");
    if (built.status === "ready") {
      expect(built.comparisonSet.candidates).toHaveLength(2);
      expect(
        built.comparisonSet.candidates.find(
          (candidate) => candidate.action.kind === "discard" &&
            candidate.action.tile.id === "2p",
        )?.origins,
      ).toEqual(["model", "actual", "user"]);
    }
  });

  it("returns not_comparable after identical actions merge to one", () => {
    const built = buildStructuredComparisonSet({
      comparisonSetId: "comparison:singleton-after-merge",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:self-turn",
      candidates: [
        discard("2p", "model"),
        discard("2p", "user"),
      ],
    });

    expect(built).toMatchObject({
      status: "not_comparable",
      code: "fewer_than_two_distinct_actions",
      windowKinds: ["self_turn"],
    });
  });

  it("keeps whether-to-pon separate from the post-pon discard", () => {
    const responseWindow = {
      kind: "discard_response" as const,
      actor: 0,
      triggerEventRef: "event:discard",
      sourceActor: 1,
      offeredTile: { id: "5p" as const, red: false },
    };
    const postCallWindow = {
      kind: "post_call_discard" as const,
      actor: 0,
      triggerEventRef: "event:pon",
    };
    const pon = normalizeCandidate({
      draft: {
        kind: "pon",
        consumedTiles: [
          { id: "5p", red: false },
          { id: "5p", red: true },
        ],
      },
      origin: "user",
      facts: {
        decisionWindow: responseWindow,
        concealedTiles: [
          { id: "5p", red: false },
          { id: "5p", red: true },
        ],
      },
    });
    const afterPonDiscard = normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "2p", red: false },
        discardMode: "tedashi",
      },
      origin: "user",
      facts: {
        decisionWindow: postCallWindow,
        concealedTiles: [{ id: "2p", red: false }],
        currentDraw: null,
      },
    });
    if (pon.status !== "ready" || afterPonDiscard.status !== "ready") {
      throw new Error("comparison fixtures did not normalize");
    }

    expect(buildStructuredComparisonSet({
      comparisonSetId: "comparison:cross-layer",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:cross-layer",
      candidates: [
        { result: pon, decisionWindow: responseWindow },
        { result: afterPonDiscard, decisionWindow: postCallWindow },
      ],
    })).toMatchObject({
      status: "not_comparable",
      code: "cross_decision_window",
      windowKinds: ["discard_response", "post_call_discard"],
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/reasoning/tests/comparison-set-builder.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because `comparison-set-builder.ts` does not exist.

- [ ] **Step 3: Implement window identity checks and canonical origin merging**

Create `coach/packages/reasoning/src/candidate/comparison-set-builder.ts`:

```ts
import {
  CandidateNormalizationResultSchema,
  DecisionWindowSchema,
  StructuredComparisonBuildResultSchema,
  StructuredComparisonSetSchema,
  type CandidateNormalizationResult,
  type DecisionWindow,
  type StructuredComparisonBuildResult,
  type StructuredComparisonCandidate,
} from "@riichi-coach/contracts";

export type ComparisonBuildCandidate = {
  result: CandidateNormalizationResult;
  decisionWindow: DecisionWindow;
};

const originRank = {
  model: 0,
  actual: 1,
  user: 2,
} as const;

function windowKey(rawWindow: DecisionWindow): string {
  return JSON.stringify(DecisionWindowSchema.parse(rawWindow));
}

export function buildStructuredComparisonSet(input: {
  comparisonSetId: string;
  origin: "automatic_review" | "user_comparison";
  decisionLayerRef: string;
  candidates: ComparisonBuildCandidate[];
}): StructuredComparisonBuildResult {
  const parsed = input.candidates.map((entry) => {
    const result = CandidateNormalizationResultSchema.parse(entry.result);
    if (result.status !== "ready") {
      throw new Error(
        `Only ready candidates can enter comparison building: ${result.status}`,
      );
    }
    return {
      result,
      decisionWindow: DecisionWindowSchema.parse(entry.decisionWindow),
    };
  });
  if (parsed.length === 0) {
    return StructuredComparisonBuildResultSchema.parse({
      status: "not_comparable",
      code: "fewer_than_two_distinct_actions",
      actionRefs: [],
      windowKinds: [],
    });
  }

  const windowKeys = new Set(
    parsed.map((entry) => windowKey(entry.decisionWindow)),
  );
  const actionRefs = parsed.map(
    (entry) => entry.result.candidate.actionRef,
  );
  const windowKinds = [
    ...new Set(parsed.map((entry) => entry.decisionWindow.kind)),
  ];
  if (windowKeys.size !== 1) {
    return StructuredComparisonBuildResultSchema.parse({
      status: "not_comparable",
      code: "cross_decision_window",
      actionRefs: [...new Set(actionRefs)],
      windowKinds,
    });
  }

  const merged = new Map<string, StructuredComparisonCandidate>();
  for (const entry of parsed) {
    const incoming = entry.result.candidate;
    const current = merged.get(incoming.actionRef);
    if (current === undefined) {
      merged.set(incoming.actionRef, incoming);
      continue;
    }
    merged.set(incoming.actionRef, {
      ...current,
      origins: [
        ...new Set([...current.origins, ...incoming.origins]),
      ].sort((left, right) => originRank[left] - originRank[right]),
    });
  }
  const candidates = [...merged.values()];
  if (candidates.length < 2) {
    return StructuredComparisonBuildResultSchema.parse({
      status: "not_comparable",
      code: "fewer_than_two_distinct_actions",
      actionRefs: candidates.map((candidate) => candidate.actionRef),
      windowKinds,
    });
  }

  return StructuredComparisonBuildResultSchema.parse({
    status: "ready",
    comparisonSet: StructuredComparisonSetSchema.parse({
      comparisonSetId: input.comparisonSetId,
      origin: input.origin,
      decisionLayerRef: input.decisionLayerRef,
      decisionWindow: parsed[0]!.decisionWindow,
      candidates,
    }),
  });
}
```

Apply this patch to `coach/packages/reasoning/src/index.ts`:

```diff
 export * from "./candidate/candidate-normalizer.js";
+export * from "./candidate/comparison-set-builder.js";
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npx vitest run packages/reasoning/tests/comparison-set-builder.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: builder tests PASS; identical actions merge origins once; cross-window candidates return `not_comparable`.

- [ ] **Step 5: Commit Task 6**

Run:

```powershell
git add -- coach/packages/reasoning/src/candidate/comparison-set-builder.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/comparison-set-builder.test.ts
git diff --cached --check
git commit -m "feat: merge comparable action candidates"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files. `RESOURCES.md` and `overlay/` remain unstaged.

### Task 7: MJAI semantics and the Akagi typed adapter port

**Files:**

- Create: `coach/packages/reasoning/tests/mjai-action.test.ts`
- Create: `coach/packages/reasoning/tests/action-adapter-port.test.ts`
- Create: `coach/packages/reasoning/src/import/mjai-action.ts`
- Create: `coach/packages/reasoning/src/import/action-adapter-port.ts`
- Modify: `coach/packages/reasoning/src/index.ts`

- [ ] **Step 1: Write failing MJAI coverage tests**

Create `coach/packages/reasoning/tests/mjai-action.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  adaptMjaiActionSequence,
} from "../src/import/mjai-action.js";

const selfTurn = {
  decisionWindow: {
    kind: "self_turn" as const,
    actor: 3,
    triggerEventRef: "event:draw",
  },
};
const discardResponse = {
  decisionWindow: {
    kind: "discard_response" as const,
    actor: 3,
    triggerEventRef: "event:discard",
    sourceActor: 1,
    offeredTile: { id: "5p" as const, red: true },
  },
};

describe("MJAI action adapter", () => {
  it("adapts ordinary dahai and atomically pairs reach plus dahai", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:dahai",
        action: {
          type: "dahai",
          actor: 3,
          pai: "6s",
          tsumogiri: true,
        },
      },
    ], selfTurn)).toMatchObject({
      status: "ready",
      draft: {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tsumogiri",
      },
      factRefs: ["event:dahai"],
    });

    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:reach",
        action: { type: "reach", actor: 3 },
      },
      {
        eventRef: "event:riichi-dahai",
        action: {
          type: "dahai",
          actor: 3,
          pai: "5pr",
          tsumogiri: false,
        },
      },
    ], selfTurn)).toMatchObject({
      status: "ready",
      draft: {
        kind: "riichi_discard",
        tile: { id: "5p", red: true },
        discardMode: "tedashi",
      },
      factRefs: ["event:reach", "event:riichi-dahai"],
    });
  });

  it("keeps isolated reach as an import diagnostic", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:reach",
        action: { type: "reach", actor: 3 },
      },
    ], selfTurn)).toEqual({
      status: "incomplete",
      sourceType: "mjai",
      diagnosticCode: "reach_without_dahai",
      missingFields: ["tile", "discardMode"],
      factRefs: ["event:reach"],
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:incomplete-dahai",
        action: {
          type: "dahai",
          actor: 3,
          tsumogiri: true,
        },
      },
    ], selfTurn)).toEqual({
      status: "incomplete",
      sourceType: "mjai",
      diagnosticCode: "missing_action_fields",
      missingFields: ["pai"],
      factRefs: ["event:incomplete-dahai"],
    });
  });

  it.each([
    [
      "chi",
      {
        type: "chi",
        actor: 3,
        target: 1,
        pai: "3m",
        consumed: ["1m", "2m"],
      },
    ],
    [
      "pon",
      {
        type: "pon",
        actor: 3,
        target: 1,
        pai: "5pr",
        consumed: ["5p", "5p"],
      },
    ],
    [
      "daiminkan",
      {
        type: "daiminkan",
        actor: 3,
        target: 1,
        pai: "5pr",
        consumed: ["5p", "5p", "5p"],
      },
    ],
    [
      "ankan",
      {
        type: "ankan",
        actor: 3,
        consumed: ["5p", "5p", "5p", "5pr"],
      },
    ],
    [
      "kakan",
      {
        type: "kakan",
        actor: 3,
        pai: "5pr",
        existingMeldRef: "meld:pon:5p",
      },
    ],
  ] as const)("adapts the %s call form", (kind, action) => {
    const context = kind === "chi" || kind === "pon" || kind === "daiminkan"
      ? discardResponse
      : selfTurn;
    const result = adaptMjaiActionSequence([
      { eventRef: `event:${kind}`, action },
    ], context);

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.draft.kind).toBe(kind);
    }
  });

  it("maps hora to tsumo or ron from the decision window", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:hora",
        action: { type: "hora", actor: 3, target: 3, pai: "6s" },
      },
    ], selfTurn)).toMatchObject({
      status: "ready",
      draft: {
        kind: "tsumo",
        winningTile: { id: "6s", red: false },
        drawEventRef: "event:draw",
      },
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:hora",
        action: { type: "hora", actor: 3, target: 1, pai: "5pr" },
      },
    ], discardResponse)).toMatchObject({
      status: "ready",
      draft: {
        kind: "ron",
        winningTile: { id: "5p", red: true },
        targetActor: 1,
        responseEventRef: "event:discard",
        winContext: "discard",
      },
    });
  });

  it("maps nine-terminals abort and none/pass, then rejects extensions", () => {
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:ryukyoku",
        action: {
          type: "ryukyoku",
          actor: 3,
          reason: "kyuushu_kyuuhai",
        },
      },
    ], selfTurn)).toMatchObject({
      status: "ready",
      draft: {
        kind: "kyuushu_kyuuhai",
        drawEventRef: "event:draw",
      },
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:none",
        action: { type: "none", actor: 3 },
      },
    ], discardResponse)).toMatchObject({
      status: "ready",
      draft: {
        kind: "pass",
        responseEventRef: "event:discard",
        responseKind: "discard",
      },
    });
    expect(adaptMjaiActionSequence([
      {
        eventRef: "event:extension",
        action: { type: "future_engine_extension" },
      },
    ], selfTurn)).toEqual({
      status: "unsupported",
      sourceType: "future_engine_extension",
    });
  });
});
```

- [ ] **Step 2: Write the failing typed-port conformance test**

Create `coach/packages/reasoning/tests/action-adapter-port.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  TypedActionAdapterPort,
} from "@riichi-coach/contracts";
import {
  normalizeCandidate,
  runTypedActionAdapter,
} from "../src/index.js";
import {
  adaptMjaiActionSequence,
} from "../src/import/mjai-action.js";

const context = {
  decisionWindow: {
    kind: "self_turn" as const,
    actor: 3,
    triggerEventRef: "event:draw",
  },
};

describe("typed action adapter port", () => {
  it("makes an Akagi fixture conform without defining private JSON", () => {
    type AkagiConformanceFixture = {
      tile: { id: "6s"; red: false };
      mode: "tsumogiri";
    };
    const akagiPort: TypedActionAdapterPort<AkagiConformanceFixture> = {
      sourceType: "akagi_native",
      adapt: (fixture) => ({
        status: "ready",
        sourceType: "akagi_native",
        draft: {
          kind: "discard",
          tile: fixture.tile,
          discardMode: fixture.mode,
        },
        factRefs: ["akagi-fixture:discard"],
      }),
    };
    const akagi = runTypedActionAdapter(
      akagiPort,
      {
        tile: { id: "6s", red: false },
        mode: "tsumogiri",
      },
      context,
    );
    const mjai = adaptMjaiActionSequence([
      {
        eventRef: "event:dahai",
        action: {
          type: "dahai",
          actor: 3,
          pai: "6s",
          tsumogiri: true,
        },
      },
    ], context);
    if (akagi.status !== "ready" || mjai.status !== "ready") {
      throw new Error("conformance adapters did not return drafts");
    }
    const facts = {
      decisionWindow: context.decisionWindow,
      concealedTiles: [],
      currentDraw: {
        tile: { id: "6s" as const, red: false },
        eventRef: "event:draw",
      },
    };
    const akagiCandidate = normalizeCandidate({
      draft: akagi.draft,
      origin: "model",
      facts,
    });
    const mjaiCandidate = normalizeCandidate({
      draft: mjai.draft,
      origin: "model",
      facts,
    });
    if (
      akagiCandidate.status !== "ready" ||
      mjaiCandidate.status !== "ready"
    ) {
      throw new Error("conformance drafts did not normalize");
    }

    expect(akagiCandidate.candidate.action).toEqual(
      mjaiCandidate.candidate.action,
    );
    expect(akagiCandidate.candidate.actionRef).toBe(
      mjaiCandidate.candidate.actionRef,
    );
  });

  it("rejects a port that returns a different source identity", () => {
    const forged: TypedActionAdapterPort<null> = {
      sourceType: "akagi_native",
      adapt: () => ({
        status: "unsupported",
        sourceType: "mjai",
      }),
    };
    expect(() => runTypedActionAdapter(forged, null, context)).toThrow(
      /source identity/,
    );
  });
});
```

- [ ] **Step 3: Run both focused tests and verify failure**

Run:

```powershell
npx vitest run packages/reasoning/tests/mjai-action.test.ts packages/reasoning/tests/action-adapter-port.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because the MJAI adapter and typed adapter runner do not exist.

- [ ] **Step 4: Implement the typed adapter runner**

Create `coach/packages/reasoning/src/import/action-adapter-port.ts`:

```ts
import {
  SourceActionAdaptationResultSchema,
  SourceAdapterContextSchema,
  type SourceActionAdaptationResult,
  type SourceAdapterContext,
  type TypedActionAdapterPort,
} from "@riichi-coach/contracts";

export function runTypedActionAdapter<RawAction>(
  port: TypedActionAdapterPort<RawAction>,
  rawAction: RawAction,
  rawContext: SourceAdapterContext,
): SourceActionAdaptationResult {
  if (port.sourceType.length === 0) {
    throw new Error("Typed adapter source identity must be non-empty");
  }
  const result = SourceActionAdaptationResultSchema.parse(
    port.adapt(rawAction, SourceAdapterContextSchema.parse(rawContext)),
  );
  if (result.sourceType !== port.sourceType) {
    throw new Error(
      `Typed adapter source identity mismatch: ${port.sourceType} != ` +
      result.sourceType,
    );
  }
  return result;
}
```

- [ ] **Step 5: Implement all declared MJAI semantics**

Create `coach/packages/reasoning/src/import/mjai-action.ts`:

```ts
import {
  TileSchema,
  SourceActionAdaptationResultSchema,
  SourceAdapterContextSchema,
  sortTilesCanonical,
  type SourceActionAdaptationResult,
  type SourceAdapterContext,
  type Tile,
} from "@riichi-coach/contracts";

const honors: Record<string, Tile["id"]> = {
  E: "1z",
  S: "2z",
  W: "3z",
  N: "4z",
  P: "5z",
  F: "6z",
  C: "7z",
};

export type MjaiActionEnvelope = {
  eventRef: string;
  action: Record<string, unknown> & { type: string };
};

function ready(
  draft: unknown,
  factRefs: string[],
): SourceActionAdaptationResult {
  return SourceActionAdaptationResultSchema.parse({
    status: "ready",
    sourceType: "mjai",
    draft,
    factRefs,
  });
}

function actor(action: Record<string, unknown>): number {
  if (
    typeof action.actor !== "number" ||
    !Number.isInteger(action.actor) ||
    action.actor < 0 ||
    action.actor > 3
  ) {
    throw new Error("MJAI action requires actor 0..3");
  }
  return action.actor;
}

function stringField(
  action: Record<string, unknown>,
  field: string,
): string {
  const value = action[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`MJAI action requires ${field}`);
  }
  return value;
}

function booleanField(
  action: Record<string, unknown>,
  field: string,
): boolean {
  const value = action[field];
  if (typeof value !== "boolean") {
    throw new Error(`MJAI action requires boolean ${field}`);
  }
  return value;
}

function tile(value: string): Tile {
  const red = value.endsWith("r");
  const base = red ? value.slice(0, -1) : value;
  const id = honors[base] ?? base;
  return TileSchema.parse({
    id,
    red,
  });
}

function tileArray(
  action: Record<string, unknown>,
  expectedLength: number,
): Tile[] {
  const values = action.consumed;
  if (!Array.isArray(values) || values.length !== expectedLength) {
    throw new Error(
      `MJAI ${action.type as string} requires ${expectedLength} consumed tiles`,
    );
  }
  return sortTilesCanonical(
    values.map((value) => {
      if (typeof value !== "string") {
        throw new Error("MJAI consumed tiles must be strings");
      }
      return tile(value);
    }),
  );
}

function target(action: Record<string, unknown>): number {
  const value = action.target;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 3
  ) {
    throw new Error("MJAI action requires target 0..3");
  }
  return value;
}

function requiredFields(type: string): string[] {
  switch (type) {
    case "reach":
    case "none":
      return ["actor"];
    case "dahai":
      return ["actor", "pai", "tsumogiri"];
    case "chi":
    case "pon":
    case "daiminkan":
      return ["actor", "target", "pai", "consumed"];
    case "ankan":
      return ["actor", "consumed"];
    case "kakan":
      return ["actor", "pai"];
    case "hora":
      return ["actor", "target", "pai"];
    case "ryukyoku":
      return ["actor", "reason"];
    default:
      return [];
  }
}

function fieldPresent(
  action: Record<string, unknown>,
  field: string,
): boolean {
  const value = action[field];
  if (field === "actor" || field === "target") {
    return typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 3;
  }
  if (field === "tsumogiri") {
    return typeof value === "boolean";
  }
  if (field === "consumed") {
    const expectedLength =
      action.type === "chi" || action.type === "pon"
        ? 2
        : action.type === "daiminkan"
          ? 3
          : action.type === "ankan"
            ? 4
            : 0;
    return Array.isArray(value) &&
      value.length === expectedLength &&
      value.every((tile) => typeof tile === "string" && tile.length > 0);
  }
  return typeof value === "string" && value.length > 0;
}

function missingFields(action: Record<string, unknown>): string[] {
  return requiredFields(action.type as string)
    .filter((field) => !fieldPresent(action, field));
}

function incompleteFields(
  sequence: readonly MjaiActionEnvelope[],
  fields: string[],
): SourceActionAdaptationResult {
  return SourceActionAdaptationResultSchema.parse({
    status: "incomplete",
    sourceType: "mjai",
    diagnosticCode: "missing_action_fields",
    missingFields: fields,
    factRefs: sequence.map((entry) => entry.eventRef),
  });
}

export function adaptMjaiActionSequence(
  rawSequence: readonly MjaiActionEnvelope[],
  rawContext: SourceAdapterContext,
): SourceActionAdaptationResult {
  const context = SourceAdapterContextSchema.parse(rawContext);
  if (rawSequence.length === 0) {
    return SourceActionAdaptationResultSchema.parse({
      status: "unsupported",
      sourceType: "empty_mjai_sequence",
    });
  }
  const first = rawSequence[0]!;
  const action = first.action;
  const firstMissing = missingFields(action);
  if (firstMissing.length > 0) {
    return incompleteFields(rawSequence, firstMissing);
  }

  if (action.type === "reach") {
    const reachActor = actor(action);
    const second = rawSequence[1];
    if (
      second === undefined ||
      second.action.type !== "dahai" ||
      actor(second.action) !== reachActor
    ) {
      return SourceActionAdaptationResultSchema.parse({
        status: "incomplete",
        sourceType: "mjai",
        diagnosticCode: "reach_without_dahai",
        missingFields: ["tile", "discardMode"],
        factRefs: rawSequence.map((entry) => entry.eventRef),
      });
    }
    const secondMissing = missingFields(second.action);
    if (secondMissing.length > 0) {
      return incompleteFields(rawSequence, secondMissing);
    }
    return ready({
      kind: "riichi_discard",
      tile: tile(stringField(second.action, "pai")),
      discardMode: booleanField(second.action, "tsumogiri")
        ? "tsumogiri"
        : "tedashi",
    }, [first.eventRef, second.eventRef]);
  }
  if (rawSequence.length !== 1) {
    return SourceActionAdaptationResultSchema.parse({
      status: "unsupported",
      sourceType: "mjai_sequence",
    });
  }

  const knownTypes = new Set([
    "dahai",
    "chi",
    "pon",
    "daiminkan",
    "ankan",
    "kakan",
    "hora",
    "ryukyoku",
    "none",
  ]);
  if (!knownTypes.has(action.type)) {
    return SourceActionAdaptationResultSchema.parse({
      status: "unsupported",
      sourceType: action.type,
    });
  }
  actor(action);
  switch (action.type) {
    case "dahai":
      return ready({
        kind: "discard",
        tile: tile(stringField(action, "pai")),
        discardMode: booleanField(action, "tsumogiri")
          ? "tsumogiri"
          : "tedashi",
      }, [first.eventRef]);
    case "chi":
    case "pon":
      return ready({
        kind: action.type,
        calledTile: tile(stringField(action, "pai")),
        consumedTiles: tileArray(action, 2),
        targetActor: target(action),
        responseEventRef: context.decisionWindow.triggerEventRef,
      }, [first.eventRef, context.decisionWindow.triggerEventRef]);
    case "daiminkan":
      return ready({
        kind: "daiminkan",
        calledTile: tile(stringField(action, "pai")),
        consumedTiles: tileArray(action, 3),
        targetActor: target(action),
        responseEventRef: context.decisionWindow.triggerEventRef,
      }, [first.eventRef, context.decisionWindow.triggerEventRef]);
    case "ankan":
      return ready({
        kind: "ankan",
        tiles: tileArray(action, 4),
      }, [first.eventRef]);
    case "kakan":
      return ready({
        kind: "kakan",
        addedTile: tile(stringField(action, "pai")),
        ...(typeof action.existingMeldRef === "string"
          ? { existingMeldRef: action.existingMeldRef }
          : context.existingMeldRef === undefined
            ? {}
            : { existingMeldRef: context.existingMeldRef }),
      }, [first.eventRef]);
    case "hora":
      if (context.decisionWindow.kind === "self_turn") {
        return ready({
          kind: "tsumo",
          winningTile: tile(stringField(action, "pai")),
          drawEventRef: context.decisionWindow.triggerEventRef,
        }, [first.eventRef, context.decisionWindow.triggerEventRef]);
      }
      if (
        context.decisionWindow.kind === "discard_response" ||
        context.decisionWindow.kind === "kan_response"
      ) {
        return ready({
          kind: "ron",
          winningTile: tile(stringField(action, "pai")),
          targetActor: target(action),
          responseEventRef: context.decisionWindow.triggerEventRef,
          winContext: context.decisionWindow.kind === "discard_response"
            ? "discard"
            : context.decisionWindow.kanKind,
        }, [first.eventRef, context.decisionWindow.triggerEventRef]);
      }
      return SourceActionAdaptationResultSchema.parse({
        status: "unsupported",
        sourceType: "hora_in_post_call_discard",
      });
    case "ryukyoku": {
      const reason = stringField(action, "reason");
      if (reason !== "kyuushu_kyuuhai" && reason !== "kyushukyuhai") {
        return SourceActionAdaptationResultSchema.parse({
          status: "unsupported",
          sourceType: `ryukyoku:${reason}`,
        });
      }
      return ready({
        kind: "kyuushu_kyuuhai",
        drawEventRef: context.decisionWindow.triggerEventRef,
      }, [first.eventRef, context.decisionWindow.triggerEventRef]);
    }
    case "none":
      if (context.decisionWindow.kind === "discard_response") {
        return ready({
          kind: "pass",
          responseEventRef: context.decisionWindow.triggerEventRef,
          responseKind: "discard",
        }, [first.eventRef, context.decisionWindow.triggerEventRef]);
      }
      if (context.decisionWindow.kind === "kan_response") {
        return ready({
          kind: "pass",
          responseEventRef: context.decisionWindow.triggerEventRef,
          responseKind: context.decisionWindow.kanKind,
        }, [first.eventRef, context.decisionWindow.triggerEventRef]);
      }
      return SourceActionAdaptationResultSchema.parse({
        status: "unsupported",
        sourceType: "none_outside_response",
      });
    default:
      return SourceActionAdaptationResultSchema.parse({
        status: "unsupported",
        sourceType: action.type,
      });
  }
}
```

Apply this patch to `coach/packages/reasoning/src/index.ts`:

```diff
 export * from "./candidate/comparison-set-builder.js";
+export * from "./import/action-adapter-port.js";
+export * from "./import/mjai-action.js";
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```powershell
npx vitest run packages/reasoning/tests/mjai-action.test.ts packages/reasoning/tests/action-adapter-port.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: all MJAI semantics and typed-port conformance tests PASS; typecheck PASS. No production Akagi JSON type, schema, property name, or parser is introduced.

- [ ] **Step 7: Commit Task 7**

Run:

```powershell
git add -- coach/packages/reasoning/src/import/action-adapter-port.ts coach/packages/reasoning/src/import/mjai-action.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/action-adapter-port.test.ts coach/packages/reasoning/tests/mjai-action.test.ts
git diff --cached --check
git commit -m "feat: adapt typed engine actions"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the five listed files. `RESOURCES.md` and `overlay/` remain unstaged.

### Task 8: Explicit legacy discard bridge

**Files:**

- Create: `coach/packages/reasoning/tests/legacy-action-bridge.test.ts`
- Create: `coach/packages/reasoning/src/candidate/legacy-action-bridge.ts`
- Modify: `coach/packages/reasoning/src/index.ts`

- [ ] **Step 1: Write the failing bidirectional bridge tests**

Create `coach/packages/reasoning/tests/legacy-action-bridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  actionToLegacyDiscardActionId,
  legacyDiscardActionIdToAction,
} from "../src/candidate/legacy-action-bridge.js";

const regressionActions = [
  "discard:6s:tsumogiri",
  "discard:2p:tedashi",
  "discard:8p:tsumogiri",
  "discard:7p:tedashi",
] as const;

describe("legacy discard action bridge", () => {
  it("maps the four East 1 regression actions to structured discards", () => {
    expect(regressionActions.map((actionId) =>
      legacyDiscardActionIdToAction(actionId)
    )).toEqual([
      {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tsumogiri",
      },
      {
        kind: "discard",
        tile: { id: "2p", red: false },
        discardMode: "tedashi",
      },
      {
        kind: "discard",
        tile: { id: "8p", red: false },
        discardMode: "tsumogiri",
      },
      {
        kind: "discard",
        tile: { id: "7p", red: false },
        discardMode: "tedashi",
      },
    ]);
  });

  it("round-trips ordinary red and non-red legacy discards", () => {
    for (const actionId of [
      ...regressionActions,
      "discard:5pr:tedashi",
      "discard:5p:tedashi",
    ] as const) {
      expect(actionToLegacyDiscardActionId(
        legacyDiscardActionIdToAction(actionId),
      )).toEqual({ status: "ready", actionId });
    }
  });

  it("does not pretend non-ordinary-discard actions are legacy IDs", () => {
    expect(actionToLegacyDiscardActionId({
      kind: "riichi_discard",
      tile: { id: "5p", red: false },
      discardMode: "tedashi",
    })).toEqual({
      status: "unsupported",
      actionKind: "riichi_discard",
    });
    expect(actionToLegacyDiscardActionId({
      kind: "pass",
      responseEventRef: "event:discard",
      responseKind: "discard",
    })).toEqual({
      status: "unsupported",
      actionKind: "pass",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/reasoning/tests/legacy-action-bridge.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because `legacy-action-bridge.ts` does not exist.

- [ ] **Step 3: Implement the isolated bridge without changing legacy contracts**

Create `coach/packages/reasoning/src/candidate/legacy-action-bridge.ts`:

```ts
import {
  ActionIdSchema,
  RiichiActionSchema,
  type ActionId,
  type RiichiAction,
  type Tile,
} from "@riichi-coach/contracts";

const LEGACY_DISCARD =
  /^discard:(5[mps]r|[1-9][mps]|[1-7]z):(tsumogiri|tedashi)$/;

export function legacyDiscardActionIdToAction(
  rawActionId: ActionId,
): RiichiAction {
  const actionId = ActionIdSchema.parse(rawActionId);
  const match = LEGACY_DISCARD.exec(actionId);
  if (match === null) {
    throw new Error(`Invalid legacy discard action: ${actionId}`);
  }
  const encodedTile = match[1]!;
  const red = encodedTile.endsWith("r");
  const id = red ? encodedTile.slice(0, -1) : encodedTile;
  return RiichiActionSchema.parse({
    kind: "discard",
    tile: { id: id as Tile["id"], red },
    discardMode: match[2],
  });
}

export type LegacyDiscardBridgeResult =
  | { status: "ready"; actionId: ActionId }
  | { status: "unsupported"; actionKind: RiichiAction["kind"] };

export function actionToLegacyDiscardActionId(
  rawAction: RiichiAction,
): LegacyDiscardBridgeResult {
  const action = RiichiActionSchema.parse(rawAction);
  if (action.kind !== "discard") {
    return { status: "unsupported", actionKind: action.kind };
  }
  const tile = `${action.tile.id}${action.tile.red ? "r" : ""}`;
  return {
    status: "ready",
    actionId: ActionIdSchema.parse(
      `discard:${tile}:${action.discardMode}`,
    ),
  };
}
```

Apply this patch to `coach/packages/reasoning/src/index.ts`:

```diff
 export * from "./import/mjai-action.js";
+export * from "./candidate/legacy-action-bridge.js";
```

- [ ] **Step 4: Run focused tests and strict legacy tests**

Run:

```powershell
npx vitest run packages/reasoning/tests/legacy-action-bridge.test.ts packages/reasoning/tests/mortal-report.test.ts packages/reasoning/tests/public-pipeline.test.ts packages/reasoning/tests/strict-analysis-package.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: bridge tests PASS; East 1 turn 6/7 import and strict-package tests remain unchanged; typecheck PASS.

- [ ] **Step 5: Commit Task 8**

Run:

```powershell
git add -- coach/packages/reasoning/src/candidate/legacy-action-bridge.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/legacy-action-bridge.test.ts
git diff --cached --check
git commit -m "feat: bridge legacy discard actions"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files. No old `ActionId`, decision, factor, analyzer, or regression file is changed; `RESOURCES.md` and `overlay/` remain unstaged.

### Task 9: Generic structured Mortal/MJAI importer

**Files:**

- Create: `coach/packages/reasoning/tests/structured-mortal.test.ts`
- Create: `coach/packages/reasoning/src/import/structured-mortal.ts`
- Modify: `coach/packages/reasoning/src/index.ts`

- [ ] **Step 1: Write the failing generic-import tests**

Create `coach/packages/reasoning/tests/structured-mortal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  importStructuredMortalComparison,
} from "../src/import/structured-mortal.js";

const facts = {
  decisionWindow: {
    kind: "self_turn" as const,
    actor: 3,
    triggerEventRef: "event:draw",
  },
  concealedTiles: [{ id: "2p" as const, red: false }],
  currentDraw: {
    tile: { id: "6s" as const, red: false },
    eventRef: "event:draw",
  },
};

const modelSixSou = {
  actions: [{
    eventRef: "model:6s",
    action: {
      type: "dahai",
      actor: 3,
      pai: "6s",
      tsumogiri: true,
    },
  }],
  probability: 0.8,
  qValue: 1.2,
};
const modelTwoPin = {
  actions: [{
    eventRef: "model:2p",
    action: {
      type: "dahai",
      actor: 3,
      pai: "2p",
      tsumogiri: false,
    },
  }],
  probability: 0.2,
  qValue: 0.1,
};
const actualTwoPin = {
  actions: [{
    eventRef: "actual:2p",
    action: {
      type: "dahai",
      actor: 3,
      pai: "2p",
      tsumogiri: false,
    },
  }],
};

describe("generic structured Mortal importer", () => {
  it("returns a StructuredComparisonSet and action-bound score mapping", () => {
    const result = importStructuredMortalComparison({
      comparisonSetId: "comparison:e1:t6:structured",
      decisionLayerRef: "decision-layer:e1:t6",
      facts,
      modelCandidates: [modelSixSou, modelTwoPin],
      actual: actualTwoPin,
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.comparisonSet.origin).toBe("automatic_review");
      expect(result.comparisonSet.candidates).toHaveLength(2);
      const actual = result.comparisonSet.candidates.find(
        (candidate) => candidate.origins.includes("actual"),
      );
      expect(actual?.origins).toEqual(["model", "actual"]);
      expect(result.scores).toHaveLength(2);
      expect(result.scores.map((score) => score.actionRef)).toEqual(
        result.comparisonSet.candidates.map(
          (candidate) => candidate.actionRef,
        ),
      );
      expect(result.scores.map((score) => score.probability).sort())
        .toEqual([0.2, 0.8]);
    }
  });

  it("fails closed when the actual action was not model-scored", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:missing-actual",
      decisionLayerRef: "decision-layer:missing-actual",
      facts,
      modelCandidates: [modelSixSou],
      actual: actualTwoPin,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["actual_action_not_scored"],
    });
  });

  it("preserves isolated reach as a source diagnostic", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:isolated-reach",
      decisionLayerRef: "decision-layer:isolated-reach",
      facts,
      modelCandidates: [{
        actions: [{
          eventRef: "model:reach",
          action: { type: "reach", actor: 3 },
        }],
        probability: 0.5,
      }, modelTwoPin],
      actual: actualTwoPin,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["reach_without_dahai:tile,discardMode"],
    });
  });

  it("rejects duplicate model rows for one canonical action", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:duplicate-score",
      decisionLayerRef: "decision-layer:duplicate-score",
      facts,
      modelCandidates: [modelTwoPin, {
        ...modelTwoPin,
        probability: 0.1,
      }],
      actual: actualTwoPin,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["duplicate_model_action"],
    });
  });

  it("rejects non-finite or out-of-range model score inputs", () => {
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:bad-probability",
      decisionLayerRef: "decision-layer:bad-probability",
      facts,
      modelCandidates: [{
        ...modelSixSou,
        probability: 1.01,
      }, modelTwoPin],
      actual: actualTwoPin,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["invalid_model_probability"],
    });
    expect(importStructuredMortalComparison({
      comparisonSetId: "comparison:bad-q",
      decisionLayerRef: "decision-layer:bad-q",
      facts,
      modelCandidates: [{
        ...modelSixSou,
        qValue: Number.NaN,
      }, modelTwoPin],
      actual: actualTwoPin,
    })).toEqual({
      status: "incomplete",
      diagnostics: ["invalid_model_q_value"],
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/reasoning/tests/structured-mortal.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because `structured-mortal.ts` does not exist.

- [ ] **Step 3: Implement the generic importer over the shared adapter and normalizer**

Create `coach/packages/reasoning/src/import/structured-mortal.ts`:

```ts
import {
  KnownActionFactsSchema,
  type CandidateNormalizationResult,
  type KnownActionFacts,
  type StructuredComparisonSet,
} from "@riichi-coach/contracts";
import {
  buildStructuredComparisonSet,
} from "../candidate/comparison-set-builder.js";
import {
  normalizeCandidate,
} from "../candidate/candidate-normalizer.js";
import {
  adaptMjaiActionSequence,
  type MjaiActionEnvelope,
} from "./mjai-action.js";

export type StructuredMortalCandidateInput = {
  actions: MjaiActionEnvelope[];
  probability: number;
  qValue?: number;
  existingMeldRef?: string;
};

export type StructuredMortalActualInput = {
  actions: MjaiActionEnvelope[];
  existingMeldRef?: string;
};

export type StructuredMortalScore = {
  actionRef: StructuredComparisonSet["candidates"][number]["actionRef"];
  probability: number;
  qValue?: number;
};

type ReadyNormalization = Extract<
  CandidateNormalizationResult,
  { status: "ready" }
>;

type StructuredMortalModelRow = {
  normalized: ReadyNormalization;
  probability: number;
  qValue?: number;
};

export type StructuredMortalImportResult =
  | {
      status: "ready";
      comparisonSet: StructuredComparisonSet;
      scores: StructuredMortalScore[];
    }
  | {
      status: "incomplete";
      diagnostics: string[];
    }
  | {
      status: "not_comparable";
      code: "cross_decision_window" | "fewer_than_two_distinct_actions";
      actionRefs: StructuredMortalScore["actionRef"][];
      windowKinds: Array<
        "self_turn" |
        "discard_response" |
        "kan_response" |
        "post_call_discard"
      >;
    };

function diagnostic(
  adapted: ReturnType<typeof adaptMjaiActionSequence>,
): string {
  if (adapted.status === "incomplete") {
    return `${adapted.diagnosticCode}:${adapted.missingFields.join(",")}`;
  }
  if (adapted.status === "unsupported") {
    return `unsupported_source_action:${adapted.sourceType}`;
  }
  throw new Error("Ready adaptation has no diagnostic");
}

export function importStructuredMortalComparison(input: {
  comparisonSetId: string;
  decisionLayerRef: string;
  facts: KnownActionFacts;
  modelCandidates: StructuredMortalCandidateInput[];
  actual: StructuredMortalActualInput;
}): StructuredMortalImportResult {
  const facts = KnownActionFactsSchema.parse(input.facts);
  const modelRows: StructuredMortalModelRow[] = [];
  const diagnostics: string[] = [];

  for (const modelCandidate of input.modelCandidates) {
    if (
      !Number.isFinite(modelCandidate.probability) ||
      modelCandidate.probability < 0 ||
      modelCandidate.probability > 1
    ) {
      diagnostics.push("invalid_model_probability");
      continue;
    }
    if (
      modelCandidate.qValue !== undefined &&
      !Number.isFinite(modelCandidate.qValue)
    ) {
      diagnostics.push("invalid_model_q_value");
      continue;
    }
    const adapted = adaptMjaiActionSequence(
      modelCandidate.actions,
      {
        decisionWindow: facts.decisionWindow,
        ...(modelCandidate.existingMeldRef === undefined
          ? {}
          : { existingMeldRef: modelCandidate.existingMeldRef }),
      },
    );
    if (adapted.status !== "ready") {
      diagnostics.push(diagnostic(adapted));
      continue;
    }
    const normalized = normalizeCandidate({
      draft: adapted.draft,
      origin: "model",
      facts,
    });
    if (normalized.status !== "ready") {
      diagnostics.push(
        normalized.status === "needs_clarification"
          ? `needs_clarification:${normalized.ambiguousFields.join(",")}`
          : normalized.status === "inconsistent_with_known_facts"
            ? `inconsistent:${normalized.conflictCodes.join(",")}`
            : `unsupported_source_action:${normalized.sourceType}`,
      );
      continue;
    }
    modelRows.push({
      normalized,
      probability: modelCandidate.probability,
      ...(modelCandidate.qValue === undefined
        ? {}
        : { qValue: modelCandidate.qValue }),
    });
  }
  if (diagnostics.length > 0) {
    return { status: "incomplete", diagnostics: [...new Set(diagnostics)] };
  }

  const actualAdapted = adaptMjaiActionSequence(
    input.actual.actions,
    {
      decisionWindow: facts.decisionWindow,
      ...(input.actual.existingMeldRef === undefined
        ? {}
        : { existingMeldRef: input.actual.existingMeldRef }),
    },
  );
  if (actualAdapted.status !== "ready") {
    return {
      status: "incomplete",
      diagnostics: [diagnostic(actualAdapted)],
    };
  }
  const actual = normalizeCandidate({
    draft: actualAdapted.draft,
    origin: "actual",
    facts,
  });
  if (actual.status !== "ready") {
    const detail = actual.status === "needs_clarification"
      ? `needs_clarification:${actual.ambiguousFields.join(",")}`
      : actual.status === "inconsistent_with_known_facts"
        ? `inconsistent:${actual.conflictCodes.join(",")}`
        : `unsupported_source_action:${actual.sourceType}`;
    return { status: "incomplete", diagnostics: [detail] };
  }

  const modelRefs = modelRows.map(
    (row) => row.normalized.candidate.actionRef,
  );
  if (new Set(modelRefs).size !== modelRefs.length) {
    return {
      status: "incomplete",
      diagnostics: ["duplicate_model_action"],
    };
  }
  if (!modelRefs.includes(actual.candidate.actionRef)) {
    return {
      status: "incomplete",
      diagnostics: ["actual_action_not_scored"],
    };
  }

  const built = buildStructuredComparisonSet({
    comparisonSetId: input.comparisonSetId,
    origin: "automatic_review",
    decisionLayerRef: input.decisionLayerRef,
    candidates: [
      ...modelRows.map((row) => ({
        result: row.normalized,
        decisionWindow: facts.decisionWindow,
      })),
      {
        result: actual,
        decisionWindow: facts.decisionWindow,
      },
    ],
  });
  if (built.status !== "ready") {
    return built;
  }
  const scoreByRef = new Map(modelRows.map((row) => [
    row.normalized.candidate.actionRef,
    row,
  ]));
  return {
    status: "ready",
    comparisonSet: built.comparisonSet,
    scores: built.comparisonSet.candidates.map((candidate) => {
      const row = scoreByRef.get(candidate.actionRef)!;
      return {
        actionRef: candidate.actionRef,
        probability: row.probability,
        ...(row.qValue === undefined ? {} : { qValue: row.qValue }),
      };
    }),
  };
}
```

Apply this patch to `coach/packages/reasoning/src/index.ts`:

```diff
 export * from "./candidate/user-action-draft.js";
+export * from "./import/structured-mortal.js";
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npx vitest run packages/reasoning/tests/structured-mortal.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: generic importer tests PASS; its score mapping uses the same canonical refs as the structured candidates; isolated reach and unscored actual actions fail closed.

- [ ] **Step 5: Commit Task 9**

Run:

```powershell
git add -- coach/packages/reasoning/src/import/structured-mortal.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/structured-mortal.test.ts
git diff --cached --check
git commit -m "feat: import structured Mortal comparisons"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files. The existing `mortal-report.ts` facade is unchanged; `RESOURCES.md` and `overlay/` remain unstaged.

### Task 10: Public exports, documentation, and full regression

**Files:**

- Modify: `coach/smoke/package-import-smoke.mjs`
- Modify: `coach/README.md`

- [ ] **Step 1: Extend the emitted-JavaScript smoke test**

Replace `coach/smoke/package-import-smoke.mjs` with:

```js
import assert from "node:assert/strict";
import test from "node:test";

test("workspace packages import as emitted JavaScript", async () => {
  const contracts = await import("@riichi-coach/contracts");
  const reasoning = await import("@riichi-coach/reasoning");

  assert.equal(typeof contracts.AnalysisRequestSchema.parse, "function");
  assert.equal(typeof contracts.ModelEvaluationSchema.parse, "function");
  assert.equal(typeof contracts.RiichiActionSchema.parse, "function");
  assert.equal(typeof contracts.DecisionWindowSchema.parse, "function");
  assert.equal(typeof contracts.canonicalActionRef, "function");
  assert.equal(
    typeof contracts.StructuredComparisonSetSchema.parse,
    "function",
  );
  assert.equal(typeof contracts.toComparisonSet, "function");
  assert.equal(
    typeof contracts.CandidateNormalizationResultSchema.parse,
    "function",
  );
  assert.equal(typeof reasoning.analyzeRegressionFixture, "function");
  assert.equal(typeof reasoning.buildMortalModelEvaluation, "function");
  assert.equal(typeof reasoning.buildAkagiModelEvaluation, "function");
  assert.equal(typeof reasoning.freezeDetailPolicy, "function");
  assert.equal(typeof reasoning.classifyModelEvaluationDetail, "function");
  assert.equal(typeof reasoning.computePreferenceAgreement, "function");
  assert.equal(typeof reasoning.createPreferenceState, "function");
  assert.equal(typeof reasoning.validateStrictAnalysisPackage, "function");
  assert.equal(typeof reasoning.userActionDraftToActionDraft, "function");
  assert.equal(typeof reasoning.normalizeCandidate, "function");
  assert.equal(typeof reasoning.buildStructuredComparisonSet, "function");
  assert.equal(typeof reasoning.runTypedActionAdapter, "function");
  assert.equal(typeof reasoning.adaptMjaiActionSequence, "function");
  assert.equal(
    typeof reasoning.importStructuredMortalComparison,
    "function",
  );
  assert.equal(
    typeof reasoning.legacyDiscardActionIdToAction,
    "function",
  );
  assert.equal(
    typeof reasoning.actionToLegacyDiscardActionId,
    "function",
  );
});
```

- [ ] **Step 2: Run the smoke test before documentation**

Run:

```powershell
npm run test:package-import
```

Working directory: `E:\文档\日麻教学\coach`

Expected: PASS after both packages build and all old and new emitted exports load.

- [ ] **Step 3: Document the milestone without claiming legal-action completeness**

Apply this patch to `coach/README.md`:

```diff
 - a fixed agreement truth table for model and coach preference sets;
+- strict structured contracts for discard, riichi discard, chi, pon, three
+  kans, tsumo, ron, nine-terminals abort, and pass;
+- canonical action references, four decision windows, and explicit projection
+  to the legacy comparison view;
+- shared user/MJAI/typed-engine candidate normalization with ambiguity,
+  known-fact conflict, and missing-fact states;
+- same-action origin merging, cross-window rejection, and an isolated
+  discard-only legacy bridge;
@@
 Outside this milestone:

 - production Mortal and Akagi Native report integration;
-- structured chi, pon, kan, win, abortive-draw, and pass action normalization;
+- production Akagi Native private-format parsing;
+- complete legal-action enumeration and call-follow-up branch search;
 - complete meld, furiten, remaining-tile, and called-discard state;
```

Add this paragraph immediately before `The LLM consumes the validated package.`:

```markdown
The structured path checks only contradictions supported by `KnownActionFacts`.
Missing facts remain `unknown_due_to_missing_facts`; they are not described as
illegal. “Whether to call” and “what to discard after calling” are separate
decision windows. The old discard-only strict analysis remains the active
regression pipeline until the later factor-pipeline migration.
```

- [ ] **Step 4: Run the complete coach verification matrix**

Run:

```powershell
npm test
npm run typecheck
npm run test:package-import
npm audit
```

Working directory: `E:\文档\日麻教学\coach`

Expected:

- all contract and reasoning tests PASS;
- TypeScript reports no errors;
- emitted-JavaScript package smoke PASS;
- `npm audit` reports 0 vulnerabilities.

- [ ] **Step 5: Run the East 1 turn 6/7 strict regression explicitly**

Run:

```powershell
npx vitest run packages/reasoning/tests/mortal-report.test.ts packages/reasoning/tests/public-pipeline.test.ts packages/reasoning/tests/strict-analysis-package.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected:

- exactly two East 1 packages remain, `east1-turn6` and `east1-turn7`;
- the four legacy actions remain `discard:6s:tsumogiri`, `discard:2p:tedashi`, `discard:8p:tsumogiri`, and `discard:7p:tedashi`;
- each `decision.modelReason` remains `unknown`;
- each `coachJudgement` remains `null`;
- both strict packages still validate after JSON serialization.

- [ ] **Step 6: Run the root legacy 18-test regression**

Run:

```powershell
node --test tests/*.test.mjs
```

Working directory: `E:\文档\日麻教学`

Expected: exactly 18 tests pass, 0 fail, 0 are skipped or cancelled.

- [ ] **Step 7: Run workspace and scope self-checks**

Run:

```powershell
git diff --check -- coach
git status --short
$forbiddenHits = rg -n 'split\(|FactorPipeline|NormalizedDecisionSchema|FactorEvidenceSchema' coach/packages/contracts/src/actions.ts coach/packages/contracts/src/action-codec.ts coach/packages/contracts/src/structured-comparison.ts coach/packages/contracts/src/candidate-contracts.ts coach/packages/reasoning/src/candidate coach/packages/reasoning/src/import/action-adapter-port.ts coach/packages/reasoning/src/import/mjai-action.ts coach/packages/reasoning/src/import/structured-mortal.ts
if ($LASTEXITCODE -eq 0) {
  $forbiddenHits
  throw "New structured-action files crossed the slice boundary"
}
if ($LASTEXITCODE -ne 1) {
  throw "Scope scan failed to run"
}
```

Working directory: `E:\文档\日麻教学`

Expected:

- `git diff --check -- coach` emits no output;
- `RESOURCES.md` and `overlay/` have exactly the same status recorded in Preflight and are not staged;
- the search emits no `split(`, no `FactorPipeline`, and no new use or redefinition of `NormalizedDecisionSchema` or `FactorEvidenceSchema`;
- any old occurrences outside the explicitly searched new files remain untouched for slice 3.

- [ ] **Step 8: Inspect and commit only the public-surface files**

Run:

```powershell
git diff --stat -- coach
git add -- coach/README.md coach/smoke/package-import-smoke.mjs
git diff --cached --check
git commit -m "docs: expose structured candidate normalization"
```

Working directory: `E:\文档\日麻教学`

Expected: the final task commit contains only `coach/README.md` and `coach/smoke/package-import-smoke.mjs`. `RESOURCES.md` and `overlay/` remain unstaged.

## Final acceptance checklist

- [ ] All eleven action variants are strict discriminated schemas.
- [ ] Red and ordinary fives, hand-cut and draw-cut, ordinary and riichi discard, call composition, response identity, win context, and meld reference affect the canonical action reference.
- [ ] Call-consumption arrays enter the codec in canonical tile order.
- [ ] `canonicalActionRef` exists only in `@riichi-coach/contracts`; reasoning imports it.
- [ ] `StructuredComparisonCandidateSchema` recomputes and rejects a forged action/ref pair.
- [ ] `StructuredComparisonSetSchema` freezes one decision window and enforces automatic/user invariants.
- [ ] `toComparisonSet` explicitly removes only action catalogs and the decision window.
- [ ] The self-turn, discard-response, kan-response, and post-call-discard matrix is enforced.
- [ ] Response event refs, ron/pass response kinds, and draw event refs match the frozen window.
- [ ] `UserActionDraft` accepts only constrained Chinese names and compact `m/p/s/z` notation.
- [ ] Ambiguity returns the minimal field list and never guesses red identity, discard mode, call composition, response event, meld reference, or win context.
- [ ] Direct known contradictions return `inconsistent_with_known_facts` with codes and evidence refs.
- [ ] Missing concealed hand, draw, meld, or response facts return `unknown_due_to_missing_facts`, never “illegal.”
- [ ] Standalone hypotheses can supply only their explicit `KnownActionFacts`; no hidden live scene enters the API.
- [ ] Identical canonical actions merge `model`, `actual`, and `user` origins once.
- [ ] “Whether to pon” and “post-pon discard” return `not_comparable`.
- [ ] MJAI supports `dahai`, atomic `reach + dahai`, chi, pon, daiminkan, ankan, kakan, tsumo/ron `hora`, nine-terminals abort, and response-window `none`.
- [ ] Isolated reach and incomplete source actions stay import diagnostics.
- [ ] Unknown engine actions are explicit unsupported results.
- [ ] Akagi conformance uses only `TypedActionAdapterPort`; no private raw JSON is guessed.
- [ ] The generic importer returns one `StructuredComparisonSet` and an action-ref-bound score mapping.
- [ ] The bridge handles only legacy ordinary discards; other structured actions return unsupported.
- [ ] Existing `ActionId`, `NormalizedDecision`, `FactorEvidence`, analyzers, explanations, validators, and `analyzeRegressionFixture` remain unchanged.
- [ ] `modelReason` remains `unknown`, East 1 turn 6/7 remain strict, and all 18 root legacy tests pass.
- [ ] Package imports, full tests, typecheck, and `npm audit` pass.
- [ ] `RESOURCES.md` and `overlay/` remain unstaged and unchanged by this slice.
