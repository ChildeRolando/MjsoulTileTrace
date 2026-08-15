/**
 * Tenhou mjloggm → CanonicalEventStream mapper (M6-A3 §12/§13).
 *
 * Strict, deterministic, fail closed, no heuristic guessing, and no Mortal
 * mjai_log dependency. Every supported semantic below was established from the
 * pinned real corpus (tests/fixtures/real-logs) per §13's real-evidence
 * policy; synthetic tests only cover malformed inputs, never new semantics.
 *
 * Corpus-pinned semantics encoded here:
 * - Seat letters T/U/V/W (draws) and D/E/F/G (discards) are ABSOLUTE seats;
 *   the dealer (INIT oya) always draws first (128/128 rounds).
 * - tsumogiri iff the discard code equals the actor's own current draw code;
 *   the tracked code is cleared by that seat's chi/pon/daiminkan (post-call
 *   discards are tedashi) and replaced by each new draw.
 * - REACH step1 precedes the declarer's discard (83/83) and step2 follows it
 *   immediately (82/82); the declaration-turn discard is the only discard that
 *   carries riichiDeclarationEventRef.
 * - Kan→DORA order: ankan reveals the indicator immediately (5/5) while
 *   kakan/daiminkan reveal it after the rinshan draw (8/8). No decision point
 *   sits between the reveal and the post-kan discard in either order, so the
 *   mapper normalizes the indicator to directly after its kan (the canonical
 *   slot; mjai does the same), keeping the kan association via kanEventRef.
 * - The rinshan draw after a kan belongs to the kan caller (13/13).
 * - The drawable wall is a 70-tile pool: live + rinshan draws together must
 *   reach exactly 70 at every exhaustive round (22/22).
 * - sc = [score0, delta0, score1, delta1, …] ×100 in absolute seat order;
 *   even indices are pre-payment snapshots, so the round's final scores are
 *   even + odd of the LAST terminal, and they chain into the next INIT ten
 *   (114/114). owari even indices equal the final scores (14/14).
 * - Double ron occurs and both winners are paid (4/4) → atamahane=false.
 * - RYUUKYOKU: type absent → exhaustive with tenpai seats revealed via haiN;
 *   yao9/kaze4/reach4/ron3/kan4/nm map to the canonical abortive reasons.
 * - BYE (disconnect) and reconnect UN fail closed; SHUFFLE is header-only.
 */
import { createHash } from "node:crypto";
import {
  CanonicalEventStreamSchema,
  canonicalEventId,
  sortTilesCanonical,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type Tile,
} from "@riichi-coach/contracts";
import { TenhouSourceError, type TenhouSourceErrorCode } from "./errors.js";
import { tokenizeMjlog } from "./mjlog-tokenizer.js";
import { decodeTenhouMeld, type TenhouMeld } from "./meld-codec.js";
import { tenhouTileCode, tenhouTileList } from "./tile-codec.js";

export const TENHOU_MAPPER_VERSION = "tenhou-mjloggm-mapper/v1" as const;

const DRAW_SEATS = ["T", "U", "V", "W"] as const;
const DISCARD_SEATS = ["D", "E", "F", "G"] as const;

export type TenhouCanonicalMapperResult =
  | { readonly status: "ready"; readonly stream: CanonicalEventStream }
  | { readonly status: "invalid"; readonly code: TenhouSourceErrorCode };

export interface TenhouRecordMapperInput {
  /** Raw mjloggm document text. */
  readonly raw: string;
  /**
   * Opaque canonical game id. Callers must never derive it from a raw Tenhou
   * log URL / log id in a way that leaks that identifier into outputs (§23).
   */
  readonly gameId: string;
  readonly selfActor: number;
}

function invalid(code: TenhouSourceErrorCode): TenhouCanonicalMapperResult {
  return { status: "invalid", code };
}

function sameTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function concealedKey(tile: Tile): string {
  return `${tile.id}:${tile.red ? "r" : "n"}`;
}

function parseCsvInts(
  source: string,
  expect: number,
  code: TenhouSourceErrorCode,
): number[] {
  const pieces = source.split(",");
  if (pieces.length !== expect) throw new TenhouSourceError(code);
  return pieces.map((piece) => {
    if (!/^-?\d+$/.test(piece)) throw new TenhouSourceError(code);
    return Number(piece);
  });
}

