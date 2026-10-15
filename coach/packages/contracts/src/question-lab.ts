import { z } from "zod";
import { CanonicalEventStreamSchema } from "./event-stream.js";
import {
  LibriichiRuleRequestSchema,
  LibriichiRuleSuccessSchema,
  LibriichiRuleIdentitySchema,
} from "./libriichi-rules.js";
import {
  LocalMortalScoringRequestSchema,
  LocalMortalScoringSuccessSchema,
} from "./local-mortal-scoring.js";
import { EngineIdentitySchema, Hand13FactResultSchema } from "./fact-engine.js";
import { RiichiActionSchema } from "./actions.js";

export const LAB_VERSION = "question-lab/v1" as const;
const Sha = z.string().regex(/^[a-f0-9]{64}$/);
export const LabTileSchema = z
  .string()
  .regex(/^(?:[1-9][mps]|5[mps]r|[ESWNPFC])$/);
const Hand = z.array(LabTileSchema).max(14);
const Actor = z.number().int().min(0).max(3);
export function labChoice<T extends z.ZodTypeAny>(value: T) {
  return z.union([
    z.object({ fixed: value }).strict(),
    z
      .object({
        oneOf: z.array(value).min(1).max(256),
        weights: z.array(z.number().finite().positive()).min(1).optional(),
      })
      .strict()
      .superRefine((v, c) => {
        if (v.weights && v.weights.length !== v.oneOf.length)
          c.addIssue({ code: "custom", message: "weights must match oneOf" });
      }),
  ]);
}
function numericChoice(min: number, max: number) {
  const value = z.number().int().min(min).max(max);
  return z.union([
    labChoice(value),
    z
      .object({
        range: z.tuple([value, value]),
        step: z.number().int().positive().default(1),
      })
      .strict()
      .superRefine((v, c) => {
        if (v.range[0] > v.range[1])
          c.addIssue({ code: "custom", message: "reversed range" });
      }),
  ]);
}
export const LAB_FEATURES = [
  "turn",
  "remainingDraws",
  "selfRiichi",
  "dealer",
  "round",
  "honba",
  "riichiSticks",
  "score",
  "scoreGap",
  "threats",
  "meldCount",
  "doraIndicators",
  "shantenMin",
  "shantenMax",
  "ukeireMax",
  "ukeireMin",
  "doraMax",
  "doraMin",
  "candidateCount",
  "discardCount",
  "valueEstimateMax",
  "valueEstimateKnown",
  "shapeSequenceCount",
  "shapePairCount",
  "genbutsuCount",
] as const;
export const LAB_PREDICATE_FIELDS = [
  ...LAB_FEATURES,
  "candidate.shanten",
  "candidate.ukeire",
  "candidate.dora",
  "candidate.valueEstimate",
  "candidate.genbutsu",
  "candidate.tile34",
  "candidate.kind",
  "candidate.red",
] as const;
export type LabCondition =
  | { all: LabCondition[] }
  | { any: LabCondition[] }
  | { not: LabCondition }
  | {
      field: (typeof LAB_PREDICATE_FIELDS)[number];
      op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in";
      value: number | string | boolean | (number | string | boolean)[];
    };
