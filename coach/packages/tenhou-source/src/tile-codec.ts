/**
 * Tenhou tile-code codec (0..135).
 *
 * code = 36 * suitIndex + 4 * (num - 1) + copy, suits m/p/s/z. Every code is
 * one physical tile (the four copies of a tile are four consecutive codes). A
 * five is red iff red fives are enabled, the suit is not honors, and the code
 * is the first copy of that five (code % 4 === 0, i.e. codes 16 / 52 / 88).
 * This matches the public kobalab convlog decoder exactly and was verified
 * against the pinned real corpus.
 */
import { TileIdSchema, type Tile } from "@riichi-coach/contracts";
import { TenhouSourceError } from "./errors.js";

const SUIT_CHARS = ["m", "p", "s", "z"] as const;

/** Build a canonical tile from validated num (1..9) and suit index (0..3). */
export function tileFromParts(
  num: number,
  suitIndex: number,
  red: boolean,
): Tile {
  const suitChar = SUIT_CHARS[suitIndex];
  if (suitChar === undefined) {
    throw new TenhouSourceError("tenhou_mapper_invalid_tile");
  }
  const id = TileIdSchema.safeParse(`${num}${suitChar}`);
  if (!id.success) {
    throw new TenhouSourceError("tenhou_mapper_invalid_tile");
  }
  return { id: id.data, red };
}

export function isRedCode(code: number, redFivesEnabled: boolean): boolean {
  if (!redFivesEnabled) return false;
  const suit = Math.floor(code / 36);
  const num = Math.floor((code % 36) / 4) + 1;
  return suit !== 3 && num === 5 && code % 4 === 0;
}

/** Decode a Tenhou tile code into a canonical tile (id + red). */
export function tenhouTileCode(code: number, redFivesEnabled: boolean): Tile {
  if (!Number.isInteger(code) || code < 0 || code > 135) {
    throw new TenhouSourceError("tenhou_mapper_invalid_tile");
  }
  const suit = Math.floor(code / 36);
  const num = Math.floor((code % 36) / 4) + 1;
  if (suit > 3 || (suit === 3 && num > 7)) {
    throw new TenhouSourceError("tenhou_mapper_invalid_tile");
  }
  return tileFromParts(num, suit, isRedCode(code, redFivesEnabled));
}

/** Parse a comma-separated code list ("11,23,45") into canonical tiles. */
export function tenhouTileList(
  source: string,
  redFivesEnabled: boolean,
): Tile[] {
  if (source.trim() === "") {
    throw new TenhouSourceError("tenhou_mapper_invalid_tile");
  }
  return source.split(",").map((piece) => {
    const code = Number(piece);
    if (!/^-?\d+$/.test(piece)) {
      throw new TenhouSourceError("tenhou_mapper_invalid_tile");
    }
    return tenhouTileCode(code, redFivesEnabled);
  });
}
