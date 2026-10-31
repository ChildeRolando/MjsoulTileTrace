const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../../bin/selfrag-study.mjs');

/**
 * A wrong named import makes the whole CLI fail at link time, before any
 * command runs — the real prepare/run/report chain would never start. The
 * harness modules are dependency-free, so their exports can be checked here
 * without the workspace build.
 */
test('the study CLI imports only names its own harness modules actually export', async () => {
  const source = await readFile(entry, 'utf8');
  const checked = [];
  for (const [, names, specifier] of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"];/gu)) {
    if (!specifier.startsWith('../scripts/selfrag-study/')) continue;
    const module = await import(pathToFileURL(resolve(dirname(entry), specifier)).href);
    for (const raw of names.split(',').map((name) => name.trim()).filter(Boolean)) {
      const [imported, local] = raw.split(/\s+as\s+/u);
      assert.equal((local ?? imported) in module, true, `${specifier} must export ${imported}`);
      checked.push(`${specifier}:${imported}`);
    }
  }
  // Guard the test itself: a parse that silently matched nothing proves nothing.
  assert.ok(checked.includes('../scripts/selfrag-study/canonical.mjs:digestOf'));
  assert.ok(checked.length >= 20, `checked ${checked.length} harness imports`);
});
