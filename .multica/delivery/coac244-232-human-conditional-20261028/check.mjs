import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {ROOT,verify232Conditional,assert232Scope,load} from './admit.mjs';
import {verifyStaged,verifyDisplay} from './stage.mjs';
const D=ROOT+'/integration/coac244-232-human-conditional-20261028',m=await load(D+'/manifest.json'),r=await load(m.receipt.path),scope=await load(m.scope.path),raw=await load(r.raw.path),c=await load(r.candidate.path),parent=await load(r.parent.path);
const g=await verify232Conditional(ROOT,r.candidate.path),stage=await verifyStaged(ROOT,D+'/stage'),b=(await load(D+'/stage/textbook-bodies.json')).chapters[0].blocks,original=(await load(D+'/baseline-pin.json')).originalBlocks,cases=[];
const reject=(name,fn)=>{assert.throws(fn,undefined,name);cases.push({name,rejected:true});},copy=x=>structuredClone(x);
for(const[name,edit]of [
 ['wrong author text',x=>x.body.blocks[0].text+='x'],['changed source',x=>x.source.sourceSha256='bad'],['wrong9m',x=>x.figures[0].transcription=x.figures[0].transcription.replace('8s 9m','8s 8m')],['deleted unrelated unknown',x=>x.figures[0].unknowns.pop()],['changed figure caption',x=>x.figures[0].caption+='x'],['changed non-target figure',x=>x.figures[1].transcription+='x']]){const x=copy(c);edit(x);reject(name,()=>assert232Scope(x,parent,r,raw,scope));}
for(const[name,edit]of [
 ['missing limitation',x=>x.requiredDisplayLimitations.pop()],['moved anchor',x=>x.anchor.beforeSourceBlock='wrong'],['wrong object hash',x=>x.anchor.figureSha256='bad'],['wrong candidate SHA',x=>x.candidate.sha256='bad'],['pretend installed old proposal',x=>x.implementationVerified=true]]){const x=copy(scope);edit(x);reject(name,()=>assert232Scope(c,parent,r,raw,x));}
for(const[name,edit]of [['technical false rewritten',x=>x.verification.limitedUnknownOkay=true],['ordinary whole pass forged',x=>x.verification.wholeChapterPassed=true]]){const x=copy(r);edit(x);reject(name,()=>assert232Scope(c,parent,x,raw,scope));}
for(const[name,edit]of [
 ['new unresolved semantic issue',x=>x.output.issues[0].description='new semantic error'],['application not faithful',x=>x.output.applications[0].faithful=false],['argument not faithful',x=>x.output.authorArgumentFaithful=false],['unknown not conditionally sufficient',x=>x.output.unknownAndLimits.unknownChecks[0].sufficientWithLimits=false],['limitation not sufficient',x=>x.output.unknownAndLimits.limitChecks[0].sufficient=false]]){const x=copy(raw),rr=copy(r);edit(x);x.rawLastMessage=JSON.stringify(x.output);rr.modelReview=x.output;reject(name,()=>assert232Scope(c,parent,rr,x,scope));}
for(const[name,edit]of [
 ['remove required note',x=>x.splice(x.findIndex(z=>z.id==='limited232-1'),1)],['mark annotation as author',x=>x.find(z=>z.id==='limited232-1').authorText=true],['change note text',x=>x.find(z=>z.id==='limited232-1').text+='x'],['move note',x=>{const at=x.findIndex(z=>z.id==='limited232-1');x.push(x.splice(at,1)[0]);}],['duplicate annotation',x=>x.push(copy(x.find(z=>z.id==='limited232-1')))],['rewrite author block',x=>x.find(z=>!z.id.startsWith('limited232-')&&z.text).text+='x'],['restore obsolete right-river unknown',x=>x.find(z=>z.type==='figure').transcriptionText+='右侧牌河从上数第2张为万子，但无法可靠辨认具体点数']]){const x=copy(b);edit(x);reject(name,()=>verifyDisplay(x,original,g));}
await assert.rejects(verify232Conditional('E:/wrong-root',r.candidate.path));cases.push({name:'wrong root',rejected:true});
await assert.rejects(verify232Conditional(ROOT,r.parent.path));cases.push({name:'old different SHA',rejected:true});
const report={schema:'coac244-exact232-conditional-display-verification/1',stage,negativeChecks:cases,negativeChecksPassed:cases.length,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackCompleted:false,newModelCalls:0};
await writeFile(D+'/verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({negativeChecksPassed:cases.length,...stage}));
