const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { openReplayCorpus } from './corpus.mjs';
import { createCorpusFixture, sidecarExists } from './fixtures/corpus.mjs';

const records = [
  { gameId: 'rc1_' + 'a'.repeat(64), sourceHash: '1'.repeat(64), raw: '{"type":"start_game"}\n{"type":"end_game"}\n' },
  { gameId: 'rc1_' + 'b'.repeat(64), sourceHash: '2'.repeat(64), raw: '{"type":"start_game"}\n' },
  { gameId: 'rc1_' + 'c'.repeat(64), sourceHash: '3'.repeat(64), raw: '{"type":"start_game"}\n' },
];

test('the corpus is opened read-only and never leaves sidecar files behind', () => {
  const fixture = createCorpusFixture(records);
  try {
    const calls = [];
    const corpus = openReplayCorpus(fixture.file, {
      openDatabase: (path, options) => {
        calls.push({ path, options });
        return new DatabaseSyncWrapper(path, options);
      },
    });
    assert.deepEqual(calls, [{ path: fixture.file, options: { readOnly: true } }]);
    assert.equal(corpus.mode, 'read_only');
    const identity = corpus.identity();
    assert.equal(identity.gameCount, 3);
    assert.equal(identity.variantCount, 3);
    assert.equal(identity.observationCount, 3);
    corpus.close();
    assert.equal(sidecarExists(fixture.file, '-wal'), false);
    assert.equal(sidecarExists(fixture.file, '-shm'), false);
    assert.deepEqual(readFileSync(fixture.file), fixture.fileBytes);
    assert.throws(() => corpus.listGames(), /study_corpus_closed/u);
  } finally {
    fixture.cleanup();
  }
});

test('game identities are listed in a deterministic, pageable order', () => {
  const fixture = createCorpusFixture(records);
  try {
    const corpus = openReplayCorpus(fixture.file);
    const all = corpus.listGames();
    assert.deepEqual(all.map((row) => row.sourceHash), ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)]);
    assert.deepEqual(corpus.listGames({ limit: 2 }).map((row) => row.sourceHash), ['1'.repeat(64), '2'.repeat(64)]);
    assert.deepEqual(corpus.listGames({ limit: 2, offset: 2 }).map((row) => row.sourceHash), ['3'.repeat(64)]);
    assert.throws(() => corpus.listGames({ limit: 0 }), /study_corpus_paging_invalid/u);
    assert.throws(() => corpus.listGames({ offset: -1 }), /study_corpus_paging_invalid/u);
    corpus.close();
  } finally {
    fixture.cleanup();
  }
});

test('a record is returned decompressed and byte-identical; an unknown identity fails closed', () => {
  const fixture = createCorpusFixture(records);
  try {
    const corpus = openReplayCorpus(fixture.file);
    const record = corpus.readRecord({ gameId: records[0].gameId, sourceHash: records[0].sourceHash });
    assert.equal(record.format, 'mjai');
    assert.equal(record.raw.toString('utf8'), records[0].raw);
    assert.throws(() => corpus.readRecord({ gameId: records[0].gameId, sourceHash: 'f'.repeat(64) }),
      (error) => error.message === 'study_corpus_record_missing');
    assert.throws(() => corpus.readRecord({ gameId: '', sourceHash: records[0].sourceHash }),
      /study_corpus_invalid/u);
    corpus.close();
  } finally {
    fixture.cleanup();
  }
});

// Thin wrapper so the readOnly options are observable without exposing the
// module's raw database handle.
class DatabaseSyncWrapper {
  #inner;
  constructor(path, options) {
    this.#inner = new DatabaseSync(path, options);
  }
  prepare(sql) { return this.#inner.prepare(sql); }
  close() { this.#inner.close(); }
}

test('rule observations are read for one variant hash in a deterministic order', () => {
  const fixture = createCorpusFixture(records);
  let corpus;
  try {
    corpus = openReplayCorpus(fixture.file);
    assert.deepEqual(corpus.readObservations({ sourceHash: records[0].sourceHash }), [
      { source: 'fixture', locator: `${records[0].gameId}.mjai` },
    ]);
    assert.deepEqual(corpus.readObservations({ sourceHash: 'f'.repeat(64) }), []);
    assert.throws(() => corpus.readObservations({}), /study_corpus_invalid/u);
  } finally {
    corpus?.close();
    fixture.cleanup();
  }
});
