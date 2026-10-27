import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare100RepairContract,validate100Output} from './text100.mjs';
const root='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const job=await prepare100RepairContract(root);
export function buildExactTextRequest({source,sourceSha256,parent,revision,ids,figureIds}){
 assert.equal(sourceSha256,job.source.sha256);assert.equal(source.sourceId,'modern-yabejp-ja');assert.equal(source.articleId,'chapter01-section035');assert.equal(revision.parentSha256,job.candidate.sha256);assert.deepEqual(ids,[job.targetId]);assert.deepEqual(figureIds,[]);
 const parentCopy={...parent};delete parentCopy.candidateSha256;assert.equal(parent.candidateSha256,sha(JSON.stringify(parentCopy)));
 assert.equal(parent.body.blocks.find(b=>b.sourceBlockIds[0]===job.targetId).text,job.before);
 return {job,prompt:job.request.prompt,schema:job.request.schema,proof:{schema:'coac244-condition100-exact-request/1',authorizationComment:'01a17f4b-adc5-76d9-bd04-78a849727fe9',requirement:job.requirement,parentSha256:job.candidate.sha256,sourceSha256:job.source.sha256,targetId:job.targetId,expectedTextSha256:sha(job.expected),sourceContextBlocks:107,originalABDefinitionBlocks:39}};
}
export const validateExactTextOutput=(job,output)=>validate100Output(output,job);
