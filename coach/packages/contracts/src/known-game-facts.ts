import { z } from "zod";
import { DecisionWindowSchema } from "./actions.js";
import { KnownMeldSchema } from "./candidate-contracts.js";
import { RiverDiscardSchema, ThreatStateSchema } from "./scene.js";
import { TileSchema } from "./tiles.js";

const ActorSchema = z.number().int().min(0).max(3);
const WindSchema = z.enum(["E", "S", "W", "N"]);

const KnownFactsCompletenessSchema = z.object({
  concealedTiles: z.boolean(),
  melds: z.boolean(),
  doraIndicators: z.boolean(),
  rivers: z.boolean(),
  remainingDraws: z.boolean(),
}).strict();

export const KnownGameFactsSchema = z.object({
  factSetId: z.string().min(1),
  provenance: z.enum(["raw_replay", "user_asserted", "mixed"]),
  actor: ActorSchema,
  decisionEventRef: z.string().min(1),
  decisionWindow: DecisionWindowSchema,
  concealedTiles: z.array(TileSchema),
  currentDraw: z.object({
    tile: TileSchema,
    eventRef: z.string().min(1),
  }).strict().nullable(),
  melds: z.array(KnownMeldSchema),
  doraIndicators: z.array(TileSchema),
  rivers: z.array(z.array(RiverDiscardSchema)).length(4),
  threats: z.array(ThreatStateSchema),
  roundWind: z.enum(["E", "S"]),
  seatWind: WindSchema,
  dealer: z.boolean(),
  remainingDraws: z.number().int().nonnegative().nullable(),
  completeness: KnownFactsCompletenessSchema,
  evidenceIds: z.array(z.string().min(1)).min(1),
}).strict().superRefine((facts, context) => {
  if (new Set(facts.evidenceIds).size !== facts.evidenceIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Known game fact evidence IDs must be unique",
      path: ["evidenceIds"],
    });
  }

  const threatActors = facts.threats.map((threat) => threat.actor);
  if (new Set(threatActors).size !== threatActors.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Known threat actors must be unique",
      path: ["threats"],
    });
  }
  facts.threats.forEach((threat, index) => {
    if (threat.actor === facts.actor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Known threat actor cannot equal self actor",
        path: ["threats", index, "actor"],
      });
    }
  });

  if (facts.dealer !== (facts.seatWind === "E")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Dealer status must agree with east seat wind",
      path: ["dealer"],
    });
  }
});

export type KnownGameFacts = z.infer<typeof KnownGameFactsSchema>;
