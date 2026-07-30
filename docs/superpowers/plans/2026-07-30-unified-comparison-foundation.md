# Unified Comparison Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first independently testable foundation for unified model/user candidate comparison: strict request frames, opaque candidate references, optional model-evaluation evidence, frozen score thresholds, and preference-set agreement.

**Architecture:** Keep data shape and cross-field invariants in `@riichi-coach/contracts`; keep score construction, threshold classification, and preference comparison as pure functions in `@riichi-coach/reasoning`. This slice does not replace the current discard-only strict analysis package or integrate with the Mortal importer. Later slices will supply the structured action union, candidate normalizer, unified factor pipeline, teaching retrieval, and dialogue orchestration.

**Tech Stack:** TypeScript 5.9, NodeNext ESM, Zod 3.25, Vitest 3.2, npm workspaces.

---

## Scope and workspace safety

Implement only slice 1 from:

- `docs/superpowers/specs/2026-07-30-unified-comparison-analysis-design.md`

In scope:

- `AnalysisRequest`, `AnalysisFrame`, `ComparisonSet`;
- opaque `ActionRef`;
- preference sets and agreement states;
- Mortal probability and Akagi Native logit adapters;
- 0–100 model selection scores;
- frozen per-evaluation detail threshold;
- automatic-review failure when the actual action is not scored;
- public package exports and regression verification.

Out of scope:

- replacing the existing `ActionIdSchema`;
- natural-language action parsing;
- full chi/pon/kan/win/pass action objects;
- changing `NormalizedDecisionSchema`;
- changing the current `StrictAnalysisPackage`;
- legal-action enumeration;
- unified factor-ledger generation;
- teaching-book or MCP retrieval;
- LLM prompting, persistence, or UI work.

The repository contains unrelated user and overlay work. Before every commit, stage only the exact `coach/` files listed by that task. Never stage `RESOURCES.md` or `overlay/`.

## File map

Create:

- `coach/packages/contracts/src/comparison.ts` — opaque action/decision-layer references and deduplicated comparison candidates.
- `coach/packages/contracts/src/analysis-frame.ts` — current, modified, standalone, and conceptual fact boundaries.
- `coach/packages/contracts/src/preference.ts` — preference-set and agreement contracts.
- `coach/packages/contracts/src/model-evaluation.ts` — strict model-score evidence and score-method invariants.
- `coach/packages/contracts/src/analysis-request.ts` — comparison/conceptual request union and cross-object references.
- `coach/packages/contracts/tests/comparison.test.ts`
- `coach/packages/contracts/tests/analysis-frame.test.ts`
- `coach/packages/contracts/tests/preference.test.ts`
- `coach/packages/contracts/tests/model-evaluation.test.ts`
- `coach/packages/contracts/tests/analysis-request.test.ts`
- `coach/packages/reasoning/src/model/model-evaluation-builder.ts` — Mortal/Akagi score construction.
- `coach/packages/reasoning/src/policy/detail-policy.ts` — frozen threshold snapshots and classification.
- `coach/packages/reasoning/src/preference/preference-agreement.ts` — deterministic agreement truth table.
- `coach/packages/reasoning/tests/model-evaluation-builder.test.ts`
- `coach/packages/reasoning/tests/detail-policy.test.ts`
- `coach/packages/reasoning/tests/preference-agreement.test.ts`

Modify:

- `coach/packages/contracts/src/index.ts` — export new contracts.
- `coach/packages/reasoning/src/index.ts` — export new pure functions.
- `coach/smoke/package-import-smoke.mjs` — prove emitted JavaScript exposes the new API.
- `coach/README.md` — document the new foundation and remove the superseded complete-legal-action prerequisite.

## Preflight

- [ ] Run `git status --short` from `E:\文档\日麻教学`.

Expected: unrelated user/overlay changes may be present. Record them and do not stage them.

- [ ] Run the existing coach baseline.

Run:

```powershell
npm test
```

Working directory: `E:\文档\日麻教学\coach`

Expected: all existing coach tests pass.

- [ ] Run the legacy project baseline.

Run:

```powershell
node --test tests/*.test.mjs
```

Working directory: `E:\文档\日麻教学`

Expected: all legacy tests pass.

### Task 1: Opaque action references and comparison sets

**Files:**

- Create: `coach/packages/contracts/tests/comparison.test.ts`
- Create: `coach/packages/contracts/src/comparison.ts`
- Modify: `coach/packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing comparison-contract tests**

Create `coach/packages/contracts/tests/comparison.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ActionRefSchema,
  ComparisonSetSchema,
  type ActionRef,
} from "../src/index.js";

