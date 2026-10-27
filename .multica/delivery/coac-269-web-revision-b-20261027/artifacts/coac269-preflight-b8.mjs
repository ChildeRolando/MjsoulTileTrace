#!/usr/bin/env node
// COAC-269 line B batch 8 zero-call preflight.
//
// Batch 8 is the owner-dispatched 79-cn figure batch: 79-cn-chapter-128-14 (cv1734739) and
// 79-cn-chapter-145-4 (cv1744266), canonical ids and targets taken from COAC-244's 6145c9f
// classification (figure-targeted-executable, entryPass, declaredErrorTargets 1).
//
// This script makes NO model call and writes no shared list/selection/pointer. For each chapter it
//   1. re-runs the three-source joint exclusion (v3, both entries) and requires the chapter to be an
//      eligible repair target bound to the exact parent candidate sha,
//   2. verifies every binding the frozen revision entry checks (source/parent/notes sha, the notes'
//      production + source sha, the parent's own source sha, verbatim body, needs-repair status,
//      complete downloaded assets),
//   3. re-derives the figure repair scope from the parent audit itself: non-source-note issue
//      targetIds must be exactly the expected figure, it must exist in the parent, and every OTHER
//      figure must already carry a faithful figureCheck,
//   4. proves the real entry accepts the scope by running the frozen production runner with
//      `--preflight-only` (the runner's own web_revision_is_not_isolated_figure_repair gate and
//      reuse-map binding run; modelCalls stays 0),
//   5. refuses an existing variant output, any passed candidate for the article, a STOP file or a
//      live maker-B slot.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const P = 'E:/AgentData/Coach/knowledge/processing';
const REPO = 'E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const NS = path.join(P, 'web-production/v1/coac269-20261027');
const FROZEN = path.join(NS, 'frozen-runtime/textbook-production-web.mjs');
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const JOINT = path.join(HERE, 'coac269-joint-exclusion-precheck-v3.mjs');
const SLOT_PATH = path.join(P, 'parallel/slots/maker-B.json');
const NODE = process.execPath;
const BATCH = 'b8';
const VARIANT = 'coac269rev1';
const OWNER = 'COAC-269 Ticket executor';
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => path.relative(P, p).replaceAll('\\', '/');
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const now = () => new Date().toISOString();

const CASES = [
  {
    chapterId: '79-cn-chapter-128-14',
    articleId: 'cv1734739',
    sourceId: '79-bilibili-cn',
    source: 'web-sources/v1/79-bilibili-cn/articles/cv1734739/source.json',
    parent: 'web-production/v1/candidates/79-bilibili-cn/cv1734739.display.json',
    parentSha256: '2aec7345fda18914b17cab6d01703d1a5e0fb5bee27eb056e62453f4f24887ec',
    notes: 'audit/web/articles/79-bilibili-cn/cv1734739.2aec7345fda18914b17cab6d01703d1a5e0fb5bee27eb056e62453f4f24887ec.retry-1792944840664-30f5eb57.json',
    reuse: 'web-production/v1/reuse-maps/c903dad7b5a5a3d0460d614924a0b66ab9cd481801fc4a332e06331ca271b671.json',
    expectedTargetFigureIds: ['79-bilibili-cn:cv1734739:b0013:figure'],
    expectedFigures: 7,
    outputPath: 'web-production/v1/candidates/79-bilibili-cn/cv1734739.' + VARIANT + '.json',
    errorObserved: '父稿 b0013 手牌第二张记为 3m；绑定源图与放大图逐张复读为 二萬 二萬 四萬 五萬 六萬（2m 2m 4m 5m 6m）。',
  },
  {
    chapterId: '79-cn-chapter-145-4',
    articleId: 'cv1744266',
    sourceId: '79-bilibili-cn',
    source: 'web-sources/v1/79-bilibili-cn/articles/cv1744266/source.json',
    parent: 'web-production/v1/candidates/79-bilibili-cn/cv1744266.display.json',
    parentSha256: '7557da593c6cdee11ca01853639150f50e39cbc9dc94bd51f0461d65d18ad92a',
    notes: 'audit/web/articles/79-bilibili-cn/cv1744266.7557da593c6cdee11ca01853639150f50e39cbc9dc94bd51f0461d65d18ad92a.retry-1792948017171-19a0c0ed.json',
    reuse: 'web-production/v1/reuse-maps/c67b1441be160cb3440d72576a87e9913e79d6507adc6f8c4bb7305e232940d0.json',
    expectedTargetFigureIds: ['79-bilibili-cn:cv1744266:b0005:figure'],
    expectedFigures: 5,
    outputPath: 'web-production/v1/candidates/79-bilibili-cn/cv1744266.' + VARIANT + '.json',
    errorObserved: '父稿 b0005 手牌第 12 张记为 2z（南）；绑定源图与放大图逐张复读为 東（1z），末张 中（7z）不变。',
  },
];

