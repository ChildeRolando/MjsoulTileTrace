import type { MahjongSoulDesktopApi } from "../session-api.js";
import type { MahjongSoulCatalogApi } from "../catalog-api.js";
import type { MahjongSoulPaipuApi } from "../paipu-import-api.js";
import type { MahjongSoulSessionStatus } from "@riichi-coach/contracts";
import { sessionUiPolicy } from "./session-ui-policy.js";
import {
  paipuImportStatusLabel,
  paipuImportUiStateFromResult,
  paipuShareUrlLooksValid,
} from "./paipu-ui-policy.js";

declare global {
  interface Window {
    readonly riichiCoach: MahjongSoulDesktopApi;
    readonly riichiCoachCatalog: MahjongSoulCatalogApi;
    readonly riichiCoachPaipu: MahjongSoulPaipuApi;
  }
}

const statusElement = document.querySelector<HTMLElement>("#status")!;
const detailElement = document.querySelector<HTMLElement>("#detail")!;
const loginButton = document.querySelector<HTMLButtonElement>("#login")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh")!;
const syncButton = document.querySelector<HTMLButtonElement>("#sync")!;
const catalogSection = document.querySelector<HTMLElement>(".catalog")!;
const catalogDetailElement = document.querySelector<HTMLElement>("#catalog-detail")!;
const catalogListElement = document.querySelector<HTMLElement>("#catalog-list")!;
const paipuSection = document.querySelector<HTMLElement>(".paipu-import")!;
const paipuUrlInput = document.querySelector<HTMLInputElement>("#paipu-url")!;
const paipuSeatSelect = document.querySelector<HTMLSelectElement>("#paipu-self-actor")!;
const paipuImportButton = document.querySelector<HTMLButtonElement>("#paipu-import")!;
const paipuStatusElement = document.querySelector<HTMLElement>("#paipu-status")!;
const buttons = [loginButton, logoutButton, refreshButton, syncButton, paipuImportButton];
let currentSessionStatus: MahjongSoulSessionStatus["status"] = "logged_out";

function setPending(pending: boolean): void {
  for (const button of buttons) button.disabled = pending;
}

function applySessionState(status: MahjongSoulSessionStatus["status"]): void {
  const loggedIn = status === "valid" || status === "offline_unverified";
  const busy = status === "authenticating" || status === "session_validating";
  const policy = sessionUiPolicy(status);
  currentSessionStatus = status;
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
  catalogListElement.textContent = "";
  const notice = sessionUiPolicy(currentSessionStatus).catalogNotice;
  if (summaries.length === 0) {
    catalogDetailElement.textContent = notice ?? "暂无可分析的四人南风对局。";
    return;
  }
  catalogDetailElement.textContent = notice === null
    ? `共 ${summaries.length} 场可分析对局。`
    : `${notice} 缓存中有 ${summaries.length} 场可分析对局。`;
  for (const entry of summaries) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const scores = entry.players.map((player) => player.displayName).join(" / ");
    const self = entry.players[entry.selfSeat];
    const label = `${formatStartedAt(entry.startedAt)} · 你为 ${self?.displayName ?? "?"}（${scores}）`;
    const text = document.createElement("span");
    text.textContent = label;
    button.type = "button";
    button.textContent = "分析";
    button.addEventListener("click", () => {
      void (async () => {
        setPending(true);
        try {
          await window.riichiCoachCatalog.startRecordAnalysis(entry.recordId);
          catalogDetailElement.textContent = "牌谱已取得并完成基础解码。";
        } catch {
          catalogDetailElement.textContent = "暂时无法取得或解析这场牌谱。";
        } finally { setPending(false); }
      })();
    });
    item.append(text, button);
    item.title = entry.shareUrl;
    catalogListElement.appendChild(item);
  }
}

async function refreshCatalog(): Promise<void> {
  try {
    renderCatalog(await window.riichiCoachCatalog.listAnalyzableRecords());
  } catch {
    catalogDetailElement.textContent = "暂无可分析的四人南风对局。";
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
  } catch {
    catalogDetailElement.textContent = "无法同步牌谱，请确认已登录雀魂。";
  } finally {
    setPending(false);
  }
}

loginButton.addEventListener("click", () => {
  void (async () => {
    const status = await run(() => window.riichiCoach.openMahjongSoulLogin());
    if (status === "valid" || status === "offline_unverified") await refreshCatalog();
  })();
});
logoutButton.addEventListener("click", () => void run(() => window.riichiCoach.logoutMahjongSoul()));
refreshButton.addEventListener("click", () => void run(() => window.riichiCoach.getSessionStatus()));
syncButton.addEventListener("click", () => void runSync());

function setPaipuPending(pending: boolean): void {
  paipuImportButton.disabled = pending;
  paipuUrlInput.disabled = pending;
  paipuSeatSelect.disabled = pending;
  if (pending) {
    paipuStatusElement.textContent = paipuImportStatusLabel({ state: "pending" });
  }
}

paipuImportButton.addEventListener("click", () => {
  void (async () => {
    // Client-side pre-checks keep typos from opening a window at all; the
    // main process re-validates everything regardless.
    const shareUrl = paipuUrlInput.value.trim();
    if (!paipuShareUrlLooksValid(shareUrl)) {
      paipuStatusElement.textContent = paipuImportStatusLabel({ state: "invalid_url" });
      return;
    }
    const seat = paipuSeatSelect.value;
    const selfActor = seat === "0" || seat === "1" || seat === "2" || seat === "3"
      ? (Number(seat) as 0 | 1 | 2 | 3)
      : null;
    if (selfActor === null) {
      paipuStatusElement.textContent = paipuImportStatusLabel({ state: "invalid_self_actor" });
      return;
    }
    setPaipuPending(true);
    try {
      const result = await window.riichiCoachPaipu.importPaipu({ shareUrl, selfActor });
      paipuStatusElement.textContent = paipuImportStatusLabel(
        paipuImportUiStateFromResult(result),
      );
    } catch {
      paipuStatusElement.textContent = paipuImportStatusLabel({ state: "failed" });
    } finally {
      setPaipuPending(false);
    }
  })();
});

void (async () => {
  const status = await run(() => window.riichiCoach.getSessionStatus());
  if (status === "valid" || status === "offline_unverified") await refreshCatalog();
})();
