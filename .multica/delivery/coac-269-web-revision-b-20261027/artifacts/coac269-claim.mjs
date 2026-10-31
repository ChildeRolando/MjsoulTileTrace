#!/usr/bin/env node
// COAC-269 line B: atomic candidate-SHA claim in the ticket namespace. No shared list/selection write.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const processing='E:/AgentData/Coach/knowledge/processing';
const ns=join(processing,'web-production/v1/coac269-20261027');
const sha=b=>createHash('sha256').update(b).digest('hex');
const pre=JSON.parse(await readFile(join(ns,'preflight','preflight-3ef773331825e235.json')));
await mkdir(join(ns,'claims'),{recursive:true});
const claimed=[];
for(const c of pre.chapters){
 const claim={schema:'coac269-candidate-claim/1',ticket:'COAC-269',line:'B',claimedAt:new Date().toISOString(),owner:'COAC-269 Ticket executor',
  chapterId:c.chapterId,articleId:c.articleId,parentCandidate:{path:c.parent.path,sha256:c.parent.sha256},
  parentAudit:{path:c.notes.path,sha256:c.notes.sha256},source:{path:c.source.path,sha256:c.source.sha256},
  targets:c.targets.map(t=>t.sourceBlockId),plannedOutput:c.outputPath,variant:pre.variant,
  exclusion:'248 reserved 198/187/199/201/215-4/236/283 and PDF/metadata; no overlap recorded at claim time'};
 const path=join(ns,'claims',`claim-${c.parent.sha256}.json`);
 try{await writeFile(path,JSON.stringify(claim,null,2)+'\n',{flag:'wx'});claimed.push({chapterId:c.chapterId,claimPath:`web-production/v1/coac269-20261027/claims/claim-${c.parent.sha256}.json`,created:true});}
 catch(e){if(e.code!=='EEXIST')throw e;const old=JSON.parse(await readFile(path));if(old.parentCandidate.sha256!==c.parent.sha256)throw Error('claim_sha_conflict');claimed.push({chapterId:c.chapterId,claimPath:path,created:false,existingOwner:old.owner});}
}
const batch={schema:'coac269-claim-batch/1',ticket:'COAC-269',recordedAt:new Date().toISOString(),claims:claimed,preflight:'web-production/v1/coac269-20261027/preflight/preflight-3ef773331825e235.json'};
const batchPath=join(ns,'claims',`batch-${sha(JSON.stringify(claimed)).slice(0,16)}.json`);
await writeFile(batchPath,JSON.stringify(batch,null,2)+'\n',{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
console.log(JSON.stringify({batchPath:batchPath.replaceAll('\\','/').slice(processing.length+1),claims:claimed},null,2));