/** Map a raw Tenhou mjloggm record to a canonical event stream. */
export function mapTenhouRecord(
  input: TenhouRecordMapperInput,
): TenhouCanonicalMapperResult {
  if (
    typeof input.raw !== "string" ||
    !Number.isInteger(input.selfActor) ||
    input.selfActor < 0 ||
    input.selfActor > 3 ||
    typeof input.gameId !== "string" ||
    input.gameId.length === 0
  ) {
    return invalid("tenhou_record_invalid_xml");
  }
  try {
    const stream = new MapperEngine(input.raw, input.gameId, input.selfActor).run();
    return { status: "ready", stream };
  } catch (error) {
    if (error instanceof TenhouSourceError) return invalid(error.code);
    return invalid("tenhou_mapper_schema_invalid");
  }
}

interface TerminalRecord {
  /**
   * The FIRST terminal event of the round (for a double ron, the first
   * AGARI): the canonical contract binds scores_updated.settlementEventRef
   * and round_ended.terminalEventRef to it — the second win continues the
   * terminal but never re-binds it.
   */
  readonly bindingEventId: string;
  /** Source position the settlement continuation is emitted at (the LAST terminal's tag, keeping event order). */
  settlementTagIndex: number;
  finalScores: [number, number, number, number];
  owari: [number, number, number, number] | null;
}

interface RoundState {
  readonly roundOrdinal: number;
  readonly dealer: number;
  /**
   * Running settlement for the canonical score conservation identity: the
   * validator requires roundStart + Σ(win scoreDeltas) == settled scores.
   * Tenhou sc odd includes riichi-stick collection while the deposits are
   * already subtracted from the even (pre-payment) snapshot, so each win's
   * canonical delta is its odd adjusted by (even − running) — for the first
   * win that folds in this round's riichi deposits, and it is exactly zero
   * for a double-ron second win because even₂ == even₁ + odd₁.
   */
  runningSettled: [number, number, number, number];
  totalDraws: number;
  firstDrawSeen: boolean;
  lastDrawCode: (number | null)[];
  lastDrawEventId: (string | null)[];
  lastDiscardEventId: (string | null)[];
  riichiAcceptedBySeat: boolean[];
  pendingRiichiRef: (string | null)[];
  lastRiichiDiscard: { seat: number; ref: string } | null;
  consumedDiscardIds: Set<string>;
  activePonByKey: Map<string, { eventId: string; tiles: Tile[] }>;
  rinshanDueSeat: number | null;
  pendingKan: { kanEventId: string; kanTagIndex: number } | null;
  bufferedRinshanDraw: { tagIndex: number; seat: number; code: number } | null;
  chankanCandidate: { eventId: string; actor: number; tile: Tile } | null;
  terminal: TerminalRecord | null;
  selfConcealed: Map<string, number>;
}

interface MjlogTokenView {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
}

class MapperEngine {
  private readonly events: CanonicalGameEvent[] = [];
  private goType: number | null = null;
  private sawUn = false;
  private sawFirstInit = false;
  private roundOrdinal = -1;
  private round: RoundState | null = null;
  private previousFinalScores: [number, number, number, number] | null = null;
  private gameEnded = false;

  constructor(
    private readonly raw: string,
    private readonly gameId: string,
    private readonly selfActor: number,
  ) {}

  private get redFivesEnabled(): boolean {
    return (this.goType ?? 0) & 0x02 ? false : true;
  }

  private push(
    roundOrd: number,
    tagIndex: number,
    sub: number,
    body: Record<string, unknown>,
  ): CanonicalGameEvent {
    const event = {
      ...body,
      eventId: canonicalEventId(this.gameId, {
        roundOrdinal: roundOrd,
        sourceRecordOrdinal: tagIndex,
        subEventOrdinal: sub,
      }),
      sourceRecordRef: `record:${this.gameId}:tag:${tagIndex}`,
    } as CanonicalGameEvent;
    this.events.push(event);
    return event;
  }

