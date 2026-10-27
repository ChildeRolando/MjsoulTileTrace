import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildVerificationDependencyManifest,verifyVerificationDependencyManifest} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-audit-verification-dependencies.mjs';
const baseDir='E:/AgentData/Coach/knowledge/processing/audit/runtimes/web-b8-transport-diag-20261027';
const manifest=await buildVerificationDependencyManifest({baseDir,entry:'textbook-audit-web.mjs'});
const verified=await verifyVerificationDependencyManifest({baseDir,manifest});
const helperSha256=createHash('sha256').update(await readFile(baseDir+'/textbook-production-cli.mjs')).digest('hex');
if(helperSha256!=='ff04388dc5bca14a290ec1e4e1868907063c5bc349d9c1a058f7bfec75e1486a'||!manifest.manifestSha256.startsWith('56287cda'))throw Error('existing_b8_manifest_changed');
const evidence={schema:'coach-textbook-audit-verification-dependencies/1',recordedAt:new Date().toISOString(),base:baseDir,entry:'textbook-audit-web.mjs',manifest,verified,
 role:'Existing COAC-249 frozen b8 runtime dependency closure, reproduced with existing verifier; no runtime or gate changed',helperSha256};
await writeFile(new URL('../runtime-manifest-222-246-20261027.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({manifestSha256:manifest.manifestSha256,files:manifest.files.length,verified}));
