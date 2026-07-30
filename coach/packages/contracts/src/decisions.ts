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
