import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { FixedReviewSnapshotSchema, FixedReviewOperationResultSchema, ReviewSessionSummarySchema } from "@riichi-coach/contracts";

const source = readFileSync(new URL("../src/renderer/fixed-review-ui.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/renderer/app.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
const analysisStages = ["fetching", "replaying", "rules", "scoring", "facts", "packaging", "saving"] as const;

function analysisSnapshot(input: {
  stage: string;
  completed?: number;
  total?: number | null;
  elapsedMs?: number;
  estimatedTotalMs?: number | null;
  remainingMs?: number | null;
  estimateSource?: "learning" | "history" | "current_rate";
  failedAt?: number;
}): unknown {
  const activeIndex = analysisStages.indexOf(input.stage as typeof analysisStages[number]);
  const terminal = input.stage === "complete" || input.stage === "failed";
  const failedAt = input.failedAt ?? 3;
  const steps = analysisStages.map((stage, index) => {
    const status = input.stage === "complete" ? "complete"
      : input.stage === "failed" ? index < failedAt ? "complete" : index === failedAt ? "failed" : "skipped"
        : index < activeIndex ? "complete" : index === activeIndex ? "running" : "waiting";
    const current = index === activeIndex;
    const stepTotal = status === "complete" ? 4 : current ? input.total ?? null : null;
    return {
      stage, status, completed: status === "complete" ? 4 : current ? input.completed ?? 0 : 0,
      total: stepTotal, elapsedMs: status === "complete" ? 1000 + index * 250 : current ? 1700 : 0,
    };
  });
  const elapsedMs = input.elapsedMs ?? 5500;
  return {
    stage: input.stage, completed: input.completed ?? 0, total: input.total ?? null, steps,
    elapsedMs, estimatedTotalMs: input.estimatedTotalMs ?? null,
    remainingMs: input.remainingMs ?? null,
    estimateSource: input.estimateSource ?? "learning",
  };
}

async function chromiumFocusResults(directory: string, scenarios = ["window.run(true)", "window.run(false)"], capture?: { path: string; width?: number; height?: number }) {
  // Use the project's pinned Chromium runtime and native keyboard input. The
  // system Edge CDP transport can accept a socket yet never answer its first
  // command; an unbounded request also prevents the old finally cleanup.
  const profile = mkdtempSync(join(tmpdir(), "fixed-review-browser-profile-"));
  const config = join(directory, "focus-input.json");
  writeFileSync(config, JSON.stringify({ directory, profile, scenarios,
    ...(capture === undefined ? {} : { capturePath: capture.path, width: capture.width, height: capture.height }) }));
  const executable = createRequire(import.meta.url)("electron") as string;
  const harness = fileURLToPath(new URL("./electron-focus-harness.cjs", import.meta.url));
  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const child = spawn(executable, [harness, config], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
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
        if (timedOut || code !== 0) return reject(new Error(`Chromium focus harness failed (${code}): ${stderr}`));
        const result = stdout.split(/\r?\n/).find((line) => line.startsWith("FOCUS_RESULT="));
        if (result === undefined) return reject(new Error("Chromium focus result missing"));
        try { resolve(JSON.parse(result.slice("FOCUS_RESULT=".length))); } catch (error) { reject(error); }
      });
    });
  } finally {
    rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

function writeFixedReviewBrowserFixture(directory: string, setup: string): void {
  writeFileSync(join(directory, "fixed-review-ui.mjs"), transpileModule(source, {
    compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
  }).outputText, "utf8");
  writeFileSync(join(directory, "page.html"), `<!doctype html><html><body><main id="root"></main><script type="module">
    import { createFixedReviewUi } from "./fixed-review-ui.mjs";
    ${setup}
  </script></body></html>`, "utf8");
}

describe("fixed review native DOM surface", () => {
  it.each(["failed", "validation_failed", "saved_open_failed"])("shows pending account analysis, blocks duplicate starts, and recovers controls: %s", async completion => {
    const directory = mkdtempSync(join(tmpdir(), "catalog-analysis-pending-"));
    try {
      for (const name of ["app", "fixed-review-ui", "record-label", "session-ui-policy", "paipu-ui-policy"]) {
        const text = readFileSync(new URL(`../src/renderer/${name}.ts`, import.meta.url), "utf8");
        writeFileSync(join(directory, `${name}.js`), transpileModule(text, {
          compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
        }).outputText, "utf8");
      }
      const setup = `
        const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
        let calls = 0, progressReads = 0, intervalPoll, rejectAnalysis, resolveAnalysis;
        window.setInterval = (callback, delay) => { intervalPoll = callback; window.pollIntervalMs = delay; return 1; };
        window.clearInterval = () => { intervalPoll = undefined; };
        let progress = ${JSON.stringify(analysisSnapshot({ stage: "scoring", completed: 2, total: 5, elapsedMs: 5500, estimatedTotalMs: 12500, remainingMs: 7000, estimateSource: "history" }))};
        window.riichiCoach = { getSessionStatus: async () => ({ status: "valid", displayName: "fixture" }) };
        window.riichiCoachProvider = { listReviewSessions: async () => [],
          status: async () => ({ configured: true, settings: null }),
          openReview: async () => { throw new Error("private-open-error"); }, leaveReview: async () => {} };
        window.riichiCoachCatalog = { listAnalyzableRecords: async () => [0,1].map(i => ({
          recordId: "fixture" + i, startedAt: 1, selfSeat: 0, shareUrl: "fixture",
          rule: { displayLabel: "四人南风" },
          players: [0,1,2,3].map(seat => ({seat, displayName: "fixture", rank: seat + 1, finalScore: 25000})) })),
          startRecordAnalysis: () => { calls++; return new Promise((resolve,reject) => { resolveAnalysis=resolve; rejectAnalysis=reject; }); },
          getRecordAnalysisProgress: async () => { progressReads++; return progress; } };
        const state = () => ({ calls, text: document.querySelector("#catalog-detail").textContent,
          busy: document.querySelector(".catalog").getAttribute("aria-busy"),
          disabled: ["logout", "refresh", "sync", "clear-source-cache"].map(id => document.querySelector("#"+id).disabled),
          recordButtonsDisabled: [...document.querySelectorAll("#catalog-list button")].map(b => b.disabled),
          labels: [...document.querySelectorAll("#catalog-list button")].map(b => b.textContent),
          progressShown: !document.querySelector("#analysis-progress").hidden,
          progressValue: document.querySelector("#analysis-progress-bar").value,
          progressMax: document.querySelector("#analysis-progress-bar").max,
          stepStatuses: [...document.querySelectorAll("#analysis-progress-steps li")].map(item => item.dataset.stage + ":" + item.dataset.status),
          estimate: document.querySelector("#analysis-progress-estimate").textContent,
          summary: document.querySelector("#analysis-progress-summary").textContent });
        window.run = async () => {
          await settle(); const buttons = document.querySelectorAll("#catalog-list button");
          buttons[0].click();
          window.immediateProgress = { shown: !document.querySelector("#analysis-progress").hidden,
            steps: [...document.querySelectorAll("#analysis-progress-steps li")].map(item => item.dataset.stage + ":" + item.dataset.status) };
          await settle(); intervalPoll(); await settle(); window.pending=state(); buttons[1].click();
          window.progressLabel=document.querySelector("#analysis-progress-label").textContent;
          window.afterDuplicate=calls;
          ${completion === "saved_open_failed"
            ? `progress=${JSON.stringify(analysisSnapshot({ stage: "complete", elapsedMs: 7000, estimatedTotalMs: 7000, remainingMs: 0, estimateSource: "history" }))}; resolveAnalysis({ status: "review_ready", packageId: "fixture", sessionId: "fixture" });`
            : `progress=${JSON.stringify(analysisSnapshot({ stage: "failed", elapsedMs: 6500, failedAt: 3 }))}; rejectAnalysis(new Error(${JSON.stringify(completion === "validation_failed" ? "mahjong_soul_canonical_validation_failed" : "private-analysis-error")}));`}
          await settle(); window.finished=state(); document.activeElement?.blur();
        };
        window.focusResult = () => ({ pending: window.pending, afterDuplicate: window.afterDuplicate, finished: window.finished,
          progressLabel: window.progressLabel,
          pollIntervalMs: window.pollIntervalMs, progressReads,
          immediateProgress: window.immediateProgress,
          progressEstimate: document.querySelector("#analysis-progress-estimate").textContent,
          progressSummary: document.querySelector("#analysis-progress-summary").textContent });
      `;
      writeFileSync(join(directory, "setup.js"), setup);
      writeFileSync(join(directory, "page.html"), html.replace('<script type="module" src="./app.js"></script>', '<script src="./setup.js"></script><script type="module" src="./app.js"></script>'));
      expect(await chromiumFocusResults(directory, ["window.run()"])).toEqual([{
        pending: { calls: 1, text: "正在分析这场牌谱…整盘分析可能需要较长时间，请稍候。", busy: "true",
          disabled: [true, true, true, true], recordButtonsDisabled: [true, true], labels: ["分析中…", "分析"], progressShown: true, progressValue: 2, progressMax: 5,
          stepStatuses: ["fetching:complete", "replaying:complete", "rules:complete", "scoring:running", "facts:waiting", "packaging:waiting", "saving:waiting"],
          estimate: "预计总时长 0分12秒 · 预计剩余 0分7秒 · 根据本机历史分析",
          summary: "已开始分析，正在读取主进程的阶段进度。" },
        immediateProgress: { shown: true, steps: ["fetching:running", "replaying:waiting", "rules:waiting", "scoring:waiting", "facts:waiting", "packaging:waiting", "saving:waiting"] },
        progressLabel: "正在进行模型评分 · 2/5 · 总用时 0分5秒",
        pollIntervalMs: 1000, progressReads: 3,
        afterDuplicate: 1,
        finished: { calls: 1, text: completion === "failed" ? "暂时无法分析这场牌谱，请重试。" : completion === "validation_failed" ? "这场牌谱未通过转换或重放校验，分析未完成。请保留牌谱并反馈此问题。" : "复盘已保存，但暂时无法打开，请从已保存复盘重试。",
          busy: "false", disabled: [false, false, false, false], recordButtonsDisabled: [false, false], labels: ["分析", "分析"], progressShown: true, progressValue: 0, progressMax: 5,
          stepStatuses: completion === "saved_open_failed"
            ? ["fetching:complete", "replaying:complete", "rules:complete", "scoring:complete", "facts:complete", "packaging:complete", "saving:complete"]
            : ["fetching:complete", "replaying:complete", "rules:complete", "scoring:failed", "facts:skipped", "packaging:skipped", "saving:skipped"],
          estimate: completion === "saved_open_failed"
            ? "预计总时长 0分7秒 · 预计剩余 0分0秒 · 根据本机历史分析"
            : "总用时 0分6秒 · 正在建立本机参考，暂无法估算总时长和剩余时间。",
          summary: completion === "saved_open_failed"
            ? "整盘分析已完成，复盘已保存；请从已保存复盘列表打开。"
            : "分析未完成，阶段记录已保留；你可以重新尝试。" },
        progressEstimate: completion === "saved_open_failed"
          ? "预计总时长 0分7秒 · 预计剩余 0分0秒 · 根据本机历史分析"
          : "总用时 0分6秒 · 正在建立本机参考，暂无法估算总时长和剩余时间。",
        progressSummary: completion === "saved_open_failed"
          ? "整盘分析已完成，复盘已保存；请从已保存复盘列表打开。"
          : "分析未完成，阶段记录已保留；你可以重新尝试。",
      }]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  });

  it("paginates cached catalog entries in groups of eight and guards identity while analysis is pending", async () => {
    const directory = mkdtempSync(join(tmpdir(), "catalog-renderer-pages-"));
    try {
      for (const name of ["app", "fixed-review-ui", "record-label", "session-ui-policy", "paipu-ui-policy"]) {
        const text = readFileSync(new URL(`../src/renderer/${name}.ts`, import.meta.url), "utf8");
        writeFileSync(join(directory, `${name}.js`), transpileModule(text, {
          compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
        }).outputText, "utf8");
      }
      const records = Array.from({ length: 10 }, (_, index) => ({
        recordId: `record-${index}`, startedAt: 1_790_000_000 + index * 60, selfSeat: 0,
        shareUrl: "fixture", rule: {displayLabel: "四人南风"},
        players: [0,1,2,3].map(seat => ({seat, displayName: seat === 0 ? `player-${index}` : `opponent-${seat}`, rank: seat + 1, finalScore: 25000})),
      }));
      const setup = `
        const settle = async () => { await new Promise(resolve => setTimeout(resolve, 50)); };
        window.errors = [];
        window.addEventListener("unhandledrejection", event => window.errors.push(String(event.reason?.stack || event.reason)));
        window.addEventListener("error", event => window.errors.push(String(event.error?.stack || event.message)));
        let listCalls = 0, syncCalls = 0, startCalls = [], records = ${JSON.stringify(records)};
        let resolveAnalysis;
        window.riichiCoach = { getSessionStatus: async () => ({ status: "valid", displayName: "fixture" }) };
        window.riichiCoachProvider = { listReviewSessions: async () => [], openReview: async () => { throw new Error("unused"); }, leaveReview: async () => {} };
        window.riichiCoachCatalog = {
          listAnalyzableRecords: async () => { listCalls++; return records; },
          syncAnalyzableRecords: async () => {
            syncCalls++;
            records = syncCalls === 1 ? records.slice(0, 3) : syncCalls === 2 ? [] : ${JSON.stringify(records)};
            return records;
          },
          startRecordAnalysis: recordId => { startCalls.push(recordId); return new Promise(resolve => { resolveAnalysis = resolve; }); },
          getRecordAnalysisProgress: async () => (${JSON.stringify(analysisSnapshot({ stage: "scoring", completed: 2, total: 5, elapsedMs: 5500, estimatedTotalMs: 12500, remainingMs: 7000, estimateSource: "history" }))}),
        };
        window.run = async () => {
          await settle();
          const rows = () => [...document.querySelectorAll("#catalog-list li")].map(row => row.textContent);
          const page = () => document.querySelector("#catalog-pagination-status").textContent;
          window.initial = { rows: rows().length, names: rows().join("|"), page: page(), listCalls };
          document.querySelector("#catalog-page-next").click();
          window.secondPage = { rows: rows().length, names: rows().join("|"), page: page(), listCalls,
            previousDisabled: document.querySelector("#catalog-page-previous").disabled,
            nextDisabled: document.querySelector("#catalog-page-next").disabled };
          document.querySelector("#sync").click(); await settle();
          window.shrunk = { rows: rows().length, page: page(), navHidden: document.querySelector("#catalog-pagination").hidden };
          document.querySelector("#sync").click(); await settle();
          window.empty = { rows: rows().length, page: page(), navHidden: document.querySelector("#catalog-pagination").hidden,
            detail: document.querySelector("#catalog-detail").textContent };
          document.querySelector("#sync").click(); await settle();
          window.readyForAnalysis = { busy: document.querySelector(".catalog").getAttribute("aria-busy"), disabled: document.querySelector("#catalog-page-next").disabled };
          document.querySelector("#catalog-page-next").click();
          const selected = document.querySelector("#catalog-list li button");
          selected.click();
          window.pending = { page: page(), started: startCalls, navDisabled: [
            document.querySelector("#catalog-page-previous").disabled,
            document.querySelector("#catalog-page-next").disabled],
            duplicateButtonDisabled: selected.disabled, busy: document.querySelector(".catalog").getAttribute("aria-busy"),
            progressShown: !document.querySelector("#analysis-progress").hidden,
            summary: document.querySelector("#analysis-progress-summary").textContent };
          selected.click(); document.querySelector("#catalog-page-previous").click(); await settle();
          window.afterDuplicateAndFlip = { started: startCalls, page: page(), rows: rows().length };
        };
        window.focusResult = () => ({ initial: window.initial, secondPage: window.secondPage, shrunk: window.shrunk,
          empty: window.empty, readyForAnalysis: window.readyForAnalysis, pending: window.pending,
          afterDuplicateAndFlip: window.afterDuplicateAndFlip, syncCalls, errors: window.errors });
      `;
      writeFileSync(join(directory, "setup.js"), setup, "utf8");
      writeFileSync(join(directory, "page.html"), html.replace('<script type="module" src="./app.js"></script>', '<script src="./setup.js"></script><script type="module" src="./app.js"></script>'));
      expect(await chromiumFocusResults(directory, ["window.run()"])) .toEqual([{
        initial: { rows: 8, names: expect.stringContaining("player-7"), page: "第 1 / 2 页 · 共 10 场", listCalls: 1 },
        secondPage: { rows: 2, names: expect.stringContaining("player-8"), page: "第 2 / 2 页 · 共 10 场", listCalls: 1, previousDisabled: false, nextDisabled: true },
        shrunk: { rows: 3, page: "第 1 / 1 页 · 共 3 场", navHidden: true },
        empty: { rows: 0, page: "", navHidden: true, detail: "暂无可分析牌谱。" },
        readyForAnalysis: { busy: "false", disabled: false },
        pending: { page: "第 2 / 2 页 · 共 10 场", started: ["record-8"], navDisabled: [true, true], duplicateButtonDisabled: true, busy: "true",
          progressShown: true, summary: "已开始分析，正在读取主进程的阶段进度。" },
        afterDuplicateAndFlip: { started: ["record-8"], page: "第 2 / 2 页 · 共 10 场", rows: 2 },
        syncCalls: 3, errors: [],
      }]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }, 90_000);

  it("does not wait for a hung progress poll and discards its late reply after the next analysis starts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "catalog-progress-late-reply-"));
    try {
      for (const name of ["app", "fixed-review-ui", "record-label", "session-ui-policy", "paipu-ui-policy"]) {
        const text = readFileSync(new URL(`../src/renderer/${name}.ts`, import.meta.url), "utf8");
        writeFileSync(join(directory, `${name}.js`), transpileModule(text, {
          compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
        }).outputText, "utf8");
      }
      const records = Array.from({ length: 2 }, (_, index) => ({
        recordId: `record-${index}`, startedAt: 1_790_000_000 + index * 60, selfSeat: 0,
        shareUrl: "fixture", rule: {displayLabel: "四人南风"},
        players: [0,1,2,3].map(seat => ({seat, displayName: seat === 0 ? `player-${index}` : `opponent-${seat}`, rank: seat + 1, finalScore: 25000})),
      }));
      const snapshot = FixedReviewSnapshotSchema.parse({
        schemaVersion: "fixed-review-view/v1", packageId: "package-0", analysisStatus: "complete",
        outcomeCounts: { analysis_ready: 0, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
        activeReportRefId: null, activeReportStatus: "not_generated",
        explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
        selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 0, items: [] },
      });
      const lateProgress = analysisSnapshot({ stage: "facts", completed: 7, total: 9, elapsedMs: 777_000 });
      const currentProgress = analysisSnapshot({ stage: "fetching", completed: 0, total: 1, elapsedMs: 2200 });
      const setup = `
        const settle = async () => { await new Promise(resolve => setTimeout(resolve, 60)); };
        let progressCalls = 0, activeReads = 0, maxActiveReads = 0, resolveLateProgress;
        let resolveFirstAnalysis;
        let analysisCalls = [];
        window.riichiCoach = { getSessionStatus: async () => ({ status: "valid", displayName: "fixture" }) };
        window.riichiCoachProvider = { status: async () => ({ configured: true, settings: null }),
          listReviewSessions: async () => [], openReview: async () => snapshot,
          leaveReview: async () => {}, cancelGeneration: async () => {} };
        window.riichiCoachCatalog = {
          listAnalyzableRecords: async () => ${JSON.stringify(records)}, syncAnalyzableRecords: async () => ${JSON.stringify(records)},
          startRecordAnalysis: recordId => {
            analysisCalls.push(recordId);
            if (recordId === "record-0") return new Promise(resolve => { resolveFirstAnalysis = resolve; });
            return new Promise(() => {});
          },
          getRecordAnalysisProgress: () => {
            progressCalls++; activeReads++; maxActiveReads = Math.max(maxActiveReads, activeReads);
            if (progressCalls === 1) return new Promise(resolve => { resolveLateProgress = value => { activeReads--; resolve(value); }; });
            return Promise.resolve(${JSON.stringify(currentProgress)}).finally(() => { activeReads--; });
          },
        };
        window.run = async () => {
          await settle();
          const analyze = [...document.querySelectorAll("#catalog-list button")];
          analyze[0].click(); await settle();
          window.firstAnalysisPending = { calls: analysisCalls.slice(), busy: document.querySelector(".catalog").getAttribute("aria-busy"), progressCalls };
          resolveFirstAnalysis({ status: "review_ready", packageId: "package-0", sessionId: "session-0" });
          await settle();
          window.firstAnalysisFinished = { calls: analysisCalls.slice(), busy: document.querySelector(".catalog").getAttribute("aria-busy"),
            progressShown: !document.querySelector("#analysis-progress").hidden };
          document.querySelectorAll("#catalog-list button")[1].click(); await settle();
          window.secondAnalysisBeforeOldReply = { calls: analysisCalls.slice(), busy: document.querySelector(".catalog").getAttribute("aria-busy"),
            steps: [...document.querySelectorAll("#analysis-progress-steps li")].map(item => item.dataset.stage + ":" + item.dataset.status), progressCalls };
          resolveLateProgress(${JSON.stringify(lateProgress)});
          await settle();
          window.secondAnalysisAfterOldReply = { label: document.querySelector("#analysis-progress-label").textContent,
            steps: [...document.querySelectorAll("#analysis-progress-steps li")].map(item => item.dataset.stage + ":" + item.dataset.status),
            progressCalls, maxActiveReads };
        };
        window.focusResult = () => ({ firstAnalysisPending: window.firstAnalysisPending, firstAnalysisFinished: window.firstAnalysisFinished,
          secondAnalysisBeforeOldReply: window.secondAnalysisBeforeOldReply, secondAnalysisAfterOldReply: window.secondAnalysisAfterOldReply });
      `;
      writeFileSync(join(directory, "setup.js"), setup, "utf8");
      writeFileSync(join(directory, "page.html"), html.replace('<script type="module" src="./app.js"></script>', '<script src="./setup.js"></script><script type="module" src="./app.js"></script>'));
      expect(await chromiumFocusResults(directory, ["window.run()"])) .toEqual([{
        firstAnalysisPending: { calls: ["record-0"], busy: "true", progressCalls: 1 },
        firstAnalysisFinished: { calls: ["record-0"], busy: "false", progressShown: true },
        secondAnalysisBeforeOldReply: { calls: ["record-0", "record-1"], busy: "true",
          steps: ["fetching:running", "replaying:waiting", "rules:waiting", "scoring:waiting", "facts:waiting", "packaging:waiting", "saving:waiting"], progressCalls: 1 },
        secondAnalysisAfterOldReply: { label: "正在进行读取牌谱 · 0/1 · 总用时 0分2秒",
          steps: ["fetching:running", "replaying:waiting", "rules:waiting", "scoring:waiting", "facts:waiting", "packaging:waiting", "saving:waiting"],
          progressCalls: 3, maxActiveReads: 1 },
      }]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }, 90_000);

  it("paginates saved reviews and resets the page after opening a saved item refreshes the list", async () => {
    const directory = mkdtempSync(join(tmpdir(), "saved-review-renderer-pages-"));
    try {
      for (const name of ["app", "fixed-review-ui", "record-label", "session-ui-policy", "paipu-ui-policy"]) {
        const text = readFileSync(new URL(`../src/renderer/${name}.ts`, import.meta.url), "utf8");
        writeFileSync(join(directory, `${name}.js`), transpileModule(text, {
          compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
        }).outputText, "utf8");
      }
      const sessions = Array.from({ length: 10 }, (_, index) => ({
        sessionId: `session-${index}`, packageId: `saved-${index}`, analysisStatus: "complete",
        activeReportRefId: null, updatedAt: "2026-10-04T00:00:00.000Z",
      }));
      const snapshot = FixedReviewSnapshotSchema.parse({
        schemaVersion: "fixed-review-view/v1", packageId: "saved-9", analysisStatus: "complete",
        outcomeCounts: { analysis_ready: 0, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
        activeReportRefId: null, activeReportStatus: "not_generated",
        explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
        selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 0, items: [] },
      });
      const setup = `
        let reads = 0, openedPackageIds = [];
        const sessions = ${JSON.stringify(sessions)};
        const snapshot = ${JSON.stringify(snapshot)};
        window.riichiCoach = { getSessionStatus: async () => ({ status: "logged_out" }) };
        window.riichiCoachProvider = {
          status: async () => ({ configured: true, settings: null }),
          listReviewSessions: async () => ++reads === 1 ? sessions : [sessions[9]],
          openReview: async ({ packageId }) => { openedPackageIds.push(packageId); return snapshot; }, leaveReview: async () => {},
        };
        window.riichiCoachCatalog = { getRecordAnalysisProgress: async () => (${JSON.stringify(analysisSnapshot({ stage: "idle", elapsedMs: 0 }))}) };
        window.run = async () => {
          const settle = async () => { await new Promise(resolve => setTimeout(resolve, 50)); };
          await settle();
          const rows = () => [...document.querySelectorAll("#review-session-list li")].map(row => row.textContent);
          const page = () => document.querySelector("#review-session-pagination-status").textContent;
          window.firstPage = { count: rows().length, names: rows().join("|"), page: page() };
          document.querySelector("#review-session-page-next").click();
          window.secondPage = { count: rows().length, names: rows().join("|"), page: page(),
            previousDisabled: document.querySelector("#review-session-page-previous").disabled,
            nextDisabled: document.querySelector("#review-session-page-next").disabled };
          document.querySelector("#review-session-list button").click(); await settle();
          window.refreshed = { count: rows().length, names: rows().join("|"), page: page(), reads,
            reviewVisible: !document.querySelector("#fixed-review").hidden, openedPackageIds };
        };
        window.focusResult = () => ({ firstPage: window.firstPage, secondPage: window.secondPage, refreshed: window.refreshed });
      `;
      writeFileSync(join(directory, "setup.js"), setup, "utf8");
      writeFileSync(join(directory, "page.html"), html.replace('<script type="module" src="./app.js"></script>', '<script src="./setup.js"></script><script type="module" src="./app.js"></script>'));
      expect(await chromiumFocusResults(directory, ["window.run()"])) .toEqual([{
        firstPage: { count: 8, names: expect.stringContaining("牌谱复盘"), page: "第 1 / 2 页 · 共 10 条" },
        secondPage: { count: 2, names: expect.stringContaining("牌谱复盘"), page: "第 2 / 2 页 · 共 10 条", previousDisabled: false, nextDisabled: true },
        refreshed: { count: 1, names: expect.stringContaining("牌谱复盘"), page: "第 1 / 1 页 · 共 1 条", reads: 2, reviewVisible: true, openedPackageIds: ["saved-8"] },
      }]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }, 90_000);

  it("captures the desktop workbench and seven-step analysis panel in the fixed hidden Electron window", async () => {
    const directory = mkdtempSync(join(tmpdir(), "desktop-workbench-capture-"));
    const evidenceDirectory = resolve(process.cwd(), "..", "..", "coach-acceptance-evidence", "desktop-workbench-20261004");
    const capturePath = join(evidenceDirectory, "desktop-workbench.png");
    try {
      mkdirSync(evidenceDirectory, { recursive: true });
      for (const name of ["app", "fixed-review-ui", "record-label", "session-ui-policy", "paipu-ui-policy"]) {
        const text = readFileSync(new URL(`../src/renderer/${name}.ts`, import.meta.url), "utf8");
        writeFileSync(join(directory, `${name}.js`), transpileModule(text, {
          compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
        }).outputText, "utf8");
      }
      const records = Array.from({ length: 10 }, (_, index) => ({
        recordId: `demo-${index}`, startedAt: 1_790_000_000 + index * 60, selfSeat: 0, shareUrl: "fixture",
        rule: {displayLabel: "四人南风"},
        players: [0, 1, 2, 3].map(seat => ({ seat, displayName: seat === 0 ? `本机玩家 ${index + 1}` : `对手 ${seat}`, rank: seat + 1, finalScore: 25000 })),
      }));
      const setup = `
        const settle = (delay = 80) => new Promise(resolve => setTimeout(resolve, delay));
        window.riichiCoach = { getSessionStatus: async () => ({ status: "valid", displayName: "演示账号" }) };
        window.riichiCoachProvider = { status: async () => ({ configured: true, settings: null }),
          listReviewSessions: async () => [{ sessionId: "demo-session", packageId: "演示复盘", activeReportRefId: null }] };
        window.riichiCoachCatalog = {
          listAnalyzableRecords: async () => ${JSON.stringify(records)}, syncAnalyzableRecords: async () => ${JSON.stringify(records)},
          startRecordAnalysis: () => new Promise(() => {}),
          getRecordAnalysisProgress: async () => (${JSON.stringify(analysisSnapshot({ stage: "scoring", completed: 2, total: 5, elapsedMs: 95_000, estimatedTotalMs: 210_000, remainingMs: 115_000, estimateSource: "history" }))}),
        };
        window.run = async () => {
          await settle();
          document.querySelector("#catalog-list button").click();
          await settle(120);
          document.activeElement?.blur();
        };
        window.focusResult = () => ({ width: document.querySelector(".workspace").getBoundingClientRect().width,
          sidebarWidth: document.querySelector(".sidebar").getBoundingClientRect().width,
          recordCount: document.querySelectorAll("#catalog-list li").length,
          page: document.querySelector("#catalog-pagination-status").textContent,
          stepCount: document.querySelectorAll("#analysis-progress-steps li").length,
          stepText: document.querySelector("#analysis-progress-steps").textContent,
          progressEstimate: document.querySelector("#analysis-progress-estimate").textContent });
      `;
      writeFileSync(join(directory, "setup.js"), setup, "utf8");
      writeFileSync(join(directory, "styles.css"), styles, "utf8");
      writeFileSync(join(directory, "page.html"), html.replace('<script type="module" src="./app.js"></script>', '<script src="./setup.js"></script><script type="module" src="./app.js"></script>'));
      const results = await chromiumFocusResults(directory, ["window.run()"], { path: capturePath, width: 1440, height: 1120 });
      expect(results).toEqual([expect.objectContaining({
        width: expect.any(Number), sidebarWidth: expect.any(Number), recordCount: 8,
        page: "第 1 / 2 页 · 共 10 场", stepCount: 7,
        stepText: expect.stringContaining("模型评分"),
        progressEstimate: "预计总时长 3分30秒 · 预计剩余 1分55秒 · 根据本机历史分析",
      })]);
      expect((results[0] as { width: number }).width).toBeGreaterThan(800);
      expect((results[0] as { sidebarWidth: number }).sidebarWidth).toBeGreaterThan(240);
      expect(statSync(capturePath).size).toBeGreaterThan(15_000);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }, 90_000);

  it("keeps first-report generation blocked until the local coach service is configured", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-review-provider-readiness-"));
    try {
      const snapshot = FixedReviewSnapshotSchema.parse({
        schemaVersion: "fixed-review-view/v1", packageId: "first-package", analysisStatus: "complete",
        outcomeCounts: { analysis_ready: 1, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
        activeReportRefId: null, activeReportStatus: "not_generated",
        explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
        selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 1, items: [{
          decisionId: "decision-1", rank: 1, selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0,
          decisionWindowKind: "self_turn", actualAction: { actionRef: "action-1", label: "打牌 1m" },
          mortalPreferredActions: [], errorGap: 12, tags: ["efficiency"], explanationStatus: "not_generated",
        }] },
      });
      for (const name of ["app", "fixed-review-ui", "record-label", "session-ui-policy", "paipu-ui-policy"]) {
        const text = readFileSync(new URL(`../src/renderer/${name}.ts`, import.meta.url), "utf8");
        writeFileSync(join(directory, `${name}.js`), transpileModule(text, {
          compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
        }).outputText, "utf8");
      }
      const setup = `
        let generations = 0, statusReads = 0, activeReportRefId = null;
        const session = { sessionId: "first-session", packageId: "first-package", analysisStatus: "complete", activeReportRefId, updatedAt: "2026-10-04T00:00:00.000Z" };
        window.riichiCoach = { getSessionStatus: async () => ({ status: "logged_out" }) };
        window.riichiCoachProvider = {
          status: async () => { statusReads++; return { configured: false, settings: null }; },
          listReviewSessions: async () => [{ ...session, activeReportRefId }],
          openReview: async () => (${JSON.stringify(snapshot)}),
          generateReview: async () => { generations++; activeReportRefId = "first-report"; throw new Error("must-not-run"); },
          leaveReview: async () => {},
        };
        const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
        window.run = async () => {
          await settle();
          document.querySelector("#review-session-list button").click();
          await settle();
          const button = document.querySelector("#fixed-review .review-generate-remaining");
          button.click();
          await settle();
          window.afterAttempt = {
            generations, statusReads, activeReportRefId,
            configShown: document.querySelector(".coach-settings") !== null && document.querySelector(".coach-settings").open,
            configText: document.querySelector(".coach-settings")?.textContent ?? "",
            hasProviderChoice: document.querySelector("#coach-provider-kind") !== null,
            generateButtons: document.querySelectorAll("#fixed-review .review-generate-remaining").length,
          };
          document.activeElement?.blur();
        };
        window.focusResult = () => window.afterAttempt;
      `;
      writeFileSync(join(directory, "setup.js"), setup, "utf8");
      writeFileSync(join(directory, "page.html"), html.replace('<script type="module" src="./app.js"></script>', '<script src="./setup.js"></script><script type="module" src="./app.js"></script>'), "utf8");
      const actual = await chromiumFocusResults(directory, ["window.run()"]);
      expect(actual).toEqual([expect.objectContaining({
        generations: 0, statusReads: expect.any(Number), activeReportRefId: null,
        configShown: true, configText: expect.stringMatching(/配置|教练模型|服务/),
        hasProviderChoice: true, generateButtons: 1,
      })]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }, 90_000);

  it("shows unknown usage while generation waits and retains provider usage after reopening the report", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-review-token-usage-"));
    try {
      const snapshot = FixedReviewSnapshotSchema.parse({
        schemaVersion: "fixed-review-view/v1", packageId: "usage-package", analysisStatus: "complete",
        outcomeCounts: { analysis_ready: 1, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
        activeReportRefId: null, activeReportStatus: "not_generated",
        explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
        selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 1, items: [{
          decisionId: "usage-decision", rank: 1, selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0,
          decisionWindowKind: "self_turn", actualAction: { actionRef: "usage-action", label: "打牌 1m" },
          mortalPreferredActions: [], errorGap: 12, tags: ["efficiency"], explanationStatus: "not_generated",
        }] },
      });
      const generated = FixedReviewSnapshotSchema.parse({
        ...snapshot, activeReportRefId: "saved-report", activeReportStatus: "evidence_only",
        coachUsage: { inputTokens: 321, totalTokens: 366 },
        coachProvider: { providerId: "codex-cli", model: "gpt-6-luna", reasoningEffort: "max" },
        explanationCounts: { ready: 0, provider_unavailable: 1, request_failed: 0, invalid_output: 0 },
        selection: { ...snapshot.selection, items: snapshot.selection.items.map(item => ({ ...item, explanationStatus: "provider_unavailable" as const })) },
      });
      for (const name of ["app", "fixed-review-ui", "record-label", "session-ui-policy", "paipu-ui-policy"]) {
        const text = readFileSync(new URL(`../src/renderer/${name}.ts`, import.meta.url), "utf8");
        writeFileSync(join(directory, `${name}.js`), transpileModule(text, {
          compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
        }).outputText, "utf8");
      }
      const setup = `
        let generations = 0, opens = 0, activeReportRefId = null, resolveGeneration;
        const session = { sessionId: "usage-session", packageId: "usage-package", analysisStatus: "complete", activeReportRefId, updatedAt: "2026-10-04T00:00:00.000Z" };
        const usageSnapshot = ${JSON.stringify(snapshot)};
        const generated = ${JSON.stringify(generated)};
        const usageValues = () => [...document.querySelectorAll(".coach-token-usage dd")].map(item => item.textContent);
        const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
        window.riichiCoach = { getSessionStatus: async () => ({ status: "logged_out" }) };
        window.riichiCoachProvider = {
          status: async () => ({ configured: true, settings: { providerId: "codex-cli", modelName: "gpt-6-luna", reasoningEffort: "max" } }),
          listReviewSessions: async () => [{ ...session, activeReportRefId }],
          openReview: async () => { opens++; return activeReportRefId === null ? usageSnapshot : generated; },
          generateReview: async () => {
            generations++;
            return new Promise(resolve => { resolveGeneration = () => { activeReportRefId = "saved-report"; resolve({ status: "ready", snapshot: generated }); }; });
          },
          leaveReview: async () => {},
        };
        window.run = async () => {
          await settle();
          document.querySelector("#review-session-list button").click();
          await settle();
          window.before = { values: usageValues(), text: document.querySelector(".coach-token-usage").textContent };
          const generate = document.querySelector("#fixed-review .review-generate-remaining");
          generate.click(); await settle();
          window.waiting = { generations, disabled: generate.disabled,
            live: document.querySelector("#fixed-review .review-live").textContent, values: usageValues(),
            usageNote: document.querySelector(".coach-token-usage p:last-child").textContent };
          resolveGeneration(); await settle();
          window.afterGeneration = { generations, activeReportRefId, values: usageValues(),
            provider: document.querySelector(".coach-token-usage").textContent,
            note: document.querySelector(".coach-token-usage p:last-child").textContent };
          document.querySelector("#leave-review").click(); await settle();
          document.querySelector("#review-session-list button").click(); await settle();
          window.reopened = { opens, activeReportRefId, values: usageValues(),
            provider: document.querySelector(".coach-token-usage").textContent };
          document.activeElement?.blur();
        };
        window.focusResult = () => ({ before: window.before, waiting: window.waiting,
          afterGeneration: window.afterGeneration, reopened: window.reopened });
      `;
      writeFileSync(join(directory, "setup.js"), setup, "utf8");
      writeFileSync(join(directory, "page.html"), html.replace('<script type="module" src="./app.js"></script>', '<script src="./setup.js"></script><script type="module" src="./app.js"></script>'), "utf8");
      expect(await chromiumFocusResults(directory, ["window.run()"])).toEqual([{
        before: { values: ["未知", "未知", "未知", "未知"], text: expect.stringContaining("尚未生成") },
        waiting: { generations: 1, disabled: true, live: "正在生成剩余 1 条教练解说；等待最近一次请求返回解说和 Token 用量…", values: ["未知", "未知", "未知", "未知"],
          usageNote: expect.stringContaining("最近一次请求") },
        afterGeneration: { generations: 1, activeReportRefId: "saved-report", values: ["321", "未知", "366", "未知"],
          provider: expect.stringContaining("模型：gpt-6-luna · 推理强度 max"), note: expect.stringContaining("最近一次请求") },
        reopened: { opens: 2, activeReportRefId: "saved-report", values: ["321", "未知", "366", "未知"],
          provider: expect.stringContaining("模型：gpt-6-luna · 推理强度 max") },
      }]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }, 90_000);

  it.each([
    ["complete", false], ["partial", false], ["evidence_only", false], ["failed", false],
    ["complete", true], ["partial", true], ["evidence_only", true],
  ] as const)("refreshes the saved session label after app generation: %s (refresh failure=%s)", async (status, refreshFailsOnce) => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-review-session-list-"));
    try {
      const snapshot = FixedReviewSnapshotSchema.parse({
        schemaVersion: "fixed-review-view/v1", packageId: "saved-package", analysisStatus: "complete",
        outcomeCounts: { analysis_ready: 2, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
        activeReportRefId: null, activeReportStatus: "not_generated",
        explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
        selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 2, items: [1, 2].map(rank => ({
          decisionId: `d${rank}`, rank, selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0,
          decisionWindowKind: "self_turn", actualAction: { actionRef: `a${rank}`, label: "打牌 1m" },
          mortalPreferredActions: [], errorGap: 12, tags: ["efficiency"], explanationStatus: "not_generated",
        })) },
      });
      const ready = status === "complete" ? 2 : status === "partial" ? 1 : 0;
      const result = FixedReviewOperationResultSchema.parse(status === "failed"
        ? { status: "failed", code: "generation_failed" }
        : { status: "ready", snapshot: {
          ...snapshot, activeReportRefId: "saved-report", activeReportStatus: status,
          explanationCounts: { ready, provider_unavailable: 2 - ready, request_failed: 0, invalid_output: 0 },
          selection: { ...snapshot.selection, items: snapshot.selection.items.map((item, index) => ({
            ...item, explanationStatus: index < ready ? "ready" : "provider_unavailable",
          })) },
        } });
      const session = ReviewSessionSummarySchema.parse({
        sessionId: "saved-session", packageId: snapshot.packageId, analysisStatus: "complete",
        activeReportRefId: null, updatedAt: "2026-09-23T00:00:00.000Z",
      });
      for (const name of ["app", "fixed-review-ui", "record-label", "session-ui-policy", "paipu-ui-policy"]) {
        const text = readFileSync(new URL(`../src/renderer/${name}.ts`, import.meta.url), "utf8");
        writeFileSync(join(directory, `${name}.js`), transpileModule(text, {
          compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
        }).outputText, "utf8");
      }
      const setup = `
        let activeReportRefId = null;
        let reads = 0;
        let opens = 0;
        let generations = 0;
        let leaves = 0;
        const refreshFailsOnce = ${JSON.stringify(refreshFailsOnce)};
        const snapshot = ${JSON.stringify(snapshot)};
        const result = ${JSON.stringify(result)};
        const session = ${JSON.stringify(session)};
        window.riichiCoach = { getSessionStatus: async () => ({ status: "logged_out" }) };
        window.riichiCoachProvider = {
          status: async () => ({ configured: true, settings: null }),
          listReviewSessions: async () => {
            reads++;
            if (refreshFailsOnce && reads === 3) throw new Error("private-refresh-diagnostic");
            return [{ ...session, activeReportRefId }];
          },
          openReview: async () => { opens++; return activeReportRefId === null ? snapshot : result.snapshot; },
          generateReview: async () => {
            generations++;
            if (result.status === "ready") activeReportRefId = result.snapshot.activeReportRefId;
            return result;
          },
          leaveReview: async () => { leaves++; },
        };
        const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
        window.run = async () => {
          const list = document.querySelector("#review-session-list");
          window.before = list.textContent;
          list.querySelector("button").click();
          await settle();
          window.afterOpen = list.textContent;
          document.querySelector("#fixed-review .review-generate-remaining").click();
          await settle();
          window.afterGeneration = list.textContent;
          if (refreshFailsOnce) window.savedAfterRefreshFailure = {
            activeReportRefId,
            warning: document.querySelector("#review-entry-status").textContent,
            overview: document.querySelector("#fixed-review").textContent,
            alerts: [...document.querySelectorAll('#fixed-review [role="alert"]')].map(e => e.textContent),
            generateButtons: document.querySelectorAll("#fixed-review .review-generate-remaining").length,
            hidden: document.querySelector("#fixed-review").hidden,
          };
          document.querySelector("#leave-review").click();
          await settle();
          if (refreshFailsOnce) {
            window.firstLeave = { activeReportRefId, hidden: document.querySelector("#fixed-review").hidden };
            document.querySelector("#open-review").click();
            await settle();
            window.recoveredList = list.textContent;
            document.querySelector("#leave-review").click();
            await settle();
          }
          document.activeElement?.blur();
        };
        window.focusResult = () => ({ before: window.before, afterOpen: window.afterOpen,
          afterGeneration: window.afterGeneration, afterLeave: document.querySelector("#review-session-list").textContent,
          hidden: document.querySelector("#fixed-review").hidden, reads,
          ...(refreshFailsOnce ? { savedAfterRefreshFailure: window.savedAfterRefreshFailure,
            firstLeave: window.firstLeave, recoveredList: window.recoveredList,
            activeReportRefId, opens, generations, leaves } : {}) });
      `;
      writeFileSync(join(directory, "setup.js"), setup, "utf8");
      writeFileSync(join(directory, "page.html"), html.replace('<script type="module" src="./app.js"></script>', '<script src="./setup.js"></script><script type="module" src="./app.js"></script>'), "utf8");
      const before = "牌谱复盘 · 保存于 2026-09-23 · 尚未生成教练解说打开";
      const after = status === "failed" ? before : "牌谱复盘 · 保存于 2026-09-23 · 已有教练解说打开";
      const actual = await chromiumFocusResults(directory, ["window.run()"]);
      if (refreshFailsOnce) {
        const saved = (actual[0] as { savedAfterRefreshFailure: { overview: string } }).savedAfterRefreshFailure;
        expect(saved.overview).toContain({ complete: "入选条目的解说齐全", partial: "部分解说可用", evidence_only: "仅证据可用", failed: "" }[status]);
        expect(saved.overview).not.toMatch(/未生成|private-refresh-diagnostic/);
        expect(actual).toEqual([{
          before, afterOpen: before, afterGeneration: before, afterLeave: after, hidden: true, reads: 4,
          savedAfterRefreshFailure: { activeReportRefId: "saved-report",
            warning: "教练解说已生成，暂时无法刷新已保存复盘列表。", overview: saved.overview,
            alerts: [], generateButtons: status === "complete" ? 0 : 1, hidden: false },
          firstLeave: { activeReportRefId: "saved-report", hidden: true }, recoveredList: after,
          activeReportRefId: "saved-report", opens: 2, generations: 1, leaves: 2,
        }]);
      } else expect(actual).toEqual([{
        before, afterOpen: before, afterGeneration: after, afterLeave: after, hidden: true,
        reads: status === "failed" ? 2 : 3,
      }]);
    } finally {
      rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  }, 90_000);

  it("generates one selected action by decision id and reopens its detail from the returned snapshot", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-review-single-generation-"));
    try {
      writeFixedReviewBrowserFixture(directory, `
        const item = { decisionId: "decision-single", rank: 2, selectionReason: "model_disagreement_above_threshold", roundOrdinal: 1,
          decisionWindowKind: "self_turn", actualAction: { actionRef: "action-single", label: "打牌 4m" }, mortalPreferredActions: [],
          errorGap: 12, tags: ["efficiency"], explanationStatus: "not_generated" };
        const snapshot = { schemaVersion: "fixed-review-view/v1", packageId: "single-package", analysisStatus: "complete",
          outcomeCounts: { analysis_ready: 1, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
          activeReportRefId: null, activeReportStatus: "not_generated",
          explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
          selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 1, items: [item] } };
        const generated = { ...snapshot, activeReportRefId: "single-report", activeReportStatus: "complete",
          explanationCounts: { ready: 1, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
          selection: { ...snapshot.selection, items: [{ ...item, explanationStatus: "ready" }] } };
        const detail = { schemaVersion: "fixed-review-view/v1", packageId: "single-package", decisionId: "decision-single",
          activeReportRefId: "single-report", actual: item.actualAction, mortal: [], explanationStatus: "ready",
          coachJudgments: [], explanations: [{ segments: [{ kind: "text", text: "单条解说已更新" }], evidenceRefs: [] }],
          referenceTargets: [], provenance: [] };
        let request, detailRequests = [];
        const ui = createFixedReviewUi({ document, root: document.querySelector("#root"), api: {
          openReview: async () => snapshot,
          status: async () => ({ configured: true, settings: null }),
          generateReview: async value => { request = value; return { status: "ready", snapshot: generated }; },
          getReviewDetail: async value => { detailRequests.push(value); return detail; },
        } });
        window.run = async () => {
          await ui.open("single-package");
          document.querySelector(".review-overview button").click();
          document.querySelector('[data-decision-id="decision-single"] button:not(.review-generate-one)').click();
          await new Promise(resolve => setTimeout(resolve, 0));
          document.querySelector(".review-detail .review-generate-one").click();
          await new Promise(resolve => setTimeout(resolve, 0));
          window.result = { request, detailRequests, detailText: document.querySelector(".review-detail")?.textContent,
            generationButtons: document.querySelectorAll(".review-detail .review-generate-one").length };
          document.activeElement?.blur();
        };
        window.focusResult = () => window.result;
      `);
      expect(await chromiumFocusResults(directory, ["window.run()"])).toEqual([{
        request: { packageId: "single-package", operationId: expect.any(String), decisionId: "decision-single" },
        detailRequests: [
          { packageId: "single-package", decisionId: "decision-single", activeReportRefId: null },
          { packageId: "single-package", decisionId: "decision-single", activeReportRefId: "single-report" },
        ],
        detailText: expect.stringContaining("单条解说已更新"), generationButtons: 0,
      }]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }, 90_000);

  it("shows the remaining count, disables every generation and settings control while busy, and refreshes partial progress", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-review-remaining-generation-"));
    try {
      writeFixedReviewBrowserFixture(directory, `
        const items = [
          { decisionId: "ready-1", rank: 1, selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0,
            decisionWindowKind: "self_turn", actualAction: { actionRef: "a1", label: "打牌 1m" }, mortalPreferredActions: [], errorGap: 12, tags: ["efficiency"], explanationStatus: "ready" },
          { decisionId: "failed-2", rank: 2, selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0,
            decisionWindowKind: "self_turn", actualAction: { actionRef: "a2", label: "打牌 2m" }, mortalPreferredActions: [], errorGap: 11, tags: ["value"], explanationStatus: "request_failed" },
          { decisionId: "missing-3", rank: 3, selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0,
            decisionWindowKind: "self_turn", actualAction: { actionRef: "a3", label: "打牌 3m" }, mortalPreferredActions: [], errorGap: 10, tags: ["defense"], explanationStatus: "not_generated" },
        ];
        const snapshot = { schemaVersion: "fixed-review-view/v1", packageId: "partial-package", analysisStatus: "complete",
          outcomeCounts: { analysis_ready: 3, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
          activeReportRefId: "existing-report", activeReportStatus: "partial",
          explanationCounts: { ready: 1, provider_unavailable: 0, request_failed: 1, invalid_output: 0 },
          selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 3, items } };
        const generated = { ...snapshot, activeReportRefId: "updated-report", activeReportStatus: "partial",
          explanationCounts: { ready: 2, provider_unavailable: 0, request_failed: 0, invalid_output: 1 },
          selection: { ...snapshot.selection, items: items.map((item, index) => ({ ...item,
            explanationStatus: index < 2 ? "ready" : "invalid_output" })) } };
        let request, resolveGeneration, configurationCalls = 0;
        const ui = createFixedReviewUi({ document, root: document.querySelector("#root"), api: {
          openReview: async () => snapshot,
          status: async () => ({ configured: true, settings: null }),
          configure: async () => { configurationCalls++; return { configured: true, settings: null }; },
          generateReview: value => { request = value; return new Promise(resolve => { resolveGeneration = () => resolve({ status: "ready", snapshot: generated }); }); },
        } });
        window.run = async () => {
          await ui.open("partial-package");
          document.querySelector(".review-overview button").click();
          const generate = document.querySelector(".review-generate-remaining");
          const before = { label: generate.textContent, scope: document.querySelector(".review-generation-scope").textContent,
            perRowButtons: document.querySelectorAll(".review-generate-one").length, settingsVisible: document.querySelector(".coach-settings") !== null };
          generate.click();
          for (let i = 0; i < 24; i++) await Promise.resolve();
          window.waiting = { requestKeys: Object.keys(request).sort(), operationId: request.operationId,
            generationDisabled: [...document.querySelectorAll(".review-generate-remaining,.review-generate-one")].map(button => button.disabled),
            settingsDisabled: [...document.querySelectorAll(".coach-settings select,.coach-settings input,.coach-settings button")].map(control => control.disabled),
            live: document.querySelector(".review-live").textContent };
          resolveGeneration();
          await new Promise(resolve => setTimeout(resolve, 0));
          window.after = { bulkLabel: document.querySelector(".review-generate-remaining")?.textContent,
            scope: document.querySelector(".review-generation-scope").textContent,
            readyRowButtons: ["ready-1", "failed-2"].map(id => document.querySelector('[data-decision-id="' + id + '"] .review-generate-one') !== null),
            singleButtonCount: document.querySelectorAll(".review-generate-one").length,
            settingsVisible: document.querySelector(".coach-settings") !== null };
          document.querySelector(".coach-settings").open = true;
          document.querySelector(".coach-config-save").click();
          await new Promise(resolve => setTimeout(resolve, 0));
          window.after.settingsSaveCalls = configurationCalls;
          document.activeElement?.blur();
          window.result = { before, waiting: window.waiting, after: window.after };
        };
        window.focusResult = () => window.result;
      `);
      expect(await chromiumFocusResults(directory, ["window.run()"])).toEqual([{
        before: { label: "生成剩余 2 条教练解说", scope: expect.stringContaining("剩余 2 条"), perRowButtons: 2, settingsVisible: true },
        waiting: { requestKeys: ["operationId", "packageId"], operationId: expect.any(String),
          generationDisabled: [true, true, true], settingsDisabled: [true, true, true, true, true],
          live: "正在生成剩余 2 条教练解说；等待最近一次请求返回解说和 Token 用量…" },
        after: { bulkLabel: "生成剩余 1 条教练解说", scope: expect.stringContaining("剩余 1 条"),
          readyRowButtons: [false, false], singleButtonCount: 1, settingsVisible: true, settingsSaveCalls: 1 },
      }]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }, 90_000);

  it("cancels a generation when switching packages and discards its late report snapshot", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-review-generation-stale-"));
    try {
      writeFixedReviewBrowserFixture(directory, `
        const makeSnapshot = (packageId, decisionId, explanationStatus = "not_generated") => ({
          schemaVersion: "fixed-review-view/v1", packageId, analysisStatus: "complete",
          outcomeCounts: { analysis_ready: 1, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
          activeReportRefId: explanationStatus === "ready" ? packageId + "-report" : null,
          activeReportStatus: explanationStatus === "ready" ? "complete" : "not_generated",
          explanationCounts: { ready: explanationStatus === "ready" ? 1 : 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
          selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 1, items: [{ decisionId, rank: 1,
            selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0, decisionWindowKind: "self_turn",
            actualAction: { actionRef: decisionId + "-action", label: "打牌 1m" }, mortalPreferredActions: [], errorGap: 12,
            tags: ["efficiency"], explanationStatus }] },
        });
        const first = makeSnapshot("first-package", "first-decision");
        const second = makeSnapshot("second-package", "second-decision");
        const lateFirstReport = makeSnapshot("first-package", "first-decision", "ready");
        let request, resolveGeneration, notifyStarted, cancelled = [], left = [];
        const started = new Promise(resolve => { notifyStarted = resolve; });
        const ui = createFixedReviewUi({ document, root: document.querySelector("#root"), api: {
          openReview: async ({ packageId }) => packageId === "first-package" ? first : second,
          status: async () => ({ configured: true, settings: null }),
          generateReview: value => { request = value; notifyStarted(); return new Promise(resolve => { resolveGeneration = () => resolve({ status: "ready", snapshot: lateFirstReport }); }); },
          cancelGeneration: async ({ operationId }) => { cancelled.push(operationId); },
          leaveReview: async ({ packageId }) => { left.push(packageId); },
        } });
        window.run = async () => {
          await ui.open("first-package");
          document.querySelector(".review-overview button").click();
          document.querySelector('[data-decision-id="first-decision"] .review-generate-one').click();
          await started;
          await ui.open("second-package");
          resolveGeneration();
          await new Promise(resolve => setTimeout(resolve, 0));
          window.result = { request, cancelled, left, row: document.querySelector(".review-list [data-decision-id]")?.dataset.decisionId,
            scope: document.querySelector(".review-generation-scope").textContent,
            status: document.querySelector(".review-overview dl").textContent,
            alerts: document.querySelectorAll('#root [role="alert"]').length };
          document.activeElement?.blur();
        };
        window.focusResult = () => window.result;
      `);
      expect(await chromiumFocusResults(directory, ["window.run()"])).toEqual([{
        request: { packageId: "first-package", operationId: expect.any(String), decisionId: "first-decision" },
        cancelled: [expect.any(String)], left: ["first-package"], row: "second-decision",
        scope: expect.stringContaining("剩余 1 条"), status: expect.stringContaining("尚未生成教练解说"), alerts: 0,
      }]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }, 90_000);

  it("clears previous report usage during a new single request, keeps failed usage unknown, and displays the new response", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-review-current-request-usage-"));
    try {
      writeFixedReviewBrowserFixture(directory, `
        const items = ["done", "pending"].map((decisionId, index) => ({ decisionId, rank: index + 1,
          selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0, decisionWindowKind: "self_turn",
          actualAction: { actionRef: "a-" + index, label: "打牌 1m" }, mortalPreferredActions: [], errorGap: 12,
          tags: ["efficiency"], explanationStatus: index === 0 ? "ready" : "not_generated" }));
        const snapshot = { schemaVersion: "fixed-review-view/v1", packageId: "usage-package", analysisStatus: "complete",
          outcomeCounts: { analysis_ready: 2, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0,
            binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
          activeReportRefId: "first", activeReportStatus: "partial", coachUsage: { inputTokens: 111, outputTokens: 22, totalTokens: 133 },
          coachProvider: { providerId: "provider-one", model: "first-model" },
          explanationCounts: { ready: 1, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
          selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 2, items } };
        const generated = { ...snapshot, activeReportRefId: "second", activeReportStatus: "complete",
          coachUsage: {inputTokens: 222, outputTokens: 33, totalTokens: 255, cachedInputTokens: 0},
          coachProvider: {providerId: "provider-two", model: "second-model"},
          explanationCounts: {ready: 2, provider_unavailable: 0, request_failed: 0, invalid_output: 0},
          selection: {...snapshot.selection, items: items.map(item => ({...item, explanationStatus: "ready"}))} };
        let release;
        const requests = [];
        const ui = createFixedReviewUi({document, root: document.querySelector("#root"), api: {
          openReview: async () => snapshot, status: async () => ({configured: true, settings: null}),
          generateReview: request => { requests.push(request); return new Promise(resolve => {release = resolve;}); },
          getReviewDetail: async () => ({decisionId: "pending", actual: items[1].actualAction, mortal: [],
            coachJudgments: [], explanations: [], provenance: [], referenceTargets: [], explanationStatus: "ready"}),
        }});
        const usage = () => ({ values: [...document.querySelectorAll(".coach-token-usage dd")].map(node => node.textContent),
          model: document.querySelector(".coach-token-provider").textContent });
        const settle = () => new Promise(resolve => setTimeout(resolve, 0));
        window.run = async () => {
          await ui.open("usage-package");
          const before = usage();
          document.querySelector('[data-decision-id="pending"] .review-generate-one').click();
          await settle(); const waiting = usage();
          release({status: "failed", code: "generation_failed"}); await settle(); const failed = usage();
          document.querySelector('[data-decision-id="pending"] .review-generate-one').click(); await settle();
          release({status: "ready", snapshot: generated}); await settle();
          window.result = {before, waiting, failed, success: usage(), requests: requests.map(request => request.decisionId)};
        };
        window.focusResult = () => window.result;
      `);
      expect(await chromiumFocusResults(directory, ["window.run()"])).toEqual([{
        before: {values: ["111", "22", "133", "未知"], model: "模型：first-model"},
        waiting: {values: ["未知", "未知", "未知", "未知"], model: "模型：本次请求尚未返回信息"},
        failed: {values: ["未知", "未知", "未知", "未知"], model: "模型：本次请求尚未返回信息"},
        success: {values: ["222", "33", "255", "0"], model: "模型：second-model"}, requests: ["pending", "pending"],
      }]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }, 90_000);

  it("keeps a failed row action available for a fresh retry", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-review-generation-retry-"));
    try {
      writeFixedReviewBrowserFixture(directory, `
        const item = { decisionId: "retry-decision", rank: 1, selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0,
          decisionWindowKind: "self_turn", actualAction: { actionRef: "retry-action", label: "打牌 1m" }, mortalPreferredActions: [],
          errorGap: 12, tags: ["efficiency"], explanationStatus: "request_failed" };
        const snapshot = { schemaVersion: "fixed-review-view/v1", packageId: "retry-package", analysisStatus: "complete",
          outcomeCounts: { analysis_ready: 1, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
          activeReportRefId: "retry-report", activeReportStatus: "partial",
          explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 1, invalid_output: 0 },
          selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 1, items: [item] } };
        const generated = { ...snapshot, activeReportRefId: "retry-report-2", activeReportStatus: "complete",
          explanationCounts: { ready: 1, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
          selection: { ...snapshot.selection, items: [{ ...item, explanationStatus: "ready" }] } };
        let requests = [];
        const ui = createFixedReviewUi({ document, root: document.querySelector("#root"), api: {
          openReview: async () => snapshot,
          status: async () => ({ configured: true, settings: null }),
          generateReview: async request => { requests.push(request); return requests.length === 1
            ? { status: "failed", code: "generation_failed" }
            : { status: "ready", snapshot: generated }; },
        } });
        window.run = async () => {
          await ui.open("retry-package");
          document.querySelector('[data-decision-id="retry-decision"] .review-generate-one').click();
          await new Promise(resolve => setTimeout(resolve, 0));
          const retryButton = document.querySelector('[data-decision-id="retry-decision"] .review-generate-one');
          window.afterFailure = { enabled: retryButton.disabled === false,
            live: document.querySelector(".review-live").textContent, alert: document.querySelector('[role="alert"]')?.textContent };
          retryButton.click();
          await new Promise(resolve => setTimeout(resolve, 0));
          window.result = { afterFailure: window.afterFailure,
            decisionIds: requests.map(request => request.decisionId), distinctOperations: requests[0].operationId !== requests[1].operationId,
            remaining: document.querySelector(".review-generation-scope").textContent };
          document.activeElement?.blur();
        };
        window.focusResult = () => window.result;
      `);
      expect(await chromiumFocusResults(directory, ["window.run()"])).toEqual([{
        afterFailure: { enabled: true, live: expect.stringContaining("未生成，可以稍后重试"), alert: expect.stringContaining("你可以稍后再试") },
        decisionIds: ["retry-decision", "retry-decision"], distinctOperations: true,
        remaining: "所有入选条目都已有可用解说。",
      }]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  }, 90_000);

  it("ships semantic three-level landmarks and safe text-only rendering", () => {
    expect(html).toContain('id="fixed-review"');
    expect(html).toContain("复盘保存在本机");
    expect(html).not.toContain("仅本机处理");
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
          const ui = createFixedReviewUi({ document, root, api: {
            openReview: async () => snapshot,
            status: async () => ({ configured: true, settings: null }),
          } });
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

  it("moves real Chromium focus to the review entry after first-generation success", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-review-generation-focus-"));
    try {
      const compiled = transpileModule(source, {
        compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
      }).outputText;
      writeFileSync(join(directory, "fixed-review-ui.mjs"), compiled, "utf8");
      writeFileSync(join(directory, "page.html"), `<!doctype html><html><body><main id="root"></main><script type="module">
        import { createFixedReviewUi } from "./fixed-review-ui.mjs";
        const item = { decisionId: "d1", rank: 1, selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0,
          decisionWindowKind: "self_turn", actualAction: { actionRef: "a", label: "打牌 1m" }, mortalPreferredActions: [],
          errorGap: 12, tags: ["efficiency"], explanationStatus: "not_generated" };
        const snapshot = {
          schemaVersion: "fixed-review-view/v1", packageId: "focus-package", analysisStatus: "complete",
          outcomeCounts: { analysis_ready: 1, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
          activeReportRefId: null, activeReportStatus: "not_generated",
          explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
          selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 1, items: [item] },
        };
        const generated = {
          ...snapshot, activeReportRefId: "generated-ref", activeReportStatus: "evidence_only",
          explanationCounts: { ready: 0, provider_unavailable: 1, request_failed: 0, invalid_output: 0 },
          selection: { ...snapshot.selection, items: [{ ...item, explanationStatus: "provider_unavailable" }] },
        };
        window.runGeneration = async () => {
          const old = document.getElementById("root");
          const root = old.cloneNode(false); old.replaceWith(root);
          const ui = createFixedReviewUi({ document, root, api: {
            openReview: async () => snapshot,
            status: async () => ({ configured: true, settings: null }),
            generateReview: async () => ({ status: "ready", snapshot: generated }),
          } });
          await ui.open(snapshot.packageId);
          document.querySelector(".review-generate-remaining").focus();
        };
        window.run = window.runGeneration;
      </script></body></html>`, "utf8");
      expect(await chromiumFocusResults(directory, ["window.runGeneration()"]))
        .toEqual([{ tag: "BUTTON", text: "查看复盘条目", tabIndex: 0 }]);
    } finally {
      rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  }, 90_000);

  it("reveals collapsed evidence before keyboard focus navigation", async () => {
    const directory = mkdtempSync(join(tmpdir(), "fixed-review-evidence-focus-"));
    try {
      const compiled = transpileModule(source, {
        compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
      }).outputText;
      writeFileSync(join(directory, "fixed-review-ui.mjs"), compiled, "utf8");
      writeFileSync(join(directory, "page.html"), `<!doctype html><html><body><main id="root"></main><script type="module">
        import { createFixedReviewUi } from "./fixed-review-ui.mjs";
        const action = { actionRef: "a", label: "打牌 1m" };
        const scoredAction = { ...action, score: 80, scoreUnit: "模型选择分", scoreMethodLabel: "测试口径" };
        const item = { decisionId: "d1", rank: 1, selectionReason: "model_disagreement_above_threshold", roundOrdinal: 0,
          decisionWindowKind: "self_turn", actualAction: action, mortalPreferredActions: [scoredAction], errorGap: 12,
          tags: ["efficiency"], explanationStatus: "ready" };
        const snapshot = {
          schemaVersion: "fixed-review-view/v1", packageId: "focus-package", analysisStatus: "complete",
          outcomeCounts: { analysis_ready: 1, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
          activeReportRefId: "ref", activeReportStatus: "complete",
          explanationCounts: { ready: 1, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
          selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 1, items: [item] },
        };
        const evidence = (displayRef, label, summary, category = "hard_evidence", parentRefs = []) => ({
          displayRef, category, label, summary, relatedAction: null, details: [], producer: "fixture",
          producerVersion: "v1", parentRefs,
        });
        const detail = {
          schemaVersion: "fixed-review-detail/v2", packageId: "focus-package", decisionId: "d1", activeReportRefId: "ref",
          actual: action, mortal: [scoredAction],
          explanationStatus: "ready",
          coachJudgments: [{ recommendation: action, confidence: "medium", premiseRefs: ["fact"] }],
          explanations: [{ segments: [{ kind: "text", text: "证据解说" }], evidenceRefs: ["difference"] }],
          referenceTargets: [],
          provenance: [
            evidence("parent", "父项事实", "父项摘要"),
            evidence("fact", "候选事实", "事实摘要"),
            evidence("difference", "候选差异", "差异摘要"),
            evidence("inference", "教练推断", "推断摘要", "coach_inference", ["parent"]),
          ],
        };
        window.runEvidence = async (label) => {
          const old = document.getElementById("root");
          const root = old.cloneNode(false); old.replaceWith(root);
          const ui = createFixedReviewUi({ document, root, api: {
            openReview: async () => snapshot, status: async () => ({ configured: true, settings: null }), getReviewDetail: async () => detail,
          } });
          await ui.open(snapshot.packageId);
          [...document.querySelectorAll("button")].find((button) => button.textContent === "查看复盘条目").click();
          [...document.querySelectorAll("button")].find((button) => button.textContent === "查看详情").click();
          await Promise.resolve(); await Promise.resolve();
          const details = [...document.querySelectorAll("details")];
          window.evidenceSummary = details.find((node) => node.querySelector("summary")?.textContent === "证据摘要");
          window.evidenceSummary.open = false;
          if (label === "查看父项") details.find((node) => node.querySelector("summary")?.textContent === "来源信息").open = true;
          [...document.querySelectorAll("button")].find((button) => button.textContent === label).focus();
        };
        window.run = window.runEvidence;
        window.focusResult = () => ({
          tag: document.activeElement?.tagName,
          text: document.activeElement?.textContent,
          evidenceOpen: window.evidenceSummary.open,
        });
      </script></body></html>`, "utf8");
      expect(await chromiumFocusResults(directory, [
        'window.runEvidence("查看判断依据")',
        'window.runEvidence("查看解说证据")',
        'window.runEvidence("查看父项")',
      ])).toEqual([
        { tag: "ARTICLE", text: "候选事实：事实摘要", evidenceOpen: true },
        { tag: "ARTICLE", text: "候选差异：差异摘要", evidenceOpen: true },
        { tag: "ARTICLE", text: "父项事实：父项摘要", evidenceOpen: true },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
  }, 90_000);
});
