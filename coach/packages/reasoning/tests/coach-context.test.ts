import { describe, expect, it } from "vitest";
import {
  COACH_CONTEXT_EVENT_REFERENCE_KEYS,
  COACH_CONTEXT_LOCAL_ONLY_KEYS,
  COACH_CONTEXT_MELD_REFERENCE_KEYS,
  COACH_CONTEXT_PAYLOAD_ALLOWLIST,
  GRAPH_SLICE_PAYLOAD_ALLOWLIST,
  KnownGameFactsSchema,
  RiichiActionSchema,
  COACH_REASONING_DRAFT_SCHEMA_VERSION_V1,
  CoachContextSchema,
  SELECTOR_POLICY_VERSION_V1,
  canonicalActionRef,
  parseCanonicalEventRef,
  type KnownGameFacts,
  type ContextGraphEdge,
  type ContextGraphNode,
  type GraphContextSlice,
  type ReviewSelectionResult,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { buildCoachRequest, decodeCoachReasoningDraft, prepareCoachRequest } from "../src/coach-prompt.js";
import { canonicalJson, sha256Hex } from "../src/analysis/package-identity.js";
import { buildGraphContextSlice } from "../src/context-graph/build-graph-context-slice.js";
import { projectContextGraph } from "../src/context-graph/project-context-graph.js";
import { validateCoachGrounding, validateReviewReport } from "../src/groundingValidator.js";
import { assembleReviewReport } from "../src/reviewReport.js";
import { projectKnownGameFactsV2 } from "../src/factors/known-game-facts-v2.js";
import { buildSingleDecisionPackage, buildTwoReadyPackage } from "./fixtures/context-graph-package.js";
import { canonicalStartEvents, canonicalStream, canonicalTile } from "./fixtures/canonical-stream.js";

function oversizedAuditSlice(): GraphContextSlice {
  const decisionId = "decision:synthetic:full-private-id";
  const decisionNodeId = "ctxg:Decision:full-private-node-id";
  const evidenceNodeId = "ctxg:Evidence:full-private-evidence-id";
  const decision: ContextGraphNode = {
    nodeId: decisionNodeId,
    nodeKind: "Decision",
    partition: "evidence",
    origin: "canonical_replay",
    authority: "structural",
    producer: "PRIVATE_PRODUCER_" + "p".repeat(128),
    producerVersion: "PRIVATE_VERSION_" + "v".repeat(128),
    payload: {
      decisionId,
      surface: "self_turn",
      roundOrdinal: 0,
      normalizedDecisionContext: {
        decisionWindowKind: "self_turn",
        selfActor: 0,
        triggerEventRef: "PRIVATE_EVENT_REF",
        actualAction: null,
      },
    },
    provenance: [],
  };
  const evidence: ContextGraphNode = {
    nodeId: evidenceNodeId,
    nodeKind: "Evidence",
    partition: "evidence",
    origin: "canonical_replay",
    authority: "hard",
    producer: "PRIVATE_SOURCE_PRODUCER",
    producerVersion: "PRIVATE_SOURCE_VERSION",
    payload: {
      evidenceId: "PRIVATE_EVIDENCE_ID",
      kind: "canonical_event",
      producer: "PRIVATE_SOURCE_PRODUCER",
      producerVersion: "PRIVATE_SOURCE_VERSION",
      sourceRefs: ["PRIVATE_SOURCE_REF"],
      payload: { opaque: "PRIVATE_AUDIT_PAYLOAD" },
    },
    provenance: ["PRIVATE_EVIDENCE_PROVENANCE"],
  };
  const edges: ContextGraphEdge[] = Array.from({ length: 3_000 }, (_, index) => ({
    edgeId: `ctxg:edge:PRIVATE_EDGE_${index}_` + "e".repeat(128),
    edgeKind: "derived_from",
    from: decisionNodeId,
    to: evidenceNodeId,
    origin: "package_projection",
    provenance: [`PRIVATE_EDGE_PROVENANCE_${index}_` + "r".repeat(64)],
    payload: {},
  }));
  return {
    schemaVersion: "graph-context-slice/v1",
    sliceId: "ctxg:slice:PRIVATE_SLICE_ID",
    packageId: "PRIVATE_PACKAGE_ID",
    selectedDecisionIds: [decisionId],
    nodes: [decision, evidence],
    edges,
  };
}

function selectionFor(pkg: StructuredAnalysisPackage, decisionIds: readonly string[]): ReviewSelectionResult {
  return {
    policyVersion: SELECTOR_POLICY_VERSION_V1,
    analysisPackageId: pkg.packageId,
    analysisPackageStatus: pkg.record.status,
    selected: decisionIds.map((decisionId, index) => ({
      decisionId,
      rank: index + 1,
      selectionReason: "model_disagreement_above_threshold",
    })),
  };
}

function canonicalTimingFacts(): KnownGameFacts {
  const selfHand = [
    canonicalTile("1m"), canonicalTile("2m"), canonicalTile("3m"),
    canonicalTile("4m"), canonicalTile("6m"), canonicalTile("7m"),
    canonicalTile("8m"), canonicalTile("9m"),
    canonicalTile("1p"), canonicalTile("2p"), canonicalTile("3p"),
    canonicalTile("5p"), canonicalTile("5p"),
  ];
  const event = (
    type: string,
    record: number,
    value: Record<string, unknown>,
  ) => ({
    type,
    eventId: `game:fixture/0/${record}/0`,
    sourceRecordRef: `record:${record}`,
    ...value,
  });
  const events = [
    ...canonicalStartEvents(selfHand),
    event("tile_drawn", 2, {
      actor: 0,
      tile: { visibility: "visible", tile: canonicalTile("4p") },
      from: "live_wall",
    }),
    event("tile_discarded", 3, {
      actor: 0, tile: canonicalTile("4p"), discardMode: "tsumogiri",
      riichiDeclarationEventRef: null,
    }),
    event("tile_drawn", 4, {
      actor: 1, tile: { visibility: "hidden" }, from: "live_wall",
    }),
    event("riichi_declared", 5, { actor: 1 }),
    event("tile_discarded", 6, {
      actor: 1, tile: canonicalTile("9s"), discardMode: "tedashi",
      riichiDeclarationEventRef: "game:fixture/0/5/0",
    }),
    event("riichi_accepted", 7, {
      actor: 1, declarationEventRef: "game:fixture/0/5/0",
    }),
    event("tile_drawn", 8, {
      actor: 2, tile: { visibility: "hidden" }, from: "live_wall",
    }),
    event("tile_discarded", 9, {
      actor: 2, tile: canonicalTile("5p"), discardMode: "tedashi",
      riichiDeclarationEventRef: null,
    }),
    event("pon_called", 10, {
      actor: 0, targetActor: 2, calledTile: canonicalTile("5p"),
      consumedTiles: [canonicalTile("5p"), canonicalTile("5p")],
      calledDiscardEventRef: "game:fixture/0/9/0",
    }),
    event("tile_discarded", 11, {
      actor: 0, tile: canonicalTile("2p"), discardMode: "tedashi",
      riichiDeclarationEventRef: null,
    }),
    event("tile_drawn", 12, {
      actor: 1, tile: { visibility: "hidden" }, from: "live_wall",
    }),
    event("tile_discarded", 13, {
      actor: 1, tile: canonicalTile("9p"), discardMode: "tsumogiri",
      riichiDeclarationEventRef: null,
    }),
    event("tile_drawn", 14, {
      actor: 2, tile: { visibility: "hidden" }, from: "live_wall",
    }),
    event("tile_discarded", 15, {
      actor: 2, tile: canonicalTile("6s"), discardMode: "tedashi",
      riichiDeclarationEventRef: null,
    }),
    event("tile_drawn", 16, {
      actor: 3, tile: { visibility: "hidden" }, from: "live_wall",
    }),
    event("tile_discarded", 17, {
      actor: 3, tile: canonicalTile("7s"), discardMode: "tedashi",
      riichiDeclarationEventRef: null,
    }),
    event("tile_drawn", 18, {
      actor: 0,
      tile: { visibility: "visible", tile: canonicalTile("5p") },
      from: "live_wall",
    }),
  ] as Parameters<typeof canonicalStream>[0];
  return projectKnownGameFactsV2({
    stream: canonicalStream(events),
    decisionWindow: {
      kind: "self_turn",
      actor: 0,
      triggerEventRef: "game:fixture/0/18/0",
    },
  });
}

async function sliceWithKnownFacts(facts: KnownGameFacts): Promise<GraphContextSlice> {
  const { slice } = await artifacts();
  const result = JSON.parse(JSON.stringify(slice)) as GraphContextSlice;
  const knownNode = result.nodes.find((node) => node.nodeKind === "KnownGameFact")!;
  const allowed = new Set<string>(GRAPH_SLICE_PAYLOAD_ALLOWLIST.KnownGameFact);
  knownNode.payload = Object.fromEntries(Object.entries(facts)
    .filter(([key]) => allowed.has(key)));
  knownNode.origin = facts.provenance === "user_asserted"
    ? "user_assertion"
    : facts.provenance === "legacy_regression_bridge_only"
      ? "legacy_regression_bridge" : "canonical_replay";
  knownNode.provenance = [...facts.evidenceIds];

  const decisionNode = result.nodes.find((node) => node.nodeKind === "Decision")!;
  const decisionPayload = recordOf(decisionNode.payload);
  const normalized = recordOf(decisionPayload.normalizedDecisionContext);
  normalized.decisionWindowKind = "self_turn";
  normalized.selfActor = facts.actor;
  normalized.triggerEventRef = facts.decisionEventRef;
  normalized.actualAction = null;
  return result;
}

function withLegalKakanCandidate(slice: GraphContextSlice, facts: KnownGameFacts): GraphContextSlice {
  const meld = facts.melds.find((candidate) => candidate.kind === "pon");
  if (meld === undefined || facts.currentDraw === null) throw new Error("fixture must carry a pon and current draw");
  const decision = slice.nodes.find((node) => node.nodeKind === "Decision")!;
  const action = RiichiActionSchema.parse({
    kind: "kakan",
    addedTile: facts.currentDraw.tile,
    existingMeldRef: meld.meldRef,
  });
  const actionRef = canonicalActionRef(action);
  const candidate: ContextGraphNode = {
    nodeId: "ctxg:CandidateAction:coach-context-timing-kakan",
    nodeKind: "CandidateAction",
    partition: "evidence",
    origin: "package_projection",
    authority: "structural",
    producer: "coach-context-timing-fixture",
    producerVersion: "test/v1",
    payload: { actionRef, action, origins: ["user"] },
    provenance: [],
  };
  const contains: ContextGraphEdge = {
    edgeId: "ctxg:edge:coach-context-timing-kakan-contains",
    edgeKind: "contains",
    from: decision.nodeId,
    to: candidate.nodeId,
    origin: "package_projection",
    provenance: [],
    payload: {},
  };
  return { ...slice, nodes: [...slice.nodes, candidate], edges: [...slice.edges, contains] };
}

function opaqueEventFactsFrom(facts: KnownGameFacts): KnownGameFacts {
  const eventKeys = new Set<string>(COACH_CONTEXT_EVENT_REFERENCE_KEYS);
  const refs = new Set<string>();
  collectReferences(facts, eventKeys, refs);
  const aliases = new Map([...refs].sort().map((eventRef, index) => [eventRef, `opaque:fixture:event:${index + 1}`] as const));
  const remap = (value: unknown, key?: string): unknown => {
    if (key !== undefined && eventKeys.has(key)) {
      if (typeof value === "string") return aliases.get(value) ?? value;
      if (Array.isArray(value)) return value.map((entry) => typeof entry === "string" ? aliases.get(entry) ?? entry : entry);
    }
    if (Array.isArray(value)) return value.map((entry) => remap(entry));
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .map(([childKey, child]) => [childKey, remap(child, childKey)]));
    }
    return value;
  };
  const opaque = recordOf(remap(facts));
  opaque.factSetId = "user-asserted:opaque-event-order-fixture";
  opaque.provenance = "user_asserted";
  opaque.evidenceIds = ["user:opaque-event-order-fixture"];
  opaque.completeness = { ...recordOf(opaque.completeness), eventSequence: false };
  delete opaque.furitenSelfRiver;
  opaque.defenseThreats = (opaque.defenseThreats as unknown[]).map((entry) => {
    const threat = recordOf(entry);
    return {
      ...threat,
      source: "user_asserted",
      riichiTurn: { status: "blocked_missing_facts" },
    };
  });
  return KnownGameFactsSchema.parse(opaque);
}

