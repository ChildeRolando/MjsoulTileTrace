import {
  classifyRestoreResponseError,
  createOAuth2LoginPayload,
} from "./restore-diagnostic.js";
import type {
  MahjongSoulLoginProviderResult,
  MahjongSoulSessionRestorer,
} from "./session-controller.js";
import type { MahjongSoulLobbySession } from "./lobby-session.js";
import type { StoredMahjongSoulSession } from "./session-vault.js";

function isPositiveUint32(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value > 0
    && value <= 0xffff_ffff;
}

export async function authenticateStoredMahjongSoulSession(
  lobby: MahjongSoulLobbySession,
  session: StoredMahjongSoulSession,
): Promise<"authenticated" | "rejected" | "unverified"> {
  try {
    const check = await lobby.call(".lq.Lobby.oauth2Check", {
      type: session.authType,
      access_token: session.accessToken.reveal(),
    });
    const checkError = classifyRestoreResponseError(check);
    if (checkError === "rejected" || check.has_account === false) return "rejected";
    if (checkError !== "success" || check.has_account !== true) return "unverified";
    const login = await lobby.call(
      ".lq.Lobby.oauth2Login",
      createOAuth2LoginPayload(session),
    );
    const loginError = classifyRestoreResponseError(login);
    if (loginError === "rejected") return "rejected";
    if (loginError !== "success" || !isPositiveUint32(login.account_id)) return "unverified";
    if (login.account_id !== session.accountId) return "rejected";
    return "authenticated";
  } catch {
    return "unverified";
  }
}

export function createMahjongSoulOAuth2SessionRestorer(input: {
  readonly createSession: () => Promise<MahjongSoulLobbySession>;
}): MahjongSoulSessionRestorer {
  const createSession = input.createSession;
  return Object.freeze({
    async restore(session: StoredMahjongSoulSession): Promise<MahjongSoulLoginProviderResult> {
      let lobby: MahjongSoulLobbySession | null = null;
      try {
        lobby = await createSession();
        const status = await authenticateStoredMahjongSoulSession(lobby, session);
        if (status !== "authenticated") return Object.freeze({ status });
        return Object.freeze({ status: "authenticated" as const, credential: session });
      } catch {
        return Object.freeze({ status: "unverified" as const });
      } finally {
        if (lobby !== null) await lobby.close().catch(() => undefined);
      }
    },
  });
}
