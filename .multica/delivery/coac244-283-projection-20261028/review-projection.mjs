// Offline request-data construction only. Does not invoke any model or rewrite old receipts.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=import.meta.dirname,cfg=JSON.parse(await readFile(join(here,'input.json'),'utf8'));
const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const modulePath=join(repo,'scripts/scene-study/textbook-audit-web.mjs');
const {webSemanticProjection}=await import(pathToFileURL(modulePath));
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const candidate=await load(cfg.dependencies[0].path),audit=await load(cfg.dependencies[2].path);
const ids=new Set(cfg.source.tables.flatMap(t=>t.sourceBlockIds));
const sourceBlocks=cfg.source.blocks.filter(b=>ids.has(b.id)),assetIds=new Set(sourceBlocks.flatMap(b=>b.images??[]).map(i=>i.assetId));
const source={...cfg.source,blocks:sourceBlocks,assets:cfg.source.assets.filter(a=>assetIds.has(a.assetId))};
const c={...candidate,body:{...candidate.body,blocks:cfg.tableCandidateBlocks},figures:cfg.tableCandidateFigures};
// Preserve 28 faithful and 66 needs-repair figure verdicts. The latter cite geometry;
// a correct tile named in their evidence is not an overall passed figure receipt.
const verified=[];
const inheritedFigureChecks=cfg.tableCandidateFigures.map(f=>audit.modelReview.figureChecks.find(x=>x.id===f.figureId));
assert(inheritedFigureChecks.every(Boolean));
const projection=webSemanticProjection(source,c,verified,[],true,3);
assert.equal(projection.visualEvidence.attachedOriginalImages.length,source.assets.length);
const bindings=[];let omitted=0;
for(const batch of audit.batchReviews){
 const targetIds=cfg.tableCandidateBlocks.filter(b=>b.type==='figure'&&batch.group.sourceBlockIds.includes(b.sourceBlockIds[0])).map(b=>b.sourceBlockIds[0]);
 if(!targetIds.length)continue;
 const call=batch.calls[0],path=join(cfg.root,'audit/calls',call.callId+'.json'),bytes=await readFile(path),raw=JSON.parse(bytes);
 assert.equal(sha(bytes),batch.originalCall.sha256);
 const parsed=JSON.parse(raw.prompt.slice(raw.prompt.indexOf('\n')+1));
 assert.equal(sha(JSON.stringify(parsed)),call.binding.semanticProjectionSha256);
 const rows=targetIds.map(id=>{const b=parsed.candidate.blocks.find(b=>b.sourceBlockIds.includes(id));assert(!Object.hasOwn(b,'tableContext'));omitted++;return {sourceBlockId:id,oldCandidateProjection:b,realCandidateContext:candidate.body.blocks.find(b=>b.sourceBlockIds.includes(id)).tableContext};});
 bindings.push({batchId:batch.group.batchId,callId:call.callId,raw:{path,sha256:sha(bytes)},semanticProjectionSha256:call.binding.semanticProjectionSha256,omittedCandidateContexts:rows});
}
assert.equal(omitted,94);
function check(p){
 for(const b of cfg.tableCandidateBlocks){const n=p.candidate.blocks.find(x=>JSON.stringify(x.sourceBlockIds)===JSON.stringify(b.sourceBlockIds));assert.deepEqual(n.tableContext,b.tableContext);}
 assert.deepEqual(p.source.tables,cfg.source.tables);
}
check(projection);
const changed=structuredClone(projection);delete changed.candidate.blocks.find(b=>b.type==='figure').tableContext;
assert.throws(()=>check(changed));
const attachments=[...new Map(cfg.tableCandidateFigures.flatMap(f=>f.sourceAssetBindings).map(a=>[a.assetId,a])).values()];
const packet={schema:'coac244-283-table-specific-review-input/1',status:'prepared-not-submitted-not-passed',projectionVersion:3,canonical:cfg.canonical,sourceDependencies:cfg.dependencies.slice(0,5),projection,plannedOriginalImageAttachments:attachments,inheritedFigureChecks,derivedPresentationReceipt:'verification.json',oldRawProjectionEvidence:bindings,requestBuilder:{path:modulePath,sha256:sha(await readFile(modulePath))},reviewTarget:'Only six table geometry/empty cells/13 arrows and the 94 omitted candidate contexts; reuse exact original tile identity evidence without changing28 faithful/66 needs-repair original figure verdicts; do not re-review1195 blocks. Future caller must attach the listed original PNGs using terra/max and the existing independent audit contract. This packet is review data, not an executable audit or acceptance receipt.',oldAuditStatusUnchanged:true,newModelCalls:0};
for(const [name,data] of [['specific-table-review-input.json',packet],['projection-regression.json',{oldRawOmittedContexts:94,newProjectionContextsRestored:94,projectionVersion:3,missingContextRejected:true,modelCalls:0}]]){
 const bytes=JSON.stringify(data,null,2)+'\n';await writeFile(join(here,name),bytes);await writeFile(join(cfg.shared,name),bytes);
}
console.log(JSON.stringify({oldRawOmittedContexts:94,originalCalls:bindings.map(b=>b.callId),newVersion:3,noModelCalls:true}));
