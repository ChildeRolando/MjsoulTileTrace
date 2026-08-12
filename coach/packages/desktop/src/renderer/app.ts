import type { MahjongSoulDesktopApi } from "../session-api.js";
import type { MahjongSoulCatalogApi } from "../catalog-api.js";

declare global {
  interface Window {
    readonly riichiCoach: MahjongSoulDesktopApi;
    readonly riichiCoachCatalog: MahjongSoulCatalogApi;
  }
}

const statusElement = document.querySelector<HTMLElement>("#status")!;
const detailElement = document.querySelector<HTMLElement>("#detail")!;
const loginButton = document.querySelector<HTMLButtonElement>("#login")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh")!;
const syncButton = document.querySelector<HTMLButtonElement>("#sync")!;
const catalogDetailElement = document.querySelector<HTMLElement>("#catalog-detail")!;
const catalogListElement = document.querySelector<HTMLElement>("#catalog-list")!;
const buttons = [loginButton, logoutButton, refreshButton, syncButton];

function setPending(pending: boolean): void {
  for (const button of buttons) button.disabled = pending;
}

function formatStartedAt(startedAt: number): string {
  const date = new Date(startedAt * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderCatalog(
  summaries: ReturnType<MahjongSoulCatalogApi["listAnalyzableRecords"]> extends Promise<infer T> ? T : never,
): void {
  catalogListElement.textContent = "";
  if (summaries.length === 0) {
    catalogDetailElement.textContent = "暂无可分析的四人南风对局。";
    return;
  }
  catalogDetailElement.textContent = `共 ${summaries.length} 场可分析对局。`;
  for (const entry of summaries) {
    const item = document.createElement("li");
    const scores = entry.players.map((player) => player.displayName).join(" / ");
    const self = entry.players[entry.selfSeat];
    const label = `${formatStartedAt(entry.startedAt)} · 你为 ${self?.displayName ?? "?"}（${scores}）`;
    item.textContent = label;
    item.title = entry.shareUrl;
    catalogListElement.appendChild(item);
  }
}

async function runCatalog(operation: () => ReturnType<MahjongSoulCatalogApi["listAnalyzableRecords"]>): Promise<void> {
  setPending(true);
  try {
    renderCatalog(await operation());
  } catch {
    catalogDetailElement.textContent = "无法同步牌谱，请确认已登录雀魂。";
  } finally {
    setPending(false);
  }
}

async function run(operation: () => ReturnType<MahjongSoulDesktopApi["getSessionStatus"]>): Promise<void> {
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
  } catch {
    statusElement.textContent = "操作未完成";
    detailElement.textContent = "请检查网络或系统凭据存储后重试。";
  } finally {
    setPending(false);
  }
}

loginButton.addEventListener("click", () => void run(() => window.riichiCoach.openMahjongSoulLogin()));
logoutButton.addEventListener("click", () => void run(() => window.riichiCoach.logoutMahjongSoul()));
refreshButton.addEventListener("click", () => void run(() => window.riichiCoach.getSessionStatus()));
syncButton.addEventListener("click", () => void runCatalog(() => window.riichiCoachCatalog.syncAnalyzableRecords()));
void run(() => window.riichiCoach.getSessionStatus());
void runCatalog(() => window.riichiCoachCatalog.listAnalyzableRecords());
