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

function requireUniqueFactIds(
  facts: ReadonlyArray<{ factId: string }>,
  context: z.RefinementCtx,
  message: string,
  path: Array<string | number>,
): void {
  const factIds = facts.map((fact) => fact.factId);
  if (new Set(factIds).size !== factIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message,
      path,
    });
  }
}

export const CurrentSceneFrameSchema = z.object({
  kind: z.literal("current_scene"),
  frameId: z.string().min(1),
  scope: ComparisonScopeSchema,
  sceneRef: z.string().min(1),
  facts: z.array(RawReplayFactRefSchema).min(1),
}).strict().superRefine((frame, context) => {
  requireUniqueFactIds(
    frame.facts,
    context,
    "Current-scene facts must be unique",
    ["facts"],
  );
});

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
}).strict().superRefine((frame, context) => {
  requireUniqueFactIds(
    frame.baseFacts,
    context,
    "Modified-scene base facts must be unique",
    ["baseFacts"],
  );
  const baseFactSet = new Set(
    frame.baseFacts.map((fact) => fact.factId),
  );
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
});

export const StandaloneHypothesisFrameSchema = z.object({
  kind: z.literal("standalone_hypothesis"),
  frameId: z.string().min(1),
  scope: ComparisonScopeSchema,
  facts: z.array(UserAssertedFactRefSchema).min(1),
}).strict().superRefine((frame, context) => {
  requireUniqueFactIds(
    frame.facts,
    context,
    "Standalone facts must be unique",
    ["facts"],
  );
});

export const ConceptualFrameSchema = z.object({
  kind: z.literal("conceptual"),
  frameId: z.string().min(1),
  scope: z.object({ kind: z.literal("conceptual") }).strict(),
  topic: z.string().min(1),
}).strict();

export const ComparisonAnalysisFrameSchema = z.union([
  CurrentSceneFrameSchema,
  ModifiedSceneFrameSchema,
  StandaloneHypothesisFrameSchema,
]);
export type ComparisonAnalysisFrame = z.infer<
  typeof ComparisonAnalysisFrameSchema
>;

export const AnalysisFrameSchema = z.union([
  CurrentSceneFrameSchema,
  ModifiedSceneFrameSchema,
  StandaloneHypothesisFrameSchema,
  ConceptualFrameSchema,
]);
export type AnalysisFrame = z.infer<typeof AnalysisFrameSchema>;
