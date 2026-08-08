import {
  FACT_ENGINE_PROTOCOL_VERSION,
  HAND_STRUCTURE_SCHEMA_VERSION,
  HandStructureRequestV2Schema,
  type ActionRef,
  type HandStructureRequestV2,
  type KnownGameFacts,
  type KnownMeld,
  type Tile,
} from "@riichi-coach/contracts";
import {
  stableProjectedStateHash,
  tileIdTo34,
  tilesTo34Counts,
} from "./tile34.js";

export interface HandStructureProjectionInput {
  actionRef: ActionRef;
  factSetId: string;
  projectedHand: readonly Tile[];
  selfMelds: readonly KnownMeld[];
  leftTiles34: readonly number[] | null;
  ronContext: HandStructureRequestV2["ronContext"];
  yakuContext: HandStructureRequestV2["yakuContext"];
}

export function deriveHandStructureRonContext(
  facts: KnownGameFacts,
): HandStructureRequestV2["ronContext"] {
  if (facts.decisionWindow.kind === "discard_response") {
    if (!facts.completeness.remainingDraws || facts.remainingDraws === null) {
      return "unknown_future";
    }
    return facts.remainingDraws === 0 ? "known_houtei" : "complete_none";
  }
  if (facts.decisionWindow.kind === "kan_response") {
    return facts.decisionWindow.kanKind === "kakan"
      ? "known_kakan_chankan"
      : "known_ankan_chankan";
  }
  return "unknown_future";
}

export function buildHandStructureRequestV2(
  input: HandStructureProjectionInput,
): HandStructureRequestV2 {
  const payload = {
    handTiles34: tilesTo34Counts(input.projectedHand),
    melds: input.selfMelds.map((meld) => ({
      kind: meld.kind,
      tiles34: meld.tiles.map((tile) => tileIdTo34(tile.id)),
    })),
    leftTiles34: input.leftTiles34 === null ? null : [...input.leftTiles34],
    visibleCountsComplete: input.leftTiles34 !== null,
    ronContext: input.ronContext,
    yakuContext: { ...input.yakuContext },
  };
  const stateHash = stableProjectedStateHash(payload);
  return HandStructureRequestV2Schema.parse({
    kind: "hand_structure",
    schemaVersion: HAND_STRUCTURE_SCHEMA_VERSION,
    requestId: `${input.factSetId}:hand-structure:${stateHash}`,
    protocolVersion: FACT_ENGINE_PROTOCOL_VERSION,
    actionRef: input.actionRef,
    stateHash,
    ...payload,
  });
}
