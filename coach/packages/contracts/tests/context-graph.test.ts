/**
 * M6-D1 — contracts contract tests (spec "按模块测试 — contracts": node/edge/
 * slice schema 接受最小合法样例，拒绝未知 node/edge kind、`causes`、未知
 * authority/origin、allow-list 外字段; contracts 不依赖 reasoning 可编译).
 */
import { describe, expect, it } from "vitest";
import {
  CONTEXT_GRAPH_SCHEMA_VERSION,
  ContextGraphEdgeSchema,
  ContextGraphNodeSchema,
  ContextGraphSchema,
  EVIDENCE_GRAPH_NODE_KINDS,
  GRAPH_CONTEXT_SLICE_SCHEMA_VERSION,
  GRAPH_SLICE_PAYLOAD_ALLOWLIST,
  GraphContextSliceSchema,
  REASONING_GRAPH_NODE_KINDS,
  type GraphNodeKind,
} from "../src/index.js";

function minimalNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nodeId: "ctxg:Decision:test",
    nodeKind: "Decision",
    partition: "evidence",
    origin: "canonical_replay",
    authority: "structural",
    producer: "canonical-replay",
    producerVersion: "canonical-riichi-events/v2",
    payload: { decisionId: "decision:game:a:self0:self_turn:game:a/0/1/0" },
    provenance: [],
    ...overrides,
  };
}

function minimalEdge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    edgeId: "ctxg:edge:test",
    edgeKind: "contains",
    from: "ctxg:Decision:test",
    to: "ctxg:KnownGameFact:test",
    origin: "package_projection",
    provenance: [],
    payload: {},
    ...overrides,
  };
}

