import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const BASE = process.env.NATIVE_CORRECTION_BASE ?? 'E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/';
const {loadNativeInlineCorrection} = await import(pathToFileURL(BASE + 'textbook-audit-pdf-native-corrections.mjs').href);
const {loadNativePageStructureCorrection, verifyNativePageStructureCorrection} = await import(pathToFileURL(BASE + 'textbook-audit-pdf-native-structure-corrections.mjs').href);
const {checkNativePdfInlineContent} = await import(pathToFileURL(BASE + 'textbook-audit-pdf-native.mjs').href);

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const readJson = async p => JSON.parse(await readFile(abs(p), 'utf8'));

const CANDIDATE = 'production/sol-high-field-repair20-20261027-p330/candidates/nemata-jp/page-0330.json';
const PARENT = 'production/sol-high-field-repair17-20261027-p330/candidates/nemata-jp/page-0330.json';
const APPROVAL = 'audit/source-corrections/native-inline-page-structure.p330.root-acceptance.json';

const bytes = await readFile(abs(CANDIDATE));
const candidateSha256 = sha(bytes);
const candidate = JSON.parse(bytes.toString('utf8'));
const page = await readJson('nemata-jp/pages/330.json');
const approval = await readJson(APPROVAL);
const job = approval.jobs.find(j => j.candidateSha256 === candidateSha256);
const diff = await readJson(job.structureDiffPath);
const parentBytes = await readFile(abs(PARENT));
const parent = JSON.parse(parentBytes.toString('utf8'));
const {correctedRaw: baselineRaw} = await loadNativeInlineCorrection(ROOT, parent, sha(parentBytes));
const plan = await readJson(candidate.provenance.nativeSourceFlow.path);
const structureProof = {
  schema: 'coach-native-page-structure-correction-proof/1',
  candidateSha256, parentSha256: job.parentSha256, parentPath: job.parentPath,
  originalAudit: {path: job.originalAuditPath, sha256: job.originalAuditSha256, status: 'needs-repair'},
  originalProductionRaw: job.originalProductionRaw,
  sourcePage: {path: job.sourcePagePath, sha256: job.sourcePageDataSha256},
  structureDiff: {path: job.structureDiffPath, sha256: job.structureDiffSha256},
};

const results = [];
const record = (label, fn) => { try { const v = fn(); results.push({label, outcome: 'ACCEPTED', value: v ?? null}); } catch (e) { results.push({label, outcome: 'rejected', error: e.message}); } };
const recordAsync = async (label, fn) => { try { const v = await fn(); results.push({label, outcome: 'ACCEPTED', value: v ?? null}); } catch (e) { results.push({label, outcome: 'rejected', error: e.message}); } };
const pure = d => verifyNativePageStructureCorrection({candidate, parent, baselineRaw, page, plan, approval, job, diff: d, structureProof, candidateSha256});
const mutate = fn => { const copy = structuredClone(diff); fn(copy); return copy; };
const regionOf = (d, id) => d.newFigures.find(f => f.figureId === id);

// 1. Happy path: the module rebuilds the corrected raw and plan, and the global gate accepts the candidate.
const loaded = await loadNativePageStructureCorrection(ROOT, candidate, candidateSha256);
checkNativePdfInlineContent(candidate, page, loaded.correctedPlan, loaded.correctedRaw);
results.push({label: 'happy path: structural revision accepted by the global gate', outcome: 'ACCEPTED', figures: candidate.figures.length, rawFigures: loaded.correctedRaw.figures.length, planRegions: loaded.correctedPlan.regions.length});

// 2. Missing source image block (漏块): drop b47 from the discard group and keep every other invariant satisfied.
recordAsync('diff: missing block 漏块', () => pure(mutate(d => {
  const f = regionOf(d, 'nemata-jp-p330-ex1-discard');
  f.sourceImageBlockIds = f.sourceImageBlockIds.filter(id => id !== 'nemata-jp-p330-b47');
  f.sourceImageSha256s = f.sourceImageSha256s.filter((_, i) => i !== 2);
  const bs = f.sourceImageBlockIds.map(id => page.blocks.find(b => b.id === id));
  f.bbox = [Math.min(...bs.map(b => b.bbox[0])), Math.min(...bs.map(b => b.bbox[1])), Math.max(...bs.map(b => b.bbox[2])), Math.max(...bs.map(b => b.bbox[3]))];
})));

// 3. Duplicated source image block (重复块).
recordAsync('diff: duplicate block 重复块', () => pure(mutate(d => {
  const f = regionOf(d, 'nemata-jp-p330-ex1-hand');
  f.sourceImageBlockIds = [...f.sourceImageBlockIds, 'nemata-jp-p330-b47'];
  f.sourceImageSha256s = [...f.sourceImageSha256s, page.blocks.find(b => b.id === 'nemata-jp-p330-b47').imageSha256];
  const bs = f.sourceImageBlockIds.map(id => page.blocks.find(b => b.id === id));
  f.bbox = [Math.min(...bs.map(b => b.bbox[0])), Math.min(...bs.map(b => b.bbox[1])), Math.max(...bs.map(b => b.bbox[2])), Math.max(...bs.map(b => b.bbox[3]))];
})));

