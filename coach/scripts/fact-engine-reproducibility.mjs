import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const relativeSource = "coach/tools/mahjong-facts";
function command(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd, encoding: "utf8", windowsHide: true, timeout: 120_000,
    env: { ...process.env, GOTOOLCHAIN: "local", GOOS: "windows", GOARCH: "amd64" },
  });
  assert.equal(result.status, 0, `${executable} ${args.join(" ")}: ${result.error ?? result.stderr}`);
  return result.stdout.trim();
}
const digest = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

test("fresh Git checkouts rebuild the published helper with either autocrlf setting", () => {
  const manifest = JSON.parse(readFileSync(path.join(repo,
    "coach/resources/mahjong-facts/windows-x64/manifest.json"), "utf8"));
  assert.equal(command("go", ["version"], repo).split(" ")[2], manifest.goVersion);
  const scratch = mkdtempSync(path.join(tmpdir(), "coach-helper-repro-"));
  const source = path.join(scratch, "index");
  mkdirSync(source);
  command("git", ["init", "--quiet"], source);
  command("git", ["config", "core.autocrlf", "false"], source);
  writeFileSync(path.join(source, ".gitattributes"), readFileSync(path.join(repo, ".gitattributes")));
  const files = command("git", ["ls-files", "--", relativeSource], repo)
    .split(/\r?\n/u).filter((file) => /(?:\.go|\/go\.(?:mod|sum))$/u.test(file));
  assert.ok(files.length > 10);
  files.push(
    "coach/scripts/build-fact-engine.ps1",
    "coach/scripts/package-fact-engine.ps1",
    "coach/resources/mahjong-facts/windows-x64/manifest.json",
    "coach/packages/reasoning/src/fact-engine/packaged-manifest.ts",
    "coach/packages/contracts/src/fact-engine.ts",
  );
  for (const file of files) {
    const target = path.join(source, file);
    mkdirSync(path.dirname(target), { recursive: true });
    // Git's canonical text, before checkout conversion. Use current sources
    // so the regression also applies before their next commit.
    writeFileSync(target, readFileSync(path.join(repo, file), "utf8").replaceAll("\r\n", "\n"));
  }
  command("git", ["add", "."], source);
  const receipts = [];
  for (const autocrlf of ["true", "false"]) {
    const checkout = path.join(scratch, `checkout-${autocrlf}`);
    mkdirSync(checkout);
    command("git", ["-c", `core.autocrlf=${autocrlf}`, "checkout-index", "--all",
      `--prefix=${checkout.replaceAll("\\", "/")}/`], source);
    // Exercise the original packaging gate, including identity, toolchain,
    // both manifests and post-copy integrity. Never rewrite its expected hash.
    command("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(checkout, "coach/scripts/package-fact-engine.ps1")], path.join(checkout, "coach"));
    const binary = path.join(checkout, "coach/resources/mahjong-facts/windows-x64/mahjong-facts.exe");
    receipts.push({ autocrlf, sha256: digest(binary) });
  }
  writeFileSync(path.join(scratch, "receipt.json"), JSON.stringify({ receipts, expected: manifest.sha256 }, null, 2));
  assert.deepEqual(receipts.map((item) => item.sha256), [manifest.sha256, manifest.sha256],
    `Independent checkout builds must match the release; evidence: ${scratch}`);
  assert.equal(digest(path.join(repo, "coach/resources/mahjong-facts/windows-x64/mahjong-facts.exe")), manifest.sha256);
});
