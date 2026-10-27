const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { digestOf } from './canonical.mjs';
import {
  SELF_RAG_STUDY_CORPUS_RULES_VERSION,
  SELF_RAG_STUDY_RULE_SOURCE,
  resolveCorpusGameRules,
  tenhouGoRules,
  verifyFrozenRuleSource,
} from './corpus-rules.mjs';
import { replayCorpusGame } from './corpus-replay.mjs';

const LOCATOR = 'https://huggingface.co/datasets/nikketryhard/tenhou-houou-mjai/resolve/6450bb584cef43ede3b514df48e301a832c6818b/tenhou-houou-2009.tar#tenhou-houou-2009/2009123013gm-00a9-0000-13d83447.mjai.json.zst';
const withBits = (bits) => LOCATOR.replace('gm-00a9-', `gm-${bits}-`);

test('tenhou-go locator bits become rules; rules the locator cannot carry stay unknown', () => {
  const rules = tenhouGoRules(LOCATOR);
  assert.deepEqual(rules, {
    length: 'south',
    redFives: { man: 1, pin: 1, sou: 1 },
    openTanyao: true,
    atamahane: false,
    westExtension: 'unknown',
    ippatsuCancelledByAnkan: 'unknown',
  });
  // Bit 1 set means no red fives; bit 2 set means open tanyao is off.
  assert.deepEqual(tenhouGoRules(withBits('00ab')).redFives, { man: 0, pin: 0, sou: 0 });
  assert.equal(tenhouGoRules(withBits('00ad')).openTanyao, false);
  assert.equal(tenhouGoRules(withBits('00ad')).redFives.man, 1);
  // Rules the locator does not observe are never filled in from common knowledge.
  assert.equal(tenhouGoRules(LOCATOR).westExtension, 'unknown');
  assert.equal(tenhouGoRules(LOCATOR).ippatsuCancelledByAnkan, 'unknown');
  assert.throws(() => tenhouGoRules('no-locator-bits-here'), /rule_source_locator_unparseable/u);
});

test('three-player, non-four-player and east-only rule evidence is refused', () => {
  // 0x0019: four-player + south + three-player flag.
  assert.throws(() => tenhouGoRules(withBits('0019')), /rule_source_three_player/u);
  // 0x000a: south, but not a four-player game.
  assert.throws(() => tenhouGoRules(withBits('000a')), /rule_source_not_four_player/u);
  // 0x0001: four-player east-only game.
  assert.throws(() => tenhouGoRules(withBits('0001')), /rule_source_not_south/u);
});

test('the corpus rule adapter accepts only mjai with exactly one observed rule profile', () => {
  const ok = resolveCorpusGameRules({
    format: 'mjai',
    observations: [{ source: SELF_RAG_STUDY_RULE_SOURCE, locator: LOCATOR }],
  });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.ruleSource.source, SELF_RAG_STUDY_RULE_SOURCE);
  assert.equal(ok.ruleSource.locator, LOCATOR);
  assert.deepEqual(ok.ruleSource.rules, tenhouGoRules(LOCATOR));
  assert.equal(ok.ruleSource.version, SELF_RAG_STUDY_CORPUS_RULES_VERSION);
  assert.equal(ok.ruleSource.digest, digestOf({
    version: SELF_RAG_STUDY_CORPUS_RULES_VERSION,
    source: SELF_RAG_STUDY_RULE_SOURCE,
    locator: LOCATOR,
    rules: tenhouGoRules(LOCATOR),
  }));

  // No tenhou observation at all: rules would be unknown, so the game is out
  // instead of being guessed into a standard profile.
  assert.deepEqual(resolveCorpusGameRules({
    format: 'mjai',
    observations: [{ source: 'hhim-tenhou', locator: 'opaque-parquet-locator' }],
  }), { status: 'excluded', reason: 'rule_source_missing', detail: SELF_RAG_STUDY_RULE_SOURCE });

  // Rule evidence that cannot be decoded is not silently ignored.
  assert.equal(resolveCorpusGameRules({
    format: 'mjai',
    observations: [{ source: SELF_RAG_STUDY_RULE_SOURCE, locator: 'no-bits' }],
  }).reason, 'rule_source_locator_unparseable');

  // Two observations for the same hash that imply different rules conflict.
  const conflict = resolveCorpusGameRules({
    format: 'mjai',
    observations: [
      { source: SELF_RAG_STUDY_RULE_SOURCE, locator: LOCATOR },
      { source: SELF_RAG_STUDY_RULE_SOURCE, locator: withBits('00ab') },
    ],
  });
  assert.equal(conflict.status, 'excluded');
  assert.equal(conflict.reason, 'rule_source_conflict');

  // Non-mjai variants never reach the mjai mapper.
  assert.equal(resolveCorpusGameRules({
    format: 'tenhou-xml',
    observations: [{ source: SELF_RAG_STUDY_RULE_SOURCE, locator: LOCATOR }],
  }).reason, 'format_unsupported');
});

