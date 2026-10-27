from pathlib import Path
p=Path('_analysis/coac250-155');out=Path('_analysis/coac250-162')
for name in ['integrate.mjs','readback.mjs','update-coverage.mjs','archive.mjs','.gitattributes','verify-route.mjs','resume-publication.mjs']:
    t=(p/name).read_text(encoding='utf-8')
    for a,b in [('coac250-155','coac250-162'),('155-4','162-3'),('155-display','162-display'),('cv1751265','cv1751316'),('load155InlineCompatibility','load162InlineCompatibility'),('inline155','inline162')]:t=t.replace(a,b)
    t=t.replace('v19','NEXT').replace('v18','v19').replace('NEXT','v20')
    if name=='integrate.mjs':
        t=t.replace("await copyFile(prior.output+'/205-5-intake-annotations.json',output+'/205-5-intake-annotations.json');","await copyFile(prior.output+'/205-5-intake-annotations.json',output+'/205-5-intake-annotations.json');await copyFile(prior.output+'/155-4-intake-annotations.json',output+'/155-4-intake-annotations.json');await copyFile(prior.output+'/155-display-segments-proof.json',output+'/155-display-segments-proof.json');")
        t=t.replace('Only b0008 received','Only b0004 and b0034 received').replace('Exact completed raw normalization is not a new production call.','The completed production raw is unchanged, with no output normalization. Transport events remain in history.')
        for a,b in [('nc.images.length,10','nc.images.length,15'),('corpus.units.length,236','corpus.units.length,237'),('build.chapters,228','build.chapters,229'),('build.figures,5106','build.figures,5121')]:t=t.replace(a,b)
    if name=='readback.mjs':
        t=t.replace("const original=candidate.figures[i];", "const original=candidate.figures[i],expectedTranscription=original.transcription+(original.unknowns?.length?'\\n原图未显示的信息：'+original.unknowns.join('；'):'');")
        t=t.replace('f.transcriptionText,original.transcription','f.transcriptionText,expectedTranscription').replace('m.transcription.text,original.transcription','m.transcription.text,expectedTranscription')
        t=t.replace('sourceBindingsAndTranscriptionsExact:true,','sourceBindingsAndTranscriptionsExact:true,retainedFigureUncertainties:candidate.figures.filter(f=>f.unknowns?.length).map(f=>({figureId:f.figureId,unknowns:f.unknowns})),')
        for a,b in [('catalog.length,228','catalog.length,229'),('figures.length,10','figures.length,15'),('bodyFigures.length,10','bodyFigures.length,15'),('mcp.units.length,236','mcp.units.length,237'),('mcp.exactImageCount,5106','mcp.exactImageCount,5121'),('sourceOccurrences:10','sourceOccurrences:15'),('sourceBodyBlocks:32','sourceBodyBlocks:34')]:t=t.replace(a,b)
        t=t.replace("'205-5-intake-annotations.json']","'205-5-intake-annotations.json','155-4-intake-annotations.json','155-display-segments-proof.json']")
        t=t.replace("assert.ok(staged.some(s=>s.text.includes('没关系，没问题！')&&s.marks.some(m=>m.startsWith('strong:'))));","assert.equal(expected.map(s=>s.text).join('').split('食いのばし（吃牌延伸）').length-1,2);")
        t=t.replace("assert.ok(/<strong[^>]*>[^<]*没关系，没问题！[^<]*<\\/strong>/.test(html));","assert.equal(html.split('食いのばし（吃牌延伸）').length-1,2);")
        t=t.replace('htmlTranslatedStrong:true','htmlGlossesExact:true').replace('maxTargetTextBytes:maxTextBytes','maxTargetTextBytes:maxTextBytes')
    if name=='update-coverage.mjs':
        t=t.replace('exact raw normalization provenance','original raw and transport event history')
        for a,b in [('effectiveCoveredOriginalChapters,227','effectiveCoveredOriginalChapters,228'),('covered,228','covered,229'),('remaining.length,28','remaining.length,27'),('originalUnits,260','originalUnits,261'),("'produced-needs-repair':28","'produced-needs-repair':27"),('Remaining 28','Remaining 27'),('sourceBodyBlocks:32,sourceOccurrences:10','sourceBodyBlocks:34,sourceOccurrences:15')]:t=t.replace(a,b)
        start=t.index("note:'162-3 only:");end=t.index("'};",start)
        t=t[:start]+"note:'162-3 only: candidate0d0d5481 and target-text audit25c0966e; frozen v2 gate verified all15 runtime files and original raw. Only b0004/b0034 gain the approved gloss; all other prose and15 figure semantics inherit the authenticated parent review, including its one source-note. Bound shadow stager preserves sourceSegments and display character/marks/href. Full34 source blocks/15 figure occurrences verified by real MCP/Arena; actual HTML chapter and both glosses checked. Prior236 units unchanged, integration model calls0, formal active unchanged."+t[end:]
    if name=='archive.mjs':
        t=t.replace('proof.emphasis.htmlTranslatedStrong,true','proof.emphasis.htmlGlossesExact,true').replace('sourceBlocks:32,images:10','sourceBlocks:34,images:15').replace('prior235UnitsIncluding205347246090And027Unchanged','prior236UnitsIncluding155205347246090And027Unchanged')
    if name=='verify-route.mjs':
        # Existing builder already carries the 155 route. The new route extends only162.
        t=t.replace("assert.equal(canon('cv1770234.coac269rev1.json'),'cv1770234');","assert.equal(canon('cv1770234.coac269rev1.json'),'cv1770234');assert.equal(canon('cv1751265.coac244inline20261027.display.json'),'cv1751265');")
        t=t.replace('exact155VersionDedupe','exact162VersionDedupe')
    if name=='resume-publication.mjs':
        t=t.replace('about the established plain-text MCP protocol','about the existing rendering of candidate unknowns in figure transcriptions')
        t=t.replace('retainedUnits,235','retainedUnits,236')
    (out/name).write_text(t,encoding='utf-8',newline='\n')
