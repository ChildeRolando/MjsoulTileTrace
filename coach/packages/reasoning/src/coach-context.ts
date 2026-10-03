import {
  COACH_CONTEXT_EVENT_REFERENCE_KEYS,
  COACH_CONTEXT_MELD_REFERENCE_KEYS,
  COACH_CONTEXT_PAYLOAD_ALLOWLIST,
  CoachContextSchema,
  CoachFactSourceSchema,
  type CoachContext,
  type CoachContextEvent,
  type CoachContextNode,
  type CoachContextRef,
} from "@riichi-coach/contracts";
import type { ContextGraphNode, GraphContextSlice } from "@riichi-coach/contracts";
import { parseCanonicalEventRef } from "@riichi-coach/contracts";

interface NodeBinding {
  readonly canonicalId: string;
  readonly ref: CoachContextRef;
  readonly nodeKind: CoachContextNode["nodeKind"];
}

interface ScopedBindings {
  readonly nodeByCanonicalId: ReadonlyMap<string, NodeBinding>;
  readonly nodeByAlias: ReadonlyMap<string, NodeBinding>;
  readonly actionByCanonicalId: ReadonlyMap<string, string>;
  readonly actionByAlias: ReadonlyMap<string, string>;
  readonly differenceByCanonicalId: ReadonlyMap<string, string>;
  readonly differenceByAlias: ReadonlyMap<string, string>;
  readonly meldByCanonicalId: ReadonlyMap<string, string>;
  readonly meldByAlias: ReadonlyMap<string, string>;
}

export interface CoachContextBindings {
  readonly context: CoachContext;
  /** The closure captures maps for this one prepared request only. */
  readonly decodeDraft: (raw: unknown) => unknown | null;
}

