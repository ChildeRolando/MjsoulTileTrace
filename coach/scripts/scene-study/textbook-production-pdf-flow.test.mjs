import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {nativePdfRegions,parsePdfInlineParagraph,validatePdfInlineRegionCoverage,validateChinesePdfNativeSlots} from './textbook-production-pdf-flow.mjs';

describe('PDF source slots and complete translated paragraphs',()=>{
  it('separates image groups at actual source words and joins a continuous wrapped hand',()=>{
    const text=(id,bbox,value)=>({id,type:'text',bbox,lines:[{bbox,text:value}]}),image=(id,bbox)=>({id,type:'image',bbox,imageSha256:id});
    const page={page:1,size:[0,0,200,200],blocks:[text('t1',[0,0,10,10],'甲'),text('t2',[40,0,50,10],'和'),text('t3',[10,20,50,30],'这种形。'),image('a',[12,0,20,10]),image('b',[21,0,29,10]),image('c',[52,0,60,10]),image('d',[61,0,69,10]),image('e',[0,20,8,30]),image('f',[52,20,60,30])]},owners=new Map(page.blocks.map(b=>[b.id,{chapterId:'chapter',unitId:'unit'}]));
    const result=nativePdfRegions('source',page,owners,0);
    assert.deepEqual(result.regions.map(r=>r.sourceImageBlockIds),[['a','b'],['c','d','e'],['f']]);
    assert.equal(result.nativeTokens.filter(t=>t.type==='text').map(t=>t.text).join(''),'甲和这种形。');
    const otherOwners=new Map(owners);otherOwners.set('e',{chapterId:'other',unitId:'other'});assert.ok(nativePdfRegions('source',page,otherOwners).regions.every(r=>!r.sourceImageBlockIds.includes('d')||!r.sourceImageBlockIds.includes('e')));
    const spaced=structuredClone(page);spaced.blocks.push(text('blank',[30,0,39,10],' '));const spacedOwners=new Map(owners);spacedOwners.set('blank',{chapterId:'chapter',unitId:'unit'});assert.deepEqual(nativePdfRegions('source',spaced,spacedOwners).regions.map(r=>r.sourceImageBlockIds),[['a','b'],['c','d','e'],['f']]);
  });
  it('keeps original source codepoints while a whole Chinese paragraph contains its figure slot',()=>{
    const page={blocks:[{id:'t',type:'text',lines:[{text:'甲😀乙'}]}]},regions=[{regionId:'r'}],figures=[{regionId:'r',caption:'224m',transcription:'完整原图说明。'}];
    const item={kind:'text',sourceBlockIds:['t'],text:'甲😀[[figure:r]]乙'},parsed=parsePdfInlineParagraph(item,page,regions,figures);
    assert.equal(parsed.sourceText,'甲😀乙');assert.equal(parsed.text,'甲😀224m乙');assert.deepEqual(parsed.inlineFigureIds,['r']);assert.deepEqual(parsed.inlineContent.map(p=>p.type),['text','figure','text']);validatePdfInlineRegionCoverage([item],regions);
    const nativePlan={regions:[{regionId:'r',sourceImageBlockIds:['image']}],nativeTokens:[{type:'text',text:'甲😀'},{type:'image',sourceImageBlockId:'image'},{type:'text',text:'乙'}]};validateChinesePdfNativeSlots([item],nativePlan);assert.throws(()=>validateChinesePdfNativeSlots([{...item,text:'甲😀乙[[figure:r]]'}],nativePlan),/native_slot_order_changed/);
    assert.throws(()=>parsePdfInlineParagraph({...item,text:'改写[[figure:r]]乙'},page,regions,figures),/chinese_source_text_changed/);
    assert.throws(()=>parsePdfInlineParagraph({...item,text:'甲😀[[figure:other]]乙'},page,regions,figures),/unknown_region/);
    assert.throws(()=>validatePdfInlineRegionCoverage([item,{kind:'figure',regionId:'r'}],regions),/not_exactly_once/);
  });
  it('accepts explicitly translated Japanese whole paragraphs without slicing Chinese at Japanese offsets',()=>{
    const page={blocks:[{id:'t',type:'text',lines:[{text:'と違って打'}]}]},regions=[{regionId:'r'}],figures=[{regionId:'r',caption:'1344m'}];
    const item={kind:'text',sourceBlockIds:['t'],text:'与[[figure:r]]不同，本例若切'},result=parsePdfInlineParagraph(item,page,regions,figures,{japanese:true});
    assert.equal(result.text,'与1344m不同，本例若切');assert.equal(result.sourceText,'と違って打');
    assert.throws(()=>parsePdfInlineParagraph({...item,text:'与[[figure:r]]及[[figure:r]]不同'},page,regions,figures,{japanese:true}),/duplicate_region/);
    assert.throws(()=>parsePdfInlineParagraph({...item,text:'与[[figure:r不同'},page,regions,figures,{japanese:true}),/malformed_marker/);
  });
});
