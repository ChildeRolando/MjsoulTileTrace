# Evidence-Grounded Riichi Reasoning Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone TypeScript reasoning core that turns a normalized Mortal decision plus its replay context into an auditable five-axis candidate ledger, bilateral factor account, teaching-policy judgement, and deterministic explanation.

**Architecture:** A report importer keeps raw Mortal facts separate from replay facts. A deterministic scene replayer freezes only information visible at the decision, focused analyzers emit provenance-bearing factors, and a comparator plus versioned policy engine produces the coach judgement without claiming to know the model's internal reason. The first milestone implements standard-hand shanten and deterministic-defense paths deeply enough to lock the East 1 turn 6 and turn 7 regressions, while every unimplemented sub-axis is explicitly reported through a coverage matrix.

**Tech Stack:** Node.js 22, TypeScript 5.9, npm workspaces, Zod 3, Vitest 3, the repository's existing standard-hand engine in `lib/mahjong.mjs`.

---

## Scope and delivery sequence

This is the first independently executable subsystem of the approved coach product. It produces a tested library and fixture-driven report, not a web UI.

1. **This plan — strict reasoning core:** report extraction, scene replay, standard-hand shanten, deterministic threat/safety, limited value/placement/option signals, bilateral ledgers, PF-03/PF-04, validation, and East 1 regressions.
2. **Follow-on analysis plan:** full value calculation, placement outcome paths, option value, structural river heuristics, behavioral river heuristics, wait heuristics, and calibrated-statistic adapters.
3. **Engine-ingestion plan:** anonymous Mahjong Soul replay acquisition, trusted Mortal-result import, managed Akagi Native runtime, and the shared `NormalizedAnalysis` boundary.
4. **Local-agent plan:** SQLite sessions, resumable jobs, Windows Credential Manager, OpenAI-compatible client, prompt assembly, output retries, and SSE.
5. **Workbench plan:** three-column React UI, central table/replay controls, candidate heat bars, error navigation, history, and snapshot-bound chat.

The first milestone is complete only when both real decisions produce the correct opposing factors:

- East 1 turn 6: discard `2p` is efficiency-favored; tsumogiri `6s` is deterministic genbutsu against actor 2.
- East 1 turn 7: discard `7p` is efficiency-favored; tsumogiri `8p` is deterministic genbutsu against actor 2.

## File structure

```text
.gitignore
coach/
  package.json
  package-lock.json
  tsconfig.base.json
  tools/
    capture-mortal-regression.mjs
  fixtures/
    mortal/
      c1924cad66f66dd9-east1-turn6-7.json
  packages/
    contracts/
      package.json
      tsconfig.json
      src/
        tiles.ts
        events.ts
        scene.ts
        evidence.ts
        decisions.ts
        index.ts
      tests/
        contracts.test.ts
    reasoning/
      package.json
      tsconfig.json
      src/
        import/mortal-report.ts
        replay/scene-replayer.ts
        analysis/efficiency-analyzer.ts
        analysis/threat-analyzer.ts
        analysis/tile-safety-analyzer.ts
        analysis/context-signal-analyzers.ts
        compare/action-comparator.ts
        policy/teaching-policy.ts
        explain/deterministic-explanation.ts
        validate/explanation-validator.ts
        index.ts
      tests/
        mortal-report.test.ts
        scene-replayer.test.ts
        efficiency-analyzer.test.ts
        tile-safety-analyzer.test.ts
        action-comparator.test.ts
        teaching-policy.test.ts
        explanation-validator.test.ts
        east1-regression.test.ts
```

`contracts` contains runtime schemas and types only. `reasoning` depends on `contracts` and the existing pure hand engine. Neither package may depend on a web framework, database, LLM client, Mortal HTML, or Akagi process.

### Task 1: Bootstrap the isolated coach workspace and evidence contracts

**Files:**
- Modify: `.gitignore`
- Create: `coach/package.json`
- Create: `coach/tsconfig.base.json`
- Create: `coach/packages/contracts/package.json`
- Create: `coach/packages/contracts/tsconfig.json`
- Create: `coach/packages/contracts/src/tiles.ts`
- Create: `coach/packages/contracts/src/events.ts`
- Create: `coach/packages/contracts/src/scene.ts`
- Create: `coach/packages/contracts/src/evidence.ts`
- Create: `coach/packages/contracts/src/decisions.ts`
- Create: `coach/packages/contracts/src/index.ts`
- Test: `coach/packages/contracts/tests/contracts.test.ts`

- [ ] **Step 1: Add only generated coach artifacts to `.gitignore`**

Append:

```gitignore
coach/node_modules/
coach/**/dist/
coach/coverage/
```

- [ ] **Step 2: Create the failing runtime-contract test**

Create `coach/packages/contracts/tests/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ActionIdSchema,
  DecisionExplanationSchema,
  FactorEvidenceSchema,
  SceneSnapshotSchema,
} from "../src/index.js";

describe("strict reasoning contracts", () => {
  it("accepts provenance-bearing factors and rejects unsupported provenance", () => {
    const factor = {
      factorId: "factor:e1:t6:defense:6s:actor2",
      axis: "defense",
      dimension: "genbutsu",
      subjectAction: "discard:6s:tsumogiri",
      comparisonAction: "discard:2p:tedashi",
      direction: "supports_subject",
      magnitude: { kind: "ordinal", value: "decisive" },
      statement: "6s is genbutsu against actor 2; 2p has no deterministic safety evidence",
      provenance: "deterministic",
      confidence: "certain",
      evidenceIds: ["event-48"],
      limitations: ["Safety applies to actor 2 only"],
    };

    expect(FactorEvidenceSchema.parse(factor)).toEqual(factor);
    expect(() => FactorEvidenceSchema.parse({ ...factor, provenance: "mortal_dealin_rate" }))
      .toThrow();
    expect(ActionIdSchema.parse("discard:5pr:tedashi")).not.toBe(
      ActionIdSchema.parse("discard:5p:tedashi"),
    );
  });

  it("requires modelReason to remain unknown", () => {
    const parsed = DecisionExplanationSchema.safeParse({
      decisionId: "e1-turn6",
      modelFact: {
        engine: "Mortal 4.1b",
        recommendedAction: "discard:6s:tsumogiri",
        recommendedScore: 99.2823,
        actualAction: "discard:2p:tedashi",
        actualScore: 0.0103,
        modelReason: "defense",
      },
      observedTradeoffs: {
        supportsModelAction: [],
        supportsActualAction: [],
        neutralFactors: [],
        unknownOrUnmeasured: [],
      },
      coverage: [],
      primaryAxes: [],
      coachJudgement: null,
      deterministicExplanation: "",
    });

    expect(parsed.success).toBe(false);
  });

  it("does not allow opponent concealed hands in a scene snapshot", () => {
    const keys = Object.keys(SceneSnapshotSchema.shape);
    expect(keys).not.toContain("opponentHands");
    expect(keys).not.toContain("allHands");
  });
});
```

- [ ] **Step 3: Run the test to verify the workspace is absent**

Run:

```powershell
cd coach
npm test -- --run packages/contracts/tests/contracts.test.ts
```

Expected: FAIL because `coach/package.json` and the contract modules do not exist.

- [ ] **Step 4: Create the workspace manifests**

Create `coach/package.json`:

```json
{
  "name": "riichi-coach",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p packages/contracts/tsconfig.json"
  },
  "devDependencies": {
    "@types/node": "22.15.30",
    "typescript": "5.9.2",
    "vitest": "3.2.4"
  }
}
```

Create `coach/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

Create `coach/packages/contracts/package.json`:

```json
{
  "name": "@riichi-coach/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "zod": "3.25.76"
  }
}
```

Create `coach/packages/contracts/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 5: Implement tile and event schemas**

Create `coach/packages/contracts/src/tiles.ts`:

```ts
import { z } from "zod";

export const TileIdSchema = z.enum([
  "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
  "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p",
  "1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s",
  "1z", "2z", "3z", "4z", "5z", "6z", "7z",
]);
export type TileId = z.infer<typeof TileIdSchema>;

export const TileSchema = z.object({
  id: TileIdSchema,
  red: z.boolean(),
});
export type Tile = z.infer<typeof TileSchema>;

export const ActionIdSchema = z.string().regex(
  /^discard:(?:[1-9][mps]|5[mps]r|[1-7]z):(tsumogiri|tedashi)$/,
);
export type ActionId = z.infer<typeof ActionIdSchema>;
```

Create `coach/packages/contracts/src/events.ts`:

