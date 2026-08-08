import { z } from "zod";
import { ActionRefSchema } from "./comparison.js";

export const FACT_ENGINE_PROTOCOL_VERSION = "mahjong-facts/v1" as const;
export const MAHJONG_HELPER_COMMIT =
  "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0" as const;

const Tile34IndexSchema = z.number().int().min(0).max(33);
const CountSchema = z.number().int().min(0).max(4);

export const Tile34CountsSchema = z.array(CountSchema).length(34);
export type Tile34Counts = z.infer<typeof Tile34CountsSchema>;

export const Tile34CountSchema = z.object({
  tile34: Tile34IndexSchema,
  count: CountSchema,
}).strict();
export type Tile34Count = z.infer<typeof Tile34CountSchema>;

function requireStrictAscending(
  values: readonly number[],
  context: z.RefinementCtx,
  path: Array<string | number> = [],
): void {
  if (values.some((value, index) => index > 0 && value <= values[index - 1]!)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tile34 indexes must use strict ascending order",
      path,
    });
  }
}

const StrictTile34IndexesSchema = z.array(Tile34IndexSchema)
  .superRefine((values, context) => requireStrictAscending(values, context));

const SortedTile34CountsSchema = z.array(Tile34CountSchema)
  .superRefine((values, context) => {
    requireStrictAscending(
      values.map((value) => value.tile34),
      context,
    );
  });

function uniqueStringsSchema(minimum = 0) {
  return z.array(z.string().min(1)).min(minimum)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "String values must be unique",
        });
      }
    });
}

const UniqueStringsSchema = uniqueStringsSchema();

export const EngineIdentitySchema = z.object({
  engine: z.literal("mahjong-helper"),
  upstreamCommit: z.literal(MAHJONG_HELPER_COMMIT),
  adapterVersion: z.string().min(1),
  protocolVersion: z.literal(FACT_ENGINE_PROTOCOL_VERSION),
}).strict();
export type EngineIdentity = z.infer<typeof EngineIdentitySchema>;

const RequestIdentityShape = {
  requestId: z.string().min(1),
  protocolVersion: z.literal(FACT_ENGINE_PROTOCOL_VERSION),
  actionRef: ActionRefSchema,
  stateHash: z.string().min(1),
};

const MeldFactInputSchema = z.object({
  kind: z.enum(["chi", "pon", "daiminkan", "ankan", "kakan"]),
  tiles34: z.array(Tile34IndexSchema).min(3).max(4),
}).strict().superRefine((meld, context) => {
  const expectedLength = meld.kind === "chi" || meld.kind === "pon" ? 3 : 4;
  if (meld.tiles34.length !== expectedLength) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Engine ${meld.kind} meld requires ${expectedLength} tiles`,
      path: ["tiles34"],
    });
    return;
  }
  if (meld.kind === "chi") {
    const sorted = [...new Set(meld.tiles34)].sort((left, right) => left - right);
    if (
      sorted.length !== 3 ||
      sorted[0]! >= 27 ||
      Math.floor(sorted[0]! / 9) !== Math.floor(sorted[2]! / 9) ||
      sorted[1] !== sorted[0]! + 1 ||
      sorted[2] !== sorted[1]! + 1
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Engine chi meld must be one suited sequence",
        path: ["tiles34"],
      });
    }
  } else if (!meld.tiles34.every((tile) => tile === meld.tiles34[0])) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Engine ${meld.kind} meld tiles must match`,
      path: ["tiles34"],
    });
  }
});

const RedFiveCountsSchema = z.tuple([
  z.number().int().min(0).max(1),
  z.number().int().min(0).max(1),
  z.number().int().min(0).max(1),
]);

const HandContextShape = {
  melds: z.array(MeldFactInputSchema),
  doraTiles34: z.array(Tile34IndexSchema),
  redFiveCounts: RedFiveCountsSchema,
  roundWindTile34: z.number().int().min(27).max(30),
  selfWindTile34: z.number().int().min(27).max(30),
  dealer: z.boolean(),
  riichi: z.boolean(),
  selfDiscards34: z.array(Tile34IndexSchema),
};

type PhysicalHandContext = {
  melds: Array<{ tiles34: number[] }>;
  redFiveCounts: [number, number, number];
  selfDiscards34: number[];
};

function ownedTileCounts(
  hand: readonly number[],
  context: PhysicalHandContext,
): number[] {
  const owned = [...hand];
  for (const meld of context.melds) {
    for (const tile of meld.tiles34) owned[tile] = owned[tile]! + 1;
  }
  return owned;
}

function validatePhysicalOwnership(
  hand: readonly number[],
  context: PhysicalHandContext,
  refinement: z.RefinementCtx,
): number[] {
  const owned = ownedTileCounts(hand, context);
  owned.forEach((count, tile34) => {
    if (count > 4) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Owned tile count cannot exceed four",
        path: ["melds", tile34],
      });
    }
  });
  context.redFiveCounts.forEach((count, suit) => {
    if (count > owned[suit * 9 + 4]!) {
      refinement.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Red-five count cannot exceed owned five tiles",
        path: ["redFiveCounts", suit],
      });
    }
  });
  return owned;
}

