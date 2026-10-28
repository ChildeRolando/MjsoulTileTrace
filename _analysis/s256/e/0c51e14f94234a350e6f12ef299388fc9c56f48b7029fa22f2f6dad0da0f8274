#!/usr/bin/env node
// Only fixed teaching labels change; original candidate and model evidence stay intact.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,dirname,join} from 'node:path';
const root='E:/AgentData/Coach/knowledge/processing',args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];},sha=b=>createHash('sha256').update(b).digest('hex');
function bound(p){const path=resolve(root,p),r=relative(root,path);if(!r||isAbsolute(r)||r==='..'||r.startsWith('..\\')||r.startsWith('../'))throw Error('label_path_outside_processing');return path;}
const parentPath=bound(option('--parent')),bytes=await readFile(parentPath),parent=JSON.parse(bytes),copy={...parent};delete copy.candidateSha256;
if(parent.schema!=='coach-textbook-web-article-draft/1'||parent.source.language!=='zh-CN'||parent.body.mode!=='verbatim'||sha(JSON.stringify(copy))!==parent.candidateSha256)throw Error('label_parent_not_bound_verbatim_web_draft');
const variant=option('--variant');if(!variant||!/^[a-zA-Z0-9_-]+$/.test(variant))throw Error('label_new_variant_required');
const replacements=[{from:'ツモ',to:'摸入'},{from:'切り',to:'切'},{from:'変化',to:'变化'},{from:'でテンパイ',to:'即可听牌'},{from:'枚',to:'张'}],replace=s=>replacements.reduce((v,r)=>v.replaceAll(r.from,r.to),s),next=structuredClone(parent),figureIds=[];
for(const figure of next.figures){let changed=false;for(const key of ['transcription','caption','sourceNotes']){const old=figure[key],value=Array.isArray(old)?old.map(replace):replace(old);if(JSON.stringify(old)!==JSON.stringify(value)){figure[key]=value;changed=true;}}
 const before=parent.figures.find(f=>f.figureId===figure.figureId),numbers=s=>JSON.stringify(s.match(/\d+/g)??[]),cells=s=>JSON.stringify(s.split('\n').map(l=>l.split('|').length));
 if(numbers(before.transcription)!==numbers(figure.transcription)||cells(before.transcription)!==cells(figure.transcription))throw Error('label_normalization_changed_numbers_or_table_cells');
 if(changed)figureIds.push(figure.figureId);delete figure.presentationAsset;
}
if(!figureIds.length)throw Error('label_normalization_has_no_changes');
const notesPath=option('--notes')?bound(option('--notes')):null,notesBytes=notesPath?await readFile(notesPath):null;
if(notesBytes){const notes=JSON.parse(notesBytes);if(notes.production.sha256!==sha(bytes))throw Error('label_notes_parent_binding');}
delete next.candidateSha256;delete next.provenance.derivedFromCandidate;delete next.provenance.presentationRendererSha256;
next.provenance.labelNormalization={parentPath:relative(root,parentPath).replaceAll('\\','/'),parentSha256:sha(bytes),...(notesPath?{notesPath:relative(root,notesPath).replaceAll('\\','/'),notesSha256:sha(notesBytes)}:{}),replacements,figureIds,normalizerSha256:sha(await readFile(new URL(import.meta.url))),newProductionModelCalls:0};
next.candidateSha256=sha(JSON.stringify(next));const output=join(root,'web-production/v1/candidates',parent.source.sourceId,parent.source.articleId+'.'+variant+'.json'),outputBytes=JSON.stringify(next,null,2)+'\n';await mkdir(dirname(output),{recursive:true});
try{await writeFile(output,outputBytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||sha(await readFile(output))!==sha(outputBytes))throw Error('existing_label_variant_changed');}
const runner=await readFile(new URL(import.meta.url)),archive=join(root,'web-production/v1/runners',sha(runner)+'.labels.mjs');await writeFile(archive,runner);
console.log(JSON.stringify({candidatePath:output,candidateSha256:sha(outputBytes),changedFigures:figureIds.length,newProductionModelCalls:0}));
