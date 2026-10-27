import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {load157VisionReview,updateBuilder} from './builder-patch.mjs';
import {root,dir} from './config.mjs';
const pre=JSON.parse(await readFile(dir+'/preconsume.json','utf8')),binding=pre.visionReview;
const route=await load157VisionReview(root,pre.candidate.path,binding),gate=await route.verify(root,pre.candidate.path);assert.equal(gate.status,'passed');assert.equal(typeof route.stage,'function');
const checks=[];for(const [name,mutate,error] of [
 ['candidate-sha',b=>b.candidateSha256='0'.repeat(64),/vision157_candidate_binding/],
 ['manifest-sha',b=>b.manifest.sha256='0'.repeat(64),/vision157_manifest_changed/],
 ['dependency-sha',b=>b.dependencyManifest.files[0].sha256='0'.repeat(64),/vision157_dependency_binding/],
 ['stage-sha',b=>b.stage.sha256='0'.repeat(64),/vision157_bound_file_changed/],
 ['audit-sha',b=>b.audit.sha256='0'.repeat(64),/vision157_bound_file_changed/],
 ['raw-sha',b=>b.requestEvidence.raw.sha256='0'.repeat(64),/vision157_bound_file_changed/],
 ['call-id',b=>b.requestEvidence.callId='not-the-passed-call',/vision157_request_binding/]
]){const bad=structuredClone(binding);mutate(bad);await assert.rejects(load157VisionReview(root,pre.candidate.path,bad),error);checks.push({name,rejected:true});}
const builder=updateBuilder(await readFile(dir+'/builder.before.mjs','utf8'),pre,'f'.repeat(64));await writeFile(dir+'/builder.route-check.mjs',builder);
for(const file of ['builder.route-check.mjs','integrate.mjs','readback.mjs','update-coverage.mjs','archive.mjs']){const s=spawnSync(process.execPath,['--check',dir+'/'+file],{windowsHide:true,encoding:'utf8'});assert.equal(s.status,0,file+':'+s.stderr);}
assert.ok(builder.includes("article==='cv1751316'?load162InlineCompatibility:load155InlineCompatibility"));assert.ok(builder.includes('if(visionReview){const route=await load157VisionReview('));
await writeFile(dir+'/route-verification.json',JSON.stringify({allPassed:true,exactCandidateFrozenGate:gate.status,checks,syntaxFiles:5,existingInlineAndDefaultRoutesRetained:true,modelCalls:0},null,2)+'\n');console.log(JSON.stringify({gate:gate.status,rejections:checks.length,syntaxFiles:5}));
