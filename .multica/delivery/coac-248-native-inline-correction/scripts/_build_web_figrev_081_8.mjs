// COAC-248: 79-cn chapter 081-8 (cv1721475) figure-transcription revision.
// Exact, source-verified tile-code corrections on four bound figures of an
// unchanged parent candidate. Zero production model calls: every corrected code
// was read here from the bound source PNG (original + nearest-neighbour zoom) and
// is declared in provenance.sourceFieldCorrection.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const RT = join(ROOT, 'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49');
const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const {webDeterministicChecks, verifyWebRevisionContent, verifyWebProductionCall} =
  await import(pathToFileURL(join(RT, 'textbook-audit-web.mjs')).href);

const PARENT = 'web-production/v1/candidates/79-bilibili-cn/cv1721475.display.json';
const NOTES = 'audit/web/articles/79-bilibili-cn/cv1721475.50b62ce5b808d89f5f6231e8a88ed7ce546731211bb73684642d54d700d11853.json';
const CONTENT = 'web-production/v1/candidates/79-bilibili-cn/cv1721475.r1.json';
const dryRun = process.argv.includes('--dry-run');

const parentBytes = await readFile(abs(PARENT));
const parent = JSON.parse(parentBytes.toString('utf8'));
const notesBytes = await readFile(abs(NOTES));
const notes = JSON.parse(notesBytes.toString('utf8'));

const S = '79-bilibili-cn:cv1721475';
const EDITS = [
  {
    figureId: `${S}:b0004:figure`,
    replacements: [{from: '7p 5s 5s 6s 9s\n', to: '7p 5s 5s 6s 7s\n'}],
    evidence: '例1手牌第13张：顶部一根红竹、下方两组三根绿竹，共七根＝7s；9s 为九根绿竹，与该字形不符。',
  },
  {
    figureId: `${S}:b0006:figure`,
    replacements: [
      {from: '7p 8p 4s 5s 5s 6s 9s\n', to: '7p 8p 4s 5s 5s 6s 7s\n'},
      {from: '7p 8p 5s 5s 6s 9s 9s\n', to: '7p 8p 5s 5s 6s 7s 7s\n'},
      {from: '4p 2s 9s 8s\n', to: '4p 2s 7s 8s\n'},
    ],
    evidence: '变化A末张、变化B末两张、例2第12张均为同一红顶七竹字形＝7s；四处旧录9s。',
  },
  {
    figureId: `${S}:b0008:figure`,
    replacements: [
      {from: '4p 9s 8s\n该行右侧：（10种33张）', to: '4p 7s 8s\n该行右侧：（10种33张）'},
      {from: '4p 9s 8s\n该行右侧：（9种29张）', to: '4p 7s 8s\n该行右侧：（9种29张）'},
    ],
    evidence: '变化A、B两行倒数第二张均为红顶七竹7s，末张为八索的M形8s；旧录9s 8s。',
  },
  {
    figureId: `${S}:b0018:figure`,
    replacements: [
      {from: '1s 2s 4s 5s 9s｜28张', to: '1s 2s 4s 5s 7s｜28张'},
      {from: '4m 5m 6m 7m 4p 6p 7p 8p｜28张', to: '4m 5m 6m 7m 5p 6p 7p 8p｜28张'},
    ],
    evidence: '切6m行末张为红顶七竹7s（旧录9s）；切2s行首张饼子为五个圆点含中心红点＝5p（旧录4p）。',
  },
];

const content = structuredClone(parent);
for (const f of content.figures) delete f.presentationAsset;
const changes = [];
for (const e of EDITS) {
  const figure = content.figures.find(f => f.figureId === e.figureId);
  if (!figure) throw Error('missing figure ' + e.figureId);
  if (figure.provenance?.method !== 'model-transcription') throw Error('not a model transcription ' + e.figureId);
  const fromValue = figure.transcription;
  let toValue = fromValue;
  for (const r of e.replacements) {
    const n = toValue.split(r.from).length - 1;
    if (n !== 1) throw Error(`replacement count ${n} != 1 in ${e.figureId}: ${JSON.stringify(r.from)}`);
    toValue = toValue.replace(r.from, r.to);
  }
  figure.transcription = toValue;
  figure.sourceNotes = [...figure.sourceNotes, `源图核读（COAC-248）：${e.evidence}`];
  changes.push({
    figureId: e.figureId,
    field: 'transcription',
    fromValue,
    toValue,
    replacements: e.replacements,
    sourceEvidence: e.evidence,
    sourceAssetBindings: figure.sourceAssetBindings.map(b => ({assetId: b.assetId, path: b.path, sha256: b.sha256})),
  });
}

content.provenance = structuredClone(parent.provenance);
content.provenance.derivedFromCandidate = null;
content.provenance.revision = {
  parentPath: PARENT,
  parentSha256: sha(parentBytes),
  notesPath: NOTES,
  notesSha256: sha(notesBytes),
  figureIds: changes.map(c => c.figureId),
  textBlockIds: [],
};
content.provenance.sourceFieldCorrection = {
  schema: 'coach-native-inline-field-correction/1',
  sourceId: '79-bilibili-cn',
  articleId: 'cv1721475',
  parentPath: PARENT,
  parentSha256: sha(parentBytes),
  notesPath: NOTES,
  notesSha256: sha(notesBytes),
  newProductionModelCalls: 0,
  method: 'exact-tile-code-replacement-from-bound-source-png',
  changes,
};
delete content.candidateSha256;
content.candidateSha256 = sha(JSON.stringify(content));

verifyWebRevisionContent(content, parent, notes);
const sourceBytes = await readFile(abs(content.source.sourcePath));
const source = JSON.parse(sourceBytes.toString('utf8'));
const checks = webDeterministicChecks(content, source, sha(sourceBytes));
if (!checks.passed) throw Error('deterministic:' + checks.errors.join('|'));
const productionCall = await verifyWebProductionCall(ROOT, content);

const contentBytes = Buffer.from(JSON.stringify(content, null, 2) + '\n');
const out = {
  dryRun,
  parent: PARENT,
  parentSha256: sha(parentBytes),
  notesSha256: sha(notesBytes),
  figureIds: content.provenance.revision.figureIds,
  changes: changes.map(c => ({figureId: c.figureId, replacements: c.replacements.length})),
  checks,
  productionModelCalls: content.provenance.modelCalls,
  productionCallKind: productionCall.revision ? 'revision-inheritance' : 'direct',
  contentSha256: sha(contentBytes),
  internalDigest: content.candidateSha256,
};
if (!dryRun) {
  await writeFile(abs(CONTENT), contentBytes, {flag: 'wx'});
  out.written = CONTENT;
}
console.log(JSON.stringify(out, null, 1));