async function artifacts(two = false) {
  const pkg = two ? await buildTwoReadyPackage() : await buildSingleDecisionPackage();
  const graph = projectContextGraph(pkg);
  const decisionIds = pkg.decisions.map((decision) => decision.decisionId);
  const selection = selectionFor(pkg, decisionIds);
  return { pkg, graph, decisionIds, selection, slice: buildGraphContextSlice(graph, selection) };
}

function recordOf(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("expected object");
  return value as Record<string, unknown>;
}

function sourceOwnerByNodeId(slice: GraphContextSlice): Map<string, string> {
  const owners = new Map<string, string>();
  const decisionIdByNodeId = new Map<string, string>();
  for (const node of slice.nodes) {
    if (node.nodeKind === "Decision") {
      decisionIdByNodeId.set(node.nodeId, recordOf(node.payload).decisionId as string);
      owners.set(node.nodeId, recordOf(node.payload).decisionId as string);
    }
  }
  for (const edge of slice.edges) {
    if (edge.edgeKind === "contains") {
      const owner = decisionIdByNodeId.get(edge.from);
      if (owner !== undefined) owners.set(edge.to, owner);
    }
  }
  return owners;
}

function collectReferences(value: unknown, keys: ReadonlySet<string>, into: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectReferences(entry, keys, into));
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (keys.has(key)) {
        if (typeof entry === "string") into.add(entry);
        else if (Array.isArray(entry)) entry.forEach((item) => { if (typeof item === "string") into.add(item); });
      }
      collectReferences(entry, keys, into);
    }
  }
}

function isCoachTeachingNode(
  node: ContextGraphNode,
): node is ContextGraphNode & { nodeKind: keyof typeof COACH_CONTEXT_PAYLOAD_ALLOWLIST } {
  return Object.hasOwn(COACH_CONTEXT_PAYLOAD_ALLOWLIST, node.nodeKind);
}

