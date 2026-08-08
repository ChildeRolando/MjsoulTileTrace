import { z } from "zod";
import { canonicalActionRef } from "./action-codec.js";
import {
  RiichiActionSchema,
  type RiichiAction,
} from "./actions.js";
import { ActionRefSchema } from "./comparison.js";
import {
  compareCanonicalEventPositions,
  parseCanonicalEventRef,
  type ParsedCanonicalEventRef,
} from "./event-stream.js";
import {
  EngineIdentitySchema,
  FACT_ENGINE_PROTOCOL_VERSION,
  Tile34CountsSchema,
} from "./fact-engine.js";
import {
  RiverDiscardV2Schema,
} from "./round-state.js";
import { TileSchema } from "./tiles.js";

export const HAND_STRUCTURE_SCHEMA_VERSION = "hand-structure/v2" as const;
export const MAX_NON_DOMINATED_DECOMPOSITIONS = 64 as const;

const Tile34Schema = z.number().int().min(0).max(33);
const FamilySchema = z.enum(["standard", "chiitoitsu", "kokushi"]);
export type HandFamily = z.infer<typeof FamilySchema>;

export const YakuContextV2Schema = z.object({
  windsStatus: z.enum(["known", "unknown"]),
  roundWindTile34: z.number().int().min(27).max(29).nullable(),
  selfWindTile34: z.number().int().min(27).max(30).nullable(),
  riichiStatus: z.enum(["accepted", "inactive", "unknown"]),
  openTanyaoStatus: z.enum(["enabled", "disabled", "unknown"]),
}).strict().superRefine((yakuContext, context) => {
  const hasRoundWind = yakuContext.roundWindTile34 !== null;
  const hasSelfWind = yakuContext.selfWindTile34 !== null;
  if (yakuContext.windsStatus === "known" && (!hasRoundWind || !hasSelfWind)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Known winds require both roundWindTile34 and selfWindTile34",
      path: ["windsStatus"],
    });
  }
  if (yakuContext.windsStatus === "unknown" && (hasRoundWind || hasSelfWind)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unknown winds require null roundWindTile34 and selfWindTile34",
      path: ["windsStatus"],
    });
  }
});
export type YakuContextV2 = z.infer<typeof YakuContextV2Schema>;

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
    "known_kakan_chankan",
    "known_ankan_chankan",
    "known_houtei",
    "unknown_future",
  ]),
  yakuContext: YakuContextV2Schema,
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
  if (request.leftTiles34 !== null) {
    request.leftTiles34.forEach((left, tile34) => {
      if (left + owned[tile34]! > 4) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Live-left count conflicts with owned tiles",
          path: ["leftTiles34", tile34],
        });
      }
    });
  }
  if (
    request.yakuContext.riichiStatus === "accepted" &&
    request.melds.some((meld) => meld.kind !== "ankan")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Accepted riichi is incompatible with an open meld",
      path: ["yakuContext", "riichiStatus"],
    });
  }
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

const ShapeGroupShape = {
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
};

