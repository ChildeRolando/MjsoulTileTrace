/** Preserve real cells without flattening away blank slots or indexing captions twice. */
export function composeWebTables(raw,source,sourceId,composeParagraphs){
 if(!source.tables?.length)return composeParagraphs(raw,sourceId);
 const order=new Map(source.blocks.map((b,i)=>[b.id,i])),claimed=new Set(),parts=[];
 const selected=ids=>raw.filter(b=>b.locator.sourceBlockIds.some(id=>ids.includes(id)));
 for(const table of source.tables){
  const ids=new Set(table.sourceBlockIds),tableRaw=selected([...ids]);
  if(!tableRaw.length)throw Error('web_table_missing_body_position');
  for(const b of tableRaw){if(b.locator.sourceBlockIds.some(id=>!ids.has(id))||claimed.has(b.id))throw Error('web_table_crossed_source_boundary');claimed.add(b.id);}
  const rowCount=table.rows.length,positions=new Map(),occupied=new Set();let columnCount=0;
  // DOM cell order and spans determine visual columns; a DOM child index is not a visual column.
  for(const row of table.rows){let column=0;for(const cell of row.cells){
   const rowspan=Number(cell.rowspan),colspan=Number(cell.colspan);
   if(!Number.isInteger(rowspan)||!Number.isInteger(colspan)||rowspan<1||colspan<1||row.row+rowspan>rowCount)throw Error('web_table_invalid_span');
   while(occupied.has(`${row.row}:${column}`))column++;
   positions.set(cell,column);for(let r=row.row;r<row.row+rowspan;r++)for(let c=column;c<column+colspan;c++){const key=`${r}:${c}`;if(occupied.has(key))throw Error('web_table_overlapping_span');occupied.add(key);}
   column+=colspan;columnCount=Math.max(columnCount,column);
  }}
  const output=[],used=new Set();
  for(const caption of table.captions??[]){
   const blocks=selected(caption.sourceBlockIds);
   if(caption.rawText.trim()&&!blocks.length)throw Error('web_table_caption_missing');
   for(const b of blocks){if(b.type==='figure'||used.has(b.id))throw Error('web_table_caption_binding');used.add(b.id);output.push({...b,tableCaptionFor:table.tableId});}
  }
  for(const row of table.rows)for(const cell of row.cells){
   const blocks=selected(cell.sourceBlockIds),rowspan=Number(cell.rowspan),colspan=Number(cell.colspan);
   if(!Number.isInteger(rowspan)||!Number.isInteger(colspan)||rowspan<1||colspan<1)throw Error('web_table_invalid_span');
   if(!blocks.length&&!cell.empty)throw Error('web_table_nonempty_cell_missing');
   if(cell.empty&&blocks.some(b=>b.type==='figure'||b.text?.trim()))throw Error('web_table_empty_cell_changed');
   for(const b of blocks){if(used.has(b.id))throw Error('web_table_block_in_two_cells');used.add(b.id);}
   const fragments=blocks.length?composeParagraphs(blocks,`${sourceId}-t${parts.length}-r${row.row}-c${cell.column}`):[{type:'p',id:`${sourceId}-empty-r${row.row}-c${cell.column}-t${parts.length}`,page:null,text:'（原表空白单元格）',locator:{url:source.url,sourceBlockIds:[table.tableId],domPaths:[table.domPath]}}];
   for(const [fragmentIndex,b] of fragments.entries()){
    output.push({...b,tableCell:{tableId:table.tableId,row:cell.row,column:positions.get(cell),sourceColumn:cell.column,rowspan,colspan,rowCount,columnCount,header:Boolean(cell.header),empty:Boolean(cell.empty),fragmentIndex,fragmentCount:fragments.length}});
   }
  }
  if(tableRaw.some(b=>!used.has(b.id)))throw Error('web_table_unassigned_source_block');
  parts.push({offset:Math.min(...[...ids].map(id=>order.get(id))),blocks:output});
 }
 const outside=composeParagraphs(raw.filter(b=>!claimed.has(b.id)),sourceId);
 for(const b of outside)parts.push({offset:Math.min(...b.locator.sourceBlockIds.map(id=>order.get(id))),blocks:[b]});
 if(parts.some(p=>!Number.isFinite(p.offset)))throw Error('web_table_unknown_source_order');
 return parts.sort((a,b)=>a.offset-b.offset).flatMap(p=>p.blocks);
}
