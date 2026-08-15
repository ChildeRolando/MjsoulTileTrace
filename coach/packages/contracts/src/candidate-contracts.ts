import { z } from "zod";
import {
  DecisionWindowSchema,
} from "./actions.js";
import {
  ActionRefSchema,
  CandidateOriginSchema,
} from "./comparison.js";
import {
  StructuredComparisonCandidateSchema,
  StructuredComparisonSetSchema,
} from "./structured-comparison.js";
import {
  TileIdSchema,
  TileSchema,
} from "./tiles.js";

export const DraftTileSchema = z.object({
  id: TileIdSchema,
  red: z.boolean().optional(),
}).strict().superRefine((tile, context) => {
  if (
    tile.red === true &&
    !["5m", "5p", "5s"].includes(tile.id)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only suited fives may be red",
      path: ["red"],
    });
  }
});
export type DraftTile = z.infer<typeof DraftTileSchema>;

const ActorSchema = z.number().int().min(0).max(3);
const EventRefSchema = z.string().min(1);
const DiscardModeSchema = z.enum(["tsumogiri", "tedashi"]);

export const ActionDraftSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("discard"),
    tile: DraftTileSchema.optional(),
    discardMode: DiscardModeSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("riichi_discard"),
    tile: DraftTileSchema.optional(),
    discardMode: DiscardModeSchema.optional(),
  }).strict(),
  // M6-A3 (ADR-0001): tile-less model-side riichi candidate.
  z.object({
    kind: z.literal("declare_riichi"),
  }).strict(),
  z.object({
    kind: z.literal("chi"),
    calledTile: DraftTileSchema.optional(),
    consumedTiles: z.tuple([
      DraftTileSchema,
      DraftTileSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("pon"),
    calledTile: DraftTileSchema.optional(),
    consumedTiles: z.tuple([
      DraftTileSchema,
      DraftTileSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("daiminkan"),
    calledTile: DraftTileSchema.optional(),
    consumedTiles: z.tuple([
      DraftTileSchema,
      DraftTileSchema,
      DraftTileSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("ankan"),
    tiles: z.tuple([
      DraftTileSchema,
      DraftTileSchema,
      DraftTileSchema,
      DraftTileSchema,
    ]).optional(),
  }).strict(),
  z.object({
    kind: z.literal("kakan"),
    addedTile: DraftTileSchema.optional(),
    existingMeldRef: z.string().min(1).optional(),
  }).strict(),
  z.object({
    kind: z.literal("tsumo"),
    winningTile: DraftTileSchema.optional(),
    drawEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("ron"),
    winningTile: DraftTileSchema.optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
    winContext: z.enum(["discard", "kakan", "ankan"]).optional(),
  }).strict(),
  z.object({
    kind: z.literal("kyuushu_kyuuhai"),
    drawEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("pass"),
    responseEventRef: EventRefSchema.optional(),
    responseKind: z.enum(["discard", "kakan", "ankan"]).optional(),
  }).strict(),
]);
export type ActionDraft = z.infer<typeof ActionDraftSchema>;

export const CompactTileNotationSchema = z.string().regex(
  /^(?:[1-9][mps]|5[mps][rn]|[1-7]z)$/,
);

export const UserActionDraftSchema = z.discriminatedUnion("actionName", [
  z.object({
    actionName: z.literal("切牌"),
    tile: CompactTileNotationSchema.optional(),
    discardMode: DiscardModeSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("立直切牌"),
    tile: CompactTileNotationSchema.optional(),
    discardMode: DiscardModeSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("吃"),
    calledTile: CompactTileNotationSchema.optional(),
    consumedTiles: z.tuple([
      CompactTileNotationSchema,
      CompactTileNotationSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("碰"),
    calledTile: CompactTileNotationSchema.optional(),
    consumedTiles: z.tuple([
      CompactTileNotationSchema,
      CompactTileNotationSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("大明杠"),
    calledTile: CompactTileNotationSchema.optional(),
    consumedTiles: z.tuple([
      CompactTileNotationSchema,
      CompactTileNotationSchema,
      CompactTileNotationSchema,
    ]).optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("暗杠"),
    tiles: z.tuple([
      CompactTileNotationSchema,
      CompactTileNotationSchema,
      CompactTileNotationSchema,
      CompactTileNotationSchema,
    ]).optional(),
  }).strict(),
  z.object({
    actionName: z.literal("加杠"),
    addedTile: CompactTileNotationSchema.optional(),
    existingMeldRef: z.string().min(1).optional(),
  }).strict(),
  z.object({
    actionName: z.literal("自摸"),
    winningTile: CompactTileNotationSchema.optional(),
    drawEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("荣和"),
    winningTile: CompactTileNotationSchema.optional(),
    targetActor: ActorSchema.optional(),
    responseEventRef: EventRefSchema.optional(),
    winContext: z.enum(["discard", "kakan", "ankan"]).optional(),
  }).strict(),
  z.object({
    actionName: z.literal("九种九牌"),
    drawEventRef: EventRefSchema.optional(),
  }).strict(),
  z.object({
    actionName: z.literal("过"),
    responseEventRef: EventRefSchema.optional(),
    responseKind: z.enum(["discard", "kakan", "ankan"]).optional(),
  }).strict(),
]);
export type UserActionDraft = z.infer<typeof UserActionDraftSchema>;

export const KnownMeldSchema = z.object({
  meldRef: z.string().min(1),
  kind: z.enum(["chi", "pon", "daiminkan", "ankan", "kakan"]),
  actor: z.number().int().min(0).max(3).optional(),
  calledDiscardEventRef: z.string().min(1).nullable().optional(),
  tiles: z.array(TileSchema).min(3).max(4),
}).strict().superRefine((meld, context) => {
  const expectedLength = meld.kind === "chi" || meld.kind === "pon" ? 3 : 4;
  if (meld.tiles.length !== expectedLength) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Known ${meld.kind} must contain ${expectedLength} tiles`,
      path: ["tiles"],
    });
    return;
  }
  if (meld.kind !== "chi") {
    if (!meld.tiles.every((tile) => tile.id === meld.tiles[0]!.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Known ${meld.kind} tiles must have the same tile ID`,
        path: ["tiles"],
      });
    }
    return;
  }
  if (meld.tiles.some((tile) => tile.id.endsWith("z"))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Known chi tiles must be suited",
      path: ["tiles"],
    });
    return;
  }
  const suits = new Set(meld.tiles.map((tile) => tile.id[1]));
  const ranks = [...new Set(
    meld.tiles.map((tile) => Number(tile.id[0])),
  )].sort((left, right) => left - right);
  if (
    suits.size !== 1 ||
    ranks.length !== 3 ||
    ranks[1] !== ranks[0]! + 1 ||
    ranks[2] !== ranks[1]! + 1
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Known chi tiles must form one consecutive sequence",
      path: ["tiles"],
    });
  }
});
export type KnownMeld = z.infer<typeof KnownMeldSchema>;

