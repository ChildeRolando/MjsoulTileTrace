/**
 * M6-A4.2: local candidate enumeration for response windows — isomorphic to
 * Mortal's candidate space (spec 2026-08-18, A7 枚举一致性 DoD).
 *
 * Mortal emits a response row exactly at decision points with >=2 legal
 * candidates, counting `none` (pass) as one candidate and expanding chi by
 * meld combination. This module mirrors that space from canonical facts alone
 * (开窗权威分离: the enumeration is driven by the canonical event + local
 * rules/hand content, NEVER by any Mortal source marker), and decides — BEFORE
 * any source lookup — whether a response window expects a source row:
 *
 *   candidateCount == 1 (only none legal) -> source_row_not_expected
 *   candidateCount >= 2                   -> a source row is required
 *
 * The hard rules that consume this (守恒门, A4.2):
 *   local enumeration >=2 without a source row -> acceptance failure
 *   source row present while local did not expect -> conservation failure
 */
import type {
  DecisionWindow,
  Tile,
  TileId,
} from "@riichi-coach/contracts";
import { isCompleteHandShapeWithSets } from "../factors/win-shape.js";
import { tileIdTo34 } from "../factors/tile34.js";
import {
  canDaiminkan,
  canPon,
} from "../replay/response-eligibility.js";
import type { SingleCandidateProof } from "./single-candidate-proof.js";
import type { ReplayedDecision } from "../replay/stream-replayer.js";

export type ResponseCandidateShape =
  | "chi"
  | "pon"
  | "daiminkan"
  | "ron"
  | "none";

/** The local candidate multiset of one response window, mirroring Mortal's
 *  space: chi expanded by distinct meld combinations, pon/daiminkan/ron each
 *  at most one, and none (pass) always exactly one. */
export type ResponseCandidateEnumeration = Readonly<{
  windowKind: DecisionWindow["kind"];
  sourceActor: number | null;
  offeredTile: Tile;
  /** Each distinct chi meld combination is one candidate. */
  chiCombinations: ReadonlyArray<{
    consumedTiles: readonly Tile[];
  }>;
  pon: boolean;
  daiminkan: boolean;
  ron: boolean;
  none: true;
  candidateCount: number;
}>;

/** The single-candidate proof for a response window (source_row_not_expected).
 *  Only produced when the local enumeration PROVES count == 1 — i.e. only
 *  `none` is legal. Any incomplete/uncertain fact fails the proof closed.
 *  Reuses the shared SingleCandidateProof shape ("response_single_candidate")
 *  so the review ledger carries one proof union. */
export type ResponseSingleCandidateProof = SingleCandidateProof;

function countId(concealed: readonly Tile[], offered: Tile): number {
  let count = 0;
  for (const tile of concealed) {
    if (tile.id === offered.id) count += 1;
  }
  return count;
}

/** Distinct chi meld combinations completing a run with the offered tile.
 *  The offered tile sits at rank r; the two consumed tiles form (r-2,r-1),
 *  (r-1,r+1) or (r+1,r+2). Each distinct consumed multiset is one candidate,
 *  mirroring Mortal's per-combination chi expansion. Honors cannot chi. */
export function chiCombinations(
  concealed: readonly Tile[],
  offered: Tile,
): Array<{ consumedTiles: readonly Tile[] }> {
  if (offered.id.endsWith("z")) return [];
  const suit = offered.id[1]!;
  const rank = Number(offered.id[0]);
  const counts = new Map<string, number>();
  for (const tile of concealed) {
    counts.set(tile.id, (counts.get(tile.id) ?? 0) + 1);
  }
  const combinations: Array<{ consumedTiles: readonly Tile[] }> = [];
  const consume = (low: number, high: number): void => {
    if (low < 1 || high > 9) return;
    const lowId = `${low}${suit}` as TileId;
    const highId = `${high}${suit}` as TileId;
    if ((counts.get(lowId) ?? 0) >= 1 && (counts.get(highId) ?? 0) >= 1) {
      combinations.push({
        consumedTiles: [
          { id: lowId, red: false },
          { id: highId, red: false },
        ],
      });
    }
  };
  consume(rank - 2, rank - 1);
  consume(rank - 1, rank + 1);
  consume(rank + 1, rank + 2);
  return combinations;
}

/**
 * Enumerate the local candidate space of one response window from its frozen
 * snapshot (same authority the A4.1 window opening used: the reduced
 * private/public state, not the facts projection — the snapshot is the
 * canonical side's ground truth). Returns null when the window is not a
 * response window or the private facts cannot prove eligibility (fail-closed:
 * incomplete facts never read as "no candidate").
 */
export function enumerateResponseCandidates(
  decision: ReplayedDecision,
): ResponseCandidateEnumeration | null {
  const snapshot = decision.snapshot;
  const window = snapshot.privateState.decisionWindow;
  if (window.kind !== "discard_response" && window.kind !== "kan_response") {
    return null;
  }
  if (window.sourceActor === null) return null;
  const privateState = snapshot.privateState;
  const publicState = snapshot.publicState;
  if (privateState.fields.concealedTiles !== "complete") return null;
  const concealed = privateState.concealedTiles;
  const meldCount = publicState.melds.filter(
    (meld) => meld.actor === snapshot.selfActor,
  ).length;
  // A response window never carries a draw (A4.1 eligibility), so the
  // concealed hand is the full hand authority.
  const offered = window.offeredTile;
  const inRiichi =
    publicState.riichiStates[snapshot.selfActor]!.status !== "none";

  const chi = inRiichi ? [] : chiCombinations(concealed, offered);
  const pon = !inRiichi && canPon(concealed, offered);
  const daiminkan = !inRiichi && canDaiminkan(concealed, offered);
  const ron = canRonShape(concealed, meldCount, offered);

  const candidateCount =
    chi.length + (pon ? 1 : 0) + (daiminkan ? 1 : 0) + (ron ? 1 : 0) + 1;

  return Object.freeze({
    windowKind: window.kind,
    sourceActor: window.sourceActor,
    offeredTile: offered,
    chiCombinations: Object.freeze(chi.map((item) =>
      Object.freeze({ consumedTiles: Object.freeze(item.consumedTiles) })
    )),
    pon,
    daiminkan,
    ron,
    none: true as const,
    candidateCount,
  });
}

function canRonShape(
  concealed: readonly Tile[],
  meldCount: number,
  offered: Tile,
): boolean {
  const counts = Array<number>(34).fill(0);
  for (const tile of concealed) {
    counts[tileIdTo34(tile.id)] = counts[tileIdTo34(tile.id)]! + 1;
  }
  counts[tileIdTo34(offered.id)] = counts[tileIdTo34(offered.id)]! + 1;
  return isCompleteHandShapeWithSets(counts, 4 - meldCount);
}

/**
 * Collect the single-candidate proofs for every response window. Purely local
 * and decided BEFORE any source lookup: a window whose local enumeration has
 * exactly one candidate (only none legal) expects NO source row — Mortal emits
 * rows only at >=2-candidate decision points.
 */
export function collectResponseSingleCandidateProofs(
  responseDecisions: readonly ReplayedDecision[],
): ReadonlyMap<number, ResponseSingleCandidateProof> {
  const proofs = new Map<number, ResponseSingleCandidateProof>();
  for (let index = 0; index < responseDecisions.length; index += 1) {
    const decision = responseDecisions[index]!;
    const enumeration = enumerateResponseCandidates(decision);
    if (enumeration === null) continue;
    if (enumeration.candidateCount !== 1) continue;
    proofs.set(index, { shape: "response_single_candidate", candidateCount: 1 });
  }
  return proofs;
}
