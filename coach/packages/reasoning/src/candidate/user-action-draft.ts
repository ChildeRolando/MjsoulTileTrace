import {
  ActionDraftSchema,
  CompactTileNotationSchema,
  UserActionDraftSchema,
  type ActionDraft,
  type DraftTile,
  type UserActionDraft,
} from "@riichi-coach/contracts";

export function parseCompactDraftTile(value: string): DraftTile {
  const notation = CompactTileNotationSchema.parse(value);
  const explicitRed = notation.endsWith("r");
  const explicitNormal = notation.endsWith("n");
  const id = explicitRed || explicitNormal
    ? notation.slice(0, -1)
    : notation;
  return {
    id: id as DraftTile["id"],
    ...(explicitRed
      ? { red: true }
      : explicitNormal
        ? { red: false }
        : id.startsWith("5") && !id.endsWith("z")
          ? {}
          : { red: false }),
  };
}

function tile(value: string | undefined): DraftTile | undefined {
  return value === undefined ? undefined : parseCompactDraftTile(value);
}

function tiles<T extends readonly string[]>(
  values: T | undefined,
): { [K in keyof T]: DraftTile } | undefined {
  return values === undefined
    ? undefined
    : values.map(parseCompactDraftTile) as unknown as {
        [K in keyof T]: DraftTile;
      };
}

function present<K extends string, V>(
  key: K,
  value: V | undefined,
): { [P in K]?: V } {
  return value === undefined ? {} : { [key]: value } as { [P in K]?: V };
}

export function userActionDraftToActionDraft(
  rawDraft: UserActionDraft,
): ActionDraft {
  const draft = UserActionDraftSchema.parse(rawDraft);
  const converted: unknown = (() => {
    switch (draft.actionName) {
      case "切牌":
      case "立直切牌":
        return {
          kind: draft.actionName === "切牌" ? "discard" : "riichi_discard",
          ...present("tile", tile(draft.tile)),
          ...present("discardMode", draft.discardMode),
        };
      case "吃":
      case "碰":
        return {
          kind: draft.actionName === "吃" ? "chi" : "pon",
          ...present("calledTile", tile(draft.calledTile)),
          ...present("consumedTiles", tiles(draft.consumedTiles)),
          ...present("targetActor", draft.targetActor),
          ...present("responseEventRef", draft.responseEventRef),
        };
      case "大明杠":
        return {
          kind: "daiminkan",
          ...present("calledTile", tile(draft.calledTile)),
          ...present("consumedTiles", tiles(draft.consumedTiles)),
          ...present("targetActor", draft.targetActor),
          ...present("responseEventRef", draft.responseEventRef),
        };
      case "暗杠":
        return {
          kind: "ankan",
          ...present("tiles", tiles(draft.tiles)),
        };
      case "加杠":
        return {
          kind: "kakan",
          ...present("addedTile", tile(draft.addedTile)),
          ...present("existingMeldRef", draft.existingMeldRef),
        };
      case "自摸":
        return {
          kind: "tsumo",
          ...present("winningTile", tile(draft.winningTile)),
          ...present("drawEventRef", draft.drawEventRef),
        };
      case "荣和":
        return {
          kind: "ron",
          ...present("winningTile", tile(draft.winningTile)),
          ...present("targetActor", draft.targetActor),
          ...present("responseEventRef", draft.responseEventRef),
          ...present("winContext", draft.winContext),
        };
      case "九种九牌":
        return {
          kind: "kyuushu_kyuuhai",
          ...present("drawEventRef", draft.drawEventRef),
        };
      case "过":
        return {
          kind: "pass",
          ...present("responseEventRef", draft.responseEventRef),
          ...present("responseKind", draft.responseKind),
        };
    }
  })();
  return ActionDraftSchema.parse(converted);
}