function validateShapeGroup(
  group: { kind: z.infer<typeof ShapeGroupShape.kind>; tiles34: number[] },
  context: z.RefinementCtx,
): void {
  const tiles = group.tiles34;
  if (tiles.some((tile, index) => index > 0 && tile < tiles[index - 1]!)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Shape tiles must be sorted" });
    return;
  }
  const same = tiles.every((tile) => tile === tiles[0]);
  const suitedPair = tiles.length === 2 && tiles[1]! < 27 &&
    Math.floor(tiles[0]! / 9) === Math.floor(tiles[1]! / 9);
  const ranks = tiles.map((tile) => tile % 9 + 1);
  const valid = group.kind === "sequence"
    ? tiles.length === 3 && tiles[2]! < 27 &&
      Math.floor(tiles[0]! / 9) === Math.floor(tiles[2]! / 9) &&
      tiles[1] === tiles[0]! + 1 && tiles[2] === tiles[1]! + 1
    : group.kind === "triplet"
      ? tiles.length === 3 && same
      : group.kind === "pair_candidate"
        ? tiles.length === 2 && same
        : group.kind === "ryanmen_taatsu"
          ? suitedPair && tiles[1] === tiles[0]! + 1 &&
            ranks[0]! >= 2 && ranks[1]! <= 8
          : group.kind === "kanchan_taatsu"
            ? suitedPair && tiles[1] === tiles[0]! + 2
            : group.kind === "penchan_taatsu"
              ? suitedPair && tiles[1] === tiles[0]! + 1 &&
                (ranks[0] === 1 || ranks[0] === 8)
              : tiles.length === 1;
  if (!valid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Tiles do not form ${group.kind}`,
      path: ["tiles34"],
    });
  }
}

const ShapeGroupSchema = z.object(ShapeGroupShape).strict()
  .superRefine(validateShapeGroup);
export type ShapeGroupV2 = z.infer<typeof ShapeGroupSchema>;

const DecompositionSchema = z.object({
  decompositionRef: z.string().min(1),
  family: FamilySchema,
  shanten: z.number().int().min(-1).max(13),
  groups: z.array(ShapeGroupSchema),
}).strict();

const AlternativeClaimSchema = z.object({
  ...ShapeGroupShape,
  decompositionRefs: z.array(z.string().min(1)).min(1),
}).strict().superRefine(validateShapeGroup);

const DecompositionSetSchema = z.object({
  status: z.enum(["calculated", "blocked_engine_failure"]),
  totalNonDominated: z.number().int().nonnegative(),
  truncated: z.boolean(),
  items: z.array(DecompositionSchema).max(MAX_NON_DOMINATED_DECOMPOSITIONS),
  invariantClaims: z.array(ShapeGroupSchema),
  alternativeClaims: z.array(AlternativeClaimSchema),
}).strict().superRefine((set, context) => {
  if (
    set.status === "blocked_engine_failure" &&
    (set.totalNonDominated !== 0 || set.truncated || set.items.length > 0 ||
      set.invariantClaims.length > 0 || set.alternativeClaims.length > 0)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Blocked decomposition set cannot carry calculated payload",
    });
  }
  if (set.totalNonDominated < set.items.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Total decompositions cannot be smaller than returned items",
    });
  }
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
  const refSet = new Set(refs);
  set.alternativeClaims.forEach((claim, claimIndex) => {
    if (
      new Set(claim.decompositionRefs).size !== claim.decompositionRefs.length ||
      claim.decompositionRefs.some((ref) => !refSet.has(ref))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Alternative claims must reference unique returned decompositions",
        path: ["alternativeClaims", claimIndex, "decompositionRefs"],
      });
    }
  });
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
  const familyOrder = ["standard", "chiitoitsu", "kokushi"];
  if (
    new Set(wait.families).size !== wait.families.length ||
    wait.families.some((family, index) =>
      index > 0 && familyOrder.indexOf(family) <=
        familyOrder.indexOf(wait.families[index - 1]!)
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wait families must be unique and canonical",
      path: ["families"],
    });
  }
  if (new Set(wait.waitTypes).size !== wait.waitTypes.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wait types must be unique",
      path: ["waitTypes"],
    });
  }
  if (new Set(wait.decompositionRefs).size !== wait.decompositionRefs.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wait decomposition refs must be unique",
      path: ["decompositionRefs"],
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
  if (
    (result.overallShanten === 0 && result.waits.length === 0) ||
    (result.overallShanten !== 0 && result.waits.length > 0)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Waits must exist exactly for a tenpai hand",
      path: ["waits"],
    });
  }
  const decompositionByRef = new Map(
    result.decompositions.items.map((item) => [item.decompositionRef, item]),
  );
  result.waits.forEach((wait, waitIndex) => {
    for (const family of wait.families) {
      const familyResult = result.families.find((item) => item.family === family);
      if (familyResult?.shanten !== 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Wait family must be in tenpai",
          path: ["waits", waitIndex, "families"],
        });
      }
    }
    for (const ref of wait.decompositionRefs) {
      const decomposition = decompositionByRef.get(ref);
      if (
        decomposition === undefined ||
        !wait.families.includes(decomposition.family)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Wait must reference a returned decomposition of its family",
          path: ["waits", waitIndex, "decompositionRefs"],
        });
      }
    }
  });
  const diagnostics = new Set(result.diagnostics);
  if (diagnostics.size !== result.diagnostics.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hand structure diagnostics must be unique",
      path: ["diagnostics"],
    });
  }
  const hasUnknownEligibility = result.waits.some((wait) =>
    wait.baseRonEligibility === "unknown_missing_situational_yaku_context"
  );
  if (
    diagnostics.has("ron_eligibility_missing_situational_context") !==
      hasUnknownEligibility ||
    diagnostics.has("truncated_non_dominated_decompositions") !==
      result.decompositions.truncated
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Diagnostics must exactly describe result limitations",
      path: ["diagnostics"],
    });
  }
});
export type HandStructureResultV2 = z.infer<
  typeof HandStructureResultV2Schema
>;

type CandidateDiscardAction = Extract<
  RiichiAction,
  { kind: "discard" | "riichi_discard" }
>;

const CandidateDiscardActionSchema = RiichiActionSchema.refine(
  (action): action is CandidateDiscardAction =>
    action.kind === "discard" || action.kind === "riichi_discard",
  { message: "Candidate discard evidence requires a discard action" },
);

function samePhysicalTile(
  left: { id: string; red: boolean },
  right: { id: string; red: boolean },
): boolean {
  return left.id === right.id && left.red === right.red;
}

export const CandidateDiscardEvidenceV2Schema = z.object({
  actor: z.number().int().min(0).max(3),
  action: CandidateDiscardActionSchema,
  actionRef: ActionRefSchema,
  stateHash: z.string().min(1),
  tile: TileSchema,
  discardMode: z.enum(["tsumogiri", "tedashi"]),
}).strict().superRefine((evidence, context) => {
  if (evidence.actionRef !== canonicalActionRef(evidence.action)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Candidate discard actionRef must equal the canonical action codec",
      path: ["actionRef"],
    });
  }
  if (!samePhysicalTile(evidence.tile, evidence.action.tile)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Candidate discard tile must equal its action tile",
      path: ["tile"],
    });
  }
  if (evidence.discardMode !== evidence.action.discardMode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Candidate discard mode must equal its action mode",
      path: ["discardMode"],
    });
  }
});
export type CandidateDiscardEvidenceV2 = z.infer<
  typeof CandidateDiscardEvidenceV2Schema
>;

const CanonicalEventEvidenceRefSchema = z.string().min(1).refine(
  (reference) => !reference.startsWith("action:v1:"),
  { message: "Canonical event evidence cannot use an ActionRef" },
);
const CandidateActionEvidenceRefSchema = ActionRefSchema.refine(
  (reference) => reference.startsWith("action:v1:"),
  { message: "Candidate evidence must use a canonical ActionRef" },
);

const ResponseCanonicalEventRefSchema = CanonicalEventEvidenceRefSchema.refine(
  (reference) => parseCanonicalEventRef(reference) !== null,
  { message: "Response proof must use a canonical EventRef" },
);

export const ResponseFuritenAnalysisRefV2Schema = z.object({
  requestId: z.string().min(1),
  stateHash: z.string().min(1),
  actionRef: ActionRefSchema,
  engineIdentity: EngineIdentitySchema,
  sourceEventRef: ResponseCanonicalEventRefSchema,
  closingEventRef: ResponseCanonicalEventRefSchema,
}).strict().superRefine((reference, context) => {
  if (reference.actionRef !== `response:${reference.sourceEventRef}`) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Response analysis actionRef must bind to its source event",
      path: ["actionRef"],
    });
  }
});
export type ResponseFuritenAnalysisRefV2 = z.infer<
  typeof ResponseFuritenAnalysisRefV2Schema
>;

function responseAnalysisRefKey(
  reference: ResponseFuritenAnalysisRefV2,
): string {
  return [
    reference.sourceEventRef,
    reference.closingEventRef,
    reference.requestId,
    reference.actionRef,
    reference.stateHash,
  ].join("\u0000");
}

export const ResponseFuritenComponentV2Schema = z.object({
  status: z.enum(["clear", "confirmed", "unknown"]),
  evidenceIds: z.array(ResponseCanonicalEventRefSchema),
  analysisRefs: z.array(ResponseFuritenAnalysisRefV2Schema),
  riichiAcceptanceEventRef: ResponseCanonicalEventRefSchema.nullable(),
}).strict().superRefine((component, context) => {
  if (new Set(component.evidenceIds).size !== component.evidenceIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Response furiten evidence refs must be unique",
      path: ["evidenceIds"],
    });
  }
  if (component.status === "confirmed" && component.analysisRefs.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirmed response furiten requires analysis proof",
      path: ["analysisRefs"],
    });
  }
  if (component.status !== "confirmed" && component.analysisRefs.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unconfirmed response furiten cannot claim analysis proof",
      path: ["analysisRefs"],
    });
  }
  if (component.status !== "confirmed" && component.evidenceIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unconfirmed response furiten cannot claim evidence",
      path: ["evidenceIds"],
    });
  }
  if (
    component.status !== "confirmed" &&
    component.riichiAcceptanceEventRef !== null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unconfirmed response furiten cannot bind riichi acceptance",
      path: ["riichiAcceptanceEventRef"],
    });
  }
  const parsedEvidence = component.evidenceIds.map((reference) =>
    parseCanonicalEventRef(reference)
  ).filter((parsed): parsed is ParsedCanonicalEventRef => parsed !== null);
  const firstEvidence = parsedEvidence[0] ?? null;
  if (firstEvidence !== null && parsedEvidence.some((parsed) =>
    parsed.gameId !== firstEvidence.gameId ||
    parsed.position.roundOrdinal !== firstEvidence.position.roundOrdinal
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Response proof evidence must belong to one game round",
      path: ["evidenceIds"],
    });
  }
  if (parsedEvidence.some((parsed, index) => index > 0 &&
    compareCanonicalEventPositions(
      parsedEvidence[index - 1]!.position,
      parsed.position,
    ) >= 0
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Response proof evidence must use canonical event order",
      path: ["evidenceIds"],
    });
  }
  const expectedEvidence = new Set<string>();
  if (component.riichiAcceptanceEventRef !== null) {
    expectedEvidence.add(component.riichiAcceptanceEventRef);
  }
  const proofKeys = new Set<string>();
  const sourceKeys = new Set<string>();
  const closingKeys = new Set<string>();
  let previousOrder: readonly [
    ParsedCanonicalEventRef,
    ParsedCanonicalEventRef,
    string,
    string,
    string,
  ] | null = null;
  component.analysisRefs.forEach((reference, index) => {
    expectedEvidence.add(reference.sourceEventRef);
    expectedEvidence.add(reference.closingEventRef);
    const source = parseCanonicalEventRef(reference.sourceEventRef);
    const closing = parseCanonicalEventRef(reference.closingEventRef);
    if (source === null || closing === null) return;
    if (
      source.gameId !== closing.gameId ||
      source.position.roundOrdinal !== closing.position.roundOrdinal ||
      compareCanonicalEventPositions(source.position, closing.position) >= 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Response analysis source must precede its window closure",
        path: ["analysisRefs", index],
      });
    }
    const key = responseAnalysisRefKey(reference);
    if (
      proofKeys.has(key) ||
      sourceKeys.has(reference.sourceEventRef) ||
      closingKeys.has(reference.closingEventRef)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Response analysis proofs must be unique",
        path: ["analysisRefs", index],
      });
    }
    proofKeys.add(key);
    sourceKeys.add(reference.sourceEventRef);
    closingKeys.add(reference.closingEventRef);
    const order = [
      source,
      closing,
      reference.requestId,
      reference.actionRef,
      reference.stateHash,
    ] as const;
    if (previousOrder !== null) {
      const comparison = compareCanonicalEventPositions(
        order[0].position,
        previousOrder[0].position,
      ) || compareCanonicalEventPositions(
        order[1].position,
        previousOrder[1].position,
      ) ||
        order[2].localeCompare(previousOrder[2]) ||
        order[3].localeCompare(previousOrder[3]) ||
        order[4].localeCompare(previousOrder[4]);
      if (comparison <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Response analysis proofs must use canonical evidence order",
          path: ["analysisRefs", index],
        });
      }
    }
    previousOrder = order;
  });
  const expectedCanonicalEvidence = [...expectedEvidence].sort((left, right) =>
    (() => {
      const parsedLeft = parseCanonicalEventRef(left);
      const parsedRight = parseCanonicalEventRef(right);
      return parsedLeft === null || parsedRight === null
        ? left.localeCompare(right)
        : compareCanonicalEventPositions(
            parsedLeft.position,
            parsedRight.position,
          );
    })()
  );
  if (
    component.evidenceIds.length !== expectedCanonicalEvidence.length ||
    component.evidenceIds.some((reference, index) =>
      reference !== expectedCanonicalEvidence[index]
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Response evidence must exactly match typed proof refs",
      path: ["evidenceIds"],
    });
  }
  if (component.riichiAcceptanceEventRef !== null) {
    const acceptance = parseCanonicalEventRef(
      component.riichiAcceptanceEventRef,
    );
    if (acceptance === null) return;
    if (component.analysisRefs.some((reference) => {
      const source = parseCanonicalEventRef(reference.sourceEventRef);
      if (source === null) return true;
      return acceptance.gameId !== source.gameId ||
        acceptance.position.roundOrdinal !== source.position.roundOrdinal ||
        compareCanonicalEventPositions(
          acceptance.position,
          source.position,
        ) >= 0;
    })) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Riichi acceptance must precede every passed response",
        path: ["riichiAcceptanceEventRef"],
      });
    }
  }
});
export type ResponseFuritenComponentV2 = z.infer<
  typeof ResponseFuritenComponentV2Schema
>;

export const ResponseFuritenAnalysisV2Schema = z.object({
  temporary: ResponseFuritenComponentV2Schema,
  riichi: ResponseFuritenComponentV2Schema,
}).strict().superRefine((analysis, context) => {
  if (analysis.temporary.riichiAcceptanceEventRef !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Temporary furiten cannot bind riichi acceptance",
      path: ["temporary", "riichiAcceptanceEventRef"],
    });
  }
  if (
    analysis.riichi.status === "confirmed" &&
    analysis.riichi.riichiAcceptanceEventRef === null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirmed riichi furiten requires acceptance evidence",
      path: ["riichi", "riichiAcceptanceEventRef"],
    });
  }
});
export type ResponseFuritenAnalysisV2 = z.infer<
  typeof ResponseFuritenAnalysisV2Schema
>;

export const MergedDiscardFuritenComponentV2Schema = z.object({
  status: z.enum(["clear", "confirmed", "unknown"]),
  source: z.enum(["current_scene", "candidate_discard"]),
  selfActor: z.number().int().min(0).max(3),
  selfRiver: z.array(RiverDiscardV2Schema),
  selfRiverComplete: z.boolean(),
  candidateDiscard: CandidateDiscardEvidenceV2Schema.nullable(),
  canonicalEventRefs: z.array(CanonicalEventEvidenceRefSchema),
  candidateActionRefs: z.array(CandidateActionEvidenceRefSchema).max(1),
}).strict().superRefine((component, context) => {
  if (
    component.source === "current_scene" &&
      component.candidateDiscard !== null ||
    component.source === "candidate_discard" &&
      component.candidateDiscard === null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Discard analysis source must agree with candidate evidence",
      path: ["candidateDiscard"],
    });
  }
  const riverRefs = new Set<string>();
  component.selfRiver.forEach((discard, index) => {
    if (discard.actor !== component.selfActor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Discard proof river actor must equal self actor",
        path: ["selfRiver", index, "actor"],
      });
    }
    if (discard.eventRef.startsWith("action:v1:")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Discard proof river must use canonical EventRefs",
        path: ["selfRiver", index, "eventRef"],
      });
    }
    if (riverRefs.has(discard.eventRef)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Discard proof river event refs must be unique",
        path: ["selfRiver", index, "eventRef"],
      });
    }
    riverRefs.add(discard.eventRef);
  });
  if (
    new Set(component.canonicalEventRefs).size !==
      component.canonicalEventRefs.length
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Canonical discard evidence refs must be unique",
      path: ["canonicalEventRefs"],
    });
  }
  if (
    new Set(component.candidateActionRefs).size !==
      component.candidateActionRefs.length
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Candidate discard evidence refs must be unique",
      path: ["candidateActionRefs"],
    });
  }
  const evidenceCount = component.canonicalEventRefs.length +
    component.candidateActionRefs.length;
  if (component.status === "confirmed" && evidenceCount === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirmed discard furiten requires evidence",
    });
  }
  if (component.status !== "confirmed" && evidenceCount > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unconfirmed discard furiten cannot claim evidence",
    });
  }
});
export type MergedDiscardFuritenComponentV2 = z.infer<
  typeof MergedDiscardFuritenComponentV2Schema
>;

const MergedFuritenStateV2Schema = z.object({
  discard: MergedDiscardFuritenComponentV2Schema,
  temporary: ResponseFuritenComponentV2Schema,
  riichi: ResponseFuritenComponentV2Schema,
}).strict();

export const MergedHandFuritenV2Schema = z.object({
  hand: HandStructureResultV2Schema,
  furiten: MergedFuritenStateV2Schema,
  ronEligibilityStatus: z.enum(["calculated", "unknown_missing_facts"]),
  ronEligibleWaits34: z.array(Tile34Schema),
}).strict().superRefine((value, context) => {
  if (
    value.furiten.discard.source === "current_scene" &&
    value.hand.actionRef.startsWith("action:v1:")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Current-scene analysis cannot use a candidate ActionRef",
      path: ["hand", "actionRef"],
    });
  }
  if (
    value.furiten.discard.source === "candidate_discard" &&
    !value.hand.actionRef.startsWith("action:v1:")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Candidate-discard analysis requires a canonical ActionRef",
      path: ["hand", "actionRef"],
    });
  }
  for (const component of ["temporary", "riichi"] as const) {
    if (value.furiten[component].evidenceIds.some((reference) =>
      reference.startsWith("action:v1:")
    )) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Response furiten evidence must use canonical EventRefs",
        path: ["furiten", component, "evidenceIds"],
      });
    }
  }
  if (value.furiten.discard.candidateActionRefs.some((reference) =>
    reference !== value.hand.actionRef
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Candidate discard evidence must bind to the analyzed hand action",
      path: ["furiten", "discard", "candidateActionRefs"],
    });
  }
  const discard = value.furiten.discard;
  if (
    discard.candidateDiscard !== null &&
    (discard.candidateDiscard.actor !== discard.selfActor ||
      discard.candidateDiscard.actionRef !== value.hand.actionRef ||
      discard.candidateDiscard.stateHash !== value.hand.stateHash)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Candidate discard proof must bind to the analyzed hand",
      path: ["furiten", "discard", "candidateDiscard"],
    });
  }
  const structuralWaits = new Set(value.hand.waits.map((wait) => wait.tile34));
  const tileTo34 = (tile: { id: string }): number => {
    const suit = tile.id[1] as "m" | "p" | "s" | "z";
    return ({ m: 0, p: 9, s: 18, z: 27 }[suit]) +
      Number(tile.id[0]) - 1;
  };
  const expectedCanonicalRefs = discard.selfRiver
    .filter((riverDiscard) =>
      structuralWaits.has(tileTo34(riverDiscard.tile))
    )
    .map((riverDiscard) => riverDiscard.eventRef);
  const expectedCandidateRefs = discard.candidateDiscard !== null &&
      structuralWaits.has(tileTo34(discard.candidateDiscard.tile))
    ? [discard.candidateDiscard.actionRef]
    : [];
  if (
    discard.canonicalEventRefs.length !== expectedCanonicalRefs.length ||
    discard.canonicalEventRefs.some((reference, index) =>
      reference !== expectedCanonicalRefs[index]
    ) ||
    discard.candidateActionRefs.length !== expectedCandidateRefs.length ||
    discard.candidateActionRefs.some((reference, index) =>
      reference !== expectedCandidateRefs[index]
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Discard furiten evidence refs must exactly match typed proof",
      path: ["furiten", "discard"],
    });
  }
  const hasDiscardMatch = expectedCanonicalRefs.length > 0 ||
    expectedCandidateRefs.length > 0;
  const expectedDiscardStatus = hasDiscardMatch
    ? "confirmed"
    : discard.selfRiverComplete
      ? "clear"
      : "unknown";
  if (discard.status !== expectedDiscardStatus) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Discard furiten status must exactly match typed proof",
      path: ["furiten", "discard", "status"],
    });
  }
  const components = [
    value.furiten.discard,
    value.furiten.temporary,
    value.furiten.riichi,
  ];
  const anyConfirmed = components.some((component) =>
    component.status === "confirmed"
  );
  const noPotentialRonWait = value.hand.waits.length === 0 ||
    value.hand.waits.every((wait) => wait.baseRonEligibility === "ineligible");
  const hasUnknownDependency = components.some((component) =>
    component.status === "unknown"
  ) || value.hand.waits.some((wait) =>
    wait.baseRonEligibility === "unknown_missing_situational_yaku_context"
  );
  const expectedStatus = anyConfirmed || noPotentialRonWait ||
      !hasUnknownDependency
    ? "calculated"
    : "unknown_missing_facts";
  const expectedWaits = expectedStatus === "calculated" &&
      !anyConfirmed && !noPotentialRonWait
    ? value.hand.waits
        .filter((wait) => wait.baseRonEligibility === "eligible")
        .map((wait) => wait.tile34)
        .sort((left, right) => left - right)
    : [];
  if (value.ronEligibilityStatus !== expectedStatus) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Final ron eligibility status must match waits and furiten",
      path: ["ronEligibilityStatus"],
    });
  }
  if (
    value.ronEligibleWaits34.length !== expectedWaits.length ||
    value.ronEligibleWaits34.some((wait, index) => wait !== expectedWaits[index])
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Final ron-eligible waits must exactly match proven eligible waits",
      path: ["ronEligibleWaits34"],
    });
  }
});
export type MergedHandFuritenV2 = z.infer<
  typeof MergedHandFuritenV2Schema
>;
