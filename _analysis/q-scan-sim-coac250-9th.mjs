import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
const root='E:/AgentData/Coach/knowledge/processing';
const canon=n=>{let v=n.replace(/\.json$/,'');for(;;){const w=v.replace(/\.(?:display|coac269rev\d+|rev\d+|r\d+)$/,'');if(w===v)return v;v=w;}};
const versionRank=n=>n.endsWith('.display.json')?3:((/\.(?:coac269rev|rev|r)\d+\.json$/.test(n))?1:2);
let diffs=0;
for(const sid of ['79-bilibili-cn','modern-yabejp-ja']){
 const dir=join(root,'web-production/v1/candidates',sid),names=await readdir(dir);
 const oldSel=new Map();
 for(const name of names.filter(n=>n.endsWith('.json')&&!/\.r(?:ev)?\d+(?:\.display)?\.json$/.test(n))){if(/\.(?:formal-v|labels-v|source-note-v|processing-note-v)\d+/.test(name))continue;const article=name.replace(/(?:\.display)?\.json$/,'');if(!oldSel.has(article)||name.endsWith('.display.json'))oldSel.set(article,name);}
 const newSel=new Map();
 for(const name of names.filter(n=>n.endsWith('.json')&&!/\.r(?:ev)?\d+(?:\.display)?\.json$/.test(n))){if(/\.(?:formal-v|labels-v|source-note-v|processing-note-v)\d+/.test(name))continue;const article=canon(name),prior=newSel.get(article);if(!prior||versionRank(name)>versionRank(prior))newSel.set(article,name);}
 const removed=[...oldSel.keys()].filter(k=>!newSel.has(k));
 const added=[...newSel.keys()].filter(k=>!oldSel.has(k));
 const changed=[...oldSel.keys()].filter(k=>newSel.has(k)&&oldSel.get(k)!==newSel.get(k));
 console.log(sid,'old',oldSel.size,'new',newSel.size,'removed',removed,'added',added,'changedFile',changed.map(k=>[k,oldSel.get(k),newSel.get(k)]));
 diffs+=removed.length+added.length+changed.length;
}
console.log('totalSelectionDiffs',diffs);
