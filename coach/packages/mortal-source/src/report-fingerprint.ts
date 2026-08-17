import { createHash } from "node:crypto";
import {
  CanonicalEventStreamSchema,
  sortTilesCanonical,
  type CanonicalEventStream,
  type Tile,
} from "@riichi-coach/contracts";
import { parseMjaiTile } from "./mjai-tile.js";

// MortalGameFingerprint binds a downloaded Mortal report to an already-ingested
// canonical stream using ONLY the maximal deterministic PUBLIC event sequence
// that both sides can represent equivalently.
//
// Explicit supported subset (v3):
//   - game_start / round_start (wind, dealer, honba, riichi sticks, scores,
//     initial dora marker)
//   - every public discard (actor, tile, tsumogiri/tedashi)
//   - chi / pon / daiminkan calls (actor, target, called tile, consumed tiles)
//   - ankan (actor, four tiles) and kakan (actor, added tile)
//   - riichi declarations and acceptances (actor)
//   - win settlements (winner, target) — WITHOUT score deltas (see below)
//   - round_end / game_end markers
//
// Explicitly EXCLUDED because they are not equivalently representable on both
// sides, or because they are private:
//   - tsumo/tile_drawn events (opponent hidden draws; the self draw is already
//     bound by the entry anchor, not by game identity)
//   - Mortal `dora` reveals (the current canonical mapper does not emit
//     dora_revealed for the same kan; adding it on one side would break
//     equality)
//   - start_kyoku `tehais` (opponent concealed hands)
//   - nicknames, account IDs, split_logs, result URLs
//   - win `ura_markers` / `winningTile` / `winSourceEventRef` (no equivalent
//     in the other representation)
//   - win score deltas (v3): the canonical contract folds riichi deposits
//     into zero-sum round deltas (validator settlement identity
//     roundStart + Σdeltas == settled scores), while mjai hora deltas
//     attribute the pot to the winner per hule (non-zero-sum when sticks are
//     on the table). Identical games therefore produce different delta
//     arrays on the two sides — deltas are a representation artifact, not a
//     game-identity fact. Settlements stay bound indirectly: every round's
//     outcome is pinned by the NEXT round_start's scores, which both sides
//     expose identically.
//
// The fingerprint must change when any included public action changes. Events
// outside this subset are intentionally ignored by both sides.

export const MORTAL_GAME_FINGERPRINT_VERSION =
  "mortal-game-fingerprint/v3" as const;

export type PublicRoundFingerprint = {
  readonly wind: "E" | "S" | "W";
  readonly dealer: number;
  readonly honba: number;
  readonly riichiSticks: number;
  readonly scores: readonly [number, number, number, number];
  readonly dora: { readonly id: string; readonly red: boolean };
};

type FingerprintTile = { readonly id: string; readonly red: boolean };
type FingerprintScores = readonly [number, number, number, number];

type FingerprintEvent =
  | { readonly kind: "game_start" }
  | { readonly kind: "round_start"; readonly round: PublicRoundFingerprint }
  | {
      readonly kind: "discard";
      readonly actor: number;
      readonly tile: FingerprintTile;
      readonly tsumogiri: boolean;
    }
  | {
      readonly kind: "chi" | "pon" | "daiminkan";
      readonly actor: number;
      readonly target: number;
      readonly called: FingerprintTile;
      readonly consumed: readonly FingerprintTile[];
    }
  | {
      readonly kind: "ankan";
      readonly actor: number;
      readonly tiles: readonly FingerprintTile[];
    }
  | {
      readonly kind: "kakan";
      readonly actor: number;
      readonly addedTile: FingerprintTile;
    }
  | {
      readonly kind: "riichi_declared" | "riichi_accepted";
      readonly actor: number;
    }
  | {
      readonly kind: "win";
      readonly actor: number;
      readonly target: number;
    }
  | { readonly kind: "round_end" }
  | { readonly kind: "game_end" };

function normalizeWind(value: unknown): "E" | "S" | "W" {
  if (value !== "E" && value !== "S" && value !== "W") {
    throw new Error("mjai_round_wind_invalid");
  }
  return value;
}

function normalizeActor(value: unknown): number {
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < 0
    || value > 3
  ) {
    throw new Error("public_actor_invalid");
  }
  return value;
}

