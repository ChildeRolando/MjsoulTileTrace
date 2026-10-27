// Deterministic web-article revision builder (content + display pair).
// Exact target-text replacement on top of an unchanged parent candidate plus that
// parent's bound needs-repair audit. No model call. The content candidate carries
// provenance.revision; the display candidate adds derivedFromCandidate pointing at
// the content candidate (identical body) so the presentation chain verifies.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const RT = join(ROOT, 'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49');
const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const {webDeterministicChecks, verifyWebRevisionContent} = await import(pathToFileURL(join(RT, 'textbook-audit-web.mjs')).href);

const [parentRel, notesRel, contentRel, editsJson] = process.argv.slice(2);
if (!parentRel || !notesRel || !contentRel || !editsJson) throw Error('usage: parent notes content-out edits-json');
const edits = JSON.parse(editsJson);
const parentBytes = await readFile(abs(parentRel));
const parent = JSON.parse(parentBytes.toString('utf8'));
const notesBytes = await readFile(abs(notesRel));
const notes = JSON.parse(notesBytes.toString('utf8'));
const displayRel = contentRel.replace(/\.json$/, '.display.json');

const content = structuredClone(parent);
content.body.blocks = structuredClone(parent.body.blocks);
for (const e of edits) {
  const block = content.body.blocks.find(b => b.type === 'text' && b.sourceBlockIds?.[0] === e.blockId);
  if (!block) throw Error('missing target block ' + e.blockId);
  if (!block.text.includes(e.from)) throw Error('from-string not found in ' + e.blockId);
  const next = block.text.replace(e.from, e.to);
  if (next === block.text) throw Error('replacement did not change ' + e.blockId);
  if ((next.match(/\*/g) ?? []).length % 2 !== 0) throw Error('unbalanced emphasis markers in ' + e.blockId);
  block.text = next;
}
content.provenance = structuredClone(parent.provenance);
content.provenance.derivedFromCandidate = null;
content.provenance.revision = {
  parentPath: parentRel,
  parentSha256: sha(parentBytes),
  notesPath: notesRel,
  notesSha256: sha(notesBytes),
  figureIds: [],
  textBlockIds: [...new Set(edits.map(e => e.blockId))],
};
delete content.candidateSha256;
content.candidateSha256 = sha(JSON.stringify(content));
verifyWebRevisionContent(content, parent, notes);
const sourceBytes = await readFile(abs(content.source.sourcePath));
const source = JSON.parse(sourceBytes.toString('utf8'));
const checks = webDeterministicChecks(content, source, sha(sourceBytes));
if (!checks.passed) throw Error('deterministic:' + checks.errors.join('|'));
const contentBytes = Buffer.from(JSON.stringify(content, null, 2) + '\n');
await writeFile(abs(contentRel), contentBytes, {flag: 'wx'});

const display = structuredClone(content);
display.provenance.derivedFromCandidate = {
  path: contentRel,
  sha256: sha(contentBytes),
  reason: 'Lossless display images only; translations and source figure sequences unchanged',
};
delete display.candidateSha256;
display.candidateSha256 = sha(JSON.stringify(display));
const displayChecks = webDeterministicChecks(display, source, sha(sourceBytes));
if (!displayChecks.passed) throw Error('deterministic-display:' + displayChecks.errors.join('|'));
const displayBytes = Buffer.from(JSON.stringify(display, null, 2) + '\n');
await writeFile(abs(displayRel), displayBytes, {flag: 'wx'});

console.log(JSON.stringify({
  parent: parentRel, parentSha256: sha(parentBytes),
  notes: notesRel, notesSha256: sha(notesBytes),
  content: contentRel, contentSha256: sha(contentBytes),
  display: displayRel, displaySha256: sha(displayBytes),
  internalDigest: display.candidateSha256,
  targets: display.provenance.revision.textBlockIds,
  checks,
}, null, 1));
