// Existing frozen read-only verification only: never call produce/invoke/audit.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root='E:/AgentData/Coach/knowledge/processing',base=join(root,'integration'),dir=resolve('_analysis/r785');
const sha=x=>createHash('sha256').update(x).digest('hex'),hash=x=>sha(JSON.stringify(x));
const load=async p=>JSON.parse(await readFile(p)),save=(n,x)=>writeFile(join(dir,n),JSON.stringify(x,null,2)+'\n');
await mkdir(dir,{recursive:true});
try{await access(join(dir,'checked.json'));throw Error('Existing evidence snapshot: inspect/deduplicate instead of overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
const archive=[];
async function bound(f){
 const b=await readFile(f.path);assert.equal(sha(b),f.sha256,f.path);if(f.bytes!==undefined)assert.equal(b.length,f.bytes);
 if(!archive.some(x=>x.path.replaceAll('\\','/')===f.path.replaceAll('\\','/'))){const local='e'+String(archive.length).padStart(3,'0');await writeFile(join(dir,local),b);archive.push({...f,bytes:b.length,local});}
 return f.path.endsWith('.json')?JSON.parse(b):b;
}
const receiptRef={path:join(base,'coac249-283-0785-reviewed-20261028.json'),sha256:'49dc8c91614a3a4b726b41e69f3c2ddcdbd581c31973763930b222c11bd88b36'};
const scopeRef={path:join(base,'coac249-283-0785-scope-inheritance-20261028.json'),sha256:'bd8e040789cef358c4b615a3a97a2e6ee4edf896a8b7353ab418a4a56b4191a7'};
const r=await bound(receiptRef),scope=await bound(scopeRef);
await bound({path:join(base,'coac269-283-0785-handoff-249-20261028.json'),sha256:'d9fb437f24d6c446c969be4abb7b519b50be7b7e5ad5c703488571a11a95646c'});
assert.equal(r.canonical,'nemata-jp-chapter-283-1');assert.equal(r.targetPassed,false);assert.equal(r.limitedUnknownOkay,true);
assert.equal(r.status,'needs-repair-or-uncertain');assert.equal(r.admissionGranted,false);assert.equal(r.wholeChapterAccepted,false);
const protectNames=['accepted-preview-current.json','specific-web-variant-selection.v33.json','current-web-candidate-selection.json','current-candidate-selection.json','build-accepted-preview.mjs','source-structure-holds.json','candidate-exclusions.json','coac250-b0947-composition-intake-20261028.json'];
const protectedFiles=[];
for(const name of protectNames){const path=join(base,name);protectedFiles.push({path,sha256:sha(await readFile(path))});}
const formalPath='E:/AgentData/Coach/knowledge/review/textbook-corpus.json';protectedFiles.push({path:formalPath,sha256:sha(await readFile(formalPath))});
const preview=await load(protectedFiles[0].path);assert.equal(preview.corpusId,'d05520874d6d617f7fcd20f3686d39f0799da8f8067d4bf16cb2182575ab11a5');
assert.equal(r.candidate.sha256,'434120af284195ddf27b491a1c2c4cd9ea25072d40e9c6a366bcd8ac3cb03b9b');
const candidate=await bound(r.candidate),parent=await bound(r.parent),donor=await bound(r.reviewedDonor);
for(const key of ['source','parentAudit','donorAudit','makerRaw'])await bound(r[key]);
const raw=await bound(r.raw);assert.equal(r.raw.sha256,'15d6f153d54e1beb35b2405caa8943d6cf79ccb180a8badfd58917a676b1b9c5');
const plan=await bound(r.plan),manifest=await bound(r.runtime);
assert.equal(r.runtime.sha256,'d167ab2e2beab21dda23336b40e341e1972ffbd894b2413702f04f8d08b3a4bb');
assert.equal(manifest.files.length,34);for(const f of manifest.files)await bound(f);
// The manifest-pinned module has no top-level model invocation. Only named read-only exports are used.
const modulePath=join(r.runtime.path,'..','b0785.mjs');
const mod=await import(pathToFileURL(modulePath));
const recomputedPlan=await mod.prepare0785Review(root,r.candidate.path,r.runtime.sha256);
assert.deepEqual(recomputedPlan,plan);
assert.equal(raw.prompt,plan.prompt);assert.deepEqual(raw.schema,plan.schema);
assert.deepEqual(JSON.parse(raw.rawLastMessage),raw.output);assert.deepEqual(raw.output,r.modelReview);
const verified=await mod.verify0785ReviewExecution(raw,plan,r.runtime.sha256);
assert.deepEqual(verified,r.verification);assert.equal(verified.targetPassed,false);assert.equal(verified.limitedUnknownOkay,true);
assert.equal(verified.modelReview.seatVerdict,'faithful');assert.equal(verified.modelReview.contextFaithful,true);
assert.equal(verified.modelReview.issues.length,1);assert.equal(verified.modelReview.issues[0].severity,'uncertain');
const ledger=(await readFile(join(root,'audit/calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(x=>x.callId===raw.callId);
assert.equal(ledger.length,1);assert.deepEqual(ledger[0],r.call);await save('ledger-entry.json',ledger[0]);
assert.deepEqual(candidate.body,parent.body);assert.equal(candidate.body.blocks.length,1195);
const targetId=r.targetId,fig=c=>c.figures.find(f=>f.figureId===targetId),target=fig(candidate);
assert.equal(candidate.figures.length,524);let nonTarget=0;
for(let i=0;i<524;i++)if(candidate.figures[i].figureId!==targetId){assert.deepEqual(candidate.figures[i],parent.figures[i]);nonTarget++;}
assert.equal(nonTarget,523);
for(const key of ['unknowns','caption','sourceNotes'])assert.deepEqual(target[key],fig(donor)[key]);
assert.equal(target.unknowns.length,7);assert.equal(scope.b0947NotAssembled,true);
for(const f of scope.refs){
 const b=await readFile(f.path);assert.equal(sha(b),f.sha256,f.path);if(f.bytes!==undefined)assert.equal(b.length,f.bytes);
 // Already preserved historical refs stay bound by SHA; archive new transport inputs below.
}
for(const image of scope.actualImages){const b=await readFile(image.path);assert.equal(sha(b),image.sha256);assert.equal(b.length,image.bytes);const local='i'+archive.length;await writeFile(join(dir,local),b);archive.push({...image,local});}
for(const p of scope.passedBlocks){const b=candidate.body.blocks.find(b=>b.sourceBlockIds.includes(p.id));assert.equal(hash(b),p.sha256);}
assert(scope.Q8.unchanged&&scope.sixTables.unchanged&&scope.batch010.unchanged);
// b0947 remains a separate accepted composition, never replace it with this branch.
const prior=await load(protectedFiles.at(-2).path);
assert.equal(prior.derived.sha256,'ec43d8af0c82a3b53bf7c924804ebf00d6c65515ac3a7b21728b26f9e10ac85b');
const defaultIds=['b0003','b0004','b0005'];
const defaultBody=candidate.body.blocks.filter(b=>b.sourceBlockIds.some(id=>defaultIds.some(s=>id.endsWith(':'+s))));
const limits=raw.output.mandatoryLimits;assert.equal(limits.length,4);
const mapping=limits.map((text,i)=>({index:i+1,text,rawOutputPath:`/output/mandatoryLimits/${i}`,candidateSha256:r.candidate.sha256,targetFigureSha256:hash(target),currentObjectEvidence:i===0?{unknowns:target.unknowns,unknownsSha256:hash(target.unknowns),sourceNotes:target.sourceNotes}:i===1?{defaultBody,caption:target.caption,sourceNotes:target.sourceNotes}:{caption:target.caption,sourceNotes:target.sourceNotes},currentUnknownMarkersPreserved:true,editorialDisplaySlotInstalled:false,actualMcpArenaDisplayVerified:false,status:i===0?'unknown-fields-present-final-display-unverified':'explicit-editorial-display-limitation-pending',requiredNextAction:'Existing COAC-244 owner: bind these verbatim model limitations to this exact SHA/scope in a legal non-author display contract. Preserve body/raw/uncertain; no OCR/maker/review call.'}));
await save('mapping.json',{schema:'coac250-0785-display-limit-mapping/1',candidate:r.candidate,figureSha256:hash(target),mandatoryLimits:mapping,allFourDisplayLimitsInstalled:false,admissionGranted:false,defaultConditionVersusScreenshotGap:true,newModelCalls:0});
for(const f of [...archive,...protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
await save('archive.json',archive);
await save('checked.json',{schema:'coac250-0785-independent-evidence-check/1',recordedAt:new Date().toISOString(),receipt:receiptRef,scope:scopeRef,candidate:r.candidate,parent:r.parent,donor:r.reviewedDonor,runtime:r.runtime,verified,uniqueLedgerEntry:true,bodyBlocksUnchanged:1195,nonTargetFiguresUnchanged:523,preservedUnknowns:7,targetFigureSha256:hash(target),fourDisplayLimitsMapped:true,allFourDisplayLimitsInstalled:false,displayMappingPath:join(dir,'mapping.json'),strictTargetPassed:false,wholeChapterAccepted:false,admissionGranted:false,protectedFiles,protectedUnchanged:true,newModelCalls:0,newProductionCalls:0,preview:{corpusId:preview.corpusId,output:preview.output},b0947Preserved:prior.derived});
console.log(JSON.stringify({executionVerified:true,seatVerdict:verified.modelReview.seatVerdict,targetPassed:false,limitedUnknownOkay:true,unknowns:7,limits:4,limitsInstalled:false,bodyUnchanged:1195,otherFiguresUnchanged:523,newCalls:0}));