// 4. Wrong source image SHA (错SHA).
recordAsync('diff: wrong source SHA 错SHA', () => pure(mutate(d => { regionOf(d, 'nemata-jp-p330-ex1-hand').sourceImageSha256s[0] = 'f'.repeat(64); })));

// 5. Wrong reading order (错序): declare the discard first and the hand last.
recordAsync('diff: wrong reading order 错序', () => pure(mutate(d => {
  d.newFigures[0].readingOrder = 2; d.newFigures[1].readingOrder = 1; d.newFigures[2].readingOrder = 0;
})));

// 6. Geometry invented by the diff.
recordAsync('diff: region bbox not derived from source blocks', () => pure(mutate(d => { regionOf(d, 'nemata-jp-p330-ex1-pon').bbox = [0, 0, 500, 500]; })));

// 7. A replaced figure whose record no longer equals the preserved raw.
recordAsync('diff: replaced figure record changed', () => pure(mutate(d => { d.replacedFigures[0].caption += '（改）'; })));

// 8. Flow text change that is not in the explicit replacement list.
recordAsync('diff: unlisted flow text change', () => pure(mutate(d => { d.flowChanges[0].toRawSlotText = d.flowChanges[0].toRawSlotText.replace('碰', '吃'); })));

// 9a. Marker anchored on a line the source block does not have.
recordAsync('diff: marker anchor out of range', () => pure(mutate(d => { d.flowChanges[1].markerLineIndexes = [0, 1, 2, 9]; })));
// 9b. Two markers on the same source line.
recordAsync('diff: duplicate marker anchor', () => pure(mutate(d => { d.flowChanges[1].markerLineIndexes = [0, 1, 2, 2]; })));

// 10. Unaffected-figure digest does not match the preserved raw.
recordAsync('diff: unaffected figure digest changed', () => pure(mutate(d => { d.unaffected.figureDigest = '0'.repeat(64); })));

// 11. Candidate-level unlisted structural change: figure bbox differs from the accepted plan region.
record('candidate: unlisted figure bbox change', () => {
  const t = structuredClone(candidate);
  t.figures.find(f => f.figureId === 'nemata-jp-p330-ex1-hand').bbox = [0, 0, 100, 100];
  checkNativePdfInlineContent(t, page, loaded.correctedPlan, loaded.correctedRaw);
});

// 12. Candidate-level unlisted paragraph edit.
record('candidate: unlisted paragraph edit', () => {
  const t = structuredClone(candidate);
  const b = t.body.blocks.find(x => x.type === 'text' && x.sourceBlockIds.includes('nemata-jp-p330-b12'));
  b.rawSlotText += '改';
  checkNativePdfInlineContent(t, page, loaded.correctedPlan, loaded.correctedRaw);
});

// 13. Candidate-level duplicate figure reference.
record('candidate: figure referenced twice', () => {
  const t = structuredClone(candidate);
  const b = t.body.blocks.find(x => x.type === 'text' && x.sourceBlockIds.includes('nemata-jp-p330-b10'));
  b.rawSlotText = b.rawSlotText.replace('→打', '→打[[figure:nemata-jp-p330-ex1-hand]]');
  checkNativePdfInlineContent(t, page, loaded.correctedPlan, loaded.correctedRaw);
});

// 14. Candidate-level reverted field correction inherited from the parent chain.
record('candidate: reverted parent field correction', () => {
  const t = structuredClone(candidate);
  t.figures.find(f => f.figureId === 'nemata-jp-p330-r1').transcription = '牌形从左至右：125554m，共6张，全部直立；三张5m均为普通五万，非赤五。';
  checkNativePdfInlineContent(t, page, loaded.correctedPlan, loaded.correctedRaw);
});

// 15. Loader: wrong parent candidate SHA.
await recordAsync('loader: wrong parent SHA', async () => {
  const t = structuredClone(candidate);
  t.provenance.sourceStructureCorrection.parentSha256 = 'f'.repeat(64);
  await loadNativePageStructureCorrection(ROOT, t, candidateSha256);
});

// 16. Loader: changed approval bytes (registry pin).
await recordAsync('loader: approval file changed', async () => {
  const tampered = structuredClone(approval);
  tampered.jobs[0].originalReviewErrors = [];
  const path = abs(APPROVAL);
  const original = await readFile(path);
  const {writeFile} = await import('node:fs/promises');
  await writeFile(path, JSON.stringify(tampered));
  try { await loadNativePageStructureCorrection(ROOT, candidate, candidateSha256); }
  finally { await writeFile(path, original); }
});

console.log(JSON.stringify(results, null, 1));