  run(): CanonicalEventStream {
    const tokens = tokenizeMjlog(this.raw);
    const rootVer = tokens[0]?.attrs.ver;
    if (rootVer === undefined) {
      throw new TenhouSourceError("tenhou_record_invalid_xml");
    }
    if (rootVer !== "2.3") {
      throw new TenhouSourceError("tenhou_record_unsupported_version");
    }

    for (let index = 1; index < tokens.length; index += 1) {
      this.consume(tokens[index]!, index);
    }
    // The final round closes at EOF unless it already ended the game.
    this.settlePendingRound();

    const lastRound = this.round;
    if (lastRound === null || lastRound.terminal === null) {
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }

    const parsed = CanonicalEventStreamSchema.safeParse({
      schemaVersion: "canonical-riichi-events/v2",
      mapperVersion: TENHOU_MAPPER_VERSION,
      gameId: this.gameId,
      sourceKind: "tenhou",
      sourceRecordHash: `sha256:${createHash("sha256")
        .update(this.raw, "utf8")
        .digest("hex")}`,
      playerCount: 4,
      selfActor: this.selfActor,
      completeness: {
        eventSequence: "complete",
        ruleSet: "partial",
        scores: "complete",
        doraIndicators: "complete",
        rivers: "complete",
        calledDiscardMarkers: "complete",
        melds: "complete",
        remainingDraws: "complete",
        settlement: "unknown",
        responseOpportunities: "unknown",
      },
      ruleSet: {
        length: (this.goType ?? 0) & 0x08 ? "south" : "east",
        redFives: {
          man: this.redFivesEnabled ? 1 : 0,
          pin: this.redFivesEnabled ? 1 : 0,
          sou: this.redFivesEnabled ? 1 : 0,
        },
        openTanyao: ((this.goType ?? 0) & 0x04) === 0,
        // Double ron with both winners paid occurs in the pinned corpus (4/4).
        atamahane: false,
        westExtension: "unknown",
        ippatsuCancelledByAnkan: "unknown",
      },
      events: this.events,
    });
    if (!parsed.success) {
      throw new TenhouSourceError("tenhou_mapper_schema_invalid");
    }
    return parsed.data;
  }

  private consume(token: MjlogTokenView, tagIndex: number): void {
    const tag = token.tag;
    const attrs = token.attrs;

    if (tag === "BYE") {
      throw new TenhouSourceError("tenhou_record_disconnect_unsupported");
    }
    if (tag === "UN") {
      if (this.sawFirstInit || this.sawUn || !isFullPlayerList(attrs)) {
        // Reconnect UN tags carry only a single nN attribute (pinned corpus:
        // bye.xml, newattr2023.xml); a second UN is also a reconnect.
        throw new TenhouSourceError("tenhou_record_reconnect_unsupported");
      }
      this.sawUn = true;
      return;
    }
    if (tag === "SHUFFLE") {
      if (this.sawFirstInit) {
        throw new TenhouSourceError("tenhou_record_unsupported_event");
      }
      return;
    }
    if (tag === "GO") {
      if (this.sawFirstInit || this.goType !== null) {
        throw new TenhouSourceError("tenhou_record_unsupported_event");
      }
      if (attrs.type === undefined) {
        throw new TenhouSourceError("tenhou_record_unsupported_game");
      }
      const type = parseCsvInts(attrs.type, 1, "tenhou_record_unsupported_game")[0]!;
      if ((type & 0x10) !== 0 || (type & 0x01) === 0) {
        // Three-player tables and demo logs are not mapped (§13).
        throw new TenhouSourceError("tenhou_record_unsupported_game");
      }
      this.goType = type;
      // game_started binds to the GO declaration that opens the game; GO
      // precedes every INIT so position (0, goTagIndex, 0) sorts first.
      this.push(0, tagIndex, 0, { type: "game_started" });
      return;
    }
    if (tag === "TAIKYOKU") {
      if (this.sawFirstInit) {
        throw new TenhouSourceError("tenhou_record_unsupported_event");
      }
      if (attrs.oya !== "0") {
        throw new TenhouSourceError("tenhou_record_unsupported_game");
      }
      return;
    }
    if (tag === "INIT") {
      if (this.goType === null) {
        throw new TenhouSourceError("tenhou_record_unsupported_game");
      }
      if (this.gameEnded) {
        throw new TenhouSourceError("tenhou_record_unsupported_event");
      }
      // A non-AGARI token after a terminal means the round is closed; double
      // ron is the only legal continuation and it is consumed above.
      this.settlePendingRound();
      this.roundOrdinal += 1;
      this.sawFirstInit = true;
      this.round = this.startRound(token, tagIndex);
      return;
    }

    if (this.round === null) {
      throw new TenhouSourceError("tenhou_record_unsupported_event");
    }
    this.consumeRoundToken(token, tagIndex, this.round);
  }

