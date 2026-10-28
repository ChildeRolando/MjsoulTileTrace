import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root='E:/AgentData/Coach/knowledge/processing',load=async p=>JSON.parse(await readFile(p)),r=await load(root+'/integration/coac249-224-seven-reviewed-20261028.json'),mod=await import(pathToFileURL(root+'/audit/runtimes/coac269-224-seven-v1-20261028/seven.mjs')),parent=await load(r.parent.path),c=await load(r.candidate.path),oldMaker=await load(mod.contract.makerRaw.path),maker=await load(r.productionProof.raw.path),checks=[];
await mod.validateCandidate(c,parent,oldMaker,maker.output,maker.callId);
for(const[name,mutate]of[
 ['changed author condition',x=>x.body.blocks[2].text+='x'],
 ['changed inherited chart reading',x=>x.figures[0].transcription=x.figures[0].transcription.replace('约10','约11')],
 ['missing unknown',x=>x.figures[0].unknowns.pop()],
 ['changed caption',x=>x.figures[0].caption+='x'],
 ['changed source notes',x=>x.figures[0].sourceNotes.push('invented')],
 ['wrong source binding',x=>x.source.articleId='other']
]){const x=structuredClone(c);mutate(x);await assert.rejects(mod.validateCandidate(x,parent,oldMaker,maker.output,maker.callId));checks.push({name,rejected:true});}
await assert.rejects(mod.frozen('0'.repeat(64)));checks.push({name:'wrong frozen manifest',rejected:true});
await writeFile('_analysis/b224/refusals.json',JSON.stringify({passed:true,checks,newModelCalls:0,meaning:'Native fixed-candidate evidence refusal checks only. This is not a display/admission contract or readback.'},null,2)+'\n');console.log('Seven native byte/binding/manifest refusal checks passed; no model invocation.');
