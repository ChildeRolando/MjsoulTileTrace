import { describe, expect, it } from "vitest";
import {
  CanonicalEventStreamSchema,
  HandStructureResultV2Schema,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type HandStructureRequestV2,
  type HandStructureResultV2,
} from "@riichi-coach/contracts";
import type { HandStructureFactEnginePort } from "../src/fact-engine/port.js";
import {
  projectAnalyzedKnownGameFactsV2,
} from "../src/factors/known-game-facts-v2.js";
import { deriveResponseFuriten } from "../src/replay/response-furiten.js";
import {
  canonicalStartEvents,
  canonicalStream,
  canonicalTile,
} from "./fixtures/canonical-stream.js";

const identity = {
  engine: "mahjong-helper",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  adapterVersion: "0.1.0",
  protocolVersion: "mahjong-facts/v1",
} as const;

const tenpaiHand = [
  canonicalTile("1m"), canonicalTile("2m"), canonicalTile("3m"),
  canonicalTile("1p"), canonicalTile("2p"), canonicalTile("3p"),
  canonicalTile("1s"), canonicalTile("2s"), canonicalTile("3s"),
  canonicalTile("4s"), canonicalTile("5s"),
  canonicalTile("1z"), canonicalTile("1z"),
];

function eventRef(index: number, sub = 0): string {
  return `game:fixture/0/${index}/${sub}`;
}

function sourceRecordRef(index: number): string {
  return `record:${index}`;
}

function openingThroughDiscard(riichi = false): CanonicalGameEvent[] {
  const events = [
    ...canonicalStartEvents(tenpaiHand),
    {
      type: "tile_drawn" as const,
      eventId: eventRef(2),
      sourceRecordRef: sourceRecordRef(2),
      actor: 0,
      tile: { visibility: "visible" as const, tile: canonicalTile("9p") },
      from: "live_wall" as const,
    },
  ];
  if (riichi) {
    events.push({
      type: "riichi_declared",
      eventId: eventRef(3),
      sourceRecordRef: sourceRecordRef(3),
      actor: 0,
    });
    events.push({
      type: "tile_discarded",
      eventId: eventRef(4),
      sourceRecordRef: sourceRecordRef(4),
      actor: 0,
      tile: canonicalTile("9p"),
      discardMode: "tsumogiri",
      riichiDeclarationEventRef: eventRef(3),
    });
    events.push({
      type: "riichi_accepted",
      eventId: eventRef(5),
      sourceRecordRef: sourceRecordRef(5),
      actor: 0,
      declarationEventRef: eventRef(3),
    });
  } else {
    events.push({
      type: "tile_discarded",
      eventId: eventRef(3),
      sourceRecordRef: sourceRecordRef(3),
      actor: 0,
      tile: canonicalTile("9p"),
      discardMode: "tsumogiri",
      riichiDeclarationEventRef: null,
    });
  }
  return events;
}

function discardOpportunity(riichi = false): CanonicalGameEvent[] {
  const drawIndex = riichi ? 6 : 4;
  const sourceIndex = drawIndex + 1;
  return [
    ...openingThroughDiscard(riichi),
    {
      type: "tile_drawn",
      eventId: eventRef(drawIndex),
      sourceRecordRef: sourceRecordRef(drawIndex),
      actor: 1,
      tile: { visibility: "hidden" },
      from: "live_wall",
    },
    {
      type: "tile_discarded",
      eventId: eventRef(sourceIndex),
      sourceRecordRef: sourceRecordRef(sourceIndex),
      actor: 1,
      tile: canonicalTile("6s"),
      discardMode: "tedashi",
      riichiDeclarationEventRef: null,
    },
  ];
}

function closedByNextDraw(riichi = false): CanonicalGameEvent[] {
  const closingIndex = riichi ? 8 : 6;
  return [
    ...discardOpportunity(riichi),
    {
      type: "tile_drawn",
      eventId: eventRef(closingIndex),
      sourceRecordRef: sourceRecordRef(closingIndex),
      actor: 2,
      tile: { visibility: "hidden" },
      from: "live_wall",
    },
  ];
}

