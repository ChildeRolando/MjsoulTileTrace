import pathlib

root = pathlib.Path('E:/AgentData/Coach/knowledge/processing')
local = pathlib.Path(__file__).resolve().parent
s = (root/'integration/coac244-maker-schema-fix-20261028/run222-fixed.mjs').read_text(encoding='utf-8')
for old,new in [
 ('coac248-web-222-5-r3-20261028','coac248-web-256-18-r2-20261028'),
 ('79-cn-chapter-222-5','79-cn-chapter-256-18'),
 ('cv1775262','cv1785770'),
 (':b0018',':b0016'),
 ('f26e0767a7c2ce54998646bea45175589f9aa48ec7ed8284824ca9e5e3ddf2d6','56ea08c0868e87628f61a777a35c40a9a8372bddfcca23a7daef6be3a3bdafe2'),
 ('403417eaef97305d99506bc9d0a2ec39d4128cfedd0a609ecb470f22a4b252ec','8341055fc9fec8aacf5c8dd6344cb5af99cfc6998f76105f7dc7d8e13a9a4b21'),
 ('01a17ec7-dbf3-77e6-a4f4-4dae65b73038','01a17f8d-38c9-7cf9-ad2c-01bddd851470'),
 ('completeNonTargetFigures:9','completeNonTargetFigures:3'),
 ('two-reference','exact-8s'),
]:
 s=s.replace(old,new)
start=s.index("const pointPath=")
end=s.index("await bind(parent.provenance.reuseMap",start)
s=s[:start]+'''const old=parent.figures.find(f=>f.figureId===target);
assert.equal(old.sourceAssetBindings[0].sha256??old.sourceAssetBindings[0].sourceSha256,'1f763b6fa772080e64a8d6e4e11d6f85d2147bfd1a8aacce6216e2f1e3054dce');
const reviewRawPath='audit/calls/6bf6cb0d-1123-45f8-a4b0-975dd270b4c0.json';
await bind(reviewRawPath,'6ed8519078198ecb6310bf2ed36dc5aaddff786ea5b79a82afdf555146ffcf1c');
const issue=notes.modelReview.issues.find(i=>i.severity==='error'&&i.targetId===target);
assert(issue&&JSON.stringify(issue).includes('8s')&&JSON.stringify(issue).includes('12'));
assert.equal(old.transcription.split('7s [索子，数字不明] 9s').length,2);
const expected=old.transcription.replace('7s [索子，数字不明] 9s','7s 8s 9s');
assert.equal(old.unknowns.length,3);
assert.equal(old.unknowns[0],'下方手牌从左到右第12张：可辨为索子，数字无法可靠辨认。');
const expectedUnknowns=old.unknowns.slice(1);
''' + s[end:]
start=s.index('const priorCallIds=')
end=s.index('async function joint()',start)
s=s[:start]+"const priorCallIds=['d59465bb-7539-4e37-850f-08a0bacea007','62f11e87-87a0-412c-bc76-452af479ef49','8edb9889-e306-4695-8b5a-1bc1dc8cf37e'];\n"+s[end:]
s=s.replace('unknowns:old.unknowns,caption:old.caption','unknowns:expectedUnknowns,caption:old.caption')
start=s.index('const prompt=[')
end=s.index('await mkdir(local',start)
s=s[:start]+'''const prompt=[
 'Perform only one exact tile repair in the bound parent figure. The attached original500x500 PNG and its2x nearest-neighbor view are the same source asset, not new source information. No other tile reading is requested.',
 'The target is the bottom concealed hand, twelfth tile from left, between7s and9s, native top-left half-open bbox[368,459,391,489). Independently check the actual source at this location. The original independent full-chapter review identified8s here; use the image rather than copying any controller assertion.',
 'Return translations:[] and exactly one figure. If the image confirms8s, change only the exact unique substring "7s [索子，数字不明] 9s" to "7s 8s 9s" and remove only the first unknown entry naming the bottom hand tile12. Preserve the remaining two river unknown strings exactly. Every other character, whitespace, punctuation, line break, tile, kind, caption and sourceNotes must remain identical. Do not fix unrelated source-note attachment numbering, do not add a note, and do not infer any unknown from tile logic or source prose. If8s cannot be confirmed, retain the old text and unknowns; local gates will reject that output without retry.',
 JSON.stringify({chapterId:chapter,sourceSha256:parent.source.sourceSha256,parentSha256:parentSha,
 parentFigure:{...fields,unknowns:old.unknowns},expectedUnknowns,sourceAssetBindings:old.sourceAssetBindings,
 bbox:[368,459,391,489],originalReviewIssue:issue,
 attachments:visualInputs.map((x,i)=>({attachment:i+1,view:x.role,sha256:x.sha256,scale:x.scale}))})
].join('\\n\\n');
// Zero-call negative checks for the exact whitelist and array coverage before production.
const valid={translations:[],figures:[{...fields,transcription:expected}]};
const validate=x=>validateWebProductionOutput(x,{textIds:[],figureIds:old.sourceBlockIds,fixedFigure:fields,expectedTranscription:expected});
validate(valid);
const negativeChecks=[];
for(const[name,mutate]of [
 ['extra-text',x=>x.translations.push({sourceBlockId:'other',text:'out of scope'})],
 ['missing-figure',x=>x.figures=[]],['duplicate-figure',x=>x.figures.push(x.figures[0])],
 ['empty-transcription',x=>x.figures[0].transcription=''],
 ['other-tile-change',x=>x.figures[0].transcription=x.figures[0].transcription.replace('1m','2m')],
 ['extra-unknown-removal',x=>x.figures[0].unknowns=[]],
 ['duplicate-unknown',x=>x.figures[0].unknowns.push(x.figures[0].unknowns[0])],
 ['caption-change',x=>x.figures[0].caption+='changed'],
 ['sourceNote-change',x=>x.figures[0].sourceNotes=[]]
]){const x=structuredClone(valid);mutate(x);assert.throws(()=>validate(x));negativeChecks.push({name,rejected:true});}
''' + s[end:]
s=s.replace('pointHandoffSha256:sha(await bytes(pointPath)),','reviewRawPath,reviewRawSha256:sha(await bytes(reviewRawPath)),negativeChecks,')
s=s.replace("field:'transcription',from:old.transcription,to:expected,allOtherFieldsFixed:true","fields:['transcription','unknowns'],from:old.transcription,to:expected,unknownsFrom:old.unknowns,unknownsTo:expectedUnknowns,bbox:[368,459,391,489],allOtherFieldsFixed:true")
s=s.replace("f.provenance={method:","f.provenance={method:")
s=s.replace('runnerSha256:sha(await readFile(fileURLToPath(import.meta.url))),revision};','runnerSha256:sha(await readFile(fileURLToPath(import.meta.url))),revision,requestExecution:structuredClone(record.requestExecution)};')
old='const proof=await verifyWebProductionCall(root,c),presentation=await verifyWebPresentations(root,c),checks=webDeterministicChecks(c,source,sha(sb));'
new='''const proof=await verifyWebProductionCall(root,c);
 const unpresented=structuredClone(c);for(const f of unpresented.figures)delete f.presentationAsset;
 delete unpresented.candidateSha256;unpresented.candidateSha256=sha(JSON.stringify(unpresented));
 const unpresentedPath=rel(join(run,'model-output-without-display.json'));await write(abs(unpresentedPath),unpresented);
 c.provenance.derivedFromCandidate={path:unpresentedPath,sha256:sha(await bytes(unpresentedPath)),reason:'Exact new model-authored semantic output; inherited original-image presentations bound separately. Not separately review eligible.'};
 delete c.candidateSha256;c.candidateSha256=sha(JSON.stringify(c));
 const presentation=await verifyWebPresentations(root,c),checks=webDeterministicChecks(c,source,sha(sb));'''
