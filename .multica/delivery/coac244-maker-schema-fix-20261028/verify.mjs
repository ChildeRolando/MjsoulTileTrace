import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const here=import.meta.dirname,paths=JSON.parse(await readFile(join(here,'paths.json'),'utf8')),root=paths.root,runtime=paths.runtime;
const {webProductionSchema,validateWebProductionOutput,assertPortableProductionSchema}=await import(pathToFileURL(join(runtime,'production-schema.mjs')));
const {prepareTextbookCliRequest,parseTextbookCliResult,textbookRequestConfig}=await import(pathToFileURL(join(runtime,'textbook-production-cli.mjs')));
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const raw=await load(paths.oldRaw.path),preflight=await load(join(here,'preflight.json')),parent=await load(join(root,'web-production/v1/candidates/79-bilibili-cn/cv1775262.r1.display.json'));
const f=parent.figures.find(f=>f.figureId==='79-bilibili-cn:cv1775262:b0018:figure'),fixed={sourceBlockId:f.sourceBlockIds[0],kind:f.kind,transcription:f.transcription,unknowns:f.unknowns,caption:f.caption,sourceNotes:f.sourceNotes};
const ledger=join(root,'web-production/v1/calls.jsonl'),before=sha(await readFile(ledger));
const checks=[];const ok=(name,fn)=>{fn();checks.push({name,passed:true});};
ok('raw confirms terminal API schema rejection, not generated-schema failure',()=>{assert(raw.events.some(e=>e.type==='turn.failed'&&e.error.message.includes('invalid_json_schema')&&e.error.message.includes('text.format.schema')));assert.equal(raw.rawLastMessage,null);assert.equal(raw.parsedOutput,null);assert.equal(raw.usage,null);assert(!raw.events.some(e=>e.type==='turn.completed'));assert.equal(raw.timedOut,false);assert.equal(raw.outputOverflow,false);assert.equal(raw.exitCode,1);});
ok('old nonportable array-enum/count/length schema rejected offline',()=>assert.throws(()=>assertPortableProductionSchema(raw.schema),/nonportable/));
for(const field of ['unknowns','sourceNotes'])ok('array-valued enum at '+field+' rejected independently',()=>assert.throws(()=>assertPortableProductionSchema(raw.schema.properties.figures.items.properties[field]),/nonportable_enum/));
const desired={translations:[],figures:[{...fixed,transcription:preflight.fieldScope.to}]};
const scope={textIds:[],figureIds:[fixed.sourceBlockId],fixedFigure:fixed,expectedTranscription:preflight.fieldScope.to};
ok('valid synthetic222 exact two-reference repair accepted locally, not saved as candidate',()=>validateWebProductionOutput(desired,scope));
for(const [name,mutate]of [
 ['other tile',o=>o.figures[0].transcription+=' 9m'],['unchanged two references',o=>o.figures[0].transcription=f.transcription],['caption',o=>o.figures[0].caption+='x'],['unknowns',o=>o.figures[0].unknowns=['unknown']],['sourceNotes',o=>o.figures[0].sourceNotes=[]],['foreign figure ID',o=>o.figures[0].sourceBlockId='foreign'],['extra figure',o=>o.figures.push({...fixed})],['Chinese rewrite',o=>o.translations.push({sourceBlockId:'foreign',text:'changed'})],['extra key',o=>o.figures[0].extra=true],['missing field',o=>delete o.figures[0].sourceNotes]])ok('exact222 rejects '+name,()=>{const bad=structuredClone(desired);mutate(bad);assert.throws(()=>validateWebProductionOutput(bad,scope));});
const workBase=join(root,'integration/coac244-maker-schema-offline-20261028');await mkdir(workBase,{recursive:true});
const makerSchema=webProductionSchema({textIds:[],figureIds:scope.figureIds,fixedFigure:fixed});assert.deepEqual(makerSchema,preflight.schema);
const work=join(workBase,'fixed222-'+randomUUID());await mkdir(work);
const built=await prepareTextbookCliRequest({prompt:preflight.prompt,schema:makerSchema,model:'gpt-6.1-terra',reasoningEffort:'max',images:raw.requestExecution.images.map(i=>i.path),work});
const wireSchema=await load(built.schemaPath);
ok('exact222 actual --output-schema file is conservative schema, argv/stdin/images bound',()=>{assert.deepEqual(wireSchema,makerSchema);assertPortableProductionSchema(wireSchema);assert.equal(built.args[built.args.indexOf('--model')+1],'gpt-6.1-terra');assert(built.args.includes('model_reasoning_effort="max"'));assert.equal(built.args.filter(a=>a==='-i').length,2);assert.deepEqual(built.requestExecution.images,raw.requestExecution.images);assert(built.closedPrompt.endsWith(preflight.prompt));});
await writeFile(join(here,'222-real-request-construction.json'),JSON.stringify({...built,wireSchema,modelCalls:0,offlineOnly:true},null,2)+'\n');
const standardCases=[
 {key:'web-figure-target',source:parent.source.sourcePath,parent:'web-production/v1/candidates/79-bilibili-cn/cv1775262.r1.display.json',notes:'audit/web/articles/79-bilibili-cn/cv1775262.'+preflight.parentSha256+'.json',images:2,model:'gpt-6.1-terra',effort:'max'},
 {key:'pure-text',source:'web-sources/v1/modern-yabejp-ja/articles/chapter03-section003/source.v2.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section003.display.json',notes:'audit/web/articles/modern-yabejp-ja/chapter03-section003.889adf0d0f694bc09475a5c35d83d758493e94af90c3e389dfdebfa5bf205b02.json',images:0,model:'gpt-6.1-sol',effort:'high'}];
