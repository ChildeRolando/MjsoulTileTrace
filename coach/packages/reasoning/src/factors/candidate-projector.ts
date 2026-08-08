import {
  KnownGameFactsSchema,
  StructuredComparisonCandidateSchema,
  type ActionRef,
  type CandidateDiscardEvidenceV2,
  type CompletedHandFactRequest,
  type Hand13FactRequest,
  type HandStructureRequestV2,
  type KnownGameFacts,
  type StructuredComparisonCandidate,
  type ThreatRiskFactRequest,
  type Tile,
} from "@riichi-coach/contracts";
import {
  buildHandStructureRequestV2,
} from "./hand-structure-projector.js";
import {
  doraFromIndicator,
  redFiveCounts,
  stableProjectedStateHash,
  tileIdTo34,
  tilesTo34Counts,
} from "./tile34.js";

export type CandidateProjection =
  | {
      status: "ready";
      actionRef: ActionRef;
      projectedStateRef: string;
      hand13Request?: Hand13FactRequest;
      handStructureRequest?: HandStructureRequestV2;
      candidateDiscard?: CandidateDiscardEvidenceV2;
      completedHandRequest?: CompletedHandFactRequest;
      threatRiskRequests: ThreatRiskFactRequest[];
      localEvidenceIds: string[];
      diagnostics: string[];
    }
  | {
      status: "blocked_missing_facts" | "unsupported_action_in_slice";
      actionRef: ActionRef;
      diagnostic: string;
    };

function sameTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function removeExact(tiles: readonly Tile[], target: Tile): Tile[] | null {
  const index = tiles.findIndex((tile) => sameTile(tile, target));
  if (index < 0) return null;
  const copy = tiles.map((tile) => ({ ...tile }));
  copy.splice(index, 1);
  return copy;
}

function selfMelds(facts: KnownGameFacts) {
  return facts.melds.filter((meld) => meld.actor === facts.actor);
}

function engineMelds(facts: KnownGameFacts) {
  return selfMelds(facts).map((meld) => ({
    kind: meld.kind,
    tiles34: meld.tiles.map((tile) => tileIdTo34(tile.id)),
  }));
}

function allOwnedTiles(hand: readonly Tile[], facts: KnownGameFacts): Tile[] {
  return [
    ...hand.map((tile) => ({ ...tile })),
    ...selfMelds(facts).flatMap((meld) =>
      meld.tiles.map((tile) => ({ ...tile }))
    ),
  ];
}

function windTile(wind: "E" | "S" | "W" | "N"): number {
  return 27 + ["E", "S", "W", "N"].indexOf(wind);
}

function threatWindTile(facts: KnownGameFacts, threatActor: number): number {
  const selfWind = windTile(facts.seatWind) - 27;
  const actorOffset = (threatActor - facts.actor + 4) % 4;
  return 27 + ((selfWind + actorOffset) % 4);
}

function visibleCountsComplete(facts: KnownGameFacts): boolean {
  return facts.completeness.concealedTiles &&
    facts.completeness.melds &&
    facts.completeness.doraIndicators &&
    facts.completeness.rivers &&
    facts.completeness.calledDiscardMarkers;
}

function deriveLeftTiles34(
  facts: KnownGameFacts,
  projectedHand: readonly Tile[],
  candidateDiscard: Tile | null,
): number[] | null {
  if (!visibleCountsComplete(facts)) return null;
  const visible = Array<number>(34).fill(0);
  const add = (tile: Tile): void => {
    const index = tileIdTo34(tile.id);
    visible[index] = visible[index]! + 1;
    if (visible[index]! > 4) {
      throw new Error("candidate_projection_visible_tile_count_exceeds_four");
    }
  };
  for (const tile of projectedHand) {
    add(tile);
  }
  for (const meld of facts.melds) {
    for (const tile of meld.tiles) {
      add(tile);
    }
  }
  for (const indicator of facts.doraIndicators) {
    add(indicator);
  }
  const calledEvents = new Set(
    facts.melds.flatMap((meld) =>
      meld.calledDiscardEventRef === undefined ||
        meld.calledDiscardEventRef === null
        ? []
        : [meld.calledDiscardEventRef]
    ),
  );
  for (const discard of facts.rivers.flat()) {
    if (!calledEvents.has(discard.eventId)) add(discard.tile);
  }
  if (candidateDiscard !== null) add(candidateDiscard);
  return visible.map((count) => 4 - count);
}

