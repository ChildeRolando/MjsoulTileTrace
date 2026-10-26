// Deterministic probe: can a b5-only exact-field revision of nemata-jp:317 pass the
// frozen native-inline correction route's own gate? Zero model calls, zero writes to
// the processing root. Calls the exported pure verifier from the frozen runtime.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const RUNTIME = 'E:/AgentData/Coach/knowledge/processing/audit/runtimes/native-repair-7076217daf842b13/';
const {verifyNativeInlineCorrection} = await import(pathToFileURL(RUNTIME + 'textbook-audit-pdf-native-corrections.mjs').href);

const sha = b => createHash('sha256').update(b).digest('hex');
const read = async p => readFile(join(ROOT, p));
const PROD = 'production/sol-high-metadata-four-pages-inline-20261026';
const CAND = `${PROD}/candidates/nemata-jp/page-0317.json`;
const CALL = `${PROD}/raw-calls/ab1fbac1-92f8-4795-a789-545bb0dd40c6.json`;
const AUDIT = 'audit/pages/nemata-jp/page-0317.e0911ad1e2ee917537c953d1d2e204120fcd3477a67baf1f26eac90f18c9efcf.6baa4a7e1404.json';
const PAGE = 'nemata-jp/pages/317.json';

const candBytes = await read(CAND), parent = JSON.parse(candBytes.toString('utf8'));
const legacySha = sha(candBytes);
const raw = JSON.parse((await read(CALL)).toString('utf8'));
const audit = JSON.parse((await read(AUDIT)).toString('utf8'));
const pageBytes = await read(PAGE), page = JSON.parse(pageBytes.toString('utf8'));
const AUDIT_SHA = sha(await read(AUDIT)), CALL_SHA = sha(await read(CALL));

const B5_FROM = '新战术论\n暂时公开正在《新现代麻将技术论》中发表的最新版战术论。\n※由于是暂定版，结构或URL可能发生变更。';
const B5_REP = {from: '暂时公开正在《新现代麻将技术论》中发表的最新版战术论。', to: '以暂定版形式公开正在《新现代麻将技术论》中发表的最新版战术论。', occurrences: 1};
const B5_TO = B5_FROM.replace(B5_REP.from, B5_REP.to);

const b5Change = {
  target: 'paragraph',
  sourceBlockIds: ['nemata-jp-p317-b4', 'nemata-jp-p317-b5'],
  fromValue: B5_FROM,
  toValue: B5_TO,
  replacements: [B5_REP],
  sourceEvidence: 'The PDF text layer of block nemata-jp-p317-b5 reads 新現代⿇雀技術論にて発表中の最新版戦術論を暫定公開。 — 暫定公開 qualifies the publication mode (a provisional edition), not a temporary public window; the candidate rendered it as 暂时公开.',
  sourceTextEvidence: [{sourceBlockId: 'nemata-jp-p317-b5', contains: '暫定公開'}],
  sourceCrop: {path: `${PROD}/renders/nemata-jp/page-0317.png`, sha256: sha(await read(`${PROD}/renders/nemata-jp/page-0317.png`))},
};
const r6Raw = (raw.parsedOutput.figures || []).find(f => f.regionId === 'nemata-jp-p317-r6');
const R6_OLD_TAIL = '封面右上角另有两行细小宣传文字，无法可靠逐字辨认。';
const R6_NEW_TAIL = '封面右上角另有两行细小宣传文字：可见「…ネット麻雀ライフを」「…するマガジン」两处字串，各行前段文字在源图内嵌位图（416x588）原生分辨率下仍不可辨。';
const r6Changes = [
  {
    target: 'figure', figureId: 'nemata-jp-p317-r6', field: 'transcription',
    fromValue: r6Raw.transcription, toValue: r6Raw.transcription.replace(R6_OLD_TAIL, R6_NEW_TAIL),
    replacements: [{from: R6_OLD_TAIL, to: R6_NEW_TAIL, occurrences: 1}],
    sourceEvidence: 'Counterfactual probe only: the cover asset embedded in the source page is 416x588 px natively; at 8x/16x upscale the two top-right tagline lines resolve as …ネット麻雀ライフを / …するマガジン while their leading characters stay illegible.',
    sourceCrop: {path: `${PROD}/renders/nemata-jp/page-0317-r6.png`, sha256: sha(await read(`${PROD}/renders/nemata-jp/page-0317-r6.png`))},
  },
];

function buildRevision(changes) {
  const candidate = structuredClone(parent);
  for (const c of changes) {
    if (c.target === 'paragraph') {
      const b = candidate.body.blocks.find(x => x.type === 'text' && JSON.stringify(x.sourceBlockIds) === JSON.stringify(c.sourceBlockIds));
      b.rawSlotText = c.toValue; b.text = c.toValue; b.inlineContent = [{type: 'text', text: c.toValue}];
    } else {
      const f = candidate.figures.find(x => x.figureId === c.figureId);
      f[c.field] = c.toValue;
    }
  }
  candidate.provenance.sourceFieldCorrection = {
    schema: 'coach-native-inline-field-correction/1', sourceId: 'nemata-jp', page: 317,
    parentPath: CAND, parentSha256: legacySha, notesPath: AUDIT, notesSha256: AUDIT_SHA,
    originalProductionRaw: {path: CALL, sha256: CALL_SHA},
    sourcePageDataSha256: sha(pageBytes), newProductionModelCalls: 0, changes,
  };
  return candidate;
}

const auditErrors = audit.modelChecks.errors;
for (const [label, changes] of [['b5-only', [b5Change]], ['b5+r6', [b5Change, ...r6Changes]]]) {
  const candidate = buildRevision(changes);
  const bytes = Buffer.from(JSON.stringify(candidate));
  const candidateSha256 = sha(bytes);
  const n = candidate.provenance.sourceFieldCorrection;
  const approval = {
    status: 'accepted-exact-native-field-corrections-only', approvedBy: 'root',
    approvedAt: '2026-10-27T00:00:00.000Z', jobs: [{}],
  };
  const job = {
    schema: 'coach-native-inline-field-correction-job/1', sourceId: 'nemata-jp', page: 317,
    candidateSha256, parentSha256: legacySha,
    sourcePageDataSha256: n.sourcePageDataSha256,
    originalAuditSha256: AUDIT_SHA,
    originalProductionRaw: n.originalProductionRaw,
    changes,
    originalReviewErrors: auditErrors,
  };
  approval.jobs = [job];
  const correctionProof = {schema: 'coach-native-inline-field-correction-proof/1', candidateSha256, parentSha256: legacySha, sourceFieldCorrection: n};
  let outcome;
  try {
    verifyNativeInlineCorrection({candidate, parent, rawParsed: structuredClone(raw.parsedOutput), page, approval, job, correctionProof, candidateSha256});
    outcome = {passed: true};
  } catch (e) {
    outcome = {passed: false, rejected: e.message};
  }
  console.log(JSON.stringify({probe: label, changes: changes.map(c => c.target === 'figure' ? `${c.figureId}.${c.field}` : `block:${c.sourceBlockIds.join(',')}`), originalAuditErrors: auditErrors, ...outcome}));
}
