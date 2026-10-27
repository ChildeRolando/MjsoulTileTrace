#!/usr/bin/env node
// COAC-269 line B batch-3 handoff to COAC-249: explicit targets + SHA-complete receipt. No model call.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const R='E:/AgentData/Coach/knowledge/processing';
const NS='web-production/v1/coac269-20261027';
const sha=b=>createHash('sha256').update(b).digest('hex');
const b3=[
 {chapterId:'nemata-jp-chapter-183-1',articleId:'chapter03-section003',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section003.coac269rev1.json',
  parent:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section003.display.json',
  parentAudit:'audit/web/articles/modern-yabejp-ja/chapter03-section003.889adf0d0f694bc09475a5c35d83d758493e94af90c3e389dfdebfa5bf205b02.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/chapter03-section003/source.v2.json',
  targets:['modern-yabejp-ja:chapter03-section003:b0018'],
  notes:'b0018: the parent audit was uncertain whether 「打1張」 means discarding one and asked not to hard-rewrite it as 「已打出1张」 without confirmation. The candidate keeps 「已打出1张、可见1张」 but changes 能看到1张 to 可见1张 and rewrites the second clause as 「牌手会受到客风牌单骑更容易争取荣和这一想法的影响」. Verify the discard/visible wording and that the psychological clause still matches the original.'},
 {chapterId:'nemata-jp-chapter-131-1',articleId:'chapter01-section049',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section049.coac269rev1.json',
  parent:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section049.display.json',
  parentAudit:'audit/web/articles/modern-yabejp-ja/chapter01-section049.470217d79cd1acd28f234a1e691d4d950ae99d0c0463e6bd0211561c95de28ac.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/chapter01-section049/source.v2.json',
  targets:['modern-yabejp-ja:chapter01-section049:b0123'],
  notes:'b0123: the parent audit rejected 「失去七对子的可能性也不太令人介意」 as turning a lost chance into losing the route, and suggested the loss-of-七对子-value reading. The candidate now says 「七对子方面的损失也不太令人介意」. Verify against the original 「七対子の目がなくなるのも気にならない」.'}
];
const selfcheck=JSON.parse(await readFile(join(R,NS,'receipts/selfcheck-b3-3b846f9db751ee3e.json'),'utf8'));
const hand={schema:'coac269-to-coac249-handoff/1',ticket:'COAC-269',batch:'b3',to:'COAC-249',recordedAt:new Date().toISOString(),modelCalls:0,
 scope:'first independent semantic audit per candidate SHA; do not re-audit passed SHAs',chapters:[]};
const targetsOut={schema:'coach-explicit-audit-targets/1',createdAt:new Date().toISOString(),
 source:'COAC-269 line B batch-3 produced candidates on their needs-repair display parents; prepared from B claim/preflight/production/selfcheck receipts. No audit dispatched here.',totalTargets:0,targets:[]};
for(const p of b3){
 const cb=await readFile(join(R,p.candidate)),cand=JSON.parse(cb);
 const rec={...p};
 rec.candidateSha256=sha(cb);
 rec.parentSha256=sha(await readFile(join(R,p.parent)));
 rec.parentAuditSha256=sha(await readFile(join(R,p.parentAudit)));
 rec.sourceSha256=sha(await readFile(join(R,p.source)));
 rec.productionCall=cand.provenance.attempts.map(a=>({callId:a.callId,success:a.success,usage:a.usage,durationMs:a.durationMs,rawArtifactPath:a.rawArtifactPath,rawArtifactSha256:a.rawArtifactSha256,promptSha256:a.promptSha256,semanticPromptSha256:a.semanticPromptSha256,runnerSha256:cand.provenance.runnerSha256,cliSha256:a.cliSnapshot?.sha256}));
 rec.rawArtifactSha256Verified=await Promise.all(rec.productionCall.map(async a=>sha(await readFile(join(R,'web-production/v1',a.rawArtifactPath)))===a.rawArtifactSha256));
 rec.selfCheckReceipt=`${NS}/receipts/selfcheck-b3-3b846f9db751ee3e.json`;
 rec.selfCheckOk=selfcheck.ok;
 hand.chapters.push(rec);
 targetsOut.targets.push({kind:'complete-web-candidate',chapterId:p.chapterId,articleId:p.articleId,path:join(R,p.candidate).replaceAll('\\','/'),
  sourceId:'modern-yabejp-ja',sourceSha256:rec.sourceSha256,sha256:rec.candidateSha256,parentSha256:rec.parentSha256,parentAuditSha256:rec.parentAuditSha256,
  category:'coac269-line-b-targeted-revision',targets:p.targets});
}
targetsOut.totalTargets=targetsOut.targets.length;
const handName=`handoff-b3-${sha(JSON.stringify(hand.chapters)).slice(0,16)}.json`;
await writeFile(join(R,NS,'handoff',handName),JSON.stringify(hand,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
const tgtName=`explicit-targets-b3-${sha(JSON.stringify(targetsOut.targets)).slice(0,16)}.json`;
await writeFile(join(R,NS,'handoff',tgtName),JSON.stringify(targetsOut,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
console.log(JSON.stringify({coac249Handoff:`${NS}/handoff/${handName}`,coac249ExplicitTargets:`${NS}/handoff/${tgtName}`,
 handoff:hand.chapters.map(c=>({chapterId:c.chapterId,candidate:c.candidateSha256,call:c.productionCall[0].callId,usage:c.productionCall[0].usage,rawVerified:c.rawArtifactSha256Verified}))},null,2));