const Scalar = z.union([z.number().finite(), z.string().max(80), z.boolean()]);
export const LabConditionSchema: z.ZodType<LabCondition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(LabConditionSchema).min(1).max(64) }).strict(),
    z.object({ any: z.array(LabConditionSchema).min(1).max(64) }).strict(),
    z.object({ not: LabConditionSchema }).strict(),
    z
      .object({
        field: z.enum(LAB_PREDICATE_FIELDS),
        op: z.enum(["eq", "ne", "lt", "lte", "gt", "gte", "in"]),
        value: z.union([Scalar, z.array(Scalar).min(1).max(256)]),
      })
      .strict()
      .superRefine((v, c) => {
        const kind =
          v.field === "candidate.kind"
            ? "string"
            : v.field === "candidate.red"
              ? "boolean"
              : "number";
        if (
          (Array.isArray(v.value) ? v.value : [v.value]).some(
            (value) => typeof value !== kind,
          )
        )
          c.addIssue({
            code: "custom",
            message: "predicate field type mismatch",
          });
        if (
          (v.op === "in" && !Array.isArray(v.value)) ||
          (v.op !== "in" && Array.isArray(v.value))
        )
          c.addIssue({
            code: "custom",
            message: "predicate operand shape mismatch",
          });
        if (
          ["lt", "lte", "gt", "gte"].includes(v.op) &&
          typeof v.value !== "number"
        )
          c.addIssue({
            code: "custom",
            message: "ordered predicate requires number",
          });
      }),
  ]),
);
const Hypothesis = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    name: z.string().min(1).max(120),
    when: LabConditionSchema.optional(),
    recommend: z
      .object({
        metric: z.enum([
          "shanten",
          "ukeire",
          "dora",
          "valueEstimate",
          "genbutsu",
        ]),
        direction: z.enum(["min", "max"]),
        within: LabConditionSchema.optional(),
        tieBreak: z
          .enum(["shanten", "ukeire", "dora", "valueEstimate", "genbutsu"])
          .optional(),
      })
      .strict(),
    explain: z.array(z.enum(LAB_FEATURES)).min(1).max(LAB_FEATURES.length),
  })
  .strict();
const Defaults: z.infer<typeof Hypothesis>[] = [
  {
    id: "shanten",
    name: "优先降低向听",
    recommend: { metric: "shanten", direction: "min" },
    explain: ["shantenMin", "ukeireMax", "turn"],
  },
  {
    id: "ukeire",
    name: "同向听优先有效牌",
    recommend: { metric: "shanten", direction: "min", tieBreak: "ukeire" },
    explain: ["ukeireMax", "doraMax", "turn"],
  },
  {
    id: "dora",
    name: "优先保留宝牌",
    recommend: { metric: "dora", direction: "max" },
    explain: ["doraMax", "shantenMin", "ukeireMax"],
  },
];
export const LabActionSchema = z
  .object({
    type: z.enum([
      "dahai",
      "reach",
      "chi",
      "pon",
      "daiminkan",
      "ankan",
      "kakan",
      "none",
    ]),
    actor: Actor,
    pai: LabTileSchema.optional(),
    target: Actor.optional(),
    consumed: z.array(LabTileSchema).min(2).max(4).optional(),
    tsumogiri: z.boolean().optional(),
  })
  .strict();
export const LabHistoryStepSchema = z
  .object({
    after: z
      .object({
        type: z.enum([
          "tsumo",
          "dahai",
          "reach",
          "reach_accepted",
          "chi",
          "pon",
          "ankan",
          "kakan",
          "daiminkan",
          "dora",
        ]),
        actor: Actor.optional(),
        occurrence: z.number().int().min(1).max(100).default(1),
      })
      .strict(),
    action: LabActionSchema,
  })
  .strict();
const Meld = z
  .object({
    kind: z.enum(["chi", "pon", "daiminkan", "ankan", "kakan"]),
    tiles: z.array(LabTileSchema).min(3).max(4),
    target: Actor.optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.kind === "ankan" && v.target !== undefined)
      c.addIssue({ code: "custom", message: "ankan has no target actor" });
    const tiles = v.tiles.map((t) => t.replace(/r$/, ""));
    if (tiles.length !== (["chi", "pon"].includes(v.kind) ? 3 : 4))
      c.addIssue({ code: "custom", message: "meld tile count mismatch" });
    if (v.kind === "chi") {
      const ranks = tiles.map((t) => Number(t[0])).sort((a, b) => a - b);
      if (
        tiles.some((t) => t.length !== 2 || t[1] !== tiles[0]?.[1]) ||
        ranks[1] !== ranks[0]! + 1 ||
        ranks[2] !== ranks[1]! + 1
      )
        c.addIssue({ code: "custom", message: "chi must be suited sequence" });
    } else if (tiles.some((t) => t !== tiles[0]))
      c.addIssue({
        code: "custom",
        message: "triplet or quad tiles must match",
      });
  });
