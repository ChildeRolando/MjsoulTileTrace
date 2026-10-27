"""Derive this single intake's scripts from the previous bounded execution record."""
from pathlib import Path
out=Path('_analysis/coac250-155')
for name in ('integrate.mjs','readback.mjs','update-coverage.mjs','archive.mjs','.gitattributes'):
    t=(Path('_analysis/coac250-205')/name).read_text(encoding='utf-8')
    t=t.replace('coac250-205','coac250-155').replace('205-5','155-4').replace('cv1770234','cv1751265')
    t=t.replace('v18','NEXT').replace('v17','v18').replace('NEXT','v19')
    if name=='integrate.mjs':
        t=t.replace("import assert from 'node:assert/strict';","import assert from 'node:assert/strict';\nimport {load155InlineCompatibility,updateBuilder} from './builder-patch.mjs';")
        t=t.replace("await copyFile(prior.output+'/347-1-intake-annotations.json',output+'/347-1-intake-annotations.json');","await copyFile(prior.output+'/347-1-intake-annotations.json',output+'/347-1-intake-annotations.json');await copyFile(prior.output+'/205-5-intake-annotations.json',output+'/205-5-intake-annotations.json');")
        start=t.index(' const {stageWebTextbook}=')
        end=t.index(' const destination=',start)
        t=t[:start]+" const inlineCompatibility={candidateSha256:pre.candidate.sha256,...pre.compatibility},{stage:stageWebTextbook,verify:verifyAuditForWebCandidate}=await load155InlineCompatibility(root,pre.candidate.path,inlineCompatibility);\n"+t[end:]
        t=t.replace("await copyFile(destination+'/web-stage-receipt.json',dir+'/stage-receipt.json');","await copyFile(dir+'/display-segments-proof.json',output+'/155-display-segments-proof.json');const displaySegmentsProof={path:output+'/155-display-segments-proof.json',sha256:sha(await readFile(dir+'/display-segments-proof.json'))};Object.assign(stageReceipt,{inlineCompatibility,displaySegmentsProof});await atomic(destination+'/web-stage-receipt.json',stageReceipt);await copyFile(destination+'/web-stage-receipt.json',dir+'/stage-receipt.json');")
        start=t.index("decision:'Preserve")
        end=t.index(',modelCalls:0};',start)
        t=t[:start]+"inlineCompatibility,displaySegmentsProof,decision:'Only b0008 received upstream target text review; other scope inherits authenticated full parent audit, including its nonblocking source-note. Use the frozen v2 gate and bound shadow stager. Exact completed raw normalization is not a new production call. Preserve sourceSegments and derive displaySegments with original marks/href.'"+t[end:]
        t=t.replace('nc.images.length,2','nc.images.length,10').replace('corpus.units.length,235','corpus.units.length,236').replace('build.chapters,227','build.chapters,228').replace('build.figures,5096','build.figures,5106')
        t=t.replace('chapterIds:[chapter],intakeAnnotations','chapterIds:[chapter],inlineCompatibility,displaySegmentsProof,intakeAnnotations')
        t=t.replace('cv1851265.coac269rev1.json','cv1751265.coac244inline20261027.display.json')
        start=t.index("selectionReason:'155-4 unique")
        end=t.index(',intakeAnnotations};',start)
        t=t[:start]+"selectionReason:'155-4: only authorized inline Japanese span translated; frozen v2 gate and bound shadow stager preserve all display emphasis, parent image audit and source-note. No integration model call.',inlineCompatibility,displaySegmentsProof"+t[end:]
        start=t.index(' const nextBuilder=')
        end=t.index('await atomic(pre.configs.builder.path',start)
        t=t[:start]+' const nextBuilder=updateBuilder(builder,pre,v19Sha);'+t[end:]
    if name=='readback.mjs':
        t=t.replace('catalog.length,227','catalog.length,228').replace('figures.length,2','figures.length,10').replace('bodyFigures.length,2','bodyFigures.length,10')
        t=t.replace("assert.ok(note.candidateSourceNotes[1].sourceNotes[0].includes('附件3'));","assert.deepEqual(note.inlineCompatibility,{candidateSha256:pre.candidate.sha256,...pre.compatibility});assert.equal(sha(await readFile(note.displaySegmentsProof.path)),note.displaySegmentsProof.sha256);")
        t=t.replace("'347-1-intake-annotations.json']","'347-1-intake-annotations.json','205-5-intake-annotations.json']")
        t=t.replace('mcp.units.length,235','mcp.units.length,236').replace('mcp.exactImageCount,5096','mcp.exactImageCount,5106').replace('sourceOccurrences:2','sourceOccurrences:10').replace('sourceBodyBlocks:7','sourceBodyBlocks:32')
        t=t.replace('const result={schema:',"const emphasis=await verifyDisplayEmphasis();\nconst result={schema:").replace('historyPreserved:true,','historyPreserved:true,emphasis,')
        t += "\nasync function verifyDisplayEmphasis(){\n const proof=await load(dir+'/display-segments-proof.json');\n const expected=proof.blocks.flatMap(b=>b.displaySegments).map(s=>({text:s.text,marks:s.marks??[],href:s.href??null}));\n const staged=body.blocks.flatMap(b=>b.inlineContent?b.inlineContent.filter(p=>!p.figureId).flatMap(p=>p.displaySegments??[]):b.type==='figure'?[]:b.displaySegments??[]).map(s=>({text:s.text,marks:s.marks??[],href:s.href??null}));\n const chars=ss=>ss.flatMap(s=>[...s.text].map(char=>({char,marks:s.marks,href:s.href})));assert.deepEqual(chars(staged),chars(expected));\n const mcpSegments=target.flatMap(u=>u.blocks).flatMap(b=>b.inlineContent?b.inlineContent.filter(p=>!p.figureId).flatMap(p=>p.displaySegments??[]):b.type==='figure'?[]:b.displaySegments??[]).map(s=>({text:s.text,marks:s.marks??[],href:s.href??null}));assert.deepEqual(chars(mcpSegments),chars(expected));\n assert.ok(mcpSegments.some(s=>s.text.includes('没关系，没问题！')&&s.marks.some(m=>m.startsWith('strong:'))));\n const html=await readFile(output+'/knowledge.html','utf8');assert.ok(/<strong[^>]*>[^<]*没关系，没问题！[^<]*<\\/strong>/.test(html));\n return {allTextCharactersMarksHrefExact:true,mcpTranslatedStrong:true,htmlTranslatedStrong:true,sourceTextBlocks:proof.blocks.length};\n}\n"
    if name=='update-coverage.mjs':
        t=t.replace('effectiveCoveredOriginalChapters,226','effectiveCoveredOriginalChapters,227').replace('covered,227','covered,228').replace('remaining.length,29','remaining.length,28').replace('originalUnits,259','originalUnits,260').replace("'produced-needs-repair':29","'produced-needs-repair':28").replace('Remaining 29','Remaining 28')
        t=t.replace('sourceBodyBlocks:7,sourceOccurrences:2','sourceBodyBlocks:32,sourceOccurrences:10')
        start=t.index("note:'155-4 only:")
        end=t.index("'};",start)
        t=t[:start]+"inlineCompatibility:selected.inlineCompatibility,displaySegmentsProof:selected.displaySegmentsProof,note:'155-4 only: candidate54aa5eea and target-text audit eca2eb38; frozen v2 gate verified all 15 runtime files and exact same-raw normalization. Only b0008 translated; all other prose/figure semantics inherited, including one source-note. Shadow stager preserves every character/mark/href, sourceSegments unchanged, translated quote strong verified through actual MCP/HTML. Full32 source blocks/10 figures and occurrences represented, prior235 units unchanged. New model calls0, formal active unchanged."+t[end:]
        t=t.replace('the one source-note and producer accusation history are retained','the inherited parent source-note and exact raw normalization provenance are retained')
        t=t.replace('bound full-article first independent passed audit','target-text independent passed audit plus authenticated unchanged full parent review')
    if name=='archive.mjs':
        t=t.replace("import assert from 'node:assert/strict';","import assert from 'node:assert/strict';\nimport {updateBuilder} from './builder-patch.mjs';")
        t=t.replace("oldBuilder.replace('specific-web-variant-selection.v18.json','specific-web-variant-selection.v19.json').replace(pre.configs.variants.sha256,v19Sha)",'updateBuilder(oldBuilder,pre,v19Sha)')
        t=t.replace('assert.equal(note.reviewScope.firstIndependentReviewForSha,true);',"assert.equal(note.reviewScope.newImageReview,false);assert.deepEqual(job.inlineCompatibility,note.inlineCompatibility);assert.equal(proof.emphasis.mcpTranslatedStrong,true);")
        t=t.replace('sourceBlocks:7,images:2','sourceBlocks:32,images:10').replace('prior234UnitsIncluding347246090And027Unchanged','prior235UnitsIncluding205347246090And027Unchanged')
        t=t.replace("'selection-pin.patch','builder.after.mjs'","'selection-pin.patch','display-stage-manifest.json','display-segments-proof.json','builder.after.mjs'")
    if name=='readback.mjs':
        start=t.index(' const mcpSegments=')
        end=t.index(' const html=',start)
        t=t[:start]+" const mcpText=target.flatMap(u=>u.blocks).filter(b=>b.type!=='figure').map(b=>b.text??'').join('');assert.equal(mcpText,expected.map(s=>s.text).join(''));\n assert.ok(staged.some(s=>s.text.includes('没关系，没问题！')&&s.marks.some(m=>m.startsWith('strong:'))));\n"+t[end:]
        t=t.replace(" return {allTextCharactersMarksHrefExact:true,mcpTranslatedStrong:true", " const {renderTextbookBlocks}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-review.mjs'));assert.ok(html.includes(renderTextbookBlocks(body.blocks)));\n return {allTextCharactersMarksHrefExact:true,mcpTranslatedTextExact:true,mcpCarriesDisplaySegments:false,htmlFullChapterExact:true")
    if name=='archive.mjs':
        t=t.replace('proof.emphasis.mcpTranslatedStrong,true','proof.emphasis.mcpTranslatedTextExact,true');t=t.replace('proof.emphasis.mcpTranslatedTextExact,true);','proof.emphasis.mcpTranslatedTextExact,true);assert.equal(proof.emphasis.htmlTranslatedStrong,true);')
    if name=='update-coverage.mjs':
        t=t.replace('translated quote strong verified through actual MCP/HTML','translated text verified through actual MCP; strong and all other emphasis verified in the actual complete HTML')
    (out/name).write_text(t,encoding='utf-8',newline='\n')
print('Prepared bounded scripts; inspect the route and emphasis validation before executing.')