  private settlePendingRound(): void {
    const round = this.round;
    if (round === null || round.terminal === null || this.gameEnded) return;
    const terminal = round.terminal;
    this.push(round.roundOrdinal, terminal.settlementTagIndex, 1, {
      type: "scores_updated",
      scores: terminal.finalScores,
      settlementEventRef: terminal.bindingEventId,
    });
    this.push(round.roundOrdinal, terminal.settlementTagIndex, 2, {
      type: "round_ended",
      terminalEventRef: terminal.bindingEventId,
    });
    if (terminal.owari !== null) {
      if (
        terminal.owari.some((value, seat) => value !== terminal.finalScores[seat])
      ) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      this.push(round.roundOrdinal, terminal.settlementTagIndex, 3, {
        type: "game_ended",
        scores: terminal.finalScores,
      });
      this.gameEnded = true;
    }
    this.previousFinalScores = terminal.finalScores;
  }

  private startRound(token: MjlogTokenView, tagIndex: number): RoundState {
    const attrs = token.attrs;
    const seed = parseCsvInts(attrs.seed ?? "", 6, "tenhou_mapper_invalid_event");
    const ten = parseCsvInts(attrs.ten ?? "", 4, "tenhou_mapper_invalid_event");
    const dealer = Number(attrs.oya);
    if (!Number.isInteger(dealer) || dealer < 0 || dealer > 3) {
      throw new TenhouSourceError("tenhou_record_unsupported_game");
    }
    const roundIndex = seed[0]!;
    if (roundIndex < 0 || roundIndex > 11) {
      // East 1 … South 4 (west rounds start at index 8 only with extension);
      // beyond the pinned corpus shape, fail closed.
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }
    const scores: [number, number, number, number] = [
      ten[0]! * 100, ten[1]! * 100, ten[2]! * 100, ten[3]! * 100,
    ];
    const previous = this.previousFinalScores;
    if (
      previous !== null &&
      (previous[0] !== scores[0] || previous[1] !== scores[1] ||
        previous[2] !== scores[2] || previous[3] !== scores[3])
    ) {
      // INIT ten must chain from the previous round's final scores (114/114).
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }
    const selfHandSource = attrs[`hai${this.selfActor}`];
    if (selfHandSource === undefined) {
      throw new TenhouSourceError("tenhou_record_unsupported_game");
    }
    const selfHand = sortTilesCanonical(
      tenhouTileList(selfHandSource, this.redFivesEnabled),
    );
    if (selfHand.length !== 13) {
      throw new TenhouSourceError("tenhou_record_unsupported_game");
    }

    this.push(this.roundOrdinal, tagIndex, 0, {
      type: "round_started",
      roundOrdinal: this.roundOrdinal,
      roundWind: roundIndex < 4 ? "E" : roundIndex < 8 ? "S" : "W",
      hand: (roundIndex % 4) + 1,
      honba: seed[1]!,
      riichiSticks: seed[2]!,
      dealer,
      scores,
      doraIndicator: tenhouTileCode(seed[5]!, this.redFivesEnabled),
      selfHand,
      remainingDraws: 70,
    });

    const selfConcealed = new Map<string, number>();
    for (const tile of selfHand) {
      const key = concealedKey(tile);
      selfConcealed.set(key, (selfConcealed.get(key) ?? 0) + 1);
    }
    return {
      roundOrdinal: this.roundOrdinal,
      dealer,
      runningSettled: scores,
      totalDraws: 0,
      firstDrawSeen: false,
      lastDrawCode: [null, null, null, null],
      lastDrawEventId: [null, null, null, null],
      lastDiscardEventId: [null, null, null, null],
      riichiAcceptedBySeat: [false, false, false, false],
      pendingRiichiRef: [null, null, null, null],
      lastRiichiDiscard: null,
      consumedDiscardIds: new Set<string>(),
      activePonByKey: new Map(),
      rinshanDueSeat: null,
      pendingKan: null,
      bufferedRinshanDraw: null,
      chankanCandidate: null,
      terminal: null,
      selfConcealed,
    };
  }

