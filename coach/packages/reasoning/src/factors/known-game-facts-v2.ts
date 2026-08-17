import { isDeepStrictEqual } from "node:util";
import {
  DecisionSnapshotV2Schema,
  KnownGameFactsSchema,
  type CanonicalEventStream,
  type CanonicalMeldV2,
  type DecisionSnapshotV2,
  type DecisionWindow,
  type KnownGameFacts,
  type KnownMeld,
  type YakuContextV2,
} from "@riichi-coach/contracts";
import {
  freezeDecisionSnapshot,
  freezeDecisionSnapshotInContext,
  type DecisionStreamContext,
} from "../replay/decision-snapshot.js";
import { CanonicalReplayError } from "../replay/round-reducer.js";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import {
  deriveResponseFuriten,
  type ResponseFuritenAnalysis,
} from "../replay/response-furiten.js";

export interface KnownGameFactsV2ProjectionInput {
  stream: CanonicalEventStream;
  decisionWindow: DecisionWindow;
  cachedSnapshot?: DecisionSnapshotV2;
  /**
   * A stream already parsed+reduced once (see freezeDecisionStreamContext).
   * When given, the verification freeze below shares that reduction instead
   * of re-reducing the whole stream per projection — reduce is pure and its
   * determinism is pinned by canonical-replay-invariance tests, so sharing
   * is memoization, not a semantic change: the snapshot is still re-frozen
   * (window assertions + schema parses) and still deep-compared against
   * cachedSnapshot.
   */
  streamContext?: DecisionStreamContext;
}

function knownMeld(meld: CanonicalMeldV2): KnownMeld {
  const meldRef = meld.meldRef;
  if (meld.kind === "ankan") {
    return {
      meldRef,
      kind: "ankan",
      actor: meld.actor,
      calledDiscardEventRef: null,
      tiles: meld.tiles.map((tile) => ({ ...tile })),
    };
  }
  if (meld.kind === "kakan") {
    return {
      meldRef,
      kind: "kakan",
      actor: meld.actor,
      calledDiscardEventRef: meld.calledDiscardEventRef,
      tiles: [
        { ...meld.calledTile },
        ...meld.consumedTiles.map((tile) => ({ ...tile })),
        { ...meld.addedTile },
      ],
    };
  }
  return {
    meldRef,
    kind: meld.kind,
    actor: meld.actor,
    calledDiscardEventRef: meld.calledDiscardEventRef,
    tiles: [
      { ...meld.calledTile },
      ...meld.consumedTiles.map((tile) => ({ ...tile })),
    ],
  };
}

function windTile(wind: "E" | "S" | "W" | "N"): number {
  return 27 + ["E", "S", "W", "N"].indexOf(wind);
}

function handStructureYakuContext(
  snapshot: DecisionSnapshotV2,
): YakuContextV2 {
  const { publicState } = snapshot;
  const windsKnown = publicState.fields.roundContext === "complete";
  const selfRiichi = publicState.riichiStates[snapshot.selfActor]!;
  const riichiStatus = selfRiichi.status === "accepted"
    ? "accepted" as const
    : selfRiichi.status === "none" &&
        publicState.fields.roundContext === "complete"
      ? "inactive" as const
      : "unknown" as const;
  const openTanyaoStatus = publicState.fields.ruleSet === "complete" &&
      publicState.ruleSet.openTanyao !== "unknown"
    ? publicState.ruleSet.openTanyao
      ? "enabled" as const
      : "disabled" as const
    : "unknown" as const;
  return {
    windsStatus: windsKnown ? "known" : "unknown",
    roundWindTile34: windsKnown ? windTile(publicState.roundWind) : null,
    selfWindTile34: windsKnown
      ? windTile(publicState.seatWinds[snapshot.selfActor]!)
      : null,
    riichiStatus,
    openTanyaoStatus,
  };
}

