import { z } from "zod";
import { DecisionWindowSchema } from "./actions.js";
import { KnownMeldSchema } from "./candidate-contracts.js";
import { YakuContextV2Schema } from "./hand-structure.js";
import { RiverDiscardV2Schema } from "./round-state.js";
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
  responseOpportunities: z.boolean().default(false),
  eventSequence: z.boolean().default(false),
  roundContext: z.boolean().default(false),
}).strict();

export const KnownGameFactsSchema = z.object({
  factSetId: z.string().min(1),
  provenance: z.enum([
    "raw_replay",
    "user_asserted",
    "mixed",
    "legacy_regression_bridge_only",
  ]),
  actor: ActorSchema,
  selfRiichi: z.boolean(),
  handStructureYakuContext: YakuContextV2Schema.optional(),
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
  furitenSelfRiver: z.array(RiverDiscardV2Schema).optional(),
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

  if (facts.furitenSelfRiver !== undefined) {
    if (!facts.completeness.rivers || !facts.completeness.calledDiscardMarkers) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exact furiten self river requires complete river and called-discard facts",
        path: ["furitenSelfRiver"],
      });
    }
    if (!facts.completeness.eventSequence || !facts.completeness.roundContext) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exact furiten self river requires complete event sequence and round context",
        path: ["furitenSelfRiver"],
      });
    }
    const legacySelfRiver = facts.rivers[facts.actor]!;
    if (facts.furitenSelfRiver.length !== legacySelfRiver.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exact furiten self river must match the public self river",
        path: ["furitenSelfRiver"],
      });
    }
    facts.furitenSelfRiver.forEach((discard, index) => {
      const legacy = legacySelfRiver[index];
      if (
        discard.actor !== facts.actor ||
        legacy === undefined ||
        discard.eventRef !== legacy.eventId ||
        discard.tile.id !== legacy.tile.id ||
        discard.tile.red !== legacy.tile.red ||
        (discard.discardMode === "tsumogiri") !== legacy.tsumogiri
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Exact furiten self river must match actor, event, tile, and discard mode",
          path: ["furitenSelfRiver", index],
        });
      }
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

  if (facts.completeness.remainingDraws && facts.remainingDraws === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Complete remaining draws require a known value",
      path: ["remainingDraws"],
    });
  }

  const yakuContext = facts.handStructureYakuContext;
  if (yakuContext !== undefined) {
    const windTile34 = (wind: "E" | "S" | "W" | "N"): number =>
      27 + ["E", "S", "W", "N"].indexOf(wind);
    if (
      yakuContext.windsStatus === "known" &&
      yakuContext.roundWindTile34 !== windTile34(facts.roundWind)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Known yaku round wind must equal the round wind fact",
        path: ["handStructureYakuContext", "roundWindTile34"],
      });
    }
    if (
      yakuContext.windsStatus === "known" &&
      yakuContext.selfWindTile34 !== windTile34(facts.seatWind)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Known yaku self wind must equal the seat wind fact",
        path: ["handStructureYakuContext", "selfWindTile34"],
      });
    }
    if (yakuContext.riichiStatus === "accepted" && !facts.selfRiichi) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Accepted yaku riichi requires known self riichi",
        path: ["handStructureYakuContext", "riichiStatus"],
      });
    }
    if (yakuContext.riichiStatus === "inactive" && facts.selfRiichi) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Inactive yaku riichi requires known non-riichi self state",
        path: ["handStructureYakuContext", "riichiStatus"],
      });
    }
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
