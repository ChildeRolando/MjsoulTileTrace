// COAC-250 twelfth batch: append the three member-named passed chapters to the explicit specific-web
// variant selection and emit v12, keeping v11 as history. Zero model calls.
//   COAC-249 b7: 089-1/chapter01-section031, 060-1/chapter01-section021-06
//   COAC-248   : 081-8/cv1721475 (79-cn book; figure-only correction)
// Each candidate must be the effective latest passed version for its own book+article, so a shared
// numeric tail across books (79-cn-215-4 vs nemata-jp-215-4) can never alias.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const root='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));

const v11Path=join(root,'integration/specific-web-variant-selection.v11.json');
const v11Bytes=await readFile(v11Path);
const v11=JSON.parse(v11Bytes);
const v11Sha=sha(v11Bytes);

const jobs=[
 {sourceId:'modern-yabejp-ja',articleId:'chapter01-section031',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter01-section031.coac269rev1.json'),
  selectionReason:'COAC-269 line-B batch b7: targeted re-translation of b0042/b0084/b0102/b0153 (restores the source strength of「が有力」and the「のみで良いとみる」qualifier); the other 29 blocks are byte-identical and all 14 figures inherit the parent presentationAsset. Independent audit by COAC-249 passed 2026-10-27T12:00:09Z (receipt 11e0c9f0, auditor snapshot 856dad9d on frozen manifest web-target-text-chain 0aa071a4).',
  candidateSha256:'c5317d995648afeefdb370b314047e36f0368609a19a2db6be103385646565a6',
  sourceSha256:'c69694f31974fc506ba30b69434ed64a700112dc6d7bb2d67916aa9ef19126a4'},
 {sourceId:'modern-yabejp-ja',articleId:'chapter01-section021-06',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter01-section021-06.coac269rev1.json'),
  selectionReason:'COAC-269 line-B batch b7: targeted re-translation of b0027 and b0033 (restores the「二つ上」referent and the 1-vs-2 normal-dora comparison); the other 19 blocks are byte-identical and all 7 figures inherit the parent presentationAsset. Independent audit by COAC-249 passed 2026-10-27T12:01:14Z (receipt 949a4856, auditor snapshot 856dad9d on frozen manifest web-target-text-chain 0aa071a4).',
  candidateSha256:'6de46bfb824281e9facea8bd30eebf1498b7ae047e4c006250aeaa2800b0c64c',
  sourceSha256:'febc8cef9c299b375c225843e4d33a27a2167c3729bf8c590e472433f548eda5'},
 {sourceId:'79-bilibili-cn',articleId:'cv1721475',
  candidatePath:join(root,'web-production/v1/candidates/79-bilibili-cn/cv1721475.r1.json'),
  selectionReason:'COAC-248 targeted figure correction for 79-cn-chapter-081-8: four figures re-read from the source image (b0004/b0006/b0008/b0018, last-tile 9s restored to 7s and the 4p/5p cut-row first tile); all 19 text blocks and the other 4 figures are unchanged, the 4 unchanged figures differ only by derived presentationAsset. Independent full-article audit passed 2026-10-27T11:51:50Z (receipt f1328e6a, auditor snapshot 453ba938 on manifest web-e89dcffe ed07f6b8).',
  candidateSha256:'d1fc1ea8f072cc73c3c1a1649f3a7608f6fd55ecb38be8ff19a34340d5c2a3dd',
  sourceSha256:'f0f3fe12b457bc7d0ffcb34cfc6b1e4e5e37781759f55ebe22cbfdc8343b55f3'}
];

for(const job of jobs){
 const existing=v11.jobs.find(j=>j.sourceId===job.sourceId&&j.articleId===job.articleId);
 if(existing)throw new Error('article already present in v11: '+job.sourceId+'/'+job.articleId);
 const candidateBytes=await readFile(job.candidatePath);
 if(sha(candidateBytes)!==job.candidateSha256)throw new Error('candidate sha mismatch: '+job.articleId);
 const candidate=JSON.parse(candidateBytes);
 if(candidate.source.articleId!==job.articleId||candidate.source.sourceSha256!==job.sourceSha256)throw new Error('source identity mismatch: '+job.articleId);
}
const v12={...v11,recordedAt:new Date().toISOString(),previousSelection:{path:'E:/AgentData/Coach/knowledge/processing/integration/specific-web-variant-selection.v11.json',sha256:v11Sha},jobs:[...v11.jobs,...jobs]};
const out=join(root,'integration/specific-web-variant-selection.v12.json');
await writeFile(out,JSON.stringify(v12,null,2)+'\n');
const v12Sha=sha(await readFile(out));
console.log(JSON.stringify({v11Path,v11Sha,v12Path:out,v12Sha,jobsBefore:v11.jobs.length,jobsAfter:v12.jobs.length,added:jobs.map(j=>j.sourceId+'/'+j.articleId)}));
