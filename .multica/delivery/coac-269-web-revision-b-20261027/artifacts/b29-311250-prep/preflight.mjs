// Actual legacy/frozen read-only entry probes. No invocation or global admission writes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const here=import.meta.dirname,root='E:/AgentData/Coach/knowledge/processing';
const read=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const rt=root+'/audit/runtimes/coac269-109167-exact-v1-20261028';
const bytes=await readFile(rt+'/runtime-manifest.json');assert.equal(sha(bytes),'814df700d298188dea14d20fd84ac818d1ded9a706e370bc7a1714141ad6a7a9');
for(const f of JSON.parse(bytes).files)assert.equal(sha(await readFile(f.path)),f.sha256);
const web=await import(pathToFileURL(rt+'/textbook-audit-web.mjs'));
const pdf=await import(pathToFileURL(rt+'/textbook-audit.mjs'));
const plan=await read(here+'/plan.json'),c=await read(plan.web311.parent.path),source=await read(plan.web311.source.path),audit=await read(plan.web311.parentAudit.path);
const production=await web.verifyWebProductionCall(root,c),presentations=await web.verifyWebPresentations(root,c);
const deterministic=web.webDeterministicChecks(c,source,plan.web311.source.sha256);assert(deterministic.passed);assert.deepEqual(deterministic,audit.deterministicChecks);
const raw=await read(root+'/audit/calls/'+audit.calls[0].callId+'.json'),call=audit.calls[0];
const projection=web.webSemanticProjection(source,c,call.binding.verifiedAssetIds??[],call.binding.supplementalInputs??[],call.binding.semanticProjectionVersion===2);
assert.equal(sha(JSON.stringify(projection)),call.binding.semanticProjectionSha256);assert(raw.prompt.includes(JSON.stringify(projection)));
assert.deepEqual(raw.schema,web.webReviewSchema(source,c));
const probe=structuredClone(c);probe.provenance.revision={figureIds:c.figures.filter(f=>['b0156','b0158'].some(n=>f.figureId.includes(':'+n+':'))).map(f=>f.figureId),textBlockIds:[]};
assert.throws(()=>web.verifyWebRevisionContent(probe,c,audit),/web_revision_notes_scope/);
const reuse=[];
for(const p of await read(here+'/reuse-pages.json')){
 const result=await pdf.verifyAuditForCandidate(root,p.candidate.path);assert.equal(result.status,'passed');
 assert.equal(result.production.sha256,p.candidate.sha256);reuse.push({page:p.page,status:result.status,candidateSha256:result.production.sha256});
}
const legacyPdf=[];
for(const key of ['257','261']){
 try{const result=await pdf.verifyAuditForCandidate(root,plan['pdf'+key].parent.path);legacyPdf.push({page:Number(key),returnedStatus:result.status,ordinaryPassed:result.status==='passed',authorizesNewCandidate:false});}
 catch(e){legacyPdf.push({page:Number(key),rejected:e.message,authorizesNewCandidate:false});}
}
const report={schema:'coac269-311250-actual-zero-call-entry-probes/1',newModelCalls:0,dispatchAllowed:false,runtimeManifest:{path:rt+'/runtime-manifest.json',sha256:sha(bytes),files:30},web311:{production,presentations,deterministic,originalProjectionAndSchemaMatched:true,legacyExactFigureRevisionRejection:'web_revision_notes_scope',newExactAdapterPrepared:false},reusedPages:reuse,legacyPdf,currentInstructionAndHumanEvidenceTakePrecedence:true,uncertainAndHistoricalAdjudicationUntouched:true};
await writeFile(here+'/entry-probes.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({verified:true,newModelCalls:0,webProjection:true,webLegacyRejection:'web_revision_notes_scope',reusedPassedPages:reuse.length,legacyPdf}));