const MJAI_ROWS = [
  { type: 'start_game' },
  {
    type: 'start_kyoku', bakaze: 'E', kyoku: 1, honba: 0, kyotaku: 0, oya: 0,
    scores: [25000, 25000, 25000, 25000], dora_marker: '1m',
    tehais: [
      ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p', '3p', '4p'],
      ['2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p', '3p', '4p', '5p'],
      ['3m', '4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p', '3p', '4p', '5p', '6p'],
      ['4m', '5m', '6m', '7m', '8m', '9m', '1p', '2p', '3p', '4p', '5p', '6p', '7p'],
    ],
  },
  { type: 'tsumo', actor: 0, pai: '1s' },
  { type: 'dahai', actor: 0, pai: '1s', tsumogiri: true },
  { type: 'ryukyoku', reason: 'exhaustive', tenpais: [false, false, false, false], scores: [25000, 25000, 25000, 25000] },
  { type: 'end_kyoku' },
  { type: 'end_game', scores: [25000, 25000, 25000, 25000] },
];
const MJAI_BYTES = Buffer.from(MJAI_ROWS.map((row) => JSON.stringify(row)).join('\n'));
const RULE_SOURCE = resolveCorpusGameRules({
  format: 'mjai',
  observations: [{ source: SELF_RAG_STUDY_RULE_SOURCE, locator: LOCATOR }],
}).ruleSource;

test('the corpus adapter entry passes observed rules into the mapper', () => {
  const { stream, decisions } = replayCorpusGame({ raw: MJAI_BYTES, gameId: 'rc1_fixture', ruleSource: RULE_SOURCE, selfActor: 0 });
  // Without the rule source the mapper defaults every rule to unknown, which is
  // exactly the native `rules_input_incomplete` failure this adapter repairs.
  assert.deepEqual(stream.ruleSet.redFives, { man: 1, pin: 1, sou: 1 });
  assert.equal(stream.ruleSet.length, 'south');
  assert.equal(stream.ruleSet.openTanyao, true);
  // Unobserved rules keep the stream honest: partial, never upgraded to complete.
  assert.equal(stream.completeness.ruleSet, 'partial');
  assert.equal(stream.completeness.scores, 'complete');
  assert.ok(Array.isArray(decisions));
  const unresolved = replayCorpusGame({ raw: MJAI_BYTES, gameId: 'rc1_fixture', ruleSource: null, selfActor: 0 });
  assert.deepEqual(unresolved.stream.ruleSet.redFives, { man: 'unknown', pin: 'unknown', sou: 'unknown' });
});

test('a frozen rule source is recomputed and refuses drift', () => {
  assert.equal(verifyFrozenRuleSource(RULE_SOURCE).digest, RULE_SOURCE.digest);
  assert.throws(() => verifyFrozenRuleSource({ ...RULE_SOURCE, digest: '0'.repeat(64) }), /verify_rule_source_mismatch/u);
  assert.throws(() => verifyFrozenRuleSource({ ...RULE_SOURCE, rules: { ...RULE_SOURCE.rules, openTanyao: false } }),
    /verify_rule_source_mismatch/u);
  assert.throws(() => verifyFrozenRuleSource({ ...RULE_SOURCE, source: 'hhim-tenhou' }), /verify_rule_source_mismatch/u);
  assert.throws(() => verifyFrozenRuleSource(undefined), /verify_rule_source_mismatch|study_rule_source_invalid/u);
});
