import {
  COACH_CONTEXT_SCHEMA_VERSION,
  CoachContextSchema,
  CoachTeachingBriefSchema,
  type CoachContext,
  type CoachContextNode,
  type CoachTeachingBrief,
} from "@riichi-coach/contracts";
import { canonicalJson } from "./analysis/package-identity.js";

function payload(node: CoachContextNode): Record<string, unknown> {
  return node.payload as Record<string, unknown>;
}

function factBucket(node: CoachContextNode): "certain" | "estimated" | "missing" {
  const fact = payload(node);
  if (fact.status !== "calculated") return "missing";
  return node.authority === "advisory" ? "estimated" : "certain";
}

/**
 * Reorganize the already compact CoachContext for reading. The original
 * CoachContext remains the canonical binding/decode source; every node and
 * relation is copied by reference value, never reconstructed from prose.
 */
export function buildCoachTeachingBrief(contextInput: CoachContext): CoachTeachingBrief {
  const context = CoachContextSchema.parse(contextInput);
  const nodesByDecision = new Map<string, CoachContextNode[]>();
  for (const node of context.nodes) {
    const nodes = nodesByDecision.get(node.decisionRef) ?? [];
    nodes.push(node);
    nodesByDecision.set(node.decisionRef, nodes);
  }
  const actionByFactRef = new Map<string, string>();
  for (const edge of context.edges) {
    if (edge.edgeKind !== "applies_to") continue;
    if (actionByFactRef.has(edge.fromRef)) throw new Error("coach_teaching_brief_fact_relation_duplicate");
    actionByFactRef.set(edge.fromRef, edge.toRef);
  }

  const decisions = context.selectedDecisionRefs.map((decisionRef) => {
    const nodes = nodesByDecision.get(decisionRef) ?? [];
    const decision = nodes.find((node) => node.nodeKind === "Decision");
    if (decision === undefined) throw new Error("coach_teaching_brief_decision_missing");
    const situation = nodes.filter((node) => node.nodeKind === "KnownGameFact");
    const candidates = nodes.filter((node) => node.nodeKind === "CandidateAction");
    const actions = candidates.map((candidate) => {
      const buckets = { certain: [], estimated: [], missing: [] } as Record<
        "certain" | "estimated" | "missing",
        CoachContextNode[]
      >;
      for (const fact of nodes.filter((node) => node.nodeKind === "FactorFact" &&
        actionByFactRef.get(node.ref) === candidate.ref)) {
        buckets[factBucket(fact)].push(fact);
      }
      return { candidate, facts: buckets };
    });
    const differenceNodes = nodes.filter((node) => node.nodeKind === "FactorDifference");
    const differencesByAxis = new Map<string, CoachContextNode[]>();
    for (const difference of differenceNodes) {
      const axis = payload(difference).axis;
      if (typeof axis !== "string") throw new Error("coach_teaching_brief_difference_axis_missing");
      const entries = differencesByAxis.get(axis) ?? [];
      entries.push(difference);
      differencesByAxis.set(axis, entries);
    }
    const comparisons = [...differencesByAxis].map(([axis, differences]) => ({ axis, differences }));
    return {
      decision,
      situation,
      actions,
      comparisons,
      model: nodes.filter((node) => node.nodeKind === "ModelEvaluation"),
      preference: nodes.filter((node) => node.nodeKind === "DeterministicPreference"),
    };
  });
  const brief = CoachTeachingBriefSchema.parse({
    schemaVersion: "coach-teaching-brief/v1",
    selectedDecisionRefs: context.selectedDecisionRefs,
    decisions,
    edges: context.edges,
    events: context.events,
  });
  return validateCoachTeachingBriefAgainstContext(context, brief);
}

/** Validate an untrusted/reconstructed brief against the exact context that
 * owns its aliases. This makes node coverage and semantic links reversible. */
export function validateCoachTeachingBriefAgainstContext(
  contextInput: CoachContext,
  briefInput: unknown,
): CoachTeachingBrief {
  const context = CoachContextSchema.parse(contextInput);
  const brief = CoachTeachingBriefSchema.parse(briefInput);
  if (brief.selectedDecisionRefs.length !== context.selectedDecisionRefs.length ||
    brief.selectedDecisionRefs.some((ref, index) => ref !== context.selectedDecisionRefs[index])) {
    throw new Error("coach_teaching_brief_selected_decisions_mismatch");
  }
  const briefNodes = brief.decisions.flatMap((entry) => [
    entry.decision,
    ...entry.situation,
    ...entry.actions.flatMap((action) => [
      action.candidate,
      ...action.facts.certain,
      ...action.facts.estimated,
      ...action.facts.missing,
    ]),
    ...entry.comparisons.flatMap((group) => group.differences),
    ...entry.model,
    ...entry.preference,
  ]);
  const sourceByRef = new Map(context.nodes.map((node) => [node.ref, node] as const));
  const briefByRef = new Map(briefNodes.map((node) => [node.ref, node] as const));
  if (briefNodes.length !== briefByRef.size || sourceByRef.size !== briefByRef.size ||
    [...sourceByRef.keys()].some((ref) => !briefByRef.has(ref))) {
    throw new Error("coach_teaching_brief_node_coverage_mismatch");
  }
  for (const [ref, sourceNode] of sourceByRef) {
    if (canonicalJson(sourceNode) !== canonicalJson(briefByRef.get(ref))) {
      throw new Error(`coach_teaching_brief_node_mismatch:${ref}`);
    }
  }
  if (canonicalJson(brief.edges) !== canonicalJson(context.edges)) {
    throw new Error("coach_teaching_brief_edges_mismatch");
  }
  if (canonicalJson(brief.events) !== canonicalJson(context.events)) {
    throw new Error("coach_teaching_brief_events_mismatch");
  }
  // A synthetic flat DTO lets the frozen CoachContext validator recheck all
  // refs after the tree is collected, including event/meld and action roles.
  CoachContextSchema.parse({
    schemaVersion: COACH_CONTEXT_SCHEMA_VERSION,
    selectedDecisionRefs: brief.selectedDecisionRefs,
    nodes: briefNodes,
    edges: brief.edges,
    events: brief.events,
  });
  return brief;
}

