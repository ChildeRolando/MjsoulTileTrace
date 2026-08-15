import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
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
  computeMortalGameFingerprint,
  parseMjaiTile,
  type MortalFetchedReport,
  type MortalReportDecisionEntry,
} from "@riichi-coach/mortal-source";
import type { HandStructureFactEnginePort } from "../src/fact-engine/port.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";
import { importRegressionFixture } from "../src/import/mortal-report.js";
import {
  replayCanonicalStream,
  type ReplayedDecision,
} from "../src/replay/stream-replayer.js";
import { runMortalSingleDecisionReview } from "../src/analysis/mortal-review-service.js";

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
    dealer: 0,
    kyoku: 0,
    honba: 0,
    junme: raw.junme,
    tilesLeft: 46,
    lastActor: 3,
    tile: raw.tile,
    tehai: Object.freeze([...raw.state.tehai]),
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
    adapterVersion: "mortal-source/1" as const,
    engine: "Mortal" as const,
    version: "1.5.10",
    modelTag: raw.source.modelTag,
    playerId: raw.source.playerId,
    gameFingerprint: computeMortalGameFingerprint(raw.mjaiLog),
    kyokus: Object.freeze([{
      roundOrdinal: 0,
      roundWind: "E" as const,
      dealer: 0,
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
  const imported = importRegressionFixture(raw as never);
  const bridged = bridgeLegacyRegressionEvents(
    imported.events,
    imported.selfActor,
    { sourceKind: "fixture", gameId: "fixture:c1924cad66f66dd9" },
  );
  if (bridged.status !== "ready") throw new Error("bridge failed");
  const decisions = replayCanonicalStream(bridged.stream);
  const firstRawDecision = raw.decisions[0]!;
  const targetDraw = parseMjaiTile(firstRawDecision.tile);
  const decision = decisions.find((entry) =>
    entry.actualDiscard !== null
    && entry.snapshot.privateState.currentDraw !== null
    && entry.snapshot.privateState.currentDraw.tile.id === targetDraw.id
    && entry.snapshot.privateState.currentDraw.tile.red === targetDraw.red
  );
  if (decision === undefined) throw new Error("decision not found");
  return {
    raw,
    stream: bridged.stream,
    decision,
    firstRawDecision,
  };
}

async function runReview(
  stream: CanonicalEventStream,
  decision: ReplayedDecision,
  report: MortalFetchedReport,
) {
  return await runMortalSingleDecisionReview({
    stream,
    decision,
    report,
    engine: new FailingEngine(),
  });
}

describe("runMortalSingleDecisionReview", () => {
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

  it("cross-checks a riichi local actual by type correspondence, not as unsupported", async () => {
    const fixture = await setupFixture();
    // M6-A3 (ADR-0001): a riichi local actual is first-class. It no longer
    // fails closed as unsupported; it cross-checks against Mortal's actual by
    // type — a riichi_discard local expects a reach actual, so this report's
    // dahai actual fails correspondence.
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
    expect(review.code).toBe("mortal_decision_actual_mismatch");
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
    expect(review.code).toBe("mortal_decision_unsupported_entry");
  });
});
