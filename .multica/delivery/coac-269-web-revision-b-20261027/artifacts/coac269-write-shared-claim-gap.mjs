#!/usr/bin/env node
// COAC-269 review fix R1 — record of the historical shared-claim gap (zero model calls).
//
// Batch 5 and batch 6 produced three chapters with a ticket-local claim only; no claim existed in
// the shared COAC-244 interface (parallel/claims) at the time of production. This record states
// that fact with the artifacts and does NOT create a backdated or retroactive claim: all three
// candidates were independently audited and passed afterwards, so under the COAC-244 contract the
// reservation is finished, and a claim written now would only mark a completed chapter as in
// flight for line A. The mechanism that caused the gap is fixed in coac269-claim-shared.mjs and
// enforced per dispatch by coac269-dispatch-guard.mjs.
import {readFile, writeFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readFileSync, existsSync} from 'node:fs';
import {join, relative} from 'node:path';

const P = 'E:/AgentData/Coach/knowledge/processing';
const NS = join(P, 'web-production/v1/coac269-20261027');
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => relative(P, p).replaceAll('\\', '/');
const read = p => JSON.parse(readFileSync(p, 'utf8'));

const productions = [
  {batch: 'b5', receipt: 'web-production/v1/coac269-20261027/receipts/production-b5-d8973bee19a1e53d.json',
   chapters: ['nemata-jp-chapter-142-1', 'nemata-jp-chapter-127-1']},
  {batch: 'b6', receipt: 'web-production/v1/coac269-20261027/receipts/production-b6-623085d17b4c5314.json',
   chapters: ['nemata-jp-chapter-027-1']},
];

const items = [];
for (const p of productions) {
  const receiptBytes = await readFile(join(P, p.receipt));
  const receipt = JSON.parse(receiptBytes);
  for (const cid of p.chapters) {
    const ch = receipt.chapters.find(c => c.chapterId === cid);
    if (!ch) throw new Error('chapter not in production receipt: ' + cid);
    const claimFile = (await readdir(join(NS, 'claims'))).find(f => f.startsWith(`claim-${p.batch}-${cid}-`));
    if (!claimFile) throw new Error('ticket claim missing for ' + cid);
    const claimPath = join(NS, 'claims', claimFile);
    const claim = read(claimPath);
    const candSha = sha(await readFile(join(P, ch.candidate.path)));
    const audits = [];
    for (const f of await readdir(join(P, 'audit/web/articles/modern-yabejp-ja'))) {
      if (!f.endsWith('.json') || !f.startsWith(ch.articleId + '.')) continue;
      const ap = join(P, 'audit/web/articles/modern-yabejp-ja', f);
      let j; try { j = read(ap); } catch { continue; }
      if (j.production?.sha256 === candSha) audits.push({path: rel(ap), sha256: sha(await readFile(ap)), status: j.status, recordedAt: j.recordedAt});
    }
    items.push({
      chapterId: cid,
      batch: p.batch,
      productionReceipt: {path: p.receipt, sha256: sha(receiptBytes)},
      productionCallIds: (ch.actualCalls || []).map(a => a.callId),
      dispatchedAt: ch.startedAt,
      parentCandidateSha256: claim.parentCandidate.sha256,
      candidate: {path: ch.candidate.path, sha256: candSha},
      ticketLocalClaim: {path: rel(claimPath), sha256: sha(await readFile(claimPath)), claimKey: claim.claimKey},
      sharedClaimAtProduction: null,
      sharedClaimNow: null,
      independentAudit: audits.length === 1 ? audits[0] : {count: audits.length, audits},
      retroactiveClaimTaken: false,
      whyNoRetroactiveClaim: 'the chapter passed its first independent audit, so the COAC-244 reservation is finished; a claim written now would block line A on a completed chapter without protecting anything',
    });
  }
}

const sharedClaimFiles = existsSync(join(P, 'parallel/claims')) ? (await readdir(join(P, 'parallel/claims'))).sort() : [];
const eventsPath = join(P, 'parallel/events.jsonl');
const eventsText = existsSync(eventsPath) ? await readFile(eventsPath, 'utf8') : '';
const claimEventsFor = cid => eventsText.split('\n').filter(l => l.includes('"type":"claim"') && l.includes(cid)).length;

const jointPath = join(NS, 'preflight/joint-exclusion-2026-10-27T11-33-54-678Z-e17cc5c1.json');
const jointBytes = await readFile(jointPath);
const joint = JSON.parse(jointBytes);

const record = {
  schema: 'coac269-shared-claim-history-gap/1',
  ticket: 'COAC-269', line: 'B', recordedAt: new Date().toISOString(),
  modelCalls: 0, productionCalls: 0, auditCalls: 0,
  summary: 'batch-5 and batch-6 productions held only ticket-local claims; the shared COAC-244 claim was never taken. Historical fact recorded, no timestamp backdated, no retroactive claim written because all three chapters have since passed independent audit.',
  items,
  gapEvidence: {
    sharedClaimsDirectory: {path: 'parallel/claims', filesAtFixTime: sharedClaimFiles,
      note: 'none of the three chapterIds is present; the earlier b2/b3 claims (338-1, 273-1, 246-1, 237-1, 183-1, 131-1) are'},
    sharedClaimEvents: Object.fromEntries(items.map(i => [i.chapterId, claimEventsFor(i.chapterId)])),
    lineAVisibility: 'with no shared claim, slots.mjs check-chapter returned held:false for line A (exit 0) instead of exit 7, so line A could not see these productions as in flight',
  },
  currentCoverage: {
    jointExclusion: {path: rel(jointPath), sha256: sha(jointBytes), recordedAt: joint.recordedAt},
    denominator: joint.chapterDenominator,
    eligibleRepairTargets: joint.eligibleRepairTargets.map(e => e.chapterId),
    note: 'the three chapters are no longer eligible: the coverage union covers them through their freshly passed audits, so line A cannot re-produce them even without a claim',
  },
  mechanismFix: {
    sharedClaimScript: {path: '.multica/delivery/coac-269-web-revision-b-20261027/artifacts/coac269-claim-shared.mjs',
      interface: 'parallel/slots.mjs claim → read-back owner+sha → ticket-local detail claim'},
    dispatchGuard: {path: '.multica/delivery/coac-269-web-revision-b-20261027/artifacts/coac269-dispatch-guard.mjs',
      rule: 'no dispatch without a shared claim held by COAC-269 Ticket executor for the exact parent candidate sha'},
    producers: ['coac269-produce-b5.py', 'coac269-produce-b6.py'],
    regressionTest: 'coac269-dispatch-guard.test.mjs (two-lane race + per-dispatch drift, zero model calls)',
  },
};
const outPath = join(NS, 'claims', `shared-claim-history-gap-b5b6-${sha(JSON.stringify(record.items)).slice(0, 16)}.json`);
await writeFile(outPath, JSON.stringify(record, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
console.log(JSON.stringify({ok: true, receipt: rel(outPath), items: items.map(i => ({chapterId: i.chapterId,
  sharedClaimAtProduction: i.sharedClaimAtProduction, sharedClaimEvents: claimEventsFor(i.chapterId),
  auditStatus: i.independentAudit.status, retroactiveClaimTaken: i.retroactiveClaimTaken}))}, null, 2));