  private consumeRoundToken(
    token: MjlogTokenView,
    tagIndex: number,
    round: RoundState,
  ): void {
    const tag = token.tag;

    // Draw/discard tags are one seat letter followed by the tile code
    // ("T118" = seat 0 draws code 118); the letter alone is not a tag.
    const seatTag = /^([A-Z])([0-9]+)$/.exec(tag);
    if (seatTag !== null) {
      const letter = seatTag[1]!;
      const drawSeat = DRAW_SEATS.indexOf(letter as (typeof DRAW_SEATS)[number]);
      if (drawSeat >= 0) {
        if (round.terminal !== null) {
          throw new TenhouSourceError("tenhou_mapper_invalid_event");
        }
        this.consumeDraw(tag, tagIndex, drawSeat, round);
        return;
      }
      const discardSeat = DISCARD_SEATS.indexOf(
        letter as (typeof DISCARD_SEATS)[number],
      );
      if (discardSeat >= 0) {
        if (round.terminal !== null) {
          throw new TenhouSourceError("tenhou_mapper_invalid_event");
        }
        this.flushBufferedDraw(round);
        this.consumeDiscard(tag, tagIndex, discardSeat, round);
        return;
      }
    }

    if (tag === "N") {
      if (round.terminal !== null) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      this.flushBufferedDraw(round);
      this.consumeMeld(token, tagIndex, round);
      return;
    }

    if (tag === "REACH") {
      if (round.terminal !== null) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      this.flushBufferedDraw(round);
      this.consumeRiichi(token, tagIndex, round);
      return;
    }

    if (tag === "DORA") {
      if (round.terminal !== null) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      this.consumeDora(token, round);
      return;
    }

    if (tag === "AGARI") {
      // A consecutive AGARI (double ron) is the only event allowed after a
      // terminal within the same round.
      this.flushBufferedDraw(round);
      this.consumeAgari(token, tagIndex, round);
      return;
    }

    if (tag === "RYUUKYOKU") {
      if (round.terminal !== null) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      this.flushBufferedDraw(round);
      this.consumeRyuukyoku(token, tagIndex, round);
      return;
    }

    throw new TenhouSourceError("tenhou_record_unsupported_event");
  }

  private consumeDraw(
    tag: string,
    tagIndex: number,
    seat: number,
    round: RoundState,
  ): void {
    const code = Number(tag.slice(1));
    let from: "live_wall" | "rinshan";
    if (round.rinshanDueSeat !== null) {
      if (seat !== round.rinshanDueSeat) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      from = "rinshan";
      round.rinshanDueSeat = null;
    } else {
      from = "live_wall";
      if (!round.firstDrawSeen) {
        if (seat !== round.dealer) {
          throw new TenhouSourceError("tenhou_mapper_invalid_event");
        }
        round.firstDrawSeen = true;
      }
    }
    round.totalDraws += 1;
    if (round.totalDraws > 70) {
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }
    if (from === "rinshan") {
      // Defer the rinshan draw until a following DORA tag has been emitted so
      // the normalized indicator keeps canonical positions ordered.
      round.bufferedRinshanDraw = { tagIndex, seat, code };
      round.chankanCandidate = null;
      return;
    }
    this.emitDraw(round, tagIndex, seat, code, "live_wall");
  }

  private emitDraw(
    round: RoundState,
    tagIndex: number,
    seat: number,
    code: number,
    from: "live_wall" | "rinshan",
  ): void {
    const tile = tenhouTileCode(code, this.redFivesEnabled);
    const isSelf = seat === this.selfActor;
    const event = this.push(round.roundOrdinal, tagIndex, 0, {
      type: "tile_drawn",
      actor: seat,
      tile: isSelf ? { visibility: "visible", tile } : { visibility: "hidden" },
      from,
    });
    round.lastDrawCode[seat] = code;
    round.lastDrawEventId[seat] = event.eventId;
    if (isSelf) {
      const key = concealedKey(tile);
      round.selfConcealed.set(key, (round.selfConcealed.get(key) ?? 0) + 1);
    }
  }

  private flushBufferedDraw(round: RoundState): void {
    const buffered = round.bufferedRinshanDraw;
    if (buffered === null) return;
    round.bufferedRinshanDraw = null;
    this.emitDraw(round, buffered.tagIndex, buffered.seat, buffered.code, "rinshan");
  }

  private consumeDiscard(
    tag: string,
    tagIndex: number,
    seat: number,
    round: RoundState,
  ): void {
    const code = Number(tag.slice(1));
    const tile = tenhouTileCode(code, this.redFivesEnabled);
    if (seat === this.selfActor) {
      this.takeFromConcealed(round, tile);
    }
    const tsumogiri = round.lastDrawCode[seat] === code;
    const riichiRef = round.pendingRiichiRef[seat];
    const event = this.push(round.roundOrdinal, tagIndex, 0, {
      type: "tile_discarded",
      actor: seat,
      tile,
      discardMode: tsumogiri ? "tsumogiri" : "tedashi",
      riichiDeclarationEventRef: riichiRef,
    });
    round.lastDrawCode[seat] = null;
    round.lastDiscardEventId[seat] = event.eventId;
    round.chankanCandidate = null;
    if (riichiRef !== null && riichiRef !== undefined) {
      round.lastRiichiDiscard = { seat, ref: riichiRef };
    }
  }

