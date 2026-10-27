import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {checkNativePdfInlineContent} from './textbook-audit-pdf-native.mjs';
import {verifyNativePageStructureCorrection} from './textbook-audit-pdf-native-structure-corrections.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const union=blocks=>[Math.min(...blocks.map(b=>b.bbox[0])),Math.min(...blocks.map(b=>b.bbox[1])),Math.max(...blocks.map(b=>b.bbox[2])),Math.max(...blocks.map(b=>b.bbox[3]))];

function fixture(){
 const lines=(id,texts,offsetY)=>texts.map((text,lineIndex)=>({text,bbox:[5,offsetY,9,offsetY+4],lineIndex}));
 const textBlocks=[
  {id:'t1',type:'text',lines:[{text:'例：',bbox:[5,5,9,9]},{text:'　ポン',bbox:[95,5,99,9]},{text:'　→打',bbox:[135,5,139,9]}]},
  {id:'t2',type:'text',lines:[{text:'尾',bbox:[5,60,9,64]}]},
 ];
 const images=[
  {id:'i1',bbox:[10,10,60,20]},{id:'i2',bbox:[70,10,90,20]},{id:'i3',bbox:[110,10,140,20]},
  {id:'i4',bbox:[10,20,60,30]},{id:'i5',bbox:[70,20,90,30]},{id:'i6',bbox:[110,20,140,30]},
  {id:'i7',bbox:[10,100,140,120]},
 ].map(b=>({...b,type:'image',imageSha256:hash(b.id)}));
 const page={sourceId:'nemata-jp',page:7,size:[0,0,200,200],blocks:[...textBlocks,...images]};
 const by=new Map(page.blocks.map(b=>[b.id,b]));
 const region=(regionId,ids,unitId='u',chapterId='c')=>{const bs=ids.map(id=>by.get(id));return {regionId,bbox:union(bs),sourceImageBlockIds:ids,sourceImageSha256s:bs.map(b=>b.imageSha256),unitId,chapterId};};
 const plan={schema:'coach-textbook-pdf-native-position-tokens/1',sourceId:'nemata-jp',page:7,pageDataSha256:'page-sha',helperSha256:'helper',visualOrderWarnings:[],semanticReadingOrder:'review',regions:[region('r1',['i1','i2','i3']),region('r2',['i4','i5','i6']),region('r9',['i7'])],sourceTextBlocks:textBlocks.map(b=>({sourceBlockId:b.id,text:b.lines.map(l=>l.text).join('')}))};
 const textTokens=[],lineTokens=new Map();
 for(const block of textBlocks){let offset=0;for(const [lineIndex,l] of block.lines.entries()){const end=offset+[...l.text].length;const token={type:'text',sourceBlockId:block.id,lineIndex,start:offset,end,text:l.text,bbox:l.bbox};textTokens.push(token);lineTokens.set(block.id+':'+lineIndex,token);offset=end;}}
 const token=id=>({type:'image',sourceImageBlockId:id,bbox:by.get(id).bbox});
 plan.nativeTokens=[token('i1'),token('i2'),token('i3'),token('i4'),token('i5'),token('i6'),lineTokens.get('t1:0'),lineTokens.get('t1:1'),lineTokens.get('t1:2'),lineTokens.get('t2:0'),token('i7')];

 const raw={pageFlow:[{kind:'text',sourceBlockIds:['t1'],text:'例：[[figure:r1]][[figure:r2]]→打。'},{kind:'text',sourceBlockIds:['t2'],text:'尾[[figure:r9]]'}],figures:[
  {regionId:'r1',kind:'mahjong-example',transcription:'第一例上部切片',unknowns:[],caption:'第一例上部'},
  {regionId:'r2',kind:'mahjong-example',transcription:'第一例下部切片',unknowns:[],caption:'第一例下部'},
  {regionId:'r9',kind:'mahjong-example',transcription:'无关牌图',unknowns:[],caption:'尾图'},
 ]};
 const baseline={path:'production/p/raw-calls/call.json',sha256:'raw-sha'};
 const canonicalFigure=f=>JSON.stringify({regionId:f.regionId,kind:f.kind,transcription:f.transcription,unknowns:f.unknowns,caption:f.caption});
 const canonicalFlow=f=>JSON.stringify({sourceBlockIds:f.sourceBlockIds,text:f.text});
 const untouchedFigures=raw.figures.filter(f=>!['r1','r2'].includes(f.regionId));
 const untouchedFlow=raw.pageFlow.filter(f=>f.sourceBlockIds.join(',')!=='t1');
 const replacedFigures=[
  {figureId:'r1',bbox:plan.regions[0].bbox,sourceImageBlockIds:['i1','i2','i3'],sourceImageSha256s:plan.regions[0].sourceImageSha256s,kind:'mahjong-example',transcription:'第一例上部切片',unknowns:[],caption:'第一例上部'},
  {figureId:'r2',bbox:plan.regions[1].bbox,sourceImageBlockIds:['i4','i5','i6'],sourceImageSha256s:plan.regions[1].sourceImageSha256s,kind:'mahjong-example',transcription:'第一例下部切片',unknowns:[],caption:'第一例下部'},
 ];
 const newFigures=[
  {readingOrder:0,figureId:'A',bbox:union([by.get('i1'),by.get('i4')]),sourceImageBlockIds:['i1','i4'],sourceImageSha256s:[hash('i1'),hash('i4')],kind:'mahjong-example',transcription:'手牌',unknowns:[],caption:'手牌',chapterId:'c',unitId:'u',crop:{path:'production/x/renders/page-0007-A.png',sha256:'crop-a'},sourceEvidence:'strips i1/i4'},
  {readingOrder:1,figureId:'B',bbox:union([by.get('i2'),by.get('i5')]),sourceImageBlockIds:['i2','i5'],sourceImageSha256s:[hash('i2'),hash('i5')],kind:'mahjong-example',transcription:'碰，左端未知',unknowns:['左端不可读'],caption:'碰牌',chapterId:'c',unitId:'u',crop:{path:'production/x/renders/page-0007-B.png',sha256:'crop-b'},sourceEvidence:'strips i2/i5'},
  {readingOrder:2,figureId:'C',bbox:union([by.get('i3'),by.get('i6')]),sourceImageBlockIds:['i3','i6'],sourceImageSha256s:[hash('i3'),hash('i6')],kind:'mahjong-example',transcription:'弃牌',unknowns:[],caption:'打牌',chapterId:'c',unitId:'u',crop:{path:'production/x/renders/page-0007-C.png',sha256:'crop-c'},sourceEvidence:'strips i3/i6'},
 ];
 const diff={schema:'coach-native-page-structure-diff/1',sourceId:'nemata-jp',page:7,parentSha256:'parent-sha',sourcePageDataSha256:'page-sha',regionPadding:0,baseline,replacedFigures,newFigures,flowChanges:[{
  sourceBlockIds:['t1'],fromRawSlotText:'例：[[figure:r1]][[figure:r2]]→打。',toRawSlotText:'例：[[figure:A]]碰[[figure:B]]→打[[figure:C]]',
  fromFigureIds:['r1','r2'],toFigureIds:['A','B','C'],markerLineIndexes:[0,1,2],textReplacements:[{from:'例：→打。',to:'例：碰→打',occurrences:1}],sourceEvidence:'source rows carry hand, pon and discard as separate column groups',
 }],unaffected:{figureCount:untouchedFigures.length,figureDigest:hash(JSON.stringify(untouchedFigures.map(canonicalFigure))),flowCount:untouchedFlow.length,flowDigest:hash(JSON.stringify(untouchedFlow.map(canonicalFlow)))}};
 const captionById=new Map(newFigures.map(f=>[f.figureId,f.caption]));
 const finalCaptions=new Map([...newFigures.map(f=>[f.figureId,f.caption]),['r9','尾图']]);
 const rawSlot=diff.flowChanges[0].toRawSlotText,parts=[];let at=0;
 for(const match of rawSlot.matchAll(/\[\[figure:([^\]\r\n]+)\]\]/g)){if(match.index>at)parts.push({type:'text',text:rawSlot.slice(at,match.index)});parts.push({type:'figure',figureId:match[1],text:captionById.get(match[1])});at=match.index+match[0].length;}
 if(at<rawSlot.length)parts.push({type:'text',text:rawSlot.slice(at)});
 const candidate={
  schema:'coach-textbook-page-draft/3',status:'draft',
  source:{sourceId:'nemata-jp',page:7,pageDataSha256:'page-sha'},
  provenance:{flowMode:'native-source-inline-slots',nativeSourceFlow:{path:'plan.json',sha256:'plan-sha'}},
  body:{language:'zh-CN',mode:'translated',flowOrder:'model-inline-source-regions',blocks:[
   {type:'text',sourceBlockIds:['t1'],chapterId:'c',unitId:'u',titleSource:false,sourceText:'例：　ポン　→打',rawSlotText:rawSlot,text:parts.map(p=>p.text).join(''),inlineContent:parts,inlineFigureIds:['A','B','C']},
   {type:'text',sourceBlockIds:['t2'],chapterId:'c',unitId:'u',titleSource:false,sourceText:'尾',rawSlotText:'尾[[figure:r9]]',text:'尾尾图',inlineContent:[{type:'text',text:'尾'},{type:'figure',figureId:'r9',text:'尾图'}],inlineFigureIds:['r9']},
  ]},
  figures:[...newFigures.map(f=>({figureId:f.figureId,bbox:f.bbox,chapterId:'c',unitId:'u',sourceImageBlockIds:f.sourceImageBlockIds,sourceImageSha256s:f.sourceImageSha256s,kind:f.kind,transcription:f.transcription,unknowns:f.unknowns,caption:f.caption})),{figureId:'r9',bbox:plan.regions[2].bbox,chapterId:'c',unitId:'u',sourceImageBlockIds:['i7'],sourceImageSha256s:[hash('i7')],kind:'mahjong-example',transcription:'无关牌图',unknowns:[],caption:'尾图'}],
 };
 const n={schema:'coach-native-page-structure-correction/1',sourceId:'nemata-jp',page:7,parentPath:'production/p/candidates/nemata-jp/page-0007.json',parentSha256:'parent-sha',notesPath:'audit/pages/nemata-jp/page-0007.parent.json',notesSha256:'notes-sha',originalProductionRaw:baseline,sourcePageDataSha256:'page-sha',newProductionModelCalls:0,structureDiffPath:'audit/source-corrections/diffs/d.json',structureDiffSha256:'diff-sha'};
 candidate.provenance.sourceStructureCorrection=n;
 const job={schema:'coach-native-page-structure-correction-job/1',sourceId:'nemata-jp',page:7,candidatePath:'production/x/candidates/nemata-jp/page-0007.json',candidateSha256:'candidate-sha',parentPath:n.parentPath,parentSha256:'parent-sha',originalAuditPath:n.notesPath,originalAuditSha256:'notes-sha',originalProductionRaw:baseline,sourcePagePath:'nemata-jp/pages/7.json',sourcePageDataSha256:'page-sha',structureDiffPath:n.structureDiffPath,structureDiffSha256:'diff-sha',proofPath:'audit/source-corrections/proofs/p.json',proofSha256:'proof-sha',originalReviewErrors:['visual_reading_flow_not_faithful','needs-repair:t1']};
 const approval={schema:'coach-native-page-structure-corrections-approval/1',status:'accepted-exact-native-page-structure-only',approvedBy:'root',approvedAt:'2026-10-27T00:00:00.000Z',jobs:[job]};
 const structureProof={schema:'coach-native-page-structure-correction-proof/1',candidateSha256:'candidate-sha',parentSha256:'parent-sha',parentPath:n.parentPath,originalAudit:{path:n.notesPath,sha256:'notes-sha',status:'needs-repair'},originalProductionRaw:baseline,sourcePage:{path:'nemata-jp/pages/7.json',sha256:'page-sha'},structureDiff:{path:n.structureDiffPath,sha256:'diff-sha'}};
 const parent={source:{sourceId:'nemata-jp',page:7}};
 const apply=diffOverride=>verifyNativePageStructureCorrection({candidate,parent,baselineRaw:raw,page,plan,approval,job,diff:diffOverride??diff,structureProof,candidateSha256:'candidate-sha'});
 return {candidate,parent,raw,page,plan,approval,job,diff,structureProof,apply,captionById};
}