const Player = z
  .object({
    actor: Actor,
    initialHand: labChoice(Hand.length(13)).optional(),
    concealed: labChoice(Hand).optional(),
    river: labChoice(z.array(LabTileSchema).max(30)).optional(),
    melds: labChoice(z.array(Meld).max(4)).optional(),
    riichi: labChoice(z.boolean()).optional(),
  })
  .strict();
const Scene = z
  .object({
    selfActor: numericChoice(0, 3).default({ oneOf: [0, 1, 2, 3] }),
    round: numericChoice(0, 7).default({ oneOf: [0, 1, 2, 3, 4, 5, 6, 7] }),
    honba: numericChoice(0, 20).default({ fixed: 0 }),
    riichiSticks: numericChoice(0, 20).default({ fixed: 0 }),
    scores: labChoice(
      z.tuple([
        z.number().int().min(0).max(100000),
        z.number().int().min(0).max(100000),
        z.number().int().min(0).max(100000),
        z.number().int().min(0).max(100000),
      ]),
    ).optional(),
    turn: numericChoice(1, 18).default({ range: [2, 8], step: 1 }),
    hand: labChoice(Hand).optional(),
    draw: labChoice(LabTileSchema).optional(),
    doraIndicators: labChoice(z.array(LabTileSchema).min(1).max(5)).optional(),
    remainingDraws: numericChoice(0, 69).optional(),
    players: z.array(Player).max(4).default([]),
    history: z.array(LabHistoryStepSchema).max(256).default([]),
    wall: labChoice(z.array(LabTileSchema.nullable()).length(70)).optional(),
    rinshan: labChoice(z.array(LabTileSchema.nullable()).length(4)).optional(),
    uraIndicators: labChoice(
      z.array(LabTileSchema.nullable()).length(5),
    ).optional(),
  })
  .strict();
