// COAC-250 tenth batch, second builder fix: the webCandidateDedupe inventory added in the ninth
// batch looked only at the base receipt <article>.<sha>.json. A candidate whose effective receipt
// is a bound retry of a voided/failed call (199-1/chapter03-section013.rev1) therefore showed
// "superseded-failed" with no effective version, contradicting the receipt's own selectedWeb entry.
// This mirrors textbook-audit-web.mjs latestWebAuditReceipt: a failed base receipt is superseded by
// a .retry- receipt only when retry.retryOfAudit binds the immediately prior receipt (path + sha).
import {readFileSync,writeFileSync,renameSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='E:/AgentData/Coach/knowledge/processing/integration/';
const sha=b=>createHash('sha256').update(b).digest('hex');
const p=dir+'build-accepted-preview.mjs',t=dir+'build-accepted-preview.mjs.tmp-v11b',backup=dir+'build-accepted-preview.before-v11-dedupe-retry-20261027.mjs';
const before=readFileSync(p);
let s=before.toString('utf8');
const oldLine='for(const [a,fs] of [...byCanon.entries()].sort(([x],[y])=>x.localeCompare(y))){if(fs.length<2)continue;const rows=[];for(const f of [...fs].sort()){const b=await readFile(join(dir,f)),h=sha(b);let status=null,recordedAt=null;try{const au=JSON.parse(await readFile(join(root,\'audit/web/articles\',sid,a+\'.\'+h+\'.json\'),\'utf8\'));status=au.status;recordedAt=au.recordedAt;}catch(error){if(error.code!==\'ENOENT\')throw error;}rows.push({file:f,sha256:h,auditStatus:status??\'none\',auditRecordedAt:recordedAt});}const passed=rows.filter(r=>r.auditStatus===\'passed\').sort((x,y)=>(x.auditRecordedAt<y.auditRecordedAt?1:x.auditRecordedAt>y.auditRecordedAt?-1:0));const effective=passed[0]??null;for(const r of rows)r.role=r===effective?\'effective-latest-passed\':(r.auditStatus===\'passed\'?\'superseded-passed\':(r.auditStatus===\'none\'?\'unreviewed-duplicate\':\'superseded-\'+r.auditStatus));dedupeArticles.push({sourceId:sid,articleId:a,versions:rows,effective:effective?{file:effective.file,sha256:effective.sha256,auditRecordedAt:effective.auditRecordedAt}:null});}';
const newLines=[
'const artDir=join(root,\'audit/web/articles\',sid),artNames=await readdir(artDir).catch(error=>{if(error.code===\'ENOENT\')return [];throw error;});',
'const slash=p=>p.split(String.fromCharCode(92)).join(\'/\');',
'for(const [a,fs] of [...byCanon.entries()].sort(([x],[y])=>x.localeCompare(y))){if(fs.length<2)continue;const rows=[];for(const f of [...fs].sort()){const b=await readFile(join(dir,f)),h=sha(b);const chain=artNames.filter(n=>n===a+\'.\'+h+\'.json\'||(n.startsWith(a+\'.\'+h+\'.retry-\')&&n.endsWith(\'.json\')&&!n.endsWith(\'.transport-recovery.json\'))).sort();let prior=null;for(const n of chain){const rb=await readFile(join(artDir,n)),rec=JSON.parse(rb);if(!prior){prior={name:n,receipt:rec,sha256:sha(rb)};continue;}const r=rec.retryOfAudit;if(!r||prior.receipt.status!==\'failed\'||!slash(String(r.path)).endsWith(\'/audit/web/articles/\'+sid+\'/\'+prior.name)||r.sha256!==prior.sha256)continue;prior={name:n,receipt:rec,sha256:sha(rb)};}const status=prior?prior.receipt.status:\'none\',recordedAt=prior?prior.receipt.recordedAt:null;rows.push({file:f,sha256:h,auditStatus:status,auditRecordedAt:recordedAt,effectiveReceiptPath:prior?\'audit/web/articles/\'+sid+\'/\'+prior.name:null,receiptChainLength:chain.length});}const passed=rows.filter(r=>r.auditStatus===\'passed\').sort((x,y)=>(x.auditRecordedAt<y.auditRecordedAt?1:x.auditRecordedAt>y.auditRecordedAt?-1:0));const effective=passed[0]??null;for(const r of rows)r.role=r===effective?\'effective-latest-passed\':(r.auditStatus===\'passed\'?\'superseded-passed\':(r.auditStatus===\'none\'?\'unreviewed-duplicate\':\'superseded-\'+r.auditStatus));dedupeArticles.push({sourceId:sid,articleId:a,versions:rows,effective:effective?{file:effective.file,sha256:effective.sha256,auditRecordedAt:effective.auditRecordedAt}:null});}'
].join('\n ');
if(s.split(oldLine).length!==2)throw new Error('dedupe anchor count '+(s.split(oldLine).length-1));
copyFileSync(p,backup);
s=s.split(oldLine).join(newLines);
writeFileSync(t,s);
renameSync(t,p);
console.log(JSON.stringify({builder:{path:p,sha256Before:sha(before),sha256After:sha(readFileSync(p)),backupPath:backup,backupSha256:sha(readFileSync(backup))},change:'webCandidateDedupe resolves bound retry receipts instead of reading only the base receipt'}));
