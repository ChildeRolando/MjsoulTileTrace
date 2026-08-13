# Hand Structure and Furiten V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the M2-A deterministic hand-analysis layer that reports standard/chiitoitsu/kokushi shanten, family-aware effective tiles, bounded non-dominated decompositions, typed waits, and discard/temporary/riichi furiten from canonical replay evidence.

**Architecture:** Add an independent strict `hand-structure/v2` request/result beside the unchanged `hand13` request in the pinned Go JSONL sidecar. The sidecar reuses only `mahjong-helper`'s public normal/chiitoitsu shanten and completed-hand division/point APIs; it implements kokushi, family-by-family effective-tile enumeration, and incomplete-hand exhaustive/Pareto decomposition locally. TypeScript projects canonical snapshots and candidate post-action hands into V2 requests, derives response-opportunity furiten from complete canonical history, merges it with wait-dependent discard furiten, and maps only auditable facts into the existing five-axis ledger.

**Tech Stack:** TypeScript 5.9, Zod 3.25, Vitest 3.2, Node.js, Go sidecar, `EndlessCheng/mahjong-helper` pinned at `514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0`.

---

## Scope and fixed decisions

This plan implements only M2-A hand structure, waits, and three furiten components. It does not implement the per-threat defense matrix, calibrated deal-in probability, placement EV, a new legal-action enumerator, or source-record download/mapping.

The following boundaries are mandatory:

- Keep `mahjong-facts/v1` transport identity and the existing `hand13` request/result intact. Add `schemaVersion: "hand-structure/v2"` to the new independent request and result.
- Call `util.CalculateShantenOfNormal(tiles34, countOfTiles)` and `util.CalculateShantenOfChiitoi(tiles34)` directly. Chiitoitsu and kokushi are `not_applicable_open_hand` whenever the hand has a meld.
- Implement kokushi as `13 - uniqueTerminalHonorKinds - hasTerminalHonorPair`.
- Compute each family's effective tiles by adding one of Tile34 `0..33` and retaining only additions that lower that family's shanten. Never use helper candidate ranking.
- Use `util.DivideTiles34` only after adding a winning tile. It supports completed standard and chiitoitsu hands, but not kokushi and not incomplete-hand decomposition.
- Enumerate incomplete standard-hand decompositions locally, retain exact-minimum-shanten non-dominated decompositions, sort/deduplicate them stably, and cap returned decompositions at 64. Return claims shared by all retained decompositions separately from conditional claims.
- Derive normal wait types from every completed division; retain every applicable label. Chiitoitsu is `tanki`; kokushi is `kokushi_single` or `kokushi_thirteen_sided`.
- Require strict `yakuContext` on every V2 request: known/unknown winds with nullable values, accepted/inactive/unknown riichi, and enabled/disabled/unknown open tanyao. Treat helper `CalcPoint` only as a baseline proof. Evaluate every admissible completion of unknown context: unanimous positive is `eligible`, unanimous zero is `ineligible`, and disagreement or unsupported situational context is `unknown_missing_situational_yaku_context`. Never infer yaku from dora or a model score.
- Derive temporary and riichi furiten only when `responseOpportunities === complete`, the historical self hand is reconstructable, V2 proves the offered tile is a ron-eligible wait, and canonical events prove that response window closed without self ron. A self draw clears temporary furiten; riichi furiten survives until round end.
- Derive discard furiten by intersecting the current wait set with the self river. It is whole-hand furiten: one matching wait makes ron unavailable on every wait.
- Missing facts block only the dependent component. They do not erase calculated shanten or trigger a broad clarification request.
- Preserve East 1 turn 6/7: efficiency supports 2p/7p, defense supports genbutsu 6s/8p, and applied preference remains `null`.

## File map

Create:

- `coach/packages/contracts/src/hand-structure.ts` — strict V2 request/result, decomposition, wait, eligibility, and merged furiten contracts.
- `coach/packages/contracts/tests/hand-structure.test.ts` — cross-field and ordering contract tests.
- `coach/tools/mahjong-facts/hand_structure.go` — V2 request validation and family shanten/effective-tile analysis.
- `coach/tools/mahjong-facts/hand_structure_test.go` — normal/chiitoitsu/kokushi and effective-tile Go tests.
- `coach/tools/mahjong-facts/hand_decomposition.go` — exhaustive standard decomposition, Pareto filtering, stable claims and truncation.
- `coach/tools/mahjong-facts/hand_decomposition_test.go` — ambiguous shape, invariants, alternatives, determinism and cap tests.
- `coach/tools/mahjong-facts/hand_waits.go` — completed divisions, wait labels, and baseline ron eligibility.
- `coach/tools/mahjong-facts/hand_waits_test.go` — all wait labels, composite waits, kokushi, and eligibility tests.
- `coach/packages/reasoning/src/factors/hand-structure-projector.ts` — snapshot/candidate state to strict V2 request.
- `coach/packages/reasoning/tests/hand-structure-projector.test.ts` — projection, open-hand and missing-visibility tests.
- `coach/packages/reasoning/src/replay/response-furiten.ts` — canonical response opportunities and temporary/riichi furiten state machine.
- `coach/packages/reasoning/tests/response-furiten.test.ts` — pass, clear, riichi persistence, incompleteness and head-bump tests.
- `coach/packages/reasoning/src/factors/furiten-merger.ts` — merge current waits/self river with response-history furiten.
- `coach/packages/reasoning/tests/furiten-merger.test.ts` — discard intersection and whole-hand ron eligibility tests.
- `coach/packages/reasoning/src/factors/hand-structure-ledger.ts` — V2 result to deterministic efficiency/option-value facts.
- `coach/packages/reasoning/tests/hand-structure-ledger.test.ts` — ledger evidence and non-decisive structural labels.

Modify:

- `coach/packages/contracts/src/index.ts` — export the V2 contracts.
- `coach/tools/mahjong-facts/protocol.go` — dispatch `hand_structure` without changing `hand13`.
- `coach/tools/mahjong-facts/protocol_test.go` — strict dispatch and unknown-field coverage.
- `coach/packages/reasoning/src/fact-engine/port.ts` — add `analyzeHandStructure`.
- `coach/packages/reasoning/src/fact-engine/jsonl-client.ts` — parse/bind the V2 result.
- `coach/packages/reasoning/tests/fact-engine-client.test.ts` — client binding failures.
- `coach/packages/reasoning/src/factors/candidate-projector.ts` — attach a V2 request to discard/riichi-discard projections.
- `coach/packages/reasoning/src/factors/structured-factor-pipeline.ts` — run V2 analysis and carry its outcome.
- `coach/packages/reasoning/src/factors/ledger-builder.ts` — prefer V2 structural facts while retaining V1 estimates.
- `coach/packages/reasoning/src/factors/difference-builder.ts` — deterministic direction only for shanten and remaining effective tiles; structural labels remain neutral.
- `coach/packages/reasoning/src/factors/known-game-facts-v2.ts` — add the analyzed async wrapper that merges response furiten; keep the synchronous replay-only projector.
- `coach/packages/reasoning/src/index.ts` — export production M2-A entry points.
- `coach/packages/reasoning/tests/structured-factor-pipeline.test.ts` — V2 success/failure isolation.
- `coach/packages/reasoning/tests/structured-factor-regression.test.ts` — East 1 non-regression and score-deletion invariance.
- `coach/README.md` — document V2 and its unsupported boundaries.
- `docs/superpowers/plans/2026-08-01-llm-riichi-coach-product-roadmap.md` — mark M2-A complete only after all gates pass.
- `docs/superpowers/handoffs/2026-08-08-canonical-event-stream-round-reducer-handoff.md` — replace the M2-A entry point with delivered versions and evidence.

Protected unrelated workspace files must never be staged: `overlay/cv重做.md` and `overlay/prompt.md`.

### Task 1: Define the strict independent hand-structure V2 contract

**Files:**
- Create: `coach/packages/contracts/src/hand-structure.ts`
- Create: `coach/packages/contracts/tests/hand-structure.test.ts`
- Modify: `coach/packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing contract tests**

Create tests that import the not-yet-existing schemas and prove strictness, ordering and cross-field invariants:

```ts
import { describe, expect, it } from "vitest";
import {
  HAND_STRUCTURE_SCHEMA_VERSION,
  HandStructureRequestV2Schema,
  HandStructureResultV2Schema,
  type HandStructureRequestV2,
  type HandStructureResultV2,
} from "../src/hand-structure.js";

const zeroes = Array<number>(34).fill(0);

function request(): HandStructureRequestV2 {
  const hand = [...zeroes];
  [0, 1, 2, 9, 10, 11, 18, 19, 20, 24, 25, 27, 27]
    .forEach((tile) => hand[tile]++);
  return {
    kind: "hand_structure" as const,
    schemaVersion: HAND_STRUCTURE_SCHEMA_VERSION,
    requestId: "request:shape",
    protocolVersion: "mahjong-facts/v1" as const,
    actionRef: "action:v1:discard:9s:normal:tedashi",
    stateHash: "sha256:shape",
    handTiles34: hand,
    melds: [],
    leftTiles34: null,
    visibleCountsComplete: false,
    ronContext: "unknown_future" as const,
    yakuContext: {
      windsStatus: "known" as const,
      roundWindTile34: 27,
      selfWindTile34: 28,
      riichiStatus: "inactive" as const,
      openTanyaoStatus: "enabled" as const,
    },
  };
}

