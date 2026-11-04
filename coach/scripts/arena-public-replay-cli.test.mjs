import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../bin/blind-discard-arena.mjs';
test('fixture-oriented CLI refuses the real public replay dataset before source selection', () => {
  assert.throws(() => parseArgs(['run','--dataset','blind-discard-public-replay-v1','--rag','off']), /arena_public_replay_cli_not_wired/);
});
