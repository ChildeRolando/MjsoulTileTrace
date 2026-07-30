import { describe, expect, it } from "vitest";
import type {
  ActionDraft,
  KnownActionFacts,
} from "@riichi-coach/contracts";
import {
  normalizeCandidate,
} from "../src/candidate/candidate-normalizer.js";

const fiveNormal = { id: "5p" as const, red: false };
const fiveRed = { id: "5p" as const, red: true };
const sixSou = { id: "6s" as const, red: false };

describe("CandidateNormalizer ambiguity", () => {
  it("asks only tile.red when both five instances remain possible", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "5p" },
        discardMode: "tedashi",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [fiveNormal, fiveRed],
        currentDraw: { tile: sixSou, eventRef: "event:draw" },
      },
    })).toEqual({
      status: "needs_clarification",
      ambiguousFields: ["tile.red"],
    });
  });

  it("asks only discardMode when both hand-cut and draw-cut remain possible", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "5p", red: false },
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [fiveNormal],
        currentDraw: { tile: fiveNormal, eventRef: "event:draw" },
      },
    })).toEqual({
      status: "needs_clarification",
      ambiguousFields: ["discardMode"],
    });
  });

  it("asks only consumedTiles when a call composition is absent", () => {
    expect(normalizeCandidate({
      draft: { kind: "chi" },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "discard_response",
          actor: 0,
          triggerEventRef: "event:discard",
          sourceActor: 1,
          offeredTile: { id: "2m", red: false },
        },
        concealedTiles: [
          { id: "1m", red: false },
          { id: "3m", red: false },
        ],
      },
    })).toEqual({
      status: "needs_clarification",
      ambiguousFields: ["consumedTiles"],
    });
  });

  it("uses a unique known tile instance to resolve red identity", () => {
    const result = normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "5p" },
        discardMode: "tedashi",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [fiveRed],
        currentDraw: { tile: sixSou, eventRef: "event:draw" },
      },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.candidate.action).toMatchObject({
        tile: fiveRed,
        discardMode: "tedashi",
      });
      expect(result.consistency).toBe("consistent");
    }
  });
});

