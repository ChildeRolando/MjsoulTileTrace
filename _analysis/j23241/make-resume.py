from pathlib import Path
p=Path(__file__).resolve().parent
s=(p/'integrate.mjs').read_text(encoding='utf-8')
prefix=s[:s.index('try{\n await unchanged();')]
tail=s[s.index(' // Read owner documents'):]
tail=tail.replace("dir+'/merge-failure.json'","dir+'/resume-failure.json'")
middle="""try{
 await unchanged();const route=await load232Conditional(root,m.candidate.path,m.binding),gate=await route.verify(root,m.candidate.path),prior=await load(m.before.pointer.path),assembly=await load(dir+'/assembly.json'),output=assembly.output,dest=assembly.destination,preview=await load(output+'/accepted-preview-receipt.json'),build={chapters:preview.chapters,units:preview.units,blocks:preview.blocks,figures:preview.figures,corpusId:preview.corpusId,bodySha256:preview.bodySha256,maxUnitBytes:preview.maxUnitBytes},pending=preview.pendingWeb,receipt=await load(dest+'/web-stage-receipt.json');
 assert.equal(assembly.phase,'compiled');await route.verifyStaged(root,dest);assert.equal(preview.blocks,7687);assert.equal(preview.units,264);assert.equal((await load(output+'/mcp-validation.json')).exactImageCount,5964);assert.equal((await load(output+'/arena-validation.json')).exactBody,true);assert.equal((await load(output+'/source-deduplication-validation.json')).crossChapterSourceCollisions,0);
 await run(process.cwd()+'/'+dir+'/readback.mjs',[output],'readback',process.cwd());await unchanged();
"""
(p/'resume.mjs').write_text(prefix+middle+tail,encoding='utf-8',newline='\n')
