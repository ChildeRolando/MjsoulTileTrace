import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const PARENT_ROOT_REL = 'production/sol-high-fallback-inline-20261026';
const NEW_ROOT_REL = 'production/sol-high-field-repair21-20261027-p260';
const PAGE = 260;
const CALL_ID = 'd4fcc970-e0b1-4bde-aae5-887f429ef31f';
const PARENT_SHA = 'f9c04f6b68453f9df123cc1c7cf43629ce338af0c40e0bbe843c78f1a09b2958';
const ORIGINAL_AUDIT = 'audit/pages/nemata-jp/page-0260.f9c04f6b68453f9df123cc1c7cf43629ce338af0c40e0bbe843c78f1a09b2958.6baa4a7e1404.json';

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const writeJson = async (p, v) => { await mkdir(dirname(abs(p)), {recursive: true}); await writeFile(abs(p), JSON.stringify(v, null, 2) + '\n'); };
const marker = /\[\[figure:([^\]\r\n]+)\]\]/g;

function render(rawSlotText, figures) {
  const parts = []; let at = 0;
  for (const m of rawSlotText.matchAll(marker)) {
    const f = figures.find(x => x.figureId === m[1]);
    if (!f) throw Error('unknown figure in slot: ' + m[1]);
    if (m.index > at) parts.push({type: 'text', text: rawSlotText.slice(at, m.index)});
    parts.push({type: 'figure', figureId: f.figureId, text: f.caption});
    at = m.index + m[0].length;
  }
  if (at < rawSlotText.length) parts.push({type: 'text', text: rawSlotText.slice(at)});
  return {parts, text: parts.map(p => p.text).join(''), inlineFigureIds: [...rawSlotText.matchAll(marker)].map(m => m[1])};
}
const asset = h => ({path: `assets/${h}.png`, sha256: h});

