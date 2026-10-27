#!/usr/bin/env node
// COAC-269 line B batch-7 handoff to COAC-249: explicit targets + SHA-complete receipt. No model call.
// Batch 7 is the COAC-244-dispatched multi-target text batch (089-1: 4 blocks, 060-1: 2 blocks).
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const R = 'E:/AgentData/Coach/knowledge/processing';
const NS = 'web-production/v1/coac269-20261027';
const sha = b => createHash('sha256').update(b).digest('hex');
const b7 = [
  {chapterId: 'nemata-jp-chapter-089-1', articleId: 'chapter01-section031',
   candidate: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section031.coac269rev1.json',
   parent: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section031.display.json',
   parentAudit: 'audit/web/articles/modern-yabejp-ja/chapter01-section031.9fa0255f1dbe5bdf38e94d0e6c447c09d4a97d689611f41fd1676af27fd89ffb.retry-1792951706280-1a9d74d2.json',
   source: 'web-sources/v1/modern-yabejp-ja/articles/chapter01-section031/source.json',
   targets: ['modern-yabejp-ja:chapter01-section031:b0042', 'modern-yabejp-ja:chapter01-section031:b0084', 'modern-yabejp-ja:chapter01-section031:b0102', 'modern-yabejp-ja:chapter01-section031:b0153'],
   production: 'receipts/production-b7-a8f3b1c51f826371.json',
   notes: 'Multi-target text revision, exactly 4 target blocks, no figures. b0042/b0084/b0102/b0153 each had a parent-audit error issue: the translation weakened the source 「が有力」 to 「值得考虑的选择」 (a consider-worthy option) instead of a strong recommendation. The candidate now restores 「有力选择」 in all four and keeps the three-colour condition in b0042 (「只在没有其他宝牌、且点棒状况需要高分时追求三色即可」, matching 「のみで良いとみる」). Verify against the Japanese: (1) b0042 「落としが有力」 is a recommendation, not a possibility, and the follows-clause still limits it; (2) b0084 「確定はしないが…両天秤が有力なケースが多い」 keeps both the uncertainty and the recommendation; (3) b0102/b0153 「が有力。」 are the tail of their preceding sentence and must stay strength-consistent with it; (4) no tile identity, inequality or condition was invented; (5) nothing outside the four blocks moved.'},
  {chapterId: 'nemata-jp-chapter-060-1', articleId: 'chapter01-section021-06',
   candidate: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section021-06.coac269rev1.json',
   parent: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section021-06.display.json',
   parentAudit: 'audit/web/articles/modern-yabejp-ja/chapter01-section021-06.ff1f57ff633d050ec1edff51301a3e4a4e3f68d690774a7a8c60893f4300f828.json',
   source: 'web-sources/v1/modern-yabejp-ja/articles/chapter01-section021-06/source.json',
   targets: ['modern-yabejp-ja:chapter01-section021-06:b0027', 'modern-yabejp-ja:chapter01-section021-06:b0033'],
   production: 'receipts/production-b7-74550f1543cdc0a2.json',
   notes: 'Multi-target text revision, exactly 2 target blocks, no figures. b0027: the parent said only that the reason was the same as the second comparison above, without naming which one; the candidate names it as the second comparison up (好形1,300点＞愚形2,600点), matching the parent-audit suggestion. b0033: the tile-count comparison was collapsed (「1张普通…1张普通…2张」 lost one ordinary tile); the candidate states 两面听役牌＋赤宝牌1张＋普通宝牌1张 versus 宝牌单骑的役牌＋赤宝牌1张＋普通宝牌2张, restoring the 1-vs-2 ordinary-tile asymmetry, and renders 「中盤過ぎると微妙になる」 as 「过了中盘后，优劣就变得微妙了」. Verify: (1) the named comparison really is the second one up in b0027 context and its numbers match the source 「良形1,300点＞愚形2,600点」; (2) b0033 tile counts match 「リャンメン役牌赤ドラ」 vs 「ドラ単騎の役牌赤ドラドラ」; (3) all inequalities are preserved; (4) nothing outside the two blocks moved.'}
];
const selfcheck = JSON.parse(await readFile(join(R, NS, 'receipts/selfcheck-b7-4a1c916b0d74e1ad.json'), 'utf8'));
const hand = {schema: 'coac269-to-coac249-handoff/1', ticket: 'COAC-269', batch: 'b7', to: 'COAC-249', recordedAt: new Date().toISOString(), modelCalls: 0,
  scope: 'first independent semantic audit per candidate SHA; do not re-audit passed SHAs',
  budget: 'one first audit per chapter for this batch; failed or void audits count, no retry loop',
  entry: 'multi-target text revision is natively supported by the existing frozen entry (textBlockIds array; figureIds empty; body.mode translated). No gate, runtime, selection, pointer or register was modified.',
  excludedThisBatch: {
    'nemata-jp-chapter-183-1': 'pending adjudication (handoff/notice-249-do-not-audit-183-1-*.json): evidence only, do not audit, do not ingest',
    'nemata-jp-chapter-142-1': 'batch 5, independently passed 11:25:33Z; do not re-audit',
    'nemata-jp-chapter-127-1': 'batch 5, independently passed 11:27:18Z; do not re-audit',
    'nemata-jp-chapter-027-1': 'batch 6, independently passed 11:27:18Z; do not re-audit',
    'nemata-jp-chapter-246-1': 'withdrawn duplicate; covered by passed chapter06-section002.rev1.json',
    'nemata-jp-chapter-237-1': 'withdrawn duplicate; covered by passed chapter04-section016.rev1.json',
    'nemata-jp-chapter-131-1': 'withdrawn duplicate; covered by passed chapter01-section049.rev1.json'
  },
  chapters: []};
