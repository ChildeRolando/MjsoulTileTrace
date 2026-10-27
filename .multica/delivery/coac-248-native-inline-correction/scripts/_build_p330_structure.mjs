import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const BASE = process.env.NATIVE_CORRECTION_BASE ?? 'E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/';
const {loadNativeInlineCorrection} = await import(pathToFileURL(BASE + 'textbook-audit-pdf-native-corrections.mjs').href);

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const PARENT_ROOT = 'production/sol-high-field-repair17-20261027-p330';
const REVISION_ROOT = 'production/sol-high-field-repair20-20261027-p330';
const PAGE = 330;
const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const readJson = async p => JSON.parse(await readFile(abs(p), 'utf8'));
const writeJson = async (p, v) => { await mkdir(dirname(abs(p)), {recursive: true}); await writeFile(abs(p), JSON.stringify(v, null, 2) + '\n'); };
const canonicalFigure = f => JSON.stringify({regionId: f.regionId, kind: f.kind, transcription: f.transcription, unknowns: f.unknowns, caption: f.caption});
const canonicalFlow = f => JSON.stringify({sourceBlockIds: f.sourceBlockIds, text: f.text});
const digest = items => sha(JSON.stringify(items.map(canonicalFigure)));
const flowDigest = items => sha(JSON.stringify(items.map(canonicalFlow)));

const parentPath = `${PARENT_ROOT}/candidates/nemata-jp/page-0330.json`;
const parentBytes = await readFile(abs(parentPath));
const parentSha256 = sha(parentBytes);
const parent = JSON.parse(parentBytes.toString('utf8'));
if (parent.provenance.sourceFieldCorrection?.parentSha256 !== '859d1d577a7b7406ac3594b3beb9a30415d2acf3c588c09e8a427d1b59d0de8b') throw Error('unexpected parent chain');
const {correctedRaw: baselineRaw} = await loadNativeInlineCorrection(ROOT, parent, parentSha256);
const page = await readJson(`nemata-jp/pages/${PAGE}.json`);
const sourcePageBytes = await readFile(abs(`nemata-jp/pages/${PAGE}.json`));
const planPath = parent.provenance.nativeSourceFlow.path;
const planBytes = await readFile(abs(planPath));
const plan = JSON.parse(planBytes.toString('utf8'));
const originalRaw = parent.provenance.sourceFieldCorrection.originalProductionRaw;
const originalAuditPath = `audit/pages/nemata-jp/page-0330.${parentSha256}.7076217daf84.json`;
const originalAuditBytes = await readFile(abs(originalAuditPath));
const originalAudit = JSON.parse(originalAuditBytes.toString('utf8'));
if (originalAudit.status !== 'needs-repair' || originalAudit.production.sha256 !== parentSha256) throw Error('parent audit binding changed');

const blocks = new Map(page.blocks.map(b => [b.id, b]));
const region = id => plan.regions.find(r => r.regionId === id);
const regionBbox = ids => {
  const bs = ids.map(id => blocks.get(id));
  return [Math.min(...bs.map(b => b.bbox[0])), Math.min(...bs.map(b => b.bbox[1])), Math.max(...bs.map(b => b.bbox[2])), Math.max(...bs.map(b => b.bbox[3]))];
};

