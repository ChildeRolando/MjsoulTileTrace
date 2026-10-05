import type { MahjongSoulDesktopApi } from "../session-api.js";
import type { MahjongSoulCatalogApi } from "../catalog-api.js";
import type { RecordAnalysisSnapshot } from "../catalog-api.js";
import type { MahjongSoulPaipuApi } from "../paipu-import-api.js";
import type { MahjongSoulSessionStatus, RecordLabel } from "@riichi-coach/contracts";
import { sessionUiPolicy } from "./session-ui-policy.js";
import {
  paipuImportStatusLabel,
  paipuImportUiStateFromResult,
  paipuShareUrlLooksValid,
} from "./paipu-ui-policy.js";
import { createFixedReviewUi } from "./fixed-review-ui.js";
import { recordLabelView } from "./record-label.js";
import type { CoachDesktopApi } from "@riichi-coach/contracts";

declare global {
  interface Window {
    readonly riichiCoach: MahjongSoulDesktopApi;
    readonly riichiCoachCatalog: MahjongSoulCatalogApi;
    readonly riichiCoachPaipu: MahjongSoulPaipuApi;
    readonly riichiCoachProvider: CoachDesktopApi;
  }
}

const statusElement = document.querySelector<HTMLElement>("#status")!;
const detailElement = document.querySelector<HTMLElement>("#detail")!;
const loginButton = document.querySelector<HTMLButtonElement>("#login")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh")!;
const syncButton = document.querySelector<HTMLButtonElement>("#sync")!;
const clearSourceCacheButton = document.querySelector<HTMLButtonElement>("#clear-source-cache")!;
const catalogSection = document.querySelector<HTMLElement>(".catalog")!;
const catalogDetailElement = document.querySelector<HTMLElement>("#catalog-detail")!;
const catalogListElement = document.querySelector<HTMLElement>("#catalog-list")!;
const catalogPaginationElement = document.querySelector<HTMLElement>("#catalog-pagination")!;
const catalogPreviousButton = document.querySelector<HTMLButtonElement>("#catalog-page-previous")!;
const catalogNextButton = document.querySelector<HTMLButtonElement>("#catalog-page-next")!;
const catalogPaginationStatus = document.querySelector<HTMLElement>("#catalog-pagination-status")!;
const analysisProgressElement = document.querySelector<HTMLElement>("#analysis-progress")!;
const analysisProgressLabel = document.querySelector<HTMLElement>("#analysis-progress-label")!;
const analysisProgressBar = document.querySelector<HTMLProgressElement>("#analysis-progress-bar")!;
const analysisProgressEstimate = document.querySelector<HTMLElement>("#analysis-progress-estimate")!;
const analysisProgressSummary = document.querySelector<HTMLElement>("#analysis-progress-summary")!;
const analysisProgressSteps = document.querySelector<HTMLOListElement>("#analysis-progress-steps")!;
const paipuSection = document.querySelector<HTMLElement>(".paipu-import")!;
const paipuUrlInput = document.querySelector<HTMLInputElement>("#paipu-url")!;
const paipuImportButton = document.querySelector<HTMLButtonElement>("#paipu-import")!;
const paipuStatusElement = document.querySelector<HTMLElement>("#paipu-status")!;
const buttons = [loginButton, logoutButton, refreshButton, syncButton, clearSourceCacheButton, paipuImportButton];
const reviewRoot = document.querySelector<HTMLElement>("#fixed-review")!;
const reviewPackageIdInput = document.querySelector<HTMLInputElement>("#review-package-id")!;
const openReviewButton = document.querySelector<HTMLButtonElement>("#open-review")!;
const leaveReviewButton = document.querySelector<HTMLButtonElement>("#leave-review")!;
const reviewEntryStatus = document.querySelector<HTMLElement>("#review-entry-status")!;
const reviewSessionList = document.querySelector<HTMLElement>("#review-session-list")!;
const reviewSessionPaginationElement = document.querySelector<HTMLElement>("#review-session-pagination")!;
const reviewSessionPreviousButton = document.querySelector<HTMLButtonElement>("#review-session-page-previous")!;
const reviewSessionNextButton = document.querySelector<HTMLButtonElement>("#review-session-page-next")!;
const reviewSessionPaginationStatus = document.querySelector<HTMLElement>("#review-session-pagination-status")!;
export const fixedReviewUi = createFixedReviewUi({
  document, root: reviewRoot, api: window.riichiCoachProvider,
  onReportGenerated: () => {
    void refreshReviewSessions().catch(() => {
      reviewEntryStatus.textContent = "教练解说已生成，暂时无法刷新已保存复盘列表。";
    });
  },
});
let currentSessionStatus: MahjongSoulSessionStatus["status"] = "logged_out";
let operationPending = false;
const RECORDS_PER_PAGE = 8;
const ANALYSIS_STAGE_LABELS: Readonly<Record<Exclude<RecordAnalysisSnapshot["stage"], "idle" | "complete" | "failed">, string>> = {
  fetching: "读取牌谱", replaying: "重放牌谱", rules: "重放牌谱", scoring: "模型评分",
  facts: "计算教学分析", packaging: "整理分析档案", saving: "保存复盘",
};
const ANALYSIS_STEP_STATUS_LABELS = {
  waiting: "等待中", running: "进行中", complete: "已完成", skipped: "未执行", failed: "失败",
} as const;
const ESTIMATE_SOURCE_LABELS = { learning: "本机参考尚在建立", history: "根据本机历史分析", current_rate: "根据当前分析速度" } as const;
const ANALYSIS_STAGES = ["fetching", "replaying", "rules", "scoring", "facts", "packaging", "saving"] as const;
let catalogSummaries: readonly import("@riichi-coach/contracts").AnalyzableRecordSummary[] = [];
let catalogHasLoaded = false;
let catalogPage = 1;
let reviewSessions: Awaited<ReturnType<CoachDesktopApi["listReviewSessions"]>> = [];
let reviewSessionPage = 1;
let reviewSessionRefreshInFlight: Promise<void> | null = null;
let mortalLabelPollTimer: number | null = null;
let analysisProgressRun = 0;
let analysisProgressPollInFlight = false;
let queuedAnalysisProgressPolls: { run: number; terminal: boolean; request: () => void }[] = [];
let activeAnalysisProgressRequest: (() => void) | null = null;

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}

