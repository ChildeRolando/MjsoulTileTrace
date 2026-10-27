// COAC-250 ninth batch: append the three ready chapters (201-1, 338-1, 273-1) to the explicit
// specific-web variant selection and emit v10 with v9 kept as history. Zero model calls.
// The two COAC-269 line-B chapters are the canonical article's effective latest passed version;
// the COAC-269 second-round re-makes of 246-1 / 237-1 / 131-1 are deliberately absent, so the
// already-ingested versions stay in place.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const root='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));

const v9Path=join(root,'integration/specific-web-variant-selection.v9.json');
const v9Bytes=await readFile(v9Path);
const v9=JSON.parse(v9Bytes);
const v9Sha=sha(v9Bytes);

const jobs=[
 {sourceId:'modern-yabejp-ja',articleId:'chapter03-section015',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter03-section015.rev1.json'),
  selectionReason:'COAC-248 ninth batch: targeted re-translation of b0041; the other 46 blocks are byte-identical and all 19 figures inherit the parent presentationAsset unchanged. Independent target-text audit passed 2026-10-27T09:47:54Z.',
  candidateSha256:'d63f3a896005f1b939302ddf7268b99bead9e66d0542d545071a014ca24da5ed',
  sourceSha256:'8939308a3d76e724013b74b04de6d17c733314b67117a9bced68dc4bc169289a'},
 {sourceId:'modern-yabejp-ja',articleId:'archive01-section006',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.coac269rev1.json'),
  selectionReason:'COAC-269 line-B first batch: targeted re-translation of b0518 (board cheap/expensive reading); the other 587 blocks are byte-identical and all 260 figures inherit the parent presentationAsset. Independent audit by COAC-249 passed 2026-10-27T10:01:45Z (receipt 74b93630).',
  candidateSha256:'ff5a9b524d8e10c62f97011bde7f6a5a837f58e8557230ca60c67581b426f782',
  sourceSha256:'6438c449b1284be3a7be4fd5004bfcda10517716c7cbbbf8b09df2cc92722548'},
 {sourceId:'modern-yabejp-ja',articleId:'chapter06-exercise002-02',
  candidatePath:join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.coac269rev1.json'),
  selectionReason:'COAC-269 line-B first batch: targeted re-translation of b0263 and b0545 (comparison object of the wait-count sentence; chiitoitsu one-shanten wording); the other 690 blocks are byte-identical and all 292 figures inherit the parent presentationAsset. Independent audit by COAC-249 passed 2026-10-27T10:02:55Z (receipt 0553be30).',
  candidateSha256:'42991d764c900c46cba313848cc1c5138789c60079e6a988d4f6df5e09da330e',
  sourceSha256:'460025a88a0adcc545afa893594c6653d0b121f75fdcfd9512350f9292b984f4'}
];

for(const job of jobs){
 const existing=v9.jobs.find(j=>j.sourceId===job.sourceId&&j.articleId===job.articleId);
 if(existing)throw new Error('article already present in v9: '+job.articleId);
 const candidateBytes=await readFile(job.candidatePath);
 if(sha(candidateBytes)!==job.candidateSha256)throw new Error('candidate sha mismatch: '+job.articleId);
 const candidate=JSON.parse(candidateBytes);
 if(candidate.source.articleId!==job.articleId||candidate.source.sourceSha256!==job.sourceSha256)throw new Error('source identity mismatch: '+job.articleId);
}

const v10={...v9,recordedAt:new Date().toISOString(),previousSelection:{path:'E:/AgentData/Coach/knowledge/processing/integration/specific-web-variant-selection.v9.json',sha256:v9Sha},jobs:[...v9.jobs,...jobs]};
const out=join(root,'integration/specific-web-variant-selection.v10.json');
await writeFile(out,JSON.stringify(v10,null,2)+'\n');
const v10Sha=sha(await readFile(out));
console.log(JSON.stringify({v9Path,v9Sha,v10Path:out,v10Sha,jobsBefore:v9.jobs.length,jobsAfter:v10.jobs.length,added:jobs.map(j=>j.articleId)}));
