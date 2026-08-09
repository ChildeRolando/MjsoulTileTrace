import {
  CurrentSceneFrameSchema,
  KnownGameFactsSchema,
  StructuredComparisonSetSchema,
  canonicalActionRef,
  type ComparisonAnalysisFrame,
  type ComparisonScope,
  type KnownGameFacts,
  type KnownMeld,
  type NormalizedDecision,
  type NormalizedEvent,
  type SceneSnapshot,
  type StructuredComparisonSet,
  type Tile,
} from "@riichi-coach/contracts";
import {
  analyzeAllDiscardEfficiency,
  type DiscardEfficiencyMetric,
} from "../analysis/efficiency-analyzer.js";
import { legacyDiscardActionIdToAction } from "../candidate/legacy-action-bridge.js";

export interface LegacyRegressionPipelineInput {
  frame: ComparisonAnalysisFrame;
  comparisonSet: StructuredComparisonSet;
  facts: KnownGameFacts;
  legacyEfficiencyByActionRef: Record<string, DiscardEfficiencyMetric>;
  diagnosticCodes: ["legacy_regression_bridge_only"];
}

function sameTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function concealedBeforeDraw(scene: SceneSnapshot): Tile[] {
  if (scene.currentDraw === null) return scene.selfHand.map((tile) => ({ ...tile }));
  const result = scene.selfHand.map((tile) => ({ ...tile }));
  const drawIndex = result.findLastIndex((tile) => sameTile(tile, scene.currentDraw!));
  if (drawIndex < 0) {
    throw new Error("legacy regression draw is absent from the visible self hand");
  }
  result.splice(drawIndex, 1);
  return result;
}

function eventsThroughDecision(
  events: readonly NormalizedEvent[],
  decisionEventId: string,
): NormalizedEvent[] {
  const index = events.findIndex((event) => event.eventId === decisionEventId);
  if (index < 0) throw new Error("legacy regression decision event is absent");
  return events.slice(0, index + 1);
}

function isMeldEvent(event: NormalizedEvent): event is Extract<
  NormalizedEvent,
  { type: "chi" | "pon" | "daiminkan" | "ankan" | "kakan" }
> {
  return ["chi", "pon", "daiminkan", "ankan", "kakan"].includes(event.type);
}

function replayMelds(events: readonly NormalizedEvent[]): {
  melds: KnownMeld[];
  calledDiscardMarkersComplete: boolean;
  doraIndicatorsComplete: boolean;
} {
  const melds: KnownMeld[] = [];
  const calledDiscards = new Set<string>();
  let calledDiscardMarkersComplete = true;
  let doraIndicatorsComplete = true;
  for (const [index, event] of events.entries()) {
    if (!isMeldEvent(event)) continue;
    if (["daiminkan", "ankan", "kakan"].includes(event.type)) {
      doraIndicatorsComplete = false;
    }
    let calledDiscardEventRef: string | null = null;
    if (event.type !== "ankan") {
      for (let prior = index - 1; prior >= 0; prior -= 1) {
        const candidate = events[prior]!;
        if (
          candidate.type === "dahai" &&
          candidate.actor === event.target &&
          sameTile(candidate.tile, event.tile) &&
          !calledDiscards.has(candidate.eventId)
        ) {
          calledDiscardEventRef = candidate.eventId;
          calledDiscards.add(candidate.eventId);
          break;
        }
      }
      if (calledDiscardEventRef === null) calledDiscardMarkersComplete = false;
    }
    melds.push({
      meldRef: `legacy-meld:${event.eventId}`,
      kind: event.type,
      actor: event.actor,
      calledDiscardEventRef,
      tiles: event.type === "ankan"
        ? [...event.consumed]
        : [event.tile, ...event.consumed],
    });
  }
  return { melds, calledDiscardMarkersComplete, doraIndicatorsComplete };
}

function seatWind(selfActor: number, dealerActor: number): "E" | "S" | "W" | "N" {
  return (["E", "S", "W", "N"] as const)[
    (selfActor - dealerActor + 4) % 4
  ]!;
}

