import pathlib,json,hashlib,shutil
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');H=pathlib.Path(__file__).resolve().parent;D=R/'integration/coac248-jp213-composite-20261028'
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
files=[{'path':p.relative_to(D/'stage').as_posix(),'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size} for p in sorted((D/'stage').rglob('*')) if p.is_file()];record={'schema':'coac248-jp213-sealed-isolated-stage/1','candidateSha256':'a667937d4e119a1b22659fc60987f07d3eea9d246c8b2b6ddabcdacb4fe5dd47','files':files,'globalAdmissionGranted':False,'actualGlobalMcpArenaReadbackRequired':True}
save(D/'stage-files.json',record);shutil.copyfile(D/'stage-files.json',H/'stage-files.json');digest=sha((D/'stage-files.json').read_bytes())
code='''// The sealed stage is evidence for the existing250 writer, never a global admission.
import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {join,resolve,relative} from 'node:path';import {verifyLimited,sha} from './admit.mjs';import {verifyDisplay} from './stage.mjs';
export async function verifyStaged(root,stagePath){
 const bytes=await readFile(new URL('./stage-files.json',import.meta.url));assert.equal(sha(bytes),'DIGEST','frozen isolated stage manifest');const snapshot=JSON.parse(bytes),listed=[];
 async function walk(p){for(const e of await readdir(p,{withFileTypes:true})){const f=join(p,e.name);if(e.isDirectory())await walk(f);else listed.push(relative(stagePath,f).replaceAll('\\\\','/'));}}
 await walk(stagePath);assert.deepEqual(listed.sort(),snapshot.files.map(f=>f.path).sort(),'stage file set');
 for(const f of snapshot.files){const path=resolve(stagePath,f.path);assert(!relative(resolve(stagePath),path).startsWith('..'));const b=await readFile(path);assert.equal(sha(b),f.sha256,'sealed stage:'+f.path);assert.equal(b.length,f.bytes);}
 const manifest=JSON.parse(await readFile(new URL('./manifest.json',import.meta.url))),r=JSON.parse(await readFile(manifest.receipt.path)),g=await verifyLimited(root,r.candidate.path),load=async p=>JSON.parse(await readFile(join(stagePath,p))),body=(await load('textbook-bodies.json')).chapters[0],display=await load('display-limits.json');
 assert.equal(sha(JSON.stringify(display.originalBlocks)),display.originalBlocksSha256);verifyDisplay(body.blocks,display.originalBlocks,g);assert.deepEqual(display.originalStrictVerification,g.originalStrictVerification);assert.deepEqual(display.originalIssues,g.originalIssues);assert.deepEqual(display.independentIssues,g.independentIssues);
 return {canonical:g.canonical,candidate:g.candidate,sealedStageVerified:true,nonAuthorNotes:8,originalStrictVerification:g.originalStrictVerification,issueObjectsByteIdentical:false,exactLimitedCompositionVerified:true,ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,actualGlobalMcpArenaReadbackRequired:true,newModelCalls:0};
}
'''.replace('DIGEST',digest)
for base in [H,D]:
 (base/'verify-stage.mjs').write_text(code,encoding='utf-8',newline='\n')
for base in [H,D]:
 m=json.loads((base/'manifest.json').read_bytes());m['files'].extend([{'path':str(D/name),'sha256':sha((D/name).read_bytes())} for name in ['verify-stage.mjs','stage-files.json']]);save(base/'manifest.json',m)
print(json.dumps({'stageFiles':len(files),'stageManifestSha256':digest,'newCalls':0}))
