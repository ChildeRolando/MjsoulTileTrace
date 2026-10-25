import {afterEach,describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateWebBatches,readWebBatchCheckpoint} from './textbook-production-web-batches.mjs';
import {textbookClosedPrompt,hasTextbookUsageLimit,assertTextbookModelAdmission} from './textbook-production-cli.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex'),temporary=[];
async function fixtureRoot(){const root=await mkdtemp(join(tmpdir(),'textbook-batches-test-'));temporary.push(root);return root;}
afterEach(async()=>{for(const root of temporary.splice(0)){assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('textbook-batches-test-'));await rm(root,{recursive:true,force:true});}});
function planFixture(){
  const source={articleId:'lesson',blocks:['intro','question','answer'].map(id=>({id})),tables:[]};
  const map={schema:'coach-textbook-web-unit-source-map/1',articles:[{articleId:'lesson',sourceFileSha256:'source',units:[{unitId:'i',sourceBlockIds:['intro'],requiredIntroUnitIds:[]},{unitId:'q',sourceBlockIds:['question','answer'],requiredIntroUnitIds:['i']}]}]};
  const plan={schema:'coach-textbook-complete-unit-production-batches/1',sourceSha256:'source',groups:[{batchId:'first',unitIds:['i'],sourceBlockIds:['intro'],contextSourceBlockIds:[]},{batchId:'second',unitIds:['q'],sourceBlockIds:['question','answer'],contextSourceBlockIds:['intro']}]};
  return {source,map,plan};
}
async function checkpointFixture(root,{success=true}={}){
  const binding={sourceSha256:'source',batchId:'first'},prompt='Complete fixture premise.',schema={type:'object'},targets={textIds:['intro'],figureIds:[]};
  const output={translations:[{sourceBlockId:'intro',text:'前提'}],figures:[]},events=success?[{type:'turn.completed',usage:{input_tokens:10,cached_input_tokens:0,output_tokens:2}}]:[{type:'turn.failed',error:{message:'connection closed'}}];
  const raw={callId:'fixture-call',rawLastMessage:JSON.stringify(output),parsedOutput:output,semanticPrompt:prompt,requestPrompt:textbookClosedPrompt(prompt),schema,cliSha256:'fixture-cli',batchBinding:binding,rawStdout:events.map(e=>JSON.stringify(e)).join('\n'),usage:success?{inputTokens:10,cachedInputTokens:0,outputTokens:2}:null,exitCode:success?0:1,timedOut:false,outputOverflow:false,stderr:''};
  const rawBytes=JSON.stringify(raw),rawPath=join(root,'web-production/v1/raw-calls/fixture-call.json');await mkdir(dirname(rawPath),{recursive:true});await writeFile(rawPath,rawBytes);
  const call={callId:raw.callId,sourceSha256:'source',batchId:'first',batchBinding:binding,targets,rawArtifactPath:'raw-calls/fixture-call.json',rawArtifactSha256:sha(rawBytes),promptSha256:sha(raw.requestPrompt),semanticPromptSha256:sha(prompt),schemaSha256:sha(JSON.stringify(schema)),outputSha256:sha(raw.rawLastMessage),usage:raw.usage,success};
  const ledgerPath=join(root,'web-production/v1/calls.jsonl'),checkpointPath=join(root,'checkpoint.json');await writeFile(ledgerPath,JSON.stringify(call)+'\n');await writeFile(checkpointPath,JSON.stringify({binding,call}));
  return {rawPath,ledgerPath,checkpointPath,call,expected:{binding,prompt,schema,targets,cliSha256:'fixture-cli'}};
}