describe("comparison contracts", () => {
  it("does not allow an unparsed string to masquerade as an ActionRef", () => {
    // @ts-expect-error ActionRef values must cross the schema boundary.
    const invalidActionRef: ActionRef = "action:unparsed";
    expect(invalidActionRef).toBe("action:unparsed");
  });

  it("keeps an action opaque and allows multiple declared origins", () => {
    const parsed = ComparisonSetSchema.parse({
      comparisonSetId: "comparison:e1:t6",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:e1:t6",
      candidates: [
        {
          actionRef: "action:model",
          origins: ["model"],
        },
        {
          actionRef: "action:actual",
          origins: ["model", "actual"],
        },
      ],
    });

    expect(parsed.candidates[1]?.origins).toEqual(["model", "actual"]);
    expect(ActionRefSchema.parse("discard:6s:tsumogiri")).toBe(
      "discard:6s:tsumogiri",
    );
  });

  it("rejects duplicate candidates, duplicate origins, and singleton comparisons", () => {
    expect(() => ComparisonSetSchema.parse({
      comparisonSetId: "comparison:duplicate-action",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:user:1",
      candidates: [
        { actionRef: "action:a", origins: ["model"] },
        { actionRef: "action:a", origins: ["actual"] },
      ],
    })).toThrow();

    expect(() => ComparisonSetSchema.parse({
      comparisonSetId: "comparison:duplicate-origin",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:user:2",
      candidates: [
        { actionRef: "action:a", origins: ["model", "model"] },
        { actionRef: "action:b", origins: ["actual"] },
      ],
    })).toThrow();

    expect(() => ComparisonSetSchema.parse({
      comparisonSetId: "comparison:singleton",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:user:3",
      candidates: [
        { actionRef: "action:a", origins: ["user"] },
      ],
    })).toThrow();
  });

  it("requires every automatic candidate to be model-scored and exactly one actual", () => {
    expect(() => ComparisonSetSchema.parse({
      comparisonSetId: "comparison:auto:no-actual",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:auto:1",
      candidates: [
        { actionRef: "action:a", origins: ["model"] },
        { actionRef: "action:b", origins: ["model"] },
      ],
    })).toThrow();

    expect(() => ComparisonSetSchema.parse({
      comparisonSetId: "comparison:auto:unscored",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:auto:2",
      candidates: [
        { actionRef: "action:a", origins: ["model", "actual"] },
        { actionRef: "action:b", origins: ["user"] },
      ],
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```powershell
npx vitest run packages/contracts/tests/comparison.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because `ActionRefSchema` and `ComparisonSetSchema` are not exported.

- [ ] **Step 3: Implement the comparison contracts**

Create `coach/packages/contracts/src/comparison.ts`:

```ts
import { z } from "zod";

export const ActionRefSchema = z.string().min(1).brand<"ActionRef">();
export type ActionRef = z.infer<typeof ActionRefSchema>;

export const DecisionLayerRefSchema = z.string().min(1)
  .brand<"DecisionLayerRef">();
export type DecisionLayerRef = z.infer<typeof DecisionLayerRefSchema>;

export const CandidateOriginSchema = z.enum(["model", "actual", "user"]);
export type CandidateOrigin = z.infer<typeof CandidateOriginSchema>;

const CandidateOriginsSchema = z.array(CandidateOriginSchema).min(1)
  .superRefine((origins, context) => {
    if (new Set(origins).size !== origins.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Candidate origins must be unique",
      });
    }
  });

export const ComparisonCandidateSchema = z.object({
  actionRef: ActionRefSchema,
  origins: CandidateOriginsSchema,
}).strict();
export type ComparisonCandidate = z.infer<typeof ComparisonCandidateSchema>;

export const ComparisonSetSchema = z.object({
  comparisonSetId: z.string().min(1),
  origin: z.enum(["automatic_review", "user_comparison"]),
  decisionLayerRef: DecisionLayerRefSchema,
  candidates: z.array(ComparisonCandidateSchema).min(2),
}).strict().superRefine((comparisonSet, context) => {
  const actionRefs = comparisonSet.candidates.map(
    (candidate) => candidate.actionRef,
  );
  if (new Set(actionRefs).size !== actionRefs.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Comparison candidates must have unique action references",
      path: ["candidates"],
    });
  }
  const actualCandidates = comparisonSet.candidates.filter(
    (candidate) => candidate.origins.includes("actual"),
  );
  if (actualCandidates.length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A comparison set may contain at most one actual action",
      path: ["candidates"],
    });
  }
  if (comparisonSet.origin === "automatic_review") {
    if (actualCandidates.length !== 1) {
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
});
export type ComparisonSet = z.infer<typeof ComparisonSetSchema>;
```

Append to `coach/packages/contracts/src/index.ts`:

```ts
export * from "./comparison.js";
```

- [ ] **Step 4: Run the focused test and typecheck**

Run:

```powershell
npx vitest run packages/contracts/tests/comparison.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: comparison tests PASS; typecheck PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add -- coach/packages/contracts/src/comparison.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/comparison.test.ts
git diff --cached --check
git commit -m "feat: add comparison set contracts"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files.

### Task 2: Analysis-frame fact boundaries

**Files:**

- Create: `coach/packages/contracts/tests/analysis-frame.test.ts`
- Create: `coach/packages/contracts/src/analysis-frame.ts`
- Modify: `coach/packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing frame tests**

Create `coach/packages/contracts/tests/analysis-frame.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AnalysisFrameSchema } from "../src/index.js";

describe("analysis frame contracts", () => {
  it("accepts replay facts for the current scene", () => {
    const parsed = AnalysisFrameSchema.parse({
      kind: "current_scene",
      frameId: "frame:e1:t6",
      scope: { kind: "applied_decision" },
      sceneRef: "scene:e1:t6",
      facts: [
        { factId: "event-48", provenance: "raw_replay" },
      ],
    });

    expect(parsed.kind).toBe("current_scene");
  });

  it("preserves replaced and asserted facts in a modified scene", () => {
    const parsed = AnalysisFrameSchema.parse({
      kind: "modified_scene",
      frameId: "frame:e1:t6:modified",
      scope: { kind: "single_axis", axis: "efficiency" },
      baseSceneRef: "scene:e1:t6",
      baseFacts: [
        { factId: "event-48", provenance: "raw_replay" },
      ],
      modifications: [
        {
          modificationId: "mod:replace-draw",
          replacedFact: {
            factId: "event-48",
            provenance: "raw_replay",
          },
          assertedFact: {
            factId: "user-fact:draw-7s",
            provenance: "user_asserted",
          },
        },
      ],
    });

    expect(parsed.kind).toBe("modified_scene");
    if (parsed.kind === "modified_scene") {
      expect(parsed.modifications[0]?.replacedFact.factId).toBe("event-48");
      expect(parsed.modifications[0]?.assertedFact.factId).toBe(
        "user-fact:draw-7s",
      );
    }
  });

  it("keeps standalone hypotheses user-asserted and conceptual frames fact-free", () => {
    expect(AnalysisFrameSchema.parse({
      kind: "standalone_hypothesis",
      frameId: "frame:user:hand",
      scope: { kind: "flat_discard" },
      facts: [
        { factId: "user-fact:hand", provenance: "user_asserted" },
      ],
    }).kind).toBe("standalone_hypothesis");

    expect(AnalysisFrameSchema.parse({
      kind: "conceptual",
      frameId: "frame:concept:furiten",
      scope: { kind: "conceptual" },
      topic: "Why does temporary furiten end after the next draw?",
    }).kind).toBe("conceptual");
  });

  it("rejects cross-contaminated fact provenance", () => {
    expect(() => AnalysisFrameSchema.parse({
      kind: "current_scene",
      frameId: "frame:invalid-current",
      scope: { kind: "applied_decision" },
      sceneRef: "scene:e1:t6",
      facts: [
        { factId: "user-fact:hand", provenance: "user_asserted" },
      ],
    })).toThrow();

    expect(() => AnalysisFrameSchema.parse({
      kind: "standalone_hypothesis",
      frameId: "frame:invalid-standalone",
      scope: { kind: "flat_discard" },
      facts: [
        { factId: "event-48", provenance: "raw_replay" },
      ],
    })).toThrow();

    expect(() => AnalysisFrameSchema.parse({
      kind: "modified_scene",
      frameId: "frame:invalid-modified",
      scope: { kind: "flat_discard" },
      baseSceneRef: "scene:e1:t6",
      baseFacts: [
        { factId: "event-48", provenance: "raw_replay" },
      ],
      modifications: [
        {
          modificationId: "mod:missing-base-fact",
          replacedFact: {
            factId: "event-not-in-base",
            provenance: "raw_replay",
          },
          assertedFact: {
            factId: "user-fact:replacement",
            provenance: "user_asserted",
          },
        },
      ],
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/contracts/tests/analysis-frame.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because `AnalysisFrameSchema` is not exported.

- [ ] **Step 3: Implement strict frame schemas**

Create `coach/packages/contracts/src/analysis-frame.ts`:

```ts
import { z } from "zod";
import { AxisSchema } from "./evidence.js";

export const RawReplayFactRefSchema = z.object({
  factId: z.string().min(1),
  provenance: z.literal("raw_replay"),
}).strict();
export type RawReplayFactRef = z.infer<typeof RawReplayFactRefSchema>;

export const UserAssertedFactRefSchema = z.object({
  factId: z.string().min(1),
  provenance: z.literal("user_asserted"),
}).strict();
export type UserAssertedFactRef = z.infer<typeof UserAssertedFactRefSchema>;

export const ComparisonScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("flat_discard") }).strict(),
  z.object({
    kind: z.literal("single_axis"),
    axis: AxisSchema,
    dimension: z.string().min(1).optional(),
  }).strict(),
  z.object({ kind: z.literal("applied_decision") }).strict(),
]);
export type ComparisonScope = z.infer<typeof ComparisonScopeSchema>;

export const CurrentSceneFrameSchema = z.object({
  kind: z.literal("current_scene"),
  frameId: z.string().min(1),
  scope: ComparisonScopeSchema,
  sceneRef: z.string().min(1),
  facts: z.array(RawReplayFactRefSchema).min(1),
}).strict();

export const FrameModificationSchema = z.object({
  modificationId: z.string().min(1),
  replacedFact: RawReplayFactRefSchema,
  assertedFact: UserAssertedFactRefSchema,
}).strict();

export const ModifiedSceneFrameSchema = z.object({
  kind: z.literal("modified_scene"),
  frameId: z.string().min(1),
  scope: ComparisonScopeSchema,
  baseSceneRef: z.string().min(1),
  baseFacts: z.array(RawReplayFactRefSchema).min(1),
  modifications: z.array(FrameModificationSchema).min(1),
}).strict();

export const StandaloneHypothesisFrameSchema = z.object({
  kind: z.literal("standalone_hypothesis"),
  frameId: z.string().min(1),
  scope: ComparisonScopeSchema,
  facts: z.array(UserAssertedFactRefSchema).min(1),
}).strict();

export const ConceptualFrameSchema = z.object({
  kind: z.literal("conceptual"),
  frameId: z.string().min(1),
  scope: z.object({ kind: z.literal("conceptual") }).strict(),
  topic: z.string().min(1),
}).strict();

type FrameForValidation =
  | z.infer<typeof CurrentSceneFrameSchema>
  | z.infer<typeof ModifiedSceneFrameSchema>
  | z.infer<typeof StandaloneHypothesisFrameSchema>
  | z.infer<typeof ConceptualFrameSchema>;

function validateFrameFacts(
  frame: FrameForValidation,
  context: z.RefinementCtx,
): void {
  if (frame.kind === "current_scene") {
    const factIds = frame.facts.map((fact) => fact.factId);
    if (new Set(factIds).size !== factIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current-scene facts must be unique",
        path: ["facts"],
      });
    }
  } else if (frame.kind === "standalone_hypothesis") {
    const factIds = frame.facts.map((fact) => fact.factId);
    if (new Set(factIds).size !== factIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Standalone facts must be unique",
        path: ["facts"],
      });
    }
  } else if (frame.kind === "modified_scene") {
    const baseFactIds = frame.baseFacts.map((fact) => fact.factId);
    if (new Set(baseFactIds).size !== baseFactIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Modified-scene base facts must be unique",
        path: ["baseFacts"],
      });
    }
    const baseFactSet = new Set(baseFactIds);
    frame.modifications.forEach((modification, index) => {
      if (!baseFactSet.has(modification.replacedFact.factId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Every replaced fact must exist in the base scene",
          path: ["modifications", index, "replacedFact"],
        });
      }
    });
    const modificationIds = frame.modifications.map(
      (modification) => modification.modificationId,
    );
    if (new Set(modificationIds).size !== modificationIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Frame modification IDs must be unique",
        path: ["modifications"],
      });
    }
    const replacedFactIds = frame.modifications.map(
      (modification) => modification.replacedFact.factId,
    );
    const assertedFactIds = frame.modifications.map(
      (modification) => modification.assertedFact.factId,
    );
    if (
      new Set(replacedFactIds).size !== replacedFactIds.length ||
      new Set(assertedFactIds).size !== assertedFactIds.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each modified fact must be replaced and asserted once",
        path: ["modifications"],
      });
    }
  }
}

export const ComparisonAnalysisFrameSchema = z.union([
  CurrentSceneFrameSchema,
  ModifiedSceneFrameSchema,
  StandaloneHypothesisFrameSchema,
]).superRefine(validateFrameFacts);
export type ComparisonAnalysisFrame = z.infer<
  typeof ComparisonAnalysisFrameSchema
>;

export const AnalysisFrameSchema = z.union([
  CurrentSceneFrameSchema,
  ModifiedSceneFrameSchema,
  StandaloneHypothesisFrameSchema,
  ConceptualFrameSchema,
]).superRefine(validateFrameFacts);
export type AnalysisFrame = z.infer<typeof AnalysisFrameSchema>;
```

Append to `coach/packages/contracts/src/index.ts`:

```ts
export * from "./analysis-frame.js";
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npx vitest run packages/contracts/tests/analysis-frame.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: frame tests PASS; typecheck PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git add -- coach/packages/contracts/src/analysis-frame.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/analysis-frame.test.ts
git diff --cached --check
git commit -m "feat: define analysis frame boundaries"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files.

### Task 3: Preference-set contracts

**Files:**

- Create: `coach/packages/contracts/tests/preference.test.ts`
- Create: `coach/packages/contracts/src/preference.ts`
- Modify: `coach/packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing preference tests**

Create `coach/packages/contracts/tests/preference.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ComparisonPreferencesSchema,
  PreferenceSetSchema,
} from "../src/index.js";

describe("preference contracts", () => {
  it("accepts tied preferences and every agreement state", () => {
    expect(PreferenceSetSchema.parse([
      "action:a",
      "action:b",
    ])).toEqual(["action:a", "action:b"]);

    expect(ComparisonPreferencesSchema.parse({
      modelPreference: ["action:a"],
      coachPreference: ["action:a", "action:b"],
      agreement: "partial_agreement",
    }).agreement).toBe("partial_agreement");
  });

  it("rejects duplicate actions and empty preference sets", () => {
    expect(() => PreferenceSetSchema.parse([])).toThrow();
    expect(() => PreferenceSetSchema.parse([
      "action:a",
      "action:a",
    ])).toThrow();
  });

  it("rejects a forged agreement state", () => {
    expect(() => ComparisonPreferencesSchema.parse({
      modelPreference: ["action:a"],
      coachPreference: ["action:b"],
      agreement: "agree",
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/contracts/tests/preference.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because the preference schemas are not exported.

- [ ] **Step 3: Implement preference schemas**

Create `coach/packages/contracts/src/preference.ts`:

```ts
import { z } from "zod";
import { ActionRefSchema } from "./comparison.js";

export const PreferenceSetSchema = z.array(ActionRefSchema).min(1)
  .superRefine((actionRefs, context) => {
    if (new Set(actionRefs).size !== actionRefs.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Preference actions must be unique",
      });
    }
  });
export type PreferenceSet = z.infer<typeof PreferenceSetSchema>;

export const PreferenceSchema = PreferenceSetSchema.nullable();
export type Preference = z.infer<typeof PreferenceSchema>;

export const PreferenceAgreementSchema = z.enum([
  "agree",
  "partial_agreement",
  "conflict",
  "not_comparable",
]);
export type PreferenceAgreement = z.infer<typeof PreferenceAgreementSchema>;

export const ComparisonPreferencesSchema = z.object({
  modelPreference: PreferenceSchema,
  coachPreference: PreferenceSchema,
  agreement: PreferenceAgreementSchema,
}).strict().superRefine((preferences, context) => {
  const expected = (() => {
    if (
      preferences.modelPreference === null ||
      preferences.coachPreference === null
    ) {
      return "not_comparable";
    }
    const model = new Set(preferences.modelPreference);
    const coach = new Set(preferences.coachPreference);
    if (
      model.size === coach.size &&
      [...model].every((actionRef) => coach.has(actionRef))
    ) {
      return "agree";
    }
    if ([...model].some((actionRef) => coach.has(actionRef))) {
      return "partial_agreement";
    }
    return "conflict";
  })();
  if (preferences.agreement !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Agreement must be derived from both preference sets",
      path: ["agreement"],
    });
  }
});
export type ComparisonPreferences = z.infer<
  typeof ComparisonPreferencesSchema
>;
```

Append to `coach/packages/contracts/src/index.ts`:

```ts
export * from "./preference.js";
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npx vitest run packages/contracts/tests/preference.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: preference tests PASS; typecheck PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add -- coach/packages/contracts/src/preference.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/preference.test.ts
git diff --cached --check
git commit -m "feat: add preference set contracts"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files.

### Task 4: Strict model-evaluation evidence

**Files:**

- Create: `coach/packages/contracts/tests/model-evaluation.test.ts`
- Create: `coach/packages/contracts/src/model-evaluation.ts`
- Modify: `coach/packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing model-evaluation tests**

Create `coach/packages/contracts/tests/model-evaluation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ModelEvaluationSchema } from "../src/index.js";

const mortalEvaluation = {
  evaluationId: "evaluation:mortal:e1:t6",
  comparisonSetId: "comparison:e1:t6",
  decisionLayerRef: "decision-layer:e1:t6",
  engineId: "mortal",
  engineVersion: "4.1b",
  adapterVersion: "mortal-score@1",
  scoreMethod: "mortal_probability_x100",
  detailPolicy: {
    threshold: 10,
    unit: "model_selection_score_points",
    boundary: "greater_than_or_equal_is_detailed",
    policyVersion: "detail-policy@1",
    frozenAt: "2026-07-30T00:00:00.000Z",
  },
  candidates: [
    {
      actionRef: "action:6s",
      rawValues: [
        { metric: "probability", value: 0.75 },
        { metric: "q_value", value: 1.2 },
      ],
      modelSelectionScore: 75,
    },
    {
      actionRef: "action:2p",
      rawValues: [
        { metric: "probability", value: 0.25 },
        { metric: "q_value", value: 0.4 },
      ],
      modelSelectionScore: 25,
    },
  ],
  preferredActions: ["action:6s"],
  actualActionRef: "action:2p",
  errorGap: 50,
  modelReason: "unknown",
} as const;

describe("model evaluation contract", () => {
  it("accepts replayable Mortal score evidence", () => {
    const parsed = ModelEvaluationSchema.parse(mortalEvaluation);

    expect(parsed.preferredActions).toEqual(["action:6s"]);
    expect(parsed.detailPolicy.threshold).toBe(10);
    expect(parsed.errorGap).toBe(50);
  });

  it("rejects a claimed model reason, an unscored actual action, and wrong top actions", () => {
    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      modelReason: "defense",
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      actualActionRef: "action:missing",
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      preferredActions: ["action:2p"],
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      errorGap: 49,
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      scoreMethod: "akagi_softmax_x100",
    })).toThrow();

    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      candidates: mortalEvaluation.candidates.map((candidate, index) =>
        index === 0
          ? {
              ...candidate,
              rawValues: [
                ...candidate.rawValues,
                { metric: "logit", value: 1 },
              ],
            }
          : candidate
      ),
    })).toThrow();
  });

  it("recomputes Mortal and Akagi selection scores", () => {
    expect(() => ModelEvaluationSchema.parse({
      ...mortalEvaluation,
      candidates: [
        {
          ...mortalEvaluation.candidates[0],
          modelSelectionScore: 74,
        },
        mortalEvaluation.candidates[1],
      ],
    })).toThrow();

    expect(ModelEvaluationSchema.parse({
      evaluationId: "evaluation:akagi:test",
      comparisonSetId: "comparison:akagi:test",
      decisionLayerRef: "decision-layer:akagi:test",
      engineId: "akagi_native",
      engineVersion: "1.0.0",
      adapterVersion: "akagi-score@1",
      scoreMethod: "akagi_softmax_x100",
      detailPolicy: mortalEvaluation.detailPolicy,
      candidates: [
        {
          actionRef: "action:a",
          rawValues: [{ metric: "logit", value: 1 }],
          modelSelectionScore: 73.10585786300048,
        },
        {
          actionRef: "action:b",
          rawValues: [{ metric: "logit", value: 0 }],
          modelSelectionScore: 26.894142136999513,
        },
      ],
      preferredActions: ["action:a"],
      actualActionRef: "action:b",
      errorGap: 46.21171572600097,
      modelReason: "unknown",
    }).engineId).toBe("akagi_native");
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/contracts/tests/model-evaluation.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because `ModelEvaluationSchema` is not exported.

- [ ] **Step 3: Implement the strict model-evaluation contract**

Create `coach/packages/contracts/src/model-evaluation.ts`:

```ts
import { z } from "zod";
import {
  ActionRefSchema,
  DecisionLayerRefSchema,
} from "./comparison.js";
import { PreferenceSetSchema } from "./preference.js";

const SCORE_TOLERANCE = 1e-9;

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= SCORE_TOLERANCE;
}

export const RawModelValueSchema = z.object({
  metric: z.enum(["probability", "logit", "q_value"]),
  value: z.number().finite(),
}).strict();
export type RawModelValue = z.infer<typeof RawModelValueSchema>;

const RawModelValuesSchema = z.array(RawModelValueSchema).min(1)
  .superRefine((values, context) => {
    const metrics = values.map((value) => value.metric);
    if (new Set(metrics).size !== metrics.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Raw model metrics must be unique per candidate",
      });
    }
  });

export const ModelCandidateScoreSchema = z.object({
  actionRef: ActionRefSchema,
  rawValues: RawModelValuesSchema,
  modelSelectionScore: z.number().finite().min(0).max(100),
}).strict();
export type ModelCandidateScore = z.infer<typeof ModelCandidateScoreSchema>;

export const ModelScoreMethodSchema = z.enum([
  "mortal_probability_x100",
  "akagi_softmax_x100",
]);
export type ModelScoreMethod = z.infer<typeof ModelScoreMethodSchema>;

export const DetailPolicySnapshotSchema = z.object({
  threshold: z.number().finite().min(0).max(100),
  unit: z.literal("model_selection_score_points"),
  boundary: z.literal("greater_than_or_equal_is_detailed"),
  policyVersion: z.string().min(1),
  frozenAt: z.string().datetime(),
}).strict();
export type DetailPolicySnapshot = z.infer<
  typeof DetailPolicySnapshotSchema
>;

function metricValue(
  candidate: ModelCandidateScore,
  metric: string,
): number | undefined {
  return candidate.rawValues.find((value) => value.metric === metric)?.value;
}

export const ModelEvaluationSchema = z.object({
  evaluationId: z.string().min(1),
  comparisonSetId: z.string().min(1),
  decisionLayerRef: DecisionLayerRefSchema,
  engineId: z.enum(["mortal", "akagi_native"]),
  engineVersion: z.string().min(1),
  adapterVersion: z.string().min(1),
  scoreMethod: ModelScoreMethodSchema,
  detailPolicy: DetailPolicySnapshotSchema,
  candidates: z.array(ModelCandidateScoreSchema).min(2),
  preferredActions: PreferenceSetSchema,
  actualActionRef: ActionRefSchema,
  errorGap: z.number().finite().min(0).max(100),
  modelReason: z.literal("unknown"),
}).strict().superRefine((evaluation, context) => {
  const actionRefs = evaluation.candidates.map(
    (candidate) => candidate.actionRef,
  );
  if (new Set(actionRefs).size !== actionRefs.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Model candidate scores must have unique action references",
      path: ["candidates"],
    });
  }

  if (!actionRefs.includes(evaluation.actualActionRef)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Actual action must have a model score",
      path: ["actualActionRef"],
    });
  }

  if (
    (evaluation.engineId === "mortal" &&
      evaluation.scoreMethod !== "mortal_probability_x100") ||
    (evaluation.engineId === "akagi_native" &&
      evaluation.scoreMethod !== "akagi_softmax_x100")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Score method must match the declared engine",
      path: ["scoreMethod"],
    });
  }

  const highestScore = Math.max(
    ...evaluation.candidates.map(
      (candidate) => candidate.modelSelectionScore,
    ),
  );
  const expectedPreferred = new Set(
    evaluation.candidates
      .filter(
        (candidate) => candidate.modelSelectionScore === highestScore,
      )
      .map((candidate) => candidate.actionRef),
  );
  const declaredPreferred = new Set(evaluation.preferredActions);
  if (
    expectedPreferred.size !== declaredPreferred.size ||
    [...expectedPreferred].some(
      (actionRef) => !declaredPreferred.has(actionRef),
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Preferred actions must equal every highest-scored action",
      path: ["preferredActions"],
    });
  }

  const actualScore = evaluation.candidates.find(
    (candidate) => candidate.actionRef === evaluation.actualActionRef,
  )?.modelSelectionScore;
  if (
    actualScore !== undefined &&
    !approximatelyEqual(
      evaluation.errorGap,
      highestScore - actualScore,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Error gap must equal highest score minus actual score",
      path: ["errorGap"],
    });
  }

  if (evaluation.scoreMethod === "mortal_probability_x100") {
    evaluation.candidates.forEach((candidate, index) => {
      if (candidate.rawValues.some((value) => value.metric === "logit")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mortal evidence cannot contain Akagi logits",
          path: ["candidates", index, "rawValues"],
        });
      }
      const probability = metricValue(candidate, "probability");
      if (
        probability === undefined ||
        probability < 0 ||
        probability > 1 ||
        !approximatelyEqual(
          candidate.modelSelectionScore,
          probability * 100,
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mortal selection score must equal probability times 100",
          path: ["candidates", index],
        });
      }
    });
  } else {
    evaluation.candidates.forEach((candidate, index) => {
      if (
        candidate.rawValues.some(
          (value) => value.metric === "probability",
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Akagi evidence cannot contain Mortal probabilities",
          path: ["candidates", index, "rawValues"],
        });
      }
    });
    const logits = evaluation.candidates.map(
      (candidate) => metricValue(candidate, "logit"),
    );
    if (logits.some((logit) => logit === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every Akagi candidate requires a raw logit",
        path: ["candidates"],
      });
      return;
    }
    const numericLogits = logits as number[];
    const maxLogit = Math.max(...numericLogits);
    const exponentials = numericLogits.map(
      (logit) => Math.exp(logit - maxLogit),
    );
    const denominator = exponentials.reduce(
      (total, value) => total + value,
      0,
    );
    evaluation.candidates.forEach((candidate, index) => {
      const expected = exponentials[index]! / denominator * 100;
      if (!approximatelyEqual(candidate.modelSelectionScore, expected)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Akagi selection score must equal stable softmax times 100",
          path: ["candidates", index],
        });
      }
    });
  }
});
export type ModelEvaluation = z.infer<typeof ModelEvaluationSchema>;
```

Append to `coach/packages/contracts/src/index.ts`:

```ts
export * from "./model-evaluation.js";
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npx vitest run packages/contracts/tests/model-evaluation.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: model-evaluation tests PASS; typecheck PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```powershell
git add -- coach/packages/contracts/src/model-evaluation.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/model-evaluation.test.ts
git diff --cached --check
git commit -m "feat: validate model evaluation evidence"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files.

### Task 5: Unified analysis-request contract

**Files:**

- Create: `coach/packages/contracts/tests/analysis-request.test.ts`
- Create: `coach/packages/contracts/src/analysis-request.ts`
- Modify: `coach/packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing request tests**

Create `coach/packages/contracts/tests/analysis-request.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AnalysisRequestSchema } from "../src/index.js";

const comparisonSet = {
  comparisonSetId: "comparison:user:1",
  origin: "user_comparison",
  decisionLayerRef: "decision-layer:user:1",
  candidates: [
    { actionRef: "action:a", origins: ["user"] },
    { actionRef: "action:b", origins: ["user"] },
  ],
} as const;

describe("analysis request contract", () => {
  it("requires a comparison set for comparison requests", () => {
    const parsed = AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:1",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:user:1",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet,
    });

    expect(parsed.kind).toBe("comparison_request");
  });

  it("forbids a comparison set on conceptual requests", () => {
    expect(AnalysisRequestSchema.parse({
      kind: "conceptual_request",
      requestId: "request:concept",
      frame: {
        kind: "conceptual",
        frameId: "frame:concept:1",
        scope: { kind: "conceptual" },
        topic: "What is temporary furiten?",
      },
    }).kind).toBe("conceptual_request");

    expect(() => AnalysisRequestSchema.parse({
      kind: "conceptual_request",
      requestId: "request:invalid-concept",
      frame: {
        kind: "conceptual",
        frameId: "frame:concept:2",
        scope: { kind: "conceptual" },
        topic: "What is temporary furiten?",
      },
      comparisonSet,
    })).toThrow();
  });

  it("requires every model-scored action to belong to the comparison set", () => {
    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:invalid-model-ref",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:user:2",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet,
      modelEvaluation: {
        evaluationId: "evaluation:test",
        comparisonSetId: "comparison:user:1",
        decisionLayerRef: "decision-layer:user:1",
        engineId: "mortal",
        engineVersion: "4.1b",
        adapterVersion: "mortal-score@1",
        scoreMethod: "mortal_probability_x100",
        detailPolicy: {
          threshold: 10,
          unit: "model_selection_score_points",
          boundary: "greater_than_or_equal_is_detailed",
          policyVersion: "detail-policy@1",
          frozenAt: "2026-07-30T00:00:00.000Z",
        },
        candidates: [
          {
            actionRef: "action:a",
            rawValues: [{ metric: "probability", value: 0.6 }],
            modelSelectionScore: 60,
          },
          {
            actionRef: "action:outside",
            rawValues: [{ metric: "probability", value: 0.4 }],
            modelSelectionScore: 40,
          },
        ],
        preferredActions: ["action:a"],
        actualActionRef: "action:outside",
        errorGap: 20,
        modelReason: "unknown",
      },
    })).toThrow();
  });

  it("rejects model evidence bound to another comparison or decision layer", () => {
    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:wrong-binding",
      frame: {
        kind: "standalone_hypothesis",
        frameId: "frame:user:binding",
        scope: { kind: "flat_discard" },
        facts: [
          { factId: "user-fact:hand", provenance: "user_asserted" },
        ],
      },
      comparisonSet: {
        ...comparisonSet,
        candidates: [
          { actionRef: "action:a", origins: ["model"] },
          { actionRef: "action:b", origins: ["model", "actual"] },
        ],
      },
      modelEvaluation: {
        evaluationId: "evaluation:wrong-binding",
        comparisonSetId: "comparison:other",
        decisionLayerRef: "decision-layer:other",
        engineId: "mortal",
        engineVersion: "4.1b",
        adapterVersion: "mortal-score@1",
        scoreMethod: "mortal_probability_x100",
        detailPolicy: {
          threshold: 10,
          unit: "model_selection_score_points",
          boundary: "greater_than_or_equal_is_detailed",
          policyVersion: "detail-policy@1",
          frozenAt: "2026-07-30T00:00:00.000Z",
        },
        candidates: [
          {
            actionRef: "action:a",
            rawValues: [{ metric: "probability", value: 0.6 }],
            modelSelectionScore: 60,
          },
          {
            actionRef: "action:b",
            rawValues: [{ metric: "probability", value: 0.4 }],
            modelSelectionScore: 40,
          },
        ],
        preferredActions: ["action:a"],
        actualActionRef: "action:b",
        errorGap: 20,
        modelReason: "unknown",
      },
    })).toThrow();
  });

  it("requires exact score coverage for automatic review", () => {
    const automaticSet = {
      comparisonSetId: "comparison:auto:1",
      origin: "automatic_review",
      decisionLayerRef: "decision-layer:auto:1",
      candidates: [
        { actionRef: "action:a", origins: ["model"] },
        { actionRef: "action:b", origins: ["model", "actual"] },
        { actionRef: "action:c", origins: ["model"] },
      ],
    } as const;

    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:auto:missing-evaluation",
      frame: {
        kind: "current_scene",
        frameId: "frame:auto:1",
        scope: { kind: "applied_decision" },
        sceneRef: "scene:auto:1",
        facts: [{ factId: "event-1", provenance: "raw_replay" }],
      },
      comparisonSet: automaticSet,
    })).toThrow();

    expect(() => AnalysisRequestSchema.parse({
      kind: "comparison_request",
      requestId: "request:auto:partial-evaluation",
      frame: {
        kind: "current_scene",
        frameId: "frame:auto:2",
        scope: { kind: "applied_decision" },
        sceneRef: "scene:auto:2",
        facts: [{ factId: "event-1", provenance: "raw_replay" }],
      },
      comparisonSet: automaticSet,
      modelEvaluation: {
        evaluationId: "evaluation:auto:partial",
        comparisonSetId: "comparison:auto:1",
        decisionLayerRef: "decision-layer:auto:1",
        engineId: "mortal",
        engineVersion: "4.1b",
        adapterVersion: "mortal-score@1",
        scoreMethod: "mortal_probability_x100",
        detailPolicy: {
          threshold: 10,
          unit: "model_selection_score_points",
          boundary: "greater_than_or_equal_is_detailed",
          policyVersion: "detail-policy@1",
          frozenAt: "2026-07-30T00:00:00.000Z",
        },
        candidates: [
          {
            actionRef: "action:a",
            rawValues: [{ metric: "probability", value: 0.6 }],
            modelSelectionScore: 60,
          },
          {
            actionRef: "action:b",
            rawValues: [{ metric: "probability", value: 0.4 }],
            modelSelectionScore: 40,
          },
        ],
        preferredActions: ["action:a"],
        actualActionRef: "action:b",
        errorGap: 20,
        modelReason: "unknown",
      },
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/contracts/tests/analysis-request.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because `AnalysisRequestSchema` is not exported.

- [ ] **Step 3: Implement the request union and reference validation**

Create `coach/packages/contracts/src/analysis-request.ts`:

```ts
import { z } from "zod";
import {
  ComparisonAnalysisFrameSchema,
  ConceptualFrameSchema,
} from "./analysis-frame.js";
import { ComparisonSetSchema } from "./comparison.js";
import { ModelEvaluationSchema } from "./model-evaluation.js";

export const ComparisonAnalysisRequestSchema = z.object({
  kind: z.literal("comparison_request"),
  requestId: z.string().min(1),
  frame: ComparisonAnalysisFrameSchema,
  comparisonSet: ComparisonSetSchema,
  modelEvaluation: ModelEvaluationSchema.optional(),
}).strict();

export const ConceptualAnalysisRequestSchema = z.object({
  kind: z.literal("conceptual_request"),
  requestId: z.string().min(1),
  frame: ConceptualFrameSchema,
}).strict();

export const AnalysisRequestSchema = z.discriminatedUnion("kind", [
  ComparisonAnalysisRequestSchema,
  ConceptualAnalysisRequestSchema,
]).superRefine((request, context) => {
  if (request.kind !== "comparison_request") {
    return;
  }
  if (
    request.comparisonSet.origin === "automatic_review" &&
    request.modelEvaluation === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Automatic review requires complete model evidence",
      path: ["modelEvaluation"],
    });
    return;
  }
  if (request.modelEvaluation === undefined) {
    return;
  }
  if (
    request.modelEvaluation.comparisonSetId !==
      request.comparisonSet.comparisonSetId ||
    request.modelEvaluation.decisionLayerRef !==
      request.comparisonSet.decisionLayerRef
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Model evidence must bind to this comparison and decision layer",
      path: ["modelEvaluation"],
    });
  }
  const comparisonActions = new Set(
    request.comparisonSet.candidates.map(
      (candidate) => candidate.actionRef,
    ),
  );
  request.modelEvaluation.candidates.forEach((candidate, index) => {
    if (!comparisonActions.has(candidate.actionRef)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every model-scored action must belong to the comparison set",
        path: ["modelEvaluation", "candidates", index, "actionRef"],
      });
    }
  });
  const scoredActions = new Set(
    request.modelEvaluation.candidates.map(
      (candidate) => candidate.actionRef,
    ),
  );
  if (
    request.comparisonSet.origin === "automatic_review" &&
    (
      scoredActions.size !== comparisonActions.size ||
      [...comparisonActions].some(
        (actionRef) => !scoredActions.has(actionRef),
      )
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Automatic review requires exact model score coverage",
      path: ["modelEvaluation", "candidates"],
    });
  }
  const actualCandidate = request.comparisonSet.candidates.find(
    (candidate) => candidate.origins.includes("actual"),
  );
  if (
    actualCandidate === undefined ||
    actualCandidate.actionRef !== request.modelEvaluation.actualActionRef
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Model actual action must match the comparison actual action",
      path: ["modelEvaluation", "actualActionRef"],
    });
  }
});
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
```

Append to `coach/packages/contracts/src/index.ts`:

```ts
export * from "./analysis-request.js";
```

- [ ] **Step 4: Run contract tests and typecheck**

Run:

```powershell
npx vitest run packages/contracts/tests/analysis-request.test.ts
npx vitest run packages/contracts/tests
npm run typecheck
npm run build -w @riichi-coach/contracts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: all contract tests PASS; typecheck PASS; emitted contract package rebuilt with the new exports for the reasoning-package tasks.

- [ ] **Step 5: Commit Task 5**

Run:

```powershell
git add -- coach/packages/contracts/src/analysis-request.ts coach/packages/contracts/src/index.ts coach/packages/contracts/tests/analysis-request.test.ts
git diff --cached --check
git commit -m "feat: add unified analysis requests"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files.

### Task 6: Model score builders

**Files:**

- Create: `coach/packages/reasoning/tests/model-evaluation-builder.test.ts`
- Create: `coach/packages/reasoning/src/model/model-evaluation-builder.ts`
- Modify: `coach/packages/reasoning/src/index.ts`

- [ ] **Step 1: Write the failing builder tests**

Create `coach/packages/reasoning/tests/model-evaluation-builder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildAkagiModelEvaluation,
  buildMortalModelEvaluation,
} from "../src/model/model-evaluation-builder.js";

const common = {
  evaluationId: "evaluation:test",
  comparisonSetId: "comparison:test",
  decisionLayerRef: "decision-layer:test",
  engineVersion: "test-engine",
  adapterVersion: "score-adapter@1",
  actualActionRef: "action:actual",
  detailPolicy: {
    threshold: 10,
    unit: "model_selection_score_points",
    boundary: "greater_than_or_equal_is_detailed",
    policyVersion: "detail-policy@1",
    frozenAt: "2026-07-30T00:00:00.000Z",
  },
} as const;

describe("model evaluation builders", () => {
  it("builds Mortal probability-times-100 evidence without renormalizing", () => {
    const result = buildMortalModelEvaluation({
      ...common,
      candidates: [
        { actionRef: "action:model", probability: 0.7, qValue: 1.4 },
        { actionRef: "action:actual", probability: 0.2, qValue: 0.2 },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.evaluation.candidates.map(
        (candidate) => candidate.modelSelectionScore,
      )).toEqual([70, 20]);
      expect(result.evaluation.preferredActions).toEqual(["action:model"]);
    }
  });

  it("uses stable softmax for Akagi logits", () => {
    const result = buildAkagiModelEvaluation({
      ...common,
      candidates: [
        { actionRef: "action:model", logit: 1001 },
        { actionRef: "action:actual", logit: 1000 },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.evaluation.candidates[0]?.modelSelectionScore)
        .toBeCloseTo(73.10585786300048);
      expect(result.evaluation.candidates[1]?.modelSelectionScore)
        .toBeCloseTo(26.894142136999513);
    }
  });

  it("fails closed when the actual action is not scored", () => {
    expect(buildMortalModelEvaluation({
      ...common,
      actualActionRef: "action:missing",
      candidates: [
        { actionRef: "action:a", probability: 0.7 },
        { actionRef: "action:b", probability: 0.3 },
      ],
    })).toEqual({
      status: "incomplete",
      reason: "actual_action_not_scored",
    });
  });

  it("keeps every truly tied top action in the model preference", () => {
    const result = buildMortalModelEvaluation({
      ...common,
      candidates: [
        { actionRef: "action:model", probability: 0.5 },
        { actionRef: "action:actual", probability: 0.5 },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.evaluation.preferredActions).toEqual([
        "action:model",
        "action:actual",
      ]);
      expect(result.evaluation.errorGap).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/reasoning/tests/model-evaluation-builder.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because the builder module does not exist.

- [ ] **Step 3: Implement the model-evaluation builders**

Create `coach/packages/reasoning/src/model/model-evaluation-builder.ts`:

```ts
import {
  ActionRefSchema,
  ModelEvaluationSchema,
  type ActionRef,
  type DetailPolicySnapshot,
  type ModelEvaluation,
} from "@riichi-coach/contracts";

type CommonEvaluationInput = {
  evaluationId: string;
  comparisonSetId: string;
  decisionLayerRef: string;
  engineVersion: string;
  adapterVersion: string;
  actualActionRef: string;
  detailPolicy: DetailPolicySnapshot;
};

export type ModelEvaluationBuildResult =
  | { status: "ready"; evaluation: ModelEvaluation }
  | {
      status: "incomplete";
      reason:
        | "fewer_than_two_scored_candidates"
        | "actual_action_not_scored";
    };

export type MortalCandidateInput = {
  actionRef: string;
  probability: number;
  qValue?: number;
};

export type AkagiCandidateInput = {
  actionRef: string;
  logit: number;
  qValue?: number;
};

function checkAutomaticEvidence(
  candidates: ReadonlyArray<{ actionRef: string }>,
  actualActionRef: string,
): ModelEvaluationBuildResult | null {
  if (candidates.length < 2) {
    return {
      status: "incomplete",
      reason: "fewer_than_two_scored_candidates",
    };
  }
  if (!candidates.some(
    (candidate) => candidate.actionRef === actualActionRef,
  )) {
    return {
      status: "incomplete",
      reason: "actual_action_not_scored",
    };
  }
  return null;
}

function preferredActions(
  candidates: ReadonlyArray<{
    actionRef: ActionRef;
    modelSelectionScore: number;
  }>,
): ActionRef[] {
  const highest = Math.max(
    ...candidates.map((candidate) => candidate.modelSelectionScore),
  );
  return candidates
    .filter((candidate) => candidate.modelSelectionScore === highest)
    .map((candidate) => candidate.actionRef);
}

function errorGap(
  candidates: ReadonlyArray<{
    actionRef: ActionRef;
    modelSelectionScore: number;
  }>,
  actualActionRef: string,
): number {
  const highest = Math.max(
    ...candidates.map((candidate) => candidate.modelSelectionScore),
  );
  const actual = candidates.find(
    (candidate) => candidate.actionRef === actualActionRef,
  )!;
  return highest - actual.modelSelectionScore;
}

export function buildMortalModelEvaluation(
  input: CommonEvaluationInput & {
    candidates: MortalCandidateInput[];
  },
): ModelEvaluationBuildResult {
  const incomplete = checkAutomaticEvidence(
    input.candidates,
    input.actualActionRef,
  );
  if (incomplete) {
    return incomplete;
  }
  const candidates = input.candidates.map((candidate) => ({
    actionRef: ActionRefSchema.parse(candidate.actionRef),
    rawValues: [
      { metric: "probability", value: candidate.probability },
      ...(candidate.qValue === undefined
        ? []
        : [{ metric: "q_value", value: candidate.qValue }]),
    ],
    modelSelectionScore: candidate.probability * 100,
  }));
  const evaluation = ModelEvaluationSchema.parse({
    evaluationId: input.evaluationId,
    comparisonSetId: input.comparisonSetId,
    decisionLayerRef: input.decisionLayerRef,
    engineId: "mortal",
    engineVersion: input.engineVersion,
    adapterVersion: input.adapterVersion,
    scoreMethod: "mortal_probability_x100",
    detailPolicy: input.detailPolicy,
    candidates,
    preferredActions: preferredActions(candidates),
    actualActionRef: input.actualActionRef,
    errorGap: errorGap(candidates, input.actualActionRef),
    modelReason: "unknown",
  });
  return { status: "ready", evaluation };
}

export function buildAkagiModelEvaluation(
  input: CommonEvaluationInput & {
    candidates: AkagiCandidateInput[];
  },
): ModelEvaluationBuildResult {
  const incomplete = checkAutomaticEvidence(
    input.candidates,
    input.actualActionRef,
  );
  if (incomplete) {
    return incomplete;
  }
  const highestLogit = Math.max(
    ...input.candidates.map((candidate) => candidate.logit),
  );
  const exponentials = input.candidates.map(
    (candidate) => Math.exp(candidate.logit - highestLogit),
  );
  const denominator = exponentials.reduce(
    (total, value) => total + value,
    0,
  );
  const candidates = input.candidates.map((candidate, index) => ({
    actionRef: ActionRefSchema.parse(candidate.actionRef),
    rawValues: [
      { metric: "logit", value: candidate.logit },
      ...(candidate.qValue === undefined
        ? []
        : [{ metric: "q_value", value: candidate.qValue }]),
    ],
    modelSelectionScore: exponentials[index]! / denominator * 100,
  }));
  const evaluation = ModelEvaluationSchema.parse({
    evaluationId: input.evaluationId,
    comparisonSetId: input.comparisonSetId,
    decisionLayerRef: input.decisionLayerRef,
    engineId: "akagi_native",
    engineVersion: input.engineVersion,
    adapterVersion: input.adapterVersion,
    scoreMethod: "akagi_softmax_x100",
    detailPolicy: input.detailPolicy,
    candidates,
    preferredActions: preferredActions(candidates),
    actualActionRef: input.actualActionRef,
    errorGap: errorGap(candidates, input.actualActionRef),
    modelReason: "unknown",
  });
  return { status: "ready", evaluation };
}

```

Append to `coach/packages/reasoning/src/index.ts`:

```ts
export * from "./model/model-evaluation-builder.js";
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npx vitest run packages/reasoning/tests/model-evaluation-builder.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: builder tests PASS; typecheck PASS.

- [ ] **Step 5: Commit Task 6**

Run:

```powershell
git add -- coach/packages/reasoning/src/model/model-evaluation-builder.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/model-evaluation-builder.test.ts
git diff --cached --check
git commit -m "feat: build frozen model evaluations"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files.

### Task 7: Frozen detail policy and threshold boundaries

**Files:**

- Create: `coach/packages/reasoning/tests/detail-policy.test.ts`
- Create: `coach/packages/reasoning/src/policy/detail-policy.ts`
- Modify: `coach/packages/reasoning/src/index.ts`

- [ ] **Step 1: Write the failing detail-policy tests**

Create `coach/packages/reasoning/tests/detail-policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildMortalModelEvaluation,
  classifyModelEvaluationDetail,
  DEFAULT_ERROR_DETAIL_THRESHOLD,
  freezeDetailPolicy,
} from "../src/index.js";

describe("frozen detail policy", () => {
  it("defaults to 10 model-selection-score points", () => {
    expect(freezeDetailPolicy({
      policyVersion: "detail-policy@1",
      frozenAt: "2026-07-30T00:00:00.000Z",
    })).toEqual({
      threshold: 10,
      unit: "model_selection_score_points",
      boundary: "greater_than_or_equal_is_detailed",
      policyVersion: "detail-policy@1",
      frozenAt: "2026-07-30T00:00:00.000Z",
    });
    expect(DEFAULT_ERROR_DETAIL_THRESHOLD).toBe(10);
  });

  it.each([
    [9.999, "concise"],
    [10, "detailed"],
    [10.001, "detailed"],
  ] as const)(
    "classifies a %s-point gap as %s",
    (gap, expectedTier) => {
      const detailPolicy = freezeDetailPolicy({
        threshold: 10,
        policyVersion: "detail-policy@1",
        frozenAt: "2026-07-30T00:00:00.000Z",
      });
      const result = buildMortalModelEvaluation({
        evaluationId: `evaluation:gap:${gap}`,
        comparisonSetId: `comparison:gap:${gap}`,
        decisionLayerRef: `decision-layer:gap:${gap}`,
        engineVersion: "test",
        adapterVersion: "mortal-score@1",
        actualActionRef: "action:actual",
        detailPolicy,
        candidates: [
          {
            actionRef: "action:model",
            probability: 0.5 + gap / 100,
          },
          {
            actionRef: "action:actual",
            probability: 0.5,
          },
        ],
      });

      expect(result.status).toBe("ready");
      if (result.status === "ready") {
        expect(result.evaluation.errorGap).toBeCloseTo(gap);
        expect(classifyModelEvaluationDetail(result.evaluation)).toBe(
          expectedTier,
        );
      }
    },
  );

  it("classifies a tied actual action as not_error", () => {
    const result = buildMortalModelEvaluation({
      evaluationId: "evaluation:tie",
      comparisonSetId: "comparison:tie",
      decisionLayerRef: "decision-layer:tie",
      engineVersion: "test",
      adapterVersion: "mortal-score@1",
      actualActionRef: "action:actual",
      detailPolicy: freezeDetailPolicy({
        policyVersion: "detail-policy@1",
        frozenAt: "2026-07-30T00:00:00.000Z",
      }),
      candidates: [
        { actionRef: "action:model", probability: 0.5 },
        { actionRef: "action:actual", probability: 0.5 },
      ],
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(classifyModelEvaluationDetail(result.evaluation)).toBe(
        "not_error",
      );
    }
  });

  it("does not reread a mutable global threshold", () => {
    let globalThreshold = 10;
    const snapshot = freezeDetailPolicy({
      threshold: globalThreshold,
      policyVersion: "detail-policy@1",
      frozenAt: "2026-07-30T00:00:00.000Z",
    });
    globalThreshold = 30;

    expect(globalThreshold).toBe(30);
    expect(snapshot.threshold).toBe(10);
  });

  it("rejects an invalid threshold or freeze timestamp", () => {
    expect(() => freezeDetailPolicy({
      threshold: -1,
      policyVersion: "detail-policy@1",
      frozenAt: "2026-07-30T00:00:00.000Z",
    })).toThrow();
    expect(() => freezeDetailPolicy({
      policyVersion: "detail-policy@1",
      frozenAt: "not-a-datetime",
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/reasoning/tests/detail-policy.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because the detail-policy module is not exported.

- [ ] **Step 3: Implement the frozen policy helper**

Create `coach/packages/reasoning/src/policy/detail-policy.ts`:

```ts
import {
  DetailPolicySnapshotSchema,
  ModelEvaluationSchema,
  type DetailPolicySnapshot,
  type ModelEvaluation,
} from "@riichi-coach/contracts";

export const DEFAULT_ERROR_DETAIL_THRESHOLD = 10;

export function freezeDetailPolicy(input: {
  threshold?: number;
  policyVersion: string;
  frozenAt: string;
}): DetailPolicySnapshot {
  return DetailPolicySnapshotSchema.parse({
    threshold: input.threshold ?? DEFAULT_ERROR_DETAIL_THRESHOLD,
    unit: "model_selection_score_points",
    boundary: "greater_than_or_equal_is_detailed",
    policyVersion: input.policyVersion,
    frozenAt: input.frozenAt,
  });
}

export function classifyModelEvaluationDetail(
  rawEvaluation: ModelEvaluation,
): "not_error" | "concise" | "detailed" {
  const evaluation = ModelEvaluationSchema.parse(rawEvaluation);
  if (
    evaluation.preferredActions.includes(evaluation.actualActionRef)
  ) {
    return "not_error";
  }
  return evaluation.errorGap >= evaluation.detailPolicy.threshold
    ? "detailed"
    : "concise";
}
```

Append to `coach/packages/reasoning/src/index.ts`:

```ts
export * from "./policy/detail-policy.js";
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npx vitest run packages/reasoning/tests/detail-policy.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: detail-policy tests PASS; typecheck PASS.

- [ ] **Step 5: Commit Task 7**

Run:

```powershell
git add -- coach/packages/reasoning/src/policy/detail-policy.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/detail-policy.test.ts
git diff --cached --check
git commit -m "feat: freeze model detail thresholds"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files.

### Task 8: Preference agreement truth table

**Files:**

- Create: `coach/packages/reasoning/tests/preference-agreement.test.ts`
- Create: `coach/packages/reasoning/src/preference/preference-agreement.ts`
- Modify: `coach/packages/reasoning/src/index.ts`

- [ ] **Step 1: Write the failing truth-table tests**

Create `coach/packages/reasoning/tests/preference-agreement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ComparisonSetSchema } from "@riichi-coach/contracts";
import {
  computePreferenceAgreement,
  createActionPreference,
  createPreferenceState,
} from "../src/index.js";

describe("preference agreement", () => {
  it.each([
    [null, ["action:a"], "not_comparable"],
    [["action:a"], null, "not_comparable"],
    [["action:a"], ["action:a"], "agree"],
    [
      ["action:a", "action:b"],
      ["action:b", "action:c"],
      "partial_agreement",
    ],
    [["action:a"], ["action:b"], "conflict"],
  ] as const)(
    "maps %j and %j to %s",
    (modelPreference, coachPreference, expected) => {
      expect(computePreferenceAgreement(
        modelPreference,
        coachPreference,
      )).toBe(expected);
    },
  );

  it("rejects malformed duplicate preference sets", () => {
    expect(() => computePreferenceAgreement(
      ["action:a", "action:a"],
      ["action:a"],
    )).toThrow();
  });

  it("normalizes preference sets and rejects actions outside the comparison", () => {
    expect(createActionPreference([
      "action:b",
      "action:a",
      "action:b",
    ])).toEqual(["action:a", "action:b"]);

    const comparisonSet = ComparisonSetSchema.parse({
      comparisonSetId: "comparison:user:preference",
      origin: "user_comparison",
      decisionLayerRef: "decision-layer:user:preference",
      candidates: [
        { actionRef: "action:a", origins: ["user"] },
        { actionRef: "action:b", origins: ["user"] },
      ],
    });
    expect(createPreferenceState(
      comparisonSet,
      createActionPreference(["action:a"]),
      createActionPreference(["action:a", "action:b"]),
    ).agreement).toBe("partial_agreement");

    expect(() => createPreferenceState(
      comparisonSet,
      createActionPreference(["action:outside"]),
      null,
    )).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx vitest run packages/reasoning/tests/preference-agreement.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected: FAIL because `computePreferenceAgreement` is not exported.

- [ ] **Step 3: Implement the fixed agreement truth table**

Create `coach/packages/reasoning/src/preference/preference-agreement.ts`:

```ts
import {
  ActionRefSchema,
  ComparisonPreferencesSchema,
  ComparisonSetSchema,
  PreferenceSchema,
  PreferenceSetSchema,
  type ComparisonPreferences,
  type ComparisonSet,
  type Preference,
  type PreferenceAgreement,
} from "@riichi-coach/contracts";

function sameSet(left: Set<string>, right: Set<string>): boolean {
  return (
    left.size === right.size &&
    [...left].every((actionRef) => right.has(actionRef))
  );
}

export function computePreferenceAgreement(
  rawModelPreference: readonly string[] | null,
  rawCoachPreference: readonly string[] | null,
): PreferenceAgreement {
  const modelPreference = PreferenceSchema.parse(rawModelPreference);
  const coachPreference = PreferenceSchema.parse(rawCoachPreference);
  if (modelPreference === null || coachPreference === null) {
    return "not_comparable";
  }
  const modelSet = new Set<string>(modelPreference);
  const coachSet = new Set<string>(coachPreference);
  if (sameSet(modelSet, coachSet)) {
    return "agree";
  }
  if ([...modelSet].some((actionRef) => coachSet.has(actionRef))) {
    return "partial_agreement";
  }
  return "conflict";
}

export function createActionPreference(
  rawActionRefs: readonly string[],
): NonNullable<Preference> {
  const actionRefs = [...new Set(
    rawActionRefs.map((actionRef) => ActionRefSchema.parse(actionRef)),
  )].sort();
  return PreferenceSetSchema.parse(actionRefs);
}

export function createPreferenceState(
  rawComparisonSet: ComparisonSet,
  rawModelPreference: Preference,
  rawCoachPreference: Preference,
): ComparisonPreferences {
  const comparisonSet = ComparisonSetSchema.parse(rawComparisonSet);
  const modelPreference = PreferenceSchema.parse(rawModelPreference);
  const coachPreference = PreferenceSchema.parse(rawCoachPreference);
  const candidateRefs = new Set(
    comparisonSet.candidates.map((candidate) => candidate.actionRef),
  );
  for (const actionRef of [
    ...(modelPreference ?? []),
    ...(coachPreference ?? []),
  ]) {
    if (!candidateRefs.has(actionRef)) {
      throw new Error(
        `Preference action ${actionRef} is outside the comparison set`,
      );
    }
  }
  return ComparisonPreferencesSchema.parse({
    modelPreference,
    coachPreference,
    agreement: computePreferenceAgreement(
      modelPreference,
      coachPreference,
    ),
  });
}
```

Append to `coach/packages/reasoning/src/index.ts`:

```ts
export * from "./preference/preference-agreement.js";
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npx vitest run packages/reasoning/tests/preference-agreement.test.ts
npm run typecheck
```

Working directory: `E:\文档\日麻教学\coach`

Expected: agreement tests PASS; typecheck PASS.

- [ ] **Step 5: Commit Task 8**

Run:

```powershell
git add -- coach/packages/reasoning/src/preference/preference-agreement.ts coach/packages/reasoning/src/index.ts coach/packages/reasoning/tests/preference-agreement.test.ts
git diff --cached --check
git commit -m "feat: compare preference sets"
```

Working directory: `E:\文档\日麻教学`

Expected: one commit containing only the three listed files.

### Task 9: Public imports, documentation, and full regression

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
  assert.equal(typeof reasoning.analyzeRegressionFixture, "function");
  assert.equal(typeof reasoning.buildMortalModelEvaluation, "function");
  assert.equal(typeof reasoning.buildAkagiModelEvaluation, "function");
  assert.equal(typeof reasoning.freezeDetailPolicy, "function");
  assert.equal(typeof reasoning.classifyModelEvaluationDetail, "function");
  assert.equal(typeof reasoning.computePreferenceAgreement, "function");
  assert.equal(typeof reasoning.createPreferenceState, "function");
  assert.equal(typeof reasoning.validateStrictAnalysisPackage, "function");
});
```

- [ ] **Step 2: Run the smoke test before documentation**

Run:

```powershell
npm run test:package-import
```

Working directory: `E:\文档\日麻教学\coach`

Expected: PASS after both packages build and the emitted exports load.

- [ ] **Step 3: Update the milestone README**

In `coach/README.md`, add these bullets under `Implemented:`:

```markdown
- unified comparison-request, analysis-frame, candidate-reference, model-evaluation,
  and preference-set contracts;
- replayable Mortal probability and Akagi Native softmax selection scores with a
  frozen per-evaluation detail threshold;
- a fixed agreement truth table for model and coach preference sets;
```

Replace:

```markdown
Activation requires complete legal-action, value, placement, calibrated-risk,
multi-threat, and option-value analyzers under a separately approved plan.
```

with:

```markdown
Activation requires scored-candidate normalization plus value, placement,
calibrated-risk, multi-threat, and option-value analyzers under separately
approved plans. The coach does not claim to enumerate every legal action.
```

Under `Outside this milestone:`, replace:

```markdown
- production Mortal and Akagi Native adapters;
- complete meld, furiten, legal-action, remaining-tile, and called-discard state;
```

with:

```markdown
- production Mortal and Akagi Native report integration;
- structured chi, pon, kan, win, abortive-draw, and pass action normalization;
- complete meld, furiten, remaining-tile, and called-discard state;
```

- [ ] **Step 4: Run the complete verification matrix**

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
- TypeScript emits no errors;
- emitted-JavaScript smoke test PASS;
- npm audit reports 0 vulnerabilities.

Run:

```powershell
node --test tests/*.test.mjs
```

Working directory: `E:\文档\日麻教学`

Expected: all legacy tests PASS.

- [ ] **Step 5: Confirm the old strict regressions are unchanged**

Run:

```powershell
npx vitest run packages/reasoning/tests/public-pipeline.test.ts packages/reasoning/tests/strict-analysis-package.test.ts
```

Working directory: `E:\文档\日麻教学\coach`

Expected:

- East 1 turn 6 and turn 7 packages still validate;
- both `coachJudgement` values remain `null`;
- `modelReason` remains `unknown`.

- [ ] **Step 6: Inspect and commit only slice-1 files**

Run:

```powershell
git status --short
git diff --check -- coach
git diff --stat -- coach
git add -- coach/README.md coach/smoke/package-import-smoke.mjs
git diff --cached --check
git commit -m "docs: expose comparison foundation"
```

Working directory: `E:\文档\日麻教学`

Expected: the final task commit contains only the README and smoke-test update. Unrelated `RESOURCES.md` and `overlay/` changes remain unstaged.

## Final acceptance checklist

- [ ] `ComparisonSet` contains at least two unique opaque action references.
- [ ] Every `ComparisonSet` carries one opaque decision-layer reference.
- [ ] One action can preserve multiple origins without duplicate origin labels.
- [ ] Automatic review contains only model candidates and exactly one actual action.
- [ ] Current scenes contain only replay facts; standalone hypotheses contain only user facts.
- [ ] Modified scenes preserve both replaced replay facts and asserted replacements.
- [ ] Conceptual requests cannot contain a `ComparisonSet`.
- [ ] Comparison requests always contain a `ComparisonSet`.
- [ ] Model-evaluation actions are a subset of comparison candidates.
- [ ] Automatic-review model scores cover the comparison candidates exactly.
- [ ] Model evidence is bound to the same comparison-set and decision-layer references.
- [ ] Mortal selection score is raw candidate probability times 100 without renormalization.
- [ ] Akagi selection score is stable softmax over the returned logits times 100.
- [ ] Raw probability/logit and optional Q values remain available for audit.
- [ ] Model reasons remain fixed to `unknown`.
- [ ] The actual action must be scored before automatic review becomes ready.
- [ ] The threshold snapshot stores its unit, boundary, policy version, and freeze time inside the evaluation.
- [ ] Classification never rereads mutable global threshold state.
- [ ] Gaps `9.999`, `10`, and `10.001` classify as concise, detailed, and detailed.
- [ ] Preference equality, partial overlap, disjointness, and null states follow the fixed truth table.
- [ ] Existing strict-analysis results and legacy project tests remain unchanged.
- [ ] No legal-action completeness claim is introduced.
- [ ] No unrelated user or overlay files are staged.
