import { createHash } from "node:crypto";
import { LIBRIICHI_RULE_NORMALIZATION_VERSION, libriichiRuleCanonicalJson, type LibriichiRuleRequest } from "@riichi-coach/contracts";
import { canonicalStartEvents, canonicalStream } from "./fixtures/canonical-stream.js";
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type {
  CanonicalEventStream,
  CompletedHandFactRequest,
  CompletedHandFactResult,
  EngineIdentity,
  Hand13FactRequest,
  Hand13FactResult,
  HandStructureRequestV2,
  HandStructureResultV2,
  ThreatRiskFactRequest,
  ThreatRiskFactResult,
} from "@riichi-coach/contracts";
import {
  computeCanonicalGameFingerprint,
  parseMjaiTile,
  type MortalFetchedReport,
  type MortalReportDecisionEntry,
} from "@riichi-coach/mortal-source";
import type { HandStructureFactEnginePort } from "../src/fact-engine/port.js";
import {
  replayCanonicalStream,
  type ReplayedDecision,
} from "../src/replay/stream-replayer.js";
import { runBoundMortalDecisionReview, runMortalSingleDecisionReview } from "../src/analysis/mortal-review-service.js";

const ruleIdentity = {implementation:"Equim-chan/Mortal/libriichi" as const,revision:"0".repeat(40),
  nativeArtifactSha256:"1".repeat(64),wrapperSha256:"2".repeat(64),normalizationVersion:LIBRIICHI_RULE_NORMALIZATION_VERSION};

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);

const identity: EngineIdentity = {
  engine: "mahjong-helper",
  upstreamCommit: "514bb97c5a6d157fa2ed1ac804a53cb9b559d7d0",
  adapterVersion: "0.2.0",
  protocolVersion: "mahjong-facts/v1",
};

class FailingEngine implements HandStructureFactEnginePort {
  async identity(): Promise<EngineIdentity> {
    return identity;
  }

  async analyzeHand13(_request: Hand13FactRequest): Promise<Hand13FactResult> {
    throw new Error("not available in this test");
  }

  async analyzeCompletedHand(
    _request: CompletedHandFactRequest,
  ): Promise<CompletedHandFactResult> {
    throw new Error("not available in this test");
  }

  async analyzeHandStructure(
    _request: HandStructureRequestV2,
  ): Promise<HandStructureResultV2> {
    throw new Error("not available in this test");
  }

  async analyzeThreatRisk(
    _request: ThreatRiskFactRequest,
  ): Promise<ThreatRiskFactResult> {
    throw new Error("not available in this test");
  }

  async close(): Promise<void> {}
}

type RawLegacyFixture = {
  syntheticStream?: CanonicalEventStream;
  source: { reportId: string; modelTag: string; playerId: number };
  mjaiLog: unknown[];
  decisions: Array<{
    junme: number;
    tile: string;
    state: { tehai: string[]; fuuros: unknown[] };
    expected: { type: string; actor: number; pai: string; tsumogiri: boolean };
    actual: { type: string; actor: number; pai: string; tsumogiri: boolean };
    is_equal: boolean;
    details: Array<{
      action: { type: string; actor: number; pai: string; tsumogiri: boolean };
      q_value: number;
      prob: number;
    }>;
    shanten: number;
    at_furiten: boolean;
    actual_index: number;
  }>;
};

function legacyEntryToMortalEntry(
  raw: RawLegacyFixture["decisions"][number],
): MortalReportDecisionEntry {
  return Object.freeze({
    roundOrdinal: 0,
    roundWind: "E" as const,
    dealer: 3,
    kyoku: 0,
    honba: 0,
    junme: raw.junme,
    tilesLeft: 69,
    lastActor: 3,
    tile: raw.tile,
    tehai: Object.freeze([...raw.state.tehai]),
    fuuros: Object.freeze([]),
    atSelfChiPon: false,
    atSelfRiichi: false,
    atOpponentKakan: false,
    expected: { ...raw.expected },
    actual: { ...raw.actual },
    isEqual: raw.is_equal,
    details: Object.freeze(raw.details.map((detail) => ({
      action: { ...detail.action },
      probability: detail.prob,
      qValue: detail.q_value,
    }))),
    shanten: raw.shanten,
    atFuriten: raw.at_furiten,
    actualIndex: raw.actual_index,
  });
}

