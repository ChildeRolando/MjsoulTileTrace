// Read-only evidence consumption; no model invocation, stage, candidate or pointer writes.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',local=fileURLToPath(new URL('./',import.meta.url));
const out=join(root,'integration/coac248-182-limits-20261028');await mkdir(out,{recursive:true});await mkdir(join(local,'evidence'),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b),bindings=[];
async function load(path,expected){const p=resolve(root,path),b=await readFile(p);if(expected)assert.equal(sha(b),expected,'evidence changed:'+path);bindings.push({path:p,sha256:sha(b),bytes:b.length});return JSON.parse(b);}
const candidatePath='web-production/v1/candidates/79-bilibili-cn/cv1760573.r1.display.json',candidateSha='32e040ae1683015cc92dac03381af964842eeef8ad6dcb54b2c38fc26480cabc';
const c=await load(candidatePath,candidateSha);
const receipt=await load('integration/coac249-182-target-impact-reviewed-20261028.json','14442a0ef1dfa65e159ec3e887a56c9d83beb2fb7d32ffdf114a547c31248a62');
const raw=await load('audit/calls/2c5124ed-ccb2-41e0-90db-cbb6e80141fa.json','667ec48a9f8132ebde5277f56bc4e98bbdf5d6b5d2d2c6a2fdabe1f6c62c3482');
const inherit=await load('integration/coac249-182-scope-inheritance-20261028.json','b981c50527728b1eb654c43892536566835ac65374686e9f3dfd4dc173bea7b8');
const proposal=await load('integration/coac249-182-display-requirements-20261028.json','93f8864e139223dbe9dcb8607bcdd52ae2b799d2b867501fd3bd1ff283fa03c2');
const p=await load(c.provenance.revision.parentPath,c.provenance.revision.parentSha256),n=await load(c.provenance.revision.notesPath,c.provenance.revision.notesSha256),source=await load(c.source.sourcePath,c.source.sourceSha256);
const release=await load('integration/coac248-182201-20261028/release.json'),manifest=await load(join(release.runtimePath,'runtime-manifest.json'),release.runtimeManifestSha256);
for(const f of manifest.files)assert.equal(sha(await readFile(join(release.runtimePath,f.name))),f.sha256);
const {prepare182201Review,verify182201ReviewExecution}=await import(pathToFileURL(join(root,'integration/coac248-182201-20261028/review.mjs')));
const plan=await prepare182201Review(root,'cv1760573');const published=await load('integration/coac248-182201-20261028/cv1760573-review-plan.json');assert(eq(plan,published),'published plan differs');
const verification=await verify182201ReviewExecution(raw,plan);assert(verification.limitedEvidenceVerified);assert(eq(verification,receipt.verification));
assert(eq(raw.output,receipt.modelReview)&&eq(JSON.parse(raw.rawLastMessage),receipt.modelReview));assert.equal(raw.callId,receipt.call.callId);
assert.equal(sha(JSON.stringify(raw.schema)),receipt.call.schemaSha256);assert.equal(sha(raw.prompt),receipt.call.semanticPromptSha256);assert(eq(raw.schema,plan.schema)&&raw.prompt===plan.prompt);
assert.equal(raw.requestExecution.model,'gpt-6.1-sol');assert.equal(raw.requestExecution.reasoningEffort,'high');assert.equal(raw.requestExecution.images.length,0);assert(!raw.requestExecution.args.includes('-i'));
const ledger=(await readFile(join(root,'audit/calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(x=>x.callId===raw.callId);assert.equal(ledger.length,1);assert(eq(ledger[0],receipt.call));
assert.equal(c.body.blocks.length,13);assert.equal(c.figures.length,5);assert(eq(c.figures,p.figures));
for(let i=0;i<13;i++){const now=structuredClone(c.body.blocks[i]),old=p.body.blocks[i];if(i===2)now.text=old.text;assert(eq(now,old),'non-target block changed');}
assert.equal(n.status,'needs-repair');assert(n.modelReview.issues.some(x=>x.severity==='uncertain'&&x.targetId.endsWith('b0013')));assert(receipt.modelReview.issues.some(x=>x.severity==='uncertain'));
const body=c.body.blocks[12],anchor=proposal.anchor;assert.equal(sha(body.text),proposal.authorBodyFieldSha256);assert.equal(body.sourceBlockIds[0],proposal.targetId);
const b=Buffer.from(body.text);assert.equal(b.subarray(anchor.utf8Start,anchor.utf8End).toString('utf8'),anchor.text);assert.equal(sha(Buffer.from(anchor.text)),anchor.anchorSha256);assert.equal(body.text.split(anchor.text).length,2);
assert(eq(proposal.allRequiredDisplayLimitations,raw.output.carriedIssue.requiredDisplayLimitations));
assert(!JSON.stringify(c).includes(proposal.requiredNeighborAnnotation.text));
const note={schema:'coac248-182-exact-neighbor-note-binding/1',canonical:'79-cn-chapter-182-5',candidatePath,candidateSha256:candidateSha,sourceSha256:c.source.sourceSha256,targetId:proposal.targetId,authorBodyPath:proposal.authorBodyPath,authorBodyFieldSha256:proposal.authorBodyFieldSha256,anchor:proposal.anchor,
 placement:'separate non-author block adjacent to original b0013; retain entire author body and its marks/segments/order; no sourceEditorialNote body append',
 label:proposal.requiredNeighborAnnotation.label,text:proposal.requiredNeighborAnnotation.text,authorText:false,authorBodyInjection:false,
 requiredDisplayLimitations:proposal.allRequiredDisplayLimitations,independentReceiptSha256:'14442a0ef1dfa65e159ec3e887a56c9d83beb2fb7d32ffdf114a547c31248a62',independentRawSha256:'667ec48a9f8132ebde5277f56bc4e98bbdf5d6b5d2d2c6a2fdabe1f6c62c3482',
 installed:false,admissionGranted:false,wholeChapterPassed:false,newModelCalls:0};
function validateNote(x){assert(eq(x,note),'exact182_note_binding');assert.equal(x.authorText,false);assert.equal(x.authorBodyInjection,false);}
validateNote(note);const negatives=[];
for(const[name,mut]of [['wrong-canonical',x=>x.canonical='79-cn-chapter-201-6'],['wrong-candidate-sha',x=>x.candidateSha256='0'.repeat(64)],['wrong-source',x=>x.sourceSha256='0'.repeat(64)],['wrong-path',x=>x.authorBodyPath='/body/blocks/2/text'],['wrong-coordinate',x=>x.anchor.utf8End++],['guessed-meaning',x=>x.text+='表示只能弃和'],['unlabeled-note',x=>x.label=''],['author-injection',x=>x.authorBodyInjection=true],['missing-condition',x=>x.requiredDisplayLimitations.pop()],['ordinary-pass',x=>x.wholeChapterPassed=true]]){const x=structuredClone(note);mut(x);assert.throws(()=>validateNote(x));negatives.push({name,rejected:true});}
const preview=await load('integration/accepted-preview-current.json'),register=await load('integration/coac250-unified-chapter-register-20261027b.json');assert(!(preview.selectedWeb??[]).some(x=>JSON.stringify(x).includes('cv1760573')));const row=register.rows.find(x=>x.chapterId==='79-cn-chapter-182-5');assert.equal(row.covered,false);
const result={schema:'coac248-182-independent-evidence-consumption/1',checkedAt:new Date().toISOString(),canonical:note.canonical,candidatePath,candidateSha256:candidateSha,independentCallId:raw.callId,actualModel:raw.requestExecution.model,actualEffort:raw.requestExecution.reasoningEffort,imageCount:0,usage:raw.usage,durationMs:raw.durationMs,verification,
 sourceSha256:c.source.sourceSha256,parentSha256:c.provenance.revision.parentSha256,parentAuditSha256:c.provenance.revision.notesSha256,uniqueAuditLedger:true,frozenFilesRechecked:manifest.files.length,fullOrderedPairs:13,unchangedNonTargetBlocks:12,unchangedFullFigures:5,allUnknownCaptionSourceNotesPreserved:true,
 teachingArgumentChecks:raw.output.argumentChecks,allIndependentLimitations:note.requiredDisplayLimitations,sourceAmbiguityRemaining:raw.output.carriedIssue.unresolvedContributionOrMinimumGap,
 exactRemainingAction:'Install the separately labeled adjacent non-author annotation using an exact182 loader pin; keep b0013 author bytes intact. Then existing250 reads the source sentence, note, original author claim, all limits and original images through real MCP/Arena before coverage changes.',
 dedupe:{selected:false,registerCovered:false,existing244Wakeup:'01a181bb-a320-79b5-84ce-ed6e7fbcd010',existing244Run:'01a181bd-07bd-75bb-a7bf-52676fccf157',existing250Wakeup:'01a181bb-a978-7c22-8787-06f89d12ae29',existing250Run:'01a181bd-110f-7cba-bad6-9dfc285b07ec',newDispatches:0},
 negativeChecks:negatives,newModelCalls:0,newProductionCalls:0,newReviews:0,chapterPhaseBudget:{maker:1,independentReview:1,consumed:2,remaining:0,retry:0},annotationInstalled:false,wholeChapterPassed:false,admissionGranted:false,activeChanged:false,bindings};
for(const[name,x]of [['note-binding.json',note],['verification.json',result]]){await writeFile(join(out,name),JSON.stringify(x,null,2)+'\n',{flag:'wx'});await copyFile(join(out,name),join(local,name));}
let k=0;const map=[];for(const f of bindings){const dest='evidence/'+String(k++).padStart(3,'0')+'.json';await copyFile(f.path,join(local,dest));map.push({...f,archivePath:dest});}await writeFile(join(local,'path-map.json'),JSON.stringify(map,null,2)+'\n');
console.log(JSON.stringify({verified:true,newModelCalls:0,negativeChecks:negatives.length,annotationInstalled:false,existingOwnerDispatchesReused:true,candidateSha256:candidateSha}));
