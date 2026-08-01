import {
  ActionDraftSchema,
  CandidateNormalizationResultSchema,
  CandidateOriginSchema,
  KnownActionFactsSchema,
  RiichiActionSchema,
  StructuredComparisonCandidateSchema,
  TileSchema,
  actionWindowConflictCodes,
  canonicalActionRef,
  sortTilesCanonical,
  type ActionDraft,
  type CandidateNormalizationResult,
  type CandidateOrigin,
  type DraftTile,
  type KnownActionFacts,
  type RiichiAction,
  type Tile,
} from "@riichi-coach/contracts";

type Completion = {
  action?: RiichiAction;
  ambiguousFields: string[];
  structuralIssueCodes?: Array<
    | "chi_not_sequence"
    | "pon_tile_id_mismatch"
    | "daiminkan_tile_id_mismatch"
    | "ankan_tile_id_mismatch"
    | "consumed_tiles_not_canonical"
    | "ankan_tiles_not_canonical"
    | "invalid_completed_action"
  >;
};
type StructuralIssueCode = NonNullable<
  Completion["structuralIssueCodes"]
>[number];

function sameTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function knownAvailableTiles(facts: KnownActionFacts): Tile[] | undefined {
  if (facts.concealedTiles === undefined || facts.currentDraw === undefined) {
    return undefined;
  }
  return [
    ...facts.concealedTiles,
    ...(facts.currentDraw === null ? [] : [facts.currentDraw.tile]),
  ];
}

function knownDiscardTiles(
  discardMode: "tsumogiri" | "tedashi" | undefined,
  facts: KnownActionFacts,
): Tile[] | undefined {
  if (discardMode === "tsumogiri") {
    if (facts.currentDraw === undefined) {
      return undefined;
    }
    return facts.currentDraw === null ? [] : [facts.currentDraw.tile];
  }
  if (discardMode === "tedashi") {
    return facts.concealedTiles;
  }
  return knownAvailableTiles(facts);
}

function resolveTile(
  draft: DraftTile | undefined,
  knownTiles: readonly Tile[] | undefined,
  missingField: string,
  redField: string,
  ambiguousFields: string[],
): Tile | undefined {
  if (draft === undefined) {
    ambiguousFields.push(missingField);
    return undefined;
  }
  if (draft.red !== undefined) {
    return TileSchema.parse(draft);
  }
  if (!["5m", "5p", "5s"].includes(draft.id)) {
    return TileSchema.parse({ id: draft.id, red: false });
  }
  if (knownTiles !== undefined) {
    const matching = knownTiles.filter((tile) => tile.id === draft.id);
    const redValues = [...new Set(matching.map((tile) => tile.red))];
    if (redValues.length === 1) {
      return TileSchema.parse({ id: draft.id, red: redValues[0]! });
    }
    if (redValues.length === 0) {
      return TileSchema.parse({ id: draft.id, red: false });
    }
  }
  ambiguousFields.push(redField);
  return undefined;
}

