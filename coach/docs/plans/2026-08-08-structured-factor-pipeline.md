# Structured Factor Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned mahjong fact sidecar and a structured FactorPipeline that turns canonical riichi actions into auditable deterministic and heuristic ledgers without allowing model scores or upstream recommendations to influence factual preference.

**Architecture:** A pinned Go JSONL sidecar wraps `EndlessCheng/mahjong-helper/util` and exposes only strict hand, score, and threat-risk results. TypeScript projects each `StructuredComparisonCandidate` into an immutable known state, validates sidecar results, maps them into five-axis ledgers, builds deterministic and heuristic differences separately, and resolves only deterministic dominance. The legacy `ActionId` pipeline remains as a regression oracle until the East 1 turn 6/7 fixtures agree.

**Tech Stack:** TypeScript 5.9, Zod 3.25, Vitest 3.2, Node.js child processes, Go 1.24 build toolchain, `EndlessCheng/mahjong-helper` pinned at `514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0`.

---

## File map

### Contracts

- `coach/packages/contracts/src/known-game-facts.ts`: immutable factual input used by every candidate.
- `coach/packages/contracts/src/fact-engine.ts`: strict JSONL request/response and engine identity schemas.
- `coach/packages/contracts/src/factor-ledger.ts`: fact entries, five-axis ledgers, differences, and deterministic preference.
- `coach/packages/contracts/src/index.ts`: public exports.
- matching tests under `coach/packages/contracts/tests/`.

### Go sidecar

- `coach/tools/mahjong-facts/go.mod`, `go.sum`: pinned module graph.
- `coach/tools/mahjong-facts/main.go`: JSONL loop; stdout contains protocol data only.
- `coach/tools/mahjong-facts/protocol.go`: envelopes, validation, and structured errors.
- `coach/tools/mahjong-facts/convert.go`: Tile34, meld, red-five, and wind conversion.
- `coach/tools/mahjong-facts/hand13.go`: shanten, waits, improves, yaku IDs, and upstream estimates.
- `coach/tools/mahjong-facts/score.go`: completed-hand point wrapper with explicit unsupported han/fu.
- `coach/tools/mahjong-facts/risk.go`: per-threat risk and wall/suji classifications.
- matching Go tests, third-party notice, license, and Windows build script.

### TypeScript reasoning

- `coach/packages/reasoning/src/fact-engine/`: source-neutral port, strict client, and managed process.
- `coach/packages/reasoning/src/factors/tile34.ts`: exact tile conversion.
- `coach/packages/reasoning/src/factors/candidate-projector.ts`: immutable per-action projection.
- `coach/packages/reasoning/src/factors/local-defense.ts`: replay-grounded riichi, ippatsu, and genbutsu.
- `coach/packages/reasoning/src/factors/ledger-builder.ts`: raw results to typed ledger entries.
- `coach/packages/reasoning/src/factors/difference-builder.ts`: deterministic and heuristic differences.
- `coach/packages/reasoning/src/factors/deterministic-resolver.ts`: dominance.
- `coach/packages/reasoning/src/factors/structured-factor-pipeline.ts`: orchestration.
- matching tests under `coach/packages/reasoning/tests/`.

## Baseline and execution rules

- Work from `E:\文档\日麻教学`; run Node commands from `coach` unless stated otherwise.
- Do not modify or stage `overlay/cv重做.md` or `overlay/prompt.md`.
- Every task follows RED → GREEN and ends in an isolated commit.
- Before every commit run `git diff --cached --name-only` and `git diff --cached --check`.
- Current baseline: 30 Vitest files / 209 tests, typecheck, and package-import smoke.
- `Hand14AnalysisResultList.Sort`, helper recommendations, Mortal scores, Akagi logits, and LLM output are forbidden resolver inputs.

### Task 1: Known game facts and fact-engine protocol contracts

**Files:**
- Create: `coach/packages/contracts/src/known-game-facts.ts`
- Create: `coach/packages/contracts/src/fact-engine.ts`
- Modify: `coach/packages/contracts/src/candidate-contracts.ts`
- Modify: `coach/packages/contracts/src/index.ts`
- Test: `coach/packages/contracts/tests/known-game-facts.test.ts`
- Test: `coach/packages/contracts/tests/fact-engine.test.ts`

- [ ] **Step 1: Write failing known-facts tests**

