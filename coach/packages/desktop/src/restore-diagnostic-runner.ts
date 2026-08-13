import {
  diagnoseMahjongSoulIndependentRestore,
  type MahjongSoulLobbySession,
  type MahjongSoulRestoreDiagnosticResult,
} from "@riichi-coach/mahjong-soul-source";
import type {
  ElectronMahjongSoulLoginProvider,
} from "./mahjong-soul-login-window.js";

export type ElectronRestoreDiagnosticStatus =
  | MahjongSoulRestoreDiagnosticResult["status"]
  | "login_rejected"
  | "login_cancelled"
  | "login_capture_unverified"
  | "login_capture_failed";

export type ElectronRestoreDiagnosticResult = Readonly<{
  readonly status: ElectronRestoreDiagnosticStatus;
}>;

function result(status: ElectronRestoreDiagnosticStatus): ElectronRestoreDiagnosticResult {
  return Object.freeze({ status });
}

export function restoreDiagnosticExitCode(status: ElectronRestoreDiagnosticStatus): number {
  switch (status) {
    case "independent_restore_verified": return 0;
    case "login_cancelled": return 10;
    case "login_rejected": return 11;
    case "login_capture_unverified": return 12;
    case "login_capture_failed": return 13;
    case "session_create_failed": return 20;
    case "oauth2_check_call_failed": return 21;
    case "oauth2_check_rejected": return 22;
    case "oauth2_login_call_failed": return 23;
    case "oauth2_login_rejected": return 24;
    case "identity_mismatch": return 25;
    case "fetch_info_call_failed": return 26;
    case "catalog_probe_call_failed": return 27;
    case "catalog_probe_rejected": return 28;
    case "inconclusive": return 29;
  }
}

export async function runMahjongSoulRestoreDiagnostic(input: {
  readonly loginProvider: ElectronMahjongSoulLoginProvider;
  readonly createSession: () => Promise<MahjongSoulLobbySession>;
  readonly now: () => number;
}): Promise<ElectronRestoreDiagnosticResult> {
  let captured: Awaited<ReturnType<ElectronMahjongSoulLoginProvider["run"]>>;
  try {
    captured = await input.loginProvider.run({ mode: "diagnostic" });
  } catch {
    return result("login_capture_failed");
  }
  if (captured.status === "rejected") return result("login_rejected");
  if (captured.status === "cancelled") return result("login_cancelled");
  if (captured.status !== "authenticated") return result("login_capture_unverified");
  return await diagnoseMahjongSoulIndependentRestore({
    credential: captured.credential,
    createSession: input.createSession,
    now: input.now,
  });
}
