import pathlib,json,hashlib
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');D=pathlib.Path(__file__).parent;P=R/'integration/coac248-193234-text-20261028';T=R/'audit/runtimes/coac248-193234-text-v1-20261028'
assert not (T/'runtime-manifest.json').exists()
sha=lambda b:hashlib.sha256(b).hexdigest()
(T/'text193-recovery.mjs').write_bytes((D/'text193-recovery.mjs').read_bytes())
s=pathlib.Path('.multica/delivery/coac248-182201-20261028/run.mjs').read_text(encoding='utf-8')
s=s.replace("release.jobs.find(j=>j.articleId===process.argv[2])","release.jobs.find(j=>j.key===process.argv[2])")
s=s.replace("auth=job.plan.authorizationCommentId","auth=job.authorizationCommentId")
s=s.replace("coac248-182201-","coac248-193234-text-")
s=s.replace("const {assertInlinePlan,inlineTextAllowed}","const {assertInlinePlan,inlineTextAllowed}")
s=s.replace("const protectedFiles=new Map();","const {allowed193Text}=await import(pathToFileURL(join(rt,'text193-recovery.mjs')));\nconst protectedFiles=new Map();")
s=s.replace("await bind(job.planPath,job.planSha256);assertInlinePlan(job.plan,parent,notes,source,job.plan.bindings);","if(job.key==='234'){await bind(job.planPath,job.planSha256);assertInlinePlan(job.plan,parent,notes,source,job.plan.bindings);}else{await bind(job.reviewRawPath,job.reviewRawSha256);await bind(job.priorReviewPlanPath,job.priorReviewPlanSha256);}\nfor(const f of release.externalDependencies)await bind(f.path,f.sha256);")
s=s.replace("const reviewCall=notes.calls[0];await bind('audit/calls/'+reviewCall.callId+'.json',sha(await bytes('audit/calls/'+reviewCall.callId+'.json')));","if(job.key==='234'){const rc=notes.calls[0];await bind('audit/calls/'+rc.callId+'.json',sha(await bytes('audit/calls/'+rc.callId+'.json')));}")
s=s.replace("inlineJapanese:{path:job.planPath,sha256:job.planSha256,plan:job.plan}","...(job.key==='234'?{inlineJapanese:{path:job.planPath,sha256:job.planSha256,plan:job.plan}}:{textRecovery193:{schema:'coac248-exact193-text-recovery/1',authorizationCommentId:auth}})")
s=s.replace("assert.equal(inherit.chapterAccepted,false);","if(job.key==='193')assert.equal(inherit.chapterAccepted,false);")
s=s.replace("quote=job.plan.edits[0].quotedText","quote=job.plan?.edits[0].quotedText")
s=s.replace("editPlan:job.plan","editPlan:job.plan??{clausePrefix:job.textPrefix,clauseSuffix:job.textSuffix},actualPriorReview:notes.modelReview??notes,authorizationCommentId:auth")
start=s.index('const prompt=[');end=s.index('async function joint()')
s=s[:start]+'''const prompt=[
 job.key==='193'?'仅修正日文193的b0081一个例外子句。原文「入り目でなければ」以及完整前后论证在有序配对中。只保留这一命名例外，不为入り目制造等价定义，不增添宣言牌与新摸牌是否同种、是否补成面子等原文不支持的条件。原有两个条件已由真实独审退回，必须修正；不要把独审其它建议混成新条件。子句须保留原词「入り目」，以简明中文表达排除该情形的条件；本次不解释术语机制。严格保持指定prefix与suffix及所有其它字符。':'仅为234/b0003中ゴットー、ワンツー、ワンスリー三词各紧接增加（中文释义）；原日文保留。原支付数值、条件、中文说明、NBSP、标点和其它字符全部保持。',
 'Return exactly one complete target text under translations, figures:[]. No external tools, resources, images or extra contributions. Arrays must contain exactly the authorized target once. Preserve all author conditions, numbers, modality, inline tile arguments and order. Do not touch any figure, unknown, caption or sourceNote; all are inherited. This is pure text, not image re-identification.',
 JSON.stringify({...payload,orderedPairs:source.blocks.map((s,i)=>({position:i,source:s,candidate:parent.body.blocks[i],figure:parent.body.blocks[i].type==='figure'?parent.figures.find(f=>f.figureId===parent.body.blocks[i].figureId):null}))})
].join('\\n\\n');
function validate(output){validateWebProductionOutput(output,{textIds:[job.targetId],figureIds:[]});const t=output.translations[0].text;assert(t!==old.text,'unchanged');assert(job.key==='193'?allowed193Text(t):inlineTextAllowed(job.plan,job.targetId,old.text,t),'outside_exact_whitelist');}
let sample=old.text;if(job.key==='193')sample=job.textPrefix+'若排除入り目的情形'+job.textSuffix;else for(const e of job.plan.edits)sample=sample.replace(e.quotedText,e.quotedText+'（中文释义）');
const valid={translations:[{sourceBlockId:job.targetId,text:sample}],figures:[]};validate(valid);
const negatives=[];
for(const[n,mut]of [['missing',x=>x.translations=[]],['duplicate',x=>x.translations.push(x.translations[0])],['empty',x=>x.translations[0].text=''],['wrong-target',x=>x.translations[0].sourceBlockId+='x'],['extra-figure',x=>x.figures.push({})],['unchanged',x=>x.translations[0].text=old.text],['outside-clause',x=>x.translations[0].text+='。'],['extra-key',x=>x.other=true]]){const x=structuredClone(valid);mut(x);assert.throws(()=>validate(x));negatives.push({name:n,rejected:true});}
for(const[n,mut]of [['wrong-parent-sha',x=>x.provenance.revision.parentSha256='0'.repeat(64)],['wrong-source-sha',x=>x.source.sourceSha256='0'.repeat(64)],['wrong-target-path',x=>x.provenance.revision.textBlockIds=['other']],['non-target-text',x=>x.body.blocks.find(b=>b.type==='text'&&b.sourceBlockIds[0]!==job.targetId).text+='。'],['caption',x=>x.figures[0].caption+='。'],['unknown-mutation',x=>x.figures[0].unknowns=['invented']],['order',x=>x.body.blocks.reverse()]]){const x=structuredClone(probe);mut(x);assert.throws(()=>audit.verifyWebRevisionContent(x,parent,notes));negatives.push({name:n,rejected:true});}
if(job.key==='193'){for(const t of [job.textBefore,job.textPrefix+'若新摸牌未补成面子'+job.textSuffix])assert.equal(allowed193Text(t),false);negatives.push({name:'unsupported-definition',rejected:true});}
''' +s[end:]
s=s.replace("row.existingCandidate.sha256,job.parentSha256","row.existingCandidate.sha256,job.baseParentSha256")
s=s.replace("audit/web/articles/79-bilibili-cn","audit/web/articles/'+job.sourceId+'")
s=s.replace("web-production/v1/candidates/79-bilibili-cn","web-production/v1/candidates/'+job.sourceId+'")
s=s.replace("assert.deepEqual(candidates,[job.articleId+'.display.json',job.articleId+'.json'].sort(),'new/inflight candidate');","assert.deepEqual(candidates,job.priorCandidateNames,'new/inflight candidate');")
s=s.replace(".filter(c=>c.articleId===job.articleId)",".filter(c=>c.articleId===job.articleId&&c.sourceId===job.sourceId)")
s=s.replace("for(const f of manifest.files)await bind(join(rt,f.name),f.sha256);","for(const f of manifest.files)await bind(join(rt,f.name),f.sha256);")
s=s.replace("await gates();const exclusion", "await audit.assertWebReuseNotExcluded(root,job.parentPath,job.parentSha256);\nawait gates();const exclusion")
s=s.replace("whitelist:job.plan.edits","whitelist:job.plan?.edits??[{path:'/body/blocks/80/text',prefix:job.textPrefix,suffix:job.textSuffix,operation:'replace-only-named-exception-clause'}]")
s=s.replace("carryIssue:notes.modelReview.issues.filter(i=>i.targetId===job.carryId)","carryIssue:job.key==='193'?notes.modelReview:notes.modelReview.issues.filter(i=>i.severity==='source-note')")
s=s.replace("job.articleId+'.r1.display.json'","job.articleId+'.'+job.variant+'.display.json'")
# Standard plain-text production and independent text review share sol/high; no visual call.
for dst in [D/'run.mjs',P/'run.mjs'] :dst.write_text(s,encoding='utf-8',newline='\n')
release=json.loads((P/'release-unfrozen.json').read_bytes());external=[]
oldrt=R/'audit/runtimes/coac248-193213-mixed-v1-20261028';m=json.loads((oldrt/'runtime-manifest.json').read_bytes())
for path in [oldrt/'runtime-manifest.json',*(oldrt/f['name'] for f in m['files'])]:external.append({'path':str(path).replace('\\','/'),'sha256':sha(path.read_bytes())})
release['externalDependencies']=external
files=[{'name':p.name,'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size} for p in sorted(T.iterdir()) if p.is_file()]
manifest={'schema':'coac248-exact193234-text-production-runtime/1','authorizationCommentId':release['authorizationCommentId'],'scope':release['jobs'],'files':files,'externalDependencies':external,'model':'gpt-6.1-sol','reasoningEffort':'high','images':[],'wholeChapterPassed':False}
(T/'runtime-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');release['runtimeManifestSha256']=sha((T/'runtime-manifest.json').read_bytes())
for dst in [D/'release.json',P/'release.json']:dst.write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'runtime':str(T),'sha256':release['runtimeManifestSha256'],'files':len(files),'external':len(external)}))
