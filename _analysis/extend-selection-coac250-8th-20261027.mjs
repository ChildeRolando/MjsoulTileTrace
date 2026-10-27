// COAC-250 eighth batch: append the four passed chapters (174-1 / 187-1 / 198-1 / 215-4) to the
// explicit specific-web variant selection and emit v9 with v8 kept as history. Zero model calls.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const root='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));

const v8Path=join(root,'integration/specific-web-variant-selection.v8.json');
const v8Bytes=await readFile(v8Path);
const v8=JSON.parse(v8Bytes);
const v8Sha=sha(v8Bytes);

const jobs=[
 {sourceId:'modern-yabejp-ja',articleId:'chapter02-section024',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter02-section024.rev1.json'),
  selectionReason:'COAC-248 eighth batch: targeted re-translation of b0036 (处于1向听或以上 -> 对方处于一向听或已经听牌的可能性会变高, restoring the completion-direction reading); the other 44 blocks are byte-identical, all 8 inline tile figures inherit the parent presentationAsset unchanged. Independent target-text audit passed 2026-10-27T08:03:37Z.',
  candidateSha256:'7ceae3d061f859f9d4c93822422be385100396e12593a3980045e871f2adc5a7',
  sourceSha256:'732efdb6692088602c843f21574b251013482e826be79c14669f8c336bce6e1f'},
 {sourceId:'modern-yabejp-ja',articleId:'chapter03-section006',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter03-section006.rev1.json'),
  selectionReason:'COAC-248 eighth batch: targeted re-translation of b0095 (后，鸣了某张牌，再切出 -> 被切出后，鸣了某张牌，再切出, restoring the prior discard of the five pin); the other 103 blocks are byte-identical, all 48 figures inherit the parent presentationAsset unchanged. Independent target-text audit passed 2026-10-27T09:22:00Z.',
  candidateSha256:'310a9fb99713adf007a7226cc01fcf848b16cf3b164fc1094d2a81a644f2d2e2',
  sourceSha256:'cc67a6d1dcb9ed4415176da143bce497a806174f0bad22952c0fd61c6a29737f'},
 {sourceId:'modern-yabejp-ja',articleId:'chapter03-section012',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter03-section012.rev1.json'),
  selectionReason:'COAC-248 eighth batch: targeted re-translation of b0082 (那就更有可能是特殊牌型 -> 那么特殊牌型的可能性就很高了, keeping the strong-likelihood judgement, plus wording convergence inside the same block); the other 81 blocks are byte-identical, all 36 figures inherit the parent presentationAsset unchanged. Independent target-text audit passed 2026-10-27T09:19:00Z.',
  candidateSha256:'af5ea28cb84f84f9006f5c205c7fa4f99431bf7b3bad8e22e47a3a1245820e3b',
  sourceSha256:'894d33804c0b8528a38f91fc1750759f26588936791bc981cd0bf2870c364092'},
 {sourceId:'modern-yabejp-ja',articleId:'chapter03-section027',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter03-section027.rev2.json'),
  selectionReason:'COAC-249 independent review lane: second-order targeted re-translation of b0011 on its needs-repair rev1 parent (若打出的这张牌并非新摸入的牌 -> 若这张牌不是进张完成面子后切出的余牌); the other 12 blocks are byte-identical and the chapter has no figures. Independent target-text audit passed 2026-10-27T09:33:30Z on the frozen web-target-text-chain runtime (manifest 0aa071a4, auditor snapshot 856dad9d).',
  candidateSha256:'a75742e9c2bcb5b1c39453c6d8f795bea24cc5a431657b318ec7f5280a431817',
  sourceSha256:'76944539e0a90d8d6063968465768e01a13badf8b589e7d36fe0db7317d8b0c4'}
];

for(const job of jobs){
 const existing=v8.jobs.find(j=>j.sourceId===job.sourceId&&j.articleId===job.articleId);
 if(existing)throw new Error('article already present in v8: '+JSON.stringify(existing.articleId));
 const candidateBytes=await readFile(job.candidatePath);
 if(sha(candidateBytes)!==job.candidateSha256)throw new Error('candidate sha mismatch: '+job.articleId);
 const candidate=JSON.parse(candidateBytes);
 if(candidate.source.articleId!==job.articleId||candidate.source.sourceSha256!==job.sourceSha256)throw new Error('source identity mismatch: '+job.articleId);
}

const v9={...v8,recordedAt:new Date().toISOString(),previousSelection:{path:'E:/AgentData/Coach/knowledge/processing/integration/specific-web-variant-selection.v8.json',sha256:v8Sha},jobs:[...v8.jobs,...jobs]};
const out=join(root,'integration/specific-web-variant-selection.v9.json');
await writeFile(out,JSON.stringify(v9,null,2)+'\n');
const v9Sha=sha(await readFile(out));
console.log(JSON.stringify({v8Sha,v9Path:out,v9Sha,jobsBefore:v8.jobs.length,jobsAfter:v9.jobs.length,added:jobs.map(j=>j.articleId)}));