function initialAnalysisSnapshot(): RecordAnalysisSnapshot {
  return {
    stage: "fetching", completed: 0, total: null, elapsedMs: 0,
    estimatedTotalMs: null, remainingMs: null, estimateSource: "learning",
    steps: ANALYSIS_STAGES.map((stage, index) => ({
      stage, status: index === 0 ? "running" : "waiting", completed: 0, total: null, elapsedMs: 0,
    })),
  };
}

// Native rule preparation is part of replay, not a second action validator.
// Keep operational timing/history intact while presenting one replay step.
function visibleAnalysisSteps(snapshot: RecordAnalysisSnapshot): RecordAnalysisSnapshot["steps"] {
  const replay = snapshot.steps.find(step => step.stage === "replaying")!;
  const rules = snapshot.steps.find(step => step.stage === "rules")!;
  const usesRulesProgress = rules.status !== "waiting" && rules.status !== "skipped";
  return snapshot.steps.filter(step => step.stage !== "rules").map(step => step.stage === "replaying" ? {
    ...step,
    status: usesRulesProgress ? rules.status : replay.status,
    completed: usesRulesProgress ? rules.completed : replay.completed,
    total: usesRulesProgress ? rules.total : replay.total,
    elapsedMs: replay.elapsedMs + rules.elapsedMs,
  } : step);
}