describe("CandidateNormalizer direct-known-fact consistency", () => {
  it("reports direct conflicts before asking for irrelevant completion fields", () => {
    expect(normalizeCandidate({
      draft: { kind: "pass" },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
      },
    })).toEqual({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["action_not_allowed_in_window"],
      evidenceRefs: ["event:draw"],
    });

    expect(normalizeCandidate({
      draft: { kind: "tsumo" },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        currentDraw: null,
      },
    })).toEqual({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["tsumo_draw_mismatch"],
      evidenceRefs: [],
    });
  });

  it("reports provided response conflicts before completing a call", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "chi",
        calledTile: { id: "3m", red: false },
        targetActor: 2,
        responseEventRef: "event:other",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "discard_response",
          actor: 0,
          triggerEventRef: "event:discard",
          sourceActor: 1,
          offeredTile: { id: "2m", red: false },
        },
      },
    })).toEqual({
      status: "inconsistent_with_known_facts",
      conflictCodes: [
        "response_event_mismatch",
        "response_source_actor_mismatch",
        "response_tile_mismatch",
      ],
      evidenceRefs: ["event:discard"],
    });
  });

  it("returns unknown, not illegal, when concealed-hand facts are absent", () => {
    const result = normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tedashi",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: null,
          triggerEventRef: "user_asserted:draw",
        },
      },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.consistency).toBe("unknown_due_to_missing_facts");
      expect(result.skippedChecks).toEqual(["tedashi_concealed_tile"]);
    }
  });

  it("rejects a known missing hand tile and a wrong tsumogiri tile", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tedashi",
      },
      origin: "actual",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [],
        currentDraw: null,
      },
    })).toMatchObject({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["tedashi_tile_missing"],
    });

    expect(normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tsumogiri",
      },
      origin: "actual",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [sixSou],
        currentDraw: { tile: fiveRed, eventRef: "event:draw" },
      },
    })).toEqual({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["tsumogiri_draw_mismatch"],
      evidenceRefs: ["event:draw"],
    });
  });

  it("checks response event, source actor, and offered tile directly", () => {
    const result = normalizeCandidate({
      draft: {
        kind: "ron",
        winningTile: { id: "6s", red: false },
        targetActor: 2,
        responseEventRef: "event:other",
        winContext: "discard",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "discard_response",
          actor: 0,
          triggerEventRef: "event:discard",
          sourceActor: 1,
          offeredTile: fiveRed,
        },
      },
    });

    expect(result).toEqual({
      status: "inconsistent_with_known_facts",
      conflictCodes: [
        "response_event_mismatch",
        "response_source_actor_mismatch",
        "response_tile_mismatch",
      ],
      evidenceRefs: ["event:discard"],
    });
  });

  it("marks a missing response source actor as an unknown check", () => {
    const result = normalizeCandidate({
      draft: {
        kind: "ron",
        winningTile: { id: "6s", red: false },
        targetActor: 2,
        responseEventRef: "event:discard",
        winContext: "discard",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "discard_response",
          actor: 0,
          triggerEventRef: "event:discard",
          sourceActor: null,
          offeredTile: sixSou,
        },
      },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.consistency).toBe("unknown_due_to_missing_facts");
      expect(result.skippedChecks).toEqual(["response_source_actor"]);
    }
  });

  it("checks kakan meld existence, pon kind, and tile identity", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "kakan",
        addedTile: { id: "5p", red: true },
        existingMeldRef: "meld:chi",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        melds: [{
          meldRef: "meld:chi",
          kind: "chi",
          tiles: [
            { id: "3p", red: false },
            { id: "4p", red: false },
            { id: "5p", red: false },
          ],
        }],
      },
    })).toMatchObject({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["existing_meld_not_pon"],
      evidenceRefs: ["meld:chi"],
    });
  });

  it("rejects a kakan tile absent from a fully known tile pool", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "kakan",
        addedTile: { id: "5p" },
        existingMeldRef: "meld:pon",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [sixSou],
        currentDraw: null,
        melds: [{
          meldRef: "meld:pon",
          kind: "pon",
          tiles: [fiveNormal, fiveNormal, fiveNormal],
        }],
      },
    })).toMatchObject({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["kakan_added_tile_missing"],
    });
  });

  it("reports a known missing kakan meld before asking for its tile", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "kakan",
        existingMeldRef: "meld:missing",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        melds: [],
      },
    })).toEqual({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["existing_meld_missing"],
      evidenceRefs: [],
    });
  });

  it("reports a known missing kakan tile before asking for its meld", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "kakan",
        addedTile: fiveNormal,
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [sixSou],
        currentDraw: null,
      },
    })).toEqual({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["kakan_added_tile_missing"],
      evidenceRefs: [],
    });
  });

  it.each(["discard", "riichi_discard"] as const)(
    "rejects a known absent %s tile without red or mode clarification",
    (kind) => {
      expect(normalizeCandidate({
        draft: {
          kind,
          tile: { id: "5p" },
        },
        origin: "user",
        facts: {
          decisionWindow: {
            kind: "self_turn",
            actor: 0,
            triggerEventRef: "event:draw",
          },
          concealedTiles: [sixSou],
          currentDraw: {
            tile: { id: "4m", red: false },
            eventRef: "event:draw",
          },
        },
      })).toMatchObject({
        status: "inconsistent_with_known_facts",
        conflictCodes: ["tedashi_tile_missing"],
      });
    },
  );

  it("reports provided missing call tiles before asking for target actor", () => {
    expect(normalizeCandidate({
      draft: {
        kind: "chi",
        consumedTiles: [
          { id: "1m", red: false },
          { id: "3m", red: false },
        ],
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "discard_response",
          actor: 0,
          triggerEventRef: "event:discard",
          sourceActor: null,
          offeredTile: { id: "2m", red: false },
        },
        concealedTiles: [],
      },
    })).toEqual({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["consumed_tiles_missing"],
      evidenceRefs: [],
    });
  });

  it.each(["discard", "riichi_discard"] as const)(
    "rejects any %s tedashi from a known empty concealed hand",
    (kind) => {
      expect(normalizeCandidate({
        draft: {
          kind,
          discardMode: "tedashi",
        },
        origin: "user",
        facts: {
          decisionWindow: {
            kind: "self_turn",
            actor: 0,
            triggerEventRef: "event:draw",
          },
          concealedTiles: [],
        },
      })).toEqual({
        status: "inconsistent_with_known_facts",
        conflictCodes: ["tedashi_tile_missing"],
        evidenceRefs: [],
      });
    },
  );

  it.each([
    ["chi", 1],
    ["pon", 1],
    ["daiminkan", 2],
  ] as const)(
    "rejects incomplete %s when too few concealed tiles are known",
    (kind, concealedCount) => {
      expect(normalizeCandidate({
        draft: { kind },
        origin: "user",
        facts: {
          decisionWindow: {
            kind: "discard_response",
            actor: 0,
            triggerEventRef: "event:discard",
            sourceActor: 1,
            offeredTile: { id: "2m", red: false },
          },
          concealedTiles: Array.from(
            { length: concealedCount },
            () => ({ id: "1m" as const, red: false }),
          ),
        },
      })).toEqual({
        status: "inconsistent_with_known_facts",
        conflictCodes: ["consumed_tiles_missing"],
        evidenceRefs: [],
      });
    },
  );

  it("rejects an incomplete ankan with fewer than four known tiles", () => {
    expect(normalizeCandidate({
      draft: { kind: "ankan" },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [sixSou, sixSou, sixSou],
        currentDraw: null,
      },
    })).toEqual({
      status: "inconsistent_with_known_facts",
      conflictCodes: ["ankan_tiles_missing"],
      evidenceRefs: [],
    });
  });

  it("cannot read hidden current-scene state in a standalone hypothesis", () => {
    const standaloneFacts = {
      decisionWindow: {
        kind: "self_turn" as const,
        actor: null,
        triggerEventRef: "user_asserted:draw",
      },
    };
    const result = normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "6s", red: false },
        discardMode: "tedashi",
      },
      origin: "user",
      facts: standaloneFacts,
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.consistency).toBe("unknown_due_to_missing_facts");
    }
  });
});

