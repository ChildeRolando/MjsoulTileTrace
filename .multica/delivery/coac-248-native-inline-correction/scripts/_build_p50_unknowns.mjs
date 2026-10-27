// Build the page-scoped unknowns-evidence revision for 79-cn page 50.
// Only the single verified unknowns entry changes; the body, captions and the
// tile transcription stay byte-identical to the preserved parent.
import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const PARENT_ROOT_REL = 'production/sol-high-full';
const NEW_ROOT_REL = 'production/sol-high-field-repair-20261027-p50-unknowns';
const PAGE = 50, PAGE_NO = '0050';
const PARENT_SHA = '6d33c81805e404c9dcacda38075ea644e3d2401cc0205b1a7732ff2a49097dac';
const ORIGINAL_AUDIT = 'audit/pages/79-cn/page-0050.6d33c81805e404c9dcacda38075ea644e3d2401cc0205b1a7732ff2a49097dac.c398d43a97fc.json';
const CALL_ID = 'a3e9c917-1f4c-47ea-a942-f05dbfd2eb1b';

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const writeJson = async (p, v) => { await mkdir(dirname(abs(p)), {recursive: true}); await writeFile(abs(p), JSON.stringify(v, null, 2) + '\n'); };

const FROM = ['牌列右侧的细小灰色符号不够清晰，无法确认具体字符。'];
const TO = ['牌列右侧紧贴框线的痕迹是嵌图右缘的2×7像素裁切残片：同书p49-b12、p166-b11同位置同形，PDF文本层该处只有两个空格span、无字形，也没有drawing/annotation；它不是可转录字符，不改变牌列牌形。'];

const parentPath = `${PARENT_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`;
const parentBytes = await readFile(abs(parentPath));
const parentSha256 = sha(parentBytes);
if (parentSha256 !== PARENT_SHA) throw Error('parent sha mismatch');
const parent = JSON.parse(parentBytes.toString('utf8'));

const rawRel = `${PARENT_ROOT_REL}/raw-calls/${CALL_ID}.json`;
const rawBytes = await readFile(abs(rawRel));
const raw = JSON.parse(rawBytes.toString('utf8'));

const figure = parent.figures.find(f => f.figureId === '79-cn-p50-r2');
const rawFigure = raw.parsedOutput.figures.find(f => f.regionId === '79-cn-p50-r2');
if (!figure || !rawFigure) throw Error('r2 figure missing');
if (!same(figure.unknowns, FROM) || !same(rawFigure.unknowns, FROM)) throw Error('unknowns source drifted');

const sourcePagePath = '79-cn/pages/050.json';
const sourcePageBytes = await readFile(abs(sourcePagePath));
const notesBytes = await readFile(abs(ORIGINAL_AUDIT));
const originalAudit = JSON.parse(notesBytes.toString('utf8'));

const assetSha = figure.sourceImageSha256s[0];
const change = {
  target: 'figure', figureId: '79-cn-p50-r2', field: 'unknowns',
  fromValue: FROM, toValue: TO,
  replacements: [{from: FROM[0], to: TO[0], occurrences: 1}],
  sourceEvidence: 'The asset 79-cn-p50-b12 (ad469a89...) shows the six tiles 134556s and, inside the image, a 2x7 px dark sliver one to two columns right of the tile border at mid-height. The same sliver appears at the same relative position on p49-b12 and p166-b11; of 98 inline tile strips in the book only those three carry it. The PDF text layer has only two space spans there and no drawing or annotation outside the image rect, so it is a slicing artefact of the embedded asset, not a printed character.',
  sourceCrop: {path: `assets/${assetSha}.png`, sha256: assetSha},
};

const candidate = structuredClone(parent);
candidate.figures.find(f => f.figureId === '79-cn-p50-r2').unknowns = TO;
candidate.provenance.sourceFieldCorrection = {
  schema: 'coach-native-inline-field-correction/1',
  route: 'page-scoped-unknowns-evidence',
  sourceId: '79-cn', page: PAGE,
  parentPath, parentSha256,
  notesPath: ORIGINAL_AUDIT, notesSha256: sha(notesBytes),
  originalProductionRaw: {path: rawRel, sha256: sha(rawBytes)},
  sourcePageDataSha256: sha(sourcePageBytes),
  newProductionModelCalls: 0,
  changes: [change],
};
const withoutDigest = {...candidate};
delete withoutDigest.candidateSha256;
candidate.candidateSha256 = sha(JSON.stringify(withoutDigest));

