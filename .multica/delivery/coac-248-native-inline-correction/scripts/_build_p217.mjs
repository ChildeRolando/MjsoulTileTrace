// Deterministic field repair for 79-cn page 217, figure r1 (north player's discards).
// Parent root is copied intact; only the figure-217 transcription string changes.
// Source-checked against assets/64038b63… (the page's embedded figure bitmap):
//   - the second discard row's second tile is 九萬 (9m), not 八萬 (8m) — verified against
//     the same image's 八萬 anchor in the north player's hand;
//   - the reviewer's "六萬 (6m)" for the first tile of that row is NOT adopted: the glyph
//     at that position is not 六, and at this asset resolution it cannot be told apart from
//     the parent's 五萬, so the parent value is kept;
//   - the reviewer's east-column direction change is NOT adopted (see adjudication record);
//   - visible concealed backs measured from the bitmap: south 13, west 13, east 10;
//   - the centre shows only the ドラ label plus 西, no separate indicator tile.
import {readFile, writeFile, cp, mkdir, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const PARENT_ROOT_REL = 'production/sol-high-fallback-finite-20261024-schemafix';
const NEW_ROOT_REL = 'production/sol-high-field-repair22-20261027-p217';
const PAGE_NO = '0217';
const PARENT_SHA = '73410520b240c15305d220c0aa472bb0f53392255dd0167b78d8a4627aac0add';
const FIGURE = '79-cn-p217-r1';

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);

const parentPath = `${PARENT_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`;
const parentBytes = await readFile(abs(parentPath));
if (sha(parentBytes) !== PARENT_SHA) throw Error('parent sha mismatch');
const parent = JSON.parse(parentBytes.toString('utf8'));
const figure = parent.figures.find(f => f.figureId === FIGURE);
if (!figure) throw Error('figure missing');

const FROM = figure.transcription;
const replacements = [
  {from: '第二行5m 8m。', to: '第二行5m 9m。', occurrences: 1},
  {from: '其余三家的暗手牌背面朝外，牌种未知。', to: '其余三家的暗手牌背面朝外，牌种未知（画面可见南家13张、西家13张、东家10张）。', occurrences: 1},
  {from: '中央“ドラ”旁显示西（3z），按图中文字记为宝牌；未另示宝牌指示牌。', to: '中央“ドラ”栏显示西（3z），画面未注明该栏为宝牌还是宝牌指示牌。', occurrences: 1},
];
let TO = FROM;
for (const r of replacements) {
  const n = TO.split(r.from).length - 1;
  if (n !== r.occurrences) throw Error(`replacement count ${n} != ${r.occurrences} for ${r.from}`);
  TO = TO.replace(r.from, r.to);
}
for (const expect of ['第二行5m 9m。', '南家13张、西家13张、东家10张', '画面未注明该栏为宝牌还是宝牌指示牌'])
  if (!TO.includes(expect)) throw Error('expected text missing: ' + expect);
// the rejected review items must stay exactly as the parent had them
for (const keep of ['第二行5m', '自上向下'])
  if (!TO.includes(keep)) throw Error('rejected item changed: ' + keep);

const candidate = structuredClone(parent);
candidate.figures.find(f => f.figureId === FIGURE).transcription = TO;
delete candidate.candidateSha256;
candidate.candidateSha256 = sha(JSON.stringify(candidate));

const hasRoot = await access(abs(NEW_ROOT_REL)).then(() => true, () => false);
if (hasRoot) throw Error('new root already exists');
await cp(abs(PARENT_ROOT_REL), abs(NEW_ROOT_REL), {recursive: true, force: false});
await mkdir(abs(`${NEW_ROOT_REL}/candidates/79-cn`), {recursive: true});
const candidatePath = `${NEW_ROOT_REL}/candidates/79-cn/page-${PAGE_NO}.json`;
await writeFile(abs(candidatePath), JSON.stringify(candidate, null, 2) + '\n');
const candidateSha256 = sha(await readFile(abs(candidatePath)));
console.log(JSON.stringify({candidatePath, candidateSha256, parentSha256: PARENT_SHA, before: FROM.length, after: TO.length}, null, 1));
console.log('---TO---\n' + TO);
