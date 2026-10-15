import { describe, expect, it } from "vitest";
import { QuestionLabConfigSchema } from "@riichi-coach/contracts";
import { createLabWorker } from "../src/runtime.js";
import {
  createBoard,
  resolveScene,
  constructionRequest,
} from "../src/construct.js";
import {
  canonicalFromConstruction,
  pendingDecision,
  matchesScene,
  candidateFacts,
  featureVector,
} from "../src/projection.js";
import {
  createLibriichiRuleProjector,
  bindLibriichiRuleResult,
  projectLocalMortalRuleScoring,
  bindLocalMortalRuleScores,
} from "@riichi-coach/reasoning";
import { LabBatch, readSamples, sampleValidationStats } from "../src/batch.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe.skipIf(process.env.COACH_QUESTION_LAB_NATIVE !== "1")(
  "real pinned native and Mortal research path",
  () => {
    it("constructs three simultaneous opponent riichis without over-allocating tiles", async () => {
      const w = await createLabWorker();
      try {
        const c = QuestionLabConfigSchema.parse({
          schemaVersion: "question-lab-config/v1",
          seed: 11,
          scene: {
            selfActor: { fixed: 0 },
            round: { fixed: 0 },
            turn: { fixed: 5 },
            players: [1, 2, 3].map((actor) => ({
              actor,
              riichi: { fixed: true },
            })),
          },
        });
        const scene = resolveScene(c.scene, 11),
          spec = createBoard(scene, 11),
          r = await w.constructor.construct(
            constructionRequest(scene, spec, w.constructor.identity, 11, 256),
          );
        expect(r.status).toBe("ok");
        if (r.status !== "ok") throw new Error("construction failed");
        const d = pendingDecision(canonicalFromConstruction(r.events, 0));
        expect(matchesScene(scene, d, r.events)).toBe(true);
        expect(d.facts.defenseThreats).toHaveLength(3);
      } finally {
        await w.close();
      }
    }, 60000);
    for (const kind of [
      "chi",
      "pon",
      "daiminkan",
      "ankan",
      "kakan",
      "riichi",
    ] as const)
      it(`constructs and replays ${kind} with no actual action`, async () => {
        const w = await createLabWorker();
        try {
          const tiles =
            kind === "chi"
              ? ["1m", "2m", "3m"]
              : Array(kind === "pon" ? 3 : 4).fill("P");
          const config = QuestionLabConfigSchema.parse({
            schemaVersion: "question-lab-config/v1",
            seed: 16,
            scene: {
              selfActor: { fixed: 0 },
              round: { fixed: 0 },
              turn: { fixed: 8 },
              players: [
                kind === "riichi"
                  ? { actor: 1, riichi: { fixed: true } }
                  : {
                      actor: 1,
                      melds: {
                        fixed: [
                          {
                            kind,
                            tiles,
                            ...(kind === "ankan" ? {} : { target: 0 }),
                          },
                        ],
                      },
                    },
              ],
            },
          });
          let found = false;
          for (let i = 0; i < 15 && !found; i++) {
            const scene = resolveScene(config.scene, i + 100),
              spec = createBoard(scene, i + 100);
            const result = await w.constructor.construct(
              constructionRequest(scene, spec, w.constructor.identity, i, 256),
            );
            if (result.status !== "ok") continue;
            const stream = canonicalFromConstruction(result.events, 0),
              d = pendingDecision(stream);
            if (!matchesScene(scene, d, result.events)) continue;
            const q = createLibriichiRuleProjector(
                stream,
                w.mortal.ruleIdentity,
              )(d),
              r = await w.mortal.queryRules(q);
            expect(r.status).toBe("ok");
            expect(d.actualAction).toBeNull();
            found = true;
          }
          expect(
            found,
            `${kind} must be reached, not reported as a skipped case`,
          ).toBe(true);
        } finally {
          await w.close();
        }
      }, 60000);
    it("scores the complete native set with real weights at a pending decision", async () => {
      const w = await createLabWorker();
      try {
        const config = QuestionLabConfigSchema.parse({
            schemaVersion: "question-lab-config/v1",
            seed: 1,
            scene: { turn: { fixed: 2 } },
          }),
          s = resolveScene(config.scene, 2),
          b = createBoard(s, 2);
        const r = await w.constructor.construct(
          constructionRequest(s, b, w.constructor.identity, 2, 256),
        );
        expect(r.status).toBe("ok");
        if (r.status !== "ok") throw new Error("construction failed");
        const stream = canonicalFromConstruction(r.events, s.selfActor),
          d = pendingDecision(stream),
          q = createLibriichiRuleProjector(stream, w.mortal.ruleIdentity)(d),
          rules = await w.mortal.queryRules(q);
        if (rules.status !== "ok") throw new Error("rules failed");
        const actions = bindLibriichiRuleResult({
          request: q,
          response: rules,
          decision: d,
        }).actions;
        const request = projectLocalMortalRuleScoring({
            stream,
            decision: d,
            identity: w.mortal.identity,
            ruleRequest: q,
            ruleResult: rules,
          }),
          response = await w.mortal.scoreRules(request),
          scores = bindLocalMortalRuleScores({
            request,
            response,
            decision: d,
          });
        expect(scores.actions).toHaveLength(actions.length);
        expect(scores.preferred.qValue).toBe(
          Math.max(...scores.actions.map((a) => a.qValue)),
        );
      } finally {
        await w.close();
      }
    }, 60000);
    for (const kind of ["chi", "pon", "daiminkan", "ankan", "kakan"] as const)
      it(`reaches a fixed final self hand with ${kind}`, async () => {
        const w = await createLabWorker();
        try {
          const hand = [
              "2p",
              "3p",
              "4p",
              "6p",
              "7p",
              "8p",
              "2s",
              "3s",
              "4s",
              "N",
            ],
            tiles =
              kind === "chi"
                ? ["1m", "2m", "3m"]
                : Array(kind === "pon" ? 3 : 4).fill("P");
          const config = QuestionLabConfigSchema.parse({
            schemaVersion: "question-lab-config/v1",
            seed: 16,
            scene: {
              selfActor: { fixed: 1 },
              round: { fixed: 0 },
              turn: { fixed: 6 },
              hand: { fixed: hand },
              players: [
                {
                  actor: 1,
                  melds: {
                    fixed: [
                      {
                        kind,
                        tiles,
                        ...(kind === "ankan" ? {} : { target: 0 }),
                      },
                    ],
                  },
                },
              ],
            },
          });
          let found = false;
          for (let i = 0; i < 10 && !found; i++) {
            const scene = resolveScene(config.scene, i + 100),
              spec = createBoard(scene, i + 100),
              r = await w.constructor.construct(
                constructionRequest(
                  scene,
                  spec,
                  w.constructor.identity,
                  i,
                  256,
                ),
              );
            if (r.status !== "ok") continue;
            const d = pendingDecision(canonicalFromConstruction(r.events, 1));
            found = matchesScene(scene, d, r.events);
          }
          expect(found, `${kind}: final hand must actually match`).toBe(true);
        } finally {
          await w.close();
        }
      }, 60000);
    it("scores a rule-forced singleton with real Mortal rather than inventing a label", async () => {
      const directory = await mkdtemp(join(tmpdir(), "coach-lab-forced-"));
      const config = QuestionLabConfigSchema.parse({
        schemaVersion: "question-lab-config/v1",
        seed: 11,
        scene: {
          selfActor: { fixed: 0 },
          round: { fixed: 0 },
          turn: { fixed: 5 },
          players: [{ actor: 0, riichi: { fixed: true } }],
        },
        budget: { count: 1, maxAttempts: 20, refinementRounds: 0 },
      });
      const batch = await LabBatch.open(config, directory);
      try {
        const samples = await batch.generate();
        expect(samples).toHaveLength(1);
        expect(samples[0]!.candidates).toHaveLength(1);
        const labels = await batch.label();
        const label = labels.get(samples[0]!.sampleId)!;
        expect(label.request.operation).toBe("score_research_actions");
        expect(label.scores).toHaveLength(1);
        expect(Number.isFinite(label.scores[0]!.qValue)).toBe(true);
        expect(label.sensitive).toBe(false);
      } finally {
        await batch.close();
        await rm(directory, { recursive: true, force: true });
      }
    }, 60000);
    it("resumes an interrupted batch without repeating completed real inference", async () => {
      const directory = await mkdtemp(join(tmpdir(), "lab-resume-")),
        continuous = await mkdtemp(join(tmpdir(), "lab-continuous-"));
      const config = QuestionLabConfigSchema.parse({
        schemaVersion: "question-lab-config/v1",
        seed: 938,
        scene: { turn: { fixed: 2 } },
        budget: { count: 4, maxAttempts: 12, refinementRounds: 0 },
      });
      try {
        const first = await LabBatch.open(config, directory);
        let accepted = 0;
        try {
          await expect(
            first.generate(0, () => {
              if (++accepted === 3) throw new Error("simulated_interruption");
              return true;
            }),
          ).rejects.toThrow("simulated_interruption");
          await first.label();
        } finally {
          await first.close();
        }
        const second = await LabBatch.open(config, directory);
        let calls = 0;
        for (const worker of second.workers) {
          const original = worker.mortal.scoreRules.bind(worker.mortal);
          worker.mortal.scoreRules = async (request) => {
            calls++;
            return original(request);
          };
        }
        let resumedIds: string[] = [];
        try {
          const existing = await readSamples(second.archive);
          const validations = sampleValidationStats(second.archive).validations;
          await readSamples(second.archive);
          expect(sampleValidationStats(second.archive).validations).toBe(
            validations,
          );
          expect(sampleValidationStats(second.archive).hits).toBeGreaterThan(0);
          const originalSample = existing[0]!,
            changedSample = structuredClone(originalSample);
          changedSample.features.turn! += 1;
          await second.archive.write(
            `samples/${originalSample.sampleId}.json`,
            changedSample,
          );
          await expect(readSamples(second.archive)).rejects.toThrow(
            "sample_identity_mismatch",
          );
          await second.archive.write(
            `samples/${originalSample.sampleId}.json`,
            originalSample,
          );
          expect(existing).toHaveLength(2);
          const saved = await Promise.all(
            existing.map((s) =>
              readFile(
                second.archive.path(`labels/${s.sampleId}.json`),
                "utf8",
              ),
            ),
          );
          await second.generate();
          await second.label();
          expect(calls).toBe(2);
          for (let i = 0; i < existing.length; i++)
            expect(
              await readFile(
                second.archive.path(`labels/${existing[i]!.sampleId}.json`),
                "utf8",
              ),
            ).toBe(saved[i]);
          resumedIds = (await readSamples(second.archive)).map(
            (s) => s.sampleId,
          );
        } finally {
          await second.close();
        }
        const uninterrupted = await LabBatch.open(config, continuous);
        try {
          expect(
            (await uninterrupted.generate()).map((s) => s.sampleId),
          ).toEqual(resumedIds);
        } finally {
          await uninterrupted.close();
        }
      } finally {
        await Promise.all([
          rm(directory, { recursive: true, force: true }),
          rm(continuous, { recursive: true, force: true }),
        ]);
      }
    }, 60000);
    it("hidden stock and hands do not change the question, features or scoring request", async () => {
      const w = await createLabWorker();
      try {
        const config = QuestionLabConfigSchema.parse({
            schemaVersion: "question-lab-config/v1",
            seed: 9,
            scene: {
              selfActor: { fixed: 0 },
              round: { fixed: 0 },
              turn: { fixed: 2 },
            },
          }),
          scene = resolveScene(config.scene, 9),
          base = createBoard(scene, 9),
          changed = structuredClone(base);
        [changed.yama[60], changed.yama[61]] = [
          changed.yama[61]!,
          changed.yama[60]!,
        ];
        [changed.haipai[1], changed.haipai[2]] = [
          changed.haipai[2]!,
          changed.haipai[1]!,
        ];
        const requests = [];
        const questions = [],
          features = [];
        for (const spec of [base, changed]) {
          const r = await w.constructor.construct(
            constructionRequest(scene, spec, w.constructor.identity, 9, 256),
          );
          if (r.status !== "ok") throw new Error("construction failed");
          const stream = canonicalFromConstruction(r.events, 0),
            d = pendingDecision(stream);
          const request = createLibriichiRuleProjector(
            stream,
            w.mortal.ruleIdentity,
          )(d);
          requests.push(request);
          questions.push(stream);
          const response = await w.mortal.queryRules(request);
          if (response.status !== "ok") throw new Error("rules failed");
          const actions = bindLibriichiRuleResult({
            request,
            response,
            decision: d,
          }).actions;
          features.push(
            featureVector(d, await candidateFacts(d, actions, w.engine)),
          );
        }
        expect(requests[0]).toEqual(requests[1]);
        expect(questions[0]).toEqual(questions[1]);
        expect(features[0]).toEqual(features[1]);
      } finally {
        await w.close();
      }
    }, 60000);
  },
);