const candidatePath = `${NEW_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`;
await writeJson(candidatePath, candidate);
const candidateSha256 = sha(await readFile(abs(candidatePath)));

const n = candidate.provenance.sourceFieldCorrection;
const proofPath = `audit/source-corrections/proofs/native-inline-p${PAGE}.${candidateSha256}.json`;
const proof = {
  schema: 'coach-native-inline-field-correction-proof/1',
  candidateSha256, parentSha256, parentPath,
  originalAudit: {path: ORIGINAL_AUDIT, sha256: sha(notesBytes), status: originalAudit.status},
  originalProductionRaw: n.originalProductionRaw,
  sourcePage: {path: sourcePagePath, sha256: sha(sourcePageBytes)},
  sourceFieldCorrection: n,
};
await writeJson(proofPath, proof);
const proofSha256 = sha(await readFile(abs(proofPath)));

const approvalPath = 'audit/source-corrections/native-inline-field-corrections.p50.root-acceptance.json';
const approval = {
  schema: 'coach-native-inline-field-corrections-approval/1',
  status: 'accepted-exact-native-field-corrections-only',
  approvedBy: 'root',
  approvedAt: '2026-10-27T09:40:00.000Z',
  approvalBasis: {
    commentId: '01a17ae6-9e33-7829-af2b-0bf303f2fc9f',
    scope: 'Page-level and item-level unknowns evidence revision for 79-cn page 50 only: the single verified 2x7 px right-edge crop fragment record may be replaced with its source finding; body text, captions and tile shapes stay unchanged; an independent audit must confirm the mark is a non-body crop fragment before the item is cleared. Original unknown wording, parent candidate, raw call and failed audit are preserved.',
  },
  jobs: [{
    schema: 'coach-native-inline-field-correction-job/1',
    sourceId: '79-cn', page: PAGE,
    candidatePath, candidateSha256,
    parentPath, parentSha256,
    originalAuditPath: ORIGINAL_AUDIT,
    originalAuditSha256: sha(notesBytes),
    originalProductionRaw: n.originalProductionRaw,
    sourcePagePath,
    sourcePageDataSha256: n.sourcePageDataSha256,
    proofPath, proofSha256,
    changes: [change],
    originalReviewErrors: originalAudit.modelChecks.errors,
  }],
};
await writeJson(approvalPath, approval);
const approvalSha256 = sha(await readFile(abs(approvalPath)));

await copyFile(abs(`${PARENT_ROOT_REL}/manifest.json`), abs(`${NEW_ROOT_REL}/manifest.json`));
const callLine = (await readFile(abs(`${PARENT_ROOT_REL}/calls.jsonl`), 'utf8')).split('\n').filter(Boolean).find(l => { const c = JSON.parse(l); return c.page === PAGE && c.sourceId === '79-cn'; });
if (!callLine) throw Error('call record missing');
await mkdir(abs(`${NEW_ROOT_REL}/raw-calls`), {recursive: true});
await writeFile(abs(`${NEW_ROOT_REL}/calls.jsonl`), callLine + '\n');
await copyFile(abs(rawRel), abs(`${NEW_ROOT_REL}/raw-calls/${CALL_ID}.json`));
await mkdir(abs(`${NEW_ROOT_REL}/renders/79-cn`), {recursive: true});
await copyFile(abs(`${PARENT_ROOT_REL}/renders/79-cn/page-${PAGE_NO}.png`), abs(`${NEW_ROOT_REL}/renders/79-cn/page-${PAGE_NO}.png`));

console.log(JSON.stringify({page: PAGE, candidatePath, candidateSha256, parentSha256, proofPath, proofSha256, approvalPath, approvalSha256, from: FROM, to: TO}, null, 1));
