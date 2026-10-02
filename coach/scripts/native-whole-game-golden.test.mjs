/** Captured real CPU/native output + freshly mapped XML + real helper.
 * Default tests replay the capture: no native assets, checkpoint or network.
 * Same-engine replay proves consumer binding, not independent rule correctness.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildStructuredAnalysisPackage, selectReviewDecisions } from "@riichi-coach/reasoning";
import { nativeWholeGameFixture } from "./fixtures/native-whole-game.mjs";
let stream, report, versions, baseline, reviewPackage;

beforeAll(async () => {
  ({stream,report,versions,reviewPackage} = await nativeWholeGameFixture());
  baseline = await reviewPackage();
},120000);

describe("native whole-game golden",()=>{
  it("retains all 22 evaluations across both surfaces and accounts for all 65 boundaries",()=>{
    expect(baseline.review.summary.outcomes).toEqual({analysis_ready:22,unsupported_action:0,source_row_not_expected:0,
      no_mortal_entry:0,binding_mismatch:0,model_output_incomplete:0,analysis_blocked:0});
    expect(baseline.review.retainedAnalyses).toHaveLength(22);
    expect(baseline.review.libriichi.nonActionBoundaries).toHaveLength(43);
    expect(baseline.pkg.decisions).toHaveLength(22);
    expect(baseline.pkg.legalActionEvidence.results).toHaveLength(65);
    expect(baseline.pkg.record.status).toBe("complete");
    expect(baseline.pkg.decisions.filter(row=>row.surface==="response")).toHaveLength(6);
    expect(baseline.pkg.decisions.filter(row=>row.surface==="response").map(row=>row.comparisonSet.candidates.find(c=>c.origins.includes("actual")).action.kind))
      .toEqual(["pass","pass","pass","chi","daiminkan","ron"]);
  });

  it("records missing model rows as incomplete while preserving successful rules and non-action boundaries",async()=>{
    const missing=await reviewPackage({...report,kyokus:[]});
    expect(missing.review.summary.outcomes.no_mortal_entry).toBe(22);
    expect(missing.review.retainedAnalyses).toEqual([]);
    expect(missing.review.libriichi.nonActionBoundaries).toHaveLength(43);
    expect(missing.pkg.legalActionEvidence.results).toEqual(baseline.pkg.legalActionEvidence.results);
    expect(missing.pkg.record.status).toBe("integrity_failed");
    expect(selectReviewDecisions(missing.pkg).selected).toEqual([]);
  },120000);

  it("recomputes the complete analysis, package identity and selection deterministically",async()=>{
    const second=await reviewPackage();
    expect(second.pkg.analysisKey).toBe(baseline.pkg.analysisKey);
    expect(second.pkg.packageId).toBe(baseline.pkg.packageId);
    expect(second.pkg.semanticContentHash).toBe(baseline.pkg.semanticContentHash);
    expect(selectReviewDecisions(second.pkg)).toEqual(selectReviewDecisions(baseline.pkg));
    const other=buildStructuredAnalysisPackage({...baseline.input,componentVersions:{...versions,factorPipeline:"factor-pipeline/v2"}});
    expect(other.packageId).not.toBe(baseline.pkg.packageId);
    expect(other.semanticContentHash).not.toBe(baseline.pkg.semanticContentHash);
  },120000);

  it("selects the two pinned disagreements with resolvable decision identities",()=>{
    const selection=selectReviewDecisions(baseline.pkg);
    const prefix=`decision:${stream.gameId}:self1:self:self_turn:${stream.gameId}/0/`;
    expect(selection.selected).toEqual([
      {decisionId:`${prefix}66/0`,rank:1,selectionReason:"model_disagreement_above_threshold"},
      {decisionId:`${prefix}74/0`,rank:2,selectionReason:"model_disagreement_above_threshold"},
    ]);
    expect(selection.analysisPackageId).toBe(baseline.pkg.packageId);
    expect(selection.analysisPackageStatus).toBe("complete");
    for(const item of selection.selected) {
      const decision=baseline.pkg.decisions.find(row=>row.decisionId===item.decisionId);
      expect(decision.outcome).toBe("analysis_ready");
      expect(decision.modelEvaluation.errorGap).toBeGreaterThanOrEqual(10);
    }
  });
});
