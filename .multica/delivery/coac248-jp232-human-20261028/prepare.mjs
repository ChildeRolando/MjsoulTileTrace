import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {inspect,validateMapping,validateRequest,objectSha,sha,load,R,D,SHA,OWNER,CANONICAL} from './verify.mjs';
import {validateDerived,latestFactMatches,deriveValue,inputs} from 'file:///E:/AgentData/Coach/knowledge/processing/integration/coac244-human-final-20261028/entry.mjs';
const out=fileURLToPath(new URL('.',import.meta.url));
const {report,mapping,ctx,c,req,expected,payload}=await inspect();
const cases=[];
function reject(name,fn){assert.throws(fn,undefined,name);cases.push({name,rejected:true});}
function changed(x,fn){const y=structuredClone(x);fn(y);return y;}
for(const[name,edit]of [
 ['non-target author body',x=>x.body.blocks[0].text+='x'],
 ['wrong source SHA',x=>x.source.sourceSha256='0'.repeat(64)],
 ['wrong 9m',x=>x.figures[0].transcription=x.figures[0].transcription.replace('8s 9m 7z','8s 8m 7z')],
 ['missing separator (old rejected draft)',x=>x.figures[0].transcription=x.figures[0].transcription.replace('8s 9m 7z','8s9m7z')],
 ['delete unrelated unknown',x=>x.figures[0].unknowns.pop()],
 ['duplicate unknown',x=>x.figures[0].unknowns.push(x.figures[0].unknowns[0])],
 ['non-target caption',x=>x.figures[0].caption+='x'],
 ['non-target figure',x=>x.figures[1].transcription+='x'],
 ['reorder body',x=>x.body.blocks.reverse()],
 ['fake production provenance',x=>x.provenance.humanDerivation.modelProduced=true],
 ['wrong parent pin',x=>x.provenance.humanDerivation.parent.sha256='0'.repeat(64)]
])reject(name,()=>validateDerived('232',changed(c,edit),ctx));
for(const[name,edit]of [
 ['missing limitation',x=>x.displayProposal.notes.pop()],
 ['wrong annotation anchor',x=>x.displayProposal.anchor.afterSourceBlock='b0007'],
 ['false admission',x=>x.admissionGranted=true],
 ['invented review authorization',x=>x.semanticReviewAuthorized=true],
 ['wrong mapped candidate',x=>x.candidate.sha256='0'.repeat(64)],
 ['omit non-author label',x=>x.displayProposal.label='作者补充']
])reject(name,()=>validateMapping(changed(mapping,edit),mapping));
reject('vision input in text proposal',()=>validateRequest(changed(req,x=>x.images.push('not-authorized.jpg')),expected,payload,{source:ctx.source,candidate:c}));
reject('missing teaching context',()=>validateRequest(req,expected,changed(payload,x=>x.candidateBodyInVisualOrder.pop()),{source:ctx.source,candidate:c}));
let ownerRejected=false;try{await inputs('232','wrong-owner');}catch{ownerRejected=true;}assert(ownerRejected);cases.push({name:'wrong consumer owner',rejected:true});
// The live-event validator must reject changed/withdrawn/skipped results, even when a stale packet was valid.
const evidence=await load(D+'/final-evidence.json');
const observation=evidence.observations.find(x=>x.itemId===mapping.acceptedHumanFact.itemId);
const events=(await readFile('E:/AgentData/Coach/knowledge/human-annotations/events.jsonl','utf8')).trim().split(/\r?\n/).map(JSON.parse);
const event=events.findLast(x=>x.id===observation.itemId);
latestFactMatches(observation,event);
for(const status of ['skipped','unclear','withdrawn'])reject('latest human '+status,()=>latestFactMatches(observation,changed(event,x=>x.result.status=status)));
reject('newer changed human tile',()=>latestFactMatches(observation,changed(event,x=>x.result.tiles=['8m'])));
assert.deepEqual(deriveValue('232',ctx.parent,ctx.facts,ctx.plan),c);
const previewPath=R+'/integration/accepted-preview-current.json';
const registerPath=R+'/integration/coac250-unified-chapter-register-20261027b.json';
const preview=await load(previewPath),register=await load(registerPath);
const selection=[...Object.values(preview.selectedWeb??{}),...Object.values(preview.selectedPdf??{})].filter(x=>JSON.stringify(x).includes('chapter04-section012')||JSON.stringify(x).includes(CANONICAL)||JSON.stringify(x).includes(SHA));
assert.equal(selection.length,0,'already selected: only update existing consumer');
const row=register.rows.find(x=>x.chapterId===CANONICAL);assert(row);assert.equal(row.covered,false);
const auditLedger=(await readFile(R+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
assert.equal(auditLedger.filter(x=>JSON.stringify(x).includes(SHA)).length,0,'already reviewed/dispatched: do not create another consumer');
const dedupe={checkedAt:new Date().toISOString(),candidateSha256:SHA,acceptedSelectionMatches:0,registerCovered:false,registerRowSha256:objectSha(row),preview:{path:previewPath,sha256:sha(await readFile(previewPath)),output:preview.output},register:{path:registerPath,sha256:sha(await readFile(registerPath))},standardAuditLedgerNewCandidateMatches:0,chapterClaimHeld:false,chapterClaimCheck:'slots.mjs check-chapter --chapter nemata-jp-chapter-232-1 --owner "COAC-248 Mika" returned held=false',noNewConsumerCreated:true};
const handoff={schema:'coac248-232-human-final-prepared/1',canonical:CANONICAL,ownerIssueId:OWNER,
 candidate:report.candidate,parent:report.parent,source:report.source,
 status:'deterministic-human-application-verified-awaiting-authorized-application-review',
 verification:{path:'integration/coac248-jp232-human-20261028/verification.json'},
 applicationMap:{path:'integration/coac248-jp232-human-20261028/application-map.json'},
 verifyCommand:'node E:/AgentData/Coach/knowledge/processing/integration/coac248-jp232-human-20261028/verify-packet.mjs',
 proposedIndependentReview:report.preparedRequest,
 retainedLimits:{unknownCount:2,visibleLimitCount:4,anchor:mapping.displayProposal.anchor,installed:false},
 originalReviewFalsePreserved:true,originalRawUnchanged:true,human9mMustNotBeReGuessed:true,
 nextActionFor244:'在现有owner决定是否安排已提案的唯一纯文字人标应用/作者论证独审；未经安排不得invoke。旧0dae5b1a保持不变，现稿9m不能再当识字待办。',
 nextActionFor249:'仅在根明确安排后复用request-232.json；sol/high、images=[]，审人工9m正确应用及完整有序原论证，不猜牌、不整章重审。当前没有新增额度。',
 nextActionFor250:'目前只登记未准入。独立应用/论证条件齐后，将原文字/3s证据、人标派生及两unknown四条限制按本SHA合法组合；安装非原文注，再真实MCP/Arena读回9m、3s、原条件/原图/unknown及说明，不切active。',
 remainingGap:report.minimumGap,proposedReviewMaximum:1,authorizedNewCalls:0,newModelCalls:0,newProductionCalls:0,admissionGranted:false,wholeChapterPassed:false};
await mkdir(out,{recursive:true});
for(const[name,value]of Object.entries({'verification.json':report,'application-map.json':mapping,'negative-checks.json':{passed:true,count:cases.length,cases,newModelCalls:0},'dedupe.json':dedupe,'handoff.json':handoff}))await writeFile(out+name,JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({candidate:SHA,negativeChecks:cases.length,prepared:true,admissionGranted:false,newModelCalls:0}));
