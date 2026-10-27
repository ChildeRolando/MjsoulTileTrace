#!/usr/bin/env node
// COAC-269 line B batch-2 zero-call preflight: mirrors the web revision guards, plus the
// verified dual-slot entry (maker-B) and read-only evidence that production-lane.lock is untouched.
import {readFile, writeFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve, relative, isAbsolute, join} from 'node:path';

const processing='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');
const ns=join(processing,'web-production/v1/coac269-20261027');
const variant='coac269rev1';
const dictRel='web-production/v1/dictionaries/modern-accepted-tiles-c33800d79e603fff8d31dfccb7cf26b648f8f9765af7ec01e8beb0f10805ed2a.json';
const verifiedRel='audit/web/verified-assets/modern-ch01-s001-exact-42.json';
const cases=[
 {chapterId:'nemata-jp-chapter-183-1',articleId:'chapter03-section003',
  sourcePath:'web-sources/v1/modern-yabejp-ja/articles/chapter03-section003/source.v2.json',
  parentPath:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section003.display.json',
  notesPath:'audit/web/articles/modern-yabejp-ja/chapter03-section003.889adf0d0f694bc09475a5c35d83d758493e94af90c3e389dfdebfa5bf205b02.json',
  expectedParentSha:'889adf0d0f694bc09475a5c35d83d758493e94af90c3e389dfdebfa5bf205b02',
  expectedNotesSha:'c66a9bab86228f8f865d1f74b1c2d033de57f133892f87e2205480a09628373a'},
 {chapterId:'nemata-jp-chapter-131-1',articleId:'chapter01-section049',
  sourcePath:'web-sources/v1/modern-yabejp-ja/articles/chapter01-section049/source.v2.json',
  parentPath:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section049.display.json',
  notesPath:'audit/web/articles/modern-yabejp-ja/chapter01-section049.470217d79cd1acd28f234a1e691d4d950ae99d0c0463e6bd0211561c95de28ac.json',
  expectedParentSha:'470217d79cd1acd28f234a1e691d4d950ae99d0c0463e6bd0211561c95de28ac',
  expectedNotesSha:'8875bb9c2dec37ce1ca1dcc36edc24d7a04ec489ffe604d9dd610e04b77ba552'}
];
const dataPath=v=>{const p=resolve(processing,v),r=relative(processing,p);if(!r||isAbsolute(r)||r.startsWith('..'))throw Error('outside_processing:'+v);return p;};
const errors=[];
for(const path of ['STOP','web-production/v1/STOP','model-admission-stop.json'])if(existsSync(join(processing,path)))errors.push('stop_present:'+path);
// Dual-slot entry: B dispatch must go through slots.mjs maker-B, never a bypass.
const slots=join(processing,'parallel/slots.mjs');
if(!existsSync(slots))errors.push('parallel_slots_missing');
else{const s=await readFile(slots,'utf8');if(!/const MAX_MAKER_SLOTS = 2;/.test(s))errors.push('maker_slot_limit_not_2');if(/production-lane\.lock/.test(s))errors.push('slots_touch_old_lock');}
if(existsSync(join(processing,'parallel/slots/maker-B.json')))errors.push('maker_B_slot_already_live');
const lockPath=join(processing,'production-lane.lock');
if(!existsSync(lockPath))errors.push('legacy_lock_missing');
const lockStat=await stat(lockPath);const lockBytes=await readFile(lockPath);
const legacyLock={path:'production-lane.lock',sha256:sha(lockBytes),size:lockStat.size,mtime:lockStat.mtime.toISOString(),contentHex:lockBytes.toString('hex'),
 note:'read-only evidence; the dual-slot contract keeps this legacy lock untouched (not deleted, not rewritten, not released). B capacity is the maker-B slot.'};
