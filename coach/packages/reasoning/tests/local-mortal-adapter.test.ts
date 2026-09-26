import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LOCAL_MORTAL_ADAPTER_VERSION,
  LOCAL_MORTAL_PROTOCOL_VERSION,
  LocalMortalInferenceSuccessSchema,
  canonicalActionRef,
  type CanonicalGameEvent,
  type ManagedMortalRuntimeIdentity,
  type Tile,
} from "@riichi-coach/contracts";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
} from "@riichi-coach/mahjong-soul-source";
import { mapTenhouRecord } from "@riichi-coach/tenhou-source";
import { computeCanonicalGameFingerprint } from "@riichi-coach/mortal-source";
import {
  buildMortalModelEvaluation,
  collectLocalMortalRonCandidateWindows,
  collectLocalMortalRiichiCandidateWindows,
  collectLocalMortalRiichiAnkanCandidates,
  collectLocalMortalAdditionalTsumoWindows,
  collectRiichiDeclarationTenpaiDiscards,
  createMortalCoverageRegistry,
  collectResponseSingleCandidateProofs,
  entryMatchesDecisionIdentity,
  enumerateResponseCandidates,
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
  localMortalResponseToReportEntry,
  projectLocalMortalRequest,
  replayCanonicalResponseWindows,
  replayCanonicalStream,
  runMortalFullGameReview,
} from "../src/index.js";
import type { ReplayedDecision } from "../src/replay/stream-replayer.js";
import { canonicalStartEvents, canonicalStream, canonicalTile } from "./fixtures/canonical-stream.js";

const identity: ManagedMortalRuntimeIdentity = {
  runtimeImplementation: "Equim-chan/Mortal", runtimeRevision: "0cff2b52982be5b1163aa9a62fb01f03ce91e0d2",
  runtimeVersion: "Mortal V4", runtimeArtifactSha256: "0".repeat(64),
  runtimeModelSha256: "1".repeat(64), runtimeEngineSha256: "2".repeat(64),
  nativeArtifactSha256: "3".repeat(64),
  checkpointRepository: "Yuchen1457/mortal-582500", checkpointRevision: "7386c9f5c751a3ea75efea99737cef5a5ef950f1",
  checkpointModelTag: "mortal-hpc@582500", checkpointFileSha256: "738e0d6e3c0ce9671629554ad39abd147d2ffbac676e80b194c83f2acc0fea20",
  protocolVersion: LOCAL_MORTAL_PROTOCOL_VERSION, adapterVersion: LOCAL_MORTAL_ADAPTER_VERSION,
};

function acceptedRiichiKanStream(hand: readonly Tile[], draw: Tile, actual: "discard" | "ankan") {
  const events: CanonicalGameEvent[] = [...canonicalStartEvents(hand)];
  const add = (event: Record<string, unknown>) => {
    const index = events.length;
    events.push({ ...event, eventId: `game:fixture/0/${index}/0`, sourceRecordRef: `record:${index}` } as CanonicalGameEvent);
  };
  add({ type: "tile_drawn", actor: 0, tile: { visibility: "visible", tile: canonicalTile("9m") }, from: "live_wall" });
  add({ type: "riichi_declared", actor: 0 });
  add({ type: "tile_discarded", actor: 0, tile: canonicalTile("9m"), discardMode: "tsumogiri", riichiDeclarationEventRef: events[3]!.eventId });
  add({ type: "riichi_accepted", actor: 0, declarationEventRef: events[3]!.eventId });
  for (const [seat, id] of ["2z", "3z", "4z"].entries()) {
    add({ type: "tile_drawn", actor: seat + 1, tile: { visibility: "hidden" }, from: "live_wall" });
    add({ type: "tile_discarded", actor: seat + 1, tile: canonicalTile(id as Tile["id"]), discardMode: "tsumogiri", riichiDeclarationEventRef: null });
  }
  add({ type: "tile_drawn", actor: 0, tile: { visibility: "visible", tile: draw }, from: "live_wall" });
  if (actual === "discard") add({ type: "tile_discarded", actor: 0, tile: draw, discardMode: "tsumogiri", riichiDeclarationEventRef: null });
  else add({ type: "ankan_declared", actor: 0, tiles: [draw, draw, draw, draw] });
  return canonicalStream(events);
}

async function realFixture(actor: number) {
  const manifest = JSON.parse(await readFile(new URL("./fixtures/local-mortal/fixture-manifest.json", import.meta.url), "utf8"));
  const source = manifest.fixtures.find((fixture: { sourceKind: string }) => fixture.sourceKind === "mahjong_soul");
  const fixture = JSON.parse(await readFile(new URL(`./fixtures/local-mortal/${source.source}`, import.meta.url), "utf8"));
  const bundle = await loadMahjongSoulProtocolBundle(fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url)));
  const bytes = unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex"));
  const mapped = mapMahjongSoulRecord({ gameId: `majsoul:local-mortal:actor${actor}`, selfActor: actor, recordId: fixture.recordId, recordBytes: bytes, bundle });
  if (mapped.status !== "ready") throw new Error(mapped.code);
  return mapped.stream;
}

async function realTenhouFixture(sourceId: string, actor: number) {
  const manifest = JSON.parse(await readFile(new URL("./fixtures/local-mortal/fixture-manifest.json", import.meta.url), "utf8"));
  const source = manifest.fixtures.find((fixture: { id: string }) => fixture.id === sourceId);
  const raw = await readFile(new URL(`./fixtures/local-mortal/${source.source}`, import.meta.url), "utf8");
  expect(createHash("sha256").update(raw).digest("hex")).toBe(source.sha256);
  const mapped = mapTenhouRecord({ raw, gameId: `tenhou:local-mortal:actor${actor}`, selfActor: actor });
  if (mapped.status !== "ready") throw new Error(mapped.code);
  return mapped.stream;
}

