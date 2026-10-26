const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { SELF_RAG_STUDY_DEFAULTS, parseArgs, resolveCodexExecutable, usage } from './cli.mjs';

test('the CLI requires an artifact directory and a seed for prepare', () => {
  assert.deepEqual(parseArgs(['--help']), { command: 'help' });
  assert.deepEqual(parseArgs([]), { command: 'help' });
  assert.deepEqual(parseArgs(['prepare', '--artifacts', 'E:/study', '--seed', 'seed-1']),
    { command: 'prepare', '--artifacts': 'E:/study', '--seed': 'seed-1' });
  assert.throws(() => parseArgs(['prepare', '--seed', 'x']), /study_artifacts_required/u);
  assert.throws(() => parseArgs(['prepare', '--artifacts', 'E:/study']), /study_seed_required/u);
  assert.throws(() => parseArgs(['verify']), /study_artifacts_required/u);
  assert.throws(() => parseArgs(['unknown', '--artifacts', 'E:/study']), /study_command_invalid/u);
  assert.throws(() => parseArgs(['verify', '--artifacts', 'E:/study', '--nope', 'x']), /study_option_unknown/u);
  assert.throws(() => parseArgs(['verify', '--artifacts']), /study_option_value_missing/u);
  assert.throws(() => parseArgs(['verify', '--artifacts', 'a', '--artifacts', 'b']), /study_option_duplicate/u);
  assert.throws(() => parseArgs(['verify', '--artifacts', 'a', '--phase', 'final']), /study_phase_invalid/u);
  assert.throws(() => parseArgs(['run', '--artifacts', 'a', '--arm', 'both']), /study_arm_invalid/u);
  assert.throws(() => parseArgs(['run', '--artifacts', 'a', '--max-run-ms', '0']), /study_max_run_ms_invalid/u);
  assert.throws(() => parseArgs(['run', '--artifacts', 'a', '--max-run-ms', '300001']), /study_max_run_ms_invalid/u);
  assert.throws(() => parseArgs(['report', '--artifacts', 'a', '--judge-reasons', '--reason-review', 'f']), /study_reason_review_conflict/u);
  const run = parseArgs(['run', '--artifacts', 'a', '--phase', 'evaluation', '--case', 'study-case-03', '--arm', 'selfrag', '--pilot-rerun', '--max-run-ms', '5000']);
  assert.equal(run['--max-run-ms'], 5000);
  assert.equal(run['--pilot-rerun'], true);
  assert.match(usage(), /never copies the research corpus/u);
});

test('the Codex executable mirror matches the adapter path rule on each platform', () => {
  const appData = 'C:/Users/tester/AppData/Roaming';
  const x64Nested = join(appData, 'npm', 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
  const x64Flat = join(appData, 'npm', 'node_modules', '@openai', 'codex', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
  assert.equal(resolveCodexExecutable({ APPDATA: appData }, 'win32', 'x64', (candidate) => candidate === x64Nested), x64Nested);
  assert.equal(resolveCodexExecutable({ APPDATA: appData }, 'win32', 'x64', (candidate) => candidate === x64Flat), x64Flat);
  // The nested vendor path is preferred when both exist.
  assert.equal(resolveCodexExecutable({ APPDATA: appData }, 'win32', 'x64', () => true), x64Nested);
  assert.equal(resolveCodexExecutable({ APPDATA: appData }, 'win32', 'x64', () => false), null);
  assert.equal(resolveCodexExecutable({}, 'win32', 'x64', () => true), null);
  assert.equal(resolveCodexExecutable({ APPDATA: appData }, 'linux', 'x64', () => true), null);
  assert.equal(resolveCodexExecutable({ APPDATA: appData }, 'win32', 'ia32', () => true), null);
  const arm = resolveCodexExecutable({ APPDATA: appData }, 'win32', 'arm64', (candidate) => candidate.includes('aarch64-pc-windows-msvc'));
  assert.equal(arm?.includes('codex-win32-arm64'), true);
  assert.equal(SELF_RAG_STUDY_DEFAULTS.corpus.endsWith('corpus.sqlite'), true);
});
