// Zero-call negative probes: the frozen gate must reject any edit that was not declared.
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
const MARKER = new RegExp('\\[\\[figure:([^\\]\\r\\n]+)\\]\\]', 'g');

const [page, candidatePath] = process.argv.slice(2);
const bytes = await readFile(rel(candidatePath));
const original = JSON.parse(bytes.toString('utf8'));
const pageData = JSON.parse(await readFile(rel(`nemata-jp/pages/${page}.json`), 'utf8'));
const digest = sha(bytes);
const approvedTo = original.provenance.sourceFieldCorrection.changes[0].toValue;

const rerender = (block, figures) => {
  const parts = [];
  let at = 0;
  for (const m of block.rawSlotText.matchAll(MARKER)) {
    if (m.index > at) parts.push({type: 'text', text: block.rawSlotText.slice(at, m.index)});
    const figure = figures.find(f => f.figureId === m[1]);
    parts.push({type: 'figure', figureId: m[1], text: figure.caption});
    at = m.index + m[0].length;
  }
  if (at < block.rawSlotText.length) parts.push({type: 'text', text: block.rawSlotText.slice(at)});
  block.inlineContent = parts;
  block.text = parts.map(p => p.text).join('');
};

const run = async (label, mutate) => {
  const candidate = structuredClone(original);
  mutate(candidate);
  try {
    const {correctedRaw} = await loadNativeInlineCorrection(ROOT, candidate, digest);
    checkNativePdfInlineContent(candidate, pageData, null, correctedRaw);
    console.log(JSON.stringify({page, label, result: 'ACCEPTED (unexpected)'}));
  } catch (error) {
    console.log(JSON.stringify({page, label, result: 'rejected', error: String(error.message)}));
  }
};

await run('undeclared-paragraph-text-edit', c => {
  const block = c.body.blocks.filter(b => b.type === 'text' && b.rawSlotText !== approvedTo && b.rawSlotText.includes('。')).at(-1);
  if (!block) throw Error('probe could not find an undeclared paragraph to edit');
  if (!block.rawSlotText.includes('。')) throw Error('probe block has no sentence end');
  block.rawSlotText = block.rawSlotText.replace('。', '。 ');
  rerender(block, c.figures);
});
await run('undeclared-figure-caption-edit', c => {
  const figure = c.figures[c.figures.length - 1];
  figure.caption = figure.caption + 'x';
  for (const block of c.body.blocks) {
    for (const part of block.inlineContent ?? []) {
      if (part.type === 'figure' && part.figureId === figure.figureId) part.text = figure.caption;
    }
    if (Array.isArray(block.inlineContent)) block.text = block.inlineContent.map(p => p.text).join('');
  }
});
await run('reverted-approved-change', c => {
  const change = c.provenance.sourceFieldCorrection.changes[0];
  const block = c.body.blocks.find(b => b.type === 'text' && b.rawSlotText === change.toValue);
  block.rawSlotText = change.fromValue;
  rerender(block, c.figures);
});
await run('wrong-parent-sha', c => { c.provenance.sourceFieldCorrection.parentSha256 = 'deadbeef'; });