export const LAB_VARIABLES = [
  "selfActor",
  "round",
  "honba",
  "riichiSticks",
  "scores",
  "turn",
  "hand",
  "draw",
  "doraIndicators",
  "remainingDraws",
  "players",
  "history",
  "wall",
  "rinshan",
  "uraIndicators",
] as const;
export const QuestionLabConfigSchema = z
  .object({
    schemaVersion: z.literal("question-lab-config/v1"),
    seed: z.number().int().min(0).max(0xffffffff),
    name: z.string().min(1).max(120).default("局面模式研究"),
    scene: Scene.default({}),
    constraints: LabConditionSchema.optional(),
    hypotheses: z.array(Hypothesis).min(1).max(16).default(Defaults),
    experiment: z
      .object({
        mode: z
          .enum(["random", "directed", "contrast", "conflict"])
          .default("directed"),
        vary: z.array(z.enum(LAB_VARIABLES)).default([]),
        hold: z.array(z.enum(LAB_VARIABLES)).default([]),
        variantsPerGroup: z.number().int().min(1).max(64).default(1),
        strategy: z.enum(["sample", "scan"]).default("sample"),
        requireHypotheses: z.array(z.string()).max(16).default([]),
      })
      .strict()
      .default({}),
    budget: z
      .object({
        count: z.number().int().min(1).max(100000).default(100),
        maxAttempts: z.number().int().min(1).max(10000000).default(10000),
        timeLimitSeconds: z.number().int().min(1).max(86400).default(600),
        concurrency: z.number().int().min(1).max(8).default(2),
        refinementRounds: z.number().int().min(0).max(10).default(3),
        refinementCount: z.number().int().min(2).max(10000).default(100),
        maxSteps: z.number().int().min(1).max(512).default(256),
      })
      .strict()
      .default({}),
    learning: z
      .object({
        features: z
          .array(z.enum(LAB_FEATURES))
          .min(1)
          .default([...LAB_FEATURES]),
        testFraction: z.literal(0.2).default(0.2),
        minClassSamples: z.number().int().min(2).max(1000).default(10),
        minGroups: z.number().int().min(5).max(1000).default(10),
        sensitiveGap: z.number().finite().nonnegative().default(0.01),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((v, c) => {
    const ids = v.hypotheses.map((h) => h.id);
    if (new Set(ids).size !== ids.length)
      c.addIssue({ code: "custom", message: "duplicate hypothesis" });
    if (
      new Set(v.scene.players.map((p) => p.actor)).size !==
      v.scene.players.length
    )
      c.addIssue({ code: "custom", message: "duplicate actor" });
    if (v.experiment.hold.some((p) => v.experiment.vary.includes(p)))
      c.addIssue({
        code: "custom",
        message: "variable cannot be both held and varied",
      });
    if (v.experiment.requireHypotheses.some((id) => !ids.includes(id)))
      c.addIssue({ code: "custom", message: "unknown hypothesis" });
    if (v.experiment.strategy === "scan")
      for (const key of v.experiment.vary) {
        const selector = v.scene[key];
        if (!selector || Array.isArray(selector))
          c.addIssue({
            code: "custom",
            message: `scan requires a finite selector: ${key}`,
          });
      }
    if (v.experiment.mode === "contrast" && v.experiment.vary.length === 0)
      c.addIssue({ code: "custom", message: "contrast requires vary" });
    if (
      v.experiment.mode === "conflict" &&
      v.experiment.requireHypotheses.length < 2
    )
      c.addIssue({
        code: "custom",
        message: "conflict requires at least two hypotheses",
      });
    const candidateField = (r: LabCondition): boolean =>
      "all" in r
        ? r.all.some(candidateField)
        : "any" in r
          ? r.any.some(candidateField)
          : "not" in r
            ? candidateField(r.not)
            : r.field.startsWith("candidate.");
    if (
      (v.constraints && candidateField(v.constraints)) ||
      v.hypotheses.some((h) => h.when && candidateField(h.when))
    )
      c.addIssue({
        code: "custom",
        message: "candidate predicates require recommend.within",
      });
  });
export type QuestionLabConfig = z.infer<typeof QuestionLabConfigSchema>;
export type LabScene = QuestionLabConfig["scene"];
export type LabHypothesis = QuestionLabConfig["hypotheses"][number];
export const LabBoardSpecSchema = z
  .object({
    kyoku: z.number().int().min(0).max(7),
    honba: z.number().int().min(0).max(20),
    kyotaku: z.number().int().min(0).max(20),
    scores: z.tuple([
      z.number().int().min(0).max(100000),
      z.number().int().min(0).max(100000),
      z.number().int().min(0).max(100000),
      z.number().int().min(0).max(100000),
    ]),
    haipai: z.array(Hand.length(13)).length(4),
    yama: z.array(LabTileSchema).length(70),
    rinshan: z.array(LabTileSchema).length(4),
    dora_indicators: z.array(LabTileSchema).length(5),
    ura_indicators: z.array(LabTileSchema).length(5),
  })
  .strict();
export type LabBoardSpec = z.infer<typeof LabBoardSpecSchema>;
export const LabConstructionIdentitySchema = z
  .object({
    native: LibriichiRuleIdentitySchema,
    workerSha256: Sha,
    protocolVersion: z.literal("riichi-lab-construct/v1"),
  })
  .strict();
export const LabConstructRequestSchema = z
  .object({
    protocolVersion: z.literal("riichi-lab-construct/v1"),
    requestId: Sha,
    identity: LabConstructionIdentitySchema,
    spec: LabBoardSpecSchema,
    selfActor: Actor,
    turn: z.number().int().min(1).max(18),
    maxSteps: z.number().int().min(1).max(512),
    script: z.array(LabHistoryStepSchema).max(256),
    seed: z.number().int().min(0).max(0xffffffff),
  })
  .strict();
export type LabConstructRequest = z.infer<typeof LabConstructRequestSchema>;
// MJAI objects are validated again by the canonical mapper. No arbitrary extra transport keys.
export const LabMjaiEventSchema = z
  .object({
    type: z.string().min(1).max(24),
    actor: Actor.optional(),
    target: Actor.optional(),
    pai: LabTileSchema.optional(),
    consumed: z.array(LabTileSchema).max(4).optional(),
    tsumogiri: z.boolean().optional(),
    bakaze: z.enum(["E", "S"]).optional(),
    kyoku: z.number().int().min(1).max(4).optional(),
    honba: z.number().int().nonnegative().optional(),
    kyotaku: z.number().int().nonnegative().optional(),
    oya: Actor.optional(),
    scores: z.array(z.number().int()).length(4).optional(),
    dora_marker: LabTileSchema.optional(),
    tehais: z.array(Hand.length(13)).length(4).optional(),
  })
  .strict();
export const LabConstructResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      protocolVersion: z.literal("riichi-lab-construct/v1"),
      requestId: Sha,
      identity: LabConstructionIdentitySchema,
      status: z.literal("ok"),
      events: z.array(LabMjaiEventSchema).min(2).max(1024),
      scriptApplied: z.array(z.number().int().nonnegative()),
    })
    .strict(),
  z
    .object({
      protocolVersion: z.literal("riichi-lab-construct/v1"),
      requestId: Sha,
      status: z.literal("error"),
      code: z.enum([
        "construction_invalid",
        "history_unreachable",
        "search_exhausted",
        "construction_runtime_failed",
      ]),
    })
    .strict(),
]);
export type LabConstructResult = z.infer<typeof LabConstructResultSchema>;
export const LabCandidateFactsSchema = z
  .object({
    actionRef: z.string().min(1),
    action: RiichiActionSchema,
    status: z.enum(["ready", "unsupported"]),
    result: Hand13FactResultSchema.nullable(),
    metrics: z
      .object({
        shanten: z.number().finite().nullable(),
        ukeire: z.number().finite().nullable(),
        dora: z.number().finite().nullable(),
        valueEstimate: z.number().finite().nullable(),
        genbutsu: z.number().finite().nullable(),
        tile34: z.number().int().min(0).max(33).nullable(),
        red: z.boolean(),
        kind: z.string(),
      })
      .strict(),
  })
  .strict();
