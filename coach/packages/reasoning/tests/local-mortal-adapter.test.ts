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
import {
  buildMortalModelEvaluation,
  entryMatchesDecisionIdentity,
  localMortalResponseToReportEntry,
  projectLocalMortalRequest,
  replayCanonicalResponseWindows,
  replayCanonicalStream,
} from "../src/index.js";

const identity: ManagedMortalRuntimeIdentity = {
  runtimeImplementation: "Equim-chan/Mortal", runtimeRevision: "0cff2b52982be5b1163aa9a62fb01f03ce91e0d2",
  runtimeVersion: "Mortal V4", runtimeArtifactSha256: "0".repeat(64),
  checkpointRepository: "Yuchen1457/mortal-582500", checkpointRevision: "7386c9f5c751a3ea75efea99737cef5a5ef950f1",
  checkpointModelTag: "mortal-hpc@582500", checkpointFileSha256: "738e0d6e3c0ce9671629554ad39abd147d2ffbac676e80b194c83f2acc0fea20",
  protocolVersion: LOCAL_MORTAL_PROTOCOL_VERSION, adapterVersion: LOCAL_MORTAL_ADAPTER_VERSION,
};

async function realFixture(actor: number) {
  const manifest = JSON.parse(await readFile(new URL("./fixtures/local-mortal/fixture-manifest.json", import.meta.url), "utf8"));
  const fixture = JSON.parse(await readFile(new URL(`./fixtures/local-mortal/${manifest.source}`, import.meta.url), "utf8"));
  const bundle = await loadMahjongSoulProtocolBundle(fileURLToPath(new URL("../../../vendor/mahjong-soul-protocol/", import.meta.url)));
  const bytes = unwrapGameDetailRecords(bundle, Buffer.from(fixture.wire, "hex"));
  const mapped = mapMahjongSoulRecord({ gameId: `majsoul:local-mortal:actor${actor}`, selfActor: actor, recordId: fixture.recordId, recordBytes: bytes, bundle });
  if (mapped.status !== "ready") throw new Error(mapped.code);
  return mapped.stream;
}

describe("local Mortal canonical projection and conservation", () => {
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
});