const targetsOut = {schema: 'coach-explicit-audit-targets/1', createdAt: new Date().toISOString(),
  source: 'COAC-269 line B batch-7 produced candidates on their needs-repair display parents; prepared from the b7 preflight/claim/production/selfcheck receipts. No audit dispatched here.',
  totalTargets: 0, targets: []};
for (const p of b7) {
  const cb = await readFile(join(R, p.candidate)), cand = JSON.parse(cb);
  const prod = JSON.parse(await readFile(join(R, NS, p.production), 'utf8'));
  const pc = prod.chapters.find(x => x.chapterId === p.chapterId);
  const rec = {...p};
  rec.candidateSha256 = sha(cb);
  rec.parentSha256 = sha(await readFile(join(R, p.parent)));
  rec.parentAuditSha256 = sha(await readFile(join(R, p.parentAudit)));
  rec.sourceSha256 = sha(await readFile(join(R, p.source)));
  rec.productionCall = cand.provenance.attempts.map(a => ({callId: a.callId, success: a.success, usage: a.usage, durationMs: a.durationMs, rawArtifactPath: a.rawArtifactPath, rawArtifactSha256: a.rawArtifactSha256, promptSha256: a.promptSha256, semanticPromptSha256: a.semanticPromptSha256, runnerSha256: cand.provenance.runnerSha256, cliSha256: a.cliSnapshot?.sha256}));
  rec.rawArtifactSha256Verified = await Promise.all(rec.productionCall.map(async a => sha(await readFile(join(R, 'web-production/v1', a.rawArtifactPath))) === a.rawArtifactSha256));
  rec.attemptCount = cand.provenance.attempts.length;
  rec.changed = (selfcheck.chapters.find(c => c.chapterId === p.chapterId) || {}).changed;
  rec.selfCheckReceipt = `${NS}/receipts/selfcheck-b7-4a1c916b0d74e1ad.json`;
  rec.selfCheckOk = selfcheck.ok;
  rec.jointExclusionAtDispatch = pc.jointExclusionAtDispatch;
  rec.sharedClaimAtDispatch = pc.sharedClaimAtDispatch;
  rec.dispatchGuardReceipt = pc.dispatchGuard?.receipt ?? null;
  rec.makerSlot = {acquiredAt: prod.makerSlot?.acquiredAt, releasedAt: prod.makerSlot?.releasedAt, acquireExit: prod.makerSlot?.acquireExit, releaseExit: prod.makerSlot?.releaseExit};
  rec.productionReceipt = `${NS}/${p.production}`;
  hand.chapters.push(rec);
  targetsOut.targets.push({kind: 'complete-web-candidate', chapterId: p.chapterId, articleId: p.articleId, path: join(R, p.candidate).replaceAll('\\', '/'),
    sourceId: 'modern-yabejp-ja', sourceSha256: rec.sourceSha256, sha256: rec.candidateSha256, parentSha256: rec.parentSha256, parentAuditSha256: rec.parentAuditSha256,
    category: 'coac269-line-b-targeted-multi-text-revision', targets: p.targets});
}
targetsOut.totalTargets = targetsOut.targets.length;
const handName = `handoff-b7-${sha(JSON.stringify(hand.chapters)).slice(0, 16)}.json`;
await writeFile(join(R, NS, 'handoff', handName), JSON.stringify(hand, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
const tgtName = `explicit-targets-b7-${sha(JSON.stringify(targetsOut.targets)).slice(0, 16)}.json`;
await writeFile(join(R, NS, 'handoff', tgtName), JSON.stringify(targetsOut, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
console.log(JSON.stringify({coac249Handoff: `${NS}/handoff/${handName}`, coac249ExplicitTargets: `${NS}/handoff/${tgtName}`,
  handoff: hand.chapters.map(c => ({chapterId: c.chapterId, candidate: c.candidateSha256, call: c.productionCall[0].callId, usage: c.productionCall[0].usage, durationMs: c.productionCall[0].durationMs, rawVerified: c.rawArtifactSha256Verified, attempts: c.attemptCount, targets: c.targets, changed: c.changed}))}, null, 2));
