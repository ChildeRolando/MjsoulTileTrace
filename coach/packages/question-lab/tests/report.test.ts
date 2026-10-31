import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { tileArtDefinitions, tileArtName, tileArtNames } from "../src/tile-art.js";
import { tileImage } from "../src/report.js";

describe("Coach / Arena shared offline artwork", () => {
  it("maps all 37 MJAI tiles to the canonical artwork, including honors and red fives", () => {
    const mjai = [
      ...["m", "p", "s"].flatMap(s => Array.from({ length: 9 }, (_, i) => `${i + 1}${s}`)),
      "E", "S", "W", "N", "P", "F", "C", "5mr", "5pr", "5sr",
    ];
    expect(mjai.map(tileArtName).sort()).toEqual([...tileArtNames].sort());
    expect(tileArtName("P")).toBe("5z");
    expect(tileArtName("C")).toBe("7z");
    expect(() => tileArtName("0p")).toThrow("invalid_report_tile");
    expect(tileImage("1s")).toContain('href="#tile-art-1s"');
    expect(tileImage("5pr")).toContain('aria-label="5筒赤"');
  });
  it("embeds the exact shared SVG bytes once per tile in isolated image documents", async () => {
    const art = await tileArtDefinitions();
    const matches = [...art.html.matchAll(/<image id="tile-art-([^"]+)"[^>]*href="data:image\/svg\+xml;base64,([^"]+)"/g)];
    expect(matches).toHaveLength(37);
    for (const match of matches) {
      const shared = await readFile(new URL(`../../desktop/src/renderer/tiles/${match[1]}.svg`, import.meta.url), "utf8");
      expect(Buffer.from(match[2]!, "base64").toString("utf8")).toBe(shared);
    }
    expect(art.html).not.toMatch(/href="https?:/);
    expect(art.license).toContain("M+");
    expect(art.identity.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
