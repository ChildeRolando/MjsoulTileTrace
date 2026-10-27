from pathlib import Path
p=Path('_analysis/coac250-222order')
rp=p/'readback.mjs'
rp.write_text(rp.read_text(encoding='utf8').replace('load(candidate.provenance.revision.parentPath)',"load(resolve('E:/AgentData/Coach/knowledge/processing',candidate.provenance.revision.parentPath))"),encoding='utf8',newline='\n')
s=(p/'integrate.mjs').read_text(encoding='utf8'); imports=s[:s.index('const pre=')]
helpers=s[s.index('async function unchanged()'):s.index('\ntry{')]
tail=s[s.index('await unchanged();const v26='):]
prefix="""const pre=await load(dir+'/preconsume.json'),a=await load(dir+'/assembly.json'),output=a.output,receipt=await load(output+'/accepted-preview-receipt.json'),selected=receipt.selectedWeb.find(s=>s.candidateSha256===pre.candidate.sha256),pending=receipt.pendingWeb,intakeAnnotations=a.intakeAnnotations,build={corpusId:a.corpusId,chapters:a.chapters,units:a.units,blocks:a.blocks,figures:a.figures};
const proof=await load(dir+'/readback.json');assert.equal(proof.allPassed,true);assert.equal(proof.preview.corpusId,receipt.corpusId);assert.equal(proof.canonicalOrderExact,true);assert.equal(proof.two2mReferencesNow1m,true);
const lock=integration+'/accepted-consumer.lock';await writeFile(lock,JSON.stringify({pid:process.pid,scope:'COAC-250222 publish after complete verified readback'})+'\\n',{flag:'wx'});
"""
(p/'publish-verified.mjs').write_text(imports+prefix+helpers+'\ntry{\n'+tail,encoding='utf8',newline='\n')
