import {afterEach,describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const sha=value=>createHash('sha256').update(value).digest('hex'),roots=[];
afterEach(async()=>{for(const root of roots.splice(0)){assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('textbook-scope-test-'));await rm(root,{recursive:true,force:true});}});
async function fixture({noImages=false,wholePage=false}={}){
  const root=await mkdtemp(join(tmpdir(),'textbook-scope-test-'));roots.push(root);
  const processing=join(root,'processing'),pdfs=join(root,'pdfs'),scripts=join(root,'scripts/scene-study');
  for(const path of [processing,pdfs,scripts,join(processing,'integration'),join(processing,'79-cn/pages'),join(processing,'assets')])await mkdir(path,{recursive:true});
  const original=fileURLToPath(new URL('.',import.meta.url));
  let producer=await readFile(join(original,'textbook-production.mjs'),'utf8');
  producer=producer.replace(/^const dataRoot = .*;$/m,`const dataRoot = ${JSON.stringify(processing)};`).replace(/^const sourceRoot = .*;$/m,`const sourceRoot = ${JSON.stringify(pdfs)};`);
  await writeFile(join(scripts,'textbook-production.mjs'),producer);
  // A preflight must finish without starting either renderer or model.
  await writeFile(join(scripts,'textbook-production-cli.mjs'),"export function invokeTextbookCodex(){throw Error('unexpected_model_call')} export function parseTextbookCliResult(){} export function textbookClosedPrompt(){} export function assertTextbookModelAdmission(){throw Error('unexpected_dispatch')}\n");
  for(const name of ['render-textbook-page.py','render-textbook-region.py'])await writeFile(join(scripts,name),"raise Exception('unexpected_render')\n");
  const pdf=Buffer.from('synthetic PDF bytes, never rendered'),asset=Buffer.from('synthetic image bytes, never decoded');await writeFile(join(pdfs,'fixture.pdf'),pdf);await writeFile(join(processing,'assets/example.png'),asset);
  const selected=['b1','b3','b8'],blocks=Array.from({length:9},(_,i)=>({id:'b'+(i+1),type:i>=7&&!noImages?'image':'text',bbox:[10+i*5,10,14+i*5,20],...(i>=7&&!noImages?{asset:'assets/example.png',imageSha256:sha(asset)}:{lines:[{text:i===0?' ':'source '+(i+1),bbox:[10,10,20,20]}]})}));
  const page={sourceId:'79-cn',page:114,size:[0,0,100,100],plainText:'full inventory is unchanged',blocks},pageBytes=JSON.stringify(page),pageData='79-cn/pages/114.json';await writeFile(join(processing,pageData),pageBytes);
  const inventory={sourceDirectory:pdfs,sources:[{sourceId:'79-cn',language:'zh-CN',filename:'fixture.pdf',sha256:sha(pdf),pages:[{page:114,pageData,pageDataSha256:sha(pageBytes)}]}]},inventoryBytes=JSON.stringify(inventory);await writeFile(join(processing,'source-inventory.json'),inventoryBytes);
  const map={inventorySha256:sha(inventoryBytes),chapters:[{chapterId:'new',units:[]}]},mapBytes=JSON.stringify(map);await writeFile(join(processing,'integration/chapter-map.json'),mapBytes);
  const owners=blocks.map(b=>({sourceId:'79-cn',page:114,sourceBlockId:b.id,chapterId:wholePage||selected.includes(b.id)?'new':'old',unitId:wholePage||selected.includes(b.id)?'new-1':'old-1'})),ownership={chapterMapSha256:sha(mapBytes),blocks:owners},ownershipBytes=JSON.stringify(ownership);await writeFile(join(processing,'integration/source-block-ownership.json'),ownershipBytes);
  const scope={schema:'coach-textbook-pdf-source-block-scope/1',sourceId:'79-cn',page:114,chapterId:'new',pdfSha256:sha(pdf),pageDataPath:pageData,pageDataSha256:sha(pageBytes),sourceInventorySha256:sha(inventoryBytes),ownership:{path:'integration/source-block-ownership.json',sha256:sha(ownershipBytes)},sourceBlockIds:['b1','b8','b3'],protectedSourceBlockIds:blocks.filter(b=>!selected.includes(b.id)).map(b=>b.id),selectedBlocks:blocks.filter(b=>selected.includes(b.id)),selectedOwners:owners.filter(o=>selected.includes(o.sourceBlockId))};
  const scopePath=join(processing,'scope.json');
  async function run(value=scope,runId='fixture'){await writeFile(scopePath,JSON.stringify(value));return spawnSync(process.execPath,[join(scripts,'textbook-production.mjs'),'--source','79-cn','--page','79-cn:114','--attempts','1','--run-id',runId,'--source-block-scope',scopePath,'--preflight-only'],{encoding:'utf8',windowsHide:true});}
  return{root,processing,scope,run,pageBytes,inventoryBytes,page};
}

