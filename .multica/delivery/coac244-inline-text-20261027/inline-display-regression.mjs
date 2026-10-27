import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {deriveInlineDisplay} from './inline-display.mjs';
const out='.multica/delivery/coac244-inline-text-20261027',results=[];
for(const key of ['155','162','234']){
 const p=JSON.parse(await readFile(`${out}/probe-${key}-NOT-A-CANDIDATE.json`)),before=JSON.stringify(p),d=deriveInlineDisplay(p),ids=p.provenance.revision.textBlockIds;
 for(const b of d.body.blocks.filter(b=>ids.includes(b.sourceBlockIds[0]))){
  const original=p.body.blocks.find(a=>a.sourceBlockIds[0]===b.sourceBlockIds[0]);
  assert.equal(b.displaySegments.map(s=>s.text).join(''),b.text);
  assert.deepEqual(b.sourceSegments,original.sourceSegments);
  assert.deepEqual(b.displaySegments.map(s=>({marks:s.marks,href:s.href})),original.sourceSegments.map(s=>({marks:s.marks,href:s.href})));
 }
 assert.equal(JSON.stringify(p),before);
 const bad=structuredClone(p);bad.body.blocks.find(b=>ids.includes(b.sourceBlockIds[0])).sourceSegments[0].text+='unbound';assert.throws(()=>deriveInlineDisplay(bad));
 results.push({chapter:key,displayTextExact:true,sourceSegmentsUnchanged:true,sourceMarksAndLinksPreserved:true,inputUnchanged:true,unalignedSegmentsRejected:true});
}
const real=JSON.parse(await readFile('E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/79-bilibili-cn/cv1751265.coac244inline20261027.display.json'));
assert.ok(deriveInlineDisplay(real).body.blocks[7].displaySegments.some(s=>s.text.includes('没关系')&&s.marks.some(m=>m.startsWith('strong:'))));
await writeFile(`${out}/display-regressions.json`,JSON.stringify({modelCalls:0,results,actual155StrongPreserved:true},null,2)+'\n');
console.log(JSON.stringify({displayCases:results.length,actual155StrongPreserved:true,modelCalls:0}));