export function projectKnownGameFactsV2(
  input: KnownGameFactsV2ProjectionInput,
): KnownGameFacts {
  const snapshot = input.streamContext !== undefined
    ? freezeDecisionSnapshotInContext(input.streamContext, input.decisionWindow)
    : freezeDecisionSnapshot(input.stream, input.decisionWindow);
  if (input.cachedSnapshot !== undefined) {
    const cached = DecisionSnapshotV2Schema.safeParse(input.cachedSnapshot);
    if (!cached.success || !isDeepStrictEqual(cached.data, snapshot)) {
      throw new CanonicalReplayError("decision_snapshot_verification_failed");
    }
  }
  if (snapshot.publicState.roundWind === "W") {
    throw new CanonicalReplayError("known_facts_v2_unsupported_round_wind");
  }
  const eventOrder = new Map(
    snapshot.publicState.appliedEventRefs.map((eventRef, index) => [eventRef, index]),
  );
  const activeDeclarations = snapshot.publicState.riichiStates
    .filter((riichi) => riichi.status !== "none")
    .map((riichi) => riichi.declarationEventRef)
    .filter((eventRef): eventRef is string => eventRef !== null);
  const publicState = snapshot.publicState;
  const threats = publicState.riichiStates
    .filter((riichi) => riichi.actor !== snapshot.selfActor)
    .map((riichi) => ({
      actor: riichi.actor,
      riichi: riichi.status !== "none",
      declarationEventId: riichi.declarationEventRef,
      ippatsuAlive: riichi.ippatsuAlive,
    }));
  const threatSource = input.stream.sourceKind === "fixture"
    ? "legacy_regression_bridge_only" as const
    : input.stream.sourceKind === "user_asserted"
      ? "user_asserted" as const
      : "canonical_replay" as const;
  const defenseThreats = publicState.riichiStates.flatMap((riichi) => {
    if (riichi.status === "none" || riichi.actor === snapshot.selfActor) return [];
    if (riichi.declarationEventRef === null) {
      throw new CanonicalReplayError("known_facts_v2_missing_riichi_declaration");
    }
    const river = publicState.rivers[riichi.actor]!;
    const declaringIndex = river.findIndex((discard) =>
      discard.riichiDeclarationEventRef === riichi.declarationEventRef
    );
    return [{
      actor: riichi.actor,
      kind: riichi.status === "accepted"
        ? "riichi_accepted" as const
        : "riichi_declared" as const,
      source: threatSource,
      sourceEventRefs: [
        riichi.declarationEventRef,
        ...(riichi.acceptanceEventRef === null ? [] : [riichi.acceptanceEventRef]),
      ],
      openMeldRefs: [],
      dealerStatus: publicState.fields.roundContext === "complete"
        ? publicState.dealer === riichi.actor
          ? "dealer" as const
          : "non_dealer" as const
        : "unknown" as const,
      riichiTurn: publicState.fields.rivers === "complete" && declaringIndex >= 0
        ? { status: "calculated" as const, value: declaringIndex + 1 }
        : { status: "blocked_missing_facts" as const },
      ippatsu: riichi.ippatsuAlive === null
        ? { status: "blocked_missing_facts" as const }
        : { status: "calculated" as const, value: riichi.ippatsuAlive },
    }];
  });
  const privateState = snapshot.privateState;
  const provenance = input.stream.sourceKind === "user_asserted"
    ? "user_asserted"
    : input.stream.sourceKind === "fixture"
      ? "legacy_regression_bridge_only"
      : "raw_replay";
  const factSetPrefix = input.stream.sourceKind === "fixture"
    ? "legacy-regression"
    : input.stream.sourceKind === "user_asserted"
      ? "user-asserted"
      : "canonical-v2";
  return KnownGameFactsSchema.parse({
    factSetId: `${factSetPrefix}:${snapshot.streamPrefixHash}`,
    provenance,
    actor: snapshot.selfActor,
    selfRiichi: publicState.riichiStates[snapshot.selfActor]!.status !== "none",
    handStructureYakuContext: handStructureYakuContext(snapshot),
    decisionEventRef: snapshot.decisionEventRef,
    decisionWindow: privateState.decisionWindow,
    concealedTiles: privateState.concealedTiles.map((tile) => ({ ...tile })),
    currentDraw: privateState.currentDraw === null
      ? null
      : {
          tile: { ...privateState.currentDraw.tile },
          eventRef: privateState.currentDraw.eventRef,
        },
    melds: publicState.melds.map(knownMeld),
    doraIndicators: publicState.doraIndicators.map((tile) => ({ ...tile })),
    rivers: publicState.rivers.map((river) => river.map((discard) => {
      const discardIndex = eventOrder.get(discard.eventRef) ?? -1;
      return {
        tile: { ...discard.tile },
        actor: discard.actor,
        tsumogiri: discard.discardMode === "tsumogiri",
        eventId: discard.eventRef,
        afterRiichiEventIds: activeDeclarations.filter((declaration) =>
          (eventOrder.get(declaration) ?? Number.MAX_SAFE_INTEGER) < discardIndex
        ),
      };
    })),
    ...(publicState.fields.rivers === "complete" &&
        publicState.fields.calledDiscardMarkers === "complete" &&
        publicState.fields.roundContext === "complete" &&
        input.stream.completeness.eventSequence === "complete"
      ? {
          furitenSelfRiver: publicState.rivers[snapshot.selfActor]!.map(
            (discard) => ({
              eventRef: discard.eventRef,
              actor: discard.actor,
              tile: { ...discard.tile },
              discardMode: discard.discardMode,
              riichiDeclarationEventRef: discard.riichiDeclarationEventRef,
              calledByEventRef: discard.calledByEventRef,
            }),
          ),
        }
      : {}),
    threats,
    defenseThreats,
    roundWind: publicState.roundWind,
    seatWind: publicState.seatWinds[snapshot.selfActor],
    dealer: publicState.dealer === snapshot.selfActor,
    remainingDraws: publicState.fields.remainingDraws === "complete"
      ? publicState.remainingDraws
      : null,
    completeness: {
      concealedTiles: privateState.fields.concealedTiles === "complete",
      melds: publicState.fields.melds === "complete",
      doraIndicators: publicState.fields.doraIndicators === "complete",
      rivers: publicState.fields.rivers === "complete",
      remainingDraws: publicState.fields.remainingDraws === "complete",
      calledDiscardMarkers: publicState.fields.calledDiscardMarkers === "complete",
      responseOpportunities:
        privateState.fields.responseOpportunities === "complete",
      eventSequence: input.stream.completeness.eventSequence === "complete",
      roundContext: publicState.fields.roundContext === "complete",
    },
    evidenceIds: [...snapshot.evidenceIds],
  });
}

export async function projectAnalyzedKnownGameFactsV2(
  input: KnownGameFactsV2ProjectionInput,
  engine: HandStructureFactEnginePort,
): Promise<{
  facts: KnownGameFacts;
  responseFuriten: ResponseFuritenAnalysis;
}> {
  const facts = projectKnownGameFactsV2(input);
  const responseFuriten = await deriveResponseFuriten(
    input.stream,
    facts.decisionEventRef,
    engine,
  );
  return { facts, responseFuriten };
}