const NODE_ALIAS_PREFIX: Readonly<Record<ContextGraphNode["nodeKind"], string | null>> = Object.freeze({
  Decision: "D",
  CandidateAction: "A",
  KnownGameFact: "N",
  FactorFact: "N",
  FactorDifference: "F",
  ModelEvaluation: "N",
  DeterministicPreference: "N",
  Evidence: null,
  CoachInference: null,
  CoachJudgment: null,
  Explanation: null,
});
const EVENT_KEYS = new Set<string>(COACH_CONTEXT_EVENT_REFERENCE_KEYS);
const MELD_KEYS = new Set<string>(COACH_CONTEXT_MELD_REFERENCE_KEYS);
const ACTION_SINGLE_KEYS = new Set([
  "actionRef", "actualActionRef", "scoredActualModelActionRef", "leftActionRef", "rightActionRef",
]);
const ACTION_ARRAY_KEYS = new Set(["actionRefs", "preferredActions"]);
const DIFFERENCE_SINGLE_KEYS = new Set(["differenceId"]);
const DIFFERENCE_ARRAY_KEYS = new Set(["decisiveDifferenceIds"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ref(prefix: string, ordinal: number): CoachContextRef {
  return `${prefix}${ordinal}` as CoachContextRef;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function collectStringReferences(value: unknown, keys: ReadonlySet<string>, into: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStringReferences(entry, keys, into));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (keys.has(key)) {
      if (typeof entry === "string") into.add(entry);
      else if (Array.isArray(entry)) entry.forEach((item) => { if (typeof item === "string") into.add(item); });
    }
    collectStringReferences(entry, keys, into);
  }
}

function canonicalEventChronology(events: readonly string[]): Map<string, { sequenceGroup: number; sequence: number }> {
  const groups = new Map<string, Array<{ eventRef: string; position: { roundOrdinal: number; sourceRecordOrdinal: number; subEventOrdinal: number } }>>();
  for (const eventRef of events) {
    const parsed = parseCanonicalEventRef(eventRef);
    if (parsed === null) continue;
    const entries = groups.get(parsed.gameId) ?? [];
    entries.push({ eventRef, position: parsed.position });
    groups.set(parsed.gameId, entries);
  }
  const result = new Map<string, { sequenceGroup: number; sequence: number }>();
  const gameIds = [...groups.keys()].sort();
  gameIds.forEach((gameId, groupIndex) => {
    const ordered = groups.get(gameId)!.sort((left, right) =>
      left.position.roundOrdinal - right.position.roundOrdinal ||
      left.position.sourceRecordOrdinal - right.position.sourceRecordOrdinal ||
      left.position.subEventOrdinal - right.position.subEventOrdinal ||
      (left.eventRef < right.eventRef ? -1 : left.eventRef > right.eventRef ? 1 : 0));
    ordered.forEach((entry, index) => result.set(entry.eventRef, {
      sequenceGroup: groupIndex + 1,
      sequence: index + 1,
    }));
  });
  return result;
}

function allocateEvents(payloads: readonly Record<string, unknown>[]): {
  aliasByCanonical: Map<string, CoachContextRef>;
  dto: CoachContextEvent[];
} {
  const eventRefs = new Set<string>();
  payloads.forEach((payload) => collectStringReferences(payload, EVENT_KEYS, eventRefs));
  const orderedRefs = sortedUnique(eventRefs);
  const aliasByCanonical = new Map<string, CoachContextRef>();
  const chronology = canonicalEventChronology(orderedRefs);
  const dto = orderedRefs.map((eventRef, index) => {
    const alias = ref("E", index + 1);
    aliasByCanonical.set(eventRef, alias);
    const sequence = chronology.get(eventRef);
    return {
      ref: alias,
      ...(sequence === undefined ? {} : sequence),
    };
  });
  return { aliasByCanonical, dto };
}

function ownerByNodeId(slice: GraphContextSlice): Map<string, string> {
  const owners = new Map<string, string>();
  const decisions = new Map<string, string>();
  for (const node of slice.nodes) {
    if (node.nodeKind !== "Decision") continue;
    const decisionId = (node.payload as { decisionId?: unknown }).decisionId;
    if (typeof decisionId !== "string") throw new Error("coach_context_decision_id_missing");
    decisions.set(node.nodeId, decisionId);
    owners.set(node.nodeId, decisionId);
  }
  for (const edge of slice.edges) {
    if (edge.edgeKind !== "contains") continue;
    const owner = decisions.get(edge.from);
    if (owner !== undefined) {
      if (owners.has(edge.to) && owners.get(edge.to) !== owner) throw new Error("coach_context_node_multi_decision");
      owners.set(edge.to, owner);
    }
  }
  for (const node of slice.nodes) {
    if (NODE_ALIAS_PREFIX[node.nodeKind] === null || node.nodeKind === "Decision") continue;
    if (owners.get(node.nodeId) === undefined) throw new Error("coach_context_node_owner_missing");
  }
  return owners;
}

function semanticEdgeKey(
  edgeKind: string,
  from: string,
  to: string,
  qualifier = "",
): string {
  return `${edgeKind}\u0000${from}\u0000${to}\u0000${qualifier}`;
}

/** Verify every source semantic edge before omitting its redundant wire copy.
 * The compact node payloads retain these exact relations: decisionRef for
 * contains, retained compact edges for applies_to, left/rightActionRef for compares,
 * direction for supports, and preferred/actionRefs for recommends. */
function validateSemanticRelationships(slice: GraphContextSlice, owners: ReadonlyMap<string, string>): void {
  const nodesById = new Map(slice.nodes.map((node) => [node.nodeId, node] as const));
  const decisionNodeById = new Map<string, string>();
  const actionNodeByOwnerAndRef = new Map<string, string>();
  const expected: string[] = [];
  const addExpected = (kind: string, from: string, to: string, qualifier = "") => {
    expected.push(semanticEdgeKey(kind, from, to, qualifier));
  };
  const actionKey = (owner: string, actionRef: string) => `${owner}\u0000${actionRef}`;

  for (const node of slice.nodes) {
    const payload = node.payload as Record<string, unknown>;
    if (node.nodeKind === "Decision") {
      if (typeof payload.decisionId !== "string" || decisionNodeById.has(payload.decisionId)) {
        throw new Error("coach_context_decision_id_invalid");
      }
      decisionNodeById.set(payload.decisionId, node.nodeId);
    } else if (node.nodeKind === "CandidateAction") {
      const owner = owners.get(node.nodeId);
      if (owner === undefined || typeof payload.actionRef !== "string") {
        throw new Error("coach_context_candidate_binding_invalid");
      }
      const key = actionKey(owner, payload.actionRef);
      if (actionNodeByOwnerAndRef.has(key)) throw new Error("coach_context_candidate_binding_duplicate");
      actionNodeByOwnerAndRef.set(key, node.nodeId);
    }
  }

  for (const node of slice.nodes) {
    if (NODE_ALIAS_PREFIX[node.nodeKind] === null || node.nodeKind === "Decision") continue;
    const owner = owners.get(node.nodeId);
    const decisionNodeId = owner === undefined ? undefined : decisionNodeById.get(owner);
    if (owner === undefined || decisionNodeId === undefined) throw new Error("coach_context_node_owner_missing");
    addExpected("contains", decisionNodeId, node.nodeId);
    const payload = node.payload as Record<string, unknown>;
    const candidateNode = (actionRef: unknown): string => {
      if (typeof actionRef !== "string") throw new Error("coach_context_action_ref_invalid");
      const target = actionNodeByOwnerAndRef.get(actionKey(owner, actionRef));
      if (target === undefined) throw new Error("coach_context_action_ref_unbound");
      return target;
    };
    if (node.nodeKind === "FactorDifference") {
      addExpected("compares", node.nodeId, candidateNode(payload.leftActionRef), "left");
      addExpected("compares", node.nodeId, candidateNode(payload.rightActionRef), "right");
      if (payload.direction === "supports_left") {
        addExpected("supports", node.nodeId, candidateNode(payload.leftActionRef), "supports_left");
      } else if (payload.direction === "supports_right") {
        addExpected("supports", node.nodeId, candidateNode(payload.rightActionRef), "supports_right");
      } else if (payload.direction !== "neutral") {
        throw new Error("coach_context_difference_direction_invalid");
      }
    } else if (node.nodeKind === "ModelEvaluation" || node.nodeKind === "DeterministicPreference") {
      const actions = node.nodeKind === "ModelEvaluation" ? payload.preferredActions : payload.actionRefs;
      if (!Array.isArray(actions)) throw new Error("coach_context_recommendation_list_invalid");
      actions.forEach((actionRef) => addExpected("recommends", node.nodeId, candidateNode(actionRef)));
    }
  }

  const actual = slice.edges.flatMap((edge) => {
    if (edge.edgeKind === "derived_from") return [];
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (from === undefined || to === undefined || owners.get(from.nodeId) !== owners.get(to.nodeId)) {
      throw new Error("coach_context_semantic_edge_endpoint_invalid");
    }
    const payload = edge.payload as Record<string, unknown>;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("coach_context_semantic_edge_payload_invalid");
    }
    if (edge.edgeKind === "applies_to") {
      if (from.nodeKind !== "FactorFact" || to.nodeKind !== "CandidateAction" || Object.keys(payload).length !== 0) {
        throw new Error("coach_context_applies_to_edge_invalid");
      }
      return [semanticEdgeKey(edge.edgeKind, edge.from, edge.to)];
    }
    if (edge.edgeKind === "contains" || edge.edgeKind === "recommends") {
      if (Object.keys(payload).length !== 0) throw new Error("coach_context_semantic_edge_payload_invalid");
      return [semanticEdgeKey(edge.edgeKind, edge.from, edge.to)];
    }
    if (edge.edgeKind === "compares") {
      if (Object.keys(payload).length !== 1 || (payload.side !== "left" && payload.side !== "right")) {
        throw new Error("coach_context_semantic_edge_payload_invalid");
      }
      return [semanticEdgeKey(edge.edgeKind, edge.from, edge.to, payload.side)];
    }
    if (edge.edgeKind === "supports") {
      if (Object.keys(payload).length !== 1 || (payload.direction !== "supports_left" && payload.direction !== "supports_right")) {
        throw new Error("coach_context_semantic_edge_payload_invalid");
      }
      return [semanticEdgeKey(edge.edgeKind, edge.from, edge.to, payload.direction)];
    }
    throw new Error("coach_context_semantic_edge_invalid");
  }).sort();
  const appliesToEdges = slice.edges.filter((edge) => edge.edgeKind === "applies_to");
  const factNodeIds = slice.nodes.filter((node) => node.nodeKind === "FactorFact").map((node) => node.nodeId);
  if (appliesToEdges.length !== factNodeIds.length ||
    new Set(appliesToEdges.map((edge) => edge.from)).size !== appliesToEdges.length ||
    factNodeIds.some((nodeId) => !appliesToEdges.some((edge) => edge.from === nodeId))) {
    throw new Error("coach_context_applies_to_edge_mismatch");
  }
  expected.sort();
  const compactedActual = actual.filter((key) => !key.startsWith("applies_to\u0000"));
  if (compactedActual.length !== expected.length || compactedActual.some((edge, index) => edge !== expected[index])) {
    throw new Error("coach_context_semantic_edge_mismatch");
  }
}