const REPLACED = ['r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14'].map(n => `nemata-jp-p330-${n}`);
const SPEC = [
  {
    figureId: 'nemata-jp-p330-ex1-hand',
    sourceImageBlockIds: ['nemata-jp-p330-b38', 'nemata-jp-p330-b41', 'nemata-jp-p330-b45'],
    transcription: '第一例手牌，从左至右：344555m（三萬四萬四萬五萬五萬五萬）与33478s（3s 3s 4s 7s 8s），共11张，全部直立；三张5m均为普通五万，非赤五。',
    caption: '第一例手牌：344555m 33478s',
    unknowns: [],
    crop: 'ex1-hand',
    sourceEvidence: 'Bound source strips b38/b41/b45 of page 330: the left block reads 三萬四萬四萬五萬五萬五萬 (344555m), followed by 3s 3s 4s 7s 8s (33478s); 11 upright tiles, no red five. The third sou tile carries four sticks in a 2x2 arrangement, i.e. 4s, not the 6s recorded by the original production.',
  },
  {
    figureId: 'nemata-jp-p330-ex1-pon',
    sourceImageBlockIds: ['nemata-jp-p330-b39', 'nemata-jp-p330-b42', 'nemata-jp-p330-b43', 'nemata-jp-p330-b46'],
    transcription: '第一例标注「ポン」的碰：左侧横向矩形内为图像加载失败图标，牌面不可读；右侧为两张直立的7z（中、中）。不能据损坏图像补定左端牌面或碰牌来源方向。',
    caption: '第一例碰牌：左端损坏；7z7z',
    unknowns: ['第一例碰牌图左端为图像加载失败图标，牌面不可读，不能补定牌码。', '第一例碰牌来源方向无法从损坏图像确定。'],
    crop: 'ex1-pon',
    sourceEvidence: 'Bound source strips b39/b42/b43/b46 of page 330: the left end of the pon frame is a broken-image placeholder with no readable tile face; the right side is two upright red 中 (7z). The left tile and the pon source direction are not recoverable from the source.',
  },
  {
    figureId: 'nemata-jp-p330-ex1-discard',
    sourceImageBlockIds: ['nemata-jp-p330-b40', 'nemata-jp-p330-b44', 'nemata-jp-p330-b47'],
    transcription: '第一例箭头后所打之牌：4s，单张直立；即手牌中的那张4s。',
    caption: '第一例打4s',
    unknowns: [],
    crop: 'ex1-discard',
    sourceEvidence: 'Bound source strips b40/b44/b47 of page 330: the tile after 「→打」 carries four sticks in a 2x2 arrangement (4s), the same tile as the 4s in the hand; it is not 6s.',
  },
  {
    figureId: 'nemata-jp-p330-ex2-hand',
    sourceImageBlockIds: ['nemata-jp-p330-b48', 'nemata-jp-p330-b51', 'nemata-jp-p330-b55', 'nemata-jp-p330-b60'],
    transcription: '第二例手牌，从左至右：345556m（三萬四萬五萬五萬五萬六萬）与33478s（3s 3s 4s 7s 8s），共11张，全部直立；三张5m均为普通五万，非赤五。',
    caption: '第二例手牌：345556m 33478s',
    unknowns: [],
    crop: 'ex2-hand',
    sourceEvidence: 'Bound source strips b48/b51/b55/b60 of page 330: 三萬四萬五萬五萬五萬六萬 (345556m), then 3s 3s 4s 7s 8s (33478s); 11 upright tiles, no red five. The third sou tile is 4s (four sticks, 2x2), not 6s.',
  },
  {
    figureId: 'nemata-jp-p330-ex2-pon',
    sourceImageBlockIds: ['nemata-jp-p330-b49', 'nemata-jp-p330-b52', 'nemata-jp-p330-b56', 'nemata-jp-p330-b57', 'nemata-jp-p330-b61'],
    transcription: '第二例标注「ポン」的碰：左侧横向矩形内为图像加载失败图标，牌面不可读；右侧为两张直立的7z（中、中）。不能据损坏图像补定左端牌面或碰牌来源方向。',
    caption: '第二例碰牌：左端损坏；7z7z',
    unknowns: ['第二例碰牌图左端为图像加载失败图标，牌面不可读，不能补定牌码。', '第二例碰牌来源方向无法从损坏图像确定。'],
    crop: 'ex2-pon',
    sourceEvidence: 'Bound source strips b49/b52/b56/b57/b61 of page 330: the left end of the pon frame is a broken-image placeholder with no readable tile face; the right side is two upright red 中 (7z).',
  },
  {
    figureId: 'nemata-jp-p330-ex2-discard',
    sourceImageBlockIds: ['nemata-jp-p330-b50', 'nemata-jp-p330-b53', 'nemata-jp-p330-b58', 'nemata-jp-p330-b62'],
    transcription: '第二例箭头后所打之牌：6m（六萬），单张直立。',
    caption: '第二例打6m',
    unknowns: [],
    crop: 'ex2-discard',
    sourceEvidence: 'Bound source strips b50/b53/b58/b62 of page 330: the tile after 「→打」 reads 六萬 (6m), upright.',
  },
  {
    figureId: 'nemata-jp-p330-ex2-used4m',
    sourceImageBlockIds: ['nemata-jp-p330-b54', 'nemata-jp-p330-b59', 'nemata-jp-p330-b63'],
    transcription: '第二例括号内所列之牌：4m（四萬），单张直立；原文说明这是已用掉1张的那张4m。',
    caption: '说明用牌：4m',
    unknowns: [],
    crop: 'ex2-used4m',
    sourceEvidence: 'Bound source strips b54/b59/b63 of page 330: the tile inside the parenthesis reads 四萬 (4m), upright.',
  },
];

