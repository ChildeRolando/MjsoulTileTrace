import {
  TileSchema,
  sortTilesCanonical,
  type Tile,
} from "@riichi-coach/contracts";

const HONORS: Record<string, Tile["id"]> = {
  E: "1z",
  S: "2z",
  W: "3z",
  N: "4z",
  P: "5z",
  F: "6z",
  C: "7z",
};

export function parseMjaiTile(value: unknown): Tile {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("mjai_tile_invalid");
  }
  const red = value.endsWith("r");
  const base = red ? value.slice(0, -1) : value;
  return TileSchema.parse({
    id: HONORS[base] ?? base,
    red,
  });
}

export function formatMjaiTile(tile: Tile): string {
  const parsed = TileSchema.parse(tile);
  const base = Object.entries(HONORS).find(([, id]) => id === parsed.id)?.[0]
    ?? parsed.id;
  return parsed.red ? `${base}r` : base;
}

export function sortMjaiTiles(values: readonly string[]): string[] {
  return sortTilesCanonical(values.map(parseMjaiTile)).map(formatMjaiTile);
}