```ts
import { z } from "zod";
import { TileSchema } from "./tiles.js";

const BaseEventSchema = z.object({ eventId: z.string().min(1) });
export const NormalizedEventSchema = z.union([
  BaseEventSchema.extend({
    type: z.literal("start_game"),
    playerCount: z.literal(4),
  }),
  BaseEventSchema.extend({
    type: z.literal("start_kyoku"),
    bakaze: z.enum(["E", "S"]),
    kyoku: z.number().int().min(1).max(4),
    honba: z.number().int().nonnegative(),
    kyotaku: z.number().int().nonnegative(),
    oya: z.number().int().min(0).max(3),
    scores: z.array(z.number().int()).length(4),
    doraMarker: TileSchema,
    selfHand: z.array(TileSchema).length(13),
  }),
  BaseEventSchema.extend({
    type: z.literal("tsumo"),
    actor: z.number().int().min(0).max(3),
    tile: TileSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("dahai"),
    actor: z.number().int().min(0).max(3),
    tile: TileSchema,
    tsumogiri: z.boolean(),
  }),
  BaseEventSchema.extend({
    type: z.enum(["reach", "reach_accepted"]),
    actor: z.number().int().min(0).max(3),
  }),
  BaseEventSchema.extend({
    type: z.enum(["chi", "pon", "daiminkan", "ankan", "kakan"]),
    actor: z.number().int().min(0).max(3),
    target: z.number().int().min(0).max(3).nullable(),
    tile: TileSchema,
    consumed: z.array(TileSchema),
  }),
  BaseEventSchema.extend({
    type: z.enum(["end_kyoku", "end_game"]),
  }),
]);
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
```

- [ ] **Step 6: Implement scene, evidence, and decision schemas**

Create `coach/packages/contracts/src/scene.ts`:

```ts
import { z } from "zod";
import { TileSchema } from "./tiles.js";

export const RiverDiscardSchema = z.object({
  tile: TileSchema,
  actor: z.number().int().min(0).max(3),
  tsumogiri: z.boolean(),
  eventId: z.string(),
  afterRiichiEventIds: z.array(z.string()),
});

export const ThreatStateSchema = z.object({
  actor: z.number().int().min(0).max(3),
  riichi: z.boolean(),
  declarationEventId: z.string().nullable(),
  ippatsuAlive: z.boolean(),
});

export const SceneSnapshotSchema = z.object({
  decisionEventId: z.string(),
  selfActor: z.number().int().min(0).max(3),
  bakaze: z.enum(["E", "S"]),
  kyoku: z.number().int().min(1).max(4),
  honba: z.number().int().nonnegative(),
  kyotaku: z.number().int().nonnegative(),
  oya: z.number().int().min(0).max(3),
  scores: z.array(z.number().int()).length(4),
  doraMarkers: z.array(TileSchema),
  selfHand: z.array(TileSchema),
  currentDraw: TileSchema.nullable(),
  rivers: z.array(z.array(RiverDiscardSchema)).length(4),
  threats: z.array(ThreatStateSchema).length(4),
  eventIds: z.array(z.string()),
  complete: z.boolean(),
});
export type SceneSnapshot = z.infer<typeof SceneSnapshotSchema>;
```

Create `coach/packages/contracts/src/evidence.ts`:

```ts
import { z } from "zod";
import { ActionIdSchema } from "./tiles.js";

export const AxisSchema = z.enum([
  "efficiency", "value", "defense", "placement", "option_value",
]);
export type Axis = z.infer<typeof AxisSchema>;

export const ProvenanceSchema = z.enum([
  "raw_model", "raw_replay", "deterministic", "derived_heuristic",
  "calibrated_statistic", "teaching_rule", "unknown",
]);

export const FactorEvidenceSchema = z.object({
  factorId: z.string().min(1),
  axis: AxisSchema,
  dimension: z.string().min(1),
  subjectAction: ActionIdSchema,
  comparisonAction: ActionIdSchema,
  direction: z.enum(["supports_subject", "supports_comparison", "neutral"]),
  magnitude: z.object({
    kind: z.enum(["ordinal", "count", "points", "probability"]),
    value: z.union([z.string(), z.number()]),
  }),
  statement: z.string().min(1),
  provenance: ProvenanceSchema,
  confidence: z.enum(["certain", "high", "medium", "low", "unknown"]),
  evidenceIds: z.array(z.string()).min(1),
  limitations: z.array(z.string()),
});
export type FactorEvidence = z.infer<typeof FactorEvidenceSchema>;

export const CoverageEntrySchema = z.object({
  axis: AxisSchema,
  dimension: z.string(),
  status: z.enum([
    "implemented", "heuristic", "unsupported", "blocked_by_missing_data",
  ]),
  reason: z.string(),
});
export type CoverageEntry = z.infer<typeof CoverageEntrySchema>;
```

Create `coach/packages/contracts/src/decisions.ts`:

```ts
import { z } from "zod";
import { ActionIdSchema } from "./tiles.js";
import { AxisSchema, CoverageEntrySchema } from "./evidence.js";

export const ModelCandidateSchema = z.object({
  actionId: ActionIdSchema,
  probability: z.number().min(0).max(1),
  qValue: z.number(),
});

export const NormalizedDecisionSchema = z.object({
  decisionId: z.string(),
  sceneEventId: z.string(),
  junme: z.number().int().positive(),
  modelName: z.string(),
  modelAction: ActionIdSchema,
  actualAction: ActionIdSchema,
  candidates: z.array(ModelCandidateSchema).min(2),
  modelReason: z.literal("unknown"),
});
export type NormalizedDecision = z.infer<typeof NormalizedDecisionSchema>;

export const DecisionExplanationSchema = z.object({
  decisionId: z.string(),
  modelFact: z.object({
    engine: z.string(),
    recommendedAction: ActionIdSchema,
    recommendedScore: z.number().min(0).max(100),
    actualAction: ActionIdSchema,
    actualScore: z.number().min(0).max(100),
    modelReason: z.literal("unknown"),
  }),
  observedTradeoffs: z.object({
    supportsModelAction: z.array(z.string()),
    supportsActualAction: z.array(z.string()),
    neutralFactors: z.array(z.string()),
    unknownOrUnmeasured: z.array(z.string()),
  }),
  coverage: z.array(CoverageEntrySchema),
  primaryAxes: z.array(AxisSchema),
  coachJudgement: z.object({
    recommendedAction: ActionIdSchema,
    ruleIds: z.array(z.string()).min(1),
    confidence: z.enum(["high", "medium", "low"]),
  }).nullable(),
  deterministicExplanation: z.string(),
});
export type DecisionExplanation = z.infer<typeof DecisionExplanationSchema>;
```

Create `coach/packages/contracts/src/index.ts`:

```ts
export * from "./tiles.js";
export * from "./events.js";
export * from "./scene.js";
export * from "./evidence.js";
export * from "./decisions.js";
```

- [ ] **Step 7: Install dependencies and verify contracts**

Run:

```powershell
cd coach
npm install
npm test -- --run packages/contracts/tests/contracts.test.ts
npm run typecheck
```

Expected: three contract tests PASS and TypeScript reports no errors.

- [ ] **Step 8: Commit the workspace and contracts**

```powershell
git add .gitignore coach/package.json coach/package-lock.json coach/tsconfig.base.json coach/packages/contracts
git commit -m "build: bootstrap strict coach contracts"
```

### Task 2: Capture a minimal real Mortal fixture and normalize decisions

**Files:**
- Modify: `coach/package.json`
- Create: `coach/tools/capture-mortal-regression.mjs`
- Create: `coach/fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json`
- Create: `coach/packages/reasoning/package.json`
- Create: `coach/packages/reasoning/tsconfig.json`
- Create: `coach/packages/reasoning/src/import/mortal-report.ts`
- Test: `coach/packages/reasoning/tests/mortal-report.test.ts`

- [ ] **Step 1: Create the fixture-capture script**

Create `coach/tools/capture-mortal-regression.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceUrl = "https://mjai.ekyu.moe/report/c1924cad66f66dd9.json";
const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`Mortal fixture download failed: ${response.status}`);
const report = await response.json();
if (report.player_id !== 3 || report.review?.model_tag !== "4.1b") {
  throw new Error("Unexpected report identity or Mortal model");
}

const entries = report.review.kyokus[0].entries.filter(
  (entry) => entry.last_actor === 3 && (entry.junme === 6 || entry.junme === 7),
);
if (entries.length !== 2) throw new Error(`Expected two regression entries, got ${entries.length}`);

const fixture = {
  source: { reportId: "c1924cad66f66dd9", modelTag: "4.1b", playerId: 3 },
  mjaiLog: report.mjai_log.slice(0, 64),
  decisions: entries,
};
const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
```

Run:

```powershell
cd coach
node tools/capture-mortal-regression.mjs
```

Expected: the fixture is created, contains 64 replay events, and contains exactly the turn 6 and turn 7 decisions.

- [ ] **Step 2: Create the failing importer test**

Create `coach/packages/reasoning/tests/mortal-report.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importRegressionFixture } from "../src/import/mortal-report.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("Mortal report importer", () => {
  it("preserves model facts but fixes modelReason to unknown", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const imported = importRegressionFixture(fixture);

    expect(imported.decisions).toHaveLength(2);
    expect(imported.decisions[0]).toMatchObject({
      decisionId: "east1-turn6",
      sceneEventId: "event-50",
      modelAction: "discard:6s:tsumogiri",
      actualAction: "discard:2p:tedashi",
      modelReason: "unknown",
    });
    expect(imported.decisions[0]?.candidates[0]?.probability).toBeCloseTo(0.992823, 6);
    expect(imported.decisions[1]).toMatchObject({
      decisionId: "east1-turn7",
      sceneEventId: "event-62",
      modelAction: "discard:8p:tsumogiri",
      actualAction: "discard:7p:tedashi",
      modelReason: "unknown",
    });
  });
});
```

