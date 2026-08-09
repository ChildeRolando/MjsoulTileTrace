import { z } from "zod";
import { DecisionWindowSchema } from "./actions.js";
import { KnownMeldSchema } from "./candidate-contracts.js";
import { YakuContextV2Schema } from "./hand-structure.js";
import { DefenseThreatV1Schema } from "./defense-matrix.js";
import { parseCanonicalEventRef } from "./event-stream.js";
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
  defenseThreats: z.array(DefenseThreatV1Schema),
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

  const defenseThreatActors = facts.defenseThreats.map((threat) => threat.actor);
  if (new Set(defenseThreatActors).size !== defenseThreatActors.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Defense threat actors must be unique",
      path: ["defenseThreats"],
    });
  }
  facts.defenseThreats.forEach((threat, index) => {
    const path = ["defenseThreats", index] as Array<string | number>;
    if (threat.actor === facts.actor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Defense threat actor cannot equal self actor",
        path: [...path, "actor"],
      });
    }
    if (threat.kind === "user_marked_open") {
      if (threat.source !== "user_asserted") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "User-marked open threats require user-asserted provenance",
          path: [...path, "source"],
        });
      }
      if (threat.openMeldRefs.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "User-marked open threats require open meld evidence",
          path: [...path, "openMeldRefs"],
        });
      }
      if (threat.riichiTurn.status !== "not_applicable" ||
        threat.ippatsu.status !== "not_applicable") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "User-marked open threats cannot carry riichi datum",
          path,
        });
      }
      return;
    }

    if (threat.openMeldRefs.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Riichi threats cannot carry open meld evidence",
        path: [...path, "openMeldRefs"],
      });
    }
    if (threat.riichiTurn.status === "not_applicable" ||
      threat.ippatsu.status === "not_applicable") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Riichi threats cannot mark riichi datum not applicable",
        path,
      });
    }
    if (threat.source === "canonical_replay" &&
      threat.sourceEventRefs.some((ref) => parseCanonicalEventRef(ref) === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replay defense threat evidence must use canonical event references",
        path: [...path, "sourceEventRefs"],
      });
    }
    const expectedRefs = threat.source === "user_asserted"
      ? null
      : threat.kind === "riichi_accepted" ? 2 : 1;
    if (expectedRefs !== null && threat.sourceEventRefs.length !== expectedRefs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: threat.kind === "riichi_declared"
          ? "Declared riichi requires exactly one source event reference"
          : "Accepted riichi requires exactly two source event references",
        path: [...path, "sourceEventRefs"],
      });
    }
  });

  const activeLegacyThreats = facts.threats.filter((threat) => threat.riichi);
  activeLegacyThreats.forEach((legacy, index) => {
    const matching = facts.defenseThreats.filter((threat) =>
      threat.actor === legacy.actor && threat.kind !== "user_marked_open"
    );
    if (matching.length !== 1) {
      const openOnly = facts.defenseThreats.some((threat) =>
        threat.actor === legacy.actor && threat.kind === "user_marked_open"
      );
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: openOnly
          ? "User-marked open threat cannot satisfy legacy riichi state"
          : "Active legacy riichi requires exactly one matching defense threat",
        path: ["threats", index],
      });
      return;
    }
    const rich = matching[0]!;
    if (legacy.declarationEventId !== rich.sourceEventRefs[0]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Legacy and rich riichi declaration evidence must match",
        path: ["defenseThreats", facts.defenseThreats.indexOf(rich), "sourceEventRefs", 0],
      });
    }
    const expectedIppatsu = legacy.ippatsuAlive === null
      ? "blocked_missing_facts"
      : "calculated";
    if (rich.ippatsu.status !== expectedIppatsu ||
      (legacy.ippatsuAlive !== null && rich.ippatsu.status === "calculated" &&
        rich.ippatsu.value !== legacy.ippatsuAlive)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Legacy and rich ippatsu state must match without inventing a boolean",
        path: ["defenseThreats", facts.defenseThreats.indexOf(rich), "ippatsu"],
      });
    }
  });
  facts.defenseThreats.forEach((rich, index) => {
    if (rich.kind === "user_marked_open") return;
    const activeLegacy = activeLegacyThreats.filter((legacy) =>
      legacy.actor === rich.actor
    );
    if (activeLegacy.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replay riichi defense threat requires an active legacy riichi",
        path: ["defenseThreats", index],
      });
    }
  });

  const threatSources = new Set(
    facts.defenseThreats.map((threat) => threat.source),
  );
  if (facts.factSetId.startsWith("canonical-v2:")) {
    if (!["raw_replay", "mixed"].includes(facts.provenance)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Canonical fact sets require replay or mixed fact provenance",
        path: ["provenance"],
      });
    }
    if (threatSources.has("legacy_regression_bridge_only")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Canonical fact sets cannot carry legacy threat provenance",
        path: ["defenseThreats"],
      });
    }
    const hasUserAssertion = threatSources.has("user_asserted");
    if (facts.provenance === "raw_replay" && hasUserAssertion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Canonical facts with user assertions require mixed provenance",
        path: ["provenance"],
      });
    }
    if (facts.provenance === "mixed" && !hasUserAssertion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mixed canonical fact sets require at least one user assertion",
        path: ["provenance"],
      });
    }
  } else if (facts.factSetId.startsWith("legacy-regression:")) {
    if (!["raw_replay", "legacy_regression_bridge_only"]
      .includes(facts.provenance)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Legacy fact sets require replay or legacy fact provenance",
        path: ["provenance"],
      });
    }
    if ([...threatSources].some((source) =>
      source !== "legacy_regression_bridge_only"
    )) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Legacy fact sets require legacy threat provenance",
        path: ["defenseThreats"],
      });
    }
  } else if (facts.factSetId.startsWith("user-asserted:")) {
    if (facts.provenance !== "user_asserted") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "User-asserted fact sets require user-asserted fact provenance",
        path: ["provenance"],
      });
    }
    if ([...threatSources].some((source) => source !== "user_asserted")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "User-asserted fact sets require user-asserted threat provenance",
        path: ["defenseThreats"],
      });
    }
  } else if (facts.defenseThreats.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Rich defense threats require a reserved fact-set namespace",
      path: ["factSetId"],
    });
  }

  if (facts.completeness.roundContext) {
    const seatOffset = ["E", "S", "W", "N"].indexOf(facts.seatWind);
    const dealerActor = (facts.actor - seatOffset + 4) % 4;
    facts.defenseThreats.forEach((threat, index) => {
      const expected = threat.actor === dealerActor ? "dealer" : "non_dealer";
      if (threat.dealerStatus !== expected) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Defense threat dealer status conflicts with known round context",
          path: ["defenseThreats", index, "dealerStatus"],
        });
      }
    });
  } else {
    facts.defenseThreats.forEach((threat, index) => {
      if (threat.dealerStatus !== "unknown") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Incomplete round context requires unknown threat dealer status",
          path: ["defenseThreats", index, "dealerStatus"],
        });
      }
    });
  }

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