function makeReport(
  raw: RawLegacyFixture,
  entries: readonly MortalReportDecisionEntry[] = raw.decisions.map(
    legacyEntryToMortalEntry,
  ),
  overrides: Partial<MortalFetchedReport> = {},
): MortalFetchedReport {
  return Object.freeze({
    reportId: raw.source.reportId,
    adapterVersion: "mortal-source/2" as const,
    engine: "Mortal" as const,
    version: "1.5.10",
    modelTag: raw.source.modelTag,
    playerId: raw.source.playerId,
    gameFingerprint: computeCanonicalGameFingerprint(raw.syntheticStream!),
    kyokus: Object.freeze([{
      roundOrdinal: 0,
      roundWind: "E" as const,
      dealer: 3,
      kyoku: 0,
      honba: 0,
      entries: Object.freeze(entries),
    }]),
    ...overrides,
  });
}

function cloneEntry(
  entry: MortalReportDecisionEntry,
  overrides: Partial<MortalReportDecisionEntry> = {},
): MortalReportDecisionEntry {
  return Object.freeze({ ...entry, ...overrides });
}

async function setupFixture(): Promise<{
  raw: RawLegacyFixture;
  stream: CanonicalEventStream;
  decision: ReplayedDecision;
  firstRawDecision: RawLegacyFixture["decisions"][number];
}> {
  const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RawLegacyFixture;
  // A synthetic complete round for binding tests, using the historical hand
  // and report scores only. Never upgrade the old partial replay to complete.
  const firstRawDecision = raw.decisions[0]!;
  const hand = firstRawDecision.state.tehai.map(parseMjaiTile);
  const draw = parseMjaiTile(firstRawDecision.tile);
  const drawIndex = hand.findIndex(tile => tile.id === draw.id && tile.red === draw.red);
  if (drawIndex < 0) throw new Error("fixture draw missing");
  hand.splice(drawIndex, 1);
  const events = canonicalStartEvents(hand);
  const start = events[1]!;
  if (start.type !== "round_started") throw new Error("fixture start");
  start.dealer = 3;
  events.push({type:"tile_drawn",actor:3,tile:{visibility:"visible",tile:draw},from:"live_wall",
    eventId:"game:fixture/0/2/0",sourceRecordRef:"record:2"},
    {type:"tile_discarded",actor:3,tile:parseMjaiTile(firstRawDecision.actual.pai),discardMode:"tedashi",
      riichiDeclarationEventRef:null,eventId:"game:fixture/0/3/0",sourceRecordRef:"record:3"});
  const stream = {...canonicalStream(canonicalStartEvents()),events,selfActor:3 as const};
  raw.syntheticStream = stream;
  const decision = replayCanonicalStream(stream)[0]!;
  return {
    raw,
    stream,
    decision,
    firstRawDecision,
  };
}

async function runReview(
  stream: CanonicalEventStream,
  decision: ReplayedDecision,
  report: MortalFetchedReport,
  engine: HandStructureFactEnginePort = new FailingEngine(),
) {
  return await runMortalSingleDecisionReview({
    stream,
    decision,
    report,
    engine,
    rules: {identity: ruleIdentity, port: {queryRules: async (request:LibriichiRuleRequest) => {
      // Frozen controlled legal set, independent of the report under test.
      const actions = [["6s",23],["9s",26],["2p",10],["7p",15],["7s",24],["3m",2],
        ["8m",7],["5s",22],["8s",25],["6m",5],["6p",14],["4s",21]].map(([pai,index]) => ({
          runtimeAction:{index:Number(index),variant:null},mjaiActionJson:JSON.stringify({type:"dahai",actor:3,pai,tsumogiri:pai==="6s"})}));
      const content={protocolVersion:request.protocolVersion,requestId:request.requestId,identity:ruleIdentity,status:"ok" as const,actions};
      return {...content,resultId:createHash("sha256").update(libriichiRuleCanonicalJson(content)).digest("hex")};
    }}},
  });
}