assert old in s;s=s.replace(old,new)
s=s.replace('targetOtherFieldsPreserved:true','targetOtherFieldsPreserved:true,onlyFirstUnknownRemoved:true')
s=s.replace("raw and ledger retained; no retry","raw and ledger retained; no retry")
s=s.replace('model:result.requestExecution.model,reasoningEffort:result.requestExecution.reasoningEffort','model:result.requestExecution?.model??null,reasoningEffort:result.requestExecution?.reasoningEffort??null')
s=s.replace('exact two-reference whitelist','exact8s and first-unknown-removal whitelist')
s=s.replace('verifyWebRevisionContent(probe,parent,notes);',"let revisionScopeError=null;try{verifyWebRevisionContent(probe,parent,notes);}catch(e){revisionScopeError={code:e.message,stack:e.stack};}")
s=s.replace('negativeChecks,parentProof','negativeChecks,revisionScopeError,parentProof')
s=s.replace('preflightPassed:true,modelCalls:0','preflightPassed:!revisionScopeError,revisionScopeError,modelCalls:0')
s=s.replace('await mkdir(run,{recursive:false});',"assert.equal(revisionScopeError,null,'No dispatch until existing owner verifies and freezes a legal exact-target admission preserving the two uncertain entries.');\nawait mkdir(run,{recursive:false});")
local.joinpath('run.mjs').write_text(s,encoding='utf-8',newline='\n')
