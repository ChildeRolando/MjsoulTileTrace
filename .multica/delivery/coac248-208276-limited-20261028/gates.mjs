// Original read-only source/production/pixel/exclusion gates; no audit or model dispatcher.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',runtime=root+'/audit/runtimes/coac244-vision-production-schema-v2-20261028';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const {verifyWebProductionCall,verifyWebPresentations,assertWebReuseNotExcluded}=await import(pathToFileURL(runtime+'/textbook-audit-web.mjs'));
const proofs=[];
for(const key of ['208','276']){
 const a=await load(root+`/audit/supplements/coac249-193208276-20261028/receipt-${key}.json`),before=await readFile(a.candidate.path),c=JSON.parse(before);
 assert.equal(sha(before),a.candidate.sha256);await assertWebReuseNotExcluded(root,a.candidate.path,sha(before));
 const production=await verifyWebProductionCall(root,c),presentation=await verifyWebPresentations(root,c);
 const prior=await load(root+`/integration/coac244-next3-193208276-zero-20261028/${key}-existing-gates.json`);
 assert.deepEqual(production,prior.production);assert.deepEqual(presentation,prior.presentation);
 const preview=await load(root+'/integration/accepted-preview-current.json'),register=await load(root+'/integration/coac250-unified-chapter-register-20261027b.json');
 const row=register.rows.find(r=>r.chapterId===a.canonical);assert.equal(row.existingCandidate.sourceBoundCurrent,true);
 assert([a.candidate.sha256,c.provenance.revision?.parentSha256].includes(row.existingCandidate.sha256));
 const selected=(preview.selectedWeb??[]).filter(x=>JSON.stringify(x).includes(c.source.articleId));
 assert.equal(sha(await readFile(a.candidate.path)),a.candidate.sha256);
 proofs.push({key,canonical:a.canonical,recordedAt:new Date().toISOString(),production,presentation,exclusion:'passed-current',
 latestPreview:{output:preview.output,selectedWeb:selected},latestRegisterRow:row,
 consumptionAlreadyObserved:row.covered||selected.length>0,modelCalls:0,candidateChanged:false});
}
await writeFile(new URL('./gates.json',import.meta.url),JSON.stringify(proofs,null,2)+'\n');
console.log(JSON.stringify(proofs.map(p=>({key:p.key,verified:true,consumptionAlreadyObserved:p.consumptionAlreadyObserved,modelCalls:0}))));