function outsideTiles(tile34: number): number[] {
  if (tile34 >= 27) return [];
  const rank = tile34 % 9;
  const suitStart = tile34 - rank;
  if (rank === 0 || rank === 8) return [];
  if (rank >= 1 && rank <= 3) {
    return Array.from({ length: rank }, (_, index) => suitStart + index);
  }
  if (rank === 4) return [tile34 - 2, tile34 + 2];
  return Array.from(
    { length: 8 - rank },
    (_, index) => suitStart + 8 - index,
  );
}

function threatRiskRequests(
  facts: KnownGameFacts,
  actionRef: ActionRef,
  stateHash: string,
  leftTiles34: number[] | null,
  doraTiles34: number[],
  diagnostics: string[],
): ThreatRiskFactRequest[] {
  if (leftTiles34 === null || !facts.completeness.rivers) return [];
  const requests: ThreatRiskFactRequest[] = [];
  for (const threat of facts.threats) {
    if (!threat.riichi || threat.declarationEventId === null) continue;
    const threatRiver = facts.rivers[threat.actor]!;
    if (threatRiver.length < 1 || threatRiver.length > 19) {
      diagnostics.push(`threat_risk_turns_out_of_range:actor${threat.actor}`);
      continue;
    }
    const safeTiles34 = Array<boolean>(34).fill(false);
    const evidenceIds = new Set<string>([threat.declarationEventId]);
    for (const river of facts.rivers) {
      for (const discard of river) {
        if (
          discard.actor === threat.actor ||
          discard.afterRiichiEventIds.includes(threat.declarationEventId)
        ) {
          safeTiles34[tileIdTo34(discard.tile.id)] = true;
          evidenceIds.add(discard.eventId);
        }
      }
    }
    const earlyOutside = new Set<number>();
    for (const discard of threatRiver.slice(0, 5)) {
      if (discard.afterRiichiEventIds.includes(threat.declarationEventId)) break;
      for (const tile of outsideTiles(tileIdTo34(discard.tile.id))) {
        earlyOutside.add(tile);
      }
      evidenceIds.add(discard.eventId);
    }
    const threatInputs = {
      actionRef,
      threatActor: threat.actor,
      turns: threatRiver.length,
      safeTiles34,
      leftTiles34: [...leftTiles34],
      doraTiles34: [...doraTiles34],
      roundWindTile34: windTile(facts.roundWind),
      threatWindTile34: threatWindTile(facts, threat.actor),
      earlyOutsideTiles34: [...earlyOutside].sort((left, right) => left - right),
      evidenceIds: [...evidenceIds],
    };
    const threatStateHash = stableProjectedStateHash({
      parentStateHash: stateHash,
      ...threatInputs,
    });
    requests.push({
      kind: "threat_risk",
      requestId: `${facts.factSetId}:risk:${threat.actor}:${threatStateHash}`,
      protocolVersion: "mahjong-facts/v1",
      stateHash: threatStateHash,
      ...threatInputs,
    });
  }
  return requests;
}

function requireCoreFacts(
  facts: KnownGameFacts,
  actionRef: ActionRef,
): CandidateProjection | null {
  if (!facts.completeness.concealedTiles || !facts.completeness.melds) {
    return {
      status: "blocked_missing_facts",
      actionRef,
      diagnostic: "candidate projection requires complete concealed tiles and melds",
    };
  }
  return null;
}

function makeHandContext(
  facts: KnownGameFacts,
  projectedHand: readonly Tile[],
  selfDiscards34: number[],
  riichi: boolean,
) {
  const owned = allOwnedTiles(projectedHand, facts);
  return {
    melds: engineMelds(facts),
    doraTiles34: facts.doraIndicators.map(doraFromIndicator),
    redFiveCounts: redFiveCounts(owned),
    roundWindTile34: windTile(facts.roundWind),
    selfWindTile34: windTile(facts.seatWind),
    dealer: facts.dealer,
    riichi,
    selfDiscards34,
  };
}