export const KnownActionFactsSchema = z.object({
  decisionWindow: DecisionWindowSchema,
  concealedTiles: z.array(TileSchema).optional(),
  currentDraw: z.object({
    tile: TileSchema,
    eventRef: z.string().min(1),
  }).strict().nullable().optional(),
  melds: z.array(KnownMeldSchema).optional(),
}).strict().superRefine((facts, context) => {
  if (
    facts.melds !== undefined &&
    new Set(facts.melds.map((meld) => meld.meldRef)).size !==
      facts.melds.length
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Known meld references must be unique",
      path: ["melds"],
    });
  }
});
export type KnownActionFacts = z.infer<typeof KnownActionFactsSchema>;

const UniqueStringsSchema = z.array(z.string().min(1)).min(1)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Diagnostic fields must be unique",
      });
    }
  });

export const CandidateNormalizationResultSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("ready"),
      candidate: StructuredComparisonCandidateSchema,
      decisionWindow: DecisionWindowSchema,
      consistency: z.enum([
        "consistent",
        "unknown_due_to_missing_facts",
      ]),
      skippedChecks: z.array(z.string().min(1)),
    }).strict(),
    z.object({
      status: z.literal("structurally_invalid_action"),
      issueCodes: z.array(z.enum([
        "chi_not_sequence",
        "pon_tile_id_mismatch",
        "daiminkan_tile_id_mismatch",
        "ankan_tile_id_mismatch",
        "consumed_tiles_not_canonical",
        "ankan_tiles_not_canonical",
        "invalid_completed_action",
      ])).min(1).superRefine((values, context) => {
        if (new Set(values).size !== values.length) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Structural issue codes must be unique",
          });
        }
      }),
    }).strict(),
    z.object({
      status: z.literal("needs_clarification"),
      ambiguousFields: UniqueStringsSchema,
    }).strict(),
    z.object({
      status: z.literal("inconsistent_with_known_facts"),
      conflictCodes: UniqueStringsSchema,
      evidenceRefs: z.array(z.string().min(1)),
    }).strict(),
    z.object({
      status: z.literal("unsupported_source_action"),
      sourceType: z.string().min(1),
    }).strict(),
  ],
).superRefine((result, context) => {
  if (result.status !== "ready") {
    return;
  }
  if (
    result.consistency === "consistent" &&
    result.skippedChecks.length > 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Consistent normalization cannot skip checks",
      path: ["skippedChecks"],
    });
  }
  if (
    result.consistency === "unknown_due_to_missing_facts" &&
    result.skippedChecks.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Missing-fact normalization must name skipped checks",
      path: ["skippedChecks"],
    });
  }
  if (
    new Set(result.skippedChecks).size !== result.skippedChecks.length
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Skipped checks must be unique",
      path: ["skippedChecks"],
    });
  }
});
export type CandidateNormalizationResult = z.infer<
  typeof CandidateNormalizationResultSchema
