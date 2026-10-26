/**
 * Small synthetic knowledge fixture. No real game, label, credential, or
 * external corpus content is copied here.
 */

export function knowledgeCard(overrides = {}) {
  const id = overrides.id ?? "b01";
  const concept = overrides.concept ?? `概念-${id}`;
  const conditions = overrides.conditions ?? `适用条件-${id}`;
  const exceptions = overrides.exceptions ?? `例外-${id}`;
  const content = overrides.content ?? `正文-${id}\n概念：${concept}\n适用条件：${conditions}\n例外与限制：${exceptions}`;
  return {
    id,
    title: `标题-${id}`,
    topics: ["efficiency"],
    concept,
    conditions,
    exceptions,
    content,
    source: {
      system: "synthetic-source",
      title: `出处-${id}`,
      url: `https://example.invalid/${id}`,
      chapter: `/chapter/${id}`,
      htmlSha256: "0".repeat(64),
    },
    tileExamples: [],
    imagePolicy: "unverified_examples_excluded",
    editorialStatus: "source_conditions_reaudited_not_human_gold",
    ...overrides,
  };
}

export function syntheticKnowledge(cards) {
  const document = {
    version: "coach-scene-knowledge-web/v2",
    frozenAt: "2026-10-23T08:36:35.472Z",
    versionNotice: "synthetic fixture",
    cards,
    parentKnowledgeHash: "7892f0e621fb5d1945055061dc7cb6fe9fa597e649153074bb921041024be46f",
    revisionPolicy: "synthetic fixture",
  };
  return { document, bytes: Buffer.from(JSON.stringify(document), "utf8") };
}