function continuedToSelfDraw(riichi = false): CanonicalGameEvent[] {
  const first = riichi ? 8 : 6;
  return [
    ...closedByNextDraw(riichi),
    {
      type: "tile_discarded",
      eventId: eventRef(first + 1),
      sourceRecordRef: sourceRecordRef(first + 1),
      actor: 2,
      tile: canonicalTile("8p"),
      discardMode: "tedashi",
      riichiDeclarationEventRef: null,
    },
    {
      type: "tile_drawn",
      eventId: eventRef(first + 2),
      sourceRecordRef: sourceRecordRef(first + 2),
      actor: 3,
      tile: { visibility: "hidden" },
      from: "live_wall",
    },
    {
      type: "tile_discarded",
      eventId: eventRef(first + 3),
      sourceRecordRef: sourceRecordRef(first + 3),
      actor: 3,
      tile: canonicalTile("8s"),
      discardMode: "tedashi",
      riichiDeclarationEventRef: null,
    },
    {
      type: "tile_drawn",
      eventId: eventRef(first + 4),
      sourceRecordRef: sourceRecordRef(first + 4),
      actor: 0,
      tile: { visibility: "visible", tile: canonicalTile("9m") },
      from: "live_wall",
    },
  ];
}

function streamWith(
  events: readonly CanonicalGameEvent[],
  options: {
    responseOpportunities?: "complete" | "partial" | "unknown";
    eventSequence?: "complete" | "partial" | "unknown";
    melds?: "complete" | "partial" | "unknown";
    atamahane?: boolean | "unknown";
  } = {},
): CanonicalEventStream {
  const base = canonicalStream(events);
  const atamahane = options.atamahane ?? base.ruleSet.atamahane;
  return CanonicalEventStreamSchema.parse({
    ...base,
    completeness: {
      ...base.completeness,
      responseOpportunities: options.responseOpportunities ?? "complete",
      eventSequence: options.eventSequence ?? "complete",
      melds: options.melds ?? "complete",
      ruleSet: atamahane === "unknown" ? "partial" : base.completeness.ruleSet,
    },
    ruleSet: { ...base.ruleSet, atamahane },
  });
}

type Eligibility = HandStructureResultV2["waits"][number]["baseRonEligibility"];

class FixtureHandStructureEngine implements HandStructureFactEnginePort {
  readonly requests: HandStructureRequestV2[] = [];
  constructor(
    private readonly eligibility: Eligibility = "eligible",
    private readonly family: "standard" | "kokushi" = "standard",
    private readonly fail = false,
    private readonly hasWait = true,
  ) {}

  async identity() { return identity; }
  async analyzeHand13(): Promise<never> { throw new Error("unused"); }
  async analyzeCompletedHand(): Promise<never> { throw new Error("unused"); }
  async analyzeThreatRisk(): Promise<never> { throw new Error("unused"); }
  async close(): Promise<void> {}