function normalizeHonba(value: unknown): number {
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < 0
  ) {
    throw new Error("public_honba_invalid");
  }
  return value;
}

function normalizeRiichiSticks(value: unknown): number {
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < 0
  ) {
    throw new Error("public_riichi_sticks_invalid");
  }
  return value;
}

function normalizeScores(value: unknown): FingerprintScores {
  if (
    !Array.isArray(value)
    || value.length !== 4
    || value.some((score) =>
      typeof score !== "number" || !Number.isInteger(score)
    )
  ) {
    throw new Error("public_scores_invalid");
  }
  return [value[0]!, value[1]!, value[2]!, value[3]!];
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error("public_boolean_invalid");
  }
  return value;
}

function tileFingerprint(tile: Tile): FingerprintTile {
  return { id: tile.id, red: tile.red };
}

function mjaiTileFingerprint(value: unknown): FingerprintTile {
  return tileFingerprint(parseMjaiTile(value));
}

function mjaiConsumedTiles(
  action: Record<string, unknown>,
  expectedLength: number,
): FingerprintTile[] {
  const raw = action.consumed;
  if (
    !Array.isArray(raw)
    || raw.length !== expectedLength
    || raw.some((value) => typeof value !== "string")
  ) {
    throw new Error("mjai_consumed_tiles_invalid");
  }
  return sortTilesCanonical(
    raw.map((value) => parseMjaiTile(value as string)),
  ).map(tileFingerprint);
}

function canonicalConsumedTiles(
  tiles: readonly Tile[],
): FingerprintTile[] {
  return sortTilesCanonical(tiles).map(tileFingerprint);
}

function eventKey(event: FingerprintEvent): unknown[] {
  switch (event.kind) {
    case "game_start":
      return ["game_start"];
    case "round_start":
      return [
        "round_start",
        event.round.wind,
        event.round.dealer,
        event.round.honba,
        event.round.riichiSticks,
        [...event.round.scores],
        event.round.dora.id,
        event.round.dora.red,
      ];
    case "discard":
      return [
        "discard",
        event.actor,
        event.tile.id,
        event.tile.red,
        event.tsumogiri,
      ];
    case "chi":
    case "pon":
    case "daiminkan":
      return [
        event.kind,
        event.actor,
        event.target,
        event.called.id,
        event.called.red,
        event.consumed.map((tile) => [tile.id, tile.red]),
      ];
    case "ankan":
      return [
        "ankan",
        event.actor,
        event.tiles.map((tile) => [tile.id, tile.red]),
      ];
    case "kakan":
      return ["kakan", event.actor, event.addedTile.id, event.addedTile.red];
    case "riichi_declared":
    case "riichi_accepted":
      return [event.kind, event.actor];
    case "win":
      return ["win", event.actor, event.target];
    case "round_end":
      return ["round_end"];
    case "game_end":
      return ["game_end"];
  }
}

function fingerprint(events: readonly FingerprintEvent[]): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(events.map(eventKey)))
    .digest("hex");
  return `${MORTAL_GAME_FINGERPRINT_VERSION}:sha256:${digest}`;
}

function mjaiEventToFingerprint(
  rawEvent: Record<string, unknown>,
): FingerprintEvent | null {
  const type = rawEvent.type;
  switch (type) {
    case "start_game":
      return { kind: "game_start" };
    case "start_kyoku":
      return {
        kind: "round_start",
        round: {
          wind: normalizeWind(rawEvent.bakaze),
          dealer: normalizeActor(rawEvent.oya),
          honba: normalizeHonba(rawEvent.honba),
          riichiSticks: normalizeRiichiSticks(rawEvent.kyotaku),
          scores: normalizeScores(rawEvent.scores),
          dora: mjaiTileFingerprint(rawEvent.dora_marker),
        },
      };
    case "dahai":
      return {
        kind: "discard",
        actor: normalizeActor(rawEvent.actor),
        tile: mjaiTileFingerprint(rawEvent.pai),
        tsumogiri: normalizeBoolean(rawEvent.tsumogiri),
      };
    case "chi":
    case "pon":
    case "daiminkan":
      return {
        kind: type,
        actor: normalizeActor(rawEvent.actor),
        target: normalizeActor(rawEvent.target),
        called: mjaiTileFingerprint(rawEvent.pai),
        consumed: mjaiConsumedTiles(rawEvent, type === "daiminkan" ? 3 : 2),
      };
    case "ankan":
      return {
        kind: "ankan",
        actor: normalizeActor(rawEvent.actor),
        tiles: mjaiConsumedTiles(rawEvent, 4),
      };
    case "kakan":
      return {
        kind: "kakan",
        actor: normalizeActor(rawEvent.actor),
        addedTile: mjaiTileFingerprint(rawEvent.pai),
      };
    case "reach":
      return { kind: "riichi_declared", actor: normalizeActor(rawEvent.actor) };
    case "reach_accepted":
      return { kind: "riichi_accepted", actor: normalizeActor(rawEvent.actor) };
    case "hora":
      // v3: deltas are deliberately not read — see the header note.
      return {
        kind: "win",
        actor: normalizeActor(rawEvent.actor),
        target: normalizeActor(rawEvent.target),
      };
    case "end_kyoku":
      return { kind: "round_end" };
    case "end_game":
      return { kind: "game_end" };
    default:
      // tsumo, dora, and any future unknown event types are outside the
      // explicitly documented supported subset; both sides ignore them alike.
      return null;
  }
}

