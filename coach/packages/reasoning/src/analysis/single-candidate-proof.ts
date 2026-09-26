/**
 * M6-A4.0: local single-candidate proofs for `source_row_not_expected`.
 *
 * Frozen source semantics (spec 2026-08-18): a Mortal entry exists exactly at
 * decision points with >=2 legal candidates — single-candidate points
 * legitimately have no row. When a local window finds no source row, the
 * absence is an integrity failure UNLESS the local candidate enumeration can
 * prove the count is 1. These proofs are purely local and are decided BEFORE
 * any source lookup, so the classification never depends on what the source
 * happened to contain.
 *
 * Two proof shapes, both ending in "exactly one legal discard":
 *
 * A — riichi_accepted_forced_tsumogiri. At a self_turn window
 *     whose riichi is ACCEPTED, the legal action model reduces to
 *     {tsumogiri, tsumo, kan} (the post-riichi surface Mortal emits rows
 *     from; H2 调研实证 — all 10 accepted-riichi kan-free non-winning draws
 *     have no row). Kan is refuted by shape, wall/board limits, or the same
 *     engine-backed riichi-kan eligibility used by local projection.
 *     Kakan needs a previous pon (no self melds), daiminkan is
 *     impossible on one's own draw. Tsumo is refuted by the local winning
 *     shape check, which is permissive across standard/chiitoitsu/kokushi —
 *     a false verdict means definitely-not-winning. Kyuushu is impossible:
 *     it is first-turn-only and an accepted riichi implies a discard already
 *     happened. What remains is exactly the tsumogiri.
 *
 * B — riichi_declaration_unique_tenpai_discard (engine-verified). The
 *     post-riichi declaration window's only legal actions are tenpai-keeping
 *     discards (riichi requires the declared hand to stay tenpai). For each
 *     distinct physical tile in the held 14, the hand-structure fact engine
 *     is asked whether the 13-tile projection is tenpai
 *     (overallShanten === 0). Exactly one tenpai-keeping discard — and it
 *     must equal the actual discard (integrity guard; a mismatch contradicts
 *     riichi legality and withholds the proof) — proves candidateCount = 1.
 *     Any engine error withholds the whole window's proof fail-closed: an
 *     error can never be read as "not tenpai".
 */
import {
  canonicalActionRef,
  type SingleCandidateProof,
  type Tile,
} from "@riichi-coach/contracts";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import { buildHandStructureRequestV2 } from "../factors/hand-structure-projector.js";
import { tileIdTo34 } from "../factors/tile34.js";
import { isCompleteHandShape } from "../factors/win-shape.js";
import type { ReplayedDecision } from "../replay/stream-replayer.js";
import { canDeclareKan } from "./response-candidate-enumeration.js";
import { collectLocalMortalRiichiAnkanCandidates } from "./local-mortal-adapter.js";

// M6-C Slice 1 (CR-2): the proof shape/schema now belongs to the contracts
// package. Re-exported here to keep the reasoning public surface unchanged.
export type {
  SingleCandidateProof,
  SingleCandidateProofShape,
} from "@riichi-coach/contracts";

function samePhysicalTile(left: Tile, right: Tile): boolean {
  return left.id === right.id && left.red === right.red;
}

function removePhysicalTile(
  tiles: readonly Tile[],
  discarded: Tile,
): readonly Tile[] | null {
  const index = tiles.findIndex(
    (tile) => tile.id === discarded.id && tile.red === discarded.red,
  );
  if (index < 0) return null;
  return [...tiles.slice(0, index), ...tiles.slice(index + 1)];
}

function heldCounts34(held: readonly Tile[]): number[] | null {
  const counts = Array<number>(34).fill(0);
  for (const tile of held) {
    const kind = tileIdTo34(tile.id);
    counts[kind] = counts[kind]! + 1;
    // Reject physically impossible counts; a quad still needs legality proof.
    if (counts[kind]! > 4) return null;
  }
  return counts;
}

/** Shape A: the accepted-riichi window reduces to exactly the tsumogiri. */
async function proveForcedTsumogiri(
  decision: ReplayedDecision,
  engine: { analyzeHandStructure: HandStructureFactEnginePort["analyzeHandStructure"] },
): Promise<SingleCandidateProof | null> {
  const facts = decision.facts;
  const draw = facts.currentDraw;
  if (draw === null) return null;
  const held = [...facts.concealedTiles, draw.tile];
  const selfMelds = facts.melds.filter((meld) => meld.actor === decision.snapshot.selfActor);
  if (held.length !== 14 - 3 * selfMelds.length) return null;
  // A prior pon keeps kakan legal. Closed kans do not, and riichi after ankan
  // remains a closed-hand state.
  if (selfMelds.some((meld) => meld.kind === "pon")) return null;
  const counts = heldCounts34(held);
  if (counts === null) return null;
  if (counts.some(count => count === 4) && canDeclareKan(decision)) {
    try {
      const candidates = await collectLocalMortalRiichiAnkanCandidates([decision], engine);
      if ((candidates.get(decision.decisionEventRef)?.length ?? 1) !== 0) return null;
    } catch { return null; }
  }
  // Tsumo refutation: no winning shape means definitely not winning (the
  // checker is permissive; false is a proof, not a guess).
  if (selfMelds.length === 0) {
    if (isCompleteHandShape(counts)) return null;
  } else {
    let result;
    try {
      result = await engine.analyzeHandStructure(buildHandStructureRequestV2({
        actionRef: canonicalActionRef(decision.actualAction!),
        factSetId: `single-candidate-proof:${decision.decisionEventRef}`,
        projectedHand: facts.concealedTiles,
        selfMelds,
        leftTiles34: null,
        ronContext: "unknown_future",
        yakuContext: {
          windsStatus: "unknown", roundWindTile34: null, selfWindTile34: null,
          riichiStatus: "accepted", openTanyaoStatus: "unknown",
        },
      }));
    } catch {
      return null;
    }
    if (!Number.isInteger(result.overallShanten) || result.overallShanten < 0 || result.overallShanten > 13) return null;
    if (
      result.overallShanten === 0
      && result.waits.some((wait) => wait.tile34 === tileIdTo34(draw.tile.id))
    ) return null;
  }
  // Integrity guard: the player actually made the forced move.
  const actual = decision.actualAction;
  if (actual === null || actual.kind !== "discard" || actual.discardMode !== "tsumogiri") {
    return null;
  }
  if (!samePhysicalTile(actual.tile, draw.tile)) return null;
  return { shape: "riichi_accepted_forced_tsumogiri", candidateCount: 1 };
}

