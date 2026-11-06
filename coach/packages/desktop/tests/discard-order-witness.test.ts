import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { assembleArenaExperiment } from '../src/blind-discard-arena-experiment.js';
const root='E:/AgentData/Coach/llm-discard-order-recognition-20261106/engineering', sample='E:/AgentData/Coach/llm-discard-order-final-form-20261106/target-sample';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')), freeze=read(root+'/input-freeze.json'), source=read(sample+'/sample-freeze.json');
const slot=freeze.slots.find((s:any)=>s.index===0), body=read(slot.file), c=source.cases[0], obs=read(sample+'/private/'+c.name).observation,basic=read(sample+'/basic/'+c.name);
const assemble=(packet:unknown,config=body.config,observation=obs,calculations=basic)=>assembleArenaExperiment({observation,config,basicCalculations:calculations,discardOrderWitness:packet});
describe('discard order witness binding',()=>{
 it('adds only its public module and leaves the old system intact',()=>{const on=assemble(body.packet),off=assembleArenaExperiment({observation:obs,config:{...body.config,discardOrderWitness:undefined},basicCalculations:basic});const user=JSON.parse(on.messages[1]!.content);expect(user.discardOrderWitness.edge).toEqual(body.packet.edge);delete user.discardOrderWitness;expect(user).toEqual(JSON.parse(off.messages[1]!.content));expect(on.messages[0]).toEqual(off.messages[0]);expect(on.outputSchema).toEqual(off.outputSchema)});
 it('rejects changed case, candidate order, hand, basic facts, equality, and illegal grouping',()=>{for(const field of ['caseRef','candidateRefs','handDigest','basicDigest','shantenEqual','unseenTotalEqual','effectiveTilesEqual','canonical']){const p=structuredClone(body.packet);if(field==='candidateRefs')p[field].reverse();else if(field==='canonical')p[field][0][0]='9z';else if(field.endsWith('Equal'))p[field]=!p[field];else p[field]+='x';expect(()=>assemble(p),field).toThrow()}});
 it('preserves unequal effective tile list flag from preflight',()=>{const v=freeze.slots.find((x:any)=>!x.effectiveTilesEqual),b=read(v.file),c2=source.cases[v.index],o=read(sample+'/private/'+c2.name).observation,bas=read(sample+'/basic/'+c2.name);expect(assemble(b.packet,b.config,o,bas).modules.discardOrderWitness?.effectiveTilesEqual).toBe(false)});
 it('rejects missing or unexpected module',()=>{expect(()=>assembleArenaExperiment({observation:obs,config:body.config,basicCalculations:basic})).toThrow();expect(()=>assemble(body.packet,{...body.config,discardOrderWitness:false})).toThrow()});
});
