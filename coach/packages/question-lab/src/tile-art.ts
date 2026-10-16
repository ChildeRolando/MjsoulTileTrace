import { readFile } from "node:fs/promises";
import { digest } from "./config.js";

const honors: Record<string, string> = {
  E: "1z", S: "2z", W: "3z", N: "4z", P: "5z", F: "6z", C: "7z",
};
export const tileArtNames = [
  ...["m", "p", "s"].flatMap((suit) =>
    Array.from({ length: 10 }, (_, rank) => `${rank}${suit}`)),
  ...Array.from({ length: 7 }, (_, rank) => `${rank + 1}z`),
];
export function tileArtName(tile: string): string {
  if (honors[tile]) return honors[tile]!;
  if (/^[1-9][mps]$/.test(tile)) return tile;
  if (/^5[mps]r$/.test(tile)) return `0${tile[1]}`;
  throw new Error(`invalid_report_tile: ${tile}`);
}

// Read the exact artwork used by Coach and Arena. Each SVG stays in its own
// image document so clip/definition IDs in red fives cannot collide.
export async function tileArtDefinitions() {
  const root = new URL("../../desktop/src/renderer/tiles/", import.meta.url);
  const assets = await Promise.all(tileArtNames.map(async (name) => ({
    name, source: await readFile(new URL(`${name}.svg`, root), "utf8"),
  })));
  const license = await readFile(new URL("LICENSE.txt", root), "utf8");
  return {
    html: `<svg class="tile-definitions" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="0" height="0"><defs>${assets.map(({ name, source }) => `<image id="tile-art-${name}" width="272" height="360" href="data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}"/>`).join("")}</defs></svg>`,
    license,
    identity: { source: "Coach/Arena shared B artwork", sha256: digest({ assets, license }) },
  };
}
