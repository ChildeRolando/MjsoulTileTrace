// 79-cn page 217 rev4: disclose the one position the audits could not read (west outer column,
// second row, second tile — a rotated 萬 tile whose numeral is below the asset resolution).
// No tile value changes: the disputed north tile stays 9m on split-half anchor evidence.
import {readFile, writeFile, cp, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const PARENT_ROOT_REL = 'production/sol-high-field-repair24-20261027-p217c';
const NEW_ROOT_REL = 'production/sol-high-field-repair25-20261027-p217d';
const PAGE_NO = '0217';
const PARENT_SHA = 'ebe43a8c9e3a181bf26a10dd2afc9d472cd4645833a99f3803e2b6edfc27d2ea';

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const parentPath = `${PARENT_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`;
const parentBytes = await readFile(abs(parentPath));
if (sha(parentBytes) !== PARENT_SHA) throw Error('parent sha mismatch');
const parent = JSON.parse(parentBytes.toString('utf8'));
const figure = parent.figures.find(f => f.figureId === '79-cn-p217-r1');
const FROM = figure.transcription;
const replacements = [
  {from: '第二行7z 8m 2m 6m。',
   to: '第二行7z 8m 2m 6m（其中第二张为旋转万子牌，数字在当前嵌入位图分辨率下不能可靠辨定，按8m记录并标为待核）。',
   occurrences: 1},
];
let TO = FROM;
for (const r of replacements) {
  const n = TO.split(r.from).length - 1;
  if (n !== r.occurrences) throw Error(`replacement count ${n} != ${r.occurrences}`);
  TO = TO.replace(r.from, r.to);
}
for (const keep of ['第二行5m 9m。', '各列自下向上', '6s 8s 1p', '第一行1z 9s 1m 9s 1p 3z', '第一行9p 1s 1m 6z 9s 2p'])
  if (!TO.includes(keep)) throw Error('expected retained text missing: ' + keep);

const candidate = structuredClone(parent);
candidate.figures.find(f => f.figureId === '79-cn-p217-r1').transcription = TO;
delete candidate.candidateSha256;
candidate.candidateSha256 = sha(JSON.stringify(candidate));
if (await access(abs(NEW_ROOT_REL)).then(() => true, () => false)) throw Error('new root already exists');
await cp(abs(PARENT_ROOT_REL), abs(NEW_ROOT_REL), {recursive: true, force: false});
const rel = `${NEW_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`;
await writeFile(abs(rel), JSON.stringify(candidate, null, 2) + '\n');
console.log(JSON.stringify({candidatePath: rel, candidateSha256: sha(await readFile(abs(rel))), parentSha256: PARENT_SHA}, null, 1));
