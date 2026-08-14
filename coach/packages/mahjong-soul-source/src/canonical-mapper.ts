import { createHash } from "node:crypto";
import { parse as parseProtobuf, type Root } from "protobufjs";
import {
  CanonicalEventStreamSchema,
  canonicalEventId,
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

// A structurally sound record whose action uses semantics the pinned protocol
// does not document (and for which no sanitized fixture exists) must not be
// half-mapped. Fail closed with a distinct code so the caller can tell an
// unproven action apart from malformed data.
function unsupportedSemantics(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(UNSUPPORTED_SEMANTICS);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// The full-name lookup handles the `lq` package prefix plus the action name.
function actionType(root: Root, name: string) {
  const resolved = root.lookupType(`lq.${name}`);
  return resolved;
}

interface DecodedAction {
  readonly name: string;
  readonly data: Uint8Array;
}

function decodeActions(
  bundle: MahjongSoulProtocolBundle,
  recordBytes: Uint8Array,
): DecodedAction[] {
  const root = parseProtobuf(bundle.protoText, { keepCase: true }).root;
  const recordsType = root.lookupType("lq.GameDetailRecords");
  const decoded = recordsType.toObject(recordsType.decode(recordBytes), {
    arrays: true,
    bytes: Uint8Array,
    defaults: true,
  }) as { actions?: unknown[] };
  const actions = Array.isArray(decoded.actions) ? decoded.actions : [];
  const result: DecodedAction[] = [];
  const prototypeType = root.lookupType("lq.ActionPrototype");
  for (const raw of actions) {
    if (!isRecord(raw) || !(raw.result instanceof Uint8Array)) {
      throw mappingFailed();
    }
    const prototype = prototypeType.toObject(
      prototypeType.decode(raw.result),
      { defaults: true, bytes: Uint8Array },
    ) as { name?: unknown; data?: unknown };
    if (
      typeof prototype.name !== "string"
      || prototype.name.length === 0
      || !(prototype.data instanceof Uint8Array)
    ) {
      throw mappingFailed();
    }
    result.push({ name: prototype.name, data: prototype.data });
  }
  if (result.length === 0) throw mappingFailed();
  return result;
}

function decodeData(root: Root, action: DecodedAction): Record<string, unknown> {
  const type = actionType(root, action.name);
  if (type === null) throw mappingFailed();
  const decoded = type.toObject(type.decode(action.data), {
    arrays: true,
    bytes: Uint8Array,
    defaults: true,
  });
  if (!isRecord(decoded)) throw mappingFailed();
  return decoded;
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

    const root = parseProtobuf(input.bundle.protoText, { keepCase: true }).root;
    const actions = decodeActions(input.bundle, input.recordBytes);

    const events: CanonicalGameEvent[] = [];
    let currentRoundOrdinal = 0;
    let nextRoundOrdinal = 0;
    let roundWind: "E" | "S" | "W" = "E";
    let roundDealer = 0;
    const pendingRiichi = new Map<number, string>();
    const consumedDiscards = new Set<string>();

    const push = (
      sourceRecordOrdinal: number,
      subEventOrdinal: number,
      event: CanonicalEventBody,
    ): void => {
      events.push({
        ...event,
        eventId: canonicalEventId(input.gameId, {
          roundOrdinal: currentRoundOrdinal,
          sourceRecordOrdinal,
          subEventOrdinal,
        }),
        sourceRecordRef: sourceRef(input.recordId, sourceRecordOrdinal),
      } as CanonicalGameEvent);
    };

    // Synthesized game boundary before the first source action.
    push(0, 0, { type: "game_started" });

    actions.forEach((action, index) => {
      const sourceRecordOrdinal = index + 1;
      if (action.name === "ActionNewRound") {
        const data = decodeData(root, action);
        currentRoundOrdinal = nextRoundOrdinal++;
        roundWind = parseMajsoulRoundWind(data.chang);
        roundDealer = typeof data.ju === "number" ? data.ju % 4 : 0;
        const tiles = Array.isArray(data.tiles)
          ? data.tiles.map((tile) => parseMajsoulTile(tile))
          : [];
        const selfHand = tiles.slice(0, 13);
        const dealerDraw = tiles[13];
        const scores = Array.isArray(data.scores) && data.scores.length === 4
          ? [data.scores[0], data.scores[1], data.scores[2], data.scores[3]]
          : [0, 0, 0, 0];
        push(sourceRecordOrdinal, 0, {
          type: "round_started",
          roundOrdinal: currentRoundOrdinal,
          roundWind,
          hand: (roundDealer % 4) + 1,
          honba: typeof data.ben === "number" ? data.ben : 0,
          riichiSticks: typeof data.liqibang === "number" ? data.liqibang : 0,
          dealer: roundDealer,
          scores: scores as [number, number, number, number],
          doraIndicator: parseMajsoulTile(data.dora),
          selfHand,
          remainingDraws: typeof data.left_tile_count === "number"
            ? data.left_tile_count
            : null,
        });
        pendingRiichi.clear();
        if (dealerDraw !== undefined) {
          push(sourceRecordOrdinal, 1, {
            type: "tile_drawn",
            actor: roundDealer,
            tile: roundDealer === input.selfActor
              ? { visibility: "visible", tile: dealerDraw }
              : { visibility: "hidden" },
            from: "live_wall",
          });
        }
        return;
      }
      if (action.name === "ActionDealTile") {
        const data = decodeData(root, action);
        const actor = typeof data.seat === "number" ? data.seat : -1;
        const tile = parseMajsoulTile(data.tile);
        push(sourceRecordOrdinal, 0, {
          type: "tile_drawn",
          actor,
          tile: actor === input.selfActor
            ? { visibility: "visible", tile }
            : { visibility: "hidden" },
          from: "live_wall",
        });
        return;
      }
      if (action.name === "ActionDiscardTile" || action.name === "ActionRevealTile") {
        const data = decodeData(root, action);
        const actor = typeof data.seat === "number" ? data.seat : -1;
        const tile = parseMajsoulTile(data.tile);
        const isRiichi = data.is_liqi === true;
        const moqie = data.moqie === true;
        if (isRiichi) {
          push(sourceRecordOrdinal, 0, { type: "riichi_declared", actor });
          pendingRiichi.set(actor, canonicalEventId(input.gameId, {
            roundOrdinal: currentRoundOrdinal,
            sourceRecordOrdinal,
            subEventOrdinal: 0,
          }));
        }
        push(sourceRecordOrdinal, isRiichi ? 1 : 0, {
          type: "tile_discarded",
          actor,
          tile,
          discardMode: moqie ? "tsumogiri" : "tedashi",
          riichiDeclarationEventRef: isRiichi
            ? pendingRiichi.get(actor) ?? null
            : null,
        });
        return;
      }
      if (action.name === "ActionChiPengGang") {
        const data = decodeData(root, action);
        const actor = typeof data.seat === "number" ? data.seat : -1;
        const type = typeof data.type === "number" ? data.type : -1;
        const tiles = Array.isArray(data.tiles)
          ? data.tiles.map((tile) => parseMajsoulTile(tile))
          : [];
        const froms = Array.isArray(data.froms)
          ? data.froms.filter((from): from is number => typeof from === "number")
          : [];
        const target = froms[0] ?? -1;
        const calledTile = tiles[0];
        if (calledTile === undefined || target < 0 || target > 3) {
          throw mappingFailed();
        }
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
        if (type === 0) {
          const consumedTiles: [Tile, Tile] = [tiles[1]!, tiles[2]!];
          push(sourceRecordOrdinal, 0, {
            type: "chi_called", actor, targetActor: target,
            calledTile, consumedTiles, calledDiscardEventRef: discard.eventId,
          });
        } else if (type === 1) {
          const consumedTiles: [Tile, Tile] = [tiles[1]!, tiles[2]!];
          push(sourceRecordOrdinal, 0, {
            type: "pon_called", actor, targetActor: target,
            calledTile, consumedTiles, calledDiscardEventRef: discard.eventId,
          });
        } else if (type === 2) {
          const consumedTiles: [Tile, Tile, Tile] = [tiles[1]!, tiles[2]!, tiles[3]!];
          push(sourceRecordOrdinal, 0, {
            type: "daiminkan_called", actor, targetActor: target,
            calledTile, consumedTiles, calledDiscardEventRef: discard.eventId,
          });
        } else {
          throw mappingFailed();
        }
        return;
      }
      if (action.name === "ActionAnGangAddGang") {
        // The `type` discriminator between ankan and kakan is not documented
        // in the pinned protocol and no sanitized fixture exists; the tiles
        // field is a single concatenated string, not a repeatable tile list.
        // Mapping 0/2 to ankan would be a guess. Fail closed.
        throw unsupportedSemantics();
      }
      if (action.name === "ActionHule") {
        const data = decodeData(root, action);
        const hules = Array.isArray(data.hules) ? data.hules : [];
        if (hules.length === 0) throw mappingFailed();
        // A standard four-player win always carries exactly four integer score
        // deltas; anything else cannot be uniquely attributed to the seats.
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
          const winner = raw.seat;
          const zimo = raw.zimo;
          if (
            typeof winner !== "number"
            || !Number.isInteger(winner) || winner < 0 || winner > 3
            || typeof zimo !== "boolean"
          ) {
            throw mappingFailed();
          }
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
          push(sourceRecordOrdinal, subEvent++, {
            type: "win_declared",
            winnerActor: winner,
            targetActor,
            method: zimo ? "tsumo" : "ron",
            winningTile: tile,
            winSourceEventRef: source.eventId,
            scoreDeltas,
          });
        }
        if (subEvent === 0) throw mappingFailed();
        return;
      }
      if (action.name === "ActionLiuJu") {
        // `ActionLiuJu.type` covers many abortive draws (kyuushu kyuhai,
        // suufon renda, suukaikan, suucha riichi, sancha hou, nagashi mangan)
        // but the enum values are not documented in the pinned protocol and no
        // sanitized fixture exists. Collapsing every type to kyuushu_kyuuhai
        // mislabels the draw; fail closed instead.
        throw unsupportedSemantics();
      }
      if (action.name === "ActionNoTile") {
        push(sourceRecordOrdinal, 0, {
          type: "round_drawn",
          reason: "exhaustive",
          tenpaiActors: [],
        });
        return;
      }
      throw mappingFailed();
    });

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