const codex=join(process.env.APPDATA??'C:/Users/Roland/AppData/Roaming','npm','node_modules','@openai','codex','node_modules','@openai','codex-win32-x64','vendor','x86_64-pc-windows-msvc','bin','codex.exe');
if(!existsSync(codex))errors.push('codex_cli_missing');
const dictBytes=await readFile(dataPath(dictRel)),dict=JSON.parse(dictBytes);
if(dict.schema!=='coach-textbook-verified-tile-dictionary/1')errors.push('dictionary_schema');
const verifiedBytes=await readFile(dataPath(verifiedRel));
const out={schema:'coac269-web-revision-preflight/1',batch:'b3',recordedAt:new Date().toISOString(),ticket:'COAC-269',line:'B-ordinary-web-targeted-revision',variant,modelCalls:0,productionCalls:0,
 selectionRule:'current produced-needs-repair web chapters, canonical chapterId descending, existing revision entry, real parent needs-repair audit, excluding 248 reserved 198/187/199/201/215-4/236/283, passed chapters, already claimed chapters and metadata/PDF',
 excluded:{
  'nemata-jp-chapter-347-1':'current parent archive01-section008.r1.display.json audit has 0 figureChecks and 38 non-target text blocks without faithful evidence; the revision guard would reject it',
  'nemata-jp-chapter-319-1':'already passed by its r1 audit (archive01-section002.r1.display.json status passed)',
  'nemata-jp-chapter-335-1':'already passed by source-note-v2 audit (passed-after-specific-source-editorial-note)',
  'nemata-jp-chapter-232-1':'parent audit targets are not single text blocks; not revisable by the current entry',
  'nemata-jp-chapter-224-1':'parent audit targets are not single text blocks; one figure lacks faithful check',
  'nemata-jp-chapter-213-1':'parent audit targets are not single text blocks; 24 figures lack faithful checks',
  'nemata-jp-chapter-193-1':'parent audit targets are not single text blocks; 41 figures lack faithful checks'},
 slotEntry:{mechanism:'parallel/slots.mjs',owner:'COAC-269 Ticket executor',lane:'B',maxMakerSlots:2,maxLiveSlotsVerified:15,verification:'parallel/verification-20261027.json'},
 legacyLock,
 dictionary:{path:dictRel,sha256:sha(dictBytes)},verifiedAssets:{path:verifiedRel,sha256:sha(verifiedBytes)},chapters:[]};
