const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Display-only mapping. The audited candidate and original sourceSegments stay untouched. */
export function deriveInlineDisplay(candidate){
 const view=structuredClone(candidate),plan=candidate.provenance.revision?.inlineJapanese?.plan;
 if(!plan)return view;
 for(const b of view.body.blocks){
  const edits=plan.edits.filter(e=>b.sourceBlockIds?.length===1&&e.sourceBlockId===b.sourceBlockIds[0]);if(!edits.length)continue;
  const original=b.sourceText,segments=b.sourceSegments;
  if(!segments?.length||segments.map(s=>s.text).join('')!==original)throw Error('inline_display_source_segments_unaligned');
  const sorted=edits.map(e=>({...e,at:original.indexOf(e.quotedText)})).sort((a,b)=>a.at-b.at);let at=0,pattern='^';
  for(const e of sorted){if(e.at<at||original.split(e.quotedText).length!==2)throw Error('inline_display_nonunique_span');pattern+=escape(original.slice(at,e.at))+'('+ (e.operation==='gloss'?escape(e.quotedText)+'（[^（）]*）':'[\\s\\S]*?')+')';at=e.at+e.quotedText.length;}
  const m=new RegExp(pattern+escape(original.slice(at))+'$','u').exec(b.text);if(!m)throw Error('inline_display_text_outside_plan');
  const used=new Set();b.displaySegments=segments.map(s=>{let text=s.text;for(const [i,e] of sorted.entries())if(text.includes(e.quotedText)){if(used.has(i))throw Error('inline_display_duplicate_span');text=text.replace(e.quotedText,m[i+1]);used.add(i);}return {...s,text};});
  if(used.size!==edits.length||b.displaySegments.map(s=>s.text).join('')!==b.text)throw Error('inline_display_changed_surrounding_text');
 }
 return view;
}
