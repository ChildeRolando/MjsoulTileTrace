# Per-Threat Defense Matrix V1 Implementation Plan

> **For agentic workers:** Execute task-by-task with the available `test-driven-development` skill, fresh authorized implementation agents, and an independent read-only review gate for every task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有散落的现物、筋、壁、one-chance、字牌和 helper 风险事实收束为严格的“候选动作 × 威胁者”防守矩阵，并保证只有逐对象现物能进入确定性偏好。

**Architecture:** `DecisionSnapshotV2` 先无损投影威胁身份和逐字段完整性；本地分析器计算确定性现物，sidecar 只计算结构启发式；`DefenseMatrixAssembler` 将两者合并成一等 `defense-matrix/v1`，ledger adapter 再投影为五轴事实。矩阵不合并多家风险，不生成放铳概率，不实现行为或等待猜测。

**Tech Stack:** TypeScript、Zod、Vitest、Node.js、Go 1.24、固定 `EndlessCheng/mahjong-helper` sidecar、canonical event replay。

**Approved scope:** `coach/docs/specs/2026-08-08-canonical-game-state-hand-defense-design.md` 第 9、13.4、15 节。明确排除染手、对对、役牌/宝牌周边手切推断、跨筋/里筋/间四间、校准放铳概率、M5、LLM 和 UI。

---

## File map

- Create `coach/packages/contracts/src/defense-matrix.ts`: V1 threat、cell、visibility、structural result、matrix contracts.
- Modify `coach/packages/contracts/src/known-game-facts.ts`: add a strict richer defense-threat projection without deleting legacy regression fields.
- Modify `coach/packages/contracts/src/index.ts`: public contract exports.
- Modify `coach/packages/reasoning/src/factors/known-game-facts-v2.ts`: canonical threat projection.
- Create `coach/packages/reasoning/src/factors/defense-matrix.ts`: deterministic safety and final matrix assembly.
- Modify `coach/packages/reasoning/src/factors/candidate-projector.ts`: per-threat structural request outcomes.
- Modify `coach/packages/reasoning/src/factors/ledger-builder.ts`: matrix-to-ledger adapter.
- Modify `coach/packages/reasoning/src/factors/structured-factor-pipeline.ts`: assemble one matrix per candidate.
- Modify `coach/packages/reasoning/src/factors/difference-builder.ts`: actor-keyed deterministic comparison only.
- Modify `coach/packages/reasoning/src/index.ts`: public reasoning exports.
- Modify `coach/packages/contracts/src/fact-engine.ts`: versioned structural-risk result semantics.
- Modify `coach/packages/reasoning/src/fact-engine/hand-structure-validator.ts`: request-bound semantic validation.
- Modify `coach/tools/mahjong-facts/risk.go`: canonical structural result and scale version.
- Modify `coach/tools/mahjong-facts/risk_test.go`: Go goldens and invariants.
- Modify packaged binary/manifests and East 1 goldens only after Go/TS consumers are green.

## Non-negotiable invariants

1. A tile safe against actor A is never generalized to actor B.
2. `helperRiskScale` is a versioned heuristic number, never a probability or Mortal/Akagi deal-in rate.
3. Structural labels and risk scale are `heuristic_only` and cannot produce `DeterministicPreference`.
4. Multiple threats remain separate rows; no sum, max, average, normalization, or synthetic total risk.
5. Threat actor's own discard is deterministic genbutsu with complete river history; another actor's post-riichi pass requires complete response opportunities.
6. `declared`, `accepted`, and `user_marked_open` remain distinct.
7. Missing facts block only the dependent cell field; they do not make the whole matrix disappear.
8. Removing one river event changes only cells and evidence that depend on that event.
9. East 1 turn 6/7 keeps efficiency on 2p/7p, defense on genbutsu 6s/8p, and applied preference null.

---

### Task 1: Define strict defense-matrix contracts

**Files:**
- Create: `coach/packages/contracts/src/defense-matrix.ts`
- Modify: `coach/packages/contracts/src/index.ts`
- Test: `coach/packages/contracts/tests/defense-matrix.test.ts`

- [ ] **Step 1: Write the failing contract tests**

Add tests that require:

```ts
const matrix = DefenseMatrixV1Schema.parse({
  schemaVersion: "defense-matrix/v1",
  factSetId: "facts:e1:t6",
  actionRef: sixSouRef,
  candidateTile34: 23,
  cells: [{
    threat: {
      actor: 2,
      kind: "riichi_accepted",
      source: "canonical_replay",
      sourceEventRefs: ["game/0/48/0", "game/0/48/2"],
      openMeldRefs: [],
      dealerStatus: "non_dealer",
      riichiTurn: { status: "calculated", value: 6 },
      ippatsu: { status: "calculated", value: true },
    },
    deterministicSafety: {
      status: "calculated",
      genbutsu: true,
      evidenceRefs: [{ role: "threat_own_discard", eventRef: "game/0/48/1" }],
    },
    structural: {
      status: "calculated",
      requestId: "facts:e1:t6:risk:2",
      stateHash: "sha256:risk",
      engineIdentity,
      scaleVersion: "mahjong-helper-risk/514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0/v1",
      helperRiskScale: 0,
      classifications: ["double_suji", "wall"],
      honor: null,
      visibility: {
        turns: 6,
        safeTiles34: safe,
        leftTiles34: left,
        doraTiles34: [4],
        roundWindTile34: 27,
        threatWindTile34: 28,
        earlyOutsideTiles34: [0, 8],
      },
      evidenceIds: ["game/0/48/0", "game/0/48/1"],
      limitations: ["helper_risk_not_mortal_probability"],
    },
  }],
});
expect(matrix.cells[0]!.threat.actor).toBe(2);
```

Also reject duplicate actors, unsorted classifications, a `genbutsu` structural label, calculated structural data without an identity, blocked fields carrying calculated values, candidate cells bound to another action, and any top-level unknown field.

- [ ] **Step 2: Run the focused RED**

Run:

```powershell
cd coach
npx vitest run packages/contracts/tests/defense-matrix.test.ts
```

Expected: FAIL because `DefenseMatrixV1Schema` does not exist.

- [ ] **Step 3: Implement the contracts**

Define strict schemas with these exact public discriminants:

```ts
export const DEFENSE_MATRIX_SCHEMA_VERSION = "defense-matrix/v1" as const;
export const STRUCTURAL_RISK_SCALE_VERSION =
  "mahjong-helper-risk/514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0/v1" as const;

const ActorSchema = z.number().int().min(0).max(3);
const Tile34IndexSchema = z.number().int().min(0).max(33);
const StructuralDefenseKindSchema = z.enum([
  "suji", "half_suji", "double_suji", "no_suji", "wall",
  "no_chance", "double_no_chance", "one_chance",
  "double_one_chance", "mixed_one_chance", "early_outside",
]);
const EvidenceRefsSchema = z.array(z.string().min(1)).min(1)
  .refine((values) => new Set(values).size === values.length);
const IntegerDatumSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("calculated"), value: z.number().int().positive() }).strict(),
  z.object({ status: z.literal("blocked_missing_facts") }).strict(),
  z.object({ status: z.literal("not_applicable") }).strict(),
]);
const BooleanDatumSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("calculated"), value: z.boolean() }).strict(),
  z.object({ status: z.literal("blocked_missing_facts") }).strict(),
  z.object({ status: z.literal("not_applicable") }).strict(),
]);

export const DefenseThreatV1Schema = z.object({
  actor: ActorSchema,
  kind: z.enum(["riichi_declared", "riichi_accepted", "user_marked_open"]),
  source: z.enum([
    "canonical_replay",
    "user_asserted",
    "legacy_regression_bridge_only",
  ]),
  sourceEventRefs: EvidenceRefsSchema,
  openMeldRefs: z.array(z.string().min(1)),
  dealerStatus: z.enum(["dealer", "non_dealer", "unknown"]),
  riichiTurn: IntegerDatumSchema,
  ippatsu: BooleanDatumSchema,
}).strict();

export const DefenseMatrixCellV1Schema = z.object({
  actionRef: ActionRefSchema,
  threat: DefenseThreatV1Schema,
  deterministicSafety: DeterministicSafetySchema,
  structural: StructuralDefenseSchema,
}).strict();

export const DefenseMatrixV1Schema = z.object({
  schemaVersion: z.literal(DEFENSE_MATRIX_SCHEMA_VERSION),
  factSetId: z.string().min(1),
  actionRef: ActionRefSchema,
  candidateTile34: Tile34IndexSchema,
  cells: z.array(DefenseMatrixCellV1Schema),
}).strict().superRefine(validateUniqueActorsAndBindings);
```

Define `DeterministicSafetySchema` locally as a strict discriminated union: `calculated` carries `genbutsu:boolean` and typed evidence refs; `blocked_missing_facts` carries no calculated value; `not_applicable` is reserved for `user_marked_open`. Define `StructuralDefenseSchema` locally as a strict discriminated union: `calculated` carries request/result bindings, `StructuralDefenseKindSchema[]`, honor datum, all helper inputs (`turns`, `safeTiles34`, `leftTiles34`, `doraTiles34`, `roundWindTile34`, `threatWindTile34`, `earlyOutsideTiles34`), engine identity, scale version and fixed limitations; `blocked_missing_facts`, `blocked_engine_failure`, `unsupported_threat_kind`, and `not_applicable` carry only their typed allowlisted reason fields.

Implement `validateUniqueActorsAndBindings` in the same file: actor IDs must be unique; every `cell.actionRef` must equal the matrix `actionRef`; `user_marked_open` requires `source=user_asserted`, at least one `openMeldRef`, and not-applicable riichi/ippatsu; riichi threats require `canonical_replay` or `legacy_regression_bridge_only`, empty `openMeldRefs`, and at least one source event. Do not represent missing values with nullable calculated fields. Structural classifications exclude `genbutsu` and `honor_count`; honor evidence lives only in the typed honor field. These schemas and `Tile34IndexSchema` are defined in this module rather than importing the private value in `fact-engine.ts`.

- [ ] **Step 4: Run contract and type gates**

Run:

```powershell
cd coach
npx vitest run packages/contracts/tests/defense-matrix.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 5: Commit only Task 1 files**

```powershell
git add -- coach/packages/contracts/src/defense-matrix.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/defense-matrix.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: define per-threat defense matrix"
```

---

### Task 2: Project lossless threat facts from canonical snapshots

**Files:**
- Modify: `coach/packages/contracts/src/known-game-facts.ts`
- Modify: `coach/packages/contracts/src/scene.ts`
- Modify: `coach/packages/reasoning/src/factors/known-game-facts-v2.ts`
- Modify: `coach/packages/reasoning/src/factors/local-defense.ts`
- Modify: `coach/packages/reasoning/src/factors/legacy-facts-bridge.ts`
- Test: `coach/packages/contracts/tests/known-game-facts.test.ts`
- Test: `coach/packages/contracts/tests/contracts.test.ts`
- Test: `coach/packages/reasoning/tests/known-game-facts-v2.test.ts`
- Modify fixtures in: `coach/packages/reasoning/tests/candidate-projector.test.ts`
- Modify fixtures in: `coach/packages/reasoning/tests/furiten-merger.test.ts`
- Modify fixtures in: `coach/packages/reasoning/tests/hand-structure-projector.test.ts`
- Modify fixtures in: `coach/packages/reasoning/tests/local-defense-completeness.test.ts`
- Modify fixtures in: `coach/packages/reasoning/tests/structured-factor-pipeline.test.ts`
- Modify fixtures in: `coach/packages/reasoning/tests/structured-ledger-builder.test.ts`

- [ ] **Step 1: Write projection RED tests**

Require `KnownGameFacts.defenseThreats` to preserve:

```ts
expect(facts.defenseThreats).toEqual([{
  actor: 2,
  kind: "riichi_accepted",
  source: "canonical_replay",
  sourceEventRefs: [declarationRef, acceptanceRef],
  openMeldRefs: [],
  dealerStatus: "non_dealer",
  riichiTurn: { status: "calculated", value: 6 },
  ippatsu: { status: "calculated", value: true },
}]);
```

Add separate fixtures for declared-not-accepted, unknown ippatsu, incomplete rivers causing only `riichiTurn` blocked, and a `user_asserted` open-hand threat. Cross-field tests reject actor/source/status contradictions and a replay threat without canonical evidence.

- [ ] **Step 2: Run RED**

```powershell
cd coach
npx vitest run packages/contracts/tests/known-game-facts.test.ts packages/reasoning/tests/known-game-facts-v2.test.ts
```

Expected: FAIL because the richer threat field is absent and nullable ippatsu cannot be projected independently.

- [ ] **Step 3: Extend KnownGameFacts without creating a second authority**

Add required `defenseThreats: z.array(DefenseThreatV1Schema)` to `KnownGameFactsSchema`. Keep the old `threats` field only as a deprecated regression projection for existing V1 consumers; add refinements requiring every rich threat actor to differ from `facts.actor`, every active legacy riichi actor to have exactly one canonical defense threat, and `user_marked_open` to exist only in `defenseThreats`. Change legacy `ThreatStateSchema.ippatsuAlive` to `boolean | null`; while `local-defense.ts` still exists, map null to a blocked ippatsu fact rather than false. Update every listed test fixture explicitly with `defenseThreats: []` or an actor-matched rich threat; do not add a schema default that silently invents declared/accepted status.

In `projectKnownGameFactsV2`, derive accepted/declared status directly from `publicState.riichiStates`, dealer from `publicState.dealer`, and riichi turn from the declaring discard's index in that actor's canonical river. Map `ippatsuAlive === null` to a blocked datum, not a schema failure.

Use this projection shape rather than a boolean conversion:

```ts
const defenseThreats = publicState.riichiStates.flatMap((riichi) => {
  if (riichi.status === "none" || riichi.actor === snapshot.selfActor) return [];
  const river = publicState.rivers[riichi.actor]!;
  const declaringIndex = river.findIndex((discard) =>
    discard.riichiDeclarationEventRef === riichi.declarationEventRef
  );
  return [{
    actor: riichi.actor,
    kind: riichi.status === "accepted"
      ? "riichi_accepted" as const
      : "riichi_declared" as const,
    source: "canonical_replay" as const,
    sourceEventRefs: [
      riichi.declarationEventRef!,
      ...(riichi.acceptanceEventRef === null ? [] : [riichi.acceptanceEventRef]),
    ],
    openMeldRefs: [],
    dealerStatus: publicState.fields.roundContext === "complete"
      ? publicState.dealer === riichi.actor ? "dealer" as const : "non_dealer" as const
      : "unknown" as const,
    riichiTurn: publicState.fields.rivers === "complete" && declaringIndex >= 0
      ? { status: "calculated" as const, value: declaringIndex + 1 }
      : { status: "blocked_missing_facts" as const },
    ippatsu: riichi.ippatsuAlive === null
      ? { status: "blocked_missing_facts" as const }
      : { status: "calculated" as const, value: riichi.ippatsuAlive },
  }];
});
```

The fixture-only `legacy-facts-bridge.ts` must emit the same richer threat rows from its replay scene with `source: "legacy_regression_bridge_only"`. It must never upgrade normalized fixture events to `canonical_replay` provenance. These rows are accepted only by regression paths and remain absent from the public package surface.

- [ ] **Step 4: Run focused and regression gates**

```powershell
cd coach
npx vitest run packages/contracts/tests/known-game-facts.test.ts packages/reasoning/tests/known-game-facts-v2.test.ts packages/reasoning/tests/structured-factor-regression.test.ts
npm run typecheck
```

Expected: all PASS and East 1 remains unchanged.

- [ ] **Step 5: Commit Task 2 files**

```powershell
git add -- coach/packages/contracts/src/known-game-facts.ts coach/packages/contracts/src/scene.ts coach/packages/contracts/tests/known-game-facts.test.ts coach/packages/contracts/tests/contracts.test.ts coach/packages/reasoning/src/factors/known-game-facts-v2.ts coach/packages/reasoning/src/factors/legacy-facts-bridge.ts coach/packages/reasoning/src/factors/local-defense.ts coach/packages/reasoning/tests/known-game-facts-v2.test.ts coach/packages/reasoning/tests/candidate-projector.test.ts coach/packages/reasoning/tests/furiten-merger.test.ts coach/packages/reasoning/tests/hand-structure-projector.test.ts coach/packages/reasoning/tests/local-defense-completeness.test.ts coach/packages/reasoning/tests/structured-factor-pipeline.test.ts coach/packages/reasoning/tests/structured-ledger-builder.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: preserve defense threat context"
```

---

### Task 3: Build deterministic genbutsu matrix cells

**Files:**
- Create: `coach/packages/reasoning/src/factors/defense-matrix.ts`
- Modify: `coach/packages/reasoning/src/index.ts`
- Test: `coach/packages/reasoning/tests/defense-matrix.test.ts`
- Modify test: `coach/packages/reasoning/tests/local-defense-completeness.test.ts`

- [ ] **Step 1: Write deterministic RED tests**

Cover:

```ts
expect(cellFor(matrix, 2).deterministicSafety).toEqual({
  status: "calculated",
  genbutsu: true,
  evidenceRefs: [{ role: "threat_own_discard", eventRef: ownDiscardRef }],
});
expect(cellFor(matrix, 1).deterministicSafety.status)
  .toBe("blocked_missing_facts");