for(const c of cases){
 const rec={chapterId:c.chapterId,articleId:c.articleId,checks:[],errors:[]};
 const fail=m=>{rec.errors.push(m);errors.push(c.chapterId+':'+m);};
 const sb=await readFile(dataPath(c.sourcePath)),s=JSON.parse(sb);
 const pb=await readFile(dataPath(c.parentPath)),p=JSON.parse(pb);
 const nb=await readFile(dataPath(c.notesPath)),n=JSON.parse(nb);
 rec.source={path:c.sourcePath,sha256:sha(sb),language:s.language,status:s.status,blocks:s.blocks.length,assets:s.assets.length};
 rec.parent={path:c.parentPath,sha256:sha(pb),schema:p.schema,textBlocks:p.body.blocks.filter(b=>b.type==='text').length,figures:p.figures.length};
 rec.notes={path:c.notesPath,sha256:sha(nb),schema:n.schema,status:n.status,recordedAt:n.recordedAt};
 if(sha(pb)!==c.expectedParentSha)fail('parent_sha_not_claimed');
 if(sha(nb)!==c.expectedNotesSha)fail('notes_sha_not_claimed');
 if(s.schema!=='coach-textbook-web-article-source/1'||s.language!=='ja')fail('source_schema_language');
 if(s.status!=='captured-not-translated-or-audited'||s.assets.some(a=>a.status!=='downloaded'))fail('source_status_assets');
 for(const b of [s.html,s.main,...s.assets]){const q=join(processing,'web-sources/v1',b.path);if(!existsSync(q)||sha(await readFile(q))!==b.sha256){fail('source_dependency:'+b.path);break;}}
 const copy={...p};delete copy.candidateSha256;
 if(sha(JSON.stringify(copy))!==p.candidateSha256)fail('parent_self_sha');
 if(p.schema!=='coach-textbook-web-article-draft/1')fail('parent_schema');
 if(p.source.sourceSha256!==sha(sb)||p.source.sourceId!==s.sourceId||p.source.articleId!==s.articleId)fail('parent_source_binding');
 if(p.body.mode!=='translated')fail('parent_body_mode');
 if(n.schema!=='coach-textbook-web-article-audit/1'||n.status!=='needs-repair')fail('notes_status');
 if(n.production.sha256!==sha(pb))fail('notes_production_binding');
 if(n.source.sourceSha256!==sha(sb))fail('notes_source_binding');
 const issues=(n.modelReview.issues??[]).filter(x=>x.severity!=='source-note');
 const textBlockIds=[...new Set(issues.map(x=>x.targetId))];
 const textBlocks=p.body.blocks.filter(b=>b.type==='text'),bc=new Map((n.modelReview.blockChecks??[]).map(x=>[x.id,x.verdict])),fc=new Map((n.modelReview.figureChecks??[]).map(x=>[x.id,x.verdict]));
 if(!textBlockIds.length)fail('no_text_targets');
 if(textBlockIds.some(id=>!textBlocks.some(b=>b.sourceBlockIds.length===1&&b.sourceBlockIds[0]===id)))fail('target_not_single_text_block');
 if(textBlocks.some(b=>!textBlockIds.includes(b.sourceBlockIds[0])&&bc.get(b.sourceBlockIds[0])!=='faithful'))fail('non_target_text_without_faithful_check');
 if(p.figures.some(f=>fc.get(f.figureId)!=='faithful'))fail('figure_without_faithful_check');
 const sourceIndex=new Map(s.blocks.map((b,i)=>[b.id,i]));
 const targets=textBlockIds.map(id=>{const b=p.body.blocks.find(x=>x.type==='text'&&x.sourceBlockIds[0]===id);const at=sourceIndex.get(id);const ctx=s.blocks.filter((x,j)=>x.paragraphId===s.blocks[at].paragraphId||Math.abs(j-at)<=2).map(x=>x.id);return{sourceBlockId:id,sourceText:b.sourceText,priorTranslation:b.text,paragraphId:b.paragraphId,contextIds:ctx};});
 const contextIds=[...new Set(targets.flatMap(t=>t.contextIds))];
 const outputPath=`web-production/v1/candidates/modern-yabejp-ja/${c.articleId}.${variant}.json`;
 if(existsSync(join(processing,outputPath)))fail('variant_output_exists');
 let dictMissing=0;for(const b of s.blocks){if(b.type!=='image-run')continue;for(const im of b.images){const a=s.assets.find(x=>x.assetId===im.assetId);if(!dict.acceptedAssets.some(e=>e.sha256===a.sha256&&e.url===a.url))dictMissing++;}}
 rec.targets=targets;rec.contextBlockIds=contextIds;rec.dictionaryUnboundImages=dictMissing;rec.outputPath=outputPath;
 rec.checks.push('source_binding','parent_self_sha','notes_binding','target_projection','non_target_faithful_blocks','all_figures_faithful','dictionary_coverage','no_existing_variant');
 out.chapters.push(rec);
}
out.ok=errors.length===0;out.errors=errors;
const fileName=`preflight-b3-${sha(JSON.stringify(out.chapters)).slice(0,16)}.json`;
await writeFile(join(ns,'preflight',fileName),JSON.stringify(out,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
console.log(JSON.stringify({ok:out.ok,errors:out.errors,receipt:`web-production/v1/coac269-20261027/preflight/${fileName}`,legacyLock,chapters:out.chapters.map(c=>({chapterId:c.chapterId,parentSha256:c.parent.sha256,notesSha256:c.notes.sha256,sourceSha256:c.source.sha256,targets:c.targets.map(t=>t.sourceBlockId),context:c.contextBlockIds.length,dictionaryUnboundImages:c.dictionaryUnboundImages,outputPath:c.outputPath,errors:c.errors}))},null,2));
process.exit(out.ok?0:1);
