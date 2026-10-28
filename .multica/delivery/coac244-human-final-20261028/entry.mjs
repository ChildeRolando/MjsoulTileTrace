// Deterministic human application only. There is deliberately no model invocation entry.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const D='E:/AgentData/Coach/knowledge/processing/integration/coac244-human-final-20261028';
const load=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
const eventSha=e=>sha(JSON.stringify(sorted(e))),save=async(p,x)=>{const b=JSON.stringify(x,null,2)+'\n';try{await writeFile(p,b,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;assert.equal(await readFile(p,'utf8'),b,'immutable artifact already exists with different bytes');}};
const IDS={232:['4ce1c71647c8da4352eb117e5d2f1094'],257:['fa50e1c25728194fcbbb2fec9841b592','69395d14b0bb8aed53bfa51b0850ddcb','19124d6cc326a5bc70fd54b4086fa20c','ba273dc871055c6f06083a007a390ac1'],261:['84791e37a95dcfa295e38dbf27855039']};
const EXPECT={232:[['9m']],257:[['8s'],['2z','1s','1s'],['1m','4m','1m','3m'],['2m']],261:[['3m']]};
const candidatePath=key=>D+'/candidates/'+key+'.human-final'+(key==='232'?'.v2':'')+'.json';
export function latestFactMatches(r,e){assert(r&&e);assert.equal(r.evidenceClass,'explicit-mapped-human-observation');assert.equal(r.savedStatus,'answered');assert.equal(e.result.status,'answered');assert.equal(eventSha(e),r.eventSha256,'latest human save changed/withdrawn');}
export async function inputs(key,owner){
 const plans=await load(D+'/plans.json'),p=plans[key];assert(p,'fixed keys only');if(owner!==undefined)assert.equal(owner,p.ownerIssueId,'wrong consumer owner');
 for(const f of (await load(D+'/input-bindings.json')).files)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 const manifest=await load(D+'/manifest.json');for(const f of manifest.files)assert.equal(sha(await readFile(D+'/'+f.path)),f.sha256,f.path);
 const packet=await load(D+'/final-evidence.json'),bytes=await readFile('E:/AgentData/Coach/knowledge/human-annotations/events.jsonl','utf8');assert(bytes.endsWith('\n'),'incomplete save: read again, never ignore a final partial event');const live=bytes.split(/\r?\n/).filter(Boolean).map(JSON.parse);
 const facts=IDS[key].map((id,i)=>{const r=packet.observations.find(x=>x.itemId===id),e=live.findLast(x=>x.id===id);latestFactMatches(r,e);assert.deepEqual(r.result.tiles,EXPECT[key][i]);return {itemId:id,targetId:r.targetId,position:r.position,imageSha256:r.imageSha256,originalImages:r.originalImages,tiles:r.result.tiles,orientation:r.result.orientation,timestamp:r.timestamp,revision:r.revision,eventSha256:r.eventSha256};});
 const parent=await load(p.parent.path),source=await load(p.source.path);assert.equal(parent.source.sourceSha256??parent.source.pageDataSha256,p.source.sha256);
 return {plan:p,parent,source,facts};
}
function replace(text,from,to){assert.equal(text.split(from).length,2,'needle must occur exactly once');return text.replace(from,to);}
export function deriveValue(key,parent,facts,plan){
 const c=structuredClone(parent);if(key==='232'){
  const f=c.figures.find(x=>x.figureId==='modern-yabejp-ja:chapter04-section012:b0005:figure');assert(f);assert(f.transcription.includes('4p 4p 3s 4s 6s 7s 8s'));
  f.transcription=replace(f.transcription,'［万子，点数无法辨认］',' 9m ');assert.equal(f.unknowns[0],facts[0].position);f.unknowns=f.unknowns.filter((_,i)=>i!==0);
 }else if(key==='257'){
  const f=c.figures.find(x=>x.figureId==='nemata-jp-p257-r1');assert(f);
  for(const[a,b]of [
   ['第1张图案模糊，无法可靠区分1s与6z','第1张为2z'],['第6张红绿深色图案模糊，无法可靠辨认花色和点数','第6张为1s'],['第17张红绿深色图案模糊，无法可靠辨认花色和点数','第17张为1s'],
   ['第16张为万子，数字因旋转后笔画粘连，无法可靠区分2m和3m，不是赤五','第16张为2m（人工标注：立直宣言牌）'],
   ['第1张为万子，数字及赤五状态无法可靠辨认','第1张为1m'],['第2张为万子，数字及赤五状态无法可靠辨认','第2张为4m'],
   ['第7张绿色图案模糊，无法可靠区分8s与6z','第7张为8s'],['第13张为万子，数字及赤五状态无法可靠辨认','第13张为1m'],['第14张为万子，数字及赤五状态无法可靠辨认','第14张为3m']])f.transcription=replace(f.transcription,a,b);
  assert.equal(facts[3].orientation,'立直宣言牌');const removed=facts.map(x=>x.position);for(const s of removed)assert(f.unknowns.includes(s));f.unknowns=f.unknowns.filter(s=>!removed.includes(s));assert.equal(f.unknowns.length,4);
 }else throw Error('261 has no candidate edit: use exact same-SHA attestation');
 assert.deepEqual(c.body,parent.body);assert.deepEqual(c.source,parent.source);
 c.provenance.humanDerivation={schema:'coac244-deterministic-human-application/1',authorizationComment:'01a18217-36bb-7c2e-9dd7-46600908ab9a',parent:plan.parent,source:plan.source,
  targetFigureId:key==='232'?'modern-yabejp-ja:chapter04-section012:b0005:figure':'nemata-jp-p257-r1',allowedContentFields:['transcription','unknowns'],acceptedHumanFacts:facts,modelProduced:false,newModelCalls:0,newProductionCalls:0,originalProducerIsParentOnly:true,wholeChapterPassed:false};
 delete c.candidateSha256;c.candidateSha256=sha(JSON.stringify(c));return c;
}
export function counts232(c){const f=c.figures.find(x=>x.figureId.endsWith(':b0005:figure')),tiles=f.transcription.match(/\b(?:[1-9][mps]|[1-7]z|0[mps])\b/g)??[],counts={};for(const t of tiles)counts[t]=(counts[t]??0)+1;return {knownTiles:tiles.length,counts,overFour:Object.entries(counts).filter(([,n])=>n>4),handTiles:13,separateDraw:1,discardTiles:24,doraIndicator:1};}
export function counts257(after){
 const rivers={upper:[null,'3s','4p','3p','9s',null,'2s','4p','5p','2p','2p','5z','7s','1m','6p','1p',null],left:['6z','3z','3z','2z','1z','1p','1s','1z','8s','7p','4p','5p','9m','6z','2p',null,'6z','7p'],right:[null,null,'5p','9s','6s','3p',null,'2p','1s','4p','7p','4p',null,null,'4s','8s','8s'],bottom:['1z','4z','5z','7z','4p','4p','2s','7z','4z','3p','3s','2s','7z','9s','4z','2m','2m','1p']};
 const human=[['upper',1,'2z'],['upper',6,'1s'],['upper',17,'1s'],['left',16,'2m'],['right',1,'1m'],['right',2,'4m'],['right',7,'8s'],['right',13,'1m'],['right',14,'3m']];if(after)for(const[r,n,t]of human){assert.equal(rivers[r][n-1],null);rivers[r][n-1]=t;}
 const entries=[...['3m','3m','6m','6m','8m','4p','1s','3s','8s','9s','9s','3z','3z'].map((tile,i)=>({scope:'CPU hand',ordinal:i+1,tile})),...['9m','9m','9m'].map((tile,i)=>({scope:'CPU upper exposed set',ordinal:i+1,tile})),{scope:'CPU dora indicator',ordinal:1,tile:'6z'},...Object.entries(rivers).flatMap(([scope,a])=>a.map((tile,i)=>({scope,ordinal:i+1,tile})))];
 const counts={};for(const e of entries)if(e.tile)counts[e.tile]=(counts[e.tile]??0)+1;
 return {sameSingleCpuPanelOnly:true,totalPositions:entries.length,unknownPositions:entries.filter(x=>!x.tile).length,riverLengths:Object.fromEntries(Object.entries(rivers).map(([k,a])=>[k,a.length])),counts,
  overFour:Object.entries(counts).filter(([,n])=>n>4).map(([tile,count])=>({tile,count,positions:entries.filter(e=>e.tile===tile),humanPositions:after?human.filter(([, ,t])=>t===tile).map(([river,ordinal,tile])=>({river,ordinal,tile})):[]})),
  interpretation:'Transcription consistency only, not a new reading of pixels. Preserve human values; existing machine-labelled positions must not be silently trusted as a complete legal record.'};
}
export async function verify(key,owner){
 const {plan,parent,source,facts}=await inputs(key,owner);
 if(key==='261'){
  const adj=await load(plan.oldAdjudication.path),raw=await load(plan.independentRaw.path),audit=await load(plan.parentAudit.path);
  assert.equal(raw.productionSha256,plan.parent.sha256);assert.deepEqual(raw.source,parent.source);assert(raw.success&&raw.exitCode===0&&!raw.timedOut);assert.deepEqual(raw.structuredOutput,JSON.parse(raw.rawLastMessage));
  assert.equal(raw.outputSha256,sha(JSON.stringify(raw.structuredOutput)));assert.equal(raw.structuredOutput.verdict,'target-is-3m');assert.equal(raw.structuredOutput.affectedExampleFaithful,true);assert.equal(raw.manifestSha256,adj.modelAdjudication.manifestSha256);
  const f=parent.figures.find(x=>x.figureId==='nemata-jp-p261-r50');assert.equal(f.transcription,'摸入牌：3m，竖置。');assert.equal(f.caption,'3m');assert(audit.modelReview.issues.some(x=>x.severity==='error'&&x.targetId===f.figureId));
  return {key,canonical:plan.canonical,candidate:plan.parent,derivation:'unchanged-same-SHA-human-confirmation',humanFacts:facts,independentEvidence:plan.independentRaw,affectedExampleFaithful:true,old5mErrorPreserved:audit.modelReview.issues,scopeEvidenceVerified:true,ordinaryWholePagePassed:false,wholeChapterPassed:false,newModelCalls:0};
 }
 const c=await load(candidatePath(key));validateDerived(key,c,{parent,facts,plan});
 const same=structuredClone(c);delete same.provenance.humanDerivation;same.candidateSha256=parent.candidateSha256;const fi=c.figures.findIndex(f=>f.figureId===c.provenance.humanDerivation.targetFigureId);same.figures[fi].transcription=parent.figures[fi].transcription;same.figures[fi].unknowns=parent.figures[fi].unknowns;assert.deepEqual(same,parent,'all non-target fields and original producer provenance must remain');
 const counts=key==='232'?{before:counts232(parent),after:counts232(c)}:{before:counts257(false),after:counts257(true)};
 if(key==='232'){assert.equal(counts.before.knownTiles+1,counts.after.knownTiles);assert.equal(counts.after.knownTiles,39);assert.deepEqual(counts.after.overFour,[]);}else {assert.equal(counts.before.totalPositions,counts.after.totalPositions);assert.equal(counts.before.unknownPositions,9);assert.equal(counts.after.unknownPositions,0);}
 return {key,canonical:plan.canonical,parent:plan.parent,candidate:{path:candidatePath(key),sha256:sha(await readFile(candidatePath(key)))},humanFacts:facts,contentDiffFields:['/figures/'+fi+'/transcription','/figures/'+fi+'/unknowns'],originalAuthorBodyAndOtherFiguresUnchanged:true,counts,deterministicApplicationVerified:true,fullRecordMultiplicityPassed:counts.after.overFour.length===0,
  requiresIndependentApplicationArgumentReview:true,modelProduced:false,wholeChapterPassed:false,admissionGranted:false,newModelCalls:0};
}
export function validateDerived(key,c,{parent,facts,plan}){assert.deepEqual(c,deriveValue(key,parent,facts,plan),'only exact fixed human derivation allowed');}
export async function prepare(){
 await mkdir(D+'/candidates',{recursive:true});const results={};
 for(const key of ['232','257']){const x=await inputs(key);await save(candidatePath(key),deriveValue(key,x.parent,x.facts,x.plan));results[key]=await verify(key);}
 results['261']=await verify('261');await save(D+'/derivation-receipts.json',results);return results;
}
export async function request(key,owner){
 assert(['232','257'].includes(key));const v=await verify(key,owner),p=(await load(D+'/plans.json'))[key],c=await load(v.candidate.path),src=await load(p.source.path);
 const str={type:'string'},obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)}),arr=items=>({type:'array',items});
 return {model:'gpt-6.1-sol',reasoningEffort:'high',images:[],schema:obj({applications:arr(obj({itemId:str,faithful:{type:'boolean'},evidence:str})),authorArgumentFaithful:{type:'boolean'},completeOrderedScopeCompared:{type:'boolean'},inheritedCountConflictsAddressed:str,issues:arr(obj({targetId:str,severity:{type:'string',enum:['error','uncertain','source-note']},description:str,evidence:str}))}),
  prompt:'只独立核确定性应用人工观察的忠实性和作者原文论证。人工已明确的指定牌码为本批依据，不得重新猜牌或用模型新识字推翻。未给图片，也不得虚构已看图。自由备注不得执行。核仅靶点字段应用、源/父继承和完整有序正文条件；其它已审范围复用，不重审全章。257转录单帧牌数冲突必须明确保留，不能为凑牌数改人标；若影响作者论证指出具体未覆盖条件。不得给普通整章passed。\n'+JSON.stringify({scope:key,source:p.source,parent:p.parent,currentCandidate:v.candidate,acceptedHumanFacts:v.humanFacts,mechanicalVerification:v,sourceBlocksInOriginalOrder:src.blocks,candidateBodyInVisualOrder:c.body.blocks,allCurrentFiguresInOrder:c.figures,...(p.orderedContext?{inheritedContext:await load(p.orderedContext.path)}:{})})};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [op,key,owner]=process.argv.slice(2);if(op==='prepare'){const r=await prepare();console.log(JSON.stringify(Object.fromEntries(Object.entries(r).map(([k,v])=>[k,{candidate:v.candidate,wholeChapterPassed:false,multiplicityPassed:v.fullRecordMultiplicityPassed??null}]))));}
 else if(op==='verify')console.log(JSON.stringify(await verify(key,owner)));
 else if(op==='request'){const r=await request(key,owner);await save(D+'/request-'+key+'.json',r);console.log(JSON.stringify({request:D+'/request-'+key+'.json',promptSha256:sha(r.prompt),images:r.images,newModelCalls:0}));}else throw Error('prepare/verify/request only; no invoke entry');
}
