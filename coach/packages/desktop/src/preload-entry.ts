import { contextBridge, ipcRenderer } from "electron";

// The sandboxed preload cannot resolve bare npm package specifiers or Node
// builtins like `node:crypto`. This entry must stay self-contained: only the
// `electron` module, inline channel names, and a light renderer-side validation
// that rejects credential-bearing fields. The main process performs the full
// zod validation before returning anything over IPC; this is defense in depth.

export const PRELOAD_CHANNELS = Object.freeze({
  getStatus: "mahjong-soul:get-session-status",
  openLogin: "mahjong-soul:open-login",
  logout: "mahjong-soul:logout",
  syncRecords: "mahjong-soul:sync-analyzable-records",
  listRecords: "mahjong-soul:list-analyzable-records",
} as const);

const ERROR_CODES: ReadonlySet<string> = new Set([
  "mahjong_soul_login_protocol_unsupported",
  "mahjong_soul_session_invalid",
  "mahjong_soul_session_storage_unavailable",
  "mahjong_soul_catalog_sync_failed",
  "mahjong_soul_record_not_analyzable",
  "mahjong_soul_record_fetch_failed",
  "unsupported_mahjong_soul_record_version",
  "mahjong_soul_record_identity_mismatch",
  "mahjong_soul_canonical_mapping_failed",
  "mahjong_soul_canonical_validation_failed",
]);

const SESSION_STATUSES: ReadonlySet<string> = new Set([
  "logged_out",
  "authenticating",
  "session_validating",
  "valid",
  "offline_unverified",
]);

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "accessToken",
  "accountId",
  "cookie",
  "authorization",
  "rawFrame",
  "token",
  "downloadUrl",
  "rawRecord",
  "endpoint",
]);

const PROTOCOL_ERROR = "mahjong_soul_login_protocol_unsupported";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fixedError(error: unknown): Error {
  if (error instanceof Error && ERROR_CODES.has(error.message)) {
    return new Error(error.message);
  }
  return new Error(PROTOCOL_ERROR);
}

export function assertSafeSessionStatus(value: unknown): unknown {
  if (
    !isRecord(value)
    || value.region !== "cn"
    || typeof value.status !== "string"
    || !SESSION_STATUSES.has(value.status)
  ) {
    throw new Error(PROTOCOL_ERROR);
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(PROTOCOL_ERROR);
  }
  return value;
}

export function assertSafeSummaries(value: unknown): unknown {
  if (!Array.isArray(value)) throw new Error(PROTOCOL_ERROR);
  for (const entry of value) {
    if (!isRecord(entry)) throw new Error(PROTOCOL_ERROR);
    for (const key of Object.keys(entry)) {
      if (FORBIDDEN_KEYS.has(key)) throw new Error(PROTOCOL_ERROR);
    }
  }
  return value;
}

async function invokeSession(channel: string): Promise<unknown> {
  try {
    return assertSafeSessionStatus(await ipcRenderer.invoke(channel));
  } catch (error) {
    throw fixedError(error);
  }
}

async function invokeCatalog(channel: string): Promise<unknown> {
  try {
    return assertSafeSummaries(await ipcRenderer.invoke(channel));
  } catch (error) {
    throw fixedError(error);
  }
}

contextBridge.exposeInMainWorld("riichiCoach", Object.freeze({
  getSessionStatus: () => invokeSession(PRELOAD_CHANNELS.getStatus),
  openMahjongSoulLogin: () => invokeSession(PRELOAD_CHANNELS.openLogin),
  logoutMahjongSoul: () => invokeSession(PRELOAD_CHANNELS.logout),
}));

contextBridge.exposeInMainWorld("riichiCoachCatalog", Object.freeze({
  syncAnalyzableRecords: () => invokeCatalog(PRELOAD_CHANNELS.syncRecords),
  listAnalyzableRecords: () => invokeCatalog(PRELOAD_CHANNELS.listRecords),
}));
