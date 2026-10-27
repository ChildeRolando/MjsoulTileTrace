import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',out=import.meta.dirname,stage=root+'/web-production/v1/runs/coac269-283-b0168-20261028';
const runtime=root+'/audit/runtimes/coac269-283-b0168-exact-v1-20261028',base=root+'/audit/runtimes/coac244-vision-terra-max-v1-20261027';
const read=async p=>JSON.parse(await readFile(p));const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=await read(runtime+'/b0168-runtime-manifest.json');
for(const f of manifest.files)assert.equal(sha(await readFile(f.path)),f.sha256);
const c=await read(runtime+'/b0168-contract.json'),parent=await read(c.parent.path),source=await read(c.source.path),notes=await read(c.notes.path),t=await read(stage+'/revision-targets.json');
const {verifyGroupRevisionIssueScope:oldScope}=await import(pathToFileURL(base+'/textbook-audit-web.mjs'));
const {verifyGroupRevisionIssueScope,verifyWebRevisionInheritance}=await import(pathToFileURL(runtime+'/textbook-audit-web.mjs'));
const {validateExact}=await import(pathToFileURL(runtime+'/b0168-exact-request.mjs'));
const {textbookClosedPrompt}=await import(pathToFileURL(runtime+'/textbook-production-cli.mjs'));
const revision={parentPath:c.parent.path,parentSha256:c.parent.sha256,notesPath:c.notes.path,notesSha256:c.notes.sha256,textBlockIds:t.textBlockIds,figureIds:[],groupRevision:{groups:t.groups,deferred:t.deferred},targets:{path:stage+'/revision-targets.json',sha256:sha(await readFile(stage+'/revision-targets.json'))}};
const groups=notes.batchReviews.map(r=>r.group),scope={parent,notes,groups,revision};
assert.throws(()=>oldScope(scope),/deferred_difference_set/);
assert(verifyGroupRevisionIssueScope(scope));let cases=2;
for(const mutate of [x=>x.groupRevision.deferred.pop(),x=>x.groupRevision.deferred[0].issueSha256='0'.repeat(64),x=>x.groupRevision.deferred.push(x.groupRevision.deferred[0]),x=>x.textBlockIds.push('modern-yabejp-ja:chapter06-exercise003:b0396')]){
 const r=structuredClone(revision);mutate(r);assert.throws(()=>verifyGroupRevisionIssueScope({...scope,revision:r}));cases++;
}
const good={translations:[{sourceBlockId:c.targetId,text:c.expected}],figures:[]};assert(validateExact(good));cases++;
for(const mutate of [x=>x.translations[0].text=c.before,x=>x.translations[0].text+='。',x=>x.translations.push(x.translations[0]),x=>x.figures.push({sourceBlockId:'foreign'})]){
 const x=structuredClone(good);mutate(x);assert.throws(()=>validateExact(x));cases++;
}
const child=structuredClone(parent);child.provenance.revision=revision;
const inheritance=await verifyWebRevisionInheritance(root,child);cases++;
const args=[runtime+'/textbook-production-web.mjs','--source',c.source.path,'--revision-from',c.parent.path,'--revision-notes',c.notes.path,'--revision-targets',stage+'/revision-targets.json','--dictionary',root+'/'+parent.provenance.dictionary.path,'--batch-plan',root+'/'+parent.provenance.batches.planPath,'--variant','coac269b0168r1'];
for(const flag of [['--preflight-only'],['--request-only','true']]){
 const cp=spawnSync(process.execPath,[...args,...flag],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
 assert.equal(cp.status,0,cp.stderr);cases++;
 if(flag[0]==='--request-only'){
  const built=JSON.parse(cp.stdout);assert.deepEqual(built.request.images,[]);assert.deepEqual(built.request.schema.properties.translations.items.properties.text.enum,[c.expected]);assert.equal(built.request.schema.properties.figures.maxItems,0);
  await writeFile(out+'/actual-request-boundary.json',JSON.stringify({...built,closedPrompt:textbookClosedPrompt(built.request.prompt)},null,2)+'\n');
 }
}
const batch010=notes.batchReviews.find(b=>b.group.batchId==='chapter06-exercise003-batch-010');assert.equal(batch010.status,'passed');assert.equal(batch010.group.sourceBlockIds.length,113);
const result={modelCalls:0,passed:true,regressionCases:cases,oldEntryRejected:true,newScopeIdentity:'batchId+targetId+severity+originalIssueSha256',deferredIssues:t.deferred.length,source:c.source,parent:c.parent,parentAudit:c.notes,revision,inheritance,batch010Reuse:{group:batch010.group.batchId,sourceBlocks:113,checkpoint:batch010.checkpoint,calls:batch010.calls},args:[process.execPath,...args]};
await writeFile(out+'/preflight.json',JSON.stringify(result,null,2)+'\n');await writeFile(stage+'/preflight.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({modelCalls:0,passed:true,regressionCases:cases,deferredIssues:t.deferred.length,images:0}));
