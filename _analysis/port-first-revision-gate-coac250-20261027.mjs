// COAC-250: port the frozen first-revision gate from
// audit/runtimes/web-first-revision-20261027/textbook-audit-web.mjs into the live working-tree
// module, so the stage/build gate can verify the already-passed 116-1 receipt (b5e586b7) instead
// of re-running it. Deterministic text splice, zero model calls; the pre-patch file is kept.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
const live='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-audit-web.mjs';
const frozen='E:/AgentData/Coach/knowledge/processing/audit/runtimes/web-first-revision-20261027/textbook-audit-web.mjs';
const backup=live+'.orig-coac250-firstrev';
const lf=s=>s.replace(/\r\n/g,'\n');
const crlf=s=>s.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n');
const liveText=await readFile(live,'utf8'),frozenText=lf(await readFile(frozen,'utf8'));
const frozenLines=frozenText.split('\n');
const start=frozenLines.findIndex(l=>l.startsWith('async function verifyWebFirstRevision(root,candidate,r){'));
if(start<0)throw Error('frozen_first_revision_block_missing');
let end=start;while(end<frozenLines.length&&frozenLines[end]!=='}')end++;
if(end>=frozenLines.length)throw Error('frozen_first_revision_block_end_missing');
const block=crlf(frozenLines.slice(start,end+1).join('\n')+'\n');
const anchor='export async function verifyWebRevisionInheritance(root,candidate){';
if(liveText.split(anchor).length!==2)throw Error('live_anchor_not_unique');
if(liveText.includes('verifyWebFirstRevision'))throw Error('live_already_has_first_revision');
const dispatchOld='export async function verifyWebRevisionInheritance(root,candidate){\r\n const r=candidate.provenance.revision,parentBytes=';
const dispatchNew='export async function verifyWebRevisionInheritance(root,candidate){\r\n const r=candidate.provenance.revision;if(r.firstRevision)return verifyWebFirstRevision(root,candidate,r);const parentBytes=';
if(liveText.split(dispatchOld).length!==2)throw Error('live_dispatch_anchor_not_unique');
const targetOld='textTargets=candidate.provenance.revision?.textBlockIds??[]';
const targetNew='textTargets=candidate.provenance.revision?.firstRevision?[]:(candidate.provenance.revision?.textBlockIds??[])';
if(liveText.split(targetOld).length!==2)throw Error('live_texttargets_anchor_not_unique');
await copyFile(live,backup);
let next=liveText.replace(dispatchOld,dispatchNew).replace(targetOld,targetNew).replace(anchor,block+anchor);
await writeFile(live,next);
const verify=await readFile(live,'utf8');
console.log(JSON.stringify({
 schema:'coac250-first-revision-gate-port/1',
 file:live,backup,
 patchedSha256:(await import('node:crypto')).createHash('sha256').update(verify).digest('hex'),
 insertedLines:end-start+1,
 hasFunction:verify.includes('async function verifyWebFirstRevision'),
 hasDispatch:verify.includes('if(r.firstRevision)return verifyWebFirstRevision(root,candidate,r)'),
 hasFullArticleAuditForFirstRevision:verify.includes("firstRevision?[]:(candidate.provenance.revision?.textBlockIds??[])"),
 keptBatchRetryPatch:verify.includes('pickBatchCheckpoint'),
 modelCalls:0
},null,2));
