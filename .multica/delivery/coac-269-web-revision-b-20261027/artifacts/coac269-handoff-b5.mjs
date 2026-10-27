#!/usr/bin/env node
// COAC-269 line B batch-5 handoff to COAC-249: explicit targets + SHA-complete receipt. No model call.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const R = 'E:/AgentData/Coach/knowledge/processing';
const NS = 'web-production/v1/coac269-20261027';
const sha = b => createHash('sha256').update(b).digest('hex');
const b5 = [
  {chapterId: 'nemata-jp-chapter-142-1', articleId: 'chapter01-section054',
   candidate: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section054.coac269rev1.json',
   parent: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section054.display.json',
   parentAudit: 'audit/web/articles/modern-yabejp-ja/chapter01-section054.264116a9f0d98a22e3d5ae6218adf35a677aecc154c6f4bbad4982240c11b04e.retry-1792969500839-d3667291.json',
   source: 'web-sources/v1/modern-yabejp-ja/articles/chapter01-section054/source.json',
   targets: ['modern-yabejp-ja:chapter01-section054:b0173'],
   notes: 'b0173: parent audit rejected the translation for dropping 「引きでも」 (the draw condition) — original 「引きでもリャンメンテンパイになる。」. The revision now reads 「，摸到其中任意一张也能形成两面听牌。」 so the draw condition is explicit and the two tiles come from the preceding block b0172. Verify the draw condition is preserved, that no tile identity was invented, and that nothing else moved.'},
  {chapterId: 'nemata-jp-chapter-127-1', articleId: 'chapter01-section047',
   candidate: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section047.coac269rev1.json',
   parent: 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section047.display.json',
   parentAudit: 'audit/web/articles/modern-yabejp-ja/chapter01-section047.0dcafc25b6ad5686171ab4a90472ee7fdc69a651ed9be98c8a5a411646e551dc.retry-1792965844463-86544923.json',
   source: 'web-sources/v1/modern-yabejp-ja/articles/chapter01-section047/source.json',
   targets: ['modern-yabejp-ja:chapter01-section047:b0030'],
   notes: 'b0030: parent audit required リーチのみ (riichi as the only yaku) to be translated instead of the untranslated loanword 「立直nomi」. The revision now reads 「不过，如果没有宝牌，而且处于希望避免仅有立直一役的愚形立直的局面（参见攻守判断论），那么打」. Verify ドラ無し = 没有宝牌, リーチのみ = 仅有立直一役, 愚形 = 愚形, the parenthetical reference is intact, and the trailing 那么打 still binds to the following tile figure.'}
];
const selfcheck = JSON.parse(await readFile(join(R, NS, 'receipts/selfcheck-b5-31d78fb246d54415.json'), 'utf8'));
const production = JSON.parse(await readFile(join(R, NS, 'receipts/production-b5-d8973bee19a1e53d.json'), 'utf8'));
const hand = {schema: 'coac269-to-coac249-handoff/1', ticket: 'COAC-269', batch: 'b5', to: 'COAC-249', recordedAt: new Date().toISOString(), modelCalls: 0,
  scope: 'first independent semantic audit per candidate SHA; do not re-audit passed SHAs',
  budget: 'one first audit per chapter for this batch; failed or void audits count, no retry loop',
  jointExclusionAtDispatch: production.jointExclusion,
  excludedThisBatch: {
    'nemata-jp-chapter-183-1': 'pending adjudication (see handoff/notice-249-do-not-audit-183-1-*.json): do not audit the b3 candidate, it is evidence only',
    'nemata-jp-chapter-246-1': 'withdrawn duplicate; covered by passed chapter06-section002.rev1.json',
    'nemata-jp-chapter-237-1': 'withdrawn duplicate; covered by passed chapter04-section016.rev1.json',
    'nemata-jp-chapter-131-1': 'withdrawn duplicate; covered by passed chapter01-section049.rev1.json',
  },
  chapters: []};
const targetsOut = {schema: 'coach-explicit-audit-targets/1', createdAt: new Date().toISOString(),
  source: 'COAC-269 line B batch-5 produced candidates on their needs-repair display parents; prepared from the b5 preflight/claim/production/selfcheck receipts. No audit dispatched here.',
  totalTargets: 0, targets: []};
for (const p of b5) {
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
  rec.selfCheckReceipt = `${NS}/receipts/selfcheck-b5-31d78fb246d54415.json`;
  rec.selfCheckOk = selfcheck.ok;
  hand.chapters.push(rec);
  targetsOut.targets.push({kind: 'complete-web-candidate', chapterId: p.chapterId, articleId: p.articleId, path: join(R, p.candidate).replaceAll('\\', '/'),
    sourceId: 'modern-yabejp-ja', sourceSha256: rec.sourceSha256, sha256: rec.candidateSha256, parentSha256: rec.parentSha256, parentAuditSha256: rec.parentAuditSha256,
    category: 'coac269-line-b-targeted-revision', targets: p.targets});
}
targetsOut.totalTargets = targetsOut.targets.length;
const handName = `handoff-b5-${sha(JSON.stringify(hand.chapters)).slice(0, 16)}.json`;
await writeFile(join(R, NS, 'handoff', handName), JSON.stringify(hand, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
const tgtName = `explicit-targets-b5-${sha(JSON.stringify(targetsOut.targets)).slice(0, 16)}.json`;
await writeFile(join(R, NS, 'handoff', tgtName), JSON.stringify(targetsOut, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
console.log(JSON.stringify({coac249Handoff: `${NS}/handoff/${handName}`, coac249ExplicitTargets: `${NS}/handoff/${tgtName}`,
  handoff: hand.chapters.map(c => ({chapterId: c.chapterId, candidate: c.candidateSha256, call: c.productionCall[0].callId, usage: c.productionCall[0].usage, rawVerified: c.rawArtifactSha256Verified, attempts: c.attemptCount}))}, null, 2));