export const LabSampleSchema = z
  .object({
    schemaVersion: z.literal("question-lab-sample/v1"),
    sampleId: Sha,
    configHash: Sha,
    groupId: Sha,
    attempt: z.number().int().nonnegative(),
    variant: z.number().int().nonnegative(),
    split: z.enum(["train", "test"]),
    round: z.number().int().nonnegative(),
    changed: z.array(z.string()),
    constructionId: Sha,
    acquisition: z
      .enum(["initial", "boundary", "exploration"])
      .default("initial"),
    factEvidenceSha256: Sha,
    stream: CanonicalEventStreamSchema,
    decisionRef: z.string().min(1),
    ruleRequest: LibriichiRuleRequestSchema,
    ruleResult: LibriichiRuleSuccessSchema,
    factIdentity: EngineIdentitySchema,
    candidates: z.array(LabCandidateFactsSchema).min(1).max(46),
    features: z.record(z.number().finite()),
    hypotheses: z.array(
      z
        .object({
          id: z.string(),
          applicable: z.boolean(),
          actionRefs: z.array(z.string()),
        })
        .strict(),
    ),
    timings: z.record(z.number().finite().nonnegative()),
    naturalness: z.literal("constructed_legal_not_frequency_calibrated"),
  })
  .strict();
export type LabSample = z.infer<typeof LabSampleSchema>;
export const LabLabelSchema = z
  .object({
    schemaVersion: z.literal("question-lab-label/v1"),
    sampleId: Sha,
    request: LocalMortalScoringRequestSchema,
    response: LocalMortalScoringSuccessSchema,
    preferredActionRefs: z.array(z.string()).min(1),
    preferredActionRef: z.string(),
    scores: z.array(
      z.object({ actionRef: z.string(), qValue: z.number().finite() }).strict(),
    ),
    bestGap: z.number().finite().nonnegative(),
    sensitive: z.boolean(),
    otherChoice: z.boolean(),
    durationMs: z.number().finite().nonnegative(),
  })
  .strict();
