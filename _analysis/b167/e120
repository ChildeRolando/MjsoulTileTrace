import assert from 'node:assert/strict';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Conservative wire subset; cardinality, nonempty text and exact arrays are enforced below, before candidate creation.
export function webProductionSchema({textIds=[],figureIds=[],fixedFigure=null}){
 const text={type:'object',additionalProperties:false,properties:{sourceBlockId:{type:'string',...(textIds.length?{enum:textIds}:{})},text:{type:'string'}},required:['sourceBlockId','text']};
 const fields={sourceBlockId:{type:'string',...(figureIds.length?{enum:figureIds}:{})},kind:{type:'string',enum:fixedFigure?[fixedFigure.kind]:['mahjong-example','chart','table','diagram','illustration','other']},transcription:{type:'string'},unknowns:{type:'array',items:{type:'string'}},caption:{type:'string',...(fixedFigure?{enum:[fixedFigure.caption]}:{})},sourceNotes:{type:'array',items:{type:'string'}}};
 const schema={type:'object',additionalProperties:false,properties:{translations:{type:'array',items:text},figures:{type:'array',items:{type:'object',additionalProperties:false,properties:fields,required:Object.keys(fields)}}},required:['translations','figures']};
 assertPortableProductionSchema(schema);return schema;
}
export function assertPortableProductionSchema(node,path='$'){
 if(!node||typeof node!=='object'||Array.isArray(node))throw Error('production_schema_invalid:'+path);
 const allowed=new Set(['type','properties','required','additionalProperties','items','enum']);
 for(const k of Object.keys(node))if(!allowed.has(k))throw Error('production_schema_nonportable_keyword:'+path+'.'+k);
 if(node.enum&&(!Array.isArray(node.enum)||!node.enum.length||node.enum.some(v=>typeof v!=='string')||node.type!=='string'))throw Error('production_schema_nonportable_enum:'+path);
 if(node.type==='object'){
  if(node.additionalProperties!==false||!node.properties||!same([...node.required??[]].sort(),Object.keys(node.properties).sort()))throw Error('production_schema_object_keys:'+path);
  for(const[k,v]of Object.entries(node.properties))assertPortableProductionSchema(v,path+'.'+k);
 }else if(node.type==='array'){assertPortableProductionSchema(node.items,path+'[]');}
 else if(node.type!=='string')throw Error('production_schema_unexpected_type:'+path);
}
export function validateWebProductionOutput(output,{textIds=[],figureIds=[],fixedFigure=null,expectedTranscription=null}){
 assert(output&&same(Object.keys(output).sort(),['figures','translations']),'production_output_root');
 for(const [key,ids,fields]of [['translations',textIds,['sourceBlockId','text']],['figures',figureIds,['sourceBlockId','kind','transcription','unknowns','caption','sourceNotes']]]){
  const rows=output[key];assert(Array.isArray(rows)&&rows.length===ids.length&&new Set(rows.map(r=>r.sourceBlockId)).size===ids.length&&ids.every(id=>rows.some(r=>r.sourceBlockId===id)),'production_output_target_coverage');
  for(const r of rows){assert(same(Object.keys(r).sort(),[...fields].sort()),'production_output_keys');
   if(key==='translations')assert(typeof r.text==='string'&&r.text.trim(),'production_output_empty_text');
   else{assert(['mahjong-example','chart','table','diagram','illustration','other'].includes(r.kind)&&typeof r.transcription==='string'&&r.transcription.trim()&&typeof r.caption==='string','production_output_figure_fields');for(const k of ['unknowns','sourceNotes'])assert(Array.isArray(r[k])&&r[k].every(x=>typeof x==='string'),'production_output_array_fields');}
  }
 }
 if(fixedFigure){assert.equal(output.figures.length,1);for(const[k,v]of Object.entries(fixedFigure))if(k!=='transcription')assert.deepEqual(output.figures[0][k],v,'production_output_fixed_field:'+k);}
 if(expectedTranscription!==null)assert.equal(output.figures[0]?.transcription,expectedTranscription,'production_output_transcription_whitelist');
 return {passed:true,exactTextTargets:textIds.length,exactFigureTargets:figureIds.length,localCardinalityAndContentGate:true};
}
