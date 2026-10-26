const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  SELF_RAG_STUDY_COMPLETE_VISIBILITY_IDS,
  SELF_RAG_STUDY_CORPUS_CONVERSION_VERSION,
  SELF_RAG_STUDY_CORPUS_VERSION,
  SELF_RAG_STUDY_KNOWLEDGE_IDENTITY,
  SELF_RAG_STUDY_MAX_PASSAGE_CHARS,
  SELF_RAG_STUDY_SUBSET_IDS,
  SELF_RAG_STUDY_TOPICS,
  buildResearchArenaCorpus,
  convertResearchCard,
  loadResearchSubset,
  researchPassageContent,
} from './knowledge.mjs';
import { knowledgeCard, syntheticKnowledge } from './fixtures/knowledge.mjs';

const knowledgePath = 'E:/synthetic/knowledge.json';
const syntheticIdentity = null;

function load(cards, options = {}) {
  const { bytes } = syntheticKnowledge(cards);
  return loadResearchSubset(bytes, {
    knowledgePath,
    expectedIdentity: syntheticIdentity,
    subsetIds: cards.map((card) => card.id),
    ...options,
  });
}

test('an embedded card is delivered byte-for-byte with its frozen conversion mapping', () => {
  const card = knowledgeCard({ id: 'b01' });
  const { subset, subsetDigest } = load([card]);
  const [entry] = subset;

  assert.equal(entry.content, card.content);
  assert.equal(entry.contentSha256, createHash('sha256').update(card.content, 'utf8').digest('hex'));
  assert.equal(entry.convertedPassage.content, card.content);
  assert.equal(entry.convertedContentSha256, entry.contentSha256);
  assert.deepEqual(entry.contentFieldVisibility, { concept: true, conditions: true, exceptions: true });
  assert.equal(entry.conversionRuleVersion, SELF_RAG_STUDY_CORPUS_CONVERSION_VERSION);
  assert.deepEqual(entry.source, {
    system: card.source.system, title: card.source.title, url: card.source.url,
    chapter: card.source.chapter, htmlSha256: card.source.htmlSha256,
  });
  assert.deepEqual(entry.convertedPassage, {
    id: 'b01',
    sourceId: 'scene-kb-v2.b01',
    sourceTitle: `${card.title} / ${card.source.title}`,
    documentLocation: card.source.chapter,
    localSourcePath: `${knowledgePath}#cards/b01`,
    attributedReferences: [card.source.url],
    rightsBasis: entry.convertedPassage.rightsBasis,
    topics: ['tile-efficiency'],
    applicableWhen: ['general-discard-choice', 'complete-visibility-only'],
    content: card.content,
  });
  assert.match(subsetDigest, /^[0-9a-f]{64}$/u);
  // No unconverted card fields (labels, tile examples) leak into the artifact.
  assert.equal('tileExamples' in entry, false);
  assert.equal('editorialStatus' in entry, false);
});

test('a card whose content omits its conditions gets labelled original text appended once, in frozen order', () => {
  const card = knowledgeCard({ id: 'b02', content: '正文-仅概念\n概念：概念-b02' });
  const converted = researchPassageContent(card);
  assert.equal(converted,
    `正文-仅概念\n概念：概念-b02\n【适用条件】${card.conditions}\n【例外与限制】${card.exceptions}`);
  assert.equal(converted.match(/【适用条件】/gu).length, 1);
  assert.equal(converted.includes(card.concept), true);
  assert.equal(converted.includes(card.conditions), true);
  assert.equal(converted.includes(card.exceptions), true);
  // Running the conversion twice must not append a second time.
  assert.equal(researchPassageContent({ ...card, content: converted }), converted);

  const { subset } = load([card]);
  assert.deepEqual(subset[0].contentFieldVisibility, { concept: true, conditions: true, exceptions: true });
  assert.deepEqual(subset[0].contentFieldVisibility,
    { concept: true, conditions: true, exceptions: true });
});

test('an over-long conversion is rejected instead of truncated', () => {
  const card = knowledgeCard({ id: 'b03', content: 'x'.repeat(SELF_RAG_STUDY_MAX_PASSAGE_CHARS) });
  assert.throws(() => convertResearchCard(card, { knowledgePath }), (error) => {
    assert.equal(error.message, 'research_corpus_invalid');
    assert.equal(error.detail, 'b03.content_too_long');
    return true;
  });
  assert.throws(() => load([card]), /research_corpus_invalid/u);
});

test('the postcondition is asserted, not assumed from the base text', () => {
  // A concept that is neither in content nor appendable as a string is
  // impossible, so the observable failure is a non-string field.
  const card = knowledgeCard({ id: 'b05', conditions: '' });
  assert.throws(() => load([card]), (error) => error.message === 'research_corpus_invalid');
});

