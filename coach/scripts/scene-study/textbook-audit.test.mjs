import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deterministicChecks, validateReview, verifyAuditForCandidate, sha, reviewPrompt, summarizeAuditUsage, auditUsageFromEvents, auditTransportCompleted, auditPage, recoverCompletedAudit, verifySpecificPdfLegendChange, assertPdfCandidateNotExcluded } from './textbook-audit.mjs';

test('only exact recovered TLS fallback items are diagnostics; tool calls and unknown errors remain rejected',()=>{
 const diagnostic={type:'item.completed',item:{id:'item_0',type:'error',message:'Falling back from WebSockets to HTTPS transport. stream disconnected before completion: tls handshake eof'}},r={exitCode:0,timedOut:false,outputOverflow:false,output:{checks:[]},events:[diagnostic,{type:'turn.completed',usage:{input_tokens:5,cached_input_tokens:0,output_tokens:2}}]};assert.equal(auditTransportCompleted(r),true);
 for(const mutate of [x=>x.events[0].item.message='unknown error',x=>x.events[0].item.tool='read_resource',x=>x.events[0].item.type='mcp_tool_call',x=>x.events.push({type:'turn.failed'}),x=>x.events[1].usage={},x=>x.output=null,x=>x.exitCode=1,x=>x.timedOut=true]){const bad=structuredClone(r);mutate(bad);assert.equal(auditTransportCompleted(bad),false);}
});

