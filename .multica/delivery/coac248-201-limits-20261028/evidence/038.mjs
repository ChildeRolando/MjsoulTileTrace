import assert from 'node:assert/strict';

/** Apply independently checked DOM partitions to presentation only; paid drafts remain immutable. */
export function applyDefinitionBoundaries(candidate,source,sidecar,sidecarSha256){
 if(sidecar.schema!=='coach-textbook-definition-boundary-sidecar/1'||sidecar.heldTextBlocks?.length)throw Error('definition_sidecar_unresolved');
 assert.deepEqual(sidecar.blocks.map(b=>b.sourceBlockId),source.blocks.map(b=>b.id),'definition source coverage');
 const bindings=new Map(sidecar.blocks.map(b=>[b.sourceBlockId,b])),figures=new Map(candidate.figures.map(f=>[f.figureId,f])),body=[],outputFigures=[];
 for(const block of candidate.body.blocks){
  if(block.sourceBlockIds.length!==1)throw Error('definition_block_source_ambiguity');
  const binding=bindings.get(block.sourceBlockIds[0]);if(!binding)throw Error('definition_source_missing');
  if(block.type==='text'){
   if(binding.type!=='text')throw Error('definition_type_mismatch');
   if(binding.groups){
    if(!sidecar.textBoundaryAcceptance)throw Error('definition_text_split_not_accepted');
    assert.equal(binding.groups.map(g=>g.translatedText).join(''),block.text,'definition translated text loss');
    assert.equal(binding.groups.map(g=>g.sourceText).join(''),block.sourceText,'definition original text loss');
    assert.equal(binding.groups.flatMap(g=>g.sourceSegments).map(s=>s.text).join(''),block.sourceText,'definition source marks loss');
    for(const g of binding.groups)body.push({...block,text:g.translatedText,sourceText:g.sourceText,sourceSegments:g.sourceSegments,paragraphId:g.definitionUnitId,definitionDomBoundary:g.domBoundary});
   }else body.push({...block,paragraphId:binding.definitionUnitId??block.paragraphId,definitionDomBoundary:binding.domBoundary});
  }else if(block.type==='figure'){
   const f=figures.get(block.figureId);if(binding.type!=='image-run'||!f||!binding.groups?.length)throw Error('definition_figure_missing');
   assert.deepEqual(binding.groups.flatMap(g=>g.sourceOccurrenceIds),f.sourceOccurrenceIds,'definition occurrence partition');
   if(binding.groups.length>1){
    assert.deepEqual(binding.groups.flatMap(g=>g.tiles),f.tiles,'definition tile partition');
    assert.equal(binding.groups.map(g=>g.transcription).join(' '),f.transcription,'definition tile code loss');
   }
   for(const [index,g]of binding.groups.entries()){
    const figureId=binding.groups.length===1?f.figureId:`${f.figureId}:definition-${index+1}`;
    outputFigures.push({...f,figureId,sourceOccurrenceIds:g.sourceOccurrenceIds,sourceAssetBindings:g.sourceAssetBindings,tiles:g.tiles,transcription:g.transcription,presentationAsset:g.presentationAsset,provenance:{...f.provenance,definitionBoundary:{sidecarSha256,originalFigureId:f.figureId,group:index,domBoundary:g.domBoundary}}});
    body.push({...block,figureId,paragraphId:g.definitionUnitId??block.paragraphId,definitionDomBoundary:g.domBoundary});
   }
  }else throw Error('definition_unknown_block');
 }
 return {...candidate,body:{...candidate.body,blocks:body},figures:outputFigures};
}
