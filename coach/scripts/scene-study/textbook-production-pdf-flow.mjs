// Source position evidence for PDF inline regions. The model still decides semantic
// paragraph order from the complete page; geometry is not a table/column parser.
const overlap=(a,b)=>Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const marker=/\[\[figure:([^\]\r\n]+)\]\]/g;
export function nativePdfRegions(sourceId,page,owners,padding=18){
  const rows=[],textFragments=[];
  for(const block of page.blocks.filter(b=>b.type==='text')){
    let offset=0;
    for(const [lineIndex,line] of (block.lines??[]).entries()){
      const fragment={type:'text',sourceBlockId:block.id,lineIndex,start:offset,end:offset+Array.from(line.text).length,text:line.text,bbox:line.bbox};offset=fragment.end;textFragments.push(fragment);
      if(!Array.isArray(line.bbox))throw Error('pdf_native_line_bbox_missing');
      const existing=rows.filter(row=>overlap(row.bbox,line.bbox)>=.6*Math.min(row.bbox[3]-row.bbox[1],line.bbox[3]-line.bbox[1]));
      if(existing.length>1)throw Error('pdf_native_text_row_ambiguous');
      if(existing.length)existing[0].tokens.push(fragment);
      else rows.push({bbox:[...line.bbox],tokens:[fragment]});
    }
  }
  const visualOrderWarnings=[];
  for(const block of page.blocks.filter(b=>b.type==='image')){
    const owner=owners.get(block.id);if(!owner||!Array.isArray(block.bbox))throw Error('pdf_native_image_owner_or_bbox_missing');
    const token={type:'image',sourceImageBlockId:block.id,bbox:block.bbox};
    const choices=rows.filter(row=>row.tokens.some(t=>t.type==='text'&&owners.get(t.sourceBlockId)?.unitId===owner.unitId)&&overlap(row.bbox,block.bbox)>0).map(row=>({row,score:overlap(row.bbox,block.bbox)/Math.min(row.bbox[3]-row.bbox[1],block.bbox[3]-block.bbox[1]),distance:Math.abs(row.bbox[1]+row.bbox[3]-block.bbox[1]-block.bbox[3])})).sort((a,b)=>b.score-a.score||a.distance-b.distance);
    if(block.bbox[3]-block.bbox[1]>40)visualOrderWarnings.push({sourceImageBlockId:block.id,reason:'tall image: complete-page visual reading required'});
    if(choices.length>1&&Math.abs(choices[0].score-choices[1].score)<.01)visualOrderWarnings.push({sourceImageBlockId:block.id,reason:'multiple native text rows overlap image; row assignment is position evidence only'});
    if(choices.length)choices[0].row.tokens.push(token);
    else {
      const imageRow=rows.find(row=>row.tokens.every(t=>t.type==='image'&&owners.get(t.sourceImageBlockId)?.unitId===owner.unitId)&&overlap(row.bbox,block.bbox)>.6*Math.min(row.bbox[3]-row.bbox[1],block.bbox[3]-block.bbox[1]));
      if(imageRow)imageRow.tokens.push(token);else rows.push({bbox:[...block.bbox],tokens:[token]});
    }
  }
  const nativeTokens=rows.sort((a,b)=>(a.bbox[1]+a.bbox[3])-(b.bbox[1]+b.bbox[3])).flatMap(row=>row.tokens.sort((a,b)=>a.bbox[0]-b.bbox[0]||a.bbox[2]-b.bbox[2]));
  const byId=new Map(page.blocks.map(b=>[b.id,b])),groups=[];let pending=[];
  function flush(){if(!pending.length)return;const blocks=pending.map(t=>byId.get(t.sourceImageBlockId)),owner=owners.get(blocks[0].id),bbox=[Math.min(...blocks.map(b=>b.bbox[0])),Math.min(...blocks.map(b=>b.bbox[1])),Math.max(...blocks.map(b=>b.bbox[2])),Math.max(...blocks.map(b=>b.bbox[3]))];groups.push({regionId:`${sourceId}-p${page.page}-r${groups.length+1}`,bbox:[Math.max(page.size[0],bbox[0]-padding),Math.max(page.size[1],bbox[1]-padding),Math.min(page.size[2],bbox[2]+padding),Math.min(page.size[3],bbox[3]+padding)],sourceImageBlockIds:blocks.map(b=>b.id),sourceImageSha256s:blocks.map(b=>b.imageSha256),unitId:owner.unitId,chapterId:owner.chapterId});pending=[];}
  for(const token of nativeTokens){if(token.type==='text'){if(token.text.trim()||(pending.length&&owners.get(pending[0].sourceImageBlockId).unitId!==owners.get(token.sourceBlockId)?.unitId))flush();continue;}if(pending.length&&owners.get(pending[0].sourceImageBlockId).unitId!==owners.get(token.sourceImageBlockId).unitId)flush();pending.push(token);}flush();
  const imageIds=page.blocks.filter(b=>b.type==='image').map(b=>b.id),seen=groups.flatMap(g=>g.sourceImageBlockIds);
  if(seen.length!==imageIds.length||new Set(seen).size!==imageIds.length||imageIds.some(id=>!seen.includes(id)))throw Error('pdf_native_image_partition_failed');
  for(const block of page.blocks.filter(b=>b.type==='text')){
    const fragments=nativeTokens.filter(t=>t.type==='text'&&t.sourceBlockId===block.id),expected=(block.lines??[]).map(l=>l.text).join('');
    const sourceOrder=[...fragments].sort((a,b)=>a.lineIndex-b.lineIndex);
    if(sourceOrder.map(f=>f.text).join('')!==expected||!same(sourceOrder.map(f=>f.lineIndex),(block.lines??[]).map((_,i)=>i)))throw Error('pdf_native_source_text_coverage_changed');
    if(!same(fragments.map(f=>f.lineIndex),sourceOrder.map(f=>f.lineIndex)))visualOrderWarnings.push({sourceBlockId:block.id,reason:'visual rows interleave native source lines; retain original block text and compare the complete page'});
  }
  return {schema:'coach-textbook-pdf-native-position-tokens/1',regions:groups,nativeTokens,sourceTextBlocks:page.blocks.filter(b=>b.type==='text').map(b=>({sourceBlockId:b.id,text:(b.lines??[]).map(l=>l.text).join('')})),visualOrderWarnings,semanticReadingOrder:'requires complete-page model comparison; native rows do not establish table/column semantics'};
}

