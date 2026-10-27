// COAC-250 ninth batch: follow-up micro-patch. The canonical version inventory must not treat the
// separate editorial artifact families (source-note / formal-v / labels-v / processing-note) as
// duplicate drafts of a chapter, so apply the same filter the flat scan already uses.
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
const dir='E:/AgentData/Coach/knowledge/processing/integration/';
const p=dir+'build-accepted-preview.mjs',t=dir+'build-accepted-preview.mjs.tmp-dedupf';
let s=readFileSync(p,'utf8');
const from='const byCanon=new Map();for(const name of names){const a=canon(name);if(!byCanon.has(a))byCanon.set(a,[]);byCanon.get(a).push(name);}';
const to='const byCanon=new Map();for(const name of names){if(/\\.(?:formal-v|labels-v|source-note-v|processing-note-v)\\d+/.test(name))continue;const a=canon(name);if(!byCanon.has(a))byCanon.set(a,[]);byCanon.get(a).push(name);}';
if(s.split(from).length!==2)throw new Error('byCanon anchor count '+(s.split(from).length-1));
s=s.split(from).join(to);
writeFileSync(t,s);
renameSync(t,p);
console.log(JSON.stringify({patched:true}));
