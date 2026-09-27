// Build the small checked-in compatibility patch on a fresh pinned source
// archive. Reuses local source/crate caches; never downloads model weights,
// edits the upstream checkout, or overwrites a previous native receipt.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const assets = process.env.RIICHI_LOCAL_MORTAL_ROOT ?? join(process.env.LOCALAPPDATA ?? "", "RiichiCoach", "local-mortal-spike");
const manifest = JSON.parse(readFileSync(join(root,"packages/mortal-runtime/manifests/mortal-582500.windows-x64.json"),"utf8"));
const patch = join(root,"packages/mortal-runtime/native/coach-rule-config.patch");
const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const patchHash = hash(patch);
const output = join(assets,"rule-native-builds",`${patchHash.slice(0,12)}-${Date.now()}`);
const source = join(output,"source");
mkdirSync(source,{recursive:true});
const python = join(assets,"python/Scripts/python.exe");
const run = (command,args,cwd=source,extra={}) => execFileSync(command,args,{
  cwd,stdio:"inherit",windowsHide:true,env:{...process.env,...extra},
});
const archive = join(output,"source.zip");
run("git",["archive",manifest.identity.runtimeRevision,"--format=zip","--output",archive],join(assets,"Mortal"));
run(python,["-c","import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",archive,source]);
run("git",["apply","--check",patch]);
run("git",["apply",patch]);
const target = join(assets,"rule-native-build-cache");
run("cargo",["build","--offline","--locked","-p","libriichi","--release","--lib"],source,{
  PATH:`${join(process.env.USERPROFILE??"", ".cargo/bin")};C:\\msys64\\ucrt64\\bin;${process.env.PATH??""}`,
  CARGO_TARGET_DIR:target,
});
const nativeModulePath=join(output,"libriichi.pyd");
copyFileSync(join(target,"release/riichi.dll"),nativeModulePath);
const receipt={receiptVersion:"coach-libriichi-native/v1",upstreamRevision:manifest.identity.runtimeRevision,
  patchSha256:patchHash,sourceArchiveSha256:hash(archive),nativeArtifactSha256:hash(nativeModulePath),
  nativeModulePath,createdAt:new Date().toISOString(),buildCommand:"cargo build --offline --locked -p libriichi --release --lib"};
writeFileSync(join(output,"receipt.json"),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(receipt));