export function computeMortalGameFingerprint(rawMjaiLog: unknown): string {
  if (!Array.isArray(rawMjaiLog)) {
    throw new Error("mjai_log_invalid");
  }
  const events: FingerprintEvent[] = [];
  for (const rawEvent of rawMjaiLog) {
    if (
      rawEvent === null
      || typeof rawEvent !== "object"
      || Array.isArray(rawEvent)
    ) {
      continue;
    }
    const mapped = mjaiEventToFingerprint(rawEvent as Record<string, unknown>);
    if (mapped !== null) events.push(mapped);
  }
  if (!events.some((event) => event.kind === "round_start")) {
    throw new Error("mjai_log_has_no_rounds");
  }
  return fingerprint(events);
}

function canonicalEventToFingerprint(
  event: CanonicalEventStream["events"][number],
): FingerprintEvent | null {
  switch (event.type) {
    case "game_started":
      return { kind: "game_start" };
    case "round_started":
      return {
        kind: "round_start",
        round: {
          wind: event.roundWind,
          dealer: event.dealer,
          honba: event.honba,
          riichiSticks: event.riichiSticks,
          scores: event.scores,
          dora: tileFingerprint(event.doraIndicator),
        },
      };
    case "tile_discarded":
      return {
        kind: "discard",
        actor: event.actor,
        tile: tileFingerprint(event.tile),
        tsumogiri: event.discardMode === "tsumogiri",
      };
    case "chi_called":
    case "pon_called":
    case "daiminkan_called":
      return {
        kind: event.type === "chi_called"
          ? "chi"
          : event.type === "pon_called"
            ? "pon"
            : "daiminkan",
        actor: event.actor,
        target: event.targetActor,
        called: tileFingerprint(event.calledTile),
        consumed: canonicalConsumedTiles(event.consumedTiles),
      };
    case "ankan_declared":
      return {
        kind: "ankan",
        actor: event.actor,
        tiles: canonicalConsumedTiles(event.tiles),
      };
    case "kakan_declared":
      return {
        kind: "kakan",
        actor: event.actor,
        addedTile: tileFingerprint(event.addedTile),
      };
    case "riichi_declared":
    case "riichi_accepted":
      return { kind: event.type, actor: event.actor };
    case "win_declared":
      // v3: scoreDeltas are deliberately not read — see the header note.
      return {
        kind: "win",
        actor: event.winnerActor,
        target: event.targetActor ?? event.winnerActor,
      };
    case "round_ended":
      return { kind: "round_end" };
    case "game_ended":
      return { kind: "game_end" };
    default:
      // tile_drawn, dora_revealed, scores_updated, and any future event
      // types are outside the documented supported subset.
      return null;
  }
}

export function computeCanonicalGameFingerprint(
  rawStream: CanonicalEventStream,
): string {
  const stream = CanonicalEventStreamSchema.parse(rawStream);
  const events = stream.events.flatMap((event): FingerprintEvent[] => {
    const mapped = canonicalEventToFingerprint(event);
    return mapped === null ? [] : [mapped];
  });
  if (!events.some((event) => event.kind === "round_start")) {
    throw new Error("canonical_stream_has_no_rounds");
  }
  return fingerprint(events);
}