const receipt = {
  schema: 'coac269-web-revision-preflight/1',
  ticket: 'COAC-269', line: 'B', batch: BATCH,
  recordedAt: now(),
  purpose: 'zero-call preflight of the two dispatched 79-cn figure revisions through the frozen entry',
  variant: VARIANT,
  budget: {productionCallsAllowedPerChapter: 1, firstAuditCallsAllowedPerChapter: 1, retries: 0},
  frozenRuntime: {},
  chapters: [],
  modelCalls: 0,
  productionCalls: 0,
};
for (const f of ['textbook-production-web.mjs', 'textbook-production-cli.mjs', 'textbook-production-web-visual.py']) {
  receipt.frozenRuntime[f] = sha(fs.readFileSync(path.join(NS, 'frozen-runtime', f)));
}

// ---- 1. fresh joint exclusion (both entries) ----
const jointOut = JSON.parse(execFileSync(NODE, [JOINT], {encoding: 'utf8', timeout: 300000}));
const jointPath = path.join(P, jointOut.receipt);
const jointBytes = fs.readFileSync(jointPath);
const joint = JSON.parse(jointBytes);
const jointAgeSeconds = Math.round((Date.now() - new Date(joint.recordedAt).getTime()) / 1000);
const ptrBytes = fs.readFileSync(path.join(P, 'integration/accepted-preview-current.json'));
receipt.jointExclusion = {
  path: rel(jointPath), sha256: sha(jointBytes), recordedAt: joint.recordedAt, ageSeconds: jointAgeSeconds,
  scriptVersion: jointOut.scriptVersion, controlsOk: jointOut.controlsOk,
  pointerSha256: sha(ptrBytes), eligibleCount: joint.eligibleRepairTargets.length,
  denominators: joint.chapterDenominator,
};
if (!jointOut.controlsOk) throw new Error('joint_controls_failed');

const eligibleById = new Map(joint.eligibleRepairTargets.map(e => [e.chapterId, e]));

// ---- misc gates ----
const stopPath = path.join(P, 'web-production/v1/STOP');
const stopExists = fs.existsSync(stopPath);
let liveSlot = null;
if (fs.existsSync(SLOT_PATH)) {
  const s = readJson(SLOT_PATH);
  liveSlot = s && s.owner ? {owner: s.owner, acquiredAt: s.acquiredAt, pid: s.pid} : null;
}