test('card identity and source fields are validated before conversion', () => {
  const badUrl = knowledgeCard({ id: 'b07', source: { ...knowledgeCard().source, url: 'not a url' } });
  assert.throws(() => load([badUrl]), /research_corpus_invalid/u);
  const longTitle = knowledgeCard({ id: 'b09', title: 't'.repeat(200) });
  assert.throws(() => load([longTitle]), /research_corpus_invalid/u);
  const longChapter = knowledgeCard({ id: 'b10', source: { ...knowledgeCard().source, chapter: 'c'.repeat(161) } });
  assert.throws(() => load([longChapter]), /research_corpus_invalid/u);
  const padded = knowledgeCard({ id: 'b12', content: ` ${knowledgeCard({ id: 'b12' }).content}` });
  assert.throws(() => load([padded]), /research_corpus_invalid/u);
  const duplicate = [knowledgeCard({ id: 'b13' }), knowledgeCard({ id: 'b13' })];
  assert.throws(() => load(duplicate), /research_corpus_invalid/u);
});

test('the frozen knowledge identity is rejected on any byte, shape or provenance change', () => {
  const { bytes, document } = syntheticKnowledge([knowledgeCard({ id: 'b01' })]);
  const load3 = (raw, expected) => loadResearchSubset(raw, {
    knowledgePath, subsetIds: ['b01'], expectedIdentity: expected,
  });
  const expected = {
    version: document.version, frozenAt: document.frozenAt, cardCount: 1,
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    parentKnowledgeHash: document.parentKnowledgeHash,
  };
  assert.equal(load3(bytes, expected).subset.length, 1);
  assert.throws(() => load3(Buffer.concat([bytes, Buffer.from(' ')]), expected), /research_corpus_invalid/u);
  assert.throws(() => load3(bytes, { ...expected, sha256: '0'.repeat(64) }), /research_corpus_invalid/u);
  assert.throws(() => load3(bytes, { ...expected, cardCount: 2 }), /research_corpus_invalid/u);
  assert.throws(() => load3(bytes, { ...expected, version: 'coach-scene-knowledge-web/v1' }), /research_corpus_invalid/u);
  assert.throws(() => load3(bytes, { ...expected, frozenAt: '2026-10-24T00:00:00.000Z' }), /research_corpus_invalid/u);
  assert.throws(() => load3(bytes, { ...expected, parentKnowledgeHash: 'f'.repeat(64) }), /research_corpus_invalid/u);
  assert.throws(() => loadResearchSubset(Buffer.from('{'), { knowledgePath, subsetIds: ['b01'], expectedIdentity: null }), /research_corpus_invalid/u);
});

test('a missing or duplicated subset card stops the corpus instead of substituting', () => {
  const { bytes } = syntheticKnowledge([knowledgeCard({ id: 'b01' })]);
  assert.throws(() => loadResearchSubset(bytes, {
    knowledgePath, expectedIdentity: null, subsetIds: ['b01', 'b02'],
  }), /research_corpus_invalid/u);
  assert.throws(() => loadResearchSubset(bytes, {
    knowledgePath, expectedIdentity: null, subsetIds: ['b01', 'b01'],
  }), /research_corpus_invalid/u);
});

test('the frozen subset, its topics and the Arena corpus keep the study contract', () => {
  assert.equal(SELF_RAG_STUDY_SUBSET_IDS.length, 20);
  assert.equal(new Set(SELF_RAG_STUDY_SUBSET_IDS).size, 20);
  assert.deepEqual(Object.keys(SELF_RAG_STUDY_TOPICS).sort(), [...SELF_RAG_STUDY_SUBSET_IDS].sort());
  assert.deepEqual([...SELF_RAG_STUDY_COMPLETE_VISIBILITY_IDS], ['b01', 'b05', 'b14']);
  for (const id of SELF_RAG_STUDY_COMPLETE_VISIBILITY_IDS) assert.equal(SELF_RAG_STUDY_SUBSET_IDS.includes(id), true);
  assert.equal(SELF_RAG_STUDY_KNOWLEDGE_IDENTITY.sha256.length, 64);
  assert.equal(SELF_RAG_STUDY_MAX_PASSAGE_CHARS, 1000);

  const cards = SELF_RAG_STUDY_SUBSET_IDS.map((id) => knowledgeCard({ id }));
  const { subset } = load(cards);
  const corpus = buildResearchArenaCorpus(subset);
  assert.equal(corpus.corpusVersion, SELF_RAG_STUDY_CORPUS_VERSION);
  assert.equal(corpus.passages.length, 20);
  assert.deepEqual(corpus.passages.map((passage) => passage.id), [...SELF_RAG_STUDY_SUBSET_IDS]);
  for (const [index, passage] of corpus.passages.entries()) {
    const id = SELF_RAG_STUDY_SUBSET_IDS[index];
    assert.deepEqual(passage.topics, [SELF_RAG_STUDY_TOPICS[id]]);
    assert.deepEqual(passage.applicableWhen,
      SELF_RAG_STUDY_COMPLETE_VISIBILITY_IDS.includes(id)
        ? ['general-discard-choice', 'complete-visibility-only']
        : ['general-discard-choice']);
  }
  assert.throws(() => buildResearchArenaCorpus([]), /research_corpus_invalid/u);
  assert.throws(() => buildResearchArenaCorpus(new Array(21).fill(subset[0])), /research_corpus_invalid/u);
});
