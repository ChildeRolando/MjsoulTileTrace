/**
 * M6-A4.3 — response-surface pure-event discovery census tests.
 *
 * The discovery census is the chankan-earliest pure-event scan: it classifies
 * response ACTUALS from public canonical events (explicit calls name their
 * trigger discard; a ron win names its source, so a kakan source is a chankan
 * and any other source is a discard-response hora), with zero Mortal cost and
 * no per-seat private state. The pass branches are deliberately NOT
 * enumerated here — a pass is the absence of a call and needs the per-seat
 * candidate enumeration, which is the acceptance E2E's authority.
 */
import { describe, expect, it } from "vitest";
import type { CanonicalEventStream } from "@riichi-coach/contracts";
import {
  discoverResponseSurfaceCorpus,
  discoverResponseSurfaceGame,
  RESPONSE_SURFACE_DISCOVERY_BRANCHES,
  type ResponseSurfaceHits,
} from "../src/analysis/response-surface-discovery.js";

function baseEvent(id: string, type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { eventId: id, sourceRecordRef: `record:${id}`, type, ...extra };
}

function streamOf(events: readonly Record<string, unknown>[], gameId = "game:test"): CanonicalEventStream {
  return {
    schemaVersion: "canonical-riichi-events/v2",
    mapperVersion: "test",
    gameId,
    sourceKind: "tenhou",
    sourceRecordHash: `sha256:${gameId}`,
    playerCount: 4,
    selfActor: 0,
    completeness: "complete",
    ruleSet: {
      length: "south",
      redFives: { man: 1, pin: 1, sou: 1 },
      openTanyao: true,
      atamahane: false,
      westExtension: "none",
      ippatsuCancelledByAnkan: true,
    },
    events: events as CanonicalEventStream["events"],
  } as unknown as CanonicalEventStream;
}

const chi = (id: string, actor: number, discardRef: string) =>
  baseEvent(id, "chi_called", { actor, targetActor: 1, calledTile: { id: "5p", red: false }, consumedTiles: [], calledDiscardEventRef: discardRef });
const pon = (id: string, actor: number, discardRef: string) =>
  baseEvent(id, "pon_called", { actor, targetActor: 1, calledTile: { id: "5p", red: false }, consumedTiles: [], calledDiscardEventRef: discardRef });
const daiminkan = (id: string, actor: number, discardRef: string) =>
  baseEvent(id, "daiminkan_called", { actor, targetActor: 1, calledTile: { id: "5p", red: false }, consumedTiles: [], calledDiscardEventRef: discardRef });
const ron = (id: string, winner: number, sourceRef: string) =>
  baseEvent(id, "win_declared", {
    winnerActor: winner,
    targetActor: 1,
    method: "ron",
    winningTile: { id: "5p", red: false },
    winSourceEventRef: sourceRef,
    scoreDeltas: null,
  });
const kakan = (id: string, actor: number) =>
  baseEvent(id, "kakan_declared", { actor, addedTile: { id: "5p", red: false }, upgradedPonEventRef: `pon:${id}` });
const discard = (id: string, actor: number) =>
  baseEvent(id, "tile_discarded", { actor, tile: { id: "5p", red: false }, discardMode: "tsumogiri", riichiDeclarationEventRef: null });

