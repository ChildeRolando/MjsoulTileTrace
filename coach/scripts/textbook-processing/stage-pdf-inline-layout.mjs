import assert from 'node:assert/strict';

const expand = text => {
 const matches=[...text.matchAll(/([0-9]+)([mpsz])/g)];
 if(matches.map(m=>m[0]).join('')!==text)throw Error('pdf_inline_tile_notation');
 return matches.flatMap(m=>[...m[1]].map(n=>n+m[2]));
};

/** Exact source-layout repair only. Independent approval and asset hashes are checked by the caller. */
export function applyPdfInlineLayout(candidate,page,layout,layoutSha256){
 if(layout.schema!=='coach-textbook-pdf-inline-layout/1'||candidate.source.sourceId!=='79-cn'||layout.source.sourceId!==candidate.source.sourceId||layout.source.page!==candidate.source.page||page.page!==candidate.source.page)throw Error('pdf_inline_source_scope');
 const originals=new Map(page.blocks.map(b=>[b.id,b])),parents=new Map(candidate.figures.map(f=>[f.figureId,f])),groups=new Map(),replacedFigures=new Set(),usedGroups=new Set(),replacements=new Map(),removed=new Set();
 for(const g of layout.figureGroups){
  if(groups.has(g.figureGroupId)||!parents.has(g.parentFigureId)||!g.tiles?.length)throw Error('pdf_inline_figure_identity');
  assert.deepEqual(g.tiles.map(t=>t.sourceImageBlockId),g.sourceImageBlockIds,'pdf inline image partition');
  assert.deepEqual(expand(g.text),g.tiles.map(t=>t.code),'pdf inline tile sequence');
  if(g.sourceImageBlockIds.some(id=>originals.get(id)?.type!=='image'))throw Error('pdf_inline_image_source');
  groups.set(g.figureGroupId,g);replacedFigures.add(g.parentFigureId);
 }
 for(const parentId of replacedFigures){const slices=layout.figureGroups.filter(g=>g.parentFigureId===parentId);assert.deepEqual(slices.flatMap(g=>g.sourceImageBlockIds),parents.get(parentId).sourceImageBlockIds,'pdf inline complete parent image coverage');}
 for(const [index,p]of layout.paragraphs.entries()){
  const r=p.replacement,indices=r.parentBodyIndices;
  if(!indices?.length||indices.some((n,i)=>!Number.isInteger(n)||n<0||i&&n!==indices[i-1]+1||removed.has(n)))throw Error('pdf_inline_replacement_indices');
  const originalBlocks=indices.map(n=>candidate.body.blocks[n]);assert.deepEqual(originalBlocks,r.parentBodyBlocks,'pdf inline parent body changed');
  assert.deepEqual(originalBlocks.filter(b=>b.type==='text').flatMap(b=>b.sourceBlockIds),r.sourceBlockIds,'pdf inline text replacement');
  assert.deepEqual(originalBlocks.filter(b=>b.type==='figure').map(b=>b.figureId),r.parentFigureIds,'pdf inline figure replacement');
  assert.deepEqual(r.sourceBlockIds,p.sourceBlockIds,'pdf inline source identity');
  if(originalBlocks[0].type!=='text'||originalBlocks[0].sourceBlockIds[0]!==r.insertBeforeSourceBlockId)throw Error('pdf_inline_anchor');
  const sourceTexts=new Map(p.sourceBlockIds.map(id=>{const b=originals.get(id);if(b?.type!=='text')throw Error('pdf_inline_text_source');return[id,(b.lines??[]).map(l=>l.text).join('')];}));
  const fullSource=p.sourceBlockIds.map(id=>sourceTexts.get(id)).join('');assert.equal(fullSource,p.originalSourceText,'pdf inline original source changed');
  assert.equal(originalBlocks.filter(b=>b.type==='text').map(b=>b.text).join(''),fullSource,'pdf inline requires exact original Chinese');
  const ends=new Map(),sourceOrder=[],inlineContent=[];
  for(const part of p.inlineContent){
   if(part.type==='text'){
    const text=part.sourceFragments.map(f=>{const source=sourceTexts.get(f.sourceBlockId);if(source===undefined||!Number.isInteger(f.start)||!Number.isInteger(f.end)||f.start!==(ends.get(f.sourceBlockId)??0)||f.end<=f.start||f.end>[...source].length)throw Error('pdf_inline_text_range');if(!ends.has(f.sourceBlockId))sourceOrder.push(f.sourceBlockId);ends.set(f.sourceBlockId,f.end);return[...source].slice(f.start,f.end).join('');}).join('');
    assert.equal(text,part.text,'pdf inline fragment changed');inlineContent.push({...part});
   }else if(part.type==='figure'){
    const g=groups.get(part.figureGroupId);if(!g||usedGroups.has(g.figureGroupId)||!r.parentFigureIds.includes(g.parentFigureId)||part.text!==g.text)throw Error('pdf_inline_figure_placement');usedGroups.add(g.figureGroupId);inlineContent.push({type:'figure',figureId:g.figureGroupId,text:g.text});
   }else throw Error('pdf_inline_part_type');
  }
  assert.deepEqual(sourceOrder,p.sourceBlockIds,'pdf inline source order');
  assert.equal(inlineContent.filter(s=>s.type==='text').map(s=>s.text).join(''),fullSource,'pdf inline continuous source order');
  for(const[id,text]of sourceTexts)if(ends.get(id)!==[...text].length)throw Error('pdf_inline_missing_text');
  assert.equal(inlineContent.map(s=>s.text).join(''),p.text,'pdf inline paragraph text');
  const base=originalBlocks[0];if(originalBlocks.filter(b=>b.type==='text').some(b=>b.unitId!==base.unitId||b.chapterId!==base.chapterId))throw Error('pdf_inline_cross_argument');
  replacements.set(indices[0],{...base,sourceBlockIds:p.sourceBlockIds,sourceText:fullSource,text:p.text,inlineContent,inlineFigureIds:inlineContent.filter(s=>s.figureId).map(s=>s.figureId),pdfInlineLayout:{sha256:layoutSha256,paragraph:index}});
  for(const n of indices)removed.add(n);
 }
 if(usedGroups.size!==groups.size)throw Error('pdf_inline_unplaced_group');
 const usedParents=new Set(layout.paragraphs.flatMap(p=>p.replacement.parentFigureIds));assert.deepEqual([...usedParents].sort(),[...replacedFigures].sort(),'pdf inline parent coverage');
 const figures=candidate.figures.flatMap(f=>!replacedFigures.has(f.figureId)?[f]:layout.figureGroups.filter(g=>g.parentFigureId===f.figureId).map(g=>({figureId:g.figureGroupId,sourceImageBlockIds:g.sourceImageBlockIds,kind:'tiles',caption:'原文句内牌例',transcription:g.text,unknowns:[],croppedImagePath:g.presentationAsset.path,croppedImageSha256:g.presentationAsset.sha256,presentationAsset:g.presentationAsset,imageProvenance:{kind:'derived-source-assets',method:'source-order-rgba-bottom-aligned-no-gap',sourceAssetSha256s:g.tiles.map(t=>t.asset.sha256)},pdfInlineLayout:{sha256:layoutSha256,parentFigureId:g.parentFigureId}})));
 return {...candidate,body:{...candidate.body,blocks:candidate.body.blocks.flatMap((b,i)=>replacements.has(i)?[replacements.get(i)]:removed.has(i)?[]:[b])},figures};
}
