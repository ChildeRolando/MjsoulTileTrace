import {it,expect} from 'vitest';
import {composeWebTables} from './stage-web-tables.mjs';
import {composeWebParagraphs} from './stage-web-textbook.mjs';
import {renderTextbookBlocks} from '../scene-study/textbook-review.mjs';

it('keeps sentence-inline tiles together and resolves DOM columns after colspan',()=>{
 const url='https://example.org/inline-table',ids=['before','tiles','after','right'],raw=ids.map((id,i)=>({type:i===1?'figure':'p',id,page:null,paragraphId:i<3?'sentence':'right',locator:{url,sourceBlockIds:[id],domPaths:['main/table']},...(i===1?{src:'assets/tiles.png',caption:'原牌列',transcriptionText:'1m 2m 3m'}:{text:i===0?'持有':i===2?'时比较两种选择。':'右侧说明'})}));
 const source={url,blocks:ids.map(id=>({id})),tables:[{tableId:'t',domPath:'main/table',sourceBlockIds:ids,rows:[{row:0,cells:[{row:0,column:0,rowspan:'1',colspan:'2',empty:false,sourceBlockIds:ids.slice(0,3)},{row:0,column:1,rowspan:'1',colspan:'1',empty:false,sourceBlockIds:['right']}]}]}]};
 const out=composeWebTables(raw,source,'inline',composeWebParagraphs);
 expect(out).toHaveLength(2);expect(out[0].text).toBe('持有 123m 时比较两种选择。');expect(out[0].inlineFigures).toHaveLength(1);expect(out[0].locator.sourceBlockIds).toEqual(ids.slice(0,3));expect(out[1].tableCell).toMatchObject({column:2,sourceColumn:1,columnCount:3});
});

it('keeps each of eight graph/condition pairs in the original four by two cells',()=>{
 const source={url:'https://example.org/graphs',blocks:[],tables:[]},raw=[],rows=[];
 for(let row=0;row<4;row++){const cells=[];for(let column=0;column<2;column++){
  const id=`r${row}c${column}`,ids=[id+'graph',id+'condition'];
  for(const blockId of ids)source.blocks.push({id:blockId});
  const locator={url:source.url,sourceBlockIds:[ids[0]],domPaths:['main/table']};
  raw.push({type:'figure',id:ids[0],page:null,locator,src:'assets/graph.png',caption:'测试图',transcriptionText:`图${id}的完整数值转录`},{type:'p',id:ids[1],page:null,locator:{...locator,sourceBlockIds:[ids[1]]},text:`图${id}的适用条件`});
  cells.push({row,column,rowspan:'1',colspan:'1',empty:false,header:false,sourceBlockIds:ids});
 }rows.push({row,cells});}
 source.tables=[{tableId:'table',domPath:'main/table',captions:[],rows,sourceBlockIds:source.blocks.map(b=>b.id)}];
 const out=composeWebTables(raw,source,'sample',composeWebParagraphs);
 expect(out).toHaveLength(16);
 for(let n=0;n<8;n++){expect(out[n*2].tableCell).toMatchObject({row:Math.floor(n/2),column:n%2,fragmentIndex:0,fragmentCount:2});expect(out[n*2+1].tableCell).toMatchObject({row:Math.floor(n/2),column:n%2,fragmentIndex:1,fragmentCount:2});expect(out[n*2].transcriptionText).toContain(`r${Math.floor(n/2)}c${n%2}`);}
 const html=renderTextbookBlocks(out);expect(html.match(/<tr>/g)).toHaveLength(4);expect(html.match(/<td /g)).toHaveLength(8);expect(html.indexOf('r0c0的完整')).toBeLessThan(html.indexOf('r0c0的适用'));
});

it('keeps one caption, explicit blank cells, spans and reversible fragments in one cell',()=>{
 const url='https://example.org/table',locator=id=>({url,sourceBlockIds:[id],domPaths:['main/table']}),long='完整论证。'.repeat(400);
 const raw=[{type:'p',id:'caption',page:null,locator:locator('caption'),text:'表的完整标题'},{type:'p',id:'first',page:null,locator:locator('cell'),text:long.slice(0,1000)},{type:'p',id:'second',page:null,locator:locator('cell'),text:long.slice(1000)},{type:'p',id:'right',page:null,locator:locator('right'),text:'右格条件'}];
 const source={url,blocks:[{id:'caption'},{id:'cell'},{id:'right'}],tables:[{tableId:'t',domPath:'main/table',sourceBlockIds:['caption','cell','right'],captions:[{rawText:'表的完整标题',sourceBlockIds:['caption']}],rows:[{row:0,cells:[{row:0,column:0,rowspan:'2',colspan:'1',sourceBlockIds:['cell'],empty:false},{row:0,column:1,rowspan:'1',colspan:'1',sourceBlockIds:['right'],empty:false}]},{row:1,cells:[{row:1,column:1,rowspan:'1',colspan:'1',sourceBlockIds:[],empty:true}]}]}]};
 const out=composeWebTables(raw,source,'sample',composeWebParagraphs);
 expect(out.filter(b=>b.tableCaptionFor)).toHaveLength(1);expect(out.filter(b=>b.tableCell?.rowspan===2).map(b=>b.text).join('')).toBe(long);expect(out.at(-1)).toMatchObject({text:'（原表空白单元格）',tableCell:{row:1,column:1,empty:true}});
 const html=renderTextbookBlocks(out);expect(html.match(/<caption>/g)).toHaveLength(1);expect(html.match(/rowspan="2"/g)).toHaveLength(1);expect(html.match(/<td /g)).toHaveLength(3);
 source.tables[0].rows[1].cells[0].empty=false;expect(()=>composeWebTables(raw,source,'sample',composeWebParagraphs)).toThrow('nonempty_cell_missing');
});