function assertTeachingPayloadsPreserved(slice: GraphContextSlice, context: ReturnType<typeof prepareCoachRequest>["context"]): void {
  const sourceOwners = sourceOwnerByNodeId(slice);
  const contextNodeBySourceId = new Map<string, (typeof context.nodes)[number]>();
  const includedSourceNodes = slice.nodes.filter(isCoachTeachingNode);
  expect(includedSourceNodes).toHaveLength(context.nodes.length);
  includedSourceNodes.forEach((node, index) => contextNodeBySourceId.set(node.nodeId, context.nodes[index]!));

  const ownerAlias = new Map(slice.selectedDecisionIds.map((id, index) => [id, context.selectedDecisionRefs[index]!] as const));
  const actionAlias = new Map<string, string>();
  const differenceAlias = new Map<string, string>();
  for (const sourceNode of includedSourceNodes) {
    const dto = contextNodeBySourceId.get(sourceNode.nodeId)!;
    const owner = sourceOwners.get(sourceNode.nodeId)!;
    const payload = recordOf(sourceNode.payload);
    if (sourceNode.nodeKind === "CandidateAction" && typeof payload.actionRef === "string") {
      actionAlias.set(`${owner}\u0000${payload.actionRef}`, dto.ref);
    }
    if (sourceNode.nodeKind === "FactorDifference" && typeof payload.differenceId === "string") {
      differenceAlias.set(`${owner}\u0000${payload.differenceId}`, dto.ref);
    }
  }

  const eventRefs = new Set<string>();
  const eventKeys = new Set<string>(COACH_CONTEXT_EVENT_REFERENCE_KEYS);
  includedSourceNodes.forEach((node) => collectReferences(node.payload, eventKeys, eventRefs));
  const eventAlias = new Map([...eventRefs].sort().map((eventRef, index) => [eventRef, context.events[index]!.ref] as const));
  const meldAlias = new Map<string, string>();
  const meldKeys = new Set<string>(COACH_CONTEXT_MELD_REFERENCE_KEYS);
  for (const owner of slice.selectedDecisionIds) {
    const meldRefs = new Set<string>();
    for (const node of includedSourceNodes) {
      if (node.nodeKind === "KnownGameFact" && sourceOwners.get(node.nodeId) === owner) {
        collectReferences(node.payload, meldKeys, meldRefs);
      }
    }
    [...meldRefs].sort().forEach((meldRef, index) => meldAlias.set(`${owner}\u0000${meldRef}`, `M${index + 1}`));
  }

  const mapExpected = (value: unknown, key: string | undefined, owner: string): unknown => {
    if (typeof value === "string") {
      if (key !== undefined && eventKeys.has(key)) return eventAlias.get(value);
      if (key !== undefined && meldKeys.has(key)) return meldAlias.get(`${owner}\u0000${value}`);
      if (key !== undefined && ["actionRef", "actualActionRef", "scoredActualModelActionRef", "leftActionRef", "rightActionRef"].includes(key)) {
        return actionAlias.get(`${owner}\u0000${value}`);
      }
      if (key === "differenceId") return differenceAlias.get(`${owner}\u0000${value}`);
      return value;
    }
    if (Array.isArray(value)) {
      if (key !== undefined && (eventKeys.has(key) || meldKeys.has(key))) {
        return value.map((entry) => mapExpected(entry, key, owner));
      }
      if (key !== undefined && ["actionRefs", "preferredActions"].includes(key)) {
        return value.map((entry) => mapExpected(entry, "actionRef", owner));
      }
      if (key === "decisiveDifferenceIds") return value.map((entry) => mapExpected(entry, "differenceId", owner));
      return value.map((entry) => mapExpected(entry, undefined, owner));
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .map(([childKey, child]) => [childKey, mapExpected(child, childKey, owner)]));
    }
    return value;
  };

  const counts = new Map<string, number>();
  for (const sourceNode of includedSourceNodes) {
    const dto = contextNodeBySourceId.get(sourceNode.nodeId)!;
    const owner = sourceOwners.get(sourceNode.nodeId)!;
    counts.set(sourceNode.nodeKind, (counts.get(sourceNode.nodeKind) ?? 0) + 1);
    expect(dto.nodeKind).toBe(sourceNode.nodeKind);
    expect(dto.decisionRef).toBe(ownerAlias.get(owner));
    expect(dto.sourceClass).toBe(sourceNode.origin);
    expect(dto.authority).toBe(sourceNode.authority);

    const sourcePayload = recordOf(sourceNode.payload);
    const expected: Record<string, unknown> = {};
    for (const key of COACH_CONTEXT_PAYLOAD_ALLOWLIST[sourceNode.nodeKind]) {
      if (key === "factSource" && sourceNode.nodeKind === "KnownGameFact") {
        expected.factSource = sourcePayload.provenance;
      } else if (key in sourcePayload) {
        expected[key] = mapExpected(sourcePayload[key], key, owner);
      }
    }
    expect(dto.payload).toEqual(expected);
  }
  const contextCounts = new Map<string, number>();
  context.nodes.forEach((node) => contextCounts.set(node.nodeKind, (contextCounts.get(node.nodeKind) ?? 0) + 1));
  expect(Object.fromEntries(contextCounts)).toEqual(Object.fromEntries(counts));
}

function refsInContext(context: ReturnType<typeof prepareCoachRequest>["context"], decisionRef: string) {
  const owned = context.nodes.filter((node) => node.decisionRef === decisionRef);
  const find = (nodeKind: string) => {
    const node = owned.find((candidate) => candidate.nodeKind === nodeKind);
    if (node === undefined) throw new Error(`missing ${nodeKind}`);
    return node;
  };
  return {
    decision: find("Decision"),
    action: find("CandidateAction"),
    fact: find("FactorFact"),
    gameFact: find("KnownGameFact"),
    difference: find("FactorDifference"),
  };
}

function wireDecision(context: ReturnType<typeof prepareCoachRequest>["context"], decisionRef: string) {
  const refs = refsInContext(context, decisionRef);
  return {
    decisionId: decisionRef,
    judgment: {
      localId: "j1",
      recommendation: refs.action.ref,
      confidence: "medium",
      premiseRefs: [refs.gameFact.ref, refs.action.ref, "i1"],
    },
    inferences: [{ localId: "i1", statement: "牌河与候选关系构成判断依据。", premiseRefs: [refs.fact.ref] }],
    explanations: [{
      text: `候选 {candidate:${refs.action.ref}.actionRef} 的差异方向为 {diff:${refs.difference.ref}.direction}。`,
      claims: [{ kind: "factor_difference", evidenceRef: refs.difference.ref }],
      judgmentLocalRef: "j1",
    }],
  };
}

function differenceRefPair(
  slice: GraphContextSlice,
  context: ReturnType<typeof prepareCoachRequest>["context"],
  sourceNode: ContextGraphNode,
): { alias: string; canonicalId: string } {
  const sourceDifferences = slice.nodes.filter((node) => node.nodeKind === "FactorDifference");
  const contextDifferences = context.nodes.filter((node) => node.nodeKind === "FactorDifference");
  const index = sourceDifferences.findIndex((node) => node.nodeId === sourceNode.nodeId);
  const binding = contextDifferences[index];
  if (index < 0 || binding === undefined) throw new Error("missing difference alias");
  return {
    alias: binding.ref,
    canonicalId: recordOf(sourceNode.payload).differenceId as string,
  };
}

function updateReportId(report: Record<string, unknown>): void {
  report.reportId = `review-report:${sha256Hex(canonicalJson({
    packageId: report.packageId,
    selectorPolicyVersion: report.selectorPolicyVersion,
    generation: report.generation,
    decisionEntries: report.decisionEntries,
    reasoningOverlay: report.reasoningOverlay,
  }))}`;
}

