"""Reuse bounded intake code; change only the one target's route and evidence checks."""
from pathlib import Path
p=Path('_analysis/coac250-162');out=Path('_analysis/coac250-157')
for name in ['integrate.mjs','readback.mjs','update-coverage.mjs','archive.mjs','.gitattributes']:
 t=(p/name).read_text(encoding='utf-8').replace('coac250-162','coac250-157').replace('162-3','157-11').replace('cv1751316','cv1751276')
 t=t.replace('v20','NEXT').replace('v19','v20').replace('NEXT','v21')
 if name=='integrate.mjs':
  t=t.replace('load162InlineCompatibility','load157VisionReview')
  t=t.replace("await copyFile(prior.output+'/155-display-segments-proof.json',output+'/155-display-segments-proof.json');","await copyFile(prior.output+'/155-display-segments-proof.json',output+'/155-display-segments-proof.json');await copyFile(prior.output+'/162-3-intake-annotations.json',output+'/162-3-intake-annotations.json');await copyFile(prior.output+'/162-display-segments-proof.json',output+'/162-display-segments-proof.json');")
  start=t.index(' const inlineCompatibility=');end=t.index(' const candidate=',start)
  t=t[:start]+" const visionReview=pre.visionReview,{stage:stageWebTextbook,verify:verifyAuditForWebCandidate}=await load157VisionReview(root,pre.candidate.path,visionReview);\n const destination=output+'/stages/79-bilibili-cn-'+article,stageReceipt=await stageWebTextbook({processingRoot:root,candidatePath:pre.candidate.path,destination,verify:verifyAuditForWebCandidate});Object.assign(stageReceipt,{visionReview});await atomic(destination+'/web-stage-receipt.json',stageReceipt);await copyFile(destination+'/web-stage-receipt.json',dir+'/stage-receipt.json');\n"+t[end:]
  start=t.index('inlineCompatibility,displaySegmentsProof,decision:');end=t.index(',modelCalls:0};',start)
  t=t[:start]+"visionReview,actualReviewRequest:(await load(pre.handoff.path)).chapters[0].requestExecution,decision:'First independent terra/max request for this exact SHA; full18 blocks/7 figures compared, with5 original target images and5 enlargements sent and2 authenticated prior images reused. Preserve original receipt method label and original sol/high production history; remote weights unknown. No integration model call.'"+t[end:]
  t=t.replace('chapterIds:[chapter],inlineCompatibility,displaySegmentsProof,intakeAnnotations','chapterIds:[chapter],visionReview,intakeAnnotations')
  t=t.replace('cv1751276.coac244inline20261027.display.json','cv1751276.r1.display.json')
  start=t.index("selectionReason:'157-11:");end=t.index(',intakeAnnotations};',start)
  t=t[:start]+"selectionReason:'157-11 original passed SHA: first terra/max full article independent review; retain actual request, frozen27 runtime, historical sol/high production and2 authenticated image reuses. Integration model calls0.',visionReview"+t[end:]
  for a,b in [('nc.images.length,15','nc.images.length,7'),('corpus.units.length,237','corpus.units.length,238'),('build.chapters,229','build.chapters,230'),('build.figures,5121','build.figures,5128')]:t=t.replace(a,b)
 if name=='readback.mjs':
  for a,b in [('catalog.length,229','catalog.length,230'),('figures.length,15','figures.length,7'),('bodyFigures.length,15','bodyFigures.length,7'),('mcp.units.length,237','mcp.units.length,238'),('mcp.exactImageCount,5121','mcp.exactImageCount,5128'),('sourceOccurrences:15','sourceOccurrences:7'),('sourceBodyBlocks:34','sourceBodyBlocks:18'),('note.issues.length,1','note.issues.length,0')]:t=t.replace(a,b)
  start=t.index('assert.deepEqual(note.inlineCompatibility,');end=t.index('\n',start)
  t=t[:start]+"assert.deepEqual(note.visionReview,pre.visionReview);assert.deepEqual(note.actualReviewRequest,(await load(pre.handoff.path)).chapters[0].requestExecution);"+t[end:]
  t=t.replace("'155-display-segments-proof.json']","'155-display-segments-proof.json','162-3-intake-annotations.json','162-display-segments-proof.json']")
  start=t.index(" const proof=await load(dir+'/display-segments-proof.json');");end=t.index(' const staged=',start)
  t=t[:start]+" const expected=candidate.body.blocks.filter(b=>b.type==='text').flatMap(b=>b.sourceSegments??[{text:b.text,marks:[],href:null}]).map(s=>({text:s.text,marks:s.marks??[],href:s.href??null}));\n"+t[end:]
  t=t.replace('p.displaySegments??[]','p.displaySegments??p.sourceSegments??[]').replace('b.displaySegments??[]','b.displaySegments??b.sourceSegments??[]')
  t=t.replace(" assert.equal(expected.map(s=>s.text).join('').split('食いのばし（吃牌延伸）').length-1,2);\n",'')
  t=t.replace("assert.equal(html.split('食いのばし（吃牌延伸）').length-1,2);",'')
  t=t.replace('htmlGlossesExact:true,sourceTextBlocks:proof.blocks.length','sourceTextBlocks:11')
 if name=='update-coverage.mjs':
  t=t.replace('proof.nonblockingIssues.length,1','proof.nonblockingIssues.length,0').replace('selected.intakeAnnotations.issues,1','selected.intakeAnnotations.issues,0')
  for a,b in [('effectiveCoveredOriginalChapters,228','effectiveCoveredOriginalChapters,229'),('covered,229','covered,230'),('remaining.length,27','remaining.length,26'),('originalUnits,261','originalUnits,262'),("'produced-needs-repair':27","'produced-needs-repair':26"),('Remaining 27','Remaining 26'),('sourceBodyBlocks:34,sourceOccurrences:15','sourceBodyBlocks:18,sourceOccurrences:7')]:t=t.replace(a,b)
  t=t.replace('inlineCompatibility:selected.inlineCompatibility,displaySegmentsProof:selected.displaySegmentsProof,','visionReview:selected.visionReview,')
  start=t.index("note:'157-11 only:");end=t.index("'};",start)
  t=t[:start]+"note:'157-11 only: original candidate1807377c, passed audit64ad7a83, actual terra/max request eff9a0e4. Frozen manifest12a058d4 and27 files/11 dependencies rehashed. Full18 source blocks/7 figure occurrences read through actual MCP/Arena. Five original targets plus five enlargements were sent, two other images inherit authenticated prior evidence. Original legacy method label and sol/high production retained; remote weights unknown. Prior237 units unchanged. Integration model calls0, formal active unchanged.'"+t[end:]
  start=t.index("note:'157-11 is now covered");end=t.index("'};",start)
  t=t[:start]+"note:'157-11 covered after exact-SHA first terra/max full article independent review and actual MCP/Arena body/image readback. Remaining26 original chapters and all other holds/rows retain previous state; no other queue refreshed.'"+t[end:]
 if name=='archive.mjs':
  t=t.replace('note.issues.length,1','note.issues.length,0').replace('note.reviewScope.newImageReview,false','note.reviewScope.newImageReview,true').replace('job.inlineCompatibility,note.inlineCompatibility','job.visionReview,note.visionReview').replace('assert.equal(proof.emphasis.htmlGlossesExact,true);','assert.equal(proof.emphasis.htmlFullChapterExact,true);')
  t=t.replace('sourceBlocks:34,images:15','sourceBlocks:18,images:7').replace('prior236UnitsIncluding155205347246090And027Unchanged','prior237UnitsIncluding162155205347246090And027Unchanged')
  t=t.replace("'display-stage-manifest.json','display-segments-proof.json',","'runtime-manifest.json',")
 t=t.replace("unchanged.''};","unchanged.'};").replace("refreshed.''};","refreshed.'};")
 (out/name).write_text(t,encoding='utf-8',newline='\n')