  async analyzeHandStructure(
    request: HandStructureRequestV2,
  ): Promise<HandStructureResultV2> {
    this.requests.push(structuredClone(request));
    if (this.fail) throw new Error("fixture engine unavailable");
    const offeredTile34 = request.ronContext === "known_kakan_chankan" ||
        request.ronContext === "known_ankan_chankan"
      ? 33
      : 23;
    const decompositionRef = `${this.family}:fixture`;
    const standardShanten = this.family === "standard"
      ? this.hasWait ? 0 : 1
      : 1;
    const kokushiShanten = this.family === "kokushi" ? 0 : 8;
    const result = {
      kind: "hand_structure_result" as const,
      schemaVersion: "hand-structure/v2" as const,
      requestId: request.requestId,
      protocolVersion: request.protocolVersion,
      actionRef: request.actionRef,
      stateHash: request.stateHash,
      identity,
      overallShanten: this.hasWait ? 0 : 1,
      bestFamilies: [this.family],
      families: [
        {
          family: "standard" as const,
          applicability: "applicable" as const,
          shanten: standardShanten,
          effectiveTiles: this.family === "standard" && this.hasWait ? [{
            tile34: offeredTile34,
            remainingStatus: "blocked_missing_facts" as const,
            remaining: null,
          }] : [],
        },
        {
          family: "chiitoitsu" as const,
          applicability: "applicable" as const,
          shanten: 5,
          effectiveTiles: [],
        },
        {
          family: "kokushi" as const,
          applicability: "applicable" as const,
          shanten: kokushiShanten,
          effectiveTiles: this.family === "kokushi" ? [{
            tile34: offeredTile34,
            remainingStatus: "blocked_missing_facts" as const,
            remaining: null,
          }] : [],
        },
      ],
      decompositions: {
        status: "calculated" as const,
        totalNonDominated: 1,
        truncated: false,
        items: [{
          decompositionRef,
          family: this.family,
          shanten: this.hasWait ? 0 : 1,
          groups: this.family === "standard" ? [
            { kind: "sequence" as const, tiles34: [0, 1, 2] },
            { kind: "sequence" as const, tiles34: [9, 10, 11] },
            { kind: "sequence" as const, tiles34: [18, 19, 20] },
            { kind: "ryanmen_taatsu" as const, tiles34: [21, 22] },
            { kind: "pair_candidate" as const, tiles34: [27, 27] },
          ] : request.handTiles34.flatMap((count, tile34) =>
            Array.from({ length: count }, () => ({
              kind: "floating" as const,
              tiles34: [tile34],
            }))
          ),
        }],
        invariantClaims: [],
        alternativeClaims: [],
      },
      waits: this.hasWait ? [{
        tile34: offeredTile34,
        families: [this.family],
        waitTypes: [this.family === "kokushi"
          ? "kokushi_single" as const
          : "ryanmen" as const],
        remainingStatus: "blocked_missing_facts" as const,
        remaining: null,
        baseRonEligibility: this.eligibility,
        decompositionRefs: [decompositionRef],
      }] : [],
      diagnostics: this.hasWait && this.eligibility ===
          "unknown_missing_situational_yaku_context"
        ? ["ron_eligibility_missing_situational_context" as const]
        : [],
    };
    return HandStructureResultV2Schema.parse(result);
  }
}