export function parsePdfInlineParagraph(item,page,regions,figures,{japanese=false}={}){
  const sourceById=new Map(page.blocks.filter(b=>b.type==='text').map(b=>[b.id,(b.lines??[]).map(l=>l.text).join('')]));
  if(item.sourceBlockIds.some(id=>!sourceById.has(id)))throw Error('pdf_inline_unknown_text_source');
  const sourceText=item.sourceBlockIds.map(id=>sourceById.get(id)).join(''),matches=[...item.text.matchAll(marker)],inlineFigureIds=matches.map(m=>m[1]);
  if(new Set(inlineFigureIds).size!==inlineFigureIds.length)throw Error('pdf_inline_duplicate_region');
  if(!japanese&&item.text.replace(marker,'')!==sourceText)throw Error('pdf_inline_chinese_source_text_changed');
  const known=new Set(regions.map(r=>r.regionId)),byFigure=new Map(figures.map(f=>[f.regionId??f.figureId,f]));
  const inlineContent=[];let at=0;
  for(const match of matches){
    const id=match[1],figure=byFigure.get(id);if(!known.has(id)||!figure)throw Error('pdf_inline_unknown_region');
    if(typeof figure.caption!=='string'||!figure.caption.trim()||figure.caption.length>160)throw Error('pdf_inline_caption_must_be_readable_short_label');
    if(match.index>at)inlineContent.push({type:'text',text:item.text.slice(at,match.index)});
    inlineContent.push({type:'figure',figureId:id,text:figure.caption});at=match.index+match[0].length;
  }
  if(at<item.text.length)inlineContent.push({type:'text',text:item.text.slice(at)});
  if(item.text.replace(marker,'').includes('[[figure:'))throw Error('pdf_inline_malformed_marker');
  return {sourceText,text:inlineContent.map(p=>p.text).join(''),inlineContent,inlineFigureIds};
}

export function validatePdfInlineRegionCoverage(flow,regions){
  const ids=flow.flatMap(item=>item.kind==='figure'?[item.regionId]:[...item.text.matchAll(marker)].map(m=>m[1])),expected=regions.map(r=>r.regionId);
  if(ids.length!==expected.length||new Set(ids).size!==expected.length||expected.some(id=>!ids.includes(id)))throw Error('pdf_inline_regions_not_exactly_once');
}

export function validateChinesePdfNativeSlots(flow,nativePlan){
  const firstImageToRegion=new Map(nativePlan.regions.map(r=>[r.sourceImageBlockIds[0],r.regionId])),allImageIds=new Set(nativePlan.regions.flatMap(r=>r.sourceImageBlockIds));
  const expected=nativePlan.nativeTokens.map(token=>token.type==='text'?token.text:firstImageToRegion.has(token.sourceImageBlockId)?`[[figure:${firstImageToRegion.get(token.sourceImageBlockId)}]]`:allImageIds.has(token.sourceImageBlockId)?'':(()=>{throw Error('pdf_inline_unmapped_native_image');})()).join('');
  const actual=flow.map(item=>item.kind==='text'?item.text:`[[figure:${item.regionId}]]`).join('');
  if(actual!==expected)throw Error('pdf_inline_chinese_native_slot_order_changed');
}
