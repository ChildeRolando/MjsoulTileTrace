import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const BASE = process.env.NATIVE_CORRECTION_BASE
  ?? 'E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/';
const {loadNativeInlineCorrection} = await import(pathToFileURL(BASE + 'textbook-audit-pdf-native-corrections.mjs').href);
const {checkNativePdfInlineContent} = await import(pathToFileURL(BASE + 'textbook-audit-pdf-native.mjs').href);

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => join(ROOT, p);
const candidatePath = 'production/sol-high-field-repair21-20261027-p260/candidates/nemata-jp/page-0260.json';

const bytes = await readFile(rel(candidatePath));
const digest = sha(bytes);
const pageData = JSON.parse(await readFile(rel('nemata-jp/pages/260.json'), 'utf8'));
const base = JSON.parse(bytes.toString('utf8'));

async function expectReject(name, mutate, code) {
  const candidate = structuredClone(base);
  mutate(candidate);
  try {
    const {correctedRaw} = await loadNativeInlineCorrection(ROOT, candidate, digest);
    checkNativePdfInlineContent(candidate, pageData, null, correctedRaw);
  } catch (error) {
    const message = String(error?.message ?? error);
    const ok = message.includes(code);
    console.log(JSON.stringify({case: name, expected: code, got: message.split(':')[0], ok}));
    if (!ok) process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({case: name, expected: code, got: 'accepted', ok: false}));
  process.exitCode = 1;
}

const block = (c, prefix) => c.body.blocks.find(b => (b.sourceBlockIds ?? []).join(',') === prefix);
const figure = (c, id) => c.figures.find(f => f.figureId === id);

await expectReject('undeclared paragraph text edit', c => {
  const b = block(c, 'nemata-jp-p260-b28');
  b.rawSlotText = b.rawSlotText.replace('第7巡', '第8巡');
  b.inlineContent = b.inlineContent.map(p => p.type === 'text' ? {type: 'text', text: p.text.replace('第7巡', '第8巡')} : p);
  b.text = b.inlineContent.map(p => p.text).join('');
}, 'audit_native_pdf_raw_flow_changed');

await expectReject('figure transcription changed beyond the approved diff', c => {
  figure(c, 'nemata-jp-p260-r26').transcription = figure(c, 'nemata-jp-p260-r26').transcription.replace('弃牌候选', '备选弃牌');
}, 'audit_native_inline_correction_candidate_field_mismatch');

await expectReject('reverted approved change (caption back to 9s)', c => {
  figure(c, 'nemata-jp-p260-r28').caption = '9s';
  const b = block(c, 'nemata-jp-p260-b34,nemata-jp-p260-b35');
  b.inlineContent = b.inlineContent.map(p => p.figureId === 'nemata-jp-p260-r28' ? {type: 'figure', figureId: p.figureId, text: '9s'} : p);
  b.text = b.inlineContent.map(p => p.text).join('');
}, 'audit_native_inline_correction_candidate_field_mismatch');

await expectReject('wrong parent SHA', c => {
  c.provenance.sourceFieldCorrection.parentSha256 = '0'.repeat(64);
}, 'audit_native_inline_correction_parent_changed');

await expectReject('block text left stale after caption fix', c => {
  const b = block(c, 'nemata-jp-p260-b34,nemata-jp-p260-b35');
  b.text = b.text.replace('2357s', '2359s');
}, 'audit_native_pdf_compiled_paragraph_changed');
