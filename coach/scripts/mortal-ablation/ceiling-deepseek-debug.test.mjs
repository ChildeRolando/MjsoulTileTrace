import {it,expect} from 'vitest';
import {normalizeDeepSeekMetadata} from './ceiling-deepseek-debug.mjs';
const request={tools:[{type:'function',function:{name:'submit_decision',strict:true}}],maxOutputBytes:16384};
const response={status:'provider_error',failureCode:'claude_invalid_model_response'};
const payload={call:{name:'submit_decision',arguments:{actionRef:'keep-exactly',rationale:'公开理由'},decisionSummary:'重复位置的公开总结'},decisionSummary:'规范位置的公开总结'};
const proof={acceptedResponseSource:'first_model_response',firstResponseComplete:true,forwardedModelRequests:1,visibleResultText:JSON.stringify(payload),nativeUsage:{input_tokens:1,cache_read_input_tokens:0,cache_creation_input_tokens:0,output_tokens:2}};
it('ignores optional display summaries while preserving the complete decision arguments',()=>{
  const fixed=normalizeDeepSeekMetadata(response,proof,request);
  expect(fixed.result.status).toBe('ready');expect(fixed.result.call.arguments).toBe(JSON.stringify(payload.call.arguments));expect(fixed.result.decisionSummary).toBeUndefined();
  expect(JSON.parse(proof.visibleResultText)).toEqual(payload);expect(fixed.result.usage.totalTokens).toBe(3);
});
it('accepts a missing, misplaced, repeated or malformed summary without altering the actual submission',()=>{
  for(const p of [{call:payload.call},{call:{name:payload.call.name,arguments:payload.call.arguments}},{...payload,decisionSummary:42},{...payload,call:{...payload.call,decisionSummary:'x'.repeat(1000)}}]){
    const fixed=normalizeDeepSeekMetadata(response,{...proof,visibleResultText:JSON.stringify(p)},request);expect(fixed.result.call.arguments).toBe(JSON.stringify(payload.call.arguments));
  }
});
it('rejects other schema defects, incomplete replies and unknown transport failures',()=>{
  for(const p of [{...payload,extra:1},{...payload,call:{...payload.call,other:1}},{...payload,call:{...payload.call,arguments:'{}'}}])expect(normalizeDeepSeekMetadata(response,{...proof,visibleResultText:JSON.stringify(p)},request)).toBeNull();
  expect(normalizeDeepSeekMetadata(response,{...proof,firstResponseComplete:false},request)).toBeNull();
  expect(normalizeDeepSeekMetadata({...response,failureCode:'network_failed'},proof,request)).toBeNull();
});
