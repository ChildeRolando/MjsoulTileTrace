"""Adapt the preceding single-chapter execution record; not an integration framework."""
from pathlib import Path
out=Path('_analysis/coac250-205')
for name in ('integrate.mjs','readback.mjs','update-coverage.mjs','archive.mjs','.gitattributes'):
    text=(Path('_analysis/coac250-347')/name).read_text(encoding='utf-8')
    text=text.replace('coac250-347','coac250-205').replace('347-1','205-5')
    text=text.replace('v17','NEXTVERSION').replace('v16','v17').replace('NEXTVERSION','v18')
    text=text.replace('modern-yabejp-ja','79-bilibili-cn').replace('archive01-section008','cv1770234')
    text=text.replace('79-bilibili-cn-chapter01-section010-chapter','modern-yabejp-ja-chapter01-section010-chapter')
    text=text.replace('20261027','20261028') if name=='archive.mjs' else text
    if name=='integrate.mjs':
        text=text.replace("await copyFile(prior.output+'/246-3-intake-annotations.json',output+'/246-3-intake-annotations.json');", "await copyFile(prior.output+'/246-3-intake-annotations.json',output+'/246-3-intake-annotations.json');await copyFile(prior.output+'/347-1-intake-annotations.json',output+'/347-1-intake-annotations.json');")
        start=text.index(' const handoff=')
        end=text.index(' const annotationsPath=',start)
        text=text[:start]+" const candidate=await load(pre.candidate.path);\n const annotations={schema:'coac250-205-intake-evidence/1',chapterId:original,candidate:pre.candidate,source:pre.source,audit:pre.audit,handoff:pre.handoff,issues:pre.issues,reviewScope:pre.reviewScope,sourceCorrespondence:pre.sourceCorrespondence,history:pre.history,candidateSourceNotes:candidate.figures.map(f=>({figureId:f.figureId,sourceNotes:f.sourceNotes})),decision:'Preserve the unique passed candidate and the single nonblocking b0006 attachment-number source-note. Upstream full first independent review used the bound target original/2x image and exact verified reuse for the other image. Producer accusation history is retained, not relabeled as independent failure or retry.',modelCalls:0};\n"+text[end:]
        text=text.replace('corpus.units.length,234','corpus.units.length,235').replace('build.chapters,226','build.chapters,227').replace('build.figures,5094','build.figures,5096').replace('nc.images.length,27','nc.images.length,2')
        text=text.replace("'/'+article+'.r1.display.json'","'/'+article+'.display.json'")
        text=text.replace('cv1770234.coac244text20261027.display.json','cv1770234.coac269rev1.json')
        start=text.index(' const v17=')
        end=text.index(' const v18Path=',start)
        text=text[:start]+" const v17=await load(pre.configs.variants.path);assert.equal(v17.jobs.some(j=>j.articleId===article),false);const newJob={sourceId:'79-bilibili-cn',articleId:article,candidatePath:pre.candidate.path,candidateSha256:pre.candidate.sha256,sourceSha256:pre.source.sha256,selectionReason:'205-5 unique passed first independent review; retain original production and parent history and nonblocking b0006 source-note. Integration model calls 0.',intakeAnnotations};const v18={...v17,recordedAt:new Date().toISOString(),previousSelection:pre.configs.variants,jobs:[...v17.jobs,newJob]};\n"+text[end:]
    if name=='readback.mjs':
        text=text.replace('catalog.length,226','catalog.length,227').replace('pages.length>1','pages.length>=1').replace('figures.length,27','figures.length,2').replace('bodyFigures.length,27','bodyFigures.length,2')
        text=text.replace('note.issues.length,0','note.issues.length,1')
        start=text.index('assert.deepEqual(note.reviewScope')
        end=text.index('for(const asset',start)
        text=text[:start]+"assert.deepEqual(note.reviewScope,pre.reviewScope);assert.deepEqual(note.history,pre.history);assert.deepEqual(note.sourceCorrespondence,pre.sourceCorrespondence);assert.deepEqual(note.candidateSourceNotes,candidate.figures.map(f=>({figureId:f.figureId,sourceNotes:f.sourceNotes})));assert.ok(note.candidateSourceNotes[1].sourceNotes[0].includes('附件3'));\n"+text[end:]
        text=text.replace("'246-3-intake-annotations.json']","'246-3-intake-annotations.json','347-1-intake-annotations.json']")
        text=text.replace('mcp.units.length,234','mcp.units.length,235').replace('mcp.exactImageCount,5094','mcp.exactImageCount,5096')
        text=text.replace('sourceOccurrences:77','sourceOccurrences:2').replace('sourceBodyBlocks:66','sourceBodyBlocks:7').replace('termExact:true,','historyPreserved:true,')
    if name=='update-coverage.mjs':
        text=text.replace('proof.nonblockingIssues.length,0','proof.nonblockingIssues.length,1').replace('selected.intakeAnnotations.issues,0','selected.intakeAnnotations.issues,1')
        text=text.replace('effectiveCoveredOriginalChapters,225','effectiveCoveredOriginalChapters,226')
        start=text.index(' row.staging=')
        end=text.index(' row.intakeAnnotations=',start)
        text=text[:start]+" row.staging={previewOutput:pointer.output,corpusId:pointer.corpusId,previewChapterId:chapter,blocks:receipt.blocks,figures:receipt.figures,sourceBodyBlocks:7,sourceOccurrences:2,auditStatus:'passed',auditPath:pre.audit.path,auditSha256:pre.audit.sha256,stageReceiptPath:selected.stageReceiptPath,stagedAt:pointer.createdAt,intakeAnnotations:selected.intakeAnnotations,reviewScope:pre.reviewScope,sourceCorrespondence:pre.sourceCorrespondence,history:pre.history,note:'205-5 only: passed candidate 8c0cfff8 and full first independent review d45a6371. Original B production 358f4e70 completed; producer accusation was not an independent failure/retry. All 7 source blocks, 2 figures/occurrences represented; actual MCP/Arena full readback passed. One nonblocking b0006 attachment-number source-note preserved without changing candidate. Prior 234 units and all other holds/rows unchanged; integration model calls 0, formal active unchanged.'};\n"+text[end:]
        text=text.replace('covered,226','covered,227').replace('remaining.length,30','remaining.length,29').replace('originalUnits,258','originalUnits,259')
        text=text.replace("'produced-needs-repair':30","'produced-needs-repair':29").replace('Remaining 30','Remaining 29')
        text=text.replace('bound full-article passed audit','bound full-article first independent passed audit; the one source-note and producer accusation history are retained')
        text=text.replace('coac250-205-coverage-20261027','coac250-205-coverage-20261028')
    if name=='archive.mjs':
        text=text.replace('note.issues.length,0','note.issues.length,1').replace('assert.equal(note.reviewScope.imageReviewThisStage,false);','assert.equal(note.reviewScope.firstIndependentReviewForSha,true);assert.deepEqual(note.history,pre.history);')
        text=text.replace('sourceBlocks:66,images:27','sourceBlocks:7,images:2')
        text=text.replace('targetTextReviewOnly:true,imageReviewThisStage:false,','upstreamReviewScope:pre.reviewScope,originalProductionHistory:pre.history,')
        text=text.replace('prior233UnitsIncluding246090And027Unchanged','prior234UnitsIncluding347246090And027Unchanged')
    (out/name).write_text(text,encoding='utf-8',newline='\n')
print('Prepared four bounded scripts from the previous integration record; inspect before execution.')
