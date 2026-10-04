import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { createIdleRecordAnalysisSnapshot } from "../src/catalog-api.js";

const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const harness = fileURLToPath(new URL("./electron-focus-harness.cjs", import.meta.url));
const electron = createRequire(import.meta.url)("electron") as string;

type Scenario = Readonly<{
  initialStatus: "logged_out" | "valid" | "offline_unverified";
  action?: "login" | "refresh" | "analyze" | "paipu-import" | "open-saved-review";
  actionStatus?: "valid" | "offline_unverified";
  list?: "record" | "empty" | "failed";
  sync?: "record" | "empty" | "failed";
  paipuResult?: Record<string, unknown>;
  reviewOpen?: "ready" | "failed" | "failed_once";
  retrySavedReview?: boolean;
  analysisFails?: boolean;
  retryFromSavedSessionList?: boolean;
  failSessionListRefreshOnce?: boolean;
  savedSessions?: ReadonlyArray<{ sessionId: string; packageId: string }>;
  staleText?: string;
}>;

const record = {
  recordId: "260811-00000000-0000-0000-0000-000000000001",
  shareUrl: "https://game.maj-soul.com/1/?paipu=260811-00000000-0000-0000-0000-000000000001_a1",
  startedAt: 1_754_877_600,
  players: [
    { seat: 0, displayName: "A", finalScore: 32_000, rank: 1 },
    { seat: 1, displayName: "B", finalScore: 27_000, rank: 2 },
    { seat: 2, displayName: "C", finalScore: 23_000, rank: 3 },
    { seat: 3, displayName: "D", finalScore: 18_000, rank: 4 },
  ],
  selfSeat: 2,
  rule: {
    playerCount: 4, length: "south", modeId: 2,
    detailRuleHash: "sha256:7a53cc5deb60512f3dacacc7695dd5072077c6f4984dbedbff76e27092393b1c",
    displayLabel: "四人南风",
  },
  analysisStatus: "not_analyzed",
  lastSyncedAt: 1_754_887_700,
};