function renderAnalysisProgress(snapshot: RecordAnalysisSnapshot): void {
  const activeLabel = snapshot.stage === "idle" ? "等待开始"
    : snapshot.stage === "complete" ? "整盘分析已完成"
      : snapshot.stage === "failed" ? "整盘分析未完成"
        : `正在进行${ANALYSIS_STAGE_LABELS[snapshot.stage]}`;
  const counts = snapshot.total === null ? "" : ` · ${snapshot.completed}/${snapshot.total}`;
  analysisProgressLabel.textContent = `${activeLabel}${counts} · 总用时 ${formatDuration(snapshot.elapsedMs)}`;
  if (snapshot.stage !== "idle" && snapshot.stage !== "complete" && snapshot.stage !== "failed"
    && snapshot.total !== null && snapshot.total > 0) {
    analysisProgressBar.hidden = false;
    analysisProgressBar.max = snapshot.total;
    analysisProgressBar.value = snapshot.completed;
  } else {
    analysisProgressBar.hidden = true;
    analysisProgressBar.removeAttribute("value");
  }
  if (snapshot.estimatedTotalMs !== null && snapshot.remainingMs !== null) {
    analysisProgressEstimate.textContent = `预计总时长 ${formatDuration(snapshot.estimatedTotalMs)} · 预计剩余 ${formatDuration(snapshot.remainingMs)} · ${ESTIMATE_SOURCE_LABELS[snapshot.estimateSource]}`;
  } else {
    analysisProgressEstimate.textContent = `总用时 ${formatDuration(snapshot.elapsedMs)} · 正在建立本机参考，暂无法估算总时长和剩余时间。`;
  }
  const fragment = document.createDocumentFragment();
  for (const step of visibleAnalysisSteps(snapshot)) {
    const item = document.createElement("li");
    item.dataset.stage = step.stage;
    item.dataset.status = step.status;
    const name = document.createElement("span");
    name.className = "progress-step-name";
    name.textContent = ANALYSIS_STAGE_LABELS[step.stage];
    const state = document.createElement("span");
    state.className = "progress-step-state";
    const stepCounts = step.total === null ? "" : ` · ${step.completed}/${step.total}`;
    state.textContent = `${ANALYSIS_STEP_STATUS_LABELS[step.status]}${stepCounts}`;
    const elapsed = document.createElement("span");
    elapsed.className = "progress-step-time";
    elapsed.textContent = `耗时 ${formatDuration(step.elapsedMs)}`;
    item.append(name, state, elapsed);
    fragment.appendChild(item);
  }
  analysisProgressSteps.replaceChildren(fragment);
}

function watchAnalysisProgress(): (summary: string) => void {
  const run = ++analysisProgressRun;
  let stopped = false;
  const initial = initialAnalysisSnapshot();
  const enqueue = (terminal: boolean, request: () => void): void => {
    if (terminal) {
      queuedAnalysisProgressPolls = queuedAnalysisProgressPolls.filter(item => item.run !== run || item.terminal);
    }
    if (queuedAnalysisProgressPolls.some(item => item.run === run && item.terminal === terminal)) return;
    queuedAnalysisProgressPolls.push({ run, terminal, request });
  };
  const dispatchQueued = (): void => {
    const next = queuedAnalysisProgressPolls.shift();
    if (next === undefined) return;
    if (!next.terminal && next.run !== analysisProgressRun) {
      dispatchQueued();
      return;
    }
    next.request();
  };
  const poll = (terminal = false): void => {
    if (run !== analysisProgressRun || (stopped && !terminal)) return;
    if (analysisProgressPollInFlight) {
      enqueue(terminal, () => requestProgress(terminal));
      return;
    }
    void requestProgress(terminal);
  };
  const requestProgress = (terminal: boolean): void => {
    if ((run !== analysisProgressRun && !terminal) || (stopped && !terminal)) return;
    if (analysisProgressPollInFlight) {
      enqueue(terminal, () => requestProgress(terminal));
      return;
    }
    analysisProgressPollInFlight = true;
    void window.riichiCoachCatalog.getRecordAnalysisProgress().then(snapshot => {
      if (run === analysisProgressRun && (!stopped || terminal)) {
        renderAnalysisProgress(snapshot);
      }
    }).catch(() => undefined).finally(() => {
      analysisProgressPollInFlight = false;
      dispatchQueued();
    });
  };
  activeAnalysisProgressRequest = () => poll();
  analysisProgressElement.hidden = false;
  analysisProgressSummary.textContent = "已开始分析，正在读取主进程的阶段进度。";
  renderAnalysisProgress(initial);
  poll();
  const timer = window.setInterval(() => activeAnalysisProgressRequest?.(), 1000);
  return (summary: string) => {
    if (run !== analysisProgressRun) return;
    stopped = true;
    activeAnalysisProgressRequest = null;
    window.clearInterval(timer);
    analysisProgressSummary.textContent = summary;
    poll(true);
  };
}