```ts
import { describe, expect, it } from "vitest";
import { KnownGameFactsSchema } from "../src/index.js";

const tile = (id: "1m" | "5p" | "6s", red = false) => ({ id, red });

describe("KnownGameFactsSchema", () => {
  it("keeps exact red identity and per-field completeness", () => {
    const parsed = KnownGameFactsSchema.parse({
      factSetId: "facts:e1:t6",
      provenance: "raw_replay",
      actor: 3,
      decisionEventRef: "event-58",
      decisionWindow: { kind: "self_turn", actor: 3, triggerEventRef: "event-58" },
      concealedTiles: [tile("1m"), tile("5p", true)],
      currentDraw: { tile: tile("6s"), eventRef: "event-58" },
      melds: [],
      doraIndicators: [tile("1m")],
      rivers: [[], [], [], []],
      threats: [],
      roundWind: "E",
      seatWind: "N",
      dealer: false,
      remainingDraws: 50,
      completeness: {
        concealedTiles: true, melds: true, doraIndicators: true,
        rivers: true, remainingDraws: true,
      },
      evidenceIds: ["event-58"],
    });
    expect(parsed.concealedTiles[1]).toEqual(tile("5p", true));
  });

  it("accepts a four-tile kakan as known state", () => {
    const parsed = KnownGameFactsSchema.parse({
      factSetId: "facts:kakan", provenance: "user_asserted",
      actor: 0, decisionEventRef: "event-kakan",
      decisionWindow: { kind: "self_turn", actor: 0, triggerEventRef: "event-kakan" },
      concealedTiles: [], currentDraw: null,
      melds: [{
        meldRef: "meld-1", kind: "kakan",
        tiles: [tile("1m"), tile("1m"), tile("1m"), tile("1m")],
      }],
      doraIndicators: [], rivers: [[], [], [], []], threats: [],
      roundWind: "E", seatWind: "E", dealer: true, remainingDraws: null,
      completeness: {
        concealedTiles: true, melds: true, doraIndicators: true,
        rivers: true, remainingDraws: false,
      },
      evidenceIds: ["event-kakan"],
    });
    expect(parsed.melds[0]?.kind).toBe("kakan");
  });

  it("rejects duplicate evidence and a self threat", () => {
    const invalid = {
      factSetId: "facts:bad", provenance: "raw_replay",
      actor: 3, decisionEventRef: "event-1",
      decisionWindow: { kind: "self_turn", actor: 3, triggerEventRef: "event-1" },
      concealedTiles: [], currentDraw: null, melds: [], doraIndicators: [],
      rivers: [[], [], [], []],
      threats: [{ actor: 3, riichi: true, declarationEventId: "r", ippatsuAlive: true }],
      roundWind: "E", seatWind: "N", dealer: false, remainingDraws: null,
      completeness: {
        concealedTiles: true, melds: true, doraIndicators: true,
        rivers: true, remainingDraws: false,
      },
      evidenceIds: ["event-1", "event-1"],
    };
    expect(() => KnownGameFactsSchema.parse(invalid)).toThrow();
  });
});
```

- [ ] **Step 2: Write failing strict protocol tests**

```ts
import { describe, expect, it } from "vitest";
import {
  EngineIdentitySchema, Hand13FactResultSchema, Tile34CountsSchema,
} from "../src/index.js";

describe("fact engine contracts", () => {
  it("requires exactly 34 finite integer counts", () => {
    expect(Tile34CountsSchema.parse(Array(34).fill(0))).toHaveLength(34);
    expect(() => Tile34CountsSchema.parse(Array(33).fill(0))).toThrow();
    expect(() => Tile34CountsSchema.parse([...Array(33).fill(0), 5])).toThrow();
  });

  it("rejects an upstream recommendation field", () => {
    const identity = {
      engine: "mahjong-helper",
      upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
      adapterVersion: "1.0.0",
      protocolVersion: "mahjong-facts/v1",
    };
    expect(EngineIdentitySchema.parse(identity).engine).toBe("mahjong-helper");
    expect(() => Hand13FactResultSchema.parse({
      requestId: "req-1", protocolVersion: "mahjong-facts/v1",
      actionRef: "action:v1:test", stateHash: "sha256:test", identity,
      kind: "hand13_result", shanten: 1,
      effectiveTile34: [2],
      waitsRemainingStatus: "calculated",
      waitsRemaining: [{ tile34: 2, count: 4 }], improves: [],
      doraCount: 0, estimates: [], diagnostics: [],
      recommendedDiscard: 2,
    })).toThrow();
  });
});
```

- [ ] **Step 3: Run RED**

Run:

```powershell
npx vitest run packages/contracts/tests/known-game-facts.test.ts packages/contracts/tests/fact-engine.test.ts
```

Expected: FAIL because the new schemas are absent.

- [ ] **Step 4: Implement strict schemas**

First extend canonical `KnownMeldSchema` with `kakan`; it has four identical tiles, like other kans. Then `known-game-facts.ts` reuses `DecisionWindowSchema`, `KnownMeldSchema`, `RiverDiscardSchema`, `ThreatStateSchema`, and `TileSchema`. It carries `provenance: "raw_replay" | "user_asserted" | "mixed"`. Add refinements for four rivers, unique evidence IDs, unique threat actors, no self-threat, and `dealer === (seatWind === "E")`.

`fact-engine.ts` must expose:

```ts
export const FACT_ENGINE_PROTOCOL_VERSION = "mahjong-facts/v1" as const;
export const MAHJONG_HELPER_COMMIT =
  "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0" as const;

export const Tile34CountsSchema =
  z.array(z.number().int().min(0).max(4)).length(34);

export const Tile34CountSchema = z.object({
  tile34: z.number().int().min(0).max(33),
  count: z.number().int().min(0).max(4),
}).strict();

export const EngineIdentitySchema = z.object({
  engine: z.literal("mahjong-helper"),
  upstreamCommit: z.literal(MAHJONG_HELPER_COMMIT),
  adapterVersion: z.string().min(1),
  protocolVersion: z.literal(FACT_ENGINE_PROTOCOL_VERSION),
}).strict();
```

Define strict discriminated requests/results for `identity`, `hand13`, `completed_hand`, and `threat_risk`. Every result carries request ID, protocol, action ref, state hash, identity, and diagnostics. Hand13 carries shanten, sorted unique `effectiveTile34`, independently statused `waitsRemaining`, improves, deterministic dora count, and estimate records for yaku IDs and numeric upstream fields. Completed hand carries `point`, `fixedPoint`, plus literal `unsupported_upstream_api` han/fu statuses. Threat risk carries one actor, 34 finite nonnegative scale values, named structural classes, and limitations. Unknown fields fail.

Use these request shapes as the cross-language field inventory:

```ts
type MeldFactInput = {
  kind: "chi" | "pon" | "daiminkan" | "ankan" | "kakan";
  tiles34: number[];
};

type Hand13FactRequest = RequestIdentity & {
  kind: "hand13";
  handTiles34: number[];
  leftTiles34: number[] | null;
  visibleCountsComplete: boolean;
  melds: MeldFactInput[];
  doraTiles34: number[];
  redFiveCounts: [number, number, number];
  roundWindTile34: number;
  selfWindTile34: number;
  dealer: boolean;
  riichi: boolean;
  selfDiscards34: number[];
  remainingDraws: number | null;
};

type CompletedHandFactRequest = RequestIdentity & {
  kind: "completed_hand";
  completedHandTiles34: number[];
  melds: MeldFactInput[];
  doraTiles34: number[];
  redFiveCounts: [number, number, number];
  roundWindTile34: number;
  selfWindTile34: number;
  dealer: boolean;
  riichi: boolean;
  tsumo: boolean;
  winTile34: number;
  selfDiscards34: number[];
};

type ThreatRiskFactRequest = RequestIdentity & {
  kind: "threat_risk";
  threatActor: number;
  turns: number;
  safeTiles34: boolean[];
  leftTiles34: number[];
  doraTiles34: number[];
  roundWindTile34: number;
  threatWindTile34: number;
  earlyOutsideTiles34: number[];
  evidenceIds: string[];
};
```

Add to `index.ts`:

```ts
export * from "./known-game-facts.js";
export * from "./fact-engine.js";
```

- [ ] **Step 5: Run GREEN and typecheck**

```powershell
npx vitest run packages/contracts/tests/known-game-facts.test.ts packages/contracts/tests/fact-engine.test.ts
npm run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 6: Commit**

Stage only Task 1 files, including the canonical known-meld change, check cached names and whitespace, then:

```powershell
git commit -m "feat: define mahjong fact engine contracts"
```

### Task 2: Ledger, differences, and preference contracts

**Files:**
- Create: `coach/packages/contracts/src/factor-ledger.ts`
- Modify: `coach/packages/contracts/src/index.ts`
- Test: `coach/packages/contracts/tests/factor-ledger.test.ts`

- [ ] **Step 1: Write failing evidence-separation tests**

```ts
import { describe, expect, it } from "vitest";
import {
  CandidateFactorLedgerSchema, FactorDifferenceSchema, canonicalActionRef,
} from "../src/index.js";

const left = canonicalActionRef({
  kind: "discard", tile: { id: "6s", red: false }, discardMode: "tsumogiri",
});
const right = canonicalActionRef({
  kind: "discard", tile: { id: "2p", red: false }, discardMode: "tedashi",
});

describe("structured factor ledger", () => {
  it("forbids heuristic evidence from deterministic eligibility", () => {
    expect(() => CandidateFactorLedgerSchema.parse({
      actionRef: left,
      projectedStateRef: "state:1",
      axes: [{
        axis: "defense", status: "calculated",
        facts: [{
          factorKey: "defense.helper_risk.actor2",
          dimension: "helper_risk_scale",
          status: "calculated",
          evidenceClass: "versioned_upstream_estimate",
          preferenceEligibility: "deterministic",
          value: { kind: "number", value: 7.2, unit: "helper_risk_scale" },
          evidenceIds: ["event-riichi"],
          limitations: ["Not a calibrated Mortal deal-in probability"],
        }],
      }],
      diagnostics: [],
    })).toThrow();
  });

  it("parses a separate heuristic difference", () => {
    expect(FactorDifferenceSchema.parse({
      differenceId: "difference:risk",
      kind: "heuristic_difference",
      axis: "defense", dimension: "helper_risk_scale",
      leftActionRef: left, rightActionRef: right,
      direction: "supports_left",
      leftValue: { kind: "number", value: 2.1, unit: "helper_risk_scale" },
      rightValue: { kind: "number", value: 8, unit: "helper_risk_scale" },
      evidenceClass: "versioned_upstream_estimate",
      evidenceIds: ["event-riichi"],
      limitations: ["Same pinned helper version"],
    }).kind).toBe("heuristic_difference");
  });
});
```

- [ ] **Step 2: Run RED**

Run `npx vitest run packages/contracts/tests/factor-ledger.test.ts`.

Expected: FAIL because schemas do not exist.

- [ ] **Step 3: Implement ledger schemas**

Define:

```ts
export const FactorEvidenceClassSchema = z.enum([
  "deterministic_allowlisted",
  "deterministic_under_assumptions",
  "deterministic_local_replay",
  "versioned_upstream_estimate",
]);
export const PreferenceEligibilitySchema =
  z.enum(["deterministic", "heuristic_only", "ineligible"]);
