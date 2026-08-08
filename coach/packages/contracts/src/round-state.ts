import { z } from "zod";
import { DecisionWindowSchema } from "./actions.js";
import {
  CANONICAL_EVENT_SCHEMA_VERSION,
  RuleSetV2Schema,
} from "./event-stream.js";
import { TileSchema } from "./tiles.js";

const ActorSchema = z.number().int().min(0).max(3);
const EventRefSchema = z.string().min(1);
const ScoresSchema = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int(),
]);
const WindSchema = z.enum(["E", "S", "W", "N"]);

function uniqueStrings(
  values: readonly string[],
  context: z.RefinementCtx,
  message: string,
  path: Array<string | number> = [],
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message, path });
  }
}

export const FieldCompletenessSchema = z.enum([
  "complete",
  "partial",
  "unknown",
]);
export type FieldCompleteness = z.infer<typeof FieldCompletenessSchema>;

export const RoundPhaseSchema = z.enum([
  "awaiting_round_start",
  "awaiting_draw",
  "awaiting_self_action",
  "awaiting_discard_responses",
  "awaiting_kan_responses",
  "awaiting_post_call_discard",
  "awaiting_rinshan_draw",
  "round_ended",
  "game_ended",
]);
export type RoundPhase = z.infer<typeof RoundPhaseSchema>;

export const RiverDiscardV2Schema = z.object({
  eventRef: EventRefSchema,
  actor: ActorSchema,
  tile: TileSchema,
  discardMode: z.enum(["tsumogiri", "tedashi"]),
  riichiDeclarationEventRef: EventRefSchema.nullable(),
  calledByEventRef: EventRefSchema.nullable(),
}).strict();
export type RiverDiscardV2 = z.infer<typeof RiverDiscardV2Schema>;

const MeldIdentityShape = {
  meldRef: z.string().min(1),
  actor: ActorSchema,
  createdEventRef: EventRefSchema,
  latestEventRef: EventRefSchema,
};

const ChiMeldV2Schema = z.object({
  ...MeldIdentityShape,
  kind: z.literal("chi"),
  targetActor: ActorSchema,
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema]),
  calledDiscardEventRef: EventRefSchema,
}).strict();

const PonMeldV2Schema = z.object({
  ...MeldIdentityShape,
  kind: z.literal("pon"),
  targetActor: ActorSchema,
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema]),
  calledDiscardEventRef: EventRefSchema,
}).strict();

const DaiminkanMeldV2Schema = z.object({
  ...MeldIdentityShape,
  kind: z.literal("daiminkan"),
  targetActor: ActorSchema,
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema, TileSchema]),
  calledDiscardEventRef: EventRefSchema,
}).strict();

const AnkanMeldV2Schema = z.object({
  ...MeldIdentityShape,
  kind: z.literal("ankan"),
  tiles: z.tuple([TileSchema, TileSchema, TileSchema, TileSchema]),
}).strict();

const KakanMeldV2Schema = z.object({
  ...MeldIdentityShape,
  kind: z.literal("kakan"),
  targetActor: ActorSchema,
  calledTile: TileSchema,
  consumedTiles: z.tuple([TileSchema, TileSchema]),
  addedTile: TileSchema,
  calledDiscardEventRef: EventRefSchema,
  upgradedPonEventRef: EventRefSchema,
}).strict();

export const CanonicalMeldV2Schema = z.discriminatedUnion("kind", [
  ChiMeldV2Schema,
  PonMeldV2Schema,
  DaiminkanMeldV2Schema,
  AnkanMeldV2Schema,
  KakanMeldV2Schema,
]);
export type CanonicalMeldV2 = z.infer<typeof CanonicalMeldV2Schema>;

export const RiichiStateV2Schema = z.object({
  actor: ActorSchema,
  status: z.enum(["none", "declared", "accepted"]),
  declarationEventRef: EventRefSchema.nullable(),
  acceptanceEventRef: EventRefSchema.nullable(),
  ippatsuAlive: z.boolean(),
}).strict().superRefine((state, context) => {
  if (state.status === "none") {
    if (
      state.declarationEventRef !== null ||
      state.acceptanceEventRef !== null ||
      state.ippatsuAlive
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Inactive riichi cannot carry declaration state",
      });
    }
    return;
  }
  if (state.declarationEventRef === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Active riichi requires its declaration event",
      path: ["declarationEventRef"],
    });
  }
  if (
    (state.status === "accepted") !==
      (state.acceptanceEventRef !== null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Riichi acceptance status must match its event",
      path: ["acceptanceEventRef"],
    });
  }
});
export type RiichiStateV2 = z.infer<typeof RiichiStateV2Schema>;

