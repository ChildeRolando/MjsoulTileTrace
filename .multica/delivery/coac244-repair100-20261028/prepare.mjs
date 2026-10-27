import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildComposite100} from './runtime/parent100.mjs';
const root='E:/AgentData/Coach/knowledge/processing',here=import.meta.dirname;
const sha=b=>createHash('sha256').update(b).digest('hex');
const {notes,plan}=await buildComposite100();
const shared=join(root,'audit/runtimes/coac244-condition100-v1-20261028');await mkdir(shared,{recursive:true});
const notesPath=join(root,'integration/coac244-condition100-composite-parent-20261028.json');
await writeFile(notesPath,JSON.stringify(notes,null,2)+'\n',{flag:'wx'});
const args=['--source',plan.candidate.source.sourcePath,'--dictionary',plan.candidate.provenance.dictionary.path,'--revision-from',plan.proof.candidate.path,'--revision-notes',notesPath,'--variant','condition100-v1-20261028'];
if(plan.candidate.provenance.verifiedAssetDictionary)args.push('--verified-assets',plan.candidate.provenance.verifiedAssetDictionary.path);
await writeFile(join(here,'production-args.json'),JSON.stringify(args,null,2)+'\n');
await writeFile(join(here,'composite-parent.json'),JSON.stringify(notes,null,2)+'\n');
const depFiles=[];
for(const name of await readdir(join(here,'runtime'))){if(!/\.(mjs|py|json)$/.test(name))continue;if(name.includes('manifest')||name==='exact-text-contracts.json')continue;const b=await readFile(join(here,'runtime',name));await writeFile(join(shared,name),b,{flag:'wx'});depFiles.push({path:join(shared,name),sha256:sha(b),bytes:b.length});}
const base=join(root,'integration/coac244-next3-zero-20261028');
for(const name of ['context100.mjs','100-input.json',...((await readdir(join(base,'verification-runtime'))).filter(n=>/\.(mjs|py|json)$/.test(n)).map(n=>'verification-runtime/'+n))]){const p=join(base,name),b=await readFile(p);depFiles.push({path:p,sha256:sha(b),bytes:b.length});}
for(const item of [plan.proof.candidate,plan.proof.source,plan.proof.oldAudit]){const b=await readFile(item.path);assert.equal(sha(b),item.sha256);}
const manifest={schema:'coac244-condition100-runtime/1',authorizationComment:'01a17f4b-adc5-76d9-bd04-78a849727fe9',scope:'Only nemata-jp-chapter-100-1 b0041 condition. Puretext sol/high. Original243 plus67 new faithful checks inherited. Original raw/uncertain never changed.',files:depFiles};
await writeFile(join(shared,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});await writeFile(join(here,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({notesPath,shared,files:depFiles.length,modelCalls:0}));
