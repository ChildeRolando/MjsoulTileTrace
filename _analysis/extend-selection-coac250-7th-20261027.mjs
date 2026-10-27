// COAC-250 seventh batch: append 222-1 (chapter04-section004 rev1) to the explicit
// specific-web variant selection and emit v8 with v7 kept as history.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const root='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));

const v7Path=join(root,'integration/specific-web-variant-selection.v7.json');
const v7Bytes=await readFile(v7Path);
const v7=JSON.parse(v7Bytes);
const v7Sha=sha(v7Bytes);

const job={
  sourceId:'modern-yabejp-ja',
  articleId:'chapter04-section004',
  candidatePath:'E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/chapter04-section004.rev1.json',
  selectionReason:'COAC-248 seventh batch: targeted re-translation of b0016 (\u8d85\u8fc7\u4e00\u534a -> \u60c5\u51b5\u597d\u7684\u8bdd\u80fd\u8fbe\u5230\u4e00\u534a\u4ee5\u4e0a, restoring the inclusive "half or more" reading) and b0018 (\u4e24\u9762\u542c\u724c\u7684\u7acb\u76f4\u65e0\u5f79 -> \u6bd4\u8d77\u4e24\u9762\u542c\u724c\u3001\u4ec5\u6709\u7acb\u76f4\u8fd9\u4e00\u5f79\u7684\u542c\u6cd5, removing the false "no yaku" claim); the other 19 blocks and the unchanged parent audit are byte-identical, the chapter has no figures. Independent target-text audit passed 2026-10-27T07:00:52Z.',
  candidateSha256:'3910165816bc9776e27fccd11e9e46636c0eef860949df2978cb1481dde4d56a',
  sourceSha256:'cd98c1b548c5d7ca4040ba0bbc07d6390114116ec8257392ec1e96054a557605'
};

const existing=v7.jobs.find(j=>j.sourceId===job.sourceId&&j.articleId===job.articleId);
if(existing) throw new Error('article already present in v7: '+JSON.stringify(existing));
const candidateBytes=await readFile(job.candidatePath);
if(sha(candidateBytes)!==job.candidateSha256) throw new Error('candidate sha mismatch');
const candidate=JSON.parse(candidateBytes);
if(candidate.source.articleId!==job.articleId||candidate.source.sourceSha256!==job.sourceSha256) throw new Error('source identity mismatch');

const v8={
  ...v7,
  recordedAt:new Date().toISOString(),
  previousSelection:{path:'E:/AgentData/Coach/knowledge/processing/integration/specific-web-variant-selection.v7.json',sha256:v7Sha},
  jobs:[...v7.jobs,job]
};
const out=join(root,'integration/specific-web-variant-selection.v8.json');
await writeFile(out,JSON.stringify(v8,null,2)+'\n');
const v8Sha=sha(await readFile(out));
console.log(JSON.stringify({v7Sha,v8Path:out,v8Sha,jobsBefore:v7.jobs.length,jobsAfter:v8.jobs.length}));