function projectDiscard(
  candidate: StructuredComparisonCandidate,
  facts: KnownGameFacts,
): CandidateProjection {
  if (candidate.action.kind !== "discard" &&
    candidate.action.kind !== "riichi_discard") {
    throw new Error("projectDiscard received a non-discard action");
  }
  const blocked = requireCoreFacts(facts, candidate.actionRef);
  if (blocked !== null) return blocked;

  let projectedHand: Tile[];
  if (candidate.action.discardMode === "tsumogiri") {
    if (facts.currentDraw === null ||
      !sameTile(facts.currentDraw.tile, candidate.action.tile)) {
      return {
        status: "blocked_missing_facts",
        actionRef: candidate.actionRef,
        diagnostic: "tsumogiri candidate does not match the known current draw",
      };
    }
    projectedHand = facts.concealedTiles.map((tile) => ({ ...tile }));
  } else {
    const remaining = removeExact(facts.concealedTiles, candidate.action.tile);
    if (remaining === null) {
      return {
        status: "blocked_missing_facts",
        actionRef: candidate.actionRef,
        diagnostic: "tedashi candidate is absent from known concealed tiles",
      };
    }
    projectedHand = facts.currentDraw === null
      ? remaining
      : [...remaining, { ...facts.currentDraw.tile }];
  }

  const expectedHandCount = 13 - 3 * selfMelds(facts).length;
  if (projectedHand.length !== expectedHandCount) {
    return {
      status: "blocked_missing_facts",
      actionRef: candidate.actionRef,
      diagnostic: `projected hand has ${projectedHand.length} tiles, expected ${expectedHandCount}`,
    };
  }
  const leftTiles34 = deriveLeftTiles34(
    facts,
    projectedHand,
    candidate.action.tile,
  );
  const selfDiscards34 = [
    ...facts.rivers[facts.actor]!.map((discard) => tileIdTo34(discard.tile.id)),
    tileIdTo34(candidate.action.tile.id),
  ];
  const context = makeHandContext(
    facts,
    projectedHand,
    selfDiscards34,
    facts.selfRiichi || candidate.action.kind === "riichi_discard",
  );
  const projectedState = {
    actionRef: candidate.actionRef,
    handTiles34: tilesTo34Counts(projectedHand),
    leftTiles34,
    doraTilesComplete: facts.completeness.doraIndicators,
    selfDiscardsComplete: facts.completeness.rivers,
    remainingDraws: facts.completeness.remainingDraws
      ? facts.remainingDraws
      : null,
    ...context,
  };
  const stateHash = stableProjectedStateHash(projectedState);
  const hand13Request: Hand13FactRequest = {
    kind: "hand13",
    requestId: `${facts.factSetId}:hand13:${stateHash}`,
    protocolVersion: "mahjong-facts/v1",
    actionRef: candidate.actionRef,
    stateHash,
    ...context,
    handTiles34: projectedState.handTiles34,
    leftTiles34,
    visibleCountsComplete: leftTiles34 !== null,
    doraTilesComplete: facts.completeness.doraIndicators,
    selfDiscardsComplete: facts.completeness.rivers,
    remainingDraws: projectedState.remainingDraws,
  };
  const baseYakuContext = facts.handStructureYakuContext ?? {
    windsStatus: "unknown" as const,
    roundWindTile34: null,
    selfWindTile34: null,
    riichiStatus: "unknown" as const,
    openTanyaoStatus: "unknown" as const,
  };
  const handStructureRequest = buildHandStructureRequestV2({
    actionRef: candidate.actionRef,
    factSetId: facts.factSetId,
    projectedHand,
    selfMelds: selfMelds(facts),
    leftTiles34,
    ronContext: "unknown_future",
    yakuContext: candidate.action.kind === "riichi_discard"
      ? { ...baseYakuContext, riichiStatus: "accepted" }
      : baseYakuContext,
  });
  const diagnostics: string[] = [];
  const candidateDiscard: CandidateDiscardEvidenceV2 = {
    actor: facts.actor,
    action: candidate.action,
    actionRef: candidate.actionRef,
    stateHash: handStructureRequest.stateHash,
    tile: { ...candidate.action.tile },
    discardMode: candidate.action.discardMode,
  };
  return {
    status: "ready",
    actionRef: candidate.actionRef,
    projectedStateRef: stateHash,
    hand13Request,
    handStructureRequest,
    candidateDiscard,
    threatRiskRequests: threatRiskRequests(
      facts,
      candidate.actionRef,
      stateHash,
      leftTiles34,
      context.doraTiles34,
      diagnostics,
    ),
    localEvidenceIds: [...facts.evidenceIds],
    diagnostics,
  };
}