  private consumeRiichi(token: MjlogTokenView, tagIndex: number, round: RoundState): void {
    const who = Number(token.attrs.who);
    const step = token.attrs.step;
    if (!Number.isInteger(who) || who < 0 || who > 3) {
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }
    if (step === "1") {
      if (round.pendingRiichiRef[who] !== null || round.riichiAcceptedBySeat[who]) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      const event = this.push(round.roundOrdinal, tagIndex, 0, {
        type: "riichi_declared",
        actor: who,
      });
      round.pendingRiichiRef[who] = event.eventId;
      return;
    }
    if (step === "2") {
      const ref = round.pendingRiichiRef[who];
      if (
        ref === undefined ||
        ref === null ||
        round.lastRiichiDiscard === null ||
        round.lastRiichiDiscard.seat !== who ||
        round.lastRiichiDiscard.ref !== ref
      ) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      this.push(round.roundOrdinal, tagIndex, 0, {
        type: "riichi_accepted",
        actor: who,
        declarationEventRef: ref,
      });
      round.pendingRiichiRef[who] = null;
      round.riichiAcceptedBySeat[who] = true;
      round.lastRiichiDiscard = null;
      return;
    }
    throw new TenhouSourceError("tenhou_mapper_invalid_event");
  }

  private consumeDora(token: MjlogTokenView, round: RoundState): void {
    if (round.pendingKan === null) {
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }
    if (token.attrs.hai === undefined) {
      throw new TenhouSourceError("tenhou_record_invalid_xml");
    }
    const indicator = tenhouTileCode(
      parseCsvInts(token.attrs.hai, 1, "tenhou_mapper_invalid_event")[0]!,
      this.redFivesEnabled,
    );
    // Normalized indicator slot: directly after its kan, before the rinshan
    // draw (see module doc). Shares the kan's source position and ref.
    this.push(round.roundOrdinal, round.pendingKan.kanTagIndex, 1, {
      type: "dora_revealed",
      indicator,
      kanEventRef: round.pendingKan.kanEventId,
    });
    round.pendingKan = null;
    this.flushBufferedDraw(round);
  }

  private consumeMeld(token: MjlogTokenView, tagIndex: number, round: RoundState): void {
    const who = Number(token.attrs.who);
    if (!Number.isInteger(who) || who < 0 || who > 3 || token.attrs.m === undefined) {
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }
    const m = parseCsvInts(token.attrs.m, 1, "tenhou_mapper_invalid_event")[0]!;
    const meld = decodeTenhouMeld(m, this.redFivesEnabled);

    if (meld.flavor === "ankan") {
      const tiles = sortTilesCanonical([...meld.tiles]);
      if (who === this.selfActor) {
        for (const tile of tiles) this.takeFromConcealed(round, tile);
      }
      const event = this.push(round.roundOrdinal, tagIndex, 0, {
        type: "ankan_declared",
        actor: who,
        tiles: [tiles[0]!, tiles[1]!, tiles[2]!, tiles[3]!],
      });
      round.rinshanDueSeat = who;
      round.pendingKan = { kanEventId: event.eventId, kanTagIndex: tagIndex };
      round.lastDrawCode[who] = null;
      return;
    }

    if (meld.flavor === "kakan") {
      const key = `${who}:${meld.addedTile.id}`;
      const pon = round.activePonByKey.get(key);
      if (pon === undefined) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      const ponSorted = sortTilesCanonical([...pon.tiles]);
      const decodeSorted = sortTilesCanonical([...meld.ponTiles]);
      if (ponSorted.some((tile, i) => !sameTile(tile, decodeSorted[i]!))) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      if (who === this.selfActor) {
        this.takeFromConcealed(round, meld.addedTile);
      }
      const event = this.push(round.roundOrdinal, tagIndex, 0, {
        type: "kakan_declared",
        actor: who,
        addedTile: meld.addedTile,
        upgradedPonEventRef: pon.eventId,
      });
      round.activePonByKey.delete(key);
      round.rinshanDueSeat = who;
      round.pendingKan = { kanEventId: event.eventId, kanTagIndex: tagIndex };
      round.chankanCandidate = {
        eventId: event.eventId,
        actor: who,
        tile: meld.addedTile,
      };
      round.lastDrawCode[who] = null;
      return;
    }

    // chi / pon / daiminkan: bind to the unconsumed matching discard.
    const targetActor = (who + meld.relativeSeat) % 4;
    const candidate = this.findUnconsumedDiscard(round, targetActor, meld);
    const calledTile = candidate.tile;
    const consumed = sortTilesCanonical(removeOneMatching([...meld.tiles], calledTile));
    if (who === this.selfActor) {
      for (const tile of consumed) this.takeFromConcealed(round, tile);
    }
    round.consumedDiscardIds.add(candidate.eventId);
    let event: CanonicalGameEvent;
    if (meld.flavor === "chi") {
      if (consumed.length !== 2) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      event = this.push(round.roundOrdinal, tagIndex, 0, {
        type: "chi_called",
        actor: who,
        targetActor,
        calledTile,
        consumedTiles: [consumed[0]!, consumed[1]!],
        calledDiscardEventRef: candidate.eventId,
      });
    } else if (meld.flavor === "pon") {
      if (consumed.length !== 2) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      event = this.push(round.roundOrdinal, tagIndex, 0, {
        type: "pon_called",
        actor: who,
        targetActor,
        calledTile,
        consumedTiles: [consumed[0]!, consumed[1]!],
        calledDiscardEventRef: candidate.eventId,
      });
      round.activePonByKey.set(`${who}:${calledTile.id}`, {
        eventId: event.eventId,
        tiles: [calledTile, ...consumed],
      });
    } else {
      if (consumed.length !== 3) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      event = this.push(round.roundOrdinal, tagIndex, 0, {
        type: "daiminkan_called",
        actor: who,
        targetActor,
        calledTile,
        consumedTiles: [consumed[0]!, consumed[1]!, consumed[2]!],
        calledDiscardEventRef: candidate.eventId,
      });
      round.rinshanDueSeat = who;
      round.pendingKan = { kanEventId: event.eventId, kanTagIndex: tagIndex };
    }
    round.lastDrawCode[who] = null;
    round.chankanCandidate = null;
  }

