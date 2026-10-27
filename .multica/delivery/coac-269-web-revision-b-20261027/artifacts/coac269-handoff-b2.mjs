#!/usr/bin/env node
// COAC-269 line B handoffs, zero model calls:
//  - batch-1 (338-1, 273-1) passed by COAC-249 -> COAC-250 single-writer intake
//  - batch-2 (246-1, 237-1) produced -> COAC-249 explicit targets + handoff receipt
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const R='E:/AgentData/Coach/knowledge/processing';
const NS='web-production/v1/coac269-20261027';
const sha=b=>createHash('sha256').update(b).digest('hex');
const readJson=async p=>JSON.parse(await readFile(join(R,p)));

const b1=[
 {chapterId:'nemata-jp-chapter-338-1',articleId:'archive01-section006',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.coac269rev1.json',
  parent:'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.display.json',
  parentAudit:'audit/web/articles/modern-yabejp-ja/archive01-section006.04ab76405f88fa1df61d68c2047cf3cb344b8db8644f193c520fee805b83c427.json',
  newAudit:'audit/web/articles/modern-yabejp-ja/archive01-section006.ff5a9b524d8e10c62f97011bde7f6a5a837f58e8557230ca60c67581b426f782.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/archive01-section006/source.json',
  productionReceipt:'web-production/v1/coac269-20261027/receipts/production-a0e44374eb53c101.json',
  targets:['modern-yabejp-ja:archive01-section006:b0518'],
  auditVerdict:'passed at 2026-10-27T10:01:45.983Z by COAC-249 audit call e269cb63-bc32-4572-bd09-fd6d4f96ad56'},
 {chapterId:'nemata-jp-chapter-273-1',articleId:'chapter06-exercise002-02',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.coac269rev1.json',
  parent:'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.display.json',
  parentAudit:'audit/web/articles/modern-yabejp-ja/chapter06-exercise002-02.c57c30e4ffddb9ea661295364ee46739438c2c17a4f4c772e5df0b8391c7576b.json',
  newAudit:'audit/web/articles/modern-yabejp-ja/chapter06-exercise002-02.42991d764c900c46cba313848cc1c5138789c60079e6a988d4f6df5e09da330e.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise002-02/source.json',
  productionReceipt:'web-production/v1/coac269-20261027/receipts/production-7daef3a1b8dd2de9.json',
  targets:['modern-yabejp-ja:chapter06-exercise002-02:b0263','modern-yabejp-ja:chapter06-exercise002-02:b0545'],
  auditVerdict:'passed at 2026-10-27T10:02:55.822Z by COAC-249 audit call ddd61cc9-ebe3-4a89-8cf3-a2165d811940'}
];
const b2=[
 {chapterId:'nemata-jp-chapter-246-1',articleId:'chapter06-section002',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter06-section002.coac269rev1.json',
  parent:'web-production/v1/candidates/modern-yabejp-ja/chapter06-section002.display.json',
  parentAudit:'audit/web/articles/modern-yabejp-ja/chapter06-section002.eb4caf1b93fc906a5a7286419009256337e9f886ce82123091931c8c5e5c4fc4.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/chapter06-section002/source.json',
  targets:['modern-yabejp-ja:chapter06-section002:b0070'],
  notes:'b0070: original 每步必须在30秒以内 is the rule for the 30-second per-move after the 15-minute base time; the candidate now says 每步的行棋时间必须少于30秒 and 中盘和残局阶段. Verify the rule wording and that no other claim was added.'},
 {chapterId:'nemata-jp-chapter-237-1',articleId:'chapter04-section016',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter04-section016.coac269rev1.json',
  parent:'web-production/v1/candidates/modern-yabejp-ja/chapter04-section016.display.json',
  parentAudit:'audit/web/articles/modern-yabejp-ja/chapter04-section016.5c4048adf1b398f2a202dbdd0a1485cdaa539ad2ad4fd80e053dd0f2db17a959.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/chapter04-section016/source.json',
  targets:['modern-yabejp-ja:chapter04-section016:b0002'],
  notes:'b0002: the audit asked to strengthen the emphasis 重視和牌率 and to drop the overly granular hedge. Candidate now marks *若供托或积棒较多，就重视和牌率* and keeps the avoid-deal-in branch. Verify the emphasis and that the hedge removal did not drop a condition.'}
];

// ---- COAC-250 intake for passed batch-1 ----
const intake={schema:'coac269-to-coac250-intake/1',ticket:'COAC-269',to:'COAC-250',recordedAt:new Date().toISOString(),modelCalls:0,productionCalls:0,
 scope:'single-writer merge intake after COAC-249 independent pass; B does not write integration/, selection or pointer',chapters:[]};
