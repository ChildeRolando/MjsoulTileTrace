import { createHash } from "node:crypto";
import { z } from "zod";
import { ActionRefSchema } from "./comparison.js";
import {
  compareCanonicalEventPositions,
  parseCanonicalEventRef,
  type ParsedCanonicalEventRef,
} from "./event-stream.js";
import { EngineIdentitySchema } from "./fact-engine.js";

export const DEFENSE_MATRIX_SCHEMA_VERSION = "defense-matrix/v1" as const;
export const STRUCTURAL_RISK_SCALE_VERSION =
  "mahjong-helper-risk/514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0/v1" as const;

const ActorSchema = z.number().int().min(0).max(3);
const Tile34IndexSchema = z.number().int().min(0).max(33);
const Tile34CountSchema = z.number().int().min(0).max(4);

export const STRUCTURAL_DEFENSE_KINDS = [
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
] as const;

export const StructuralDefenseKindSchema = z.enum(
  STRUCTURAL_DEFENSE_KINDS,
);
export type StructuralDefenseKind = z.infer<
  typeof StructuralDefenseKindSchema
>;

function uniqueStringsSchema(minimum = 0) {
  return z.array(z.string().min(1)).min(minimum)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "String references must be unique",
        });
      }
    });
}

function requireStrictAscendingNumbers(
  values: readonly number[],
  context: z.RefinementCtx,
): void {
  if (values.some((value, index) => index > 0 && value <= values[index - 1]!)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Tile34 indexes must use strict ascending order",
    });
  }
}

const StrictTile34IndexesSchema = z.array(Tile34IndexSchema)
  .superRefine(requireStrictAscendingNumbers);

const OrderedDoraTiles34Schema = z.array(Tile34IndexSchema)
  .superRefine((values, context) => {
    if (values.some((value, index) => index > 0 && value < values[index - 1]!)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dora Tile34 indexes must use canonical ascending order",
      });
    }
  });

const EvidenceRefsSchema = uniqueStringsSchema(1);
const OpenMeldRefsSchema = uniqueStringsSchema();

const IntegerDatumSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("calculated"),
    value: z.number().int().positive(),
  }).strict(),
  z.object({ status: z.literal("blocked_missing_facts") }).strict(),
  z.object({ status: z.literal("not_applicable") }).strict(),
]);

const BooleanDatumSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("calculated"),
    value: z.boolean(),
  }).strict(),
  z.object({ status: z.literal("blocked_missing_facts") }).strict(),
  z.object({ status: z.literal("not_applicable") }).strict(),
]);

export const DefenseThreatV1Schema = z.object({
  actor: ActorSchema,
  kind: z.enum([
    "riichi_declared",
    "riichi_accepted",
    "user_marked_open",
  ]),
  source: z.enum([
    "canonical_replay",
    "user_asserted",
    "legacy_regression_bridge_only",
  ]),
  sourceEventRefs: EvidenceRefsSchema,
  openMeldRefs: OpenMeldRefsSchema,
  dealerStatus: z.enum(["dealer", "non_dealer", "unknown"]),
  riichiTurn: IntegerDatumSchema,
  ippatsu: BooleanDatumSchema,
}).strict();
export type DefenseThreatV1 = z.infer<typeof DefenseThreatV1Schema>;

const DeterministicEvidenceRefSchema = z.object({
  role: z.enum(["threat_own_discard", "post_riichi_pass"]),
  eventRef: z.string().min(1),
}).strict();

const DeterministicEvidenceRefsSchema = z.array(
  DeterministicEvidenceRefSchema,
).superRefine((values, context) => {
  const keys = values.map((value) => value.eventRef);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Deterministic evidence references must be unique",
    });
  }
});

const CalculatedDeterministicSafetySchema = z.object({
  status: z.literal("calculated"),
  genbutsu: z.boolean(),
  evidenceRefs: DeterministicEvidenceRefsSchema,
}).strict();

export const DeterministicSafetySchema = z.discriminatedUnion("status", [
  CalculatedDeterministicSafetySchema,
  z.object({
    status: z.literal("blocked_missing_facts"),
    evidenceRefs: z.tuple([]),
  }).strict(),
  z.object({ status: z.literal("not_applicable") }).strict(),
]).superRefine((value, context) => {
  if (value.status !== "calculated") return;
  if (value.genbutsu && value.evidenceRefs.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Calculated genbutsu requires deterministic evidence",
      path: ["evidenceRefs"],
    });
  }
  if (!value.genbutsu && value.evidenceRefs.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Non-genbutsu cells cannot carry genbutsu evidence",
      path: ["evidenceRefs"],
    });
  }
});
export type DeterministicSafety = z.infer<
  typeof DeterministicSafetySchema
