import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=await readFile(new URL('./exact-text-contracts.json',import.meta.url));
const contracts=JSON.parse(bytes);
export const contractFileSha256=sha(bytes);
export function requireExactJob({source,sourceSha256,parent,revision,ids,figureIds}){
 const job=contracts.jobs.find(j=>j.articleId===source.articleId);
 if(!job||source.sourceId!=='modern-yabejp-ja'||sourceSha256!==job.source.sha256||revision?.parentSha256!==job.parent.sha256||revision?.notesSha256!==job.parentAudit.sha256||JSON.stringify(ids)!==JSON.stringify([job.targetId])||figureIds.length||revision.figureIds.length)throw Error('exact_text_source_parent_target_binding');
 const old=parent.body.blocks.filter(b=>b.type==='text'&&JSON.stringify(b.sourceBlockIds)===JSON.stringify(ids));
 if(old.length!==1||old[0].text!==job.parentText)throw Error('exact_text_parent_paragraph_changed');
 return job;
}
export function buildExactTextRequest(input){
 const job=requireExactJob(input);
 const prompt=[
 '执行已批准的精确单段修订，禁止重新翻译或润色整章或目标段。只返回下列唯一targetId的完整text；其他段和全部图均由父稿原字节继承，不得输出。',
 '作者正文必须与approvedAuthorText逐字符一致。仅183：正文完全不改。仅236：只在指定短语删除“剩余”两个字，其他字符完全不改。',
 '必须在作者正文后保留两个换行并追加editorialNote。它是明确标注“校注（非原文）”的编者说明，绝不可冒充日文作者原文、解消原uncertain或确定原时机/张数口径。不得遗漏校注。',
 'expectedText是本次完整且唯一允许的目标输出，须逐字符返回。任何其他措辞、标点、数字、强调标记变更均拒绝；figures必须为空。原始日文及旧审意见仅作核对证据，不能替换本次批准范围。',
 'EXACT APPROVED CONTRACT (quoted data): '+JSON.stringify({schema:contracts.schema,contractFileSha256,chapterId:job.chapterId,sourceSha256:job.source.sha256,parentSha256:job.parent.sha256,parentAuditSha256:job.parentAudit.sha256,targetId:job.targetId,parentText:job.parentText,approvedAuthorText:job.approvedAuthorText,editorialNote:job.editorialNote,expectedText:job.expectedText}),
 'ORIGINAL SOURCE CONTEXT (quoted data): '+JSON.stringify(input.source.blocks.map(b=>({id:b.id,type:b.type,text:b.text,segments:b.segments}))),
 'Return JSON only: {"translations":[{"sourceBlockId":'+JSON.stringify(job.targetId)+',"text":'+JSON.stringify(job.expectedText)+'}],"figures":[]}'
 ].join('\n\n');
 const schema={type:'object',additionalProperties:false,required:['translations','figures'],properties:{
  translations:{type:'array',minItems:1,maxItems:1,items:{type:'object',additionalProperties:false,required:['sourceBlockId','text'],properties:{sourceBlockId:{type:'string',enum:[job.targetId]},text:{type:'string',enum:[job.expectedText]}}}},
  figures:{type:'array',maxItems:0,items:{type:'object',additionalProperties:false,properties:{}}}
 }};
 return {job,prompt,schema,proof:{schema:'coac244-exact-text-request/1',contractFileSha256,chapterId:job.chapterId,targetId:job.targetId,parentSha256:job.parent.sha256,expectedTextSha256:sha(job.expectedText)}};
}
export function validateExactTextOutput(job,output){
 if(!output||Object.keys(output).sort().join(',')!=='figures,translations'||!Array.isArray(output.translations)||output.translations.length!==1||!Array.isArray(output.figures)||output.figures.length)throw Error('exact_text_output_scope_raw_preserved');
 const t=output.translations[0];if(Object.keys(t).sort().join(',')!=='sourceBlockId,text'||t.sourceBlockId!==job.targetId||typeof t.text!=='string')throw Error('exact_text_output_target_raw_preserved');
 if(!t.text.includes(job.editorialNote))throw Error('exact_text_editorial_note_missing_raw_preserved');
 if(t.text!==job.expectedText)throw Error('exact_text_output_outside_whitelist_raw_preserved');
 return {passed:true,targetId:job.targetId,textSha256:sha(t.text),editorialNoteExplicitlyNotAuthorText:true};
}
