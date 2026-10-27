import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {root,repo,dir,integration,adjudication,article,chapter} from './config.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const artifacts={};const protectedFiles=[];
async function protect(path,expected){const bytes=await readFile(path),hash=sha(bytes);if(expected)assert.equal(hash,expected,path);protectedFiles.push({path,sha256:hash});return bytes;}
for(const [name,prefix] of [['coac249-section010-boundary-ruling-20261027.json','a164f768'],['coac249-section010-boundary-verification-20261027.json','1518cdbe'],['coac249-section010-gate-result-20261027.json','d24a4fcd'],['sidecar-rebind-1d9cad43.json','1d9cad43']]){
 const path=adjudication+'/'+name,bytes=await protect(path);assert.ok(sha(bytes).startsWith(prefix),name);await writeFile(dir+'/'+name,bytes);artifacts[name]={path,sha256:sha(bytes)};
}
const ruling=await load(artifacts['coac249-section010-boundary-ruling-20261027.json'].path),verification=await load(artifacts['coac249-section010-boundary-verification-20261027.json'].path),priorGate=await load(artifacts['coac249-section010-gate-result-20261027.json'].path);
assert.equal(ruling.ruling,'sufficient');assert.equal(ruling.originalChapterId,'nemata-jp-chapter-027-1');assert.equal(ruling.modelCalls,0);assert.equal(ruling.crossBoundaryRuns.count,7);assert.ok(Object.values(verification.checks).every(c=>c.ok));
for(const value of Object.values(ruling.identity))await protect(value.path,value.sha256);
const proposalBytes=await readFile(artifacts['sidecar-rebind-1d9cad43.json'].path),sidecar=JSON.parse(proposalBytes),oldBytes=await readFile(ruling.identity.sidecarCurrent.path),old=JSON.parse(oldBytes);
assert.equal(sha(proposalBytes),ruling.proposedRebind.proposedSidecarSha256);assert.ok(!proposalBytes.includes(Buffer.from('\r\n')));assert.ok(oldBytes.includes(Buffer.from('\r\n')));
const withoutBinding=s=>{const {candidatePath,candidateSha256,...other}=s;return other;};assert.deepEqual(withoutBinding(sidecar),withoutBinding(old));assert.equal(sidecar.candidateSha256,ruling.identity.candidatePassed.sha256);
const chain=await load(dir+'/audit-chain.json'),row=chain.items[0];assert.equal(chain.items.length,1);assert.ok(Object.values(row.checks).every(Boolean));assert.equal(row.canonicalVersions.effectiveLatestPassed.sha256,sidecar.candidateSha256);
const att=await load(root+'/audit/runtime-patches/20261027-coac249-batch6/attestation-chapter01-section010-44ce506d.json');
for(const a of att.originalModelCalls)await protect(root+'/'+a.path,a.sha256);
await protect(root+'/'+row.chain.notes.path,row.chain.notes.sha256);await protect(root+'/'+row.auditor.path,row.auditor.sha256);
const {verifyDefinitionSidecar}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-definition.mjs'));
const gate=await verifyDefinitionSidecar(root,ruling.identity.candidatePassed.path,artifacts['sidecar-rebind-1d9cad43.json'].path);
assert.equal(gate.passed,true);assert.equal(gate.modelCalls,0);assert.equal(gate.sidecarSha256,priorGate.sidecarSha256);assert.equal(gate.modelAuditSha256,priorGate.modelAuditSha256);assert.deepEqual(gate.checks,priorGate.checks);assert.deepEqual(gate.verifier,priorGate.verifier);await writeFile(dir+'/gate-reverified.json',JSON.stringify(gate,null,2)+'\n');
const priorBytes=await readFile(integration+'/accepted-preview-current.json'),prior=JSON.parse(priorBytes);assert.equal(prior.chapters,222);assert.equal(prior.units,230);assert.equal(prior.figures,4972);assert.equal(prior.selectedWeb.some(s=>s.chapterIds.includes(chapter)),false);
const snapshots={manifest:'definition-boundaries-v1/manifest.v2.json',definitionSelection:'definition-boundary-stage-selection.json',holds:'source-structure-holds.json',guard:'stage-definition-chapters.mjs',builder:'build-accepted-preview.mjs',variants:'specific-web-variant-selection.v13.json',register:'coac250-unified-chapter-register-20261027b.json'};
const configs={};for(const [key,value] of Object.entries(snapshots)){const path=integration+'/'+value,bytes=await readFile(path);await writeFile(dir+'/'+key+'.before.'+(key==='guard'||key==='builder'?'mjs':'json'),bytes);configs[key]={path,sha256:sha(bytes)};}
assert.equal(configs.guard.sha256,ruling.holdStateAtRuling.guardSha256);await protect(configs.holds.path,configs.holds.sha256);
assert.deepEqual(JSON.parse(await readFile(configs.definitionSelection.path)).semanticHoldRemains,[article]);
const locks=(await readdir(integration)).filter(n=>/(?:\.lock(?:\.json)?|selection.*lock)$/.test(n));assert.deepEqual(locks,[]);
await protect(prior.formalCorpusPath,prior.formalCorpusFileSha256);
const result={schema:'coac250-027-preconsume/1',recordedAt:new Date().toISOString(),allPassed:true,artifacts,protectedFiles,configs,sidecar:{oldPath:ruling.identity.sidecarCurrent.path,oldSha256:sha(oldBytes),oldSerialization:'CRLF',proposalSha256:sha(proposalBytes),proposalSerialization:'LF',changedKeys:['candidatePath','candidateSha256']},candidate:ruling.identity.candidatePassed,source:ruling.identity.sourceJson,audit:ruling.identity.passedReceipt,prior:{...chain.prior,output:prior.output,sha256:sha(priorBytes)},gate,modelCalls:0};
await writeFile(dir+'/preconsume.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({allPassed:true,artifacts,sidecar:result.sidecar,checks:gate.checks,protectedFiles:protectedFiles.length,locks}));
