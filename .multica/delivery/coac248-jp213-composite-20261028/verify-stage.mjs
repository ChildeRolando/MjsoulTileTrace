// The sealed stage is evidence for the existing250 writer, never a global admission.
import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {join,resolve,relative} from 'node:path';import {verifyLimited,sha} from './admit.mjs';import {verifyDisplay} from './stage.mjs';
export async function verifyStaged(root,stagePath){
 const bytes=await readFile(new URL('./stage-files.json',import.meta.url));assert.equal(sha(bytes),'afd4b01ed6456c2c1be9613ce2d893b82e5c38c2be599bfab363216d4e815f79','frozen isolated stage manifest');const snapshot=JSON.parse(bytes),listed=[];
 async function walk(p){for(const e of await readdir(p,{withFileTypes:true})){const f=join(p,e.name);if(e.isDirectory())await walk(f);else listed.push(relative(stagePath,f).replaceAll('\\','/'));}}
 await walk(stagePath);assert.deepEqual(listed.sort(),snapshot.files.map(f=>f.path).sort(),'stage file set');
 for(const f of snapshot.files){const path=resolve(stagePath,f.path);assert(!relative(resolve(stagePath),path).startsWith('..'));const b=await readFile(path);assert.equal(sha(b),f.sha256,'sealed stage:'+f.path);assert.equal(b.length,f.bytes);}
 const manifest=JSON.parse(await readFile(new URL('./manifest.json',import.meta.url))),r=JSON.parse(await readFile(manifest.receipt.path)),g=await verifyLimited(root,r.candidate.path),load=async p=>JSON.parse(await readFile(join(stagePath,p))),body=(await load('textbook-bodies.json')).chapters[0],display=await load('display-limits.json');
 assert.equal(sha(JSON.stringify(display.originalBlocks)),display.originalBlocksSha256);verifyDisplay(body.blocks,display.originalBlocks,g);assert.deepEqual(display.originalStrictVerification,g.originalStrictVerification);assert.deepEqual(display.originalIssues,g.originalIssues);assert.deepEqual(display.independentIssues,g.independentIssues);
 return {canonical:g.canonical,candidate:g.candidate,sealedStageVerified:true,nonAuthorNotes:8,originalStrictVerification:g.originalStrictVerification,issueObjectsByteIdentical:false,exactLimitedCompositionVerified:true,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackRequired:true,newModelCalls:0};
}
