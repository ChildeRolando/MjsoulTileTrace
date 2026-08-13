import { TileIdSchema, type Tile } from "@riichi-coach/contracts";
import { MahjongSoulSourceError } from "./errors.js";

const MAPPING_ERROR = "mahjong_soul_canonical_mapping_failed" as const;

const RED_FIVES = new Map<string, Tile>([
  ["0m", { id: "5m", red: true }],
  ["0p", { id: "5p", red: true }],
  ["0s", { id: "5s", red: true }],
]);

function failed(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(MAPPING_ERROR);
}

export function parseMajsoulTile(value: unknown): Tile {
  if (typeof value !== "string") throw failed();
  const red = RED_FIVES.get(value);
  if (red !== undefined) return { ...red };
  const id = TileIdSchema.safeParse(value);
  if (!id.success) throw failed();
  return { id: id.data, red: false };
}

// Majsoul `chang` encodes the round wind as 0=E, 1=S, 2=W.
export function parseMajsoulRoundWind(value: unknown): "E" | "S" | "W" {
  if (value === 0) return "E";
  if (value === 1) return "S";
  if (value === 2) return "W";
  throw failed();
}