export const Hand13FactRequestSchema = z.object({
  ...RequestIdentityShape,
  ...HandContextShape,
  kind: z.literal("hand13"),
  handTiles34: Tile34CountsSchema,
  leftTiles34: Tile34CountsSchema.nullable(),
  visibleCountsComplete: z.boolean(),
  doraTilesComplete: z.boolean(),
  selfDiscardsComplete: z.boolean(),
  remainingDraws: z.number().int().nonnegative().nullable(),
}).strict().superRefine((request, context) => {
  const owned = validatePhysicalOwnership(request.handTiles34, request, context);
  if (request.visibleCountsComplete && request.leftTiles34 === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Complete visibility requires left tile counts",
      path: ["leftTiles34"],
    });
  }
  if (request.visibleCountsComplete && request.leftTiles34 !== null) {
    const unavailable = [...owned];
    for (const tile of request.selfDiscards34) {
      unavailable[tile] = unavailable[tile]! + 1;
    }
    request.leftTiles34.forEach((left, tile34) => {
      if (left + unavailable[tile34]! > 4) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Live-left count conflicts with known owned or discarded tiles",
          path: ["leftTiles34", tile34],
        });
      }
    });
  }
});
export type Hand13FactRequest = z.infer<typeof Hand13FactRequestSchema>;

export const CompletedHandFactRequestSchema = z.object({
  ...RequestIdentityShape,
  ...HandContextShape,
  kind: z.literal("completed_hand"),
  completedHandTiles34: Tile34CountsSchema,
  tsumo: z.boolean(),
  winTile34: Tile34IndexSchema,
}).strict().superRefine((request, context) => {
  validatePhysicalOwnership(request.completedHandTiles34, request, context);
});
export type CompletedHandFactRequest = z.infer<
  typeof CompletedHandFactRequestSchema
>;

export const ThreatRiskFactRequestSchema = z.object({
  ...RequestIdentityShape,
  kind: z.literal("threat_risk"),
  threatActor: z.number().int().min(0).max(3),
  turns: z.number().int().min(1).max(19),
  safeTiles34: z.array(z.boolean()).length(34),
  leftTiles34: Tile34CountsSchema,
  doraTiles34: z.array(Tile34IndexSchema),
  roundWindTile34: z.number().int().min(27).max(30),
  threatWindTile34: z.number().int().min(27).max(30),
  earlyOutsideTiles34: StrictTile34IndexesSchema,
  evidenceIds: uniqueStringsSchema(1),
}).strict();
export type ThreatRiskFactRequest = z.infer<
  typeof ThreatRiskFactRequestSchema
>;

export const FactEngineRequestSchema = z.union([
  Hand13FactRequestSchema,
  CompletedHandFactRequestSchema,
  ThreatRiskFactRequestSchema,
]);
export type FactEngineRequest = z.infer<typeof FactEngineRequestSchema>;

const EstimateLimitationsShape = {
  limitations: z.array(z.string().min(1)).min(1),
};

export const PINNED_HELPER_YAKU_NAMES = [
  "立直", "七对", "自摸", "w立", "平和", "两杯口", "一杯口", "三色", "一通",
  "对对", "三暗刻", "三色同刻", "三杠子", "断幺", "役牌", "混全", "纯全", "混老头", "小三元",
  "混一色", "清一色", "四暗刻", "四暗刻单骑", "大三元", "小四喜", "大四喜", "字一色", "清老头",
  "绿一色", "九莲", "纯正九莲", "四杠子", "十二落抬", "五门齐", "三连刻", "一色三顺",
  "大数邻", "大车轮", "大竹林", "大七星",
] as const;

const YakuValueSchema = z.object({
  id: z.number().int().min(0).max(PINNED_HELPER_YAKU_NAMES.length - 1),
  name: z.enum(PINNED_HELPER_YAKU_NAMES),
}).strict().superRefine((value, context) => {
  if (PINNED_HELPER_YAKU_NAMES[value.id] !== value.name) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Yaku name must match the pinned helper ID mapping",
      path: ["name"],
    });
  }
});

const YakuTypesEstimateSchema = z.object({
  field: z.literal("yaku_types"),
  yakuValues: z.array(YakuValueSchema).superRefine((values, context) => {
    for (let index = 1; index < values.length; index++) {
      if (values[index]!.id <= values[index - 1]!.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Yaku IDs must use strict ascending order",
        });
        return;
      }
    }
  }),
  ...EstimateLimitationsShape,
}).strict();

function numericEstimateSchema<const Field extends
  "dama_point" | "riichi_point" | "mixed_waits_score" |
    "avg_agari_rate" | "furiten_rate" | "mixed_round_point",
