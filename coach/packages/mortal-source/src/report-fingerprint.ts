import { createHash } from "node:crypto";
import {
  CanonicalEventStreamSchema,
  type CanonicalEventStream,
  type Tile,
} from "@riichi-coach/contracts";
import { parseMjaiTile } from "./mjai-tile.js";

// Both the Mortal report (its mjai_log) and the product's canonical event
// stream expose the same PUBLIC game skeleton: the ordered sequence of
// rounds, each with wind/dealer/honba/scores/dora-marker. This fingerprint
// binds a downloaded report to an already-ingested record without exposing
// any hidden hand, private draw, split log, or nickname.

export const MORTAL_GAME_FINGERPRINT_VERSION = "mortal-game-fingerprint/v1" as const;

export type PublicRoundFingerprint = {
  readonly wind: "E" | "S" | "W";
  readonly dealer: number;
  readonly honba: number;
  readonly scores: readonly [number, number, number, number];
  readonly dora: { readonly id: string; readonly red: boolean };
};

function normalizeWind(value: unknown): "E" | "S" | "W" {
  if (value !== "E" && value !== "S" && value !== "W") {
    throw new Error("mjai_round_wind_invalid");
  }
  return value;
}

function normalizeDealer(value: unknown): number {
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < 0
    || value > 3
  ) {
    throw new Error("mjai_dealer_invalid");
  }
  return value;
}

function normalizeHonba(value: unknown): number {
  if (
    typeof value !== "number"
    || !Number.isInteger(value)
    || value < 0
  ) {
    throw new Error("mjai_honba_invalid");
  }
  return value;
}

function normalizeScores(value: unknown): [number, number, number, number] {
  if (
    !Array.isArray(value)
    || value.length !== 4
    || value.some((score) =>
      typeof score !== "number" || !Number.isInteger(score)
    )
  ) {
    throw new Error("mjai_scores_invalid");
  }
  return [value[0]!, value[1]!, value[2]!, value[3]!];
}

function tileFingerprint(tile: Tile): { id: string; red: boolean } {
  return { id: tile.id, red: tile.red };
}

function publicRoundKey(round: PublicRoundFingerprint): unknown[] {
  return [
    round.wind,
    round.dealer,
    round.honba,
    [...round.scores],
    round.dora.id,
    round.dora.red,
  ];
}

export function computeMortalGameFingerprint(rawMjaiLog: unknown): string {
  if (!Array.isArray(rawMjaiLog)) {
    throw new Error("mjai_log_invalid");
  }
  const rounds: PublicRoundFingerprint[] = [];
  for (const rawEvent of rawMjaiLog) {
    if (rawEvent === null || typeof rawEvent !== "object" || Array.isArray(rawEvent)) {
      continue;
    }
    const event = rawEvent as Record<string, unknown>;
    if (event.type !== "start_kyoku") continue;
    rounds.push({
      wind: normalizeWind(event.bakaze),
      dealer: normalizeDealer(event.oya),
      honba: normalizeHonba(event.honba),
      scores: normalizeScores(event.scores),
      dora: tileFingerprint(parseMjaiTile(event.dora_marker)),
    });
  }
  if (rounds.length === 0) {
    throw new Error("mjai_log_has_no_rounds");
  }
  const digest = createHash("sha256")
    .update(JSON.stringify(rounds.map(publicRoundKey)))
    .digest("hex");
  return `${MORTAL_GAME_FINGERPRINT_VERSION}:sha256:${digest}`;
}

export function computeCanonicalGameFingerprint(
  rawStream: CanonicalEventStream,
): string {
  const stream = CanonicalEventStreamSchema.parse(rawStream);
  const rounds = stream.events.flatMap((event): PublicRoundFingerprint[] => {
    if (event.type !== "round_started") return [];
    return [{
      wind: event.roundWind,
      dealer: event.dealer,
      honba: event.honba,
      scores: event.scores,
      dora: tileFingerprint(event.doraIndicator),
    }];
  });
  if (rounds.length === 0) {
    throw new Error("canonical_stream_has_no_rounds");
  }
  const digest = createHash("sha256")
    .update(JSON.stringify(rounds.map(publicRoundKey)))
    .digest("hex");
  return `${MORTAL_GAME_FINGERPRINT_VERSION}:sha256:${digest}`;
}
