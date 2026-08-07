import { createHash } from "node:crypto";
import type { Tile, TileId } from "@riichi-coach/contracts";

const suitOffsets = { m: 0, p: 9, s: 18, z: 27 } as const;

export function tileIdTo34(tileId: TileId): number {
  const rank = Number(tileId[0]);
  const suit = tileId[1] as keyof typeof suitOffsets;
  return suitOffsets[suit] + rank - 1;
}

export function tilesTo34Counts(tiles: readonly Tile[]): number[] {
  const counts = Array<number>(34).fill(0);
  for (const tile of tiles) {
    const index = tileIdTo34(tile.id);
    counts[index] = counts[index]! + 1;
    if (counts[index]! > 4) {
      throw new Error(`more than four copies of ${tile.id}`);
    }
  }
  return counts;
}

export function redFiveCounts(tiles: readonly Tile[]): [number, number, number] {
  const counts: [number, number, number] = [0, 0, 0];
  for (const tile of tiles) {
    if (!tile.red) continue;
    const suit = tile.id[1];
    const index = suit === "m" ? 0 : suit === "p" ? 1 : 2;
    counts[index]++;
    if (counts[index] > 1) {
      throw new Error(`more than one red five in suit ${suit}`);
    }
  }
  return counts;
}

export function doraFromIndicator(indicator: Tile): number {
  const indicator34 = tileIdTo34(indicator.id);
  if (indicator34 < 27) {
    const suitStart = Math.floor(indicator34 / 9) * 9;
    return suitStart + ((indicator34 - suitStart + 1) % 9);
  }
  if (indicator34 <= 30) {
    return 27 + ((indicator34 - 27 + 1) % 4);
  }
  return 31 + ((indicator34 - 31 + 1) % 3);
}

function stableJSON(value: unknown): string {
  if (value === null || typeof value === "string" ||
    typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("projected state cannot contain non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJSON).join(",")}]`;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const entries = Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJSON(object[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error(`projected state contains unsupported ${typeof value}`);
}

export function stableProjectedStateHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJSON(value)).digest("hex")}`;
}