const CHANGES = [
  {figureId: 'nemata-jp-p260-r5', field: 'transcription',
   from: '9s，直立，非赤牌；正文讨论其靠张价值。', to: '7s，直立，非赤牌；正文讨论其靠张价值。',
   replacements: [{from: '9s，直立', to: '7s，直立', occurrences: 1}],
   sourceEvidence: 'Source block nemata-jp-p260-b46 is the 7s tile: one red bamboo head centred on the first row over two rows of three green bamboos. In this book the 9s is three rows of three and the 8s is the M-shaped four-and-four. The candidate read 9s.',
   sourceCrop: asset('048720c752890b0a80059a85a63f26efc718eacda8fce368debc002aafc2e709')},
  {figureId: 'nemata-jp-p260-r5', field: 'caption',
   from: '9s', to: '7s',
   replacements: [{from: '9s', to: '7s', occurrences: 1}],
   sourceEvidence: 'Same 7s tile as the transcription change; the caption is the inline text of the merged paragraph b8-b10.',
   sourceCrop: asset('048720c752890b0a80059a85a63f26efc718eacda8fce368debc002aafc2e709')},

  {figureId: 'nemata-jp-p260-r21', field: 'transcription',
   from: '宝牌：6p，直立，标注的是宝牌而非宝牌指示牌。手牌从左至右：455567m 6p 2336887s，共14张，全部直立。三张5m均为普通五万，非赤五。末张7s没有单独的摸牌文字标注。',
   to: '宝牌：6p，直立，标注的是宝牌而非宝牌指示牌。手牌从左至右：455567m 6p 2334557s，共14张，全部直立。三张5m均为普通五万，非赤五。末张7s没有单独的摸牌文字标注。',
   replacements: [{from: '2336887s', to: '2334557s', occurrences: 1}],
   sourceEvidence: 'Source block nemata-jp-p260-b63 is the 14-tile hand strip. Read left to right: 4m 5m 5m 5m 6m 7m (四五六), 6p, then 2s 3s 3s 4s 5s 5s 7s. The 4s is the 2x2 four-bamboo tile, the two 5s are red-centred five-bamboo tiles, and the last tile is the 7s (red head over 3+3). The candidate read 6s 8s 8s for the last three sou tiles while its own prose already said 7s.',
   sourceCrop: asset('5f603091e1dac993bc3910c43e88cfe88f94e96730f7479f65e13d51370f63c1')},
  {figureId: 'nemata-jp-p260-r21', field: 'caption',
   from: '宝牌6p；手牌455567m 6p 2336887s', to: '宝牌6p；手牌455567m 6p 2334557s',
   replacements: [{from: '2336887s', to: '2334557s', occurrences: 1}],
   sourceEvidence: 'Same corrected hand strip; the caption carries the hand into paragraph b28.',
   sourceCrop: asset('5f603091e1dac993bc3910c43e88cfe88f94e96730f7479f65e13d51370f63c1')},

  {figureId: 'nemata-jp-p260-r26', field: 'transcription',
   from: '弃牌候选从左至右：2s、3s、5s、9s，紧邻排列，全部直立。5s为普通五索，非赤五；这四张是备选弃牌的列举。',
   to: '弃牌候选从左至右：2s、3s、5s、7s，紧邻排列，全部直立。5s为普通五索，非赤五；这四张是备选弃牌的列举。',
   replacements: [{from: '5s、9s', to: '5s、7s', occurrences: 1}],
   sourceEvidence: 'Source block nemata-jp-p260-b68 holds four tiles: 2s (two green), 3s (three green), 5s (four green corners around a red centre) and 7s (red head over 3+3). The fourth is 7s, not 9s.',
   sourceCrop: asset('a07ca43632977dfabd77a4e2368fb0cd24ff21b5f95537df5867847c7083b340')},
  {figureId: 'nemata-jp-p260-r26', field: 'caption',
   from: '2359s', to: '2357s',
   replacements: [{from: '2359s', to: '2357s', occurrences: 1}],
   sourceEvidence: 'Same four discard candidates; the caption carries them into paragraph b34-b35.',
   sourceCrop: asset('a07ca43632977dfabd77a4e2368fb0cd24ff21b5f95537df5867847c7083b340')},

  {figureId: 'nemata-jp-p260-r28', field: 'transcription',
   from: '杂志所述B型血对应的弃牌：9s，直立，非赤牌。', to: '杂志所述B型血对应的弃牌：7s，直立，非赤牌。',
   replacements: [{from: '弃牌：9s', to: '弃牌：7s', occurrences: 1}],
   sourceEvidence: 'Source block nemata-jp-p260-b70 shows the same 7s tile shape (red head over 3+3) as the fourth tile of the r26 strip. The candidate read 9s.',
   sourceCrop: asset('690acb46fc5e0efb04aa2fa15743e4baf3c53b2057be7305eb66a3fa892c522a')},
  {figureId: 'nemata-jp-p260-r28', field: 'caption',
   from: '9s', to: '7s',
   replacements: [{from: '9s', to: '7s', occurrences: 1}],
   sourceEvidence: 'Same 7s tile; the caption carries the B-type discard into paragraph b34-b35.',
   sourceCrop: asset('690acb46fc5e0efb04aa2fa15743e4baf3c53b2057be7305eb66a3fa892c522a')},

  {figureId: 'nemata-jp-p260-r33', field: 'transcription',
   from: '两个分别列出的两嵌形例子：第一组为336s，从左至右3s、3s、6s；第二组为889s，从左至右8s、8s、9s。第一组位于上一行右端，第二组位于下一行左端，是正文换行后的两个独立例子。六张牌均直立，均非赤牌。',
   to: '同一牌形跨行显示：上一行右端为3s、3s、4s，下一行左端续接5s、5s、7s，完整牌形为334557s，只是原排版换行，不是两个独立例子。六张牌均直立，均非赤牌；两张5s均为普通五索，非赤五。',
   replacements: [{from: '两个分别列出的两嵌形例子：第一组为336s，从左至右3s、3s、6s；第二组为889s，从左至右8s、8s、9s。第一组位于上一行右端，第二组位于下一行左端，是正文换行后的两个独立例子。六张牌均直立，均非赤牌。', to: '同一牌形跨行显示：上一行右端为3s、3s、4s，下一行左端续接5s、5s、7s，完整牌形为334557s，只是原排版换行，不是两个独立例子。六张牌均直立，均非赤牌；两张5s均为普通五索，非赤五。', occurrences: 1}],
   sourceEvidence: 'Source block nemata-jp-p260-b75 ends the upper line with 3s, 3s, 4s (the third is the 2x2 four-bamboo tile) and block nemata-jp-p260-b76 starts the next line with 5s, 5s, 7s (two red-centred five-bamboo tiles then the red-head 7s). They are one continuous 334557s shape split by the printed line break, not 336s plus 889s.',
   sourceCrop: asset('6d30ee60f8d23a1c56436efc303e66b6a38d14888b428fa31c07c0b4628f04bd')},
  {figureId: 'nemata-jp-p260-r33', field: 'caption',
   from: '336s／889s', to: '334557s',
   replacements: [{from: '336s／889s', to: '334557s', occurrences: 1}],
   sourceEvidence: 'Same continuous cross-line shape; the caption carries it into paragraph b36-b38 without the artificial separator.',
   sourceCrop: asset('6d30ee60f8d23a1c56436efc303e66b6a38d14888b428fa31c07c0b4628f04bd')},
];