export const FactorStatusSchema = z.enum([
  "calculated", "blocked_missing_facts", "blocked_engine_failure",
  "unsupported_action_in_slice", "unsupported_dimension",
  "unsupported_upstream_api",
]);
export const AxisRunStatusSchema = z.enum([
  "calculated", "skipped_out_of_scope", "blocked_missing_facts",
  "blocked_engine_failure", "unsupported_action_in_slice",
  "unsupported_dimension",
]);
```

Use tagged factor values: `number`, `boolean`, `classification`, `tile_counts`, and `integer_ids`. Calculated facts require values; blocked facts forbid values. `versioned_upstream_estimate` requires `heuristic_only`; all deterministic classes forbid it. Define one ledger per action, deterministic and heuristic difference variants, and nullable deterministic preference with unique non-empty actions, scope, decisive difference IDs, and complete/partial coverage.

Export:

```ts
export * from "./factor-ledger.js";
```

- [ ] **Step 4: Run GREEN and typecheck**

```powershell
npx vitest run packages/contracts/tests/factor-ledger.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: define structured factor ledgers"
```

### Task 3: Pinned Go JSONL shell and supply-chain notice

**Files:**
- Create: `coach/tools/mahjong-facts/go.mod`
- Create: `coach/tools/mahjong-facts/go.sum`
- Create: `coach/tools/mahjong-facts/main.go`
- Create: `coach/tools/mahjong-facts/protocol.go`
- Create: `coach/tools/mahjong-facts/protocol_test.go`
- Create: `coach/tools/mahjong-facts/THIRD_PARTY_NOTICES.md`
- Create: `coach/tools/mahjong-facts/third_party/mahjong-helper-LICENSE`
- Create: `coach/scripts/build-fact-engine.ps1`
- Modify: `coach/package.json`

- [ ] **Step 1: Bootstrap a pinned developer Go 1.24 toolchain outside the repo**

Verify `go version` begins with `go version go1.24`. Do not commit the toolchain or add a product setting.

- [ ] **Step 2: Write RED protocol tests**

```go
func TestHandleIdentity(t *testing.T) {
	got := handleLine([]byte(`{"kind":"identity","requestId":"req-1","protocolVersion":"mahjong-facts/v1"}`))
	var result IdentityResult
	require.NoError(t, json.Unmarshal(got, &result))
	require.Equal(t, "req-1", result.RequestID)
	require.Equal(t, helperCommit, result.Identity.UpstreamCommit)
}

func TestUnknownFieldFailsClosed(t *testing.T) {
	got := handleLine([]byte(`{"kind":"identity","requestId":"req-1","protocolVersion":"mahjong-facts/v1","recommendation":"6s"}`))
	var result ErrorResult
	require.NoError(t, json.Unmarshal(got, &result))
	require.Equal(t, "invalid_request", result.Code)
}
```

- [ ] **Step 3: Run RED**

From `coach/tools/mahjong-facts`, run `go test ./...`.

Expected: FAIL because the module and handler are absent.

- [ ] **Step 4: Implement strict protocol and build**

Use:

```go
module github.com/riichi-coach/mahjong-facts

go 1.24

require github.com/EndlessCheng/mahjong-helper v0.0.0-20220623011142-514bb97c5a6d
```

Decode with `json.Decoder.DisallowUnknownFields()`. `handleLine` returns structured JSON errors for malformed data, unknown fields/kinds, and protocol mismatch; it never panics. `main.go` scans 4 MiB lines, writes exactly one JSON response per line, and logs only to stderr.

The build script resolves `$coachRoot` from its own directory, creates the ignored output directory, changes into the nested Go module, and runs:

```powershell
$repoRoot = Split-Path $coachRoot -Parent
$output = "$repoRoot\.tools\mahjong-facts\windows-x64\mahjong-facts.exe"
Push-Location "$coachRoot\tools\mahjong-facts"
try { go build -trimpath -ldflags "-s -w" -o $output . }
finally { Pop-Location }
```

Add package scripts:

```json
"build:fact-engine": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-fact-engine.ps1",
"test:fact-engine": "cd tools/mahjong-facts && go test ./..."
```

Run `go mod tidy`. Copy the exact MIT license and record repository, commit, imported package, and adapter purpose.

- [ ] **Step 5: Run GREEN and smoke**

```powershell
npm run test:fact-engine
npm run build:fact-engine
'{"kind":"identity","requestId":"smoke","protocolVersion":"mahjong-facts/v1"}' | ..\.tools\mahjong-facts\windows-x64\mahjong-facts.exe
```

Expected: tests pass and one clean JSON line is emitted.

- [ ] **Step 6: Commit**

```powershell
git commit -m "feat: add pinned mahjong facts sidecar"
```

### Task 4: Hand13 facts and upstream value estimates

**Files:**
- Create: `coach/tools/mahjong-facts/convert.go`
- Create: `coach/tools/mahjong-facts/hand13.go`
- Create: `coach/tools/mahjong-facts/hand13_test.go`
- Modify: `coach/tools/mahjong-facts/protocol.go`

- [ ] **Step 1: Write RED golden tests**

Use complete 34-count fixtures and assert:

```go
require.Equal(t, 0, result.Shanten)
require.Equal(t, []int{2, 5}, result.EffectiveTile34)
require.Equal(t, []TileCount{{Tile34: 2, Count: 4}, {Tile34: 5, Count: 3}}, result.WaitsRemaining)
require.ElementsMatch(t, expectedYakuIDs, estimateByField(result.Estimates, "yaku_types").IntegerValues)
require.Equal(t, 1, result.DoraCount)
require.NotNil(t, estimateByField(result.Estimates, "dama_point").NumericValue)
```

Add an incomplete-visible-count fixture that preserves `Shanten` and `EffectiveTile34`, sets `WaitsRemainingStatus` to `blocked_missing_facts`, and returns no remaining counts. The implementation may use theoretical 4-minus-own-hand counts internally to identify structural effective tile types, but it must not expose those counts as live remaining tiles.

- [ ] **Step 2: Run RED**

Run `go test ./... -run Hand13 -v`.

Expected: FAIL because analysis and converters are absent.

- [ ] **Step 3: Implement conversion and analysis**

Validate 34-count vectors. Map meld kinds to `model.Meld`, red counts by suit, and E/S/W/N to Tile34 27/28/29/30. Construct `model.PlayerInfo`, set every supplied context field, and call only:

```go
result := util.CalculateShantenWithImproves13(playerInfo)
```

Normalize maps into sorted arrays. Return shanten and structural effective tile types even with incomplete public visibility; return remaining counts only when complete. Return improves, dora count, and estimates for `YakuTypes`, `DamaPoint`, `RiichiPoint`, `MixedWaitsScore`, `AvgAgariRate`, `FuritenRate`, and `MixedRoundPoint`, each with non-empty limitations. Never call helper sorting/recommendation methods.

- [ ] **Step 4: Run GREEN**

```powershell
go test ./... -run Hand13 -v
go test ./...
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: expose helper hand facts"
```

### Task 5: Completed points and threat risk

**Files:**
- Create: `coach/tools/mahjong-facts/score.go`
- Create: `coach/tools/mahjong-facts/score_test.go`
- Create: `coach/tools/mahjong-facts/risk.go`
- Create: `coach/tools/mahjong-facts/risk_test.go`
- Modify: `coach/tools/mahjong-facts/protocol.go`

- [ ] **Step 1: Write RED tests**

```go
func TestCompletedHandReturnsPointButNotPrivateFuHan(t *testing.T) {
	result := analyzeCompletedHand(completePinfuRonRequest())
	require.Equal(t, 1000, result.Point)
	require.Equal(t, "unsupported_upstream_api", result.HanStatus)
	require.Equal(t, "unsupported_upstream_api", result.FuStatus)
}

