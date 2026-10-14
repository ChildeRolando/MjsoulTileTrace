import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_EVENT_SCHEMA_VERSION,
  LIBRIICHI_RULE_NORMALIZATION_VERSION,
  CanonicalEventStreamSchema,
  LibriichiRuleResponseSchema,
  canonicalActionRef,
  libriichiRuleCanonicalJson,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type LibriichiRuleIdentity,
  type LibriichiRuleRequest,
  type Tile,
} from "@riichi-coach/contracts";
import {
  createLibriichiRuleProjector,
  replayCanonicalStream,
  type ReplayedDecision,
} from "@riichi-coach/reasoning";
import {
  ArenaRunAliasVault,
  createArenaBlindRuleRequest,
  createArenaBlindObservation,
  createArenaToolBinding,
  screenArenaDecisions,
} from "../src/blind-discard-arena.js";

const spec = readFileSync(
  new URL("../../../docs/specs/2026-10-09-blind-discard-arena.md", import.meta.url),
  "utf8",
);
const digest = (value: unknown) =>
  createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");
const gameIdCanary = "gameId-CANARY-blind-arena";
const recordIdCanary = "recordId-CANARY-blind-arena";
const ruleIdentity: LibriichiRuleIdentity = {
  implementation: "Equim-chan/Mortal/libriichi",
  revision: "0".repeat(40),
  nativeArtifactSha256: "1".repeat(64),
  wrapperSha256: "2".repeat(64),
  normalizationVersion: LIBRIICHI_RULE_NORMALIZATION_VERSION,
};
const tile = (id: Tile["id"], red = false): Tile => ({ id, red });