>;

export const SourceAdapterContextSchema = z.object({
  decisionWindow: DecisionWindowSchema,
  existingMeldRef: z.string().min(1).optional(),
}).strict();
export type SourceAdapterContext = z.infer<
  typeof SourceAdapterContextSchema
>;

export const SourceActionAdaptationResultSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("ready"),
      sourceType: z.string().min(1),
      draft: ActionDraftSchema,
      factRefs: z.array(z.string().min(1)),
    }).strict(),
    z.object({
      status: z.literal("incomplete"),
      sourceType: z.string().min(1),
      diagnosticCode: z.string().min(1),
      missingFields: UniqueStringsSchema,
      factRefs: z.array(z.string().min(1)),
    }).strict(),
    z.object({
      status: z.literal("unsupported"),
      sourceType: z.string().min(1),
    }).strict(),
  ],
);
export type SourceActionAdaptationResult = z.infer<
  typeof SourceActionAdaptationResultSchema
>;

export interface TypedActionAdapterPort<RawAction> {
  readonly sourceType: string;
  adapt(
    rawAction: RawAction,
    context: SourceAdapterContext,
  ): SourceActionAdaptationResult;
}

export const StructuredComparisonBuildResultSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("ready"),
      comparisonSet: StructuredComparisonSetSchema,
    }).strict(),
    z.object({
      status: z.literal("not_comparable"),
      code: z.enum([
        "cross_decision_window",
        "fewer_than_two_distinct_actions",
      ]),
      actionRefs: z.array(ActionRefSchema),
      windowKinds: z.array(z.enum([
        "self_turn",
        "discard_response",
        "kan_response",
        "post_call_discard",
        "post_riichi_discard",
      ])),
    }).strict(),
  ],
);
export type StructuredComparisonBuildResult = z.infer<
  typeof StructuredComparisonBuildResultSchema
>;

export const CandidateInputOriginSchema = CandidateOriginSchema;