```

Test the same tile against two threats, cross-player post-riichi passage with complete/incomplete response opportunities, nonmatching tiles, no threats, and `user_marked_open` returning `not_applicable` rather than false genbutsu. Test separately that the pipeline does not construct a defense matrix for a non-discard candidate and keeps its defense axis `unsupported_action_in_slice`.

- [ ] **Step 2: Run RED**

```powershell
cd coach
npx vitest run packages/reasoning/tests/defense-matrix.test.ts packages/reasoning/tests/local-defense-completeness.test.ts
```

Expected: FAIL because `buildDeterministicDefenseMatrix` is absent.

- [ ] **Step 3: Implement exact local evidence**

Create:

```ts
export function buildDeterministicDefenseMatrix(input: {
  candidate: StructuredComparisonCandidate;
  facts: KnownGameFacts;
}): DefenseMatrixV1;
```

For each threat, inspect only that actor's own river plus canonical post-riichi passage events. Store evidence roles as `threat_own_discard` or `post_riichi_pass`; never use the whole `facts.evidenceIds` as proof. No threats produces `cells: []`. The builder accepts only discard/riichi-discard candidates; the pipeline skips it for other actions and emits the existing `unsupported_action_in_slice` defense status.

The decisive branch must follow this order:

```ts
if (threat.kind === "user_marked_open") return notApplicableSafety(threat);
if (!facts.completeness.rivers) {
  return { status: "blocked_missing_facts", evidenceRefs: [] };
}
const own = ownThreatDiscardsMatching(candidateTile, threat, facts);
if (own.length > 0) return calculatedGenbutsu(own, "threat_own_discard");
const passed = postRiichiPassesMatching(candidateTile, threat, facts);
if (passed.length > 0 && facts.completeness.responseOpportunities) {
  return calculatedGenbutsu(passed, "post_riichi_pass");
}
if (passed.length > 0 && !facts.completeness.responseOpportunities) {
  return { status: "blocked_missing_facts", evidenceRefs: [] };
}
return { status: "calculated", genbutsu: false, evidenceRefs: [] };
```

- [ ] **Step 4: Verify focused behavior**

```powershell
cd coach
npx vitest run packages/reasoning/tests/defense-matrix.test.ts packages/reasoning/tests/local-defense-completeness.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 5: Commit Task 3 files**

```powershell
git add -- coach/packages/reasoning/src/factors/defense-matrix.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/defense-matrix.test.ts coach/packages/reasoning/tests/local-defense-completeness.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: derive deterministic defense cells"
```

---

### Task 4: Make structural risk projection explicit per threat

**Files:**
- Modify: `coach/packages/contracts/src/fact-engine.ts`
- Modify: `coach/packages/reasoning/src/factors/candidate-projector.ts`
- Modify: `coach/packages/reasoning/src/factors/structured-factor-pipeline.ts`
- Test: `coach/packages/contracts/tests/fact-engine.test.ts`
- Test: `coach/packages/reasoning/tests/candidate-projector.test.ts`
- Test: `coach/packages/reasoning/tests/structured-factor-pipeline.test.ts`

- [ ] **Step 1: Write request-status RED tests**

Require one projection outcome per defense threat:

```ts
expect(projection.threatRiskProjections).toEqual([
  { threatActor: 1, status: "blocked_missing_facts", missing: ["visibility"] },
  { threatActor: 2, status: "ready", request: expect.objectContaining({
      turns: 9,
      scaleVersion: STRUCTURAL_RISK_SCALE_VERSION,
    }) },
  { threatActor: 3, status: "unsupported_threat_kind", kind: "user_marked_open" },
]);
```

Reject a request that omits scale version, includes incomplete visibility, or binds safe tiles/evidence from another threat. Riichi turn remains typed threat metadata and is intentionally absent from the helper request because helper calculation does not depend on it.

- [ ] **Step 2: Run RED**

```powershell
cd coach
npx vitest run packages/contracts/tests/fact-engine.test.ts packages/reasoning/tests/candidate-projector.test.ts
```

Expected: FAIL because requests are currently omitted rather than represented as blocked/unsupported.

- [ ] **Step 3: Implement typed projection outcomes**

Add `scaleVersion` to `ThreatRiskFactRequestSchema`. Replace `threatRiskRequests: ThreatRiskFactRequest[]` with:

```ts
export type ThreatRiskProjection =
  | { threatActor: number; status: "ready"; request: ThreatRiskFactRequest }
  | { threatActor: number; status: "blocked_missing_facts"; missing: string[] }
  | { threatActor: number; status: "unsupported_threat_kind"; kind: "user_marked_open" };
```

Hash the complete ready request payload. `turns` remains the current threat river length used by helper; `riichiTurn` stays in `DefenseThreatV1` and never broadens helper prerequisites.

Update `StructuredFactorPipeline` in the same task to fan out only `status: "ready"` requests while carrying the full `ThreatRiskProjection[]` alongside engine outcomes. Blocked and unsupported projections must not call the engine, but must survive to Task 6 assembly.

- [ ] **Step 4: Run focused gates**