func TestThreatRiskKeepsGenbutsuAndWallClasses(t *testing.T) {
	result := analyzeThreatRisk(wallAndSujiRequest())
	require.Equal(t, 0.0, result.RiskScale[knownGenbutsuTile])
	require.Contains(t, result.Classifications, StructuralRisk{Tile34: wallTile, Kind: "wall"})
	require.Contains(t, result.Classifications, StructuralRisk{Tile34: oneChanceTile, Kind: "one_chance"})
	require.NotEmpty(t, result.Limitations)
}
```

- [ ] **Step 2: Run RED**

Run `go test ./... -run 'CompletedHand|ThreatRisk' -v`.

Expected: FAIL.

- [ ] **Step 3: Implement public score and risk wrappers**

Construct full `model.PlayerInfo`, set win mode/tile, winds, dealer, riichi, melds, red, and dora, then:

```go
pointResult := util.CalcPoint(playerInfo)
```

Return `Point` and `FixedPoint`; han/fu remain literal unsupported. Never parse display strings.

For each threat:

```go
risk := util.CalculateRiskTiles34(
	req.Turns, req.SafeTiles34, req.LeftTiles34, req.DoraTiles,
	req.RoundWindTile, req.ThreatSeatWindTile,
)
risk.FixWithEarlyOutside(req.EarlyOutsideTiles34)
```

`EarlyOutsideTiles34` contains only the threat's replay-derived early-outside set, not the whole river. Also expose sorted `CalculateLeftNoSujiTiles`, `CalcWallTiles`, `CalcNCSafeTiles`, `CalcDNCSafeTilesWithDiscards`, and `CalcOCSafeTiles` results. Preserve named safe types. Never combine threats into one probability.

- [ ] **Step 4: Run GREEN**

```powershell
go test ./... -run 'CompletedHand|ThreatRisk' -v
go test ./...
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: expose helper score and risk facts"
```

### Task 6: Source-neutral port and managed JSONL client

**Files:**
- Create: `coach/packages/reasoning/src/fact-engine/port.ts`
- Create: `coach/packages/reasoning/src/fact-engine/jsonl-client.ts`
- Create: `coach/packages/reasoning/src/fact-engine/managed-sidecar.ts`
- Test: `coach/packages/reasoning/tests/fact-engine-client.test.ts`

- [ ] **Step 1: Write RED tests with injected transports**

```ts
it("validates result bindings", async () => {
  const client = new JsonlFactEngineClient(new FixtureTransport(validHand13Result()));
  await expect(client.analyzeHand13(validHand13Request()))
    .resolves.toMatchObject({ kind: "hand13_result", shanten: 1 });
});

it("rejects state hash mismatch", async () => {
  const client = new JsonlFactEngineClient(
    new FixtureTransport({ ...validHand13Result(), stateHash: "sha256:wrong" }),
  );
  await expect(client.analyzeHand13(validHand13Request()))
    .rejects.toThrow("state_hash_mismatch");
});

it("restarts once after transport failure", async () => {
  const transport = new RestartCountingTransport([new Error("crash"), new Error("crash")]);
  await expect(new JsonlFactEngineClient(transport).analyzeHand13(validHand13Request()))
    .rejects.toThrow("fact_engine_unavailable");
  expect(transport.restartCount).toBe(1);
});
```

- [ ] **Step 2: Run RED**

Run `npx vitest run packages/reasoning/tests/fact-engine-client.test.ts`.

Expected: FAIL.

- [ ] **Step 3: Implement interfaces and fail-closed client**

```ts
export interface FactEngineTransport {
  request(line: string, timeoutMs: number): Promise<string>;
  restart(): Promise<void>;
  close(): Promise<void>;
}

