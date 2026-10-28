// Record one completed unsuccessful semantic review. No invocation, repair or admission.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
const P='E:/AgentData/Coach/knowledge/processing',O=fileURLToPath(new URL('./',import.meta.url));
const load=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const refs=[
 ['integration/coac249-jp193-target-impact-reviewed-20261028.json','a70006b0e912a7089bf2ae7cebd3d9e366275ca3e25cc8a3ea1356335b410b6c'],
 ['integration/coac249-jp193-scope-inheritance-20261028.json','6195fc8abb583f795bd3e54832c26bc67aa698aa39c28c49304757104d491ecf'],
 ['integration/coac249-jp193-display-and-residual-20261028.json','844bc0a6989a0d1c8c1681101d1f41ae94554ed22170fac0b553638f4c6759b3']
 ].map(([path,sha256])=>({path:P+'/'+path,sha256}));
const bound=async r=>{const b=await readFile(r.path);assert.equal(sha(b),r.sha256,r.path);return JSON.parse(b);};
const [r,inheritance,proposal]=await Promise.all(refs.map(bound));
assert.equal(r.canonical,'nemata-jp-chapter-193-1');assert.equal(r.candidate.sha256,'af8071cfdbaabf8f469f84fa4daa6fd2d7d377c3dc2b277ef766e34a22324ba1');
assert.equal(r.raw.sha256,'0098bd9a196c7f711cb1d953c2148ff9d9ff1a4f852333bb2efa90dab244a6a4');
const c=await bound(r.candidate),p=await bound(r.parent),source=await bound(r.source),old=await bound(r.parentAudit),raw=await bound(r.raw);
for(const f of [r.parentRaw,r.makerRaw,r.plan,r.runtime,r.handoff])await bound(f);
const rt=await load(r.runtime.path);assert.equal(rt.files.length,32);
const runtimeRefs=rt.files.map(f=>({path:join(dirname(r.runtime.path),f.name),sha256:f.sha256}));
for(const f of runtimeRefs)assert.equal(sha(await readFile(f.path)),f.sha256);
const reviewPath=P+'/integration/coac248-193213-20261028/review.mjs',module=await import(pathToFileURL(reviewPath));
const plan=await load(r.plan.path),rebuilt=await module.prepare193213Review(P,'193');
// Compare the real JSON transport, where optional undefined keys are omitted.
assert.equal(JSON.stringify(rebuilt),JSON.stringify(plan));
const actual=await module.verify193213ReviewExecution(raw,plan);assert.deepEqual(actual,r.verification);
assert.equal(actual.limitedEvidenceVerified,false);assert.deepEqual(actual.errors,['textRepair_not_faithful','argument_or_order_gap','no_limited_allowance']);
assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));assert.deepEqual(raw.output,r.modelReview);assert.equal(raw.callId,'45129550-169e-4015-a297-8726ee5cd9c5');
assert.equal(raw.model,'gpt-6.1-terra');assert.equal(raw.reasoningEffort,'max');assert.equal(raw.requestExecution.images.length,2);
for(let i=0;i<2;i++){const a=raw.requestExecution.images[i];assert.equal(sha(await readFile(a.path)),a.sha256);assert.equal((await readFile(a.path)).length,a.bytes);assert.equal(a.path,plan.images[i]);}
assert.equal(plan.projection.orderedSourceCandidateFigurePairs.length,97);assert.equal(r.status,'repair-needed');assert.equal(r.admissionGranted,false);assert.equal(r.wholeChapterPassed,false);
assert.equal(raw.output.textRepair.verdict,'needs-repair');assert.equal(raw.output.figureRepair.verdict,'faithful');assert.equal(raw.output.orderedContextFaithful,false);
assert.deepEqual(plan.projection.orderedSourceCandidateFigurePairs.map(x=>x.source),source.blocks);
const gaps=raw.output.argumentChecks.map((x,i)=>({...x,index:i})).filter(x=>!x.faithfulWithCurrentUnknown);assert.equal(gaps.length,2);
assert.equal(raw.output.unknownImpact.length,4);for(const x of raw.output.unknownImpact)assert(x.positionConfirmed&&x.displayFaithful&&x.authorArgumentFaithfulWithUnknown&&!x.requiresExactValueForAuthorArgument);
assert.deepEqual(proposal.requiredDisplayLimitations,actual.requiredDisplayLimitations);assert.equal(actual.requiredDisplayLimitations.length,7);assert.equal(proposal.implementationVerified,false);assert.equal(proposal.admissionGranted,false);
const textId=r.textTarget,figureId=r.figureTarget;
for(const x of c.body.blocks)if(!x.sourceBlockIds.includes(textId))assert.deepEqual(x,p.body.blocks.find(b=>JSON.stringify(b.sourceBlockIds)===JSON.stringify(x.sourceBlockIds)));
for(const f of c.figures)if(f.figureId!==figureId)assert.deepEqual(f,p.figures.find(x=>x.figureId===f.figureId));
assert.equal(c.body.blocks.length,97);assert.equal(c.figures.length,41);assert.deepEqual(c.source,p.source);
const target=c.figures.find(x=>x.figureId===figureId),pt=p.figures.find(x=>x.figureId===figureId);
for(const k of ['unknowns','caption','sourceNotes','kind'])assert.deepEqual(target[k],pt[k]);
assert.deepEqual(target.unknowns,raw.output.unknownImpact.map(x=>x.unknownText));
const ledger=(await readFile(P+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===raw.callId);assert.deepEqual(ledger,[r.call]);
const tb=c.body.blocks.find(x=>x.sourceBlockIds.includes(textId)),sb=source.blocks.find(x=>x.id===textId),parentText=p.body.blocks.find(x=>x.sourceBlockIds.includes(textId));
assert.equal(sb.text,'上のような河でリーチが入った場合、入り目でなければまず待ちは');
assert.equal(tb.sourceText,sb.text);assert(tb.text.includes('且新摸入的牌没有补成宣言牌所在一侧的面子'));
const producerRegistrationPath=P+'/integration/coac248-jp193-return-20261028/owner-registration.json',producerRegistration=await load(producerRegistrationPath);
const evidenceRefs=[...refs,r.raw,r.candidate,r.source,r.parent,r.parentAudit,r.parentRaw,r.makerRaw,r.plan,r.runtime,r.handoff];
await mkdir(O+'/evidence',{recursive:true});const archive=[];
for(const [i,f]of evidenceRefs.entries()){await bound(f);const name='e'+i+'.json';await copyFile(f.path,O+'/evidence/'+name);archive.push({...f,copy:'evidence/'+name});}
const readonlyInputs=[...evidenceRefs,...runtimeRefs,{path:reviewPath,sha256:sha(await readFile(reviewPath))},
 {path:P+'/integration/coac248-193213-20261028/release.json',sha256:sha(await readFile(P+'/integration/coac248-193213-20261028/release.json'))},
 {path:producerRegistrationPath,sha256:sha(await readFile(producerRegistrationPath))}];
const result={canonical:r.canonical,candidate:r.candidate,source:r.source,parent:r.parent,parentAudit:r.parentAudit,receipt:refs[0],raw:r.raw,
 transportCompleted:true,status:r.status,verification:actual,orderedContextFaithful:false,mechanicalOrderedInputMatchesSource:true,semanticGaps:gaps,
 sourceText:sb,currentTranslation:tb,parentTranslation:parentText,confirmedFigureRepair:raw.output.figureRepair,
 fullTargetFigureSha256:sha(JSON.stringify(target)),unknowns:target.unknowns,unknownEvidence:raw.output.unknownImpact,originalIssues:old.modelReview.issues,newIssues:raw.output.issues,
 sourceBlocks:97,unchangedBodyBlocks:96,unchangedFullFigures:40,uniqueLedger:true,originalRuntimeAndRequestVerified:true,
 phaseBudget:r.chapterPhaseCalls,producerAlreadyRegistered:{path:producerRegistrationPath,sha256:sha(await readFile(producerRegistrationPath)),schema:producerRegistration.schema},
 nextProposal:{authorized:false,newCallsMaximum:2,maker:1,targetTextReview:1,retry:0,failedVoidCount:true,
  targetId:textId,path:'/body/blocks/'+c.body.blocks.indexOf(tb)+'/text',before:tb.text,
  target:'Replace only the unsupported compound test with the original 入り目 exception; keep both following waits and modality. Exact wording remains a proposed maker target, not an output.',
  protectedFields:['sourceText','sourceSegments','marks','tableContext','all figure objects','all other body fields and order'],
  beforeAnyCall:'If later authorized, freeze a new exact single-text contract and prove its real prompt/whitelist/context offline; do not reuse the previous compound-condition expected output or use models to test the adapter.',
  preserveEvidence:[refs[0],refs[1]],inheritOnlyIfUnchanged:['complete target figure hash/unknowns','all 96 non-target blocks and 40 figures','source/parent/raw chain','all seven separately visible non-author limits'],
  reviewContext:'all 97 ordered source/candidate/figure pairs, especially b0080-b0097 and the adjacent inline waits; compare old/new b0081 only. Existing exact six-pip repair and unknown-impact evidence may be reused after full hash binding. No repeated tile recognition.'},
 archive,readonlyInputs,wholeChapterPassed:false,admissionGranted:false,limitsInstalled:false,newProductionCalls:0,newReviewCalls:0,newConsumers:0,
 fee:'unknown',upstreamExecutions:'unknown',remoteWeights:'unknown'};
for(const f of readonlyInputs)assert.equal(sha(await readFile(f.path)),f.sha256,'input changed during recording: '+f.path);
await writeFile(O+'/recorded.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({canonical:r.canonical,status:r.status,errors:actual.errors,unknowns:4,limits:7,sourceBlocks:97,nonTargetBlocks:96,nonTargetFigures:40,newCalls:0,admissionGranted:false}));