export const PublicRoundCompletenessSchema = z.object({
  roundContext: FieldCompletenessSchema,
  ruleSet: FieldCompletenessSchema,
  scores: FieldCompletenessSchema,
  doraIndicators: FieldCompletenessSchema,
  rivers: FieldCompletenessSchema,
  calledDiscardMarkers: FieldCompletenessSchema,
  melds: FieldCompletenessSchema,
  remainingDraws: FieldCompletenessSchema,
  settlement: FieldCompletenessSchema,
}).strict();
export type PublicRoundCompleteness = z.infer<
  typeof PublicRoundCompletenessSchema
>;

const WinTerminalSchema = z.object({
  kind: z.literal("win"),
  eventRefs: z.array(EventRefSchema).min(1),
}).strict();
const DrawTerminalSchema = z.object({
  kind: z.literal("draw"),
  eventRef: EventRefSchema,
  reason: z.enum([
    "exhaustive",
    "kyuushu_kyuuhai",
    "suufon_renda",
    "suucha_riichi",
    "suukaikan",
    "sancha_hou",
    "nagashi_mangan",
  ]),
}).strict();
export const RoundTerminalV2Schema = z.discriminatedUnion("kind", [
  WinTerminalSchema,
  DrawTerminalSchema,
]);
export type RoundTerminalV2 = z.infer<typeof RoundTerminalV2Schema>;

const PublicRoundStateObjectSchema = z.object({
  gameId: z.string().min(1),
  streamSchemaVersion: z.literal(CANONICAL_EVENT_SCHEMA_VERSION),
  ruleSet: RuleSetV2Schema,
  roundOrdinal: z.number().int().nonnegative(),
  roundWind: z.enum(["E", "S", "W"]),
  hand: z.number().int().min(1).max(4),
  honba: z.number().int().nonnegative(),
  riichiSticks: z.number().int().nonnegative(),
  dealer: ActorSchema,
  scores: ScoresSchema,
  seatWinds: z.tuple([WindSchema, WindSchema, WindSchema, WindSchema]),
  phase: RoundPhaseSchema,
  expectedActor: ActorSchema.nullable(),
  doraIndicators: z.array(TileSchema),
  rivers: z.tuple([
    z.array(RiverDiscardV2Schema),
    z.array(RiverDiscardV2Schema),
    z.array(RiverDiscardV2Schema),
    z.array(RiverDiscardV2Schema),
  ]),
  melds: z.array(CanonicalMeldV2Schema),
  riichiStates: z.tuple([
    RiichiStateV2Schema,
    RiichiStateV2Schema,
    RiichiStateV2Schema,
    RiichiStateV2Schema,
  ]),
  remainingDraws: z.number().int().nonnegative().nullable(),
  terminal: RoundTerminalV2Schema.nullable(),
  fields: PublicRoundCompletenessSchema,
  appliedEventRefs: z.array(EventRefSchema).min(1),
}).strict();

function expectedSeatWind(dealer: number, actor: number): "E" | "S" | "W" | "N" {
  return (["E", "S", "W", "N"] as const)[(actor - dealer + 4) % 4]!;
}

export const PublicRoundStateSchema = PublicRoundStateObjectSchema
  .superRefine((state, context) => {
    const riverEventRefs: string[] = [];
    const calledByRefs: string[] = [];
    state.rivers.forEach((river, actor) => {
      river.forEach((discard, index) => {
        riverEventRefs.push(discard.eventRef);
        if (discard.calledByEventRef !== null) {
          calledByRefs.push(discard.calledByEventRef);
        }
        if (discard.actor !== actor) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "River actor must match its bucket",
            path: ["rivers", actor, index, "actor"],
          });
        }
      });
    });
    uniqueStrings(
      riverEventRefs,
      context,
      "River event refs must be globally unique",
      ["rivers"],
    );
    uniqueStrings(
      calledByRefs,
      context,
      "A call event may consume only one discard",
      ["rivers"],
    );
    state.riichiStates.forEach((riichi, actor) => {
      if (riichi.actor !== actor) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Riichi actor must match its position",
          path: ["riichiStates", actor, "actor"],
        });
      }
    });
    state.seatWinds.forEach((wind, actor) => {
      if (wind !== expectedSeatWind(state.dealer, actor)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Seat winds must agree with the dealer",
          path: ["seatWinds", actor],
        });
      }
    });
    uniqueStrings(
      state.melds.map((meld) => meld.meldRef),
      context,
      "Meld refs must be unique",
      ["melds"],
    );
    uniqueStrings(
      state.appliedEventRefs,
      context,
      "Applied event refs must be unique",
      ["appliedEventRefs"],
    );
    if (
      state.fields.remainingDraws === "complete" &&
      state.remainingDraws === null ||
      state.fields.remainingDraws === "unknown" &&
      state.remainingDraws !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Remaining draw completeness must agree with its value",
        path: ["remainingDraws"],
      });
    }
    if (
      state.phase === "round_ended" && state.terminal === null ||
      state.phase !== "round_ended" &&
        state.phase !== "game_ended" &&
        state.terminal !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Terminal state must agree with the round phase",
        path: ["terminal"],
      });
    }
  });
export type PublicRoundState = z.infer<typeof PublicRoundStateSchema>;