function knownFacts(
  events: readonly NormalizedEvent[],
  decision: NormalizedDecision,
  scene: SceneSnapshot,
): KnownGameFacts {
  const relevantEvents = eventsThroughDecision(events, scene.decisionEventId);
  const replayed = replayMelds(relevantEvents);
  const currentDraw = scene.currentDraw === null
    ? null
    : { tile: { ...scene.currentDraw }, eventRef: scene.decisionEventId };
  // This bridge deliberately preserves normalized legacy event IDs for old
  // regression facts. These rows are not canonical DefenseMatrix evidence;
  // matrix assembly must use the canonical V2 fixture projection instead.
  const defenseThreats = scene.threats.flatMap((threat) => {
    if (!threat.riichi || threat.actor === scene.selfActor ||
      threat.declarationEventId === null) return [];
    const declarationIndex = relevantEvents.findIndex((event) =>
      event.eventId === threat.declarationEventId
    );
    if (declarationIndex < 0) {
      throw new Error("legacy regression riichi declaration is absent");
    }
    const acceptance = relevantEvents.slice(declarationIndex + 1).find((event) =>
      event.type === "reach_accepted" && event.actor === threat.actor
    );
    const declaringDiscardIndex = relevantEvents.findIndex((event, index) =>
      index > declarationIndex && event.type === "dahai" &&
      event.actor === threat.actor
    );
    const riichiTurn = declaringDiscardIndex < 0
      ? { status: "blocked_missing_facts" as const }
      : {
          status: "calculated" as const,
          value: relevantEvents.slice(0, declaringDiscardIndex + 1)
            .filter((event) => event.type === "dahai" &&
              event.actor === threat.actor).length,
        };
    return [{
      actor: threat.actor,
      kind: acceptance === undefined
        ? "riichi_declared" as const
        : "riichi_accepted" as const,
      source: "legacy_regression_bridge_only" as const,
      sourceEventRefs: [
        threat.declarationEventId,
        ...(acceptance === undefined ? [] : [acceptance.eventId]),
      ],
      openMeldRefs: [],
      dealerStatus: scene.oya === threat.actor
        ? "dealer" as const
        : "non_dealer" as const,
      riichiTurn,
      ippatsu: threat.ippatsuAlive === null
        ? { status: "blocked_missing_facts" as const }
        : { status: "calculated" as const, value: threat.ippatsuAlive },
    }];
  });
  return KnownGameFactsSchema.parse({
    factSetId: `legacy-regression:${decision.decisionId}`,
    provenance: "raw_replay",
    actor: scene.selfActor,
    selfRiichi: scene.threats[scene.selfActor]?.riichi ?? false,
    decisionEventRef: scene.decisionEventId,
    decisionWindow: {
      kind: "self_turn",
      actor: scene.selfActor,
      triggerEventRef: scene.decisionEventId,
    },
    concealedTiles: concealedBeforeDraw(scene),
    currentDraw,
    melds: replayed.melds,
    doraIndicators: scene.doraMarkers.map((tile) => ({ ...tile })),
    rivers: scene.rivers.map((river) => river.map((discard) => ({
      ...discard,
      tile: { ...discard.tile },
      afterRiichiEventIds: [...discard.afterRiichiEventIds],
    }))),
    threats: scene.threats.filter((threat) => threat.actor !== scene.selfActor)
      .map((threat) => ({ ...threat })),
    defenseThreats,
    roundWind: scene.bakaze,
    seatWind: seatWind(scene.selfActor, scene.oya),
    dealer: scene.selfActor === scene.oya,
    remainingDraws: null,
    completeness: {
      concealedTiles: true,
      melds: true,
      doraIndicators: replayed.doraIndicatorsComplete,
      rivers: true,
      remainingDraws: false,
      calledDiscardMarkers: replayed.calledDiscardMarkersComplete,
      roundContext: true,
    },
    evidenceIds: [...scene.eventIds],
  });
}

export function buildLegacyRegressionPipelineInput(
  events: readonly NormalizedEvent[],
  decision: NormalizedDecision,
  scene: SceneSnapshot,
  scope: ComparisonScope,
): LegacyRegressionPipelineInput {
  const facts = knownFacts(events, decision, scene);
  const actualAction = legacyDiscardActionIdToAction(decision.actualAction);
  const modelAction = legacyDiscardActionIdToAction(decision.modelAction);
  const actualRef = canonicalActionRef(actualAction);
  const modelRef = canonicalActionRef(modelAction);
  if (actualRef === modelRef) {
    throw new Error("legacy regression bridge requires two distinct discards");
  }
  const comparisonSet = StructuredComparisonSetSchema.parse({
    comparisonSetId: `legacy-regression:${decision.decisionId}`,
    origin: "automatic_review",
    decisionLayerRef: `legacy-regression:${decision.decisionId}:decision-layer`,
    decisionWindow: facts.decisionWindow,
    candidates: [
      { actionRef: actualRef, action: actualAction, origins: ["actual", "model"] },
      { actionRef: modelRef, action: modelAction, origins: ["model"] },
    ],
  });
  const frame = CurrentSceneFrameSchema.parse({
    kind: "current_scene",
    frameId: `legacy-regression:${decision.decisionId}:frame`,
    scope,
    sceneRef: scene.decisionEventId,
    facts: [{ factId: facts.factSetId, provenance: "raw_replay" }],
  });
  const byTile = analyzeAllDiscardEfficiency(scene);
  const legacyEfficiencyByActionRef: Record<string, DiscardEfficiencyMetric> = {};
  for (const candidate of comparisonSet.candidates) {
    if (candidate.action.kind !== "discard") continue;
    const metric = byTile[candidate.action.tile.id];
    if (metric === undefined) {
      throw new Error(`legacy regression metric missing for ${candidate.action.tile.id}`);
    }
    legacyEfficiencyByActionRef[candidate.actionRef] = metric;
  }
  return {
    frame,
    comparisonSet,
    facts,
    legacyEfficiencyByActionRef,
    diagnosticCodes: ["legacy_regression_bridge_only"],
  };
}
