import { describe, expect, it } from "vitest";
import { SELECTOR_POLICY_VERSION_V1 } from "@riichi-coach/contracts";
import { buildCoachRequest } from "../src/coach-prompt.js";
import { projectContextGraph } from "../src/context-graph/project-context-graph.js";
import { buildGraphContextSlice } from "../src/context-graph/build-graph-context-slice.js";
import { canonicalJson } from "../src/analysis/package-identity.js";
import { buildTwoReadyPackage } from "./fixtures/context-graph-package.js";

describe("frozen coach prompt boundary", () => {
  it("sends exactly the selected D1 slice, excluding other decisions and non-allowlisted fields", async () => {
    const pkg = await buildTwoReadyPackage();
    const graph = projectContextGraph(pkg);
    const selectedId = pkg.decisions[0]!.decisionId;
    const selection = {
      policyVersion: SELECTOR_POLICY_VERSION_V1, analysisPackageId: pkg.packageId, analysisPackageStatus: pkg.record.status,
      selected: [{ decisionId: selectedId, rank: 1, selectionReason: "model_disagreement_above_threshold" as const }],
    };
    const request = buildCoachRequest(graph, selection)!;
    expect(request.prompt.split("GraphContextSlice:\n")[1]).toBe(canonicalJson(buildGraphContextSlice(graph, selection)));
    expect(request.prompt).not.toContain(pkg.decisions[1]!.decisionId);
    expect(request.prompt).not.toContain("frozenAt");
    expect(request.prompt).not.toContain("evidenceRegistry");
    expect(buildCoachRequest(structuredClone(graph), structuredClone(selection))).toEqual(request);
    expect(buildCoachRequest(graph, { ...selection, selected: [] })).toBeNull();
    expect(() => buildCoachRequest(graph, { ...selection, analysisPackageId: "wrong-package" })).toThrow();
  });
});
