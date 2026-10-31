import { describe, expect, it } from "vitest";
import { QuestionLabConfigSchema } from "@riichi-coach/contracts";
import { resolveScene, createBoard } from "../src/construct.js";
import {
  canonicalFromConstruction,
  pendingDecision,
  pendingDecisionCacheStats,
} from "../src/projection.js";
import { digest } from "../src/config.js";

describe("synthetic physical construction and visible projection", () => {
  it("allocates exactly 136 tiles and reproduces from the seed", () => {
    const config = QuestionLabConfigSchema.parse({
      schemaVersion: "question-lab-config/v1",
      seed: 2,
    });
    const scene = resolveScene(config.scene, 42),
      board = createBoard(scene, 100);
    expect(createBoard(scene, 100)).toEqual(board);
    const tiles = [
      ...board.haipai.flat(),
      ...board.yama,
      ...board.rinshan,
      ...board.dora_indicators,
      ...board.ura_indicators,
    ];
    expect(tiles).toHaveLength(136);
    expect(tiles.filter((t) => t.endsWith("r"))).toHaveLength(3);
  });
  it("changing other players' concealed data leaves the complete visible stream unchanged", () => {
    const config = QuestionLabConfigSchema.parse({
      schemaVersion: "question-lab-config/v1",
      seed: 1,
      scene: {
        selfActor: { fixed: 0 },
        round: { fixed: 0 },
        turn: { fixed: 1 },
      },
    });
    const scene = resolveScene(config.scene, 1),
      b = createBoard(scene, 2);
    const events = [
      {
        type: "start_kyoku",
        bakaze: "E" as const,
        kyoku: 1,
        honba: 0,
        kyotaku: 0,
        oya: 0,
        scores: b.scores,
        dora_marker: b.dora_indicators[0]!,
        tehais: b.haipai,
      },
      { type: "tsumo", actor: 0, pai: b.yama[0]! },
    ];
    const a = canonicalFromConstruction(events, 0),
      changed = structuredClone(events);
    changed[0]!.tehais![1] = [...b.haipai[2]!];
    const c = canonicalFromConstruction(changed, 0);
    expect(digest(a)).toBe(digest(c));
    expect(pendingDecision(a).actualAction).toBeNull();
    const before = pendingDecisionCacheStats(), first = pendingDecision(a);
    expect(pendingDecision(a)).toBe(first);
    expect(pendingDecisionCacheStats().hits).toBeGreaterThan(before.hits);
    expect(() => first.facts.concealedTiles.push(first.facts.concealedTiles[0]!)).toThrow();
    const round = a.events.find(e => e.type === "round_started")!;
    if (round.type !== "round_started") throw new Error("fixture_round_missing");
    round.scores![0] = 26000; round.scores![1] = 24000;
    const updated = pendingDecision(a);
    expect(updated).not.toBe(first);
    expect(updated.facts.scores).toMatchObject({ status: "known", byActor: [26000, 24000, 25000, 25000] });
  });
});