for(const c of standardCases){
 const args=[join(runtime,'textbook-production-web.mjs'),'--source',c.source,'--revision-from',c.parent,'--revision-notes',c.notes,'--variant','coac244schemaoffline','--request-only',join(workBase,c.key+'-'+randomUUID())];
 if(!c.images)args.push('--dictionary','web-production/v1/dictionaries/modern-accepted-tiles-c33800d79e603fff8d31dfccb7cf26b648f8f9765af7ec01e8beb0f10805ed2a.json');
 else args.push('--reuse',parent.provenance.reuseMap.path);
 const r=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr);
 const b=JSON.parse(r.stdout);b.request.wireSchema=await load(b.request.schemaPath);
 ok(c.key+' actual maker entry and schema-file binding',()=>{assertPortableProductionSchema(b.request.wireSchema);assert.equal(b.request.requestExecution.model,c.model);assert.equal(b.request.requestExecution.reasoningEffort,c.effort);assert.equal(b.request.requestExecution.images.length,c.images);assert.equal(b.request.args.filter(a=>a==='-i').length,c.images);assert.equal(b.modelCalls,0);});
 await writeFile(join(here,c.key+'-real-request-construction.json'),JSON.stringify(b,null,2)+'\n');
}
const textScope={textIds:['one'],figureIds:[]};
ok('pure text keeps coverage and nonempty binding locally',()=>validateWebProductionOutput({translations:[{sourceBlockId:'one',text:'正文'}],figures:[]},textScope));
for(const output of [{translations:[{sourceBlockId:'other',text:'正文'}],figures:[]},{translations:[{sourceBlockId:'one',text:''}],figures:[]},{translations:[],figures:[]}])ok('pure text rejects scope/empty/missing '+checks.length,()=>assert.throws(()=>validateWebProductionOutput(output,textScope)));
ok('image request still chooses terra/max, no unauthorized model or effort fallback',()=>{assert.deepEqual(textbookRequestConfig(['image'],'gpt-6.1-sol','high'),{model:'gpt-6.1-terra',reasoningEffort:'max'});assert.throws(()=>textbookRequestConfig(['image'],'gpt-6.1-terra','high'));assert.throws(()=>textbookRequestConfig([],'gpt-6.1-terra','max'));});
const parsed=parseTextbookCliResult({stdout:raw.rawStdout,code:raw.exitCode,timedOut:raw.timedOut,overflow:raw.outputOverflow,stderr:raw.stderr},raw.rawLastMessage);
ok('original CLI parser keeps API failure terminal and unrecoverable',()=>{assert.equal(parsed.success,false);assert.equal(parsed.output,null);assert(parsed.terminalEvents.some(e=>e.code==='invalid_json_schema'&&e.param==='text.format.schema'));});
const after=sha(await readFile(ledger));ok('no new attempt/ledger entry and original raw unchanged',()=>{assert.equal(before,after);});assert.equal(sha(await readFile(paths.oldRaw.path)),paths.oldRaw.sha256);
await writeFile(join(here,'verification.json'),JSON.stringify({modelCalls:0,checks,actualConstructionCases:3,exact222PreflightPassed:true,noRemoteProductionAcceptanceClaim:true,oldFailureKept:true,oldRawSha256:paths.oldRaw.sha256,failedProductionCount:1,unusedIndependentAudits:1,additionalMakerCallsRequired:1,futureMaximumLocalCalls:2,stageLifetimeMaximum:3,retry:0,serverSchemaLeafNotDisclosed:true,localConservativeSubsetIsCompatibilityFixNotProofOfRemoteAcceptance:true},null,2)+'\n');
console.log(JSON.stringify({passedChecks:checks.length,actualRequestCases:3,modelCalls:0,rawRecoverable:false,extraMakerRequired:1,remainingAudit:1}));
