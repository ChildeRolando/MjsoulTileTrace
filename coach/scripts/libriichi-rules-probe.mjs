// Explicit real-native probe: intentionally supply absent model assets.
// This is a migration capability receipt, not the final production spike.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LIBRIICHI_RULE_PROTOCOL_VERSION, libriichiRuleCanonicalJson } from "@riichi-coach/contracts";
import { ManagedMortalRuntime, loadManagedMortalManifest, sha256File } from "@riichi-coach/mortal-runtime";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const assetRoot = process.env.RIICHI_LOCAL_MORTAL_ROOT ?? join(process.env.LOCALAPPDATA ?? "", "RiichiCoach", "local-mortal-spike");
const evidence = resolve(process.argv[2] ?? join(process.env.LOCALAPPDATA ?? "", "RiichiCoach", "spike-runs", `libriichi-rule-probe-${Date.now()}`));
mkdirSync(evidence, { recursive: true });
const manifest = await loadManagedMortalManifest(join(root, "packages/mortal-runtime/manifests/mortal-582500.windows-x64.json"));
if (!process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT) throw new Error("set RIICHI_LIBRIICHI_NATIVE_RECEIPT to the explicit native build receipt");
const prepared = JSON.parse(readFileSync(process.env.RIICHI_LIBRIICHI_NATIVE_RECEIPT, "utf8"));
const nativeModulePath = prepared.nativeModulePath;
if (prepared.receiptVersion !== "coach-libriichi-native/v1" || prepared.upstreamRevision !== manifest.identity.runtimeRevision ||
    prepared.patchSha256 !== await sha256File(join(root,"packages/mortal-runtime/native/coach-rule-config.patch")) ||
    prepared.nativeArtifactSha256 !== await sha256File(nativeModulePath)) throw new Error("native receipt mismatch");
const checkpointPath = join(evidence, "intentionally-absent-checkpoint.pth");
const mortalSourcePath = join(evidence, "intentionally-absent-model-source");
if (existsSync(checkpointPath) || existsSync(mortalSourcePath)) throw new Error("probe requires absent model assets");
const runtime = new ManagedMortalRuntime({
  executable: join(assetRoot, "python/Scripts/python.exe"),
  runtimePath: join(root, "packages/mortal-runtime/runtime/local_mortal_runtime.py"),
  checkpointPath, mortalSourcePath, nativeModulePath, manifest,
  identity: { ...manifest.identity, nativeArtifactSha256: prepared.nativeArtifactSha256 },
  environment: { ...process.env, PYTHONPATH: "", PYTHONDONTWRITEBYTECODE: "1" },
});
const digest = value => createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");
const events = [
  { type: "start_game" },
  { type: "start_kyoku", bakaze: "E", kyoku: 1, honba: 0, kyotaku: 0, oya: 0,
    scores: [25000,25000,25000,25000], dora_marker: "8p",
    tehais: [["1m","9m","1p","9p","1s","9s","E","S","W","N","P","F","C"], ...Array.from({length:3},()=>Array(13).fill("?"))] },
  { type: "tsumo", actor: 0, pai: "2m" },
].map((event,i) => ({ eventRef: `probe:${i}`, json: libriichiRuleCanonicalJson(event) }));
const content = {
  protocolVersion: LIBRIICHI_RULE_PROTOCOL_VERSION, operation: "legal_actions", identity: runtime.ruleIdentity,
  canonicalStreamIdentity: "native-rules-no-checkpoint-probe", eventPrefixSha256: digest(events),
  decision: { decisionId: "probe:2", surface: "self", windowKind: "self_turn", triggerEventRef: "probe:2",
    selfActor: 0, roundOrdinal: 0, riichiPhase: "none" },
  ruleSet: { length: "south", redFives: {man:1,pin:1,sou:1}, openTanyao: true, atamahane: false,
    westExtension: "sudden_death", ippatsuCancelledByAnkan: true }, events,
};
try {
  const request = { ...content, requestId: digest(content) };
  const response = await runtime.queryRules(request);
  const expected = [0,1,8,9,17,18,26,27,28,29,30,31,32,33,37,44];
  if (response.status !== "ok" || JSON.stringify(response.actions.map(a=>a.runtimeAction.index)) !== JSON.stringify(expected)) {
    throw new Error("native complete action-set regression");
  }
  const status = execFileSync("git", ["status", "--porcelain"], {cwd:root,encoding:"utf8",windowsHide:true});
  const diff = execFileSync("git", ["diff", "--binary", "HEAD"], {cwd:root,windowsHide:true,maxBuffer:32*1024*1024});
  const receipt = { receiptVersion: "libriichi-rule-capability/v1", createdAt: new Date().toISOString(),
    commit: execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",windowsHide:true}).trim(),
    dirty: status.trim().length > 0, trackedDiffSha256: createHash("sha256").update(diff).digest("hex"),
    ruleIdentity: runtime.ruleIdentity, checkpointExists: existsSync(checkpointPath), modelSourceExists: existsSync(mortalSourcePath),
    networkIsolation: "not_requested_or_claimed", request, response };
  const path = join(evidence,"receipt.json");
  writeFileSync(path, JSON.stringify(receipt,null,2)+"\n", {flag:"wx"});
  console.log(JSON.stringify({status:"passed",actionCount:response.actions.length,checkpointExists:false,modelSourceExists:false,receipt:path}));
} finally { await runtime.close(); }