for (const c of CASES) {
  const rec = {chapterId: c.chapterId, articleId: c.articleId, checks: {}, failures: []};
  const fail = (name, detail) => { rec.checks[name] = {ok: false, detail}; rec.failures.push(name + ': ' + detail); };
  const ok = (name, detail) => { rec.checks[name] = {ok: true, detail}; };

  // ---- 1. joint exclusion eligibility, bound to this parent sha ----
  const je = eligibleById.get(c.chapterId);
  if (!je) fail('joint_eligible', 'not an eligible repair target in the fresh joint exclusion');
  else if (!(je.parents || []).some(p => p.sha256 === c.parentSha256)) fail('joint_parent_binding', 'parent sha not among the fresh joint exclusion parents');
  else ok('joint_eligible', {chapterId: c.chapterId, parentSha256: c.parentSha256, direction: je.direction, sourceId: je.sourceId});
  if (je && je.direction !== 'figure') fail('joint_direction', 'expected figure entry direction, got ' + je.direction);

  // ---- 2. bindings the frozen revision entry checks ----
  const sourceBytes = fs.readFileSync(path.join(P, c.source));
  const parentBytes = fs.readFileSync(path.join(P, c.parent));
  const notesBytes = fs.readFileSync(path.join(P, c.notes));
  const source = JSON.parse(sourceBytes), parent = JSON.parse(parentBytes), notes = JSON.parse(notesBytes);
  const sourceSha = sha(sourceBytes), parentSha = sha(parentBytes), notesSha = sha(notesBytes);
  if (parentSha !== c.parentSha256) fail('parent_sha', `expected ${c.parentSha256}, file is ${parentSha}`);
  else ok('parent_sha', parentSha);
  if (notes.production?.sha256 !== parentSha) fail('notes_production_binding', 'notes.production.sha256 != parent file sha');
  else ok('notes_production_binding', notes.production.sha256);
  if (notes.source?.sourceSha256 !== sourceSha) fail('notes_source_binding', 'notes.source.sourceSha256 != source file sha');
  else ok('notes_source_binding', sourceSha);
  if (parent.source?.sourceSha256 !== sourceSha) fail('parent_source_binding', 'parent.source.sourceSha256 != source file sha');
  else ok('parent_source_binding', sourceSha);
  if (parent.source?.sourceId !== c.sourceId || parent.source?.articleId !== c.articleId) fail('parent_identity', 'parent sourceId/articleId mismatch');
  else ok('parent_identity', c.sourceId + '/' + c.articleId);
  if (notes.status !== 'needs-repair') fail('notes_status', notes.status);
  else ok('notes_status', notes.status);
  if (source.status !== 'captured-not-translated-or-audited') fail('source_status', source.status);
  else ok('source_status', source.status);
  const badAssets = (source.assets || []).filter(a => a.status !== 'downloaded');
  if (badAssets.length) fail('source_assets', badAssets.length + ' assets not downloaded');
  else ok('source_assets', (source.assets || []).length + ' downloaded');
  if (parent.body?.mode !== 'verbatim') fail('parent_body_mode', String(parent.body?.mode));
  else ok('parent_body_mode', 'verbatim');

  // ---- 3. figure repair scope re-derived from the parent audit ----
  const issues = (notes.modelReview?.issues || []).filter(i => i.severity !== 'source-note');
  const targetIds = [...new Set(issues.map(i => i.targetId))];
  const figures = (parent.figures || []).map(f => f.figureId);
  if (JSON.stringify(targetIds) !== JSON.stringify(c.expectedTargetFigureIds)) fail('target_figure_ids', `audit issues declare ${JSON.stringify(targetIds)}`);
  else ok('target_figure_ids', targetIds);
  const missingTarget = targetIds.filter(id => !figures.includes(id));
  if (missingTarget.length) fail('target_in_parent', 'not a parent figure: ' + JSON.stringify(missingTarget));
  else ok('target_in_parent', targetIds.length + ' target(s) present');
  const fc = notes.modelReview?.figureChecks || [];
  const nonTarget = figures.filter(id => !targetIds.includes(id));
  const missingFaithful = nonTarget.filter(id => !fc.some(x => x.id === id && x.verdict === 'faithful'));
  if (missingFaithful.length) fail('non_target_figures_faithful', JSON.stringify(missingFaithful));
  else ok('non_target_figures_faithful', nonTarget.length + ' non-target figures all faithful');
  if (figures.length !== c.expectedFigures) fail('figure_count', `expected ${c.expectedFigures}, parent has ${figures.length}`);
  else ok('figure_count', figures.length);
  const targetChecks = targetIds.map(id => ({id, verdicts: fc.filter(x => x.id === id).map(x => x.verdict)}));
  rec.targetChecks = targetChecks;
  if (!targetChecks.every(t => t.verdicts.length && t.verdicts.every(v => v !== 'faithful'))) fail('target_verdict', 'target figure is not marked non-faithful by the parent audit');
  else ok('target_verdict', JSON.stringify(targetChecks));
  const targetFigure = (parent.figures || []).find(f => f.figureId === targetIds[0]);
  rec.target = targetFigure ? {figureId: targetFigure.figureId, transcription: targetFigure.transcription,
    assets: (targetFigure.sourceAssetBindings || []).map(b => ({path: b.path, sha256: b.sha256, fileOk: fs.existsSync(path.join(P, b.path)) && sha(fs.readFileSync(path.join(P, b.path))) === b.sha256}))} : null;
  if (!rec.target || rec.target.assets.some(a => !a.fileOk)) fail('target_asset_bindings', 'source asset missing or sha mismatch');
  else ok('target_asset_bindings', rec.target.assets.length + ' bound source asset(s), sha verified');

  // ---- 4. reuse map (required by the frozen runner for a Chinese source) ----
  const reuseBytes = fs.readFileSync(path.join(P, c.reuse));
  const reuse = JSON.parse(reuseBytes);
  if (reuse.schema !== 'coach-textbook-exact-web-reuse/1' || reuse.sourceFileSha256 !== sourceSha) fail('reuse_binding', 'reuse map schema or source sha mismatch');
  else ok('reuse_binding', {path: c.reuse, sha256: sha(reuseBytes), images: (reuse.images || []).length});

  // ---- 5. no output yet, no passed candidate for the article ----
  if (fs.existsSync(path.join(P, c.outputPath))) fail('output_absent', 'variant output already exists');
  else ok('output_absent', c.outputPath);
  const auditDir = path.join(P, 'audit/web/articles', c.sourceId);
  const passedForArticle = fs.readdirSync(auditDir).filter(f => f.startsWith(c.articleId + '.')).map(f => readJson(path.join(auditDir, f)))
    .filter(a => String(a.status).startsWith('passed') && a.source?.sourceSha256 === sourceSha);
  if (passedForArticle.length) fail('no_passed_candidate', passedForArticle.length + ' passed receipts already exist for this source sha');
  else ok('no_passed_candidate', '0 passed receipts for the current source sha');
  if (stopExists) fail('stop_file', stopPath);
  else ok('stop_file', 'absent');
  if (liveSlot) fail('maker_b_slot', JSON.stringify(liveSlot));
  else ok('maker_b_slot', 'no live maker-B');

  // ---- 6. real frozen entry, --preflight-only: zero model calls ----
  const args = [FROZEN, '--source', c.source, '--revision-from', c.parent, '--revision-notes', c.notes,
    '--variant', VARIANT, '--reuse', c.reuse, '--timeout-ms', '480000', '--preflight-only'];
  let entry = null, entryExit = 0, entryErr = null;
  try {
    const out = execFileSync(NODE, args, {cwd: REPO, encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe']});
    entry = JSON.parse(out.trim().split(/\r?\n/).at(-1));
  } catch (e) {
    entryExit = typeof e.status === 'number' ? e.status : 1;
    entryErr = String((e.stderr || '') + (e.stdout || '')).slice(-3000);
  }
  rec.frozenEntry = {command: args.map(a => a.includes(' ') ? '"' + a + '"' : a).join(' '), exitCode: entryExit, output: entry, error: entryErr};
  if (entry?.preflightPassed && entry.pendingFigureRuns === 1 && entry.figureRuns === c.expectedFigures && entry.modelCalls === 0) {
    ok('frozen_entry_preflight', {figureRuns: entry.figureRuns, pendingFigureRuns: entry.pendingFigureRuns, modelCalls: entry.modelCalls});
  } else {
    fail('frozen_entry_preflight', 'runner preflight did not accept the scope: ' + JSON.stringify(entry ?? entryErr));
  }

  rec.ok = rec.failures.length === 0;
  rec.errorObserved = c.errorObserved;
  // bindings in the shape coac269-claim-shared.mjs consumes, so the same claim tool is reused
  rec.parent = {path: c.parent, sha256: parentSha};
  rec.notes = {path: c.notes, sha256: notesSha};
  rec.source = {path: c.source, sha256: sourceSha};
  rec.targets = targetIds.map(id => ({sourceBlockId: id, kind: 'figure'}));
  rec.outputPath = c.outputPath;
  receipt.chapters.push(rec);
}

receipt.ok = receipt.chapters.every(c => c.ok);
receipt.finishedAt = now();
fs.mkdirSync(path.join(NS, 'preflight'), {recursive: true});
const outPath = path.join(NS, 'preflight', 'preflight-' + BATCH + '-' + sha(JSON.stringify({chapters: receipt.chapters.map(c => [c.chapterId, c.ok, c.failures]), joint: receipt.jointExclusion.sha256})).slice(0, 16) + '.json');
fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({
  ok: receipt.ok, receipt: rel(outPath), sha256: sha(fs.readFileSync(outPath)), modelCalls: 0,
  joint: receipt.jointExclusion,
  chapters: receipt.chapters.map(c => ({chapterId: c.chapterId, articleId: c.articleId, ok: c.ok, failures: c.failures,
    target: c.target?.figureId ?? null, entry: c.frozenEntry?.output ?? null})),
}, null, 2));
process.exit(receipt.ok ? 0 : 1);
