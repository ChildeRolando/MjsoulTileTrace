import { createHash } from "node:crypto";
import {
  CanonicalEventStreamSchema,
  canonicalEventId,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type CanonicalSourceKind,
  type NormalizedEvent,
  type Tile,
} from "@riichi-coach/contracts";
import { validateCanonicalEventStream } from "../replay/canonical-event-validator.js";

export type LegacyBridgeDiagnosticCode =
  | "legacy_bridge_fixture_only"
  | "legacy_stream_missing_game_start"
  | "legacy_stream_invalid_actor"
  | "legacy_stream_invalid_round"
  | "legacy_stream_call_target_missing"
  | "legacy_stream_called_discard_missing"
  | "legacy_stream_invalid_meld_tiles"
  | "legacy_stream_kakan_parent_missing"
  | "legacy_stream_terminal_unsupported"
  | "legacy_stream_sequence_invalid"
  | "legacy_stream_schema_invalid";

export type LegacyEventStreamBridgeResult =
  | {
      status: "ready";
      stream: CanonicalEventStream;
      provenance: "legacy_regression_bridge_only";
      legacyEventRefToCanonicalEventRefs: Readonly<
        Record<string, readonly string[]>
      >;
    }
  | { status: "invalid_source"; code: LegacyBridgeDiagnosticCode };

export interface LegacyEventStreamBridgeOptions {
  sourceKind: CanonicalSourceKind;
  gameId: string;
}

function invalid(code: LegacyBridgeDiagnosticCode): LegacyEventStreamBridgeResult {
  return { status: "invalid_source", code };
}

function sameTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function base(event: NormalizedEvent, eventId: string) {
  return {
    eventId,
    sourceRecordRef: `legacy:${event.eventId}`,
  };
}

function roundOrdinal(wind: "E" | "S", hand: number): number {
  return (wind === "E" ? 0 : 4) + hand - 1;
}

