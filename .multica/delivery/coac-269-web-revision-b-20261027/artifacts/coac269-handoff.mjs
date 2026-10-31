#!/usr/bin/env node
// COAC-269 -> COAC-249 handoff receipt: candidate/parent/audit/source/raw/call SHAs. No model call.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const R='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');
const produced=[
 {chapterId:'nemata-jp-chapter-338-1',articleId:'archive01-section006',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.coac269rev1.json',
  parent:'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.display.json',
  parentAudit:'audit/web/articles/modern-yabejp-ja/archive01-section006.04ab76405f88fa1df61d68c2047cf3cb344b8db8644f193c520fee805b83c427.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/archive01-section006/source.json',
  notes:'The audit issue is a locator only; independently re-read 「場の安さ高さ」 in context. Produced wording follows the audit suggestion semantics (buying/expensive board evaluation), not its exact string.',
  targets:['modern-yabejp-ja:archive01-section006:b0518']},
 {chapterId:'nemata-jp-chapter-273-1',articleId:'chapter06-exercise002-02',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.coac269rev1.json',
  parent:'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.display.json',
  parentAudit:'audit/web/articles/modern-yabejp-ja/chapter06-exercise002-02.c57c30e4ffddb9ea661295364ee46739438c2c17a4f4c772e5df0b8391c7576b.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise002-02/source.json',
  notes:'b0263: model wrote 「立直与本方案相比…」 where the prior audit suggested a 「与切[3m]」 construction; verify faithfulness of the comparison object against the original 「リーチと待ち牌数は１枚しか変わらず」 and the inline 3m tile position. b0545 uses 「七对子一向听」.',
  targets:['modern-yabejp-ja:chapter06-exercise002-02:b0263','modern-yabejp-ja:chapter06-exercise002-02:b0545']}
];
const out={schema:'coac269-to-coac249-handoff/1',ticket:'COAC-269',to:'COAC-249',recordedAt:new Date().toISOString(),modelCalls:0,scope:'first independent semantic audit per candidate SHA; do not re-audit passed SHAs',chapters:[]};
for(const p of produced){
 const cb=await readFile(join(R,p.candidate)),cand=JSON.parse(cb);
 const rec={...p};
 rec.candidateSha256=sha(cb);rec.parentSha256=sha(await readFile(join(R,p.parent)));rec.parentAuditSha256=sha(await readFile(join(R,p.parentAudit)));rec.sourceSha256=sha(await readFile(join(R,p.source)));
 rec.productionCall=cand.provenance.attempts.map(a=>({callId:a.callId,success:a.success,usage:a.usage,durationMs:a.durationMs,rawArtifactPath:a.rawArtifactPath,rawArtifactSha256:a.rawArtifactSha256,promptSha256:a.promptSha256,semanticPromptSha256:a.semanticPromptSha256,runnerSha256:cand.provenance.runnerSha256,cliSha256:a.cliSnapshot.sha256}));
 rec.rawArtifactSha256Verified=await Promise.all(rec.productionCall.map(async a=>sha(await readFile(join(R,'web-production/v1',a.rawArtifactPath)))===a.rawArtifactSha256));
 rec.selfCheckReceipt='web-production/v1/coac269-20261027/receipts/selfcheck-f1238d307d0f2a4a.json';
 out.chapters.push(rec);
}
const name=`handoff-${sha(JSON.stringify(out.chapters)).slice(0,16)}.json`;
await writeFile(join(R,'web-production/v1/coac269-20261027/handoff',name),JSON.stringify(out,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
console.log(JSON.stringify({path:`web-production/v1/coac269-20261027/handoff/${name}`,chapters:out.chapters.map(c=>({chapterId:c.chapterId,candidateSha256:c.candidateSha256,call:c.productionCall[0].callId,usage:c.productionCall[0].usage,rawVerified:c.rawArtifactSha256Verified}))},null,2));