>(
  field: Field,
  valueSchema: z.ZodNumber = z.number().finite(),
) {
  return z.object({
    field: z.literal(field),
    numericValue: valueSchema,
    ...EstimateLimitationsShape,
  }).strict();
}

export const UpstreamEstimateSchema = z.discriminatedUnion("field", [
  YakuTypesEstimateSchema,
  numericEstimateSchema("dama_point", z.number().finite().nonnegative()),
  numericEstimateSchema("riichi_point", z.number().finite().nonnegative()),
  numericEstimateSchema("mixed_waits_score"),
  numericEstimateSchema("avg_agari_rate", z.number().finite().min(0).max(100)),
  numericEstimateSchema("furiten_rate", z.number().finite().min(0).max(1)),
  numericEstimateSchema("mixed_round_point"),
]);
export type UpstreamEstimate = z.infer<typeof UpstreamEstimateSchema>;

const ResultIdentityShape = {
  ...RequestIdentityShape,
  identity: EngineIdentitySchema,
};

const ImproveSchema = z.object({
  drawTile34: Tile34IndexSchema,
  bestWaits: SortedTile34CountsSchema,
}).strict();

export const Hand13FactResultSchema = z.object({
  ...ResultIdentityShape,
  kind: z.literal("hand13_result"),
  shanten: z.number().int().min(-1).max(8),
  effectiveTile34: StrictTile34IndexesSchema,
  waitsRemainingStatus: z.enum([
    "calculated",
    "blocked_missing_facts",
  ]),
  waitsRemaining: SortedTile34CountsSchema,
  improves: z.array(ImproveSchema),
  doraCountStatus: z.enum(["calculated", "blocked_missing_facts"]),
  doraCount: z.number().int().nonnegative().nullable(),
  estimates: z.array(UpstreamEstimateSchema),
  diagnostics: UniqueStringsSchema,
}).strict().superRefine((result, context) => {
  if (
    result.waitsRemainingStatus === "blocked_missing_facts" &&
    result.waitsRemaining.length > 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Blocked remaining counts must be empty",
      path: ["waitsRemaining"],
    });
  }
  if (
    (result.doraCountStatus === "calculated") !==
      (result.doraCount !== null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Dora count status must agree with nullable dora count",
      path: ["doraCount"],
    });
  }
  const fields = result.estimates.map((estimate) => estimate.field);
  if (new Set(fields).size !== fields.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Estimate fields must be unique",
      path: ["estimates"],
    });
  }
});
export type Hand13FactResult = z.infer<typeof Hand13FactResultSchema>;

export const CompletedHandFactResultSchema = z.object({
  ...ResultIdentityShape,
  kind: z.literal("completed_hand_result"),
  point: z.number().int().nonnegative(),
  fixedPoint: z.number().finite().nonnegative(),
  hanStatus: z.literal("unsupported_upstream_api"),
  fuStatus: z.literal("unsupported_upstream_api"),
  limitations: z.array(z.string().min(1)).min(1),
  diagnostics: UniqueStringsSchema,
}).strict();
export type CompletedHandFactResult = z.infer<
  typeof CompletedHandFactResultSchema
>;

const StructuralRiskKindSchema = z.enum([
  "genbutsu",
  "suji",
  "half_suji",
  "double_suji",
  "no_suji",
  "wall",
  "no_chance",
  "double_no_chance",
  "one_chance",
  "double_one_chance",
  "mixed_one_chance",
  "early_outside",
  "honor_count",
]);

const HonorClassificationSchema = z.object({
  tile34: z.number().int().min(27).max(33),
  remainingCount: z.number().int().min(0).max(4),
  category: z.enum(["yakuhai", "guest_wind"]),
}).strict();

const HonorClassificationsSchema = z.array(HonorClassificationSchema)
  .length(7).superRefine((values, context) => {
    values.forEach((value, index) => {
      if (value.tile34 !== 27 + index) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Honor classifications must cover tiles 27 through 33 in order",
          path: [index, "tile34"],
        });
      }
    });
  });

export const ThreatRiskFactResultSchema = z.object({
  ...ResultIdentityShape,
  kind: z.literal("threat_risk_result"),
  threatActor: z.number().int().min(0).max(3),
  riskScale: z.array(z.number().finite().nonnegative()).length(34),
  classifications: z.array(z.object({
    tile34: Tile34IndexSchema,
    kind: StructuralRiskKindSchema,
  }).strict()),
  honorClassifications: HonorClassificationsSchema,
  leftNoSujiTile34: StrictTile34IndexesSchema,
  evidenceIds: uniqueStringsSchema(1),
  limitations: z.array(z.string().min(1)).min(1),
  diagnostics: UniqueStringsSchema,
}).strict();
export type ThreatRiskFactResult = z.infer<
  typeof ThreatRiskFactResultSchema
>;

export const FactEngineResultSchema = z.union([
  Hand13FactResultSchema,
  CompletedHandFactResultSchema,
  ThreatRiskFactResultSchema,
]);
export type FactEngineResult = z.infer<typeof FactEngineResultSchema>;