- [ ] **Step 3: Verify the importer test fails**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/mortal-report.test.ts
```

Expected: FAIL because the reasoning package and importer do not exist.

- [ ] **Step 4: Create the reasoning package**

Create `coach/packages/reasoning/package.json`:

```json
{
  "name": "@riichi-coach/reasoning",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "dependencies": {
    "@riichi-coach/contracts": "0.1.0",
    "zod": "3.25.76"
  }
}
```

Create `coach/packages/reasoning/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowJs": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 5: Extend the root typecheck command**

Change the `typecheck` script in `coach/package.json` to:

```json
"typecheck": "tsc --noEmit -p packages/contracts/tsconfig.json && tsc --noEmit -p packages/reasoning/tsconfig.json"
```

- [ ] **Step 6: Implement the strict Mortal importer**

Create `coach/packages/reasoning/src/import/mortal-report.ts` with:

```ts
import {
  NormalizedDecisionSchema,
  NormalizedEventSchema,
  type NormalizedDecision,
  type NormalizedEvent,
  type Tile,
} from "@riichi-coach/contracts";

const honors: Record<string, string> = {
  E: "1z", S: "2z", W: "3z", N: "4z", P: "5z", F: "6z", C: "7z",
};

export function parseMjaiTile(value: string): Tile {
  const red = value.endsWith("r");
  const base = red ? value.slice(0, -1) : value;
  const id = honors[base] ?? base;
  return { id: id as Tile["id"], red };
}

function actionId(action: { type: string; pai?: string; tsumogiri?: boolean }): string {
  if (action.type !== "dahai" || !action.pai) {
    throw new Error(`Unsupported regression action: ${action.type}`);
  }
  const tile = parseMjaiTile(action.pai);
  const tileKey = `${tile.id}${tile.red ? "r" : ""}`;
  return `discard:${tileKey}:${action.tsumogiri ? "tsumogiri" : "tedashi"}`;
}

function normalizeEvent(raw: Record<string, unknown>, index: number, selfActor: number): NormalizedEvent {
  const eventId = `event-${index}`;
  if (raw.type === "start_game") {
    return NormalizedEventSchema.parse({ type: "start_game", eventId, playerCount: 4 });
  }
  if (raw.type === "start_kyoku") {
    const hands = raw.tehais as string[][];
    return NormalizedEventSchema.parse({
      type: "start_kyoku",
      eventId,
      bakaze: raw.bakaze,
      kyoku: raw.kyoku,
      honba: raw.honba,
      kyotaku: raw.kyotaku,
      oya: raw.oya,
      scores: raw.scores,
      doraMarker: parseMjaiTile(raw.dora_marker as string),
      selfHand: hands[selfActor]?.map(parseMjaiTile),
    });
  }
  if (raw.type === "tsumo") {
    return NormalizedEventSchema.parse({
      type: "tsumo", eventId, actor: raw.actor, tile: parseMjaiTile(raw.pai as string),
    });
  }
  if (raw.type === "dahai") {
    return NormalizedEventSchema.parse({
      type: "dahai",
      eventId,
      actor: raw.actor,
      tile: parseMjaiTile(raw.pai as string),
      tsumogiri: raw.tsumogiri,
    });
  }
  if (raw.type === "reach" || raw.type === "reach_accepted") {
    return NormalizedEventSchema.parse({ type: raw.type, eventId, actor: raw.actor });
  }
  if (["chi", "pon", "daiminkan", "ankan", "kakan"].includes(raw.type as string)) {
    return NormalizedEventSchema.parse({
      type: raw.type,
      eventId,
      actor: raw.actor,
      target: raw.target ?? null,
      tile: parseMjaiTile(raw.pai as string),
      consumed: (raw.consumed as string[]).map(parseMjaiTile),
    });
  }
  return NormalizedEventSchema.parse({ type: raw.type, eventId });
}

export function importRegressionFixture(raw: {
  source: { modelTag: string; playerId: number };
  mjaiLog: Record<string, unknown>[];
  decisions: Array<Record<string, any>>;
}): { events: NormalizedEvent[]; decisions: NormalizedDecision[] } {
  const events = raw.mjaiLog.map(
    (event, index) => normalizeEvent(event, index, raw.source.playerId),
  );
  const decisions = raw.decisions.map((entry) => {
    const expectedJunme = entry.junme as 6 | 7;
    const sceneEventId = expectedJunme === 6 ? "event-50" : "event-62";
    const sceneEvent = events.find(
      (event) =>
        event.eventId === sceneEventId &&
        event.type === "tsumo" &&
        event.actor === raw.source.playerId &&
        event.tile.id === parseMjaiTile(entry.tile).id,
    );
    if (!sceneEvent || sceneEvent.eventId !== sceneEventId) {
      throw new Error(`Cannot map East 1 turn ${expectedJunme} to replay event`);
    }
    return NormalizedDecisionSchema.parse({
      decisionId: `east1-turn${expectedJunme}`,
      sceneEventId,
      junme: expectedJunme,
      modelName: `Mortal ${raw.source.modelTag}`,
      modelAction: actionId(entry.expected),
      actualAction: actionId(entry.actual),
      candidates: entry.details.map((detail: any) => ({
        actionId: actionId(detail.action),
        probability: detail.prob,
        qValue: detail.q_value,
      })),
      modelReason: "unknown",
    });
  });
  return { events, decisions };
}
```

The two hard-coded event IDs are allowed only in this regression-fixture importer. The full Mortal adapter belongs to the engine-ingestion plan and must map decisions by event sequence rather than report ID.

- [ ] **Step 7: Install the workspace link and pass the importer test**

Run:

```powershell
cd coach
npm install
npm test -- --run packages/reasoning/tests/mortal-report.test.ts
npm run typecheck
```

Expected: importer test PASS and typecheck PASS.

- [ ] **Step 8: Commit the fixture boundary**

```powershell
git add coach/tools coach/fixtures coach/packages/reasoning/package.json coach/packages/reasoning/tsconfig.json coach/packages/reasoning/src/import coach/packages/reasoning/tests/mortal-report.test.ts coach/package-lock.json
git commit -m "test: capture Mortal defense regressions"
```

### Task 3: Replay visible state and freeze decision scenes

**Files:**
- Create: `coach/packages/reasoning/src/replay/scene-replayer.ts`
- Test: `coach/packages/reasoning/tests/scene-replayer.test.ts`

- [ ] **Step 1: Write failing scene-replay tests**

Create `coach/packages/reasoning/tests/scene-replayer.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

async function load() {
  return importRegressionFixture(JSON.parse(await readFile(fixtureUrl, "utf8")));
}

describe("scene replayer", () => {
  it("freezes turn 6 after the draw with actor 2 riichi and ippatsu alive", async () => {
    const { events, decisions } = await load();
    const scene = replayToDecision(events, decisions[0]!);

    expect(scene.currentDraw).toMatchObject({ id: "6s" });
    expect(scene.selfHand.map((tile) => tile.id)).toContain("2p");
    expect(scene.threats[2]).toMatchObject({
      actor: 2,
      riichi: true,
      declarationEventId: "event-47",
      ippatsuAlive: true,
    });
    expect(scene.rivers[2].map((discard) => discard.tile.id)).toEqual(
      expect.arrayContaining(["8p", "6s"]),
    );
  });

  it("keeps riichi but cancels ippatsu after the intervening pon at turn 7", async () => {
    const { events, decisions } = await load();
    const scene = replayToDecision(events, decisions[1]!);

    expect(scene.currentDraw).toMatchObject({ id: "8p" });
    expect(scene.threats[2]).toMatchObject({ riichi: true, ippatsuAlive: false });
    expect(scene.eventIds).toContain("event-58");
  });
});
```

- [ ] **Step 2: Verify the scene tests fail**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/scene-replayer.test.ts
```

Expected: FAIL because `replayToDecision` does not exist.

- [ ] **Step 3: Implement visible-only replay**

Create `coach/packages/reasoning/src/replay/scene-replayer.ts`:

```ts
import {
  SceneSnapshotSchema,
  type NormalizedDecision,
  type NormalizedEvent,
  type SceneSnapshot,
  type Tile,
} from "@riichi-coach/contracts";

function removeOne(hand: Tile[], tile: Tile): void {
  const index = hand.findIndex((item) => item.id === tile.id && item.red === tile.red);
  if (index < 0) throw new Error(`Self discard ${tile.id} was not present in visible hand`);
  hand.splice(index, 1);
}

