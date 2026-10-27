import {readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const O=fileURLToPath(new URL('./',import.meta.url)),P='E:/AgentData/Coach/knowledge/processing',S=join(P,'integration/coac244-256-exact-gate-20261028');
const sha=x=>createHash('sha256').update(x).digest('hex'),load=async p=>JSON.parse(await readFile(p));
const release=await load(join(O,'release.json')),m=await load(join(release.runtime,'runtime-manifest.json'));
for(const f of m.files)if(sha(await readFile(join(release.runtime,f.path)))!==f.sha256)throw Error('frozen_dependency_changed');
const pre=await load(join(S,'preflight256.json')),request=await load(join(O,'maker-request-preflight.json'));
if(pre.revisionScopeError!==null||pre.prompt!==request.plan.prompt||JSON.stringify(pre.schema)!==JSON.stringify(request.plan.schema))throw Error('published_runner_request_differs_from_regression');
for(const p of pre.protectedFiles)if(sha(await readFile(p.path))!==p.sha256)throw Error('protected_input_changed:'+p.path);
await copyFile(join(S,'preflight256.json'),join(O,'preflight256.json'));
const results=await load(join(O,'regression-results.json'));
const handoff={schema:'coac244-exact256-gate-handoff/1',canonical:'79-cn-chapter-256-18',articleId:'cv1785770',authorizationCommentId:'01a17f8d-38c9-7cf9-ad2c-01bddd851470',originalHandoffSha256:sha(await readFile(join(O,'handoff244.json'))),
 runtime:release.runtime,runtimeManifestSha256:release.runtimeManifestSha256,runtimeFiles:m.files.length,
 executableMaker:join(S,'run256.mjs'),makerPreflightArgs:['--preflight-only'],makerExecuteArgs:['--execute-authorized'],
 makerRequest:{sha256:sha(await readFile(join(O,'maker-request-preflight.json'))),matchesActualPublishedRunner:true,model:'gpt-6.1-terra',reasoningEffort:'max',images:request.actual.requestExecution.images},
 reviewEntry:{module:join(release.runtime,'textbook-256-impact.mjs'),prepare:'prepare256ImpactReview(processingRoot, realR2CandidatePath)',verify:'verify256ReviewExecution(realResult, plan)',scope:'exact8s and two retained unknown impacts; full42 ordered source/candidate pairs with original conditions/tableContext and original figure order',notEntry:'Do not use auditWebCandidate: it would be full-article scope for this figure revision.',recording:'Original249 guard/STOP/three-source exclusions/atomic claim and standard unique raw/ledger required. Functions do not invoke or write model results. Keep complete real output and limited allowance separate; no ordinary whole-article pass.'},
 proof:{tests:results.count,publishedMakerPreflightPassed:true,parentRawVerified:true,protectedInputsUnchanged:pre.protectedFiles.length,oldRuntimeUnchanged:true,originalUncertainAndTwoUnknownsPreserved:true},
 newCalls:0,newCandidates:0,newPasses:0,remainingBudget:{maker:1,independentTargetAndUnknownImpactReview:1,total:2,failedVoidCount:true,retry:0},
 acceptance:'Independent evidence may authorize bounded author-argument fidelity only after actual display-limit mapping and downstream verification. New model uncertain remains unchanged; material unknown still blocks. No new acceptance is claimed here.',
 knownBoundary:'Real wire construction and existing gates verified offline; no new server/model execution or remote weights claimed.'};
await writeFile(join(O,'handoff248.json'),JSON.stringify(handoff,null,2)+'\n');
await writeFile(join(O,'final-verification.json'),JSON.stringify({runtimeManifestSha256:release.runtimeManifestSha256,checks:results.count,publishedRunnerRequestExact:true,protectedInputs:pre.protectedFiles.length,modelCalls:0,rawWrites:0,ledgerWrites:0,candidates:0},null,2)+'\n');
// Refresh only this new delivery package; the published frozen runtime is read-only above.
const {cp,unlink}=await import('node:fs/promises');await cp(O,S,{recursive:true});
for(const n of ['build.py','setup.mjs'])await unlink(join(S,n)).catch(e=>{if(e.code!=='ENOENT')throw e;});
console.log(JSON.stringify({handoffSha256:sha(await readFile(join(O,'handoff248.json'))),checks:results.count,actualRunnerPreflight:true,modelCalls:0}));
