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
