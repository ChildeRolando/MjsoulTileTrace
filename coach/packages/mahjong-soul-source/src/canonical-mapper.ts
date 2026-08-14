import { createHash } from "node:crypto";
import {
  CanonicalEventStreamSchema,
  canonicalEventId,
  sortTilesCanonical,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type Tile,
} from "@riichi-coach/contracts";
import { MahjongSoulSourceError } from "./errors.js";
import {
  parseMajsoulRoundWind,
  parseMajsoulTile,
} from "./majsoul-tile.js";
import type { MahjongSoulProtocolBundle } from "./protocol-bundle.js";
import {
  decodeStoredRecordActions,
  type DecodedStoredAction,
} from "./stored-actions.js";

const MAPPING_ERROR = "mahjong_soul_canonical_mapping_failed" as const;
const VALIDATION_ERROR = "mahjong_soul_canonical_validation_failed" as const;
const UNSUPPORTED_SEMANTICS = "mahjong_soul_canonical_unsupported_semantics" as const;

export type MahjongSoulMapperDiagnostic =
  | "mahjong_soul_canonical_mapping_failed"
  | "mahjong_soul_canonical_validation_failed"
  | "mahjong_soul_canonical_unsupported_semantics";

export type MahjongSoulCanonicalMapperResult =
  | { readonly status: "ready"; readonly stream: CanonicalEventStream }
  | { readonly status: "invalid"; readonly code: MahjongSoulMapperDiagnostic };

function mappingFailed(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(MAPPING_ERROR);
}

// A structurally sound action whose semantics the pinned protocol does not
// document must not be half-mapped. Fail closed with a distinct code.
function unsupportedSemantics(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(UNSUPPORTED_SEMANTICS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// The stored record is decoded with defaults:false to preserve presence, so a
// proto3 default-valued scalar (seat 0, chang 0, zimo false, ...) arrives as
// `undefined`. Normalize those back to their default; anything else is corrupt.
function u32(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff) {
    return value;
  }
  throw mappingFailed();
}

function seat(value: unknown): number {
  const n = u32(value);
  if (n > 3) throw mappingFailed();
  return n;
}

function tilesArray(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value) && value.every((tile): tile is string => typeof tile === "string")) {
    return value;
  }
  throw mappingFailed();
}

function scoreQuads(value: unknown): [number, number, number, number] {
  if (
    Array.isArray(value)
    && value.length === 4
    && value.every((n): n is number => typeof n === "number" && Number.isInteger(n))
  ) {
    return [value[0]!, value[1]!, value[2]!, value[3]!];
  }
  // The stream declares scores:"complete"; fabricating four zeros would lie.
  throw mappingFailed();
}

