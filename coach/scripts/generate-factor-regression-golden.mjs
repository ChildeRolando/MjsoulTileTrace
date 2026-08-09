import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
  freezeDecisionSnapshot,
  importRegressionFixture,
  projectCandidate,
  projectKnownGameFactsV2,
  legacyDiscardActionIdToAction,
} from "@riichi-coach/reasoning";
import { canonicalActionRef } from "@riichi-coach/contracts";
import { bridgeLegacyRegressionEvents } from
  "../packages/reasoning/dist/import/legacy-event-stream-bridge.js";

const coachRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(
  coachRoot,
  "fixtures",
  "mortal",
  "c1924cad66f66dd9-east1-turn6-7.json",
);
const outputDirectory = path.join(coachRoot, "fixtures", "mahjong-facts");
const outputPath = path.join(
  outputDirectory,
  "c1924cad66f66dd9-east1-turn6-7.json",
);

const raw = JSON.parse(await readFile(sourcePath, "utf8"));
const { selfActor, events, decisions } = importRegressionFixture(raw);
const bridged = bridgeLegacyRegressionEvents(events, selfActor, {
  sourceKind: "fixture",
  gameId: "fixture:c1924cad66f66dd9",
});
if (bridged.status !== "ready") throw new Error(bridged.code);
const client = new JsonlFactEngineClient(
  new ManagedFactEngineTransport(path.join(coachRoot, "resources")),
);
const cases = [];
try {
  for (const decision of decisions) {
    const triggerEventRef = bridged
      .legacyEventRefToCanonicalEventRefs[decision.sceneEventId]?.[0];
    if (triggerEventRef === undefined) throw new Error("decision ref missing");
    const snapshot = freezeDecisionSnapshot(bridged.stream, {
      kind: "self_turn",
      actor: selfActor,
      triggerEventRef,
    });
    const facts = projectKnownGameFactsV2({
      stream: bridged.stream,
      decisionWindow: snapshot.privateState.decisionWindow,
      cachedSnapshot: snapshot,
    });
    const actions = [decision.actualAction, decision.modelAction]
      .map(legacyDiscardActionIdToAction);
    const candidates = [...new Map(actions.map((action) => {
      const actionRef = canonicalActionRef(action);
      return [actionRef, { actionRef, action, origins: ["model"] }];
    })).values()];
    for (const candidate of candidates) {
      const projection = projectCandidate(candidate, facts);
      if (
        projection.status !== "ready" ||
        projection.hand13Request === undefined ||
        projection.handStructureRequest === undefined
      ) {
        throw new Error(
          `candidate ${candidate.actionRef} did not produce both hand requests`,
        );
      }
      cases.push({
        decisionId: decision.decisionId,
        actionRef: candidate.actionRef,
        request: projection.hand13Request,
        result: await client.analyzeHand13(projection.hand13Request),
        handStructureRequest: projection.handStructureRequest,
        handStructureResult: await client.analyzeHandStructure(
          projection.handStructureRequest,
        ),
      });
    }
  }
} finally {
  await client.close();
}

cases.sort((left, right) =>
  `${left.decisionId}:${left.actionRef}`.localeCompare(
    `${right.decisionId}:${right.actionRef}`,
  )
);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({
    generatedBy: "pinned mahjong-facts sidecar",
    generatedProtocol: "hand-structure/v2",
    sourceReportId: "c1924cad66f66dd9",
    cases,
  }, null, 2)}\n`,
  "utf8",
);
console.log(outputPath);
