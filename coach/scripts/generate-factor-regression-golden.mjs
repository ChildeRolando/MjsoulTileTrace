import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JsonlFactEngineClient,
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
const repoRoot = path.resolve(coachRoot, "..");
const buildArtifact = path.join(
  repoRoot,
  ".tools",
  "mahjong-facts",
  "windows-x64",
  "mahjong-facts.exe",
);

class BuildArtifactFactEngineTransport {
  async request(line, timeoutMs) {
    if (line.includes("\n") || line.includes("\r")) {
      throw new Error("fact engine request must be one JSONL line");
    }
    return await new Promise((resolve, reject) => {
      const child = spawn(buildArtifact, [], {
        stdio: "pipe",
        windowsHide: true,
      });
      let stdout = "";
      let settled = false;
      const finish = (operation) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        operation();
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(() => reject(new Error("build artifact fact engine timed out")));
      }, timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.on("error", () => {
        finish(() => reject(new Error("build artifact fact engine failed")));
      });
      child.on("close", (code) => {
        const lines = stdout.trim().split(/\r?\n/u).filter(Boolean);
        if (code !== 0 || lines.length !== 1) {
          finish(() => reject(new Error("build artifact fact engine failed")));
          return;
        }
        finish(() => resolve(lines[0]));
      });
      child.stdin.end(`${line}\n`, "utf8");
    });
  }

  async restart() {}

  async close() {}
}
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
  new BuildArtifactFactEngineTransport(),
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
      const threatRisk = [];
      for (const projected of projection.threatRiskProjections) {
        if (projected.status !== "ready") continue;
        threatRisk.push({
          threatActor: projected.threatActor,
          request: projected.request,
          result: await client.analyzeThreatRisk(projected.request),
        });
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
        threatRisk,
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