describe('complete textbook batch evidence',()=>{
  it('requires exact coverage, complete questions, shared premises and intact tables',()=>{
    const {source,map,plan}=planFixture();validateWebBatches(plan,source,'source',map);
    const duplicate=structuredClone(plan);duplicate.groups[1].sourceBlockIds.push('intro');assert.throws(()=>validateWebBatches(duplicate,source,'source',map));
    const split=structuredClone(plan);split.groups[0].sourceBlockIds.push('question');split.groups[1].sourceBlockIds.shift();assert.throws(()=>validateWebBatches(split,source,'source',map));
    const noPremise=structuredClone(plan);noPremise.groups[1].contextSourceBlockIds=[];assert.throws(()=>validateWebBatches(noPremise,source,'source',map));
    assert.throws(()=>validateWebBatches(plan,{...source,tables:[{sourceBlockIds:['intro','question']}]},'source',map),/split_html_table/);
  });
  it('rejects raw-byte and ledger tampering on resume',async()=>{
    const root=await fixtureRoot(),f=await checkpointFixture(root);assert.equal((await readWebBatchCheckpoint(root,f.checkpointPath,f.expected)).call.callId,'fixture-call');
    await writeFile(f.rawPath,(await readFile(f.rawPath,'utf8'))+' ');await assert.rejects(()=>readWebBatchCheckpoint(root,f.checkpointPath,f.expected),/raw_or_ledger_changed/);
    const fresh=await checkpointFixture(root);await writeFile(fresh.ledgerPath,JSON.stringify({...fresh.call,usage:null})+'\n');await assert.rejects(()=>readWebBatchCheckpoint(root,fresh.checkpointPath,fresh.expected),/raw_or_ledger_changed/);
  });
  it('never automatically retries a recorded failure and recovers a completed ledger orphan',async()=>{
    const root=await fixtureRoot(),failed=await checkpointFixture(root,{success:false});await assert.rejects(()=>readWebBatchCheckpoint(root,failed.checkpointPath,failed.expected),/prior_failure_preserved_no_automatic_retry/);
    const good=await checkpointFixture(root),orphanPath=join(root,'recovered.json');assert.equal((await readWebBatchCheckpoint(root,orphanPath,good.expected)).call.callId,'fixture-call');assert.ok((await readFile(orphanPath)).length);
  });
  it('runs the actual producer through stop, partial resume and final zero-call resume without a model',async()=>{
    const root=await fixtureRoot(),scripts=join(root,'scripts'),sourceScripts=fileURLToPath(new URL('.',import.meta.url));await mkdir(scripts);
    const producer=(await readFile(join(sourceScripts,'textbook-production-web.mjs'),'utf8')).replace("const processing='E:/AgentData/Coach/knowledge/processing'",'const processing='+JSON.stringify(root));await writeFile(join(scripts,'textbook-production-web.mjs'),producer);
    await writeFile(join(scripts,'textbook-production-web-visual.py'),"import json\nprint(json.dumps({'visualInputs': []}))\n");
    for(const name of ['textbook-production-web-batches.mjs','textbook-audit.mjs'])await writeFile(join(scripts,name),await readFile(join(sourceScripts,name)));
    const cliUrl=pathToFileURL(join(sourceScripts,'textbook-production-cli.mjs')).href;
    await writeFile(join(scripts,'textbook-production-cli.mjs'),`export * from ${JSON.stringify(cliUrl)};import{textbookClosedPrompt}from ${JSON.stringify(cliUrl)};import{writeFile,appendFile}from'node:fs/promises';import{createHash}from'node:crypto';const root=${JSON.stringify(root)};export async function invokeTextbookCodex({prompt,schema,timeoutMs}){if(timeoutMs!==900000)throw Error('fixture-wrong-timeout');const ids=schema.properties.translations.items.properties.sourceBlockId.enum;await appendFile(root+'/invocations.jsonl',JSON.stringify(ids)+'\\n');if(ids.includes('intro'))await writeFile(root+'/localSTOP','completed first output');const output={translations:ids.map(sourceBlockId=>({sourceBlockId,text:'译文：'+sourceBlockId})),figures:(schema.properties.figures.items.properties.sourceBlockId.enum??[]).map(sourceBlockId=>({sourceBlockId,kind:'mahjong-example',transcription:'1m 2m 3m',unknowns:[],caption:'合成测试图',sourceNotes:[]}))},events=[{type:'turn.completed',usage:{input_tokens:10,cached_input_tokens:0,output_tokens:2}}],requestPrompt=textbookClosedPrompt(prompt);return{output,usage:{inputTokens:10,cachedInputTokens:0,outputTokens:2},events,rawLastMessage:JSON.stringify(output),rawStdout:events.map(e=>JSON.stringify(e)).join('\\n'),terminalEvents:[],stderr:'',exitCode:0,timedOut:false,outputOverflow:false,success:true,requestPrompt,requestPromptSha256:createHash('sha256').update(requestPrompt).digest('hex'),startedAt:'fixture',durationMs:0};}`);
    const web=join(root,'web-sources/v1');await mkdir(web,{recursive:true});const html='<main>前提と完全な問題回答。</main>';await writeFile(join(web,'source.html'),html);await writeFile(join(web,'main.html'),html);
    const {source,map,plan}=planFixture();Object.assign(source,{schema:'coach-textbook-web-article-source/1',status:'captured-not-translated-or-audited',sourceId:'free-fixture',language:'ja',url:'https://fixture.invalid',title:'fixture',fetchedAt:'fixture',html:{path:'source.html',sha256:sha(html)},main:{path:'main.html',sha256:sha(html)},assets:[],extractorSha256:'fixture'});
    source.blocks=source.blocks.map((b,i)=>({...b,type:'text',text:'原文'+i,paragraphId:'p'+i,tag:'p',segments:[],tableContext:null}));
    const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZQAAAAASUVORK5CYII=','base64');await writeFile(join(web,'example.png'),image);source.assets=[{assetId:'synthetic-image',path:'example.png',sha256:sha(image),url:'https://fixture.invalid/example.png',status:'downloaded'}];source.blocks.splice(1,0,{id:'example',type:'image-run',paragraphId:'p0',tableContext:null,images:[{assetId:'synthetic-image',occurrenceId:'occ1',sourceUrls:['https://fixture.invalid/example.png']}]});map.articles[0].units[0].sourceBlockIds.push('example');plan.groups[0].sourceBlockIds.push('example');plan.groups[1].contextSourceBlockIds.push('example');
    const sourceBytes=JSON.stringify(source),sourceSha=sha(sourceBytes);map.articles[0].sourceFileSha256=sourceSha;plan.sourceSha256=sourceSha;const mapBytes=JSON.stringify(map);plan.unitMap={path:join(root,'units.json'),sha256:sha(mapBytes)};
    await Promise.all([writeFile(join(root,'source.json'),sourceBytes),writeFile(join(root,'units.json'),mapBytes),writeFile(join(root,'plan.json'),JSON.stringify(plan)),writeFile(join(root,'dictionary.json'),JSON.stringify({schema:'coach-textbook-verified-tile-dictionary/1',acceptedAssets:[]}))]);
    const args=[join(scripts,'textbook-production-web.mjs'),'--source',join(root,'source.json'),'--dictionary',join(root,'dictionary.json'),'--batch-plan',join(root,'plan.json'),'--stop-file',join(root,'localSTOP'),'--timeout-ms','900000'],run=()=>spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true});
    let result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/web_dispatch_stopped/);const ledger=join(root,'web-production/v1/calls.jsonl'),first=JSON.parse((await readFile(ledger,'utf8')).trim());await rename(join(root,'localSTOP'),join(root,'handled-stop'));result=run();assert.equal(result.status,0,result.stderr);
    const calls=(await readFile(ledger,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(calls.length,2);assert.equal(calls[0].callId,first.callId);assert.deepEqual(calls[1].targets.textIds,['question','answer']);const candidate=JSON.parse(await readFile(join(root,'web-production/v1/candidates/free-fixture/lesson.json')));assert.deepEqual(candidate.body.blocks.filter(b=>b.type==='text').map(b=>b.text),['译文：intro','译文：question','译文：answer']);assert.equal(candidate.provenance.usage.inputTokens,20);assert.equal(candidate.figures[0].provenance.callId,calls[0].callId);assert.equal(candidate.figures[0].transcription,'1m 2m 3m');
    result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/resumed-existing/);assert.equal((await readFile(join(root,'invocations.jsonl'),'utf8')).trim().split('\n').length,2);
  });
});