const cropDir = `${REVISION_ROOT}/renders/nemata-jp`;
const newFigures = [];
for (const [readingOrder, spec] of SPEC.entries()) {
  const bytes = await readFile(abs(`${cropDir}/page-0330-${spec.crop}.png`));
  newFigures.push({
    readingOrder,
    figureId: spec.figureId,
    bbox: regionBbox(spec.sourceImageBlockIds),
    sourceImageBlockIds: spec.sourceImageBlockIds,
    sourceImageSha256s: spec.sourceImageBlockIds.map(id => blocks.get(id).imageSha256),
    kind: 'mahjong-example',
    transcription: spec.transcription,
    unknowns: spec.unknowns,
    caption: spec.caption,
    chapterId: region(REPLACED[0]).chapterId,
    unitId: region(REPLACED[0]).unitId,
    crop: {path: `${cropDir}/page-0330-${spec.crop}.png`, sha256: sha(bytes)},
    sourceEvidence: spec.sourceEvidence,
  });
}

const flowText = {
  'nemata-jp-p330-b10': {
    from: baselineRaw.pageFlow.find(e => e.kind === 'text' && e.sourceBlockIds.join(',') === 'nemata-jp-p330-b10').text,
    to: '例：[[figure:nemata-jp-p330-ex1-hand]]　碰[[figure:nemata-jp-p330-ex1-pon]]　→打[[figure:nemata-jp-p330-ex1-discard]]',
    fromFigureIds: ['nemata-jp-p330-r6', 'nemata-jp-p330-r7', 'nemata-jp-p330-r8', 'nemata-jp-p330-r9'],
    toFigureIds: ['nemata-jp-p330-ex1-hand', 'nemata-jp-p330-ex1-pon', 'nemata-jp-p330-ex1-discard'],
    markerLineIndexes: [0, 1, 2],
    textReplacements: [
      {from: '，碰', to: '　碰', occurrences: 1},
      {from: ' →打', to: '　→打', occurrences: 1},
      {from: '。', to: '', occurrences: 1},
    ],
    sourceEvidence: 'Source b10 has three lines 例： / 　ポン / 　→打 and the two pon examples each occupy one source row; the hand, the pon and the discard are three separate column groups of that row.',
  },
  'nemata-jp-p330-b11': {
    from: baselineRaw.pageFlow.find(e => e.kind === 'text' && e.sourceBlockIds.join(',') === 'nemata-jp-p330-b11').text,
    to: '例：[[figure:nemata-jp-p330-ex2-hand]]　碰[[figure:nemata-jp-p330-ex2-pon]]　→打[[figure:nemata-jp-p330-ex2-discard]]（[[figure:nemata-jp-p330-ex2-used4m]]已用掉1张）',
    fromFigureIds: ['nemata-jp-p330-r10', 'nemata-jp-p330-r11', 'nemata-jp-p330-r12', 'nemata-jp-p330-r13', 'nemata-jp-p330-r14'],
    toFigureIds: ['nemata-jp-p330-ex2-hand', 'nemata-jp-p330-ex2-pon', 'nemata-jp-p330-ex2-discard', 'nemata-jp-p330-ex2-used4m'],
    markerLineIndexes: [0, 1, 2, 3],
    textReplacements: [
      {from: '，碰', to: '　碰', occurrences: 1},
      {from: ' →打', to: '　→打', occurrences: 1},
      {from: '由于', to: '', occurrences: 1},
      {from: '。', to: '', occurrences: 1},
    ],
    sourceEvidence: 'Source b11 has five lines 例： / 　ポン / 　→打 / （ / １枚使っている分で）; the 4m tile sits inside the parenthesis before 「１枚」, so it follows the 「（」 line.',
  },
};
const flowChanges = Object.entries(flowText).map(([blockId, spec]) => ({
  sourceBlockIds: [blockId],
  fromRawSlotText: spec.from,
  toRawSlotText: spec.to,
  fromFigureIds: spec.fromFigureIds,
  toFigureIds: spec.toFigureIds,
  markerLineIndexes: spec.markerLineIndexes,
  textReplacements: spec.textReplacements,
  sourceEvidence: spec.sourceEvidence,
}));

const replacedFigures = REPLACED.map(id => {
  const raw = baselineRaw.figures.find(f => f.regionId === id), reg = region(id);
  return {figureId: id, bbox: reg.bbox, sourceImageBlockIds: reg.sourceImageBlockIds, sourceImageSha256s: reg.sourceImageSha256s, kind: raw.kind, transcription: raw.transcription, unknowns: raw.unknowns, caption: raw.caption};
});
const changedKeys = new Set(flowChanges.map(c => c.sourceBlockIds.join(',')));
const untouchedFigures = baselineRaw.figures.filter(f => !REPLACED.includes(f.regionId));
const untouchedFlow = baselineRaw.pageFlow.filter(e => e.kind === 'text' && !changedKeys.has(e.sourceBlockIds.join(',')));