function scheduleMortalLabelRefresh(): void {
  if (mortalLabelPollTimer !== null) {
    window.clearTimeout(mortalLabelPollTimer);
    mortalLabelPollTimer = null;
  }
  if (!reviewSessions.some(session => session.recordLabel?.mortalAgreementStatus === "pending")) return;
  mortalLabelPollTimer = window.setTimeout(() => {
    mortalLabelPollTimer = null;
    void refreshReviewSessions({ preservePage: true }).catch(() => scheduleMortalLabelRefresh());
  }, 5_000);
}

function refreshReviewSessions(options: { preservePage?: boolean } = {}): Promise<void> {
  if (reviewSessionRefreshInFlight !== null) return reviewSessionRefreshInFlight;
  const request = (async () => {
    reviewSessions = await window.riichiCoachProvider.listReviewSessions();
    if (options.preservePage !== true) reviewSessionPage = 1;
    renderReviewSessionPage();
    if (catalogHasLoaded) renderCatalogPage();
    scheduleMortalLabelRefresh();
  })();
  reviewSessionRefreshInFlight = request.finally(() => {
    reviewSessionRefreshInFlight = null;
  });
  return reviewSessionRefreshInFlight;
}

function renderReviewSessionPage(): void {
  const pageCount = Math.max(1, Math.ceil(reviewSessions.length / RECORDS_PER_PAGE));
  reviewSessionPage = Math.min(reviewSessionPage, pageCount);
  const start = (reviewSessionPage - 1) * RECORDS_PER_PAGE;
  const visibleSessions = reviewSessions.slice(start, start + RECORDS_PER_PAGE);
  const fragment = document.createDocumentFragment();
  for (const session of visibleSessions) {
    const item = document.createElement("li");
    const metadata = document.createElement("div");
    metadata.className = "saved-review-metadata";
    const label = document.createElement("span");
    label.className = "saved-review-title";
    const presentation = recordLabelView(session.recordLabel, session.updatedAt);
    label.textContent = `${presentation.title} · ${session.activeReportRefId === null ? "尚未生成教练解说" : "已有教练解说"}`;
    if (presentation.agreementDescription !== null) label.title = presentation.agreementDescription;
    const players = document.createElement("div");
    players.className = "saved-review-players";
    for (const player of presentation.players) {
      if (player.isSelf) {
        const strong = document.createElement("strong");
        strong.className = "saved-review-player saved-review-player-self";
        strong.title = "本人";
        strong.textContent = player.text;
        players.appendChild(strong);
      } else {
        const span = document.createElement("span");
        span.className = "saved-review-player";
        span.textContent = player.text;
        players.appendChild(span);
      }
    }
    metadata.append(label, players);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "打开";
    button.addEventListener("click", () => { reviewPackageIdInput.value = session.packageId; openReviewButton.click(); });
    item.append(metadata, button);
    fragment.appendChild(item);
  }
  if (reviewSessions.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "暂无已保存复盘。";
    fragment.appendChild(empty);
  }
  reviewSessionList.replaceChildren(fragment);
  reviewSessionPaginationElement.hidden = reviewSessions.length <= RECORDS_PER_PAGE;
  reviewSessionPaginationStatus.textContent = reviewSessions.length === 0
    ? "" : `第 ${reviewSessionPage} / ${pageCount} 页 · 共 ${reviewSessions.length} 条`;
  reviewSessionPreviousButton.disabled = operationPending || reviewSessionPage <= 1;
  reviewSessionNextButton.disabled = operationPending || reviewSessionPage >= pageCount;
}