async function runScenario(scenario: Scenario): Promise<Record<string, unknown>> {
  const directory = mkdtempSync(join(tmpdir(), "account-catalog-composition-"));
  const profile = mkdtempSync(join(tmpdir(), "account-catalog-profile-"));
  try {
    for (const name of ["app", "fixed-review-ui", "record-label", "session-ui-policy", "paipu-ui-policy"]) {
      const source = readFileSync(new URL(`../src/renderer/${name}.ts`, import.meta.url), "utf8");
      writeFileSync(join(directory, `${name}.js`), transpileModule(source, {
        compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
      }).outputText, "utf8");
    }
    const setup = `
      const scenario = ${JSON.stringify(scenario)};
      const record = ${JSON.stringify(record)};
      const calls = { getStatus: 0, login: 0, list: 0, sync: 0, analyze: 0, paipuImport: 0, listReviewSessions: 0, openReview: 0, detail: 0, leaveReview: 0 };
      const status = (value) => value === "logged_out"
        ? { region: "cn", status: value }
        : { region: "cn", status: value, displayName: "fixture" };
      window.riichiCoach = {
        getSessionStatus: async () => {
          calls.getStatus++;
          return status(calls.getStatus === 1 ? scenario.initialStatus : scenario.actionStatus);
        },
        openMahjongSoulLogin: async () => { calls.login++; return status(scenario.actionStatus); },
        logoutMahjongSoul: async () => status("logged_out"),
      };
      const catalogResult = async (kind, operation) => {
        calls[operation]++;
        if (kind === "failed") throw new Error("private upstream prose");
        return kind === "record" ? [record] : [];
      };
      window.riichiCoachCatalog = {
        getRecordAnalysisProgress: async () => (${JSON.stringify(createIdleRecordAnalysisSnapshot())}),
        listAnalyzableRecords: () => catalogResult(scenario.list, "list"),
        syncAnalyzableRecords: () => catalogResult(scenario.sync, "sync"),
        startRecordAnalysis: async () => { calls.analyze++; if (scenario.analysisFails) throw new Error("private model failure"); return { status: "review_ready", sessionId: "session-1", packageId: "package-1" }; },
        clearSourceCache: async () => ({ status: "cleared", pendingMaterials: 0 }),
      };
      const snapshot = (packageId) => ({
        schemaVersion: "fixed-review-view/v1", packageId, analysisStatus: "degraded",
        outcomeCounts: { analysis_ready: 1, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
        selection: { policyVersion: "deterministic-review-selector/v1", selectedCount: 1, items: [{
          decisionId: "decision-1", rank: 1, selectionReason: "model_disagreement_above_threshold",
          roundOrdinal: 0, decisionWindowKind: "self_turn",
          actualAction: { actionRef: "discard:1m", label: "1m" },
          mortalPreferredActions: [{ actionRef: "discard:2m", label: "2m", score: 80, scoreUnit: "模型选择分", scoreMethodLabel: "Mortal 行动概率 × 100" }],
          errorGap: 20, tags: ["efficiency"], explanationStatus: "not_generated",
        }] },
        activeReportRefId: null, activeReportStatus: "not_generated",
        explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
      });
      const detail = (packageId) => ({
        schemaVersion: "fixed-review-detail/v1", packageId, activeReportRefId: null,
        decisionId: "decision-1", actual: { actionRef: "discard:1m", label: "1m" },
        mortal: [{ actionRef: "discard:2m", label: "2m", score: 80, scoreUnit: "模型选择分", scoreMethodLabel: "Mortal 行动概率 × 100" }],
        coachJudgments: [], explanations: [], referenceTargets: [], provenance: [], explanationStatus: "not_generated",
      });
      window.riichiCoachPaipu = { importPaipu: async () => { calls.paipuImport++; return scenario.paipuResult ?? { status: "analysis_failed" }; } };
      window.riichiCoachProvider = {
        status: async () => ({ configured: true, settings: null }),
        listReviewSessions: async () => {
          calls.listReviewSessions++;
          if (scenario.failSessionListRefreshOnce && calls.listReviewSessions === 2) {
            throw new Error("private session list provider details");
          }
          return (scenario.savedSessions ?? []).map((session, index) => ({
            ...session, analysisStatus: "complete", activeReportRefId: null,
            updatedAt: "2026-10-01T00:00:0" + index + ".000Z",
          }));
        },
        openReview: async ({ packageId }) => {
          calls.openReview++;
          if (scenario.reviewOpen === "failed" || (scenario.reviewOpen === "failed_once" && calls.openReview === 1)) throw new Error("review unavailable");
          return snapshot(packageId);
        },
        getReviewDetail: async ({ packageId }) => { calls.detail++; return detail(packageId); },
        leaveReview: async () => { calls.leaveReview++; return { status: "acknowledged" }; },
        cancelGeneration: async () => ({ status: "acknowledged" }),
        generateReview: async () => ({ status: "failed", code: "generation_failed" }),
      };
      if (scenario.staleText) document.querySelector("#catalog-list").textContent = scenario.staleText;
      const settle = async () => {
        for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
      };
      const reviewVisibility = () => ({
        reviewHidden: document.querySelector("#fixed-review").hidden,
        reviewText: document.querySelector("#fixed-review").textContent,
        sourceHidden: document.querySelector(".paipu-import").hidden,
        leaveHidden: document.querySelector("#leave-review").hidden,
      });
      const reviewState = () => ({
        ...reviewVisibility(),
        reviewEntryStatus: document.querySelector("#review-entry-status").textContent,
        reviewAlert: document.querySelector("#fixed-review [role='alert']")?.textContent ?? null,
        reviewOverview: document.querySelector("#fixed-review .review-overview")?.textContent ?? null,
        reviewListHidden: document.querySelector("#fixed-review .review-list")?.hidden ?? null,
        reviewDetail: document.querySelector("#fixed-review .review-detail")?.textContent ?? null,
        sessionListText: document.querySelector("#review-session-list").textContent,
      });
      let failedOpenView = null;
      let failedListRefreshView = null;
      let afterLeaveView = null;
      window.run = async () => {
        await settle();
        if (scenario.action === "login" || scenario.action === "analyze") {
          document.querySelector("#login").click();
        } else if (scenario.action === "refresh") {
          document.querySelector("#refresh").click();
        } else if (scenario.action === "paipu-import") {
          document.querySelector("#paipu-url").value = record.shareUrl;
          document.querySelector("#paipu-import").click();
        } else if (scenario.action === "open-saved-review") {
          document.querySelector("#review-session-list button")?.click();
        }
        await settle();
        if (scenario.action === "analyze") {
          document.querySelector("#catalog-list button").click();
          await settle();
        } else if (scenario.action === "paipu-import") {
          await settle();
          if (scenario.retrySavedReview) {
            failedOpenView = reviewVisibility();
            document.querySelector("#open-review").click();
            await settle();
          }
          if (scenario.retryFromSavedSessionList) {
            failedListRefreshView = reviewState();
            document.querySelector("#leave-review").click();
            await settle();
            afterLeaveView = reviewState();
            document.querySelector("#review-session-list button")?.click();
            await settle();
          }
          document.querySelector("#fixed-review .review-overview button")?.click();
          await settle();
          document.querySelector("#fixed-review .review-list button")?.click();
          await settle();
        } else if (scenario.action === "open-saved-review") {
          if (scenario.retryFromSavedSessionList) {
            failedListRefreshView = reviewState();
            document.querySelector("#leave-review").click();
            await settle();
            afterLeaveView = reviewState();
            document.querySelector("#review-session-list button")?.click();
            await settle();
          }
          document.querySelector("#fixed-review .review-overview button")?.click();
          await settle();
          document.querySelector("#fixed-review .review-list button")?.click();
          await settle();
        }
        document.activeElement?.blur();
      };
      window.focusResult = () => ({
        ...reviewVisibility(), failedOpenView, failedListRefreshView, afterLeaveView,
        calls: { getStatus: calls.getStatus, login: calls.login, list: calls.list, sync: calls.sync, analyze: calls.analyze },
        reviewCalls: { paipuImport: calls.paipuImport, openReview: calls.openReview, detail: calls.detail },
        sessionCalls: { listReviewSessions: calls.listReviewSessions, leaveReview: calls.leaveReview },
        catalogDetail: document.querySelector("#catalog-detail").textContent,
        catalogText: document.querySelector("#catalog-list").textContent,
        catalogTitle: document.querySelector("#catalog-list li")?.title ?? null,
        syncHidden: document.querySelector("#sync").hidden,
        paipuStatus: document.querySelector("#paipu-status").textContent,
        reviewEntryStatus: document.querySelector("#review-entry-status").textContent,
        reviewAlert: document.querySelector("#fixed-review [role='alert']")?.textContent ?? null,
        reviewOverview: document.querySelector("#fixed-review .review-overview")?.textContent ?? null,
        reviewListHidden: document.querySelector("#fixed-review .review-list")?.hidden ?? null,
        reviewDetail: document.querySelector("#fixed-review .review-detail")?.textContent ?? null,
        reviewSessionListText: document.querySelector("#review-session-list").textContent,
      });
    `;
    writeFileSync(join(directory, "setup.js"), setup, "utf8");
    writeFileSync(
      join(directory, "page.html"),
      html.replace(
        '<script type="module" src="./app.js"></script>',
        '<script src="./setup.js"></script><script type="module" src="./app.js"></script>',
      ),
      "utf8",
    );
    const config = join(directory, "input.json");
    writeFileSync(config, JSON.stringify({ directory, profile, scenarios: ["window.run()"] }), "utf8");
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const child = spawn(electron, [harness, config], {
        stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        if (process.platform === "win32" && child.pid !== undefined) {
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
        } else child.kill("SIGKILL");
      }, 30_000);
      child.stdout.on("data", (data) => { stdout += data; });
      child.stderr.on("data", (data) => { stderr += data; });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(`Electron composition harness failed (${code}): ${stderr}`));
        const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith("FOCUS_RESULT="));
        if (line === undefined) return reject(new Error("Electron composition result missing"));
        resolve(JSON.parse(line.slice("FOCUS_RESULT=".length))[0]);
      });
    });
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

