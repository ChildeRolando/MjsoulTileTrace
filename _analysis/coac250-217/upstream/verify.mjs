import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {loadNativeInlineCorrection} from './runtime/textbook-audit-pdf-native-corrections.mjs';
import {sha} from './runtime/textbook-audit-pdf-p217-correction.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=process.argv[2];
if(!root)throw Error('Usage: node verify.mjs <processing-root>');
const manifest=JSON.parse(await readFile(join(here,'runtime-manifest.json')));
for(const file of manifest.files)if(sha(await readFile(join(here,file.path)))!==file.sha256)throw Error('frozen correction runtime changed: '+file.path);
const a=JSON.parse(await readFile(join(here,'native-inline-field-corrections.p217.root-acceptance.json')));
const bytes=await readFile(join(root,a.candidate.path)),candidate=JSON.parse(bytes);
if(sha(bytes)!==a.candidate.sha256)throw Error('candidate hash mismatch');
const v=await loadNativeInlineCorrection(root,candidate,a.candidate.sha256);
const parentBytes=await readFile(join(root,a.parent.path)),parent=JSON.parse(parentBytes);
const encoded=(x,indent=0)=>JSON.stringify(x,null,2).replaceAll('\n','\n'+' '.repeat(indent));
let restored=bytes.toString('utf8');
restored=restored.replace('  "editorialAnnotations": '+encoded(candidate.editorialAnnotations,2)+',\n','');
restored=restored.replace(JSON.stringify(candidate.candidateSha256),JSON.stringify(parent.candidateSha256));
restored=restored.replace(',\n    "sourceFieldCorrection": '+encoded(candidate.provenance.sourceFieldCorrection,4),'');
restored=restored.replace('"unknowns": '+encoded(candidate.figures[0].unknowns,6),'"unknowns": '+encoded(parent.figures[0].unknowns,6));
restored=restored.replace(JSON.stringify(candidate.figures[0].transcription),JSON.stringify(parent.figures[0].transcription));
if(!Buffer.from(restored).equals(parentBytes))throw Error('non-target serialized bytes changed');
const projection={schema:'coach-pdf-exact-editorial-projection/1',candidate:a.candidate,
 chapterId:'79-cn-chapter-217-4',figure:candidate.figures[0],
 continuation:v.annotationProjection,coverage:'only page217 figure and page218-b3 editorial projection; no full218 acceptance'};
await writeFile(join(here,'assembled-display.json'),JSON.stringify(projection,null,2)+'\n');
await writeFile(join(here,'correction-proof.json'),JSON.stringify(v.correctionProof,null,2)+'\n');
const result={schema:'coac248-p217-deterministic-verification/1',candidate:a.candidate,
 classification:v.classification,inputBindings:Object.keys(v.correctionProof.inputs).length,
 authorBodyUnchanged:true,captionUnchanged:true,northSecond9mUnchanged:true,
 nonTargetSerializedBytesRestoredToParentSha256:sha(Buffer.from(restored)),
 unknownCount:candidate.figures[0].unknowns.length,noteInstalledAfterArgument:true,
 originalRawEdited:false,oldAuditEdited:false,newModelCalls:0,
 pageOrChapterPassed:false,requires:'COAC249 zero-call evidence consistency',remainingScope:v.remainingScope};
await writeFile(join(here,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