it('rebuilds the corrected raw and plan from the preserved slices and passes the global gate',()=>{
 const f=fixture(),{correctedRaw,correctedPlan}=f.apply();
 expect(correctedRaw.figures.map(x=>x.regionId).sort()).toEqual(['A','B','C','r9']);
 expect(correctedPlan.regions.map(r=>r.regionId).sort()).toEqual(['A','B','C','r9']);
 expect(correctedRaw.pageFlow[0].text).toBe('例：[[figure:A]]碰[[figure:B]]→打[[figure:C]]');
 expect(()=>checkNativePdfInlineContent(f.candidate,f.page,correctedPlan,correctedRaw)).not.toThrow();
});

it('rejects a new region that leaves a replaced source block unassigned',()=>{
 const f=fixture(),bad=structuredClone(f.diff);
 bad.newFigures[2].sourceImageBlockIds=['i3'];
 bad.newFigures[2].sourceImageSha256s=[hash('i3')];
 bad.newFigures[2].bbox=f.page.blocks.find(b=>b.id==='i3').bbox;
 expect(()=>f.apply(bad)).toThrow('audit_native_structure_missing_block');
});

it('rejects a source block claimed by two new regions',()=>{
 const f=fixture(),bad=structuredClone(f.diff);
 bad.newFigures[0].sourceImageBlockIds=['i1','i4','i2'];
 bad.newFigures[0].sourceImageSha256s=[hash('i1'),hash('i4'),hash('i2')];
 bad.newFigures[0].bbox=union(['i1','i4','i2'].map(id=>f.page.blocks.find(b=>b.id===id)));
 expect(()=>f.apply(bad)).toThrow('audit_native_structure_duplicate_block');
});

