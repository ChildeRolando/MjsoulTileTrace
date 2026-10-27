import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root='E:/AgentData/Coach/knowledge/processing',repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach',load=async p=>JSON.parse(await readFile(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const {stageWebTextbook}=await import(pathToFileURL(repo+'/scripts/textbook-processing/stage-web-textbook.mjs'));
const {applyDefinitionBoundaries}=await import(pathToFileURL(repo+'/scripts/textbook-processing/stage-definition-boundaries.mjs'));
const {verifyAuditForWebCandidate}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-web.mjs'));
const {verifyDefinitionSidecar}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-definition.mjs'));
if(typeof verifyDefinitionSidecar!=='function')throw Error('independent-definition-gate-not-ready');
const manifest=await load(root+'/integration/definition-boundaries-v1/manifest.v2.json'),selection=process.argv.slice(2);if(!selection.length)throw Error('explicit-article-selection-required');const results=[];
for(const article of selection){
 if(article==='chapter01-section010'){
  const rulingBytes=await readFile(root+'/audit/web/adjudications/definition-boundary-section010/coac249-section010-boundary-ruling-20261027.json');assert.equal(sha(rulingBytes),'a164f76843c37a0d57f784fe16941cce62fa4dfbb3ffdc7c39417c96ed3f7bbc','027 independent boundary ruling binding');
  const ruling=JSON.parse(rulingBytes),selected=manifest.articles.find(a=>a.articleId===article);assert.equal(ruling.ruling,'sufficient');assert.equal(ruling.originalChapterId,'nemata-jp-chapter-027-1');assert.equal(selected?.sha256,'1d9cad432705f2a2d16675368637d4c6a9585030e448d6b916b99eae709e3a5a');
  const exactSidecar=await load(join(root,selected.path));assert.equal(exactSidecar.candidateSha256,'44ce506db642a287d8becffe155bf287a147032cc11b0b0b992fa7a85eace50c');assert.equal(ruling.identity.candidatePassed.sha256,exactSidecar.candidateSha256);
 }
 const item=manifest.articles.find(a=>a.articleId===article);assert.ok(item);const sidecarPath=join(root,item.path),sb=await readFile(sidecarPath);assert.equal(sha(sb),item.sha256);const sidecar=JSON.parse(sb),candidatePath=join(root,sidecar.candidatePath),cb=await readFile(candidatePath),candidate=JSON.parse(cb),source=await load(join(root,candidate.source.sourcePath));
 const destination=root+'/integration/stage-definition-'+article+'-v1';
 const receipt=await stageWebTextbook({processingRoot:root,candidatePath,destination,verify:verifyAuditForWebCandidate,definitionSidecarPath:sidecarPath,verifyDefinitionSidecar});
 const presentation=applyDefinitionBoundaries(candidate,source,sidecar,item.sha256);
 assert.equal(presentation.body.blocks.filter(b=>b.type==='text').map(b=>b.text).join(''),candidate.body.blocks.filter(b=>b.type==='text').map(b=>b.text).join(''));
 assert.deepEqual(presentation.figures.flatMap(f=>f.sourceOccurrenceIds),candidate.figures.flatMap(f=>f.sourceOccurrenceIds));
 assert.equal(sha(await readFile(candidatePath)),sha(cb));assert.equal(sha(await readFile(join(root,candidate.source.sourcePath))),candidate.source.sourceSha256);
 for(const script of [repo+'/scripts/scene-study/verify-textbook-mcp.mjs',root+'/integration/verify-accepted-preview-arena.mjs']){const r=spawnSync(process.execPath,[script,destination],{cwd:repo,encoding:'utf8',windowsHide:true});await writeFile(join(destination,'validation-'+script.split('/').at(-1)+'.log'),r.stdout+r.stderr);assert.equal(r.status,0,r.stdout+r.stderr);}
 const body=await load(join(destination,'textbook-bodies.json'));if(article==='chapter01-section009'){
  const examples=body.chapters[0].blocks.flatMap(b=>b.type==='figure'?[b]:b.inlineFigures??[]).filter(f=>f.transcriptionProvenance?.definitionBoundary?.originalFigureId==='modern-yabejp-ja:chapter01-section009:b0087:figure');assert.deepEqual(examples.map(f=>f.transcriptionText),['1m 2m 5m 6m','4m']);
  const explanatory=body.chapters[0].blocks.find(b=>b.inlineFigures?.some(f=>f.id===examples[1].id));assert.ok(explanatory?.text.includes('4m'));assert.ok(explanatory.locator.sourceBlockIds.includes('modern-yabejp-ja:chapter01-section009:b0088'));assert.ok(!explanatory.inlineFigures.some(f=>f.id===examples[0].id));
 }
 const proof={schema:'coach-definition-presentation-end-to-end/1',articleId:article,candidatePath,candidateSha256:sha(cb),sidecarPath,sidecarSha256:item.sha256,corpusId:receipt.corpusId,originalChineseTextExact:true,sourceOccurrencesExact:true,originalSourceAndCandidateBytesUnchanged:true,realMcpAndArena:true,splitImageRuns:sidecar.splitImageRuns,...(article==='chapter01-section009'?{example1256mSeparatedFromDrawn4m:true}:{}),modelCalls:0};await writeFile(join(destination,'definition-boundary-validation.json'),JSON.stringify(proof,null,2)+'\n');results.push(proof);
}
console.log(JSON.stringify(results));
