import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

async function chromiumFocusResults(directory: string, scenarios = ["window.run(true)", "window.run(false)"]) {
  // Use the project's pinned Chromium runtime and native keyboard input. The
  // system Edge CDP transport can accept a socket yet never answer its first
  // command; an unbounded request also prevents the old finally cleanup.
  const profile = mkdtempSync(join(tmpdir(), "fixed-review-browser-profile-"));
  const config = join(directory, "focus-input.json");
  writeFileSync(config, JSON.stringify({ directory, profile, scenarios }));
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

describe("fixed review native DOM surface", () => {
  it.each(["failed", "validation_failed", "saved_open_failed"])("shows pending account analysis, blocks duplicate starts, and recovers controls: %s", async completion => {
    const directory = mkdtempSync(join(tmpdir(), "catalog-analysis-pending-"));
    try {
      for (const name of ["app", "fixed-review-ui", "session-ui-policy", "paipu-ui-policy"]) {
        const text = readFileSync(new URL(`../src/renderer/${name}.ts`, import.meta.url), "utf8");
        writeFileSync(join(directory, `${name}.js`), transpileModule(text, {
          compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
        }).outputText, "utf8");
      }
      const setup = `
        const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
        let calls = 0, rejectAnalysis, resolveAnalysis;
        window.riichiCoach = { getSessionStatus: async () => ({ status: "valid", displayName: "fixture" }) };
        window.riichiCoachProvider = { listReviewSessions: async () => [],
          openReview: async () => { throw new Error("private-open-error"); }, leaveReview: async () => {} };
        window.riichiCoachCatalog = { listAnalyzableRecords: async () => [0,1].map(i => ({
          recordId: "fixture" + i, startedAt: 1, selfSeat: 0, shareUrl: "fixture",
          players: [{ displayName: "fixture" }] })),
          startRecordAnalysis: () => { calls++; return new Promise((resolve,reject) => { resolveAnalysis=resolve; rejectAnalysis=reject; }); },
          getRecordAnalysisProgress: async () => ({ stage: "scoring", completed: 2, total: 5 }) };
        const state = () => ({ calls, text: document.querySelector("#catalog-detail").textContent,
          busy: document.querySelector(".catalog").getAttribute("aria-busy"),
          disabled: ["logout", "refresh", "sync", "clear-source-cache"].map(id => document.querySelector("#"+id).disabled),
          recordButtonsDisabled: [...document.querySelectorAll("#catalog-list button")].map(b => b.disabled),
          labels: [...document.querySelectorAll("#catalog-list button")].map(b => b.textContent),
          progressShown: !document.querySelector("#analysis-progress").hidden,
          progressValue: document.querySelector("#analysis-progress-bar").value,
          progressMax: document.querySelector("#analysis-progress-bar").max });
        window.run = async () => {
          await settle(); const buttons = document.querySelectorAll("#catalog-list button");
          buttons[0].click(); await new Promise(resolve => setTimeout(resolve, 1200)); window.pending=state(); buttons[1].click();
          window.progressLabel=document.querySelector("#analysis-progress-label").textContent;
          window.afterDuplicate=calls;
          ${completion === "saved_open_failed" ? 'resolveAnalysis({ status: "review_ready", packageId: "fixture", sessionId: "fixture" });' : `rejectAnalysis(new Error(${JSON.stringify(completion === "validation_failed" ? "mahjong_soul_canonical_validation_failed" : "private-analysis-error")}));`}
          await settle(); window.finished=state(); document.activeElement?.blur();
        };
        window.focusResult = () => ({ pending: window.pending, afterDuplicate: window.afterDuplicate, finished: window.finished, progressLabel: window.progressLabel });
      `;
      writeFileSync(join(directory, "setup.js"), setup);
      writeFileSync(join(directory, "page.html"), html.replace('<script type="module" src="./app.js"></script>', '<script src="./setup.js"></script><script type="module" src="./app.js"></script>'));
      expect(await chromiumFocusResults(directory, ["window.run()"])).toEqual([{
        pending: { calls: 1, text: "正在分析这场牌谱…整盘分析可能需要较长时间，请稍候。", busy: "true",
          disabled: [true, true, true, true], recordButtonsDisabled: [true, true], labels: ["分析中…", "分析"], progressShown: true, progressValue: 2, progressMax: 5 },
        progressLabel: expect.stringMatching(/^正在进行模型评分 · 2\/5 · 已用时 0分\d+秒$/),
        afterDuplicate: 1,
        finished: { calls: 1, text: completion === "failed" ? "暂时无法分析这场牌谱，请重试。" : completion === "validation_failed" ? "这场牌谱未通过转换或重放校验，分析未完成。请保留牌谱并反馈此问题。" : "复盘已保存，但暂时无法打开，请从已保存复盘重试。",
          busy: "false", disabled: [false, false, false, false], recordButtonsDisabled: [false, false], labels: ["分析", "分析"], progressShown: false, progressValue: 2, progressMax: 5 },
      }]);
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
  });

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
      for (const name of ["app", "fixed-review-ui", "session-ui-policy", "paipu-ui-policy"]) {
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
          [...document.querySelectorAll("#fixed-review button")].find(b => b.textContent === "生成教练解说").click();
          await settle();
          window.afterGeneration = list.textContent;
          if (refreshFailsOnce) window.savedAfterRefreshFailure = {
            activeReportRefId,
            warning: document.querySelector("#review-entry-status").textContent,
            overview: document.querySelector("#fixed-review").textContent,
            alerts: [...document.querySelectorAll('#fixed-review [role="alert"]')].map(e => e.textContent),
            generateButtons: [...document.querySelectorAll("#fixed-review button")].filter(b => b.textContent === "生成教练解说").length,
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
      const before = "saved-package · 尚未生成教练解说打开";
      const after = status === "failed" ? before : "saved-package · 已有教练解说打开";
      const actual = await chromiumFocusResults(directory, ["window.run()"]);
      if (refreshFailsOnce) {
        const saved = (actual[0] as { savedAfterRefreshFailure: { overview: string } }).savedAfterRefreshFailure;
        expect(saved.overview).toContain({ complete: "入选条目的解说齐全", partial: "部分解说可用", evidence_only: "仅证据可用", failed: "" }[status]);
        expect(saved.overview).not.toMatch(/未生成|private-refresh-diagnostic/);
        expect(actual).toEqual([{
          before, afterOpen: before, afterGeneration: before, afterLeave: after, hidden: true, reads: 4,
          savedAfterRefreshFailure: { activeReportRefId: "saved-report",
            warning: "教练解说已生成，暂时无法刷新已保存复盘列表。", overview: saved.overview,
            alerts: [], generateButtons: 0, hidden: false },
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
            generateReview: async () => ({ status: "ready", snapshot: generated }),
          } });
          await ui.open(snapshot.packageId);
          [...document.querySelectorAll("button")].find((button) => button.textContent === "生成教练解说").focus();
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
          producerVersion: "v1", sourceRefs: [], parentRefs,
        });
        const detail = {
          schemaVersion: "fixed-review-view/v1", packageId: "focus-package", decisionId: "d1", activeReportRefId: "ref",
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
          const ui = createFixedReviewUi({ document, root, api: { openReview: async () => snapshot, getReviewDetail: async () => detail } });
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