describe("CoachContext compact transmission", () => {
  it("replaces the oversized full audit slice with a compact provider-neutral prompt", () => {
    const legacySlice = oversizedAuditSlice();
    const legacyBytes = Buffer.byteLength(JSON.stringify(legacySlice), "utf8");
    const request = buildCoachRequest(legacySlice);

    expect(legacyBytes).toBeGreaterThan(1_000_000);
    expect(request.promptVersion).toBe("coach-review-prompt/v3");
    expect(Buffer.byteLength(request.prompt, "utf8")).toBeLessThan(1_000_000);
    for (const privateMarker of [
      "PRIVATE_PRODUCER_",
      "PRIVATE_SOURCE_REF",
      "PRIVATE_EVIDENCE_ID",
      "PRIVATE_EDGE_PROVENANCE_",
      "PRIVATE_PACKAGE_ID",
      "PRIVATE_EVENT_REF",
    ]) {
      expect(request.prompt).not.toContain(privateMarker);
    }
  });

  it("preserves teaching values, source classes, and event/meld timing while removing audit identities", async () => {
    const { graph, slice, selection } = await artifacts();
    const prepared = prepareCoachRequest(slice);
    const json = canonicalJson(prepared.context);
    const knownSource = slice.nodes.find((node) => node.nodeKind === "KnownGameFact")!;
    const knownDto = prepared.context.nodes.find((node) => node.nodeKind === "KnownGameFact")!;
    const source = recordOf(knownSource.payload);
    const facts = recordOf(knownDto.payload);

    assertTeachingPayloadsPreserved(slice, prepared.context);

    expect(knownDto.sourceClass).toBe(knownSource.origin);
    expect(facts.factSource).toBe(source.provenance);
    expect(facts.completeness).toEqual(source.completeness);
    expect(facts.rivers).toBeDefined();
    expect(prepared.context.events.length).toBeGreaterThan(0);
    expect(prepared.context.events.some((event) => event.sequence !== undefined)).toBe(true);
    expect(prepared.context.edges.every((edge) => edge.edgeKind === "applies_to")).toBe(true);

    const eventKeys = new Set<string>(COACH_CONTEXT_EVENT_REFERENCE_KEYS);
    const meldKeys = new Set<string>(COACH_CONTEXT_MELD_REFERENCE_KEYS);
    const assertMappedRefs = (value: unknown, key?: string) => {
      if (Array.isArray(value)) {
        if (key !== undefined && (eventKeys.has(key) || meldKeys.has(key))) {
          const prefix = eventKeys.has(key) ? "E" : "M";
          for (const item of value) expect(item).toMatch(new RegExp(`^${prefix}[1-9][0-9]*$`));
        }
        for (const item of value) assertMappedRefs(item);
      } else if (value !== null && typeof value === "object") {
        for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
          if (eventKeys.has(childKey) && child !== null) {
            const refs = Array.isArray(child) ? child : [child];
            for (const item of refs) expect(item).toMatch(/^E[1-9][0-9]*$/);
          }
          if (meldKeys.has(childKey) && child !== null) {
            const refs = Array.isArray(child) ? child : [child];
            for (const item of refs) expect(item).toMatch(/^M[1-9][0-9]*$/);
          }
          assertMappedRefs(child, childKey);
        }
      }
    };
    assertMappedRefs(prepared.context);

    const sourceRefs = new Set<string>();
    const collectSourceRefs = (value: unknown, key?: string) => {
      if (Array.isArray(value)) {
        if (key !== undefined && (eventKeys.has(key) || meldKeys.has(key))) {
          for (const item of value) if (typeof item === "string") sourceRefs.add(item);
        }
        value.forEach((item) => collectSourceRefs(item));
      } else if (value !== null && typeof value === "object") {
        for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
          if ((eventKeys.has(childKey) || meldKeys.has(childKey)) && typeof child === "string") sourceRefs.add(child);
          collectSourceRefs(child, childKey);
        }
      }
    };
    slice.nodes.forEach((node) => collectSourceRefs(node.payload));
    for (const rawRef of sourceRefs) expect(json).not.toContain(rawRef);
    for (const node of slice.nodes) expect(json).not.toContain(node.nodeId);
    expect(json).not.toContain(graph.packageId);
    expect(json).not.toContain(slice.sliceId);
    for (const localKey of COACH_CONTEXT_LOCAL_ONLY_KEYS) {
      expect(json).not.toContain(`"${localKey}"`);
    }

    const factorSource = slice.nodes.find((node) => node.nodeKind === "FactorFact")!;
    const factorDto = prepared.context.nodes.find((node) => node.nodeKind === "FactorFact")!;
    expect(recordOf(factorDto.payload).value).toEqual(recordOf(factorSource.payload).value);
    expect(recordOf(factorDto.payload).status).toEqual(recordOf(factorSource.payload).status);
    expect(recordOf(factorDto.payload).limitations).toEqual(recordOf(factorSource.payload).limitations);
    const appliesTo = prepared.context.edges.find((edge) => edge.fromRef === factorDto.ref);
    expect(appliesTo?.edgeKind).toBe("applies_to");
    expect(prepared.context.nodes.find((node) => node.ref === appliesTo?.toRef)?.nodeKind).toBe("CandidateAction");

    const originalRelations = slice.edges.filter((edge) => edge.edgeKind !== "derived_from");
    const relationCounts = Object.fromEntries(["contains", "applies_to", "compares", "supports", "recommends"].map((kind) => [
      kind,
      originalRelations.filter((edge) => edge.edgeKind === kind).length,
    ]));
    const differenceCount = prepared.context.nodes.filter((node) => node.nodeKind === "FactorDifference").length;
    const factCount = prepared.context.nodes.filter((node) => node.nodeKind === "FactorFact").length;
    const expectedContains = prepared.context.nodes.filter((node) => node.nodeKind !== "Decision").length;
    const expectedSupport = prepared.context.nodes.filter((node) => node.nodeKind === "FactorDifference")
      .filter((node) => recordOf(node.payload).direction !== "neutral").length;
    const expectedRecommendations = prepared.context.nodes.reduce((count, node) => {
      if (node.nodeKind === "ModelEvaluation") return count + (recordOf(node.payload).preferredActions as unknown[]).length;
      if (node.nodeKind === "DeterministicPreference") return count + (recordOf(node.payload).actionRefs as unknown[]).length;
      return count;
    }, 0);
    expect(relationCounts).toEqual({
      contains: expectedContains,
      applies_to: factCount,
      compares: differenceCount * 2,
      supports: expectedSupport,
      recommends: expectedRecommendations,
    });
    expect(prepared.context.edges).toHaveLength(relationCounts.applies_to!);
    expect(prepared.requestContext.semanticEdgeCount).toBe(originalRelations.length);
    expect(selection.selected).toHaveLength(1);
  });

  it.each(["raw_replay", "user_asserted", "mixed", "legacy_regression_bridge_only"] as const)(
    "preserves KnownGameFact teaching source %s",
    async (factSource) => {
      const { slice } = await artifacts();
      const variant = JSON.parse(JSON.stringify(slice)) as GraphContextSlice;
      const source = variant.nodes.find((node) => node.nodeKind === "KnownGameFact")!;
      recordOf(source.payload).provenance = factSource;
      const prepared = prepareCoachRequest(variant);
      const knownFact = prepared.context.nodes.find((node) => node.nodeKind === "KnownGameFact")!;
      expect(recordOf(knownFact.payload).factSource).toBe(factSource);
    },
  );

  it("maps real canonical riichi, called-meld, and chronology references while retaining nulls", async () => {
    const facts = KnownGameFactsSchema.parse(canonicalTimingFacts());
    const declarationRef = facts.defenseThreats.find((threat) => threat.actor === 1)!.sourceEventRefs[0]!;
    const acceptanceRef = facts.defenseThreats.find((threat) => threat.actor === 1)!.sourceEventRefs[1]!;
    expect(parseCanonicalEventRef(declarationRef)?.position).toEqual({
      roundOrdinal: 0,
      sourceRecordOrdinal: 5,
      subEventOrdinal: 0,
    });

    const baseSlice = await sliceWithKnownFacts(facts);
    const prepared = prepareCoachRequest(withLegalKakanCandidate(baseSlice, facts));
    const knownDto = prepared.context.nodes.find((node) => node.nodeKind === "KnownGameFact")!;
    const payload = recordOf(knownDto.payload);
    const threat = (payload.defenseThreats as unknown[]).map(recordOf)
      .find((candidate) => candidate.actor === 1)!;
    const [declarationAlias, acceptanceAlias] = threat.sourceEventRefs as [string, string];
    const eventsByRef = new Map(prepared.context.events.map((event) => [event.ref, event] as const));
    const declarationEvent = eventsByRef.get(declarationAlias)!;
    const acceptanceEvent = eventsByRef.get(acceptanceAlias)!;

    const sourceLaterRiverIndex = facts.rivers[1]!.findIndex((discard) => discard.eventId === "game:fixture/0/13/0");
    expect(sourceLaterRiverIndex).toBeGreaterThanOrEqual(0);
    const laterRiverDiscard = recordOf((payload.rivers as unknown[][])[1]![sourceLaterRiverIndex]);
    const laterRiverAlias = laterRiverDiscard.eventId as string;
    const laterRiverEvent = eventsByRef.get(laterRiverAlias)!;
    expect(laterRiverDiscard.afterRiichiEventIds).toContain(declarationAlias);
    expect(declarationEvent.sequenceGroup).toBe(acceptanceEvent.sequenceGroup);
    expect(declarationEvent.sequence).toBeLessThan(acceptanceEvent.sequence!);
    expect(acceptanceEvent.sequence).toBeLessThan(laterRiverEvent.sequence!);

    const sourceMeld = facts.melds.find((meld) => meld.kind === "pon")!;
    const compactMeld = (payload.melds as unknown[]).map(recordOf)
      .find((meld) => meld.kind === "pon")!;
    expect(compactMeld.meldRef).toMatch(/^M[1-9][0-9]*$/);
    const calledRiverIndex = facts.rivers[2]!.findIndex((discard) => discard.eventId === sourceMeld.calledDiscardEventRef);
    expect(calledRiverIndex).toBeGreaterThanOrEqual(0);
    const compactCalledDiscard = recordOf((payload.rivers as unknown[][])[2]![calledRiverIndex]);
    expect(compactMeld.calledDiscardEventRef).toBe(compactCalledDiscard.eventId);
    const kakan = prepared.context.nodes.find((node) => node.nodeKind === "CandidateAction" &&
      recordOf(node.payload).action !== null &&
      recordOf(recordOf(node.payload).action).kind === "kakan")!;
    expect(recordOf(recordOf(kakan.payload).action).existingMeldRef).toBe(compactMeld.meldRef);

    const sourceNullDiscard = facts.furitenSelfRiver?.find((discard) => discard.eventRef === "game:fixture/0/3/0");
    expect(sourceNullDiscard).toMatchObject({ riichiDeclarationEventRef: null, calledByEventRef: null });
    const compactNullDiscard = (payload.furitenSelfRiver as unknown[]).map(recordOf)
      .find((discard) => discard.tile !== null && recordOf(discard.tile).id === "4p")!;
    expect(compactNullDiscard).toMatchObject({ riichiDeclarationEventRef: null, calledByEventRef: null });
    expect(eventsByRef.get(compactNullDiscard.eventRef as string)?.sequence).toBeGreaterThan(0);
    expect(facts.currentDraw?.eventRef).toBe("game:fixture/0/18/0");
  });

  it("does not invent chronology for typed user-asserted opaque event references", async () => {
    const facts = opaqueEventFactsFrom(KnownGameFactsSchema.parse(canonicalTimingFacts()));
    expect(facts.provenance).toBe("user_asserted");
    expect(facts.completeness.eventSequence).toBe(false);
    const prepared = prepareCoachRequest(await sliceWithKnownFacts(facts));
    expect(prepared.context.events.length).toBeGreaterThan(0);
    expect(prepared.context.events.every((event) =>
      event.sequence === undefined && event.sequenceGroup === undefined)).toBe(true);
  });

  it("rejects missing/cross-decision payload refs and mismatched source edges", async () => {
    const { slice } = await artifacts(true);
    const prepared = prepareCoachRequest(slice);
    const firstDecision = prepared.context.selectedDecisionRefs[0]!;
    const secondDecision = prepared.context.selectedDecisionRefs[1]!;

    const dangling = JSON.parse(JSON.stringify(prepared.context)) as typeof prepared.context;
    const firstDifference = dangling.nodes.find((node) => node.nodeKind === "FactorDifference" && node.decisionRef === firstDecision)!;
    (firstDifference.payload as Record<string, unknown>).leftActionRef = "A999";
    expect(() => CoachContextSchema.parse(dangling)).toThrow();

    const crossed = JSON.parse(JSON.stringify(prepared.context)) as typeof prepared.context;
    const crossedDifference = crossed.nodes.find((node) => node.nodeKind === "FactorDifference" && node.decisionRef === firstDecision)!;
    const otherAction = crossed.nodes.find((node) => node.nodeKind === "CandidateAction" && node.decisionRef === secondDecision)!;
    (crossedDifference.payload as Record<string, unknown>).leftActionRef = otherAction.ref;
    expect(() => CoachContextSchema.parse(crossed)).toThrow();

    const tamperedSlice = JSON.parse(JSON.stringify(slice)) as GraphContextSlice;
    const comparisonEdge = tamperedSlice.edges.find((edge) => edge.edgeKind === "compares")!;
    const alternateAction = tamperedSlice.nodes.find((node) => node.nodeKind === "CandidateAction" && node.nodeId !== comparisonEdge.to)!;
    comparisonEdge.to = alternateAction.nodeId;
    expect(() => prepareCoachRequest(tamperedSlice)).toThrow("coach_context_semantic_edge_mismatch");

    const missing = JSON.parse(JSON.stringify(slice)) as GraphContextSlice;
    const missingComparisonIndex = missing.edges.findIndex((edge) => edge.edgeKind === "compares");
    expect(missingComparisonIndex).toBeGreaterThanOrEqual(0);
    missing.edges.splice(missingComparisonIndex, 1);
    expect(() => prepareCoachRequest(missing)).toThrow("coach_context_semantic_edge_mismatch");

    const extra = JSON.parse(JSON.stringify(slice)) as GraphContextSlice;
    const recommendation = extra.edges.find((edge) => edge.edgeKind === "recommends")!;
    extra.edges.push({ ...recommendation, edgeId: `${recommendation.edgeId}:duplicate` });
    expect(() => prepareCoachRequest(extra)).toThrow("coach_context_semantic_edge_mismatch");

    const directional = JSON.parse(JSON.stringify(slice)) as GraphContextSlice;
    const directionalDifference = directional.nodes.find((node) => node.nodeKind === "FactorDifference")!;
    const differencePayload = recordOf(directionalDifference.payload);
    differencePayload.direction = "supports_left";
    const leftActionRef = differencePayload.leftActionRef;
    const leftAction = directional.nodes.find((node) => node.nodeKind === "CandidateAction" &&
      recordOf(node.payload).actionRef === leftActionRef)!;
    directional.edges.push({
      edgeId: `${directionalDifference.nodeId}:supports-left-test`,
      edgeKind: "supports",
      from: directionalDifference.nodeId,
      to: leftAction.nodeId,
      origin: "package_projection",
      provenance: [],
      payload: { direction: "supports_left" },
    });
    expect(() => prepareCoachRequest(directional)).not.toThrow();

    const wrongDirection = JSON.parse(JSON.stringify(directional)) as GraphContextSlice;
    const support = wrongDirection.edges.find((edge) => edge.edgeKind === "supports")!;
    const supportPayload = recordOf(support.payload);
    supportPayload.direction = "supports_right";
    expect(() => prepareCoachRequest(wrongDirection)).toThrow("coach_context_semantic_edge_mismatch");

    const wrongSide = JSON.parse(JSON.stringify(slice)) as GraphContextSlice;
    const comparison = wrongSide.edges.find((edge) => edge.edgeKind === "compares")!;
    const comparisonPayload = recordOf(comparison.payload);
    comparisonPayload.side = comparisonPayload.side === "left" ? "right" : "left";
    expect(() => prepareCoachRequest(wrongSide)).toThrow("coach_context_semantic_edge_mismatch");

    for (const edgeKind of ["compares", "supports"] as const) {
      const withUnexpectedPayload = JSON.parse(JSON.stringify(edgeKind === "supports" ? directional : slice)) as GraphContextSlice;
      const edge = withUnexpectedPayload.edges.find((candidate) => candidate.edgeKind === edgeKind)!;
      edge.payload = { ...recordOf(edge.payload), unexpected: true };
      expect(() => prepareCoachRequest(withUnexpectedPayload)).toThrow("coach_context_semantic_edge_payload_invalid");
    }
  });

  it("decodes only request-scoped aliases, keeps canonical output grounding, and hashes the original wire bytes", async () => {
    const { graph, slice, selection } = await artifacts();
    const prepared = prepareCoachRequest(slice);
    const decisionRef = prepared.context.selectedDecisionRefs[0]!;
    const wire = { decisions: [wireDecision(prepared.context, decisionRef)] };
    const raw = JSON.stringify(wire);
    const decoded = prepared.decode(wire);
    expect(decoded).not.toBeNull();
    const decision = recordOf((decoded as { decisions: unknown[] }).decisions[0]);
    const judgment = recordOf(decision.judgment);
    const sourceAction = slice.nodes.find((node) => node.nodeKind === "CandidateAction")!;
    const sourceKnown = slice.nodes.find((node) => node.nodeKind === "KnownGameFact")!;
    const sourceDifference = slice.nodes.find((node) => node.nodeKind === "FactorDifference")!;
    const sourceActionRef = recordOf(sourceAction.payload).actionRef;
    const sourceDifferenceId = recordOf(sourceDifference.payload).differenceId;
    expect(judgment.recommendation).toBe(sourceActionRef);
    expect(judgment.premiseRefs).toContain(sourceKnown.nodeId);
    expect(recordOf((decision.explanations as unknown[])[0]).text).toContain(`{candidate:${sourceActionRef}.actionRef}`);
    expect(recordOf((decision.explanations as unknown[])[0]).text).toContain(`{diff:${sourceDifferenceId}.direction}`);

    const report = assembleReviewReport({
      graph,
      selection,
      preparedCoachRequest: prepared,
      outcome: { kind: "generated", content: raw, transportRetries: 0 },
      provider: { providerId: "fake", model: "fake" },
      generatedAt: "2026-10-04T00:00:00.000Z",
    });
    expect(report.generationStatus).toBe("complete");
    expect(report.audit.outputHash).toBe(`sha256:${sha256Hex(raw)}`);
    expect(report.audit.requestContext).toEqual(prepared.requestContext);
    expect(canonicalJson(report.audit)).not.toContain(decisionRef);

    const unknownAlias = JSON.parse(JSON.stringify(wire)) as typeof wire;
    (unknownAlias.decisions[0]!.judgment.premiseRefs as string[]).push("N999");
    expect(prepared.decode(unknownAlias)).toBeNull();
    const leakedLocalId = JSON.parse(JSON.stringify(wire)) as typeof wire;
    leakedLocalId.decisions[0]!.judgment.localId = "N1";
    expect(prepared.decode(leakedLocalId)).toBeNull();
    const escapedScope = JSON.parse(JSON.stringify(wire)) as typeof wire;
    escapedScope.decisions[0]!.judgment.recommendation = "A999";
    expect(prepared.decode(escapedScope)).toBeNull();
  });

  it("expands prose action aliases through action placeholders and preserves tile and numeric text", async () => {
    const { graph, selection, slice } = await artifacts();
    const prepared = prepareCoachRequest(slice);
    const decisionRef = prepared.context.selectedDecisionRefs[0]!;
    const actions = prepared.context.nodes.filter((node) =>
      node.nodeKind === "CandidateAction" && node.decisionRef === decisionRef);
    expect(actions.length).toBeGreaterThanOrEqual(2);
    const sourceActionRefs = slice.nodes
      .filter((node) => node.nodeKind === "CandidateAction")
      .map((node) => recordOf(node.payload).actionRef as string);
    const firstAlias = actions[0]!.ref;
    const secondAlias = actions[1]!.ref;
    const firstActionRef = sourceActionRefs[0]!;
    const secondActionRef = sourceActionRefs[1]!;
    const numericDifferenceIndex = slice.nodes
      .filter((node) => node.nodeKind === "FactorDifference")
      .findIndex((node) => {
        const payload = recordOf(node.payload);
        const leftValue = payload.leftValue;
        return leftValue !== null && typeof leftValue === "object" && !Array.isArray(leftValue) &&
          recordOf(leftValue).kind === "number";
      });
    expect(numericDifferenceIndex).toBeGreaterThanOrEqual(0);
    const sourceDifferences = slice.nodes.filter((node) => node.nodeKind === "FactorDifference");
    const contextDifferences = prepared.context.nodes.filter((node) =>
      node.nodeKind === "FactorDifference" && node.decisionRef === decisionRef);
    const numericDifferenceAlias = contextDifferences[numericDifferenceIndex]!.ref;
    const numericDifferenceId = recordOf(sourceDifferences[numericDifferenceIndex]!.payload).differenceId;
    const wire = { decisions: [wireDecision(prepared.context, decisionRef)] };
    wire.decisions[0]!.explanations[0]!.text =
      `在限定的两项选择中，${firstAlias}的七对子路线更快，${secondAlias}为另一条路线。` +
      `括号别名{${firstAlias}}也展开；自然牌面1m、赤5p保持原样；数值 {diff:${numericDifferenceAlias}.leftValue.value}。`;
    const raw = JSON.stringify(wire);
    const decoded = prepared.decode(wire);
    expect(decoded).not.toBeNull();
    const decision = recordOf((decoded as { decisions: unknown[] }).decisions[0]);
    const explanation = recordOf((decision.explanations as unknown[])[0]);
    expect(explanation.text).toBe(
      `在限定的两项选择中，{candidate:${firstActionRef}.action.kind}的七对子路线更快，` +
      `{candidate:${secondActionRef}.action.kind}为另一条路线。` +
      `括号别名{candidate:${firstActionRef}.action.kind}也展开；自然牌面1m、赤5p保持原样；` +
      `数值 {diff:${numericDifferenceId}.leftValue.value}。`,
    );

    const report = assembleReviewReport({
      graph,
      selection,
      preparedCoachRequest: prepared,
      outcome: { kind: "generated", content: raw, transportRetries: 0 },
      provider: { providerId: "fake", model: "fake" },
      generatedAt: "2026-10-04T00:00:00.000Z",
    });
    expect(report.generationStatus).toBe("complete");
    expect(report.audit.outputHash).toBe(`sha256:${sha256Hex(raw)}`);
    const explanationNode = report.reasoningOverlay.nodes.find((node) => node.nodeKind === "Explanation");
    expect(explanationNode).toBeDefined();
    expect(recordOf(explanationNode!.payload).text).toBe(explanation.text);
  });

  it.each([
    ["unknown action alias", "A999"],
    ["wrong-kind difference alias", "F1"],
  ])("rejects %s in explanation prose and inference statements", async (_label, alias) => {
    const { slice } = await artifacts();
    const prepared = prepareCoachRequest(slice);
    const decisionRef = prepared.context.selectedDecisionRefs[0]!;
    const wire = { decisions: [wireDecision(prepared.context, decisionRef)] };

    for (const proseAlias of [alias, `{${alias}}`]) {
      const explanationAlias = JSON.parse(JSON.stringify(wire)) as typeof wire;
      explanationAlias.decisions[0]!.explanations[0]!.text = `这项选择为${proseAlias}。`;
      expect(prepared.decode(explanationAlias)).toBeNull();

      const inferenceAlias = JSON.parse(JSON.stringify(wire)) as typeof wire;
      inferenceAlias.decisions[0]!.inferences![0]!.statement = `这项选择为${proseAlias}。`;
      expect(prepared.decode(inferenceAlias)).toBeNull();
    }
  });

  it("rejects a valid action alias from another decision and any action alias in inference prose", async () => {
    const { slice } = await artifacts(true);
    const prepared = prepareCoachRequest(slice);
    const [currentDecisionRef, otherDecisionRef] = prepared.context.selectedDecisionRefs;
    const otherAction = prepared.context.nodes.find((node) =>
      node.nodeKind === "CandidateAction" && node.decisionRef === otherDecisionRef);
    expect(otherAction).toBeDefined();

    const foreignExplanation = { decisions: [wireDecision(prepared.context, currentDecisionRef!)] };
    foreignExplanation.decisions[0]!.explanations[0]!.text = `另一项路线是${otherAction!.ref}。`;
    expect(prepared.decode(foreignExplanation)).toBeNull();

    const validAliasInference = { decisions: [wireDecision(prepared.context, currentDecisionRef!)] };
    const currentAction = prepared.context.nodes.find((node) =>
      node.nodeKind === "CandidateAction" && node.decisionRef === currentDecisionRef);
    validAliasInference.decisions[0]!.inferences![0]!.statement = `当前行动为${currentAction!.ref}。`;
    expect(prepared.decode(validAliasInference)).toBeNull();
  });

  it.each([
    ["number", "leftValue", 0],
    ["boolean", "rightValue", false],
    ["classification", "leftValue", "applicable"],
  ] as const)("normalizes the bound %s %s wrapper to its scalar value", async (kind, side, expectedValue) => {
    const { graph, selection, slice } = await artifacts();
    const prepared = prepareCoachRequest(slice);
    const differenceNode = slice.nodes.find((node) => {
      if (node.nodeKind !== "FactorDifference") return false;
      const value = recordOf(node.payload)[side];
      return value !== null && typeof value === "object" && !Array.isArray(value) &&
        recordOf(value).kind === kind && Object.is(recordOf(value).value, expectedValue);
    });
    expect(differenceNode).toBeDefined();
    const { alias, canonicalId } = differenceRefPair(slice, prepared.context, differenceNode!);
    const decisionRef = prepared.context.selectedDecisionRefs[0]!;
    const wire = { decisions: [wireDecision(prepared.context, decisionRef)] };
    wire.decisions[0]!.explanations[0]!.text = `该差异值为 {diff:${alias}.${side}}。`;
    const raw = JSON.stringify(wire);
    const draft = decodeCoachReasoningDraft(prepared, wire);
    expect(draft).not.toBeNull();
    expect(draft!.decisions[0]!.explanations![0]!.text)
      .toBe(`该差异值为 {diff:${canonicalId}.${side}.value}。`);
    expect(validateCoachGrounding(graph, draft!).violations).toEqual([]);

    const report = assembleReviewReport({
      graph,
      selection,
      preparedCoachRequest: prepared,
      outcome: { kind: "generated", content: raw, transportRetries: 0 },
      provider: { providerId: "fake", model: "fake" },
      generatedAt: "2026-10-04T00:00:00.000Z",
    });
    expect(report.generationStatus).toBe("complete");
    expect(report.audit.outputHash).toBe(`sha256:${sha256Hex(raw)}`);
    validateReviewReport(report, graph);
  });

  it.each(["string_set", "tile_counts"] as const)(
    "keeps compound %s and unregistered difference paths for original grounding to reject",
    async (kind) => {
      const { graph, slice } = await artifacts();
      const prepared = prepareCoachRequest(slice);
      const differenceNode = slice.nodes.find((node) => {
        if (node.nodeKind !== "FactorDifference") return false;
        const value = recordOf(node.payload).leftValue;
        return value !== null && typeof value === "object" && !Array.isArray(value) &&
          recordOf(value).kind === kind;
      });
      expect(differenceNode).toBeDefined();
      const { alias } = differenceRefPair(slice, prepared.context, differenceNode!);
      const decisionRef = prepared.context.selectedDecisionRefs[0]!;
      const compoundWire = { decisions: [wireDecision(prepared.context, decisionRef)] };
      compoundWire.decisions[0]!.explanations[0]!.text = `复合值 {diff:${alias}.leftValue}。`;
      const compoundDraft = decodeCoachReasoningDraft(prepared, compoundWire);
      expect(compoundDraft).not.toBeNull();
      expect(compoundDraft!.decisions[0]!.explanations![0]!.text)
        .toBe(`复合值 {diff:${recordOf(differenceNode!.payload).differenceId}.leftValue}。`);
      expect(validateCoachGrounding(graph, compoundDraft!).violations.map((entry) => entry.code))
        .toContain("unresolvable_placeholder");

      const unregisteredWire = { decisions: [wireDecision(prepared.context, decisionRef)] };
      unregisteredWire.decisions[0]!.explanations[0]!.text = `未知字段 {diff:${alias}.notAField}。`;
      const unregisteredDraft = decodeCoachReasoningDraft(prepared, unregisteredWire);
      expect(unregisteredDraft).not.toBeNull();
      expect(unregisteredDraft!.decisions[0]!.explanations![0]!.text)
        .toContain(`{diff:${recordOf(differenceNode!.payload).differenceId}.notAField}`);
      expect(validateCoachGrounding(graph, unregisteredDraft!).violations.map((entry) => entry.code))
        .toContain("unresolvable_placeholder");
    },
  );

  it("keeps canonical difference placeholders strict and rejects cross-decision or wrong-kind aliases", async () => {
    const { graph, slice } = await artifacts(true);
    const prepared = prepareCoachRequest(slice);
    const [currentDecisionRef, otherDecisionRef] = prepared.context.selectedDecisionRefs;
    const otherDifference = prepared.context.nodes.find((node) =>
      node.nodeKind === "FactorDifference" && node.decisionRef === otherDecisionRef)!;
    const currentCandidate = prepared.context.nodes.find((node) =>
      node.nodeKind === "CandidateAction" && node.decisionRef === currentDecisionRef)!;
    const sourceNumberDifference = slice.nodes.find((node) => {
      if (node.nodeKind !== "FactorDifference") return false;
      const value = recordOf(node.payload).leftValue;
      return value !== null && typeof value === "object" && !Array.isArray(value) &&
        recordOf(value).kind === "number";
    })!;
    const sourceNumberRef = differenceRefPair(slice, prepared.context, sourceNumberDifference);

    const canonicalWire = { decisions: [wireDecision(prepared.context, currentDecisionRef!)] };
    canonicalWire.decisions[0]!.explanations[0]!.text =
      `规范路径 {diff:${sourceNumberRef.canonicalId}.leftValue.value}。`;
    const canonicalDraft = decodeCoachReasoningDraft(prepared, canonicalWire);
    expect(canonicalDraft).not.toBeNull();
    expect(canonicalDraft!.decisions[0]!.explanations![0]!.text)
      .toBe(`规范路径 {diff:${sourceNumberRef.canonicalId}.leftValue.value}。`);
    expect(validateCoachGrounding(graph, canonicalDraft!).violations).toEqual([]);

    const canonicalShorthand = { decisions: [wireDecision(prepared.context, currentDecisionRef!)] };
    canonicalShorthand.decisions[0]!.explanations[0]!.text =
      `不得缩短规范路径 {diff:${sourceNumberRef.canonicalId}.leftValue}。`;
    const strictDraft = decodeCoachReasoningDraft(prepared, canonicalShorthand);
    expect(strictDraft).not.toBeNull();
    expect(validateCoachGrounding(graph, strictDraft!).violations.map((entry) => entry.code))
      .toContain("unresolvable_placeholder");

    const foreignWire = { decisions: [wireDecision(prepared.context, currentDecisionRef!)] };
    foreignWire.decisions[0]!.explanations[0]!.text = `越界 {diff:${otherDifference.ref}.leftValue}。`;
    expect(decodeCoachReasoningDraft(prepared, foreignWire)).toBeNull();

    const wrongKindWire = { decisions: [wireDecision(prepared.context, currentDecisionRef!)] };
    wrongKindWire.decisions[0]!.explanations[0]!.text =
      `类型错误 {diff:${currentCandidate.ref}.leftValue}。`;
    expect(decodeCoachReasoningDraft(prepared, wrongKindWire)).toBeNull();
  });

  it("keeps aliases isolated across concurrent requests and keeps same-action decisions scoped", async () => {
    const { graph, slice, decisionIds, selection } = await artifacts(true);
    const first = prepareCoachRequest(slice);
    const copied = JSON.parse(JSON.stringify(slice)) as GraphContextSlice;
    const originalDecision = copied.nodes.find((node) =>
      node.nodeKind === "Decision" && recordOf(node.payload).decisionId === decisionIds[0])!;
    const originalId = originalDecision.nodeId;
    const alternateId = `${originalId}:isolated-request`;
    originalDecision.nodeId = alternateId;
    copied.edges = copied.edges.map((edge) => ({
      ...edge,
      from: edge.from === originalId ? alternateId : edge.from,
      to: edge.to === originalId ? alternateId : edge.to,
    }));
    const second = prepareCoachRequest(copied);

    const firstDecisionRef = first.context.selectedDecisionRefs[0]!;
    const secondDecisionRef = second.context.selectedDecisionRefs[0]!;
    expect(firstDecisionRef).toBe(secondDecisionRef);
    const actionRefsByDecision = decisionIds.map((decisionId) => graph.nodes
      .filter((node) => node.nodeKind === "CandidateAction" && recordOf(node.payload).decisionId === decisionId)
      .map((node) => recordOf(node.payload).actionRef as string).sort());
    expect(actionRefsByDecision[0]).toEqual(actionRefsByDecision[1]);
    expect(actionRefsByDecision[0]!.length).toBeGreaterThan(0);
    const firstWire = { decisions: [wireDecision(first.context, firstDecisionRef!)] };
    firstWire.decisions[0]!.judgment.premiseRefs[0] = firstDecisionRef;
    const firstDecoded = first.decode(firstWire)! as { decisions: Array<{ judgment: { premiseRefs: string[] } }> };
    const secondDecoded = second.decode(firstWire)! as { decisions: Array<{ judgment: { premiseRefs: string[] } }> };
    expect(firstDecoded.decisions[0]!.judgment.premiseRefs[0]).toBe(originalId);
    expect(secondDecoded.decisions[0]!.judgment.premiseRefs[0]).toBe(alternateId);

    const wrongDecisionAction = JSON.parse(JSON.stringify(firstWire)) as typeof firstWire;
    const firstAction = first.context.nodes.find((node) => node.nodeKind === "CandidateAction" && node.decisionRef === firstDecisionRef)!;
    const secondAction = first.context.nodes.find((node) => node.nodeKind === "CandidateAction" && node.decisionRef === first.context.selectedDecisionRefs[1])!;
    expect(firstAction.ref).not.toBe(secondAction.ref);
    wrongDecisionAction.decisions[0]!.judgment.recommendation = secondAction.ref;
    expect(first.decode(wrongDecisionAction)).toBeNull();
    expect(decisionIds).toHaveLength(2);
    expect(selection.selected).toHaveLength(2);
  });

  it("fails closed on changed v3 audit bindings and still reads historical v1/v2 prompt reports", async () => {
    const { graph, slice, selection } = await artifacts();
    const prepared = prepareCoachRequest(slice);
    const wire = { decisions: [wireDecision(prepared.context, prepared.context.selectedDecisionRefs[0]!)] };
    const content = JSON.stringify(wire);
    const report = assembleReviewReport({
      graph,
      selection,
      preparedCoachRequest: prepared,
      outcome: { kind: "generated", content, transportRetries: 0 },
      provider: { providerId: "fake", model: "fake" },
      generatedAt: "2026-10-04T00:00:00.000Z",
    });
    validateReviewReport(report, graph);

    const badContext = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
    const badContextAudit = recordOf(badContext.audit);
    const requestContext = recordOf(badContextAudit.requestContext);
    requestContext.contextBytes = (requestContext.contextBytes as number) + 1;
    expect(() => validateReviewReport(badContext, graph)).toThrow("m6d2_report_request_context_mismatch");

    const badSliceHash = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
    recordOf(badSliceHash.audit).inputSliceHash = `sha256:${"0".repeat(64)}`;
    expect(() => validateReviewReport(badSliceHash, graph)).toThrow("m6d2_report_input_slice_hash_mismatch");

    for (const promptVersion of ["coach-review-prompt/v1", "coach-review-prompt/v2"] as const) {
      const historic = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
      const generation = recordOf(historic.generation);
      generation.promptVersion = promptVersion;
      generation.draftSchemaVersion = COACH_REASONING_DRAFT_SCHEMA_VERSION_V1;
      delete recordOf(historic.audit).requestContext;
      updateReportId(historic);
      expect(() => validateReviewReport(historic, graph)).not.toThrow();
    }
  });

  it("lets full grounding report an ordinary dangling premise at decision scope", async () => {
    const { graph, slice, selection } = await artifacts();
    const prepared = prepareCoachRequest(slice);
    const wire = { decisions: [wireDecision(prepared.context, prepared.context.selectedDecisionRefs[0]!)] };
    wire.decisions[0]!.judgment.premiseRefs.push("ordinary-missing-ref");
    expect(prepared.decode(wire)).not.toBeNull();
    const report = assembleReviewReport({
      graph,
      selection,
      preparedCoachRequest: prepared,
      outcome: { kind: "generated", content: JSON.stringify(wire), transportRetries: 0 },
      provider: { providerId: "fake", model: "fake" },
      generatedAt: "2026-10-04T00:00:00.000Z",
    });
    expect(report.generationStatus).toBe("evidence_only");
    expect(report.decisionEntries[0]!.explanationStatus).toBe("invalid_output");
    expect(report.diagnostics.map((entry) => entry.code)).toContain("dangling_ref");
  });
});