function createNodeBindings(slice: GraphContextSlice, owners: ReadonlyMap<string, string>): {
  byNodeId: Map<string, NodeBinding>;
  byDecisionId: Map<string, ScopedBindings>;
  decisionAliasById: Map<string, CoachContextRef>;
} {
  const decisionNodeById = new Map<string, ContextGraphNode>();
  for (const node of slice.nodes) {
    if (node.nodeKind !== "Decision") continue;
    const decisionId = (node.payload as { decisionId?: unknown }).decisionId;
    if (typeof decisionId !== "string" || decisionNodeById.has(decisionId)) {
      throw new Error("coach_context_decision_id_invalid");
    }
    decisionNodeById.set(decisionId, node);
  }
  const decisionAliasById = new Map<string, CoachContextRef>();
  slice.selectedDecisionIds.forEach((decisionId, index) => {
    if (!decisionNodeById.has(decisionId)) throw new Error("coach_context_selected_decision_unbound");
    decisionAliasById.set(decisionId, ref("D", index + 1));
  });

  const counters = { N: 0, A: 0, F: 0 };
  const byNodeId = new Map<string, NodeBinding>();
  const perDecision = new Map<string, {
    nodeByCanonicalId: Map<string, NodeBinding>;
    nodeByAlias: Map<string, NodeBinding>;
    actionByCanonicalId: Map<string, string>;
    actionByAlias: Map<string, string>;
    differenceByCanonicalId: Map<string, string>;
    differenceByAlias: Map<string, string>;
    meldByCanonicalId: Map<string, string>;
    meldByAlias: Map<string, string>;
  }>();
  const teachingNodes = slice.nodes.filter((node) => NODE_ALIAS_PREFIX[node.nodeKind] !== null);
  for (const node of teachingNodes) {
    const owner = owners.get(node.nodeId);
    if (owner === undefined) throw new Error("coach_context_node_owner_missing");
    let tables = perDecision.get(owner);
    if (tables === undefined) {
      tables = {
        nodeByCanonicalId: new Map(), nodeByAlias: new Map(),
        actionByCanonicalId: new Map(), actionByAlias: new Map(),
        differenceByCanonicalId: new Map(), differenceByAlias: new Map(),
        meldByCanonicalId: new Map(), meldByAlias: new Map(),
      };
      perDecision.set(owner, tables);
    }
    const prefix = NODE_ALIAS_PREFIX[node.nodeKind]!;
    const alias = prefix === "D"
      ? decisionAliasById.get(owner)!
      : ref(prefix, ++counters[prefix as "N" | "A" | "F"]);
    const binding: NodeBinding = { canonicalId: node.nodeId, ref: alias, nodeKind: node.nodeKind as NodeBinding["nodeKind"] };
    byNodeId.set(node.nodeId, binding);
    tables.nodeByCanonicalId.set(node.nodeId, binding);
    tables.nodeByAlias.set(alias, binding);

    if (node.nodeKind === "CandidateAction") {
      const actionRef = (node.payload as { actionRef?: unknown }).actionRef;
      if (typeof actionRef !== "string") throw new Error("coach_context_action_ref_missing");
      tables.actionByCanonicalId.set(actionRef, alias);
      tables.actionByAlias.set(alias, actionRef);
    }
    if (node.nodeKind === "FactorDifference") {
      const differenceId = (node.payload as { differenceId?: unknown }).differenceId;
      if (typeof differenceId !== "string") throw new Error("coach_context_difference_id_missing");
      tables.differenceByCanonicalId.set(differenceId, alias);
      tables.differenceByAlias.set(alias, differenceId);
    }
  }

  // Meld aliases are scoped by selected decision and are created only from
  // listed KnownGameFact melds. A later reference must resolve to that list.
  for (const node of teachingNodes) {
    if (node.nodeKind !== "KnownGameFact") continue;
    const owner = owners.get(node.nodeId)!;
    const tables = perDecision.get(owner)!;
    const melds = (node.payload as { melds?: unknown }).melds;
    if (!Array.isArray(melds)) continue;
    const canonicalRefs = melds.flatMap((entry) =>
      isObject(entry) && typeof entry.meldRef === "string" ? [entry.meldRef] : []);
    sortedUnique(canonicalRefs).forEach((canonicalRef, index) => {
      const alias = ref("M", index + 1);
      tables.meldByCanonicalId.set(canonicalRef, alias);
      tables.meldByAlias.set(alias, canonicalRef);
    });
  }

  return {
    byNodeId,
    byDecisionId: perDecision,
    decisionAliasById,
  };
}

