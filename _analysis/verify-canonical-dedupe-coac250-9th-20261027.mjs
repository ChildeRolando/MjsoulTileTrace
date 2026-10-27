// COAC-250 ninth batch: canonical-chapter-version dedupe verification.
// The user reported that the COAC-269 second round re-made chapters that are already ingested
// (246-1 / 237-1 / 131-1) and asked for dedupe on canonical chapter id + effective latest version
// instead of candidate SHA alone. This script enumerates every candidate file per canonical
// article, resolves the effective version as "the passed candidate with the newest audit
// receipt", and compares that against what is currently ingested and what batch 9 selects.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');
const norm=p=>p.split('\\').join('/');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const pointer=await load(join(root,'integration/accepted-preview-current.json'));
const receipt=await load(join(pointer.output,'accepted-preview-receipt.json'));
const SUFFIX=/(?:\.display|\.coac269rev\d+|\.rev\d+|\.r\d+|\.source-note-v\d+|\.formal-v\d+|\.labels-v\d+|\.processing-note-v\d+)$/;
function canonical(name){let n=name.replace(/\.json$/,'');let prev;do{prev=n;n=n.replace(SUFFIX,'');}while(n!==prev);return n;}
const ingested=new Map();
for(const s of receipt.selectedWeb){const file=norm(s.candidatePath).split('/').pop();const article=canonical(file);ingested.set(article,{file,sha256:s.candidateSha256,chapterIds:s.chapterIds,auditStatus:s.auditStatus});}

const sources=['modern-yabejp-ja','79-bilibili-cn'];
const report={schema:'coac250-canonical-version-dedupe/1',recordedAt:new Date().toISOString(),modelCalls:0,productionCalls:0,
 rule:'one effective version per canonical article = the passed candidate whose audit receipt has the newest recordedAt; already-ingested chapters keep the version bound to their passed receipt',
 prior:{preview:pointer.output,chapters:receipt.chapters,units:receipt.units,selectedWeb:receipt.selectedWeb.length},articles:[]};

for(const sid of sources){
 const auditDir=join(root,'audit/web/articles',sid);
 const auditNames=new Set(await readdir(auditDir));
 const dir=join(root,'web-production/v1/candidates',sid);
 const names=(await readdir(dir)).filter(n=>n.endsWith('.json'));
 const byArticle=new Map();
 for(const n of names){const a=canonical(n);(byArticle.get(a)??byArticle.set(a,[]).get(a)).push(n);}
 for(const [article,files] of [...byArticle.entries()].sort(([a],[b])=>a.localeCompare(b))){
  if(files.length<2)continue;
  const rows=[];
  for(const file of files.sort()){
   const bytes=await readFile(join(dir,file)),h=sha(bytes);
   const auditName=article+'.'+h+'.json';
   let status=null,recordedAt=null;
   if(auditNames.has(auditName)){const a=await load(join(auditDir,auditName));status=a.status;recordedAt=a.recordedAt;}
   rows.push({file,sha256:h,auditStatus:status??'none',auditRecordedAt:recordedAt});
  }
  const passed=rows.filter(r=>r.auditStatus==='passed').sort((a,b)=>(a.auditRecordedAt<b.auditRecordedAt?1:a.auditRecordedAt>b.auditRecordedAt?-1:0));
  const effective=passed[0]??null;
  const isIngested=ingested.get(article)??null;
  for(const r of rows)r.role=r===effective?'effective-latest-passed':(isIngested&&isIngested.sha256===r.sha256?'currently-ingested':(r.auditStatus==='passed'?'superseded-passed':(r.auditStatus==='none'?'unreviewed-duplicate':'superseded-'+r.auditStatus)));
  report.articles.push({sourceId:sid,articleId:article,versions:rows,effective:effective?{file:effective.file,sha256:effective.sha256,auditRecordedAt:effective.auditRecordedAt}:null,
   ingested:isIngested?{file:isIngested.file,sha256:isIngested.sha256,chapterIds:isIngested.chapterIds}:null,
   ingestedEqualsEffective:isIngested&&effective?isIngested.sha256===effective.sha256:null,
   passedVersionCount:passed.length});
 }
}

// batch-9 scope assertions
const scope=[
 {key:'201-1',article:'chapter03-section015',expectEffective:'chapter03-section015.rev1.json',mustBeIngestedNow:false},
 {key:'338-1',article:'archive01-section006',expectEffective:'archive01-section006.coac269rev1.json',mustBeIngestedNow:false},
 {key:'273-1',article:'chapter06-exercise002-02',expectEffective:'chapter06-exercise002-02.coac269rev1.json',mustBeIngestedNow:false},
 {key:'246-1',article:'chapter06-section002',expectEffective:'chapter06-section002.rev1.json',mustBeIngestedNow:true},
 {key:'237-1',article:'chapter04-section016',expectEffective:'chapter04-section016.rev1.json',mustBeIngestedNow:true},
 {key:'131-1',article:'chapter01-section049',expectEffective:'chapter01-section049.rev1.json',mustBeIngestedNow:true},
 {key:'183-1',article:'chapter03-section003',expectEffective:null,mustBeIngestedNow:false}
];
report.scopeChecks=[];
for(const s of scope){
 const a=report.articles.find(x=>x.articleId===s.article);
 const effectiveFile=a?a.effective?.file??null:null;
 const ing=ingested.get(s.article)??null;
 const checks={effectiveLatestPassedIs:s.expectEffective===null?(a?a.passedVersionCount===0:false):effectiveFile===s.expectEffective};
 if(s.mustBeIngestedNow){checks.stillIngestedAtEffective=!!ing&&!!a&&ing.sha256===a.effective?.sha256;checks.duplicateDoesNotDisplaceOriginal=!!ing&&a.versions.some(v=>v.sha256===ing.sha256&&v.role==='currently-ingested'||v.sha256===ing.sha256&&v.role==='effective-latest-passed');}
 else checks.notYetIngested=!ing;
 if(s.expectEffective===null)checks.duplicateHasNoPassedReceipt=a?a.versions.every(v=>v.auditStatus!=='passed'):false;
 report.scopeChecks.push({key:s.key,articleId:s.article,effectiveFile,effectiveSha256:a?.effective?.sha256??null,passedVersionCount:a?a.passedVersionCount:null,ingestedFile:ing?.file??null,checks,allChecksPassed:Object.values(checks).every(Boolean)});
}
report.allScopeChecksPassed=report.scopeChecks.every(s=>s.allChecksPassed);
report.canonicalArticlesWithMultipleVersions=report.articles.length;
report.ingestedNotEffective=report.articles.filter(a=>a.ingested&&a.ingestedEqualsEffective===false).map(a=>({articleId:a.articleId,ingested:a.ingested.file,effective:a.effective?.file,ingestedSha:a.ingested.sha256.slice(0,16),effectiveSha:a.effective?.sha256.slice(0,16)}));
await writeFile('_analysis/coac250-9th-batch-canonical-dedupe-20261027.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({allScopeChecksPassed:report.allScopeChecksPassed,scopeChecks:report.scopeChecks,canonicalArticlesWithMultipleVersions:report.canonicalArticlesWithMultipleVersions,ingestedNotEffective:report.ingestedNotEffective,articles:report.articles.map(a=>({a:a.articleId,versions:a.versions.map(v=>v.file+':'+v.auditStatus+':'+v.role.slice(0,18)),eff:a.effective?.file,ing:a.ingested?.file}))},null,1));
