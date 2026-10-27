import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyScope,validateScopedOriginalFindings} from './verify-scope.mjs';
const base=import.meta.dirname,sha=x=>createHash('sha256').update(x).digest('hex'),checks=[],results=[];
for(const k of ['193','208','276']){
 const real=await verifyScope(k);results.push({proof:real.proof,call:real.rawCall});checks.push({key:k,name:'real candidate/source/old findings/raw/request/images and explicit independent allowance',passed:true});
 for(const [name,mutate]of [
  ['candidate-pin',x=>x.current.candidate.sha256='0'.repeat(64)],
  ['body-condition',x=>x.candidate.body.blocks.find(b=>b.type==='text').text+='unapproved'],
  ['body-order',x=>x.candidate.body.blocks.reverse()],
  ['unknown-removal',x=>x.candidate.figures.find(f=>f.unknowns?.length).unknowns=[]],
  ['old-severity',x=>x.old.modelReview.issues.find(i=>i.severity!=='source-note').severity='source-note'],
  ['missing-image-check',x=>x.old.modelReview.imageChecks.pop()],
  ['independent-reading',x=>x.review.pointChecks[0].reading='8m'],
  ['material-unknown',x=>x.review.contributionChecks[0].requiresExactPointForAuthorArgument='yes'],
  ['no-independent-allowance',x=>x.review.conclusion='insufficient-evidence'],
  ['lost-limit',x=>x.current.mandatoryDisplayLimits.pop()],
  ['missing-context',x=>x.projection.candidateBody.blocks.pop()],
  ['source-change',x=>x.source.blocks.reverse()]
 ]){
  const x=structuredClone(real.inputs);mutate(x);assert.throws(()=>validateScopedOriginalFindings(k,x),name);checks.push({key:k,name,rejected:true});
 }
}
const h=JSON.parse(await readFile(base+'/evidence/handoff249.json'));
const candidate=JSON.parse(await readFile(h.parent276Evidence.candidate.path)),parent=JSON.parse(await readFile(h.parent276Evidence.parent.path)),a=JSON.parse(await readFile(h.parent276Evidence.parentAudit.path)),raw=JSON.parse(await readFile(h.parent276Evidence.parentRaw.path));
assert.equal(sha(await readFile(h.parent276Evidence.parentRaw.path)),h.parent276Evidence.parentRaw.sha256);assert.deepEqual(JSON.parse(raw.rawLastMessage),a.modelReview);assert.deepEqual(candidate.body,parent.body);
for(const f of h.parent276Evidence.figures){const current=candidate.figures.find(x=>x.figureId===f.figureId);assert.deepEqual(current,parent.figures.find(x=>x.figureId===f.figureId));assert.equal(sha(JSON.stringify(current)),f.fullObjectSha256);assert.deepEqual(a.modelReview.figureChecks.find(x=>x.id===f.figureId),f.parentCheck);assert.equal(f.parentCheck.verdict,'faithful');}
checks.push({key:'276',name:'b0014/b0025 complete figure/body/source + actual parent raw/checks inherit unchanged',passed:true});
const pp=JSON.parse(await readFile(base+'/evidence/193-binding.json')).pdf193IndependentSourceVersion;
for(const ref of [pp.parent,pp.originalAudit,pp.sourcePage,pp.webSource])assert.equal(sha(await readFile(ref.path)),ref.sha256);
const p=JSON.parse(await readFile(pp.parent.path)),text=p.body.blocks.find(b=>b.sourceBlockIds.includes('79-cn-p193-b6')).text;
for(const slice of pp.slices)assert.equal([...text].slice(slice.fromCodepoint,slice.toCodepoint).join(''),slice.text);
checks.push({key:'193',name:'two independent PDF193/b6 version slices remain paired, captured Web text unchanged',passed:true});
for(const r of JSON.parse(await readFile(base+'/protected.json')))assert.equal(sha(await readFile(r.path)),r.sha256);
await writeFile(base+'/verification.json',JSON.stringify({results,checks,count:checks.length,newModelCalls:0,candidateChanges:0,rawChanges:0,admissionGranted:false,ordinaryPassed:false},null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,unknownPoints:9,newModelCalls:0,passed:true}));
