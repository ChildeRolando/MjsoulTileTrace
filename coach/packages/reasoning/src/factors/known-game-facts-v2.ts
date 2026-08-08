import {
  DecisionSnapshotV2Schema,
  KnownGameFactsSchema,
  type CanonicalMeldV2,
  type DecisionSnapshotV2,
  type KnownGameFacts,
  type KnownMeld,
} from "@riichi-coach/contracts";
import { CanonicalReplayError } from "../replay/round-reducer.js";

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

export function projectKnownGameFactsV2(
  rawSnapshot: DecisionSnapshotV2,
): KnownGameFacts {
  const snapshot = DecisionSnapshotV2Schema.parse(rawSnapshot);
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
  const threats = snapshot.publicState.riichiStates
    .filter((riichi) => riichi.actor !== snapshot.selfActor)
    .map((riichi) => {
      if (riichi.ippatsuAlive === null) {
        throw new CanonicalReplayError("known_facts_v2_unknown_ippatsu");
      }
      return {
        actor: riichi.actor,
        riichi: riichi.status !== "none",
        declarationEventId: riichi.declarationEventRef,
        ippatsuAlive: riichi.ippatsuAlive,
      };
    });
  const privateState = snapshot.privateState;
  const publicState = snapshot.publicState;
  return KnownGameFactsSchema.parse({
    factSetId: `canonical-v2:${snapshot.streamPrefixHash}`,
    provenance: "raw_replay",
    actor: snapshot.selfActor,
    selfRiichi: publicState.riichiStates[snapshot.selfActor]!.status !== "none",
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
    threats,
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
    },
    evidenceIds: [...snapshot.evidenceIds],
  });
}