describe("M6-D1 context-graph contracts", () => {
  it("accepts a minimal legal node for every evidence node kind", () => {
    for (const nodeKind of EVIDENCE_GRAPH_NODE_KINDS) {
      const node = minimalNode({
        nodeId: `ctxg:${nodeKind}:test`,
        nodeKind,
        payload: {},
      });
      expect(() => ContextGraphNodeSchema.parse(node)).not.toThrow();
    }
  });

  it("accepts a minimal legal node for every reasoning node kind (partition rules are validator-enforced)", () => {
    for (const nodeKind of REASONING_GRAPH_NODE_KINDS) {
      const node = minimalNode({
        nodeId: `ctxg:${nodeKind}:test`,
        nodeKind,
        partition: "reasoning",
        origin: "llm_reasoning",
        authority: "coach",
        payload: {},
      });
      expect(() => ContextGraphNodeSchema.parse(node)).not.toThrow();
    }
  });

  it("rejects unknown node kinds, origins and authorities", () => {
    expect(() => ContextGraphNodeSchema.parse(minimalNode({ nodeKind: "CausalClaim" })))
      .toThrow();
    expect(() => ContextGraphNodeSchema.parse(minimalNode({ origin: "llm_chain_of_thought" })))
      .toThrow();
    expect(() => ContextGraphNodeSchema.parse(minimalNode({ authority: "omniscient" })))
      .toThrow();
    expect(() => ContextGraphNodeSchema.parse(minimalNode({ partition: "mixed" })))
      .toThrow();
  });

  it("rejects unknown keys on a node (strict schema)", () => {
    expect(() => ContextGraphNodeSchema.parse(minimalNode({ extra: true })))
      .toThrow();
  });

  it("accepts a minimal legal edge and rejects unknown edge kinds and `causes`", () => {
    expect(() => ContextGraphEdgeSchema.parse(minimalEdge())).not.toThrow();
    for (const edgeKind of [
      "contains", "applies_to", "compares", "supports", "recommends",
      "derived_from", "opposes", "qualifies", "verbalizes",
    ]) {
      expect(() => ContextGraphEdgeSchema.parse(minimalEdge({ edgeKind }))).not.toThrow();
    }
    expect(() => ContextGraphEdgeSchema.parse(minimalEdge({ edgeKind: "causes" })))
      .toThrow();
    expect(() => ContextGraphEdgeSchema.parse(minimalEdge({ edgeKind: "implies" })))
      .toThrow();
  });

  it("accepts a minimal graph and rejects a second schema version", () => {
    const graph = {
      schemaVersion: CONTEXT_GRAPH_SCHEMA_VERSION,
      graphId: "context-graph:package:sha256:test",
      packageId: "package:sha256:test",
      nodes: [minimalNode()],
      edges: [minimalEdge()],
    };
    expect(() => ContextGraphSchema.parse(graph)).not.toThrow();
    expect(() => ContextGraphSchema.parse({
      ...graph,
      schemaVersion: "context-graph/v2",
    })).toThrow();
  });

  it("accepts a minimal legal slice", () => {
    const slice = {
      schemaVersion: GRAPH_CONTEXT_SLICE_SCHEMA_VERSION,
      sliceId: "ctxg:slice:test",
      packageId: "package:sha256:test",
      selectedDecisionIds: ["decision:game:a:self0:self_turn:game:a/0/1/0"],
      nodes: [
        minimalNode({
          payload: {
            decisionId: "decision:game:a:self0:self_turn:game:a/0/1/0",
            surface: "self",
            roundOrdinal: 0,
            normalizedDecisionContext: {
              decisionWindowKind: "self_turn",
              selfActor: 0,
              triggerEventRef: "game:a/0/1/0",
              actualAction: null,
            },
          },
        }),
      ],
      edges: [minimalEdge()],
    };
    expect(() => GraphContextSliceSchema.parse(slice)).not.toThrow();
  });

  it("rejects slice payload keys outside the explicit allow-list", () => {
    const slice = {
      schemaVersion: GRAPH_CONTEXT_SLICE_SCHEMA_VERSION,
      sliceId: "ctxg:slice:test",
      packageId: "package:sha256:test",
      selectedDecisionIds: ["d1"],
      nodes: [minimalNode({
        nodeId: "ctxg:Decision:leak",
        payload: { decisionId: "d1", createdAt: "2026-08-20T00:00:00.000Z" },
      })],
      edges: [],
    };
    expect(() => GraphContextSliceSchema.parse(slice)).toThrow(/createdAt/);
  });

  it("rejects the wall-clock ModelEvaluation.detailPolicy.frozenAt in a slice", () => {
    const slice = {
      schemaVersion: GRAPH_CONTEXT_SLICE_SCHEMA_VERSION,
      sliceId: "ctxg:slice:test",
      packageId: "package:sha256:test",
      selectedDecisionIds: ["d1"],
      nodes: [minimalNode({
        nodeId: "ctxg:ModelEvaluation:leak",
        nodeKind: "ModelEvaluation",
        payload: {
          evaluationId: "e1",
          detailPolicy: {
            threshold: 10,
            unit: "model_selection_score_points",
            boundary: "greater_than_or_equal_is_detailed",
            policyVersion: "mortal-review/v1",
            frozenAt: "2026-08-20T00:00:00.000Z",
          },
        },
      })],
      edges: [],
    };
    expect(() => GraphContextSliceSchema.parse(slice))
      .toThrow(/frozenAt/);
  });

  it("rejects duplicate selected decision ids", () => {
    const slice = {
      schemaVersion: GRAPH_CONTEXT_SLICE_SCHEMA_VERSION,
      sliceId: "ctxg:slice:test",
      packageId: "package:sha256:test",
      selectedDecisionIds: ["d1", "d1"],
      nodes: [],
      edges: [],
    };
    expect(() => GraphContextSliceSchema.parse(slice)).toThrow(/unique/);
  });

  it("the allow-list covers every node kind and the spec table's field sets", () => {
    const kinds: GraphNodeKind[] = [
      "Decision", "CandidateAction", "KnownGameFact", "FactorFact",
      "FactorDifference", "ModelEvaluation", "DeterministicPreference",
      "Evidence", "CoachInference", "CoachJudgment", "Explanation",
    ];
    expect(Object.keys(GRAPH_SLICE_PAYLOAD_ALLOWLIST).sort()).toEqual([...kinds].sort());
    expect(GRAPH_SLICE_PAYLOAD_ALLOWLIST.Decision).toEqual([
      "decisionId", "surface", "roundOrdinal", "normalizedDecisionContext",
    ]);
    expect(GRAPH_SLICE_PAYLOAD_ALLOWLIST.KnownGameFact).not.toContain("evidenceIds");
    expect(GRAPH_SLICE_PAYLOAD_ALLOWLIST.FactorFact).not.toContain("evidenceIds");
    expect(GRAPH_SLICE_PAYLOAD_ALLOWLIST.FactorFact).not.toContain("engineIdentity");
    expect(GRAPH_SLICE_PAYLOAD_ALLOWLIST.ModelEvaluation).toContain("detailPolicy");
    // Reasoning kinds have an EMPTY allow-list: no reasoning payload may
    // cross the LLM boundary in D1.
    for (const kind of REASONING_GRAPH_NODE_KINDS) {
      expect(GRAPH_SLICE_PAYLOAD_ALLOWLIST[kind]).toEqual([]);
    }
  });
});