function resolveTiles<T extends readonly DraftTile[]>(
  drafts: T | undefined,
  knownTiles: readonly Tile[] | undefined,
  field: string,
  ambiguousFields: string[],
): { [K in keyof T]: Tile } | undefined {
  if (drafts === undefined) {
    ambiguousFields.push(field);
    return undefined;
  }
  if (knownTiles === undefined) {
    const resolved = drafts.map((draft) =>
      resolveTile(draft, undefined, field, field, ambiguousFields)
    );
    return resolved.some((tile) => tile === undefined)
      ? undefined
      : resolved as unknown as { [K in keyof T]: Tile };
  }

  const remaining = [...knownTiles];
  const resolved: Array<Tile | undefined> = new Array(drafts.length);
  const unresolvedFives = new Map<string, number[]>();

  drafts.forEach((draft, index) => {
    if (
      draft.red === undefined &&
      ["5m", "5p", "5s"].includes(draft.id)
    ) {
      const positions = unresolvedFives.get(draft.id) ?? [];
      positions.push(index);
      unresolvedFives.set(draft.id, positions);
      return;
    }

    const tile = TileSchema.parse({
      id: draft.id,
      red: draft.red ?? false,
    });
    resolved[index] = tile;
    const availableIndex = remaining.findIndex((item) =>
      sameTile(item, tile)
    );
    if (availableIndex >= 0) {
      remaining.splice(availableIndex, 1);
    }
  });

  for (const [id, positions] of unresolvedFives) {
    const matches = remaining.filter((tile) => tile.id === id);
    let chosen: Tile[];
    if (matches.length < positions.length) {
      chosen = [
        ...matches,
        ...Array.from(
          { length: positions.length - matches.length },
          () => TileSchema.parse({ id, red: false }),
        ),
      ];
    } else if (matches.length === positions.length) {
      chosen = [...matches];
    } else if (new Set(matches.map((tile) => tile.red)).size === 1) {
      chosen = matches.slice(0, positions.length);
    } else {
      ambiguousFields.push(field);
      continue;
    }

    const canonical = sortTilesCanonical(chosen);
    positions.forEach((position, index) => {
      const tile = canonical[index]!;
      resolved[position] = tile;
      const availableIndex = remaining.findIndex((item) =>
        sameTile(item, tile)
      );
      if (availableIndex >= 0) {
        remaining.splice(availableIndex, 1);
      }
    });
  }

  return resolved.some((tile) => tile === undefined)
    ? undefined
    : resolved as unknown as { [K in keyof T]: Tile };
}

function inferDiscardMode(
  tile: Tile | undefined,
  draftMode: "tsumogiri" | "tedashi" | undefined,
  facts: KnownActionFacts,
  ambiguousFields: string[],
): "tsumogiri" | "tedashi" | undefined {
  if (draftMode !== undefined) {
    return draftMode;
  }
  if (facts.decisionWindow.kind === "post_call_discard") {
    return "tedashi";
  }
  if (facts.currentDraw === null) {
    return "tedashi";
  }
  if (facts.currentDraw !== undefined && tile !== undefined) {
    if (!sameTile(facts.currentDraw.tile, tile)) {
      return "tedashi";
    }
    const concealedMatch = facts.concealedTiles?.some((item) =>
      sameTile(item, tile)
    );
    if (concealedMatch === false) {
      return "tsumogiri";
    }
  }
  ambiguousFields.push("discardMode");
  return undefined;
}

function sourceActor(facts: KnownActionFacts): number | undefined {
  const window = facts.decisionWindow;
  return (
      window.kind === "discard_response" || window.kind === "kan_response"
    ) && window.sourceActor !== null
    ? window.sourceActor
    : undefined;
}

function offeredTile(facts: KnownActionFacts): Tile | undefined {
  const window = facts.decisionWindow;
  return window.kind === "discard_response" || window.kind === "kan_response"
    ? window.offeredTile
    : undefined;
}

function responseKind(
  facts: KnownActionFacts,
): "discard" | "kakan" | "ankan" | undefined {
  const window = facts.decisionWindow;
  return window.kind === "discard_response"
    ? "discard"
    : window.kind === "kan_response"
      ? window.kanKind
      : undefined;
}

function requireValue<T>(
  value: T | undefined,
  field: string,
  ambiguousFields: string[],
): T | undefined {
  if (value === undefined) {
    ambiguousFields.push(field);
  }
  return value;
}

