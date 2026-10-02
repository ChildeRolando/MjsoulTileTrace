import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMahjongSoulProtocolBundle, fetchMahjongSoulRecord, encodeMahjongSoulRecordCache } from "@riichi-coach/mahjong-soul-source";
const test = process.env.VITEST === "true" ? (await import("vitest")).test : (await import("node:test")).test;
const root=fileURLToPath(new URL("../",import.meta.url));

async function material() {
  const bundle=await loadMahjongSoulProtocolBundle(join(root,"vendor/mahjong-soul-protocol"));
  const fixture=JSON.parse(readFileSync(join(root,"packages/mahjong-soul-source/tests/fixtures/real-supported-round.json"),"utf8"));
  const fetched=await fetchMahjongSoulRecord({bundle,recordId:fixture.recordId,clientVersionString:"web-0.11.252.w",
    session:{async authenticate(){},async close(){},async call(){return {data:Buffer.from(fixture.wire,"hex"),
      head:{uuid:fixture.recordId,standard_rule:2,config:{category:2,mode:{mode:2},meta:{mode_id:12}}}};}},
    fetchImpl:async()=>{throw new Error("unused");}});
  return { bytes:encodeMahjongSoulRecordCache({bundle,...fetched}),recordId:fixture.recordId };
}
function cleanup(dir){
  const child=relative(resolve(tmpdir()),resolve(dir));
  assert(child.startsWith("majsoul-rule-cli-")&&!child.includes(".."));
  rmSync(dir,{recursive:true,force:true});
}
function run(script,args){return spawnSync(process.execPath,[join(root,"scripts",script),...args],{
  cwd:root,encoding:"utf8",windowsHide:true,timeout:20000,maxBuffer:2*1024*1024});}

test("discovery consumes an explicit record cache and uses evidence-bound opaque identity",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"majsoul-rule-cli-"));
  try{
    const {bytes,recordId}=await material();const file=join(dir,"record.json"),out=join(dir,"out.json");
    writeFileSync(file,bytes);
    const result=run("majsoul-discovery.mjs",[file,"--input-format","record-cache","--out",out]);
    assert.equal(result.status,0,result.stderr);
    const report=readFileSync(out,"utf8");
    assert(!report.includes(recordId));
    const gameId=`majsoul-g:${createHash("sha256").update(bytes).digest("hex").slice(0,16)}`;
    assert(result.stderr.includes(`MAP OK ${gameId}:`));
    assert(!result.stderr.includes("MAP FAIL"));
  }finally{cleanup(dir);}
});

for(const script of ["majsoul-discovery.mjs","majsoul-acceptance.mjs"]){
  test(`${script} rejects mismatched cached rule evidence before analysis`,async()=>{
    const dir=mkdtempSync(join(tmpdir(),"majsoul-rule-cli-"));
    try{
      const {bytes,recordId}=await material();const envelope=JSON.parse(Buffer.from(bytes).toString("utf8"));
      envelope.ruleEvidence.recordSha256=`sha256:${"0".repeat(64)}`;
      const file=join(dir,"record.json");writeFileSync(file,JSON.stringify(envelope));
      const args=script.includes("discovery")?[file]:["--record",file,"--seat","0","--state-dir",join(dir,"state")];
      const result=run(script,[...args,"--input-format","record-cache"]);
      assert.equal(result.status,2,result.stderr);
      assert.match(result.stderr,/mahjong_soul_record_identity_mismatch/);
      assert(!result.stderr.includes(recordId));
    }finally{cleanup(dir);}
  });
}