export function replayToDecision(
  events: NormalizedEvent[],
  decision: NormalizedDecision,
  selfActor = 3,
): SceneSnapshot {
  let round: Omit<SceneSnapshot, "decisionEventId" | "eventIds" | "complete"> | null = null;
  const eventIds: string[] = [];
  const acceptedRiichi = new Set<number>();

  for (const event of events) {
    eventIds.push(event.eventId);
    if (event.type === "start_game") continue;
    if (event.type === "start_kyoku") {
      round = {
        selfActor,
        bakaze: event.bakaze,
        kyoku: event.kyoku,
        honba: event.honba,
        kyotaku: event.kyotaku,
        oya: event.oya,
        scores: [...event.scores],
        doraMarkers: [event.doraMarker],
        selfHand: [...event.selfHand],
        currentDraw: null,
        rivers: [[], [], [], []],
        threats: [0, 1, 2, 3].map((actor) => ({
          actor,
          riichi: false,
          declarationEventId: null,
          ippatsuAlive: false,
        })),
      };
      acceptedRiichi.clear();
      continue;
    }
    if (!round) throw new Error(`Event ${event.eventId} arrived before start_kyoku`);

    if (event.type === "reach") {
      round.threats[event.actor] = {
        actor: event.actor,
        riichi: true,
        declarationEventId: event.eventId,
        ippatsuAlive: true,
      };
    } else if (event.type === "reach_accepted") {
      acceptedRiichi.add(event.actor);
      round.scores[event.actor] = round.scores[event.actor]! - 1000;
      round.kyotaku += 1;
    } else if (
      event.type === "chi" ||
      event.type === "pon" ||
      event.type === "daiminkan" ||
      event.type === "ankan" ||
      event.type === "kakan"
    ) {
      round.threats = round.threats.map((threat) => ({
        ...threat,
        ippatsuAlive: false,
      }));
      if (event.actor === selfActor) {
        for (const tile of event.consumed) removeOne(round.selfHand, tile);
      }
    } else if (event.type === "tsumo") {
      if (event.actor === selfActor) {
        round.selfHand.push(event.tile);
        round.currentDraw = event.tile;
      }
    } else if (event.type === "dahai") {
      const activeRiichi = round.threats
        .filter((threat) => threat.riichi)
        .map((threat) => threat.declarationEventId)
        .filter((id): id is string => id !== null);
      round.rivers[event.actor]!.push({
        tile: event.tile,
        actor: event.actor,
        tsumogiri: event.tsumogiri,
        eventId: event.eventId,
        afterRiichiEventIds: activeRiichi,
      });
      if (event.actor === selfActor) {
        removeOne(round.selfHand, event.tile);
        round.currentDraw = null;
      }
      if (acceptedRiichi.has(event.actor)) {
        const threat = round.threats[event.actor]!;
        round.threats[event.actor] = { ...threat, ippatsuAlive: false };
      }
    }

    if (event.eventId === decision.sceneEventId) {
      return SceneSnapshotSchema.parse({
        ...round,
        decisionEventId: event.eventId,
        eventIds,
        complete: true,
      });
    }
  }
  throw new Error(`Decision scene ${decision.sceneEventId} not found`);
}
```

- [ ] **Step 4: Pass scene replay and importer tests**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/scene-replayer.test.ts packages/reasoning/tests/mortal-report.test.ts
npm run typecheck
```

Expected: four tests PASS and typecheck PASS.

- [ ] **Step 5: Commit deterministic scene replay**

```powershell
git add coach/packages/reasoning/src/replay coach/packages/reasoning/tests/scene-replayer.test.ts
git commit -m "feat: replay visible decision scenes"
```

### Task 4: Compute discard efficiency without narrating it

**Files:**
- Create: `coach/packages/reasoning/src/analysis/efficiency-analyzer.ts`
- Test: `coach/packages/reasoning/tests/efficiency-analyzer.test.ts`

- [ ] **Step 1: Write the two failing efficiency regressions**

Create `coach/packages/reasoning/tests/efficiency-analyzer.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";
import { compareDiscardEfficiency } from "../src/analysis/efficiency-analyzer.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("efficiency analyzer", () => {
  it.each([
    [0, 2, 3, "discard:2p:tedashi", "discard:6s:tsumogiri"],
    [1, 1, 2, "discard:7p:tedashi", "discard:8p:tsumogiri"],
  ] as const)(
    "records the actual action as efficiency-favored in regression %s",
    async (index, actualShanten, modelShanten, actualAction, modelAction) => {
      const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
      const { events, decisions } = importRegressionFixture(raw);
      const scene = replayToDecision(events, decisions[index]!);
      const result = compareDiscardEfficiency(scene, actualAction, modelAction);

      expect(result.metrics[actualAction]?.shanten).toBe(actualShanten);
      expect(result.metrics[modelAction]?.shanten).toBe(modelShanten);
      expect(result.factor.direction).toBe("supports_subject");
      expect(result.factor.subjectAction).toBe(actualAction);
      expect(result.factor.statement).toContain("lower standard-hand shanten");
    },
  );
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/efficiency-analyzer.test.ts
```

Expected: FAIL because the efficiency analyzer does not exist.

- [ ] **Step 3: Implement the typed adapter over `lib/mahjong.mjs`**

Create `coach/packages/reasoning/src/analysis/efficiency-analyzer.ts`:

```ts
import type {
  ActionId,
  FactorEvidence,
  SceneSnapshot,
  TileId,
} from "@riichi-coach/contracts";
import {
  analyzeDiscards,
  parseCompactHand,
} from "../../../../../lib/mahjong.mjs";

export type LegacyDiscard = {
  discard: TileId;
  shanten: number;
  ukeire: number;
  effective: Array<{ id: TileId; remaining: number }>;
};

function compact(ids: TileId[]): string {
  const groups = { m: "", p: "", s: "", z: "" };
  for (const id of ids) groups[id[1] as keyof typeof groups] += id[0];
  return (["m", "p", "s", "z"] as const)
    .filter((suit) => groups[suit].length > 0)
    .map((suit) => `${groups[suit]}${suit}`)
    .join("");
}

function tileFromAction(actionId: ActionId): TileId {
  return actionId.split(":")[1]!.replace(/r$/, "") as TileId;
}

export function analyzeAllDiscardEfficiency(
  scene: SceneSnapshot,
): Record<string, LegacyDiscard> {
  const counts = parseCompactHand(compact(scene.selfHand.map((tile) => tile.id)));
  const rows = analyzeDiscards(counts) as LegacyDiscard[];
  return Object.fromEntries(rows.map((row) => [row.discard, row]));
}

export function compareDiscardEfficiency(
  scene: SceneSnapshot,
  subjectAction: ActionId,
  comparisonAction: ActionId,
): {
  metrics: Record<string, LegacyDiscard>;
  factor: FactorEvidence;
} {
  const byTile = analyzeAllDiscardEfficiency(scene);
  const subject = byTile[tileFromAction(subjectAction)];
  const comparison = byTile[tileFromAction(comparisonAction)];
  if (!subject || !comparison) throw new Error("Discard action is absent from the visible hand");

  const subjectBetter = subject.shanten < comparison.shanten;
  const comparisonBetter = comparison.shanten < subject.shanten;
  const evidenceId = scene.decisionEventId;
  return {
    metrics: {
      [subjectAction]: subject,
      [comparisonAction]: comparison,
    },
    factor: {
      factorId: `factor:${scene.decisionEventId}:efficiency:${subjectAction}:${comparisonAction}`,
      axis: "efficiency",
      dimension: "shanten",
      subjectAction,
      comparisonAction,
      direction: subjectBetter
        ? "supports_subject"
        : comparisonBetter
          ? "supports_comparison"
          : "neutral",
      magnitude: {
        kind: "count",
        value: Math.abs(subject.shanten - comparison.shanten),
      },
      statement: subjectBetter
        ? `${subjectAction} leaves lower standard-hand shanten than ${comparisonAction}`
        : comparisonBetter
          ? `${comparisonAction} leaves lower standard-hand shanten than ${subjectAction}`
          : `${subjectAction} and ${comparisonAction} have equal standard-hand shanten; live ukeire is not compared`,
      provenance: "deterministic",
      confidence: "certain",
      evidenceIds: [evidenceId],
      limitations: [
        "Standard-hand shanten only in milestone 1",
        "Raw ukeire diagnostics do not subtract all public visible tiles and cannot rank equal-shanten actions",
      ],
    },
  };
}
```

