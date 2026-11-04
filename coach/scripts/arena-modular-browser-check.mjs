// Read-only UI capture plus isolated settings writes; no model/native scoring calls.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createArenaConsole } from '../bin/blind-discard-arena-console.mjs';

const { chromium } = await import(process.env.COACH_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.COACH_PLAYWRIGHT_MODULE).href : 'playwright');
const captured = JSON.parse(await readFile(process.env.RIICHI_ARENA_CAPTURE ?? 'reports/coac271-local-capture.json', 'utf8'));
const root = await mkdtemp(join(tmpdir(), 'arena-modular-browser-'));
const output = resolve('reports/coac271-browser'); await mkdir(output, { recursive: true });
let app, browser;
try {
  app = await createArenaConsole({ archiveRoot: root });
  await new Promise(resolveListen => app.server.listen(0, '127.0.0.1', resolveListen));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.COACH_BROWSER });
  const page = await browser.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/settings');
  await page.locator('#raw-preset').click();
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[name=experiment]').value.includes('tile-red'));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[name=experiment]').value.includes('tile-red'));
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.locator('[name=experiment]').isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: join(output, `settings-${width}.png`), fullPage: true });
  }
  await page.goto(base + '/model-info');
  await page.getByRole('heading', { name: '模块实验配置' }).waitFor();
  await page.getByText('提交 schema', { exact: true }).click();
  assert.match(await page.locator('#info-content').innerText(), /tile/);
  const id = '00000000-0000-4000-8000-000000000271', run = captured.run;
  const start = run.events.find(e => e.type === 'run_started');
  const manifest = { schemaVersion: 'blind-discard-arena-run-manifest/v1', runId: id, startedAt: run.startedAt, codeSha: '0'.repeat(40),
    dataset: { id: 'blind-discard-dev-v1', selected: [{ canonicalDecisionOrder: 0, candidateCount: 2 }], split: { status: 'development_only' } },
    coach: run.provider, rag: { mode: 'off' }, controlledFault: 'none', experiment: start.experiment.config };
  await page.route('**/api/run/' + id, route => route.fulfill({ json: { id, manifest, summary: null, incomplete: true,
    events: [{ type: 'case_run', caseOrdinal: 0, result: run }], trace: [], mortalDetails: null } }));
  await page.goto(base + '/results?run=' + id);
  await page.waitForFunction(() => !document.querySelector('#result-detail').hidden);
  const processTab = page.getByRole('tab', { name: '模型与工具过程', exact: true });
  if (await processTab.count()) await processTab.click();
  await page.getByText('查看冻结模块开关、实际内容与选材摘要', { exact: true }).click();
  await page.getByText('查看提示词、工具与提交 schema', { exact: true }).click();
  const nextStep = page.getByRole('navigation', { name: '步骤翻页', exact: true }).getByRole('button', { name: '下一页', exact: true });
  await nextStep.click();
  await page.getByText('查看实际发送内容、摘要、版本与限制', { exact: true }).click();
  for (const width of [1440, 800, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: join(output, `request-${width}.png`), fullPage: true });
  }
  await nextStep.click(); await nextStep.click(); await nextStep.click();
  assert.match(await page.locator('#detail-body').innerText(), /直接弃牌提交/);
  assert.deepEqual(errors, []);
  process.stdout.write('Arena modular UI: settings save/reload, schema, archived request/module content; 1440/800/390; no page errors.\n');
} finally {
  if (browser) await browser.close();
  if (app) { app.stop(); await new Promise(resolveClose => app.server.close(resolveClose)); }
  await rm(root, { recursive: true, force: true });
}