const diff = {
  schema: 'coach-native-page-structure-diff/1',
  sourceId: 'nemata-jp',
  page: PAGE,
  parentSha256,
  sourcePageDataSha256: sha(sourcePageBytes),
  regionPadding: 0,
  baseline: originalRaw,
  scope: 'Only the two pon examples of page 330: re-group the existing row-slice image blocks of the first two examples into one hand / pon / discard region per example, in source reading order. No page re-production, no new model call, no other figure or paragraph changed. The same revision records the source-backed 33478s hand code and the 4s discard that the original production had transcribed as 33678s / 6s.',
  replacedFigures,
  newFigures,
  flowChanges,
  unaffected: {figureCount: untouchedFigures.length, figureDigest: digest(untouchedFigures), flowCount: untouchedFlow.length, flowDigest: flowDigest(untouchedFlow)},
  routeNote: 'The first structural candidate for this diff was rejected by the page-scoped route before any model review, with audit_native_structure_original_raw_changed: the gate compared the parent field-corrected baseline against the original production raw. The route now binds the original raw to the production artifact and the baseline separately; zero review calls were consumed by that attempt. This revision re-states the same structural diff under the corrected route.',
};

// Candidate revision 2: parent (revision 1, field-corrected) + structural replacement.
const candidate = structuredClone(parent);
delete candidate.provenance.sourceFieldCorrection;
candidate.figures = [
  ...candidate.figures.filter(f => !REPLACED.includes(f.figureId)),
  ...newFigures.map(f => ({
    figureId: f.figureId, bbox: f.bbox, pageImageSha256: parent.figures[0].pageImageSha256,
    croppedImagePath: f.crop.path, croppedImageSha256: f.crop.sha256,
    chapterId: f.chapterId, unitId: f.unitId,
    sourceImageBlockIds: f.sourceImageBlockIds, sourceImageSha256s: f.sourceImageSha256s,
    inlineWithTextBlockIds: flowChanges.filter(c => c.toFigureIds.includes(f.figureId)).flatMap(c => c.sourceBlockIds),
    kind: f.kind, transcription: f.transcription, unknowns: f.unknowns, caption: f.caption,
  })),
];
const captionById = new Map(newFigures.map(f => [f.figureId, f.caption]));
const marker = /\[\[figure:([^\]\r\n]+)\]\]/g;
for (const change of flowChanges) {
  const block = candidate.body.blocks.find(b => b.type === 'text' && b.sourceBlockIds.join(',') === change.sourceBlockIds.join(','));
  if (!block) throw Error('flow block missing ' + change.sourceBlockIds);
  const parts = [];
  let at = 0;
  for (const match of change.toRawSlotText.matchAll(marker)) {
    if (match.index > at) parts.push({type: 'text', text: change.toRawSlotText.slice(at, match.index)});
    parts.push({type: 'figure', figureId: match[1], text: captionById.get(match[1])});
    at = match.index + match[0].length;
  }
  if (at < change.toRawSlotText.length) parts.push({type: 'text', text: change.toRawSlotText.slice(at)});
  block.rawSlotText = change.toRawSlotText;
  block.inlineContent = parts;
  block.inlineFigureIds = [...change.toRawSlotText.matchAll(marker)].map(m => m[1]);
  block.text = parts.map(p => p.text).join('');
}
const nextFigureIndex = new Map(newFigures.map(f => [f.figureId, f.figureId]));
candidate.imageCoverage = candidate.imageCoverage.map(entry => {
  const owner = newFigures.find(f => f.sourceImageBlockIds.includes(entry.blockId));
  return owner ? {...entry, regionId: owner.figureId} : entry;
});
if (candidate.imageCoverage.some(e => REPLACED.includes(e.regionId))) throw Error('stale image coverage region');
const blockCount = flowChanges.reduce((n, c) => n + c.markerLineIndexes.length, 0);
if (blockCount !== newFigures.length) throw Error('figure/flow marker mismatch');
if (nextFigureIndex.size !== newFigures.length) throw Error('duplicate new figure id');

