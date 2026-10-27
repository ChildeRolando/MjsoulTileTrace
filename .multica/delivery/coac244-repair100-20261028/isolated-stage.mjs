import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import assert from 'node:assert/strict';
import {verify100Final} from './verify-final.mjs';
import {stageWebTextbook} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/textbook-processing/stage-web-textbook.mjs';
const here=import.meta.dirname,root='E:/AgentData/Coach/knowledge/processing';const result=JSON.parse(await readFile(join(here,'final-result.json')));assert.equal(result.status,'passed');
const audit=await verify100Final(root,result.production.candidate.path);
const staged=await stageWebTextbook({processingRoot:root,candidatePath:result.production.candidate.path,destination:join(here,'isolated-stage'),verify:verify100Final});
await writeFile(join(here,'isolated-stage-result.json'),JSON.stringify({status:'passed',auditPath:audit.auditPath,staged,masterPreviewChanged:false,formalActiveChanged:false,newModelCalls:0},null,2)+'\n');console.log(JSON.stringify({status:'passed',staged}));