/**
 * Shape B: exactly one tenpai-keeping discard at the declaration window.
 * The engine is the sole tenpai authority; every error fails the window
 * closed.
 */
export async function collectRiichiDeclarationTenpaiDiscards(
  decision: ReplayedDecision,
  engine: { analyzeHandStructure: HandStructureFactEnginePort["analyzeHandStructure"] },
): Promise<readonly Tile[] | null> {
  const facts = decision.facts;
  const draw = facts.currentDraw;
  if (draw === null) return null;
  const held = [...facts.concealedTiles, draw.tile];
  const selfMelds = facts.melds.filter((meld) => meld.actor === decision.snapshot.selfActor);
  if (held.length !== 14 - 3 * selfMelds.length) return null;
  const seen = new Set<string>();
  const tenpaiDiscards: Tile[] = [];
  for (const candidate of held) {
    const key = `${candidate.id}:${candidate.red}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const projection = removePhysicalTile(held, candidate);
    if (projection === null) return null;
    const request = buildHandStructureRequestV2({
      actionRef: canonicalActionRef({
        kind: "discard",
        tile: { ...candidate },
        discardMode: "tedashi",
      }),
      factSetId: `single-candidate-proof:${decision.decisionEventRef}`,
      projectedHand: projection,
      selfMelds,
      leftTiles34: null,
      ronContext: "unknown_future",
      yakuContext: {
        windsStatus: "unknown",
        roundWindTile34: null,
        selfWindTile34: null,
        // Tenpai (overallShanten) does not depend on riichi status; "unknown"
        // is valid for the declared-not-accepted snapshot.
        riichiStatus: "unknown",
        openTanyaoStatus: "unknown",
      },
    });
    let result;
    try {
      result = await engine.analyzeHandStructure(request);
    } catch {
      // Fail-closed: an error is never "not tenpai".
      return null;
    }
    if (
      !Number.isInteger(result.overallShanten)
      || result.overallShanten < 0
      || result.overallShanten > 13
    ) {
      // A 13-tile projection cannot be complete; anything outside [0, 13]
      // is an inconsistent verdict — fail the window closed.
      return null;
    }
    if (result.overallShanten === 0) {
      tenpaiDiscards.push(candidate);
    }
  }
  return tenpaiDiscards;
}

async function proveUniqueTenpaiDiscard(
  decision: ReplayedDecision,
  engine: { analyzeHandStructure: HandStructureFactEnginePort["analyzeHandStructure"] },
): Promise<SingleCandidateProof | null> {
  const actual = decision.actualAction;
  if (actual === null || actual.kind !== "discard") return null;
  const tenpaiDiscards = await collectRiichiDeclarationTenpaiDiscards(decision, engine);
  if (tenpaiDiscards === null) return null;
  if (tenpaiDiscards.length !== 1) return null;
  // Integrity guard: the unique legal discard is the one actually made.
  if (!samePhysicalTile(tenpaiDiscards[0]!, actual.tile)) return null;
  return { shape: "riichi_declaration_unique_tenpai_discard", candidateCount: 1 };
}

/**
 * Pre-pass over replayed decisions: prove, purely locally, which windows are
 * single-candidate. Runs BEFORE any source lookup — the proof output may
 * never depend on source content.
 */
export async function collectSingleCandidateProofs(
  decisions: readonly ReplayedDecision[],
  engine: { analyzeHandStructure: HandStructureFactEnginePort["analyzeHandStructure"] },
): Promise<ReadonlyMap<number, SingleCandidateProof>> {
  const proofs = new Map<number, SingleCandidateProof>();
  for (let index = 0; index < decisions.length; index += 1) {
    const decision = decisions[index]!;
    const snapshot = decision.snapshot;
    const window = snapshot.privateState.decisionWindow;
    // The snapshot's own riichi state, not facts.selfRiichi (which is merely
    // status !== "none" and would admit declared-not-accepted windows).
    const riichiStatus = snapshot.publicState.riichiStates[snapshot.selfActor]?.status ?? "none";
    if (window.kind === "self_turn") {
      if (riichiStatus !== "accepted") continue;
      const proof = await proveForcedTsumogiri(decision, engine);
      if (proof !== null) proofs.set(index, proof);
      continue;
    }
    if (window.kind === "post_riichi_discard") {
      if (riichiStatus !== "declared") continue;
      const proof = await proveUniqueTenpaiDiscard(decision, engine);
      if (proof !== null) proofs.set(index, proof);
    }
  }
  return proofs;
}
