import {
  CanonicalEventStreamSchema,
  CANONICAL_EVENT_SCHEMA_VERSION,
  LAB_FEATURES,
  LabCandidateFactsSchema,
  StructuredComparisonCandidateSchema,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type LabConstructResult,
  type LabSample,
  type LabHypothesis,
  type LabCandidateFactsSchema as CandidateSchema,
} from "@riichi-coach/contracts";
import { parseMjaiTile, formatMjaiTile } from "@riichi-coach/mortal-source";
import {
  replayCanonicalStream,
  projectCandidate,
  bindLibriichiRuleResult,
  buildDeterministicDefenseMatrix,
  validateHand13Result,
  type ReplayedDecision,
  type MahjongFactEnginePort,
  type LibriichiBoundAction,
} from "@riichi-coach/reasoning";
import type { z } from "zod";
import { condition, digest } from "./config.js";
import { tile34, handFamily, type ResolvedScene } from "./construct.js";

type NativeEvent = Extract<
  LabConstructResult,
  { status: "ok" }
>["events"][number];
/** Only this allow-list projection crosses from full construction into observations. */
export function canonicalFromConstruction(
  raw: NativeEvent[],
  selfActor: number,
): CanonicalEventStream {
  const visible = raw.map((row) => {
    const e = structuredClone(row);
    if (e.type === "start_kyoku")
      return {
        ...e,
        tehais: e.tehais!.map((hand, i) =>
          i === selfActor ? hand : Array(13).fill("?"),
        ),
      };
    if (e.type === "tsumo" && e.actor !== selfActor)
      return { type: "tsumo", actor: e.actor, pai: "?" };
    return e;
  });
  const sourceRecordHash = digest(visible),
    gameId = `synthetic:${sourceRecordHash}`;
  const events: CanonicalGameEvent[] = [];
  const id = (n: number) => `${gameId}/0/${n}/0`;
  const add = (data: unknown) =>
    events.push({
      ...(data as object),
      eventId: id(events.length),
      sourceRecordRef: `${gameId}:event:${events.length}`,
    } as CanonicalGameEvent);
  add({ type: "game_started" });
  let latestDiscard: string | null = null,
    latestKan: string | null = null,
    rinshan = false;
  const declarations = new Map<number, string>(),
    pons = new Map<string, string>();
  for (const row of visible) {
    const ref = id(events.length);
    switch (row.type) {
      case "start_kyoku":
        add({
          type: "round_started",
          roundOrdinal: 0,
          roundWind: row.bakaze,
          hand: row.kyoku,
          honba: row.honba,
          riichiSticks: row.kyotaku,
          dealer: row.oya,
          scores: row.scores,
          doraIndicator: parseMjaiTile(row.dora_marker),
          selfHand: row.tehais![selfActor]!.map(parseMjaiTile),
          remainingDraws: 70,
        });
        break;
      case "tsumo":
        add({
          type: "tile_drawn",
          actor: row.actor,
          tile:
            row.actor === selfActor
              ? { visibility: "visible", tile: parseMjaiTile(row.pai) }
              : { visibility: "hidden" },
          from: rinshan ? "rinshan" : "live_wall",
        });
        rinshan = false;
        break;
      case "dahai":
        add({
          type: "tile_discarded",
          actor: row.actor,
          tile: parseMjaiTile(row.pai),
          discardMode: row.tsumogiri ? "tsumogiri" : "tedashi",
          riichiDeclarationEventRef: declarations.get(row.actor!) ?? null,
        });
        latestDiscard = ref;
        declarations.delete(row.actor!);
        break;
      case "reach":
        add({ type: "riichi_declared", actor: row.actor });
        declarations.set(row.actor!, ref);
        break;
      case "reach_accepted": {
        const declaration = events.findLast(
          (e) => e.type === "riichi_declared" && e.actor === row.actor,
        )?.eventId;
        if (!declaration)
          throw new Error("construction_missing_riichi_declaration");
        add({
          type: "riichi_accepted",
          actor: row.actor,
          declarationEventRef: declaration,
        });
        break;
      }
      case "chi":
      case "pon":
      case "daiminkan":
        if (!latestDiscard)
          throw new Error("construction_missing_called_discard");
        add({
          type: `${row.type}_called`,
          actor: row.actor,
          targetActor: row.target,
          calledTile: parseMjaiTile(row.pai),
          consumedTiles: row.consumed!.map(parseMjaiTile),
          calledDiscardEventRef: latestDiscard,
        });
        if (row.type === "pon")
          pons.set(`${row.actor}:${tile34(row.pai!)}`, ref);
        if (row.type === "daiminkan") {
          latestKan = ref;
          rinshan = true;
        }
        break;
      case "ankan":
        add({
          type: "ankan_declared",
          actor: row.actor,
          tiles: row.consumed!.map(parseMjaiTile),
        });
        latestKan = ref;
        rinshan = true;
        break;
      case "kakan": {
        const pon = pons.get(`${row.actor}:${tile34(row.pai!)}`);
        if (!pon) throw new Error("construction_missing_pon");
        add({
          type: "kakan_declared",
          actor: row.actor,
          addedTile: parseMjaiTile(row.pai),
          upgradedPonEventRef: pon,
        });
        latestKan = ref;
        rinshan = true;
        break;
      }
      case "dora":
        add({
          type: "dora_revealed",
          indicator: parseMjaiTile(row.dora_marker),
          kanEventRef: latestKan,
        });
        break;
      default:
        throw new Error("construction_unexpected_terminal_event");
    }
  }
  return CanonicalEventStreamSchema.parse({
    schemaVersion: CANONICAL_EVENT_SCHEMA_VERSION,
    mapperVersion: "question-lab-mjai/v1",
    gameId,
    sourceKind: "synthetic",
    sourceRecordHash,
    playerCount: 4,
    selfActor,
    completeness: {
      eventSequence: "complete",
      ruleSet: "complete",
      scores: "complete",
      doraIndicators: "complete",
      rivers: "complete",
      calledDiscardMarkers: "complete",
      melds: "complete",
      remainingDraws: "complete",
      settlement: "partial",
      responseOpportunities: "complete",
    },
    ruleSet: {
      length: "south",
      redFives: { man: 1, pin: 1, sou: 1 },
      openTanyao: true,
      atamahane: false,
      westExtension: "sudden_death",
      ippatsuCancelledByAnkan: true,
    },
    events,
  });
}
// Reuse only this process's immutable projection of the complete visible input.
// Weak keys cannot retain discarded proposals; a mutation changes the hash.
const pendingProjections = new WeakMap<CanonicalEventStream, { hash: string; decision: ReplayedDecision }>();
let pendingHits = 0, pendingReplays = 0;
export const pendingDecisionCacheStats = () => ({ hits: pendingHits, replays: pendingReplays });
function freezeProjection<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) freezeProjection(nested);
  }
  return value;
}
export function pendingDecision(
  stream: CanonicalEventStream,
): ReplayedDecision {
  const disabled = process.env.RIICHI_LAB_DISABLE_PENDING_CACHE === "1";
  const hash = disabled ? "" : digest({ producer: "lab-pending-projection/v1", stream });
  const prior = disabled ? undefined : pendingProjections.get(stream);
  if (prior?.hash === hash) { pendingHits++; return prior.decision; }
  pendingReplays++;
  const decision = replayCanonicalStream(stream).at(-1);
  if (
    !decision ||
    decision.decisionEventRef !== stream.events.at(-1)?.eventId ||
    decision.actualAction !== null
  )
    throw new Error("construction_not_pending_decision");
  if (disabled) return decision;
  const immutable = freezeProjection(decision);
  pendingProjections.set(stream, { hash, decision: immutable });
  return immutable;
}
export function observedFamily(sample: Pick<LabSample, "stream">) {
  return handFamily(
    pendingDecision(sample.stream).facts.concealedTiles.map(formatMjaiTile),
  );
}
export function observableComponents(
  stream: CanonicalEventStream,
): Record<string, unknown> {
  const d = pendingDecision(stream),
    f = d.facts,
    p = d.snapshot.publicState;
  const refs = new Map(stream.events.map((e, i) => [e.eventId, i]));
  const normalize = (v: unknown): unknown =>
    typeof v === "string"
      ? (refs.get(v) ?? v)
      : Array.isArray(v)
        ? v.map(normalize)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .filter(([k]) => k !== "eventId" && k !== "sourceRecordRef")
                .map(([k, v]) => [k, normalize(v)]),
            )
          : v;
  const players = f.rivers.map((r, actor) => ({
    actor,
    river: r.map((e) => ({
      tile: formatMjaiTile(e.tile),
      mode: e.tsumogiri ? "tsumogiri" : "tedashi",
    })),
    melds: f.melds
      .filter((m) => m.actor === actor)
      .map((m) => ({
        kind: m.kind,
        tiles: m.tiles.map(formatMjaiTile).sort(),
      })),
    riichi: p.riichiStates[actor]!.status,
  }));
  return {
    selfActor: f.actor,
    hand: f.concealedTiles.map(formatMjaiTile).sort(),
    draw: f.currentDraw ? formatMjaiTile(f.currentDraw.tile) : null,
    round: f.currentRound,
    scores: f.scores,
    remainingDraws: f.remainingDraws,
    turn: stream.events.filter(
      (e) => e.type === "tile_drawn" && e.actor === f.actor,
    ).length,
    doraIndicators: f.doraIndicators.map(formatMjaiTile),
    rivers: f.rivers.map((r) =>
      r.map((e) => ({
        tile: formatMjaiTile(e.tile),
        mode: e.tsumogiri ? "tsumogiri" : "tedashi",
      })),
    ),
    melds: f.melds.map((m) => ({
      kind: m.kind,
      actor: m.actor,
      tiles: m.tiles.map(formatMjaiTile).sort(),
    })),
    riichi: p.riichiStates.map((r) => ({
      actor: r.actor,
      status: r.status,
      ippatsuAlive: r.ippatsuAlive,
    })),
    players,
    history: normalize(stream.events),
  };
}
const sorted = (v: readonly string[]) => [...v].sort().join(",");
export function matchesScene(
  scene: ResolvedScene,
  decision: ReplayedDecision,
  raw: NativeEvent[],
): boolean {
  const f = decision.facts;
  if (
    scene.hand &&
    sorted(f.concealedTiles.map(formatMjaiTile)) !== sorted(scene.hand)
  )
    return false;
  if (
    scene.draw &&
    (!f.currentDraw || formatMjaiTile(f.currentDraw.tile) !== scene.draw)
  )
    return false;
  if (
    scene.remainingDraws !== undefined &&
    f.remainingDraws !== scene.remainingDraws
  )
    return false;
  if (
    scene.doraIndicators &&
    sorted(f.doraIndicators.map(formatMjaiTile)) !==
      sorted(scene.doraIndicators)
  )
    return false;
  const hands = raw
    .find((e) => e.type === "start_kyoku")!
    .tehais!.map((h) => [...h]);
  const remove = (actor: number, tile: string) => {
    const i = hands[actor]!.indexOf(tile);
    if (i < 0) throw new Error("construction_holdings_mismatch");
    hands[actor]!.splice(i, 1);
  };
  for (const e of raw) {
    if (e.type === "tsumo") hands[e.actor!]!.push(e.pai!);
    else if (e.type === "dahai") remove(e.actor!, e.pai!);
    else if (["chi", "pon", "daiminkan", "ankan"].includes(e.type))
      for (const tile of e.consumed!) remove(e.actor!, tile);
    else if (e.type === "kakan") remove(e.actor!, e.pai!);
  }
  for (const p of scene.players) {
    if (
      p.concealed &&
      sorted(
        p.actor === f.actor
          ? f.concealedTiles.map(formatMjaiTile)
          : hands[p.actor]!,
      ) !== sorted(p.concealed)
    )
      return false;
    if (
      p.river &&
      sorted(f.rivers[p.actor]!.map((x) => formatMjaiTile(x.tile))) !==
        sorted(p.river)
    )
      return false;
    if (
      p.river &&
      f.rivers[p.actor]!.map((x) => formatMjaiTile(x.tile)).join(",") !==
        p.river.join(",")
    )
      return false;
    if (
      p.riichi !== undefined &&
      (decision.snapshot.publicState.riichiStates[p.actor]!.status ===
        "accepted") !==
        p.riichi
    )
      return false;
    if (p.melds) {
      const melds = f.melds.filter((m) => m.actor === p.actor),
        publicMelds = decision.snapshot.publicState.melds.filter(
          (m) => m.actor === p.actor,
        );
      if (melds.length !== p.melds.length) return false;
      for (let i = 0; i < melds.length; i++) {
        const want = p.melds[i]!,
          got = melds[i]!,
          publicMeld = publicMelds[i]!;
        if (
          got.kind !== want.kind ||
          sorted(got.tiles.map(formatMjaiTile)) !== sorted(want.tiles) ||
          (want.target !== undefined &&
            ("targetActor" in publicMeld
              ? publicMeld.targetActor !== want.target
              : true))
        )
          return false;
      }
    }
  }
  return true;
}
export async function candidateFacts(
  decision: ReplayedDecision,
  actions: readonly LibriichiBoundAction[],
  engine: MahjongFactEnginePort | null,
  recorded?: LabSample["candidates"],
): Promise<z.infer<typeof CandidateSchema>[]> {
  const out: z.infer<typeof CandidateSchema>[] = [];
  for (const row of actions) {
    const candidate = StructuredComparisonCandidateSchema.parse({
      actionRef: row.actionRef,
      action: row.action,
      origins: ["user"],
    });
    const projection = projectCandidate(candidate, decision.facts);
    const result =
      projection.status === "ready" && projection.hand13Request
        ? validateHand13Result(
            projection.hand13Request,
            engine
              ? await engine.analyzeHand13(projection.hand13Request)
              : recorded?.find((c) => c.actionRef === row.actionRef)?.result,
          )
        : null;
    const action = row.action,
      tile =
        action.kind === "discard" || action.kind === "riichi_discard"
          ? action.tile
          : null;
    const matrix = tile
      ? buildDeterministicDefenseMatrix({ candidate, facts: decision.facts })
      : null;
    const genbutsu = matrix
      ? matrix.cells.filter(
          (cell) =>
            cell.deterministicSafety.status === "calculated" &&
            cell.deterministicSafety.genbutsu,
        ).length
      : null;
    const estimate = result?.estimates.find((e) => e.field === "riichi_point");
    out.push(
      LabCandidateFactsSchema.parse({
        actionRef: row.actionRef,
        action,
        status: result ? "ready" : "unsupported",
        result,
        metrics: {
          shanten: result?.shanten ?? null,
          ukeire:
            result?.waitsRemainingStatus === "calculated"
              ? result.waitsRemaining.reduce((s, t) => s + t.count, 0)
              : null,
          dora: result?.doraCount ?? null,
          valueEstimate:
            estimate && "numericValue" in estimate
              ? Number(estimate.numericValue.toPrecision(12))
              : null,
          genbutsu,
          tile34: tile ? tile34(formatMjaiTile(tile)) : null,
          red: tile?.red ?? false,
          kind: action.kind,
        },
      }),
    );
  }
  return out;
}
export function featureVector(
  decision: ReplayedDecision,
  candidates: LabSample["candidates"],
): Record<string, number> {
  const f = decision.facts,
    p = decision.snapshot.publicState,
    values = (key: "shanten" | "ukeire" | "dora" | "valueEstimate") =>
      candidates.flatMap((c) =>
        c.metrics[key] === null ? [] : [c.metrics[key]!],
      );
  const min = (v: number[]) => (v.length ? Math.min(...v) : 0),
    max = (v: number[]) => (v.length ? Math.max(...v) : 0);
  const hand = [
      ...f.concealedTiles,
      ...(f.currentDraw ? [f.currentDraw.tile] : []),
    ],
    counts = Array<number>(34).fill(0);
  for (const t of hand) counts[tile34(formatMjaiTile(t))]!++;
  const scores = f.scores?.status === "known" ? f.scores.byActor : [0, 0, 0, 0];
  const raw = {
    turn: f.rivers[f.actor]!.length + 1,
    remainingDraws: f.remainingDraws ?? 0,
    selfRiichi: Number(f.selfRiichi),
    dealer: Number(f.dealer),
    round:
      f.currentRound?.status === "known"
        ? (f.currentRound.roundWind === "S" ? 4 : 0) + f.currentRound.hand - 1
        : 0,
    honba: f.currentRound?.status === "known" ? f.currentRound.honba : 0,
    riichiSticks:
      f.currentRound?.status === "known" ? f.currentRound.riichiSticks : 0,
    score: scores[f.actor]!,
    scoreGap:
      scores[f.actor]! - Math.max(...scores.filter((_, i) => i !== f.actor)),
    threats: f.defenseThreats.length,
    meldCount: f.melds.filter((m) => m.actor === f.actor).length,
    doraIndicators: f.doraIndicators.length,
    shantenMin: min(values("shanten")),
    shantenMax: max(values("shanten")),
    ukeireMax: max(values("ukeire")),
    ukeireMin: min(values("ukeire")),
    doraMax: max(values("dora")),
    doraMin: min(values("dora")),
    candidateCount: candidates.length,
    discardCount: candidates.filter((c) => c.action.kind === "discard").length,
    valueEstimateMax: max(values("valueEstimate")),
    valueEstimateKnown: Number(values("valueEstimate").length > 0),
    shapeSequenceCount: counts.reduce(
      (n, v, i) =>
        n +
        (i < 27 && i % 9 < 7 ? Math.min(v, counts[i + 1]!, counts[i + 2]!) : 0),
      0,
    ),
    shapePairCount: counts.filter((v) => v >= 2).length,
    genbutsuCount: candidates.filter((c) => (c.metrics.genbutsu ?? 0) > 0)
      .length,
  };
  void p;
  return Object.fromEntries(LAB_FEATURES.map((key) => [key, raw[key]]));
}
export function hypothesisVotes(
  hypotheses: LabHypothesis[],
  features: Record<string, number>,
  candidates: LabSample["candidates"],
): LabSample["hypotheses"] {
  return hypotheses.map((h) => {
    const applicable = condition(h.when, features),
      policy = h.recommend;
    let choices = candidates.filter(
      (c) =>
        c.status === "ready" &&
        c.metrics[policy.metric] !== null &&
        condition(policy.within, {
          ...features,
          ...Object.fromEntries(
            Object.entries(c.metrics).map(([k, v]) => [`candidate.${k}`, v]),
          ),
        }),
    );
    if (!applicable || !choices.length)
      return { id: h.id, applicable: false, actionRefs: [] };
    const best = (
      rows: typeof choices,
      key: typeof policy.metric,
      direction: "min" | "max",
    ) => {
      const known = rows.filter((c) => c.metrics[key] !== null);
      if (!known.length) return [];
      const value = (direction === "min" ? Math.min : Math.max)(
        ...known.map((c) => c.metrics[key]!),
      );
      return known.filter((c) => c.metrics[key] === value);
    };
    choices = best(choices, policy.metric, policy.direction);
    if (policy.tieBreak)
      choices = best(
        choices,
        policy.tieBreak,
        policy.tieBreak === "shanten" ? "min" : "max",
      );
    return {
      id: h.id,
      applicable: choices.length > 0,
      actionRefs: choices.map((c) => c.actionRef),
    };
  });
}
