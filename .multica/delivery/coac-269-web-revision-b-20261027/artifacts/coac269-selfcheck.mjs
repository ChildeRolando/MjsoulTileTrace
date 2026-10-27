#!/usr/bin/env node
// COAC-269 line B zero-call self-check of produced revisions (not the independent audit).
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const R='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');
const cases=[
 {chapterId:'nemata-jp-chapter-338-1',articleId:'archive01-section006',
  parent:'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.display.json',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.coac269rev1.json',
  notes:'audit/web/articles/modern-yabejp-ja/archive01-section006.04ab76405f88fa1df61d68c2047cf3cb344b8db8644f193c520fee805b83c427.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/archive01-section006/source.json',
  receipt:'web-production/v1/coac269-20261027/receipts/production-a0e44374eb53c101.json'},
 {chapterId:'nemata-jp-chapter-273-1',articleId:'chapter06-exercise002-02',
  parent:'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.display.json',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.coac269rev1.json',
  notes:'audit/web/articles/modern-yabejp-ja/chapter06-exercise002-02.c57c30e4ffddb9ea661295364ee46739438c2c17a4f4c772e5df0b8391c7576b.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise002-02/source.json',
  receipt:'web-production/v1/coac269-20261027/receipts/production-7daef3a1b8dd2de9.json'}
];
const out={schema:'coac269-revision-selfcheck/1',ticket:'COAC-269',recordedAt:new Date().toISOString(),modelCalls:0,chapters:[],errors:[]};
for(const c of cases){
 const rec={chapterId:c.chapterId};
 const fail=m=>{rec.errors=(rec.errors||[]);rec.errors.push(m);out.errors.push(c.chapterId+':'+m);};
 const cb=await readFile(join(R,c.candidate)),cand=JSON.parse(cb);
 const pb=await readFile(join(R,c.parent)),par=JSON.parse(pb);
 const nb=await readFile(join(R,c.notes)),notes=JSON.parse(nb);
 const sb=await readFile(join(R,c.source)),src=JSON.parse(sb);
 const self={...cand};delete self.candidateSha256;
 rec.candidateSha256=sha(cb);rec.parentSha256=sha(pb);rec.notesSha256=sha(nb);rec.sourceSha256=sha(sb);
 rec.candidateSelfConsistent=sha(JSON.stringify(self))===cand.candidateSha256;
 if(!rec.candidateSelfConsistent)fail('candidate_self_sha');
 if(cand.source.sourceSha256!==sha(sb))fail('candidate_source_sha');
 if(cand.source.sourceId!==par.source.sourceId||cand.source.articleId!==par.source.articleId)fail('candidate_source_identity');
 const rev=cand.provenance.revision||{};
 if(rev.parentPath!==c.parent||rev.parentSha256!==sha(pb))fail('revision_parent_binding');
 if(rev.notesPath!==c.notes||rev.notesSha256!==sha(nb))fail('revision_notes_binding');
 rec.revision=rev;
 const targets=[...new Set((notes.modelReview.issues??[]).filter(x=>x.severity!=='source-note').map(x=>x.targetId))];
 const changed=[];
 // compare text blocks by sourceBlockId
 const parText=new Map(par.body.blocks.filter(b=>b.type==='text').map(b=>[b.sourceBlockIds[0],b]));
 const candText=new Map(cand.body.blocks.filter(b=>b.type==='text').map(b=>[b.sourceBlockIds[0],b]));
 if(parText.size!==candText.size)fail('text_block_count_changed');
 for(const [id,b] of parText){
  const n=candText.get(id);if(!n){fail('text_block_missing:'+id);continue;}
  if(n.text!==b.text)changed.push({sourceBlockId:id,before:b.text,after:n.text});
  const a={...b},z={...n};delete a.text;delete z.text;
  if(JSON.stringify(a)!==JSON.stringify(z))fail('non_text_field_changed:'+id);
 }
 const changedIds=changed.map(x=>x.sourceBlockId);
 if(JSON.stringify(changedIds.slice().sort())!==JSON.stringify(targets.slice().sort()))fail('changed_set_not_equal_targets');
 // flow order and figure blocks
 if(JSON.stringify(cand.body.blocks.map(b=>[b.type,b.sourceBlockIds,b.figureId??null]))!==JSON.stringify(par.body.blocks.map(b=>[b.type,b.sourceBlockIds,b.figureId??null])))fail('body_flow_order_changed');
 const norm=f=>{const x=structuredClone(f);delete x.presentationAsset;return x;};
 if(cand.figures.length!==par.figures.length)fail('figure_count_changed');
 for(let i=0;i<Math.min(cand.figures.length,par.figures.length);i++)if(JSON.stringify(norm(cand.figures[i]))!==JSON.stringify(norm(par.figures[i])))fail('figure_changed:'+par.figures[i].figureId);
 const call=cand.provenance.attempts?.[0];
 rec.productionCall=call?{callId:call.callId,success:call.success,usage:call.usage,durationMs:call.durationMs,rawArtifactPath:call.rawArtifactPath,rawArtifactSha256:call.rawArtifactSha256,targets:call.targets}:null;
 if(!call||!call.success)fail('production_call_binding');
 else{const raw=await readFile(join(R,'web-production/v1',call.rawArtifactPath));if(sha(raw)!==call.rawArtifactSha256)fail('raw_artifact_sha');}
 rec.targets=targets;rec.changed=changed;
 out.chapters.push(rec);
}
out.ok=out.errors.length===0;
const name=`selfcheck-${sha(JSON.stringify(out.chapters)).slice(0,16)}.json`;
await writeFile(join(R,'web-production/v1/coac269-20261027/receipts',name),JSON.stringify(out,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
console.log(JSON.stringify({ok:out.ok,errors:out.errors,receipt:`web-production/v1/coac269-20261027/receipts/${name}`,chapters:out.chapters.map(c=>({chapterId:c.chapterId,candidateSha256:c.candidateSha256,targets:c.targets,changed:c.changed,errors:c.errors||[]}))},null,2));
process.exit(out.ok?0:1);
