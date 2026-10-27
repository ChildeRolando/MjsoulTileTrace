import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verify217,assemble217Note,sha,admissionPath} from './runtime/textbook-audit-pdf-p217-correction.mjs';
import {loadNativeInlineCorrection,knownNativeInlineCorrections} from './runtime/textbook-audit-pdf-native-corrections.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const root=process.env.COACH_PROCESSING_ROOT??'E:/AgentData/Coach/knowledge/processing';
const approval=JSON.parse(await readFile(join(here,'native-inline-field-corrections.p217.root-acceptance.json')));
const candidate=JSON.parse(await readFile(join(here,'page-0217.rev6.json'))),documents={};
for(const[id,v]of Object.entries(approval.inputs))if(v.path.endsWith('.json'))documents[id]=JSON.parse(await readFile(join(root,v.path)));
const fixture=()=>structuredClone({candidate,parent:documents.parent,approval,candidateSha256:approval.candidate.sha256,documents});
test('real loader admits the exact derived candidate and preserves legacy flow identity',async()=>{
 const v=await loadNativeInlineCorrection(root,candidate,approval.candidate.sha256);
 assert.equal(v.newModelCalls,0);assert.equal(v.pageOrChapterPassed,false);
 assert.equal(candidate.provenance.flowMode,undefined);assert.deepEqual(candidate.body,documents.parent.body);
 assert.equal(v.correctedRaw.figures[0].unknowns.length,2);
});
for(const[name,mutate]of [
 ['body edit',f=>f.candidate.body.blocks[2].text+='改'],
 ['caption edit',f=>f.candidate.figures[0].caption+='改'],
 ['non-whitelisted tile',f=>f.candidate.figures[0].transcription=f.candidate.figures[0].transcription.replace('8m 8m','9m 9m')],
 ['resolved north second changed',f=>f.candidate.figures[0].transcription=f.candidate.figures[0].transcription.replace(' 9m。',' 8m。')],
 ['body order changed',f=>f.candidate.body.blocks.reverse()],
 ['duplicate unknown',f=>f.candidate.figures[0].unknowns.push(f.candidate.figures[0].unknowns[0])],
 ['unknown deletion',f=>f.candidate.figures[0].unknowns.shift()],
 ['other chapter',f=>f.candidate.source.page=218],
 ['wrong candidate SHA',f=>f.candidateSha256='0'.repeat(64)],
 ['wrong parent SHA',f=>f.approval.parent.sha256='0'.repeat(64)],
 ['wrong source SHA',f=>f.approval.inputs.page217.sha256='0'.repeat(64)],
 ['note without evidence',f=>{f.candidate.editorialAnnotations[0].evidenceIds=[];f.approval.note.evidenceIds=[]}],
 ['note before argument ends',f=>{f.candidate.editorialAnnotations[0].afterCharacterOffset=1;f.approval.note.afterCharacterOffset=1}],
 ['changed impact judgment',f=>f.documents['west-impact'].receipt.result.premiseChecks[0].dependency='unknown'],
 ['wrong north first coordinate',f=>f.documents['north-first'].calls.find(c=>c.callId==='09362d05-d221-427e-b474-a79017ff7619').result.targetBBox=[174,325,196,357]],
 ['raw receipt mismatch',f=>f.documents['west-impact-raw'].output.classification='readable'],
 ['changed source paragraph',f=>f.documents.page218.blocks.find(b=>b.id==='79-cn-p218-b3').lines[0].text='替换原文'],
 ['extra unresolved parent error',f=>f.documents.parentAudit.modelReview.issues.push({severity:'error',targetId:'79-cn-p217-b7'})],
])test('rejects '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>verify217(f));});
test('annotation restores exact source text after removing only the non-author segment',()=>{
 const p=assemble217Note(documents.page218,approval.note);
 const source=documents.page218.blocks.find(b=>b.id==='79-cn-p218-b3').lines.map(l=>l.text).join('');
 assert.equal(p.segments.filter(s=>s.type==='source-text').map(s=>s.text).join(''),source);
 assert.equal(p.segments[1].authorText,false);assert.ok(p.segments[0].text.endsWith('施行让亲家未听下庄的战术。'));
});
test('wrong physical source bytes and approval bytes are rejected by the actual loader',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'coac248-p217-'));
 try{
  for(const v of [...Object.values(approval.inputs),approval.candidate]){await mkdir(dirname(join(tmp,v.path)),{recursive:true});await writeFile(join(tmp,v.path),await readFile(join(root,v.path)));}
  await mkdir(dirname(join(tmp,admissionPath)),{recursive:true});
  const ab=await readFile(join(here,'native-inline-field-corrections.p217.root-acceptance.json'));
  await writeFile(join(tmp,admissionPath),ab);
  await writeFile(join(tmp,approval.inputs.page217.path),'{}');
  await assert.rejects(loadNativeInlineCorrection(tmp,candidate,approval.candidate.sha256),/input_changed:page217/);
  await writeFile(join(tmp,admissionPath),Buffer.concat([ab,Buffer.from(' ')]));
  await assert.rejects(loadNativeInlineCorrection(tmp,candidate,approval.candidate.sha256),/approval_changed/);
 }finally{await rm(tmp,{recursive:true,force:true});}
});
test('all previous approved page pins stay exactly unchanged',()=>{
 assert.equal(Object.keys(knownNativeInlineCorrections).length,8);
 assert.equal(knownNativeInlineCorrections['79-cn:50'].sha256,'1d1e22613606f6ed4c061e45bbfbee1c199b59ec330b6eec64d28f32a06c3300');
 assert.equal(sha(JSON.stringify(candidate.body)),sha(JSON.stringify(documents.parent.body)));
});
