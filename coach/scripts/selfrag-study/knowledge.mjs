import { createHash } from "node:crypto";
import { digestOf, sha256Text } from "./canonical.mjs";

/**
 * Read-only conversion of the 40-card v2 knowledge set into the frozen
 * research corpus for the paired Self-RAG study (spec §9.1.2).
 *
 * The source file is external, read-only data: nothing here writes it back,
 * copies it into the repository, or publishes it as product corpus. Every
 * conversion step is deterministic so `prepare` and `verify` recompute the
 * same subset digest from the same bytes.
 */
export const SELF_RAG_STUDY_CORPUS_CONVERSION_VERSION = "scene-kb-v2->arena-rag/v2";

/** Study-only corpus version; the product `blind-discard-arena-seeds/v1` stays default. */
export const SELF_RAG_STUDY_CORPUS_VERSION = "selfrag-research-scene-kb-v2/v1";

/** Frozen identity of `scene-pattern-study-20261023-kb-v2/knowledge.json`. */
export const SELF_RAG_STUDY_KNOWLEDGE_IDENTITY = Object.freeze({
  version: "coach-scene-knowledge-web/v2",
  frozenAt: "2026-10-23T08:36:35.472Z",
  cardCount: 40,
  byteLength: 87_933,
  sha256: "73375324682d30e3dbc43a921b340e6af330cae3587bd5c9ba0801ae1be19dab",
  parentKnowledgeHash: "7892f0e621fb5d1945055061dc7cb6fe9fa597e649153074bb921041024be46f",
});

/** Frozen 20-card representative subset, in frozen order. */
export const SELF_RAG_STUDY_SUBSET_IDS = Object.freeze([
  "b01", "b02", "b03", "b05", "b07", "b09", "b10", "b12", "b13", "b14", "b17", "b19",
  "a01", "a03", "a04", "a05", "a08", "a09", "a13", "a16",
]);

/** Study-only coarse grouping (spec §9.1.2 rule 5); not claimed semantically equivalent. */
export const SELF_RAG_STUDY_TOPICS = Object.freeze(Object.fromEntries([
  ...["b01", "b02", "b03", "b05", "b07", "b09", "b10", "a01", "a03", "a04", "a05"]
    .map((id) => [id, "tile-efficiency"]),
  ...["b12", "b13", "b14", "b17", "b19", "a08", "a09", "a13", "a16"]
    .map((id) => [id, "shape-flexibility"]),
]));

/** Cards whose own conditions depend on complete visibility (spec §9.1.2 rule 6). */
export const SELF_RAG_STUDY_COMPLETE_VISIBILITY_IDS = Object.freeze(["b01", "b05", "b14"]);

export const SELF_RAG_STUDY_RIGHTS_BASIS =
  "研究用只读概括，保留原出处；不发布、不作产品语料。";

/**
 * Mirrors `ARENA_RAG_LIMITS_V1.maxPassageChars` from the Arena RAG contract.
 * `verify` re-reads the live constant and fails if it ever differs.
 */
export const SELF_RAG_STUDY_MAX_PASSAGE_CHARS = 1000;

const APPENDED_FIELDS = Object.freeze([
  Object.freeze({ field: "concept", label: "【概念】" }),
  Object.freeze({ field: "conditions", label: "【适用条件】" }),
  Object.freeze({ field: "exceptions", label: "【例外与限制】" }),
]);

const CARD_ID = /^[a-z][a-z0-9]{1,7}$/u;

function invalid(detail) {
  const error = new Error("research_corpus_invalid");
  error.code = "research_corpus_invalid";
  error.detail = detail;
  return error;
}

function requireText(value, detail, maximum) {
  if (typeof value !== "string" || value.length === 0) throw invalid(detail);
  if (maximum !== undefined && value.length > maximum) throw invalid(detail);
  return value;
}

