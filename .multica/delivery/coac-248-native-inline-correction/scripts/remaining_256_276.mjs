// Read-only reconciliation of the existing 244 pool; never opens a new pool.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,isAbsolute} from 'node:path';
import {verifyWebRevisionContent} from 'file:///E:/AgentData/Coach/knowledge/processing/audit/runtimes/web-b8-transport-diag-20261027/textbook-audit-web.mjs';
const root='E:/AgentData/Coach/knowledge/processing',local=new URL('../',import.meta.url);
const sha=b=>createHash('sha256').update(b).digest('hex');
const abs=p=>isAbsolute(p)?p:join(root,p);
const read=async p=>{const bytes=await readFile(abs(p));return {path:p,sha256:sha(bytes),data:JSON.parse(bytes)};};
const prior=await read('parallel/next-batch-20261027T1135/classification-remaining-38.json');
const register=await read('integration/coac250-unified-chapter-register-20261027b.json');
const preview=await read('integration/accepted-preview-current.json');
const rows=[],outside=[],newBatch=[];
for(const key of ['256-18','276-4']){
 try{const e=JSON.parse(await readFile(new URL(`receipt-web${key}.rev1-awaiting-review.json`,local),'utf8'));
  newBatch.push({chapterId:e.chapterId,candidateSha256:e.candidateSha256,status:e.status,
   additionalUnknowns:e.changes.flatMap(x=>x.fields.filter(f=>f.field==='unknowns')),semanticAcceptance:null});
 }catch(e){if(e.code!=='ENOENT')throw e;}
}
try{const f=JSON.parse(await readFile(new URL('receipt-web276-4.rev1-failed.json',local),'utf8'));
 newBatch.push({chapterId:f.chapterId,candidateSha256:null,status:'failed-no-output-no-retry',callId:f.call.callId,usage:null,semanticAcceptance:null});
}catch(e){if(e.code!=='ENOENT')throw e;}
for(const row of register.data.rows.filter(r=>!r.covered)){
 const old=prior.data.rows.find(x=>x.chapterId===row.chapterId);if(!old){outside.push(row.chapterId);continue;}
 const result={chapterId:row.chapterId,title:row.title,priorCategory:old.category,covered:false,registerVerdict:row.verdict,
  category:old.category,existingEntryResult:null,parent:null,notes:null,source:null,recordedBoundPasses:[],candidates:[],
  permission:'Summary only; no new production/adjudication/review authorized by this record'};
 if(old.category==='figure-targeted-executable')result.category=['79-cn-chapter-157-11','79-cn-chapter-205-5'].includes(row.chapterId)?'B-owned-excluded':'A-revision-handed-to-249-or-current-batch';
 if(newBatch.some(x=>x.chapterId===row.chapterId&&x.status==='failed-no-output-no-retry'))result.category='A-current-batch-failed-no-output-no-retry';
 const cp=row.existingCandidate;
 if(cp?.path){
  try{
   const parent=await read(cp.path),p=parent.data,notes=cp.auditPath?await read(cp.auditPath):null;
   const source=await read(p.source.sourcePath);
   result.parent={path:cp.path,sha256:parent.sha256,registerShaMatches:parent.sha256===cp.sha256,bodyMode:p.body.mode};
   result.source={path:p.source.sourcePath,sha256:source.sha256,parentSourceMatches:source.sha256===p.source.sourceSha256};
   if(notes){
    const n=notes.data,review=n.effectiveModelReview??n.modelReview;
    result.notes={path:cp.auditPath,sha256:notes.sha256,status:n.status,parentBound:n.production?.sha256===parent.sha256,
     sourceBound:n.source?.sourceSha256===source.sha256,completeArticleCompared:review?.completeArticleCompared??null,
     errorIssues:review?.issues?.filter(x=>x.severity==='error')??[],uncertainIssues:review?.issues?.filter(x=>x.severity==='uncertain')??[],
     nonRepresentedImages:review?.imageChecks?.filter(x=>x.disposition!=='represented')??[],
     missingReviewFields:['completeArticleCompared','domOrder','issues','blockChecks','figureChecks','imageChecks'].filter(k=>review?.[k]===undefined)};
    if(old.category==='parent-evidence-or-adjudication'){
     const targets=[...new Set(result.notes.errorIssues.map(x=>x.targetId))],figures=targets.filter(id=>p.figures.some(f=>f.figureId===id)),texts=targets.filter(id=>!figures.includes(id));
     if(!targets.length)result.existingEntryResult={passed:false,error:'parent-audit-declares-no-error-target'};
     else {const probe=structuredClone(p);probe.provenance.revision={parentPath:cp.path,parentSha256:parent.sha256,notesPath:cp.auditPath,notesSha256:notes.sha256,figureIds:figures,textBlockIds:texts};
      try{verifyWebRevisionContent(probe,p,n);result.existingEntryResult={passed:true,targets,semanticAcceptance:null};result.category='existing-scope-check-now-passes-no-production-authorization';}
      catch(e){result.existingEntryResult={passed:false,error:e.message,figureTargets:figures,textTargets:texts};}}
    }
   }
   const dir=join(root,'web-production/v1/candidates',p.source.sourceId),names=(await readdir(dir)).filter(n=>n.startsWith(p.source.articleId+'.')&&n.endsWith('.json'));
   for(const name of names){const path=join(dir,name),candidate=await read(path);result.candidates.push({path,sha256:candidate.sha256,currentSourceBound:candidate.data.source?.sourceSha256===source.sha256});}
   const ad=join(root,'audit/web/articles',p.source.sourceId),an=(await readdir(ad)).filter(n=>n.startsWith(p.source.articleId+'.')&&n.endsWith('.json'));
   for(const name of an){const receipt=await read(join(ad,name)),a=receipt.data;if(!a.status?.startsWith('passed')||a.source?.sourceSha256!==source.sha256)continue;
    try{const candidate=await read(a.production.path);if(candidate.sha256===a.production.sha256)result.recordedBoundPasses.push({auditPath:receipt.path,auditSha256:receipt.sha256,status:a.status,candidatePath:a.production.path,candidateSha256:candidate.sha256,meaning:'Existing passed record with unchanged current-source/candidate bytes; not a new semantic audit'});}catch{}}
   if(result.recordedBoundPasses.length)result.category='recorded-current-source-pass-awaiting-integration-reconciliation';
  }catch(e){result.readError=e.message;}
 }else result.pdfRoute=row.pdfRoute;
 rows.push(result);
}
const counts={};for(const r of rows)counts[r.category]=(counts[r.category]??0)+1;
const record={schema:'coac248-existing-pool-remaining-source-parent-summary/1',recordedAt:new Date().toISOString(),modelCalls:0,
 basis:{preview:{path:preview.path,sha256:preview.sha256,output:preview.data.output,chapters:preview.data.chapters},register:{path:register.path,sha256:register.sha256},prior:{path:prior.path,sha256:prior.sha256}},
 uncoveredOriginalChapters:register.data.rows.filter(r=>!r.covered).length,counts,outsideExistingPool:outside,rows,newBatch,
 conclusion:'No automatic v3 expansion or bulk production. Existing source/parent disputes require exact owner evidence or a separately authorized narrow gate change; none is inferred here. B 157/205 and prior A 222/246 are excluded from this production batch.'};
await writeFile(new URL('remaining-source-parent-256-276-20261027.json',local),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({uncovered:record.uncoveredOriginalChapters,counts,outside,entryResults:rows.filter(x=>x.existingEntryResult).map(x=>({chapter:x.chapterId,...x.existingEntryResult}))}));
