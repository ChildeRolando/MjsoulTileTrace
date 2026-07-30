import {
  SceneSnapshotSchema,
  type NormalizedDecision,
  type NormalizedEvent,
  type SceneSnapshot,
  type Tile,
} from "@riichi-coach/contracts";

type MutableRound = Omit<
  SceneSnapshot,
  "decisionEventId" | "eventIds" | "complete"
>;

function removeOne(hand: Tile[], tile: Tile): void {
  const index = hand.findIndex((item) => item.id === tile.id && item.red === tile.red);
  if (index < 0) {
    throw new Error(`Self discard ${tile.id} was not present in visible hand`);
  }
  hand.splice(index, 1);
}

function isCall(
  event: NormalizedEvent,
): event is Extract<NormalizedEvent, { consumed: Tile[] }> {
  return (
    event.type === "chi" ||
    event.type === "pon" ||
    event.type === "daiminkan" ||
    event.type === "ankan" ||
    event.type === "kakan"
  );
}

export function replayToDecision(
  events: NormalizedEvent[],
  decision: NormalizedDecision,
  selfActor = 3,
): SceneSnapshot {
  let round: MutableRound | null = null;
  const eventIds: string[] = [];
  const acceptedRiichi = new Set<number>();

  for (const event of events) {
    eventIds.push(event.eventId);
    if (event.type === "start_game") {
      continue;
    }
    if (event.type === "start_kyoku") {
      round = {
        selfActor,
        bakaze: event.bakaze,
        kyoku: event.kyoku,
        honba: event.honba,
        kyotaku: event.kyotaku,
        oya: event.oya,
        scores: [...event.scores],
        doraMarkers: [event.doraMarker],
        selfHand: [...event.selfHand],
        currentDraw: null,
        rivers: [[], [], [], []],
        threats: [0, 1, 2, 3].map((actor) => ({
          actor,
          riichi: false,
          declarationEventId: null,
          ippatsuAlive: false,
        })),
      };
      acceptedRiichi.clear();
      continue;
    }
    if (!round) {
      throw new Error(`Event ${event.eventId} arrived before start_kyoku`);
    }

    if (event.type === "reach") {
      round.threats[event.actor] = {
        actor: event.actor,
        riichi: true,
        declarationEventId: event.eventId,
        ippatsuAlive: true,
      };
    } else if (event.type === "reach_accepted") {
      acceptedRiichi.add(event.actor);
      round.scores[event.actor] = round.scores[event.actor]! - 1000;
      round.kyotaku += 1;
    } else if (isCall(event)) {
      round.threats = round.threats.map((threat) => ({
        ...threat,
        ippatsuAlive: false,
      }));
      if (event.actor === selfActor) {
        for (const tile of event.consumed) {
          removeOne(round.selfHand, tile);
        }
      }
    } else if (event.type === "tsumo") {
      if (event.actor === selfActor) {
        round.selfHand.push(event.tile);
        round.currentDraw = event.tile;
      }
    } else if (event.type === "dahai") {
      const activeRiichi = round.threats
        .filter((threat) => threat.riichi)
        .map((threat) => threat.declarationEventId)
        .filter((id): id is string => id !== null);
      round.rivers[event.actor]!.push({
        tile: event.tile,
        actor: event.actor,
        tsumogiri: event.tsumogiri,
        eventId: event.eventId,
        afterRiichiEventIds: activeRiichi,
      });
      if (event.actor === selfActor) {
        removeOne(round.selfHand, event.tile);
        round.currentDraw = null;
      }
      if (acceptedRiichi.has(event.actor)) {
        const threat = round.threats[event.actor]!;
        round.threats[event.actor] = {
          ...threat,
          ippatsuAlive: false,
        };
      }
    }

    if (event.eventId === decision.sceneEventId) {
      return SceneSnapshotSchema.parse({
        ...round,
        decisionEventId: event.eventId,
        eventIds,
        complete: true,
      });
    }
  }

  throw new Error(`Decision scene ${decision.sceneEventId} not found`);
}
