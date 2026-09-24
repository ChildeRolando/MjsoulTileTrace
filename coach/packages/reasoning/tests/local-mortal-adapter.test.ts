import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LOCAL_MORTAL_ADAPTER_VERSION,
  LOCAL_MORTAL_PROTOCOL_VERSION,
  LocalMortalInferenceSuccessSchema,
  canonicalActionRef,
  type ManagedMortalRuntimeIdentity,
} from "@riichi-coach/contracts";
import {
  loadMahjongSoulProtocolBundle,
  mapMahjongSoulRecord,
  unwrapGameDetailRecords,
} from "@riichi-coach/mahjong-soul-source";
import { mapTenhouRecord } from "@riichi-coach/tenhou-source";
import {
  buildMortalModelEvaluation,
  entryMatchesDecisionIdentity,
  enumerateResponseCandidates,
  localMortalResponseToReportEntry,
  projectLocalMortalRequest,
  replayCanonicalResponseWindows,
  replayCanonicalStream,
} from "../src/index.js";

const identity: ManagedMortalRuntimeIdentity = {
  runtimeImplementation: "Equim-chan/Mortal", runtimeRevision: "0cff2b52982be5b1163aa9a62fb01f03ce91e0d2",
  runtimeVersion: "Mortal V4", runtimeArtifactSha256: "0".repeat(64),
  runtimeModelSha256: "1".repeat(64), runtimeEngineSha256: "2".repeat(64),
  nativeArtifactSha256: "3".repeat(64),
  checkpointRepository: "Yuchen1457/mortal-582500", checkpointRevision: "7386c9f5c751a3ea75efea99737cef5a5ef950f1",
  checkpointModelTag: "mortal-hpc@582500", checkpointFileSha256: "738e0d6e3c0ce9671629554ad39abd147d2ffbac676e80b194c83f2acc0fea20",
  protocolVersion: LOCAL_MORTAL_PROTOCOL_VERSION, adapterVersion: LOCAL_MORTAL_ADAPTER_VERSION,
};

async function realFixture(actor: number) {
  const manifest = JSON.parse(await readFile(new URL("./fixtures/local-mortal/fixture-manifest.json", import.meta.url), "utf8"));
  const source = manifest.fixtures.find((fixture: { sourceKind: string }) => fixture.sourceKind === "mahjong_soul");
  const fixture = JSON.parse(await readFile(new URL(`./fixtures/local-mortal/${source.source}`, import.meta.url), "utf8"));
  const bundle = await loadMahjongSoulProtocolBundle(fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url)));
  const bytes = unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex"));
  const mapped = mapMahjongSoulRecord({ gameId: `majsoul:local-mortal:actor${actor}`, selfActor: actor, recordId: fixture.recordId, recordBytes: bytes, bundle });
  if (mapped.status !== "ready") throw new Error(mapped.code);
  return mapped.stream;
}

async function realTenhouFixture(sourceId: string, actor: number) {
  const manifest = JSON.parse(await readFile(new URL("./fixtures/local-mortal/fixture-manifest.json", import.meta.url), "utf8"));
  const source = manifest.fixtures.find((fixture: { id: string }) => fixture.id === sourceId);
  const raw = await readFile(new URL(`./fixtures/local-mortal/${source.source}`, import.meta.url), "utf8");
  expect(createHash("sha256").update(raw).digest("hex")).toBe(source.sha256);
  const mapped = mapTenhouRecord({ raw, gameId: `tenhou:local-mortal:actor${actor}`, selfActor: actor });
  if (mapped.status !== "ready") throw new Error(mapped.code);
  return mapped.stream;
}