it('rejects a wrong source image SHA',()=>{
 const f=fixture(),bad=structuredClone(f.diff);
 bad.newFigures[0].sourceImageSha256s[0]='f'.repeat(64);
 expect(()=>f.apply(bad)).toThrow('audit_native_structure_source_sha');
});

it('rejects an invented region bbox',()=>{
 const f=fixture(),bad=structuredClone(f.diff);
 bad.newFigures[1].bbox=[0,0,199,199];
 expect(()=>f.apply(bad)).toThrow('audit_native_structure_region_bbox');
});

it('rejects a reading order that contradicts the source columns',()=>{
 const f=fixture(),bad=structuredClone(f.diff);
 bad.newFigures[0].readingOrder=2;bad.newFigures[2].readingOrder=0;
 expect(()=>f.apply(bad)).toThrow('audit_native_structure_reading_order');
});

it('rejects a text change that is not in the explicit replacement list',()=>{
 const f=fixture(),bad=structuredClone(f.diff);
 bad.flowChanges[0].toRawSlotText='例：[[figure:A]]吃[[figure:B]]→打[[figure:C]]';
 expect(()=>f.apply(bad)).toThrow('audit_native_structure_flow_text_changed');
});

it('rejects a marker anchored outside the source block lines',()=>{
 const f=fixture(),bad=structuredClone(f.diff);
 bad.flowChanges[0].markerLineIndexes=[0,1,7];
 expect(()=>f.apply(bad)).toThrow('audit_native_structure_marker_position');
});