function completeAction(
  rawDraft: ActionDraft,
  facts: KnownActionFacts,
): Completion {
  const draft = ActionDraftSchema.parse(rawDraft);
  const ambiguousFields: string[] = [];
  const available = knownAvailableTiles(facts);
  const concealed = facts.concealedTiles;
  let candidate: unknown;

  switch (draft.kind) {
    case "discard":
    case "riichi_discard": {
      const inferredSourceMode =
        draft.discardMode ??
        (facts.decisionWindow.kind === "post_call_discard" ||
            facts.currentDraw === null
          ? "tedashi"
          : undefined);
      const actionTile = resolveTile(
        draft.tile,
        knownDiscardTiles(inferredSourceMode, facts),
        "tile",
        "tile.red",
        ambiguousFields,
      );
      const discardMode = inferDiscardMode(
        actionTile,
        draft.discardMode,
        facts,
        ambiguousFields,
      );
      candidate = {
        kind: draft.kind,
        tile: actionTile,
        discardMode,
      };
      break;
    }
    case "chi":
    case "pon":
    case "daiminkan": {
      const windowTile = offeredTile(facts);
      const calledTile = resolveTile(
        draft.calledTile ??
          (windowTile === undefined
            ? undefined
            : { id: windowTile.id, red: windowTile.red }),
        windowTile === undefined ? undefined : [windowTile],
        "calledTile",
        "calledTile.red",
        ambiguousFields,
      );
      const consumedTiles = resolveTiles(
        draft.consumedTiles,
        concealed,
        "consumedTiles",
        ambiguousFields,
      );
      candidate = {
        kind: draft.kind,
        calledTile,
        consumedTiles: consumedTiles === undefined
          ? undefined
          : sortTilesCanonical(consumedTiles),
        targetActor: requireValue(
          draft.targetActor ?? sourceActor(facts),
          "targetActor",
          ambiguousFields,
        ),
        responseEventRef:
          draft.responseEventRef ?? facts.decisionWindow.triggerEventRef,
      };
      break;
    }
    case "ankan": {
      const tiles = resolveTiles(
        draft.tiles,
        available,
        "tiles",
        ambiguousFields,
      );
      candidate = {
        kind: "ankan",
        tiles: tiles === undefined ? undefined : sortTilesCanonical(tiles),
      };
      break;
    }
    case "kakan":
      candidate = {
        kind: "kakan",
        addedTile: resolveTile(
          draft.addedTile,
          available,
          "addedTile",
          "addedTile.red",
          ambiguousFields,
        ),
        existingMeldRef: requireValue(
          draft.existingMeldRef,
          "existingMeldRef",
          ambiguousFields,
        ),
      };
      break;
    case "tsumo": {
      const knownDraw = facts.currentDraw;
      candidate = {
        kind: "tsumo",
        winningTile: resolveTile(
          draft.winningTile ??
            (knownDraw === null || knownDraw === undefined
              ? undefined
              : { id: knownDraw.tile.id, red: knownDraw.tile.red }),
          knownDraw ? [knownDraw.tile] : undefined,
          "winningTile",
          "winningTile.red",
          ambiguousFields,
        ),
        drawEventRef:
          draft.drawEventRef ?? facts.decisionWindow.triggerEventRef,
      };
      break;
    }
    case "ron": {
      const windowTile = offeredTile(facts);
      candidate = {
        kind: "ron",
        winningTile: resolveTile(
          draft.winningTile ??
            (windowTile && { id: windowTile.id, red: windowTile.red }),
          windowTile ? [windowTile] : undefined,
          "winningTile",
          "winningTile.red",
          ambiguousFields,
        ),
        targetActor: requireValue(
          draft.targetActor ?? sourceActor(facts),
          "targetActor",
          ambiguousFields,
        ),
        responseEventRef:
          draft.responseEventRef ?? facts.decisionWindow.triggerEventRef,
        winContext: requireValue(
          draft.winContext ?? responseKind(facts),
          "winContext",
          ambiguousFields,
        ),
      };
      break;
    }
    case "kyuushu_kyuuhai":
      candidate = {
        kind: "kyuushu_kyuuhai",
        drawEventRef:
          draft.drawEventRef ?? facts.decisionWindow.triggerEventRef,
      };
      break;
    case "pass":
      candidate = {
        kind: "pass",
        responseEventRef:
          draft.responseEventRef ?? facts.decisionWindow.triggerEventRef,
        responseKind: requireValue(
          draft.responseKind ?? responseKind(facts),
          "responseKind",
          ambiguousFields,
        ),
      };
      break;
  }

  if (ambiguousFields.length > 0) {
    return { ambiguousFields: unique(ambiguousFields) };
  }
  const parsed = RiichiActionSchema.safeParse(candidate);
  if (!parsed.success) {
    const issueCodes = parsed.error.issues.map(
      (issue): StructuralIssueCode => {
      if (draft.kind === "chi" && issue.path[0] === "consumedTiles") {
        return issue.message.includes("canonical")
          ? "consumed_tiles_not_canonical"
          : "chi_not_sequence";
      }
      if (draft.kind === "pon" && issue.path[0] === "consumedTiles") {
        return issue.message.includes("canonical")
          ? "consumed_tiles_not_canonical"
          : "pon_tile_id_mismatch";
      }
      if (
        draft.kind === "daiminkan" &&
        issue.path[0] === "consumedTiles"
      ) {
        return issue.message.includes("canonical")
          ? "consumed_tiles_not_canonical"
          : "daiminkan_tile_id_mismatch";
      }
      if (draft.kind === "ankan" && issue.path[0] === "tiles") {
        return issue.message.includes("canonical")
          ? "ankan_tiles_not_canonical"
          : "ankan_tile_id_mismatch";
      }
      return "invalid_completed_action";
    });
    return {
      ambiguousFields: [],
      structuralIssueCodes: unique(issueCodes),
    };
  }
  return {
    action: parsed.data,
    ambiguousFields: [],
  };
}

