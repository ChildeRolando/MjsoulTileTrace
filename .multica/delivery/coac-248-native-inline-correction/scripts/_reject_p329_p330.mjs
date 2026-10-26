import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const BASE = 'E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/';
const {loadNativeInlineCorrection} = await import(pathToFileURL(BASE + 'textbook-audit-pdf-native-corrections.mjs').href);
const {checkNativePdfInlineContent} = await import(pathToFileURL(BASE + 'textbook-audit-pdf-native.mjs').href);

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => join(ROOT, p);
const cases = [
  [329, 'production/sol-high-field-repair16-20261027-p329/candidates/nemata-jp/page-0329.json'],
  [330, 'production/sol-high-field-repair17-20261027-p330/candidates/nemata-jp/page-0330.json'],
];

async function expectThrow(label, fn) {
  try { await fn(); console.log(JSON.stringify({label, rejected: 'NO-ERROR'})); }
  catch (e) { console.log(JSON.stringify({label, rejected: e.message})); }
}

for (const [page, candidatePath] of cases) {
  const bytes = await readFile(rel(candidatePath));
  const candidate = JSON.parse(bytes.toString('utf8'));
  const digest = sha(bytes);
  const pageData = JSON.parse(await readFile(rel(`nemata-jp/pages/${page}.json`), 'utf8'));
  const {correctedRaw} = await loadNativeInlineCorrection(ROOT, candidate, digest);
  const approvedFigure = candidate.provenance.sourceFieldCorrection.changes.find(c => c.target === 'figure');

  const t1 = structuredClone(candidate);
  t1.figures[0].unknowns = ['1p'];
  await expectThrow(`${page}: unlisted figure field change`, () => checkNativePdfInlineContent(t1, pageData, null, correctedRaw));

  const t2 = structuredClone(candidate);
  const approvedBlocks = new Set(candidate.provenance.sourceFieldCorrection.changes.flatMap(c => c.sourceBlockIds ?? []));
  const block = t2.body.blocks.find(b => b.type === 'text' && b.sourceBlockIds.every(id => !approvedBlocks.has(id)));
  block.rawSlotText = block.rawSlotText + '改';
  block.text = block.text + '改';
  block.inlineContent = [{type: 'text', text: block.rawSlotText}];
  await expectThrow(`${page}: unlisted paragraph edit`, () => checkNativePdfInlineContent(t2, pageData, null, correctedRaw));

  const t3 = structuredClone(candidate);
  t3.provenance.sourceFieldCorrection.parentSha256 = 'f'.repeat(64);
  await expectThrow(`${page}: wrong parent candidate SHA`, () => loadNativeInlineCorrection(ROOT, t3, digest));

  if (approvedFigure) {
    const t4 = structuredClone(candidate);
    const f = t4.figures.find(x => x.figureId === approvedFigure.figureId);
    f[approvedFigure.field] = approvedFigure.fromValue;
    await expectThrow(`${page}: reverted approved field`, () => checkNativePdfInlineContent(t4, pageData, null, correctedRaw));
  }

  const t5 = structuredClone(candidate);
  const approvedParagraph = candidate.provenance.sourceFieldCorrection.changes.find(c => c.target === 'paragraph');
  if (approvedParagraph) {
    const b = t5.body.blocks.find(x => JSON.stringify(x.sourceBlockIds) === JSON.stringify(approvedParagraph.sourceBlockIds));
    const old = b.rawSlotText;
    b.rawSlotText = old.replace('（校注，非原文：', '（校注，非原文——');
    b.text = b.rawSlotText;
    b.inlineContent = [{type: 'text', text: b.rawSlotText}];
    await expectThrow(`${page}: revision value differs from approved toValue`, () => checkNativePdfInlineContent(t5, pageData, null, correctedRaw));
  }
}
