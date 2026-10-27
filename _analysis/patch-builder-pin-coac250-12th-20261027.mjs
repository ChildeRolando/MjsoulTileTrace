// COAC-250 twelfth batch: move the build-accepted-preview pin from selection v11 to v12
// (path + sha). Nothing else in the builder changes. Previous builder preserved as
// build-accepted-preview.before-v12-20261027.mjs.
import {readFileSync,writeFileSync,renameSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='E:/AgentData/Coach/knowledge/processing/integration/';
const sha=b=>createHash('sha256').update(b).digest('hex');
const p=dir+'build-accepted-preview.mjs',t=dir+'build-accepted-preview.mjs.tmp-v12',backup=dir+'build-accepted-preview.before-v12-20261027.mjs';
const before=readFileSync(p);
let s=before.toString('utf8');
const from='specific-web-variant-selection.v11.json',to='specific-web-variant-selection.v12.json';
const oldPin='3e222bacdd60426f8cf1481b74382c01ee3b00341cb648913f407c9a9bae60c2';
const newPin='943b47ee06a8e61cf219995ca860cc2bc3e681ea020d30c4f80bbabc119ea92c';
if(s.split(from).length!==2)throw new Error('selection path anchor count '+(s.split(from).length-1));
if(s.split(oldPin).length!==2)throw new Error('pin anchor count '+(s.split(oldPin).length-1));
copyFileSync(p,backup);
s=s.split(from).join(to).split(oldPin).join(newPin);
writeFileSync(t,s);
renameSync(t,p);
const after=readFileSync(p);
console.log(JSON.stringify({builder:{path:p,sha256Before:sha(before),sha256After:sha(after),backupPath:backup,backupSha256:sha(readFileSync(backup))},pin:{from,to,oldPin,newPin}}));
