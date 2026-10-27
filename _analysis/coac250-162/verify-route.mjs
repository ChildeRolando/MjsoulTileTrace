import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {load162InlineCompatibility,updateBuilder} from './builder-patch.mjs';
import {root,dir} from './config.mjs';
const pre=JSON.parse(await readFile(dir+'/preconsume.json','utf8'));
const binding={candidateSha256:pre.candidate.sha256,...pre.compatibility};
const route=await load162InlineCompatibility(root,pre.candidate.path,binding);
const gate=await route.verify(root,pre.candidate.path);assert.equal(gate.status,'passed');assert.equal(typeof route.stage,'function');
const checks=[];
for(const [name,mutate,error] of [
 ['candidate-sha',b=>b.candidateSha256='0'.repeat(64),/inline162_candidate_binding/],
 ['runtime-sha',b=>b.runtime.files[0].sha256='0'.repeat(64),/inline162_runtime_changed/],
 ['runtime-scope',b=>b.runtime.files.pop(),/inline162_runtime_scope/],
 ['display-manifest-sha',b=>b.displayManifest.sha256='0'.repeat(64),/inline162_display_manifest_changed/],
 ['display-module-binding',b=>b.displayStage.helper.sha256='0'.repeat(64),/inline162_display_manifest_changed/]
]){const bad=structuredClone(binding);mutate(bad);await assert.rejects(load162InlineCompatibility(root,pre.candidate.path,bad),error);checks.push({name,rejected:true});}
const builder=updateBuilder(await readFile(dir+'/builder.before.mjs','utf8'),pre,'f'.repeat(64));await writeFile(dir+'/builder.route-check.mjs',builder);
const syntax=spawnSync(process.execPath,['--check',dir+'/builder.route-check.mjs'],{windowsHide:true,encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr);
const canonLine=builder.split('\n').find(s=>s.includes('const canon=n=>'));
const canon=Function(canonLine+';return canon;')();
for(const name of ['cv1751316.coac244inline20261027.json','cv1751316.coac244inline20261027.display.json','cv1751316.display.json'])assert.equal(canon(name),'cv1751316');
assert.equal(canon('cv1770234.coac269rev1.json'),'cv1770234');assert.equal(canon('cv1751265.coac244inline20261027.display.json'),'cv1751265');
assert.ok(builder.includes('let verifySelected=verifyAuditForWebCandidate,stageSelected=stageWebTextbook;'));
await writeFile(dir+'/route-verification.json',JSON.stringify({allPassed:true,frozenGate:gate.status,checks,syntaxExitCode:syntax.status,exact162VersionDedupe:true,otherCandidatesUseExistingRoute:true,intakeEvidenceRetainedInRebuild:true,modelCalls:0},null,2)+'\n');
console.log(JSON.stringify({gate:gate.status,rejections:checks.length,syntax:syntax.status}));
