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
import { projectRecordRules, validateRecordRuleEvidence, type MahjongSoulRecordRuleEvidence } from "./record-rule-evidence.js";
import {
  decodeStoredRecordActions,
  type DecodedStoredAction,
} from "./stored-actions.js";

const MAPPING_ERROR = "mahjong_soul_canonical_mapping_failed" as const;
const VALIDATION_ERROR = "mahjong_soul_canonical_validation_failed" as const;
const UNSUPPORTED_SEMANTICS = "mahjong_soul_canonical_unsupported_semantics" as const;
export const MAHJONG_SOUL_RECORD_MAPPER_VERSION = "mahjong-soul-record-mapper/v7" as const;

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

function optionalScoreQuads(value: unknown): [number, number, number, number] | null {
  return value === undefined || (Array.isArray(value) && value.length === 0) ? null : scoreQuads(value);
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
  readonly ruleEvidence?: MahjongSoulRecordRuleEvidence;
}): MahjongSoulCanonicalMapperResult {
  try {
    if (
      typeof input.gameId !== "string" || input.gameId.length === 0 ||
      !Number.isInteger(input.selfActor) ||
      input.selfActor < 0 || input.selfActor > 3 ||
      typeof input.recordId !== "string" || input.recordId.length === 0 ||
      !(input.recordBytes instanceof Uint8Array)
    ) throw mappingFailed();

    const ruleEvidence = input.ruleEvidence === undefined ? undefined
      : validateRecordRuleEvidence(input.ruleEvidence, input.recordId, input.recordBytes);
    const ruleSet = projectRecordRules(ruleEvidence);
    const recordSha256 = `sha256:${createHash("sha256").update(input.recordBytes).digest("hex")}`;
    const sourceRecordHash = ruleEvidence === undefined ? recordSha256
      : `sha256:${createHash("sha256").update(JSON.stringify({ recordSha256, ruleEvidence })).digest("hex")}`;
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
    // The event that started the current terminal (FIRST win of a hule, or
    // round_drawn); the follow-up round_ended binds to it before the next
    // round_started. The synthesized round_ended continues the terminal's own
    // source position (next contiguous sub-event ordinal) because the stream
    // schema binds each source position to exactly one sourceRecordRef.
    let lastTerminalEventRef: string | null = null;
    let terminalContinuation: { readonly ordinal: number; readonly nextSub: number } | null = null;
    // Running seat scores: source round start, accepted riichi deposits, then
    // each Hule's absolute/derived aggregate settlement applied once.
    let currentScores: [number, number, number, number] | null = null;
    let roundStartScores: [number, number, number, number] | null = null;
    // Whether the current round's terminal settles scores on the wire (a
    // hule does; a sanitized RecordNoTile carries no payment data).
    let terminalSettlesScores = false;
    let remainingDraws: number | null = null;
    let wallEvidenceComplete = true;
    let allObservedRoundsClosed = true;
    let doraEvidenceComplete = true;
    let currentDoras: Tile[] = [];
    const pendingDoraKans: { eventRef: string; actor: number }[] = [];

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

    // A cumulative snapshot attests publication at THIS source action. In
    // particular, a discard snapshot must never enrich the preceding draw.
    // Preserve the publication record separately from the associated kan.
    const publishDoras = (raw: unknown, actor: number, sourceOrdinal: number, firstSub = 0): number => {
      const snapshot = tilesArray(raw).map(parseMajsoulTile);
      if (snapshot.length === 0) return firstSub;
      if (snapshot.length > 5 || snapshot.length < currentDoras.length ||
          currentDoras.some((tile, index) =>
            tile.id !== snapshot[index]!.id || tile.red !== snapshot[index]!.red)) throw mappingFailed();
      for (const indicator of snapshot.slice(currentDoras.length)) {
        const kan = pendingDoraKans.shift();
        if (kan === undefined || kan.actor !== actor) throw mappingFailed();
        const kanIndex = events.findIndex(event => event.eventId === kan.eventRef);
        if (kanIndex < 0 || events.slice(kanIndex + 1).some(event =>
          event.type !== "tile_drawn" || event.actor !== actor || event.from !== "rinshan")) throw mappingFailed();
        push(sourceOrdinal, firstSub++, { type: "dora_revealed", indicator, kanEventRef: kan.eventRef });
      }
      currentDoras = snapshot;
      return firstSub;
    };

    // Synthesized game boundary before the first source action.
    push(0, 0, { type: "game_started" });

    // Closing invariant: a round that reached its terminal is closed with a
    // round_ended bound to the terminal's source position (contiguous
    // sub-event, same sourceRecordRef). Called before the next round_started
    // and once more at end of record — a complete record never stops in an
    // active round.
    const flushRoundEnd = (atEndOfRecord: boolean): void => {
      if (lastTerminalEventRef === null || terminalContinuation === null) return;
      push(terminalContinuation.ordinal, terminalContinuation.nextSub, {
        type: "round_ended",
        terminalEventRef: lastTerminalEventRef,
      });
      // game_ended only closes the RECORD, never an intermediate round, and
      // only when the final settlement is actually derivable from the wire;
      // a drawn final carries no sanitized payment data, so no scores are
      // invented for it.
      if (atEndOfRecord && terminalSettlesScores && currentScores !== null) {
        push(terminalContinuation.ordinal, terminalContinuation.nextSub + 1, {
          type: "game_ended",
          scores: [...currentScores],
        });
      }
      lastTerminalEventRef = null;
      terminalContinuation = null;
      terminalSettlesScores = false;
    };

    for (const action of actions) {
      const ordinal = action.sourceRecordOrdinal;
      const data = action.data;

      if (action.name === "RecordNewRound") {
        if (nextRoundOrdinal > 0 && lastTerminalEventRef === null) allObservedRoundsClosed = false;
        if (pendingDoraKans.length > 0) doraEvidenceComplete = false;
        pendingDoraKans.length = 0;
        // Close the terminated round before opening the next one; the state
        // machine only allows round_started from between_rounds. The eventId
        // still binds to the ENDING round (currentRoundOrdinal updates below).
        flushRoundEnd(false);
        const chang = u32(data.chang);
        const dealer = seat(data.ju);
        const honba = u32(data.ben);
        const liqibang = u32(data.liqibang);
        // The stored format carries the dora indicators in `doras` (repeated);
        // the legacy single `dora` field is absent on real wire.
        const doras = tilesArray(data.doras);
        const firstDora = doras[0];
        if (firstDora === undefined || doras.length !== 1) throw mappingFailed();
        const dora = parseMajsoulTile(firstDora);
        currentDoras = [dora];
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

        // Stored NewRound includes the dealer's initial draw: the real wire
        // has 14/13/13/13 tiles and left_tile_count=69 in all nine fixture
        // rounds. Canonical starts before that explicit synthetic draw.
        // Verify every later source counter, including rinshan, rather than
        // inferring a complete wall from the source platform alone.
        const fullDeal = seatTiles.every((tiles, actor) => tiles.length === (actor === dealer ? 14 : 13));
        remainingDraws = null;
        if (fullDeal && data.left_tile_count !== undefined && data.left_tile_count !== null) {
          if (u32(data.left_tile_count) !== 69) throw mappingFailed();
          remainingDraws = 69;
        } else {
          wallEvidenceComplete = false;
        }

        currentRoundOrdinal = nextRoundOrdinal;
        nextRoundOrdinal += 1;
        roundStartEventIndex = events.length;
        roundWind = parseMajsoulRoundWind(chang);
        roundDealer = dealer;
        currentScores = [...scores];
        roundStartScores = [...scores];
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
          remainingDraws: remainingDraws === null ? null : remainingDraws + 1,
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
        const nextSub = publishDoras(data.doras, seat(data.seat), ordinal);
        const expected = remainingDraws === null ? null : remainingDraws - 1;
        if (expected !== null && expected < 0) throw mappingFailed();
        const observed = data.left_tile_count;
        if (observed === undefined || observed === null) {
          // Protobuf omits its zero default. Only the already established
          // final draw count makes that omission unambiguous.
          if (expected !== 0) wallEvidenceComplete = false;
        } else {
          const count = u32(observed);
          if (count > 69 || (expected !== null && count !== expected)) throw mappingFailed();
        }
        remainingDraws = expected;
        const actor = seat(data.seat);
        const from = rinshanDrawDue.has(actor) ? "rinshan" : "live_wall";
        rinshanDrawDue.delete(actor);
        if (actor === input.selfActor) {
          const tile = typeof data.tile === "string" ? data.tile : undefined;
          if (tile === undefined) throw mappingFailed();
          push(ordinal, nextSub, {
            type: "tile_drawn",
            actor,
            tile: { visibility: "visible", tile: parseMajsoulTile(tile) },
            from,
          });
        } else {
          push(ordinal, nextSub, {
            type: "tile_drawn",
            actor,
            tile: { visibility: "hidden" },
            from,
          });
        }
        continue;
      }

      if (action.name === "RecordDiscardTile") {
        const nextSub = publishDoras(data.doras, seat(data.seat), ordinal);
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
          declarationEventRef = push(ordinal, nextSub, { type: "riichi_declared", actor });
        }
        push(ordinal, nextSub + (isRiichi ? 1 : 0), {
          type: "tile_discarded",
          actor,
          tile,
          discardMode: moqie ? "tsumogiri" : "tedashi",
          riichiDeclarationEventRef: declarationEventRef,
        });
        if (declarationEventRef !== null) {
          push(ordinal, nextSub + 2, { type: "riichi_accepted", actor, declarationEventRef });
          if (currentScores !== null) currentScores[actor] = currentScores[actor]! - 1000;
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
          const kanEventRef = push(ordinal, 0, {
            type: "daiminkan_called", actor, targetActor: target,
            calledTile, consumedTiles, calledDiscardEventRef: discard.eventId,
          });
          pendingDoraKans.push({ eventRef: kanEventRef, actor });
          rinshanDrawDue.set(actor, ordinal);
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
        // Consecutive kans may publish the preceding open kan's indicator on
        // the next kan record. Bind that publication before the new kan.
        const precedingSnapshot = tilesArray(data.doras).slice(0, currentDoras.length + pendingDoraKans.length);
        const nextSub = publishDoras(precedingSnapshot, actor, ordinal);
        if (type === 3) {
          const tile = parseMajsoulTile(data.tiles);
          // A kan of a five cannot be rebuilt from one string: which of the
          // four copies is the red five is not on the wire. Keep failing
          // closed until a real five-kan fixture pins the encoding.
          if (tile.id.startsWith("5")) throw unsupportedSemantics();
          const kanTiles: [Tile, Tile, Tile, Tile] = [
            { ...tile }, { ...tile }, { ...tile }, { ...tile },
          ];
          const kanEventRef = push(ordinal, nextSub, { type: "ankan_declared", actor, tiles: kanTiles });
          pendingDoraKans.push({ eventRef: kanEventRef, actor });
          publishDoras(data.doras, actor, ordinal, nextSub + 1);
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
          const kanEventRef = push(ordinal, nextSub, {
            type: "kakan_declared",
            actor,
            addedTile: { ...addedTile },
            upgradedPonEventRef: pon.eventId,
          });
          pendingDoraKans.push({ eventRef: kanEventRef, actor });
          publishDoras(data.doras, actor, ordinal, nextSub + 1);
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
        if (currentScores === null || roundStartScores === null) throw mappingFailed();
        const oldScores = optionalScoreQuads(data.old_scores);
        const finalScores = optionalScoreQuads(data.scores);
        if (oldScores !== null && oldScores.some((value, actor) => value !== currentScores![actor])) throw mappingFailed();
        const derivedScores = currentScores.map((value, actor) => value + scoreDeltas[actor]!) as [number, number, number, number];
        if (finalScores !== null && finalScores.some((value, actor) => value !== derivedScores[actor])) throw mappingFailed();
        const settledScores = finalScores ?? derivedScores;
        // Canonical deltas use round-start scores. The wire delta instead uses
        // the replayed scores, which include this round's riichi deposits.
        const canonicalDeltas = settledScores.map((value, actor) => value - roundStartScores![actor]!) as [number, number, number, number];
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
          const winEventRef = push(ordinal, subEvent, {
            type: "win_declared",
            winnerActor: winner,
            targetActor,
            method: zimo ? "tsumo" : "ron",
            winningTile: tile,
            winSourceEventRef: source.eventId,
            // The wire delta belongs to the whole RecordHule, not each winner.
            // Multi-ron has no attested per-winner payment decomposition.
            scoreDeltas: hules.length === 1 ? canonicalDeltas : null,
          });
          // Further ron winners continue the same terminal. Canonical closure
          // and settlement are bound to its first event (also used by Tenhou).
          if (subEvent === 0) lastTerminalEventRef = winEventRef;
          subEvent += 1;
        }
        if (subEvent === 0) throw mappingFailed();
        terminalContinuation = { ordinal, nextSub: subEvent };
        terminalSettlesScores = true;
        // Apply the whole action settlement once, preferring attested absolute
        // scores. Legacy delta-only records use the replayed deposit baseline.
        currentScores = [...settledScores];
        if (hules.length > 1) {
          push(ordinal, subEvent, { type: "scores_updated",
            scores: [...currentScores], settlementEventRef: lastTerminalEventRef! });
          terminalContinuation = { ordinal, nextSub: subEvent + 1 };
        }
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
        // The sanitized RecordNoTile carries no payment data, so the final
        // settlement is not derivable — game_ended must not be fabricated.
        terminalSettlesScores = false;
        continue;
      }

      throw mappingFailed();
    }

    // EOF closing invariant: a complete record ends with its final round
    // closed (round_ended for every started round), plus game_ended whenever
    // the final settlement is derivable. The stream must never stop inside an
    // active round.
    // This attests source history, not action legality. Downstream replay
    // still validates every phase/actor transition before rules can run.
    const responseHistoryComplete = allObservedRoundsClosed && nextRoundOrdinal > 0 && lastTerminalEventRef !== null;
    flushRoundEnd(true);

    const parsed = CanonicalEventStreamSchema.safeParse({
      schemaVersion: "canonical-riichi-events/v2",
      mapperVersion: MAHJONG_SOUL_RECORD_MAPPER_VERSION,
      gameId: input.gameId,
      sourceKind: "mahjong_soul",
      sourceRecordHash,
      playerCount: 4,
      selfActor: input.selfActor,
      completeness: {
        eventSequence: "complete",
        ruleSet: ruleSet.length === "unknown" ? "unknown" : "partial",
        scores: "complete",
        doraIndicators: doraEvidenceComplete && pendingDoraKans.length === 0 ? "complete" : "partial",
        rivers: "complete",
        calledDiscardMarkers: "complete",
        melds: "complete",
        remainingDraws: wallEvidenceComplete && nextRoundOrdinal > 0 ? "complete" : "unknown",
        settlement: "unknown",
        responseOpportunities: responseHistoryComplete ? "complete" : "unknown",
      },
      ruleSet,
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
