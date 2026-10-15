import {
  ArenaCaseRefSchema,
  ArenaOpaqueReferenceSchema,
  ArenaRagApplicabilitySchema,
  ArenaRagRequestSchema,
  ArenaRagResultSchema,
  ArenaRagTopicSchema,
  type ArenaCaseRef,
  type ArenaRagApplicability,
  type ArenaRagMode,
  type ArenaRagPassage,
  type ArenaRagRequest,
  type ArenaRagResult,
} from "@riichi-coach/contracts";
import { z } from "zod";
import type { ArenaRunAliasVault } from "./blind-discard-arena.js";

export const ARENA_RAG_LIMITS_V1 = Object.freeze({
  schemaVersion: "blind-discard-arena-rag-limits/v1" as const,
  maxQueryLength: 400,
  maxPassagesPerQuery: 5,
  maxPassageChars: 1000,
  maxCorpusPassages: 20,
});

export const ARENA_RAG_RETRIEVER_VERSION = "arena-local-terms/v1";

const SeedPassageSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  sourceId: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,79}$/),
  sourceTitle: z.string().trim().min(1).max(160),
  documentLocation: z.string().trim().min(1).max(160),
  localSourcePath: z.string().trim().min(1).max(300),
  attributedReferences: z.array(z.string().url()).max(4),
  rightsBasis: z.string().trim().min(1).max(400),
  topics: z.array(ArenaRagTopicSchema).min(1).max(2),
  applicableWhen: z.array(ArenaRagApplicabilitySchema).min(1).max(4),
  content: z.string().trim().min(1).max(ARENA_RAG_LIMITS_V1.maxPassageChars),
}).strict();

const SeedCorpusSchema = z.object({
  corpusVersion: z.string().trim().min(1).max(80),
  passages: z.array(SeedPassageSchema).max(ARENA_RAG_LIMITS_V1.maxCorpusPassages),
}).strict().superRefine((corpus, context) => {
  const ids = corpus.passages.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["passages"], message: "arena_rag_duplicate_passage_id" });
  }
});

type SeedPassage = z.infer<typeof SeedPassageSchema>;
type SeedCorpus = z.infer<typeof SeedCorpusSchema>;
export type ArenaRagRetriever = Readonly<{
  mode: ArenaRagMode;
  query(raw: unknown): Promise<ArenaRagResult>;
}>;

export type ArenaRagRetrieverOptions = Readonly<{
  mode: "off";
  caseRef: ArenaCaseRef;
  /** Test hook: off mode accepts but must never call a corpus loader. */
  loadCorpus?: () => Promise<unknown>;
}> | Readonly<{
  mode: "local";
  caseRef: ArenaCaseRef;
  aliases: Pick<ArenaRunAliasVault, "reference">;
  /** Injection point for tests; production loads the small seed file lazily. */
  loadCorpus?: () => Promise<unknown>;
}>;

function tokenize(value: string): readonly string[] {
  const tokens = new Set<string>();
  const normalized = value.normalize("NFKC").toLocaleLowerCase("zh-CN");
  for (const match of normalized.matchAll(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu)) {
    const token = match[0];
    if (/^\p{Script=Han}+$/u.test(token)) {
      if (token.length === 1) tokens.add(token);
      for (let index = 0; index < token.length - 1; index += 1) {
        tokens.add(token.slice(index, index + 2));
      }
    } else {
      tokens.add(token);
    }
  }
  return [...tokens];
}

function filterPassage(passage: SeedPassage, request: ArenaRagRequest): boolean {
  const topics = request.filter?.topics;
  if (topics !== undefined && topics.length > 0 && !topics.some((topic) => passage.topics.includes(topic))) {
    return false;
  }
  const applicability = request.filter?.appliesTo;
  if (applicability !== undefined && applicability.length > 0 &&
      !applicability.some((condition) => passage.applicableWhen.includes(condition))) {
    return false;
  }
  return true;
}