function fixture() {
  const source = { sourceId:'79-cn',sha256:'pdf-hash',language:'zh-CN' };
  const page = { page:1,blocks:[{id:'text1',type:'text',lines:[{text:'通常可以，但对子多时例外。'}]},{id:'image1',type:'image',bbox:[0,0,10,10]}] };
  const candidate = { schema:'coach-textbook-page-draft/1',status:'draft',source:{sourceId:'79-cn',pdfSha256:'pdf-hash',page:1,pageDataSha256:'page-hash'},body:{language:'zh-CN',mode:'verbatim',blocks:[{blockId:'text1',sourceText:'通常可以，但对子多时例外。',text:'通常可以，但对子多时例外。'}]},figures:[{figureId:'figure1',bbox:[0,0,10,10],pageImageSha256:'render-hash',sourceImageBlockIds:['image1'],transcription:'手牌1122334455667m；未提供宝牌及局况。',unknowns:['局况未提供']}],coverage:{pageImageSha256:'render-hash'} };
  const review = {bodyChecks:[{id:'text1',verdict:'faithful',explanation:'中文逐字一致'}],figureChecks:[{id:'figure1',verdict:'faithful',explanation:'可见牌面完整，局况本未提供'}],imageChecks:[{id:'image1',disposition:'represented',figureIds:['figure1'],explanation:'完整牌例'}],issues:[],flowCheck:{verdict:'faithful',explanation:'正文和牌图对应'},completePageCompared:true,summary:'自动校对'};
  return {source,page,candidate,review};
}
test('Chinese source wording cannot be silently strengthened or its exception removed',()=>{
  const {source,page,candidate}=fixture(); candidate.body.blocks[0].text='必须这样打。';
  assert.ok(deterministicChecks(candidate,source,page,'page-hash','render-hash').errors.includes('chinese_rewritten:text1'));
});
test('an image coverage count cannot hide an omitted or illegible teaching example',()=>{
  const {page,candidate,review}=fixture();
  review.imageChecks[0]={id:'image1',disposition:'uncertain',figureIds:['figure1'],explanation:'可见牌面未识别'};
  assert.equal(validateReview(review,page,candidate).passed,false);
  review.imageChecks=[]; assert.equal(validateReview(review,page,candidate).passed,false);
});
test('source-hidden information is allowed, while uncertain visible content prevents passing',()=>{
  const {page,candidate,review}=fixture(); assert.equal(validateReview(review,page,candidate).passed,true);
  review.figureChecks[0].verdict='uncertain'; assert.equal(validateReview(review,page,candidate).passed,false);
});
test('source notes preserve author wording without authorizing a candidate error',()=>{
  const {page,candidate,review}=fixture(); review.issues.push({severity:'source-note',targetId:'text1',sourceEvidence:'原不等号',description:'疑似源笔误',suggestedRepair:'保留原文，另加校注'});
  assert.equal(validateReview(review,page,candidate).passed,true);
  review.issues[0].severity='error'; assert.equal(validateReview(review,page,candidate).passed,false);
});
test('paragraph grouping must preserve every source block once and reject translation placeholders',()=>{
  const {source,page,candidate}=fixture(); source.language='ja';
  page.blocks.splice(1,0,{id:'text2',type:'text',lines:[{text:'但し例外もある。'}]});
  page.blocks[2].imageSha256='asset-hash';
  candidate.schema='coach-textbook-page-draft/2'; candidate.body.mode='translated';
  candidate.body.blocks=[{type:'text',sourceBlockIds:['text1','text2'],sourceText:'通常可以，但对子多时例外。但し例外もある。',text:'通常可以，但对子多时例外。不过也有例外。'},{type:'figure',figureId:'figure1'}];
  candidate.figures[0].sourceImageSha256s=['asset-hash'];
  const seal=()=>{delete candidate.candidateSha256;candidate.candidateSha256=sha(JSON.stringify(candidate));}; seal();
  assert.equal(deterministicChecks(candidate,source,page,'page-hash','render-hash').passed,true);
  candidate.body.blocks[0].text='（接上段）'; seal();
  assert.ok(deterministicChecks(candidate,source,page,'page-hash','render-hash').errors.some(x=>x.startsWith('translation_placeholder:')));
  candidate.body.blocks[0].sourceBlockIds=['text1','text1']; seal();
  assert.ok(deterministicChecks(candidate,source,page,'page-hash','render-hash').errors.includes('text_block_coverage'));
});
test('visual header order may differ from PDF object order, but incorrect semantic flow is rejected',()=>{
  const {source,page,candidate,review}=fixture();
  page.blocks.push({id:'header',type:'text',bbox:[0,0,10,1],lines:[{text:'页眉'}]});
  candidate.body.blocks.unshift({blockId:'header',sourceText:'页眉',text:'页眉'});
  assert.equal(deterministicChecks(candidate,source,page,'page-hash','render-hash').passed,true);
  review.bodyChecks.push({id:'header',verdict:'faithful',explanation:'页眉完整'});
  assert.equal(validateReview(review,page,candidate).passed,true);
  review.flowCheck={verdict:'needs-repair',explanation:'两栏图注发生逐行交织'};
  assert.equal(validateReview(review,page,candidate).passed,false);
});
test('usage deduplicates call IDs and keeps unreported failed-call usage unknown',async()=>{
  const root=await mkdtemp(join(tmpdir(),'textbook-audit-usage-'));
  try {
    const known={callId:'known',success:true,usage:{inputTokens:10,cachedInputTokens:2,outputTokens:3}},unknown={callId:'unknown',success:false,usage:null};
    await writeFile(join(root,'calls.jsonl'),[known,known,unknown].map(x=>JSON.stringify(x)).join('\n')+'\n');
    assert.deepEqual(await summarizeAuditUsage(root),{totalCalls:2,successfulCalls:1,failedCalls:1,reportedUsage:{inputTokens:10,cachedInputTokens:2,outputTokens:3},unknownUsageCalls:1,unknownUsageByField:{inputTokens:1,cachedInputTokens:1,outputTokens:1}});
  } finally {await rm(root,{recursive:true,force:true});}
});
test('partially reported usage never turns missing cached or output tokens into zero',()=>{
  assert.deepEqual(auditUsageFromEvents([{type:'turn.completed',usage:{input_tokens:7}}]),{inputTokens:7,cachedInputTokens:null,outputTokens:null});
  assert.equal(auditUsageFromEvents([{type:'turn.failed'}]),null);
});
test('completed reconnects are diagnostics; the final failed turn remains a failure',()=>{
  const r={exitCode:0,timedOut:false,outputOverflow:false,output:{},events:[{type:'error',message:'Reconnecting... 2/5 (request timed out)'},{type:'turn.completed'}]};
  assert.equal(auditTransportCompleted(r),true);
  assert.equal(auditTransportCompleted({...r,events:[...r.events,{type:'turn.failed'}]}),false);
});

