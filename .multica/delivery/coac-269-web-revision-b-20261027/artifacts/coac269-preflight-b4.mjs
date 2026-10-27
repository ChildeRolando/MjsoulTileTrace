#!/usr/bin/env node
// COAC-269 line B batch-4 zero-call preflight.
// Fixes the batch-2/batch-3 selection defect: a chapter is eligible only if the CANONICAL
// original chapter id is absent from the union of (a) the latest active preview unit-map /
// selection, (b) the latest unified chapter register, (c) every per-chapter latest passed
// audit receipt bound to the current source sha. The old variant-file-existence check is kept
// as a secondary guard but is no longer the selection test.
// Also verifies the revision-entry guards and binds the claim to chapterId + current candidateSHA.
import {readFile, writeFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {resolve, relative, isAbsolute, join} from 'node:path';

const processing = 'E:/AgentData/Coach/knowledge/processing';
const sha = b => createHash('sha256').update(b).digest('hex');
const ns = join(processing, 'web-production/v1/coac269-20261027');
const variant = 'coac269rev1';
const dictRel = 'web-production/v1/dictionaries/modern-accepted-tiles-c33800d79e603fff8d31dfccb7cf26b648f8f9765af7ec01e8beb0f10805ed2a.json';
const verifiedRel = 'audit/web/verified-assets/modern-ch01-s001-exact-42.json';
const jointPath = process.argv[2] || join(ns, 'preflight/joint-exclusion-6df4fae82fdfa6f3.json');

const cases = [
  {
    chapterId: 'nemata-jp-chapter-142-1',
    articleId: 'chapter01-section054',
    sourcePath: 'web-sources/v1/modern-yabejp-ja/articles/chapter01-section054/source.json',
    parentPath: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section054.display.json',
    notesPath: 'audit/web/articles/modern-yabejp-ja/chapter01-section054.264116a9f0d98a22e3d5ae6218adf35a677aecc154c6f4bbad4982240c11b04e.retry-1792969500839-d3667291.json',
    expectedParentSha: '264116a9f0d98a22e3d5ae6218adf35a677aecc154c6f4bbad4982240c11b04e',
    expectedNotesSha: '78ffbdda38185f4ae14f4caeae0a4e9ac015998658f831714e0bf856cd2a6872',
  },
  {
    chapterId: 'nemata-jp-chapter-127-1',
    articleId: 'chapter01-section047',
    sourcePath: 'web-sources/v1/modern-yabejp-ja/articles/chapter01-section047/source.json',
    parentPath: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section047.display.json',
    notesPath: 'audit/web/articles/modern-yabejp-ja/chapter01-section047.0dcafc25b6ad5686171ab4a90472ee7fdc69a651ed9be98c8a5a411646e551dc.retry-1792965844463-86544923.json',
    expectedParentSha: '0dcafc25b6ad5686171ab4a90472ee7fdc69a651ed9be98c8a5a411646e551dc',
    expectedNotesSha: '3d5a7175621388527f9a3af6158cb21eb8bb83338acdcf2d0d214a8d691aad5a',
  },
];

const dataPath = v => {
  const p = resolve(processing, v), r = relative(processing, p);
  if (!r || isAbsolute(r) || r.startsWith('..')) throw Error('outside_processing:' + v);
  return p;
};
const errors = [];
for (const p of ['STOP', 'web-production/v1/STOP', 'model-admission-stop.json']) if (existsSync(join(processing, p))) errors.push('stop_present:' + p);

// dual-slot entry, read-only legacy-lock evidence (unchanged from batch 2/3)
const slots = join(processing, 'parallel/slots.mjs');
if (!existsSync(slots)) errors.push('parallel_slots_missing');
else {
  const s = await readFile(slots, 'utf8');
  if (!/const MAX_MAKER_SLOTS = 2;/.test(s)) errors.push('maker_slot_limit_not_2');
  if (/production-lane\.lock/.test(s)) errors.push('slots_touch_old_lock');
}
if (existsSync(join(processing, 'parallel/slots/maker-B.json'))) errors.push('maker_B_slot_already_live');
const lockPath = join(processing, 'production-lane.lock');
if (!existsSync(lockPath)) errors.push('legacy_lock_missing');
const lockStat = await stat(lockPath), lockBytes = await readFile(lockPath);
const legacyLock = {
  path: 'production-lane.lock', sha256: sha(lockBytes), size: lockStat.size, mtime: lockStat.mtime.toISOString(), contentHex: lockBytes.toString('hex'),
  note: 'read-only evidence; the dual-slot contract keeps this legacy lock untouched. B capacity is the maker-B slot.',
};
const codex = join(process.env.APPDATA ?? 'C:/Users/Roland/AppData/Roaming', 'npm', 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
if (!existsSync(codex)) errors.push('codex_cli_missing');
const dictBytes = await readFile(dataPath(dictRel)), dict = JSON.parse(dictBytes);
if (dict.schema !== 'coach-textbook-verified-tile-dictionary/1') errors.push('dictionary_schema');
const verifiedBytes = await readFile(dataPath(verifiedRel));

// joint exclusion gate (the actual fix)
const jointBytes = await readFile(dataPath(jointPath));
const joint = JSON.parse(jointBytes);
if (joint.schema !== 'coac269-joint-exclusion-precheck/1') errors.push('joint_exclusion_schema');
if (!joint.incidentControlsOk) errors.push('joint_exclusion_incident_controls_failed');
const eligibleIds = new Set((joint.eligibleRepairTargets || []).map(e => e.chapterId));
const eligibleById = new Map((joint.eligibleRepairTargets || []).map(e => [e.chapterId, e]));

// claim index keyed by chapterId (and chapterId + candidate sha)
const claimDirs = [join(processing, 'parallel/claims'), join(ns, 'claims')];
const claimsByChapter = new Map();
for (const dir of claimDirs) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let j; try { j = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    if (!j.chapterId) continue;
    if (!claimsByChapter.has(j.chapterId)) claimsByChapter.set(j.chapterId, []);
    claimsByChapter.get(j.chapterId).push({path: relative(processing, join(dir, f)).replaceAll('\\', '/'), owner: j.owner ?? null, parentSha256: j.parentCandidate?.sha256 ?? j.candidateSha256 ?? null, plannedOutput: j.plannedOutput ?? null});
  }
}

const out = {
  schema: 'coac269-web-revision-preflight/1',
  batch: 'b4',
  recordedAt: new Date().toISOString(),
  ticket: 'COAC-269',
  line: 'B-ordinary-web-targeted-revision',
  variant,
  modelCalls: 0,
  productionCalls: 0,
  selectionRule: 'zero-call joint exclusion by canonical original chapter id over latest active preview unit-map/selection + latest unified register + latest passed receipts bound to current source sha; then chapterId + current candidateSHA claim; then the revision-entry guards',
  jointExclusion: {path: jointPath.replaceAll('\\', '/'), sha256: sha(jointBytes), recordedAt: joint.recordedAt, eligibleRepairTargets: [...eligibleIds], incidentControlsOk: joint.incidentControlsOk},
  incidentRegression: {},
  excluded: {
    'nemata-jp-chapter-246-1': 'covered: active preview selectedWeb + unified register covered-effective + passed receipt chapter06-section002.rev1.json (bbf15bbd…); duplicate production of 2026-10-27 b2 is withdrawn, not deleted',
    'nemata-jp-chapter-237-1': 'covered: active preview selectedWeb + unified register covered-effective + passed receipt chapter04-section016.rev1.json (d14aac65…); duplicate production of 2026-10-27 b2 is withdrawn, not deleted',
    'nemata-jp-chapter-131-1': 'covered: active preview selectedWeb + unified register covered-effective + passed receipt chapter01-section049.rev1.json (20e84a64…); duplicate production of 2026-10-27 b3 is withdrawn, not deleted',
    'nemata-jp-chapter-347-1': 'parent-review gap: r1 parent audit has 0 figureChecks for 27 figures; skipped per instruction',
  },
  slotEntry: {mechanism: 'parallel/slots.mjs', owner: 'COAC-269 Ticket executor', lane: 'B', maxMakerSlots: 2, maxLiveSlotsVerified: 15, verification: 'parallel/verification-20261027.json'},
  legacyLock,
  dictionary: {path: dictRel, sha256: sha(dictBytes)},
  verifiedAssets: {path: verifiedRel, sha256: sha(verifiedBytes)},
  chapters: [],
};

// regression self-test: the three incident chapters must be refused by the joint gate
for (const [cid, expectCovered] of [['nemata-jp-chapter-246-1', true], ['nemata-jp-chapter-237-1', true], ['nemata-jp-chapter-131-1', true]]) {
  const c = (joint.incidentControls || {})[cid];
  if (!c || c.covered !== expectCovered) errors.push('incident_regression:' + cid + ':not_excluded');
  out.incidentRegression[cid] = {covered: !!(c && c.covered), reasons: c ? c.reasons : []};
}

for (const c of cases) {
  const rec = {chapterId: c.chapterId, articleId: c.articleId, checks: [], errors: []};
  const fail = m => { rec.errors.push(m); errors.push(c.chapterId + ':' + m); };

  // 1) joint exclusion gate
  if (!eligibleIds.has(c.chapterId)) fail('chapter_already_covered_by_joint_exclusion');

  // 2) claim binding: chapterId + current candidateSHA, no conflicting live claim
  const existing = claimsByChapter.get(c.chapterId) || [];
  const conflicts = existing.filter(x => x.parentSha256 && x.parentSha256 !== c.expectedParentSha);
  if (conflicts.length) fail('claim_conflict:' + conflicts.map(x => x.path).join(','));
  rec.claim = {key: c.chapterId + ':' + c.expectedParentSha, existing: existing, conflicts};

  // 3) input guards (same as batch 2/3)
  const sb = await readFile(dataPath(c.sourcePath)), s = JSON.parse(sb);
  const pb = await readFile(dataPath(c.parentPath)), p = JSON.parse(pb);
  const nb = await readFile(dataPath(c.notesPath)), n = JSON.parse(nb);
  rec.source = {path: c.sourcePath, sha256: sha(sb), language: s.language, status: s.status, blocks: s.blocks.length, assets: s.assets.length};
  rec.parent = {path: c.parentPath, sha256: sha(pb), schema: p.schema, textBlocks: p.body.blocks.filter(b => b.type === 'text').length, figures: p.figures.length};
  rec.notes = {path: c.notesPath, sha256: sha(nb), schema: n.schema, status: n.status, recordedAt: n.recordedAt};
  if (sha(pb) !== c.expectedParentSha) fail('parent_sha_not_claimed');
  if (sha(nb) !== c.expectedNotesSha) fail('notes_sha_not_claimed');
  if (s.schema !== 'coach-textbook-web-article-source/1' || s.language !== 'ja') fail('source_schema_language');
  if (s.status !== 'captured-not-translated-or-audited' || s.assets.some(a => a.status !== 'downloaded')) fail('source_status_assets');
  for (const b of [s.html, s.main, ...s.assets]) {
    const q = join(processing, 'web-sources/v1', b.path);
    if (!existsSync(q) || sha(await readFile(q)) !== b.sha256) { fail('source_dependency:' + b.path); break; }
  }
  const copy = {...p}; delete copy.candidateSha256;
  if (sha(JSON.stringify(copy)) !== p.candidateSha256) fail('parent_self_sha');
  if (p.schema !== 'coach-textbook-web-article-draft/1') fail('parent_schema');
  if (p.source.sourceSha256 !== sha(sb) || p.source.sourceId !== s.sourceId || p.source.articleId !== s.articleId) fail('parent_source_binding');
  if (p.body.mode !== 'translated') fail('parent_body_mode');
  if (n.schema !== 'coach-textbook-web-article-audit/1' || n.status !== 'needs-repair') fail('notes_status');
  if (n.production.sha256 !== sha(pb)) fail('notes_production_binding');
  if (n.source.sourceSha256 !== sha(sb)) fail('notes_source_binding');

  // 4) revision-entry guards
  const issues = (n.modelReview.issues ?? []).filter(x => x.severity !== 'source-note');
  const textBlockIds = [...new Set(issues.map(x => x.targetId))];
  const textBlocks = p.body.blocks.filter(b => b.type === 'text'), bc = new Map((n.modelReview.blockChecks ?? []).map(x => [x.id, x.verdict])), fc = new Map((n.modelReview.figureChecks ?? []).map(x => [x.id, x.verdict]));
  if (!textBlockIds.length) fail('no_text_targets');
  if (textBlockIds.some(id => !textBlocks.some(b => b.sourceBlockIds.length === 1 && b.sourceBlockIds[0] === id))) fail('target_not_single_text_block');
  if (textBlocks.some(b => !textBlockIds.includes(b.sourceBlockIds[0]) && bc.get(b.sourceBlockIds[0]) !== 'faithful')) fail('non_target_text_without_faithful_check');
  if (p.figures.some(f => fc.get(f.figureId) !== 'faithful')) fail('figure_without_faithful_check');

  // 5) projection
  const sourceIndex = new Map(s.blocks.map((b, i) => [b.id, i]));
  const targets = textBlockIds.map(id => {
    const b = p.body.blocks.find(x => x.type === 'text' && x.sourceBlockIds[0] === id);
    const at = sourceIndex.get(id);
    const ctx = s.blocks.filter((x, j) => x.paragraphId === s.blocks[at].paragraphId || Math.abs(j - at) <= 2).map(x => x.id);
    return {sourceBlockId: id, sourceText: b.sourceText, priorTranslation: b.text, paragraphId: b.paragraphId, contextIds: ctx};
  });
  const contextIds = [...new Set(targets.flatMap(t => t.contextIds))];
  const outputPath = `web-production/v1/candidates/modern-yabejp-ja/${c.articleId}.${variant}.json`;
  if (existsSync(join(processing, outputPath))) fail('variant_output_exists');
  let dictMissing = 0;
  for (const b of s.blocks) {
    if (b.type !== 'image-run') continue;
    for (const im of b.images) {
      const a = s.assets.find(x => x.assetId === im.assetId);
      if (!dict.acceptedAssets.some(e => e.sha256 === a.sha256 && e.url === a.url)) dictMissing++;
    }
  }
  rec.targets = targets; rec.contextBlockIds = contextIds; rec.dictionaryUnboundImages = dictMissing; rec.outputPath = outputPath;
  rec.checks.push('joint_exclusion', 'claim_binding', 'source_binding', 'parent_self_sha', 'notes_binding', 'target_projection', 'non_target_faithful_blocks', 'all_figures_faithful', 'dictionary_coverage', 'no_existing_variant');
  out.chapters.push(rec);
}

out.ok = errors.length === 0;
out.errors = errors;
const fileName = `preflight-b4-${sha(JSON.stringify(out.chapters)).slice(0, 16)}.json`;
await writeFile(join(ns, 'preflight', fileName), JSON.stringify(out, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
console.log(JSON.stringify({
  ok: out.ok, errors: out.errors, receipt: `web-production/v1/coac269-20261027/preflight/${fileName}`,
  jointExclusion: out.jointExclusion.sha256, incidentRegression: out.incidentRegression,
  chapters: out.chapters.map(c => ({chapterId: c.chapterId, parentSha256: c.parent.sha256, notesSha256: c.notes.sha256, sourceSha256: c.source.sha256, targets: c.targets.map(t => t.sourceBlockId), context: c.contextBlockIds.length, dictionaryUnboundImages: c.dictionaryUnboundImages, outputPath: c.outputPath, claimKey: c.claim.key, errors: c.errors})),
}, null, 2));
process.exit(out.ok ? 0 : 1);