function projectWin(
  candidate: StructuredComparisonCandidate,
  facts: KnownGameFacts,
): CandidateProjection {
  if (candidate.action.kind !== "tsumo" && candidate.action.kind !== "ron") {
    throw new Error("projectWin received a non-win action");
  }
  const blocked = requireCoreFacts(facts, candidate.actionRef);
  if (blocked !== null) return blocked;
  if (!facts.completeness.doraIndicators) {
    return {
      status: "blocked_missing_facts",
      actionRef: candidate.actionRef,
      diagnostic: "completed-hand scoring requires complete dora indicators",
    };
  }
  let completedHand: Tile[];
  if (candidate.action.kind === "tsumo") {
    if (facts.currentDraw === null ||
      facts.currentDraw.eventRef !== candidate.action.drawEventRef ||
      !sameTile(facts.currentDraw.tile, candidate.action.winningTile)) {
      return {
        status: "blocked_missing_facts",
        actionRef: candidate.actionRef,
        diagnostic: "tsumo requires the exact known winning draw",
      };
    }
    completedHand = [
      ...facts.concealedTiles.map((tile) => ({ ...tile })),
      { ...facts.currentDraw.tile },
    ];
  } else {
    completedHand = [
      ...facts.concealedTiles.map((tile) => ({ ...tile })),
      { ...candidate.action.winningTile },
    ];
  }
  const expectedHandCount = 14 - 3 * selfMelds(facts).length;
  if (completedHand.length !== expectedHandCount) {
    return {
      status: "blocked_missing_facts",
      actionRef: candidate.actionRef,
      diagnostic: `completed hand has ${completedHand.length} tiles, expected ${expectedHandCount}`,
    };
  }
  const context = makeHandContext(
    facts,
    completedHand,
    facts.rivers[facts.actor]!.map((discard) => tileIdTo34(discard.tile.id)),
    facts.selfRiichi,
  );
  const completedHandTiles34 = tilesTo34Counts(completedHand);
  const projectedState = {
    actionRef: candidate.actionRef,
    completedHandTiles34,
    tsumo: candidate.action.kind === "tsumo",
    winTile34: tileIdTo34(candidate.action.winningTile.id),
    ...context,
  };
  const stateHash = stableProjectedStateHash(projectedState);
  const completedHandRequest: CompletedHandFactRequest = {
    kind: "completed_hand",
    requestId: `${facts.factSetId}:completed:${stateHash}`,
    protocolVersion: "mahjong-facts/v1",
    actionRef: candidate.actionRef,
    stateHash,
    ...context,
    completedHandTiles34,
    tsumo: candidate.action.kind === "tsumo",
    winTile34: tileIdTo34(candidate.action.winningTile.id),
  };
  return {
    status: "ready",
    actionRef: candidate.actionRef,
    projectedStateRef: stateHash,
    completedHandRequest,
    threatRiskRequests: [],
    localEvidenceIds: [...facts.evidenceIds],
    diagnostics: [],
  };
}

export function projectCandidate(
  rawCandidate: StructuredComparisonCandidate,
  rawFacts: KnownGameFacts,
): CandidateProjection {
  const candidate = StructuredComparisonCandidateSchema.parse(rawCandidate);
  const facts = KnownGameFactsSchema.parse(rawFacts);
  switch (candidate.action.kind) {
    case "discard":
    case "riichi_discard":
      return projectDiscard(candidate, facts);
    case "tsumo":
    case "ron":
      return projectWin(candidate, facts);
    default:
      return {
        status: "unsupported_action_in_slice",
        actionRef: candidate.actionRef,
        diagnostic: `${candidate.action.kind} projection is not implemented in Slice 3`,
      };
  }
}