describe("runMortalSingleDecisionReview", () => {
  it.each(["first", "second", "last"] as const)(
    "analyzes only the automatic report pair when actual ranks %s, retaining all legal scores",
    async (actualRank) => {
      const fixture = await setupFixture();
      const original = legacyEntryToMortalEntry(fixture.firstRawDecision);
      const actualIndex = original.actualIndex;
      const others = original.details.map((_, index) => index).filter(index => index !== actualIndex);
      const ranked = actualRank === "first" ? [actualIndex, ...others]
        : actualRank === "second" ? [others[0]!, actualIndex, ...others.slice(1)]
        : [...others, actualIndex];
      const total = ranked.length * (ranked.length + 1) / 2;
      const entry = cloneEntry(original, {
        details: original.details.map((detail, index) => ({
          ...detail, probability: (ranked.length - ranked.indexOf(index)) / total,
        })),
        expected: original.details[ranked[0]!]!.action,
        isEqual: actualRank === "first",
      });
      const engine = new FailingEngine();
      const handCalls = vi.spyOn(engine, "analyzeHand13");
      const review = await runReview(fixture.stream, fixture.decision, makeReport(fixture.raw, [entry]), engine);
      expect(review.status).toBe("ready");
      if (review.status !== "ready") throw new Error(JSON.stringify(review));
      expect(review.modelEvaluation.candidates).toHaveLength(12);
      expect(review.comparisonSet.candidates).toHaveLength(12);
      const scores = [...review.modelEvaluation.candidates].sort((a, b) => b.modelSelectionScore - a.modelSelectionScore);
      const expected = [scores[0]!.actionRef, actualRank === "first"
        ? scores[1]!.actionRef : review.modelEvaluation.actualActionRef].sort();
      expect(review.factorResult.ledgers.map(ledger => ledger.actionRef).sort()).toEqual(expected);
      expect(handCalls).toHaveBeenCalledTimes(2);
    },
  );

  it("cannot bypass mandatory rules through the bound-review entry point", async () => {
    const fixture = await setupFixture();
    const report = makeReport(fixture.raw);
    const engine = new FailingEngine();
    const helper = vi.spyOn(engine, "analyzeHand13");
    const result = await runBoundMortalDecisionReview({
      stream: fixture.stream, decision: fixture.decision, report,
      entry: report.kyokus[0]!.entries[0]!, engine,
    } as unknown as Parameters<typeof runBoundMortalDecisionReview>[0]);
    expect(result).toEqual({status:"failed",code:"mortal_review_rules_failed",diagnostics:["rules_input_incomplete"]});
    expect(helper).not.toHaveBeenCalled();
  });

  it("keeps an ordinary self-turn discard ready", async () => {
    const fixture = await setupFixture();
    const report = makeReport(fixture.raw);
    const review = await runReview(
      fixture.stream,
      fixture.decision,
      report,
    );

    expect(review.status).toBe("ready");
    if (review.status !== "ready") return;
    expect(review.anchor.reportIdHash).toContain("sha256:");
    expect(review.anchor.reportIdHash).not.toContain(fixture.raw.source.reportId);
    expect(review.anchor.junme).toBe(6);
    expect(review.modelEvaluation.engineId).toBe("mortal");
    expect(review.modelEvaluation.scoreMethod).toBe("mortal_probability_x100");
    expect(review.comparisonSet.candidates.length).toBeGreaterThanOrEqual(2);
    expect(review.modelEvaluation.candidates.length).toBe(
      review.comparisonSet.candidates.length,
    );
  });

  it("fails closed on a wrong game fingerprint", async () => {
    const fixture = await setupFixture();
    const report = makeReport(fixture.raw, undefined, {
      gameFingerprint: "mortal-game-fingerprint/v2:sha256:deadbeef",
    });
    const review = await runReview(
      fixture.stream,
      fixture.decision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_report_game_fingerprint_mismatch");
  });

  it("fails closed on a wrong playerId", async () => {
    const fixture = await setupFixture();
    const report = makeReport(fixture.raw, undefined, {
      playerId: 0,
    });
    const review = await runReview(
      fixture.stream,
      fixture.decision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_report_perspective_mismatch");
  });

  it("fails closed when no Mortal entry matches the decision", async () => {
    const fixture = await setupFixture();
    const report = makeReport(fixture.raw, []);
    const review = await runReview(
      fixture.stream,
      fixture.decision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_decision_anchor_not_found");
  });

  it("fails closed on duplicate exact decision matches", async () => {
    const fixture = await setupFixture();
    const first = legacyEntryToMortalEntry(fixture.firstRawDecision);
    const report = makeReport(fixture.raw, [
      first,
      cloneEntry(first, { junme: first.junme + 1 }),
    ]);
    const review = await runReview(
      fixture.stream,
      fixture.decision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_decision_anchor_ambiguous");
  });

  it("does not bind same junme with a different 14-tile state", async () => {
    const fixture = await setupFixture();
    const entry = cloneEntry(
      legacyEntryToMortalEntry(fixture.firstRawDecision),
      { tehai: Object.freeze(["1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m"]) },
    );
    const report = makeReport(fixture.raw, [entry]);
    const review = await runReview(
      fixture.stream,
      fixture.decision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_decision_anchor_not_found");
  });

  it("does not bind on the same draw tile only", async () => {
    const fixture = await setupFixture();
    const base = legacyEntryToMortalEntry(fixture.firstRawDecision);
    const entry = cloneEntry(base, {
      tehai: Object.freeze(["1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m", "1m"]),
      actual: { type: "dahai", actor: 3, pai: "9m", tsumogiri: false },
    });
    const report = makeReport(fixture.raw, [entry]);
    const review = await runReview(
      fixture.stream,
      fixture.decision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_decision_anchor_not_found");
  });

  it("fails closed when Mortal actual differs from local actual", async () => {
    const fixture = await setupFixture();
    const base = legacyEntryToMortalEntry(fixture.firstRawDecision);
    const entry = cloneEntry(base, {
      actual: { type: "dahai", actor: 3, pai: "9m", tsumogiri: false },
    });
    const report = makeReport(fixture.raw, [entry]);
    const review = await runReview(
      fixture.stream,
      fixture.decision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_decision_actual_mismatch");
  });

  it("fails closed when the model does not score the local actual action", async () => {
    const fixture = await setupFixture();
    const base = legacyEntryToMortalEntry(fixture.firstRawDecision);
    const entry = cloneEntry(base, {
      details: Object.freeze([
        {
          action: { type: "dahai", actor: 3, pai: "6s", tsumogiri: true },
          probability: 0.6,
          qValue: 0.1,
        },
        {
          action: { type: "dahai", actor: 3, pai: "1p", tsumogiri: false },
          probability: 0.4,
          qValue: 0.2,
        },
      ]),
    });
    const report = makeReport(fixture.raw, [entry]);
    const review = await runReview(
      fixture.stream,
      fixture.decision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_decision_unsupported_entry");
  });

  it("fails closed on duplicate canonical model actions", async () => {
    const fixture = await setupFixture();
    const base = legacyEntryToMortalEntry(fixture.firstRawDecision);
    const entry = cloneEntry(base, {
      details: Object.freeze([
        {
          action: { type: "dahai", actor: 3, pai: "6s", tsumogiri: true },
          probability: 0.6,
          qValue: 0.1,
        },
        {
          action: { type: "dahai", actor: 3, pai: "6s", tsumogiri: true },
          probability: 0.4,
          qValue: 0.2,
        },
      ]),
    });
    const report = makeReport(fixture.raw, [entry]);
    const review = await runReview(
      fixture.stream,
      fixture.decision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_decision_unsupported_entry");
  });

  it("fails closed on an invalid model candidate", async () => {
    const fixture = await setupFixture();
    const base = legacyEntryToMortalEntry(fixture.firstRawDecision);
    const entry = cloneEntry(base, {
      details: Object.freeze([
        {
          action: { type: "dahai", actor: 3, pai: "6s", tsumogiri: true },
          probability: 1.5,
          qValue: 0.1,
        },
        {
          action: { type: "dahai", actor: 3, pai: "1p", tsumogiri: false },
          probability: 0.4,
          qValue: 0.2,
        },
      ]),
    });
    const report = makeReport(fixture.raw, [entry]);
    const review = await runReview(
      fixture.stream,
      fixture.decision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_decision_unsupported_entry");
  });

  it("rejects a substituted riichi actual absent from the complete rule result", async () => {
    const fixture = await setupFixture();
    // Changing only the supplied actual cannot authorize a new rule action.
    const riichiDecision = {
      ...fixture.decision,
      actualAction: {
        kind: "riichi_discard" as const,
        tile: fixture.decision.actualDiscard!.tile,
        discardMode: fixture.decision.actualDiscard!.discardMode,
      },
    };
    const report = makeReport(fixture.raw);
    const review = await runReview(
      fixture.stream,
      riichiDecision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_review_rules_failed");
    expect(review.diagnostics).toEqual(["rules_actual_action_mismatch"]);
  });

  it("fails closed when the window has no representable self action", async () => {
    const fixture = await setupFixture();
    const nullDecision = { ...fixture.decision, actualAction: null };
    const report = makeReport(fixture.raw);
    const review = await runReview(
      fixture.stream,
      nullDecision,
      report,
    );
    expect(review.status).toBe("failed");
    if (review.status !== "failed") return;
    expect(review.code).toBe("mortal_review_rules_failed");
    expect(review.diagnostics).toEqual(["rules_actual_action_mismatch"]);
  });
});
