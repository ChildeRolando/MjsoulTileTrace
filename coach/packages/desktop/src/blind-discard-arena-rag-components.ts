import { z } from "zod";

/** Optional deterministic steps owned by the existing local retriever, not a new engine. */
export const ArenaRagComponentsSchema = z.object({
  smallToBig: z.boolean().default(false),
  contextEnrichment: z.boolean().default(false),
}).strict();
export type ArenaRagComponents = z.input<typeof ArenaRagComponentsSchema>;
export const ARENA_RAG_COMPONENTS_VERSION = "arena-context-terms/v1";

export type ArenaRagChunk = Readonly<{ start: number; end: number; content: string }>;

/** Exact UTF-16 offsets into the immutable parent; no generated claims or tile reconstruction. */
export function splitArenaRagPassage(content: string): readonly ArenaRagChunk[] {
  const chunks: ArenaRagChunk[] = [];
  for (const match of content.matchAll(/[^\r\n。！？]+[。！？]?/gu)) {
    const text = match[0].trim();
    if (!text) continue;
    const start = match.index + match[0].indexOf(text);
    chunks.push({ start, end: start + text.length, content: text });
  }
  return chunks.length ? chunks : [{ start: 0, end: content.length, content }];
}

export function enrichArenaRagContext(input: {
  sourceId: string; sourceTitle: string; documentLocation: string;
  topics: readonly string[]; corpusVersion: string;
}): string {
  // Metadata is text, not a prompt. The caller supplies validated corpus fields only.
  return `教材：${input.sourceTitle}\n章节：${input.documentLocation}\n主题：${input.topics.join("、")}\n知识版本：${input.corpusVersion} / ${input.sourceId}`;
}

/** Always return the entire parent, including conditions/exceptions. Never clip a qualification. */
export function expandArenaRagParent(content: string, context: string, maxChars: number): string {
  if (content.length > maxChars) throw new Error("arena_rag_parent_over_budget");
  const enriched = `${context}\n${content}`;
  return context && enriched.length <= maxChars ? enriched : content;
}

export type ArenaRagComponentTrace = Readonly<{
  retrieverVersion: string;
  matches: readonly Readonly<{
    parentId: string; start: number; end: number;
    searchChars: number; returnedChars: number; contextIncluded: boolean;
  }>[];
}>;
