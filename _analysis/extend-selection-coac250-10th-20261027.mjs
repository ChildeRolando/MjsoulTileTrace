// COAC-250 tenth batch: append the three eligible chapters from the COAC-249 b5b6 handoff
// (142-1/chapter01-section054, 127-1/chapter01-section047, 199-1/chapter03-section013) to the
// explicit specific-web variant selection and emit v11 with v10 kept as history. Zero model calls.
// 027-1/chapter01-section010 stays out: it is under the pre-existing confirmed source definition
// boundary hold and has no definition-boundary stage selection entry, so it is not selectable yet.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const root='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');

const v10Path=join(root,'integration/specific-web-variant-selection.v10.json');
const v10Bytes=await readFile(v10Path);
const v10=JSON.parse(v10Bytes);
const v10Sha=sha(v10Bytes);

const jobs=[
 {sourceId:'modern-yabejp-ja',articleId:'chapter01-section054',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter01-section054.coac269rev1.json'),
  selectionReason:'COAC-249 b5b6 batch (COAC-269 line-B b5): targeted re-translation of b0173 (all-last vs. all-second-last reading); the other 184 blocks are byte-identical and all 84 figures inherit the parent presentationAsset unchanged. Independent target-text audit passed 2026-10-27T11:25:33.775Z (receipt f3570e7b, attestation on frozen manifest 0aa071a4).',
  candidateSha256:'f3570e7bbe61e0ef99e45a2f4185ed3f0c1fe1840f670783c7fd2402352dedca',
  sourceSha256:'89afec31ea77168cb86f94a4919bd5ef813f59029e4452f77e3874dee88676cc'},
 {sourceId:'modern-yabejp-ja',articleId:'chapter01-section047',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter01-section047.coac269rev1.json'),
  selectionReason:'COAC-249 b5b6 batch (COAC-269 line-B b5): targeted re-translation of b0030 (two-sided wait family vs. complete-hand family wording); the other 161 blocks are byte-identical and all 72 figures inherit the parent presentationAsset unchanged. Independent target-text audit passed 2026-10-27T11:27:18.817Z (receipt 363fd45c, attestation on frozen manifest 0aa071a4).',
  candidateSha256:'363fd45cc99f099cfbaec296a1102af0d6dd5519596af707697c21154280c86d',
  sourceSha256:'15fa058ba54622b1c812b29dd0b1d8b2b612d68b8fe1386a8f501cb6b4f83371'},
 {sourceId:'modern-yabejp-ja',articleId:'chapter03-section013',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.rev1.json'),
  selectionReason:'COAC-248 already-passed companion in the b5b6 handoff (not re-audited by COAC-249): targeted revision of b0006/b0009 (same-paragraph split-pair wording); the other 35 blocks are byte-identical and all 14 figures inherit the parent presentationAsset. Effective receipt is the bound retry of a voided transport call, passed 2026-10-27T10:01:30.968Z (receipt 2247cb22, auditor snapshot 453ba938 on manifest web-e89dcffe ed07f6b8).',
  candidateSha256:'3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8',
  sourceSha256:'487d432cf454023931abc6b321412162da65095954a4002fcf733133fecfd863'}
];

for(const job of jobs){
 const existing=v10.jobs.find(j=>j.sourceId===job.sourceId&&j.articleId===job.articleId);
 if(existing)throw new Error('article already present in v10: '+job.articleId);
 const candidateBytes=await readFile(job.candidatePath);
 if(sha(candidateBytes)!==job.candidateSha256)throw new Error('candidate sha mismatch: '+job.articleId);
 const candidate=JSON.parse(candidateBytes);
 if(candidate.source.articleId!==job.articleId||candidate.source.sourceSha256!==job.sourceSha256)throw new Error('source identity mismatch: '+job.articleId);
}
if(v10Sha!=='901cd88fde29f0adc373a2eab441b4fb8a0512893a0c027b8180ee9655572198')throw new Error('v10 sha is not the builder-pinned selection: '+v10Sha);

const v11={...v10,recordedAt:new Date().toISOString(),
 previousSelection:{path:'E:/AgentData/Coach/knowledge/processing/integration/specific-web-variant-selection.v10.json',sha256:v10Sha},
 jobs:[...v10.jobs,...jobs],
 excluded:{'chapter01-section010':'confirmed_source_definition_boundary_hold: the frozen source-structure hold covers chapter01-section010 and integration/definition-boundary-stage-selection.json has no entry for it (stage-definition-chapters.mjs still asserts it held), so the passed 027-1 revision (44ce506d) is not selectable in this batch; no re-audit and no hold override performed.'}};
const out=join(root,'integration/specific-web-variant-selection.v11.json');
await writeFile(out,JSON.stringify(v11,null,2)+'\n');
const v11Sha=sha(await readFile(out));
console.log(JSON.stringify({v10Path,v10Sha,v11Path:out,v11Sha,jobsBefore:v10.jobs.length,jobsAfter:v11.jobs.length,added:jobs.map(j=>j.articleId)}));