for(const p of b1){
 const cb=await readFile(join(R,p.candidate)),cand=JSON.parse(cb);
 const rec={...p};
 rec.candidateSha256=sha(cb);
 rec.parentSha256=sha(await readFile(join(R,p.parent)));
 rec.parentAuditSha256=sha(await readFile(join(R,p.parentAudit)));
 rec.newAuditSha256=sha(await readFile(join(R,p.newAudit)));
 rec.newAuditStatus=(await readJson(p.newAudit)).status;
 rec.sourceSha256=sha(await readFile(join(R,p.source)));
 const receipt=await readJson(p.productionReceipt);
 rec.production={receiptPath:p.productionReceipt,result:receipt.result,modelCalls:receipt.modelCalls,makerLane:receipt.makerLane,usageTotal:receipt.usageTotal};
 rec.candidateSelfSha=(()=>{const c={...cand};delete c.candidateSha256;return sha(JSON.stringify(c));})();
 rec.candidateSelfConsistent=rec.candidateSelfSha===cand.candidateSha256;
 intake.chapters.push(rec);
}
const intakeName=`coac250-intake-b1-${sha(JSON.stringify(intake.chapters)).slice(0,16)}.json`;
await writeFile(join(R,NS,'handoff',intakeName),JSON.stringify(intake,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});

// ---- COAC-249 handoff + explicit targets for batch-2 ----
const hand={schema:'coac269-to-coac249-handoff/1',ticket:'COAC-269',batch:'b2',to:'COAC-249',recordedAt:new Date().toISOString(),modelCalls:0,
 scope:'first independent semantic audit per candidate SHA; do not re-audit passed SHAs',chapters:[]};
const targetsOut={schema:'coach-explicit-audit-targets/1',createdAt:new Date().toISOString(),
 source:'COAC-269 line B batch-2 produced candidates on their needs-repair display parents; prepared from B claim/preflight/production/selfcheck receipts. No audit dispatched here.',totalTargets:0,targets:[]};
const selfcheck=await readJson('web-production/v1/coac269-20261027/receipts/selfcheck-b2-a31882504aa9f399.json');
for(const p of b2){
 const cb=await readFile(join(R,p.candidate)),cand=JSON.parse(cb);
 const rec={...p};
 rec.candidateSha256=sha(cb);
 rec.parentSha256=sha(await readFile(join(R,p.parent)));
 rec.parentAuditSha256=sha(await readFile(join(R,p.parentAudit)));
 rec.sourceSha256=sha(await readFile(join(R,p.source)));
 rec.productionCall=cand.provenance.attempts.map(a=>({callId:a.callId,success:a.success,usage:a.usage,durationMs:a.durationMs,rawArtifactPath:a.rawArtifactPath,rawArtifactSha256:a.rawArtifactSha256,promptSha256:a.promptSha256,semanticPromptSha256:a.semanticPromptSha256,runnerSha256:cand.provenance.runnerSha256,cliSha256:a.cliSnapshot?.sha256}));
 rec.rawArtifactSha256Verified=await Promise.all(rec.productionCall.map(async a=>sha(await readFile(join(R,'web-production/v1',a.rawArtifactPath)))===a.rawArtifactSha256));
 rec.selfCheckReceipt='web-production/v1/coac269-20261027/receipts/selfcheck-b2-a31882504aa9f399.json';
 rec.selfCheckOk=selfcheck.ok;
 hand.chapters.push(rec);
 targetsOut.targets.push({kind:'complete-web-candidate',chapterId:p.chapterId,articleId:p.articleId,path:join(R,p.candidate).replaceAll('\\','/'),
  sourceId:'modern-yabejp-ja',sourceSha256:rec.sourceSha256,sha256:rec.candidateSha256,parentSha256:rec.parentSha256,parentAuditSha256:rec.parentAuditSha256,
  category:'coac269-line-b-targeted-revision',targets:p.targets});
}
targetsOut.totalTargets=targetsOut.targets.length;
const handName=`handoff-b2-${sha(JSON.stringify(hand.chapters)).slice(0,16)}.json`;
await writeFile(join(R,NS,'handoff',handName),JSON.stringify(hand,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
const tgtName=`explicit-targets-b2-${sha(JSON.stringify(targetsOut.targets)).slice(0,16)}.json`;
await writeFile(join(R,NS,'handoff',tgtName),JSON.stringify(targetsOut,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
console.log(JSON.stringify({coac250Intake:`${NS}/handoff/${intakeName}`,coac249Handoff:`${NS}/handoff/${handName}`,coac249ExplicitTargets:`${NS}/handoff/${tgtName}`,
 intake:intake.chapters.map(c=>({chapterId:c.chapterId,candidate:c.candidateSha256,audit:c.newAuditSha256,status:c.newAuditStatus,selfConsistent:c.candidateSelfConsistent})),
 handoff:hand.chapters.map(c=>({chapterId:c.chapterId,candidate:c.candidateSha256,call:c.productionCall[0].callId,usage:c.productionCall[0].usage,rawVerified:c.rawArtifactSha256Verified})),
 targets:targetsOut.targets.map(t=>({chapterId:t.chapterId,sha256:t.sha256,path:t.path}))},null,2));