function sourceRef(recordId: string, sourceRecordOrdinal: number): string {
  return `record:${recordId}:action:${sourceRecordOrdinal}`;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type CanonicalEventBody = DistributiveOmit<
  CanonicalGameEvent,
  "eventId" | "sourceRecordRef"
>;

export function mapMahjongSoulRecord(input: {
  readonly gameId: string;
  readonly selfActor: number;
  readonly recordId: string;
  readonly recordBytes: Uint8Array;
  readonly bundle: MahjongSoulProtocolBundle;
}): MahjongSoulCanonicalMapperResult {
  try {
    if (
      typeof input.gameId !== "string" || input.gameId.length === 0 ||
      !Number.isInteger(input.selfActor) ||
      input.selfActor < 0 || input.selfActor > 3 ||
      typeof input.recordId !== "string" || input.recordId.length === 0 ||
      !(input.recordBytes instanceof Uint8Array)
    ) throw mappingFailed();

    const actions = decodeStoredRecordActions(input.bundle, input.recordBytes);
    if (actions.length === 0) throw mappingFailed();

    const events: CanonicalGameEvent[] = [];
    let currentRoundOrdinal = 0;
    let nextRoundOrdinal = 0;
    let roundWind: "E" | "S" | "W" = "E";
    let roundDealer = 0;
    const consumedDiscards = new Set<string>();
    // After a kan, the kan actor's next RecordDealTile is the replacement
    // (rinshan) draw — the canonical state machine rejects it as live_wall.
    const rinshanDrawDue = new Map<number, number>();
    // Events of the current round only: kan/pon provenance never crosses a
    // round boundary.
    let roundStartEventIndex = 0;
    // The event that terminated the current round (last win of a hule, or the
    // round_drawn); the follow-up round_ended binds to it before the next
    // round_started. The synthesized round_ended continues the terminal's own
    // source position (next contiguous sub-event ordinal) because the stream
    // schema binds each source position to exactly one sourceRecordRef.
    let lastTerminalEventRef: string | null = null;
    let terminalContinuation: { readonly ordinal: number; readonly nextSub: number } | null = null;

    const push = (
      sourceRecordOrdinal: number,
      subEventOrdinal: number,
      event: CanonicalEventBody,
    ): string => {
      const eventId = canonicalEventId(input.gameId, {
        roundOrdinal: currentRoundOrdinal,
        sourceRecordOrdinal,
        subEventOrdinal,
      });
      events.push({
        ...event,
        eventId,
        sourceRecordRef: sourceRef(input.recordId, sourceRecordOrdinal),
      } as CanonicalGameEvent);
      return eventId;
    };

    // Synthesized game boundary before the first source action.
    push(0, 0, { type: "game_started" });

    for (const action of actions) {
      const ordinal = action.sourceRecordOrdinal;
      const data = action.data;

      if (action.name === "RecordNewRound") {
        // Close the terminated round before opening the next one; the state
        // machine only allows round_started from between_rounds. The eventId
        // still binds to the ENDING round (currentRoundOrdinal updates below).
        if (lastTerminalEventRef !== null && terminalContinuation !== null) {
          push(terminalContinuation.ordinal, terminalContinuation.nextSub, {
            type: "round_ended",
            terminalEventRef: lastTerminalEventRef,
          });
          lastTerminalEventRef = null;
          terminalContinuation = null;
        }
        const chang = u32(data.chang);
        const dealer = seat(data.ju);
        const honba = u32(data.ben);
        const liqibang = u32(data.liqibang);
        // The stored format carries the dora indicators in `doras` (repeated);
        // the legacy single `dora` field is absent on real wire.
        const doras = tilesArray(data.doras);
        const firstDora = doras[0];
        if (firstDora === undefined) throw mappingFailed();
        const dora = parseMajsoulTile(firstDora);
        const scores = scoreQuads(data.scores);
        const seatTiles = [
          tilesArray(data.tiles0),
          tilesArray(data.tiles1),
          tilesArray(data.tiles2),
          tilesArray(data.tiles3),
        ];
        const selfHand = seatTiles[input.selfActor]!.slice(0, 13).map((tile) => parseMajsoulTile(tile));
        const dealerDrawTile = seatTiles[dealer]![13];
        const dealerDraw = dealerDrawTile === undefined
          ? undefined
          : parseMajsoulTile(dealerDrawTile);

        currentRoundOrdinal = nextRoundOrdinal;
        nextRoundOrdinal += 1;
        roundStartEventIndex = events.length;
        roundWind = parseMajsoulRoundWind(chang);
        roundDealer = dealer;
        push(ordinal, 0, {
          type: "round_started",
          roundOrdinal: currentRoundOrdinal,
          roundWind,
          hand: dealer + 1,
          honba,
          riichiSticks: liqibang,
          dealer,
          scores,
          doraIndicator: dora,
          selfHand,
          // The stored left_tile_count is the live wall AFTER the initial deal,
          // while the canonical state model counts draws (including the
          // synthetic dealer draw emitted below), so the raw value cannot be
          // projected verbatim. Completeness stays "unknown" and the value is
          // left null rather than guessed.
          remainingDraws: null,
        });
        rinshanDrawDue.clear();
        if (dealerDraw !== undefined) {
          push(ordinal, 1, {
            type: "tile_drawn",
            actor: dealer,
            tile: dealer === input.selfActor
              ? { visibility: "visible", tile: dealerDraw }
              : { visibility: "hidden" },
            from: "live_wall",
          });
        }
        continue;
      }

      if (action.name === "RecordDealTile") {
        const actor = seat(data.seat);
        const from = rinshanDrawDue.has(actor) ? "rinshan" : "live_wall";
        rinshanDrawDue.delete(actor);
        if (actor === input.selfActor) {
          const tile = typeof data.tile === "string" ? data.tile : undefined;
          if (tile === undefined) throw mappingFailed();
          push(ordinal, 0, {
            type: "tile_drawn",
            actor,
            tile: { visibility: "visible", tile: parseMajsoulTile(tile) },
            from,
          });
        } else {
          push(ordinal, 0, {
            type: "tile_drawn",
            actor,
            tile: { visibility: "hidden" },
            from,
          });
        }
        continue;
      }

      if (action.name === "RecordDiscardTile") {
        const actor = seat(data.seat);
        const tile = parseMajsoulTile(data.tile);
        const isRiichi = data.is_liqi === true;
        const moqie = data.moqie === true;
        // The stored record marks riichi on the discard itself; the canonical
        // model splits it into declaration → discard → acceptance. The stored
        // wire has no reach_accepted equivalent — the stick definitively
        // stands in the record — so acceptance is synthesized immediately.
        let declarationEventRef: string | null = null;
        if (isRiichi) {
          declarationEventRef = push(ordinal, 0, { type: "riichi_declared", actor });
        }
        push(ordinal, isRiichi ? 1 : 0, {
          type: "tile_discarded",
          actor,
          tile,
          discardMode: moqie ? "tsumogiri" : "tedashi",
          riichiDeclarationEventRef: declarationEventRef,
        });
        if (declarationEventRef !== null) {
          push(ordinal, 2, { type: "riichi_accepted", actor, declarationEventRef });
        }
        continue;
      }

      if (action.name === "RecordChiPengGang") {
        const actor = seat(data.seat);
        const type = u32(data.type);
        const tiles = tilesArray(data.tiles).map((tile) => parseMajsoulTile(tile));
        const froms = Array.isArray(data.froms)
          ? data.froms.filter((from): from is number => typeof from === "number" && from >= 0 && from <= 3)
          : [];
        // On real wire the called tile is the ONE entry whose `froms` seat is
        // not the actor; the actor's own tiles come first. Never assume index 0.
        const targetEntries = froms
          .map((from, index) => ({ from, index }))
          .filter(({ from }) => from !== actor);
        if (targetEntries.length !== 1) throw mappingFailed();
        const targetIndex = targetEntries[0]!.index;
        const target = targetEntries[0]!.from;
        const calledTile = tiles[targetIndex];
        if (calledTile === undefined) throw mappingFailed();
        const consumed = tiles.filter((_, index) => index !== targetIndex);
        const discard = [...events].reverse().find((candidate) =>
          candidate.type === "tile_discarded"
          && candidate.actor === target
          && candidate.tile.id === calledTile.id
          && candidate.tile.red === calledTile.red
          && !consumedDiscards.has(candidate.eventId)
        );
        if (discard === undefined || discard.type !== "tile_discarded") {
          throw mappingFailed();
        }
        consumedDiscards.add(discard.eventId);
        if (type === 0 || type === 1) {
          if (consumed.length !== 2) throw mappingFailed();
          // Wire order is not canonical (e.g. a pon consumed pair can arrive
          // as [5p, red 5p] or the reverse); sort before emitting.
          const sorted = sortTilesCanonical(consumed);
          const consumedTiles: [Tile, Tile] = [sorted[0]!, sorted[1]!];
          push(ordinal, 0, {
            type: type === 0 ? "chi_called" : "pon_called",
            actor, targetActor: target,
            calledTile, consumedTiles, calledDiscardEventRef: discard.eventId,
          });
        } else if (type === 2) {
          if (consumed.length !== 3) throw mappingFailed();
          const sorted = sortTilesCanonical(consumed);
          const consumedTiles: [Tile, Tile, Tile] = [sorted[0]!, sorted[1]!, sorted[2]!];
          push(ordinal, 0, {
            type: "daiminkan_called", actor, targetActor: target,
            calledTile, consumedTiles, calledDiscardEventRef: discard.eventId,
          });
        } else {
          throw mappingFailed();
        }
        continue;
      }

      if (action.name === "RecordAnGangAddGang") {
        // The wire carries ONE tile string naming the kan tile; the
        // discriminator is `type`, pinned by the two real fixtures (see
        // real-record-fixtures.test.ts): 3 = ankan — the actor provably held
        // all four concealed copies with no prior meld (source ordinal 561);
        // 2 = kakan — the actor provably upgrades their earlier pon of the
        // same tile (ordinal 1139 upgrading the pon at 1053). Any other
        // value is unattested and stays unsupported; no guessing the rest of
        // the enum from Action* experience.
        const actor = seat(data.seat);
        const type = u32(data.type);
        if (typeof data.tiles !== "string" || data.tiles.length === 0) {
          throw mappingFailed();
        }
        if (type === 3) {
          const tile = parseMajsoulTile(data.tiles);
          // A kan of a five cannot be rebuilt from one string: which of the
          // four copies is the red five is not on the wire. Keep failing
          // closed until a real five-kan fixture pins the encoding.
          if (tile.id.startsWith("5")) throw unsupportedSemantics();
          // An ankan can never coexist with the actor's own pon of the same
          // tile in one round; contradiction means the wire drifted.
          const priorPon = events.slice(roundStartEventIndex)
            .findLast((candidate) =>
              candidate.type === "pon_called" && candidate.actor === actor
              && candidate.calledTile.id === tile.id);
          if (priorPon !== undefined) throw mappingFailed();
          const kanTiles: [Tile, Tile, Tile, Tile] = [
            { ...tile }, { ...tile }, { ...tile }, { ...tile },
          ];
          push(ordinal, 0, { type: "ankan_declared", actor, tiles: kanTiles });
          rinshanDrawDue.set(actor, ordinal);
          continue;
        }
        if (type === 2) {
          const addedTile = parseMajsoulTile(data.tiles);
          const pon = events.slice(roundStartEventIndex)
            .findLast((candidate) =>
              candidate.type === "pon_called" && candidate.actor === actor
              && candidate.calledTile.id === addedTile.id);
          if (pon === undefined || pon.type !== "pon_called") {
            throw mappingFailed();
          }
          push(ordinal, 0, {
            type: "kakan_declared",
            actor,
            addedTile: { ...addedTile },
            upgradedPonEventRef: pon.eventId,
          });
          rinshanDrawDue.set(actor, ordinal);
          continue;
        }
        throw unsupportedSemantics();
      }

      if (action.name === "RecordHule") {
        const hules = Array.isArray(data.hules) ? data.hules : [];
        if (hules.length === 0) throw mappingFailed();
        const deltaValues = data.delta_scores;
        if (
          !Array.isArray(deltaValues)
          || deltaValues.length !== 4
          || deltaValues.some((score) => !Number.isInteger(score))
        ) {
          throw mappingFailed();
        }
        const scoreDeltas = [
          deltaValues[0], deltaValues[1], deltaValues[2], deltaValues[3],
        ] as [number, number, number, number];
        let subEvent = 0;
        for (const raw of hules) {
          if (!isRecord(raw)) throw mappingFailed();
          const winner = seat(raw.seat);
          const zimo = raw.zimo === true;
          const tile = parseMajsoulTile(raw.hu_tile);
          const source = [...events].reverse().find((candidate): boolean =>
            zimo
              ? candidate.type === "tile_drawn" && candidate.actor === winner
              : candidate.type === "tile_discarded" &&
                candidate.tile.id === tile.id && candidate.tile.red === tile.red
          );
          if (source === undefined) throw mappingFailed();
          const targetActor = !zimo && source.type === "tile_discarded"
            ? source.actor
            : null;
          lastTerminalEventRef = push(ordinal, subEvent, {
            type: "win_declared",
            winnerActor: winner,
            targetActor,
            method: zimo ? "tsumo" : "ron",
            winningTile: tile,
            winSourceEventRef: source.eventId,
            scoreDeltas,
          });
          subEvent += 1;
        }
        if (subEvent === 0) throw mappingFailed();
        terminalContinuation = { ordinal, nextSub: subEvent };
        continue;
      }

      if (action.name === "RecordLiuJu") {
        // RecordLiuJu.type covers many abortive draws but the enum values are
        // not documented in the pinned protocol and no sanitized fixture exists.
        throw unsupportedSemantics();
      }

      if (action.name === "RecordNoTile") {
        const players = Array.isArray(data.players) ? data.players : [];
        const tenpaiActors: number[] = [];
        for (let seatIndex = 0; seatIndex < players.length && seatIndex < 4; seatIndex += 1) {
          const player = players[seatIndex];
          if (isRecord(player) && player.tingpai === true) {
            tenpaiActors.push(seatIndex);
          }
        }
        lastTerminalEventRef = push(ordinal, 0, {
          type: "round_drawn",
          reason: "exhaustive",
          tenpaiActors,
        });
        terminalContinuation = { ordinal, nextSub: 1 };
        continue;
      }

      throw mappingFailed();
    }

    const parsed = CanonicalEventStreamSchema.safeParse({
      schemaVersion: "canonical-riichi-events/v2",
      mapperVersion: "mahjong-soul-record-mapper/v1",
      gameId: input.gameId,
      sourceKind: "mahjong_soul",
      sourceRecordHash: `sha256:${createHash("sha256")
        .update(input.recordBytes).digest("hex")}`,
      playerCount: 4,
      selfActor: input.selfActor,
      completeness: {
        eventSequence: "complete",
        ruleSet: "unknown",
        scores: "complete",
        doraIndicators: "partial",
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
      events,
    });
    if (!parsed.success) {
      return { status: "invalid", code: VALIDATION_ERROR };
    }
    return { status: "ready", stream: parsed.data };
  } catch (error) {
    if (
      error instanceof MahjongSoulSourceError
      && error.code === UNSUPPORTED_SEMANTICS
    ) {
      return { status: "invalid", code: UNSUPPORTED_SEMANTICS };
    }
    return { status: "invalid", code: MAPPING_ERROR };
  }
}
