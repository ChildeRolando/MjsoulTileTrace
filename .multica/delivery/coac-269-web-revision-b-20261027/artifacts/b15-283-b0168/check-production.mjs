import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',out=import.meta.dirname;
const prod=root+'/audit/runtimes/coac269-283-b0168-exact-v1-20261028',review=root+'/audit/runtimes/coac269-283-b0168-review-v1-20261028';
const sha=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(p));
for(const [dir,name] of [[prod,'b0168-runtime-manifest.json'],[review,'b0168-review-runtime-manifest.json']])for(const f of (await read(dir+'/'+name)).files)assert.equal(sha(await readFile(f.path)),f.sha256);
const contract=await read(prod+'/b0168-contract.json'),result=await read(out+'/production-result.json');
for(const f of [contract.source,contract.parent,contract.notes])assert.equal(sha(await readFile(f.path)),f.sha256);
const parent=await read(contract.parent.path),source=await read(contract.source.path),notes=await read(contract.notes.path),bytes=await readFile(result.candidatePath),candidate=JSON.parse(bytes);
assert.equal(sha(bytes),result.candidateSha256);assert.equal(result.newProductionCalls,1);assert.equal(result.newAuditCalls,0);
const changed=[];assert.equal(parent.body.blocks.length,candidate.body.blocks.length);
for(let i=0;i<parent.body.blocks.length;i++){
 const a=parent.body.blocks[i],b=candidate.body.blocks[i];
 if(JSON.stringify(a)!==JSON.stringify(b)){
  assert.deepEqual(b.sourceBlockIds,[contract.targetId]);assert.equal(a.text,contract.before);assert.equal(b.text,contract.expected);
  const n=structuredClone(b);n.text=a.text;assert.deepEqual(n,a);changed.push({index:i,targetId:contract.targetId,before:a.text,after:b.text});
 }
}
assert.equal(changed.length,1);assert.deepEqual(candidate.figures,parent.figures);
for(const key of Object.keys(parent))if(!['body','provenance','candidateSha256'].includes(key))assert.deepEqual(candidate[key],parent[key]);
assert.match(candidate.candidateSha256,/^[a-f0-9]{64}$/);assert.notEqual(candidate.candidateSha256,parent.candidateSha256);
const call=result.calls[0],rawPath=root+'/web-production/v1/'+call.rawArtifactPath,rawBytes=await readFile(rawPath),raw=JSON.parse(rawBytes);
assert.equal(sha(rawBytes),call.rawArtifactSha256);assert.equal(call.model,'gpt-6.1-sol');assert.equal(call.reasoningEffort,'high');assert.deepEqual(call.requestExecution.images,[]);
const boundary=await read(out+'/actual-request-boundary.json');assert.equal(raw.requestPrompt,boundary.closedPrompt);assert.deepEqual(raw.schema,boundary.request.schema);
assert.deepEqual(raw.parsedOutput,{translations:[{sourceBlockId:contract.targetId,text:contract.expected}],figures:[]});
const {verifyWebProductionCall,webGroupRevisionScope,webGroupRevisionSchema,groupRevisionPrompt}=await import(pathToFileURL(review+'/textbook-audit-web.mjs'));
const {webGroupRevisionScope:oldScope}=await import(pathToFileURL(prod+'/textbook-audit-web.mjs'));
const {textbookRequestConfig,textbookClosedPrompt}=await import(pathToFileURL(review+'/textbook-production-cli.mjs'));
const proof=await verifyWebProductionCall(root,candidate);
const group=notes.batchReviews.find(r=>r.group.batchId==='chapter06-exercise003-batch-002').group,revision=candidate.provenance.revision,known=proof.inheritedAssetIds;
const before=oldScope(source,candidate,group,revision,known),scope=webGroupRevisionScope(source,candidate,group,revision,known);
assert.equal(before.originals.length,0);assert.equal(scope.originals.length,2);assert.deepEqual(scope.textIds,[contract.targetId]);assert.deepEqual(scope.figureIds,[]);
const q12=contract.question.sourceBlocks.map(b=>b.id);for(const id of q12)assert(scope.source.blocks.some(b=>b.id===id));
const expectedIds=source.blocks.filter(b=>['b0153','b0169'].some(id=>b.id.endsWith(':'+id))).flatMap(b=>b.images.map(i=>i.assetId));
assert.deepEqual(new Set(scope.originals.map(a=>a.assetId)),new Set(expectedIds));
const images=[];for(const a of scope.originals){const path=root+'/web-sources/v1/'+a.path,b=await readFile(path);assert.equal(sha(b),a.sha256);images.push({assetId:a.assetId,path,sha256:sha(b),bytes:b.length});}
assert.deepEqual(textbookRequestConfig(images.map(i=>i.path)),{model:'gpt-6.1-terra',reasoningEffort:'max'});
assert.deepEqual(textbookRequestConfig([]),{model:'gpt-6.1-sol',reasoningEffort:'high'});
assert.throws(()=>textbookRequestConfig(images,'gpt-6.1-sol','max'));
// Exact-bound exception must not alter another target, group, or parent.
for(const mutate of [r=>r.parentSha256='0'.repeat(64),r=>r.textBlockIds=['modern-yabejp-ja:chapter06-exercise003:b0396'],r=>r.figureIds=['foreign']]){
 const r=structuredClone(revision);mutate(r);assert.deepEqual(webGroupRevisionScope(source,candidate,group,r,known),oldScope(source,candidate,group,r,known));
}
const batch010=notes.batchReviews.find(r=>r.group.batchId==='chapter06-exercise003-batch-010');assert.equal(batch010.status,'passed');assert.equal(batch010.group.sourceBlockIds.length,113);
const prompt=groupRevisionPrompt(scope),request={prompt,schema:webGroupRevisionSchema(scope),images:images.map(i=>i.path),model:'gpt-6.1-sol',reasoningEffort:'high',timeoutMs:900000};
await writeFile(out+'/review-request-boundary.json',JSON.stringify({request,resolvedModel:textbookRequestConfig(request.images),imageBindings:images,closedPrompt:textbookClosedPrompt(prompt),scope:scope.projection.reviewScope,notDispatched:true},null,2)+'\n');
const receipt={passed:true,modelCallsAdded:0,candidate:{path:result.candidatePath,sha256:sha(bytes)},changedBlocks:changed,unchangedBlocks:1194,unchangedFigures:candidate.figures.length,raw:{path:rawPath,sha256:sha(rawBytes)},actualProductionRequestMatchesZeroCallBoundary:true,productionProof:proof,reviewContext:{zeroCallOnly:true,oldEntryImages:0,preparedImages:images,completeQ12Blocks:q12.length,onlyTargetIds:scope.textIds,resolvedModel:textbookRequestConfig(request.images)},batch010Reuse:{status:batch010.status,blocks:113,checkpoint:batch010.checkpoint}};
await writeFile(out+'/selfcheck.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({passed:true,changedBlocks:1,unchangedBlocks:1194,unchangedFigures:candidate.figures.length,reviewImages:images.length,modelCallsAdded:0}));