describe("response-opportunity furiten", () => {
  it("confirms a passed eligible discard only after the exact next legal draw", async () => {
    const events = closedByNextDraw();
    const engine = new FixtureHandStructureEngine();

    await expect(deriveResponseFuriten(
      streamWith(events), eventRef(5), engine,
    )).resolves.toEqual({
      temporary: { status: "clear", evidenceIds: [] },
      riichi: { status: "clear", evidenceIds: [] },
    });
    await expect(deriveResponseFuriten(
      streamWith(events), eventRef(6), engine,
    )).resolves.toEqual({
      temporary: {
        status: "confirmed",
        evidenceIds: [eventRef(5), eventRef(6)],
      },
      riichi: { status: "clear", evidenceIds: [] },
    });
  });

  it("clears temporary furiten on the next self draw", async () => {
    const events = continuedToSelfDraw();
    await expect(deriveResponseFuriten(
      streamWith(events), eventRef(10), new FixtureHandStructureEngine(),
    )).resolves.toEqual({
      temporary: { status: "clear", evidenceIds: [] },
      riichi: { status: "clear", evidenceIds: [] },
    });
  });

  it("confirms riichi furiten with acceptance evidence and never clears it on draw", async () => {
    const events = continuedToSelfDraw(true);
    const analysis = await deriveResponseFuriten(
      streamWith(events), eventRef(12), new FixtureHandStructureEngine(),
    );
    expect(analysis).toEqual({
      temporary: { status: "clear", evidenceIds: [] },
      riichi: {
        status: "confirmed",
        evidenceIds: [eventRef(5), eventRef(7), eventRef(8)],
      },
    });
  });

  it("uses structural waits even when current ron eligibility is ineligible", async () => {
    const events = closedByNextDraw();
    const ineligible = await deriveResponseFuriten(
      streamWith(events), eventRef(6),
      new FixtureHandStructureEngine("ineligible"),
    );
    const unknown = await deriveResponseFuriten(
      streamWith(events), eventRef(6),
      new FixtureHandStructureEngine(
        "unknown_missing_situational_yaku_context",
      ),
    );
    expect(ineligible.temporary).toEqual({
      status: "confirmed",
      evidenceIds: [eventRef(5), eventRef(6)],
    });
    expect(unknown.temporary).toEqual({
      status: "confirmed",
      evidenceIds: [eventRef(5), eventRef(6)],
    });
    expect((await deriveResponseFuriten(
      streamWith(events), eventRef(6),
      new FixtureHandStructureEngine("ineligible", "standard", false, false),
    )).temporary).toEqual({ status: "clear", evidenceIds: [] });
  });

  it("fails dependent components closed when replay facts or the engine are incomplete", async () => {
    const events = closedByNextDraw();
    for (const stream of [
      streamWith(events, { responseOpportunities: "partial" }),
      streamWith(events, { eventSequence: "partial" }),
      streamWith(events, { melds: "partial" }),
    ]) {
      await expect(deriveResponseFuriten(
        stream, eventRef(6), new FixtureHandStructureEngine(),
      )).resolves.toEqual({
        temporary: { status: "unknown", evidenceIds: [] },
        riichi: { status: "unknown", evidenceIds: [] },
      });
    }
    await expect(deriveResponseFuriten(
      streamWith(events), eventRef(6),
      new FixtureHandStructureEngine("eligible", "standard", true),
    )).resolves.toEqual({
      temporary: { status: "unknown", evidenceIds: [] },
      riichi: { status: "clear", evidenceIds: [] },
    });
    const synchronousFailure = new FixtureHandStructureEngine();
    synchronousFailure.analyzeHandStructure = (() => {
      throw new Error("synchronous engine failure");
    }) as HandStructureFactEnginePort["analyzeHandStructure"];
    await expect(deriveResponseFuriten(
      streamWith(events), eventRef(6), synchronousFailure,
    )).resolves.toEqual({
      temporary: { status: "unknown", evidenceIds: [] },
      riichi: { status: "clear", evidenceIds: [] },
    });
    const riichiFailure = await deriveResponseFuriten(
      streamWith(continuedToSelfDraw(true)), eventRef(12),
      new FixtureHandStructureEngine("eligible", "standard", true),
    );
    expect(riichiFailure).toEqual({
      temporary: { status: "clear", evidenceIds: [] },
      riichi: { status: "unknown", evidenceIds: [] },
    });
    const misboundResult = new FixtureHandStructureEngine();
    const analyzeMisbound = misboundResult.analyzeHandStructure
      .bind(misboundResult);
    misboundResult.analyzeHandStructure = async (request) => ({
      ...await analyzeMisbound(request),
      requestId: "response:wrong-request",
    });
    expect((await deriveResponseFuriten(
      streamWith(events), eventRef(6), misboundResult,
    )).temporary).toEqual({ status: "unknown", evidenceIds: [] });
  });

  it("does not infer a pass from absence of self ron or from round_drawn", async () => {
    const source = discardOpportunity();
    const selfRon: CanonicalGameEvent[] = [...source, {
      type: "win_declared",
      eventId: eventRef(6),
      sourceRecordRef: sourceRecordRef(6),
      winnerActor: 0,
      targetActor: 1,
      method: "ron",
      winningTile: canonicalTile("6s"),
      winSourceEventRef: eventRef(5),
      scoreDeltas: null,
    }];
    const drawn: CanonicalGameEvent[] = [...source, {
      type: "round_drawn",
      eventId: eventRef(6),
      sourceRecordRef: sourceRecordRef(6),
      reason: "sancha_hou",
      tenpaiActors: [],
    }];
    await expect(deriveResponseFuriten(
      streamWith(selfRon), eventRef(6), new FixtureHandStructureEngine(),
    )).resolves.toEqual({
      temporary: { status: "clear", evidenceIds: [] },
      riichi: { status: "clear", evidenceIds: [] },
    });
    expect((await deriveResponseFuriten(
      streamWith(drawn), eventRef(6), new FixtureHandStructureEngine(),
    )).temporary).toEqual({ status: "unknown", evidenceIds: [] });
  });

  it("requires the complete multi-ron winner sequence before confirming a pass", async () => {
    const source = discardOpportunity();
    const events: CanonicalGameEvent[] = [
      ...source,
      {
        type: "win_declared",
        eventId: eventRef(6),
        sourceRecordRef: sourceRecordRef(6),
        winnerActor: 2,
        targetActor: 1,
        method: "ron",
        winningTile: canonicalTile("6s"),
        winSourceEventRef: eventRef(5),
        scoreDeltas: null,
      },
      {
        type: "win_declared",
        eventId: eventRef(6, 1),
        sourceRecordRef: sourceRecordRef(6),
        winnerActor: 3,
        targetActor: 1,
        method: "ron",
        winningTile: canonicalTile("6s"),
        winSourceEventRef: eventRef(5),
        scoreDeltas: null,
      },
      {
        type: "scores_updated",
        eventId: eventRef(7),
        sourceRecordRef: sourceRecordRef(7),
        scores: [25000, 25000, 25000, 25000],
        settlementEventRef: eventRef(6),
      },
    ];
    expect((await deriveResponseFuriten(
      streamWith(events), eventRef(6), new FixtureHandStructureEngine(),
    )).temporary).toEqual({ status: "unknown", evidenceIds: [] });
    expect((await deriveResponseFuriten(
      streamWith(events), eventRef(7), new FixtureHandStructureEngine(),
    )).temporary).toEqual({
      status: "confirmed",
      evidenceIds: [eventRef(5), eventRef(7)],
    });
  });

  it("uses exact call and kan closers and limits ankan to kokushi", async () => {
    const discard = discardOpportunity();
    const called: CanonicalGameEvent[] = [...discard, {
      type: "pon_called",
      eventId: eventRef(6),
      sourceRecordRef: sourceRecordRef(6),
      actor: 2,
      targetActor: 1,
      calledTile: canonicalTile("6s"),
      consumedTiles: [canonicalTile("6s"), canonicalTile("6s")],
      calledDiscardEventRef: eventRef(5),
    }];
    expect((await deriveResponseFuriten(
      streamWith(called), eventRef(6), new FixtureHandStructureEngine(),
    )).temporary).toEqual({
      status: "confirmed",
      evidenceIds: [eventRef(5), eventRef(6)],
    });

    const kakan = kakanOpportunity();
    const kakanEngine = new FixtureHandStructureEngine();
    expect((await deriveResponseFuriten(
      streamWith(kakan), eventRef(14), kakanEngine,
    )).temporary).toEqual({
      status: "confirmed",
      evidenceIds: [eventRef(13), eventRef(14)],
    });
    expect(kakanEngine.requests.at(-1)?.ronContext).toBe(
      "known_kakan_chankan",
    );

    const ankan = ankanOpportunity();
    expect((await deriveResponseFuriten(
      streamWith(ankan), eventRef(6), new FixtureHandStructureEngine(),
    )).temporary.status).toBe("clear");
    const kokushiEngine = new FixtureHandStructureEngine(
      "eligible", "kokushi",
    );
    expect((await deriveResponseFuriten(
      streamWith(ankan), eventRef(6), kokushiEngine,
    )).temporary).toEqual({
      status: "confirmed",
      evidenceIds: [eventRef(5), eventRef(6)],
    });
    expect(kokushiEngine.requests.at(-1)?.ronContext).toBe(
      "known_ankan_chankan",
    );
  });

  it("applies known atamahane seat priority and treats unknown head-bump as unknown", async () => {
    const blocked = ronClosedOpportunity(1, 2);
    expect((await deriveResponseFuriten(
      streamWith(blocked, { atamahane: true }), eventRef(7),
      new FixtureHandStructureEngine(),
    )).temporary).toEqual({ status: "clear", evidenceIds: [] });
    expect((await deriveResponseFuriten(
      streamWith(blocked, { atamahane: "unknown" }), eventRef(7),
      new FixtureHandStructureEngine(),
    )).temporary).toEqual({ status: "unknown", evidenceIds: [] });

    const selfHadPriority = ronClosedOpportunity(3, 1);
    expect((await deriveResponseFuriten(
      streamWith(selfHadPriority, { atamahane: true }), eventRef(11),
      new FixtureHandStructureEngine(),
    )).temporary).toEqual({
      status: "confirmed",
      evidenceIds: [eventRef(9), eventRef(11)],
    });
  });

  it("binds caching to the complete source-specific request envelope", async () => {
    const first = closedByNextDraw();
    const events: CanonicalGameEvent[] = [
      ...first,
      {
        type: "tile_discarded",
        eventId: eventRef(7),
        sourceRecordRef: sourceRecordRef(7),
        actor: 2,
        tile: canonicalTile("6s"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
      {
        type: "tile_drawn",
        eventId: eventRef(8),
        sourceRecordRef: sourceRecordRef(8),
        actor: 3,
        tile: { visibility: "hidden" },
        from: "live_wall",
      },
    ];
    const engine = new FixtureHandStructureEngine();
    await deriveResponseFuriten(streamWith(events), eventRef(8), engine);
    expect(engine.requests).toHaveLength(2);
    expect(new Set(engine.requests.map((request) => request.requestId)).size)
      .toBe(2);
    expect(new Set(engine.requests.map((request) => request.actionRef)).size)
      .toBe(2);

    const partialFailure = new FixtureHandStructureEngine();
    const analyze = partialFailure.analyzeHandStructure.bind(partialFailure);
    let callCount = 0;
    partialFailure.analyzeHandStructure = async (request) => {
      if (callCount++ > 0) throw new Error("second opportunity unavailable");
      return analyze(request);
    };
    expect((await deriveResponseFuriten(
      streamWith(events), eventRef(8), partialFailure,
    )).temporary).toEqual({
      status: "confirmed",
      evidenceIds: [eventRef(5), eventRef(6)],
    });
  });

  it("reduces only the target prefix and still rejects invalid history inside it", async () => {
    const validPrefix = closedByNextDraw();
    const invalidFuture: CanonicalGameEvent[] = [
      ...validPrefix,
      {
        type: "tile_discarded",
        eventId: eventRef(7),
        sourceRecordRef: sourceRecordRef(7),
        actor: 3,
        tile: canonicalTile("8p"),
        discardMode: "tedashi",
        riichiDeclarationEventRef: null,
      },
    ];
    await expect(deriveResponseFuriten(
      streamWith(invalidFuture), eventRef(6), new FixtureHandStructureEngine(),
    )).resolves.toMatchObject({ temporary: { status: "confirmed" } });
    const clean = streamWith(validPrefix);
    const schemaInvalidFuture = {
      ...clean,
      events: [
        ...clean.events,
        {
          type: "tile_discarded",
          eventId: eventRef(7),
          sourceRecordRef: sourceRecordRef(7),
          actor: 3,
          tile: canonicalTile("8p"),
          discardMode: "tedashi",
          riichiDeclarationEventRef: null,
          unexpectedFutureField: true,
        },
      ],
    } as unknown as CanonicalEventStream;
    await expect(deriveResponseFuriten(
      schemaInvalidFuture, eventRef(6), new FixtureHandStructureEngine(),
    )).resolves.toMatchObject({ temporary: { status: "confirmed" } });

    const invalidPrefix = structuredClone(validPrefix);
    const closing = invalidPrefix.at(-1);
    if (closing?.type !== "tile_drawn") throw new Error("fixture mismatch");
    closing.actor = 3;
    await expect(deriveResponseFuriten(
      streamWith(invalidPrefix), eventRef(6), new FixtureHandStructureEngine(),
    )).rejects.toThrow("event_actor_mismatch");
  });

  it("exposes the async known-facts wrapper without mutating canonical snapshot facts", async () => {
    const events = continuedToSelfDraw(true);
    const stream = streamWith(events);
    const engine = new FixtureHandStructureEngine();
    const before = structuredClone(stream);
    const projected = await projectAnalyzedKnownGameFactsV2({
      stream,
      decisionWindow: {
        kind: "self_turn",
        actor: 0,
        triggerEventRef: eventRef(12),
      },
    }, engine);
    expect(projected.facts.decisionEventRef).toBe(eventRef(12));
    expect(projected.responseFuriten.riichi.status).toBe("confirmed");
    expect(stream).toEqual(before);
  });
});

function kakanOpportunity(): CanonicalGameEvent[] {
  return [
    ...canonicalStartEvents(tenpaiHand),
    { type: "tile_drawn", eventId: eventRef(2), sourceRecordRef: sourceRecordRef(2), actor: 0, tile: { visibility: "visible", tile: canonicalTile("7z") }, from: "live_wall" },
    { type: "tile_discarded", eventId: eventRef(3), sourceRecordRef: sourceRecordRef(3), actor: 0, tile: canonicalTile("7z"), discardMode: "tsumogiri", riichiDeclarationEventRef: null },
    { type: "pon_called", eventId: eventRef(4), sourceRecordRef: sourceRecordRef(4), actor: 1, targetActor: 0, calledTile: canonicalTile("7z"), consumedTiles: [canonicalTile("7z"), canonicalTile("7z")], calledDiscardEventRef: eventRef(3) },
    { type: "tile_discarded", eventId: eventRef(5), sourceRecordRef: sourceRecordRef(5), actor: 1, tile: canonicalTile("8p"), discardMode: "tedashi", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: eventRef(6), sourceRecordRef: sourceRecordRef(6), actor: 2, tile: { visibility: "hidden" }, from: "live_wall" },
    { type: "tile_discarded", eventId: eventRef(7), sourceRecordRef: sourceRecordRef(7), actor: 2, tile: canonicalTile("8s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: eventRef(8), sourceRecordRef: sourceRecordRef(8), actor: 3, tile: { visibility: "hidden" }, from: "live_wall" },
    { type: "tile_discarded", eventId: eventRef(9), sourceRecordRef: sourceRecordRef(9), actor: 3, tile: canonicalTile("9s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: eventRef(10), sourceRecordRef: sourceRecordRef(10), actor: 0, tile: { visibility: "visible", tile: canonicalTile("9m") }, from: "live_wall" },
    { type: "tile_discarded", eventId: eventRef(11), sourceRecordRef: sourceRecordRef(11), actor: 0, tile: canonicalTile("9m"), discardMode: "tsumogiri", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: eventRef(12), sourceRecordRef: sourceRecordRef(12), actor: 1, tile: { visibility: "hidden" }, from: "live_wall" },
    { type: "kakan_declared", eventId: eventRef(13), sourceRecordRef: sourceRecordRef(13), actor: 1, addedTile: canonicalTile("7z"), upgradedPonEventRef: eventRef(4) },
    { type: "dora_revealed", eventId: eventRef(14), sourceRecordRef: sourceRecordRef(14), indicator: canonicalTile("2z"), kanEventRef: eventRef(13) },
  ];
}

function ankanOpportunity(): CanonicalGameEvent[] {
  return [
    ...openingThroughDiscard(),
    { type: "tile_drawn", eventId: eventRef(4), sourceRecordRef: sourceRecordRef(4), actor: 1, tile: { visibility: "hidden" }, from: "live_wall" },
    { type: "ankan_declared", eventId: eventRef(5), sourceRecordRef: sourceRecordRef(5), actor: 1, tiles: [canonicalTile("7z"), canonicalTile("7z"), canonicalTile("7z"), canonicalTile("7z")] },
    { type: "dora_revealed", eventId: eventRef(6), sourceRecordRef: sourceRecordRef(6), indicator: canonicalTile("2z"), kanEventRef: eventRef(5) },
  ];
}

function ronClosedOpportunity(
  sourceActor: 1 | 3,
  winnerActor: 1 | 2,
): CanonicalGameEvent[] {
  const events = openingThroughDiscard();
  for (let actor = 1, index = 4; actor <= sourceActor; actor++, index += 2) {
    events.push({
      type: "tile_drawn", eventId: eventRef(index),
      sourceRecordRef: sourceRecordRef(index), actor,
      tile: { visibility: "hidden" }, from: "live_wall",
    });
    events.push({
      type: "tile_discarded", eventId: eventRef(index + 1),
      sourceRecordRef: sourceRecordRef(index + 1), actor,
      tile: canonicalTile(actor === sourceActor ? "6s" : "8p"),
      discardMode: "tedashi", riichiDeclarationEventRef: null,
    });
  }
  const sourceIndex = sourceActor === 1 ? 5 : 9;
  const winIndex = sourceIndex + 1;
  events.push({
    type: "win_declared", eventId: eventRef(winIndex),
    sourceRecordRef: sourceRecordRef(winIndex), winnerActor,
    targetActor: sourceActor, method: "ron", winningTile: canonicalTile("6s"),
    winSourceEventRef: eventRef(sourceIndex), scoreDeltas: null,
  });
  events.push({
    type: "scores_updated", eventId: eventRef(winIndex + 1),
    sourceRecordRef: sourceRecordRef(winIndex + 1),
    scores: [25000, 25000, 25000, 25000],
    settlementEventRef: eventRef(winIndex),
  });
  return events;
}
