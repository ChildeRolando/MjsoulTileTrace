// CN234: three requirements concern audit provenance, not author-facing annotations.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {verifyLimited,sha,glosses} from './admit.mjs';
import {stageWebTextbook} from './stage-base.mjs';
export function verifyDisplay(bodies,g){
 const blocks=bodies.chapters[0].blocks,text=blocks.map(b=>b.text??'').join('');
 for(const[a,z]of glosses)assert(text.includes(a+z));
 for(const bad of [g.candidate.sha256,g.raw.sha256,g.oldTimeout.callId,'upstreamExecutions','localInvocations'])assert(!text.includes(bad));
 assert(!blocks.some(b=>b.authorText===false));
 const ids=[...new Set(blocks.flatMap(b=>b.locator?.sourceBlockIds??[]))];assert.equal(ids.length,5);
 for(const b of blocks)if(b.type!=='figure'&&b.text)assert.equal(b.displaySegments.map(s=>s.text).join(''),b.text);
 return {blocks:blocks.length,sourceBlocks:ids.length,figures:blocks.filter(b=>b.type==='figure').length,authorMetadataInjection:false};
}
export async function stageLimited(options){
 const g=await verifyLimited(options.processingRoot,options.candidatePath),r=await stageWebTextbook({...options,verify:verifyLimited}),dest=options.destination;
 const bodies=JSON.parse(await readFile(dest+'/textbook-bodies.json')),display=verifyDisplay(bodies,g);
 const provenance={schema:'coac244-cn234-audit-scope-provenance/1',canonical:g.canonical,candidate:g.candidate,source:g.source,parent:g.parent,parentAudit:g.parentAudit,parentRaw:g.parentRaw,independentReceipt:g.independentReceipt,raw:g.raw,metadataBinding:g.metadataBinding,
  requirements:g.auditScopeRequirements.map((quote,i)=>({quote,layer:'audit-and-source-evidence',binding:i===0?{target:'79-bilibili-cn:cv1780400:b0003',unchangedBodyBlocks:4,unchangedFigures:1}:i===1?{source:g.source,parent:g.parent,candidate:g.candidate}:{oldTimeout:g.oldTimeout}})),
  authorBodyChanged:false,originalReceiptAndRawChanged:false,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,newModelCalls:0};
 await writeFile(dest+'/scope-provenance.json',JSON.stringify(provenance,null,2)+'\n');
 const receipt={...r,...display,status:'exact-cn234-composed-preview',canonical:g.canonical,auditStatus:g.status,scopeProvenance:{path:dest+'/scope-provenance.json',sha256:sha(await readFile(dest+'/scope-provenance.json'))},standardWholeArticlePassed:false,globalAdmissionGranted:false,actualMcpArenaReadback:null,newModelCalls:0};
 await writeFile(dest+'/web-stage-receipt.json',JSON.stringify(receipt,null,2)+'\n');return receipt;
}