- [ ] **Step 4: Run efficiency and legacy engine tests**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/efficiency-analyzer.test.ts
cd ..
node --test tests/mahjong-engine.test.mjs
```

Expected: two new regressions PASS and all legacy hand-engine tests PASS.

- [ ] **Step 5: Commit the efficiency analyzer**

```powershell
git add coach/packages/reasoning/src/analysis/efficiency-analyzer.ts coach/packages/reasoning/tests/efficiency-analyzer.test.ts
git commit -m "feat: derive auditable discard efficiency"
```

### Task 5: Identify threats and compute player-specific deterministic safety

**Files:**
- Create: `coach/packages/reasoning/src/analysis/threat-analyzer.ts`
- Create: `coach/packages/reasoning/src/analysis/tile-safety-analyzer.ts`
- Test: `coach/packages/reasoning/tests/tile-safety-analyzer.test.ts`

- [ ] **Step 1: Write failing safety and attribution tests**

Create `coach/packages/reasoning/tests/tile-safety-analyzer.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";
import { compareDeterministicSafety } from "../src/analysis/tile-safety-analyzer.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("tile safety analyzer", () => {
  it.each([
    [0, "discard:6s:tsumogiri", "discard:2p:tedashi", "event-48"],
    [1, "discard:8p:tsumogiri", "discard:7p:tedashi", "event-39"],
  ] as const)(
    "proves model action genbutsu against actor 2 in regression %s",
    async (index, safeAction, otherAction, sourceEvent) => {
      const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
      const { events, decisions } = importRegressionFixture(raw);
      const scene = replayToDecision(events, decisions[index]!);
      const factor = compareDeterministicSafety(scene, safeAction, otherAction);
      expect(factor).not.toBeNull();
      if (!factor) throw new Error("Expected deterministic safety evidence");

      expect(factor.subjectAction).toBe(safeAction);
      expect(factor.direction).toBe("supports_subject");
      expect(factor.statement).toContain("actor 2");
      expect(factor.evidenceIds).toContain(sourceEvent);
      expect(factor.limitations).toContain("Safety applies to actor 2 only");
    },
  );

  it("does not describe one-player genbutsu as table-wide safety", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const { events, decisions } = importRegressionFixture(raw);
    const scene = replayToDecision(events, decisions[0]!);
    const factor = compareDeterministicSafety(
      scene,
      "discard:6s:tsumogiri",
      "discard:2p:tedashi",
    );
    expect(factor).not.toBeNull();
    if (!factor) throw new Error("Expected deterministic safety evidence");

    expect(factor.statement).not.toContain("safe against everyone");
    expect(factor.statement).not.toContain("completely safe");
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/tile-safety-analyzer.test.ts
```

Expected: FAIL because the safety analyzer does not exist.

- [ ] **Step 3: Implement threat extraction**

Create `coach/packages/reasoning/src/analysis/threat-analyzer.ts`:

```ts
import type { SceneSnapshot } from "@riichi-coach/contracts";

export type RiichiThreat = {
  actor: number;
  declarationEventId: string;
  ippatsuAlive: boolean;
};

export function riichiThreats(scene: SceneSnapshot): RiichiThreat[] {
  return scene.threats.flatMap((threat) =>
    threat.riichi && threat.declarationEventId
      ? [{
          actor: threat.actor,
          declarationEventId: threat.declarationEventId,
          ippatsuAlive: threat.ippatsuAlive,
        }]
      : [],
  );
}
```

- [ ] **Step 4: Implement genbutsu with per-threat provenance**

Create `coach/packages/reasoning/src/analysis/tile-safety-analyzer.ts`:

```ts
import type {
  ActionId,
  FactorEvidence,
  SceneSnapshot,
  TileId,
} from "@riichi-coach/contracts";
import { riichiThreats } from "./threat-analyzer.js";

function tileFromAction(actionId: ActionId): TileId {
  return actionId.split(":")[1]!.replace(/r$/, "") as TileId;
}

function genbutsuEvidence(scene: SceneSnapshot, actor: number, tile: TileId): string[] {
  const threat = scene.threats[actor]!;
  const ownDiscards = scene.rivers[actor]!
    .filter((discard) => discard.tile.id === tile)
    .map((discard) => discard.eventId);
  const passedAfterRiichi = scene.rivers.flat()
    .filter(
      (discard) =>
        discard.tile.id === tile &&
        threat.declarationEventId !== null &&
        discard.afterRiichiEventIds.includes(threat.declarationEventId),
    )
    .map((discard) => discard.eventId);
  return [...new Set([...ownDiscards, ...passedAfterRiichi])];
}

export function deterministicSafetyForAction(
  scene: SceneSnapshot,
  actionId: ActionId,
): Array<{
  actor: number;
  classification: "genbutsu" | "unknown";
  evidenceIds: string[];
}> {
  const tile = tileFromAction(actionId);
  return riichiThreats(scene).map((threat) => {
    const evidenceIds = genbutsuEvidence(scene, threat.actor, tile);
    return {
      actor: threat.actor,
      classification: evidenceIds.length > 0 ? "genbutsu" : "unknown",
      evidenceIds,
    };
  });
}

export function compareDeterministicSafety(
  scene: SceneSnapshot,
  subjectAction: ActionId,
  comparisonAction: ActionId,
): FactorEvidence | null {
  const threats = riichiThreats(scene);
  if (threats.length === 0) return null;
  const subjectTile = tileFromAction(subjectAction);
  const comparisonTile = tileFromAction(comparisonAction);
  const decisive = threats.find((threat) => {
    const subject = genbutsuEvidence(scene, threat.actor, subjectTile);
    const comparison = genbutsuEvidence(scene, threat.actor, comparisonTile);
    return subject.length > 0 && comparison.length === 0;
  });
  if (!decisive) return null;
  const evidenceIds = genbutsuEvidence(scene, decisive.actor, subjectTile);

  return {
    factorId: `factor:${scene.decisionEventId}:defense:${subjectTile}:actor${decisive.actor}`,
    axis: "defense",
    dimension: "genbutsu",
    subjectAction,
    comparisonAction,
    direction: "supports_subject",
    magnitude: { kind: "ordinal", value: "decisive" },
    statement: `${subjectTile} is genbutsu against actor ${decisive.actor}; ` +
      `${comparisonTile} has no deterministic safety evidence against that actor`,
    provenance: "deterministic",
    confidence: "certain",
    evidenceIds,
    limitations: [`Safety applies to actor ${decisive.actor} only`],
  };
}
```

- [ ] **Step 5: Pass safety tests**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/tile-safety-analyzer.test.ts packages/reasoning/tests/scene-replayer.test.ts
npm run typecheck
```

Expected: all safety and replay tests PASS.

- [ ] **Step 6: Commit threat-specific deterministic safety**

```powershell
git add coach/packages/reasoning/src/analysis/threat-analyzer.ts coach/packages/reasoning/src/analysis/tile-safety-analyzer.ts coach/packages/reasoning/tests/tile-safety-analyzer.test.ts
git commit -m "feat: derive player-specific genbutsu evidence"
```

### Task 6: Build five-axis coverage and bilateral candidate ledgers

**Files:**
- Create: `coach/packages/reasoning/src/analysis/context-signal-analyzers.ts`
- Create: `coach/packages/reasoning/src/compare/action-comparator.ts`
- Test: `coach/packages/reasoning/tests/action-comparator.test.ts`

- [ ] **Step 1: Write the failing bilateral-ledger test**

Create `coach/packages/reasoning/tests/action-comparator.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";
import { compareDecision } from "../src/compare/action-comparator.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("action comparator", () => {
  it.each([0, 1])("keeps factors for both sides in regression %s", async (index) => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const { events, decisions } = importRegressionFixture(raw);
    const decision = decisions[index]!;
    const scene = replayToDecision(events, decision);
    const ledger = compareDecision(scene, decision);

    expect(ledger.supportsModelAction.some((factor) => factor.axis === "defense")).toBe(true);
    expect(ledger.supportsActualAction.some((factor) => factor.axis === "efficiency")).toBe(true);
    expect(new Set(ledger.coverage.map((item) => item.axis))).toEqual(
      new Set(["efficiency", "value", "defense", "placement", "option_value"]),
    );
    expect(ledger.coverage).toContainEqual(expect.objectContaining({
      axis: "defense",
      dimension: "behavioral_river_inference",
      status: "unsupported",
    }));
    expect(ledger.candidateLedgers).toHaveLength(decision.candidates.length);
    expect(ledger.candidateLedgers.every(
      (candidate) =>
        new Set(Object.keys(candidate.axes)).size === 5 &&
        candidate.axes.defense.byThreat.every((item) => item.actor === 2),
    )).toBe(true);
    expect(ledger.unknownOrUnmeasured).toContain("calibrated_dealin_probability");
  });
});
```

- [ ] **Step 2: Verify the comparator test fails**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/action-comparator.test.ts
```

Expected: FAIL because `compareDecision` does not exist.

- [ ] **Step 3: Implement limited context signals and explicit unknowns**

Create `coach/packages/reasoning/src/analysis/context-signal-analyzers.ts`:

```ts
import type { CoverageEntry, SceneSnapshot } from "@riichi-coach/contracts";

export type ContextSignals = {
  visibleBonusTiles: number;
  neutralEarlyPlacement: boolean;
  forcedPlacementPush: boolean;
  safeTilesByThreat: Record<number, string[]>;
  coverage: CoverageEntry[];
  unknowns: string[];
};

export function analyzeContextSignals(scene: SceneSnapshot): ContextSignals {
  const nextDora = (id: string): string => {
    const number = Number(id[0]);
    const suit = id[1];
    if (suit !== "z") return `${number === 9 ? 1 : number + 1}${suit}`;
    if (number <= 4) return `${number === 4 ? 1 : number + 1}z`;
    return `${number === 7 ? 5 : number + 1}z`;
  };
  const doraIds = new Set(scene.doraMarkers.map((marker) => nextDora(marker.id)));
  const visibleBonusTiles = scene.selfHand.filter(
    (tile) => tile.red || doraIds.has(tile.id),
  ).length;
  const scoreSpread = Math.max(...scene.scores) - Math.min(...scene.scores);
  const neutralEarlyPlacement = scene.bakaze === "E" && scene.kyoku === 1 &&
    scoreSpread <= 1000 && scene.kyotaku <= 1;
  const forcedPlacementPush = scene.bakaze === "S" && scene.kyoku === 4 &&
    scene.scores[scene.selfActor]! < Math.max(...scene.scores);
  const safeTilesByThreat: Record<number, string[]> = {};
  for (const threat of scene.threats.filter((item) => item.riichi)) {
    safeTilesByThreat[threat.actor] = [
      ...new Set(
        scene.rivers.flat()
          .filter(
            (discard) =>
              discard.actor === threat.actor ||
              (
                threat.declarationEventId !== null &&
                discard.afterRiichiEventIds.includes(threat.declarationEventId)
              ),
          )
          .map((discard) => discard.tile.id),
      ),
    ];
  }
  return {
    visibleBonusTiles,
    neutralEarlyPlacement,
    forcedPlacementPush,
    safeTilesByThreat,
    coverage: [
      { axis: "efficiency", dimension: "standard_shanten", status: "implemented", reason: "Deterministic standard-hand calculation" },
      { axis: "efficiency", dimension: "live_ukeire", status: "unsupported", reason: "Public visible tiles and melds are not yet fully subtracted" },
      { axis: "efficiency", dimension: "chiitoitsu_and_kokushi", status: "unsupported", reason: "Milestone 1 standard-hand scope" },
      { axis: "value", dimension: "visible_bonus_signal", status: "implemented", reason: "Counts red tiles and dora in the current visible hand deterministically" },
      { axis: "value", dimension: "full_yaku_and_point_range", status: "unsupported", reason: "Requires follow-on value plan" },
      { axis: "defense", dimension: "genbutsu", status: "implemented", reason: "Derived per riichi threat from replay" },
      { axis: "defense", dimension: "structural_safety", status: "unsupported", reason: "Suji, wall, one-chance, and honor counts are not implemented" },
      { axis: "defense", dimension: "behavioral_river_inference", status: "unsupported", reason: "No behavioral model in milestone 1" },
      { axis: "defense", dimension: "wait_inference", status: "unsupported", reason: "No wait heuristic in milestone 1" },
      { axis: "placement", dimension: "east1_neutral_signal", status: "implemented", reason: "Detects the tied East 1 regression state deterministically" },
      { axis: "placement", dimension: "all_last_forced_push_signal", status: "heuristic", reason: "Only a conservative all-last signal is implemented" },
      { axis: "placement", dimension: "outcome_path_simulation", status: "unsupported", reason: "Requires follow-on placement plan" },
      { axis: "option_value", dimension: "current_genbutsu_inventory", status: "heuristic", reason: "Counts current deterministic safe tiles only" },
      { axis: "option_value", dimension: "future_reversibility", status: "unsupported", reason: "Requires follow-on option-value plan" },
    ],
    unknowns: [
      "calibrated_dealin_probability",
      "self_full_yaku_and_point_range",
      "opponent_hand_value_distribution",
      "placement_outcome_paths",
      "behavioral_river_inference",
      "wait_shape_inference",
    ],
  };
}
```

The visible bonus comparison is deliberately a signal rather than a full value claim. It converts indicators to dora and counts red tiles, but it does not enumerate future yaku or final points.

- [ ] **Step 4: Implement the bilateral comparator**

Create `coach/packages/reasoning/src/compare/action-comparator.ts`:

```ts
import type {
  CoverageEntry,
  FactorEvidence,
  NormalizedDecision,
  SceneSnapshot,
} from "@riichi-coach/contracts";
import { analyzeContextSignals } from "../analysis/context-signal-analyzers.js";
import {
  analyzeAllDiscardEfficiency,
  compareDiscardEfficiency,
} from "../analysis/efficiency-analyzer.js";
import {
  compareDeterministicSafety,
  deterministicSafetyForAction,
} from "../analysis/tile-safety-analyzer.js";

export type CandidateLedger = {
  actionId: NormalizedDecision["modelAction"];
  axes: {
    efficiency: {
      status: "implemented" | "blocked_by_missing_data";
      shanten: number | null;
      unadjustedUkeire: number | null;
    };
    value: {
      status: "implemented";
      visibleBonusTilesBeforeDiscard: number;
    };
    defense: {
      status: "implemented";
      byThreat: ReturnType<typeof deterministicSafetyForAction>;
    };
    placement: {
      status: "implemented";
      neutralEarlyPlacement: boolean;
    };
    option_value: {
      status: "heuristic";
      currentSafeTilesByThreat: Record<number, string[]>;
    };
  };
};

export type DecisionLedger = {
  candidateLedgers: CandidateLedger[];
  supportsModelAction: FactorEvidence[];
  supportsActualAction: FactorEvidence[];
  neutralFactors: FactorEvidence[];
  unknownOrUnmeasured: string[];
  coverage: CoverageEntry[];
  contextSignals: ReturnType<typeof analyzeContextSignals>;
  efficiencyMetrics: ReturnType<typeof compareDiscardEfficiency>["metrics"];
};

export function compareDecision(
  scene: SceneSnapshot,
  decision: NormalizedDecision,
): DecisionLedger {
  const efficiency = compareDiscardEfficiency(
    scene,
    decision.actualAction,
    decision.modelAction,
  );
  const defense = compareDeterministicSafety(
    scene,
    decision.modelAction,
    decision.actualAction,
  );
  const contextSignals = analyzeContextSignals(scene);
  const allEfficiency = analyzeAllDiscardEfficiency(scene);
  const candidateLedgers: CandidateLedger[] = decision.candidates.map((candidate) => {
    const tileId = candidate.actionId.split(":")[1]!.replace(/r$/, "");
    const metrics = allEfficiency[tileId];
    return {
      actionId: candidate.actionId,
      axes: {
        efficiency: {
          status: metrics ? "implemented" : "blocked_by_missing_data",
          shanten: metrics?.shanten ?? null,
          unadjustedUkeire: metrics?.ukeire ?? null,
        },
        value: {
          status: "implemented",
          visibleBonusTilesBeforeDiscard: contextSignals.visibleBonusTiles,
        },
        defense: {
          status: "implemented",
          byThreat: deterministicSafetyForAction(scene, candidate.actionId),
        },
        placement: {
          status: "implemented",
          neutralEarlyPlacement: contextSignals.neutralEarlyPlacement,
        },
        option_value: {
          status: "heuristic",
          currentSafeTilesByThreat: contextSignals.safeTilesByThreat,
        },
      },
    };
  });
  const supportsModelAction: FactorEvidence[] = [];
  const supportsActualAction: FactorEvidence[] = [];
  const neutralFactors: FactorEvidence[] = [];
  if (efficiency.factor.direction === "supports_subject") {
    supportsActualAction.push(efficiency.factor);
  } else if (efficiency.factor.direction === "supports_comparison") {
    supportsModelAction.push(efficiency.factor);
  } else {
    neutralFactors.push(efficiency.factor);
  }
  if (defense) supportsModelAction.push(defense);
  return {
    candidateLedgers,
    supportsModelAction,
    supportsActualAction,
    neutralFactors,
    unknownOrUnmeasured: defense
      ? contextSignals.unknowns
      : [...contextSignals.unknowns, "deterministic_safety_difference"],
    coverage: contextSignals.coverage,
    contextSignals,
    efficiencyMetrics: efficiency.metrics,
  };
}
```

- [ ] **Step 5: Pass comparator and all analyzer tests**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/action-comparator.test.ts packages/reasoning/tests/*analyzer.test.ts
npm run typecheck
```

Expected: comparator, efficiency, and safety tests PASS; typecheck PASS.

- [ ] **Step 6: Commit the five-axis ledger**

```powershell
git add coach/packages/reasoning/src/analysis/context-signal-analyzers.ts coach/packages/reasoning/src/compare coach/packages/reasoning/tests/action-comparator.test.ts
git commit -m "feat: compile bilateral five-axis ledgers"
```

### Task 7: Apply versioned teaching policies and deterministic language

**Files:**
- Create: `coach/packages/reasoning/src/policy/teaching-policy.ts`
- Create: `coach/packages/reasoning/src/explain/deterministic-explanation.ts`
- Test: `coach/packages/reasoning/tests/teaching-policy.test.ts`

- [ ] **Step 1: Write failing policy tests**

Create `coach/packages/reasoning/tests/teaching-policy.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import { replayToDecision } from "../src/replay/scene-replayer.js";
import { compareDecision } from "../src/compare/action-comparator.js";
import { judgeDecision } from "../src/policy/teaching-policy.js";
import { renderDeterministicExplanation } from "../src/explain/deterministic-explanation.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("teaching policy", () => {
  it.each([
    [0, "PF-03@1", "discard:6s:tsumogiri"],
    [1, "PF-04@1", "discard:8p:tsumogiri"],
  ] as const)(
    "recommends explicit defense without assigning a model motive in regression %s",
    async (index, ruleId, actionId) => {
      const raw = JSON.parse(await readFile(fixtureUrl, "utf8"));
      const { events, decisions } = importRegressionFixture(raw);
      const decision = decisions[index]!;
      const scene = replayToDecision(events, decision);
      const ledger = compareDecision(scene, decision);
      const judgement = judgeDecision(scene, decision, ledger);
      const text = renderDeterministicExplanation(decision, ledger, judgement);

      expect(judgement).toMatchObject({ recommendedAction: actionId, ruleIds: [ruleId] });
      expect(text).toContain("Efficiency supports");
      expect(text).toContain("Deterministic safety supports");
      expect(text).toContain("The model's internal reason is unknown");
      expect(text).not.toMatch(/Mortal (because|wanted|chose in order to)/i);
    },
  );
});
```

- [ ] **Step 2: Verify the policy tests fail**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/teaching-policy.test.ts
```

Expected: FAIL because policy and renderer modules do not exist.

- [ ] **Step 3: Implement PF-03 and PF-04 as auditable rules**

Create `coach/packages/reasoning/src/policy/teaching-policy.ts`:

```ts
import type {
  ActionId,
  NormalizedDecision,
  SceneSnapshot,
} from "@riichi-coach/contracts";
import type { DecisionLedger } from "../compare/action-comparator.js";

export type CoachJudgement = {
  recommendedAction: ActionId;
  ruleIds: string[];
  confidence: "high" | "medium" | "low";
};

function modelActionIsGenbutsu(ledger: DecisionLedger): boolean {
  return ledger.supportsModelAction.some(
    (factor) => factor.axis === "defense" && factor.dimension === "genbutsu",
  );
}

function actualEfficiencyShanten(ledger: DecisionLedger): number {
  const factor = ledger.supportsActualAction.find((item) => item.axis === "efficiency");
  if (!factor) return -1;
  return ledger.efficiencyMetrics[factor.subjectAction]?.shanten ?? -1;
}

export function judgeDecision(
  scene: SceneSnapshot,
  decision: NormalizedDecision,
  ledger: DecisionLedger,
): CoachJudgement | null {
  const riichi = scene.threats.filter((threat) => threat.riichi);
  const common =
    scene.complete &&
    riichi.length > 0 &&
    modelActionIsGenbutsu(ledger) &&
    actualEfficiencyShanten(ledger) >= 1 &&
    ledger.contextSignals.visibleBonusTiles === 0 &&
    ledger.contextSignals.neutralEarlyPlacement &&
    !ledger.contextSignals.forcedPlacementPush;
  if (!common) return null;

  const ippatsu = riichi.some((threat) => threat.ippatsuAlive);
  const shanten = actualEfficiencyShanten(ledger);
  if (ippatsu && shanten < 2) return null;
  return {
    recommendedAction: decision.modelAction,
    ruleIds: [ippatsu ? "PF-03@1" : "PF-04@1"],
    confidence: ippatsu ? "medium" : "low",
  };
}
```

PF-04@1 is the non-ippatsu companion rule: against an established riichi, when the best efficiency continuation is still one-shanten or worse, the scene is a tied East 1 state, there is no visible bonus signal, and a deterministic genbutsu candidate exists, prefer that candidate. PF-03 is capped at `medium` and PF-04 at `low` in this milestone because full hand value and placement outcome paths are not implemented.

- [ ] **Step 4: Implement deterministic, bilateral wording**

Create `coach/packages/reasoning/src/explain/deterministic-explanation.ts`:

```ts
import type { NormalizedDecision } from "@riichi-coach/contracts";
import type { DecisionLedger } from "../compare/action-comparator.js";
import type { CoachJudgement } from "../policy/teaching-policy.js";

export function renderDeterministicExplanation(
  decision: NormalizedDecision,
  ledger: DecisionLedger,
  judgement: CoachJudgement | null,
): string {
  const efficiency = ledger.supportsActualAction.find(
    (factor) => factor.axis === "efficiency",
  );
  const defense = ledger.supportsModelAction.find(
    (factor) => factor.axis === "defense",
  );
  if (!efficiency || !defense) {
    return "Current structured evidence is insufficient to explain this preference reliably. " +
      "The model's internal reason is unknown.";
  }
  const conclusion = judgement
    ? `Coach rule ${judgement.ruleIds.join(", ")} recommends ${judgement.recommendedAction}.`
    : "No teaching rule has enough evidence to recommend an action.";
  return [
    `Efficiency supports ${decision.actualAction}: ${efficiency.statement}.`,
    `Deterministic safety supports ${decision.modelAction}: ${defense.statement}.`,
    conclusion,
    "Full self hand value, placement outcome paths, and calibrated deal-in probability remain unknown.",
    "The model's internal reason is unknown.",
  ].join(" ");
}
```

- [ ] **Step 5: Pass policy tests and typecheck**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/teaching-policy.test.ts
npm run typecheck
```

Expected: both policy regressions PASS and typecheck PASS.

- [ ] **Step 6: Commit versioned teaching policies**

```powershell
git add coach/packages/reasoning/src/policy coach/packages/reasoning/src/explain coach/packages/reasoning/tests/teaching-policy.test.ts
git commit -m "feat: add auditable push-fold teaching rules"
```

### Task 8: Validate the final explanation package

**Files:**
- Create: `coach/packages/reasoning/src/validate/explanation-validator.ts`
- Test: `coach/packages/reasoning/tests/explanation-validator.test.ts`

- [ ] **Step 1: Write failing rejection tests**

Create `coach/packages/reasoning/tests/explanation-validator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateExplanationPackage } from "../src/validate/explanation-validator.js";

const base = {
  decisionId: "east1-turn6",
  modelFact: {
    engine: "Mortal 4.1b",
    recommendedAction: "discard:6s:tsumogiri",
    recommendedScore: 99.2823,
    actualAction: "discard:2p:tedashi",
    actualScore: 0.0103,
    modelReason: "unknown",
  },
  observedTradeoffs: {
    supportsModelAction: ["defense-1"],
    supportsActualAction: ["efficiency-1"],
    neutralFactors: [],
    unknownOrUnmeasured: ["calibrated_dealin_probability"],
  },
  coverage: [],
  primaryAxes: ["defense", "efficiency"],
  coachJudgement: {
    recommendedAction: "discard:6s:tsumogiri",
    ruleIds: ["PF-03@1"],
    confidence: "high",
  },
  deterministicExplanation: "The model's internal reason is unknown.",
} as const;

describe("explanation validator", () => {
  it("rejects missing evidence references", () => {
    expect(() => validateExplanationPackage(base, new Set(["efficiency-1"]))).toThrow(
      /unknown factor defense-1/,
    );
  });

  it("rejects causal model attribution", () => {
    expect(() => validateExplanationPackage(
      { ...base, deterministicExplanation: "Mortal chose 6s because it wanted to defend." },
      new Set(["defense-1", "efficiency-1"]),
    )).toThrow(/model causal attribution/);
  });

  it("rejects heuristic danger described as a calibrated deal-in rate", () => {
    expect(() => validateExplanationPackage(
      { ...base, deterministicExplanation: "The Mortal deal-in probability is exactly 12%." },
      new Set(["defense-1", "efficiency-1"]),
    )).toThrow(/uncalibrated danger claim/);
  });

  it("allows a missing directional factor when the gap is explicit", () => {
    const oneSided = {
      ...base,
      observedTradeoffs: {
        ...base.observedTradeoffs,
        supportsModelAction: [],
        unknownOrUnmeasured: ["deterministic_safety_difference"],
      },
    };
    expect(validateExplanationPackage(
      oneSided,
      new Set(["efficiency-1"]),
    ).coachJudgement).toEqual(base.coachJudgement);
  });
});
```

- [ ] **Step 2: Verify the validator tests fail**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/explanation-validator.test.ts
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement fail-closed validation**

Create `coach/packages/reasoning/src/validate/explanation-validator.ts`:

```ts
import {
  DecisionExplanationSchema,
  type DecisionExplanation,
} from "@riichi-coach/contracts";

export function validateExplanationPackage(
  input: unknown,
  factorIds: Set<string>,
): DecisionExplanation {
  const parsed = DecisionExplanationSchema.parse(input);
  const referenced = [
    ...parsed.observedTradeoffs.supportsModelAction,
    ...parsed.observedTradeoffs.supportsActualAction,
    ...parsed.observedTradeoffs.neutralFactors,
  ];
  for (const factorId of referenced) {
    if (!factorIds.has(factorId)) throw new Error(`unknown factor ${factorId}`);
  }
  if (/Mortal|Akagi/i.test(parsed.deterministicExplanation) &&
      /(because|wanted|chose in order to|为了|因为)/i.test(parsed.deterministicExplanation)) {
    throw new Error("model causal attribution is forbidden");
  }
  if (/(Mortal|Akagi).*(deal-in probability|铳率).*(exactly|精确|\d+%)/i.test(
    parsed.deterministicExplanation,
  )) {
    throw new Error("uncalibrated danger claim is forbidden");
  }
  if (
    parsed.observedTradeoffs.supportsModelAction.length === 0 &&
    parsed.observedTradeoffs.supportsActualAction.length === 0 &&
    parsed.observedTradeoffs.neutralFactors.length === 0 &&
    parsed.observedTradeoffs.unknownOrUnmeasured.length === 0
  ) {
    throw new Error("empty factor account is forbidden");
  }
  return parsed;
}
```

- [ ] **Step 4: Pass validator and contract tests**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/explanation-validator.test.ts packages/contracts/tests/contracts.test.ts
npm run typecheck
```

Expected: all validator and contract tests PASS.

- [ ] **Step 5: Commit fail-closed explanation validation**

```powershell
git add coach/packages/reasoning/src/validate coach/packages/reasoning/tests/explanation-validator.test.ts
git commit -m "feat: reject unsupported coach explanations"
```

### Task 9: Assemble and lock the end-to-end East 1 regressions

**Files:**
- Create: `coach/packages/reasoning/src/index.ts`
- Create: `coach/packages/reasoning/tests/east1-regression.test.ts`
- Create: `coach/README.md`

- [ ] **Step 1: Write the failing end-to-end and mutation tests**

Create `coach/packages/reasoning/tests/east1-regression.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { explainRegressionFixture } from "../src/index.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

describe("East 1 strict reasoning regression", () => {
  it("produces bilateral, validated explanations for turns 6 and 7", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const explanations = explainRegressionFixture(fixture);

    expect(explanations).toHaveLength(2);
    expect(explanations[0]).toMatchObject({
      decisionId: "east1-turn6",
      modelFact: { modelReason: "unknown" },
      primaryAxes: ["defense", "efficiency"],
      coachJudgement: { ruleIds: ["PF-03@1"] },
    });
    expect(explanations[1]).toMatchObject({
      decisionId: "east1-turn7",
      modelFact: { modelReason: "unknown" },
      primaryAxes: ["defense", "efficiency"],
      coachJudgement: { ruleIds: ["PF-04@1"] },
    });
    expect(explanations[0]?.deterministicExplanation).not.toContain(
      "6s is an efficiency redundancy",
    );
    expect(explanations[1]?.deterministicExplanation).not.toContain(
      "8p preserves the better shape",
    );
  });

  it("removes riichi safety and refuses a teaching conclusion when reach is neutralized", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    fixture.mjaiLog = fixture.mjaiLog.map(
      (event: { type: string; actor?: number }) =>
        (event.type === "reach" || event.type === "reach_accepted") && event.actor === 2
          ? { type: "end_kyoku" }
          : event,
    );

    const explanations = explainRegressionFixture(fixture);
    expect(explanations[0]?.coachJudgement).toBeNull();
    expect(explanations[0]?.observedTradeoffs.supportsModelAction).toEqual([]);
    expect(explanations[0]?.observedTradeoffs.unknownOrUnmeasured).toContain(
      "deterministic_safety_difference",
    );
  });

  it("does not preserve turn 7 genbutsu when actor 2's earlier 8p is changed", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    fixture.mjaiLog = fixture.mjaiLog.map(
      (event: { type: string; actor?: number; pai?: string }) =>
        event.type === "dahai" && event.actor === 2 && event.pai === "8p"
          ? { ...event, pai: "7m" }
          : event,
    );

    const explanations = explainRegressionFixture(fixture);
    expect(explanations[1]?.coachJudgement).toBeNull();
    expect(explanations[1]?.observedTradeoffs.supportsModelAction).toEqual([]);
  });
});
```

- [ ] **Step 2: Verify the end-to-end tests fail**

Run:

```powershell
cd coach
npm test -- --run packages/reasoning/tests/east1-regression.test.ts
```

Expected: FAIL because the public pipeline does not exist.

- [ ] **Step 3: Implement the public strict-reasoning pipeline**

Create `coach/packages/reasoning/src/index.ts`:

```ts
import {
  type DecisionExplanation,
  type FactorEvidence,
} from "@riichi-coach/contracts";
import { importRegressionFixture } from "./import/mortal-report.js";
import { replayToDecision } from "./replay/scene-replayer.js";
import { compareDecision } from "./compare/action-comparator.js";
import { judgeDecision } from "./policy/teaching-policy.js";
import { renderDeterministicExplanation } from "./explain/deterministic-explanation.js";
import { validateExplanationPackage } from "./validate/explanation-validator.js";