```powershell
cd coach
npx vitest run packages/contracts/tests/fact-engine.test.ts packages/reasoning/tests/candidate-projector.test.ts packages/reasoning/tests/structured-factor-pipeline.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 5: Commit Task 4 files**

```powershell
git add -- coach/packages/contracts/src/fact-engine.ts coach/packages/contracts/tests/fact-engine.test.ts coach/packages/reasoning/src/factors/candidate-projector.ts coach/packages/reasoning/src/factors/structured-factor-pipeline.ts coach/packages/reasoning/tests/candidate-projector.test.ts coach/packages/reasoning/tests/structured-factor-pipeline.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: project structural risk per threat"
```

---

### Task 5: Harden sidecar structural-risk semantics

**Files:**
- Modify: `coach/tools/mahjong-facts/risk.go`
- Modify: `coach/tools/mahjong-facts/risk_test.go`
- Modify: `coach/tools/mahjong-facts/protocol.go`
- Modify: `coach/packages/contracts/src/fact-engine.ts`
- Test: `coach/packages/contracts/tests/fact-engine.test.ts`
- Modify: `coach/packages/reasoning/src/fact-engine/hand-structure-validator.ts`
- Test: `coach/packages/reasoning/tests/fact-engine-client.test.ts`
- Modify identity fixtures: `coach/packages/contracts/tests/factor-ledger.test.ts`
- Modify identity fixtures: `coach/packages/contracts/tests/hand-structure.test.ts`
- Modify identity fixtures: `coach/packages/reasoning/tests/deterministic-resolver.test.ts`
- Modify identity fixtures: `coach/packages/reasoning/tests/factor-differences.test.ts`
- Modify identity fixtures: `coach/packages/reasoning/tests/furiten-merger.test.ts`
- Modify identity fixtures: `coach/packages/reasoning/tests/hand-structure-ledger.test.ts`
- Modify identity fixtures: `coach/packages/reasoning/tests/response-furiten.test.ts`
- Modify identity fixtures: `coach/packages/reasoning/tests/structured-factor-pipeline.test.ts`
- Modify identity fixtures: `coach/packages/reasoning/tests/structured-factor-regression.test.ts`
- Modify identity fixtures: `coach/packages/reasoning/tests/structured-ledger-builder.test.ts`
- Modify: `coach/scripts/generate-factor-regression-golden.mjs`
- Modify generated: `coach/fixtures/mahjong-facts/c1924cad66f66dd9-east1-turn6-7.json`
- Create: `coach/scripts/update-packaged-fact-engine-manifest.mjs`
- Create: `coach/scripts/update-packaged-fact-engine-manifest.test.mjs`
- Modify: `coach/resources/mahjong-facts/windows-x64/mahjong-facts.exe`
- Modify: `coach/resources/mahjong-facts/windows-x64/manifest.json`
- Modify: `coach/packages/reasoning/src/fact-engine/packaged-manifest.ts`

- [ ] **Step 1: Add RED semantic tests**

Go tests require strict sorted unique classifications, safe tiles classified as genbutsu, safe risk scale equal to the pinned helper's safe value, seven ordered honor classifications, finite nonnegative scale values, and an echoed scale version. TypeScript tests feed schema-valid lies: duplicate labels, genbutsu on an unsafe tile, wrong scale version, wrong safe-tile risk, and hostile diagnostics.

Also write the manifest-updater unit test before its module exists, and change the regression test's expected adapter identity to `0.2.0` before regenerating the golden. These provide RED for the release-identity half of the task; never hand-edit fixture JSON.

```go
func TestThreatRiskSemanticBinding(t *testing.T) {
	request := wallAndSujiRequest()
	result, err := analyzeThreatRisk(request)
	if err != nil { t.Fatal(err) }
	if result.ScaleVersion != structuralRiskScaleVersion {
		t.Fatalf("scale version = %q", result.ScaleVersion)
	}
	for tile, safe := range request.SafeTiles34 {
		if safe && result.RiskScale[tile] != 0 {
			t.Fatalf("safe tile %d risk = %v", tile, result.RiskScale[tile])
		}
	}
}
```

```ts
const valid = validThreatRiskResult();
const liedRisk = [...valid.riskScale];
liedRisk[3] = 1;
expect(() => validateThreatRiskResult(request, {
  ...valid,
  classifications: [{ tile34: 3, kind: "genbutsu" }],
  riskScale: liedRisk,
})).toThrow("threat_risk_semantic_mismatch");
```

- [ ] **Step 2: Run RED in both languages**

```powershell
$env:Path='C:\Users\Roland\AppData\Local\CodexTools\go1.24.13\go\bin;' + $env:Path
cd coach/tools/mahjong-facts
go test ./... -run 'TestThreatRisk|TestRiskSemanticBinding' -count=1
cd ../..
npx vitest run packages/reasoning/tests/fact-engine-client.test.ts
npx vitest run packages/reasoning/tests/structured-factor-regression.test.ts
node --test scripts/update-packaged-fact-engine-manifest.test.mjs
```

Expected: semantic-lie cases FAIL, the updater test fails because the module/export is absent, and the old golden fails the new identity expectation.

- [ ] **Step 3: Implement pinned semantics**

Echo `scaleVersion`, canonicalize classifications by `(tile34, kind)`, and keep `genbutsu` only in the engine protocol for validation. Because the strict request/result shape changes, atomically bump TypeScript `FACT_ENGINE_ADAPTER_VERSION`, Go `adapterVersion`, every listed identity fixture, the real East 1 golden, both trusted manifests, and the packaged binary from `0.1.0` to `0.2.0` while retaining protocol envelope `mahjong-facts/v1`. In `validateThreatRiskResult`, validate all result fields against the request before returning them. Convert all failures to fixed project codes/text; never include raw sidecar prose or hostile keys.

```go
const structuralRiskScaleVersion =
	"mahjong-helper-risk/514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0/v1"
