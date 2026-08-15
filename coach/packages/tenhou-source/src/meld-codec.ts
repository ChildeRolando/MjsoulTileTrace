/**
 * Tenhou meld m-attribute codec.
 *
 * The bit layout is the one implemented by the public kobalab convlog decoder
 * (lib/convlog.js, mianzi()). Every branch below was cross-validated against
 * the pinned real corpus, including the red-five positions of each flavor.
 *
 * Layout summary (see convlog for the original):
 *   d = ["", "+", "=", "-"][m & 0x3]      relative seat of the discarded tile
 *     ""  → ankan (concealed)
 *     "+" → (caller + 1) % 4, "=" → (caller + 2) % 4, "-" → (caller + 3) % 4
 *   chi      m & 0x0004: pt = (m & 0xFC00) >> 10; r = pt % 3 (called slot);
 *            run base n from pn; red iff bit pair for that slot is 0 and the
 *            tile is a five and red fives are enabled.
 *   pon/kakan m & 0x0018 (kakan iff m & 0x0010):
 *            pt = (m & 0xFE00) >> 9; r = pt % 3; red five positions encoded
 *            via (m & 0x0060) and r as documented below.
 *   daiminkan/ankan (else): pt = (m & 0xFF00) >> 8; r = pt % 4.
 */
import type { Tile } from "@riichi-coach/contracts";
import { TenhouSourceError } from "./errors.js";
import { tileFromParts } from "./tile-codec.js";

export type TenhouMeldFlavor = "chi" | "pon" | "daiminkan" | "ankan" | "kakan";

export type TenhouMeld =
  | {
      readonly flavor: "chi";
      /** Relative seat of the discard owner: 1/2/3 → caller+1/+2/+3 (mod 4). */
      readonly relativeSeat: number;
      /** Index (0..2) of the called tile inside the run. */
      readonly calledSlot: number;
      readonly tiles: readonly [Tile, Tile, Tile];
    }
  | {
      readonly flavor: "pon" | "daiminkan";
      readonly relativeSeat: number;
      readonly calledSlot: number;
      readonly tiles: readonly Tile[];
    }
  | {
      readonly flavor: "ankan";
      readonly tiles: readonly [Tile, Tile, Tile, Tile];
    }
  | {
      readonly flavor: "kakan";
      readonly ponTiles: readonly [Tile, Tile, Tile];
      readonly addedTile: Tile;
    };

function tile(num: number, suitIndex: number, red: boolean): Tile {
  return tileFromParts(num, suitIndex, red);
}

export function decodeTenhouMeld(m: number, redFivesEnabled: boolean): TenhouMeld {
  if (!Number.isInteger(m) || m < 0 || m > 0xffff) {
    throw new TenhouSourceError("tenhou_mapper_invalid_tile");
  }
  const d = m & 0x0003;
  const targetSeat = d === 0 ? null : d; // 1/2/3 → +1/+2/+3 relative

  if (m & 0x0004) {
    // Chi: three-tile run.
    const pt = (m & 0xfc00) >> 10;
    const r = pt % 3;
    const pn = Math.floor(pt / 3);
    const suitIndex = Math.floor(pn / 7);
    const n = (pn % 7) + 1;
    if (suitIndex > 2 || n < 1 || n + 2 > 9) {
      throw new TenhouSourceError("tenhou_mapper_invalid_tile");
    }
    const pp = [m & 0x0018, m & 0x0060, m & 0x0180];
    const tiles = [0, 1, 2].map((i) =>
      tile(n + i, suitIndex, redFivesEnabled && n + i === 5 && pp[i] === 0),
    ) as [Tile, Tile, Tile];
    return { flavor: "chi", relativeSeat: seatOf(targetSeat), calledSlot: r, tiles };
  }

  if (m & 0x0018) {
    // Pon or kakan (kakan iff bit 0x0010): four copies, pon shows three.
    // pt packs the run base ×3 + called slot: base = pt/3, then suit/number.
    const kakan = (m & 0x0010) !== 0;
    const pt = (m & 0xfe00) >> 9;
    const r = pt % 3;
    const pn = Math.floor(pt / 3);
    const suitIndex = Math.floor(pn / 9);
    const n = (pn % 9) + 1;
    if (suitIndex > 3 || (suitIndex === 3 && n > 7)) {
      throw new TenhouSourceError("tenhou_mapper_invalid_tile");
    }
    const redEnabled = redFivesEnabled && suitIndex !== 3 && n === 5;
    const triple: [Tile, Tile, Tile] = [tile(n, suitIndex, false), tile(n, suitIndex, false), tile(n, suitIndex, false)];
    let fourth = tile(n, suitIndex, false);
    if (redEnabled) {
      if ((m & 0x0060) === 0) {
        fourth = tile(n, suitIndex, true);
      } else if (r === 0) {
        triple[2] = tile(n, suitIndex, true);
      } else {
        triple[1] = tile(n, suitIndex, true);
      }
    }
    if (kakan) {
      return { flavor: "kakan", ponTiles: triple, addedTile: fourth };
    }
    return {
      flavor: "pon",
      relativeSeat: seatOf(targetSeat),
      calledSlot: r,
      tiles: triple,
    };
  }

  // Daiminkan or ankan: four copies. For ankan d === 0 (targetSeat null).
  const pt = (m & 0xff00) >> 8;
  const r = pt % 4;
  const pn = Math.floor(pt / 4);
  const suitIndex = Math.floor(pn / 9);
  const n = (pn % 9) + 1;
  if (suitIndex > 3 || (suitIndex === 3 && n > 7)) {
    throw new TenhouSourceError("tenhou_mapper_invalid_tile");
  }
  const redEnabled = redFivesEnabled && suitIndex !== 3 && n === 5;
  const quad: [Tile, Tile, Tile, Tile] = [
    tile(n, suitIndex, false),
    tile(n, suitIndex, false),
    tile(n, suitIndex, false),
    tile(n, suitIndex, false),
  ];
  if (redEnabled) {
    if (targetSeat === null) {
      // Ankan: the fourth tile is the red one.
      quad[3] = tile(n, suitIndex, true);
    } else if (r === 0) {
      quad[3] = tile(n, suitIndex, true);
    } else {
      quad[2] = tile(n, suitIndex, true);
    }
  }
  if (targetSeat === null) {
    return { flavor: "ankan", tiles: quad };
  }
  return { flavor: "daiminkan", relativeSeat: seatOf(targetSeat), calledSlot: r, tiles: quad };
}

function seatOf(relative: number | null): number {
  if (relative === null) {
    // chi/pon/daiminkan always call a discard; "" direction means ankan.
    throw new TenhouSourceError("tenhou_mapper_invalid_event");
  }
  return relative;
}

/** Flavor of an N tag's m value, for census/scan purposes. */
export function tenhouMeldFlavor(m: number): TenhouMeldFlavor {
  if (m & 0x0004) return "chi";
  if (m & 0x0018) return m & 0x0010 ? "kakan" : "pon";
  return m & 0x0003 ? "daiminkan" : "ankan";
}