export interface MahjongFactEnginePort {
  identity(): Promise<EngineIdentity>;
  analyzeHand13(request: Hand13FactRequest): Promise<Hand13FactResult>;
  analyzeCompletedHand(request: CompletedHandFactRequest): Promise<CompletedHandFactResult>;
  analyzeThreatRisk(request: ThreatRiskFactRequest): Promise<ThreatRiskFactResult>;
  close(): Promise<void>;
}
```

The client validates the matching strict schema and request ID/action ref/state hash/identity. Retry transport failure exactly once; never retry schema or identity violation. The managed transport owns one process, readline queue, timeout, stderr diagnostics, and pending rejection on exit. `resolveManagedFactEngineBinary(appResourcesDir)` resolves only `mahjong-facts/windows-x64/mahjong-facts.exe` below app resources; no product path setting.

- [ ] **Step 4: Run GREEN and typecheck**

```powershell
npx vitest run packages/reasoning/tests/fact-engine-client.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: add managed mahjong fact client"
```

### Task 7: Exact candidate projection

**Files:**
- Create: `coach/packages/reasoning/src/factors/tile34.ts`
- Create: `coach/packages/reasoning/src/factors/candidate-projector.ts`
- Test: `coach/packages/reasoning/tests/candidate-projector.test.ts`

- [ ] **Step 1: Write RED projection tests**

```ts
it("projects a red-five discard without merging identity", () => {
  const projected = projectCandidate(redFiveDiscardCandidate(), knownFactsWithRedFive());
  expect(projected.status).toBe("ready");
  if (projected.status !== "ready") throw new Error("expected ready");
  expect(projected.hand13Request?.redFiveCounts).toEqual([0, 0, 0]);
  expect(projected.actionRef).toBe(redFiveDiscardCandidate().actionRef);
});

it("projects tsumogiri and tedashi from different sources", () => {
  expect(projectCandidate(tsumogiriSixSou(), turnSixFacts()).status).toBe("ready");
  expect(projectCandidate(tedashiTwoPin(), turnSixFacts()).status).toBe("ready");
});

it("requires complete win context for ron", () => {
  expect(projectCandidate(ronCandidate(), incompleteWinningFacts()))
    .toMatchObject({ status: "blocked_missing_facts" });
});

it("marks chi unsupported instead of inventing a hand", () => {
  expect(projectCandidate(chiCandidate(), chiFacts()))
    .toMatchObject({ status: "unsupported_action_in_slice" });
});
```

- [ ] **Step 2: Run RED**

Run `npx vitest run packages/reasoning/tests/candidate-projector.test.ts`.

Expected: FAIL.

- [ ] **Step 3: Implement immutable projection**

Export `tileIdTo34`, `tilesTo34Counts`, `redFiveCounts`, `doraFromIndicator`, and SHA-256 `stableProjectedStateHash`. Never derive action refs from Tile34.

```ts
export type CandidateProjection =
  | {
      status: "ready"; actionRef: ActionRef; projectedStateRef: string;
      hand13Request?: Hand13FactRequest;
      completedHandRequest?: CompletedHandFactRequest;
      threatRiskRequests: ThreatRiskFactRequest[];
      localEvidenceIds: string[];
    }
  | {
      status: "blocked_missing_facts" | "unsupported_action_in_slice";
      actionRef: ActionRef; diagnostic: string;
    };
```

Clone arrays. Discard exactly the specified red/non-red tile from current draw for tsumogiri or concealed tiles for tedashi. Derive unseen counts only when public visibility fields are complete. Create one risk request per riichi threat. Create completed-hand request for tsumo/ron only with complete win context.

- [ ] **Step 4: Run GREEN and typecheck**

```powershell
npx vitest run packages/reasoning/tests/candidate-projector.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: project structured candidate states"
```

### Task 8: Local defense and allowlisted ledger builder

**Files:**
- Create: `coach/packages/reasoning/src/factors/local-defense.ts`
- Create: `coach/packages/reasoning/src/factors/ledger-builder.ts`
- Test: `coach/packages/reasoning/tests/structured-ledger-builder.test.ts`

- [ ] **Step 1: Write RED mapping tests**

```ts
it("keeps genbutsu deterministic and helper risk heuristic", () => {
  const ledger = buildCandidateLedger(turnSixInputs());
  expect(fact(ledger, "defense.genbutsu.actor2")).toMatchObject({
    evidenceClass: "deterministic_local_replay",
    preferenceEligibility: "deterministic",
  });
  expect(fact(ledger, "defense.helper_risk.actor2")).toMatchObject({
    evidenceClass: "versioned_upstream_estimate",
    preferenceEligibility: "heuristic_only",
  });
});

it("maps helper value estimates but never recommendation order", () => {
  const ledger = buildCandidateLedger(valueInputs());
  expect(fact(ledger, "value.dama_point").preferenceEligibility).toBe("heuristic_only");
  expect(JSON.stringify(ledger)).not.toContain("recommended");
});

it("blocks only remaining counts for incomplete visibility", () => {
  const ledger = buildCandidateLedger(incompleteVisibilityInputs());
  expect(fact(ledger, "efficiency.shanten").status).toBe("calculated");
  expect(fact(ledger, "efficiency.ukeire_remaining").status)
    .toBe("blocked_missing_facts");
});