```

```ts
if (result.scaleVersion !== request.scaleVersion ||
    result.classifications.some((entry) =>
      entry.kind === "genbutsu" && !request.safeTiles34[entry.tile34]
    ) ||
    request.safeTiles34.some((safe, tile34) =>
      safe && result.riskScale[tile34] !== 0
    )) {
  throw new HandStructureResultValidationError(
    "threat_risk_semantic_mismatch",
    "fact engine threat result failed semantic validation",
  );
}
```

- [ ] **Step 4: Build, regenerate, and package the 0.2.0 trust boundary**

Add the script-local `BuildArtifactFactEngineTransport` described in Task 8 to the golden generator. It spawns only the resolved repo-local `.tools` binary and is never exported. Implement the pure manifest updater and ESM-main CLI described in Task 9. Build twice and require identical hash/size; regenerate the current hand/structure golden through the script; update both manifests from the built bytes; package; then verify the managed installed binary.

```powershell
$env:Path='C:\Users\Roland\AppData\Local\CodexTools\go1.24.13\go\bin;' + $env:Path
cd coach
npm run build:fact-engine
Get-FileHash ../.tools/mahjong-facts/windows-x64/mahjong-facts.exe -Algorithm SHA256
npm run build:fact-engine
Get-FileHash ../.tools/mahjong-facts/windows-x64/mahjong-facts.exe -Algorithm SHA256
npm run build
npm run generate:factor-regression-golden
node --test scripts/update-packaged-fact-engine-manifest.test.mjs
node scripts/update-packaged-fact-engine-manifest.mjs
npm run package:fact-engine
```

- [ ] **Step 5: Run Go/TS full gates**

```powershell
$env:Path='C:\Users\Roland\AppData\Local\CodexTools\go1.24.13\go\bin;' + $env:Path
cd coach/tools/mahjong-facts
go test ./... -count=1
go vet ./...
cd ../..
npx vitest run packages/contracts/tests/fact-engine.test.ts packages/reasoning/tests/fact-engine-client.test.ts
npm test
npm run typecheck
npm run test:package-import
```

Expected: all PASS, including the managed packaged-binary startup test and East 1 regression.

- [ ] **Step 6: Commit the atomic adapter release**

```powershell
git add -- coach/tools/mahjong-facts/risk.go coach/tools/mahjong-facts/risk_test.go coach/tools/mahjong-facts/protocol.go coach/packages/contracts/src/fact-engine.ts coach/packages/contracts/tests/fact-engine.test.ts coach/packages/contracts/tests/factor-ledger.test.ts coach/packages/contracts/tests/hand-structure.test.ts coach/packages/reasoning/src/fact-engine/hand-structure-validator.ts coach/packages/reasoning/src/fact-engine/packaged-manifest.ts coach/packages/reasoning/tests/deterministic-resolver.test.ts coach/packages/reasoning/tests/fact-engine-client.test.ts coach/packages/reasoning/tests/factor-differences.test.ts coach/packages/reasoning/tests/furiten-merger.test.ts coach/packages/reasoning/tests/hand-structure-ledger.test.ts coach/packages/reasoning/tests/response-furiten.test.ts coach/packages/reasoning/tests/structured-factor-pipeline.test.ts coach/packages/reasoning/tests/structured-factor-regression.test.ts coach/packages/reasoning/tests/structured-ledger-builder.test.ts coach/scripts/generate-factor-regression-golden.mjs coach/scripts/update-packaged-fact-engine-manifest.mjs coach/scripts/update-packaged-fact-engine-manifest.test.mjs coach/fixtures/mahjong-facts/c1924cad66f66dd9-east1-turn6-7.json coach/resources/mahjong-facts/windows-x64/mahjong-facts.exe coach/resources/mahjong-facts/windows-x64/manifest.json
git diff --cached --name-only
git diff --cached --check
git commit -m "fix: version structural risk semantics"
```

---

### Task 6: Assemble the complete matrix and adapt it to the ledger

**Files:**
- Modify: `coach/packages/reasoning/src/factors/defense-matrix.ts`
- Delete after migration: `coach/packages/reasoning/src/factors/local-defense.ts`
- Modify: `coach/packages/reasoning/src/factors/ledger-builder.ts`
- Modify: `coach/packages/reasoning/src/factors/structured-factor-pipeline.ts`
- Test: `coach/packages/reasoning/tests/defense-matrix.test.ts`
- Test: `coach/packages/reasoning/tests/structured-ledger-builder.test.ts`
- Test: `coach/packages/reasoning/tests/structured-factor-pipeline.test.ts`
- Test: `coach/packages/reasoning/tests/local-defense-completeness.test.ts`

- [ ] **Step 1: Write isomorphic-matrix RED tests**

For every discard candidate, assert one cell for every defense threat, including ready, blocked engine, blocked visibility, and unsupported open threat. Assert that no-threat applied analysis leaves the defense axis `unsupported_dimension`, not `calculated` from an `active_riichi_count = 0` placeholder. Assert helper `genbutsu` is filtered from structural labels because deterministic safety owns that concept.

```ts
expect(result.defenseMatrices).toHaveLength(result.ledgers.length);
for (const matrix of result.defenseMatrices) {
  expect(matrix.cells.map((cell) => cell.threat.actor)).toEqual([1, 2, 3]);
  expect(matrix.cells.find((cell) => cell.threat.actor === 1)?.structural.status)
    .toBe("blocked_missing_facts");
  expect(matrix.cells.find((cell) => cell.threat.actor === 3)?.structural.status)
    .toBe("unsupported_threat_kind");
}
```

- [ ] **Step 2: Run RED**

```powershell
cd coach
npx vitest run packages/reasoning/tests/defense-matrix.test.ts packages/reasoning/tests/structured-ledger-builder.test.ts packages/reasoning/tests/structured-factor-pipeline.test.ts packages/reasoning/tests/local-defense-completeness.test.ts
```

Expected: FAIL because projection failures currently remove rows and ledger facts are assembled independently.

- [ ] **Step 3: Implement matrix assembly**

Add:

```ts
export function assembleDefenseMatrix(input: {
  deterministic: DefenseMatrixV1;
  threatRiskProjections: ThreatRiskProjection[];
  threatRiskOutcomes: ThreatRiskEngineOutcome[];
}): DefenseMatrixV1;
```

Bind projections and outcomes by actor, reject duplicates and foreign actors, take ready-cell visibility from the exact projection request, preserve blocked/unsupported rows even when no engine call occurred, and parse the final matrix at the boundary. Replace direct `buildLocalDefenseFacts`/`mapThreatRisk` calls with one `mapDefenseMatrixToLedger` adapter, migrate its focused tests, then delete `local-defense.ts` so no second defense truth remains. Deterministic cells map to actor-keyed boolean facts; structural cells map to heuristic risk/classification/honor facts with fixed limitations and engine identity.

The pipeline result becomes:

```ts
export interface StructuredFactorPipelineResult {
  analysisMode: "v2" | "legacy_v1_fallback" | "v2_mixed_unresolved";
  ledgers: CandidateFactorLedger[];
  defenseMatrices: DefenseMatrixV1[];
  differences: FactorDifferenceBuildResult;
  deterministicPreference: DeterministicPreference | null;
  diagnostics: StructuredPipelineDiagnostic[];
}
```

- [ ] **Step 4: Verify focused integration**

```powershell
cd coach
npx vitest run packages/reasoning/tests/defense-matrix.test.ts packages/reasoning/tests/structured-ledger-builder.test.ts packages/reasoning/tests/structured-factor-pipeline.test.ts packages/reasoning/tests/local-defense-completeness.test.ts
npm run typecheck
```

Expected: all PASS and every candidate ledger still has exactly five axes with unique dimensions.

- [ ] **Step 5: Commit Task 6 files**

```powershell
git add -- coach/packages/reasoning/src/factors/defense-matrix.ts coach/packages/reasoning/src/factors/local-defense.ts coach/packages/reasoning/src/factors/ledger-builder.ts coach/packages/reasoning/src/factors/structured-factor-pipeline.ts coach/packages/reasoning/tests/defense-matrix.test.ts coach/packages/reasoning/tests/structured-ledger-builder.test.ts coach/packages/reasoning/tests/structured-factor-pipeline.test.ts coach/packages/reasoning/tests/local-defense-completeness.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "feat: assemble defense matrix ledgers"
```

---

### Task 7: Enforce difference and preference boundaries

**Files:**
- Modify: `coach/packages/reasoning/src/factors/difference-builder.ts`
- Modify: `coach/packages/reasoning/src/factors/deterministic-resolver.ts`
- Test: `coach/packages/reasoning/tests/factor-differences.test.ts`
- Test: `coach/packages/reasoning/tests/deterministic-resolver.test.ts`

- [ ] **Step 1: Write preference-boundary RED tests**

Test that:

```ts
expect(genbutsuDifference).toMatchObject({
  axis: "defense",
  dimension: "genbutsu:actor2",
  preferenceEligibility: "deterministic",
});
expect(structuralDifference).toMatchObject({
  axis: "defense",
  direction: "neutral",
  preferenceEligibility: "heuristic_only",
});
expect(resolveDeterministicPreference(multiThreatDifferences)).toBeNull();
```

Include a tile genbutsu against A but not B, changed helper risk values, changed label sets, and two simultaneous threats. No test may compare actor1's cell to actor2's cell.

Also add a direct trust-boundary regression for a spoofed `genbutsu:actor2:spoof` dimension. It must remain descriptive and ineligible; only the exact actor-keyed dimension emitted by the matrix mapper may obtain a deterministic direction.

- [ ] **Step 2: Run RED**

```powershell
cd coach
npx vitest run packages/reasoning/tests/factor-differences.test.ts packages/reasoning/tests/deterministic-resolver.test.ts
```

Expected: FAIL because the current broad `startsWith("genbutsu:actor")` check incorrectly gives `genbutsu:actor2:spoof` a deterministic specification; exact actor dimensions and structural heuristic assertions remain green.

- [ ] **Step 3: Implement registry-backed comparison**

Register deterministic direction only for an exact `(defense, genbutsu:actorN)` boolean fact with the same actor suffix and compatible evidence/status. Replace the broad `startsWith` match with the anchored regex. Every structural fact remains `heuristic_only`: classification/set differences are neutral, while `helper_risk_scale:actorN` may retain its existing lower-is-better heuristic direction for explanation. Neither form enters the deterministic resolver. Do not add an aggregate defense score or a cross-threat resolver rule.

```ts
if (axis === "defense" && /^genbutsu:actor[0-3]$/u.test(dimension)) {
  return { preference: "true", valueKind: "boolean" };
}
// No defense helper_* dimension is registered here.
return undefined;
```

- [ ] **Step 4: Verify focused gates**

```powershell
cd coach
npx vitest run packages/reasoning/tests/factor-differences.test.ts packages/reasoning/tests/deterministic-resolver.test.ts packages/reasoning/tests/teaching-policy.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 5: Commit Task 7 files**

