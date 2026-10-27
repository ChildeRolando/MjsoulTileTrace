from pathlib import Path
p=Path('_analysis/coac250-next3')
s=(p/'integrate.mjs').read_text(encoding='utf8')
imports=s[:s.index("const pre=await load")]
tail=s[s.index('await unchanged();const v25='):]
prefix="""const pre=await load(dir+'/preconsume.json'),a=await load(dir+'/assembly.json'),output=a.output,receipt=await load(output+'/accepted-preview-receipt.json'),selected=receipt.selectedWeb.filter(s=>pre.jobs.some(j=>j.candidate.sha256===s.candidateSha256)),build={corpusId:a.corpusId,chapters:a.chapters,units:a.units,blocks:a.blocks,figures:a.figures};
const pending=receipt.pendingWeb;const readback=await load(dir+'/readback.json');assert.equal(readback.allPassed,true);assert.equal(readback.preview.corpusId,receipt.corpusId);assert.equal(readback.chapters.length,2);assert.equal(readback.fullMcp.images,5138);
const lock=integration+'/accepted-consumer.lock';await writeFile(lock,JSON.stringify({pid:process.pid,scope:'COAC-250159242 publish after actual readback'})+'\\n',{flag:'wx'});
async function unchanged(){for(const f of [...Object.values(pre.before),...pre.protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);for(const n of ['ACCEPTED-CONSUMER-STOP','selection-maintainer.lock.json'])await assert.rejects(access(integration+'/'+n),{code:'ENOENT'});}
try{
"""
(p/'publish.mjs').write_text(imports+prefix+tail,encoding='utf8')
