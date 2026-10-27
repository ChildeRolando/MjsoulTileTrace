import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=await readFile(new URL('./b0168-contract.json',import.meta.url));
const c=JSON.parse(bytes);
export function exactRequest({source,revision,parent,ids,figureIds,images}){
 if(source.sourceId!=='modern-yabejp-ja'||source.articleId!=='chapter06-exercise003'||revision?.parentSha256!==c.parent.sha256||revision?.notesSha256!==c.notes.sha256||source.blocks.length!==1195||JSON.stringify(ids)!==JSON.stringify([c.targetId])||figureIds.length||images.length||parent.body.blocks.find(b=>b.sourceBlockIds[0]===c.targetId)?.text!==c.before)throw Error('b0168_exact_request_binding');
 const prompt='执行唯一已批准的单字插入，不重译、不润色。只在b0168末尾“摸入宝牌”后加“或”，其它每个字符原样。所有图片和其它1194块原样继承，不输出任何figure，不声称清除其它旧问题。完整Q12原文、父译文及原图SHA只是绑定上下文；本请求无图片payload，不承担新的图片读牌裁决。必须逐字符返回唯一expected，禁止增加标点、校注、文字、段落或figure。\n'+JSON.stringify({targetId:c.targetId,before:c.before,expected:c.expected,source:c.source,parent:c.parent,oldAudit:c.notes,completeQ12:c.question})+'\nReturn JSON only.';
 const schema={type:'object',additionalProperties:false,required:['translations','figures'],properties:{translations:{type:'array',minItems:1,maxItems:1,items:{type:'object',additionalProperties:false,required:['sourceBlockId','text'],properties:{sourceBlockId:{type:'string',enum:[c.targetId]},text:{type:'string',enum:[c.expected]}}}},figures:{type:'array',maxItems:0,items:{type:'object',additionalProperties:false,properties:{}}}}};
 return {prompt,schema,proof:{contractSha256:sha(bytes),targetId:c.targetId,expectedSha256:sha(c.expected)}};
}
export function validateExact(output){
 if(JSON.stringify(output)!==JSON.stringify({translations:[{sourceBlockId:c.targetId,text:c.expected}],figures:[]})){
  if(!output||Object.keys(output).sort().join(',')!=='figures,translations'||!Array.isArray(output.translations)||output.translations.length!==1||!Array.isArray(output.figures)||output.figures.length)throw Error('b0168_exact_output_scope_raw_preserved');
  const t=output.translations[0];if(Object.keys(t).sort().join(',')!=='sourceBlockId,text'||t.sourceBlockId!==c.targetId||t.text!==c.expected)throw Error('b0168_exact_output_outside_whitelist_raw_preserved');
 }
 return true;
}