describe("CandidateNormalizer tile-instance completion", () => {
  it("uses only the draw when resolving an explicit tsumogiri tile", () => {
    const result = normalizeCandidate({
      draft: {
        kind: "discard",
        tile: { id: "5p" },
        discardMode: "tsumogiri",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "self_turn",
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [fiveNormal],
        currentDraw: { tile: fiveRed, eventRef: "event:draw" },
      },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.candidate.action).toMatchObject({
        tile: fiveRed,
        discardMode: "tsumogiri",
      });
      expect(result.consistency).toBe("consistent");
    }
  });

  it("consumes explicit instances before resolving remaining call tiles", () => {
    const result = normalizeCandidate({
      draft: {
        kind: "pon",
        calledTile: fiveNormal,
        consumedTiles: [
          { id: "5p", red: true },
          { id: "5p" },
        ],
        targetActor: 1,
        responseEventRef: "event:discard",
      },
      origin: "user",
      facts: {
        decisionWindow: {
          kind: "discard_response",
          actor: 0,
          triggerEventRef: "event:discard",
          sourceActor: 1,
          offeredTile: fiveNormal,
        },
        concealedTiles: [fiveRed, fiveNormal],
      },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.candidate.action).toMatchObject({
        kind: "pon",
        consumedTiles: [fiveNormal, fiveRed],
      });
      expect(result.consistency).toBe("consistent");
    }
  });
});