function sourceHash(events: readonly NormalizedEvent[]): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(events))
    .digest("hex")}`;
}

function tuple2(tiles: readonly Tile[]): [Tile, Tile] | null {
  return tiles.length === 2 ? [{ ...tiles[0]! }, { ...tiles[1]! }] : null;
}

function tuple3(tiles: readonly Tile[]): [Tile, Tile, Tile] | null {
  return tiles.length === 3
    ? [{ ...tiles[0]! }, { ...tiles[1]! }, { ...tiles[2]! }]
    : null;
}

function tuple4(tiles: readonly Tile[]): [Tile, Tile, Tile, Tile] | null {
  return tiles.length === 4
    ? [
        { ...tiles[0]! }, { ...tiles[1]! },
        { ...tiles[2]! }, { ...tiles[3]! },
      ]
    : null;
}

export function bridgeLegacyRegressionEvents(
  events: readonly NormalizedEvent[],
  selfActor: number,
  options: LegacyEventStreamBridgeOptions,
): LegacyEventStreamBridgeResult {
  if (options.sourceKind !== "fixture") {
    return invalid("legacy_bridge_fixture_only");
  }
  if (events[0]?.type !== "start_game") {
    return invalid("legacy_stream_missing_game_start");
  }
  if (!Number.isInteger(selfActor) || selfActor < 0 || selfActor > 3) {
    return invalid("legacy_stream_invalid_actor");
  }

  const canonical: CanonicalGameEvent[] = [];
  const pendingRiichi = new Map<number, string>();
  const consumedDiscards = new Set<string>();
  const activePonByActorAndTile = new Map<string, string>();
  const legacyEventRefToCanonicalEventRefs: Record<string, string[]> = {};
  let hasKan = false;
  let currentRoundOrdinal = 0;

  for (const [sourceRecordOrdinal, event] of events.entries()) {
    if (event.type === "start_kyoku") {
      currentRoundOrdinal = roundOrdinal(event.bakaze, event.kyoku);
    }
    const eventId = canonicalEventId(options.gameId, {
      roundOrdinal: currentRoundOrdinal,
      sourceRecordOrdinal,
      subEventOrdinal: 0,
    });
    (legacyEventRefToCanonicalEventRefs[event.eventId] ??= []).push(eventId);
    if (event.type === "start_game") {
      canonical.push({ ...base(event, eventId), type: "game_started" });
      continue;
    }
    if (event.type === "start_kyoku") {
      if (event.scores.length !== 4) return invalid("legacy_stream_invalid_round");
      canonical.push({
        ...base(event, eventId),
        type: "round_started",
        roundOrdinal: roundOrdinal(event.bakaze, event.kyoku),
        roundWind: event.bakaze,
        hand: event.kyoku,
        honba: event.honba,
        riichiSticks: event.kyotaku,
        dealer: event.oya,
        scores: [
          event.scores[0]!, event.scores[1]!,
          event.scores[2]!, event.scores[3]!,
        ],
        doraIndicator: { ...event.doraMarker },
        selfHand: event.selfHand.map((tile) => ({ ...tile })),
        remainingDraws: null,
      });
      pendingRiichi.clear();
      consumedDiscards.clear();
      activePonByActorAndTile.clear();
      continue;
    }
    if (event.type === "tsumo") {
      if (event.actor === selfActor && event.tile === null) {
        return invalid("legacy_stream_schema_invalid");
      }
      canonical.push({
        ...base(event, eventId),
        type: "tile_drawn",
        actor: event.actor,
        tile: event.actor === selfActor
          ? { visibility: "visible", tile: { ...event.tile! } }
          : { visibility: "hidden" },
        from: "live_wall",
      });
      continue;
    }
    if (event.type === "reach") {
      pendingRiichi.set(event.actor, eventId);
      canonical.push({ ...base(event, eventId), type: "riichi_declared", actor: event.actor });
      continue;
    }
    if (event.type === "dahai") {
      canonical.push({
        ...base(event, eventId),
        type: "tile_discarded",
        actor: event.actor,
        tile: { ...event.tile },
        discardMode: event.tsumogiri ? "tsumogiri" : "tedashi",
        riichiDeclarationEventRef: pendingRiichi.get(event.actor) ?? null,
      });
      continue;
    }
    if (event.type === "reach_accepted") {
      const declarationEventRef = pendingRiichi.get(event.actor);
      if (declarationEventRef === undefined) {
        return invalid("legacy_stream_schema_invalid");
      }
      canonical.push({
        ...base(event, eventId),
        type: "riichi_accepted",
        actor: event.actor,
        declarationEventRef,
      });
      pendingRiichi.delete(event.actor);
      continue;
    }
    if (event.type === "chi" || event.type === "pon" || event.type === "daiminkan") {
      if (event.target === null) return invalid("legacy_stream_call_target_missing");
      const discard = [...canonical].reverse().find((candidate) =>
        candidate.type === "tile_discarded" &&
        candidate.actor === event.target &&
        sameTile(candidate.tile, event.tile) &&
        !consumedDiscards.has(candidate.eventId)
      );
      if (discard === undefined || discard.type !== "tile_discarded") {
        return invalid("legacy_stream_called_discard_missing");
      }
      consumedDiscards.add(discard.eventId);
      if (event.type === "chi") {
        const consumedTiles = tuple2(event.consumed);
        if (consumedTiles === null) return invalid("legacy_stream_invalid_meld_tiles");
        canonical.push({
          ...base(event, eventId), type: "chi_called", actor: event.actor,
          targetActor: event.target, calledTile: { ...event.tile },
          consumedTiles, calledDiscardEventRef: discard.eventId,
        });
      } else if (event.type === "pon") {
        const consumedTiles = tuple2(event.consumed);
        if (consumedTiles === null) return invalid("legacy_stream_invalid_meld_tiles");
        canonical.push({
          ...base(event, eventId), type: "pon_called", actor: event.actor,
          targetActor: event.target, calledTile: { ...event.tile },
          consumedTiles, calledDiscardEventRef: discard.eventId,
        });
        activePonByActorAndTile.set(`${event.actor}:${event.tile.id}`, eventId);
      } else {
        hasKan = true;
        const consumedTiles = tuple3(event.consumed);
        if (consumedTiles === null) return invalid("legacy_stream_invalid_meld_tiles");
        canonical.push({
          ...base(event, eventId), type: "daiminkan_called", actor: event.actor,
          targetActor: event.target, calledTile: { ...event.tile },
          consumedTiles, calledDiscardEventRef: discard.eventId,
        });
      }
      continue;
    }
    if (event.type === "ankan") {
      hasKan = true;
      const tiles = tuple4(event.consumed);
      if (tiles === null) return invalid("legacy_stream_invalid_meld_tiles");
      canonical.push({ ...base(event, eventId), type: "ankan_declared", actor: event.actor, tiles });
      continue;
    }
    if (event.type === "kakan") {
      hasKan = true;
      const upgradedPonEventRef = activePonByActorAndTile.get(
        `${event.actor}:${event.tile.id}`,
      );
      if (upgradedPonEventRef === undefined) {
        return invalid("legacy_stream_kakan_parent_missing");
      }
      canonical.push({
        ...base(event, eventId), type: "kakan_declared", actor: event.actor,
        addedTile: { ...event.tile }, upgradedPonEventRef,
      });
      activePonByActorAndTile.delete(`${event.actor}:${event.tile.id}`);
      continue;
    }
    return invalid("legacy_stream_terminal_unsupported");
  }

  const parsed = CanonicalEventStreamSchema.safeParse({
    schemaVersion: "canonical-riichi-events/v2",
    mapperVersion: "legacy-regression-bridge/v1",
    gameId: options.gameId,
    sourceKind: "fixture",
    sourceRecordHash: sourceHash(events),
    playerCount: 4,
    selfActor,
    completeness: {
      eventSequence: "complete",
      ruleSet: "partial",
      scores: "complete",
      doraIndicators: hasKan ? "partial" : "complete",
      rivers: "complete",
      calledDiscardMarkers: "complete",
      melds: "complete",
      remainingDraws: "unknown",
      settlement: "unknown",
      responseOpportunities: "unknown",
    },
    ruleSet: {
      length: "unknown",
      redFives: { man: "unknown", pin: "unknown", sou: "unknown" },
      openTanyao: "unknown",
      atamahane: "unknown",
      westExtension: "unknown",
      ippatsuCancelledByAnkan: "unknown",
    },
    events: canonical,
  });
  if (!parsed.success) return invalid("legacy_stream_schema_invalid");
  if (validateCanonicalEventStream(parsed.data).status === "invalid") {
    return invalid("legacy_stream_sequence_invalid");
  }
  return {
    status: "ready",
    stream: parsed.data,
    provenance: "legacy_regression_bridge_only",
    legacyEventRefToCanonicalEventRefs,
  };
}
