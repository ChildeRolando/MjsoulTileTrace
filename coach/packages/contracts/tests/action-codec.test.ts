import { describe, expect, it } from "vitest";
import {
  canonicalActionRef,
  canonicalActionTuple,
  type RiichiAction,
} from "../src/index.js";

const normalFive = { id: "5p" as const, red: false };
const redFive = { id: "5p" as const, red: true };

describe("canonical action codec", () => {
  it("is stable across object field insertion order", () => {
    const first: RiichiAction = {
      kind: "discard",
      tile: normalFive,
      discardMode: "tedashi",
    };
    const second = {
      discardMode: "tedashi",
      tile: { red: false, id: "5p" },
      kind: "discard",
    } as unknown as RiichiAction;

    expect(canonicalActionTuple(first)).toEqual([
      "discard",
      ["5p", false],
      "tedashi",
    ]);
    expect(canonicalActionRef(first)).toBe(canonicalActionRef(second));
    expect(canonicalActionRef(first)).toMatch(/^action:v1:/);
  });

  it("changes for every consequence-bearing discard identity field", () => {
    const refs = [
      canonicalActionRef({
        kind: "discard",
        tile: normalFive,
        discardMode: "tedashi",
      }),
      canonicalActionRef({
        kind: "discard",
        tile: redFive,
        discardMode: "tedashi",
      }),
      canonicalActionRef({
        kind: "discard",
        tile: normalFive,
        discardMode: "tsumogiri",
      }),
      canonicalActionRef({
        kind: "riichi_discard",
        tile: normalFive,
        discardMode: "tedashi",
      }),
    ];

    expect(new Set(refs).size).toBe(4);
  });

  it("preserves call composition, red choice, event, actor, and meld references", () => {
    const base: RiichiAction = {
      kind: "pon" as const,
      calledTile: normalFive,
      consumedTiles: [normalFive, redFive],
      targetActor: 1,
      responseEventRef: "event:discard",
    };
    expect(canonicalActionRef(base)).not.toBe(canonicalActionRef({
      ...base,
      consumedTiles: [normalFive, normalFive],
    }));
    expect(canonicalActionRef(base)).not.toBe(canonicalActionRef({
      ...base,
      targetActor: 2,
    }));
    expect(canonicalActionRef(base)).not.toBe(canonicalActionRef({
      ...base,
      responseEventRef: "event:other",
    }));
    expect(canonicalActionRef({
      kind: "chi",
      calledTile: { id: "4p", red: false },
      consumedTiles: [
        { id: "3p", red: false },
        normalFive,
      ],
      targetActor: 1,
      responseEventRef: "event:discard",
    })).not.toBe(canonicalActionRef({
      kind: "chi",
      calledTile: { id: "4p", red: false },
      consumedTiles: [
        { id: "3p", red: false },
        redFive,
      ],
      targetActor: 1,
      responseEventRef: "event:discard",
    }));
    expect(canonicalActionRef({
      kind: "kakan",
      addedTile: redFive,
      existingMeldRef: "meld:a",
    })).not.toBe(canonicalActionRef({
      kind: "kakan",
      addedTile: redFive,
      existingMeldRef: "meld:b",
    }));
  });

  it("encodes the tile-less declare_riichi candidate as its bare kind", () => {
    expect(canonicalActionTuple({ kind: "declare_riichi" })).toEqual([
      "declare_riichi",
    ]);
    const ref = canonicalActionRef({ kind: "declare_riichi" });
    expect(ref).toMatch(/^action:v1:/);
    // The tile-less candidate ref must never collide with any concrete
    // riichi_discard realization.
    expect(ref).not.toBe(canonicalActionRef({
      kind: "riichi_discard",
      tile: normalFive,
      discardMode: "tedashi",
    }));
    expect(ref).not.toBe(canonicalActionRef({
      kind: "riichi_discard",
      tile: redFive,
      discardMode: "tsumogiri",
    }));
  });
});