  private findUnconsumedDiscard(
    round: RoundState,
    targetActor: number,
    meld: TenhouMeld,
  ): { eventId: string; tile: Tile } {
    const tiles: readonly Tile[] = meld.flavor === "kakan" || meld.flavor === "ankan"
      ? []
      : meld.tiles;
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index]!;
      if (event.type !== "tile_discarded") continue;
      if (event.actor !== targetActor) continue;
      if (round.consumedDiscardIds.has(event.eventId)) continue;
      if (!tiles.some((tile) => sameTile(tile, event.tile))) continue;
      return { eventId: event.eventId, tile: event.tile };
    }
    throw new TenhouSourceError("tenhou_mapper_invalid_event");
  }

  private consumeAgari(token: MjlogTokenView, tagIndex: number, round: RoundState): void {
    const attrs = token.attrs;
    const who = Number(attrs.who);
    const fromWho = Number(attrs.fromWho);
    if (
      !Number.isInteger(who) || who < 0 || who > 3 ||
      !Number.isInteger(fromWho) || fromWho < 0 || fromWho > 3
    ) {
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }
    const sc = parseCsvInts(attrs.sc ?? "", 8, "tenhou_mapper_invalid_event");
    const machi = tenhouTileCode(
      parseCsvInts(attrs.machi ?? "", 1, "tenhou_mapper_invalid_event")[0]!,
      this.redFivesEnabled,
    );
    const tsumo = who === fromWho;
    let winSourceEventRef: string;
    if (tsumo) {
      const ref = round.lastDrawEventId[who];
      if (ref === undefined || ref === null) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      winSourceEventRef = ref;
    } else if (
      round.chankanCandidate !== null &&
      round.chankanCandidate.actor === fromWho &&
      sameTile(round.chankanCandidate.tile, machi)
    ) {
      winSourceEventRef = round.chankanCandidate.eventId;
    } else {
      const ref = round.lastDiscardEventId[fromWho];
      if (ref === undefined || ref === null) {
        throw new TenhouSourceError("tenhou_mapper_invalid_event");
      }
      winSourceEventRef = ref;
    }
    const finalScores = finalScoresFromSc(sc);
    // Net seat delta vs the running settlement (= round start, then prior
    // wins' finals). This folds riichi deposits out of the winner's payment
    // delta so the canonical identity roundStart + Σdeltas == final holds.
    // See RoundState.runningSettled.
    const scoreDeltas = [
      finalScores[0] - round.runningSettled[0],
      finalScores[1] - round.runningSettled[1],
      finalScores[2] - round.runningSettled[2],
      finalScores[3] - round.runningSettled[3],
    ] as [number, number, number, number];
    round.runningSettled = finalScores;
    const event = this.push(round.roundOrdinal, tagIndex, 0, {
      type: "win_declared",
      winnerActor: who,
      targetActor: tsumo ? null : fromWho,
      method: tsumo ? "tsumo" : "ron",
      winningTile: machi,
      winSourceEventRef,
      scoreDeltas,
    });
    // For a double ron the LAST win carries the final pre-owari scores (its
    // even indices already include the first payment), but the canonical
    // settlement binding stays with the FIRST terminal event.
    const existing = round.terminal;
    round.terminal = {
      bindingEventId: existing === null ? event.eventId : existing.bindingEventId,
      settlementTagIndex: tagIndex,
      finalScores,
      owari: parseOwari(attrs.owari),
    };
  }

  private consumeRyuukyoku(
    token: MjlogTokenView,
    tagIndex: number,
    round: RoundState,
  ): void {
    const attrs = token.attrs;
    const sc = parseCsvInts(attrs.sc ?? "", 8, "tenhou_mapper_invalid_event");
    const type = attrs.type ?? "exhaustive";
    const reason =
      type === "exhaustive" ? "exhaustive" :
      type === "yao9" ? "kyuushu_kyuuhai" :
      type === "kaze4" ? "suufon_renda" :
      type === "reach4" ? "suucha_riichi" :
      type === "ron3" ? "sancha_hou" :
      type === "kan4" ? "suukaikan" :
      type === "nm" ? "nagashi_mangan" :
      null;
    if (reason === null) {
      throw new TenhouSourceError("tenhou_record_unsupported_event");
    }
    if (reason === "exhaustive" && round.totalDraws !== 70) {
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }
    if (reason !== "exhaustive" && round.totalDraws >= 70) {
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }
    // haiN reveals hands at the abort/exhaust moment: tenpai seats for an
    // exhaustive draw; for kyuushu the declarer's aborted hand (the declarer
    // is the only seat whose draw turn the abort interrupts).
    const tenpaiActors: number[] = [];
    for (let seat = 0; seat < 4; seat += 1) {
      if (attrs[`hai${seat}`] !== undefined) tenpaiActors.push(seat);
    }
    const event = this.push(round.roundOrdinal, tagIndex, 0, {
      type: "round_drawn",
      reason,
      tenpaiActors,
    });
    round.terminal = {
      bindingEventId: event.eventId,
      settlementTagIndex: tagIndex,
      finalScores: finalScoresFromSc(sc),
      owari: parseOwari(attrs.owari),
    };
  }

  private takeFromConcealed(round: RoundState, tile: Tile): void {
    const key = concealedKey(tile);
    const count = round.selfConcealed.get(key) ?? 0;
    if (count <= 0) {
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }
    round.selfConcealed.set(key, count - 1);
  }
}