function mapPayloadValue(
  value: unknown,
  key: string | undefined,
  eventAliases: ReadonlyMap<string, CoachContextRef>,
  scoped: ScopedBindings,
): unknown {
  if (typeof value === "string") {
    if (key !== undefined && EVENT_KEYS.has(key)) {
      const alias = eventAliases.get(value);
      if (alias === undefined) throw new Error("coach_context_event_ref_unbound");
      return alias;
    }
    if (key !== undefined && MELD_KEYS.has(key)) {
      const alias = scoped.meldByCanonicalId.get(value);
      if (alias === undefined) throw new Error("coach_context_meld_ref_unbound");
      return alias;
    }
    if (key !== undefined && (ACTION_SINGLE_KEYS.has(key))) {
      const alias = scoped.actionByCanonicalId.get(value);
      if (alias === undefined) throw new Error("coach_context_action_ref_unbound");
      return alias;
    }
    if (key !== undefined && DIFFERENCE_SINGLE_KEYS.has(key)) {
      const alias = scoped.differenceByCanonicalId.get(value);
      if (alias === undefined) throw new Error("coach_context_difference_ref_unbound");
      return alias;
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (key !== undefined && EVENT_KEYS.has(key)) {
      return value.map((entry) => {
        if (typeof entry !== "string") throw new Error("coach_context_event_ref_invalid");
        const alias = eventAliases.get(entry);
        if (alias === undefined) throw new Error("coach_context_event_ref_unbound");
        return alias;
      });
    }
    if (key !== undefined && MELD_KEYS.has(key)) {
      return value.map((entry) => {
        if (typeof entry !== "string") throw new Error("coach_context_meld_ref_invalid");
        const alias = scoped.meldByCanonicalId.get(entry);
        if (alias === undefined) throw new Error("coach_context_meld_ref_unbound");
        return alias;
      });
    }
    if (key !== undefined && ACTION_ARRAY_KEYS.has(key)) {
      return value.map((entry) => mapPayloadValue(entry, "actionRef", eventAliases, scoped));
    }
    if (key !== undefined && DIFFERENCE_ARRAY_KEYS.has(key)) {
      return value.map((entry) => mapPayloadValue(entry, "differenceId", eventAliases, scoped));
    }
    return value.map((entry) => mapPayloadValue(entry, undefined, eventAliases, scoped));
  }
  if (!isObject(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = mapPayloadValue(childValue, childKey, eventAliases, scoped);
  }
  return result;
}

function payloadForNode(
  node: ContextGraphNode,
  owner: string,
  eventAliases: ReadonlyMap<string, CoachContextRef>,
  scoped: ScopedBindings,
): Record<string, unknown> {
  const source = node.payload as Record<string, unknown>;
  const allowed = COACH_CONTEXT_PAYLOAD_ALLOWLIST[node.nodeKind as keyof typeof COACH_CONTEXT_PAYLOAD_ALLOWLIST];
  const payload: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in source)) continue;
    if (node.nodeKind === "KnownGameFact" && key === "factSource") continue;
    payload[key] = mapPayloadValue(source[key], key, eventAliases, scoped);
  }
  if (node.nodeKind === "CandidateAction") {
    const actionRef = source.actionRef;
    if (typeof actionRef !== "string") throw new Error("coach_context_action_ref_missing");
    payload.actionRef = scoped.actionByCanonicalId.get(actionRef);
  }
  if (node.nodeKind === "KnownGameFact") {
    const factSource = CoachFactSourceSchema.parse(source.provenance);
    payload.factSource = factSource;
  }
  return payload;
}

