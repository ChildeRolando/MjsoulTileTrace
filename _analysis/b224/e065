import {TEXTBOOK_LIMITS} from '@riichi-coach/contracts';
import {textbookFigureMetadata} from '../scene-study/compile-textbook-corpus.mjs';
/** Transport slices only; callers keep every slice in the same complete argument. */
export function splitInlineParagraph(block,unitId){
 if(!block.inlineFigures?.length)return [block];
 const figures=new Map(block.inlineFigures.map(f=>[f.id,f])),budget=TEXTBOOK_LIMITS.maxResultBytes-4500;
 function make(segments,index){const inlineFigures=segments.filter(s=>s.figureId).map(s=>figures.get(s.figureId));if(inlineFigures.some(f=>!f))throw Error('inline_chunk_unknown_figure');const locators=block.locator?segments.map(s=>s.locator??block.locator):[],locator=block.locator?{url:block.locator.url,sourceBlockIds:[...new Set(locators.flatMap(l=>l.sourceBlockIds))],domPaths:[...new Set(locators.flatMap(l=>l.domPaths??[]))]}:null;return {...block,id:`${block.id}-slice${index+1}`,text:segments.map(s=>s.text).join(''),...(locator?{locator}:{}),inlineContent:segments,inlineFigures,sourceSegments:segments.flatMap(s=>s.sourceSegments??[])};}
 function size(b){return Buffer.byteLength(JSON.stringify({type:b.type,id:b.id,page:b.page,locator:b.locator,text:b.text,inlineFigures:b.inlineFigures.map(f=>textbookFigureMetadata(f,unitId,'0'.repeat(64)))}));}
 if(size(block)<=budget)return [block];
 const parts=[];
 for(const s of block.inlineContent){if(s.figureId){parts.push(s);continue;}for(let from=0;from<s.text.length;from+=1200){const text=s.text.slice(from,from+1200);let offset=0;const displaySegments=s.displaySegments?.flatMap(seg=>{const start=Math.max(from,offset),end=Math.min(from+text.length,offset+seg.text.length);offset+=seg.text.length;return start<end?[{...seg,text:seg.text.slice(start-offset+seg.text.length,end-offset+seg.text.length)}]:[];});let sourceSegments;
 if(s.sourceSegments?.map(x=>x.text).join('')===s.text){let sourceOffset=0;sourceSegments=s.sourceSegments.flatMap(segment=>{const start=Math.max(from,sourceOffset),end=Math.min(from+text.length,sourceOffset+segment.text.length);const segmentStart=sourceOffset;sourceOffset+=segment.text.length;return start<end?[{...segment,text:segment.text.slice(start-segmentStart,end-segmentStart)}]:[];});}
 else sourceSegments=from===0?s.sourceSegments:[]; // A translation has no invented source-character alignment; retain its source once.
 parts.push({...s,text,displaySegments,sourceSegments,...(s.sourceFragments?{sourceFragments:from===0?s.sourceFragments:[]}:{} )});}}
 const chunks=[];let current=[];
 for(const part of parts){const next=[...current,part];if(size(make(next,chunks.length))>budget){if(!current.length)throw Error('inline_figure_over_budget');chunks.push(make(current,chunks.length));current=[part];if(size(make(current,chunks.length))>budget)throw Error('inline_figure_over_budget');}else current=next;}
 if(current.length)chunks.push(make(current,chunks.length));
 if(chunks.map(c=>c.text).join('')!==block.text||JSON.stringify(chunks.flatMap(c=>c.inlineFigures.map(f=>f.id)))!==JSON.stringify(block.inlineFigures.map(f=>f.id)))throw Error('inline_chunk_content_changed');
 return chunks;
}