function result(): HandStructureResultV2 {
  return {
    kind: "hand_structure_result",
    schemaVersion: HAND_STRUCTURE_SCHEMA_VERSION,
    requestId: "request:shape",
    protocolVersion: "mahjong-facts/v1",
    actionRef: "action:v1:discard:9s:normal:tedashi",
    stateHash: "sha256:shape",
    identity: {
      engine: "mahjong-helper",
      upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
      adapterVersion: "0.1.0",
      protocolVersion: "mahjong-facts/v1",
    },
    overallShanten: 0,
    bestFamilies: ["standard"],
    families: [
      {
        family: "standard",
        applicability: "applicable",
        shanten: 0,
        effectiveTiles: [
          { tile34: 23, remainingStatus: "blocked_missing_facts", remaining: null },
          { tile34: 26, remainingStatus: "blocked_missing_facts", remaining: null },
        ],
      },
      {
        family: "chiitoitsu",
        applicability: "applicable",
        shanten: 5,
        effectiveTiles: [],
      },
      {
        family: "kokushi",
        applicability: "applicable",
        shanten: 8,
        effectiveTiles: [],
      },
    ],
    decompositions: {
      status: "calculated",
      totalNonDominated: 1,
      truncated: false,
      items: [{
        decompositionRef: "standard:abc",
        family: "standard",
        shanten: 0,
        groups: [
          { kind: "sequence", tiles34: [0, 1, 2] },
          { kind: "pair_candidate", tiles34: [27, 27] },
        ],
      }],
      invariantClaims: [
        { kind: "sequence", tiles34: [0, 1, 2] },
        { kind: "pair_candidate", tiles34: [27, 27] },
      ],
      alternativeClaims: [],
    },
    waits: [
      {
        tile34: 23,
        families: ["standard"],
        waitTypes: ["ryanmen"],
        remainingStatus: "blocked_missing_facts",
        remaining: null,
        baseRonEligibility: "unknown_missing_situational_yaku_context",
        decompositionRefs: ["standard:abc"],
      },
    ],
    diagnostics: [],
  };
}

describe("hand-structure/v2 contracts", () => {
  it("accepts a strict independent request", () => {
    expect(HandStructureRequestV2Schema.parse(request()).schemaVersion)
      .toBe("hand-structure/v2");
    expect(() => HandStructureRequestV2Schema.parse({ ...request(), extra: true }))
      .toThrow();
  });

  it("requires family order and exact best-family minima", () => {
    expect(HandStructureResultV2Schema.parse(result()).bestFamilies)
      .toEqual(["standard"]);
    const reversed = result();
    reversed.families = [
      reversed.families[2],
      reversed.families[1],
      reversed.families[0],
    ];
    expect(() => HandStructureResultV2Schema.parse(reversed)).toThrow();
    const falseBest = result();
    falseBest.bestFamilies = ["chiitoitsu"];
    expect(() => HandStructureResultV2Schema.parse(falseBest)).toThrow();
  });

  it("rejects wrong concealed counts, unsorted waits and false truncation", () => {
    const open = request();
    open.melds = [{ kind: "pon", tiles34: [31, 31, 31] }];
    expect(HandStructureRequestV2Schema.safeParse(open).success).toBe(false);
    const unsorted = result();
    unsorted.waits = [
      { ...unsorted.waits[0]!, tile34: 26 },
      { ...unsorted.waits[0]!, tile34: 23 },
    ];
    expect(() => HandStructureResultV2Schema.parse(unsorted)).toThrow();
    const falseTruncation = result();
    falseTruncation.decompositions.truncated = true;
    expect(() => HandStructureResultV2Schema.parse(falseTruncation)).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```powershell
cd coach
npx vitest run packages/contracts/tests/hand-structure.test.ts
```

Expected: FAIL because `../src/hand-structure.js` does not exist.

- [ ] **Step 3: Implement the V2 schemas**

Create `hand-structure.ts` with these public values and exact unions:

```ts
import { z } from "zod";
import { ActionRefSchema } from "./comparison.js";
import {
  EngineIdentitySchema,
  FACT_ENGINE_PROTOCOL_VERSION,
  Tile34CountsSchema,
} from "./fact-engine.js";
import { FuritenStateV2Schema } from "./round-state.js";

export const HAND_STRUCTURE_SCHEMA_VERSION = "hand-structure/v2" as const;
export const MAX_NON_DOMINATED_DECOMPOSITIONS = 64 as const;

const Tile34Schema = z.number().int().min(0).max(33);
const FamilySchema = z.enum(["standard", "chiitoitsu", "kokushi"]);
export type HandFamily = z.infer<typeof FamilySchema>;

export const YakuContextV2Schema = z.object({
  windsStatus: z.enum(["known", "unknown"]),
  roundWindTile34: z.number().int().min(27).max(29).nullable(),
  selfWindTile34: z.number().int().min(27).max(30).nullable(),
  riichiStatus: z.enum(["accepted", "inactive", "unknown"]),
  openTanyaoStatus: z.enum(["enabled", "disabled", "unknown"]),
}).strict().superRefine((value, context) => {
  const bothKnown = value.roundWindTile34 !== null && value.selfWindTile34 !== null;
  const bothNull = value.roundWindTile34 === null && value.selfWindTile34 === null;
  if (value.windsStatus === "known" && !bothKnown) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Known winds require both values" });
  }
  if (value.windsStatus === "unknown" && !bothNull) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Unknown winds require null values" });
  }
});

const MeldSchema = z.object({
  kind: z.enum(["chi", "pon", "daiminkan", "ankan", "kakan"]),
  tiles34: z.array(Tile34Schema).min(3).max(4),
}).strict().superRefine((meld, context) => {
  const expected = meld.kind === "chi" || meld.kind === "pon" ? 3 : 4;
  if (meld.tiles34.length !== expected) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `${meld.kind} requires ${expected} tiles` });
    return;
  }
  const sorted = [...meld.tiles34].sort((left, right) => left - right);
  if (meld.kind === "chi") {
    if (
      sorted[0]! >= 27 ||
      Math.floor(sorted[0]! / 9) !== Math.floor(sorted[2]! / 9) ||
      sorted[1] !== sorted[0]! + 1 ||
      sorted[2] !== sorted[1]! + 1
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Chi must be one suited sequence" });
    }
  } else if (sorted.some((tile) => tile !== sorted[0])) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `${meld.kind} tiles must match` });
  }
});

export const HandStructureRequestV2Schema = z.object({
  kind: z.literal("hand_structure"),
  schemaVersion: z.literal(HAND_STRUCTURE_SCHEMA_VERSION),
  requestId: z.string().min(1),
  protocolVersion: z.literal(FACT_ENGINE_PROTOCOL_VERSION),
  actionRef: ActionRefSchema,
  stateHash: z.string().min(1),
  handTiles34: Tile34CountsSchema,
  melds: z.array(MeldSchema),
  leftTiles34: Tile34CountsSchema.nullable(),
  visibleCountsComplete: z.boolean(),
  ronContext: z.enum([
    "complete_none",
    "known_kakan_chankan",
    "known_ankan_chankan",
    "known_houtei",
    "unknown_future",
  ]),
  yakuContext: YakuContextV2Schema,
}).strict().superRefine((request, context) => {
  const concealed = request.handTiles34.reduce((sum, count) => sum + count, 0);
  const expected = 13 - request.melds.length * 3;
  if (concealed !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Hand structure requires ${expected} concealed tiles`,
      path: ["handTiles34"],
    });
  }
  if (request.visibleCountsComplete !== (request.leftTiles34 !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Visibility completeness must agree with leftTiles34",
      path: ["leftTiles34"],
    });
  }
  const owned = [...request.handTiles34];
  for (const meld of request.melds) {
    for (const tile of meld.tiles34) owned[tile] = owned[tile]! + 1;
  }
  owned.forEach((count, tile34) => {
    if (count > 4) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Owned tile count cannot exceed four",
        path: ["handTiles34", tile34],
      });
    }
  });
  if (
    request.yakuContext.riichiStatus === "accepted" &&
    request.melds.some((meld) => meld.kind !== "ankan")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Accepted riichi is incompatible with an open meld",
      path: ["yakuContext", "riichiStatus"],
    });
  }
});
export type HandStructureRequestV2 = z.infer<typeof HandStructureRequestV2Schema>;

