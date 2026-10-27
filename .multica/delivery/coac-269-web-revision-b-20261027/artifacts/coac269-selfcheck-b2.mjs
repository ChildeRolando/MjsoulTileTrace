#!/usr/bin/env node
// COAC-269 line B batch-2 zero-call self-check of produced revisions (not the independent audit).
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const R='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');
const cases=[
 {chapterId:'nemata-jp-chapter-246-1',articleId:'chapter06-section002',
  parent:'web-production/v1/candidates/modern-yabejp-ja/chapter06-section002.display.json',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter06-section002.coac269rev1.json',
  notes:'audit/web/articles/modern-yabejp-ja/chapter06-section002.eb4caf1b93fc906a5a7286419009256337e9f886ce82123091931c8c5e5c4fc4.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/chapter06-section002/source.json'},
 {chapterId:'nemata-jp-chapter-237-1',articleId:'chapter04-section016',
  parent:'web-production/v1/candidates/modern-yabejp-ja/chapter04-section016.display.json',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter04-section016.coac269rev1.json',
  notes:'audit/web/articles/modern-yabejp-ja/chapter04-section016.5c4048adf1b398f2a202dbdd0a1485cdaa539ad2ad4fd80e053dd0f2db17a959.json',
  source:'web-sources/v1/modern-yabejp-ja/articles/chapter04-section016/source.json'}
];
const out={schema:'coac269-revision-selfcheck/1',ticket:'COAC-269',batch:'b2',recordedAt:new Date().toISOString(),modelCalls:0,chapters:[],errors:[]};
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
const name=`selfcheck-b2-${sha(JSON.stringify(out.chapters)).slice(0,16)}.json`;
await writeFile(join(R,'web-production/v1/coac269-20261027/receipts',name),JSON.stringify(out,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
console.log(JSON.stringify({ok:out.ok,errors:out.errors,receipt:`web-production/v1/coac269-20261027/receipts/${name}`,chapters:out.chapters.map(c=>({chapterId:c.chapterId,candidateSha256:c.candidateSha256,targets:c.targets,changed:c.changed,errors:c.errors||[]}))},null,2));
process.exit(out.ok?0:1);
