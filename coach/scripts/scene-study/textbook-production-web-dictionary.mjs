#!/usr/bin/env node
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,dirname,relative,resolve,isAbsolute} from 'node:path';
import {invokeTextbookCodex} from './textbook-production-cli.mjs';

const root='E:/AgentData/Coach/knowledge/processing',run=join(root,'web-production/v1'),argv=process.argv.slice(2);
const option=(k,d=null)=>{const i=argv.indexOf(k);return i<0?d:argv[i+1];},sha=b=>createHash('sha256').update(b).digest('hex');
const bound=value=>{const p=resolve(root,value),r=relative(root,p);if(!r||isAbsolute(r)||r==='..'||r.startsWith('..\\')||r.startsWith('../'))throw Error('dictionary_path_outside_processing');return p;};
const sourcePath=bound(option('--proposals')),sourceBytes=await readFile(sourcePath),proposals=JSON.parse(sourceBytes);
const outputPath=bound(option('--output','web-production/v1/dictionaries/modern-new-tile-assets.draft.json'));
const entries=proposals.entries.filter(a=>a.urls.some(u=>/\/img\/tile_[a-z]+\/[^/]+\.png$/.test(new URL(u).pathname)));
for(const a of entries){if(a.frames!==1||sha(await readFile(join(root,'web-sources/v1',a.path)))!==a.sha256)throw Error('dictionary_source_changed');}
let existing=null;try{existing=JSON.parse(await readFile(outputPath));}catch(e){if(e.code!=='ENOENT')throw e;}
if(existing){
 if(existing.schema!=='coach-textbook-single-tile-dictionary-draft/1'||existing.proposals.sha256!==sha(sourceBytes)||existing.proposals.path!==relative(root,sourcePath).replaceAll('\\','/'))throw Error('existing_dictionary_source_changed');
 let raw=null;for(const a of existing.provenance.attempts){const bytes=await readFile(join(run,a.rawArtifactPath));if(sha(bytes)!==a.rawArtifactSha256)throw Error('existing_dictionary_raw_changed');if(a.success){raw=JSON.parse(bytes);if(raw.callId!==a.callId||raw.rawLastMessage===null||sha(raw.rawLastMessage)!==a.outputSha256||JSON.stringify(JSON.parse(raw.rawLastMessage))!==JSON.stringify(raw.output))throw Error('existing_dictionary_output_binding_changed');}}
 const actual=raw?.output?.assets;
 if(!Array.isArray(actual)||actual.length!==entries.length||new Set(actual.map(a=>a.sha256)).size!==entries.length||entries.some(a=>!actual.some(v=>v.sha256===a.sha256)))throw Error('existing_dictionary_output_coverage_changed');
 const expected=entries.map(a=>({...a,...actual.find(v=>v.sha256===a.sha256)}));
 if(JSON.stringify(existing.assets)!==JSON.stringify(expected))throw Error('existing_dictionary_assets_not_from_bound_output');
 console.log(JSON.stringify({state:'resumed-existing',outputPath,assets:entries.length,modelCalls:0}));process.exit(0);
}
if(argv.includes('--preflight-only')){console.log(JSON.stringify({assets:entries.length,modelCalls:0,complexImagesExcluded:proposals.entries.length-entries.length}));process.exit(0);}
if(await readFile(join(run,'STOP')).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}))throw Error('dictionary_dispatch_stopped');
const item={type:'object',additionalProperties:false,properties:{sha256:{type:'string',enum:entries.map(a=>a.sha256)},code:{type:'string',enum:[...'mps'.split('').flatMap(s=>Array.from({length:9},(_,i)=>(i+1)+s)),...Array.from({length:7},(_,i)=>(i+1)+'z'),'back','unknown']},red:{type:'boolean'},orientation:{type:'string',enum:['upright','sideways-left','sideways-right','unknown']},evidence:{type:'string',minLength:1},unknowns:{type:'array',items:{type:'string'}}},required:['sha256','code','red','orientation','evidence','unknowns']};
const schema={type:'object',additionalProperties:false,properties:{assets:{type:'array',minItems:entries.length,maxItems:entries.length,items:item}},required:['assets']};
const prompt=['Inspect the attached finite set of original single mahjong tile PNG assets in attachment order. Return one independent visual identification for every exact SHA below. Filenames are source metadata, not ground truth. Read the actual face, rotation and red color. Codes: 1-9m manzu, 1-9p pinzu, 1-9s souzu; 1z east,2z south,3z west,4z north,5z white,6z green,7z red. A yellow/blank tile back is back, never 9z. Red five has rank5 and red:true. Sideways white still 5z. Orientation is determined by the face glyph, not image size alone. Distinguish 2m/3m,6p/8p,1s. If uncertain use unknown and state the exact issue; never infer a filename code. No charts or full tables are included. No tools are needed or permitted.',JSON.stringify(entries.map((a,i)=>({attachment:i+1,sha256:a.sha256,sourceUrls:a.urls,width:a.width,height:a.height})))].join('\n\n');
const cliBytes=await readFile(new URL('./textbook-production-cli.mjs',import.meta.url)),cliSha256=sha(cliBytes),runnerBytes=await readFile(new URL(import.meta.url)),runnerSha256=sha(runnerBytes);
const callId=randomUUID(),result=await invokeTextbookCodex({prompt,schema,images:entries.map(a=>join(root,'web-sources/v1',a.path)),model:'gpt-6.1-sol',reasoningEffort:'high',timeoutMs:360000});
const rawPath=join(run,'raw-calls',callId+'.json');await mkdir(dirname(rawPath),{recursive:true});
await writeFile(rawPath,JSON.stringify({callId,...result,semanticPrompt:prompt,schema},null,2)+'\n',{flag:'wx'});
const attempt={callId,scope:'new-exact-single-tile-dictionary',model:'gpt-6.1-sol',reasoningEffort:'high',startedAt:result.startedAt,durationMs:result.durationMs,success:result.success,usage:result.usage,rawArtifactPath:relative(run,rawPath).replaceAll('\\','/'),rawArtifactSha256:sha(await readFile(rawPath)),outputSha256:result.rawLastMessage===null?null:sha(result.rawLastMessage),promptSha256:result.requestPromptSha256,semanticPromptSha256:sha(prompt),schemaSha256:sha(JSON.stringify(schema)),cliSha256,runnerSha256};
await appendFile(join(run,'calls.jsonl'),JSON.stringify(attempt)+'\n');
for(const [name,bytes] of [[cliSha256+'.cli.mjs',cliBytes],[runnerSha256+'.mjs',runnerBytes]]){const p=join(run,'runners',name);await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes);}
if(!result.success)throw Error('dictionary_call_failed_raw_preserved');
const actual=result.output.assets;if(!Array.isArray(actual)||actual.length!==entries.length||new Set(actual.map(a=>a.sha256)).size!==entries.length||entries.some(a=>!actual.some(v=>v.sha256===a.sha256)))throw Error('dictionary_output_coverage_failed_raw_preserved');
const out={schema:'coach-textbook-single-tile-dictionary-draft/1',status:'draft-awaiting-independent-visual-review',proposals:{path:relative(root,sourcePath).replaceAll('\\','/'),sha256:sha(sourceBytes)},assets:entries.map(a=>({...a,...actual.find(v=>v.sha256===a.sha256)})),provenance:{model:'gpt-6.1-sol',reasoningEffort:'high',artifactRoot:'web-production/v1',attempts:[attempt],modelCalls:1,usage:result.usage}};
await mkdir(dirname(outputPath),{recursive:true});await writeFile(outputPath,JSON.stringify(out,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({outputPath,assets:out.assets.length,usage:result.usage,durationMs:result.durationMs,modelCalls:1}));
