const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPinnedRuntime } from '../bin/blind-discard-arena.mjs';

const rulePatchPath = fileURLToPath(new URL('../packages/mortal-runtime/native/coach-rule-config.patch', import.meta.url));

async function localNativeReceipts() {
  const artifactRoot = resolve(process.env.RIICHI_LOCAL_MORTAL_ROOT ?? join(process.env.LOCALAPPDATA ?? '', 'RiichiCoach', 'local-mortal-spike'));
  const buildsRoot = join(artifactRoot, 'rule-native-builds');
  const receipts = [];
  for (const entry of await readdir(buildsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(buildsRoot, entry.name, 'receipt.json');
    try {
      const receipt = JSON.parse(await readFile(path, 'utf8'));
      if (typeof receipt.nativeModulePath === 'string' && typeof receipt.nativeArtifactSha256 === 'string') receipts.push({ path, receipt });
    } catch { /* incomplete builds are not receipts */ }
  }
  return receipts;
}

// The built-in real-dataset Arena path pins one exact native rule artifact, so the local build
// resources are deliberately opt-in. The genuine receipt for the current rule patch must be
// accepted, any other installed build must still be refused, and pinning must not relax the
// asset-runtime receipt/patch/native/wrapper verification.
// skip 而不是省略注册：vitest 会对没有任何用例的文件报错，node --test 也如实显示 skipped。
const nativeResources = process.env.COACH_QUESTION_LAB_NATIVE === '1'
  ? {}
  : { skip: 'set COACH_QUESTION_LAB_NATIVE=1 with the real local native rule builds' };

test('the built-in Arena pin accepts only the genuine native build for the current rule patch', nativeResources, async () => {
  const patchSha256 = createHash('sha256').update(await readFile(rulePatchPath)).digest('hex');
  const receipts = await localNativeReceipts();
  const genuine = receipts.filter(({ receipt }) => receipt.patchSha256 === patchSha256);
  assert.equal(genuine.length, 1, 'expected exactly one installed receipt built from the current rule patch');
  const stale = receipts.find(({ receipt }) => receipt.patchSha256 !== patchSha256 && typeof receipt.patchSha256 === 'string');
  assert.ok(stale, 'expected a stale installed receipt to keep proving refusal');

  const previous = process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT;
  try {
    process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT = genuine[0].path;
    const { runtime, nativeReceiptPath } = await createPinnedRuntime(false);
    try {
      assert.equal(nativeReceiptPath, genuine[0].path);
      assert.equal(runtime.identity.nativeArtifactSha256, genuine[0].receipt.nativeArtifactSha256);
      assert.equal(runtime.ruleIdentity.nativeArtifactSha256, genuine[0].receipt.nativeArtifactSha256);
    } finally { await runtime.close(); }

    process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT = stale.path;
    await assert.rejects(() => createPinnedRuntime(false), /arena_pinned_native_receipt_missing_or_ambiguous/);

    const temporaryRoot = await mkdtemp(join(tmpdir(), 'arena-native-pin-'));
    try {
      const tamperedPath = join(temporaryRoot, 'receipt.json');
      await writeFile(tamperedPath, JSON.stringify({ ...genuine[0].receipt, patchSha256: stale.receipt.patchSha256 }));
      process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT = tamperedPath;
      await assert.rejects(() => createPinnedRuntime(false), /mortal_runtime_identity_mismatch/);
    } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
  } finally {
    if (previous === undefined) delete process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT;
    else process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT = previous;
  }
});
