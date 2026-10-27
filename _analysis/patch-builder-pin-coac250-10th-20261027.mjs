// COAC-250 tenth batch: move the build-accepted-preview pin from selection v10 to v11
// (path + sha). The canonical-chapter dedupe added in the ninth batch is kept as is.
// The previous builder is preserved as build-accepted-preview.before-v11-20261027.mjs.
import {readFileSync,writeFileSync,renameSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='E:/AgentData/Coach/knowledge/processing/integration/';
const sha=b=>createHash('sha256').update(b).digest('hex');
const p=dir+'build-accepted-preview.mjs',t=dir+'build-accepted-preview.mjs.tmp-v11',backup=dir+'build-accepted-preview.before-v11-20261027.mjs';
const before=readFileSync(p);
let s=before.toString('utf8');
const from='specific-web-variant-selection.v10.json',to='specific-web-variant-selection.v11.json';
const oldPin='901cd88fde29f0adc373a2eab441b4fb8a0512893a0c027b8180ee9655572198';
const newPin='3e222bacdd60426f8cf1481b74382c01ee3b00341cb648913f407c9a9bae60c2';
if(s.split(from).length!==2)throw new Error('selection path anchor count '+(s.split(from).length-1));
if(s.split(oldPin).length!==2)throw new Error('pin anchor count '+(s.split(oldPin).length-1));
copyFileSync(p,backup);
s=s.split(from).join(to).split(oldPin).join(newPin);
writeFileSync(t,s);
renameSync(t,p);
const after=readFileSync(p);
console.log(JSON.stringify({builder:{path:p,sha256Before:sha(before),sha256After:sha(after),backupPath:backup,backupSha256:sha(readFileSync(backup))},pin:{from,to,oldPin,newPin}}));
