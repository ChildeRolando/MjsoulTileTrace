#!/usr/bin/env node
// COAC-269 line B zero-call preflight: mirrors textbook-production-web.mjs revision guards.
import {readFile, writeFile} from 'node:fs/promises';
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
 {chapterId:'nemata-jp-chapter-338-1',articleId:'archive01-section006',
  sourcePath:'web-sources/v1/modern-yabejp-ja/articles/archive01-section006/source.json',
  parentPath:'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.display.json',
  notesPath:'audit/web/articles/modern-yabejp-ja/archive01-section006.04ab76405f88fa1df61d68c2047cf3cb344b8db8644f193c520fee805b83c427.json',
  expectedParentSha:'04ab76405f88fa1df61d68c2047cf3cb344b8db8644f193c520fee805b83c427',
  expectedNotesSha:'6d41a520affd04f57c515e02d37ef58746e88794149f385d701a9814c0be5597'},
 {chapterId:'nemata-jp-chapter-273-1',articleId:'chapter06-exercise002-02',
  sourcePath:'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise002-02/source.json',
  parentPath:'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.display.json',
  notesPath:'audit/web/articles/modern-yabejp-ja/chapter06-exercise002-02.c57c30e4ffddb9ea661295364ee46739438c2c17a4f4c772e5df0b8391c7576b.json',
  expectedParentSha:'c57c30e4ffddb9ea661295364ee46739438c2c17a4f4c772e5df0b8391c7576b',
  expectedNotesSha:'3aa7dc1d73dbcf0caa710ca8a46799f69178435113c289ab53a8c4f44d9dd270'}
];
const dataPath=v=>{const p=resolve(processing,v),r=relative(processing,p);if(!r||isAbsolute(r)||r.startsWith('..'))throw Error('outside_processing:'+v);return p;};
const errors=[];
for(const path of ['STOP','web-production/v1/STOP','model-admission-stop.json'])if(existsSync(join(processing,path)))errors.push('stop_present:'+path);
if(!existsSync(join(processing,'production-lane.lock')))errors.push('maker_lane_lock_missing');
const codex=join(process.env.APPDATA??'C:/Users/Roland/AppData/Roaming','npm','node_modules','@openai','codex','node_modules','@openai','codex-win32-x64','vendor','x86_64-pc-windows-msvc','bin','codex.exe');
if(!existsSync(codex))errors.push('codex_cli_missing');
const dictBytes=await readFile(dataPath(dictRel)),dict=JSON.parse(dictBytes);
if(dict.schema!=='coach-textbook-verified-tile-dictionary/1')errors.push('dictionary_schema');
const verifiedBytes=await readFile(dataPath(verifiedRel));
const out={schema:'coac269-web-revision-preflight/1',recordedAt:new Date().toISOString(),ticket:'COAC-269',line:'B-ordinary-web-targeted-revision',variant,modelCalls:0,productionCalls:0,
 selectionRule:'current produced-needs-repair web chapters, canonical chapterId descending, existing revision entry, real parent needs-repair audit, excluding 248 in-flight/reserved and terminal-passed',
 excluded:{
  'nemata-jp-chapter-347-1':'parent audit has no figureChecks; current revision guard rejects all 27 non-target figures',
  'nemata-jp-chapter-283-1':'reserved by 248',
  'nemata-jp-chapter-236-1':'reserved by 248',
  'nemata-jp-chapter-215-4':'reserved by 248',
  'nemata-jp-chapter-198-1':'248 passed 2026-10-27T09:15Z',
  'nemata-jp-chapter-187-1':'248 passed 2026-10-27T09:20Z',
  'nemata-jp-chapter-199-1':'reserved by 248',
  'nemata-jp-chapter-201-1':'reserved by 248',
  'nemata-jp-chapter-001-64':'metadata/cover',
  'nemata-jp-chapter-250-1':'metadata',
  'nemata-jp-chapter-317-51':'metadata',
  '79-cn-chapter-215-4':'reserved by 248',
  '79-cn-chapter-201-6':'reserved number 201',
  '79-cn-chapter-311-18':'below selected canonical order; not in this 2-chapter batch'},
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
 rec.targets=targets;rec.contextBlockIds=contextIds;rec.dictionaryUnboundImages=dictMissing;rec.visualInputs=[];rec.outputPath=outputPath;
 rec.checks.push('source_binding','parent_self_sha','notes_binding','target_projection','non_target_faithful_blocks','all_figures_faithful','dictionary_coverage','no_existing_variant');
 out.chapters.push(rec);
}
out.ok=errors.length===0;out.errors=errors;
const fileName=`preflight-${sha(JSON.stringify(out.chapters)).slice(0,16)}.json`;
await writeFile(join(ns,'preflight',fileName),JSON.stringify(out,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
console.log(JSON.stringify({ok:out.ok,errors:out.errors,receipt:`web-production/v1/coac269-20261027/preflight/${fileName}`,chapters:out.chapters.map(c=>({chapterId:c.chapterId,parentSha256:c.parent.sha256,notesSha256:c.notes.sha256,sourceSha256:c.source.sha256,targets:c.targets.map(t=>t.sourceBlockId),context:c.contextBlockIds.length,outputPath:c.outputPath,errors:c.errors}))},null,2));
process.exit(out.ok?0:1);
