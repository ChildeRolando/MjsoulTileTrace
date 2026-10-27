// Integrate the COAC-250 unified chapter register into the COAC-248 unified repair list.
// Zero model calls, zero production. Append-only: existing list objects are not modified;
// register rows that no list object covers are added with their current candidate/audit
// bytes re-hashed from disk. Dedupe is by effective candidate SHA and by object identity.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const DL = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-6506c6699664/worktree/.multica/delivery';
const read = p => readFileSync(p.startsWith('E:') || p.startsWith('C:') ? p : join(ROOT, p), 'utf8');
const shaFile = p => existsSync(p.startsWith('E:') || p.startsWith('C:') ? p : join(ROOT, p)) ? createHash('sha256').update(readFileSync(p.startsWith('E:') || p.startsWith('C:') ? p : join(ROOT, p))).digest('hex') : null;

const reg = JSON.parse(read('integration/coac250-unified-chapter-register-20261027.json'));
const list = JSON.parse(read(join(DL, 'coac-248-native-inline-correction/unified-repair-list-20261027.json')));
const bodyCmp = JSON.parse(read(join(DL, 'coac-248-register-body-comparison/body-comparison-normalized.json')));

const listByObject = new Map(list.objects.map(o => [o.objectId, o]));
const listSha = new Map(list.objects.map(o => [o.candidateSha256, o.objectId]));

// Resolve which list object covers a register row (web candidate or PDF page).
function coveredBy(r) {
  const hits = [];
  const w = listByObject.get('web-chapter:' + r.chapterId);
  if (w) hits.push({objectId: w.objectId, by: 'chapterId'});
  const candSha = r.existingCandidate?.path ? shaFile(r.existingCandidate.path) : null;
  if (candSha && listSha.has(candSha) && !hits.some(h => h.objectId === listSha.get(candSha)))
    hits.push({objectId: listSha.get(candSha), by: 'candidateSha256'});
  const failed = (list.failedSeparate || []).find(f => f.candidateSha256 === candSha);
  if (failed && !hits.some(h => h.objectId === failed.objectId))
    hits.push({objectId: failed.objectId, by: 'failedSeparate'});
  for (const p of r.pdfRoute?.missingPassedPages || []) {
    const id = `${r.sourceId}:page:${p}`;
    if (listByObject.has(id) && !hits.some(h => h.objectId === id)) hits.push({objectId: id, by: 'pdfPage'});
  }
  return hits;
}

const added = [], matched = [], unmatched = [];
for (const r of reg.rows) {
  if (r.verdict === 'covered-effective') continue;
  const hits = coveredBy(r);
  const cand = r.existingCandidate || null;
  const candSha = cand?.path ? shaFile(cand.path) : null;
  const auditSha = cand?.auditPath ? shaFile(cand.auditPath) : null;
  const bodyRow = bodyCmp.results.find(b => b.chapterId === r.chapterId) || null;
  const bodyVerdict = bodyRow ? (bodyRow.status === 'no-web-candidate' ? 'no-web-candidate'
    : bodyRow.exactBodyMatch ? 'body-identical'
    : bodyRow.missingFromWeb.length <= 2 && bodyRow.webOnly.length <= 2 ? 'body-diff-formatting-only'
    : 'body-diff-page-boundary') : 'n/a';

  const record = {
    chapterId: r.chapterId,
    registerVerdict: r.verdict,
    adjudicationGroup: r.adjudicationGroup,
    title: r.title,
    ownedSourceBlocks: r.ownedSourceBlocks,
    approvedWebCorrespondence: r.approvedWebCorrespondence || null,
    candidate: cand ? {path: cand.path, sha256FromDisk: candSha, sha256InRegister: cand.sha256, sha256Match: candSha === cand.sha256, auditPath: cand.auditPath, auditSha256FromDisk: auditSha, auditStatus: cand.auditStatus, sourceBoundCurrent: cand.sourceBoundCurrent} : null,
    pdfRoute: r.pdfRoute ? {pagesTotal: r.pdfRoute.pagesTotal, missingPassedPages: r.pdfRoute.missingPassedPages} : null,
    gaps: r.gaps || null,
    bodyComparison: bodyRow ? {status: bodyRow.status || null, exactBodyMatch: bodyRow.exactBodyMatch, missingSentences: (bodyRow.missingFromWeb || []).length, webOnlySentences: (bodyRow.webOnly || []).length, pdfFigureBlocks: bodyRow.pdfFigureBlocks, webFigures: bodyRow.webFigures, verdict: bodyVerdict} : null,
  };
  if (hits.length) matched.push({...record, listObjects: hits.map(h=>h.objectId), matchedBy: hits.map(h=>h.by)});
  else if (r.verdict === 'produced-passed-not-staged' || r.verdict === 'produced-pdf-passed-not-staged') unmatched.push({...record, category: 'staging-not-repair'});
  else if (r.verdict === 'produced-audit-failed') unmatched.push({...record, category: 'failed'});
  else unmatched.push({...record, category: 'repair-untracked'});
}

// Dedupe: candidate SHAs shared between the appended records and existing objects.
const newShas = added.concat(unmatched).map(r => r.candidate?.sha256FromDisk).filter(Boolean);
const collisions = newShas.filter(s => listSha.has(s)).map(s => ({sha256: s, listObject: listSha.get(s)}));

const out = {
  schema: 'coac248-register-integration/1',
  recordedAt: new Date().toISOString(),
  modelCalls: 0,
  productionCalls: 0,
  register: {
    path: 'integration/coac250-unified-chapter-register-20261027.json',
    sha256: shaFile('integration/coac250-unified-chapter-register-20261027.json'),
    counts: reg.counts,
    corrections: reg.corrections,
    adopted: 'chapter-level truth for this ticket; the earlier 80-chapter / 63-unproduced figures are superseded and kept only as history',
  },
  existingList: {path: '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json', refreshedAt: list.refreshedAt, counts: list.countsCurrent, objects: list.objects.length},
  registerUnpassed: reg.rows.filter(r => r.verdict !== 'covered-effective').length,
  matchedByExistingObject: matched.length,
  untracked: {
    repair: unmatched.filter(r => r.category === 'repair-untracked').length,
    staging: unmatched.filter(r => r.category === 'staging-not-repair').length,
    failed: unmatched.filter(r => r.category === 'failed').length,
    records: unmatched,
  },
  matchedRecords: matched,
  dedupe: {sharedCandidateSha: collisions, uniqueNewCandidateSha: new Set(newShas).size, newRecordsWithCandidate: newShas.length},
};
writeFileSync(join(DL, 'coac-248-register-body-comparison/register-integration-20261027.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({matched: matched.length, untrackedRepair: out.untracked.repair, staging: out.untracked.staging, failed: out.untracked.failed, collisions: collisions.length}, null, 1));
for (const u of unmatched) console.log(u.category, '|', u.chapterId, '|', u.registerVerdict, '|', u.candidate?.path?.replace(/.*candidates\//, '') || '(pdf route)', '|', u.bodyComparison?.verdict);
