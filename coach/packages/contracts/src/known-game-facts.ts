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
  calledDiscardMarkers: z.boolean(),
}).strict();

export const KnownGameFactsSchema = z.object({
  factSetId: z.string().min(1),
  provenance: z.enum(["raw_replay", "user_asserted", "mixed"]),
  actor: ActorSchema,
  selfRiichi: z.boolean(),
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
  if (facts.decisionWindow.actor !== facts.actor) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Decision window actor must equal known self actor",
      path: ["decisionWindow", "actor"],
    });
  }
  if (facts.decisionWindow.triggerEventRef !== facts.decisionEventRef) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Decision event must equal the window trigger event",
      path: ["decisionWindow", "triggerEventRef"],
    });
  }
  if (
    facts.decisionWindow.kind === "self_turn" &&
    facts.currentDraw !== null &&
    facts.currentDraw.eventRef !== facts.decisionEventRef
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Self-turn draw must equal the decision event",
      path: ["currentDraw", "eventRef"],
    });
  }

  const riverEventIds: string[] = [];
  facts.rivers.forEach((river, actor) => {
    river.forEach((discard, discardIndex) => {
      riverEventIds.push(discard.eventId);
      if (discard.actor !== actor) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "River discard actor must match its river index",
          path: ["rivers", actor, discardIndex, "actor"],
        });
      }
    });
  });
  if (new Set(riverEventIds).size !== riverEventIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "River discard event IDs must be globally unique",
      path: ["rivers"],
    });
  }

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

  facts.melds.forEach((meld, index) => {
    if (facts.completeness.melds && meld.actor === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Complete public meld state requires meld actors",
        path: ["melds", index, "actor"],
      });
    }
  });

  if (facts.completeness.calledDiscardMarkers) {
    const riverEventIdSet = new Set(
      facts.rivers.flatMap((river) => river.map((discard) => discard.eventId)),
    );
    const calledEventIds: string[] = [];
    facts.melds.forEach((meld, index) => {
      if (meld.kind === "ankan") {
        if (meld.calledDiscardEventRef !== undefined &&
          meld.calledDiscardEventRef !== null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Ankan cannot reference a called discard",
            path: ["melds", index, "calledDiscardEventRef"],
          });
        }
        return;
      }
      if (meld.calledDiscardEventRef === undefined ||
        meld.calledDiscardEventRef === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Complete called-discard markers require open meld references",
          path: ["melds", index, "calledDiscardEventRef"],
        });
        return;
      }
      calledEventIds.push(meld.calledDiscardEventRef);
      if (!riverEventIdSet.has(meld.calledDiscardEventRef)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Called discard reference must exist in a river",
          path: ["melds", index, "calledDiscardEventRef"],
        });
      }
    });
    if (new Set(calledEventIds).size !== calledEventIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Called discard references must be unique",
        path: ["melds"],
      });
    }
  }
});

export type KnownGameFacts = z.infer<typeof KnownGameFactsSchema>;
