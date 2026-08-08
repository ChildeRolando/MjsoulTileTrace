import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
  buildLegacyRegressionPipelineInput,
  importRegressionFixture,
  projectCandidate,
  replayToDecision,
} from "@riichi-coach/reasoning";

const coachRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(coachRoot, "..");
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
const client = new JsonlFactEngineClient(
  new ManagedFactEngineTransport(path.join(repoRoot, ".tools")),
);
const cases = [];
try {
  for (const decision of decisions) {
    const scene = replayToDecision(events, decision, selfActor);
    const input = buildLegacyRegressionPipelineInput(
      events,
      decision,
      scene,
      { kind: "applied_decision" },
    );
    for (const candidate of input.comparisonSet.candidates) {
      const projection = projectCandidate(candidate, input.facts);
      if (projection.status !== "ready" || projection.hand13Request === undefined) {
        throw new Error(
          `candidate ${candidate.actionRef} did not produce a hand13 request`,
        );
      }
      cases.push({
        decisionId: decision.decisionId,
        actionRef: candidate.actionRef,
        request: projection.hand13Request,
        result: await client.analyzeHand13(projection.hand13Request),
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
    sourceReportId: "c1924cad66f66dd9",
    cases,
  }, null, 2)}\n`,
  "utf8",
);
console.log(outputPath);
