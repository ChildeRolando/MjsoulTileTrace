import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RUNTIME_REVISION = "0cff2b52982be5b1163aa9a62fb01f03ce91e0d2";
const CHECKPOINT_REVISION = "7386c9f5c751a3ea75efea99737cef5a5ef950f1";
const CHECKPOINT_SHA256 = "738e0d6e3c0ce9671629554ad39abd147d2ffbac676e80b194c83f2acc0fea20";
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const artifactRoot = process.env.RIICHI_LOCAL_MORTAL_ROOT
  ?? join(process.env.LOCALAPPDATA ?? "", "RiichiCoach", "local-mortal-spike");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, cwd = repoRoot, extraEnv = {}) {
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    windowsHide: true,
  });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function ensurePinnedCheckout(url, directory, revision) {
  const publicGitEnv = { GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" };
  if (!existsSync(join(directory, ".git"))) run("git", ["clone", "--no-checkout", url, directory], artifactRoot, publicGitEnv);
  run("git", ["fetch", "origin", revision], directory, publicGitEnv);
  run("git", ["checkout", "--detach", revision], directory, { ...publicGitEnv, GIT_LFS_SKIP_SMUDGE: "1" });
  run("git", ["config", "core.autocrlf", "true"], directory, publicGitEnv);
  run("git", ["checkout-index", "--all", "--force"], directory, { ...publicGitEnv, GIT_LFS_SKIP_SMUDGE: "1" });
  const actual = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: directory, encoding: "utf8", windowsHide: true, env: { ...process.env, ...publicGitEnv },
  }).trim();
  if (actual !== revision) fail("local Mortal preparation failed: pinned revision mismatch");
}

if (process.platform !== "win32") fail("local Mortal production spike currently has only a windows-x64 manifest");
if (!artifactRoot || /[^\x20-\x7e]/.test(artifactRoot)) {
  fail("RIICHI_LOCAL_MORTAL_ROOT must be an absolute ASCII-only path (the GNU Rust linker cannot consume non-ASCII paths)");
}
mkdirSync(artifactRoot, { recursive: true });
const pythonRoot = join(artifactRoot, "python");
const pythonExecutable = join(pythonRoot, "Scripts", "python.exe");
if (!existsSync(pythonExecutable)) run("python", ["-m", "venv", pythonRoot]);
run(pythonExecutable, ["-m", "pip", "install", "--disable-pip-version-check", "--upgrade", "pip"]);
run(pythonExecutable, ["-m", "pip", "install", "--disable-pip-version-check", "--extra-index-url", "https://download.pytorch.org/whl/cpu", "torch==2.7.1+cpu"]);
run(pythonExecutable, ["-m", "pip", "install", "--disable-pip-version-check", "numpy==2.2.3"]);

const mortalRoot = join(artifactRoot, "Mortal");
const modelRoot = join(artifactRoot, "model");
ensurePinnedCheckout("https://github.com/Equim-chan/Mortal.git", mortalRoot, RUNTIME_REVISION);
ensurePinnedCheckout("https://huggingface.co/Yuchen1457/mortal-582500", modelRoot, CHECKPOINT_REVISION);
run("git", ["lfs", "pull", "--include", "mortal_582500.pth"], modelRoot);

const checkpointSource = join(modelRoot, "mortal_582500.pth");
if (sha256(checkpointSource) !== CHECKPOINT_SHA256) fail("local Mortal preparation failed: checkpoint SHA-256 mismatch");
const checkpointPath = join(artifactRoot, "mortal_582500.pth");
copyFileSync(checkpointSource, checkpointPath);

const cargoBin = join(process.env.USERPROFILE ?? "", ".cargo", "bin");
const buildPath = `${cargoBin};C:\\msys64\\ucrt64\\bin;${process.env.PATH ?? ""}`;
run("cargo", ["build", "-p", "libriichi", "--release", "--lib"], mortalRoot, {
  PATH: buildPath,
  CARGO_HTTP_CHECK_REVOKE: "false",
});
const nativeSource = join(mortalRoot, "target", "release", "riichi.dll");
const nativePath = join(mortalRoot, "target", "release", "libriichi.pyd");
copyFileSync(nativeSource, nativePath);
run(pythonExecutable, ["-c", "from libriichi.mjai import Bot; import torch; assert torch.__version__ == '2.7.1+cpu'"], mortalRoot, {
  PYTHONPATH: join(mortalRoot, "target", "release"),
});

const runtimePath = join(repoRoot, "packages", "mortal-runtime", "runtime", "local_mortal_runtime.py");
const manifestPath = join(repoRoot, "packages", "mortal-runtime", "manifests", "mortal-582500.windows-x64.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (sha256(runtimePath) !== manifest.identity.runtimeArtifactSha256) fail("local Mortal preparation failed: runtime artifact SHA-256 mismatch");
const modelPath = join(mortalRoot, "mortal", "model.py");
const enginePath = join(mortalRoot, "mortal", "engine.py");
if (
  sha256(modelPath) !== manifest.identity.runtimeModelSha256
  || sha256(enginePath) !== manifest.identity.runtimeEngineSha256
) fail("local Mortal preparation failed: upstream runtime artifact SHA-256 mismatch");

const receipt = {
  receiptVersion: "local-mortal-preparation-receipt/v1",
  runtimeRevision: RUNTIME_REVISION,
  runtimeArtifactSha256: sha256(runtimePath),
  runtimeModelSha256: sha256(modelPath),
  runtimeEngineSha256: sha256(enginePath),
  nativeArtifactSha256: sha256(nativePath),
  checkpointRevision: CHECKPOINT_REVISION,
  checkpointFileSha256: sha256(checkpointPath),
  protocolVersion: manifest.identity.protocolVersion,
  adapterVersion: manifest.identity.adapterVersion,
  geometry: manifest.geometry,
  licenses: manifest.licenses,
  pythonEnvironment: { torch: "2.7.1+cpu", numpy: "2.2.3" },
};
writeFileSync(join(artifactRoot, "preparation-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "prepared", ...receipt }));
