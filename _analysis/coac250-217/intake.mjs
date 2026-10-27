// Zero-call intake of the paired PDF217 figure and mandatory PDF218 annotation.
// This does not stage a page/chapter, invoke a model, or change a preview.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,mkdir,copyFile,unlink,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join,resolve,relative,dirname,isAbsolute} from 'node:path';
const root='E:/AgentData/Coach/knowledge/processing',integration=join(root,'integration');
const dir='_analysis/coac250-217',pkg=join(integration,'coac248-p217-admitted-20261028');
const chapter='79-cn-chapter-217-4',candidateSha='a3b8eaf8576355b0d4737cd57e1bb49a1db1ceb3a5943ff992630aed9da5cd54';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const exists=async p=>{try{await access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const dataPath=p=>isAbsolute(p)?p:resolve(root,p);
const registration=join(integration,'coac250-p217-limited-evidence-intake-20261028.json');
await mkdir(dir,{recursive:true});
const proofPath=join(integration,'coac249-p217-evidence-consistency-20261028.json');
const proofBytes=await readFile(proofPath),proof=JSON.parse(proofBytes);
assert.equal(proof.schema,'coac249-p217-limited-evidence-consistency/1');
assert.equal(proof.status,'limited-correction-evidence-consistent');
assert.equal(proof.chapterId,chapter);assert.equal(proof.candidate.sha256,candidateSha);
if(await exists(registration)){
 const old=await load(registration);assert.equal(old.consistencyProof.sha256,sha(proofBytes));assert.equal(old.candidate.sha256,candidateSha);
 console.log(JSON.stringify({deduplicated:true,registration,previewBuilt:false,modelCalls:0}));process.exit(0);
}
const lock=join(integration,'accepted-consumer.lock');
if(await exists(lock))throw Error('Existing sole integration writer: '+await readFile(lock,'utf8'));
const stop=join(integration,'ACCEPTED-CONSUMER-STOP');
assert.equal(await exists(stop),false,'Accepted consumer is stopped; do not mutate its register');
await writeFile(lock,JSON.stringify({pid:process.pid,scope:'COAC-250 PDF217 paired evidence only; no preview/consumer',startedAt:new Date().toISOString()})+'\n',{flag:'wx'});
try{
 const canonicalNames=['accepted-preview-current.json','specific-web-variant-selection.v24.json','current-web-candidate-selection.json','current-candidate-selection.json','build-accepted-preview.mjs','source-structure-holds.json','candidate-exclusions.json','definition-boundary-stage-selection.json'];
 const canonicalBefore=[];for(const name of canonicalNames){const path=join(integration,name);canonicalBefore.push({path,sha256:sha(await readFile(path))});}
 const formalPath='E:/AgentData/Coach/knowledge/review/textbook-corpus.json';canonicalBefore.push({path:formalPath,sha256:sha(await readFile(formalPath))});
 const registerPath=join(integration,'coac250-unified-chapter-register-20261027b.json'),registerBytes=await readFile(registerPath),register=JSON.parse(registerBytes);
 const row=register.rows.find(r=>r.originalChapterId===chapter);assert(row);assert.equal(row.covered,false);
 assert.equal(register.counts.effectiveCoveredOriginalChapters,232);
 const preview=await load(join(integration,'accepted-preview-current.json'));
 assert.equal(preview.corpusId,'bd07bd53701d3a93b330807046e7e8bf135b000da2e92f23260f416369116592');
 assert.equal(canonicalBefore.find(f=>f.path.endsWith('specific-web-variant-selection.v24.json')).sha256,'d7f2792acecbd12a1d3192e9f6cf79a86ce3f1a5a1ee8c9a598a13030a362d39');
 const protectedFiles=[];
 async function bound(f){const path=dataPath(f.path),bytes=await readFile(path);assert.equal(sha(bytes),f.sha256,path);protectedFiles.push({path,sha256:f.sha256});return bytes;}
 const handoff=JSON.parse(await bound(proof.producerHandoff));assert.equal(proof.producerHandoff.sha256,'f4b7983a77deb15932119c2a30f3806bf29e18f0910c1004d40e4c27417e124e');
 for(const f of proof.inputs)await bound(f);
 const manifest=JSON.parse(await bound(proof.runtime));assert.equal(proof.runtime.sha256,'e039ca388aefec50a88ee33f84f2d5fc41d70a82014282c701ba89652ba8eae9');assert.equal(manifest.files.length,5);
 for(const f of manifest.files)await bound({path:join(pkg,f.path),sha256:f.sha256});
 const candidate=JSON.parse(await bound(proof.candidate)),parent=JSON.parse(await bound(proof.parent));
 await bound(proof.sourceImage);await bound(proof.projection);await bound(proof.correctionProof);
 const admission=await load(join(pkg,'native-inline-field-corrections.p217.root-acceptance.json'));
 assert.equal(Object.keys(admission.inputs).length,29);
 for(const f of Object.values(admission.inputs))await bound(f);
 for(const key of ['admission','verification','diff'])await bound(handoff[key]);
 assert.deepEqual(candidate.body,parent.body);assert.equal(candidate.figures[0].unknowns.length,2);
 assert.equal(proof.pageOrChapterPassed,false);assert.equal(proof.newSemanticModelCalls,0);assert.equal(proof.newProductionCalls,0);
 // Run only the pinned deterministic validator and its rejection regressions.
 const verificationOutput=execFileSync(process.execPath,[join(pkg,'verify.mjs'),root],{encoding:'utf8',windowsHide:true,maxBuffer:2000000});
 await writeFile(dir+'/validator-output.json',verificationOutput);
 const tests=execFileSync(process.execPath,['--test','--test-reporter=tap',join(pkg,'correction.test.mjs')],{encoding:'utf8',windowsHide:true,maxBuffer:2000000});
 await writeFile(dir+'/tests.log',tests);assert.match(tests,/# pass 22\b/);assert.match(tests,/# fail 0\b/);
 const verification=JSON.parse(verificationOutput);assert.equal(verification.inputBindings,29);assert.equal(verification.pageOrChapterPassed,false);
 assert.equal(verification.nonTargetSerializedBytesRestoredToParentSha256,proof.parent.sha256);
 assert(verification.authorBodyUnchanged&&verification.captionUnchanged&&verification.northSecond9mUnchanged);
 const projection=await load(dataPath(proof.projection.path)),segments=projection.continuation.segments;
 assert.deepEqual(projection.figure,candidate.figures[0]);assert.equal(projection.chapterId,chapter);
 assert.equal(segments.length,3);assert.equal(segments[0].end,165);assert(segments[0].text.endsWith('施行让亲家未听下庄的战术。'));
 assert.equal(segments[1].type,'editorial-note');assert.equal(segments[1].authorText,false);assert(segments[2].text.includes('后付的字牌'));
 const source218=await load(dataPath(admission.inputs.page218.path)),authorText=source218.blocks.find(b=>b.id==='79-cn-p218-b3').lines.map(l=>l.text).join('');
 assert.equal(segments.filter(s=>s.type==='source-text').map(s=>s.text).join(''),authorText);
 for(const term of ['非原文','精确牌谱','可见张数','余张','进张','安全度','推测','绝对安全或最优'])assert(segments[1].text.includes(term),term);
 const [northFirst,northSecond,west]=proof.independentEvidence;
 assert.equal(northFirst.callId,'09362d05-d221-427e-b474-a79017ff7619');assert.deepEqual(northFirst.bbox,[150,325,175,357]);assert.equal(northFirst.result.tileCode,'unknown');
 assert.deepEqual(northSecond.bbox,[174,325,196,357]);assert.equal(northSecond.result.tileCode,'9m');assert(candidate.figures[0].transcription.includes('万子（数字未辨清） 9m。'));
 assert.deepEqual(west.bbox,[81,175,112,199]);assert.equal(west.result.classification,'limited-unknown-acceptable');assert.equal(west.result.tileRankReadAttempted,false);assert.equal(west.result.premiseChecks.length,6);assert(west.result.premiseChecks.every(c=>c.dependency==='independent-of-target-number'));
 // Inventory actual candidate files, not just the historical chapter-register row.
 const inventory=await readdir(root,{recursive:true});
 const pageCandidates=inventory.filter(p=>/(?:^|[\\/])candidates[\\/]79-cn[\\/]page-0(?:217|218|219|220)(?:\.|$)/.test(p)).map(p=>join(root,p));
 const missingPages=[218,219,220].map(page=>({page,candidatePaths:pageCandidates.filter(p=>p.replaceAll('\\','/').includes('/page-'+String(page).padStart(4,'0')+'.'))}));
 assert(missingPages.every(p=>p.candidatePaths.length===0),'New continuation candidate found: inspect its real acceptance before recording a gap');
 const selectedPdf=await load(join(integration,'current-candidate-selection.json'));
 assert(!selectedPdf.pages.some(p=>p.sourceId==='79-cn'&&[217,218,219,220].includes(p.page)));
 const ownership=await load(join(integration,'source-block-ownership.json'));
 const owned=ownership.blocks.filter(b=>b.sourceId==='79-cn'&&b.chapterId===chapter);assert.equal(owned.length,22);
 assert.equal(ownership.blocks.find(b=>b.sourceBlockId==='79-cn-p217-b8').chapterId,chapter);
 for(const id of ['79-cn-p217-b1','79-cn-p217-b3'])assert.equal(ownership.blocks.find(b=>b.sourceBlockId===id).chapterId,'79-cn-chapter-215-4');
 const remainingScope=missingPages.map(p=>({...p,owner:'COAC-244 existing PDF chapter production/acceptance; COAC-250 final scope assembly/readback',requiredSourceBlockIds:owned.filter(b=>b.page===p.page).map(b=>b.sourceBlockId),status:'no complete PDF candidate or passed full-page receipt; source paragraph projection is not a full candidate'}));
 const pair={schema:'coac250-p217-paired-limited-proof/1',chapterId:chapter,candidate:proof.candidate,projection:proof.projection,sourceImage:proof.sourceImage,parent:proof.parent,admission:handoff.admission,consistencyProof:{path:proofPath,sha256:sha(proofBytes)},runtime:proof.runtime,figureId:proof.figureId,sourceBlockId:proof.sourceBlockId,requiredAnnotation:{sourceBlockId:'79-cn-p218-b3',afterCharacterOffset:165,authorText:false,text:segments[1].text},consumptionPolicy:'Consume the exact figure and mandatory non-author annotation together through the pinned exact correction gate. Neither alone is eligible. No whole-page/chapter passed claim.',unknownCount:2,northSecond:'9m unchanged',recognitionTodoRequired:false,westImpactReviewRequired:false,limitedEvidenceAccepted:true,pageOrChapterPassed:false,previewEligible:false,remainingScope};
 for(const f of protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 for(const f of canonicalBefore)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 assert.equal(sha(await readFile(registerPath)),sha(registerBytes),'Register changed under writer');
 await copyFile(registerPath,dir+'/register.before.json');
 row.limitedPdfEvidence={...pair,registration};
 row.remainingRequiredPdfSourceScope={pages:remainingScope,finalAcceptance:'Once continuation pages have valid evidence, assemble all 22 owned blocks exactly once, verify canonical boundary, paired note and complete MCP/Arena readback. No new recognition request for the two retained unknowns.',webVariant:'Independent unchanged needs-repair route; this PDF correction does not accept the web candidate.'};
 assert.deepEqual(register.counts,JSON.parse(registerBytes).counts);assert.equal(register.rows.filter(r=>r.covered).length,JSON.parse(registerBytes).rows.filter(r=>r.covered).length);
 const otherRows=register.rows.filter(r=>r.originalChapterId!==chapter);assert.deepEqual(otherRows,JSON.parse(registerBytes).rows.filter(r=>r.originalChapterId!==chapter));
 await save(registerPath,register);await copyFile(registerPath,dir+'/register.after.json');
 await save(dir+'/paired-proof.json',pair);
 const result={schema:'coac250-p217-limited-evidence-intake/1',recordedAt:new Date().toISOString(),status:'paired-limited-evidence-registered-awaiting-continuation-scope',candidate:proof.candidate,consistencyProof:pair.consistencyProof,producerHandoff:proof.producerHandoff,runtime:proof.runtime,runtimeFilesVerified:5,inputBindingsVerified:29,consistencyInputsVerified:proof.inputs.length,protectedFiles,pair,independentEvidence:proof.independentEvidence,deterministicVerification:verification,tests:{passed:22,failed:0},inventory:{pageCandidates,selectedPdfPages:[],ownedSourceBlocks:owned,remainingScope},canonicalBefore,canonicalUnchanged:true,register:{path:registerPath,beforeSha256:sha(registerBytes),afterSha256:sha(await readFile(registerPath)),changedRows:[chapter],otherRowsUnchanged:otherRows.length,countsUnchanged:true},coverage:{originalChaptersCovered:232,originalChaptersTotal:256,originalUnitsCovered:264,originalUnitsTotal:303,remainingChapters:24,increment:0},selectionVersion:24,previewCorpusId:preview.corpusId,previewBuilt:false,mcpReadbackPerformed:false,arenaReadbackPerformed:false,readbackReason:'No accepted complete continuation chapter exists; retained only exact paired supplement evidence, no new preview to read.',writer:{pid:process.pid,lock,consumerStarted:false},formalActiveChanged:false,productionCalls:0,modelCalls:0,pageOrChapterPassed:false};
 await writeFile(registration,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 await save(dir+'/verification.json',{...result,registration});
 await copyFile(proofPath,dir+'/consistency-proof.json');await copyFile(dataPath(proof.producerHandoff.path),dir+'/handoff.json');
 // Preserve immutable upstream bytes for delivery, including all 29 evidence bindings.
 const snapshots=new Set([join(pkg,'runtime-manifest.json'),...manifest.files.map(f=>join(pkg,f.path)),...Object.values(admission.inputs).map(f=>dataPath(f.path)),dataPath(proof.candidate.path),dataPath(proof.projection.path),dataPath(proof.correctionProof.path),dataPath(handoff.verification.path),dataPath(handoff.diff.path)]);
 for(const path of snapshots){const rel=relative(pkg,path);assert(!rel.startsWith('..')&&!isAbsolute(rel));const to=join(dir,'upstream',rel);await mkdir(dirname(to),{recursive:true});await copyFile(path,to);}
 for(const f of canonicalBefore)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 console.log(JSON.stringify({registered:true,candidateSha,testsPassed:22,inputBindings:29,remainingPages:remainingScope.map(p=>({page:p.page,blocks:p.requiredSourceBlockIds.length})),coverageIncrement:0,previewBuilt:false,modelCalls:0}));
}finally{assert.equal((await load(lock)).pid,process.pid);await unlink(lock);}
