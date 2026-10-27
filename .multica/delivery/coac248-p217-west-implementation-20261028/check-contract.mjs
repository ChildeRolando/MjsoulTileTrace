// Read-only call to the real existing admission contract; no mocked approval or model call.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const path='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-audit-pdf-native-corrections.mjs';
const m=await import(pathToFileURL(path));
const p=fileURLToPath(new URL('draft-page-0217.rev6.json',import.meta.url)),b=await readFile(p),c=JSON.parse(b);
assert.equal(m.knownNativeInlineCorrections['79-cn:217'],undefined);
let actualError;
try{await m.loadNativeInlineCorrection('E:/AgentData/Coach/knowledge/processing',c,createHash('sha256').update(b).digest('hex'));}
catch(e){actualError=String(e);}
assert.equal(actualError,'Error: audit_native_inline_correction_unapproved_page');
const result={modelCalls:0,actualLoaderError:actualError,existingLoaderModule:path,
 moduleSha256:createHash('sha256').update(await readFile(path)).digest('hex'),
 productionFlowMode:c.provenance.flowMode??null,bodyMode:c.body.mode,legacySourceModelRawUnchanged:true,
 draftAdmitted:false,unknownsRecognitionalImpactStillOpen:false};
await writeFile(fileURLToPath(new URL('contract-check.json',import.meta.url)),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
