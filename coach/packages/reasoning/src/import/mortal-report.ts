import {
  ActionIdSchema,
  NormalizedDecisionSchema,
  NormalizedEventSchema,
  TileSchema,
  type NormalizedDecision,
  type NormalizedEvent,
  type Tile,
} from "@riichi-coach/contracts";

const honors: Record<string, Tile["id"]> = {
  E: "1z",
  S: "2z",
  W: "3z",
  N: "4z",
  P: "5z",
  F: "6z",
  C: "7z",
};

export function parseMjaiTile(value: string): Tile {
  const red = value.endsWith("r");
  const base = red ? value.slice(0, -1) : value;
  return TileSchema.parse({
    id: honors[base] ?? base,
    red,
  });
}

type RawAction = {
  type: string;
  pai?: string;
  tsumogiri?: boolean;
};

function actionId(action: RawAction): NormalizedDecision["modelAction"] {
  if (action.type !== "dahai" || !action.pai) {
    throw new Error(`Unsupported regression action: ${action.type}`);
  }
  const tile = parseMjaiTile(action.pai);
  const tileKey = `${tile.id}${tile.red ? "r" : ""}`;
  return ActionIdSchema.parse(
    `discard:${tileKey}:${action.tsumogiri ? "tsumogiri" : "tedashi"}`,
  );
}

type RawEvent = Record<string, unknown> & { type: string };

function normalizeEvent(raw: RawEvent, index: number, selfActor: number): NormalizedEvent {
  const eventId = `event-${index}`;
  if (raw.type === "start_game") {
    return NormalizedEventSchema.parse({ type: "start_game", eventId, playerCount: 4 });
  }
  if (raw.type === "start_kyoku") {
    const hands = raw.tehais as string[][];
    return NormalizedEventSchema.parse({
      type: "start_kyoku",
      eventId,
      bakaze: raw.bakaze,
      kyoku: raw.kyoku,
      honba: raw.honba,
      kyotaku: raw.kyotaku,
      oya: raw.oya,
      scores: raw.scores,
      doraMarker: parseMjaiTile(raw.dora_marker as string),
      selfHand: hands[selfActor]?.map(parseMjaiTile),
    });
  }
  if (raw.type === "tsumo") {
    return NormalizedEventSchema.parse({
      type: "tsumo",
      eventId,
      actor: raw.actor,
      tile:
        raw.actor === selfActor
          ? parseMjaiTile(raw.pai as string)
          : null,
    });
  }
  if (raw.type === "dahai") {
    return NormalizedEventSchema.parse({
      type: "dahai",
      eventId,
      actor: raw.actor,
      tile: parseMjaiTile(raw.pai as string),
      tsumogiri: raw.tsumogiri,
    });
  }
  if (raw.type === "reach" || raw.type === "reach_accepted") {
    return NormalizedEventSchema.parse({
      type: raw.type,
      eventId,
      actor: raw.actor,
    });
  }
  if (
    raw.type === "chi" ||
    raw.type === "pon" ||
    raw.type === "daiminkan" ||
    raw.type === "ankan" ||
    raw.type === "kakan"
  ) {
    return NormalizedEventSchema.parse({
      type: raw.type,
      eventId,
      actor: raw.actor,
      target: raw.target ?? null,
      tile: parseMjaiTile(raw.pai as string),
      consumed: (raw.consumed as string[]).map(parseMjaiTile),
    });
  }
  if (raw.type === "end_kyoku" || raw.type === "end_game") {
    return NormalizedEventSchema.parse({ type: raw.type, eventId });
  }
  throw new Error(`Unsupported regression event: ${raw.type}`);
}

type RawDecision = {
  junme: number;
  tile: string;
  expected: RawAction;
  actual: RawAction;
  details: Array<{
    action: RawAction;
    prob: number;
    q_value: number;
  }>;
};

export type RegressionFixture = {
  source: {
    modelTag: string;
    playerId: number;
  };
  mjaiLog: RawEvent[];
  decisions: RawDecision[];
};

export function importRegressionFixture(
  raw: RegressionFixture,
): {
  selfActor: number;
  events: NormalizedEvent[];
  decisions: NormalizedDecision[];
} {
  const events = raw.mjaiLog.map(
    (event, index) => normalizeEvent(event, index, raw.source.playerId),
  );
  const decisions = raw.decisions.map((entry) => {
    if (entry.junme !== 6 && entry.junme !== 7) {
      throw new Error(`Unexpected regression turn: ${entry.junme}`);
    }
    const sceneEventId = entry.junme === 6 ? "event-50" : "event-62";
    const sceneEvent = events.find(
      (event) =>
        event.eventId === sceneEventId &&
        event.type === "tsumo" &&
        event.actor === raw.source.playerId &&
        event.tile !== null &&
        event.tile.id === parseMjaiTile(entry.tile).id,
    );
    if (!sceneEvent) {
      throw new Error(`Cannot map East 1 turn ${entry.junme} to replay event`);
    }

    return NormalizedDecisionSchema.parse({
      decisionId: `east1-turn${entry.junme}`,
      sceneEventId,
      junme: entry.junme,
      modelName: `Mortal ${raw.source.modelTag}`,
      modelAction: actionId(entry.expected),
      actualAction: actionId(entry.actual),
      candidates: entry.details.map((detail) => ({
        actionId: actionId(detail.action),
        probability: detail.prob,
        qValue: detail.q_value,
      })),
      modelReason: "unknown",
    });
  });

  return { selfActor: raw.source.playerId, events, decisions };
}