describe('PDF explicit source-block production scope',()=>{
  it('uses two source texts and one new image without changing the nine-block inventory',async()=>{
    const f=await fixture(),result=await f.run();assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);
    assert.equal(output.fullSourceBlockCount,9);assert.deepEqual(output.textTargetIds,['b1','b3']);assert.deepEqual(output.imageTargetIds,['b8']);assert.deepEqual(output.regionSourceBlockIds,[['b8']]);assert.equal(output.modelCalls,0);
    assert.deepEqual(output.sourceBlockScope.sourceBlockIds,['b1','b3','b8']);assert.equal(output.pageDataSha256,sha(f.pageBytes));assert.equal(await readFile(join(f.processing,'79-cn/pages/114.json'),'utf8'),f.pageBytes);assert.equal(await readFile(join(f.processing,'source-inventory.json'),'utf8'),f.inventoryBytes);
    const manifest=JSON.parse(await readFile(join(f.processing,'production/fixture/manifest.json'),'utf8'));assert.deepEqual(manifest.sourceBlockScope,output.sourceBlockScope);
    assert.deepEqual(output.schema.properties.pageFlow.items.anyOf[0].properties.sourceBlockIds.items.enum,['b1','b3']);
  });
  it('rejects overlap with protected content and any changed selected source text',async()=>{
    const f=await fixture(),overlap=structuredClone(f.scope);overlap.protectedSourceBlockIds.push('b3');let result=await f.run(overlap,'overlap');assert.notEqual(result.status,0);assert.match(result.stderr,/source_scope_not_exact_partition/);
    const changed=structuredClone(f.scope);changed.selectedBlocks[0].lines[0].text='rewritten';result=await f.run(changed,'changed');assert.notEqual(result.status,0);assert.match(result.stderr,/source_scope_selected_blocks_or_owners_changed/);
  });
  it('rejects native page tampering rather than producing a smaller replacement inventory',async()=>{
    const f=await fixture();await writeFile(join(f.processing,'79-cn/pages/114.json'),f.pageBytes+' ');const result=await f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/source_scope_page_data_changed/);
  });
  it.each([false,true])('persists real runner slots/raw and zero-call resume, noImages=%s',async(noImages)=>{
    const f=await fixture({noImages,wholePage:true}),scripts=join(f.root,'scripts/scene-study'),original=fileURLToPath(new URL('.',import.meta.url));
    await writeFile(join(scripts,'textbook-production-pdf-flow.mjs'),await readFile(join(original,'textbook-production-pdf-flow.mjs')));
    const cliUrl=pathToFileURL(join(original,'textbook-production-cli.mjs')).href,sourceIds=f.page.blocks.filter(b=>b.type==='text').map(b=>b.id),sourceText=f.page.blocks.filter(b=>b.type==='text').map(b=>b.lines.map(l=>l.text).join('')).join(''),slotText=sourceText+(noImages?'':'[[figure:79-cn-p114-r1]]'),output={pageFlow:[{kind:'text',sourceBlockIds:sourceIds,text:slotText}],figures:noImages?[]:[{regionId:'79-cn-p114-r1',kind:'other-meaningful-figure',transcription:'两个合成测试图元，非教材牌例。',unknowns:[],caption:'测试图'}]};
    await writeFile(join(scripts,'textbook-production-cli.mjs'),`export * from ${JSON.stringify(cliUrl)};import{textbookClosedPrompt}from ${JSON.stringify(cliUrl)};import{appendFile}from'node:fs/promises';import{createHash}from'node:crypto';export async function assertTextbookModelAdmission(){}export async function invokeTextbookCodex({prompt,timeoutMs}){if(timeoutMs!==900000)throw Error('fixture_timeout');await appendFile(${JSON.stringify(join(f.root,'invocations'))},'one\\n');const output=${JSON.stringify(output)},events=[{type:'turn.completed',usage:{input_tokens:11,cached_input_tokens:0,output_tokens:3}}],requestPrompt=textbookClosedPrompt(prompt);return{success:true,output,usage:{inputTokens:11,cachedInputTokens:0,outputTokens:3},events,terminalEvents:[],rawLastMessage:JSON.stringify(output),rawStdout:events.map(e=>JSON.stringify(e)).join('\\n'),stderr:'',exitCode:0,timedOut:false,outputOverflow:false,startedAt:'fixture',durationMs:0,requestPrompt,requestPromptSha256:createHash('sha256').update(requestPrompt).digest('hex')};}`);
    const renderer="import sys,json,hashlib\nfrom pathlib import Path\np=Path(sys.argv[7] if len(sys.argv)>5 else sys.argv[3]);b=b'fixture render';p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b);print(json.dumps({'path':str(p),'sha256':hashlib.sha256(b).hexdigest()}))\n";
    for(const name of ['render-textbook-page.py','render-textbook-region.py'])await writeFile(join(scripts,name),renderer);
    const scopePath=join(f.processing,'scope.json');await writeFile(scopePath,JSON.stringify(f.scope));
    const args=[join(scripts,'textbook-production.mjs'),'--source','79-cn','--page','79-cn:114','--attempts','1','--concurrency','1','--run-id','inline-fixture','--inline-source-flow','--timeout-ms','900000'],run=()=>spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true});
    let result=run();assert.equal(result.status,0,result.stderr);const candidatePath=join(f.processing,'production/inline-fixture/candidates/79-cn/page-0114.json'),candidate=JSON.parse(await readFile(candidatePath,'utf8'));
    assert.equal(candidate.provenance.flowMode,'native-source-inline-slots');assert.equal(candidate.source.blockScope,undefined);assert.equal(candidate.body.blocks[0].text,sourceText+(noImages?'':'测试图'));assert.equal(candidate.body.blocks[0].sourceText,sourceText);assert.deepEqual(candidate.body.blocks[0].inlineFigureIds,noImages?[]:['79-cn-p114-r1']);assert.equal(candidate.body.blocks[0].rawSlotText,slotText);
    const attempt=candidate.provenance.attempts[0],raw=JSON.parse(await readFile(join(f.processing,'production/inline-fixture',attempt.rawArtifactPath),'utf8'));assert.deepEqual(raw.nativeSourceFlow,candidate.provenance.nativeSourceFlow);assert.deepEqual(attempt.nativeSourceFlow,raw.nativeSourceFlow);assert.equal(sha(await readFile(join(f.processing,raw.nativeSourceFlow.path))),raw.nativeSourceFlow.sha256);
    result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/"skipped":true/);assert.equal((await readFile(join(f.root,'invocations'),'utf8')).trim().split('\n').length,1);
    const nativePath=join(f.processing,raw.nativeSourceFlow.path),nativeBytes=await readFile(nativePath);await writeFile(nativePath,'tampered');result=run();assert.notEqual(result.status,0);assert.equal((await readFile(join(f.root,'invocations'),'utf8')).trim().split('\n').length,1);await writeFile(nativePath,nativeBytes);
    if(process.env.TEXTBOOK_PDF_INLINE_FIXTURE_EXPORT){const path=resolve(process.env.TEXTBOOK_PDF_INLINE_FIXTURE_EXPORT)+(noImages?'.text-only.json':'.image.json');await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify({schema:'coach-pdf-inline-synthetic-wire-fixture/1',synthetic:true,newPaidCalls:0,fixtureRoot:f.root,processingRoot:f.processing,sourceRoot:join(f.root,'pdfs'),candidatePath,manifestPath:join(f.processing,'production/inline-fixture/manifest.json'),rawPath:join(f.processing,'production/inline-fixture',attempt.rawArtifactPath),nativePath,helperPath:join(f.processing,raw.nativeSourceFlow.helperPath),noImages},null,2)+'\n');roots.splice(roots.indexOf(f.root),1);}
  });
});
