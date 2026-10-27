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

const targets = [
  [260, 'production/sol-high-field-repair21-20261027-p260/candidates/nemata-jp/page-0260.json'],
];

for (const [page, candidatePath] of targets) {
  const bytes = await readFile(rel(candidatePath));
  const candidate = JSON.parse(bytes.toString('utf8'));
  const digest = sha(bytes);
  const {correctedRaw, correctionProof} = await loadNativeInlineCorrection(ROOT, candidate, digest);
  const pageData = JSON.parse(await readFile(rel(`nemata-jp/pages/${page}.json`), 'utf8'));
  checkNativePdfInlineContent(candidate, pageData, null, correctedRaw);
  console.log(JSON.stringify({page, digest, changes: correctionProof.sourceFieldCorrection.changes.length, ok: true}));
}
