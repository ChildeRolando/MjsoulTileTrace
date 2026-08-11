import type { MahjongSoulDesktopApi } from "../session-api.js";

declare global {
  interface Window { readonly riichiCoach: MahjongSoulDesktopApi; }
}

const statusElement = document.querySelector<HTMLElement>("#status")!;
const detailElement = document.querySelector<HTMLElement>("#detail")!;
const loginButton = document.querySelector<HTMLButtonElement>("#login")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh")!;
const buttons = [loginButton, logoutButton, refreshButton];

function setPending(pending: boolean): void {
  for (const button of buttons) button.disabled = pending;
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
void run(() => window.riichiCoach.getSessionStatus());