function validateCard(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw invalid("card");
  const id = requireText(raw.id, "card.id");
  if (!CARD_ID.test(id)) throw invalid(`card.id:${id}`);
  const title = requireText(raw.title, `${id}.title`);
  const source = raw.source;
  if (source === null || typeof source !== "object" || Array.isArray(source)) throw invalid(`${id}.source`);
  const sourceTitle = requireText(source.title, `${id}.source.title`);
  const chapter = requireText(source.chapter, `${id}.source.chapter`, 160);
  const url = requireText(source.url, `${id}.source.url`);
  try {
    // Same constraint as ArenaRagPassage.attributedReferences (z.array(z.string().url())).
    new URL(url);
  } catch {
    throw invalid(`${id}.source.url`);
  }
  const sourceSystem = requireText(source.system, `${id}.source.system`);
  const htmlSha256 = requireText(source.htmlSha256, `${id}.source.htmlSha256`);
  return {
    id, title, sourceTitle, chapter, url, sourceSystem, htmlSha256,
    concept: requireText(raw.concept, `${id}.concept`),
    conditions: requireText(raw.conditions, `${id}.conditions`),
    exceptions: requireText(raw.exceptions, `${id}.exceptions`),
    content: requireText(raw.content, `${id}.content`),
  };
}

/**
 * Study corpus → Arena passage content (spec §9.1.2 rule 4).
 *
 * Base is the card's `content` byte for byte. Only fields not already embedded
 * are appended, in the frozen order, with labelled original text blocks. The
 * card itself is never edited, truncated, re-summarized, or merged.
 */
export function researchPassageContent(card) {
  const base = requireText(card?.content, "card.content");
  let content = base;
  for (const { field, label } of APPENDED_FIELDS) {
    const value = requireText(card?.[field], `card.${field}`);
    if (!content.includes(value)) content += `\n${label}${value}`;
  }
  return content;
}

function convertedApplicability(id) {
  return SELF_RAG_STUDY_COMPLETE_VISIBILITY_IDS.includes(id)
    ? ["general-discard-choice", "complete-visibility-only"]
    : ["general-discard-choice"];
}

/** Convert one card into the frozen research artifact plus its Arena passage. */
export function convertResearchCard(rawCard, options) {
  const card = validateCard(rawCard);
  const knowledgePath = requireText(options?.knowledgePath, "knowledgePath");
  const sourceTitle = `${card.title} / ${card.sourceTitle}`;
  if (sourceTitle.length > 160) throw invalid(`${card.id}.sourceTitle_too_long`);
  const localSourcePath = `${knowledgePath}#cards/${card.id}`;
  if (localSourcePath.length > 300) throw invalid(`${card.id}.localSourcePath_too_long`);
  const topic = SELF_RAG_STUDY_TOPICS[card.id];
  if (topic === undefined) throw invalid(`${card.id}.topic_unmapped`);

  // A trimmed base would mean the passage can no longer carry `content` byte
  // for byte through the Arena schema; fail instead of silently rewording.
  if (card.content !== card.content.trim()) throw invalid(`${card.id}.content_not_canonical`);

  const convertedContent = researchPassageContent(card);
  if (convertedContent !== convertedContent.trim()) throw invalid(`${card.id}.converted_content_not_canonical`);
  if (convertedContent.length > SELF_RAG_STUDY_MAX_PASSAGE_CHARS) {
    // Reject rather than truncate: a shortened card would change its meaning.
    throw invalid(`${card.id}.content_too_long`);
  }

  const contentFieldVisibility = Object.freeze({
    concept: convertedContent.includes(card.concept),
    conditions: convertedContent.includes(card.conditions),
    exceptions: convertedContent.includes(card.exceptions),
  });
  if (!contentFieldVisibility.concept || !contentFieldVisibility.conditions || !contentFieldVisibility.exceptions) {
    throw invalid(`${card.id}.applicability_text_not_visible`);
  }

  const convertedPassage = {
    id: card.id,
    sourceId: `scene-kb-v2.${card.id}`,
    sourceTitle,
    documentLocation: card.chapter,
    localSourcePath,
    attributedReferences: [card.url],
    rightsBasis: SELF_RAG_STUDY_RIGHTS_BASIS,
    topics: [topic],
    applicableWhen: convertedApplicability(card.id),
    content: convertedContent,
  };

  return {
    id: card.id,
    source: {
      system: card.sourceSystem,
      title: card.sourceTitle,
      url: card.url,
      chapter: card.chapter,
      htmlSha256: card.htmlSha256,
    },
    concept: card.concept,
    conditions: card.conditions,
    exceptions: card.exceptions,
    content: card.content,
    contentSha256: sha256Text(card.content),
    convertedPassage,
    convertedContentSha256: sha256Text(convertedContent),
    contentFieldVisibility,
    conversionRuleVersion: SELF_RAG_STUDY_CORPUS_CONVERSION_VERSION,
  };
}