describe("local Mortal canonical projection and conservation", () => {
  it("carries the last-discard pass-only proof through the full-game ledger", async () => {
    const hand = ["5p","5p","5p","3p","4p","1m","2m","3m","1s","2s","3s","1z","2z"].map(id => canonicalTile(id as Tile["id"]));
    const events = [...canonicalStartEvents(hand, canonicalTile("8p"))];
    (events[1] as Extract<CanonicalGameEvent, { type: "round_started" }>).dealer = 2;
    const add = (event: Record<string, unknown>) => {
      const index = events.length;
      events.push({ ...event, eventId: `game:fixture/0/${index}/0`, sourceRecordRef: `record:${index}` } as CanonicalGameEvent);
    };
    const counts = Array<number>(34).fill(4);
    const ids = [...Array.from({ length: 27 }, (_, i) => `${i % 9 + 1}${["m","p","s"][Math.floor(i / 9)]}`), ...Array.from({ length: 7 }, (_, i) => `${i + 1}z`)];
    for (const tile of [...hand, canonicalTile("8p"), canonicalTile("5p", true)]) counts[ids.indexOf(tile.id)]!--;
    const bag = ids.flatMap((id, i) => Array<string>(counts[i]!).fill(id));
    for (let i = 0; i < 70; i++) {
      const actor = (i + 2) % 4;
      const tile = i === 69 ? canonicalTile("5p", true) : canonicalTile(bag[i] as Tile["id"]);
      add({ type: "tile_drawn", actor, tile: actor === 0 ? { visibility: "visible", tile } : { visibility: "hidden" }, from: "live_wall" });
      add({ type: "tile_discarded", actor, tile, discardMode: "tsumogiri", riichiDeclarationEventRef: null });
    }
    const lastDiscard = events.at(-1)!.eventId;
    add({ type: "round_drawn", reason: "exhaustive", tenpaiActors: [] });
    const stream = canonicalStream(events);
    const decision = replayCanonicalResponseWindows(stream).find(row => row.decisionEventRef === lastDiscard)!;
    expect(decision.actualAction?.kind).toBe("pass");
    expect(decision.snapshot.publicState.remainingDraws).toBe(0);
    expect(enumerateResponseCandidates(decision)).toMatchObject({ chiCombinations: [], pon: false, daiminkan: false, ron: false, candidateCount: 1 });
    expect(() => projectLocalMortalRequest({ stream, decision, surface: "response", identity })).toThrow("mortal_source_row_not_expected");
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))));
    try {
      const review = await runMortalFullGameReview({ stream, decisions: replayCanonicalStream(stream), responseDecisions: [decision], engine,
        report: { reportId: "last-discard-regression", adapterVersion: identity.adapterVersion,
          engine: "Mortal", version: "Mortal V4", modelTag: identity.checkpointModelTag, playerId: 0,
          gameFingerprint: computeCanonicalGameFingerprint(stream), kyokus: [] } });
      expect(review.status).toBe("coverage_ready");
      if (review.status === "coverage_ready") {
        const response = review.decisions.find(row => row.surface === "response");
        expect(response?.outcome).toBe("source_row_not_expected");
        expect(response?.singleCandidateProof).toEqual({ shape: "response_single_candidate", candidateCount: 1 });
      }
    } finally { await engine.close(); }
  });

  it.each(["ankan", "kakan"] as const)("does not offer %s on the last live-wall draw", (kind) => {
    const hand = ["5z", "5z", "5z", "1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "1z"]
      .map((id) => canonicalTile(id as Tile["id"]));
    const stream = acceptedRiichiKanStream(hand, canonicalTile("5z"), "discard");
    const decision = structuredClone(replayCanonicalStream(stream).at(-1)!);
    decision.snapshot.publicState.riichiStates[0] = { status: "none", actor: 0, ippatsuAlive: false, declarationEventRef: null, acceptanceEventRef: null };
    decision.snapshot.publicState.remainingDraws = 0;
    if (kind === "kakan") {
      decision.snapshot.privateState.concealedTiles = decision.snapshot.privateState.concealedTiles.filter(tile => tile.id !== "5z");
      decision.snapshot.publicState.melds.push({ actor: 0, kind: "pon", meldRef: "pon", createdEventRef: "pon", latestEventRef: "pon", targetActor: 1,
        calledTile: canonicalTile("5z"), consumedTiles: [canonicalTile("5z"), canonicalTile("5z")], calledDiscardEventRef: "discard" });
    }
    const request = projectLocalMortalRequest({ stream, decision, surface: "self", identity });
    expect(request.candidates.map(row => row.runtimeAction.index).sort((a,b) => a-b))
      .toEqual([0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 31]);
  });

  it.each([false, true])("ends nine-terminals eligibility after a concealed kan (opponent=%s)", (opponent) => {
    const hand = ["5z", "5z", "5z", "1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "4z"]
      .map((id) => canonicalTile(id as Tile["id"]));
    const events = [...canonicalStartEvents(hand)];
    const add = (event: Record<string, unknown>) => {
      const index = events.length;
      events.push({ ...event, eventId: `game:fixture/0/${index}/0`, sourceRecordRef: `record:${index}` } as CanonicalGameEvent);
    };
    if (opponent) {
      (events[1] as Extract<CanonicalGameEvent, { type: "round_started" }>).dealer = 1;
      add({ type: "tile_drawn", actor: 1, tile: { visibility: "hidden" }, from: "live_wall" });
      add({ type: "ankan_declared", actor: 1, tiles: Array(4).fill(canonicalTile("6z")) });
      add({ type: "dora_revealed", indicator: canonicalTile("9p"), kanEventRef: events[3]!.eventId });
      add({ type: "tile_drawn", actor: 1, tile: { visibility: "hidden" }, from: "rinshan" });
      add({ type: "tile_discarded", actor: 1, tile: canonicalTile("7z"), discardMode: "tsumogiri", riichiDeclarationEventRef: null });
      for (const actor of [2, 3]) {
        add({ type: "tile_drawn", actor, tile: { visibility: "hidden" }, from: "live_wall" });
        add({ type: "tile_discarded", actor, tile: canonicalTile("2p"), discardMode: "tsumogiri", riichiDeclarationEventRef: null });
      }
    } else {
      add({ type: "tile_drawn", actor: 0, tile: { visibility: "visible", tile: canonicalTile("5z") }, from: "live_wall" });
      add({ type: "ankan_declared", actor: 0, tiles: Array(4).fill(canonicalTile("5z")) });
      add({ type: "dora_revealed", indicator: canonicalTile("9p"), kanEventRef: events[3]!.eventId });
    }
    add({ type: "tile_drawn", actor: 0, tile: { visibility: "visible", tile: canonicalTile("2m") }, from: opponent ? "live_wall" : "rinshan" });
    add({ type: "tile_discarded", actor: 0, tile: canonicalTile("2m"), discardMode: "tsumogiri", riichiDeclarationEventRef: null });
    const stream = canonicalStream(events);
    const decision = replayCanonicalStream(stream).at(-1)!;
    const request = projectLocalMortalRequest({ stream, decision, surface: "self", identity });
    expect(request.candidates.map((row) => row.runtimeAction.index).sort((a, b) => a - b))
      .toEqual(opponent ? [0, 1, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31] : [0, 1, 8, 9, 17, 18, 26, 27, 28, 29, 30]);
    expect(request.candidates.filter((row) => row.actionRef === request.actualActionRef)).toHaveLength(1);
    if (!opponent) {
      const beforeKan = replayCanonicalStream(stream)[0]!;
      const before = projectLocalMortalRequest({ stream, decision: beforeKan, surface: "self", identity });
      expect(before.candidates.map((row) => row.runtimeAction.index)).toEqual([31, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 42, 44]);
      const unknown = structuredClone(beforeKan);
      unknown.snapshot.publicState.fields.melds = "unknown";
      expect(() => projectLocalMortalRequest({ stream, decision: unknown, surface: "self", identity })).toThrow("mortal_candidate_mismatch");
    }
  });

  it("offers riichi after a concealed kan without treating it as an open hand", async () => {
    const hand = ["5z", "5z", "5z", "1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "1z", "1z"]
      .map((id) => canonicalTile(id as Tile["id"]));
    const events: CanonicalGameEvent[] = [...canonicalStartEvents(hand)];
    const add = (event: Record<string, unknown>) => {
      const index = events.length;
      events.push({ ...event, eventId: `game:fixture/0/${index}/0`, sourceRecordRef: `record:${index}` } as CanonicalGameEvent);
    };
    add({ type: "tile_drawn", actor: 0, tile: { visibility: "visible", tile: canonicalTile("5z") }, from: "live_wall" });
    add({ type: "ankan_declared", actor: 0, tiles: Array(4).fill(canonicalTile("5z")) });
    add({ type: "dora_revealed", indicator: canonicalTile("9p"), kanEventRef: events[3]!.eventId });
    add({ type: "tile_drawn", actor: 0, tile: { visibility: "visible", tile: canonicalTile("3s") }, from: "rinshan" });
    add({ type: "tile_discarded", actor: 0, tile: canonicalTile("3s"), discardMode: "tsumogiri", riichiDeclarationEventRef: null });
    const stream = canonicalStream(events);
    const decision = replayCanonicalStream(stream).at(-1)!;
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))));
    try {
      const windows = await collectLocalMortalRiichiCandidateWindows([decision], engine);
      expect(windows.has(decision.decisionEventRef)).toBe(true);
      const tsumoWindows = await collectLocalMortalAdditionalTsumoWindows([decision], engine);
      const request = projectLocalMortalRequest({ stream, decision, surface: "self", identity,
        includeDeclareRiichi: windows.has(decision.decisionEventRef), includeTsumo: tsumoWindows.has(decision.decisionEventRef) });
      expect(request.candidates.filter((row) => row.runtimeAction.index === 37)).toHaveLength(1);
      expect(request.candidates.filter((row) => row.actionRef === request.actualActionRef)).toHaveLength(1);
      const response = LocalMortalInferenceSuccessSchema.parse({
        protocolVersion: request.protocolVersion, requestId: request.requestId, identity,
        decision: request.decision, status: "ok",
        candidates: request.candidates.map((candidate, index) => ({ runtimeAction: candidate.runtimeAction, qValue: index })),
        preferredRuntimeAction: request.candidates.at(-1)!.runtimeAction,
      });
      const entry = localMortalResponseToReportEntry({ request, response, decision });
      const review = await runMortalFullGameReview({
        stream, decisions: [decision], engine,
        coverageRegistry: createMortalCoverageRegistry(["dama_with_riichi_candidate", "dama_with_tsumo_candidate"]),
        report: {
          reportId: "local-post-ankan-riichi-regression", adapterVersion: identity.adapterVersion,
          engine: "Mortal", version: "Mortal V4", modelTag: identity.checkpointModelTag,
          playerId: 0, gameFingerprint: computeCanonicalGameFingerprint(stream),
          kyokus: [{ roundOrdinal: 0, roundWind: "E", dealer: 0, kyoku: 0, honba: 0, entries: [entry] }],
        },
      });
      expect(review.status).toBe("coverage_ready");
      if (review.status === "coverage_ready") {
        expect(review.decisions[0]?.outcome).toBe("analysis_ready");
        expect(review.retainedAnalyses[0]?.modelEvaluation.candidates.some((row) =>
          row.actionRef === request.candidates.find((candidate) => candidate.runtimeAction.index === 37)!.actionRef)).toBe(true);
      }
    } finally { await engine.close(); }
  });

  it.each([
    { actual: "discard" as const, multi: false }, { actual: "ankan" as const, multi: false },
    { actual: "discard" as const, multi: true }, { actual: "ankan" as const, multi: true },
  ])("keeps the unchosen legal riichi kan: $actual, multi=$multi", async ({ actual, multi }) => {
    const ids = multi ? ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "4p", "5p", "6p", "7z"]
      : ["5z", "5z", "5z", "1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "1z"];
    const hand = ids
      .map((id) => canonicalTile(id as Tile["id"]));
    const stream = acceptedRiichiKanStream(hand, canonicalTile(multi ? "1m" : "5z"), actual);
    const decision = replayCanonicalStream(stream).at(-1)!;
    expect(decision.snapshot.publicState.riichiStates[0]!.status).toBe("accepted");
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))));
    let candidates;
    try { candidates = await collectLocalMortalRiichiAnkanCandidates([decision], engine); }
    finally { await engine.close(); }
    const request = projectLocalMortalRequest({ stream, decision, surface: "self", identity,
      riichiAnkanCandidates: candidates.get(decision.decisionEventRef) ?? [] });
    expect(request.candidates.map((row) => row.runtimeAction.index).sort((a, b) => a - b)).toEqual([multi ? 0 : 31, 42]);
    expect(request.candidates.filter((row) => row.actionRef === request.actualActionRef)).toHaveLength(1);
  });

  it("carries the riichi discard and kan through the full-game model evaluation", async () => {
    const hand = ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "4p", "5p", "6p", "7z"]
      .map((id) => canonicalTile(id as Tile["id"]));
    const stream = acceptedRiichiKanStream(hand, canonicalTile("1m"), "discard");
    const decision = replayCanonicalStream(stream).at(-1)!;
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))));
    try {
      const kan = await collectLocalMortalRiichiAnkanCandidates([decision], engine);
      const request = projectLocalMortalRequest({ stream, decision, surface: "self", identity,
        riichiAnkanCandidates: kan.get(decision.decisionEventRef) ?? [], });
      const response = LocalMortalInferenceSuccessSchema.parse({
        protocolVersion: request.protocolVersion, requestId: request.requestId, identity,
        decision: request.decision, status: "ok",
        candidates: request.candidates.map((candidate, index) => ({ runtimeAction: candidate.runtimeAction, qValue: index })),
        preferredRuntimeAction: request.candidates.at(-1)!.runtimeAction,
      });
      const entry = localMortalResponseToReportEntry({ request, response, decision });
      expect(entry.details.map((row) => row.action.type)).toEqual(["dahai", "ankan"]);
      const review = await runMortalFullGameReview({
        stream, decisions: [decision], engine,
        coverageRegistry: createMortalCoverageRegistry(["self_turn_ankan"]),
        report: {
          reportId: "local-kan-regression", adapterVersion: identity.adapterVersion,
          engine: "Mortal", version: "Mortal V4", modelTag: identity.checkpointModelTag,
          playerId: 0, gameFingerprint: computeCanonicalGameFingerprint(stream),
          kyokus: [{ roundOrdinal: 0, roundWind: "E", dealer: 0, kyoku: 0, honba: 0, entries: [entry] }],
        },
      });
      expect(review.status).toBe("coverage_ready");
      if (review.status === "coverage_ready") {
        expect(review.decisions[0]?.outcome).toBe("analysis_ready");
        expect(review.decisions[0]?.modelSummary?.actualActionRef).toBe(request.actualActionRef);
        expect(review.decisions[0]?.modelSummary?.preferredActions).toHaveLength(1);
      }
    } finally { await engine.close(); }
  });

  it("rejects a fourth tile when the riichi wait uses that triplet", async () => {
    const hand = ["3m", "3m", "3m", "1m", "2m", "4m", "5m", "6m", "1p", "2p", "3p", "1z", "1z"]
      .map((id) => canonicalTile(id as Tile["id"]));
    const stream = acceptedRiichiKanStream(hand, canonicalTile("3m"), "discard");
    const decision = replayCanonicalStream(stream).at(-1)!;
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))));
    try {
      const kan = await collectLocalMortalRiichiAnkanCandidates([decision], engine);
      expect(kan.get(decision.decisionEventRef)).toEqual([]);
      const request = projectLocalMortalRequest({ stream, decision, surface: "self", identity,
        includeTsumo: true, riichiAnkanCandidates: kan.get(decision.decisionEventRef) ?? [] });
      expect(request.candidates.map((row) => row.runtimeAction.index).sort((a, b) => a - b)).toEqual([2, 43]);
      const kanActualStream = acceptedRiichiKanStream(hand, canonicalTile("3m"), "ankan");
      const kanActual = replayCanonicalStream(kanActualStream).at(-1)!;
      expect(() => projectLocalMortalRequest({ stream: kanActualStream, decision: kanActual,
        surface: "self", identity, riichiAnkanCandidates: [] })).toThrow("mortal_candidate_mismatch");
    } finally { await engine.close(); }
  });

  it("does not turn missing kan evidence into a forced-discard proof", async () => {
    const hand = ["5z", "5z", "5z", "1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "1z"]
      .map((id) => canonicalTile(id as Tile["id"]));
    const stream = acceptedRiichiKanStream(hand, canonicalTile("5z"), "discard");
    const decision = replayCanonicalStream(stream).at(-1)!;
    expect(() => projectLocalMortalRequest({ stream, decision, surface: "self", identity }))
      .toThrow("mortal_candidate_mismatch");
    await expect(collectLocalMortalRiichiAnkanCandidates([decision], {
      analyzeHandStructure: async () => { throw new Error("engine unavailable"); },
    })).rejects.toThrow("engine unavailable");
    const impossible = acceptedRiichiKanStream(hand, canonicalTile("9s"), "discard");
    const forced = replayCanonicalStream(impossible).at(-1)!;
    expect(() => projectLocalMortalRequest({ stream: impossible, decision: forced, surface: "self", identity }))
      .toThrow("mortal_source_row_not_expected");
  });

  it("keeps declaration and accepted windows separate", async () => {
    const hand = ["5z", "5z", "5z", "1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "1z"]
      .map((id) => canonicalTile(id as Tile["id"]));
    const stream = acceptedRiichiKanStream(hand, canonicalTile("5z"), "discard");
    const decisions = replayCanonicalStream(stream);
    expect(decisions.map((row) => row.snapshot.privateState.decisionWindow.kind))
      .toEqual(["self_turn", "post_riichi_discard", "self_turn"]);
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))));
    try {
      const kan = await collectLocalMortalRiichiAnkanCandidates(decisions, engine);
      expect([...kan.keys()]).toEqual([decisions[2]!.decisionEventRef]);
      const declaration = decisions[1]!;
      const discards = await collectRiichiDeclarationTenpaiDiscards(declaration, engine);
      expect(discards).not.toBeNull();
      const request = projectLocalMortalRequest({ stream, decision: declaration, surface: "self", identity,
        riichiDiscardCandidates: discards ?? [] });
      expect(request.candidates.every((row) => row.runtimeAction.index !== 42)).toBe(true);
    } finally { await engine.close(); }
  });

  it("keeps tsumo beside the accepted-riichi discard when the drawn tile wins", async () => {
    const hand = ["5z", "5z", "5z", "1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "1z"]
      .map((id) => canonicalTile(id as Tile["id"]));
    const stream = acceptedRiichiKanStream(hand, canonicalTile("1z"), "discard");
    const decision = replayCanonicalStream(stream).at(-1)!;
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))));
    try {
      const tsumo = await collectLocalMortalAdditionalTsumoWindows([decision], engine);
      expect(tsumo.has(decision.decisionEventRef)).toBe(true);
      const request = projectLocalMortalRequest({ stream, decision, surface: "self", identity,
        includeTsumo: tsumo.has(decision.decisionEventRef) });
      expect(request.candidates.map((row) => row.runtimeAction.index).sort((a, b) => a - b)).toEqual([27, 43]);
    } finally { await engine.close(); }
  });

  it("retains an unriichi terminal tsumo in the real wave-1 fixture", async () => {
    const stream = await realFixture(0);
    const decision = replayCanonicalStream(stream).find((row) => row.actualAction?.kind === "tsumo");
    expect(decision).toBeDefined();
    const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))));
    try {
      const windows = await collectLocalMortalAdditionalTsumoWindows([decision!], engine);
      expect(windows.has(decision!.decisionEventRef)).toBe(true);
      const request = projectLocalMortalRequest({ stream, decision: decision!, surface: "self", identity,
        includeTsumo: windows.has(decision!.decisionEventRef) });
      expect(request.candidates.some((row) => row.runtimeAction.index === 43)).toBe(true);
      expect(request.candidates.filter((row) => row.actionRef === request.actualActionRef)).toHaveLength(1);
    } finally { await engine.close(); }
  });

  it("proves pass-only when another structural wait was discarded by self", async () => {
    const hand = ["1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "4s", "5s", "1z", "1z"]
      .map((id) => canonicalTile(id as Parameters<typeof canonicalTile>[0]));
    const events: CanonicalGameEvent[] = [
      ...canonicalStartEvents(hand),
      { type: "tile_drawn", eventId: "game:fixture/0/2/0", sourceRecordRef: "record:2", actor: 0,
        tile: { visibility: "visible", tile: canonicalTile("3s") }, from: "live_wall" },
      { type: "tile_discarded", eventId: "game:fixture/0/3/0", sourceRecordRef: "record:3", actor: 0,
        tile: canonicalTile("3s"), discardMode: "tsumogiri", riichiDeclarationEventRef: null },
      { type: "tile_drawn", eventId: "game:fixture/0/4/0", sourceRecordRef: "record:4", actor: 1,
        tile: { visibility: "hidden" }, from: "live_wall" },
      { type: "tile_discarded", eventId: "game:fixture/0/5/0", sourceRecordRef: "record:5", actor: 1,
        tile: canonicalTile("6s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
      { type: "tile_drawn", eventId: "game:fixture/0/6/0", sourceRecordRef: "record:6", actor: 2,
        tile: { visibility: "hidden" }, from: "live_wall" },
    ];
    const stream = canonicalStream(events);
    const decision = replayCanonicalResponseWindows(stream).find((row) => row.decisionEventRef === "game:fixture/0/5/0");
    expect(decision?.actualAction?.kind).toBe("pass");
    expect(enumerateResponseCandidates(decision!)?.ron).toBe(true);
    const engine = new JsonlFactEngineClient(
      new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))),
    );
    try {
      const verdicts = await collectLocalMortalRonCandidateWindows(stream, [decision!], engine);
      expect(verdicts.get(decision!.decisionEventRef)).toEqual({ status: "proven_ineligible", reason: "furiten_confirmed" });
      expect(collectResponseSingleCandidateProofs([decision!], verdicts).get(0)).toEqual({
        shape: "response_single_candidate", candidateCount: 1,
      });
      expect(() => projectLocalMortalRequest({ stream, decision: decision!, surface: "response", identity }))
        .toThrow("mortal_source_row_not_expected");
      const incompleteRiver: ReplayedDecision = {
        ...decision!,
        snapshot: {
          ...decision!.snapshot,
          publicState: {
            ...decision!.snapshot.publicState,
            fields: { ...decision!.snapshot.publicState.fields, rivers: "partial" as const },
            rivers: [[], decision!.snapshot.publicState.rivers[1]!,
              decision!.snapshot.publicState.rivers[2]!, decision!.snapshot.publicState.rivers[3]!],
          },
        },
      };
      const unknown = await collectLocalMortalRonCandidateWindows(stream, [incompleteRiver], engine);
      expect(unknown.get(decision!.decisionEventRef)).toEqual({ status: "unknown", reason: "furiten_unknown" });
      expect(collectResponseSingleCandidateProofs([incompleteRiver], unknown).has(0)).toBe(false);
    } finally {
      await engine.close();
    }
  }, 15_000);

  it.each(["temporary", "riichi"] as const)(
    "keeps %s furiten ineligible after a passed ron wait",
    async (kind) => {
      const hand = ["1m", "2m", "3m", "1p", "2p", "3p", "1s", "2s", "3s", "4s", "5s", "1z", "1z"]
        .map((id) => canonicalTile(id as Parameters<typeof canonicalTile>[0]));
      const events: CanonicalGameEvent[] = [
        ...canonicalStartEvents(hand),
        { type: "tile_drawn", eventId: "game:fixture/0/2/0", sourceRecordRef: "record:2", actor: 0,
          tile: { visibility: "visible", tile: canonicalTile("9p") }, from: "live_wall" },
        ...(kind === "riichi" ? [{ type: "riichi_declared" as const, eventId: "game:fixture/0/3/0",
          sourceRecordRef: "record:3", actor: 0 }] : []),
        { type: "tile_discarded", eventId: "game:fixture/0/4/0", sourceRecordRef: "record:4", actor: 0,
          tile: canonicalTile("9p"), discardMode: "tsumogiri",
          riichiDeclarationEventRef: kind === "riichi" ? "game:fixture/0/3/0" : null },
        ...(kind === "riichi" ? [{ type: "riichi_accepted" as const, eventId: "game:fixture/0/5/0",
          sourceRecordRef: "record:5", actor: 0, declarationEventRef: "game:fixture/0/3/0" }] : []),
        { type: "tile_drawn", eventId: "game:fixture/0/6/0", sourceRecordRef: "record:6", actor: 1,
          tile: { visibility: "hidden" }, from: "live_wall" },
        { type: "tile_discarded", eventId: "game:fixture/0/7/0", sourceRecordRef: "record:7", actor: 1,
          tile: canonicalTile("6s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
        { type: "tile_drawn", eventId: "game:fixture/0/8/0", sourceRecordRef: "record:8", actor: 2,
          tile: { visibility: "hidden" }, from: "live_wall" },
        { type: "tile_discarded", eventId: "game:fixture/0/9/0", sourceRecordRef: "record:9", actor: 2,
          tile: canonicalTile("6s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
        { type: "tile_drawn", eventId: "game:fixture/0/10/0", sourceRecordRef: "record:10", actor: 3,
          tile: { visibility: "hidden" }, from: "live_wall" },
      ];
      const stream = canonicalStream(events);
      const decision = replayCanonicalResponseWindows(stream).find((row) => row.decisionEventRef === "game:fixture/0/9/0");
      expect(decision?.actualAction?.kind).toBe("pass");
      expect(enumerateResponseCandidates(decision!)?.ron).toBe(true);
      const engine = new JsonlFactEngineClient(
        new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))),
      );
      try {
        const verdicts = await collectLocalMortalRonCandidateWindows(stream, [decision!], engine);
        expect(verdicts.get(decision!.decisionEventRef)).toEqual({ status: "proven_ineligible", reason: "furiten_confirmed" });
        expect(collectResponseSingleCandidateProofs([decision!], verdicts).get(0)).toEqual({
          shape: "response_single_candidate", candidateCount: 1,
        });
      } finally {
        await engine.close();
      }
    },
    15_000,
  );

  it("uses Mortal's red-first pon realization regardless of hand order", async () => {
    const stream = await realFixture(3);
    const original = replayCanonicalResponseWindows(stream).find((row) =>
      row.actualAction?.kind === "pass"
      && row.snapshot.privateState.decisionWindow.kind === "discard_response"
      && row.snapshot.privateState.decisionWindow.offeredTile.id === "5s"
    );
    expect(original).toBeDefined();
    const tiles = original!.snapshot.privateState.concealedTiles;
    const mixed = [
      { id: "5s" as const, red: false },
      { id: "5s" as const, red: false },
      { id: "5s" as const, red: true },
      ...tiles.filter((tile) => tile.id !== "5s").slice(0, 10),
    ];
    const decision = {
      ...original!,
      snapshot: {
        ...original!.snapshot,
        privateState: { ...original!.snapshot.privateState, concealedTiles: mixed },
      },
    };
    for (const hand of [mixed, [...mixed].reverse()]) {
      const request = projectLocalMortalRequest({
        stream, decision: {
          ...decision,
          snapshot: { ...decision.snapshot, privateState: { ...decision.snapshot.privateState, concealedTiles: hand } },
        },
        surface: "response", identity,
      });
      const pon = request.candidates.map((candidate) => JSON.parse(candidate.mjaiActionJson))
        .find((action) => action.type === "pon");
      expect(pon.consumed).toEqual(["5s", "5sr"]);
      expect(request.actualActionRef).toBe(canonicalActionRef(original!.actualAction!));
    }
    const window = original!.snapshot.privateState.decisionWindow;
    if (window.kind !== "discard_response" || window.sourceActor === null) throw new Error("missing response fixture");
    const actualPon = {
      kind: "pon" as const, calledTile: window.offeredTile,
      consumedTiles: [mixed[0]!, mixed[2]!] as [typeof mixed[number], typeof mixed[number]],
      targetActor: window.sourceActor, responseEventRef: window.triggerEventRef,
    };
    const actualDecision = { ...decision, actualAction: actualPon };
    const actualRequest = projectLocalMortalRequest({ stream, decision: actualDecision, surface: "response", identity });
    expect(actualRequest.actualActionRef).toBe(canonicalActionRef(actualPon));
    const wrongPon = { ...actualPon, consumedTiles: [mixed[0]!, mixed[1]!] as [typeof mixed[number], typeof mixed[number]] };
    expect(() => projectLocalMortalRequest({
      stream, decision: { ...decision, actualAction: wrongPon }, surface: "response", identity,
    })).toThrow("mortal_actual_action_mismatch");
  });

  it("keeps unknown ron eligibility unproven with the packaged fact engine", async () => {
    const stream = await realFixture(3);
    const original = replayCanonicalResponseWindows(stream)
      .find((row) => row.decisionEventRef.endsWith("/5/969/0"));
    expect(original?.actualAction?.kind).toBe("pass");
    expect(enumerateResponseCandidates(original!)?.ron).toBe(true);
    const decision = {
      ...original!,
      facts: {
        ...original!.facts,
        handStructureYakuContext: {
          ...original!.facts.handStructureYakuContext!,
          windsStatus: "unknown" as const,
          roundWindTile34: null,
          selfWindTile34: null,
        },
      },
    };
    const engine = new JsonlFactEngineClient(
      new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))),
    );
    try {
      const originalVerdicts = await collectLocalMortalRonCandidateWindows(stream, [original!], engine);
      expect(originalVerdicts.get(original!.decisionEventRef)).toEqual({ status: "unknown", reason: "hand_structure_unknown" });
      const verdicts = await collectLocalMortalRonCandidateWindows(stream, [decision], engine);
      expect(verdicts.get(decision.decisionEventRef)?.status).toBe("unknown");
      expect(collectResponseSingleCandidateProofs([decision], verdicts).has(0)).toBe(false);
      const incompleteHistory = {
        ...stream,
        completeness: { ...stream.completeness, responseOpportunities: "partial" as const },
      };
      const historyVerdicts = await collectLocalMortalRonCandidateWindows(incompleteHistory, [original!], engine);
      expect(historyVerdicts.get(original!.decisionEventRef)?.status).toBe("unknown");
      expect(collectResponseSingleCandidateProofs([original!], historyVerdicts).has(0)).toBe(false);
    } finally {
      await engine.close();
    }
  }, 15_000);
  it("keeps a real chankan window in the registered supplemental fixture", async () => {
    const stream = await realTenhouFixture("tenhou-chankan-supplement", 1);
    const chankan = replayCanonicalResponseWindows(stream).find((decision) =>
      decision.snapshot.privateState.decisionWindow.kind === "kan_response"
      && decision.actualAction?.kind === "ron"
    );
    expect(chankan).toBeDefined();
    const request = projectLocalMortalRequest({
      stream,
      decision: chankan!,
      surface: "response",
      identity,
      includeRon: true,
    });
    expect(request.candidates.map((candidate) => candidate.runtimeAction.index)).toEqual([43, 45]);
    expect(request.actualActionRef).toBe(canonicalActionRef(chankan!.actualAction!));
    expect(replayCanonicalResponseWindows(stream).some((decision) =>
      decision.actualAction?.kind === "pass" && enumerateResponseCandidates(decision)?.ron === true
    )).toBe(true);
  });

  it("proves real Tenhou ron, chankan, and pass-on-ron eligibility from complete history", async () => {
    const engine = new JsonlFactEngineClient(
      new ManagedFactEngineTransport(fileURLToPath(new URL("../../../resources/", import.meta.url))),
    );
    try {
      const targets = [
        { fixture: "tenhou-chankan-supplement", kind: "kan_response", actual: "ron" },
        { fixture: "tenhou-chankan-supplement", kind: "discard_response", actual: "pass" },
        { fixture: "tenhou-daiminkan-supplement", kind: "discard_response", actual: "ron" },
      ] as const;
      for (const target of targets) {
        const stream = await realTenhouFixture(target.fixture, 1);
        const decisions = replayCanonicalResponseWindows(stream);
        const verdicts = await collectLocalMortalRonCandidateWindows(stream, decisions, engine);
        const match = decisions.find((decision) =>
          decision.snapshot.privateState.decisionWindow.kind === target.kind
          && decision.actualAction?.kind === target.actual
          && verdicts.get(decision.decisionEventRef)?.status === "eligible"
        );
        expect(match, JSON.stringify(target)).toBeDefined();
      }
    } finally {
      await engine.close();
    }
  }, 30_000);

  it("keeps a real daiminkan actual window in the registered supplemental fixture", async () => {
    const stream = await realTenhouFixture("tenhou-daiminkan-supplement", 1);
    const daiminkan = replayCanonicalResponseWindows(stream).find((decision) =>
      decision.actualAction?.kind === "daiminkan"
    );
    expect(daiminkan).toBeDefined();
    const request = projectLocalMortalRequest({
      stream,
      decision: daiminkan!,
      surface: "response",
      identity,
    });
    expect(request.candidates.map((candidate) => candidate.runtimeAction.index)).toEqual(expect.arrayContaining([42, 45]));
    expect(request.actualActionRef).toBe(canonicalActionRef(daiminkan!.actualAction!));
  });

  it("realizes chi candidates from the frozen hand with Mortal's red-five rule", async () => {
    const onlyRedStream = await realFixture(0);
    const onlyRedDecision = replayCanonicalResponseWindows(onlyRedStream)
      .find((row) => row.decisionEventRef.endsWith("/2/374/0"));
    expect(onlyRedDecision?.actualAction?.kind).toBe("pass");
    const onlyRedRequest = projectLocalMortalRequest({
      stream: onlyRedStream,
      decision: onlyRedDecision!,
      surface: "response",
      identity,
    });
    const onlyRedChi = onlyRedRequest.candidates
      .map((candidate) => JSON.parse(candidate.mjaiActionJson))
      .find((action) => action.type === "chi" && action.consumed.includes("3s") && action.consumed.some((tile: string) => tile.startsWith("5s")));
    expect(onlyRedChi.consumed).toEqual(["3s", "5sr"]);
    expect(onlyRedRequest.actualActionRef).toBe(canonicalActionRef(onlyRedDecision!.actualAction!));

    const mixedStream = await realFixture(3);
    const mixedDecision = replayCanonicalResponseWindows(mixedStream)
      .find((row) => row.decisionEventRef.endsWith("/0/83/0"));
    expect(mixedDecision?.actualAction?.kind).toBe("pass");
    const mixedRequest = projectLocalMortalRequest({
      stream: mixedStream,
      decision: mixedDecision!,
      surface: "response",
      identity,
    });
    const mixedChi = mixedRequest.candidates
      .map((candidate) => JSON.parse(candidate.mjaiActionJson))
      .find((action) => action.type === "chi" && action.consumed.includes("3s") && action.consumed.some((tile: string) => tile.startsWith("5s")));
    expect(mixedChi.consumed).toEqual(["3s", "5sr"]);

    const actualChiDecision = replayCanonicalResponseWindows(mixedStream)
      .find((row) => row.decisionEventRef.endsWith("/4/833/0"));
    expect(actualChiDecision?.actualAction?.kind).toBe("chi");
    const actualChiRequest = projectLocalMortalRequest({
      stream: mixedStream,
      decision: actualChiDecision!,
      surface: "response",
      identity,
    });
    expect(actualChiRequest.candidates.filter((candidate) =>
      candidate.actionRef === canonicalActionRef(actualChiDecision!.actualAction!)
    )).toHaveLength(1);
  }, 15_000);

  it("projects a real response window with a strict candidate bijection and actual correspondence", async () => {
    const stream = await realFixture(0);
    const decision = replayCanonicalResponseWindows(stream).find((row) => {
      const request = projectLocalMortalRequest({ stream, decision: row, surface: "response", identity });
      return request.candidates.some((candidate) => candidate.runtimeAction.index === 42);
    });
    expect(decision).toBeDefined();
    const factsBefore = JSON.stringify(decision!.facts);
    const request = projectLocalMortalRequest({ stream, decision: decision!, surface: "response", identity });
    const keys = request.candidates.map((candidate) => JSON.stringify(candidate.runtimeAction));
    expect(new Set(keys).size).toBe(keys.length);
    expect(request.candidates.map((candidate) => candidate.runtimeAction.index)).toEqual(expect.arrayContaining([42, 45]));
    expect(request.candidates.some((candidate) => candidate.actionRef === canonicalActionRef(decision!.actualAction!))).toBe(true);

    const response = LocalMortalInferenceSuccessSchema.parse({
      protocolVersion: request.protocolVersion, requestId: request.requestId, identity,
      decision: request.decision, status: "ok",
      candidates: request.candidates.map((candidate, index) => ({ runtimeAction: candidate.runtimeAction, qValue: index / 10 })),
      preferredRuntimeAction: request.candidates.at(-1)!.runtimeAction,
    });
    const entry = localMortalResponseToReportEntry({ request, response, decision: decision! });
    expect(entryMatchesDecisionIdentity(entry, decision!)).toBe(true);
    expect(entryMatchesDecisionIdentity({
      ...entry,
      localDecisionIdentity: { ...entry.localDecisionIdentity!, decisionId: "another-decision" },
    }, decision!)).toBe(false);
    expect(JSON.stringify(decision!.facts)).toBe(factsBefore);

    const evaluation = buildMortalModelEvaluation({
      evaluationId: "local-eval", comparisonSetId: "local-comparison", decisionLayerRef: decision!.decisionEventRef,
      engineVersion: "runtime", adapterVersion: LOCAL_MORTAL_ADAPTER_VERSION,
      actualActionRef: canonicalActionRef(decision!.actualAction!),
      detailPolicy: { threshold: 10, unit: "model_selection_score_points", boundary: "greater_than_or_equal_is_detailed", policyVersion: "mortal-review/v1", frozenAt: "2026-09-24T00:00:00.000Z" },
      candidates: request.candidates.map((candidate, index) => ({ actionRef: candidate.actionRef, probability: index === request.candidates.length - 1 ? 0.6 : 0.4 / (request.candidates.length - 1), qValue: index / 10 })),
    });
    expect(evaluation.status).toBe("ready");
    if (evaluation.status === "ready") expect(evaluation.evaluation.modelReason).toBe("unknown");
    expect(JSON.stringify(decision!.facts)).toBe(factsBefore);
  });

  it("projects real self-turn decision identity without source protobuf/account payload", async () => {
    const stream = await realFixture(2);
    const decision = replayCanonicalStream(stream).find((row) => row.actualAction?.kind === "ankan");
    expect(decision).toBeDefined();
    const request = projectLocalMortalRequest({ stream, decision: decision!, surface: "self", identity });
    expect(request.recordId).toBe(stream.gameId);
    expect(request.candidates.some((candidate) => candidate.runtimeAction.index === 42)).toBe(true);
    expect(JSON.stringify(request)).not.toMatch(/protobuf|account|token|cookie|recordUrl/i);
  });

  it("fails closed at the reasoning seam on cross-decision, missing, duplicate, and non-argmax responses", async () => {
    const stream = await realFixture(0);
    const decision = replayCanonicalStream(stream).find((row) => {
      try {
        return projectLocalMortalRequest({ stream, decision: row, surface: "self", identity }).candidates.length > 2;
      } catch {
        return false;
      }
    });
    expect(decision).toBeDefined();
    const request = projectLocalMortalRequest({ stream, decision: decision!, surface: "self", identity });
    const response = LocalMortalInferenceSuccessSchema.parse({
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
      identity,
      decision: request.decision,
      status: "ok",
      candidates: request.candidates.map((candidate, index) => ({
        runtimeAction: candidate.runtimeAction,
        qValue: index,
      })),
      preferredRuntimeAction: request.candidates.at(-1)!.runtimeAction,
    });

    const crossDecision = structuredClone(response);
    crossDecision.requestId = "another-request";
    expect(() => localMortalResponseToReportEntry({ request, response: crossDecision, decision: decision! }))
      .toThrow("mortal_protocol_invalid");

    const missing = structuredClone(response);
    missing.candidates.pop();
    expect(() => localMortalResponseToReportEntry({ request, response: missing, decision: decision! }))
      .toThrow("mortal_candidate_mismatch");

    const duplicate = structuredClone(response);
    duplicate.candidates[0] = duplicate.candidates[1]!;
    expect(() => localMortalResponseToReportEntry({ request, response: duplicate, decision: decision! }))
      .toThrow("mortal_candidate_mismatch");

    const nonArgmax = structuredClone(response);
    nonArgmax.preferredRuntimeAction = request.candidates[0]!.runtimeAction;
    expect(() => localMortalResponseToReportEntry({ request, response: nonArgmax, decision: decision! }))
      .toThrow("mortal_candidate_mismatch");
  });
});