it('rejects a replaced figure record that no longer matches the preserved raw',()=>{
 const f=fixture(),bad=structuredClone(f.diff);
 bad.replacedFigures[0].transcription='改过';
 expect(()=>f.apply(bad)).toThrow('audit_native_structure_replaced_figure_changed');
});

it('rejects an unaffected figure digest that no longer matches the preserved raw',()=>{
 const f=fixture(),bad=structuredClone(f.diff);
 bad.unaffected.figureDigest='0'.repeat(64);
 expect(()=>f.apply(bad)).toThrow('audit_native_structure_unaffected_figures_changed');
});

it('rejects a wrong parent candidate SHA',()=>{
 const f=fixture();
 f.candidate.provenance.sourceStructureCorrection.parentSha256='other';
 expect(()=>f.apply()).toThrow('audit_native_structure_scope');
});

it('rejects a candidate structural change that the diff did not declare',()=>{
 const f=fixture(),{correctedRaw,correctedPlan}=f.apply();
 const tampered=structuredClone(f.candidate);
 tampered.figures.find(x=>x.figureId==='A').bbox=[0,0,1,1];
 expect(()=>checkNativePdfInlineContent(tampered,f.page,correctedPlan,correctedRaw)).toThrow('audit_native_pdf_region_binding');
});

it('rejects a candidate figure that changes a field the raw preserves',()=>{
 const f=fixture(),{correctedRaw,correctedPlan}=f.apply();
 const tampered=structuredClone(f.candidate);
 tampered.figures.find(x=>x.figureId==='B').unknowns=[];
 expect(()=>checkNativePdfInlineContent(tampered,f.page,correctedPlan,correctedRaw)).toThrow('audit_native_pdf_raw_figure_changed');
});

it('rejects a candidate paragraph edit outside the approved flow diff',()=>{
 const f=fixture(),{correctedRaw,correctedPlan}=f.apply();
 const tampered=structuredClone(f.candidate);
 const block=tampered.body.blocks.find(b=>b.sourceBlockIds.includes('t2'));
 block.rawSlotText='尾改[[figure:r9]]';
 block.text='尾改尾图';
 block.inlineContent=[{type:'text',text:'尾改'},{type:'figure',figureId:'r9',text:'尾图'}];
 expect(()=>checkNativePdfInlineContent(tampered,f.page,correctedPlan,correctedRaw)).toThrow('audit_native_pdf_raw_flow_changed');
});