it("skips defense for an explicit flat-discard scope", () => {
  const ledger = buildCandidateLedger({
    ...turnSixInputs(), scope: { kind: "flat_discard" },
  });
  expect(ledger.axes.find((axis) => axis.axis === "defense")?.status)
    .toBe("skipped_out_of_scope");
});
```

- [ ] **Step 2: Run RED**

Run `npx vitest run packages/reasoning/tests/structured-ledger-builder.test.ts`.

Expected: FAIL.

- [ ] **Step 3: Implement local evidence and explicit mappings**

Port event-ID genbutsu logic without action-string parsing. Build one local fact per threat.

Use this exact estimate mapping:

```ts
const estimateDimensions = {
  yaku_types: ["value", "yaku_types"],
  dama_point: ["value", "dama_point"],
  riichi_point: ["value", "riichi_point"],
  mixed_waits_score: ["efficiency", "mixed_waits_score"],
  avg_agari_rate: ["efficiency", "avg_agari_rate"],
  furiten_rate: ["value", "furiten_rate"],
  mixed_round_point: ["placement", "helper_mixed_round_point"],
} as const;
```

Map engine deterministic fields to deterministic classes, helper estimates/risk to upstream-estimate/heuristic-only, and failures to the narrowest blocked fact. Accept `ComparisonScope` and mark irrelevant axes `skipped_out_of_scope` before mapping facts. Produce every axis once. Never accept arbitrary sidecar dimension names.

- [ ] **Step 4: Run GREEN and typecheck**

```powershell
npx vitest run packages/reasoning/tests/structured-ledger-builder.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: build auditable candidate ledgers"
```

### Task 9: Differences and deterministic resolver

**Files:**
- Create: `coach/packages/reasoning/src/factors/difference-builder.ts`
- Create: `coach/packages/reasoning/src/factors/deterministic-resolver.ts`
- Test: `coach/packages/reasoning/tests/factor-differences.test.ts`
- Test: `coach/packages/reasoning/tests/deterministic-resolver.test.ts`

- [ ] **Step 1: Write RED difference tests**

```ts
it("compares shanten before ukeire and keeps tile counts", () => {
  const result = buildFactorDifferences([twoPinLedger(), sixSouLedger()]);
  expect(result.deterministic.find((d) => d.dimension === "shanten"))
    .toMatchObject({ direction: "supports_left" });
  expect(result.deterministic.find((d) => d.dimension === "ukeire_remaining")
    ?.leftValue.kind).toBe("tile_counts");
});

it("stores helper risk only as heuristic", () => {
  const result = buildFactorDifferences([safeLedger(), riskyLedger()]);
  expect(result.heuristic.some((d) => d.dimension === "helper_risk_scale")).toBe(true);
  expect(result.deterministic.some((d) => d.dimension === "helper_risk_scale")).toBe(false);
});
```

- [ ] **Step 2: Write RED resolver tests**

```ts
it("returns null for East 1 efficiency-versus-defense conflict", () => {
  expect(resolveDeterministicPreference(
    appliedDecisionFrame(), eastOneTurnSixDifferences(),
  )).toBeNull();
});

it("returns 2p for efficiency-only scope", () => {
  expect(resolveDeterministicPreference(
    efficiencyOnlyFrame(), eastOneTurnSixDifferences(),
  )?.actionRefs).toEqual([twoPinActionRef]);
});

it("ignores reversed heuristic values", () => {
  expect(resolveDeterministicPreference(frame(), factsWithRisk(1, 99)))
    .toEqual(resolveDeterministicPreference(frame(), factsWithRisk(99, 1)));
});
```

- [ ] **Step 3: Run RED**

```powershell
npx vitest run packages/reasoning/tests/factor-differences.test.ts packages/reasoning/tests/deterministic-resolver.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement explicit dimension direction and Pareto rules**

```ts
const deterministicDirection = {
  shanten: "lower",
  ukeire_remaining: "higher",
  dora_count: "higher",
  completed_hand_point: "higher",
  genbutsu: "true",
} as const;
```

Compare only matching calculated facts with identical evidence class, unit, engine commit, and completeness. Compare ukeire only for equal shanten. Keep tile maps and derived totals. Stable difference IDs use sorted action refs.

Filter heuristic differences before dominance. Single-axis preference requires the winning identical-vector group to dominate every outside candidate. Applied decisions require non-worse on every relevant calculated deterministic axis and strict improvement on one. Return null on cross-axis conflict, incomparable maxima, or relevant blocked axis. Partial coverage may describe a scoped result, never an overall applied-decision preference.

- [ ] **Step 5: Run GREEN and typecheck**

```powershell
npx vitest run packages/reasoning/tests/factor-differences.test.ts packages/reasoning/tests/deterministic-resolver.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git commit -m "feat: resolve deterministic factor dominance"
```

### Task 10: Structured FactorPipeline orchestration

**Files:**
- Create: `coach/packages/reasoning/src/factors/structured-factor-pipeline.ts`
- Test: `coach/packages/reasoning/tests/structured-factor-pipeline.test.ts`

- [ ] **Step 1: Write RED invariance tests**

```ts
it("produces one ledger per canonical candidate", async () => {
  const result = await runStructuredFactorPipeline({
    frame: appliedDecisionFrame(), comparisonSet: turnSixComparison(),
    facts: turnSixFacts(), engine: fixtureEngine(),
  });
  expect(result.ledgers.map((ledger) => ledger.actionRef).sort())
    .toEqual(turnSixComparison().candidates.map((candidate) => candidate.actionRef).sort());
});

it("is invariant to origins and candidate order", async () => {
  expect(normalizePipelineResult(await runStructuredFactorPipeline(baseInput())))
    .toEqual(normalizePipelineResult(
      await runStructuredFactorPipeline(permutedOriginsAndOrderInput()),
    ));
});

it("keeps local defense when sidecar fails", async () => {
  const result = await runStructuredFactorPipeline({
    ...baseInput(), engine: failingEngine(),
  });
  expect(findFact(result, "defense.genbutsu.actor2").status).toBe("calculated");
  expect(findFact(result, "efficiency.shanten").status)
    .toBe("blocked_engine_failure");
});
```

- [ ] **Step 2: Run RED**

Run `npx vitest run packages/reasoning/tests/structured-factor-pipeline.test.ts`.

Expected: FAIL.

- [ ] **Step 3: Implement orchestration without ModelEvaluation**