function setPending(pending: boolean): void {
  operationPending = pending;
  for (const button of buttons) button.disabled = pending;
  for (const button of catalogListElement.querySelectorAll<HTMLButtonElement>("button")) button.disabled = pending;
  for (const button of reviewSessionList.querySelectorAll<HTMLButtonElement>("button")) button.disabled = pending;
  paipuUrlInput.disabled = pending;
  catalogSection.setAttribute("aria-busy", String(pending));
  catalogPreviousButton.disabled = pending || catalogPage <= 1;
  catalogNextButton.disabled = pending || catalogPage >= Math.max(1, Math.ceil(catalogSummaries.length / RECORDS_PER_PAGE));
  reviewSessionPreviousButton.disabled = pending || reviewSessionPage <= 1;
  reviewSessionNextButton.disabled = pending || reviewSessionPage >= Math.max(1, Math.ceil(reviewSessions.length / RECORDS_PER_PAGE));
}

function updateCatalogPagination(): void {
  const pageCount = Math.max(1, Math.ceil(catalogSummaries.length / RECORDS_PER_PAGE));
  catalogPage = Math.min(catalogPage, pageCount);
  catalogPaginationElement.hidden = catalogSummaries.length <= RECORDS_PER_PAGE;
  catalogPaginationStatus.textContent = catalogSummaries.length === 0
    ? "" : `第 ${catalogPage} / ${pageCount} 页 · 共 ${catalogSummaries.length} 场`;
  catalogPreviousButton.disabled = operationPending || catalogPage <= 1;
  catalogNextButton.disabled = operationPending || catalogPage >= pageCount;
}

function catalogAgreement(entry: import("@riichi-coach/contracts").AnalyzableRecordSummary): Pick<
  RecordLabel,
  "mortalAgreementStatus" | "mortalAgreement"
> {
  const canonicalId = `majsoul:${entry.recordId}`;
  const matches = reviewSessions.flatMap(session => {
    const label = session.recordLabel;
    return label?.recordId === canonicalId && label.selfSeat === entry.selfSeat
      ? [{ updatedAt: session.updatedAt, label }] : [];
  });
  if (matches.length === 0) return { mortalAgreementStatus: "not_applicable", mortalAgreement: null };
  matches.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const latestAt = matches[0]!.updatedAt;
  const latest = matches.filter(match => match.updatedAt === latestAt).map(match => match.label);
  const first = latest[0]!;
  const fingerprint = JSON.stringify({ status: first.mortalAgreementStatus, agreement: first.mortalAgreement });
  if (latest.some(label => JSON.stringify({ status: label.mortalAgreementStatus, agreement: label.mortalAgreement }) !== fingerprint)) {
    return { mortalAgreementStatus: "unavailable", mortalAgreement: null };
  }
  return { mortalAgreementStatus: first.mortalAgreementStatus, mortalAgreement: first.mortalAgreement };
}

