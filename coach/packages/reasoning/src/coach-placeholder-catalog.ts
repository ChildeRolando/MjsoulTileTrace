import { z } from "zod";
import {
  CoachContextSchema,
  FactorValueSchema,
  type CoachContext,
  type CoachContextNode,
} from "@riichi-coach/contracts";

export const COACH_EXPLANATION_PLACEHOLDER_CATALOG_VERSION =
  "coach-explanation-placeholder-catalog/v1" as const;

const CandidatePathSchema = z.enum([
  "action.kind",
  "action.tile.id", "action.tile.red",
  "action.calledTile.id", "action.calledTile.red",
  "action.addedTile.id", "action.addedTile.red",
  "action.winningTile.id", "action.winningTile.red",
  "action.targetActor",
]);
const DifferencePathSchema = z.enum([
  "leftValue.value", "rightValue.value",
  "leftValue.remainingCount", "leftValue.category",
  "rightValue.remainingCount", "rightValue.category",
  "direction", "leftActionRef", "rightActionRef",
]);

const CandidateEntrySchema = z.object({
  ref: z.string().regex(/^A[1-9][0-9]*$/),
  fields: z.array(CandidatePathSchema).min(1),
}).strict();
const DifferenceEntrySchema = z.object({
  ref: z.string().regex(/^F[1-9][0-9]*$/),
  fields: z.array(DifferencePathSchema).min(1),
}).strict();

export const CoachExplanationPlaceholderCatalogSchema = z.object({
  schemaVersion: z.literal(COACH_EXPLANATION_PLACEHOLDER_CATALOG_VERSION),
  decisions: z.array(z.object({
    decisionRef: z.string().regex(/^D[1-9][0-9]*$/),
    candidates: z.array(CandidateEntrySchema),
    differences: z.array(DifferenceEntrySchema),
  }).strict()),
}).strict();

export type CoachExplanationPlaceholderCatalog = z.infer<
  typeof CoachExplanationPlaceholderCatalogSchema
>;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function candidateFields(node: CoachContextNode): string[] {
  const payload = record(node.payload);
  if (payload === null) return [];
  const action = record(payload.action);
  if (action === null) return [];
  const fields: string[] = [];
  if (typeof action.kind === "string") fields.push("action.kind");
  for (const tileKey of ["tile", "calledTile", "addedTile", "winningTile"] as const) {
    const tile = record(action[tileKey]);
    if (tile === null) continue;
    if (typeof tile.id === "string") fields.push(`action.${tileKey}.id`);
    if (typeof tile.red === "boolean") fields.push(`action.${tileKey}.red`);
  }
  if (typeof action.targetActor === "number") fields.push("action.targetActor");
  return fields;
}

function differenceFields(
  node: CoachContextNode,
  sameDecisionActions: ReadonlySet<string>,
): string[] {
  const payload = record(node.payload);
  if (payload === null) return [];
  const fields: string[] = [];
  if (typeof payload.direction === "string") fields.push("direction");
  if (typeof payload.leftActionRef === "string" && sameDecisionActions.has(payload.leftActionRef)) {
    fields.push("leftActionRef");
  }
  if (typeof payload.rightActionRef === "string" && sameDecisionActions.has(payload.rightActionRef)) {
    fields.push("rightActionRef");
  }
  for (const side of ["leftValue", "rightValue"] as const) {
    const parsed = FactorValueSchema.safeParse(payload[side]);
    if (!parsed.success) continue;
    const value = parsed.data;
    if ((value.kind === "number" || value.kind === "boolean" || value.kind === "classification") &&
      isScalar(value.value)) {
      fields.push(`${side}.value`);
    } else if (value.kind === "honor_safety") {
      if (typeof value.remainingCount === "number") fields.push(`${side}.remainingCount`);
      if (typeof value.category === "string") fields.push(`${side}.category`);
    }
  }
  return fields;
}

/** Build a value-free, per-decision list of the scalar paths the existing
 * decoder, grounding validator and presenter can already consume. */
export function buildCoachExplanationPlaceholderCatalog(
  contextInput: CoachContext,
): CoachExplanationPlaceholderCatalog {
  const context = CoachContextSchema.parse(contextInput);
  return CoachExplanationPlaceholderCatalogSchema.parse({
    schemaVersion: COACH_EXPLANATION_PLACEHOLDER_CATALOG_VERSION,
    decisions: context.selectedDecisionRefs.map((decisionRef) => {
      const nodes = context.nodes.filter((node) => node.decisionRef === decisionRef);
      const actionRefs = new Set(nodes.filter((node) => node.nodeKind === "CandidateAction").map((node) => node.ref));
      return {
        decisionRef,
        candidates: nodes.filter((node) => node.nodeKind === "CandidateAction")
          .map((node) => ({ ref: node.ref, fields: candidateFields(node) })),
        differences: nodes.filter((node) => node.nodeKind === "FactorDifference")
          .map((node) => ({ ref: node.ref, fields: differenceFields(node, actionRefs) })),
      };
    }),
  });
}
