import {
  diagnoseMahjongSoulInlineRecord,
  type MahjongSoulLobbySession,
  type MahjongSoulInlineRecordResult,
  type MahjongSoulProtocolBundle,
} from "@riichi-coach/mahjong-soul-source";
import type {
  ElectronMahjongSoulLoginProvider,
} from "./mahjong-soul-login-window.js";

export type ElectronRestoreDiagnosticStatus =
  | MahjongSoulInlineRecordResult["status"]
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
    case "inline_record_verified": return 0;
    case "login_cancelled": return 10;
    case "login_rejected": return 11;
    case "login_capture_unverified": return 12;
    case "login_capture_failed": return 13;
    case "inconclusive": return 29;
    case "no_analyzable_record": return 30;
    case "record_data_url_not_supported": return 31;
    case "record_detail_rejected": return 32;
    case "record_container_unsupported": return 33;
    case "record_actions_empty": return 34;
  }
}

export async function runMahjongSoulRestoreDiagnostic(input: {
  readonly loginProvider: ElectronMahjongSoulLoginProvider;
  readonly createSession: () => Promise<MahjongSoulLobbySession>;
  readonly bundle: MahjongSoulProtocolBundle;
  readonly now: () => number;
  readonly diagnose?: typeof diagnoseMahjongSoulInlineRecord;
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
  const diagnose = input.diagnose ?? diagnoseMahjongSoulInlineRecord;
  const diagnosed = await diagnose({
    credential: captured.credential,
    bundle: input.bundle,
    createSession: input.createSession,
    now: input.now,
  });
  return result(diagnosed.status);
}