async function publicationFixture(root,{noImages=false,revision=false}={}) {
  const {source,page,candidate,review}=fixture();
  const put=async(path,value)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};
  source.filename='source.pdf';source.sha256=sha('pdf');page.plainText='通常可以，但对子多时例外。';
  if(noImages)page.blocks=page.blocks.filter(b=>b.type==='text');
  else{page.blocks[1].asset='assets/image.png';page.blocks[1].imageSha256=sha('image');}
  const pageBytes=Buffer.from(JSON.stringify(page)),pageHash=sha(pageBytes),renderHash=sha('render');
  source.pages=[{page:1,pageData:'79-cn/pages/001.json',pageDataSha256:pageHash}];
  const inventory={sourceDirectory:root,sources:[source]},inventoryBytes=Buffer.from(JSON.stringify(inventory));
  const map={inventorySha256:sha(inventoryBytes),chapters:[{id:'chapter',titleSource:{sourceBlockId:'text1'},units:[]}]},mapBytes=Buffer.from(JSON.stringify(map));
  const ownership={chapterMapSha256:sha(mapBytes),blocks:page.blocks.map(b=>({sourceId:source.sourceId,page:1,sourceBlockId:b.id,chapterId:'chapter',unitId:'unit'}))},ownerBytes=Buffer.from(JSON.stringify(ownership));
  const productionRoot=join(root,'production','run'),manifest={schema:'coach-textbook-production-manifest/2',inventorySha256:sha(inventoryBytes),sourceHashes:{'79-cn':source.sha256},model:'gpt-6.1-sol',reasoningEffort:'high',schemaVersion:'coach-textbook-page-draft/3',promptVersion:'fixture-prompt/4',runnerSha256:'runner',chapterMapSha256:sha(mapBytes),ownershipSha256:sha(ownerBytes)};
  if(revision){const parentBytes=Buffer.from('{"candidateSha256":"parent-internal-digest"}'),notesBytes=Buffer.from('Restore source page footer reading flow.');await put('production/parent/candidate.json',parentBytes);await put('audit/revision-notes.json',notesBytes);manifest.revision={parentPath:join(root,'production/parent/candidate.json'),parentFileSha256:sha(parentBytes),notesPath:join(root,'audit/revision-notes.json'),notesSha256:sha(notesBytes)};}
  manifest.manifestSha256=sha(JSON.stringify(manifest));
  candidate.schema=manifest.schemaVersion;candidate.source.pdfSha256=source.sha256;candidate.source.pageDataSha256=pageHash;candidate.manifestSha256=manifest.manifestSha256;candidate.runnerSha256='runner';
  candidate.body.blocks=[{type:'text',sourceBlockIds:['text1'],chapterId:'chapter',unitId:'unit',titleSource:true,sourceText:page.plainText,text:page.plainText},{type:'figure',figureId:'figure1'}];
  if(noImages){candidate.figures=[];candidate.body.blocks=candidate.body.blocks.filter(b=>b.type==='text');review.figureChecks=[];review.imageChecks=[];}
  else Object.assign(candidate.figures[0],{chapterId:'chapter',unitId:'unit',sourceImageSha256s:[sha('image')],pageImageSha256:renderHash});candidate.coverage.pageImageSha256=renderHash;
  candidate.imageCoverage=noImages?[]:[{blockId:'image1',imageSha256:sha('image'),regionId:'figure1',chapterId:'chapter',unitId:'unit'}];
  const rawText='{"pageFlow":[],"figures":[]}\n',raw={callId:'production-call',rawLastMessage:rawText,parsedOutput:JSON.parse(rawText)},rawBytes=Buffer.from(JSON.stringify(raw));
  candidate.provenance={model:manifest.model,reasoningEffort:'high',schemaVersion:manifest.schemaVersion,promptVersion:manifest.promptVersion,promptSha256:'prompt',schemaSha256:'schema',chapterMapSha256:sha(mapBytes),ownershipSha256:sha(ownerBytes),attempts:[{callId:'production-call',success:true,model:manifest.model,reasoningEffort:'high',sourceId:source.sourceId,page:1,pdfSha256:source.sha256,pageDataSha256:pageHash,rawArtifactPath:'raw-calls/production-call.json',rawArtifactSha256:sha(rawBytes),outputSha256:sha(rawText),schemaSha256:'schema'}]};
  if(revision)candidate.provenance.revision={...manifest.revision,parentCandidateSha256:'parent-internal-digest'};
  candidate.candidateSha256=sha(JSON.stringify(candidate));
  const candidatePath=join(productionRoot,'candidates/79-cn/page-0001.json');
  await put('source.pdf','pdf');await put('source-inventory.json',inventoryBytes);await put('79-cn/pages/001.json',pageBytes);await put('assets/image.png','image');await put('integration/chapter-map.json',mapBytes);await put('integration/source-block-ownership.json',ownerBytes);await put('production/run/manifest.json',manifest);await put('production/run/renders/79-cn/page-0001.png','render');await put('production/run/raw-calls/production-call.json',rawBytes);await put('production/run/calls.jsonl',JSON.stringify(candidate.provenance.attempts[0])+'\n');await put('production/run/candidates/79-cn/page-0001.json',candidate);
  const digest=sha(await readFile(candidatePath)),call={callId:'audit-call',success:true,model:'gpt-6.1-sol',reasoningEffort:'high',usage:{inputTokens:1,outputTokens:1,cachedInputTokens:0},productionSha256:digest,pageImageSha256:renderHash,outputSha256:sha(JSON.stringify(review)),promptSha256:sha(reviewPrompt(source,page,candidate))};
  const receipt={schema:'coach-textbook-page-audit/1',status:'passed',source:candidate.source,production:{path:candidatePath,sha256:digest},pageImageSha256:renderHash,deterministicChecks:deterministicChecks(candidate,source,page,pageHash,renderHash),modelReview:review,modelChecks:validateReview(review,page,candidate),calls:[call],recordedAt:'2020-01-01T00:00:00Z'};
  const auditRel=`audit/pages/79-cn/page-0001.${digest}.fixture.json`,auditPath=join(root,auditRel);
  await put(auditRel,receipt);await put('audit/calls/audit-call.json',call);
  return {source,page,candidate,review,receipt,call,candidatePath,productionRoot,auditRel,auditPath,put,rawBytes};
}