const FuritenComponentSchema = z.object({
  status: z.enum(["clear", "confirmed", "unknown"]),
  evidenceIds: z.array(EventRefSchema),
}).strict().superRefine((component, context) => {
  uniqueStrings(
    component.evidenceIds,
    context,
    "Furiten evidence IDs must be unique",
    ["evidenceIds"],
  );
  if (component.status === "unknown" && component.evidenceIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unknown furiten cannot claim evidence",
      path: ["evidenceIds"],
    });
  }
  if (component.status === "confirmed" && component.evidenceIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirmed furiten requires evidence",
      path: ["evidenceIds"],
    });
  }
});

export const FuritenStateV2Schema = z.object({
  discard: FuritenComponentSchema,
  temporary: FuritenComponentSchema,
  riichi: FuritenComponentSchema,
}).strict();
export type FuritenStateV2 = z.infer<typeof FuritenStateV2Schema>;

const SelfPrivateRoundStateObjectSchema = z.object({
  selfActor: ActorSchema,
  concealedTiles: z.array(TileSchema),
  currentDraw: z.object({
    tile: TileSchema,
    eventRef: EventRefSchema,
    from: z.enum(["live_wall", "rinshan"]),
  }).strict().nullable(),
  selfMeldRefs: z.array(z.string().min(1)),
  furiten: FuritenStateV2Schema,
  fields: z.object({
    concealedTiles: FieldCompletenessSchema,
    currentDraw: FieldCompletenessSchema,
    responseOpportunities: FieldCompletenessSchema,
    furiten: FieldCompletenessSchema,
  }).strict(),
  evidenceIds: z.array(EventRefSchema).min(1),
}).strict();

function refineSelfPrivateState(
  state: z.infer<typeof SelfPrivateRoundStateObjectSchema>,
  context: z.RefinementCtx,
): void {
  uniqueStrings(
    state.selfMeldRefs,
    context,
    "Self meld refs must be unique",
    ["selfMeldRefs"],
  );
  uniqueStrings(
    state.evidenceIds,
    context,
    "Private state evidence IDs must be unique",
    ["evidenceIds"],
  );
  if (
    state.fields.currentDraw === "unknown" &&
    state.currentDraw !== null
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Current draw completeness must agree with its value",
      path: ["currentDraw"],
    });
  }
}

export const SelfPrivateRoundStateSchema = SelfPrivateRoundStateObjectSchema
  .superRefine(refineSelfPrivateState);
export type SelfPrivateRoundState = z.infer<
  typeof SelfPrivateRoundStateSchema
>;

const DecisionPrivateStateObjectSchema = SelfPrivateRoundStateObjectSchema
  .extend({
    decisionWindow: DecisionWindowSchema,
  }).strict();

export const DecisionPrivateStateSchema = DecisionPrivateStateObjectSchema
  .superRefine((state, context) => {
    refineSelfPrivateState(state, context);
    if (state.decisionWindow.actor !== state.selfActor) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Decision actor must equal the private self actor",
        path: ["decisionWindow", "actor"],
      });
    }
    if (
      state.decisionWindow.kind === "self_turn" &&
      state.currentDraw?.eventRef !== state.decisionWindow.triggerEventRef
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Self-turn draw must equal the window trigger",
        path: ["currentDraw", "eventRef"],
      });
    }
  });
export type DecisionPrivateState = z.infer<
  typeof DecisionPrivateStateSchema
>;

export const DECISION_SNAPSHOT_VERSION = "decision-snapshot/v2" as const;

export const DecisionSnapshotV2Schema = z.object({
  snapshotVersion: z.literal(DECISION_SNAPSHOT_VERSION),
  gameId: z.string().min(1),
  streamHash: z.string().min(1),
  streamPrefixHash: z.string().min(1),
  decisionEventRef: EventRefSchema,
  selfActor: ActorSchema,
  publicState: PublicRoundStateSchema,
  privateState: DecisionPrivateStateSchema,
  evidenceIds: z.array(EventRefSchema).min(1),
}).strict().superRefine((snapshot, context) => {
  if (snapshot.gameId !== snapshot.publicState.gameId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Snapshot game must equal its public state game",
      path: ["publicState", "gameId"],
    });
  }
  if (
    snapshot.selfActor !== snapshot.privateState.selfActor ||
    snapshot.privateState.decisionWindow.actor !== snapshot.selfActor
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Snapshot actor must equal its private decision actor",
      path: ["selfActor"],
    });
  }
  if (
    snapshot.decisionEventRef !==
      snapshot.privateState.decisionWindow.triggerEventRef
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Decision event must equal the window trigger",
      path: ["decisionEventRef"],
    });
  }
  uniqueStrings(
    snapshot.evidenceIds,
    context,
    "Snapshot evidence IDs must be unique",
    ["evidenceIds"],
  );
});
export type DecisionSnapshotV2 = z.infer<typeof DecisionSnapshotV2Schema>;
