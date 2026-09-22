import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const source = readFileSync(new URL("../src/renderer/fixed-review-ui.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/renderer/app.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

async function chromiumFocusResults(directory: string) {
  const candidates = process.platform === "win32" ? [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ] : process.platform === "darwin" ? [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ] : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/microsoft-edge"];
  const executable = candidates.find(existsSync);
  if (executable === undefined) throw new Error("A Chromium browser is required for the real-DOM focus regression");
  const profile = join(directory, "browser-profile");
  const browser = spawn(executable, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, pathToFileURL(join(directory, "page.html")).href,
  ], { stdio: "ignore" });
  let socket: WebSocket | null = null;
  try {
    const portFile = join(profile, "DevToolsActivePort");
    for (let attempt = 0; attempt < 200 && !existsSync(portFile); attempt += 1) await delay(50);
    if (!existsSync(portFile)) throw new Error("Chromium DevTools port was not created");
    const port = Number(readFileSync(portFile, "utf8").split(/\r?\n/)[0]);
    let target: { webSocketDebuggerUrl?: string; url?: string } | undefined;
    for (let attempt = 0; attempt < 200 && target?.webSocketDebuggerUrl === undefined; attempt += 1) {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()) as Array<{ type: string; url?: string; webSocketDebuggerUrl?: string }>;
      target = targets.find((candidate) => candidate.type === "page" && candidate.url?.includes("page.html"));
      if (target?.webSocketDebuggerUrl === undefined) await delay(50);
    }
    if (target?.webSocketDebuggerUrl === undefined) throw new Error("Chromium page target was not created");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener("open", () => resolve(), { once: true });
      socket!.addEventListener("error", () => reject(new Error("Chromium DevTools connection failed")), { once: true });
    });
    let id = 0;
    const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (message.id === undefined) return;
      const request = pending.get(message.id); pending.delete(message.id);
      if (message.error === undefined) request?.resolve(message.result);
      else request?.reject(new Error(message.error.message));
    });
    const send = (method: string, params: Record<string, unknown> = {}) => new Promise<unknown>((resolve, reject) => {
      const requestId = ++id; pending.set(requestId, { resolve, reject });
      socket!.send(JSON.stringify({ id: requestId, method, params }));
    });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const evaluated = await send("Runtime.evaluate", { expression: "typeof window.run", returnByValue: true }) as { result?: { value?: string } };
      if (evaluated.result?.value === "function") break;
      if (attempt === 199) throw new Error("Focus test page did not initialize");
      await delay(50);
    }
    const results = [];
    for (const populated of [true, false]) {
      await send("Runtime.evaluate", { expression: `window.run(${populated})`, awaitPromise: true, returnByValue: true });
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      await send("Input.dispatchKeyEvent", { type: "char", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      await delay(20);
      const evaluated = await send("Runtime.evaluate", { expression: "({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent, tabIndex: document.activeElement?.tabIndex })", returnByValue: true }) as { result?: { value?: unknown } };
      results.push(evaluated.result?.value);
    }
    await send("Browser.close");
    return results;
  } finally {
    socket?.close();
    for (let attempt = 0; attempt < 100 && browser.exitCode === null; attempt += 1) await delay(20);
    if (browser.exitCode === null) browser.kill();
    for (let attempt = 0; attempt < 100 && browser.exitCode === null; attempt += 1) await delay(20);
  }
}

describe("fixed review native DOM surface", () => {
  it("ships semantic three-level landmarks and safe text-only rendering", () => {
    expect(html).toContain('id="fixed-review"');
    expect(source).toContain("review-overview");
    expect(source).toContain("review-list");
    expect(source).toContain("review-detail");
    expect(source).toContain('aria-live');
    expect(source).toContain('role", "alert"');
    expect(source).toContain("textContent");
    expect(source).not.toContain("innerHTML");
  });

  it("contains only first-generation user controls", () => {
    expect(source).toContain("生成教练解说");
    for (const forbidden of ["重新生成", "历史报告", "A/B", "activateReport", "切换报告"]) expect(source).not.toContain(forbidden);
  });

  it("wires a production package-reference entry and a compact six-group responsive list", () => {
    expect(html).toContain('id="review-package-id"');
    expect(html).toContain('id="open-review"');
    expect(app).toContain("await fixedReviewUi.open(packageId)");
    expect(app).toContain("fixedReviewUi.leave()");
    expect(app).toContain('reviewEntryStatus.textContent = "正在打开整盘复盘…"');
    expect(app).toContain('leaveReviewButton.hidden = true');
    for (const heading of ["局况 / 决策窗口", "我的行动", "Mortal 偏好", "模型分差 / 固定入选原因", "差异维度", "解说状态 / 详情"]) expect(source).toContain(heading);
    expect(source).not.toContain('["顺序", "局面"');
    expect(styles).toContain(".review-list td:nth-child(6)::before");
  });

  it("localizes user-facing state instead of printing internal error codes", () => {
    for (const phrase of ["决策比较齐全", "单一候选，无需模型比较", "解说请求未成功", "解说未通过校验", "仅证据可用"]) expect(source).toContain(phrase);
    for (const code of ["integrity_failed", "source_row_not_expected", "request_failed", "invalid_output"]) {
      const visibleLiteral = new RegExp(`[>\"']${code}[<\"']`, "g");
      expect(source.match(visibleLiteral) ?? []).toHaveLength(0);
    }
  });

  it("moves real Chromium focus into populated and empty Lists by keyboard", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-review-focus-"));
    try {
      const compiled = transpileModule(source, {
        compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
      }).outputText;
      writeFileSync(join(directory, "fixed-review-ui.mjs"), compiled, "utf8");
      writeFileSync(join(directory, "page.html"), `<!doctype html><html><body><main id="root"></main><script type="module">
        import { createFixedReviewUi } from "./fixed-review-ui.mjs";
        const base = {
          schemaVersion: "fixed-review-view/v1", packageId: "focus-package", analysisStatus: "complete",
          outcomeCounts: { analysis_ready: 1, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
          activeReportRefId: null, activeReportStatus: "not_generated",
          explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
        };
        const item = { decisionId: "d1", rank: 1, selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0,
          decisionWindowKind: "self_turn", actualAction: { actionRef: "a", label: "打牌 1m" }, mortalPreferredActions: [],
          errorGap: 12, tags: ["efficiency"], explanationStatus: "not_generated" };
        window.run = async (populated) => {
          const old = document.getElementById("root");
          const root = old.cloneNode(false); old.replaceWith(root);
          const snapshot = { ...base, selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: populated ? 1 : 0, items: populated ? [item] : [] } };
          const ui = createFixedReviewUi({ document, root, api: { openReview: async () => snapshot } });
          await ui.open(snapshot.packageId);
          const go = [...document.querySelectorAll("button")].find((button) => button.textContent === "查看复盘条目");
          go.id = "go-list"; go.focus();
        };
      </script></body></html>`, "utf8");
      expect(await chromiumFocusResults(directory)).toEqual([
        { tag: "H3", text: "复盘条目", tabIndex: -1 },
        { tag: "H3", text: "复盘条目", tabIndex: -1 },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  }, 90_000);
});