function containsMultiset(
  available: readonly Tile[],
  required: readonly Tile[],
): boolean {
  const remaining = [...available];
  for (const tile of required) {
    const index = remaining.findIndex((item) => sameTile(item, tile));
    if (index < 0) {
      return false;
    }
    remaining.splice(index, 1);
  }
  return true;
}

function containsDraftMultiset(
  available: readonly Tile[],
  required: readonly DraftTile[],
): boolean {
  const ordered = [...required].sort(
    (left, right) =>
      Number(right.red !== undefined) - Number(left.red !== undefined),
  );

  function search(index: number, remaining: readonly Tile[]): boolean {
    if (index === ordered.length) {
      return true;
    }
    const draft = ordered[index]!;
    return remaining.some((tile, tileIndex) => {
      if (
        tile.id !== draft.id ||
        (draft.red !== undefined && tile.red !== draft.red)
      ) {
        return false;
      }
      return search(index + 1, [
        ...remaining.slice(0, tileIndex),
        ...remaining.slice(tileIndex + 1),
      ]);
    });
  }

  return search(0, available);
}

function missingDraftTileCount(
  available: readonly Tile[],
  required: readonly DraftTile[],
): number {
  const ordered = [...required].sort(
    (left, right) =>
      Number(right.red !== undefined) - Number(left.red !== undefined),
  );
  let minimumMissing = ordered.length;

  function search(
    index: number,
    remaining: readonly Tile[],
    missing: number,
  ): void {
    if (missing >= minimumMissing) {
      return;
    }
    if (index === ordered.length) {
      minimumMissing = missing;
      return;
    }
    const draft = ordered[index]!;
    let matched = false;
    remaining.forEach((tile, tileIndex) => {
      if (
        tile.id !== draft.id ||
        (draft.red !== undefined && tile.red !== draft.red)
      ) {
        return;
      }
      matched = true;
      search(index + 1, [
        ...remaining.slice(0, tileIndex),
        ...remaining.slice(tileIndex + 1),
      ], missing);
    });
    if (!matched || missing + 1 < minimumMissing) {
      search(index + 1, remaining, missing + 1);
    }
  }

  search(0, available, 0);
  return minimumMissing;
}

function canFormOmittedCall(
  kind: "chi" | "pon" | "daiminkan",
  offered: Tile,
  concealedTiles: readonly Tile[],
): boolean {
  if (kind === "pon" || kind === "daiminkan") {
    const requiredCount = kind === "pon" ? 2 : 3;
    return concealedTiles.filter((tile) => tile.id === offered.id).length >=
      requiredCount;
  }
  if (offered.id.endsWith("z")) {
    return false;
  }
  const rank = Number(offered.id[0]);
  const suit = offered.id[1]!;
  for (
    let start = Math.max(1, rank - 2);
    start <= Math.min(7, rank);
    start += 1
  ) {
    const requiredIds = [start, start + 1, start + 2]
      .filter((candidateRank) => candidateRank !== rank)
      .map((candidateRank) => `${candidateRank}${suit}`);
    const remaining = [...concealedTiles];
    const possible = requiredIds.every((id) => {
      const index = remaining.findIndex((tile) => tile.id === id);
      if (index < 0) {
        return false;
      }
      remaining.splice(index, 1);
      return true;
    });
    if (possible) {
      return true;
    }
  }
  return false;
}