function realPrefixFixture() {
  const events: CanonicalGameEvent[] = [
    { type: "game_started", eventId: `${gameIdCanary}/0/0/0`, sourceRecordRef: `${recordIdCanary}/0` },
    {
      type: "round_started", eventId: `${gameIdCanary}/0/1/0`, sourceRecordRef: `${recordIdCanary}/1`,
      roundOrdinal: 0, roundWind: "E", hand: 1, honba: 0, riichiSticks: 0, dealer: 0,
      scores: [25000, 25000, 25000, 25000], doraIndicator: tile("1s"),
      selfHand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"].map(id => tile(id as Tile["id"])),
      remainingDraws: 70,
    },
    { type: "tile_drawn", eventId: `${gameIdCanary}/0/2/0`, sourceRecordRef: `${recordIdCanary}/2`, actor: 0, tile: { visibility: "visible", tile: tile("5p") }, from: "live_wall" },
    { type: "tile_discarded", eventId: `${gameIdCanary}/0/3/0`, sourceRecordRef: `${recordIdCanary}/3`, actor: 0, tile: tile("5p"), discardMode: "tsumogiri", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: `${gameIdCanary}/0/4/0`, sourceRecordRef: `${recordIdCanary}/4`, actor: 1, tile: { visibility: "hidden" }, from: "live_wall" },
    { type: "tile_discarded", eventId: `${gameIdCanary}/0/5/0`, sourceRecordRef: `${recordIdCanary}/5`, actor: 1, tile: tile("9s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: `${gameIdCanary}/0/6/0`, sourceRecordRef: `${recordIdCanary}/6`, actor: 2, tile: { visibility: "hidden" }, from: "live_wall" },
    { type: "tile_discarded", eventId: `${gameIdCanary}/0/7/0`, sourceRecordRef: `${recordIdCanary}/7`, actor: 2, tile: tile("8s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: `${gameIdCanary}/0/8/0`, sourceRecordRef: `${recordIdCanary}/8`, actor: 3, tile: { visibility: "hidden" }, from: "live_wall" },
    { type: "tile_discarded", eventId: `${gameIdCanary}/0/9/0`, sourceRecordRef: `${recordIdCanary}/9`, actor: 3, tile: tile("7s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: `${gameIdCanary}/0/10/0`, sourceRecordRef: `${recordIdCanary}/10`, actor: 0, tile: { visibility: "visible", tile: tile("6p") }, from: "live_wall" },
    { type: "tile_discarded", eventId: `${gameIdCanary}/0/11/0`, sourceRecordRef: `${recordIdCanary}/11`, actor: 0, tile: tile("6m"), discardMode: "tedashi", riichiDeclarationEventRef: null },
  ];
  const stream: CanonicalEventStream = CanonicalEventStreamSchema.parse({
    schemaVersion: CANONICAL_EVENT_SCHEMA_VERSION,
    mapperVersion: "blind-arena-case-test/v1",
    gameId: gameIdCanary,
    sourceKind: "fixture",
    sourceRecordHash: `sha256:${"a".repeat(64)}`,
    playerCount: 4,
    selfActor: 0,
    completeness: {
      eventSequence: "complete", ruleSet: "complete", scores: "complete", doraIndicators: "complete",
      rivers: "complete", calledDiscardMarkers: "complete", melds: "complete", remainingDraws: "complete",
      settlement: "complete", responseOpportunities: "complete",
    },
    ruleSet: {
      length: "south", redFives: { man: 1, pin: 1, sou: 1 }, openTanyao: true,
      atamahane: false, westExtension: "sudden_death", ippatsuCancelledByAnkan: true,
    },
    events,
  });
  const decision = replayCanonicalStream(stream)[1]!;
  const request = createArenaBlindRuleRequest(createLibriichiRuleProjector(stream, ruleIdentity)(decision));
  return { stream, decision, request };
}

function discardRows(request: LibriichiRuleRequest, reverse = false) {
  const rows = [
    { runtimeAction: { index: 0, variant: null }, mjaiActionJson: JSON.stringify({ type: "dahai", actor: 0, pai: "1m", tsumogiri: false }) },
    { runtimeAction: { index: 1, variant: null }, mjaiActionJson: JSON.stringify({ type: "dahai", actor: 0, pai: "2m", tsumogiri: false }) },
  ];
  const actions = reverse ? rows.reverse() : rows;
  const content = {
    protocolVersion: request.protocolVersion,
    requestId: request.requestId,
    identity: request.identity,
    status: "ok" as const,
    actions,
  };
  return LibriichiRuleResponseSchema.parse({ ...content, resultId: digest(content) });
}

function screenInput(decision: ReplayedDecision, request: LibriichiRuleRequest, response = discardRows(request), order = 0) {
  return {
    canonicalDecisionOrder: order,
    decision: {
      decisionEventRef: decision.decisionEventRef,
      snapshot: decision.snapshot,
      facts: decision.facts,
    },
    ruleRequest: request,
    ruleResponse: response,
  };
}

function firstDecisionOutput(decision: ReplayedDecision, request: LibriichiRuleRequest, response = discardRows(request)) {
  const selected = screenArenaDecisions([screenInput(decision, request, response)]).selected[0]!;
  const aliases = new ArenaRunAliasVault();
  return {
    selected,
    aliases,
    observation: createArenaBlindObservation({
      selected,
      aliases,
      tools: { description: "Inspect only the offered actions.", supportedCapabilities: ["hand13"] },
    }),
    binding: createArenaToolBinding({
      caseRef: aliases.caseRef(`${selected.snapshot.gameId}\u0000${selected.snapshot.decisionEventRef}`),
      selected,
    }),
  };
}

describe("Blind Discard Arena case and observation contract", () => {
  it("keeps the durable spec as the single contract owner", () => {
    expect(spec).toContain("所有 Coach/provider 可见的来源身份引用均使用每次 run 独立生成的 opaque alias");
    expect(spec).toContain("实际/标签变化必须 byte-for-byte 保持相同");
    expect(spec).toContain("候选顺序也不得改变");
    expect(spec).toContain("coach/packages/desktop/tests/blind-discard-arena-case.test.ts");
  });

  it("keeps known decision-time information while aliasing source identities", () => {
    const { decision, request } = realPrefixFixture();
    const { observation, binding } = firstDecisionOutput(decision, request);
    const serialized = JSON.stringify(observation);

    expect(observation.visibleState.self.concealedTiles).toEqual(decision.snapshot.privateState.concealedTiles);
    expect(observation.visibleState.self.currentDraw?.tile).toEqual(decision.snapshot.privateState.currentDraw?.tile);
    expect(observation.visibleState.rivers.flat()).toHaveLength(4);
    expect(observation.visibleState.rivers[1]![0]!.tile).toEqual(tile("9s"));
    expect(observation.visibleState.doraIndicators).toEqual(decision.snapshot.publicState.doraIndicators);
    expect(observation.candidates.map(candidate => candidate.actionRef)).toEqual(
      observation.candidates.map(candidate => candidate.actionRef).slice().sort(),
    );
    expect(observation.caseRef).toMatch(/^arena-case:v1:/);
    expect(observation.visibleState.rivers[1]![0]!.sourceRef).toMatch(/^arena-ref:v1:/);
    expect(serialized).not.toContain(gameIdCanary);
    expect(serialized).not.toContain(recordIdCanary);
    expect(serialized).not.toContain(decision.snapshot.decisionEventRef);
    expect(observation).not.toHaveProperty("actualAction");
    expect(observation).not.toHaveProperty("label");
    expect(binding).not.toHaveProperty("label");
    expect(JSON.stringify(binding)).not.toMatch(/qValue|probability|preferredRuntimeAction|mortalLabel/i);
  });

  it("uses fresh opaque aliases per run and stable aliases within one run", () => {
    const first = new ArenaRunAliasVault();
    const second = new ArenaRunAliasVault();
    const sourceRef = `${recordIdCanary}/evidence/12`;
    expect(first.reference(sourceRef)).toBe(first.reference(sourceRef));
    expect(first.reference(sourceRef)).not.toBe(second.reference(sourceRef));
    expect(first.caseRef(`${gameIdCanary}/decision/12`)).not.toContain(gameIdCanary);
    expect(JSON.stringify(first)).toBe("{}");
  });

  it("does not let actual choice, future events, Mortal label, or candidate result order affect blind bytes", () => {
    const { stream, decision, request } = realPrefixFixture();
    const baseResponse = discardRows(request);
    const base = screenArenaDecisions([screenInput(decision, request, baseResponse)]).selected[0]!;
    const aliases = new ArenaRunAliasVault();
    const labelOne = { actionRef: canonicalActionRef({ kind: "discard", tile: tile("1m"), discardMode: "tedashi" }), qValue: 42 };
    const labelTwo = { actionRef: canonicalActionRef({ kind: "discard", tile: tile("2m"), discardMode: "tedashi" }), qValue: -900 };
    const outputFor = (selected: typeof base) => JSON.stringify(
      createArenaBlindObservation({ selected, aliases }),
    );
    const firstBytes = outputFor(base);

    const changedDecision: ReplayedDecision = {
      ...structuredClone(decision),
      actualAction: { kind: "discard", tile: tile("2m"), discardMode: "tedashi" },
    };
    const changedResponse = discardRows(request, true);
    const changed = screenArenaDecisions([screenInput(changedDecision, request, changedResponse)]).selected[0]!;
    const withFutureChanged = structuredClone(stream);
    withFutureChanged.events[11] = {
      type: "tile_discarded", eventId: `${gameIdCanary}/0/11/0`, sourceRecordRef: `${recordIdCanary}/11`,
      actor: 0, tile: tile("3m"), discardMode: "tedashi", riichiDeclarationEventRef: null,
    };
    expect(withFutureChanged.events[11]).not.toEqual(stream.events[11]);
    const futureDecision = replayCanonicalStream(withFutureChanged)[1]!;
    const futureRequest = createArenaBlindRuleRequest(createLibriichiRuleProjector(withFutureChanged, ruleIdentity)(futureDecision));
    const futureSelected = screenArenaDecisions([screenInput(futureDecision, futureRequest, discardRows(futureRequest))]).selected[0]!;

    expect(outputFor(changed)).toBe(firstBytes);
    expect(outputFor(futureSelected)).toBe(firstBytes);
    expect(libriichiRuleCanonicalJson(futureRequest)).toBe(libriichiRuleCanonicalJson(request));
    expect(changed.candidates.map(candidate => candidate.actionRef)).toEqual(base.candidates.map(candidate => candidate.actionRef));
    expect(() => screenArenaDecisions([{ ...screenInput(decision, request), referenceLabel: labelOne }])).toThrow("arena_screen_input_invalid");
    expect(() => screenArenaDecisions([{ ...screenInput(decision, request), mortalLabel: labelTwo }])).toThrow("arena_screen_input_invalid");
  });

  it("requires prefix-bound Arena rule requests before screening", () => {
    const { stream, decision, request } = realPrefixFixture();
    const fullStreamRequest = createLibriichiRuleProjector(stream, ruleIdentity)(decision);
    expect(fullStreamRequest.canonicalStreamIdentity).not.toBe(request.canonicalStreamIdentity);
    expect(() => screenArenaDecisions([screenInput(decision, fullStreamRequest, discardRows(fullStreamRequest))]))
      .toThrow("arena_screen_input_invalid");
  });

  it("selects only complete multi-candidate plain discards and records every exclusion", () => {
    const { decision, request } = realPrefixFixture();
    const valid = discardRows(request);
    const singleton = discardRows(request);
    if (singleton.status !== "ok") throw new Error("fixture_rule_result_invalid");
    singleton.actions.splice(1, 1);
    const { resultId: _old, ...singletonContent } = singleton;
    singleton.resultId = digest(singletonContent);

    const failed = {
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
      status: "error" as const,
      code: "rules_runtime_failed" as const,
    };
    const mixedContent = {
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
      identity: request.identity,
      status: "ok" as const,
      actions: [
        { runtimeAction: { index: 0, variant: null }, mjaiActionJson: JSON.stringify({ type: "dahai", actor: 0, pai: "1m", tsumogiri: false }) },
        { runtimeAction: { index: 37, variant: null }, mjaiActionJson: JSON.stringify({ type: "reach", actor: 0 }) },
      ],
    };
    const mixed = LibriichiRuleResponseSchema.parse({ ...mixedContent, resultId: digest(mixedContent) });
    const noAction = {
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
      identity: request.identity,
      status: "non_action" as const,
      reason: "native_cannot_act" as const,
    };
    const nonAction = LibriichiRuleResponseSchema.parse({ ...noAction, resultId: digest(noAction) });

    const screening = screenArenaDecisions([
      screenInput(decision, request, valid, 3),
      screenInput(decision, request, singleton, 1),
      screenInput(decision, request, failed, 0),
      screenInput(decision, request, mixed, 2),
      screenInput(decision, request, nonAction, 4),
    ], { maxIncluded: 1 });

    expect(screening.selected).toHaveLength(1);
    expect(screening.selected[0]!.canonicalDecisionOrder).toBe(3);
    expect(screening.selected[0]!.candidates).toHaveLength(2);
    expect(screening.exclusionCounts).toMatchObject({
      rules_unavailable: 1,
      fewer_than_two_candidates: 1,
      contains_non_discard_action: 1,
      non_action: 1,
    });
    expect(screening.excluded).toContainEqual({ canonicalDecisionOrder: 2, reason: "contains_non_discard_action" });
  });

  it("rejects hidden answer fields at the case-screening boundary", () => {
    const { decision, request } = realPrefixFixture();
    expect(() => screenArenaDecisions([{
      ...screenInput(decision, request),
      actualAction: decision.actualAction,
      mortalLabel: { actionRef: "answer-canary" },
    }])).toThrow("arena_screen_input_invalid");
  });

  it("preserves red-five identity in canonical action references", () => {
    const plain = canonicalActionRef({ kind: "discard", tile: tile("5m", false), discardMode: "tedashi" });
    const red = canonicalActionRef({ kind: "discard", tile: tile("5m", true), discardMode: "tedashi" });
    expect(plain).not.toBe(red);
  });
});
