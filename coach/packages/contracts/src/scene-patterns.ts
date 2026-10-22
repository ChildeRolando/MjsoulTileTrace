import { z } from "zod";
import { ActionRefSchema } from "./comparison.js";

export const SCENE_PATTERN_VERSION = "scene-patterns/v1" as const;
export const SCENE_PATTERN_IDS = ["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","P12","P13","P14","P15","P16","P17","P18"] as const;
export const KNOWLEDGE_TOPICS = ["pairs","chiitoitsu","yakuhai","flush","efficiency","dora","waits","furiten","riichi-defense","multi-defense","open-defense","reading","safe-tiles","push-fold","endgame","placement"] as const;
export const KnowledgeTopicSchema = z.enum(KNOWLEDGE_TOPICS);
const actor = z.number().int().min(0).max(3);
const ref = z.string().min(1);
const metric = z.number().int().nonnegative().nullable();
const shanten = z.number().int().min(-1).max(13).nullable();
export const ScenePatternCandidateSchema = z.object({
  actionRef: ActionRefSchema, tile34: z.number().int().min(0).max(33),
  exactPairKinds: z.array(z.number().int().min(0).max(33)).nullable(),
  yakuhaiPairKinds: z.array(z.number().int().min(27).max(33)).nullable(),
  suitCounts: z.tuple([z.number().int().nonnegative(),z.number().int().nonnegative(),z.number().int().nonnegative()]).nullable(),
  shanten, standardShanten: shanten, chiitoitsuShanten: shanten, ukeire: metric, dora: metric,
  waits: z.array(z.object({ tile34: z.number().int().min(0).max(33), unseen: z.number().int().min(0).max(4).nullable() }).strict()).nullable(),
  furiten: z.boolean().nullable(),
  safety: z.array(z.object({ actor, genbutsu: z.boolean().nullable() }).strict()),
  evidenceRefs: z.array(ref).min(1),
}).strict();
export const ScenePatternFactsSchema = z.object({
  version: z.literal("scene-pattern-facts/v1"), caseRef: ref, selfActor: actor,
  noMeldOrKan: z.boolean().nullable(), selfDora: metric,
  selfYakuhaiPairKinds: z.array(z.number().int().min(27).max(33)).nullable(),
  selfSuitCounts: z.tuple([z.number().int().nonnegative(),z.number().int().nonnegative(),z.number().int().nonnegative()]).nullable(),
  acceptedRiichiActors: z.array(actor).nullable(),
  opponents: z.array(z.object({ actor, openMeldCount: metric, exposedYakuhai: z.boolean().nullable(), exposedDora: metric,
    openNumericSuits: z.array(z.number().int().min(0).max(2)).nullable(), evidenceRefs: z.array(ref) }).strict()).length(3),
  recentNonGenbutsu: z.array(z.object({ actor, threatActor: actor, evidenceRefs: z.array(ref).min(1) }).strict()).nullable(),
  remainingDraws: metric, southFourHanchan: z.boolean().nullable(), scoresKnown: z.boolean(),
  candidates: z.array(ScenePatternCandidateSchema).min(2), evidenceRefs: z.array(ref).min(1),
}).strict().superRefine((f,c) => {
  if(new Set(f.candidates.map(x=>x.actionRef)).size!==f.candidates.length) c.addIssue({code:z.ZodIssueCode.custom,message:"duplicate_pattern_candidate"});
  if(f.acceptedRiichiActors?.includes(f.selfActor)||f.opponents.some(x=>x.actor===f.selfActor)) c.addIssue({code:z.ZodIssueCode.custom,message:"pattern_self_is_opponent"});
  if(new Set(f.opponents.map(x=>x.actor)).size!==3||f.acceptedRiichiActors&&new Set(f.acceptedRiichiActors).size!==f.acceptedRiichiActors.length) c.addIssue({code:z.ZodIssueCode.custom,message:"duplicate_pattern_actor"});
  for(const row of f.candidates) for(const xs of [row.exactPairKinds,row.yakuhaiPairKinds,row.waits?.map(x=>x.tile34),row.safety.map(x=>x.actor)]) if(xs&&new Set(xs).size!==xs.length)c.addIssue({code:z.ZodIssueCode.custom,message:"duplicate_pattern_fact"});
});
export const ScenePatternResultSchema = z.object({
  patternId: z.enum(SCENE_PATTERN_IDS), ruleVersion: z.literal(SCENE_PATTERN_VERSION),
  status: z.enum(["matched","not_matched","insufficient_data"]),
  title: ref, observations: z.array(ref), question: ref, topics: z.array(KnowledgeTopicSchema).min(1),
  evidenceRefs: z.array(ref), actors: z.array(actor), actionRefs: z.array(ActionRefSchema),
}).strict();
export const ScenePatternPacketSchema = z.object({
  version: z.literal(SCENE_PATTERN_VERSION), caseRef: ref,
  results: z.array(ScenePatternResultSchema).length(18), text: z.string(),
}).strict();
export type ScenePatternFacts = z.infer<typeof ScenePatternFactsSchema>;
export type ScenePatternCandidate = z.infer<typeof ScenePatternCandidateSchema>;
export type ScenePatternResult = z.infer<typeof ScenePatternResultSchema>;
export type ScenePatternPacket = z.infer<typeof ScenePatternPacketSchema>;
export type KnowledgeTopic = z.infer<typeof KnowledgeTopicSchema>;
