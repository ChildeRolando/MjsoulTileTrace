// Deterministic field repair for 79-cn page 263, figure r1.
// Only the page's own transcription string changes; body, captions, bboxes,
// assets and provenance stay byte-identical to the parent production root.
import {readFile, writeFile, cp, mkdir, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const PARENT_ROOT_REL = 'production/sol-high-fallback-finite-20261024-schemafix';
const NEW_ROOT_REL = 'production/sol-high-field-repair-20261027-p263';
const PAGE_NO = '0263';
const PARENT_SHA = '7fea090b5ca70f172889164cecd3ba8bd40eed5dc3c0af51a9b354cbed272fcc';
const FIGURE = '79-cn-p263-r1';

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);

const parentPath = `${PARENT_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`;
const parentBytes = await readFile(abs(parentPath));
if (sha(parentBytes) !== PARENT_SHA) throw Error('parent sha mismatch');
const parent = JSON.parse(parentBytes.toString('utf8'));
const figure = parent.figures.find(f => f.figureId === FIGURE);
if (!figure) throw Error('figure missing');

const FROM = figure.transcription;

// 1) legend: the book uses 5z=白, 6z=發, 7z=中 on every other page; 263 had 中/白 swapped.
// 2) the three in-page dragon codes follow the legend, so they swap with it.
// 3) dora indicator: the ドラ tile is two bamboo sticks, i.e. 2s (candidate wrote 3s).
// 4) chi: the sideways tile is three bamboo sticks (3s), the middle tile is 2s.
const replacements = [
  {from: '5z', to: '«Z»', occurrences: 2},
  {from: '7z', to: '5z', occurrences: 4},
  {from: '«Z»', to: '7z', occurrences: 2},
  {from: '1z=东，4z=北，7z=中，6z=發，5z=白', to: '1z=东，4z=北，5z=白，6z=發，7z=中', occurrences: 1},
  {from: '宝牌指示牌：3s。', to: '中央“ドラ”栏显示2s（画面未注明该栏为宝牌还是宝牌指示牌）。', occurrences: 1},
  {from: '吃2s 3s 4s，2s横置，来自上家南家。', to: '吃2s 3s 4s，所吃为上家南家的3s（横置；画面排列3s、2s、4s）。', occurrences: 1},
];
let TO = FROM;
for (const r of replacements) {
  const n = TO.split(r.from).length - 1;
  if (n !== r.occurrences) throw Error(`replacement count ${n} != ${r.occurrences} for ${r.from}`);
  TO = TO.replaceAll(r.from, r.to);
}
for (const expect of ['5z=白，6z=發，7z=中', '第一列1z 7z 5z 4z 9s 1m', '第一列1z 5z 1m 9p 3m 2s', '第一行5z 9p 4z 2m 6z 8m', '中央“ドラ”栏显示2s', '所吃为上家南家的3s'])
  if (!TO.includes(expect)) throw Error('expected text missing: ' + expect);

const candidate = structuredClone(parent);
candidate.figures.find(f => f.figureId === FIGURE).transcription = TO;
const withoutDigest = {...candidate};
delete withoutDigest.candidateSha256;
candidate.candidateSha256 = sha(JSON.stringify(withoutDigest));

const candidatePath = `${NEW_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`;
await mkdir(abs(`${NEW_ROOT_REL}/candidates/79-cn`), {recursive: true});
const hasRoot = await access(abs(NEW_ROOT_REL)).then(() => true, () => false);
if (!hasRoot) await cp(abs(PARENT_ROOT_REL), abs(NEW_ROOT_REL), {recursive: true, force: true});
await writeFile(abs(candidatePath), JSON.stringify(candidate, null, 2) + '\n');
const candidateSha256 = sha(await readFile(abs(candidatePath)));
console.log(JSON.stringify({candidatePath, candidateSha256, parentSha256: PARENT_SHA, before: FROM.length, after: TO.length}, null, 1));
console.log('---TO---\n' + TO);