describe("account catalog app composition", () => {
  it("syncs a valid first login, renders the safe record, and continues to analysis", async () => {
    const result = await runScenario({
      initialStatus: "logged_out", action: "analyze", actionStatus: "valid", sync: "record",
    });
    expect(result.calls).toEqual({ getStatus: 1, login: 1, list: 0, sync: 1, analyze: 1 });
    expect(result.catalogText).toContain("四人南风");
    expect(result.catalogText).toContain("东位 · A · 第1名 · 32,000点");
    expect(result.catalogText).toContain("西位 · C · 第3名 · 23,000点");
    expect(result.catalogText).not.toContain("你为");
    expect(result.catalogTitle).toBe(record.shareUrl);
    expect(result.catalogDetail).toBe("已打开整盘复盘。");
    expect(result.reviewCalls).toMatchObject({ openReview: 1 });
    expect(result.reviewHidden).toBe(false);
    expect(result.syncHidden).toBe(false);
  }, 60_000);

  it("keeps the account source visible when analysis fails", async () => {
    const result = await runScenario({
      initialStatus: "logged_out", action: "analyze", actionStatus: "valid", sync: "record", analysisFails: true,
    });
    expect(result.reviewCalls).toMatchObject({ openReview: 0 });
    expect(result.reviewHidden).toBe(true);
    expect(result.catalogDetail).toBe("暂时无法分析这场牌谱，请重试。");
    expect(result.catalogDetail).not.toContain("private model failure");
  }, 60_000);

  it("keeps account source visible when a saved review cannot open", async () => {
    const result = await runScenario({
      initialStatus: "logged_out", action: "analyze", actionStatus: "valid", sync: "record", reviewOpen: "failed",
    });
    expect(result.reviewCalls).toMatchObject({ openReview: 1 });
    expect(result.reviewHidden).toBe(true);
    expect(result.catalogDetail).toContain("复盘已保存，但暂时无法打开");
  }, 60_000);

  it("syncs the catalog when a manual status refresh returns valid", async () => {
    const result = await runScenario({
      initialStatus: "logged_out", action: "refresh", actionStatus: "valid", sync: "record",
    });
    expect(result.calls).toEqual({ getStatus: 2, login: 0, list: 0, sync: 1, analyze: 0 });
    expect(result.catalogText).toContain("分析");
  }, 60_000);

  it("shows the empty state only after a successful sync", async () => {
    const result = await runScenario({
      initialStatus: "logged_out", action: "login", actionStatus: "valid", sync: "empty",
    });
    expect(result.catalogDetail).toBe("暂无可分析牌谱。");
    expect(result.calls).toEqual({ getStatus: 1, login: 1, list: 0, sync: 1, analyze: 0 });
  }, 60_000);

  it("keeps the visible catalog and shows a retryable error when sync fails", async () => {
    const result = await runScenario({
      initialStatus: "logged_out", action: "login", actionStatus: "valid",
      sync: "failed", staleText: "已缓存牌谱",
    });
    expect(result.catalogDetail).toBe("牌谱加载失败，请重试。");
    expect(result.catalogText).toBe("已缓存牌谱");
  }, 60_000);

  it("uses only the verified local cache while offline and never claims a sync", async () => {
    const result = await runScenario({ initialStatus: "offline_unverified", list: "record" });
    expect(result.calls).toEqual({ getStatus: 1, login: 0, list: 1, sync: 0, analyze: 0 });
    expect(result.catalogDetail).toContain("当前离线，仅显示上次缓存");
    expect(result.catalogText).toContain("分析");
    expect(result.syncHidden).toBe(true);
  }, 60_000);

  it("routes a verified share import through ReviewSession to Overview, List, and Detail", async () => {
    const result = await runScenario({
      initialStatus: "valid", action: "paipu-import",
      paipuResult: {
        status: "review_ready", recordId: record.recordId, sessionId: "session-verified",
        packageId: "package-verified", canonicalEventCount: 12, replayDecisionCount: 4,
      },
    });
    expect(result.reviewCalls).toEqual({ paipuImport: 1, openReview: 1, detail: 1 });
    expect(result.sessionCalls).toEqual({ listReviewSessions: 2, leaveReview: 0 });
    expect(result.paipuStatus).toContain("牌谱已生成复盘");
    expect(result.reviewOverview).toContain("整盘复盘");
    expect(result.reviewListHidden).toBe(false);
    expect(result.reviewDetail).toContain("条目详情");
  }, 60_000);

  it("keeps a manually opened review usable when refreshing saved sessions fails, then retries from the preserved list", async () => {
    const result = await runScenario({
      initialStatus: "valid", action: "open-saved-review", failSessionListRefreshOnce: true,
      retryFromSavedSessionList: true,
      savedSessions: [{ sessionId: "session-kept", packageId: "package-kept" }],
    });
    expect(result.failedListRefreshView).toMatchObject({
      reviewHidden: false, leaveHidden: false,
      reviewEntryStatus: "复盘已打开，但暂时无法刷新已保存复盘列表，请重试。",
      sessionListText: expect.stringContaining("牌谱复盘 · 保存于 2026-10-01"),
    });
    expect(result.afterLeaveView).toMatchObject({
      reviewHidden: true, leaveHidden: true, reviewEntryStatus: "已离开整盘复盘。",
      sessionListText: expect.stringContaining("牌谱复盘 · 保存于 2026-10-01"),
    });
    expect(result.reviewCalls).toEqual({ paipuImport: 0, openReview: 2, detail: 1 });
    expect(result.sessionCalls).toEqual({ listReviewSessions: 3, leaveReview: 1 });
    expect(result.reviewHidden).toBe(false);
    expect(result.leaveHidden).toBe(false);
    expect(result.reviewEntryStatus).toBe("已打开整盘复盘。");
    expect(result.reviewOverview).toContain("整盘复盘");
    expect(result.reviewListHidden).toBe(false);
    expect(result.reviewDetail).toContain("条目详情");
  }, 60_000);

  it("keeps automatic share-import navigation after a saved-session refresh failure", async () => {
    const result = await runScenario({
      initialStatus: "valid", action: "paipu-import", failSessionListRefreshOnce: true,
      retryFromSavedSessionList: true,
      savedSessions: [{ sessionId: "session-kept", packageId: "package-kept" }],
      paipuResult: {
        status: "review_ready", recordId: record.recordId, sessionId: "session-imported",
        packageId: "package-imported", canonicalEventCount: 12, replayDecisionCount: 4,
      },
    });
    expect(result.failedListRefreshView).toMatchObject({
      reviewHidden: false, leaveHidden: false,
      reviewEntryStatus: "复盘已打开，但暂时无法刷新已保存复盘列表，请重试。",
      sessionListText: expect.stringContaining("牌谱复盘 · 保存于 2026-10-01"),
    });
    expect(result.afterLeaveView).toMatchObject({
      reviewHidden: true, leaveHidden: true, reviewEntryStatus: "已离开整盘复盘。",
      sessionListText: expect.stringContaining("牌谱复盘 · 保存于 2026-10-01"),
    });
    expect(result.reviewCalls).toEqual({ paipuImport: 1, openReview: 2, detail: 1 });
    expect(result.sessionCalls).toEqual({ listReviewSessions: 3, leaveReview: 1 });
    expect(result.paipuStatus).toContain("牌谱已生成复盘");
    expect(result.reviewHidden).toBe(false);
    expect(result.leaveHidden).toBe(false);
    expect(result.reviewEntryStatus).toBe("已打开整盘复盘。");
    expect(result.reviewOverview).toContain("整盘复盘");
    expect(result.reviewListHidden).toBe(false);
    expect(result.reviewDetail).toContain("条目详情");
  }, 60_000);

  it("keeps the visible safe alert and manual status when the review itself cannot open", async () => {
    const result = await runScenario({
      initialStatus: "valid", action: "open-saved-review", reviewOpen: "failed",
      savedSessions: [{ sessionId: "session-kept", packageId: "package-kept" }],
    });
    expect(result.reviewCalls).toEqual({ paipuImport: 0, openReview: 1, detail: 0 });
    expect(result.sessionCalls).toEqual({ listReviewSessions: 1, leaveReview: 0 });
    expect(result.reviewHidden).toBe(false);
    expect(result.leaveHidden).toBe(true);
    expect(result.reviewAlert).toBe("无法打开整盘复盘，请稍后再试。");
    expect(result.reviewOverview).toBe(null);
    expect(result.reviewListHidden).toBe(null);
    expect(result.reviewDetail).toBe(null);
    expect(result.sourceHidden).toBe(false);
    expect(result.reviewEntryStatus).toBe("无法打开该分析包，请确认引用有效。");
    expect(result.reviewSessionListText).toContain("牌谱复盘 · 保存于 2026-10-01");
    expect(result.reviewSessionListText).not.toContain("package-kept");
  }, 60_000);

  it("keeps the source page when opening a saved review fails", async () => {
    const result = await runScenario({
      initialStatus: "valid", action: "paipu-import", reviewOpen: "failed",
      paipuResult: {
        status: "review_ready", recordId: record.recordId, sessionId: "session-verified",
        packageId: "package-verified", canonicalEventCount: 12, replayDecisionCount: 4,
      },
    });
    expect(result.reviewCalls).toEqual({ paipuImport: 1, openReview: 1, detail: 0 });
    expect(result.reviewOverview).toBe(null);
    expect(result.reviewDetail).toBe(null);
    expect(result.reviewHidden).toBe(true);
    expect(result.reviewText).toBe("");
    expect(result.sourceHidden).toBe(false);
    expect(result.leaveHidden).toBe(true);
    expect(result.paipuStatus).toContain("复盘已保存，但暂时无法打开");
  }, 60_000);

  it("retries the saved package after an automatic open failure without importing again", async () => {
    const result = await runScenario({
      initialStatus: "valid", action: "paipu-import", reviewOpen: "failed_once",
      retrySavedReview: true,
      paipuResult: {
        status: "review_ready", recordId: record.recordId, sessionId: "session-verified",
        packageId: "package-verified", canonicalEventCount: 12, replayDecisionCount: 4,
      },
    });
    expect(result.failedOpenView).toEqual({
      reviewHidden: true, reviewText: "", sourceHidden: false, leaveHidden: true,
    });
    expect(result.reviewCalls).toEqual({ paipuImport: 1, openReview: 2, detail: 1 });
    expect(result.reviewHidden).toBe(false);
    expect(result.leaveHidden).toBe(false);
    expect(result.reviewEntryStatus).toBe("已打开整盘复盘。");
    expect(result.reviewOverview).toContain("整盘复盘");
    expect(result.reviewListHidden).toBe(false);
    expect(result.reviewDetail).toContain("条目详情");
  }, 60_000);

  it("keeps the source page when production analysis fails", async () => {
    const result = await runScenario({
      initialStatus: "valid", action: "paipu-import",
      paipuResult: { status: "analysis_failed" },
    });
    expect(result.reviewCalls).toEqual({ paipuImport: 1, openReview: 0, detail: 0 });
    expect(result.reviewOverview).toBe(null);
    expect(result.reviewDetail).toBe(null);
    expect(result.paipuStatus).toContain("解析未完成");
  }, 60_000);
});
