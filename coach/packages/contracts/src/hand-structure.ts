import { z } from "zod";
import { ActionRefSchema } from "./comparison.js";
import {
  EngineIdentitySchema,
  FACT_ENGINE_PROTOCOL_VERSION,
  Tile34CountsSchema,
} from "./fact-engine.js";
import { FuritenStateV2Schema } from "./round-state.js";

export const HAND_STRUCTURE_SCHEMA_VERSION = "hand-structure/v2" as const;
export const MAX_NON_DOMINATED_DECOMPOSITIONS = 64 as const;

const Tile34Schema = z.number().int().min(0).max(33);
const FamilySchema = z.enum(["standard", "chiitoitsu", "kokushi"]);
export type HandFamily = z.infer<typeof FamilySchema>;

const MeldSchema = z.object({
  kind: z.enum(["chi", "pon", "daiminkan", "ankan", "kakan"]),
  tiles34: z.array(Tile34Schema).min(3).max(4),
}).strict().superRefine((meld, context) => {
  const expected = meld.kind === "chi" || meld.kind === "pon" ? 3 : 4;
  if (meld.tiles34.length !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${meld.kind} requires ${expected} tiles`,
    });
    return;
  }
  const sorted = [...meld.tiles34].sort((left, right) => left - right);
  if (meld.kind === "chi") {
    if (
      sorted[0]! >= 27 ||
      Math.floor(sorted[0]! / 9) !== Math.floor(sorted[2]! / 9) ||
      sorted[1] !== sorted[0]! + 1 ||
      sorted[2] !== sorted[1]! + 1
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chi must be one suited sequence",
      });
    }
  } else if (sorted.some((tile) => tile !== sorted[0])) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${meld.kind} tiles must match`,
    });
  }
});

