import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const contract=JSON.parse(await readFile(new URL('./exact-contract.json',import.meta.url)));
export async function assertFrozen(expected){
 const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=await readFile(new URL('./runtime-manifest.json',import.meta.url));
 assert.match(expected??'',/^[a-f0-9]{64}$/);assert.equal(sha(bytes),expected);
 for(const f of JSON.parse(bytes).files)assert.equal(sha(await readFile(f.path)),f.sha256);
 for(const f of [contract.parent,contract.notes,contract.source,...contract.targets.flatMap(t=>t.images)])assert.equal(sha(await readFile(f.path)),f.sha256);
}
export function exactRequest({ids,figureIds,revision,batch}){
 assert.equal(revision.parentSha256,contract.parent.sha256);assert.equal(revision.notesSha256,contract.notes.sha256);assert.deepEqual(figureIds,[]);
 const t=contract.targets.find(t=>t.group.batchId===batch.batchId);assert(t);assert.deepEqual(ids,[t.id]);
 const schema={type:'object',additionalProperties:false,required:['translations','figures'],properties:{translations:{type:'array',minItems:1,maxItems:1,items:{type:'object',additionalProperties:false,required:['sourceBlockId','text'],properties:{sourceBlockId:{type:'string',enum:[t.id]},text:{type:'string',enum:[t.expected]}}}},figures:{type:'array',maxItems:0,items:{type:'object',additionalProperties:false,properties:{}}}}};
 return {prompt:t.prompt,schema,visualInputs:t.images.map(i=>({path:i.path.replaceAll('\\','/').replace('E:/AgentData/Coach/knowledge/processing/',''),sha256:i.sha256,assetId:i.assetId,role:'original',scale:1}))};
}
export function validateExact(output,ids){
 assert.deepEqual(Object.keys(output).sort(),['figures','translations']);assert.deepEqual(output.figures,[]);
 assert.deepEqual(output.translations,ids.map(id=>({sourceBlockId:id,text:contract.targets.find(t=>t.id===id).expected})));
 return true;
}
export function validateCandidate(candidate,parent){
 const restored=structuredClone(candidate.body);for(const t of contract.targets){const b=restored.blocks.find(b=>b.sourceBlockIds[0]===t.id);assert.equal(b.text,t.expected);b.text=t.before;}
 assert.deepEqual(restored,parent.body);assert.deepEqual(candidate.figures,parent.figures);assert.deepEqual(candidate.source,parent.source);return true;
}
