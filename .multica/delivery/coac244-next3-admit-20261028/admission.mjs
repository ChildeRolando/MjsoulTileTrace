// Only the two immutable candidate/source/call tuples below may enter this scoped display gate.
import {readFile as fsRead} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const STATUS='accepted-for-specific-limited-unknown-fidelity';
export const EXACT={
 '159':{candidate:'5f2555f1ad90b99581f054974c7bc29b6536896926cc7c33a3f9574cf51c3373',source:'a007bfceffd854f07ce1780474a74cff32b0c7837b39c822c5392df5bd681cf7',evidence:'86bc78028f01c2fd7a277f0c2de1ce5fb2cbf51aff72ba00376fc5e7e0c178ba',call:'50eb7aaf-2b54-410c-b41b-b11059eae75f',raw:'12e1b8c6c7e88b3474b2a6a8aa2d56a27a62e64d9c3a5b36a396c365c94177bf',bbox:[298,126,324,161],figure:'79-bilibili-cn:cv1751292:b0013:figure'},
 '242':{candidate:'62987619296c7f7ef775b41967e69f84802a17c08146df9ffd436f51f84b19aa',source:'3cac4b7103309b092edada33aa8f698b606aa283ae1ce18f8ce9ba9e8428f6e0',evidence:'8af5dfab278fb5a6da46c571f68d6a6a034bf025677842e955530ef3cc769436',call:'d98dff34-cf8b-4341-8d00-37a31a1e0db8',raw:'5dfef83403e9f6221a035a3a584166f12bea2a210b50b91563f8014844ad3074',bbox:[177,144,202,177],figure:'79-bilibili-cn:cv1780438:b0014:figure'}
};
export function checkIndependentLimitedConclusion(m,x){
 if(m?.location?.status!=='confirmed'||!same(m.location.originalBBox,x.bbox))throw Error('limited_wrong_location');
 if(m?.reading?.status!=='unknown'||m.reading.tileCode!=='unknown')throw Error('limited_wrong_reading_scope');
 if(m.conclusion!=='limited-unknown-acceptable'||m.completeTargetScopeCompared!==true||m.currentUnknownDisplay?.faithful!==true)throw Error('limited_independent_permission_missing');
 if(!Array.isArray(m.propositions)||!m.propositions.length||m.propositions.some(p=>p.faithfulWithUnknown!==true||!['no','uncertain'].includes(p.dependsOnExactTile)||!p.neededLimitation?.trim()))throw Error('limited_author_fidelity_or_exact_dependency');
 if(!Array.isArray(m.currentUnknownDisplay.requiredDisplayLimitations)||!m.minimumRequiredAction?.trim())throw Error('limited_missing_limits');
 return true;
}
export async function verifyLimitedUnknownAdmission(root,candidatePath,{readFile=fsRead}={}){
 const need=(ok,id)=>{if(!ok)throw Error('limited_admission_'+id);};
 const bound=async ref=>{const p=isAbsolute(ref.path)?ref.path:join(root,ref.path),b=await readFile(p);need(sha(b)===ref.sha256,'bound_sha:'+p);return JSON.parse(b);};
 const bytes=await readFile(resolve(root,candidatePath)),digest=sha(bytes),key=Object.keys(EXACT).find(k=>EXACT[k].candidate===digest);need(key,'wrong_candidate_sha');
 const x=EXACT[key],evidencePath=join(root,'integration/coac249-next3-'+key+'-limited-fidelity-evidence-20261028.json');
 const evidenceRef={path:evidencePath,sha256:x.evidence},e=await bound(evidenceRef);
 const h=JSON.parse(await readFile(join(root,'integration/coac249-next3-'+key+'-reviewed-20261028.json')));
 need(e.candidate.sha256===digest&&e.source.sha256===x.source&&e.target.figureId===x.figure&&same(e.target.bbox,x.bbox)&&e.independentCall.callId===x.call&&e.raw.sha256===x.raw,'fixed_tuple');
 const c=JSON.parse(bytes),s=await bound(e.source),old=await bound(e.oldAudit),raw=await bound(e.raw),envelope=await bound(e.originalConsumerReceipt),req=await bound(h.request);
 need(c.source.sourceSha256===x.source&&old.production.sha256===digest&&old.source.sourceSha256===x.source,'source_and_parent_identity');
 need(raw.callId===x.call&&raw.success&&raw.exitCode===0&&!raw.timedOut&&same(raw.output,envelope.modelReview)&&same(raw.output,JSON.parse(raw.rawLastMessage)),'real_raw_and_receipt');
 need(envelope.status==='needs-repair'&&envelope.checks.limitedOkay===false&&e.originalConsumerReceipt.limitedOkay===false&&e.standardWholeArticlePassed===false&&e.chapterAccepted===false,'false_history_preserved');
 need(raw.prompt===req.prompt&&same(raw.schema,req.schema)&&same(req.images,raw.requestExecution.images.map(i=>i.path)),'real_request');
 need(raw.binding.productionSha256===digest&&raw.binding.sourceFileSha256===x.source&&raw.binding.originalAuditSha256===e.oldAudit.sha256&&raw.binding.targetFigureId===x.figure&&same(raw.binding.targetBBox,x.bbox),'raw_binding');
 const ex=raw.requestExecution;need(ex.model==='gpt-6.1-terra'&&ex.reasoningEffort==='max'&&ex.images.length===5&&ex.args.filter(v=>v==='-i').length===5&&ex.args[ex.args.indexOf('--model')+1]===ex.model&&ex.args.includes('model_reasoning_effort="max"'),'actual_cli');
 for(const i of ex.images)need(sha(await readFile(i.path))===i.sha256,'actual_image');
 checkIndependentLimitedConclusion(raw.output,x);
 need(e.currentDisplayFaithful===true&&e.allCitedAuthorContributionsFaithfulWithUnknown===true&&e.independentModelConclusion===raw.output.conclusion&&same(e.dependenciesStillUncertain,raw.output.propositions.filter(p=>p.dependsOnExactTile==='uncertain'))&&same(e.requiredLimitations,raw.output.currentUnknownDisplay.requiredDisplayLimitations),'uncertain_and_limits_unchanged');
 const f=c.figures.find(f=>f.figureId===x.figure),targetBlock=x.figure.replace(/:figure$/,'');
 need(f&&f.unknowns.length>0&&same(f.unknowns,e.existingUnknowns)&&(/无法|未知|\?m/.test(f.transcription)),'explicit_unknown_preserved');
 need(old.modelReview.domOrder.faithful===true&&old.modelReview.blockChecks.every(z=>z.verdict==='faithful'||z.id===targetBlock&&z.verdict==='uncertain')&&old.modelReview.figureChecks.every(z=>z.verdict==='faithful'||z.id===x.figure&&z.verdict==='uncertain')&&old.modelReview.imageChecks.every(z=>z.disposition==='represented')&&old.modelReview.issues.every(i=>i.severity==='source-note'||i.severity==='uncertain'&&[x.figure,targetBlock].includes(i.targetId)),'all_non_target_parent_scope');
 for(const p of raw.output.propositions)for(const id of p.sourceBlockIds)need(s.blocks.some(b=>b.id===id)&&c.body.blocks.some(b=>b.sourceBlockIds.includes(id)),'author_contribution_source');
 const ledger=(await readFile(join(root,'audit/calls.jsonl'))).toString().split(/\r?\n/).filter(Boolean).map(JSON.parse);
 need(ledger.filter(c=>c.callId===x.call).length===1&&ledger.filter(c=>c.callId===old.calls[0].callId).length===1,'real_unique_ledger');
 const priorRaw=JSON.parse(await readFile(join(root,'audit/calls',old.calls[0].callId+'.json')));
 need(priorRaw.success&&priorRaw.exitCode===0&&same(priorRaw.output,old.modelReview)&&priorRaw.binding.productionSha256===digest&&priorRaw.binding.sourceFileSha256===x.source,'original_independent_parent_raw');
 const runtime=join(root,'audit/runtimes/coac244-vision-terra-max-v1-20261027'),mbytes=await readFile(join(runtime,'runtime-manifest.json'));
 need(sha(mbytes)==='12a058d48014dbe52b3bdd8257282e159754047861be5e8fc1489d06a4e3d7c6','vision_manifest');for(const f of JSON.parse(mbytes).files)need(sha(await readFile(join(runtime,f.path)))===f.sha256,'frozen_dependency');
 const mod=await import(pathToFileURL(join(runtime,'textbook-audit-web.mjs')).href);
 await mod.assertWebReuseNotExcluded(root,resolve(root,candidatePath),digest);
 const production=await mod.verifyWebProductionCall(root,c),presentation=await mod.verifyWebPresentations(root,c);
 need(same(production,old.productionCall)&&same(presentation,old.presentation??null),'real_production_and_presentation');
 return {schema:'coac244-exact-limited-unknown-admission/1',status:STATUS,production:{path:resolve(root,candidatePath),sha256:digest},source:c.source,auditPath:join(root,'integration/coac244-next3-admit-20261028/admission-'+key+'.json'),originalAudit:e.oldAudit,modelChecks:old.modelChecks,modelReview:old.modelReview,calls:[e.independentCall],inheritedCalls:old.calls,standardWholeArticlePassed:false,limitedUnknownFidelity:{authorization:'01a17f47-f462-7a17-b489-dced948aa132',canonical:e.canonical,evidence:evidenceRef,raw:e.raw,originalConsumerReceipt:e.originalConsumerReceipt,originalConsumerLimitedOkay:false,originalSemanticCompleteness:old.modelReview.semanticCompleteness,independentConclusion:raw.output.conclusion,rawModelFieldsUnchanged:true,unknowns:f.unknowns,originalBBox:x.bbox,dependenciesStillUncertain:e.dependenciesStillUncertain,requiredLimitations:e.requiredLimitations,minimumRequiredAction:e.minimumRequiredAction,nonTargetParentScopeInherited:true,displayScopeOnly:true,scope:e.scope,newModelCalls:0}};
}
