import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMetrics, runMetrics, sortedTiles, tileAsset } from '../arena-console/presentation.mjs';

test('execution failures lower reliability without lowering agreement among successful cases', () => {
  const summary = { selectedCaseCount: 10, terminalStatuses: { completed: 6 },
    score: { matchedCaseCount: 6, conditionalMatchRate: { denominator: 6 } } };
  assert.deepEqual(runMetrics(summary), { selected: 10, succeeded: 6, matched: 6, missingLabels: 0 });
  const total = aggregateMetrics([{ summary }, { summary: null }, { summary: { selectedCaseCount: 3,
    terminalStatuses: { completed: 2 }, score: { matchedCaseCount: 1, conditionalMatchRate: { denominator: 1 } } } }]);
  assert.deepEqual(total, { selected: 13, succeeded: 8, matched: 7, missingLabels: 1, archived: 2, incomplete: 1 });
  assert.equal(runMetrics(null), null);
  assert.deepEqual(aggregateMetrics([]), { selected: 0, succeeded: 0, matched: 0, missingLabels: 0, archived: 0, incomplete: 0 });
});

test('visual hand sorting preserves the archive and maps red fives to existing artwork', () => {
  const tiles = [{ id: '4z', red: false }, { id: '5p', red: true }, { id: '2m', red: false }, { id: '5p', red: false }];
  const before = JSON.stringify(tiles);
  assert.deepEqual(sortedTiles(tiles).map(tile => tile.id + tile.red), ['2mfalse', '5pfalse', '5ptrue', '4zfalse']);
  assert.equal(JSON.stringify(tiles), before);
  assert.equal(tileAsset(tiles[1]), '/tiles/0p.svg');
  assert.equal(tileAsset(tiles[0]), '/tiles/4z.svg');
  assert.equal(tileAsset({ id: '../app.mjs' }), null);
});