export const HandStructureRequestV2Schema = z.object({
  kind: z.literal("hand_structure"),
  schemaVersion: z.literal(HAND_STRUCTURE_SCHEMA_VERSION),
  requestId: z.string().min(1),
  protocolVersion: z.literal(FACT_ENGINE_PROTOCOL_VERSION),
  actionRef: ActionRefSchema,
  stateHash: z.string().min(1),
  handTiles34: Tile34CountsSchema,
  melds: z.array(MeldSchema),
  leftTiles34: Tile34CountsSchema.nullable(),
  visibleCountsComplete: z.boolean(),
  ronContext: z.enum([
    "complete_none",
    "known_chankan",
    "known_houtei",
    "unknown_future",
  ]),
}).strict().superRefine((request, context) => {
  const concealed = request.handTiles34.reduce((sum, count) => sum + count, 0);
  const expected = 13 - request.melds.length * 3;
  if (concealed !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Hand structure requires ${expected} concealed tiles`,
      path: ["handTiles34"],
    });
  }
  if (request.visibleCountsComplete !== (request.leftTiles34 !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Visibility completeness must agree with leftTiles34",
      path: ["leftTiles34"],
    });
  }
  const owned = [...request.handTiles34];
  for (const meld of request.melds) {
    for (const tile of meld.tiles34) owned[tile] = owned[tile]! + 1;
  }
  owned.forEach((count, tile34) => {
    if (count > 4) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Owned tile count cannot exceed four",
        path: ["handTiles34", tile34],
      });
    }
  });
});
export type HandStructureRequestV2 = z.infer<
  typeof HandStructureRequestV2Schema
>;

const EffectiveTileSchema = z.object({
  tile34: Tile34Schema,
  remainingStatus: z.enum(["calculated", "blocked_missing_facts"]),
  remaining: z.number().int().min(0).max(4).nullable(),
}).strict().superRefine((tile, context) => {
  if ((tile.remainingStatus === "calculated") !== (tile.remaining !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Remaining status/value mismatch",
    });
  }
});

const FamilyResultSchema = z.object({
  family: FamilySchema,
  applicability: z.enum(["applicable", "not_applicable_open_hand"]),
  shanten: z.number().int().min(-1).max(13).nullable(),
  effectiveTiles: z.array(EffectiveTileSchema),
}).strict().superRefine((family, context) => {
  const applicable = family.applicability === "applicable";
  if (applicable !== (family.shanten !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Applicability/shanten mismatch",
    });
  }
  if (!applicable && family.effectiveTiles.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Inapplicable family cannot have effective tiles",
    });
  }
  const ids = family.effectiveTiles.map((tile) => tile.tile34);
  if (ids.some((id, index) => index > 0 && id <= ids[index - 1]!)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Effective tiles must be strictly sorted",
    });
  }
});

const ShapeGroupSchema = z.object({
  kind: z.enum([
    "sequence",
    "triplet",
    "pair_candidate",
    "ryanmen_taatsu",
    "kanchan_taatsu",
    "penchan_taatsu",
    "floating",
  ]),
  tiles34: z.array(Tile34Schema).min(1).max(3),
}).strict();
export type ShapeGroupV2 = z.infer<typeof ShapeGroupSchema>;

const DecompositionSchema = z.object({
  decompositionRef: z.string().min(1),
  family: FamilySchema,
  shanten: z.number().int().min(-1).max(13),
  groups: z.array(ShapeGroupSchema),
}).strict();

const AlternativeClaimSchema = ShapeGroupSchema.extend({
  decompositionRefs: z.array(z.string().min(1)).min(1),
}).strict();

const DecompositionSetSchema = z.object({
  status: z.enum(["calculated", "blocked_engine_failure"]),
  totalNonDominated: z.number().int().nonnegative(),
  truncated: z.boolean(),
  items: z.array(DecompositionSchema).max(MAX_NON_DOMINATED_DECOMPOSITIONS),
  invariantClaims: z.array(ShapeGroupSchema),
  alternativeClaims: z.array(AlternativeClaimSchema),
}).strict().superRefine((set, context) => {
  if (set.truncated !== (set.totalNonDominated > set.items.length)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Truncation must reflect omitted non-dominated decompositions",
    });
  }
  const refs = set.items.map((item) => item.decompositionRef);
  if (new Set(refs).size !== refs.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Decomposition refs must be unique",
    });
  }
});

const WaitSchema = z.object({
  tile34: Tile34Schema,
  families: z.array(FamilySchema).min(1),
  waitTypes: z.array(z.enum([
    "ryanmen",
    "kanchan",
    "penchan",
    "shanpon",
    "tanki",
    "kokushi_single",
    "kokushi_thirteen_sided",
  ])).min(1),
  remainingStatus: z.enum(["calculated", "blocked_missing_facts"]),
  remaining: z.number().int().min(0).max(4).nullable(),
  baseRonEligibility: z.enum([
    "eligible",
    "ineligible",
    "unknown_missing_situational_yaku_context",
  ]),
  decompositionRefs: z.array(z.string().min(1)),
}).strict().superRefine((wait, context) => {
  if ((wait.remainingStatus === "calculated") !== (wait.remaining !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wait remaining status/value mismatch",
    });
  }
});

export const HandStructureResultV2Schema = z.object({
  kind: z.literal("hand_structure_result"),
  schemaVersion: z.literal(HAND_STRUCTURE_SCHEMA_VERSION),
  requestId: z.string().min(1),
  protocolVersion: z.literal(FACT_ENGINE_PROTOCOL_VERSION),
  actionRef: ActionRefSchema,
  stateHash: z.string().min(1),
  identity: EngineIdentitySchema,
  overallShanten: z.number().int().min(-1).max(13),
  bestFamilies: z.array(FamilySchema).min(1),
  families: z.tuple([
    FamilyResultSchema,
    FamilyResultSchema,
    FamilyResultSchema,
  ]),
  decompositions: DecompositionSetSchema,
  waits: z.array(WaitSchema),
  diagnostics: z.array(z.enum([
    "truncated_non_dominated_decompositions",
    "ron_eligibility_missing_situational_context",
  ])),
}).strict().superRefine((result, context) => {
  const expectedFamilies = ["standard", "chiitoitsu", "kokushi"];
  if (
    result.families.some(
      (family, index) => family.family !== expectedFamilies[index],
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Families must use canonical order",
      path: ["families"],
    });
  }
  const applicable = result.families.filter((family) => family.shanten !== null);
  const minimum = Math.min(...applicable.map((family) => family.shanten!));
  const best = applicable
    .filter((family) => family.shanten === minimum)
    .map((family) => family.family);
  if (
    result.overallShanten !== minimum ||
    JSON.stringify(result.bestFamilies) !== JSON.stringify(best)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Overall shanten and best families must equal family minima",
    });
  }
  const waitIds = result.waits.map((wait) => wait.tile34);
  if (waitIds.some((id, index) => index > 0 && id <= waitIds[index - 1]!)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Waits must be strictly sorted",
      path: ["waits"],
    });
  }
});
export type HandStructureResultV2 = z.infer<
  typeof HandStructureResultV2Schema
>;

export const MergedHandFuritenV2Schema = z.object({
  hand: HandStructureResultV2Schema,
  furiten: FuritenStateV2Schema,
  ronEligibilityStatus: z.enum(["calculated", "unknown_missing_facts"]),
  ronEligibleWaits34: z.array(Tile34Schema),
}).strict().superRefine((value, context) => {
  if (
    value.ronEligibilityStatus === "unknown_missing_facts" &&
    value.ronEligibleWaits34.length > 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unknown final ron eligibility cannot claim eligible waits",
    });
  }
});
export type MergedHandFuritenV2 = z.infer<
  typeof MergedHandFuritenV2Schema
>;
