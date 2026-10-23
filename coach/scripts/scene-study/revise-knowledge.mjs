// A new annotation revision, never an in-place rewrite of the frozen experiment.
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { read, save, hash, exists } from './common.mjs';
import { verify } from './study.mjs';
import { annotationRequest } from './annotate.mjs';

export function reviseKnowledge(previous, specification, sources, frozenAt) {
  const revisions=specification.revisions;
  if(previous.version!=='coach-scene-knowledge-web/v1'||revisions.length!==40||new Set(revisions.map(r=>r.id)).size!==40||revisions.some(r=>!previous.cards.some(c=>c.id===r.id)))throw new Error('revision_card_identity');
  const audit=[];
  const cards=previous.cards.map(card=>{
    const revision=revisions.find(r=>r.id===card.id),source=sources[card.id];
    if(!source?.text||source.sha256!==card.source.htmlSha256||source.url!==card.source.url||source.title!==card.source.title||!revision.rationale||!revision.conditions)throw new Error('revision_source_binding');
    const exceptions=revision.exceptions??card.exceptions;
    const content=card.content.replace(`适用条件：${card.conditions}`,`适用条件：${revision.conditions}`).replace(`例外与限制：${card.exceptions}`,`例外与限制：${exceptions}`);
    if(content.length<200||content.length>400)throw new Error(`revision_length:${card.id}:${content.length}`);
    audit.push({id:card.id,source:card.source,sourceTextHash:hash(source.text),oldConditions:card.conditions,newConditions:revision.conditions,oldExceptions:card.exceptions,newExceptions:exceptions,rationale:revision.rationale,reviewBasis:'frozen_original_web_text; unverified_tile_examples_excluded',reviewer:'assistant_source_audit; not_human_gold'});
    return {...card,conditions:revision.conditions,exceptions,content,editorialStatus:'source_conditions_reaudited_not_human_gold'};
  });
  return {knowledge:{...previous,version:'coach-scene-knowledge-web/v2',frozenAt,parentKnowledgeHash:hash(previous),revisionPolicy:specification.sourcePolicy,cards},audit};
}

export async function prepareKnowledgeRevision(previousOut,out) {
  previousOut=resolve(previousOut);out=resolve(out);
  if(previousOut.toLowerCase()===out.toLowerCase()||await exists(join(out,'freeze.json')))throw new Error('revision_requires_new_directory');
  const freeze=await verify(previousOut),previous=await read(join(previousOut,'knowledge.json')),dataset=await read(join(previousOut,'dataset.json'));
  const specification=await read(new URL('./knowledge-v2-revisions.json',import.meta.url));
  const sources=Object.fromEntries(await Promise.all(previous.cards.map(async c=>[c.id,await read(join(previousOut,'sources',c.id+'.json'))])));
  const {knowledge,audit}=reviseKnowledge(previous,specification,sources,new Date().toISOString());
  const requests=dataset.cases.filter(c=>c.split==='evaluation').map(c=>{
    const oldRequest=annotationRequest(c,previous),request=annotationRequest(c,knowledge);
    const oldInput=JSON.parse(oldRequest.messages[1].content),input=JSON.parse(request.messages[1].content);
    delete oldInput.knowledge;delete input.knowledge;
    if(hash(oldInput)!==hash(input))throw new Error('revision_scene_changed');
    return {caseId:c.id,oldRequestHash:hash(oldRequest),newRequestHash:hash(request),bytes:Buffer.byteLength(JSON.stringify(request))};
  });
  const oldManifest=await read(join(previousOut,'automatic/manifest.json'));
  if(oldManifest.codeHash!==hash(await readFile(new URL('./annotate.mjs',import.meta.url))))throw new Error('revision_annotation_code_changed');
  await mkdir(join(out,'runs'),{recursive:true});await mkdir(join(out,'sources'),{recursive:true});
  for(const c of previous.cards)await copyFile(join(previousOut,'sources',c.id+'.json'),join(out,'sources',c.id+'.json'));
  await copyFile(join(previousOut,'dataset.json'),join(out,'dataset.json'));
  await save(join(out,'knowledge.json'),knowledge);
  await save(join(out,'knowledge-revision-audit.json'),{version:specification.version,previousKnowledgeHash:hash(previous),knowledgeHash:hash(knowledge),specificationHash:hash(specification),cards:audit});
  await save(join(out,'revision.json'),{purpose:'same_60_automatic_annotation_knowledge_revision_only; not_formal_ABCD_evaluation',previousOut,previousFreezeHash:hash(freeze),previousAnnotationManifestHash:hash(oldManifest),datasetHash:hash(dataset),knowledgeHash:hash(knowledge),annotationCodeHash:oldManifest.codeHash,model:oldManifest.model,requests,limitations:['No per-item human gold; label changes are not accuracy gains.','Same cases were reviewed before revision; this is a repair diagnostic, not a fresh held-out validation.']});
  await save(join(out,'freeze.json'),{...freeze,frozenAt:knowledge.frozenAt,knowledgeHash:hash(knowledge),previousFreezeHash:hash(freeze),revisionPurpose:'annotation_only_knowledge_v2'});
  await verify(out);
  return {out,cards:40,cases:requests.length,maxRequestBytes:Math.max(...requests.map(r=>r.bytes)),knowledgeHash:hash(knowledge)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await prepareKnowledgeRevision(process.argv[2],process.argv[3])));
