import { describe, expect, it } from "vitest";
import {
  LOCAL_MORTAL_ADAPTER_VERSION,
  managedLocalMortalEngineVersion,
  type ManagedMortalRuntimeIdentity,
} from "@riichi-coach/contracts";
import {
  buildStructuredAnalysisPackage,
  validateStructuredAnalysisPackage,
} from "../src/index.js";
import {
  componentVersions,
  entryFor,
  fixtureSetup,
  runFixtureReview,
} from "./fixtures/structured-review.js";

const identity: ManagedMortalRuntimeIdentity = {
  runtimeImplementation: "Equim-chan/Mortal", runtimeRevision: "0cff2b52982be5b1163aa9a62fb01f03ce91e0d2",
  runtimeVersion: "Mortal V4", runtimeArtifactSha256: "a".repeat(64),
  checkpointRepository: "Yuchen1457/mortal-582500", checkpointRevision: "7386c9f5c751a3ea75efea99737cef5a5ef950f1",
  checkpointModelTag: "mortal-hpc@582500", checkpointFileSha256: "738e0d6e3c0ce9671629554ad39abd147d2ffbac676e80b194c83f2acc0fea20",
  protocolVersion: "riichi-local-mortal-jsonl/v1", adapterVersion: LOCAL_MORTAL_ADAPTER_VERSION,
};

describe("managed local Mortal package provenance", () => {
  it("binds runtime/checkpoint/protocol/adapter identity into package validation and hash", async () => {
    const { stream, decisions } = fixtureSetup();
    const remoteReview = await runFixtureReview(stream, decisions, [entryFor(decisions[0]!)]);
    if (remoteReview.status !== "coverage_ready") throw new Error("fixture review failed");
    const engineVersion = managedLocalMortalEngineVersion(identity);
    const review = {
      ...remoteReview,
      retainedAnalyses: remoteReview.retainedAnalyses.map((retained) => ({
        ...retained,
        modelEvaluation: {
          ...retained.modelEvaluation,
          engineVersion,
          adapterVersion: LOCAL_MORTAL_ADAPTER_VERSION,
        },
      })),
    };
    const versions = {
      ...componentVersions,
      mortalSourceModel: {
        identity: "Mortal",
        version: LOCAL_MORTAL_ADAPTER_VERSION,
        modelTag: identity.checkpointModelTag,
        evidenceSource: { kind: "managed_local_runtime" as const, identity },
      },
    };
    const pkg = buildStructuredAnalysisPackage({
      review, stream, decisions, componentVersions: versions,
      frozenPolicySnapshot: review.retainedAnalyses[0]!.modelEvaluation.detailPolicy,
    });
    expect(() => validateStructuredAnalysisPackage(pkg)).not.toThrow();
    expect(JSON.stringify(pkg)).not.toMatch(/checkpointPath|stdout|stderr|traceback|[A-Z]:\\/i);

    const tampered = structuredClone(pkg);
    if (tampered.componentVersions.mortalSourceModel.evidenceSource?.kind !== "managed_local_runtime") throw new Error("missing local provenance");
    tampered.componentVersions.mortalSourceModel.evidenceSource.identity.runtimeArtifactSha256 = "b".repeat(64);
    expect(() => validateStructuredAnalysisPackage(tampered)).toThrow(/localMortal.*engineVersion/);

    const missingDeclaration = structuredClone(pkg);
    delete missingDeclaration.componentVersions.mortalSourceModel.evidenceSource;
    expect(() => validateStructuredAnalysisPackage(missingDeclaration)).toThrow(/localMortal.*evidenceSource/);

    const wrongSourceKind = structuredClone(pkg);
    wrongSourceKind.componentVersions.mortalSourceModel.evidenceSource = { kind: "remote_report" };
    expect(() => validateStructuredAnalysisPackage(wrongSourceKind)).toThrow(/localMortal.*evidenceSource/);
  });
});