const EffectiveTileSchema = z.object({
  tile34: Tile34Schema,
  remainingStatus: z.enum(["calculated", "blocked_missing_facts"]),
  remaining: z.number().int().min(0).max(4).nullable(),
}).strict().superRefine((tile, context) => {
  if ((tile.remainingStatus === "calculated") !== (tile.remaining !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Remaining status/value mismatch" });
  }
});

const FamilyResultSchema = z.object({
  family: FamilySchema,
  applicability: z.enum(["applicable", "not_applicable_open_hand"]),
  shanten: z.number().int().min(-1).max(13).nullable(),
  effectiveTiles: z.array(EffectiveTileSchema),
}).strict().superRefine((family, context) => {
  const applicable = family.applicability === "applicable";
  if (applicable !== (family.shanten !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Applicability/shanten mismatch" });
  }
  if (!applicable && family.effectiveTiles.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Inapplicable family cannot have effective tiles" });
  }
  const ids = family.effectiveTiles.map((tile) => tile.tile34);
  if (ids.some((id, index) => index > 0 && id <= ids[index - 1]!)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Effective tiles must be strictly sorted" });
  }
});

const ShapeGroupSchema = z.object({
  kind: z.enum([
    "sequence", "triplet", "pair_candidate", "ryanmen_taatsu",
    "kanchan_taatsu", "penchan_taatsu", "floating",
  ]),
  tiles34: z.array(Tile34Schema).min(1).max(3),
}).strict();
export type ShapeGroupV2 = z.infer<typeof ShapeGroupSchema>;

const DecompositionSchema = z.object({
  decompositionRef: z.string().min(1),
  family: FamilySchema,
  shanten: z.number().int().min(-1).max(13),
  groups: z.array(ShapeGroupSchema),
}).strict();

const AlternativeClaimSchema = ShapeGroupSchema.extend({
  decompositionRefs: z.array(z.string().min(1)).min(1),
}).strict();

const DecompositionSetSchema = z.object({
  status: z.enum(["calculated", "blocked_engine_failure"]),
  totalNonDominated: z.number().int().nonnegative(),
  truncated: z.boolean(),
  items: z.array(DecompositionSchema).max(MAX_NON_DOMINATED_DECOMPOSITIONS),
  invariantClaims: z.array(ShapeGroupSchema),
  alternativeClaims: z.array(AlternativeClaimSchema),
}).strict().superRefine((set, context) => {
  if (set.truncated !== (set.totalNonDominated > set.items.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Truncation must reflect omitted non-dominated decompositions" });
  }
  const refs = set.items.map((item) => item.decompositionRef);
  if (new Set(refs).size !== refs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Decomposition refs must be unique" });
  }
});

const WaitSchema = z.object({
  tile34: Tile34Schema,
  families: z.array(FamilySchema).min(1),
  waitTypes: z.array(z.enum([
    "ryanmen", "kanchan", "penchan", "shanpon", "tanki",
    "kokushi_single", "kokushi_thirteen_sided",
  ])).min(1),
  remainingStatus: z.enum(["calculated", "blocked_missing_facts"]),
  remaining: z.number().int().min(0).max(4).nullable(),
  baseRonEligibility: z.enum([
    "eligible", "ineligible", "unknown_missing_situational_yaku_context",
  ]),
  decompositionRefs: z.array(z.string().min(1)),
}).strict().superRefine((wait, context) => {
  if ((wait.remainingStatus === "calculated") !== (wait.remaining !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Wait remaining status/value mismatch" });
  }
});

export const HandStructureResultV2Schema = z.object({
  kind: z.literal("hand_structure_result"),
  schemaVersion: z.literal(HAND_STRUCTURE_SCHEMA_VERSION),
  requestId: z.string().min(1),
  protocolVersion: z.literal(FACT_ENGINE_PROTOCOL_VERSION),
  actionRef: ActionRefSchema,
  stateHash: z.string().min(1),
  identity: EngineIdentitySchema,
  overallShanten: z.number().int().min(-1).max(13),
  bestFamilies: z.array(FamilySchema).min(1),
  families: z.tuple([FamilyResultSchema, FamilyResultSchema, FamilyResultSchema]),
  decompositions: DecompositionSetSchema,
  waits: z.array(WaitSchema),
  diagnostics: z.array(z.enum([
    "truncated_non_dominated_decompositions",
    "ron_eligibility_missing_situational_context",
  ])),
}).strict().superRefine((result, context) => {
  const expectedFamilies = ["standard", "chiitoitsu", "kokushi"];
  if (result.families.some((family, index) => family.family !== expectedFamilies[index])) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Families must use canonical order", path: ["families"] });
  }
  const applicable = result.families.filter((family) => family.shanten !== null);
  const minimum = Math.min(...applicable.map((family) => family.shanten!));
  const best = applicable.filter((family) => family.shanten === minimum).map((family) => family.family);
  if (result.overallShanten !== minimum || JSON.stringify(result.bestFamilies) !== JSON.stringify(best)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Overall shanten and best families must equal family minima" });
  }
  const waitIds = result.waits.map((wait) => wait.tile34);
  if (waitIds.some((id, index) => index > 0 && id <= waitIds[index - 1]!)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Waits must be strictly sorted", path: ["waits"] });
  }
});
export type HandStructureResultV2 = z.infer<typeof HandStructureResultV2Schema>;

export const MergedHandFuritenV2Schema = z.object({
  hand: HandStructureResultV2Schema,
  furiten: FuritenStateV2Schema,
  ronEligibilityStatus: z.enum(["calculated", "unknown_missing_facts"]),
  ronEligibleWaits34: z.array(Tile34Schema),
}).strict().superRefine((value, context) => {
  if (value.ronEligibilityStatus === "unknown_missing_facts" && value.ronEligibleWaits34.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Unknown final ron eligibility cannot claim eligible waits" });
  }
});
export type MergedHandFuritenV2 = z.infer<typeof MergedHandFuritenV2Schema>;
```

Append exactly this export to `contracts/src/index.ts`:

```ts
export * from "./hand-structure.js";
```

- [ ] **Step 4: Run focused tests and typecheck to verify GREEN**

Run:

```powershell
cd coach
npx vitest run packages/contracts/tests/hand-structure.test.ts packages/contracts/tests/fact-engine.test.ts packages/contracts/tests/round-state.test.ts
npm run typecheck
```

Expected: all focused tests PASS and both TypeScript projects typecheck.

- [ ] **Step 5: Commit**

```powershell
git add coach/packages/contracts/src/hand-structure.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/hand-structure.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: define hand structure v2 contracts"
```

### Task 2: Implement family-specific shanten and effective tiles in Go

**Files:**
- Create: `coach/tools/mahjong-facts/hand_structure.go`
- Create: `coach/tools/mahjong-facts/hand_structure_test.go`

- [ ] **Step 1: Write failing family tests**

Cover these exact cases in table tests:

```go
func counts34(tiles ...int) []int {
	counts := make([]int, 34)
	for _, tile := range tiles { counts[tile]++ }
	return counts
}

func TestFamilyShantenClosedHands(t *testing.T) {
	tests := []struct {
		name string
		tiles []int
		wantNormal int
		wantChiitoi int
		wantKokushi int
	}{
		{"standard tenpai", counts34(0,1,2,9,10,11,18,19,20,24,25,27,27), 0, 5, 8},
		{"chiitoitsu tenpai", counts34(0,0,8,8,9,9,17,17,18,18,26,26,27), 3, 0, 6},
		{"kokushi thirteen sided", counts34(0,8,9,17,18,26,27,28,29,30,31,32,33), 8, 6, 0},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := calculateFamilyShanten(test.tiles, 0)
			if got.Standard != test.wantNormal || *got.Chiitoitsu != test.wantChiitoi || *got.Kokushi != test.wantKokushi {
				t.Fatalf("family shanten = %#v", got)
			}
		})
	}
}

func TestOpenHandMakesSpecialFamiliesNotApplicable(t *testing.T) {
	got := calculateFamilyShanten(counts34(0,1,2,9,10,11,18,19,20,27), 1)
	if got.Chiitoitsu != nil || got.Kokushi != nil {
		t.Fatalf("open special families must be nil: %#v", got)
	}
}

func TestEffectiveTilesAreFamilySpecificAndSorted(t *testing.T) {
	hand := counts34(0,8,9,17,18,26,27,28,29,30,31,32,33)
	got := effectiveTilesForFamily(hand, 0, "kokushi")
	want := []int{0,8,9,17,18,26,27,28,29,30,31,32,33}
	if !reflect.DeepEqual(got, want) { t.Fatalf("kokushi effective = %v, want %v", got, want) }
}
```

Add strict request validation tests for concealed count `13 - 3*meldCount`, 34 counts, physical count over four, and `leftTiles34` completeness mismatch.

- [ ] **Step 2: Run Go tests to verify RED**

Run:

```powershell
cd coach/tools/mahjong-facts
go test ./... -run 'TestFamilyShanten|TestOpenHand|TestEffectiveTiles|TestValidateHandStructure' -count=1
```

Expected: FAIL because the V2 functions/types do not exist.

- [ ] **Step 3: Implement the family engine and strict DTOs**

Use the existing `RequestBase`, `MeldInput`, `validateCounts34`, and `engineIdentity`. The core calculation must be exactly:

```go
var kokushiTiles34 = [...]int{0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33}

func countTiles(tiles []int) int {
	total := 0
	for _, count := range tiles { total += count }
	return total
}

type familyShanten struct {
	Standard int
	Chiitoitsu *int
	Kokushi *int
}

func kokushiShanten(tiles []int) int {
	unique := 0
	hasPair := 0
	for _, tile := range kokushiTiles34 {
		if tiles[tile] > 0 { unique++ }
		if tiles[tile] > 1 { hasPair = 1 }
	}
	return 13 - unique - hasPair
}

func calculateFamilyShanten(tiles []int, meldCount int) familyShanten {
	copyForNormal := cloneInts(tiles)
	standard := util.CalculateShantenOfNormal(copyForNormal, countTiles(tiles))
	result := familyShanten{Standard: standard}
	if meldCount == 0 {
		copyForChiitoi := cloneInts(tiles)
		chiitoi := util.CalculateShantenOfChiitoi(copyForChiitoi)
		kokushi := kokushiShanten(tiles)
		result.Chiitoitsu = &chiitoi
		result.Kokushi = &kokushi
	}
	return result
}

func shantenForFamily(tiles []int, meldCount int, family string) *int {
	all := calculateFamilyShanten(tiles, meldCount)
	switch family {
	case "standard": return &all.Standard
	case "chiitoitsu": return all.Chiitoitsu
	case "kokushi": return all.Kokushi
	default: panic("validated family required")
	}
}

func effectiveTilesForFamily(tiles []int, meldCount int, family string) []int {
	base := shantenForFamily(tiles, meldCount, family)
	if base == nil { return []int{} }
	result := []int{}
	for tile := 0; tile < 34; tile++ {
		if tiles[tile] == 4 { continue }
		next := cloneInts(tiles)
		next[tile]++
		after := shantenForFamily(next, meldCount, family)
		if after != nil && *after < *base { result = append(result, tile) }
	}
	return result
}
```

Define the request/result DTOs with these exact JSON fields (the decomposition and wait DTOs are completed in Tasks 3 and 4):

```go
const handStructureSchemaVersion = "hand-structure/v2"

type HandStructureRequestV2 struct {
	RequestBase
	SchemaVersion string `json:"schemaVersion"`
	HandTiles34 []int `json:"handTiles34"`
	Melds []MeldInput `json:"melds"`
	LeftTiles34 []int `json:"leftTiles34"`
	VisibleCountsComplete bool `json:"visibleCountsComplete"`
	RonContext string `json:"ronContext"`
	YakuContext YakuContextV2 `json:"yakuContext"`
}

type YakuContextV2 struct {
	WindsStatus string `json:"windsStatus"`
	RoundWindTile34 *int `json:"roundWindTile34"`
	SelfWindTile34 *int `json:"selfWindTile34"`
	RiichiStatus string `json:"riichiStatus"`
	OpenTanyaoStatus string `json:"openTanyaoStatus"`
}

type EffectiveTileV2 struct {
	Tile34 int `json:"tile34"`
	RemainingStatus string `json:"remainingStatus"`
	Remaining *int `json:"remaining"`
}

type HandFamilyResultV2 struct {
	Family string `json:"family"`
	Applicability string `json:"applicability"`
	Shanten *int `json:"shanten"`
	EffectiveTiles []EffectiveTileV2 `json:"effectiveTiles"`
}

type ShapeGroup struct {
	Kind string `json:"kind"`
	Tiles34 []int `json:"tiles34"`
}

type DecompositionV2 struct {
	DecompositionRef string `json:"decompositionRef"`
	Family string `json:"family"`
	Shanten int `json:"shanten"`
	Groups []ShapeGroup `json:"groups"`
}

type AlternativeClaimV2 struct {
	Kind string `json:"kind"`
	Tiles34 []int `json:"tiles34"`
	DecompositionRefs []string `json:"decompositionRefs"`
}

type DecompositionSetV2 struct {
	Status string `json:"status"`
	TotalNonDominated int `json:"totalNonDominated"`
	Truncated bool `json:"truncated"`
	Items []DecompositionV2 `json:"items"`
	InvariantClaims []ShapeGroup `json:"invariantClaims"`
	AlternativeClaims []AlternativeClaimV2 `json:"alternativeClaims"`
}

type WaitV2 struct {
	Tile34 int `json:"tile34"`
	Families []string `json:"families"`
	WaitTypes []string `json:"waitTypes"`
	RemainingStatus string `json:"remainingStatus"`
	Remaining *int `json:"remaining"`
	BaseRonEligibility string `json:"baseRonEligibility"`
	DecompositionRefs []string `json:"decompositionRefs"`
}

type HandStructureResultV2 struct {
	Kind string `json:"kind"`
	SchemaVersion string `json:"schemaVersion"`
	RequestID string `json:"requestId"`
	ProtocolVersion string `json:"protocolVersion"`
	ActionRef string `json:"actionRef"`
	StateHash string `json:"stateHash"`
	Identity EngineIdentity `json:"identity"`
	OverallShanten int `json:"overallShanten"`
	BestFamilies []string `json:"bestFamilies"`
	Families []HandFamilyResultV2 `json:"families"`
	Decompositions DecompositionSetV2 `json:"decompositions"`
	Waits []WaitV2 `json:"waits"`
	Diagnostics []string `json:"diagnostics"`
}
```

`YakuContextV2.UnmarshalJSON` must use a no-method alias through `strictDecode` plus `requireJSONFields`, so nested unknown fields and every missing subfield fail before analysis. Direct struct validation must enforce the same invariants: known winds require both non-null values, unknown winds require both null, wind ranges are exact, status values are closed, and `riichiStatus: accepted` conflicts with every open meld except `ankan`.

`validateHandStructureRequest` must reject wrong kind/schema, nil meld array, wrong concealed count, impossible ownership, inconsistent visibility, missing/invalid `yakuContext`, and any `ronContext` outside the five contract values. `analyzeHandStructure` must always return family entries in `standard, chiitoitsu, kokushi` order and effective tiles in ascending Tile34 order. Remaining counts come from `LeftTiles34` only when visibility is complete; otherwise use `blocked_missing_facts` and JSON `null`.

- [ ] **Step 4: Run focused Go tests to verify GREEN**

```powershell
cd coach/tools/mahjong-facts
go test ./... -run 'TestFamilyShanten|TestOpenHand|TestEffectiveTiles|TestValidateHandStructure' -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add coach/tools/mahjong-facts/hand_structure.go coach/tools/mahjong-facts/hand_structure_test.go
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: calculate hand family shanten"
```

### Task 3: Implement exhaustive non-dominated incomplete-hand decompositions

**Files:**
- Create: `coach/tools/mahjong-facts/hand_decomposition.go`
- Create: `coach/tools/mahjong-facts/hand_decomposition_test.go`
- Modify: `coach/tools/mahjong-facts/hand_structure.go`

- [ ] **Step 1: Write failing decomposition tests**

Tests must prove:

1. `112233m` retains both sequence-heavy and pair-heavy exact-minimum alternatives;
2. `456789s` is retained as two completed sequences, so a downstream coach cannot call 6s a redundant efficiency tile;
3. duplicate recursion paths collapse to one stable `decompositionRef`;
4. input mutation and repeated runs produce byte-identical sorted output;
5. more than 64 non-dominated results returns 64 items, the true total, `truncated=true`, and the diagnostic.

Use this invariant assertion for the motivating shape:

```go
func TestDecompositionPreserves456789sAsTwoMelds(t *testing.T) {
	results := nonDominatedStandardDecompositions(counts34(3,4,5,6,7,8,27,27,31,31,32,32,33), 0)
	wantA := ShapeGroup{Kind: "sequence", Tiles34: []int{3,4,5}}
	wantB := ShapeGroup{Kind: "sequence", Tiles34: []int{6,7,8}}
	found := false
	for _, result := range results {
		if containsGroup(result.Groups, wantA) && containsGroup(result.Groups, wantB) { found = true }
	}
	if !found { t.Fatal("no non-dominated decomposition preserved both 456s and 789s") }
}
```

- [ ] **Step 2: Run tests to verify RED**

```powershell
cd coach/tools/mahjong-facts
go test ./... -run 'TestDecomposition|TestNonDominated|TestTruncated' -count=1
```

Expected: FAIL because the decomposition module does not exist.

- [ ] **Step 3: Implement exhaustive enumeration and explicit Pareto filtering**

Use a recursion that always branches on the first non-zero tile, trying every physically valid triplet, sequence, pair candidate, adjacent taatsu, gapped taatsu, and singleton. Canonicalize every completed partition by group kind and Tile34 values before hashing.

The exact standard-hand score and dominance rules are:

```go
type DecompositionMetrics struct {
	Shanten int
	CompleteMelds int
	UsableTaatsu int
	HasHead int
	FloatingTiles int
}

func decompositionMetrics(groups []ShapeGroup, openMelds int) DecompositionMetrics {
	complete, pairs, taatsu, floating := 0, 0, 0, 0
	for _, group := range groups {
		switch group.Kind {
		case "sequence", "triplet": complete++
		case "pair_candidate": pairs++
		case "ryanmen_taatsu", "kanchan_taatsu", "penchan_taatsu": taatsu++
		case "floating": floating++
		}
	}
	hasHead := 0
	if pairs > 0 { hasHead = 1 }
	usableSlots := 4 - openMelds - complete
	if usableSlots < 0 { usableSlots = 0 }
	usableTaatsu := taatsu + pairs - hasHead
	if usableTaatsu > usableSlots { usableTaatsu = usableSlots }
	shanten := 8 - 2*(openMelds+complete) - usableTaatsu - hasHead
	return DecompositionMetrics{
		Shanten: shanten,
		CompleteMelds: complete,
		UsableTaatsu: usableTaatsu,
		HasHead: hasHead,
		FloatingTiles: floating,
	}
}

func dominates(a, b DecompositionMetrics) bool {
	if a.Shanten != b.Shanten { return a.Shanten < b.Shanten }
	noWorse := a.CompleteMelds >= b.CompleteMelds &&
		a.UsableTaatsu >= b.UsableTaatsu &&
		a.HasHead >= b.HasHead &&
		a.FloatingTiles <= b.FloatingTiles
	strict := a.CompleteMelds > b.CompleteMelds ||
		a.UsableTaatsu > b.UsableTaatsu ||
		a.HasHead > b.HasHead ||
		a.FloatingTiles < b.FloatingTiles
	return noWorse && strict
}
```

The recursion itself must use this complete branch set; `appendGroup` copies both the group slice and tile slice so no result aliases mutable recursion state:

```go
func appendGroup(groups []ShapeGroup, kind string, tiles ...int) []ShapeGroup {
	next := make([]ShapeGroup, len(groups), len(groups)+1)
	copy(next, groups)
	next = append(next, ShapeGroup{Kind: kind, Tiles34: cloneInts(tiles)})
	return next
}

func enumerateStandardPartitions(counts []int, groups []ShapeGroup, out *[][]ShapeGroup) {
	first := -1
	for tile, count := range counts {
		if count > 0 { first = tile; break }
	}
	if first < 0 {
		copyGroups := make([]ShapeGroup, len(groups))
		for index, group := range groups {
			copyGroups[index] = ShapeGroup{Kind: group.Kind, Tiles34: cloneInts(group.Tiles34)}
		}
		*out = append(*out, copyGroups)
		return
	}

	consume := func(kind string, tiles ...int) {
		for _, tile := range tiles { counts[tile]-- }
		enumerateStandardPartitions(counts, appendGroup(groups, kind, tiles...), out)
		for _, tile := range tiles { counts[tile]++ }
	}

	if counts[first] >= 3 { consume("triplet", first, first, first) }
	rank := first % 9
	if first < 27 && rank <= 6 && counts[first+1] > 0 && counts[first+2] > 0 {
		consume("sequence", first, first+1, first+2)
	}
	if counts[first] >= 2 { consume("pair_candidate", first, first) }
	if first < 27 && rank <= 7 && counts[first+1] > 0 {
		kind := "ryanmen_taatsu"
		if rank == 0 || rank == 7 { kind = "penchan_taatsu" }
		consume(kind, first, first+1)
	}
	if first < 27 && rank <= 6 && counts[first+2] > 0 {
		consume("kanchan_taatsu", first, first+2)
	}
	consume("floating", first)
}

func canonicalizeGroups(groups []ShapeGroup) []ShapeGroup {
	copyGroups := make([]ShapeGroup, len(groups))
	for index, group := range groups {
		tiles := cloneInts(group.Tiles34)
		sort.Ints(tiles)
		copyGroups[index] = ShapeGroup{Kind: group.Kind, Tiles34: tiles}
	}
	sort.Slice(copyGroups, func(i, j int) bool {
		left := claimKey(copyGroups[i])
		right := claimKey(copyGroups[j])
		return left < right
	})
	return copyGroups
}

func claimKey(group ShapeGroup) string {
	parts := make([]string, len(group.Tiles34))
	for index, tile := range group.Tiles34 { parts[index] = strconv.Itoa(tile) }
	return group.Kind + ":" + strings.Join(parts, ",")
}

func partitionKey(groups []ShapeGroup) string {
	parts := make([]string, len(groups))
	for index, group := range groups { parts[index] = claimKey(group) }
	return strings.Join(parts, "|")
}

func nonDominatedStandardDecompositions(tiles []int, openMelds int) []DecompositionV2 {
	partitions := [][]ShapeGroup{}
	enumerateStandardPartitions(cloneInts(tiles), nil, &partitions)
	target := util.CalculateShantenOfNormal(cloneInts(tiles), countTiles(tiles))
	unique := map[string][]ShapeGroup{}
	for _, partition := range partitions {
		canonical := canonicalizeGroups(partition)
		if decompositionMetrics(canonical, openMelds).Shanten == target {
			unique[partitionKey(canonical)] = canonical
		}
	}
	keys := make([]string, 0, len(unique))
	for key := range unique { keys = append(keys, key) }
	sort.Strings(keys)
	kept := []string{}
	for _, candidate := range keys {
		candidateMetrics := decompositionMetrics(unique[candidate], openMelds)
		dominated := false
		for _, other := range keys {
			if candidate == other { continue }
			if dominates(decompositionMetrics(unique[other], openMelds), candidateMetrics) {
				dominated = true
				break
			}
		}
		if !dominated { kept = append(kept, candidate) }
	}
	results := make([]DecompositionV2, 0, len(kept))
	for _, key := range kept {
		digest := sha256.Sum256([]byte(key))
		results = append(results, DecompositionV2{
			DecompositionRef: "standard:" + hex.EncodeToString(digest[:8]),
			Family: "standard",
			Shanten: target,
			Groups: unique[key],
		})
	}
	return results
}
```

Before Pareto comparison, discard every partition whose computed shanten differs from `CalculateShantenOfNormal`. This helper equality is a hard oracle and prevents the local decomposition formula from becoming a second shanten implementation.

Generate claim keys as `kind:comma-separated-tile34`, compute `invariantClaims` by set intersection across every non-dominated result before truncation, and compute `alternativeClaims` from every non-universal claim with its sorted supporting decomposition refs. Sort final decompositions by their canonical serialized groups, assign `standard:sha256-prefix` refs, compute all claims from the full set, then return only the first 64 raw decompositions. Never compute invariants from the truncated subset.

For a best chiitoitsu family, synthesize one deterministic decomposition containing one `pair_candidate` per first two copies and one `floating` group per remaining tile copy. For a best kokushi family, synthesize terminal/honor pair candidates and floating terminal/honor tiles, plus non-terminal floating tiles. Prefix refs with `chiitoitsu:` or `kokushi:`. Include decompositions for every family tied at `overallShanten`, then apply the global stable 64-item cap.

- [ ] **Step 4: Run decomposition and family tests to verify GREEN**

```powershell
cd coach/tools/mahjong-facts
go test ./... -run 'TestDecomposition|TestNonDominated|TestTruncated|TestFamilyShanten' -count=1
```

Expected: PASS with deterministic output under `-count=20` as well.

- [ ] **Step 5: Commit**

```powershell
git add coach/tools/mahjong-facts/hand_decomposition.go coach/tools/mahjong-facts/hand_decomposition_test.go coach/tools/mahjong-facts/hand_structure.go
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: derive non-dominated hand shapes"
```

### Task 4: Derive typed waits and conservative ron eligibility

**Files:**
- Create: `coach/tools/mahjong-facts/hand_waits.go`
- Create: `coach/tools/mahjong-facts/hand_waits_test.go`
- Modify: `coach/tools/mahjong-facts/hand_structure.go`

- [ ] **Step 1: Write failing wait tests**

Add table cases for `ryanmen`, `kanchan`, both `penchan` orientations, `shanpon`, `tanki`, a tile with multiple labels across divisions, chiitoitsu tanki, kokushi single wait, and kokushi thirteen-sided wait. Assert that labels, families and decomposition refs are sorted/deduplicated.

Add eligibility cases:

```go
func TestRonEligibilityIsConservative(t *testing.T) {
	known := knownNoYakuContext()
	if got := baseRonEligibility(yakuHandPlayer(), known, "complete_none", false); got != "eligible" {
		t.Fatalf("known yaku = %q", got)
	}
	if got := baseRonEligibility(noYakuPlayer(), known, "complete_none", false); got != "ineligible" {
		t.Fatalf("complete no-yaku context = %q", got)
	}
	unknown := known
	unknown.RiichiStatus = "unknown"
	if got := baseRonEligibility(noYakuPlayer(), unknown, "complete_none", false); got != "unknown_missing_situational_yaku_context" {
		t.Fatalf("unknown riichi context = %q", got)
	}
	if got := baseRonEligibility(noYakuPlayer(), known, "unknown_future", false); got != "unknown_missing_situational_yaku_context" {
		t.Fatalf("future context = %q", got)
	}
	if got := baseRonEligibility(noYakuPlayer(), known, "known_kakan_chankan", false); got != "eligible" {
		t.Fatalf("kakan chankan supplies yaku = %q", got)
	}
	if got := baseRonEligibility(noYakuPlayer(), known, "known_ankan_chankan", false); got != "ineligible" {
		t.Fatalf("ankan cannot supply generic chankan = %q", got)
	}
	if got := baseRonEligibility(nil, known, "known_ankan_chankan", true); got != "eligible" {
		t.Fatalf("kokushi proves yakuman = %q", got)
	}
}
```

- [ ] **Step 2: Run wait tests to verify RED**

```powershell
cd coach/tools/mahjong-facts
go test ./... -run 'TestWait|TestComposite|TestKokushi|TestRonEligibility' -count=1
```

Expected: FAIL because wait derivation does not exist.

- [ ] **Step 3: Implement labels from every completed division**

For every family effective tile when family shanten is zero, add that tile to a cloned hand. For normal and chiitoitsu call `util.DivideTiles34`; for each division that contains the winning tile, apply these exact rules:

```go
func sequenceWaitType(first, win int) string {
	position := win - first
	if position == 1 { return "kanchan" }
	if position == 2 && first%9 == 0 { return "penchan" }
	if position == 0 && first%9 == 6 { return "penchan" }
	return "ryanmen"
}
```

- Pair uses the winning tile and the pre-add count was one: `tanki`.
- Triplet uses the winning tile and the pre-add count was two: `shanpon`.
- Chiitoitsu division: `tanki`.
- Kokushi with 13 unique terminals/honors before the add: `kokushi_thirteen_sided`; otherwise `kokushi_single`.

Union every label from every division and never select one preferred label.

Construct a `model.PlayerInfo` for normal/chiitoitsu completed hands and call `util.CalcPoint`, but never fill missing request facts with one preferred default. Expand `windsStatus: unknown`, `riichiStatus: unknown`, and `openTanyaoStatus: unknown` into every compatible finite context accepted by helper. Evaluate each completion with the same completed hand: all positive results prove `eligible`; all zero results prove `ineligible`; mixed results are `unknown_missing_situational_yaku_context`. A known baseline yaku may prove eligibility even if an unrelated field is unknown, but uncertainty that can change the outcome must remain unknown.

Kokushi proves `eligible` locally. `known_kakan_chankan` and `known_houtei` supply a situational yaku. `known_ankan_chankan` never supplies a generic chankan yaku and is eligible only for the already-proven kokushi path. `complete_none` supplies no situational yaku; `unknown_future` remains unknown unless the hand already has a context-independent proven yaku. Dora alone must not change eligibility. Tests must include unknown wind, unknown riichi, unknown open-tanyao, accepted riichi, disabled open tanyao, and a context-independent yaku so both unanimous and mixed completion cases are locked down.

- [ ] **Step 4: Run all Go hand-analysis tests to verify GREEN**

```powershell
cd coach/tools/mahjong-facts
go test ./... -run 'TestFamily|TestEffective|TestDecomposition|TestNonDominated|TestTruncated|TestWait|TestComposite|TestKokushi|TestRonEligibility' -count=1
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add coach/tools/mahjong-facts/hand_waits.go coach/tools/mahjong-facts/hand_waits_test.go coach/tools/mahjong-facts/hand_structure.go
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: classify waits and ron eligibility"
```

### Task 5: Wire V2 through the sidecar protocol and typed client

**Files:**
- Modify: `coach/tools/mahjong-facts/protocol.go`
- Modify: `coach/tools/mahjong-facts/protocol_test.go`
- Modify: `coach/packages/reasoning/src/fact-engine/port.ts`
- Modify: `coach/packages/reasoning/src/fact-engine/jsonl-client.ts`
- Modify: `coach/packages/reasoning/tests/fact-engine-client.test.ts`

- [ ] **Step 1: Write failing dispatch and binding tests**

Go protocol tests must send one valid `hand_structure` JSON line and assert `kind`, V2 schema, request/action/state bindings and three families. Send another line with an unknown field and assert the public `invalid_request` code. Re-run an existing `hand13` protocol test unchanged.

TypeScript client tests must prove valid parsing plus rejection of mismatched `requestId`, `actionRef`, `stateHash`, `schemaVersion`, unsorted waits and unpinned identity.

- [ ] **Step 2: Run focused tests to verify RED**

```powershell
cd coach/tools/mahjong-facts
go test ./... -run 'TestProtocolHandStructure|TestProtocolHand13' -count=1
cd ../..
npx vitest run packages/reasoning/tests/fact-engine-client.test.ts
```

Expected: Go returns `unknown_kind`; TypeScript has no `analyzeHandStructure` method.

- [ ] **Step 3: Add strict dispatch and client method**

Add this protocol branch without editing the `hand13` branch:

```go
case "hand_structure":
	var request HandStructureRequestV2
	if err := strictDecode(line, &request); err != nil {
		return errorResponse(header.RequestID, "invalid_request", err.Error())
	}
	if err := requireJSONFields(line,
		"schemaVersion", "requestId", "protocolVersion", "actionRef", "stateHash",
		"handTiles34", "melds", "leftTiles34", "visibleCountsComplete", "ronContext", "yakuContext",
	); err != nil {
		return errorResponse(header.RequestID, "invalid_request", err.Error())
	}
	result, err := analyzeHandStructure(request)
	if err != nil { return errorResponse(header.RequestID, "invalid_request", err.Error()) }
	return marshalResponse(result)
```

Add to `MahjongFactEnginePort`:

```ts
analyzeHandStructure(
  request: HandStructureRequestV2,
): Promise<HandStructureResultV2>;
```

Implement `JsonlFactEngineClient.analyzeHandStructure` identically to the existing bound methods: request one line, reject structured engine errors, parse with `HandStructureResultV2Schema`, call `validateBindings`, and return the parsed data. Do not retry schema or binding failures; transport retry remains exactly once.

- [ ] **Step 4: Run sidecar/client tests and typecheck to verify GREEN**

```powershell
cd coach
npm run test:fact-engine
npx vitest run packages/contracts/tests/hand-structure.test.ts packages/reasoning/tests/fact-engine-client.test.ts
npm run typecheck
```

Expected: PASS; existing V1 golden tests remain unchanged.

- [ ] **Step 5: Commit**

```powershell
git add coach/tools/mahjong-facts/protocol.go coach/tools/mahjong-facts/protocol_test.go coach/packages/reasoning/src/fact-engine/port.ts coach/packages/reasoning/src/fact-engine/jsonl-client.ts coach/packages/reasoning/tests/fact-engine-client.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: expose hand structure v2 analysis"
```

### Task 6: Project canonical and candidate hands into V2 requests

**Files:**
- Create: `coach/packages/reasoning/src/factors/hand-structure-projector.ts`
- Create: `coach/packages/reasoning/tests/hand-structure-projector.test.ts`
- Modify: `coach/packages/reasoning/src/factors/candidate-projector.ts`

- [ ] **Step 1: Write failing projection tests**

Tests must cover:

- discard and riichi-discard use the 13-tile post-action concealed hand;
- an open meld reduces the expected concealed count and makes special families inapplicable only in the engine, not by deleting them from the result;
- full visible facts produce exact `leftTiles34`; incomplete rivers produce `null` and do not block the request;
- future candidate waits use `ronContext: "unknown_future"`;
- a current discard-response uses `complete_none` or `known_houtei` from exact remaining-draw completeness;
- kakan response uses `known_kakan_chankan`; ankan uses `known_ankan_chankan` and is projected for kokushi-only qualification in Task 7;
- `yakuContext` preserves KnownGameFacts missingness exactly: winds are known only when both values are authoritative, and riichi/open-tanyao use `unknown` instead of defaults when their source fact is partial or unknown;
- accepted riichi plus a non-ankan open meld fails projection rather than being silently normalized;
- candidate projection never mutates `KnownGameFacts`.

- [ ] **Step 2: Run tests to verify RED**

```powershell
cd coach
npx vitest run packages/reasoning/tests/hand-structure-projector.test.ts packages/reasoning/tests/candidate-projector.test.ts
```

Expected: FAIL because `buildHandStructureRequestV2` and `handStructureRequest` do not exist.

- [ ] **Step 3: Implement one shared request builder**

Expose this input boundary from `hand-structure-projector.ts`:

```ts
export interface HandStructureProjectionInput {
  actionRef: ActionRef;
  factSetId: string;
  projectedHand: readonly Tile[];
  selfMelds: readonly KnownMeld[];
  leftTiles34: readonly number[] | null;
  ronContext: HandStructureRequestV2["ronContext"];
  yakuContext: HandStructureRequestV2["yakuContext"];
}

export function buildHandStructureRequestV2(
  input: HandStructureProjectionInput,
): HandStructureRequestV2 {
  const payload = {
    handTiles34: tilesTo34Counts(input.projectedHand),
    melds: input.selfMelds.map((meld) => ({
      kind: meld.kind,
      tiles34: meld.tiles.map((tile) => tileIdTo34(tile.id)),
    })),
    leftTiles34: input.leftTiles34 === null ? null : [...input.leftTiles34],
    visibleCountsComplete: input.leftTiles34 !== null,
    ronContext: input.ronContext,
    yakuContext: { ...input.yakuContext },
  };
  const stateHash = stableProjectedStateHash(payload);
  return HandStructureRequestV2Schema.parse({
    kind: "hand_structure",
    schemaVersion: HAND_STRUCTURE_SCHEMA_VERSION,
    requestId: `${input.factSetId}:hand-structure:${stateHash}`,
    protocolVersion: FACT_ENGINE_PROTOCOL_VERSION,
    actionRef: input.actionRef,
    stateHash,
    ...payload,
  });
}
```

Add `handStructureRequest?: HandStructureRequestV2` to the ready projection. For discard and riichi-discard, build it from the already validated `projectedHand`, self melds and `leftTiles34`; keep the old `hand13Request` unchanged because V1 estimates still consume it.

Task 6 must first repair the `KnownGameFacts` projection boundary that currently collapses some component missingness. Add explicit wind, accepted-riichi and open-tanyao source statuses (or a typed derivation with equivalent information) before calling the builder. Do not derive `inactive` from absence of a riichi event when event completeness is not proven, do not assume kuitan enabled when rules are partial, and do not label winds known when either wind value is missing. This is the planned missingness fix; Tasks 1–5 only establish and enforce the strict request boundary.

- [ ] **Step 4: Run projection tests and typecheck to verify GREEN**

```powershell
cd coach
npx vitest run packages/reasoning/tests/hand-structure-projector.test.ts packages/reasoning/tests/candidate-projector.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add coach/packages/reasoning/src/factors/hand-structure-projector.ts coach/packages/reasoning/tests/hand-structure-projector.test.ts coach/packages/reasoning/src/factors/candidate-projector.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: project candidate hand structure requests"
```

### Task 7: Derive response-opportunity temporary and riichi furiten

**Files:**
- Create: `coach/packages/reasoning/src/replay/response-furiten.ts`
- Create: `coach/packages/reasoning/tests/response-furiten.test.ts`
- Modify: `coach/packages/reasoning/src/factors/known-game-facts-v2.ts`

- [ ] **Step 1: Write failing canonical-history tests**

Build minimal canonical streams and a fixture engine. Assert:

1. a ron-eligible opponent discard followed by the next legal draw marks temporary furiten with both the offered event and closing event as evidence;
2. the next self draw clears temporary furiten;
3. the same pass after self riichi acceptance marks riichi furiten and it survives later self draws;
4. a tile that completes shape but has `ineligible` base ron eligibility does not create furiten;
5. incomplete response opportunities return `unknown` with no evidence;
6. a self `win_declared` from the source event is not a pass;
7. an opponent kakan uses `known_kakan_chankan` and can establish furiten;
8. an ankan only counts when the V2 wait family includes kokushi;
9. when another actor wins and `atamahane` is unknown, the affected component becomes unknown; when atamahane is known, seat priority decides whether self had an opportunity.

- [ ] **Step 2: Run tests to verify RED**

```powershell
cd coach
npx vitest run packages/reasoning/tests/response-furiten.test.ts
```

Expected: FAIL because the response-furiten analyzer does not exist.

- [ ] **Step 3: Implement the evidence-backed state machine**

Expose:

```ts
export interface ResponseFuritenAnalysis {
  temporary: FuritenStateV2["temporary"];
  riichi: FuritenStateV2["riichi"];
}

export async function deriveResponseFuriten(
  stream: CanonicalEventStream,
  decisionEventRef: string,
  engine: MahjongFactEnginePort,
): Promise<ResponseFuritenAnalysis>;
```

The algorithm is fixed:

```text
validate and reduce the canonical stream
limit events to the active round and target decision prefix
if responseOpportunities != complete: return both unknown
initialize temporary=clear, riichi=clear, selfRiichiAccepted=false
for every event in order:
  self riichi_accepted -> selfRiichiAccepted=true
  self tile_drawn -> temporary=clear
  opponent tile_discarded/kakan_declared/ankan_declared -> create opportunity
  rebuild the self 13-tile state immediately after the source event
  run hand_structure/v2 with source-specific ronContext
  require source tile in waits and baseRonEligibility=eligible
  for ankan additionally require kokushi among that wait's families
  inspect canonical events until the response window closes
  self ron sourced from the opportunity -> not passed
  atamahane-blocked self -> not an opportunity
  unknown atamahane with another ron -> dependent component unknown
  otherwise closed without self ron -> confirmed pass
  confirmed pass while selfRiichiAccepted -> riichi confirmed
  confirmed pass before acceptance -> temporary confirmed
return components with unique, canonical-order evidence IDs
```

Do not infer a pass merely from absence of `win_declared`; require a recognized closing event (`tile_drawn`, call, later discard after a call, terminal event, or a complete winner sequence). Cache identical `{self-hand hash, meld refs, source kind, offered tile}` requests within one derivation.

Add an async wrapper beside the synchronous `projectKnownGameFactsV2`:

```ts
export async function projectAnalyzedKnownGameFactsV2(
  input: KnownGameFactsV2ProjectionInput,
  engine: MahjongFactEnginePort,
): Promise<{ facts: KnownGameFacts; responseFuriten: ResponseFuritenAnalysis }> {
  const facts = projectKnownGameFactsV2(input);
  const responseFuriten = await deriveResponseFuriten(
    input.stream,
    facts.decisionEventRef,
    engine,
  );
  return { facts, responseFuriten };
}
```

Do not add derived facts to `DecisionSnapshotV2` or its hash. The canonical snapshot remains replay-only authority; this wrapper returns derived analysis alongside it.

- [ ] **Step 4: Run response/replay tests and typecheck to verify GREEN**

```powershell
cd coach
npx vitest run packages/reasoning/tests/response-furiten.test.ts packages/reasoning/tests/canonical-replay-invariance.test.ts packages/reasoning/tests/known-game-facts-v2.test.ts
npm run typecheck
```

Expected: PASS; snapshot hashes remain unchanged.

- [ ] **Step 5: Commit**

```powershell
git add coach/packages/reasoning/src/replay/response-furiten.ts coach/packages/reasoning/tests/response-furiten.test.ts coach/packages/reasoning/src/factors/known-game-facts-v2.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: derive response opportunity furiten"
```

### Task 8: Merge wait-dependent discard furiten and final ron eligibility

**Files:**
- Create: `coach/packages/reasoning/src/factors/furiten-merger.ts`
- Create: `coach/packages/reasoning/tests/furiten-merger.test.ts`
- Modify: `coach/packages/reasoning/src/factors/candidate-projector.ts`

- [ ] **Step 1: Write failing merge tests**

Prove all of these:

- no current waits means discard furiten is clear when rivers are complete;
- one current wait appearing anywhere in self river confirms discard furiten with only matching discard refs;
- confirmed discard furiten removes every wait from `ronEligibleWaits34`, not only the matching tile;
- temporary and riichi confirmed also remove every ron wait;
- unknown response history does not erase a calculated discard component but makes final ron eligibility unknown and therefore returns no proven ron-eligible waits;
- incomplete self river makes discard furiten unknown without changing temporary/riichi;
- base `ineligible` and `unknown_missing_situational_yaku_context` waits are never promoted.

- [ ] **Step 2: Run tests to verify RED**

```powershell
cd coach
npx vitest run packages/reasoning/tests/furiten-merger.test.ts
```

Expected: FAIL because `mergeHandStructureFuriten` does not exist.

- [ ] **Step 3: Implement the pure merger**

Use this exact boundary:

```ts
export interface FuritenMergeInput {
  hand: HandStructureResultV2;
  selfRiver: readonly RiverDiscard[];
  selfRiverComplete: boolean;
  response: ResponseFuritenAnalysis;
}

export function mergeHandStructureFuriten(
  raw: FuritenMergeInput,
): MergedHandFuritenV2 {
  const hand = HandStructureResultV2Schema.parse(raw.hand);
  const waits = new Set(hand.waits.map((wait) => wait.tile34));
  const matching = raw.selfRiver.filter((discard) =>
    waits.has(tileIdTo34(discard.tile.id))
  );
  const discard = raw.selfRiverComplete
    ? {
        status: matching.length > 0 ? "confirmed" as const : "clear" as const,
        evidenceIds: matching.map((discard) => discard.eventId),
      }
    : { status: "unknown" as const, evidenceIds: [] };
  const furiten = FuritenStateV2Schema.parse({
    discard,
    temporary: raw.response.temporary,
    riichi: raw.response.riichi,
  });
  const everyKnown = [furiten.discard, furiten.temporary, furiten.riichi]
    .every((component) => component.status !== "unknown");
  const anyConfirmed = [furiten.discard, furiten.temporary, furiten.riichi]
    .some((component) => component.status === "confirmed");
  const baseEligibilityKnown = hand.waits.every((wait) =>
    wait.baseRonEligibility !== "unknown_missing_situational_yaku_context"
  );
  const ronEligibilityStatus = everyKnown && baseEligibilityKnown
    ? "calculated" as const
    : "unknown_missing_facts" as const;
  const ronEligibleWaits34 = ronEligibilityStatus === "calculated" && !anyConfirmed
    ? hand.waits
        .filter((wait) => wait.baseRonEligibility === "eligible")
        .map((wait) => wait.tile34)
    : [];
  return MergedHandFuritenV2Schema.parse({
    hand,
    furiten,
    ronEligibilityStatus,
    ronEligibleWaits34,
  });
}
```

Attach the candidate's newly discarded tile and action ref to the projected self river before merging, so a candidate can deterministically create discard furiten. Do not write the hypothetical discard into canonical history.

- [ ] **Step 4: Run merge/projection tests and typecheck to verify GREEN**

```powershell
cd coach
npx vitest run packages/reasoning/tests/furiten-merger.test.ts packages/reasoning/tests/hand-structure-projector.test.ts packages/reasoning/tests/candidate-projector.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add coach/packages/reasoning/src/factors/furiten-merger.ts coach/packages/reasoning/tests/furiten-merger.test.ts coach/packages/reasoning/src/factors/candidate-projector.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: merge hand waits with furiten"
```

### Task 9: Integrate V2 facts into the structured factor pipeline

**Files:**
- Create: `coach/packages/reasoning/src/factors/hand-structure-ledger.ts`
- Create: `coach/packages/reasoning/tests/hand-structure-ledger.test.ts`
- Modify: `coach/packages/reasoning/src/factors/structured-factor-pipeline.ts`
- Modify: `coach/packages/reasoning/src/factors/ledger-builder.ts`
- Modify: `coach/packages/reasoning/src/factors/difference-builder.ts`
- Modify: `coach/packages/reasoning/src/index.ts`
- Modify: `coach/packages/reasoning/tests/structured-factor-pipeline.test.ts`

- [ ] **Step 1: Write failing ledger and pipeline tests**

Assert the V2 result produces:

- deterministic `efficiency.overall_shanten`;
- one deterministic shanten fact per applicable family and explicit `not_applicable_open_hand` for special families;
- deterministic effective Tile34 types and remaining counts where complete;
- invariant structural claims as assertions;
- alternative claims with decomposition refs and a conditional-only limitation;
- wait types and base/final ron eligibility;
- three separately evidenced furiten facts;
- a truncation limitation that prevents omitted decompositions from being narrated as exhaustive;
- no structure label, wait label or furiten component is converted into a deterministic preference direction without an explicit allowlisted comparison.

Pipeline tests must show a V2 engine failure blocks only V2 structure/furiten dimensions while the old V1 upstream estimates still appear.

- [ ] **Step 2: Run tests to verify RED**

```powershell
cd coach
npx vitest run packages/reasoning/tests/hand-structure-ledger.test.ts packages/reasoning/tests/structured-factor-pipeline.test.ts
```

Expected: FAIL because no V2 outcome is carried into ledger construction.

- [ ] **Step 3: Add the V2 outcome without deleting V1 estimates**

Add `handStructureOutcome` and `responseFuriten` to the ready-candidate analysis input. Call `engine.analyzeHandStructure` when a request exists, then merge furiten before ledger construction. Add `hand_structure` to the typed pipeline diagnostic stage union.

Use these direction rules only:

```ts
const deterministicDirections = {
  "efficiency.overall_shanten": "lower_is_better",
  "efficiency.standard_shanten": "lower_is_better",
  "efficiency.chiitoitsu_shanten": "lower_is_better",
  "efficiency.kokushi_shanten": "lower_is_better",
  "efficiency.effective_tiles_remaining": "higher_is_better",
  "efficiency.ron_eligible_wait_count": "higher_is_better",
} as const;
```

Everything else from V2 is `different/neutral` evidence. `discard_furiten`, `temporary_furiten`, and `riichi_furiten` may be stated as facts but must not independently override Mortal/Akagi or resolve an applied attack/defense decision.

When V2 is calculated, suppress the duplicate V1 `shanten` and `waits_remaining` facts while retaining V1 yaku/point/rate estimates with their existing heuristic identity and limitations. This makes V2 authoritative for structure without breaking the pinned estimate path.

Export only these public entry points from `reasoning/src/index.ts`:

```ts
export * from "./factors/hand-structure-projector.js";
export * from "./factors/furiten-merger.js";
export * from "./factors/hand-structure-ledger.js";
export * from "./replay/response-furiten.js";
```

- [ ] **Step 4: Run the M2-A reasoning suite and typecheck to verify GREEN**

```powershell
cd coach
npx vitest run packages/reasoning/tests/hand-structure-projector.test.ts packages/reasoning/tests/response-furiten.test.ts packages/reasoning/tests/furiten-merger.test.ts packages/reasoning/tests/hand-structure-ledger.test.ts packages/reasoning/tests/structured-factor-pipeline.test.ts packages/reasoning/tests/factor-differences.test.ts packages/reasoning/tests/deterministic-resolver.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add coach/packages/reasoning/src/factors/hand-structure-ledger.ts coach/packages/reasoning/tests/hand-structure-ledger.test.ts coach/packages/reasoning/src/factors/structured-factor-pipeline.ts coach/packages/reasoning/src/factors/ledger-builder.ts coach/packages/reasoning/src/factors/difference-builder.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/structured-factor-pipeline.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: integrate structured hand and furiten facts"
```

### Task 10: Lock regressions, package surface, documentation and handoff

**Files:**
- Modify: `coach/packages/reasoning/tests/structured-factor-regression.test.ts`
- Modify: `coach/smoke/package-import-smoke.mjs`
- Modify: `coach/README.md`
- Modify: `docs/superpowers/plans/2026-08-01-llm-riichi-coach-product-roadmap.md`
- Modify: `docs/superpowers/handoffs/2026-08-08-canonical-event-stream-round-reducer-handoff.md`

- [ ] **Step 1: Write failing end-to-end regressions**

Extend the East 1 turn 6/7 regression to assert:

```ts
function factValue(
  result: Awaited<ReturnType<typeof runStructuredFactorPipeline>>,
  actionRef: string,
  dimension: string,
) {
  return result.ledgers.find((ledger) => ledger.actionRef === actionRef)
    ?.axes.flatMap((axis) => axis.facts)
    .find((fact) => fact.dimension === dimension)?.value;
}

expect(factValue(turn6Result, discard2p, "overall_shanten"))
  .toMatchObject({ kind: "number" });
expect(turn6Result.deterministicPreference).toBeNull();
expect(preferenceForAxis(turn6Result, "efficiency")).toEqual([discard2p]);
expect(preferenceForAxis(turn6Result, "defense")).toEqual([tsumogiri6s]);

expect(factValue(turn7Result, discard7p, "standard_shanten"))
  .toMatchObject({ kind: "number" });
expect(turn7Result.deterministicPreference).toBeNull();
expect(preferenceForAxis(turn7Result, "efficiency")).toEqual([discard7p]);
expect(preferenceForAxis(turn7Result, "defense")).toEqual([tsumogiri8p]);

for (const result of [turn6Result, turn7Result]) {
  const dimensions = result.ledgers.flatMap((ledger) =>
    ledger.axes.flatMap((axis) => axis.facts.map((fact) => fact.dimension))
  );
  expect(dimensions).not.toContain("model_reason");
  expect(dimensions).not.toContain("fabricated_efficiency_reason");
}
```

Retain the existing score-deletion and candidate-order metamorphic cases; assert the entire V2 hand/furiten payload is identical after model probabilities and Q values are removed.

Add a package smoke assertion that `HAND_STRUCTURE_SCHEMA_VERSION`, `HandStructureResultV2Schema`, `projectAnalyzedKnownGameFactsV2`, and `deriveResponseFuriten` are importable from the public packages, while the fixture-only legacy bridge remains absent.

- [ ] **Step 2: Run the regression to verify RED before updating its fixture engine**

```powershell
cd coach
npx vitest run packages/reasoning/tests/structured-factor-regression.test.ts
npm run test:package-import
```

Expected: FAIL because the regression fixture engine has not implemented `analyzeHandStructure` and the new exports are absent from built packages.

- [ ] **Step 3: Update regression fixtures and documentation**

Make the regression engine return strict V2 facts generated by the real sidecar; do not hand-author coaching reasons. Update README with:

- `hand-structure/v2` family coverage;
- 64-item non-dominated cap and conditional-claim semantics;
- response-opportunity completeness requirement;
- `eligible | ineligible | unknown_missing_situational_yaku_context` meaning;
- explicit statement that per-threat defense matrix remains the next M2-C slice.

Update the roadmap and handoff only after recording actual final commands, test counts, commits, remaining unsupported dimensions, and the M2-C/M5 entry points.

- [ ] **Step 4: Run every acceptance gate**

```powershell
cd coach
npm run test:fact-engine
npm test
npm run typecheck
npm run test:package-import
npm audit --omit=dev
cd ..
node --test tests/*.mjs
git diff --check
```

Expected:

- every Go test passes;
- every Vitest file passes;
- TypeScript typecheck passes;
- package import smoke passes;
- production dependency audit reports zero vulnerabilities;
- root Node tests pass;
- no whitespace errors.

- [ ] **Step 5: Request full-slice code review and fix findings by RED-first tests**

Use the `requesting-code-review` skill against the base commit before Task 1 and the current head. The reviewer must explicitly inspect:

- special-family applicability and kokushi formula;
- helper input mutation safety;
- decomposition completeness, Pareto relation, deterministic ordering and cap semantics;
- composite wait labels and edge-wait orientation;
- no-yaku/situational eligibility conservatism;
- response-window closing, atamahane, self-draw clearing and riichi persistence;
- candidate-created discard furiten;
- V1/V2 coexistence and model-score deletion invariance;
- absence of defensive heuristics in this slice.

For each Critical or Important finding, first add a focused failing test, then fix it, rerun focused and full gates, and request re-review. Finish only with zero Critical and zero Important findings.

- [ ] **Step 6: Commit regressions and handoff**

```powershell
git add coach/packages/reasoning/tests/structured-factor-regression.test.ts coach/smoke/package-import-smoke.mjs coach/README.md docs/superpowers/plans/2026-08-01-llm-riichi-coach-product-roadmap.md docs/superpowers/handoffs/2026-08-08-canonical-event-stream-round-reducer-handoff.md
git diff --cached --name-only
git diff --cached --check
git commit -m "docs: hand off hand structure and furiten v2"
```

## Completion evidence

M2-A is complete only when all of the following are proven by current artifacts and command output:

1. strict V2 contracts reject unknown fields, invalid ordering, false applicability and false truncation;
2. normal, chiitoitsu and kokushi family shanten/effective-tile goldens pass;
3. ambiguous incomplete hands retain stable non-dominated alternatives and correct invariant/conditional claims;
4. every wait kind and composite-label case passes;
5. ron eligibility never treats dora/model score as yaku and remains unknown when situational context is missing;
6. discard, temporary and riichi furiten each have positive, negative, clearing, persistence and incomplete-evidence tests;
7. the pipeline consumes V2 structure while preserving V1 estimates and failure isolation;
8. East 1 turn 6/7 and score-deletion invariants pass unchanged;
9. every repository acceptance command is green;
10. full-slice review reports zero Critical and zero Important findings;
11. roadmap and handoff record exact versions, commits, counts, unsupported defense scope and the next integration point.