describe("CandidateNormalizer action and window coverage", () => {
  const readyCases: Array<{
    name: string;
    draft: ActionDraft;
    facts: KnownActionFacts;
  }> = [
    {
      name: "riichi discard on self turn",
      draft: {
        kind: "riichi_discard" as const,
        tile: sixSou,
        discardMode: "tedashi" as const,
      },
      facts: {
        decisionWindow: {
          kind: "self_turn" as const,
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [sixSou],
        currentDraw: { tile: fiveRed, eventRef: "event:draw" },
      },
    },
    {
      name: "daiminkan on a discard response",
      draft: {
        kind: "daiminkan" as const,
        calledTile: { id: "1p" as const, red: false },
        consumedTiles: [
          { id: "1p" as const, red: false },
          { id: "1p" as const, red: false },
          { id: "1p" as const, red: false },
        ],
        targetActor: 1,
        responseEventRef: "event:discard",
      },
      facts: {
        decisionWindow: {
          kind: "discard_response" as const,
          actor: 0,
          triggerEventRef: "event:discard",
          sourceActor: 1,
          offeredTile: { id: "1p" as const, red: false },
        },
        concealedTiles: [
          { id: "1p" as const, red: false },
          { id: "1p" as const, red: false },
          { id: "1p" as const, red: false },
        ],
      },
    },
    {
      name: "ankan on self turn",
      draft: {
        kind: "ankan" as const,
        tiles: [
          { id: "1m" as const, red: false },
          { id: "1m" as const, red: false },
          { id: "1m" as const, red: false },
          { id: "1m" as const, red: false },
        ],
      },
      facts: {
        decisionWindow: {
          kind: "self_turn" as const,
          actor: 0,
          triggerEventRef: "event:draw",
        },
        concealedTiles: [
          { id: "1m" as const, red: false },
          { id: "1m" as const, red: false },
          { id: "1m" as const, red: false },
          { id: "1m" as const, red: false },
        ],
        currentDraw: null,
      },
    },
    {
      name: "tsumo on self turn",
      draft: {
        kind: "tsumo" as const,
        winningTile: sixSou,
        drawEventRef: "event:draw",
      },
      facts: {
        decisionWindow: {
          kind: "self_turn" as const,
          actor: 0,
          triggerEventRef: "event:draw",
        },
        currentDraw: { tile: sixSou, eventRef: "event:draw" },
      },
    },
    {
      name: "kyuushu kyuuhai on self turn",
      draft: {
        kind: "kyuushu_kyuuhai" as const,
        drawEventRef: "event:draw",
      },
      facts: {
        decisionWindow: {
          kind: "self_turn" as const,
          actor: 0,
          triggerEventRef: "event:draw",
        },
      },
    },
    {
      name: "ron on a kakan response",
      draft: {
        kind: "ron" as const,
        winningTile: fiveRed,
        targetActor: 1,
        responseEventRef: "event:kakan",
        winContext: "kakan" as const,
      },
      facts: {
        decisionWindow: {
          kind: "kan_response" as const,
          actor: 0,
          triggerEventRef: "event:kakan",
          sourceActor: 1,
          offeredTile: fiveRed,
          kanKind: "kakan" as const,
        },
      },
    },
    {
      name: "pass on a kan response",
      draft: {
        kind: "pass" as const,
        responseEventRef: "event:ankan",
        responseKind: "ankan" as const,
      },
      facts: {
        decisionWindow: {
          kind: "kan_response" as const,
          actor: 0,
          triggerEventRef: "event:ankan",
          sourceActor: 1,
          offeredTile: sixSou,
          kanKind: "ankan" as const,
        },
      },
    },
    {
      name: "forced tedashi after a call",
      draft: {
        kind: "discard" as const,
        tile: sixSou,
      },
      facts: {
        decisionWindow: {
          kind: "post_call_discard" as const,
          actor: 0,
          triggerEventRef: "event:call",
        },
        concealedTiles: [sixSou],
      },
    },
  ];

  it.each(readyCases)("normalizes $name", ({ draft, facts }) => {
    const result = normalizeCandidate({
      draft,
      origin: "user",
      facts,
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.consistency).toBe("consistent");
      expect(result.skippedChecks).toEqual([]);
    }
  });
});