function transformNodes(
  slice: GraphContextSlice,
  owners: ReadonlyMap<string, string>,
  nodeBindings: ReturnType<typeof createNodeBindings>,
  eventAliases: ReadonlyMap<string, CoachContextRef>,
): CoachContextNode[] {
  return slice.nodes.flatMap((node) => {
    const prefix = NODE_ALIAS_PREFIX[node.nodeKind];
    if (prefix === null) return [];
    const owner = owners.get(node.nodeId);
    if (owner === undefined) throw new Error("coach_context_node_owner_missing");
    const binding = nodeBindings.byNodeId.get(node.nodeId);
    const decisionRef = nodeBindings.decisionAliasById.get(owner);
    const scoped = nodeBindings.byDecisionId.get(owner);
    if (binding === undefined || decisionRef === undefined || scoped === undefined) {
      throw new Error("coach_context_binding_missing");
    }
    return [{
      ref: binding.ref,
      decisionRef,
      nodeKind: node.nodeKind as CoachContextNode["nodeKind"],
      sourceClass: node.origin as CoachContextNode["sourceClass"],
      authority: node.authority,
      payload: payloadForNode(node, owner, eventAliases, scoped),
    }];
  });
}

export function buildCoachContext(sliceInput: GraphContextSlice): CoachContextBindings {
  const slice = sliceInput;
  const owners = ownerByNodeId(slice);
  validateSemanticRelationships(slice, owners);
  const payloads = slice.nodes
    .filter((node) => NODE_ALIAS_PREFIX[node.nodeKind] !== null)
    .map((node) => node.payload as Record<string, unknown>);
  const { aliasByCanonical: eventAliases, dto: events } = allocateEvents(payloads);
  const bindings = createNodeBindings(slice, owners);
  const nodes = transformNodes(slice, owners, bindings, eventAliases);
  const nodeRefById = new Map([...bindings.byNodeId].map(([nodeId, binding]) => [nodeId, binding.ref] as const));
  const edges = slice.edges.flatMap((edge) => {
    if (edge.edgeKind !== "applies_to") return [];
    const fromRef = nodeRefById.get(edge.from);
    const toRef = nodeRefById.get(edge.to);
    if (fromRef === undefined || toRef === undefined) throw new Error("coach_context_applies_to_edge_endpoint_unbound");
    return [{ edgeKind: "applies_to" as const, fromRef, toRef, payload: {} }];
  });
  const context = CoachContextSchema.parse({
    schemaVersion: "coach-context/v1",
    selectedDecisionRefs: slice.selectedDecisionIds.map((decisionId) => {
      const alias = bindings.decisionAliasById.get(decisionId);
      if (alias === undefined) throw new Error("coach_context_selected_decision_unbound");
      return alias;
    }),
    nodes,
    // Keep the applies_to edges because FactorFact's local source slice omits
    // actionRef. Other semantic edges are verified against the node payloads
    // and recovered from their explicit owner/direction/recommendation fields.
    edges,
    events,
  });
  return {
    context,
    decodeDraft: (raw) => decodeWireDraft(raw, bindings, eventAliases),
  };
}

