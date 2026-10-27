// Read-only original production/presentation/exclusion checks. Never calls a model.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing';
const runtime=root+'/audit/runtimes/coac244-vision-production-schema-v2-20261028';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const path=root+'/web-production/v1/candidates/79-bilibili-cn/cv1765377.display.json';
const before=await readFile(path),c=JSON.parse(before);
assert.equal(sha(before),'e08cf7cfef4777643809971a71347c587ffe14534873d7cac2be65be42885e5e');
const {verifyWebProductionCall,verifyWebPresentations,assertWebReuseNotExcluded}=await import(pathToFileURL(runtime+'/textbook-audit-web.mjs'));
await assertWebReuseNotExcluded(root,path,sha(before));
const production=await verifyWebProductionCall(root,c),presentation=await verifyWebPresentations(root,c);
const original=await load(root+'/integration/coac244-next3-193208276-zero-20261028/193-existing-gates.json');
assert.deepEqual(production,original.production);assert.deepEqual(presentation,original.presentation);
const preview=await load(root+'/integration/accepted-preview-current.json');
const register=await load(root+'/integration/coac250-unified-chapter-register-20261027b.json');
const row=register.rows.find(r=>r.chapterId==='79-cn-chapter-193-4');
assert.equal(row.existingCandidate.sha256,sha(before));assert.equal(row.existingCandidate.sourceBoundCurrent,true);
const selected=(preview.selectedWeb??[]).filter(x=>JSON.stringify(x).includes('cv1765377'));
assert.equal(selected.length,0);assert.equal(row.covered,false);
assert.equal(sha(await readFile(path)),sha(before));
await writeFile(new URL('./gates.json',import.meta.url),JSON.stringify({recordedAt:new Date().toISOString(),production,presentation,
 exclusion:'passed-current',priorExclusionEvidence:original.exclusion,latestPreview:{output:preview.output,selectedWeb:selected},
 latestRegisterRow:row,modelCalls:0,candidateChanged:false},null,2)+'\n');
console.log(JSON.stringify({productionAndPresentationVerified:true,latestPreviewNotDuplicated:true,covered:false,modelCalls:0}));