function removeOneMatching(tiles: Tile[], target: Tile): Tile[] {
  const index = tiles.findIndex((tile) => sameTile(tile, target));
  if (index < 0) {
    throw new TenhouSourceError("tenhou_mapper_invalid_event");
  }
  return [...tiles.slice(0, index), ...tiles.slice(index + 1)];
}

function finalScoresFromSc(sc: readonly number[]): [number, number, number, number] {
  return [
    (sc[0]! + sc[1]!) * 100,
    (sc[2]! + sc[3]!) * 100,
    (sc[4]! + sc[5]!) * 100,
    (sc[6]! + sc[7]!) * 100,
  ];
}

function parseOwari(
  source: string | undefined,
): [number, number, number, number] | null {
  if (source === undefined) return null;
  const pieces = source.split(",").map((piece) => Number(piece));
  if (pieces.length !== 8 || pieces.some((value) => !Number.isFinite(value))) {
    throw new TenhouSourceError("tenhou_mapper_invalid_event");
  }
  const scores: number[] = [];
  for (let seat = 0; seat < 4; seat += 1) {
    const value = pieces[2 * seat]!;
    if (!Number.isInteger(value)) {
      throw new TenhouSourceError("tenhou_mapper_invalid_event");
    }
    scores.push(value * 100);
  }
  return [scores[0]!, scores[1]!, scores[2]!, scores[3]!];
}

function isFullPlayerList(attrs: Readonly<Record<string, string>>): boolean {
  return (
    attrs.n0 !== undefined && attrs.n1 !== undefined &&
    attrs.n2 !== undefined && attrs.n3 !== undefined
  );
}
