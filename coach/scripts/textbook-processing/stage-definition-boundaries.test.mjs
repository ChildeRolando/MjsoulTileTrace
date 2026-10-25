import {it,expect} from 'vitest';
import {applyDefinitionBoundaries} from './stage-definition-boundaries.mjs';
import {composeWebParagraphs} from './stage-web-textbook.mjs';

it('separates the original dt example from the dd drawn tile and keeps the explanatory sentence intact',()=>{
 const tiles=['1m','2m','5m','6m','4m'].map((code,i)=>({occurrenceId:'o'+i,code}));
 const figure={figureId:'f',sourceOccurrenceIds:tiles.map(t=>t.occurrenceId),tiles,transcription:tiles.map(t=>t.code).join(' '),sourceAssetBindings:[],provenance:{method:'audited-dictionary'}};
 const candidate={body:{blocks:[{type:'figure',figureId:'f',sourceBlockIds:['b1'],paragraphId:'collapsed-dl'},{type:'text',sourceBlockIds:['b2'],paragraphId:'collapsed-dl',sourceText:'引いた後',text:'摸入后变成嵌张。'}]},figures:[figure]},source={blocks:[{id:'b1'},{id:'b2'}]};
 const groups=[{definitionUnitId:'dt1',domBoundary:'main/dl[1]/dt[1]',tiles:tiles.slice(0,4)},{definitionUnitId:'dd1',domBoundary:'main/dl[1]/dd[1]',tiles:tiles.slice(4)}].map(g=>({...g,sourceOccurrenceIds:g.tiles.map(t=>t.occurrenceId),sourceAssetBindings:[],transcription:g.tiles.map(t=>t.code).join(' '),presentationAsset:{path:g.definitionUnitId+'.png'}}));
 const sidecar={schema:'coach-textbook-definition-boundary-sidecar/1',heldTextBlocks:[],blocks:[{sourceBlockId:'b1',type:'image-run',groups},{sourceBlockId:'b2',type:'text',definitionUnitId:'dd1',domBoundary:'main/dl[1]/dd[1]'}]};
 const out=applyDefinitionBoundaries(candidate,source,sidecar,'a'.repeat(64));expect(out.body.blocks.map(b=>b.paragraphId)).toEqual(['dt1','dd1','dd1']);expect(candidate.body.blocks).toHaveLength(2);
 const raw=out.body.blocks.map((b,i)=>({...b,id:'r'+i,type:b.type==='text'?'p':'figure',transcriptionText:out.figures.find(f=>f.figureId===b.figureId)?.transcription,locator:{url:'https://example.org',sourceBlockIds:b.sourceBlockIds,domPaths:[b.definitionDomBoundary]}}));
 const paragraphs=composeWebParagraphs(raw,'sample');expect(paragraphs).toHaveLength(2);expect(paragraphs[1].text).toBe(' 4m 摸入后变成嵌张。');expect(paragraphs[0].transcriptionText).toBe('1m 2m 5m 6m');
 const duplicate=structuredClone(sidecar);duplicate.blocks[0].groups[1].sourceOccurrenceIds=['o0'];expect(()=>applyDefinitionBoundaries(candidate,source,duplicate,'a'.repeat(64))).toThrow('occurrence partition');
 expect(()=>applyDefinitionBoundaries(candidate,source,{...sidecar,heldTextBlocks:[{sourceBlockId:'b2'}]},'a'.repeat(64))).toThrow('unresolved');
});

it('requires exact accepted Chinese and source text partitions, preserving source emphasis once',()=>{
 const candidate={body:{blocks:[{type:'text',sourceBlockIds:['b1'],sourceText:'（三面張） 説明',text:'（*三面听*） 说明',sourceSegments:[{text:'（三面張） 説明',marks:['dfn::']}]}]},figures:[]},source={blocks:[{id:'b1'}]};
 const sidecar={schema:'coach-textbook-definition-boundary-sidecar/1',heldTextBlocks:[],textBoundaryAcceptance:{path:'accepted.json'},blocks:[{sourceBlockId:'b1',type:'text',groups:[{definitionUnitId:'dt1',sourceText:'（三面張）',translatedText:'（*三面听*）',sourceSegments:[{text:'（三面張）',marks:['dfn::']}]},{definitionUnitId:'dd1',sourceText:' 説明',translatedText:' 说明',sourceSegments:[{text:' 説明',marks:['dfn::']}]}]}]};
 const result=applyDefinitionBoundaries(candidate,source,sidecar,'a'.repeat(64));expect(result.body.blocks.map(b=>b.text).join('')).toBe(candidate.body.blocks[0].text);expect(result.body.blocks.flatMap(b=>b.sourceSegments).map(s=>s.text).join('')).toBe(candidate.body.blocks[0].sourceText);
 const broken=structuredClone(sidecar);broken.blocks[0].groups[0].translatedText+='重复';expect(()=>applyDefinitionBoundaries(candidate,source,broken,'a'.repeat(64))).toThrow('translated text loss');
 const unsigned=structuredClone(sidecar);delete unsigned.textBoundaryAcceptance;expect(()=>applyDefinitionBoundaries(candidate,source,unsigned,'a'.repeat(64))).toThrow('not_accepted');
});
