// 79-cn page 217 rev3: apply the four 索子 fixes that both the third independent audit and
// this run's own pixel measurement confirm (8s = all green, 9s = green with a warm centre
// column; measured warm/green fractions per tile). The 萬 readings stay as rev2 — three
// audits disagree on them and the same-image 八萬 anchor does not match the disputed tile.
import {readFile, writeFile, cp, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const PARENT_ROOT_REL = 'production/sol-high-field-repair23-20261027-p217b';
const NEW_ROOT_REL = 'production/sol-high-field-repair24-20261027-p217c';
const PAGE_NO = '0217';
const PARENT_SHA = '2a7551768ad0668da86d159e9f677b45a6c7a68a0500a2b3ef95b461bf33e5cd';

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const parentPath = `${PARENT_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`;
const parentBytes = await readFile(abs(parentPath));
if (sha(parentBytes) !== PARENT_SHA) throw Error('parent sha mismatch');
const parent = JSON.parse(parentBytes.toString('utf8'));
const figure = parent.figures.find(f => f.figureId === '79-cn-p217-r1');
const FROM = figure.transcription;

const replacements = [
  {from: '北家手牌从左至右：8m 8m 1s 2s 3s 6s 9s 1p', to: '北家手牌从左至右：8m 8m 1s 2s 3s 6s 8s 1p', occurrences: 1},
  {from: '第一行1z 8s 1m 8s 1p 3z', to: '第一行1z 9s 1m 9s 1p 3z', occurrences: 1},
  {from: '第一行9p 1s 1m 6z 8s 2p', to: '第一行9p 1s 1m 6z 9s 2p', occurrences: 1},
];
let TO = FROM;
for (const r of replacements) {
  const n = TO.split(r.from).length - 1;
  if (n !== r.occurrences) throw Error(`replacement count ${n} != ${r.occurrences}`);
  TO = TO.replace(r.from, r.to);
}
for (const keep of ['第二行5m 9m。', '各列自下向上', '南家13张、西家13张、东家10张'])
  if (!TO.includes(keep)) throw Error('expected retained text missing: ' + keep);

const candidate = structuredClone(parent);
candidate.figures.find(f => f.figureId === '79-cn-p217-r1').transcription = TO;
delete candidate.candidateSha256;
candidate.candidateSha256 = sha(JSON.stringify(candidate));
if (await access(abs(NEW_ROOT_REL)).then(() => true, () => false)) throw Error('new root already exists');
await cp(abs(PARENT_ROOT_REL), abs(NEW_ROOT_REL), {recursive: true, force: false});
await writeFile(abs(`${NEW_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`), JSON.stringify(candidate, null, 2) + '\n');
console.log(JSON.stringify({candidatePath: `${NEW_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`, candidateSha256: sha(await readFile(abs(`${NEW_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`))), parentSha256: PARENT_SHA}));