const pageNo = String(PAGE).padStart(4, '0');
const parentPath = `${PARENT_ROOT_REL}/candidates/nemata-jp/page-${pageNo}.json`;
const parentBytes = await readFile(abs(parentPath));
const parentSha256 = sha(parentBytes);
if (parentSha256 !== PARENT_SHA) throw Error('parent sha mismatch');
const parent = JSON.parse(parentBytes.toString('utf8'));
const candidate = structuredClone(parent);

const rawBytes0 = await readFile(abs(`${PARENT_ROOT_REL}/raw-calls/${CALL_ID}.json`));
const raw = JSON.parse(rawBytes0.toString('utf8'));

const changes = [];
for (const spec of CHANGES) {
  const rawFig = raw.parsedOutput.figures.find(f => f.regionId === spec.figureId);
  const candFig = candidate.figures.find(f => f.figureId === spec.figureId);
  if (!rawFig || !candFig) throw Error('figure missing ' + spec.figureId);
  if (rawFig[spec.field] !== spec.from) throw Error(`raw field drift ${spec.figureId}.${spec.field}`);
  if (candFig[spec.field] !== spec.from) throw Error(`candidate field drift ${spec.figureId}.${spec.field}`);
  let value = spec.from;
  for (const r of spec.replacements) {
    if (value.split(r.from).length - 1 !== r.occurrences) throw Error(`replacement not unique ${spec.figureId}.${spec.field}`);
    value = value.replaceAll(r.from, r.to);
  }
  if (value !== spec.to || value === spec.from) throw Error('replacement not exact ' + spec.figureId);
  candFig[spec.field] = spec.to;
  changes.push({
    target: 'figure', figureId: spec.figureId, field: spec.field,
    fromValue: spec.from, toValue: spec.to,
    replacements: spec.replacements,
    sourceEvidence: spec.sourceEvidence, sourceCrop: spec.sourceCrop,
  });
}

let touched = 0;
const touchedIds = [];
for (const block of candidate.body.blocks) {
  if (block.type !== 'text') continue;
  const after = render(block.rawSlotText, candidate.figures);
  if (!same(after.parts, block.inlineContent) || after.text !== block.text) { touched++; touchedIds.push(block.sourceBlockIds.join(',')); }
  block.inlineContent = after.parts;
  block.text = after.text;
  block.inlineFigureIds = after.inlineFigureIds;
}
if (touched !== 4) throw Error('unexpected number of re-rendered blocks: ' + touched);

const sourcePagePath = `nemata-jp/pages/${PAGE}.json`;
const sourcePageBytes = await readFile(abs(sourcePagePath));
const notesBytes = await readFile(abs(ORIGINAL_AUDIT));

const candidatePath = `${NEW_ROOT_REL}/candidates/nemata-jp/page-${pageNo}.json`;
Object.assign(candidate.provenance, {
  sourceFieldCorrection: {
    schema: 'coach-native-inline-field-correction/1',
    sourceId: 'nemata-jp',
    page: PAGE,
    parentPath,
    parentSha256,
    notesPath: ORIGINAL_AUDIT,
    notesSha256: sha(notesBytes),
    originalProductionRaw: {path: `${PARENT_ROOT_REL}/raw-calls/${CALL_ID}.json`, sha256: sha(rawBytes0)},
    sourcePageDataSha256: sha(sourcePageBytes),
    newProductionModelCalls: 0,
    changes,
  },
});
const withoutDigest = {...candidate};
delete withoutDigest.candidateSha256;
candidate.candidateSha256 = sha(JSON.stringify(withoutDigest));
await writeJson(candidatePath, candidate);
const candidateSha256 = sha(await readFile(abs(candidatePath)));

