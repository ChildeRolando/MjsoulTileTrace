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
  | "login_cancelled";

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
  try {
    const captured = await input.loginProvider.run({ mode: "diagnostic" });
    if (captured.status === "rejected") return result("login_rejected");
    if (captured.status === "cancelled") return result("login_cancelled");
    if (captured.status !== "authenticated") return result("inconclusive");
    return await diagnoseMahjongSoulIndependentRestore({
      credential: captured.credential,
      createSession: input.createSession,
      now: input.now,
    });
  } catch {
    return result("inconclusive");
  }
}