function parseKnowledge(raw) {
  const bytes = typeof raw === "string" ? Buffer.from(raw, "utf8") : Buffer.from(raw);
  let document;
  try {
    document = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw invalid("knowledge_json");
  }
  if (document === null || typeof document !== "object" || Array.isArray(document)) throw invalid("knowledge_document");
  if (!Array.isArray(document.cards)) throw invalid("knowledge_cards");
  return { bytes, document };
}

function verifyKnowledgeIdentity(bytes, document, expected) {
  if (document.version !== expected.version) throw invalid("knowledge_version");
  if (document.frozenAt !== expected.frozenAt) throw invalid("knowledge_frozen_at");
  if (document.parentKnowledgeHash !== expected.parentKnowledgeHash) throw invalid("knowledge_parent_hash");
  if (document.cards.length !== expected.cardCount) throw invalid("knowledge_card_count");
  if (bytes.byteLength !== expected.byteLength) throw invalid("knowledge_byte_length");
  if (createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw invalid("knowledge_sha256");
}

/**
 * Read, verify and convert the frozen research subset.
 *
 * `expectedIdentity` is the frozen snapshot from the spec. Synthetic fixtures
 * pass `null` explicitly; the CLI never does.
 */
export function loadResearchSubset(raw, options) {
  const knowledgePath = requireText(options?.knowledgePath, "knowledgePath");
  const subsetIds = options?.subsetIds ?? SELF_RAG_STUDY_SUBSET_IDS;
  const expectedIdentity = options?.expectedIdentity === undefined
    ? SELF_RAG_STUDY_KNOWLEDGE_IDENTITY
    : options.expectedIdentity;
  const { bytes, document } = parseKnowledge(raw);
  if (expectedIdentity !== null) verifyKnowledgeIdentity(bytes, document, expectedIdentity);

  const byId = new Map();
  for (const card of document.cards) {
    if (card === null || typeof card !== "object" || typeof card.id !== "string") throw invalid("knowledge_card_entry");
    if (byId.has(card.id)) throw invalid(`knowledge_duplicate_card:${card.id}`);
    byId.set(card.id, card);
  }
  if (SELF_RAG_STUDY_SUBSET_IDS.length !== 20) throw invalid("frozen_subset_size");
  if (new Set(SELF_RAG_STUDY_SUBSET_IDS).size !== SELF_RAG_STUDY_SUBSET_IDS.length) throw invalid("frozen_subset_duplicate");
  if (new Set(subsetIds).size !== subsetIds.length) throw invalid("subset_duplicate");

  const subset = subsetIds.map((id) => {
    const card = byId.get(id);
    if (card === undefined) throw invalid(`knowledge_subset_card_missing:${id}`);
    return convertResearchCard(card, { knowledgePath });
  });

  return Object.freeze({
    knowledgePath,
    knowledgeSha256: createHash("sha256").update(bytes).digest("hex"),
    knowledgeVersion: document.version,
    frozenAt: document.frozenAt,
    parentKnowledgeHash: document.parentKnowledgeHash,
    cardCount: document.cards.length,
    subsetIds: [...subsetIds],
    subset,
    subsetDigest: digestOf(subset),
  });
}

/** Arena `loadCorpus` payload for the frozen research subset (never published). */
export function buildResearchArenaCorpus(subset) {
  if (!Array.isArray(subset) || subset.length === 0) throw invalid("research_subset_empty");
  if (subset.length > 20) throw invalid("research_subset_too_large");
  return Object.freeze({
    corpusVersion: SELF_RAG_STUDY_CORPUS_VERSION,
    passages: subset.map((card) => Object.freeze({ ...card.convertedPassage })),
  });
}