const n = candidate.provenance.sourceFieldCorrection;
const proofPath = `audit/source-corrections/proofs/native-inline-p${PAGE}.${candidateSha256}.json`;
const proof = {
  schema: 'coach-native-inline-field-correction-proof/1',
  candidateSha256, parentSha256, parentPath,
  originalAudit: {path: ORIGINAL_AUDIT, sha256: sha(notesBytes), status: 'needs-repair'},
  originalProductionRaw: n.originalProductionRaw,
  sourcePage: {path: sourcePagePath, sha256: sha(sourcePageBytes)},
  sourceFieldCorrection: n,
};
await writeJson(proofPath, proof);
const proofSha256 = sha(await readFile(abs(proofPath)));

const approvalPath = `audit/source-corrections/native-inline-field-corrections.p${PAGE}.root-acceptance.json`;
const approval = {
  schema: 'coach-native-inline-field-corrections-approval/1',
  status: 'accepted-exact-native-field-corrections-only',
  approvedBy: 'root',
  approvedAt: '2026-10-27T08:30:00.000Z',
  approvalBasis: {
    commentId: '01a17a58-0179-7f34-9c66-812db9413a92',
    scope: `Only the audit-located, source-backed field changes on nemata-jp page ${PAGE}; the original production raw, the parent candidate, the failed audit and the page render are preserved. No new production call.`,
  },
  jobs: [{
    schema: 'coach-native-inline-field-correction-job/1',
    sourceId: 'nemata-jp',
    page: PAGE,
    candidatePath, candidateSha256,
    parentPath, parentSha256,
    originalAuditPath: ORIGINAL_AUDIT,
    originalAuditSha256: sha(notesBytes),
    originalProductionRaw: n.originalProductionRaw,
    sourcePagePath,
    sourcePageDataSha256: n.sourcePageDataSha256,
    proofPath, proofSha256,
    changes,
    originalReviewErrors: JSON.parse(notesBytes.toString('utf8')).modelChecks.errors,
  }],
};
await writeJson(approvalPath, approval);
const approvalSha256 = sha(await readFile(abs(approvalPath)));

await copyFile(abs(`${PARENT_ROOT_REL}/manifest.json`), abs(`${NEW_ROOT_REL}/manifest.json`));
const callLine = (await readFile(abs(`${PARENT_ROOT_REL}/calls.jsonl`), 'utf8')).split('\n').filter(Boolean).find(l => JSON.parse(l).page === PAGE);
if (!callLine) throw Error('call record missing');
await mkdir(abs(`${NEW_ROOT_REL}/raw-calls`), {recursive: true});
await writeFile(abs(`${NEW_ROOT_REL}/calls.jsonl`), callLine + '\n');
await copyFile(abs(`${PARENT_ROOT_REL}/raw-calls/${CALL_ID}.json`), abs(`${NEW_ROOT_REL}/raw-calls/${CALL_ID}.json`));
await mkdir(abs(`${NEW_ROOT_REL}/renders/nemata-jp`), {recursive: true});
await copyFile(abs(`${PARENT_ROOT_REL}/renders/nemata-jp/page-${pageNo}.png`), abs(`${NEW_ROOT_REL}/renders/nemata-jp/page-${pageNo}.png`));

console.log(JSON.stringify({page: PAGE, candidatePath, candidateSha256, parentSha256, proofPath, proofSha256, approvalPath, approvalSha256, reRenderedBlocks: touched, touchedIds, changes: changes.length}, null, 1));
for (const block of candidate.body.blocks) {
  if (block.type === 'text' && block.inlineFigureIds?.some(id => ['nemata-jp-p260-r5', 'nemata-jp-p260-r21', 'nemata-jp-p260-r26', 'nemata-jp-p260-r28', 'nemata-jp-p260-r33'].includes(id)))
    console.log('BLOCK', block.sourceBlockIds.join(','), '=>', block.text);
}
