// COAC-250 ninth batch: patch integration/build-accepted-preview.mjs
// (1) move the builder pin from selection v9 to v10 (path + sha)
// (2) key the flat candidate scan by canonical chapter id and rank versions explicitly, so a
//     duplicate draft file (e.g. chapter06-section002.coac269rev1.json) can never be staged as a
//     second pseudo-article of a chapter that already has its own passed version
// (3) record webCandidateDedupe in the preview receipt: per canonical article, every candidate
//     version with its audit status, which one was selected, and which are superseded
import {readFileSync,writeFileSync,renameSync,copyFileSync} from 'node:fs';
const dir='E:/AgentData/Coach/knowledge/processing/integration/';
const p=dir+'build-accepted-preview.mjs',t=dir+'build-accepted-preview.mjs.tmp-v10',backup=dir+'build-accepted-preview.before-v10-20261027.mjs';
let s=readFileSync(p,'utf8');
const from='specific-web-variant-selection.v9.json',to='specific-web-variant-selection.v10.json';
const oldPin='10db28df45d476d9364051413cd45f8fb1e87b0160f6298130bad280d2e609c4';
const newPin='901cd88fde29f0adc373a2eab441b4fb8a0512893a0c027b8180ee9655572198';
const scanAnchor='for(const name of names.filter(n=>n.endsWith(\'.json\')&&!/\\.r(?:ev)?\\d+(?:\\.display)?\\.json$/.test(n))){if(/\\.(?:formal-v|labels-v|source-note-v|processing-note-v)\\d+/.test(name))continue;const article=name.replace(/(?:\\.display)?\\.json$/,\'\');if(!selected.has(article)||name.endsWith(\'.display.json\'))selected.set(article,name);}';
const scanReplacement=[
'const canon=n=>{let v=n.replace(/\\.json$/,\'\');for(;;){const w=v.replace(/\\.(?:display|coac269rev\\d+|rev\\d+|r\\d+)$/,\'\');if(w===v)return v;v=w;}};',
'const versionRank=n=>n.endsWith(\'.display.json\')?3:((/\\.(?:coac269rev|rev|r)\\d+\\.json$/.test(n))?1:2);',
'for(const name of names.filter(n=>n.endsWith(\'.json\')&&!/\\.r(?:ev)?\\d+(?:\\.display)?\\.json$/.test(n))){if(/\\.(?:formal-v|labels-v|source-note-v|processing-note-v)\\d+/.test(name))continue;const article=canon(name),prior=selected.get(article);if(!prior||versionRank(name)>versionRank(prior))selected.set(article,name);}',
'const byCanon=new Map();for(const name of names){const a=canon(name);if(!byCanon.has(a))byCanon.set(a,[]);byCanon.get(a).push(name);}',
'for(const [a,fs] of [...byCanon.entries()].sort(([x],[y])=>x.localeCompare(y))){if(fs.length<2)continue;const rows=[];for(const f of [...fs].sort()){const b=await readFile(join(dir,f)),h=sha(b);let status=null,recordedAt=null;try{const au=JSON.parse(await readFile(join(root,\'audit/web/articles\',sid,a+\'.\'+h+\'.json\'),\'utf8\'));status=au.status;recordedAt=au.recordedAt;}catch(error){if(error.code!==\'ENOENT\')throw error;}rows.push({file:f,sha256:h,auditStatus:status??\'none\',auditRecordedAt:recordedAt});}const passed=rows.filter(r=>r.auditStatus===\'passed\').sort((x,y)=>(x.auditRecordedAt<y.auditRecordedAt?1:x.auditRecordedAt>y.auditRecordedAt?-1:0));const effective=passed[0]??null;for(const r of rows)r.role=r===effective?\'effective-latest-passed\':(r.auditStatus===\'passed\'?\'superseded-passed\':(r.auditStatus===\'none\'?\'unreviewed-duplicate\':\'superseded-\'+r.auditStatus));dedupeArticles.push({sourceId:sid,articleId:a,versions:rows,effective:effective?{file:effective.file,sha256:effective.sha256,auditRecordedAt:effective.auditRecordedAt}:null});}'
].join('\n ');
if(s.split(from).length!==2)throw new Error('selection path anchor count '+(s.split(from).length-1));
if(s.split(oldPin).length!==2)throw new Error('pin anchor count '+(s.split(oldPin).length-1));
if(s.split(scanAnchor).length!==2)throw new Error('scan anchor count '+(s.split(scanAnchor).length-1));
if(s.split('const selections=[],pending=[],formalReplacements=[];').length!==2)throw new Error('decl anchor count');
if(s.split('webAdditions:additions?').length!==2)throw new Error('receipt anchor count');
copyFileSync(p,backup);
s=s.split(from).join(to).split(oldPin).join(newPin);
s=s.split(scanAnchor).join(scanReplacement);
s=s.replace('const selections=[],pending=[],formalReplacements=[];','const dedupeArticles=[],selections=[],pending=[],formalReplacements=[];');
s=s.replace('webAdditions:additions?','webCandidateDedupe:{rule:\'one effective version per canonical article id = the passed candidate whose audit receipt has the newest recordedAt; staging always uses the explicit selection entry for that canonical article, never a duplicate draft file\',articles:dedupeArticles},webAdditions:additions?');
writeFileSync(t,s);
renameSync(t,p);
console.log(JSON.stringify({backup,patched:true}));