function checkConsistency(
  action: RiichiAction,
  facts: KnownActionFacts,
): {
  conflictCodes: string[];
  evidenceRefs: string[];
  skippedChecks: string[];
} {
  const conflicts: string[] = [
    ...actionWindowConflictCodes(action, facts.decisionWindow),
  ];
  const evidenceRefs: string[] = conflicts.length > 0
    ? [facts.decisionWindow.triggerEventRef]
    : [];
  const skippedChecks: string[] = [];

  if (action.kind === "discard" || action.kind === "riichi_discard") {
    if (action.discardMode === "tsumogiri") {
      if (facts.currentDraw === undefined) {
        skippedChecks.push("tsumogiri_current_draw");
      } else if (
        facts.currentDraw === null ||
        !sameTile(action.tile, facts.currentDraw.tile)
      ) {
        conflicts.push("tsumogiri_draw_mismatch");
        if (facts.currentDraw !== null) {
          evidenceRefs.push(facts.currentDraw.eventRef);
        }
      }
    } else if (facts.concealedTiles === undefined) {
      skippedChecks.push("tedashi_concealed_tile");
    } else if (!containsMultiset(facts.concealedTiles, [action.tile])) {
      conflicts.push("tedashi_tile_missing");
    }
  }

  if (
    action.kind === "chi" ||
    action.kind === "pon" ||
    action.kind === "daiminkan"
  ) {
    if (facts.concealedTiles === undefined) {
      skippedChecks.push("call_consumed_tiles");
    } else if (!containsMultiset(
      facts.concealedTiles,
      action.consumedTiles,
    )) {
      conflicts.push("consumed_tiles_missing");
    }
  }

  const window = facts.decisionWindow;
  if (
    window.kind === "discard_response" ||
    window.kind === "kan_response"
  ) {
    if (
      action.kind === "chi" ||
      action.kind === "pon" ||
      action.kind === "daiminkan" ||
      action.kind === "ron"
    ) {
      if (window.sourceActor === null) {
        skippedChecks.push("response_source_actor");
      } else if (action.targetActor !== window.sourceActor) {
        conflicts.push("response_source_actor_mismatch");
        evidenceRefs.push(window.triggerEventRef);
      }
    }
    const responseTile =
      action.kind === "chi" ||
        action.kind === "pon" ||
        action.kind === "daiminkan"
        ? action.calledTile
        : action.kind === "ron"
          ? action.winningTile
          : null;
    if (responseTile !== null && !sameTile(responseTile, window.offeredTile)) {
      conflicts.push("response_tile_mismatch");
      evidenceRefs.push(window.triggerEventRef);
    }
  }

  if (action.kind === "ankan") {
    const available = knownAvailableTiles(facts);
    if (available === undefined) {
      skippedChecks.push("ankan_known_tiles");
    } else if (!containsMultiset(available, action.tiles)) {
      conflicts.push("ankan_tiles_missing");
    }
  }

  if (action.kind === "kakan") {
    if (facts.melds === undefined) {
      skippedChecks.push("kakan_existing_meld");
    } else {
      const meld = facts.melds.find(
        (item) => item.meldRef === action.existingMeldRef,
      );
      if (meld === undefined) {
        conflicts.push("existing_meld_missing");
      } else {
        evidenceRefs.push(meld.meldRef);
        if (meld.kind !== "pon") {
          conflicts.push("existing_meld_not_pon");
        } else if (meld.tiles.some((tile) => tile.id !== action.addedTile.id)) {
          conflicts.push("kakan_tile_mismatch");
        }
      }
    }
    const available = knownAvailableTiles(facts);
    if (available === undefined) {
      skippedChecks.push("kakan_added_tile");
    } else if (!containsMultiset(available, [action.addedTile])) {
      conflicts.push("kakan_added_tile_missing");
    }
  }

  if (action.kind === "tsumo") {
    if (facts.currentDraw === undefined) {
      skippedChecks.push("tsumo_current_draw");
    } else if (
      facts.currentDraw === null ||
      !sameTile(action.winningTile, facts.currentDraw.tile)
    ) {
      conflicts.push("tsumo_draw_mismatch");
      if (facts.currentDraw !== null) {
        evidenceRefs.push(facts.currentDraw.eventRef);
      }
    }
  }

  return {
    conflictCodes: unique(conflicts),
    evidenceRefs: unique(evidenceRefs),
    skippedChecks: unique(skippedChecks),
  };
}