function rankPassage(
  passage: SeedPassage,
  queryTerms: readonly string[],
  request: ArenaRagRequest,
): { lexicalScore: number; score: number } {
  const title = new Set(tokenize(passage.sourceTitle));
  const body = new Set(tokenize(passage.content));
  let lexicalScore = 0;
  for (const term of queryTerms) {
    if (title.has(term)) lexicalScore += 4;
    if (body.has(term)) lexicalScore += 2;
  }
  let score = lexicalScore;
  if (request.context?.topic !== undefined && passage.topics.includes(request.context.topic)) score += 3;
  if (request.context?.appliesTo !== undefined && passage.applicableWhen.includes(request.context.appliesTo)) score += 1;
  return { lexicalScore, score };
}

function retrievalMetadata(request: ArenaRagRequest, resultRefs: readonly string[]) {
  return {
    query: request.query,
    context: request.context ?? null,
    filter: request.filter ?? null,
    limit: request.limit,
    resultRefs,
  };
}

function loadSeedCorpus(): Promise<unknown> {
  return import("./blind-discard-arena-rag-seed.js")
    .then(({ BLIND_DISCARD_ARENA_RAG_SEED_CORPUS }) => BLIND_DISCARD_ARENA_RAG_SEED_CORPUS);
}

export function createArenaRagRetriever(options: ArenaRagRetrieverOptions): ArenaRagRetriever {
  const caseRef = ArenaCaseRefSchema.parse(options.caseRef);
  let corpusPromise: Promise<SeedCorpus> | null = null;

  const getCorpus = async (): Promise<SeedCorpus> => {
    if (options.mode !== "local") throw new Error("arena_rag_corpus_unavailable_in_off_mode");
    corpusPromise ??= (options.loadCorpus ?? loadSeedCorpus)()
      .then((raw) => SeedCorpusSchema.parse(raw));
    return await corpusPromise;
  };

  return Object.freeze({
    mode: options.mode,
    async query(raw: unknown): Promise<ArenaRagResult> {
      const request = ArenaRagRequestSchema.parse(raw);
      if (options.mode === "off") {
        return ArenaRagResultSchema.parse({
          schemaVersion: "blind-discard-arena-rag-result/v1",
          caseRef,
          mode: "off",
          status: "disabled",
          passages: [],
          sourceRefs: [],
          retrieval: retrievalMetadata(request, []),
          corpusVersion: null,
          retrieverVersion: "disabled",
        });
      }

      const corpus = await getCorpus();
      const queryTerms = tokenize(request.query);
      const ranked = corpus.passages
        .filter((passage) => filterPassage(passage, request))
        .map((passage) => ({ passage, ...rankPassage(passage, queryTerms, request) }))
        .filter(({ lexicalScore }) => lexicalScore > 0)
        .sort((left, right) => right.score - left.score ||
          (left.passage.id < right.passage.id ? -1 : left.passage.id > right.passage.id ? 1 : 0))
        .slice(0, request.limit);

      const passages: ArenaRagPassage[] = ranked.map(({ passage }) => {
        const sourceRef = options.aliases.reference(`blind-discard-arena-rag/v1\u0000${passage.sourceId}\u0000${passage.id}`);
        return {
          sourceRef: ArenaOpaqueReferenceSchema.parse(sourceRef),
          sourceTitle: passage.sourceTitle,
          documentLocation: passage.documentLocation,
          content: passage.content,
          applicableWhen: [...passage.applicableWhen] as ArenaRagApplicability[],
          corpusVersion: corpus.corpusVersion,
          retrieverVersion: ARENA_RAG_RETRIEVER_VERSION,
        };
      });
      const sourceRefs = passages.map(({ sourceRef }) => sourceRef);
      return ArenaRagResultSchema.parse({
        schemaVersion: "blind-discard-arena-rag-result/v1",
        caseRef,
        mode: "local",
        status: passages.length === 0 ? "no_hits" : "hits",
        passages,
        sourceRefs,
        retrieval: retrievalMetadata(request, sourceRefs),
        corpusVersion: corpus.corpusVersion,
        retrieverVersion: ARENA_RAG_RETRIEVER_VERSION,
      });
    },
  });
}
