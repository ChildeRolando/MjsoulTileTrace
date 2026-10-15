import { createHash } from "node:crypto";
import {
  CANONICAL_EVENT_SCHEMA_VERSION,
  LIBRIICHI_RULE_NORMALIZATION_VERSION,
  CanonicalEventStreamSchema,
  LibriichiRuleResponseSchema,
  libriichiRuleCanonicalJson,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type LibriichiRuleIdentity,
  type LibriichiRuleRequest,
  type Tile,
} from "@riichi-coach/contracts";
import { createLibriichiRuleProjector, replayCanonicalStream } from "@riichi-coach/reasoning";
import {
  ArenaRunAliasVault,
  createArenaBlindObservation,
  createArenaBlindRuleRequest,
  createArenaToolBinding,
  screenArenaDecisions,
} from "../../src/blind-discard-arena.js";
import type { ArenaMcpAuthorizedCase } from "../../src/blind-discard-arena-mcp.js";

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
const digest = (value: unknown) =>
  createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");

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
    mapperVersion: "blind-arena-runner-test/v1",
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
  return { decision, request };
}

function discardRows(request: LibriichiRuleRequest) {
  const actions = [
    { runtimeAction: { index: 0, variant: null }, mjaiActionJson: JSON.stringify({ type: "dahai", actor: 0, pai: "1m", tsumogiri: false }) },
    { runtimeAction: { index: 1, variant: null }, mjaiActionJson: JSON.stringify({ type: "dahai", actor: 0, pai: "2m", tsumogiri: false }) },
  ];
  const content = {
    protocolVersion: request.protocolVersion,
    requestId: request.requestId,
    identity: request.identity,
    status: "ok" as const,
    actions,
  };
  return LibriichiRuleResponseSchema.parse({ ...content, resultId: digest(content) });
}

export function makeArenaMcpCase(): {
  authorizedCase: ArenaMcpAuthorizedCase;
  observation: ReturnType<typeof createArenaBlindObservation>;
  aliases: ArenaRunAliasVault;
} {
  const { decision, request } = realPrefixFixture();
  const selected = screenArenaDecisions([{
    canonicalDecisionOrder: 0,
    decision: { decisionEventRef: decision.decisionEventRef, snapshot: decision.snapshot, facts: decision.facts },
    ruleRequest: request,
    ruleResponse: discardRows(request),
  }]).selected[0]!;
  const aliases = new ArenaRunAliasVault();
  const caseRef = aliases.caseRef(`${selected.snapshot.gameId}\u0000${selected.snapshot.decisionEventRef}`);
  const observation = createArenaBlindObservation({
    selected,
    aliases,
    tools: {
      description: "Read-only candidate analysis and local knowledge search.",
      supportedCapabilities: ["analyze_candidates", "search_knowledge"],
    },
  });
  return {
    authorizedCase: {
      binding: createArenaToolBinding({ caseRef, selected }),
      facts: selected.facts,
    },
    observation,
    aliases,
  };
}

export const arenaFixtureCanaries = Object.freeze({ gameIdCanary, recordIdCanary });