describe("local Mortal canonical projection and conservation", () => {
  it("keeps a real chankan window in the registered supplemental fixture", async () => {
    const stream = await realTenhouFixture("tenhou-chankan-supplement", 1);
    const chankan = replayCanonicalResponseWindows(stream).find((decision) =>
      decision.snapshot.privateState.decisionWindow.kind === "kan_response"
      && decision.actualAction?.kind === "ron"
    );
    expect(chankan).toBeDefined();
    const request = projectLocalMortalRequest({
      stream,
      decision: chankan!,
      surface: "response",
      identity,
      includeRon: true,
    });
    expect(request.candidates.map((candidate) => candidate.runtimeAction.index)).toEqual([43, 45]);
    expect(request.actualActionRef).toBe(canonicalActionRef(chankan!.actualAction!));
    expect(replayCanonicalResponseWindows(stream).some((decision) =>
      decision.actualAction?.kind === "pass" && enumerateResponseCandidates(decision)?.ron === true
    )).toBe(true);
  });

  it("keeps a real daiminkan actual window in the registered supplemental fixture", async () => {
    const stream = await realTenhouFixture("tenhou-daiminkan-supplement", 1);
    const daiminkan = replayCanonicalResponseWindows(stream).find((decision) =>
      decision.actualAction?.kind === "daiminkan"
    );
    expect(daiminkan).toBeDefined();
    const request = projectLocalMortalRequest({
      stream,
      decision: daiminkan!,
      surface: "response",
      identity,
    });
    expect(request.candidates.map((candidate) => candidate.runtimeAction.index)).toEqual(expect.arrayContaining([42, 45]));
    expect(request.actualActionRef).toBe(canonicalActionRef(daiminkan!.actualAction!));
  });

  it("realizes chi candidates from the frozen hand with Mortal's red-five rule", async () => {
    const onlyRedStream = await realFixture(0);
    const onlyRedDecision = replayCanonicalResponseWindows(onlyRedStream)
      .find((row) => row.decisionEventRef.endsWith("/2/374/0"));
    expect(onlyRedDecision?.actualAction?.kind).toBe("pass");
    const onlyRedRequest = projectLocalMortalRequest({
      stream: onlyRedStream,
      decision: onlyRedDecision!,
      surface: "response",
      identity,
    });
    const onlyRedChi = onlyRedRequest.candidates
      .map((candidate) => JSON.parse(candidate.mjaiActionJson))
      .find((action) => action.type === "chi" && action.consumed.includes("3s") && action.consumed.some((tile: string) => tile.startsWith("5s")));
    expect(onlyRedChi.consumed).toEqual(["3s", "5sr"]);
    expect(onlyRedRequest.actualActionRef).toBe(canonicalActionRef(onlyRedDecision!.actualAction!));

    const mixedStream = await realFixture(3);
    const mixedDecision = replayCanonicalResponseWindows(mixedStream)
      .find((row) => row.decisionEventRef.endsWith("/0/83/0"));
    expect(mixedDecision?.actualAction?.kind).toBe("pass");
    const mixedRequest = projectLocalMortalRequest({
      stream: mixedStream,
      decision: mixedDecision!,
      surface: "response",
      identity,
    });
    const mixedChi = mixedRequest.candidates
      .map((candidate) => JSON.parse(candidate.mjaiActionJson))
      .find((action) => action.type === "chi" && action.consumed.includes("3s") && action.consumed.some((tile: string) => tile.startsWith("5s")));
    expect(mixedChi.consumed).toEqual(["3s", "5sr"]);

    const actualChiDecision = replayCanonicalResponseWindows(mixedStream)
      .find((row) => row.decisionEventRef.endsWith("/4/833/0"));
    expect(actualChiDecision?.actualAction?.kind).toBe("chi");
    const actualChiRequest = projectLocalMortalRequest({
      stream: mixedStream,
      decision: actualChiDecision!,
      surface: "response",
      identity,
    });
    expect(actualChiRequest.candidates.filter((candidate) =>
      candidate.actionRef === canonicalActionRef(actualChiDecision!.actualAction!)
    )).toHaveLength(1);
  }, 15_000);

  it("projects a real response window with a strict candidate bijection and actual correspondence", async () => {
    const stream = await realFixture(0);
    const decision = replayCanonicalResponseWindows(stream).find((row) => {
      const request = projectLocalMortalRequest({ stream, decision: row, surface: "response", identity });
      return request.candidates.some((candidate) => candidate.runtimeAction.index === 42);
    });
    expect(decision).toBeDefined();
    const factsBefore = JSON.stringify(decision!.facts);
    const request = projectLocalMortalRequest({ stream, decision: decision!, surface: "response", identity });
    const keys = request.candidates.map((candidate) => JSON.stringify(candidate.runtimeAction));
    expect(new Set(keys).size).toBe(keys.length);
    expect(request.candidates.map((candidate) => candidate.runtimeAction.index)).toEqual(expect.arrayContaining([42, 45]));
    expect(request.candidates.some((candidate) => candidate.actionRef === canonicalActionRef(decision!.actualAction!))).toBe(true);

    const response = LocalMortalInferenceSuccessSchema.parse({
      protocolVersion: request.protocolVersion, requestId: request.requestId, identity,
      decision: request.decision, status: "ok",
      candidates: request.candidates.map((candidate, index) => ({ runtimeAction: candidate.runtimeAction, qValue: index / 10 })),
      preferredRuntimeAction: request.candidates.at(-1)!.runtimeAction,
    });
    const entry = localMortalResponseToReportEntry({ request, response, decision: decision! });
    expect(entryMatchesDecisionIdentity(entry, decision!)).toBe(true);
    expect(entryMatchesDecisionIdentity({
      ...entry,
      localDecisionIdentity: { ...entry.localDecisionIdentity!, decisionId: "another-decision" },
    }, decision!)).toBe(false);
    expect(JSON.stringify(decision!.facts)).toBe(factsBefore);

    const evaluation = buildMortalModelEvaluation({
      evaluationId: "local-eval", comparisonSetId: "local-comparison", decisionLayerRef: decision!.decisionEventRef,
      engineVersion: "runtime", adapterVersion: LOCAL_MORTAL_ADAPTER_VERSION,
      actualActionRef: canonicalActionRef(decision!.actualAction!),
      detailPolicy: { threshold: 10, unit: "model_selection_score_points", boundary: "greater_than_or_equal_is_detailed", policyVersion: "mortal-review/v1", frozenAt: "2026-09-24T00:00:00.000Z" },
      candidates: request.candidates.map((candidate, index) => ({ actionRef: candidate.actionRef, probability: index === request.candidates.length - 1 ? 0.6 : 0.4 / (request.candidates.length - 1), qValue: index / 10 })),
    });
    expect(evaluation.status).toBe("ready");
    if (evaluation.status === "ready") expect(evaluation.evaluation.modelReason).toBe("unknown");
    expect(JSON.stringify(decision!.facts)).toBe(factsBefore);
  });

  it("projects real self-turn decision identity without source protobuf/account payload", async () => {
    const stream = await realFixture(2);
    const decision = replayCanonicalStream(stream).find((row) => row.actualAction?.kind === "ankan");
    expect(decision).toBeDefined();
    const request = projectLocalMortalRequest({ stream, decision: decision!, surface: "self", identity });
    expect(request.recordId).toBe(stream.gameId);
    expect(request.candidates.some((candidate) => candidate.runtimeAction.index === 42)).toBe(true);
    expect(JSON.stringify(request)).not.toMatch(/protobuf|account|token|cookie|recordUrl/i);
  });

  it("fails closed at the reasoning seam on cross-decision, missing, duplicate, and non-argmax responses", async () => {
    const stream = await realFixture(0);
    const decision = replayCanonicalStream(stream).find((row) => {
      try {
        return projectLocalMortalRequest({ stream, decision: row, surface: "self", identity }).candidates.length > 2;
      } catch {
        return false;
      }
    });
    expect(decision).toBeDefined();
    const request = projectLocalMortalRequest({ stream, decision: decision!, surface: "self", identity });
    const response = LocalMortalInferenceSuccessSchema.parse({
      protocolVersion: request.protocolVersion,
      requestId: request.requestId,
      identity,
      decision: request.decision,
      status: "ok",
      candidates: request.candidates.map((candidate, index) => ({
        runtimeAction: candidate.runtimeAction,
        qValue: index,
      })),
      preferredRuntimeAction: request.candidates.at(-1)!.runtimeAction,
    });

    const crossDecision = structuredClone(response);
    crossDecision.requestId = "another-request";
    expect(() => localMortalResponseToReportEntry({ request, response: crossDecision, decision: decision! }))
      .toThrow("mortal_protocol_invalid");

    const missing = structuredClone(response);
    missing.candidates.pop();
    expect(() => localMortalResponseToReportEntry({ request, response: missing, decision: decision! }))
      .toThrow("mortal_candidate_mismatch");

    const duplicate = structuredClone(response);
    duplicate.candidates[0] = duplicate.candidates[1]!;
    expect(() => localMortalResponseToReportEntry({ request, response: duplicate, decision: decision! }))
      .toThrow("mortal_candidate_mismatch");

    const nonArgmax = structuredClone(response);
    nonArgmax.preferredRuntimeAction = request.candidates[0]!.runtimeAction;
    expect(() => localMortalResponseToReportEntry({ request, response: nonArgmax, decision: decision! }))
      .toThrow("mortal_candidate_mismatch");
  });
});
