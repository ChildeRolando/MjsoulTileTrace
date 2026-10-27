import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function prepare100RepairContract(root){
 const requirementPath=join(root,'integration/coac249-next3-100-minimal-repair-20261028.json'),bytes=await readFile(requirementPath);
 if(sha(bytes)!=='b00075131f440682b5ea2903ca389975933666dd3b834f74880faf88a9f5fb75')throw Error('repair100_requirement_sha');
 const r=JSON.parse(bytes),cb=await readFile(r.candidate.path),sb=await readFile(r.source.path),rb=await readFile(r.raw.path);
 if(sha(cb)!==r.candidate.sha256||sha(sb)!==r.source.sha256||sha(rb)!==r.raw.sha256)throw Error('repair100_parent_source_raw_sha');
 const c=JSON.parse(cb),s=JSON.parse(sb),raw=JSON.parse(rb),id=r.targetSourceBlockId,block=c.body.blocks.find(b=>b.sourceBlockIds[0]===id);
 if(id!=='modern-yabejp-ja:chapter01-section035:b0041'||block.text!==r.currentFullText||block.text.split(r.proposedPhraseChange.from).length!==2||!r.sourceDefinition.text.includes('２枚以上切れてない')||!s.blocks.find(b=>b.id.endsWith('b0038')).text.includes('２枚以上切れてない'))throw Error('repair100_exact_parent_or_condition');
 if(!raw.success||raw.exitCode!==0||raw.callId!==r.newIndependentCall||raw.output.blockChecks.filter(b=>b.verdict==='faithful').length!==67||raw.output.issues.filter(i=>i.severity==='error').length!==1||raw.output.issues.find(i=>i.severity==='error').targetId!==id)throw Error('repair100_independent_error_scope');
 const expected=block.text.replace(r.proposedPhraseChange.from,r.proposedPhraseChange.to);
 const context=s.blocks.slice(0,107).map(b=>({source:b,parent:c.body.blocks.find(x=>x.sourceBlockIds[0]===b.id),figures:c.figures.filter(f=>f.sourceBlockIds.includes(b.id))}));
 const payload={canonical:r.canonical,candidate:r.candidate,source:r.source,originalAudit:r.originalAudit,newIndependentCall:r.newIndependentCall,newIndependentRaw:r.raw,oldText:block.text,expectedText:expected,approvedPhrase:r.proposedPhraseChange,sourceDefinition:r.sourceDefinition,targetSource:r.targetSource,context,outputScope:{textIds:[id],figureIds:[],preserveAllOtherCharacters:true,preserveSourceSegmentsAndEmphasis:true,preserve310OtherBlocksAnd128Figures:true,noNewEditorNote:true}};
 const request={prompt:'仅修复b0041这一处已独审指出的适用条件，逐字返回expectedText，不重译整段或全章。生きている在原b0038定义为２枚以上切れてない，必须落实“尚未被打出2张以上”，不能泛化为仍有余牌。保留其它字符、sourceSegments、强调、所有其它310块/128图；不要返回图片、增加校注或声称已经passed。真实父稿/新独立错误回执/107块日中定义和题解均附。\n'+JSON.stringify(payload),schema:{type:'object',additionalProperties:false,required:['translations','figures'],properties:{translations:{type:'array',minItems:1,maxItems:1,items:{type:'object',additionalProperties:false,required:['sourceBlockId','text'],properties:{sourceBlockId:{type:'string',enum:[id]},text:{type:'string',enum:[expected]}}}},figures:{type:'array',maxItems:0,items:{type:'object',additionalProperties:false,properties:{}}}}},model:'gpt-6.1-sol',reasoningEffort:'high',images:[],timeoutMs:900000};
 return {schema:'coac244-100-exact-repair-contract/1',canonical:r.canonical,requirement:{path:requirementPath,sha256:sha(bytes)},candidate:r.candidate,source:r.source,independentErrorRaw:r.raw,targetId:id,field:r.field,before:block.text,expected,request,proposedOutputIsNotProduction:true,newModelCalls:0,newCandidate:false,minimumFutureBudget:{production:1,independentTargetReview:1,total:2,failedVoidIncluded:true,retry:0,authorizedNow:false},legitimateExecution:['在现有通用group-target生产入口绑定真实原候选/source和此精确text枚举，逐字符白名单在写候选前拒绝。不得使用手工组合伪造raw。','独立父证据必须组合原243passed和本次68目标(67faithful/1error)的真实raw来源，保留原旧needs-repair；该合同不是已伪造标准父审。','真实生产raw/ledger验证后，仅对新SHA的b0041做首次目标独审，完整b0038定义/107块上下文、其余310块/128图及独立父审继承均须核验。若仍uncertain继续阻断，不能将草案直接派审。']};
}
export function validate100Output(output,contract){
 if(!output||Object.keys(output).sort().join(',')!=='figures,translations'||!Array.isArray(output.figures)||output.figures.length||!Array.isArray(output.translations)||output.translations.length!==1)throw Error('repair100_output_shape');
 const t=output.translations[0];if(Object.keys(t).sort().join(',')!=='sourceBlockId,text'||t.sourceBlockId!==contract.targetId||t.text!==contract.expected)throw Error('repair100_outside_exact_phrase');
 return true;
}
