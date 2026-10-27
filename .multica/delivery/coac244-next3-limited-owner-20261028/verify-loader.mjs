// Consume the existing250 loader/stages read-only. Never build, invoke, write pointer or launch a consumer.
import assert from 'node:assert/strict';import {readFile,writeFile,copyFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const base=import.meta.dirname,P='E:/AgentData/Coach/knowledge/processing',L=P+'/integration/coac250-next3-limited-20261028',W='C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-250-2b5a0cbe65e0/worktree/_analysis/n3';
const sha=x=>createHash('sha256').update(x).digest('hex'),load=async p=>JSON.parse(await readFile(p));
const manifestBytes=await readFile(L+'/manifest.json'),manifest=JSON.parse(manifestBytes);for(const f of manifest.files)assert.equal(sha(await readFile(f.path)),f.sha256);
const mod=await import(pathToFileURL(L+'/admit.mjs')),pins=await load(base+'/pins.json'),rows=[];
for(const k of ['193','208','276']){
 const p=pins[k],gate=await mod.verifyLimitedUnknownFidelity(P,p.candidate.path);assert.equal(gate.status,'admitted-exact-limited-unknown-fidelity');assert.equal(gate.standardWholeArticlePassed,false);assert.equal(gate.production.sha256,p.candidate.sha256);assert.equal(gate.originalModelChecks.passed,false);
 const stage=W+'/s'+k,receipt=await load(stage+'/web-stage-receipt.json'),bodies=await load(stage+'/textbook-bodies.json'),display=await load(stage+'/display-limits.json');
 assert.equal(receipt.candidateSha256,p.candidate.sha256);assert.equal(receipt.standardWholeArticlePassed,false);assert.equal(receipt.modelCalls,0);assert.equal(receipt.activeLibraryChanged,false);
 const blocks=bodies.chapters[0].blocks,notes=blocks.filter(b=>b.id.startsWith('limited-next3-')),author=blocks.filter(b=>!b.id.startsWith('limited-next3-'));
 assert.equal(sha(JSON.stringify(author)),display.originalBlocksSha256);assert.equal(notes.length,gate.requiredDisplayLimitations.length+(k==='193'?1:0));
 for(const[t,i]of gate.requiredDisplayLimitations.map((t,i)=>[t,i])){assert.equal(notes[i].text,'【审校范围（非原文）'+(i+1)+'】'+t);assert.equal(notes[i].authorText,false);}
 if(k==='193'){assert(notes.at(-1).text.includes('不是网页原文补写'));assert(notes.at(-1).text.includes('79-cn-chapter-193-4-pdf193-supplement-unit-1'));}
 const candidate=await load(p.candidate.path),source=await load(p.source.path),ids=new Set(author.flatMap(b=>b.locator.sourceBlockIds));assert.deepEqual([...ids].sort(),source.blocks.map(b=>b.id).sort());
 const figures=author.filter(b=>b.type==='figure'||b.inlineFigures?.length).flatMap(b=>b.type==='figure'?[b]:b.inlineFigures);assert.equal(figures.length,3);
 for(const f of candidate.figures)for(const unknown of f.unknowns??[])assert(JSON.stringify(author).includes(unknown),'unknown missing from actual stage');
 for(const n of ['web-stage-receipt.json','display-limits.json','textbook-bodies.json'])await copyFile(stage+'/'+n,base+'/evidence/'+k+'-actual-stage-'+n);
 await writeFile(base+'/evidence/'+k+'-actual-admission.json',JSON.stringify(gate,null,2)+'\n');
 rows.push({key:k,canonical:p.canonical,candidateSha256:p.candidate.sha256,admissionStatus:gate.status,ordinaryWholeArticlePassed:false,actualDisplayedBlocks:blocks.length,authorBlocks:author.length,figures:figures.length,nonAuthorLimitations:notes.length,sourceBlocksCovered:ids.size,allUnknownsDisplayed:true,pdfSourceVersionPaired:k==='193',newCalls:0,stagePath:stage});
}
assert.equal(sha(await readFile(L+'/manifest.json')),sha(manifestBytes));await copyFile(L+'/manifest.json',base+'/loader-manifest.json');
await writeFile(base+'/loader-verification.json',JSON.stringify({existingConsumerRun:'01a17f9e-1da5-7423-9f96-2b5a0cbe65e0',loader:L,manifestSha256:sha(manifestBytes),rows,newModelCalls:0,newStagesBuilt:0,newConsumers:0,wholeChapterPassed:false,masterMcpArenaReadback:'owned by existing250; not claimed by these stage checks'},null,2)+'\n');
console.log(JSON.stringify({existingLoaderVerified:true,rows,newModelCalls:0}));
