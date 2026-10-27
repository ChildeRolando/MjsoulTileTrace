import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',here=import.meta.dirname,runtime=root+'/audit/runtimes/coac269-283-1017-v2-20261028',stage=root+'/web-production/v1/runs/coac269-283-1017-v2-20261028';
const read=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=await read(runtime+'/runtime-manifest.json');for(const f of manifest.files)assert.equal(sha(await readFile(f.path)),f.sha256);
const c=await read(runtime+'/exact-contract.json'),parent=await read(c.parent.path),notes=await read(c.notes.path),source=await read(c.source.path),targets=await read(stage+'/targets.json');
for(const f of [c.parent,c.notes,c.source,c.baseNotes])assert.equal(sha(await readFile(f.path)),f.sha256);
const mod=await import(pathToFileURL(runtime+'/textbook-audit-web.mjs')),old=await import(pathToFileURL(root+'/audit/runtimes/coac269-283-10171181-v1-20261028/textbook-audit-web.mjs'));
const exact=await import(pathToFileURL(runtime+'/exact-request.mjs'));
const revision={parentPath:c.parent.path,parentSha256:c.parent.sha256,notesPath:c.notes.path,notesSha256:c.notes.sha256,textBlockIds:targets.textBlockIds,figureIds:[],groupRevision:{groups:targets.groups,deferred:targets.deferred},targets:{path:stage+'/targets.json',sha256:sha(await readFile(stage+'/targets.json'))}};
const child=structuredClone(parent);child.provenance.revision=revision;let tests=0;
await assert.rejects(()=>old.verifyWebRevisionInheritance(root,child),/parent_receipt_method/);tests++;
const inheritance=await mod.verifyWebRevisionInheritance(root,child);tests++;
for(const mutate of [r=>r.groupRevision.deferred.pop(),r=>r.groupRevision.deferred[0].issueSha256='0'.repeat(64),r=>r.groupRevision.deferred.push(r.groupRevision.deferred[0]),r=>r.textBlockIds.push('modern-yabejp-ja:chapter06-exercise003:b0168'),r=>r.parentSha256='0'.repeat(64),r=>r.figureIds.push('foreign')]){
 const x=structuredClone(child);mutate(x.provenance.revision);await assert.rejects(()=>mod.verifyWebRevisionInheritance(root,x));tests++;
}
for(const target of c.targets){
 const good={translations:[{sourceBlockId:target.id,text:target.expected}],figures:[]};assert(exact.validateExact(good,[target.id]));tests++;
 for(const mutate of [x=>x.translations[0].text=target.before,x=>x.translations[0].text+='。',x=>x.translations[0].text='**'+target.expected+'**',x=>x.translations.push(x.translations[0]),x=>x.figures.push({sourceBlockId:'foreign'}),x=>x.translations[0].sourceBlockId='modern-yabejp-ja:chapter06-exercise003:b1181']){const x=structuredClone(good);mutate(x);assert.throws(()=>exact.validateExact(x,[target.id]));tests++;}
 const scope=mod.webGroupRevisionScope(source,child,target.group,revision,inheritance.inheritedAssetIds);assert.deepEqual(scope.textIds,[target.id]);assert.deepEqual(scope.figureIds,[]);assert.equal(scope.originals.length,target.images.length);assert.deepEqual(scope.originals.map(i=>i.assetId),target.images.map(i=>i.assetId));tests++;
}
const good=structuredClone(child);for(const t of c.targets)good.body.blocks.find(b=>b.sourceBlockIds[0]===t.id).text=t.expected;assert(exact.validateCandidate(good,parent));tests++;
for(const mutate of [x=>x.body.blocks[167].text+='。',x=>x.body.blocks[395].text+='。',x=>x.body.blocks[961].text+='。',x=>x.figures[0].caption+='。',x=>x.body.blocks.reverse(),x=>x.body.blocks.find(b=>b.tableContext).tableContext.column=999]){const x=structuredClone(good);mutate(x);assert.throws(()=>exact.validateCandidate(x,parent));tests++;}
const args=[runtime+'/textbook-production-web.mjs','--runtime-sha',sha(await readFile(runtime+'/runtime-manifest.json')),'--source',c.source.path,'--revision-from',c.parent.path,'--revision-notes',c.notes.path,'--revision-targets',stage+'/targets.json','--dictionary',root+'/'+parent.provenance.dictionary.path,'--batch-plan',root+'/'+parent.provenance.batches.planPath,'--variant','coac269t1017r2'];
const cp=spawnSync(process.execPath,[...args,'--request-only',stage+'/request-only-'+Date.now()],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(cp.status,0,cp.stderr);tests++;
const built=JSON.parse(cp.stdout);assert.equal(built.requests.length,1);
for(const [n,r] of built.requests.entries()){
 const target=c.targets[n],execution=r.request.requestExecution;assert.equal(r.prompt,target.prompt);assert.equal(execution.model,'gpt-6.1-terra');assert.equal(execution.reasoningEffort,'max');assert.equal(execution.images.length,target.images.length);assert.deepEqual(r.schema.properties.translations.items.properties.text.enum,[target.expected]);assert.equal(r.schema.properties.figures.maxItems,0);
 for(const image of execution.images){assert.equal(sha(await readFile(image.path)),image.sha256);}tests++;
}
await writeFile(here+'/actual-requests.json',JSON.stringify(built,null,2)+'\n');
const result={passed:true,tests,modelCalls:0,manifestSha256:sha(await readFile(runtime+'/runtime-manifest.json')),args:[process.execPath,...args],inheritance,productionCallsMaximum:1,auditCallsMaximum:1,totalMaximum:2,retry:0,groupRequestImages:built.requests.map(r=>r.request.requestExecution.images.length)};
await writeFile(here+'/preflight.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,tests,modelCalls:0,images:result.groupRequestImages}));