```powershell
git add -- coach/packages/reasoning/src/factors/difference-builder.ts coach/packages/reasoning/src/factors/deterministic-resolver.ts coach/packages/reasoning/tests/factor-differences.test.ts coach/packages/reasoning/tests/deterministic-resolver.test.ts
git diff --cached --name-only
git diff --cached --check
git commit -m "fix: isolate per-threat defense preferences"
```

---

### Task 8: Add metamorphic and East 1 defense regressions

**Files:**
- Modify: `coach/packages/reasoning/tests/canonical-replay-invariance.test.ts`
- Modify: `coach/packages/reasoning/tests/structured-factor-regression.test.ts`
- Modify: `coach/packages/reasoning/tests/structured-factor-pipeline.test.ts`
- Modify: `coach/scripts/generate-factor-regression-golden.mjs`
- Modify: `coach/fixtures/mahjong-facts/c1924cad66f66dd9-east1-turn6-7.json` only if the versioned threat result shape changes.

- [ ] **Step 1: Write end-to-end RED tests**

Require both turns to expose a parsed defense matrix and assert:

- turn 6: 6s deterministic genbutsu against actor 2; 2p is not explained as safer by efficiency;
- turn 7: 8p deterministic genbutsu against actor 2; 7p retains efficiency support;
- applied preference remains null;
- deleting the single supporting discard must change actor 2's deterministic genbutsu cell/evidence; structural cells that explicitly depend on global visibility may also change and must remain request-bound;
- moving the riichi to another actor moves the matrix row and does not retain stale evidence;
- changing helper risk scale or classifications leaves deterministic preference unchanged;
- deleting model scores leaves the entire matrix and factor result unchanged.

```ts
const turn6Matrix = result.defenseMatrices.find((matrix) =>
  matrix.actionRef === sixSouRef
)!;
expect(turn6Matrix.cells.find((cell) => cell.threat.actor === 2))
  .toMatchObject({
    deterministicSafety: { status: "calculated", genbutsu: true },
  });
expect(result.deterministicPreference).toBeNull();
expect(withoutScores.factorResult).toEqual(withScores.factorResult);
```

- [ ] **Step 2: Run RED**

```powershell
cd coach
npx vitest run packages/reasoning/tests/canonical-replay-invariance.test.ts packages/reasoning/tests/structured-factor-regression.test.ts packages/reasoning/tests/structured-factor-pipeline.test.ts
```

Expected: FAIL until the matrix is exposed and evidence is cell-local.

- [ ] **Step 3: Complete integration without adding explanation prose**

Expose the parsed matrix on the internal pipeline candidate result or a sibling auditable field consumed by the ledger. Do not add LLM text. Extend `generate-factor-regression-golden.mjs` so both East 1 decisions and every compared candidate contain the exact `threat_risk_request` and real sidecar `threat_risk_result`. Reuse the script-local `BuildArtifactFactEngineTransport` introduced in Task 5; it is never exported or used by production, and production `ManagedFactEngineTransport` integrity checks remain unchanged. Update `RegressionFactEngine` to return those pinned results instead of throwing on threat analysis and bind lookup by `(actionRef, stateHash, threatActor)`, never by action alone. Regenerate the golden only through the commands below; never hand-edit sidecar values.

```ts
return {
  analysisMode,
  ledgers,
  defenseMatrices: analyzed.map((entry) => entry.defenseMatrix)
    .sort((left, right) => left.actionRef.localeCompare(right.actionRef)),
  differences: preferenceDifferences,
  deterministicPreference,
  diagnostics,
};
```

- [ ] **Step 4: Run regression gates**

```powershell
cd coach
npm run build:fact-engine
npm run build
npm run generate:factor-regression-golden
npx vitest run packages/reasoning/tests/canonical-replay-invariance.test.ts packages/reasoning/tests/structured-factor-regression.test.ts packages/reasoning/tests/structured-factor-pipeline.test.ts
npm run typecheck
```