>;

const StructuralClassificationsSchema = z.array(
  StructuralDefenseKindSchema,
).superRefine((values, context) => {
  const order = new Map(
    STRUCTURAL_DEFENSE_KINDS.map((kind, index) => [kind, index]),
  );
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Structural classifications must be unique",
    });
  }
  if (values.some((value, index) =>
    index > 0 && order.get(value)! <= order.get(values[index - 1]!)!
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Structural classifications must use canonical order",
    });
  }
});

const HonorDatumSchema = z.object({
  remainingCount: Tile34CountSchema,
  category: z.enum(["yakuhai", "guest_wind"]),
}).strict();

const StructuralVisibilitySchema = z.object({
  turns: z.number().int().min(1).max(19),
  safeTiles34: z.array(z.boolean()).length(34),
  leftTiles34: z.array(Tile34CountSchema).length(34),
  doraTiles34: OrderedDoraTiles34Schema,
  roundWindTile34: z.number().int().min(27).max(30),
  threatWindTile34: z.number().int().min(27).max(30),
  earlyOutsideTiles34: StrictTile34IndexesSchema,
}).strict();

export interface DefenseStructuralStateHashInput {
  sourceStateHash: string;
  factSetId: string;
  actionRef: z.infer<typeof ActionRefSchema>;
  threatActor: number;
  visibility: z.infer<typeof StructuralVisibilitySchema>;
  evidenceIds: string[];
}

function stableCanonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("defense structural state contains non-finite number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableCanonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const fields = Object.keys(object).sort().map((key) =>
      `${JSON.stringify(key)}:${stableCanonicalJson(object[key])}`
    );
    return `{${fields.join(",")}}`;
  }
  throw new Error(`defense structural state contains unsupported ${typeof value}`);
}

export function defenseStructuralStateHash(
  input: DefenseStructuralStateHashInput,
): string {
  return `sha256:${createHash("sha256")
    .update(stableCanonicalJson(input))
    .digest("hex")}`;
}

const MissingStructuralFactSchema = z.enum([
  "visibility",
  "turns",
  "safe_tiles",
  "left_tiles",
  "dora_tiles",
  "round_wind",
  "threat_wind",
  "early_outside",
]);

const MissingStructuralFactsSchema = z.array(MissingStructuralFactSchema)
  .min(1).superRefine((values, context) => {
    const order = MissingStructuralFactSchema.options;
    const indexes = values.map((value) => order.indexOf(value));
    if (
      new Set(values).size !== values.length ||
      indexes.some((value, index) => index > 0 && value <= indexes[index - 1]!)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Missing structural facts must be unique and canonical",
      });
    }
  });

const CalculatedStructuralDefenseSchema = z.object({
  status: z.literal("calculated"),
  factSetId: z.string().min(1),
  actionRef: ActionRefSchema,
  threatActor: ActorSchema,
  requestId: z.string().min(1),
  stateHash: z.string().min(1),
  engineIdentity: EngineIdentitySchema,
  scaleVersion: z.literal(STRUCTURAL_RISK_SCALE_VERSION),
  helperRiskScale: z.number().finite().nonnegative(),
  classifications: StructuralClassificationsSchema,
  honor: HonorDatumSchema.nullable(),
  visibility: StructuralVisibilitySchema,
  evidenceIds: uniqueStringsSchema(1),
  limitations: z.tuple([
    z.literal("helper_risk_not_mortal_probability"),
  ]),
}).strict();

export const StructuralDefenseSchema = z.discriminatedUnion("status", [
  CalculatedStructuralDefenseSchema,
  z.object({
    status: z.literal("blocked_missing_facts"),
    missing: MissingStructuralFactsSchema,
  }).strict(),
  z.object({
    status: z.literal("blocked_engine_failure"),
    failureCode: z.enum([
      "engine_unavailable",
      "engine_execution_failed",
      "engine_invalid_result",
    ]),
  }).strict(),
  z.object({
    status: z.literal("unsupported_threat_kind"),
    kind: z.literal("user_marked_open"),
  }).strict(),
  z.object({ status: z.literal("not_applicable") }).strict(),
]);
export type StructuralDefense = z.infer<typeof StructuralDefenseSchema>;

export const DefenseMatrixCellV1Schema = z.object({
  actionRef: ActionRefSchema,
  threat: DefenseThreatV1Schema,
  deterministicSafety: DeterministicSafetySchema,
  structural: StructuralDefenseSchema,
}).strict();
export type DefenseMatrixCellV1 = z.infer<
  typeof DefenseMatrixCellV1Schema
