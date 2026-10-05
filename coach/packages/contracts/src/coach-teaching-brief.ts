import { z } from "zod";
import { AxisSchema } from "./evidence.js";
import { FactorStatusSchema, FactorValueSchema } from "./factor-ledger.js";
import {
  COACH_CONTEXT_SCHEMA_VERSION,
  CoachContextEdgeSchema,
  CoachContextEventSchema,
  CoachContextNodeSchema,
  CoachContextSchema,
  type CoachContextEdge,
  type CoachContextEvent,
  type CoachContextNode,
} from "./coach-context.js";

export const COACH_TEACHING_BRIEF_SCHEMA_VERSION = "coach-teaching-brief/v1" as const;

function nodeOfKind<K extends CoachContextNode["nodeKind"]>(kind: K) {
  return z.intersection(
    CoachContextNodeSchema,
    z.object({ nodeKind: z.literal(kind) }),
  );
}

const DecisionNodeSchema = nodeOfKind("Decision");
const CandidateNodeSchema = nodeOfKind("CandidateAction");
const SituationNodeSchema = nodeOfKind("KnownGameFact");
const FactorFactNodeSchema = nodeOfKind("FactorFact").superRefine((node, context) => {
  const payload = node.payload;
  if (!FactorStatusSchema.safeParse(payload.status).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Factor fact status is invalid", path: ["payload", "status"] });
  }
  if (node.authority !== "hard" && node.authority !== "advisory") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Factor fact authority must be hard or advisory", path: ["authority"] });
  }
  if (payload.status === "calculated" && !FactorValueSchema.safeParse(payload.value).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Calculated factor fact requires a valid value", path: ["payload", "value"] });
  }
  if (payload.status !== "calculated" && payload.value !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Unavailable factor fact must not carry a value", path: ["payload", "value"] });
  }
});
const DifferenceNodeSchema = nodeOfKind("FactorDifference");
const ModelNodeSchema = nodeOfKind("ModelEvaluation");
const PreferenceNodeSchema = nodeOfKind("DeterministicPreference");

const CoachTeachingBriefDecisionSchema = z.object({
  decision: DecisionNodeSchema,
  situation: z.array(SituationNodeSchema),
  actions: z.array(z.object({
    candidate: CandidateNodeSchema,
    facts: z.object({
      certain: z.array(FactorFactNodeSchema),
      estimated: z.array(FactorFactNodeSchema),
      missing: z.array(FactorFactNodeSchema),
    }).strict(),
  }).strict()),
  comparisons: z.array(z.object({
    axis: AxisSchema,
    differences: z.array(DifferenceNodeSchema).min(1),
  }).strict()),
  model: z.array(ModelNodeSchema),
  preference: z.array(PreferenceNodeSchema),
}).strict();

