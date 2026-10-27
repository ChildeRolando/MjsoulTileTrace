// 79-cn page 217 rev2: apply the east-player discard direction the independent audits
// asked for (verified against the same book's PASSED page 254, which writes 东家 as
// "先左列自下而上" and 西家 as "先右列自上而下"), and keep the north-row 9m that the
// audits misread (same-image 八萬 anchor correlation: 0.905 between the two hand 八萬
// tiles, 0.57 against the disputed tile — a different glyph).
import {readFile, writeFile, cp, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const PARENT_ROOT_REL = 'production/sol-high-field-repair22-20261027-p217';
const NEW_ROOT_REL = 'production/sol-high-field-repair23-20261027-p217b';
const PAGE_NO = '0217';
const PARENT_SHA = '279dab7bb834bc463ce8b0c89678f2dc8c164af9e7f3c3504784fde4d7876494';

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);

const parentPath = `${PARENT_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`;
const parentBytes = await readFile(abs(parentPath));
if (sha(parentBytes) !== PARENT_SHA) throw Error('parent sha mismatch');
const parent = JSON.parse(parentBytes.toString('utf8'));
const figure = parent.figures.find(f => f.figureId === '79-cn-p217-r1');
if (!figure) throw Error('figure missing');
const FROM = figure.transcription;

const replacements = [
  {from: '东家舍牌，按其自身视角逐行从左至右（画面中先读靠中央的一列，自上向下）：第一行7z 7m 3p 1p 2m 8p；第二行4z 5p 9m 2z。',
   to:   '东家舍牌，按其自身视角逐行从左至右（画面中先读靠中央的一列，各列自下向上）：第一行8p 2m 1p 3p 7m 7z；第二行2z 9m 5p 4z。', occurrences: 1},
];
let TO = FROM;
for (const r of replacements) {
  const n = TO.split(r.from).length - 1;
  if (n !== r.occurrences) throw Error(`replacement count ${n} != ${r.occurrences}`);
  TO = TO.replace(r.from, r.to);
}
for (const keep of ['西家舍牌，按其自身视角逐行从左至右（画面中先读靠中央的一列，自上向下）', '第二行5m 9m。'])
  if (!TO.includes(keep)) throw Error('expected retained text missing: ' + keep);

const candidate = structuredClone(parent);
candidate.figures.find(f => f.figureId === '79-cn-p217-r1').transcription = TO;
delete candidate.candidateSha256;
candidate.candidateSha256 = sha(JSON.stringify(candidate));

if (await access(abs(NEW_ROOT_REL)).then(() => true, () => false)) throw Error('new root already exists');
await cp(abs(PARENT_ROOT_REL), abs(NEW_ROOT_REL), {recursive: true, force: false});
const candidatePath = `${NEW_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`;
await writeFile(abs(candidatePath), JSON.stringify(candidate, null, 2) + '\n');
console.log(JSON.stringify({candidatePath, candidateSha256: sha(await readFile(abs(candidatePath))), parentSha256: PARENT_SHA}));