describe('provider quota admission',()=>{
  it('recognizes only explicit terminal provider quota, not model prose or network failures',()=>{
    const message='You’ve hit your usage limit. Try later.';assert.equal(hasTextbookUsageLimit([{type:'turn.failed',error:{message}}]),true);
    assert.equal(hasTextbookUsageLimit([{type:'item.completed',item:{type:'agent_message',text:message}}]),false);assert.equal(hasTextbookUsageLimit([{type:'error',message:'tls handshake eof'}]),false);assert.equal(hasTextbookUsageLimit([{type:'error',message:'教材引用：'+message}]),false);
  });
  it('treats damaged admission JSON as a dispatch stop and never bypasses a user STOP',async()=>{
    const root=await fixtureRoot(),admissionPath=join(root,'admission.json');await writeFile(admissionPath,'{partial');await assert.rejects(()=>assertTextbookModelAdmission({admissionPath}),e=>e.code==='TEXTBOOK_ADMISSION_STOP');
    await writeFile(admissionPath,JSON.stringify({schema:'coach-textbook-model-admission-stop/1',reason:'usage-limit',terminalEvents:[{type:'error',message:'You’ve hit your usage limit.'}]}));await assertTextbookModelAdmission({admissionPath,usageLimitCanary:true});const stop=join(root,'STOP');await writeFile(stop,'user');await assert.rejects(()=>assertTextbookModelAdmission({admissionPath,usageLimitCanary:true,stopFiles:[stop]}),e=>e.code==='TEXTBOOK_ADMISSION_STOP');
  });
});