export const CoachTeachingBriefSchema = z.object({
  schemaVersion: z.literal(COACH_TEACHING_BRIEF_SCHEMA_VERSION),
  selectedDecisionRefs: z.array(z.string().regex(/^D[1-9][0-9]*$/)),
  decisions: z.array(CoachTeachingBriefDecisionSchema),
  edges: z.array(CoachContextEdgeSchema),
  events: z.array(CoachContextEventSchema),
}).strict().superRefine((brief, context) => {
  const issue = (message: string, path: (string | number)[]) =>
    context.addIssue({ code: z.ZodIssueCode.custom, message, path });
  if (new Set(brief.selectedDecisionRefs).size !== brief.selectedDecisionRefs.length) {
    issue("Teaching brief selected decisions must be unique", ["selectedDecisionRefs"]);
  }
  if (brief.decisions.length !== brief.selectedDecisionRefs.length ||
    brief.decisions.some((entry, index) => entry.decision.ref !== brief.selectedDecisionRefs[index])) {
    issue("Teaching brief decisions must match selectedDecisionRefs in order", ["decisions"]);
  }

  const allNodes: CoachContextNode[] = [];
  for (const [decisionIndex, entry] of brief.decisions.entries()) {
    const owner = entry.decision.ref;
    const decisionNodes: CoachContextNode[] = [entry.decision];
    for (const [index, node] of entry.situation.entries()) {
      if (node.decisionRef !== owner) issue("Situation node belongs to another decision", ["decisions", decisionIndex, "situation", index]);
      decisionNodes.push(node);
    }
    const actionRefs = new Set(entry.actions.map((action) => action.candidate.ref));
    if (actionRefs.size !== entry.actions.length) {
      issue("Teaching brief candidate refs must be unique within a decision", ["decisions", decisionIndex, "actions"]);
    }
    for (const [actionIndex, action] of entry.actions.entries()) {
      if (action.candidate.decisionRef !== owner) {
        issue("Candidate belongs to another decision", ["decisions", decisionIndex, "actions", actionIndex, "candidate"]);
      }
      decisionNodes.push(action.candidate);
      for (const bucket of ["certain", "estimated", "missing"] as const) {
        for (const [factIndex, fact] of action.facts[bucket].entries()) {
          if (fact.decisionRef !== owner) {
            issue("Factor fact belongs to another decision", ["decisions", decisionIndex, "actions", actionIndex, "facts", bucket, factIndex]);
          }
          const status = fact.payload.status;
          const expectedBucket = status !== "calculated"
            ? "missing"
            : fact.authority === "advisory" ? "estimated" : "certain";
          if (bucket !== expectedBucket) {
            issue("Factor fact is in the wrong authority/status bucket", ["decisions", decisionIndex, "actions", actionIndex, "facts", bucket, factIndex]);
          }
          decisionNodes.push(fact);
        }
      }
    }

    const comparisonAxes = new Set<string>();
    for (const [groupIndex, group] of entry.comparisons.entries()) {
      if (comparisonAxes.has(group.axis)) {
        issue("Comparison axes must be unique within a decision", ["decisions", decisionIndex, "comparisons", groupIndex, "axis"]);
      }
      comparisonAxes.add(group.axis);
      for (const [differenceIndex, difference] of group.differences.entries()) {
        if (difference.decisionRef !== owner) {
          issue("Difference belongs to another decision", ["decisions", decisionIndex, "comparisons", groupIndex, "differences", differenceIndex]);
        }
        if (difference.payload.axis !== group.axis) {
          issue("Difference axis does not match its comparison group", ["decisions", decisionIndex, "comparisons", groupIndex, "differences", differenceIndex, "payload", "axis"]);
        }
        const left = difference.payload.leftActionRef;
        const right = difference.payload.rightActionRef;
        if (typeof left !== "string" || typeof right !== "string" || !actionRefs.has(left) || !actionRefs.has(right) || left === right) {
          issue("Difference must compare two distinct same-decision candidates", ["decisions", decisionIndex, "comparisons", groupIndex, "differences", differenceIndex]);
        }
        decisionNodes.push(difference);
      }
    }
    const scope = entry.decision.payload.automaticComparisonScope;
    if (scope !== undefined && scope !== null && typeof scope === "object" && !Array.isArray(scope)) {
      const pair = (scope as Record<string, unknown>).actionRefs;
      if (Array.isArray(pair) && pair.length === 2 && pair.every((ref) => typeof ref === "string")) {
        for (const group of entry.comparisons) for (const difference of group.differences) {
          const left = difference.payload.leftActionRef;
          const right = difference.payload.rightActionRef;
          if (!((left === pair[0] && right === pair[1]) || (left === pair[1] && right === pair[0]))) {
            issue("Difference is outside the automatic comparison pair", ["decisions", decisionIndex, "comparisons"]);
          }
        }
      }
    }
    decisionNodes.push(...entry.model, ...entry.preference);
    for (const node of [...entry.model, ...entry.preference]) {
      if (node.decisionRef !== owner) issue("Model or preference node belongs to another decision", ["decisions", decisionIndex]);
    }
    allNodes.push(...decisionNodes);
  }

  const refs = allNodes.map((node) => node.ref);
  if (new Set(refs).size !== refs.length) issue("Teaching brief node refs must be unique", ["decisions"]);

  // Reuse the source DTO's closed reference/edge contract after collecting the
  // tree. This catches dangling, cross-decision, and wrong-role short refs.
  const flattened = CoachContextSchema.safeParse({
    schemaVersion: COACH_CONTEXT_SCHEMA_VERSION,
    selectedDecisionRefs: brief.selectedDecisionRefs,
    nodes: allNodes,
    edges: brief.edges,
    events: brief.events,
  });
  if (!flattened.success) issue("Teaching brief contains invalid compact references or relations", ["decisions"]);

  const nodeByRef = new Map(allNodes.map((node) => [node.ref, node] as const));
  const factEdgeCount = new Map<string, number>();
  for (const edge of brief.edges) {
    if (edge.edgeKind !== "applies_to") continue;
    factEdgeCount.set(edge.fromRef, (factEdgeCount.get(edge.fromRef) ?? 0) + 1);
  }
  for (const [decisionIndex, entry] of brief.decisions.entries()) {
    for (const [actionIndex, action] of entry.actions.entries()) {
      for (const bucket of ["certain", "estimated", "missing"] as const) {
        for (const [factIndex, fact] of action.facts[bucket].entries()) {
          const outgoing = brief.edges.filter((edge) => edge.edgeKind === "applies_to" && edge.fromRef === fact.ref);
          if (factEdgeCount.get(fact.ref) !== 1 || outgoing[0]?.toRef !== action.candidate.ref) {
            issue("Factor fact placement must match its applies_to relation", ["decisions", decisionIndex, "actions", actionIndex, "facts", bucket, factIndex]);
          }
        }
      }
    }
  }
  for (const edge of brief.edges) {
    if (!nodeByRef.has(edge.fromRef) || !nodeByRef.has(edge.toRef)) {
      issue("Teaching brief edge endpoint is absent", ["edges"]);
    }
  }
});

export type CoachTeachingBrief = z.infer<typeof CoachTeachingBriefSchema>;
export type CoachTeachingBriefDecision = z.infer<typeof CoachTeachingBriefDecisionSchema>;
export type CoachTeachingBriefNode = CoachContextNode;
export type CoachTeachingBriefEdge = CoachContextEdge;
export type CoachTeachingBriefEvent = CoachContextEvent;