function renderCatalogPage(): void {
  const pageCount = Math.max(1, Math.ceil(catalogSummaries.length / RECORDS_PER_PAGE));
  catalogPage = Math.min(catalogPage, pageCount);
  const fragment = document.createDocumentFragment();
  const start = (catalogPage - 1) * RECORDS_PER_PAGE;
  for (const entry of catalogSummaries.slice(start, start + RECORDS_PER_PAGE)) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const recordLabel: RecordLabel = {
      title: `${formatStartedAt(entry.startedAt)} · ${entry.rule.displayLabel}`,
      recordId: entry.recordId,
      selfSeat: entry.selfSeat,
      startedAt: entry.startedAt,
      players: entry.players,
      rankedMode: entry.rankedMode,
      ...catalogAgreement(entry),
    };
    const presentation = recordLabelView(recordLabel, "");
    const metadata = document.createElement("div");
    metadata.className = "catalog-record-metadata";
    const title = document.createElement("span");
    title.className = "catalog-record-title";
    title.textContent = presentation.title;
    if (presentation.agreementDescription !== null) title.title = presentation.agreementDescription;
    const players = document.createElement("div");
    players.className = "catalog-record-players";
    for (const player of presentation.players) {
      if (player.isSelf) {
        const strong = document.createElement("strong");
        strong.className = "catalog-record-player catalog-record-player-self";
        strong.title = "本人";
        strong.textContent = player.text;
        players.appendChild(strong);
      } else {
        const span = document.createElement("span");
        span.className = "catalog-record-player";
        span.textContent = player.text;
        players.appendChild(span);
      }
    }
    metadata.append(title, players);
    button.type = "button";
    button.textContent = "分析";
    button.disabled = operationPending;
    button.addEventListener("click", () => {
      if (operationPending) return;
      void (async () => {
        setPending(true);
        button.textContent = "分析中…";
        catalogDetailElement.textContent = "正在分析这场牌谱…整盘分析可能需要较长时间，请稍候。";
        const stopProgress = watchAnalysisProgress();
        let progressSummary = "分析未完成，阶段记录已保留；你可以重新尝试。";
        try {
          const result = await window.riichiCoachCatalog.startRecordAnalysis(entry.recordId);
          reviewPackageIdInput.value = result.packageId;
          progressSummary = "整盘分析已完成，复盘已保存。";
          try {
            await openReviewPackage(result.packageId);
            catalogDetailElement.textContent = "已打开整盘复盘。";
          } catch {
            await fixedReviewUi.leave().catch(() => undefined);
            catalogDetailElement.textContent = "复盘已保存，但暂时无法打开，请从已保存复盘重试。";
            progressSummary = "整盘分析已完成，复盘已保存；请从已保存复盘列表打开。";
          }
        } catch (error) {
          catalogDetailElement.textContent = error instanceof Error && error.message === "mahjong_soul_canonical_validation_failed"
            ? "这场牌谱未通过转换或重放校验，分析未完成。请保留牌谱并反馈此问题。"
            : "暂时无法分析这场牌谱，请重试。";
        } finally {
          stopProgress(progressSummary);
          button.textContent = "分析";
          setPending(false);
        }
      })();
    });
    item.append(metadata, button);
    item.title = entry.shareUrl;
    fragment.appendChild(item);
  }
  catalogListElement.replaceChildren(fragment);
  updateCatalogPagination();
}

catalogPreviousButton.addEventListener("click", () => {
  if (operationPending || catalogPage <= 1) return;
  catalogPage -= 1;
  renderCatalogPage();
});
catalogNextButton.addEventListener("click", () => {
  if (operationPending || catalogPage >= Math.ceil(catalogSummaries.length / RECORDS_PER_PAGE)) return;
  catalogPage += 1;
  renderCatalogPage();
});
reviewSessionPreviousButton.addEventListener("click", () => {
  if (operationPending || reviewSessionPage <= 1) return;
  reviewSessionPage -= 1;
  renderReviewSessionPage();
});
reviewSessionNextButton.addEventListener("click", () => {
  if (operationPending || reviewSessionPage >= Math.ceil(reviewSessions.length / RECORDS_PER_PAGE)) return;
  reviewSessionPage += 1;
  renderReviewSessionPage();
});

function applySessionState(status: MahjongSoulSessionStatus["status"]): void {
  const loggedIn = status === "valid" || status === "offline_unverified";
  const busy = status === "authenticating" || status === "session_validating";
  const policy = sessionUiPolicy(status, true);
  currentSessionStatus = status;
  loginButton.textContent = "登录雀魂";
  loginButton.hidden = status !== "logged_out";
  logoutButton.hidden = !loggedIn;
  refreshButton.hidden = busy;
  syncButton.hidden = !policy.allowSync;
  catalogSection.hidden = !policy.showCatalog;
  paipuSection.hidden = !policy.showPaipuImport;
  if (policy.catalogNotice !== null) catalogDetailElement.textContent = policy.catalogNotice;
}

