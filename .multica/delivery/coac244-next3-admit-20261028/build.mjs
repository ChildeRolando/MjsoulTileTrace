import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {verifyLimitedUnknownAdmission,checkIndependentLimitedConclusion,EXACT,STATUS} from './admission.mjs';
import {prepare100RepairContract,validate100Output} from './text100.mjs';
const root='E:/AgentData/Coach/knowledge/processing',out=dirname(fileURLToPath(import.meta.url)),shared=join(root,'integration/coac244-next3-admit-20261028');
const sha=b=>createHash('sha256').update(b).digest('hex');const tests=[],protectedFiles=new Map();
const check=(name,ok)=>{tests.push({name,passed:!!ok});if(!ok)throw Error(name);};
async function save(n,d){await writeFile(join(out,n),JSON.stringify(d,null,2)+'\n');return {path:join(shared,n),sha256:sha(await readFile(join(out,n)))};}
async function bound(r){const b=await readFile(r.path);check('sha:'+r.path,sha(b)===r.sha256);protectedFiles.set(r.path,r.sha256);return /\.json$/.test(r.path)?JSON.parse(b):b;}
const handoff=await bound({path:join(root,'integration/coac249-next3-reviewed-20261028.json'),sha256:'ebe45f7418c0a049acea441bfe361810bbcc7ce5b74f2505cb1bb03bdc5b880b'});
check('batch3/3 zero maker zero retry',handoff.budget.used===3&&handoff.budget.remaining===0&&handoff.budget.production===0&&handoff.budget.retry===0);
const admitted=[];
for(const key of ['159','242']){
 const item=handoff.items.find(i=>i.key===key),h=await bound(item.handoff),e=await bound(item.limitedFidelityEvidence),raw=await bound(item.raw);
 for(const r of h.allBoundInputs)await bound(r);
 const c=await bound(e.candidate),s=await bound(e.source),old=await bound(e.oldAudit),envelope=await bound(e.originalConsumerReceipt),request=await bound(h.request);
 check('immutable original fields:'+key,envelope.status==='needs-repair'&&envelope.checks.limitedOkay===false&&raw.output.conclusion==='limited-unknown-acceptable');
 check('uncertain retained:'+key,raw.output.propositions.some(x=>x.dependsOnExactTile==='uncertain'));
 const proof=await verifyLimitedUnknownAdmission(root,e.candidate.path);check('new scoped status not standard pass:'+key,proof.status===STATUS&&proof.standardWholeArticlePassed===false);
 const ref=await save('admission-'+key+'.json',proof);admitted.push({key,canonical:e.canonical,candidate:e.candidate,proof:ref,evidence:item.limitedFidelityEvidence,oldAudit:e.oldAudit,raw:item.raw,scope:e.scope,unknowns:e.existingUnknowns,modelFieldsAndFalsePreserved:true});
 for(const mutation of ['position','readable','fidelity','exact-dependency','permission']){
  const m=structuredClone(raw.output);if(mutation==='position')m.location.originalBBox[0]++;if(mutation==='readable')m.reading.status='readable';if(mutation==='fidelity')m.propositions[0].faithfulWithUnknown=false;if(mutation==='exact-dependency')m.propositions[0].dependsOnExactTile='yes';if(mutation==='permission')m.conclusion='must-read-before-acceptance';let rejected=false;try{checkIndependentLimitedConclusion(m,EXACT[key]);}catch{rejected=true;}check('reject model boundary:'+key+':'+mutation,rejected);
 }
 for(const mutation of ['candidate','source','raw','oldAudit','missing-unknown']){
  const target=mutation==='missing-unknown'?e.candidate:e[mutation],original=await readFile(target.path),obj=JSON.parse(original);
  if(mutation==='missing-unknown')obj.figures.find(f=>f.figureId===e.target.figureId).unknowns=[];else if(mutation==='raw')obj.callId='wrong-call';else if(mutation==='source')obj.articleId='wrong-source';else if(mutation==='oldAudit')obj.modelReview.issues=[];else obj.body.blocks[0].text+='x';
  const overlay=async (p,...args)=>resolve(p)===resolve(target.path)?Buffer.from(JSON.stringify(obj)):readFile(p,...args);let rejected=false;try{await verifyLimitedUnknownAdmission(root,e.candidate.path,{readFile:overlay});}catch{rejected=true;}check('reject input boundary:'+key+':'+mutation,rejected);
 }
}
const contract=await prepare100RepairContract(root),contractRef=await save('100-repair-contract.json',contract);
const good={translations:[{sourceBlockId:contract.targetId,text:contract.expected}],figures:[]};check('100 exact requested output permitted only as dry-run',validate100Output(good,contract));
for(const what of ['old-phrase','other-char','extra-block','extra-figure','missing-condition']){const q=structuredClone(good);if(what==='old-phrase')q.translations[0].text=contract.before;if(what==='other-char')q.translations[0].text+='。';if(what==='extra-block')q.translations.push({...q.translations[0],sourceBlockId:'b0042'});if(what==='extra-figure')q.figures.push({});if(what==='missing-condition')q.translations[0].text=q.translations[0].text.replace('（尚未被打出2张以上）','');let rejected=false;try{validate100Output(q,contract);}catch{rejected=true;}check('100 rejects:'+what,rejected);}
check('100 condition enters actual request and schema',contract.request.prompt.includes('２枚以上切れてない')&&contract.request.prompt.includes(contract.expected)&&contract.request.schema.properties.translations.items.properties.text.enum[0]===contract.expected&&contract.request.images.length===0);