```ts
export type StructuredFactorPipelineInput = {
  frame: ComparisonAnalysisFrame;
  comparisonSet: StructuredComparisonSet;
  facts: KnownGameFacts;
  engine: MahjongFactEnginePort;
};
```

Do not add model evaluation. Validate input, project each candidate independently, run ready requests, retain local facts on engine failure, build ledgers, canonical-sort by action ref, build differences, and resolve deterministic preference. Return structured diagnostics, never prose.

- [ ] **Step 4: Run GREEN and typecheck**

```powershell
npx vitest run packages/reasoning/tests/structured-factor-pipeline.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: orchestrate structured factor analysis"
```

### Task 11: East 1 bridge, exports, and docs

**Files:**
- Create: `coach/packages/reasoning/src/factors/legacy-facts-bridge.ts`
- Create: `coach/packages/reasoning/tests/structured-factor-regression.test.ts`
- Modify: `coach/packages/reasoning/src/index.ts`
- Modify: `coach/README.md`
- Modify: `coach/docs/handoffs/2026-08-08-structured-factor-pipeline-design-handoff.md`

- [ ] **Step 1: Write RED real-fixture regression**

Load `coach/fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json`, reuse `importRegressionFixture` and `replayToDecision`, and assert:

```ts
expect(turn6.efficiencyPreference).toEqual([actionRefFor("discard:2p:tedashi")]);
expect(turn6.defensePreference).toEqual([actionRefFor("discard:6s:tsumogiri")]);
expect(turn6.result.deterministicPreference).toBeNull();

expect(turn7.efficiencyPreference).toEqual([actionRefFor("discard:7p:tedashi")]);
expect(turn7.defensePreference).toEqual([actionRefFor("discard:8p:tsumogiri")]);
expect(turn7.result.deterministicPreference).toBeNull();

expect(JSON.stringify([turn6, turn7]))
  .not.toMatch(/efficiency.*supports.*(6s|8p)/i);
```

Compare shared shanten/ukeire dimensions to the legacy analyzer.

- [ ] **Step 2: Run RED**

Run `npx vitest run packages/reasoning/tests/structured-factor-regression.test.ts`.

Expected: FAIL.

- [ ] **Step 3: Implement narrow legacy bridge and exports**

The bridge converts only legacy discard regression decisions through `legacyActionIdToRiichiAction`. It constructs canonical candidates and copies replay facts; it does not become a production fallback. Add `legacy_regression_bridge_only`.

Export:

```ts
export * from "./fact-engine/port.js";
export * from "./fact-engine/jsonl-client.js";
export * from "./fact-engine/managed-sidecar.js";
export * from "./factors/candidate-projector.js";
export * from "./factors/ledger-builder.js";
export * from "./factors/difference-builder.js";
export * from "./factors/deterministic-resolver.js";
export * from "./factors/structured-factor-pipeline.js";
export * from "./factors/legacy-facts-bridge.js";
```

Document protocol boundary, evidence classes, commands, upstream pin, no-user-path guarantee, and exclusion of helper recommendations. Update the handoff with commits, tests, limitations, and protected overlay files.

- [ ] **Step 4: Run GREEN and smoke**

```powershell
npx vitest run packages/reasoning/tests/structured-factor-regression.test.ts
npm run typecheck
npm run test:package-import
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: complete structured factor pipeline"
```

### Task 12: Full regression, audit, and code review

**Files:**
- Modify only files identified by review findings.
- Update: `coach/docs/handoffs/2026-08-08-structured-factor-pipeline-design-handoff.md`

- [ ] **Step 1: Run all verification**

```powershell
npm run test:fact-engine
npm test
npm run typecheck
npm run test:package-import
npm run build:fact-engine
```

Expected: all Go tests pass; all original 209 and new Vitest tests pass; typecheck/import/build exit 0.

- [ ] **Step 2: Audit dependency and trust boundary**

From `coach/tools/mahjong-facts` run `go list -m all`. From `coach` run:

```powershell
go version -m ..\.tools\mahjong-facts\windows-x64\mahjong-facts.exe
git grep -n -E "recommendedDiscard|modelEvaluation|preferredActions" -- packages/reasoning/src/factors tools/mahjong-facts
```

Expected: helper resolves to the pinned pseudo-version; binary metadata is present; prohibited preference dependencies are absent from the new pipeline.

- [ ] **Step 3: Invoke requesting-code-review**

Review the whole Slice 3 diff against the approved spec, East 1 invariants, schema failure behavior, deterministic/heuristic separation, process cleanup/restart behavior, license pin, and protected workspace files. Fix every Critical and Important issue with a failing test first and commit coherent fixes.

- [ ] **Step 4: Re-run the five full commands**

Expected: all pass and final review has Critical 0 / Important 0.

- [ ] **Step 5: Finalize handoff**

Record final hashes, exact test counts, typecheck/import/build results, dependency pin, and limitations: private han/fu, no dye/tedashi reading, no calibrated risk. Stage only the handoff, check cached diff, then:

```powershell
git commit -m "docs: hand off structured factor pipeline"
```

## Completion gate

Do not mark Slice 3 complete unless:

- every canonical candidate receives exactly one ledger;
- origins, candidate order, and model evaluation cannot alter factual output;
- helper value/risk estimates are available but never enter deterministic dominance;
- helper recommendation and sorting never cross the protocol;
- turn 6 remains 2p efficiency versus 6s defense;
- turn 7 remains 7p efficiency versus 8p defense;
- sidecar path/toolchain is not a user setting;
- MIT notice and pinned commit are present;
- full Go/TypeScript regression and final code review pass.