>;

type DefenseMatrixV1Shape = {
  source: "canonical_replay" | "legacy_regression_bridge_only" |
    "user_asserted";
  factSetId: string;
  decisionEventRef: string;
  sourceStateHash: string;
  actionRef: z.infer<typeof ActionRefSchema>;
  candidateTile34: number;
  cells: DefenseMatrixCellV1[];
};

function validateThreatSemantics(
  cell: DefenseMatrixCellV1,
  context: z.RefinementCtx,
  index: number,
): void {
  const path = ["cells", index] as Array<string | number>;
  const openThreat = cell.threat.kind === "user_marked_open";
  if (openThreat) {
    if (cell.threat.source !== "user_asserted") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "User-marked open threats require user-asserted provenance",
        path: [...path, "threat", "source"],
      });
    }
    if (cell.threat.openMeldRefs.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "User-marked open threats require open meld evidence",
        path: [...path, "threat", "openMeldRefs"],
      });
    }
    if (
      cell.threat.riichiTurn.status !== "not_applicable" ||
      cell.threat.ippatsu.status !== "not_applicable"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Open threats cannot carry riichi-only datum values",
        path: [...path, "threat"],
      });
    }
    if (cell.deterministicSafety.status !== "not_applicable") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Deterministic genbutsu is not applicable to open threats",
        path: [...path, "deterministicSafety"],
      });
    }
    if (cell.structural.status !== "unsupported_threat_kind") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Open-threat structural analysis is unsupported in V1",
        path: [...path, "structural"],
      });
    }
    return;
  }

  if (!["canonical_replay", "legacy_regression_bridge_only", "user_asserted"]
    .includes(cell.threat.source)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Riichi threats require replay or user-asserted provenance",
      path: [...path, "threat", "source"],
    });
  }
  if (cell.threat.openMeldRefs.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Riichi threats cannot carry open meld references",
      path: [...path, "threat", "openMeldRefs"],
    });
  }
  if (
    cell.threat.riichiTurn.status === "not_applicable" ||
    cell.threat.ippatsu.status === "not_applicable"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Riichi datum cannot be marked not applicable",
      path: [...path, "threat"],
    });
  }
  if (cell.deterministicSafety.status === "not_applicable") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Riichi threats require a deterministic-safety status",
      path: [...path, "deterministicSafety"],
    });
  }
  if (
    cell.structural.status === "unsupported_threat_kind" ||
    cell.structural.status === "not_applicable"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Riichi threats require a structural-analysis status",
      path: [...path, "structural"],
    });
  }
}

function validateHonorBinding(
  value: DefenseMatrixV1Shape,
  cell: DefenseMatrixCellV1,
  context: z.RefinementCtx,
  index: number,
): void {
  if (cell.structural.status !== "calculated") return;
  const path = ["cells", index, "structural", "honor"];
  if (value.candidateTile34 < 27) {
    if (cell.structural.honor !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Suited candidate tiles cannot carry honor evidence",
        path,
      });
    }
    return;
  }
  if (cell.structural.honor === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Honor candidate tiles require typed honor evidence",
      path,
    });
    return;
  }
  const yakuhai = value.candidateTile34 >= 31 ||
    value.candidateTile34 === cell.structural.visibility.roundWindTile34 ||
    value.candidateTile34 === cell.structural.visibility.threatWindTile34;
  const expected = yakuhai ? "yakuhai" : "guest_wind";
  if (cell.structural.honor.category !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Honor category conflicts with structural visibility",
      path: [...path, "category"],
    });
  }
  if (
    cell.structural.honor.remainingCount !==
      cell.structural.visibility.leftTiles34[value.candidateTile34]
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Honor remaining count must match candidate visibility",
      path: [...path, "remainingCount"],
    });
  }
}

type CanonicalRefWithPath = {
  parsed: ParsedCanonicalEventRef;
  path: Array<string | number>;
};

function parseCanonicalRefs(
  refs: readonly string[],
  context: z.RefinementCtx,
  path: Array<string | number>,
): CanonicalRefWithPath[] | null {
  const parsed = refs.map((ref, index) => ({
    parsed: parseCanonicalEventRef(ref),
    path: [...path, index],
  }));
  for (const value of parsed) {
    if (value.parsed === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replay evidence requires a canonical event reference",
        path: value.path,
      });
    }
  }
  if (parsed.some((value) => value.parsed === null)) return null;
  return parsed as CanonicalRefWithPath[];
}

