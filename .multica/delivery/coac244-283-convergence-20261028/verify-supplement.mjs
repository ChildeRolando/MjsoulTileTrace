// Read-only consumer verifier for the exact derived283 table supplement, not a whole chapter gate.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,join,dirname,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=o=>sha(JSON.stringify(o)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function verify283TableSupplement(root,path){
 const need=(ok,id)=>{if(!ok)throw Error('283_table_reuse_'+id);};
 const get=async ref=>{const bytes=await readFile(isAbsolute(ref.path)?ref.path:join(root,ref.path));need(sha(bytes)===ref.sha256,'bound_sha');return JSON.parse(bytes);};
 const bytes=await readFile(path),proof=JSON.parse(bytes);
 need(proof.schema==='coac244-283-independent-table-supplement-reuse/1'&&proof.authorization==='01a17f35-32cd-734f-bf71-13be8b8a7eae'&&proof.status==='passed-for-identical-target-tables-on-derived-candidate'&&proof.chapterAccepted===false&&proof.newModelCalls===0,'scope');
 need(proof.candidate.sha256==='b2417de19a50ec85609f75a4e07f07e002cf636785e1427948c06000a0967c2f'&&proof.parent.sha256==='dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899'&&proof.source.sha256==='8e7eff57a85e84fb963209117689b07fec5efd9b5d7ee81c12f1fd3a44b497de','exact_identity');
 const c=await get(proof.candidate),p=await get(proof.parent),s=await get(proof.source),receipt=await get(proof.originalIndependentReceipt),raw=await get(proof.originalIndependentRaw),request=await get(proof.originalRequest),hashes=await get(proof.contentHashes),graph=await get(proof.inheritanceGraph);
 need(receipt.status==='passed-for-target-tables'&&!receipt.chapterAccepted&&raw.success&&raw.exitCode===0&&!raw.timedOut&&raw.callId===proof.originalCallId&&same(raw.output,receipt.modelReview)&&same(raw.output,proof.inheritedIndependentReview)&&same(JSON.parse(raw.rawLastMessage),raw.output)&&request.prompt===raw.prompt&&same(request.schema,raw.schema),'independent_receipt');
 need(raw.output.completeTargetScopeCompared&&raw.output.figureChecks.length===66&&raw.output.tableChecks.length===6&&[...raw.output.figureChecks,...raw.output.tableChecks].every(x=>x.verdict==='faithful'&&x.evidence&&x.remainingProblem==='无'),'independent_verdicts');
 const packet=JSON.parse(request.prompt.slice(request.prompt.indexOf('{'))),selected=new Set(packet.projection.source.blocks.map(x=>x.id));
 const runtime=join(root,'audit/runtimes/coac269-283-b0168-review-v1-20261028');
 const manifest=JSON.parse(await readFile(join(runtime,'b0168-review-runtime-manifest.json')));
 need(sha(await readFile(join(runtime,'b0168-review-runtime-manifest.json')))==='80aa8e8b361d01515d73e6728c4e63d32613ea0a3198ae7e09c21414efde4a3c','frozen_manifest');
 for(const f of manifest.files)need(sha(await readFile(f.path))===f.sha256,'frozen_dependency');
 const mod=await import(pathToFileURL(join(runtime,'textbook-audit-web.mjs')).href);
 const ss={...s,blocks:s.blocks.filter(x=>selected.has(x.id)),tables:s.tables.filter(x=>packet.targetTableIds.includes(x.tableId??x.id))};
 const cc={...c,body:{...c.body,blocks:c.body.blocks.filter(x=>selected.has(x.sourceBlockIds[0]))},figures:c.figures.filter(x=>selected.has(x.sourceBlockIds[0]))};
 const projection=mod.webSemanticProjection(ss,cc,[],[],true,3);
 need(same(projection.source,packet.projection.source)&&same(projection.candidate,packet.projection.candidate)&&hash(projection.source)===proof.sourceProjectionSha256&&hash(projection.candidate)===proof.candidateProjectionSha256,'actual_request_content_and_context');
 need(projection.candidate.blocks.length===137&&projection.candidate.figures.length===94&&projection.source.tables.length===6&&projection.candidate.blocks.filter(x=>x.type==='figure').every(x=>x.tableContext&&['tableId','row','column','rowspan','colspan','header'].every(k=>k in x.tableContext)),'table_context');
 need(hash(packet.presentation)===proof.presentationSha256&&hash(packet.imageAttachmentOrder)===proof.imageAttachmentOrderSha256&&same(request.images,raw.requestExecution.images.map(x=>x.path))&&raw.requestExecution.images.length===30,'presentation_and_original_order');
 for(const i of raw.requestExecution.images)need(sha(await readFile(i.path))===i.sha256,'original_image');
 need(c.body.blocks.length===1195&&hashes.blocks.length===1195&&c.figures.length===524&&hashes.figures.length===524,'hash_cardinality');
 for(let i=0;i<1195;i++){const a=c.body.blocks[i],old=p.body.blocks[i],record=hashes.blocks[i];need(record.candidate===hash(a)&&record.parent===hash(old)&&record.tableContextSha256===hash(a.tableContext??null),'block_hash');if(i===167){need(a.text===old.text+'或'&&same({...a,text:old.text},old),'only_b0168_diff');}else need(same(a,old),'unmodified_blocks');}
 for(let i=0;i<524;i++)need(same(c.figures[i],p.figures[i])&&hashes.figures[i].candidate===hash(c.figures[i])&&hashes.figures[i].parent===hash(p.figures[i]),'figure_hash');
 need(graph.nodes.latest.sha256===proof.candidate.sha256&&graph.nodes.tableRaw.sha256===proof.originalIndependentRaw.sha256&&!graph.wholeChapterAccepted,'graph');
 return {schema:'coac244-283-table-reuse-verified/1',passed:true,scope:'66 previous geometry target figures and6 tables only; other28 table figures inherited independently',candidateSha256:proof.candidate.sha256,supplementSha256:sha(bytes),chapterAccepted:false,newModelCalls:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verify283TableSupplement(process.argv[2],process.argv[3])));
