import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const p114ScopeSha256='76549f49ad6310403ffea1ddc94d34c30db099f211fe1bae6e7a6db3f2de81aa';
export function scopedPdfPage(candidate,page){
 const s=candidate.source?.blockScope;if(!s)return page;
 const expected=['79-cn-p114-b1','79-cn-p114-b3','79-cn-p114-b8'],selected=page.blocks.filter(b=>expected.includes(b.id)),protectedIds=page.blocks.filter(b=>!expected.includes(b.id)).map(b=>b.id);
 if(candidate.source.sourceId!=='79-cn'||candidate.source.page!==114||page.page!==114||s.sourceId!=='79-cn'||s.page!==114||s.sha256!==p114ScopeSha256||page.blocks.length!==9||selected.length!==3||!same(s.sourceBlockIds,expected)||!same(s.sourceBlockIds,selected.map(b=>b.id))||!same(s.protectedSourceBlockIds,protectedIds)||candidate.coverage?.mode!=='explicit-source-block-subset'||candidate.coverage.fullSourceBlockCount!==9||candidate.provenance?.revision)throw Error('audit_explicit_pdf_scope_invalid');
 return {...page,blocks:selected,plainText:selected.filter(b=>b.type==='text').map(b=>(b.lines??[]).map(l=>l.text).join('')).join('\n')};
}
export async function verifyPdfScopeBinding(root,candidate,page,manifest){
 const s=candidate.source?.blockScope;if(!s){if(manifest.sourceBlockScope)throw Error('audit_scope_candidate_missing');return null;}
 scopedPdfPage(candidate,page);const path=resolve(root,s.path),rel=relative(resolve(root),path);if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..'+String.fromCharCode(92))||rel.startsWith('../'))throw Error('audit_scope_path_outside_processing');
 const bytes=await readFile(path),scope=JSON.parse(bytes);if(sha(bytes)!==p114ScopeSha256||!same(s,manifest.sourceBlockScope)||scope.schema!=='coach-textbook-pdf-source-block-scope/1'||scope.pdfSha256!==candidate.source.pdfSha256||scope.pageDataSha256!==candidate.source.pageDataSha256||scope.sourceId!==candidate.source.sourceId||scope.page!==page.page||manifest.revision||manifest.candidateOverrides)throw Error('audit_scope_manifest_or_source_changed');
 const inventoryBytes=await readFile(resolve(root,'source-inventory.json')),ownerBytes=await readFile(resolve(root,'integration/source-block-ownership.json')),owners=JSON.parse(ownerBytes).blocks,inventory=JSON.parse(inventoryBytes),source=inventory.sources.find(x=>x.sourceId===scope.sourceId),meta=source?.pages.find(p=>p.page===scope.page),actualPage=JSON.parse(await readFile(scope.pageDataPath));
 if(sha(inventoryBytes)!==scope.sourceInventorySha256||sha(ownerBytes)!==scope.ownership.sha256||sha(await readFile(scope.ownership.path))!==scope.ownership.sha256||meta?.pageDataSha256!==scope.pageDataSha256||sha(await readFile(scope.pageDataPath))!==scope.pageDataSha256||!same(actualPage,page)||!same(scope.selectedBlocks,page.blocks.filter(b=>s.sourceBlockIds.includes(b.id)))||scope.sourceBlockIds.length!==3||new Set(scope.sourceBlockIds).size!==3||scope.sourceBlockIds.some(id=>!s.sourceBlockIds.includes(id))||scope.protectedSourceBlockIds.length!==6||new Set(scope.protectedSourceBlockIds).size!==6||scope.protectedSourceBlockIds.some(id=>!s.protectedSourceBlockIds.includes(id))||scope.selectedOwners.length!==3||scope.selectedOwners.some(o=>!s.sourceBlockIds.includes(o.sourceBlockId)||o.chapterId!==scope.chapterId||!owners.some(x=>same(x,o))))throw Error('audit_scope_inventory_ownership_or_selected_data_changed');
 return {mode:'explicit-source-block-subset',scope:{path:s.path,sha256:s.sha256},sourceBlockIds:s.sourceBlockIds,protectedSourceBlockIds:s.protectedSourceBlockIds,fullSourceBlockCount:9,comparedSourceBlockCount:3,fullPageCompared:false};
}
