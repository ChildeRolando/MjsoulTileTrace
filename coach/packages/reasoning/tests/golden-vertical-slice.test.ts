/**
 * GOLDEN VERTICAL SLICE — the single authoritative end-to-end regression path.
 *
 * Answers: "Has the semantic spine of the currently implemented system stayed
 * intact after a large change?" Run with `npm run test:golden`.
 *
 * The chain (all offline, packaged sidecar, real repository fixture):
 *
 *   source record (Mortal regression fixture of a real game)
 *   → canonical representation (legacy bridge → CanonicalEventStream)
 *   → decision/replay state (DecisionSnapshotV2 freeze)
 *   → deterministic facts (KnownGameFacts projection)
 *   → model comparison where currently supported (StructuredComparisonSet)
 *   → factor pipeline with the packaged sidecar (ledgers + differences +
 *     deterministic preference semantics)
 *   → structured analysis artifact (StrictAnalysisPackage, validated)
 *
 * Focused layer properties stay in their own test files (canonical-replay-
 * invariance, decision-snapshot, coach-report, …). This file asserts only the
 * cross-layer identity binding and the semantic outputs of each stage; it
 * deliberately avoids byte-level snapshots of irrelevant formatting.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CurrentSceneFrameSchema,
  ResponseFuritenAnalysisV2Schema,
  StructuredComparisonSetSchema,
  canonicalActionRef,
} from "@riichi-coach/contracts";
import type { RegressionFixture } from "../src/import/mortal-report.js";
import { bridgeLegacyRegressionEvents } from "../src/import/legacy-event-stream-bridge.js";
import {
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
  analyzeRegressionFixture,
  freezeDecisionSnapshot,
  importRegressionFixture,
  legacyDiscardActionIdToAction,
  projectKnownGameFactsV2,
  runStructuredFactorPipeline,
  validateCanonicalEventStream,
  validateStrictAnalysisPackage,
} from "../src/index.js";

const fixtureUrl = new URL(
  "../../../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
  import.meta.url,
);
const resourcesUrl = new URL("../../../resources/", import.meta.url);

const GAME_ID = "fixture:c1924cad66f66dd9";
const SELF_ACTOR = 3;

describe("golden vertical slice", () => {
  it("walks the full spine with identity binding intact", async () => {
    const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as RegressionFixture;

    // 1. Source record → normalized events/decisions.
    const imported = importRegressionFixture(raw);
    expect(imported.selfActor).toBe(SELF_ACTOR);
    expect(imported.events.length).toBe(raw.mjaiLog.length);
    expect(imported.decisions.map((entry) => entry.decisionId)).toEqual([
      "east1-turn6",
      "east1-turn7",
    ]);
    const turn6 = imported.decisions.find((entry) => entry.decisionId === "east1-turn6");
    if (turn6 === undefined) throw new Error("missing east1-turn6 decision");
    expect(turn6.sceneEventId).toBe("event-50");
    expect(turn6.actualAction).toBe("discard:2p:tedashi");

    // 2. Canonical representation: the bridged stream is schema-valid and its
    //    source identity survives the mapping.
    const bridged = bridgeLegacyRegressionEvents(
      imported.events,
      imported.selfActor,
      { sourceKind: "fixture", gameId: GAME_ID },
    );
    if (bridged.status !== "ready") throw new Error(bridged.code);
    const stream = bridged.stream;
    expect(stream.gameId).toBe(GAME_ID);
    expect(stream.selfActor).toBe(SELF_ACTOR);
    expect(stream.sourceKind).toBe("fixture");
    expect(stream.sourceRecordHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(stream.events.length).toBeGreaterThan(0);
    expect(validateCanonicalEventStream(stream, { allowUnclosedStream: true }).status)
      .toBe("valid");

    // 3. Decision/replay state: the snapshot freezes the exact canonical
    //    trigger event the fixture decision refers to.
    const triggerEventRef = bridged.legacyEventRefToCanonicalEventRefs["event-50"]?.[0];
    if (triggerEventRef === undefined) throw new Error("missing canonical trigger ref");
    const snapshot = freezeDecisionSnapshot(stream, {
      kind: "self_turn",
      actor: SELF_ACTOR,
      triggerEventRef,
    });
    expect(snapshot.decisionEventRef).toBe(triggerEventRef);
    expect(snapshot.selfActor).toBe(SELF_ACTOR);
    expect(snapshot.privateState.decisionWindow.kind).toBe("self_turn");
    expect(snapshot.privateState.currentDraw?.tile.id).toBe("6s");
    expect(snapshot.publicState.riichiStates[2]?.status).toBe("accepted");

    // 4. Deterministic facts: projected from the frozen snapshot, with the
    //    fixture provenance marked and identity bound to the stream prefix.
    const facts = projectKnownGameFactsV2({
      stream,
      decisionWindow: snapshot.privateState.decisionWindow,
      cachedSnapshot: snapshot,
    });
    expect(facts.factSetId).toBe(`legacy-regression:${snapshot.streamPrefixHash}`);
    expect(facts.provenance).toBe("legacy_regression_bridge_only");
    expect(facts.actor).toBe(SELF_ACTOR);
    expect(facts.currentDraw?.tile.id).toBe("6s");
    expect(facts.selfRiichi).toBe(false);
    expect(facts.concealedTiles).toHaveLength(13);
    expect(facts.defenseThreats).toContainEqual(
      expect.objectContaining({ actor: 2, kind: "riichi_accepted" }),
    );
    expect(facts.decisionEventRef).toBe(triggerEventRef);

    // 5. Model comparison where currently supported: actual vs model actions
    //    form the comparison set for this decision window.
    const actual = legacyDiscardActionIdToAction(turn6.actualAction);
    const model = legacyDiscardActionIdToAction(turn6.modelAction);
    const actualRef = canonicalActionRef(actual);
    const modelRef = canonicalActionRef(model);
    const comparisonSet = StructuredComparisonSetSchema.parse({
      comparisonSetId: `golden:${turn6.decisionId}:${facts.factSetId}`,
      origin: "automatic_review",
      decisionLayerRef: `golden:${turn6.decisionId}:decision-layer`,
      decisionWindow: facts.decisionWindow,
      candidates: [
        { actionRef: actualRef, action: actual, origins: ["actual", "model"] },
        { actionRef: modelRef, action: model, origins: ["model"] },
      ],
    });
    const frame = CurrentSceneFrameSchema.parse({
      kind: "current_scene",
      frameId: `golden:${turn6.decisionId}:frame`,
      scope: { kind: "applied_decision" },
      sceneRef: facts.decisionEventRef,
      facts: [{ factId: facts.factSetId, provenance: "raw_replay" }],
    });
    const responseFuriten = ResponseFuritenAnalysisV2Schema.parse({
      binding: {
        source: "unavailable",
        factSetId: facts.factSetId,
        decisionEventRef: facts.decisionEventRef,
        selfActor: SELF_ACTOR,
        reason: "response_history_not_provided",
        engineIdentityStatus: "unknown",
        engineIdentity: null,
      },
      temporary: {
        status: "unknown",
        unknownReason: "response_history_not_provided",
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
      riichi: {
        status: "unknown",
        unknownReason: "response_history_not_provided",
        evidenceIds: [],
        analysisRefs: [],
        riichiAcceptanceEventRef: null,
      },
    });

    // 6. Factor pipeline through the packaged sidecar: deterministic
    //    differences exist, heuristics stay out of the preference, and the
    //    genbutsu safety of the model candidate is bound to the threat.
    const engine = new JsonlFactEngineClient(
      new ManagedFactEngineTransport(fileURLToPath(resourcesUrl)),
    );
    let pipeline;
    try {
      pipeline = await runStructuredFactorPipeline({
        frame,
        comparisonSet,
        facts,
        responseFuriten,
        engine,
      });
    } finally {
      await engine.close();
    }
    expect(pipeline.differences.deterministic.length).toBeGreaterThan(0);
    expect(pipeline.differences.heuristic.length).toBeGreaterThan(0);
    for (const entry of pipeline.differences.heuristic) {
      expect(entry.preferenceEligibility).toBe("heuristic_only");
    }
    // Both candidates are efficiency/defense tradeoffs in this real game:
    // deterministic axes conflict, so the preference is a documented null.
    expect(pipeline.deterministicPreference).toBeNull();
    const deterministicIds = new Set(
      pipeline.differences.deterministic.map((entry) => entry.differenceId),
    );
    const modelMatrix = pipeline.defenseMatrices.find((matrix) =>
      matrix.actionRef === modelRef
    );
    if (modelMatrix === undefined) throw new Error("missing model-action matrix");
    const threatCell = modelMatrix.cells.find((cell) => cell.threat.actor === 2);
    if (threatCell === undefined) throw new Error("missing actor-2 threat cell");
    expect(threatCell.deterministicSafety).toEqual({
      status: "calculated",
      genbutsu: true,
      evidenceRefs: [expect.objectContaining({ role: "threat_own_discard" })],
    });
    for (const differenceId of pipeline.deterministicPreference?.decisiveDifferenceIds ?? []) {
      expect(deterministicIds.has(differenceId)).toBe(true);
    }

    // 7. Structured analysis artifact: the M6-A packages carry the same
    //    decision identities, are schema-valid after a JSON round trip, and
    //    keep model evaluation separate from deterministic factors.
    const packages = analyzeRegressionFixture(raw);
    expect(packages.map((entry) => entry.decision.decisionId)).toEqual([
      "east1-turn6",
      "east1-turn7",
    ]);
    for (const entry of packages) {
      expect(entry.decision.modelReason).toBe("unknown");
      expect(entry.coachJudgement).toBeNull();
      expect(entry.factors.supportsModelAction.length).toBeGreaterThan(0);
      expect(entry.factors.supportsActualAction.length).toBeGreaterThan(0);
      const roundTrip = JSON.parse(JSON.stringify(entry)) as typeof entry;
      expect(() => validateStrictAnalysisPackage(roundTrip)).not.toThrow();
    }
  }, 30000);
});