test('draft3 gate validates exact raw output bytes and frozen chapter ownership',async()=>{
  const root=await mkdtemp(join(tmpdir(),'textbook-audit-v3-'));
  try{const f=await publicationFixture(root);assert.equal((await verifyAuditForCandidate(root,f.candidatePath)).status,'passed');
    await f.put('production/run/raw-calls/production-call.json',Buffer.concat([f.rawBytes,Buffer.from(' ')]));
    await assert.rejects(verifyAuditForCandidate(root,f.candidatePath),/raw_artifact_changed/);
    await f.put('production/run/raw-calls/production-call.json',f.rawBytes);await f.put('integration/source-block-ownership.json',{});
    await assert.rejects(verifyAuditForCandidate(root,f.candidatePath),/ownership_binding/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('a Chinese image-free revision retains its model call and bound parent evidence',async()=>{
  const root=await mkdtemp(join(tmpdir(),'textbook-audit-text-revision-'));
  try{const f=await publicationFixture(root,{noImages:true,revision:true});assert.equal((await verifyAuditForCandidate(root,f.candidatePath)).status,'passed');
    await f.put('audit/revision-notes.json','changed notes');await assert.rejects(verifyAuditForCandidate(root,f.candidatePath),/revision_binding/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('explicit retry preserves a transport-failure receipt and never retries semantic rejection',async()=>{
  const root=await mkdtemp(join(tmpdir(),'textbook-audit-retry-'));
  try{const f=await publicationFixture(root);f.receipt.status='failed';f.receipt.modelReview=null;f.receipt.modelChecks=null;await f.put(f.auditRel,f.receipt);const original=await readFile(f.auditPath);let called=0;
    const reviewer=async()=>{called++;return{output:f.review,call:f.call};};
    const options={dataRoot:root,auditRoot:join(root,'audit'),source:f.source,pageMeta:f.source.pages[0],productionRoot:f.productionRoot,scriptSha256:'fixture',reviewer};
    assert.equal((await auditPage(options)).status,'failed');assert.equal(called,0);
    const retried=await auditPage({...options,retryFailed:true});assert.equal(retried.status,'passed');assert.equal(called,1);assert.notEqual(retried.auditPath,f.auditPath);assert.deepEqual(await readFile(f.auditPath),original);
    const rejected={...f.receipt,status:'needs-repair',modelReview:f.review,modelChecks:{passed:false,errors:['fixture']},recordedAt:'2099-01-01T00:00:00Z'};await f.put(f.auditRel,rejected);
    assert.equal((await auditPage({...options,retryFailed:true})).status,'needs-repair');assert.equal(called,1);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('transport recovery reuses completed structured evidence without changing original call',async()=>{
  const root=await mkdtemp(join(tmpdir(),'textbook-audit-recovery-'));
  try{const f=await publicationFixture(root);const failedCall={...f.call,success:false,exitCode:0,timedOut:false,outputOverflow:false,events:[{type:'error',message:'Reconnecting... 2/5 (request timed out)'},{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(f.review)}},{type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:1}}]};
    f.receipt.status='failed';f.receipt.modelReview=null;f.receipt.modelChecks=null;f.receipt.calls=[failedCall];await f.put(f.auditRel,f.receipt);await f.put('audit/calls/audit-call.json',failedCall);
    const original=await readFile(f.auditPath),callBytes=await readFile(join(root,'audit/calls/audit-call.json'));
    const recovered=await recoverCompletedAudit(root,f.candidatePath);assert.equal(recovered.status,'passed-after-transport-recovery');assert.deepEqual(await readFile(f.auditPath),original);assert.deepEqual(await readFile(join(root,'audit/calls/audit-call.json')),callBytes);
    await f.put('audit/calls/audit-call.json',{...failedCall,events:[...failedCall.events,{type:'turn.failed'}]});await assert.rejects(verifyAuditForCandidate(root,f.candidatePath),/recovery_evidence_changed/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('publication rejects tampered production bytes and a newer failed review',async()=>{
  const root=await mkdtemp(join(tmpdir(),'textbook-audit-test-'));
  try {
    const {source,page,candidate,review}=fixture();
    source.filename='source.pdf'; source.sha256=sha('pdf'); candidate.source.pdfSha256=source.sha256;
    const pageBytes=Buffer.from(JSON.stringify(page)),pageHash=sha(pageBytes),renderHash=sha('render');
    candidate.source.pageDataSha256=pageHash; candidate.coverage.pageImageSha256=renderHash; candidate.figures[0].pageImageSha256=renderHash;
    source.pages=[{page:1,pageData:'79-cn/pages/001.json',pageDataSha256:pageHash}];
    for(const dir of ['79-cn/pages','production/candidates/79-cn','production/renders/79-cn','audit/pages/79-cn','audit/calls']) await mkdir(join(root,dir),{recursive:true});
    await writeFile(join(root,'source.pdf'),'pdf'); await writeFile(join(root,'source-inventory.json'),JSON.stringify({sourceDirectory:root,sources:[source]}));
    await writeFile(join(root,'79-cn/pages/001.json'),pageBytes); await writeFile(join(root,'production/renders/79-cn/page-0001.png'),'render');
    const candidatePath=join(root,'production/candidates/79-cn/page-0001.json'); await writeFile(candidatePath,JSON.stringify(candidate));
    const digest=sha(await readFile(candidatePath));
    const call={callId:'call',success:true,model:'gpt-6.1-sol',reasoningEffort:'high',usage:{inputTokens:1,outputTokens:1,cachedInputTokens:0},productionSha256:digest,pageImageSha256:renderHash,outputSha256:sha(JSON.stringify(review)),promptSha256:sha(reviewPrompt(source,page,candidate))};
    await writeFile(join(root,'audit/calls/call.json'),JSON.stringify(call));
    const receipt={schema:'coach-textbook-page-audit/1',status:'passed',source:candidate.source,production:{path:candidatePath,sha256:digest},pageImageSha256:renderHash,deterministicChecks:{passed:true},modelReview:review,modelChecks:{passed:true},calls:[call],recordedAt:'2026-10-24T00:00:00Z'};
    await writeFile(join(root,`audit/pages/79-cn/page-0001.${digest}.first.json`),JSON.stringify(receipt));
    assert.equal((await verifyAuditForCandidate(root,candidatePath)).status,'passed');
    await writeFile(join(root,'source.pdf'),'changed-pdf');
    await assert.rejects(verifyAuditForCandidate(root,candidatePath),/source_pdf_changed/);
    await writeFile(join(root,'source.pdf'),'pdf');
    await writeFile(join(root,'production/renders/79-cn/page-0001.png'),'changed-render');
    await assert.rejects(verifyAuditForCandidate(root,candidatePath),/receipt_binding_changed/);
    await writeFile(join(root,'production/renders/79-cn/page-0001.png'),'render');
    await writeFile(join(root,`audit/pages/79-cn/page-0001.${digest}.newer.json`),JSON.stringify({...receipt,status:'needs-repair',recordedAt:'2026-10-24T01:00:00Z'}));
    await assert.rejects(verifyAuditForCandidate(root,candidatePath),/not_passed/);
    await writeFile(candidatePath,JSON.stringify({...candidate,status:'modified'}));
    await assert.rejects(verifyAuditForCandidate(root,candidatePath),/latest_not_passed/);
  } finally { await rm(root,{recursive:true,force:true}); }
});


test('the exact p167 source legend correction cannot change axes, values, another legend or author prose',()=>{
 const from='蓝线方形标记＝流局率；深绿线方形标记＝被自摸率；末巡约30%',to=from.replace('深绿线方形标记＝被自摸率','深绿线圆形标记＝被自摸率'),parent={source:{sourceId:'nemata-jp',page:167},body:{blocks:[{text:'完整条件与原文'}]},figures:[{figureId:'nemata-jp-p167-r1',transcription:from}],provenance:{model:'gpt-6.1-sol',modelCalls:1},candidateSha256:'parent'},child=structuredClone(parent),changes=[{figureId:'nemata-jp-p167-r1',field:'transcription',fromValue:from,toValue:to,replaceFrom:'深绿线方形标记＝被自摸率',replaceTo:'深绿线圆形标记＝被自摸率',occurrences:1}];child.provenance.sourceFieldCorrection={changes,newProductionModelCalls:0};child.figures[0].transcription=to;child.candidateSha256='child';assert.equal(verifySpecificPdfLegendChange(child,parent,changes),true);
 for(const mutate of [c=>c.body.blocks[0].text='改了条件',c=>c.figures[0].transcription=c.figures[0].transcription.replace('30%','40%'),c=>c.figures[0].transcription=c.figures[0].transcription.replace('蓝线方形','蓝线圆形'),c=>c.source.page=168,c=>c.provenance.model='gpt-6-luna']){const bad=structuredClone(child);mutate(bad);assert.throws(()=>verifySpecificPdfLegendChange(bad,parent,changes));}
});

test('explicit source-pixel exclusions block the exact old candidate and permit a corrected hash',async()=>{const root=await mkdtemp(join(tmpdir(),'textbook-pdf-exclusion-'));try{await mkdir(join(root,'integration'));const candidatePath=join(root,'production/candidate.json');await writeFile(join(root,'integration/candidate-exclusions.json'),JSON.stringify({schema:'coach-textbook-candidate-exclusions/1',entries:[{candidatePath:'production/candidate.json',candidateSha256:'old-digest',status:'source-pixel-conflict-hold'}]}));await assert.rejects(assertPdfCandidateNotExcluded(root,candidatePath,'old-digest'),/explicitly_excluded/);await assertPdfCandidateNotExcluded(root,candidatePath,'corrected-digest');}finally{await rm(root,{recursive:true,force:true});}});