const allowedDraftKinds: Record<
  KnownActionFacts["decisionWindow"]["kind"],
  readonly ActionDraft["kind"][]
> = {
  self_turn: [
    "discard",
    "riichi_discard",
    "ankan",
    "kakan",
    "tsumo",
    "kyuushu_kyuuhai",
  ],
  discard_response: ["chi", "pon", "daiminkan", "ron", "pass"],
  kan_response: ["ron", "pass"],
  post_call_discard: ["discard"],
};

function directDraftConflicts(
  draft: ActionDraft,
  facts: KnownActionFacts,
): {
  conflictCodes: string[];
  evidenceRefs: string[];
} {
  const window = facts.decisionWindow;
  if (!allowedDraftKinds[window.kind].includes(draft.kind)) {
    return {
      conflictCodes: ["action_not_allowed_in_window"],
      evidenceRefs: [window.triggerEventRef],
    };
  }

  const conflictCodes: string[] = [];
  const evidenceRefs: string[] = [];
  const responseWindow =
    window.kind === "discard_response" || window.kind === "kan_response"
      ? window
      : null;

  if (
    responseWindow !== null &&
    (draft.kind === "chi" ||
      draft.kind === "pon" ||
      draft.kind === "daiminkan" ||
      draft.kind === "ron" ||
      draft.kind === "pass") &&
    draft.responseEventRef !== undefined &&
    draft.responseEventRef !== responseWindow.triggerEventRef
  ) {
    conflictCodes.push("response_event_mismatch");
    evidenceRefs.push(responseWindow.triggerEventRef);
  }
  if (
    responseWindow !== null &&
    (draft.kind === "chi" ||
      draft.kind === "pon" ||
      draft.kind === "daiminkan" ||
      draft.kind === "ron") &&
    draft.targetActor !== undefined &&
    responseWindow.actor !== null &&
    draft.targetActor === responseWindow.actor
  ) {
    conflictCodes.push("response_target_self");
    evidenceRefs.push(responseWindow.triggerEventRef);
  }
  if (
    responseWindow !== null &&
    (draft.kind === "chi" ||
      draft.kind === "pon" ||
      draft.kind === "daiminkan" ||
      draft.kind === "ron") &&
    draft.targetActor !== undefined &&
    responseWindow.sourceActor !== null &&
    draft.targetActor !== responseWindow.sourceActor
  ) {
    conflictCodes.push("response_source_actor_mismatch");
    evidenceRefs.push(responseWindow.triggerEventRef);
  }
  if (
    responseWindow !== null &&
    (draft.kind === "chi" ||
      draft.kind === "pon" ||
      draft.kind === "daiminkan" ||
      draft.kind === "ron")
  ) {
    const responseTile = draft.kind === "ron"
      ? draft.winningTile
      : draft.calledTile;
    if (
      responseTile !== undefined &&
      (responseTile.id !== responseWindow.offeredTile.id ||
        (responseTile.red !== undefined &&
          responseTile.red !== responseWindow.offeredTile.red))
    ) {
      conflictCodes.push("response_tile_mismatch");
      evidenceRefs.push(responseWindow.triggerEventRef);
    }
  }
  if (
    responseWindow !== null &&
    (draft.kind === "ron" || draft.kind === "pass")
  ) {
    const actualKind = draft.kind === "ron"
      ? draft.winContext
      : draft.responseKind;
    const expectedKind = responseWindow.kind === "discard_response"
      ? "discard"
      : responseWindow.kanKind;
    if (actualKind !== undefined && actualKind !== expectedKind) {
      conflictCodes.push("response_kind_mismatch");
      evidenceRefs.push(responseWindow.triggerEventRef);
    }
  }
  if (
    (draft.kind === "tsumo" || draft.kind === "kyuushu_kyuuhai") &&
    draft.drawEventRef !== undefined &&
    draft.drawEventRef !== window.triggerEventRef
  ) {
    conflictCodes.push("draw_event_mismatch");
    evidenceRefs.push(window.triggerEventRef);
  }
  if (
    draft.kind === "discard" ||
    draft.kind === "riichi_discard"
  ) {
    const forcedTedashi =
      draft.discardMode === "tedashi" ||
      (draft.discardMode === undefined &&
        (window.kind === "post_call_discard" ||
          facts.currentDraw === null));
    if (forcedTedashi && facts.concealedTiles?.length === 0) {
      conflictCodes.push("tedashi_tile_missing");
    }
  }
  if (
    draft.kind === "chi" ||
    draft.kind === "pon" ||
    draft.kind === "daiminkan"
  ) {
    const requiredCount = draft.kind === "daiminkan" ? 3 : 2;
    const offered = responseWindow?.offeredTile;
    if (
      facts.concealedTiles !== undefined &&
      (draft.consumedTiles === undefined
        ? facts.concealedTiles.length < requiredCount ||
          (offered !== undefined &&
            !canFormOmittedCall(
              draft.kind,
              offered,
              facts.concealedTiles,
            ))
        : !containsDraftMultiset(
          facts.concealedTiles,
          draft.consumedTiles,
        ))
    ) {
      conflictCodes.push("consumed_tiles_missing");
    }
  }
  if (draft.kind === "ankan") {
    const knownTiles = facts.concealedTiles === undefined
      ? undefined
      : [
        ...facts.concealedTiles,
        ...(facts.currentDraw === undefined || facts.currentDraw === null
          ? []
          : [facts.currentDraw.tile]),
      ];
    const unknownDrawAllowance = facts.currentDraw === undefined ? 1 : 0;
    if (
      knownTiles !== undefined &&
      (draft.tiles === undefined
        ? ![...new Set(knownTiles.map((tile) => tile.id))].some(
          (id) =>
            knownTiles.filter((tile) => tile.id === id).length +
              unknownDrawAllowance >= 4,
        )
        : missingDraftTileCount(knownTiles, draft.tiles) >
          unknownDrawAllowance)
    ) {
      conflictCodes.push("ankan_tiles_missing");
    }
  }
  if (draft.kind === "kakan") {
    if (
      draft.existingMeldRef !== undefined &&
      facts.melds !== undefined
    ) {
      const meld = facts.melds.find(
        (item) => item.meldRef === draft.existingMeldRef,
      );
      if (meld === undefined) {
        conflictCodes.push("existing_meld_missing");
      } else if (meld.kind !== "pon") {
        conflictCodes.push("existing_meld_not_pon");
        evidenceRefs.push(meld.meldRef);
      } else if (
        draft.addedTile !== undefined &&
        meld.tiles.some((tile) => tile.id !== draft.addedTile!.id)
      ) {
        conflictCodes.push("kakan_tile_mismatch");
        evidenceRefs.push(meld.meldRef);
      }
    }

    const available = knownAvailableTiles(facts);
    if (
      draft.addedTile !== undefined &&
      available !== undefined &&
      !available.some((tile) =>
        tile.id === draft.addedTile!.id &&
        (draft.addedTile!.red === undefined ||
          tile.red === draft.addedTile!.red)
      )
    ) {
      conflictCodes.push("kakan_added_tile_missing");
    }

    if (
      draft.existingMeldRef === undefined &&
      facts.melds !== undefined &&
      !facts.melds.some((meld) => meld.kind === "pon")
    ) {
      conflictCodes.push("existing_meld_missing");
    }
    if (
      draft.existingMeldRef === undefined &&
      draft.addedTile !== undefined &&
      facts.melds !== undefined
    ) {
      const knownPons = facts.melds.filter((meld) => meld.kind === "pon");
      if (
        knownPons.length > 0 &&
        !knownPons.some(
          (meld) => meld.tiles[0]!.id === draft.addedTile!.id,
        )
      ) {
        conflictCodes.push("kakan_tile_mismatch");
        evidenceRefs.push(...knownPons.map((meld) => meld.meldRef));
      }
    }

    if (draft.addedTile === undefined && available !== undefined) {
      const referencedPon = draft.existingMeldRef === undefined
        ? undefined
        : facts.melds?.find(
          (meld) =>
            meld.meldRef === draft.existingMeldRef &&
            meld.kind === "pon",
        );
      const possiblePonIds = referencedPon === undefined
        ? facts.melds
          ?.filter((meld) => meld.kind === "pon")
          .map((meld) => meld.tiles[0]!.id)
        : [referencedPon.tiles[0]!.id];
      if (
        available.length === 0 ||
        (possiblePonIds !== undefined &&
          possiblePonIds.length > 0 &&
          !available.some((tile) => possiblePonIds.includes(tile.id)))
      ) {
        conflictCodes.push("kakan_added_tile_missing");
      }
    }
  }
  if (
    window.kind === "post_call_discard" &&
    draft.kind === "discard" &&
    draft.discardMode === "tsumogiri"
  ) {
    conflictCodes.push("post_call_discard_requires_tedashi");
    evidenceRefs.push(window.triggerEventRef);
  }
  if (
    draft.kind === "tsumo" &&
    facts.currentDraw === null
  ) {
    conflictCodes.push("tsumo_draw_mismatch");
  }
  if (
    (draft.kind === "discard" || draft.kind === "riichi_discard") &&
    draft.discardMode === "tsumogiri" &&
    facts.currentDraw === null
  ) {
    conflictCodes.push("tsumogiri_draw_mismatch");
  }

  return {
    conflictCodes: unique(conflictCodes),
    evidenceRefs: unique(evidenceRefs),
  };
}