export function explainRegressionFixture(raw: Parameters<typeof importRegressionFixture>[0]):
DecisionExplanation[] {
  const { events, decisions } = importRegressionFixture(raw);
  return decisions.map((decision) => {
    const scene = replayToDecision(events, decision);
    const ledger = compareDecision(scene, decision);
    const judgement = judgeDecision(scene, decision, ledger);
    const factors: FactorEvidence[] = [
      ...ledger.supportsModelAction,
      ...ledger.supportsActualAction,
      ...ledger.neutralFactors,
    ];
    const modelCandidate = decision.candidates.find(
      (candidate) => candidate.actionId === decision.modelAction,
    );
    const actualCandidate = decision.candidates.find(
      (candidate) => candidate.actionId === decision.actualAction,
    );
    if (!modelCandidate || !actualCandidate) throw new Error("Candidate score is missing");
    const output = {
      decisionId: decision.decisionId,
      modelFact: {
        engine: decision.modelName,
        recommendedAction: decision.modelAction,
        recommendedScore: modelCandidate.probability * 100,
        actualAction: decision.actualAction,
        actualScore: actualCandidate.probability * 100,
        modelReason: "unknown" as const,
      },
      observedTradeoffs: {
        supportsModelAction: ledger.supportsModelAction.map((factor) => factor.factorId),
        supportsActualAction: ledger.supportsActualAction.map((factor) => factor.factorId),
        neutralFactors: ledger.neutralFactors.map((factor) => factor.factorId),
        unknownOrUnmeasured: ledger.unknownOrUnmeasured,
      },
      coverage: ledger.coverage,
      primaryAxes: ["defense", "efficiency"] as const,
      coachJudgement: judgement,
      deterministicExplanation: renderDeterministicExplanation(
        decision,
        ledger,
        judgement,
      ),
    };
    return validateExplanationPackage(
      output,
      new Set(factors.map((factor) => factor.factorId)),
    );
  });
}