// Exact alternative stager, leaving the shared stager and all previous accepted gates intact.
const base='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/textbook-processing/stage-web-textbook.mjs',original=await readFile(base,'utf8');
const originalSha=sha(original),baseDir=dirname(base);let code=original;
code=code.replace(/from (['"])(\.[^'"]+)\1/g,(_,quote,p)=>'from '+quote+pathToFileURL(resolve(baseDir,p)).href+quote);
code=code.replace("new URL('./stage-web-image.py',import.meta.url)","new URL('"+pathToFileURL(join(baseDir,'stage-web-image.py')).href+"')");
code="import {verifyLimitedUnknownAdmission} from './admission.mjs';\n"+code;
check('one original gate identity exists',code.includes("if(!['passed','passed-after-specific-input-adjudication'"));
code=code.replace("if(!['passed','passed-after-specific-input-adjudication'","if(!['"+STATUS+"','passed','passed-after-specific-input-adjudication'");
code=code.replace("if(typeof verify!=='function')throw Error('web_stage_requires_independent_gate');","if(typeof verify!=='function')throw Error('web_stage_requires_independent_gate');");
code=code.replace("if(audit.status==='passed-after-specific-input-adjudication')",`if(audit.status==='${STATUS}'&&JSON.stringify(audit)!==JSON.stringify(await verifyLimitedUnknownAdmission(processingRoot,path)))throw Error('web_stage_limited_admission_changed');\n if(audit.status==='passed-after-specific-input-adjudication')`);
code=code.replace("status:'chapter-auto-audited'",`status:audit.status==='${STATUS}'?'chapter-limited-fidelity-admitted':'chapter-auto-audited'`);
code=code.replace("status:'independently-audited-chapter-preview'",`status:audit.status==='${STATUS}'?'independent-limited-fidelity-chapter-preview':'independently-audited-chapter-preview'`);
code=code.replace('auditStatus:audit.status,','auditStatus:audit.status,...(audit.limitedUnknownFidelity?{limitedUnknownFidelity:audit.limitedUnknownFidelity,standardWholeArticlePassed:false,originalModelChecks:audit.modelChecks}:{}),');
await writeFile(join(out,'stage-limited.mjs'),code);check('shared original stage unchanged',sha(await readFile(base))===originalSha);
await mkdir(shared,{recursive:true});for(const name of ['admission.mjs','text100.mjs','stage-limited.mjs'])await copyFile(join(out,name),join(shared,name));for(const key of ['159','242'])await copyFile(join(out,'admission-'+key+'.json'),join(shared,'admission-'+key+'.json'));
const stage=await import(pathToFileURL(join(out,'stage-limited.mjs')).href),diagnostic=[];
for(const item of admitted){
 let rejected=false;try{const real=await verifyLimitedUnknownAdmission(root,item.candidate.path);await stage.stageWebTextbook({processingRoot:root,candidatePath:item.candidate.path,destination:join(shared,'invalid-stage-'+item.key),verify:async()=>({...real,limitedUnknownFidelity:{...real.limitedUnknownFidelity,displayScopeOnly:false}})});}catch{rejected=true;}check('real stage refuses fabricated scope callback:'+item.key,rejected);
 const destination=join(shared,'diagnostic-stage-'+item.key),receipt=await stage.stageWebTextbook({processingRoot:root,candidatePath:item.candidate.path,destination,verify:verifyLimitedUnknownAdmission});
 check('real isolated stage admits limited status only:'+item.key,receipt.auditStatus===STATUS&&receipt.standardWholeArticlePassed===false&&receipt.status==='independent-limited-fidelity-chapter-preview');
 const corpus=JSON.parse(await readFile(join(destination,'textbook-corpus.json'))),serialized=JSON.stringify(corpus);
 check('compiled unknown retained:'+item.key,item.unknowns.every(u=>serialized.includes(u)));
 const words=item.key==='159'?['1500','5万']:['上家的3万','也许','基本'];check('compiled author conditions retained:'+item.key,words.every(w=>serialized.includes(w)));
 diagnostic.push({key:item.key,destination,receipt,corpusSha256:sha(await readFile(join(destination,'textbook-corpus.json'))),note:'Isolated stage/compiler verification only, not master preview publication or MCP/Arena delivery.'});
}
const deps=await import(pathToFileURL(join(root,'audit/runtimes/coac244-vision-terra-max-v1-20261027/textbook-audit-verification-dependencies.mjs')).href);
const stageDependencies=await deps.collectModuleDependencyFiles(join(shared,'stage-limited.mjs'));
const files=[];for(const n of ['admission.mjs','text100.mjs','stage-limited.mjs'])files.push({path:join(shared,n),sha256:sha(await readFile(join(out,n)))});
const originalStageDependencies=(await deps.collectModuleDependencyFiles(base)).map(f=>({path:resolve(baseDir,f.name),sha256:f.sha256}));
originalStageDependencies.push({path:join(baseDir,'stage-web-image.py'),sha256:sha(await readFile(join(baseDir,'stage-web-image.py')))});
const manifestRef=await save('runtime-manifest.json',{schema:'coac244-exact-next3-admission-runtime/1',scope:'Only159/242 exact original candidates; only100 exact future repair contract.',authorizationWakeup:'01a17f47-f462-7a17-b489-dced948aa132',standardWholeArticlePassed:false,originalStage:{path:base,sha256:originalSha},files,stageDependencies,originalStageDependencies,newModelCalls:0});
for(const [path,expected]of protectedFiles)check('original bytes unchanged:'+path,sha(await readFile(path))===expected);
const verification=await save('verification.json',{passed:true,tests,count:tests.length,protectedFiles:[...protectedFiles].map(([path,sha256])=>({path,sha256})),newCalls:0,diagnosticStages:diagnostic,masterPreviewBuilt:false,formalActiveChanged:false});
await save('handoff.json',{schema:'coac244-next3-admission-and-100-contract/1',items:admitted,contract100:contractRef,manifest:manifestRef,verification,newCalls:0,newProducerOrAuditCalls:0,standardWholeArticlePassed:false,masterPreviewBuilt:false,formalActiveChanged:false,phaseBudget:handoff.budget,downstream:'COAC-250 existing run owns actual canonical assembly/MCP/Arena/master preview. This exact gate and stager can be consumed without another model or candidate edit.'});
const {readdir}=await import('node:fs/promises');for(const n of await readdir(out))if(/\.(json|mjs)$/.test(n))await copyFile(join(out,n),join(shared,n));
console.log(JSON.stringify({tests:tests.length,admitted:admitted.map(x=>x.key),diagnosticStages:diagnostic.length,newCalls:0,contract100:true}));