export function normalizeCandidate(input: {
  draft: ActionDraft;
  origin: CandidateOrigin;
  facts: KnownActionFacts;
}): CandidateNormalizationResult {
  const facts = KnownActionFactsSchema.parse(input.facts);
  const origin = CandidateOriginSchema.parse(input.origin);
  const draft = ActionDraftSchema.parse(input.draft);
  const completion = completeAction(draft, facts);
  if (completion.structuralIssueCodes !== undefined) {
    return CandidateNormalizationResultSchema.parse({
      status: "structurally_invalid_action",
      issueCodes: completion.structuralIssueCodes,
    });
  }
  const directConflicts = directDraftConflicts(draft, facts);
  if (directConflicts.conflictCodes.length > 0) {
    return CandidateNormalizationResultSchema.parse({
      status: "inconsistent_with_known_facts",
      conflictCodes: directConflicts.conflictCodes,
      evidenceRefs: directConflicts.evidenceRefs,
    });
  }
  if (completion.action === undefined) {
    return CandidateNormalizationResultSchema.parse({
      status: "needs_clarification",
      ambiguousFields: completion.ambiguousFields,
    });
  }
  const consistency = checkConsistency(completion.action, facts);
  if (consistency.conflictCodes.length > 0) {
    return CandidateNormalizationResultSchema.parse({
      status: "inconsistent_with_known_facts",
      conflictCodes: consistency.conflictCodes,
      evidenceRefs: consistency.evidenceRefs,
    });
  }
  const candidate = StructuredComparisonCandidateSchema.parse({
    actionRef: canonicalActionRef(completion.action),
    action: completion.action,
    origins: [origin],
  });
  return CandidateNormalizationResultSchema.parse({
    status: "ready",
    candidate,
    decisionWindow: facts.decisionWindow,
    consistency: consistency.skippedChecks.length > 0
      ? "unknown_due_to_missing_facts"
      : "consistent",
    skippedChecks: consistency.skippedChecks,
  });
}