export * from "./import/mortal-report.js";
export * from "./replay/scene-replayer.js";
export * from "./compare/action-comparator.js";
```

- [ ] **Step 4: Document the milestone boundary**

Create `coach/README.md`:

```markdown
# Riichi Coach

The current milestone is a strict, fixture-driven reasoning core.

Implemented:

- Mortal facts normalized with `modelReason: "unknown"`;
- visible-only scene replay;
- standard-hand shanten, with unadjusted ukeire retained only as non-ranking diagnostics;
- player-specific riichi/genbutsu evidence;
- five-axis coverage states and bilateral factor ledgers;
- PF-03@1 and PF-04@1 teaching rules;
- deterministic explanation and fail-closed validation;
- East 1 turn 6 and turn 7 real-report regressions.

Outside this milestone:

- full yaku/points, placement outcome paths, option-value simulation;
- suji/wall/one-chance and river/wait heuristics;
- calibrated deal-in statistics;
- production Mortal/Akagi adapters, persistence, LLM, or UI.

Unsupported items remain machine-visible in the coverage matrix and are never filled by an LLM.
```

- [ ] **Step 5: Run all milestone and legacy tests**

Run:

```powershell
cd coach
npm test
npm run typecheck
cd ..
node --test tests/*.test.mjs
```

Expected:

- all coach contract, unit, mutation, and end-to-end tests PASS;
- TypeScript reports no errors;
- all existing static-course tests PASS;
- no test reads the network.

- [ ] **Step 6: Inspect source boundaries and the dirty worktree**

Run:

```powershell
git status --short
git diff --check
git diff --name-only
```

Expected: only planned `coach/` and `.gitignore` changes from this milestone are present in the implementation commits. Existing user changes in `RESOURCES.md` and `overlay/tests/MahjongSoulOverlay.Core.Tests/TransactionAggregatorTests.cs` remain untouched.

- [ ] **Step 7: Commit the complete strict-reasoning milestone**

```powershell
git add coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/east1-regression.test.ts coach/README.md
git commit -m "feat: lock strict Mortal reasoning regressions"
```

## Plan self-review checklist

- Every model action and score remains a raw model fact; `modelReason` is always `unknown`.
- Every explanation factor has provenance, confidence, evidence IDs, and limitations.
- Model and actual actions are represented in the same candidate-ledger shape.
- Both sides of the comparison remain visible.
- Safety is attributed to actor 2, never to the whole table.
- Turn 6 has riichi plus ippatsu; turn 7 has riichi with ippatsu cancelled.
- `6s` and `8p` safety comes from replay events, not Mortal scores.
- `2p` and `7p` efficiency comes from their lower deterministic standard-hand shanten.
- Unimplemented value, placement, option, river, wait, and calibrated-risk work is explicit.
- No LLM is present in the trusted reasoning path.
- The legacy website and the unrelated `overlay/` project remain unchanged.