export type LabLabel = z.infer<typeof LabLabelSchema>;
const Finite = z.number().finite();
const Vector = z.array(Finite).max(100000);
export const LabSvmModelSchema = z
  .object({
    mean: Vector,
    scale: z.array(Finite.positive()).max(LAB_FEATURES.length),
    classes: z.array(z.string()).min(2).max(4),
    supportVectors: z.array(Vector).max(100000),
    dualCoefficients: z.array(Vector).max(4),
    intercepts: Vector,
    supportCounts: z.array(z.number().int().nonnegative()).min(2).max(4),
    kernel: z.enum(["linear", "rbf"]),
    gamma: Finite.nonnegative(),
    C: Finite.positive(),
  })
  .strict()
  .superRefine((m, c) => {
    if (
      m.mean.length !== m.scale.length ||
      m.supportVectors.some((v) => v.length !== m.mean.length) ||
      m.supportCounts.length !== m.classes.length ||
      m.supportCounts.reduce((a, b) => a + b, 0) !== m.supportVectors.length ||
      m.dualCoefficients.length !== m.classes.length - 1 ||
      m.dualCoefficients.some((v) => v.length !== m.supportVectors.length) ||
      m.intercepts.length !== (m.classes.length * (m.classes.length - 1)) / 2
    )
      c.addIssue({ code: "custom", message: "SVM dimensions mismatch" });
  });
const CV = z
  .object({
    kernel: z.enum(["linear", "rbf"]),
    C: Finite.positive(),
    score: Finite.min(0).max(1),
  })
  .strict();
const Metrics = z
  .object({
    count: z.number().int().nonnegative(),
    balancedAccuracy: Finite,
    macroF1: Finite,
    classes: z.array(z.string()),
    confusionMatrix: z.array(z.array(z.number().int().nonnegative())),
  })
  .strict();
const TaskBase = {
  trainCount: z.number().int().nonnegative(),
  testCount: z.number().int().nonnegative(),
  classCounts: z.record(z.number().int().nonnegative()),
  trainGroups: z.number().int().nonnegative(),
  featureNames: z.array(z.enum(LAB_FEATURES)).min(1),
};
const FittedTask = z
  .object({
    ...TaskBase,
    status: z.literal("fitted"),
    selected: CV,
    crossValidation: z.array(CV).length(6),
    model: LabSvmModelSchema,
    marginReference: Finite.nonnegative(),
    explanation: z
      .object({
        kind: z.enum(["linear_weights", "tree_surrogate"]),
        tree: z.string().max(100000),
        trainingFidelity: Finite.min(0).max(1),
        holdoutFidelity: Finite.min(0).max(1).optional(),
        maxDepth: z.literal(3),
        representatives: z.array(z.string()).max(12),
        boundaryPairs: z
          .array(
            z
              .object({
                a: z.string(),
                b: z.string(),
                distance: Finite.nonnegative(),
              })
              .strict(),
          )
          .max(12),
        interpretation: z.literal(
          "observable_model_preference_not_causal_or_internal_reason",
        ),
        focusFeatures: z.array(z.enum(LAB_FEATURES)),
        standardizedWeights: z.array(Vector).optional(),
        classOrder: z.array(z.string()).optional(),
      })
      .strict(),
    holdout: z
      .union([
        Metrics,
        z
          .object({
            status: z.literal("insufficient_evidence"),
            count: z.literal(0),
          })
          .strict(),
      ])
      .optional(),
    counterexamples: z.array(z.string()).max(20).optional(),
  })
  .strict();
export const LabBoundariesSchema = z
  .object({
    schemaVersion: z.literal("question-lab-boundaries/v1"),
    status: z.enum(["fitted", "insufficient_evidence"]),
    producer: z
      .object({
        python: z.string(),
        numpy: z.string(),
        scikitLearn: z.string(),
      })
      .strict(),
    evaluated: z.boolean(),
    tasks: z.record(
      z.discriminatedUnion("status", [
        z
          .object({
            ...TaskBase,
            status: z.literal("insufficient_evidence"),
            reason: z.string().optional(),
          })
          .strict(),
        FittedTask,
      ]),
    ),
    supportedCombinations: z.record(z.number().int().nonnegative()),
  })
  .strict();
