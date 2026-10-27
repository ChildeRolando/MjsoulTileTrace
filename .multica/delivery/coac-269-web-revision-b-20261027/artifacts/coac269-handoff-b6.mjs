#!/usr/bin/env node
// COAC-269 line B batch-5 handoff to COAC-249: explicit targets + SHA-complete receipt. No model call.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const R = 'E:/AgentData/Coach/knowledge/processing';
const NS = 'web-production/v1/coac269-20261027';
const sha = b => createHash('sha256').update(b).digest('hex');
const b6 = [
  {chapterId: 'nemata-jp-chapter-027-1', articleId: 'chapter01-section010',
   candidate: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section010.coac269rev1.json',
   parent: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section010.display.json',
   parentAudit: 'audit/web/articles/modern-yabejp-ja/chapter01-section010.7ebd1f9736018ab21e85e0a91d2517e1c738fa56a9d4ca060c360bf9c21a566b.json',
   source: 'web-sources/v1/modern-yabejp-ja/articles/chapter01-section010/source.json',
   targets: ['modern-yabejp-ja:chapter01-section010:b0056'],
   notes: 'b0056: the parent audit found the comparison subject ambiguous — 「的情况与此不同：若打出」 does not say which tile shape in the preceding figure b0055 is the example and which is the comparison, and it risks merging into one eight-tile shape. The revision now reads 「与后一个牌形不同，前一个牌形若打出」, so the first four tiles of b0055 are the example and the last four the comparison object. The prior audit suggested spelling out the tile codes instead (1344m / 1124m); this candidate keeps the shape-relative wording and deliberately does not restate tile codes that the source 「と違って打」 does not repeat. Verify: (1) the referent ordering really matches b0055, (2) no tile identity was invented, (3) the following 1m/5m loss explanation still binds, and (4) nothing else moved.'}
];
const selfcheck = JSON.parse(await readFile(join(R, NS, 'receipts/selfcheck-b6-b7470d87d4fe34cc.json'), 'utf8'));
const production = JSON.parse(await readFile(join(R, NS, 'receipts/production-b6-623085d17b4c5314.json'), 'utf8'));
const hand = {schema: 'coac269-to-coac249-handoff/1', ticket: 'COAC-269', batch: 'b6', to: 'COAC-249', recordedAt: new Date().toISOString(), modelCalls: 0,
  scope: 'first independent semantic audit per candidate SHA; do not re-audit passed SHAs',
  budget: 'one first audit per chapter for this batch; failed or void audits count, no retry loop',
  jointExclusionAtDispatch: production.jointExclusion,
  excludedThisBatch: {
    'nemata-jp-chapter-183-1': 'pending adjudication (handoff/notice-249-do-not-audit-183-1-*.json): evidence only, do not audit, do not ingest',
    'nemata-jp-chapter-142-1': 'batch 5, already handed to COAC-249 as candidate f3570e7b…; do not mix batches',
    'nemata-jp-chapter-127-1': 'batch 5, already handed to COAC-249 as candidate 363fd45c…; do not mix batches',
    'nemata-jp-chapter-246-1': 'withdrawn duplicate; covered by passed chapter06-section002.rev1.json',
    'nemata-jp-chapter-237-1': 'withdrawn duplicate; covered by passed chapter04-section016.rev1.json',
    'nemata-jp-chapter-131-1': 'withdrawn duplicate; covered by passed chapter01-section049.rev1.json',
  },
  chapters: []};
const targetsOut = {schema: 'coach-explicit-audit-targets/1', createdAt: new Date().toISOString(),
  source: 'COAC-269 line B batch-5 produced candidates on their needs-repair display parents; prepared from the b6 preflight/claim/production/selfcheck receipts. No audit dispatched here.',
  totalTargets: 0, targets: []};
for (const p of b6) {
  const cb = await readFile(join(R, p.candidate)), cand = JSON.parse(cb);
  const rec = {...p};
  rec.candidateSha256 = sha(cb);
  rec.parentSha256 = sha(await readFile(join(R, p.parent)));
  rec.parentAuditSha256 = sha(await readFile(join(R, p.parentAudit)));
  rec.sourceSha256 = sha(await readFile(join(R, p.source)));
  rec.productionCall = cand.provenance.attempts.map(a => ({callId: a.callId, success: a.success, usage: a.usage, durationMs: a.durationMs, rawArtifactPath: a.rawArtifactPath, rawArtifactSha256: a.rawArtifactSha256, promptSha256: a.promptSha256, semanticPromptSha256: a.semanticPromptSha256, runnerSha256: cand.provenance.runnerSha256, cliSha256: a.cliSnapshot?.sha256}));
  rec.rawArtifactSha256Verified = await Promise.all(rec.productionCall.map(async a => sha(await readFile(join(R, 'web-production/v1', a.rawArtifactPath))) === a.rawArtifactSha256));
  rec.attemptCount = cand.provenance.attempts.length;
  rec.changed = (selfcheck.chapters.find(c => c.chapterId === p.chapterId) || {}).changed;
  rec.selfCheckReceipt = `${NS}/receipts/selfcheck-b6-b7470d87d4fe34cc.json`;
  rec.selfCheckOk = selfcheck.ok;
  hand.chapters.push(rec);
  targetsOut.targets.push({kind: 'complete-web-candidate', chapterId: p.chapterId, articleId: p.articleId, path: join(R, p.candidate).replaceAll('\\', '/'),
    sourceId: 'modern-yabejp-ja', sourceSha256: rec.sourceSha256, sha256: rec.candidateSha256, parentSha256: rec.parentSha256, parentAuditSha256: rec.parentAuditSha256,
    category: 'coac269-line-b-targeted-revision', targets: p.targets});
}
targetsOut.totalTargets = targetsOut.targets.length;
const handName = `handoff-b6-${sha(JSON.stringify(hand.chapters)).slice(0, 16)}.json`;
await writeFile(join(R, NS, 'handoff', handName), JSON.stringify(hand, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
const tgtName = `explicit-targets-b6-${sha(JSON.stringify(targetsOut.targets)).slice(0, 16)}.json`;
await writeFile(join(R, NS, 'handoff', tgtName), JSON.stringify(targetsOut, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
console.log(JSON.stringify({coac249Handoff: `${NS}/handoff/${handName}`, coac249ExplicitTargets: `${NS}/handoff/${tgtName}`,
  handoff: hand.chapters.map(c => ({chapterId: c.chapterId, candidate: c.candidateSha256, call: c.productionCall[0].callId, usage: c.productionCall[0].usage, rawVerified: c.rawArtifactSha256Verified, attempts: c.attemptCount}))}, null, 2));
