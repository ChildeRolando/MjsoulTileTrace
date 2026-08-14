import { z } from "zod";
import {
  MahjongSoulRecordIdSchema,
  MahjongSoulSha256Schema,
  TileSchema,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type Tile,
} from "@riichi-coach/contracts";
import type { ReplayedDecision } from "./stream-replayer.js";

// A strictly-versioned, sanitized artifact for a human to compare a replayed
// Mahjong Soul record against the upstream client, event by event. It carries
// only the canonical data needed for that check — never access tokens, cookies,
// restore contexts, account IDs, lobby endpoints, raw protobuf, nicknames, or
// upstream error prose.
export const MAHJONG_SOUL_REPLAY_AUDIT_SCHEMA_VERSION =
  "mahjong-soul-replay-audit/v1" as const;

const ActorSchema = z.number().int().min(0).max(3);
const DrawReasonSchema = z.enum([
  "exhaustive",
  "kyuushu_kyuuhai",
  "suufon_renda",
  "suucha_riichi",
  "suukaikan",
  "sancha_hou",
  "nagashi_mangan",
]);

const AuditedRoundSchema = z.object({
  roundOrdinal: z.number().int().nonnegative(),
  roundWind: z.enum(["E", "S", "W"]),
  hand: z.number().int().min(1).max(4),
  honba: z.number().int().nonnegative(),
  riichiSticks: z.number().int().nonnegative(),
  dealer: ActorSchema,
  doraIndicator: TileSchema,
  scores: z.tuple([
    z.number().int(),
    z.number().int(),
    z.number().int(),
    z.number().int(),
  ]),
  selfHand: z.array(TileSchema).length(13),
}).strict();

const AuditedEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.string().min(1),
  actor: ActorSchema.nullable(),
  tile: TileSchema.nullable(),
  targetActor: ActorSchema.nullable(),
  winnerActor: ActorSchema.nullable(),
  method: z.enum(["ron", "tsumo"]).nullable(),
  reason: DrawReasonSchema.nullable(),
}).strict();

const AuditedDecisionSchema = z.object({
  decisionEventRef: z.string().min(1),
  concealedTiles: z.array(TileSchema),
  currentDraw: TileSchema.nullable(),
  actualDiscard: z.object({
    eventId: z.string().min(1),
    tile: TileSchema,
    discardMode: z.enum(["tsumogiri", "tedashi"]),
  }).strict().nullable(),
}).strict();

export const MahjongSoulReplayAuditSchema = z.object({
  schemaVersion: z.literal(MAHJONG_SOUL_REPLAY_AUDIT_SCHEMA_VERSION),
  recordId: MahjongSoulRecordIdSchema,
  selfSeat: ActorSchema,
  gameId: z.string().min(1),
  streamHash: MahjongSoulSha256Schema,
  prefixHash: MahjongSoulSha256Schema.nullable(),
  mapperVersion: z.string().min(1),
  protocolVersion: z.string().min(1),
  appVersion: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  rounds: z.array(AuditedRoundSchema),
  events: z.array(AuditedEventSchema),
  decisions: z.array(AuditedDecisionSchema),
}).strict();
export type MahjongSoulReplayAudit = z.infer<typeof MahjongSoulReplayAuditSchema>;

type AuditedEvent = z.infer<typeof AuditedEventSchema>;

function projectEvent(event: CanonicalGameEvent): AuditedEvent {
  const base: AuditedEvent = {
    eventId: event.eventId,
    type: event.type,
    actor: null,
    tile: null,
    targetActor: null,
    winnerActor: null,
    method: null,
    reason: null,
  };
  switch (event.type) {
    case "game_started":
    case "round_started":
    case "scores_updated":
    case "round_ended":
    case "game_ended":
      return base;
    case "tile_drawn":
      return {
        ...base,
        actor: event.actor,
        tile: event.tile.visibility === "visible" ? event.tile.tile : null,
      };
    case "tile_discarded":
      return { ...base, actor: event.actor, tile: event.tile };
    case "riichi_declared":
    case "riichi_accepted":
      return { ...base, actor: event.actor };
    case "chi_called":
    case "pon_called":
    case "daiminkan_called":
      return {
        ...base,
        actor: event.actor,
        tile: event.calledTile,
        targetActor: event.targetActor,
      };
    case "ankan_declared":
      return { ...base, actor: event.actor, tile: event.tiles[0] };
    case "kakan_declared":
      return { ...base, actor: event.actor, tile: event.addedTile };
    case "dora_revealed":
      return { ...base, tile: event.indicator };
    case "win_declared":
      return {
        ...base,
        actor: event.winnerActor,
        tile: event.winningTile,
        targetActor: event.targetActor,
        winnerActor: event.winnerActor,
        method: event.method,
      };
    case "round_drawn":
      return { ...base, reason: event.reason };
  }
}

function roundAudit(
  event: Extract<CanonicalGameEvent, { type: "round_started" }>,
): z.infer<typeof AuditedRoundSchema> {
  return {
    roundOrdinal: event.roundOrdinal,
    roundWind: event.roundWind,
    hand: event.hand,
    honba: event.honba,
    riichiSticks: event.riichiSticks,
    dealer: event.dealer,
    doraIndicator: event.doraIndicator,
    scores: event.scores,
    selfHand: [...event.selfHand],
  };
}

function decisionAudit(
  decision: ReplayedDecision,
): z.infer<typeof AuditedDecisionSchema> {
  const currentDraw = decision.facts.currentDraw;
  return {
    decisionEventRef: decision.decisionEventRef,
    concealedTiles: decision.facts.concealedTiles.map((tile) => ({ ...tile })),
    currentDraw: currentDraw === null ? null : { ...currentDraw.tile },
    actualDiscard: decision.actualDiscard === null
      ? null
      : {
        eventId: decision.actualDiscard.eventId,
        tile: { ...decision.actualDiscard.tile },
        discardMode: decision.actualDiscard.discardMode,
      },
  };
}

export function buildMahjongSoulReplayAudit(input: {
  readonly stream: CanonicalEventStream;
  readonly decisions: readonly ReplayedDecision[];
  readonly recordId: string;
  readonly protocolVersion: string;
  readonly appVersion: string;
  readonly now: () => number;
}): MahjongSoulReplayAudit {
  const generatedAt = input.now();
  const rounds = input.stream.events
    .filter(
      (event): event is Extract<CanonicalGameEvent, { type: "round_started" }> =>
        event.type === "round_started",
    )
    .map(roundAudit);
  const events = input.stream.events.map(projectEvent);
  const decisions = input.decisions.map(decisionAudit);
  const prefixHash = input.decisions[0]?.snapshot.streamPrefixHash ?? null;
  return MahjongSoulReplayAuditSchema.parse({
    schemaVersion: MAHJONG_SOUL_REPLAY_AUDIT_SCHEMA_VERSION,
    recordId: input.recordId,
    selfSeat: input.stream.selfActor,
    gameId: input.stream.gameId,
    streamHash: input.stream.sourceRecordHash,
    prefixHash,
    mapperVersion: input.stream.mapperVersion,
    protocolVersion: input.protocolVersion,
    appVersion: input.appVersion,
    generatedAt,
    rounds,
    events,
    decisions,
  });
}

export function serializeMahjongSoulReplayAudit(
  audit: MahjongSoulReplayAudit,
): string {
  return `${JSON.stringify(audit, null, 2)}\n`;
}