Expected: all PASS with the pinned East 1 semantics.

- [ ] **Step 5: Commit Task 8 files**

```powershell
git add -- coach/packages/reasoning/tests/canonical-replay-invariance.test.ts coach/packages/reasoning/tests/structured-factor-regression.test.ts coach/packages/reasoning/tests/structured-factor-pipeline.test.ts coach/scripts/generate-factor-regression-golden.mjs coach/fixtures/mahjong-facts/c1924cad66f66dd9-east1-turn6-7.json
git diff --cached --name-only
git diff --cached --check
git commit -m "test: lock per-threat defense regressions"
```

If the fixture did not change, do not stage it.

---

### Task 9: Rebuild, package, document, and review M2-C V1

**Files:**
- Modify: `coach/resources/mahjong-facts/windows-x64/mahjong-facts.exe`
- Modify: `coach/resources/mahjong-facts/windows-x64/manifest.json`
- Modify: `coach/packages/reasoning/src/fact-engine/packaged-manifest.ts`
- Verify: `coach/scripts/update-packaged-fact-engine-manifest.mjs`
- Test: `coach/scripts/update-packaged-fact-engine-manifest.test.mjs`
- Modify: `coach/README.md`
- Create: `coach/docs/handoffs/2026-08-09-per-threat-defense-matrix-handoff.md`
- Modify: `coach/docs/plans/2026-08-01-llm-riichi-coach-product-roadmap.md`
- Test: `coach/smoke/package-import-smoke.mjs`

- [ ] **Step 1: Rebuild deterministically twice and verify identical hashes**

```powershell
$env:Path='C:\Users\Roland\AppData\Local\CodexTools\go1.24.13\go\bin;' + $env:Path
cd coach
npm run build:fact-engine
Get-FileHash ../.tools/mahjong-facts/windows-x64/mahjong-facts.exe -Algorithm SHA256
npm run build:fact-engine
Get-FileHash ../.tools/mahjong-facts/windows-x64/mahjong-facts.exe -Algorithm SHA256
```

Expected: both SHA-256 values and sizes are identical.

- [ ] **Step 2: Verify the pinned trust manifests and package resource**

Task 5 already atomically generated the trusted manifests from the 0.2.0 bytes. Re-run the updater's pure-function tests, then require the newly rebuilt artifact to pass the existing manifest/toolchain/identity gate without rewriting the trust root. Any mismatch is a release failure to investigate, not permission to silently accept new bytes.

```powershell
cd coach
node --test scripts/update-packaged-fact-engine-manifest.test.mjs
npm run package:fact-engine
npm run test:fact-engine
```

Expected: manifest/toolchain/identity verification and Go tests PASS.

- [ ] **Step 3: Update package smoke and docs**

Smoke-test public `DEFENSE_MATRIX_SCHEMA_VERSION`, `DefenseMatrixV1Schema`, and the matrix builder/assembly export. README and handoff must state:

- deterministic vs structural evidence boundary;
- no cross-threat aggregation;
- no probability interpretation;
- supported riichi structural analysis and typed user-marked-open rows whose structural risk remains explicitly unsupported in V1;
- exact tests/hash/size;
- remaining behavioral/wait heuristics, M5, M2-B/D, LLM/UI.

Update the roadmap to mark M2-C V1 deterministic/structural matrix complete while keeping behavioral/wait inference pending.

- [ ] **Step 4: Run every acceptance gate**

```powershell
cd coach
npm test
npm run typecheck
npm run test:package-import
npm run test:fact-engine
npm audit --omit=dev
cd ..
node --test tests/*.mjs
```

Expected: every command PASS and audit reports zero vulnerabilities.

- [ ] **Step 5: Request independent full-slice review**

Use the `requesting-code-review` skill. Review from the commit immediately before Task 1 through current HEAD plus uncommitted Task 9 files. Require explicit counts for Critical, Important, Minor and Ready. Any Critical or Important must receive a focused failing regression before its fix, then the same reviewer must confirm closure.

- [ ] **Step 6: Re-run release gates after review closure**

After the reviewer reports Critical 0 / Important 0, run Step 4 again. If any review fix touched Go, protocol identity, golden generation, manifest code, or the packaged resource, first repeat Steps 1–2, confirm both deterministic build hashes, regenerate affected goldens, update both manifests through the tested script, and package again. The final reported hash/size and test counts must come from this post-review run.

- [ ] **Step 7: Commit packaged code, then docs, without protected files**

```powershell
git add -- coach/resources/mahjong-facts/windows-x64/mahjong-facts.exe coach/resources/mahjong-facts/windows-x64/manifest.json coach/packages/reasoning/src/fact-engine/packaged-manifest.ts coach/scripts/update-packaged-fact-engine-manifest.mjs coach/scripts/update-packaged-fact-engine-manifest.test.mjs coach/smoke/package-import-smoke.mjs
git diff --cached --name-only
git diff --cached --check
git commit -m "chore: package per-threat defense matrix"

git add -- coach/README.md coach/docs/handoffs/2026-08-09-per-threat-defense-matrix-handoff.md coach/docs/plans/2026-08-01-llm-riichi-coach-product-roadmap.md
git diff --cached --name-only
git diff --cached --check
git commit -m "docs: hand off per-threat defense matrix"
```

Never stage:

- `coach/docs/plans/2026-08-08-hand-structure-furiten.md`
- `overlay/cv重做.md`
- `overlay/prompt.md`

---

## Final self-review checklist

- Every threat kind has a typed row even when structural analysis is blocked or unsupported.
- `ippatsu` and `riichiTurn` missingness does not block unrelated genbutsu facts.
- Threat actor's own discard and cross-player passed tile use distinct evidence roles.
- Structural results are request/action/state/threat/scale/evidence bound.
- Helper `genbutsu` cannot duplicate or weaken local deterministic genbutsu.
- No structural dimension is registered for deterministic preference.
- No multi-threat aggregate numeric fact exists.
- East 1 turn 6/7 axes and applied null preference remain unchanged.
- Model-score deletion invariance covers the complete matrix.
- README, roadmap, handoff, packaged manifest and actual binary agree.
- Full review ends at Critical 0 and Important 0.