function formatStartedAt(startedAt: number): string {
  const date = new Date(startedAt * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderCatalog(summaries: readonly import("@riichi-coach/contracts").AnalyzableRecordSummary[]): void {
  catalogSummaries = [...summaries];
  catalogHasLoaded = true;
  catalogPage = 1;
  const notice = sessionUiPolicy(currentSessionStatus).catalogNotice;
  if (summaries.length === 0) {
    catalogDetailElement.textContent = notice ?? "暂无可分析牌谱。";
  } else {
    catalogDetailElement.textContent = notice === null
      ? `共 ${summaries.length} 场可分析对局。`
      : `${notice} 缓存中有 ${summaries.length} 场可分析对局。`;
  }
  renderCatalogPage();
}

async function refreshCatalog(): Promise<void> {
  try {
    renderCatalog(await window.riichiCoachCatalog.listAnalyzableRecords());
  } catch {
    catalogDetailElement.textContent = "牌谱加载失败，请重试。";
  }
}

async function run(
  operation: () => ReturnType<MahjongSoulDesktopApi["getSessionStatus"]>,
): Promise<MahjongSoulSessionStatus["status"]> {
  setPending(true);
  try {
    const value = await operation();
    const labels = {
      logged_out: "尚未登录",
      authenticating: "等待你在雀魂完成登录",
      session_validating: "正在验证已保存的会话",
      valid: "账号已连接",
      offline_unverified: "离线：暂时无法验证会话",
    } as const;
    statusElement.textContent = labels[value.status];
    detailElement.textContent = value.status === "valid" || value.status === "offline_unverified"
      ? `${value.displayName} · 令牌仅保存在本机`
      : "令牌仅加密保存在这台设备上。";
    applySessionState(value.status);
    return value.status;
  } catch {
    statusElement.textContent = "操作未完成";
    detailElement.textContent = "请检查网络或系统凭据存储后重试。";
    return "logged_out" as const;
  } finally {
    setPending(false);
  }
}

async function runSync(): Promise<void> {
  setPending(true);
  try {
    renderCatalog(await window.riichiCoachCatalog.syncAnalyzableRecords());
    // Saved-review statistics are optional enrichment of a successfully synced catalog.
    await refreshReviewSessions({ preservePage: true }).catch(() => scheduleMortalLabelRefresh());
  } catch (error) {
    if (error instanceof Error && error.message === "mahjong_soul_session_invalid") {
      statusElement.textContent = "会话需要重新连接";
      detailElement.textContent = "本机保存的数据仍会保留。";
      catalogDetailElement.textContent = "当前雀魂会话无法恢复，请重新连接后再同步。";
      loginButton.textContent = "重新连接";
      loginButton.hidden = false;
      syncButton.hidden = true;
    } else {
      catalogDetailElement.textContent = "牌谱加载失败，请重试。";
    }
  } finally {
    setPending(false);
  }
}

loginButton.addEventListener("click", () => {
  void (async () => {
    const status = await run(() => window.riichiCoach.openMahjongSoulLogin());
    if (status === "valid") await runSync();
    else if (status === "offline_unverified") await refreshCatalog();
  })();
});
logoutButton.addEventListener("click", () => void run(() => window.riichiCoach.logoutMahjongSoul()));
refreshButton.addEventListener("click", () => {
  void (async () => {
    const status = await run(() => window.riichiCoach.getSessionStatus());
    if (status === "valid") await runSync();
    else if (status === "offline_unverified") await refreshCatalog();
  })();
});
syncButton.addEventListener("click", () => void runSync());
clearSourceCacheButton.addEventListener("click", () => {
  void (async () => {
    setPending(true);
    try {
      const result = await window.riichiCoachCatalog.clearSourceCache();
      catalogDetailElement.textContent = result.pendingMaterials === 0
        ? "来源缓存已清理。"
        : "部分来源缓存尚未清理完成，请稍后重试。";
    } catch { catalogDetailElement.textContent = "暂时无法清理来源缓存。"; }
    finally { setPending(false); }
  })();
});

async function openReviewPackage(packageId: string): Promise<void> {
    openReviewButton.disabled = true;
    leaveReviewButton.hidden = true;
    reviewEntryStatus.textContent = "正在打开整盘复盘…";
    try {
      try {
        await fixedReviewUi.open(packageId);
      } catch {
        leaveReviewButton.hidden = true;
        reviewEntryStatus.textContent = "无法打开该分析包，请确认引用有效。";
        throw new Error("review_unavailable");
      }
      reviewEntryStatus.textContent = "已打开整盘复盘。";
      leaveReviewButton.hidden = false;
      reviewRoot.scrollIntoView({ behavior: "smooth", block: "start" });
      try {
        await refreshReviewSessions();
      } catch {
        reviewEntryStatus.textContent = "复盘已打开，但暂时无法刷新已保存复盘列表，请重试。";
      }
    } finally {
      openReviewButton.disabled = false;
    }
}

openReviewButton.addEventListener("click", () => {
  void (async () => {
    const packageId = reviewPackageIdInput.value.trim();
    if (packageId === "") {
      reviewEntryStatus.textContent = "请输入分析包引用。";
      return;
    }
    await openReviewPackage(packageId).catch(() => undefined);
  })();
});
leaveReviewButton.addEventListener("click", () => {
  void fixedReviewUi.leave().then(() => {
    leaveReviewButton.hidden = true;
    reviewEntryStatus.textContent = "已离开整盘复盘。";
  }).catch(() => { reviewEntryStatus.textContent = "暂时无法离开复盘，请重试。"; });
});

function setPaipuPending(pending: boolean): void {
  paipuImportButton.disabled = pending;
  paipuUrlInput.disabled = pending;
  if (pending) {
    paipuStatusElement.textContent = paipuImportStatusLabel({ state: "pending" });
  }
}

paipuImportButton.addEventListener("click", () => {
  void (async () => {
    // Client-side pre-checks keep typos from opening a window at all; the
    // main process re-validates everything and resolves the perspective
    // automatically — no seat selection anywhere in the flow.
    const shareUrl = paipuUrlInput.value.trim();
    if (!paipuShareUrlLooksValid(shareUrl)) {
      paipuStatusElement.textContent = paipuImportStatusLabel({ state: "invalid_url" });
      return;
    }
    setPaipuPending(true);
    try {
      const result = await window.riichiCoachPaipu.importPaipu({ shareUrl });
      const uiState = paipuImportUiStateFromResult(result);
      paipuStatusElement.textContent = paipuImportStatusLabel(uiState);
      if (result.status === "review_ready") {
        // The verified main-process package/session identities are the only
        // navigation authority. The renderer hands packageId to the existing
        // Review Workspace; it never creates a second review path.
        reviewPackageIdInput.value = result.packageId;
        try {
          await openReviewPackage(result.packageId);
        } catch {
          // Roll back automatic navigation, preserving the main-owned saved
          // session. Manual opens retain their existing visible error state.
          await fixedReviewUi.leave().catch(() => undefined);
          paipuStatusElement.textContent = "复盘已保存，但暂时无法打开，请从已保存复盘重试。";
        }
      }
    } catch {
      paipuStatusElement.textContent = paipuImportStatusLabel({ state: "failed" });
    } finally {
      setPaipuPending(false);
    }
  })();
});

void (async () => {
  await refreshReviewSessions().catch(() => undefined);
  const status = await run(() => window.riichiCoach.getSessionStatus());
  if (status === "valid" || status === "offline_unverified") await refreshCatalog();
})();