candidate.provenance.sourceStructureCorrection = {
  schema: 'coach-native-page-structure-correction/1',
  sourceId: 'nemata-jp',
  page: PAGE,
  parentPath,
  parentSha256,
  notesPath: originalAuditPath,
  notesSha256: sha(originalAuditBytes),
  originalProductionRaw: originalRaw,
  sourcePageDataSha256: sha(sourcePageBytes),
  newProductionModelCalls: 0,
  structureDiffPath: '',
  structureDiffSha256: '',
};
const diffPath = `audit/source-corrections/diffs/native-inline-page-structure.p330.${parentSha256}.json`;
await writeJson(diffPath, diff);
const diffSha256 = sha(await readFile(abs(diffPath)));
candidate.provenance.sourceStructureCorrection.structureDiffPath = diffPath;
candidate.provenance.sourceStructureCorrection.structureDiffSha256 = diffSha256;
const withoutDigest = {...candidate};
delete withoutDigest.candidateSha256;
candidate.candidateSha256 = sha(JSON.stringify(withoutDigest));
candidate.status = 'draft';
candidate.productionStatus = 'draft-awaiting-independent-review';
const candidatePath = `${REVISION_ROOT}/candidates/nemata-jp/page-0330.json`;
await writeJson(candidatePath, candidate);
const candidateFileBytes = await readFile(abs(candidatePath));
const candidateSha256 = sha(candidateFileBytes);

const proof = {
  schema: 'coach-native-page-structure-correction-proof/1',
  candidateSha256,
  parentSha256,
  parentPath,
  originalAudit: {path: originalAuditPath, sha256: sha(originalAuditBytes), status: originalAudit.status},
  sourcePage: {path: `nemata-jp/pages/${PAGE}.json`, sha256: sha(sourcePageBytes)},
  originalProductionRaw: originalRaw,
  structureDiff: {path: diffPath, sha256: diffSha256},
};
const proofPath = `audit/source-corrections/proofs/native-inline-page-structure.p330.${candidateSha256}.json`;
await writeJson(proofPath, proof);
const proofSha256 = sha(await readFile(abs(proofPath)));

const approval = {
  schema: 'coach-native-page-structure-corrections-approval/1',
  status: 'accepted-exact-native-page-structure-only',
  approvedBy: 'root',
  approvedAt: '2026-10-27T00:00:00.000Z',
  approvalBasis: {
    commentId: '01a17a7e-21cf-77f2-9250-fc81d43bc2bd',
    scope: 'Page 330 only: restore the two source pon examples as hand -> pon -> discard, reusing the existing source image blocks; parent raw, parent candidate and the failed audits retained; no new production call and no global binding rule loosened.',
  },
  jobs: [{
    schema: 'coach-native-page-structure-correction-job/1',
    sourceId: 'nemata-jp',
    page: PAGE,
    candidatePath,
    candidateSha256,
    parentPath,
    parentSha256,
    originalAuditPath,
    originalAuditSha256: sha(originalAuditBytes),
    originalProductionRaw: originalRaw,
    sourcePagePath: `nemata-jp/pages/${PAGE}.json`,
    sourcePageDataSha256: sha(sourcePageBytes),
    structureDiffPath: diffPath,
    structureDiffSha256: diffSha256,
    proofPath,
    proofSha256,
    originalReviewErrors: originalAudit.modelChecks.errors,
  }],
};
const approvalPath = 'audit/source-corrections/native-inline-page-structure.p330.root-acceptance.json';
await writeJson(approvalPath, approval);
const approvalSha256 = sha(await readFile(abs(approvalPath)));

// Revision root housekeeping: same manifest, the one production call, its raw artifact and the page render.
await mkdir(abs(`${REVISION_ROOT}/raw-calls`), {recursive: true});
await copyFile(abs(`${PARENT_ROOT}/manifest.json`), abs(`${REVISION_ROOT}/manifest.json`));
const callLine = (await readFile(abs(`${PARENT_ROOT}/calls.jsonl`), 'utf8')).split('\n').filter(Boolean).find(l => JSON.parse(l).page === PAGE);
if (!callLine) throw Error('call record missing');
await writeFile(abs(`${REVISION_ROOT}/calls.jsonl`), callLine + '\n');
const callId = JSON.parse(callLine).callId;
await copyFile(abs(`${PARENT_ROOT}/raw-calls/${callId}.json`), abs(`${REVISION_ROOT}/raw-calls/${callId}.json`));
await copyFile(abs(`${PARENT_ROOT}/renders/nemata-jp/page-0330.png`), abs(`${REVISION_ROOT}/renders/nemata-jp/page-0330.png`));

console.log(JSON.stringify({
  page: PAGE, candidatePath, candidateSha256, parentSha256, diffPath, diffSha256, proofPath, proofSha256, approvalPath, approvalSha256,
  replaced: replacedFigures.length, created: newFigures.length, flowChanges: flowChanges.length,
}, null, 1));
