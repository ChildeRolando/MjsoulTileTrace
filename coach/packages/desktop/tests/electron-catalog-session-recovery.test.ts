import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const electron = createRequire(import.meta.url)("electron") as string;
const harness = fileURLToPath(new URL("./electron-catalog-session-recovery-harness.cjs", import.meta.url));

async function runElectronRecoveryHarness(): Promise<Record<string, unknown>> {
  const directory = mkdtempSync(join(tmpdir(), "catalog-session-recovery-"));
  const profile = join(directory, "profile");
  const config = join(directory, "input.json");
  writeFileSync(config, JSON.stringify({ profile, repoRoot: fileURLToPath(new URL("../../..", import.meta.url)) }));
  try {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const child = spawn(electron, [harness, config], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout.on("data", (data) => { stdout += data; });
      child.stderr.on("data", (data) => { stderr += data; });
      const timer = setTimeout(() => {
        timedOut = true;
        if (process.platform === "win32" && child.pid !== undefined) {
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
        } else child.kill("SIGKILL");
      }, 30_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (timedOut || code !== 0) return reject(new Error(`Electron recovery harness failed (${code}): ${stderr}`));
        const result = stdout.split(/\r?\n/).find((line) => line.startsWith("CATALOG_RECOVERY_RESULT="));
        if (result === undefined) return reject(new Error(`Electron recovery result missing: ${stderr}`));
        try { resolve(JSON.parse(result.slice("CATALOG_RECOVERY_RESULT=".length))); }
        catch (error) { reject(error); }
      });
    });
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

describe("real Electron catalog session rejection path", () => {
  it("shows a relogin action through production IPC and preload without clearing local data", async () => {
    const result = await runElectronRecoveryHarness();
    expect(result.initialStatus).toBe("账号已连接");
    expect(result.initialDetail).toBe("fixture · 令牌仅保存在本机");
    expect(result.initialLoginHidden).toBe(true);
    expect(result.rejectedStatus).toBe("会话需要重新连接");
    expect(result.rejectedDetail).toBe("本机保存的数据仍会保留。");
    expect(result.rejectedText).toBe("当前雀魂会话无法恢复，请重新连接后再同步。");
    expect(result.rejectedLoginHidden).toBe(false);
    expect(result.rejectedLoginLabel).toBe("重新连接");
    expect(result.rejectedSyncHidden).toBe(true);
    expect(result.rejectedSyncDisabled).toBe(false);
    expect(result.rejectedLoginDisabled).toBe(false);
    expect(result.getStatusCallsAfterReject).toBe(1);
    expect(result.vaultClearCallsAfterReject).toBe(0);
    expect(result.catalogReplaceCallsAfterReject).toBe(0);
    expect(result.catalogClearCallsAfterReject).toBe(0);
    expect(result.logoutCallsAfterReject).toBe(0);
    expect(result.reloginCalls).toBe(1);
    expect(result.unverifiedText).toBe("牌谱加载失败，请重试。");
    expect(result.unverifiedStatus).toBe("账号已连接");
    expect(result.unverifiedDetail).toBe("fixture · 令牌仅保存在本机");
    expect(result.loginHiddenAfterUnverified).toBe(true);
    expect(result.syncHiddenAfterUnverified).toBe(false);
    expect(result.syncDisabledAfterUnverified).toBe(false);
    expect(result.authCallsAfterUnverified).toBe(2);
    expect(result.authCalls).toBe(3);
    expect(result.getStatusCallsAfterUnverified).toBe(1);
    expect(result.vaultClearCallsAfterUnverified).toBe(0);
    expect(result.catalogReplaceCallsAfterUnverified).toBe(0);
    expect(result.catalogClearCallsAfterUnverified).toBe(0);
    expect(result.logoutCallsAfterUnverified).toBe(0);
    expect(result.recoveredStatus).toBe("账号已连接");
    expect(result.recoveredDetail).toBe("fixture · 令牌仅保存在本机");
    expect(result.loginHiddenAfterRecovery).toBe(true);
    expect(result.loginLabelAfterRecovery).toBe("登录雀魂");
    expect(result.catalogTextAfterRecovery).toBe("暂无可分析牌谱。");
    expect(result.catalogReplaceCallsAfterRecovery).toBe(1);
    expect(result.vaultClearCallsAfterRecovery).toBe(0);
    expect(result.catalogClearCallsAfterRecovery).toBe(0);
    expect(result.logoutCallsAfterRecovery).toBe(0);
    expect(result.syncHiddenAfterRecovery).toBe(false);
    expect(result.syncDisabledAfterRecovery).toBe(false);
    expect(result.leakedText).toBe(false);
  }, 20_000);
});