function aliasOrTypedCanonical(
  value: unknown,
  expectedPrefix: string,
  canonicalMap: ReadonlyMap<string, string>,
  aliasMap: ReadonlyMap<string, string>,
): string | null {
  if (typeof value !== "string") return null;
  if (new RegExp(`^${expectedPrefix}[1-9][0-9]*$`).test(value)) return aliasMap.get(value) ?? null;
  return canonicalMap.has(value) ? value : null;
}

function ownsReservedLocalId(
  localId: string,
  bindings: ReturnType<typeof createNodeBindings>,
  eventAliases: ReadonlyMap<string, CoachContextRef>,
): boolean {
  if (/^(?:D|N|A|F|M|E)[1-9][0-9]*$/.test(localId) || localId.startsWith("ctxg:")) return true;
  if (eventAliases.has(localId)) return true;
  for (const scoped of bindings.byDecisionId.values()) {
    if (scoped.actionByCanonicalId.has(localId) || scoped.differenceByCanonicalId.has(localId) || scoped.meldByCanonicalId.has(localId)) return true;
    if (scoped.nodeByCanonicalId.has(localId)) return true;
  }
  return false;
}

function decodeWireDraft(
  raw: unknown,
  bindings: ReturnType<typeof createNodeBindings>,
  eventAliases: ReadonlyMap<string, CoachContextRef>,
): unknown | null {
  // The caller parses against CoachReasoningWireDraftSchema before this
  // mapping; keeping the decode function schema-agnostic avoids a contract
  // dependency cycle in this module.
  if (!isObject(raw) || !Array.isArray(raw.decisions)) return null;
  const decisionIdByAlias = new Map([...bindings.decisionAliasById].map(([decisionId, alias]) => [alias, decisionId] as const));
  const result: Record<string, unknown> = { decisions: [] };
  const decisions: unknown[] = [];
  for (const rawDecision of raw.decisions) {
    if (!isObject(rawDecision) || !isObject(rawDecision.judgment)) return null;
    const rawDecisionId = rawDecision.decisionId;
    const decisionId = typeof rawDecisionId === "string"
      ? decisionIdByAlias.get(rawDecisionId) ?? (bindings.decisionAliasById.has(rawDecisionId) ? rawDecisionId : null)
      : null;
    if (decisionId === null) return null;
    const scoped = bindings.byDecisionId.get(decisionId);
    if (scoped === undefined) return null;

    if (typeof rawDecision.judgment.localId !== "string") return null;
    const allLocalIds: string[] = [rawDecision.judgment.localId];
    for (const inference of Array.isArray(rawDecision.inferences) ? rawDecision.inferences : []) {
      if (!isObject(inference) || typeof inference.localId !== "string") return null;
      allLocalIds.push(inference.localId);
    }
    if (allLocalIds.some((localId) => typeof localId !== "string" || ownsReservedLocalId(localId, bindings, eventAliases))) return null;

    const nodeIdFromRef = (value: unknown): string | null => {
      if (typeof value !== "string") return null;
      const aliasBinding = scoped.nodeByAlias.get(value);
      if (aliasBinding !== undefined) return aliasBinding.canonicalId;
      return scoped.nodeByCanonicalId.has(value) ? value : null;
    };
    const recommendation = aliasOrTypedCanonical(
      rawDecision.judgment.recommendation,
      "A",
      scoped.actionByCanonicalId,
      scoped.actionByAlias,
    );
    if (recommendation === null) return null;

    const decodePremise = (value: unknown): string | null => {
      if (typeof value !== "string") return null;
      const graphRef = nodeIdFromRef(value);
      if (graphRef !== null) return graphRef;
      if (/^(?:D|N|A|F|M|E)[1-9][0-9]*$/.test(value) || value.startsWith("ctxg:")) return null;
      // Preserve ordinary strings so the canonical grounding validator can
      // attribute unknown references to one decision (dangling_ref) rather
      // than turning one bad premise into a whole-response parse failure.
      return value;
    };
    const decodeRefs = (values: unknown): string[] | null => {
      if (!Array.isArray(values)) return null;
      const mapped = values.map(decodePremise);
      return mapped.some((entry) => entry === null) ? null : mapped as string[];
    };
    const premises = decodeRefs(rawDecision.judgment.premiseRefs);
    if (premises === null) return null;

    const inferences: unknown = rawDecision.inferences === undefined
      ? undefined
      : (rawDecision.inferences as unknown[]).map((inference) => {
        if (!isObject(inference)) return null;
        const premiseRefs = decodeRefs(inference.premiseRefs);
        return premiseRefs === null ? null : { ...inference, premiseRefs };
      });
    if (Array.isArray(inferences) && inferences.some((entry) => entry === null)) return null;

    const decodePlaceholder = (text: string): string | null => {
      let valid = true;
      const mapped = text.replace(/\{(diff|candidate):([^{}.]+)\.([^{}]+)\}/g, (token, kind: string, identity: string, field: string) => {
        if (kind === "diff") {
          const canonical = aliasOrTypedCanonical(identity, "F", scoped.differenceByCanonicalId, scoped.differenceByAlias);
          if (canonical === null) { valid = false; return token; }
          return `{diff:${canonical}.${field}}`;
        }
        const canonical = aliasOrTypedCanonical(identity, "A", scoped.actionByCanonicalId, scoped.actionByAlias);
        if (canonical === null) { valid = false; return token; }
        return `{candidate:${canonical}.${field}}`;
      });
      return valid ? mapped : null;
    };

    const explanations: unknown = rawDecision.explanations === undefined
      ? undefined
      : (rawDecision.explanations as unknown[]).map((explanation) => {
        if (!isObject(explanation) || typeof explanation.text !== "string" || !Array.isArray(explanation.claims)) return null;
        const text = decodePlaceholder(explanation.text);
        if (text === null) return null;
        const claims = explanation.claims.map((claim) => {
          if (!isObject(claim) || typeof claim.evidenceRef !== "string") return null;
          const binding = scoped.nodeByAlias.get(claim.evidenceRef) ?? scoped.nodeByCanonicalId.get(claim.evidenceRef);
          if (claim.kind === "factor_difference") {
            return binding?.nodeKind === "FactorDifference" ? { ...claim, evidenceRef: binding.canonicalId } : null;
          }
          if (claim.kind === "factor_fact") {
            return binding?.nodeKind === "FactorFact" ? { ...claim, evidenceRef: binding.canonicalId } : null;
          }
          return null;
        });
        if (claims.some((claim) => claim === null)) return null;
        return { ...explanation, text, claims };
      });
    if (Array.isArray(explanations) && explanations.some((entry) => entry === null)) return null;

    decisions.push({
      ...rawDecision,
      decisionId,
      judgment: { ...rawDecision.judgment, recommendation, premiseRefs: premises },
      ...(inferences === undefined ? {} : { inferences }),
      ...(explanations === undefined ? {} : { explanations }),
    });
  }
  result.decisions = decisions;
  return result;
}