describe("M6-A4.3 response-surface pure-event census", () => {
  it("classifies explicit call actuals (chi/pon/daiminkan) per seat", () => {
    const stream = streamOf([
      discard("e1", 1),
      chi("e2", 2, "e1"),
      discard("e3", 1),
      pon("e4", 3, "e3"),
      discard("e5", 1),
      daiminkan("e6", 0, "e5"),
    ]);
    const game = discoverResponseSurfaceGame(stream);
    expect(game.hits.resp_chi_actual).toBe(1);
    expect(game.hits.resp_pon_actual).toBe(1);
    expect(game.hits.resp_daiminkan_actual).toBe(1);
    expect(game.hits.resp_hora_actual).toBe(0);
    expect(game.hits.resp_chankan_actual).toBe(0);
    expect(game.candidates).toHaveLength(3);
    expect(game.candidates[0]).toEqual({
      branch: "resp_chi_actual",
      gameId: "game:test",
      seat: 2,
      decisionEventRef: "e1",
    });
  });

  it("splits ron wins by source kind: kakan source = chankan, discard source = hora", () => {
    const stream = streamOf([
      kakan("k1", 1),
      ron("w1", 2, "k1"), // chankan on the kakan tile
      discard("d1", 1),
      ron("w2", 3, "d1"), // ordinary discard-response ron
    ]);
    const game = discoverResponseSurfaceGame(stream);
    // The per-game walk resolves the win source kind exactly.
    expect(game.hits.resp_hora_actual).toBe(1);
    expect(game.hits.resp_chankan_actual).toBe(1);
    const corpus = discoverResponseSurfaceCorpus([stream]);
    expect(corpus.branchHits.resp_chankan_actual).toBe(1);
    expect(corpus.branchHits.resp_hora_actual).toBe(1);
    const chankan = corpus.branchCandidates.resp_chankan_actual;
    expect(chankan).toHaveLength(1);
    expect(chankan[0]).toMatchObject({ seat: 2, decisionEventRef: "k1" });
    const hora = corpus.branchCandidates.resp_hora_actual;
    expect(hora).toHaveLength(1);
    expect(hora[0]).toMatchObject({ seat: 3, decisionEventRef: "d1" });
  });

  it("dedupes repeated calls of one window and caps per-branch candidates", () => {
    const events: Record<string, unknown>[] = [];
    // Ten identical chi responses on the same trigger (dedupe → 1 candidate).
    for (let index = 0; index < 10; index += 1) {
      events.push(discard(`d${index}`, 1));
      events.push(chi(`c${index}`, 2, `d${index}`));
    }
    const corpus = discoverResponseSurfaceCorpus([streamOf(events)], { maxCandidateSamples: 3 });
    expect(corpus.branchHits.resp_chi_actual).toBe(10); // all counted
    expect(corpus.branchCandidates.resp_chi_actual).toHaveLength(3); // capped
  });

  it("reports zero for pass branches (not locally enumerable — acceptance authority)", () => {
    // A discard with NO call afterwards is a pass window, but the discovery
    // census must NOT claim it: a pass needs the per-seat candidate
    // enumeration (is the reviewed player even eligible?). So the branch
    // stays zero and is listed as uncovered — like the A3 census's honest
    // dama_with_tsumo zero.
    const stream = streamOf([
      discard("d1", 1),
      // …and nothing else: seat 0/2/3 all passed.
    ]);
    const game = discoverResponseSurfaceGame(stream);
    // Pass branches are not discovery branches at all: no actual event names
    // a pass, so the census can only enumerate calls/wins. The game walk
    // finds no call/win candidates.
    expect(game.candidates).toEqual([]);
    const corpus = discoverResponseSurfaceCorpus([stream]);
    expect(corpus.uncoveredLocalBranches).toEqual(RESPONSE_SURFACE_DISCOVERY_BRANCHES);
    // Every discovery branch is zero — the census has nothing to show for a
    // game where everyone passed.
    for (const branch of RESPONSE_SURFACE_DISCOVERY_BRANCHES) {
      expect(corpus.branchHits[branch]).toBe(0);
    }
  });

  it("aggregates across streams and reports every stream scanned", () => {
    const a = streamOf([discard("d1", 1), pon("p1", 2, "d1")], "game:a");
    const b = streamOf([discard("d2", 1), chi("c1", 3, "d2")], "game:b");
    const corpus = discoverResponseSurfaceCorpus([a, b]);
    expect(corpus.streamsScanned).toBe(2);
    expect(corpus.branchHits.resp_pon_actual).toBe(1);
    expect(corpus.branchHits.resp_chi_actual).toBe(1);
    expect(corpus.branchCandidates.resp_pon_actual[0]!.gameId).toBe("game:a");
    expect(corpus.branchCandidates.resp_chi_actual[0]!.gameId).toBe("game:b");
  });
});