function validateCanonicalPositionOrder(
  refs: readonly CanonicalRefWithPath[],
  context: z.RefinementCtx,
): void {
  refs.forEach((value, index) => {
    if (
      index > 0 &&
      compareCanonicalEventPositions(
        refs[index - 1]!.parsed.position,
        value.parsed.position,
      ) >= 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replay evidence must use canonical event order",
        path: value.path,
      });
    }
  });
}

function validateReplayEvidence(
  cell: DefenseMatrixCellV1,
  context: z.RefinementCtx,
  index: number,
  decision: ParsedCanonicalEventRef | null,
): void {
  if (cell.threat.source === "user_asserted") return;
  const base = ["cells", index] as Array<string | number>;
  const expectedSourceRefs = cell.threat.kind === "riichi_declared" ? 1 : 2;
  if (cell.threat.sourceEventRefs.length !== expectedSourceRefs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${cell.threat.kind} requires exactly ${expectedSourceRefs} source event reference(s)`,
      path: [...base, "threat", "sourceEventRefs"],
    });
  }

  const source = parseCanonicalRefs(
    cell.threat.sourceEventRefs,
    context,
    [...base, "threat", "sourceEventRefs"],
  );
  const deterministic = cell.deterministicSafety.status === "calculated"
    ? parseCanonicalRefs(
      cell.deterministicSafety.evidenceRefs.map((ref) => ref.eventRef),
      context,
      [...base, "deterministicSafety", "evidenceRefs"],
    )
    : [];
  const structural = cell.structural.status === "calculated"
    ? parseCanonicalRefs(
      cell.structural.evidenceIds,
      context,
      [...base, "structural", "evidenceIds"],
    )
    : [];

  if (source !== null) validateCanonicalPositionOrder(source, context);
  if (structural !== null) validateCanonicalPositionOrder(structural, context);
  if (deterministic !== null) {
    const roleOrder = {
      threat_own_discard: 0,
      post_riichi_pass: 1,
    } as const;
    deterministic.forEach((value, evidenceIndex) => {
      if (evidenceIndex === 0) return;
      const previous = deterministic[evidenceIndex - 1]!;
      const positionOrder = compareCanonicalEventPositions(
        previous.parsed.position,
        value.parsed.position,
      );
      const previousRole = cell.deterministicSafety.status === "calculated"
        ? cell.deterministicSafety.evidenceRefs[evidenceIndex - 1]!.role
        : "threat_own_discard";
      const currentRole = cell.deterministicSafety.status === "calculated"
        ? cell.deterministicSafety.evidenceRefs[evidenceIndex]!.role
        : "threat_own_discard";
      if (
        positionOrder > 0 ||
        (positionOrder === 0 && roleOrder[previousRole] >= roleOrder[currentRole])
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Deterministic evidence must use canonical event order",
          path: value.path,
        });
      }
    });
    const sourceBoundary = source?.[source.length - 1];
    if (
      sourceBoundary !== undefined &&
      cell.deterministicSafety.status === "calculated"
    ) {
      deterministic.forEach((value, evidenceIndex) => {
        if (
          cell.deterministicSafety.status === "calculated" &&
          cell.deterministicSafety.evidenceRefs[evidenceIndex]!.role ===
            "post_riichi_pass" &&
          compareCanonicalEventPositions(
            value.parsed.position,
            sourceBoundary.parsed.position,
          ) <= 0
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Post-riichi pass evidence must follow the threat source",
            path: value.path,
          });
        }
      });
    }
  }

  if (source === null || deterministic === null || structural === null) return;
  const all = [...source, ...deterministic, ...structural];
  const anchor = source[0];
  if (anchor === undefined) return;
  for (const value of all) {
    if (
      value.parsed.gameId !== anchor.parsed.gameId ||
      value.parsed.position.roundOrdinal !==
        anchor.parsed.position.roundOrdinal
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replay evidence must belong to one game and round",
        path: value.path,
      });
    }
    if (
      decision !== null &&
      (value.parsed.gameId !== decision.gameId ||
        value.parsed.position.roundOrdinal !==
          decision.position.roundOrdinal)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replay evidence must match the decision game and round",
        path: value.path,
      });
    } else if (
      decision !== null &&
      compareCanonicalEventPositions(
        value.parsed.position,
        decision.position,
      ) > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replay evidence cannot occur after the decision",
        path: value.path,
      });
    }
  }
}

function validateSafetyBindings(
  value: DefenseMatrixV1Shape,
  cell: DefenseMatrixCellV1,
  context: z.RefinementCtx,
  index: number,
): void {
  if (
    cell.structural.status !== "calculated" ||
    cell.deterministicSafety.status !== "calculated"
  ) return;
  const candidateIsSafe =
    cell.structural.visibility.safeTiles34[value.candidateTile34]!;
  if (candidateIsSafe !== cell.deterministicSafety.genbutsu) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Structural safe-tile input must match deterministic genbutsu",
      path: ["cells", index, "structural", "visibility", "safeTiles34",
        value.candidateTile34],
    });
  }
  if (candidateIsSafe && cell.structural.helperRiskScale !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Safe candidate tiles require zero helper risk",
      path: ["cells", index, "structural", "helperRiskScale"],
    });
  }
}

function validateUniqueActorsAndBindings(
  value: DefenseMatrixV1Shape,
  context: z.RefinementCtx,
): void {
  const decision = parseCanonicalEventRef(value.decisionEventRef);
  if (value.source !== "user_asserted" && decision === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Decision reference must be canonical",
      path: ["decisionEventRef"],
    });
  }
  const allowedCellSources = {
    canonical_replay: new Set(["canonical_replay", "user_asserted"]),
    legacy_regression_bridge_only: new Set([
      "legacy_regression_bridge_only",
    ]),
    user_asserted: new Set(["user_asserted"]),
  } as const;
  value.cells.forEach((cell, index) => {
    if (!allowedCellSources[value.source].has(cell.threat.source as never)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Defense cell provenance conflicts with matrix provenance",
        path: ["cells", index, "threat", "source"],
      });
    }
  });
  if (value.source === "canonical_replay") {
    if (value.factSetId !== `canonical-v2:${value.sourceStateHash}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Canonical replay matrix fact set must bind its source state",
        path: ["factSetId"],
      });
    }
  } else if (value.source === "legacy_regression_bridge_only") {
    if (!value.factSetId.startsWith("legacy-regression:")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Legacy matrix requires a legacy-regression fact set",
        path: ["factSetId"],
      });
    }
  } else if (value.factSetId !== `user-asserted:${value.sourceStateHash}`) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "User-asserted matrix fact set must bind its source state",
      path: ["factSetId"],
    });
  }
  value.cells.forEach((cell, index) => {
    if (cell.actionRef !== value.actionRef) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Defense cell action must match matrix action",
        path: ["cells", index, "actionRef"],
      });
    }
    if (cell.structural.status === "calculated") {
      const structuralPath = ["cells", index, "structural"];
      if (cell.structural.factSetId !== value.factSetId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Structural fact set must match matrix fact set",
          path: [...structuralPath, "factSetId"],
        });
      }
      if (cell.structural.actionRef !== value.actionRef) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Structural action must match matrix action",
          path: [...structuralPath, "actionRef"],
        });
      }
      if (cell.structural.threatActor !== cell.threat.actor) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Structural actor must match cell threat actor",
          path: [...structuralPath, "threatActor"],
        });
      }
      const expectedStateHash = defenseStructuralStateHash({
        sourceStateHash: value.sourceStateHash,
        factSetId: value.factSetId,
        actionRef: value.actionRef,
        threatActor: cell.threat.actor,
        visibility: cell.structural.visibility,
        evidenceIds: cell.structural.evidenceIds,
      });
      if (cell.structural.stateHash !== expectedStateHash) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Structural state hash must bind the matrix scene inputs",
          path: [...structuralPath, "stateHash"],
        });
      }
      const expectedRequestId =
        `${cell.structural.factSetId}:risk:${cell.structural.threatActor}:${cell.structural.stateHash}`;
      if (cell.structural.requestId !== expectedRequestId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Structural request identity must match its fact bindings",
          path: [...structuralPath, "requestId"],
        });
      }
    }
    if (index > 0 && cell.threat.actor <= value.cells[index - 1]!.threat.actor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Threat actors must be unique and strictly ascending",
        path: ["cells", index, "threat", "actor"],
      });
    }
    validateThreatSemantics(cell, context, index);
    validateReplayEvidence(cell, context, index, decision);
    validateSafetyBindings(value, cell, context, index);
    validateHonorBinding(value, cell, context, index);
  });
}

export const DefenseMatrixV1Schema = z.object({
  schemaVersion: z.literal(DEFENSE_MATRIX_SCHEMA_VERSION),
  source: z.enum([
    "canonical_replay",
    "legacy_regression_bridge_only",
    "user_asserted",
  ]),
  factSetId: z.string().min(1),
  decisionEventRef: z.string().min(1),
  sourceStateHash: z.string().min(1),
  actionRef: ActionRefSchema,
  candidateTile34: Tile34IndexSchema,
  cells: z.array(DefenseMatrixCellV1Schema),
}).strict().superRefine(validateUniqueActorsAndBindings);
export type DefenseMatrixV1 = z.infer<typeof DefenseMatrixV1Schema>;
