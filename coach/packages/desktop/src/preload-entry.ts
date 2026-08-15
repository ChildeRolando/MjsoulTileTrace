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
  startAnalysis: "mahjong-soul:start-record-analysis",
  importPaipuUrl: "mahjong-soul:import-paipu-url",
} as const);

// Mirrors MahjongSoulSourceErrorCodeSchema from @riichi-coach/contracts —
// every fixed source error must pass through; anything else collapses to the
// protocol error so arbitrary Error.message strings never reach the page.
const ERROR_CODES: ReadonlySet<string> = new Set([
  "mahjong_soul_login_protocol_unsupported",
  "mahjong_soul_session_invalid",
  "mahjong_soul_session_storage_unavailable",
  "mahjong_soul_catalog_sync_failed",
  "mahjong_soul_record_not_analyzable",
  "mahjong_soul_record_fetch_failed",
  "unsupported_mahjong_soul_record_version",
  "mahjong_soul_record_identity_mismatch",
  "mahjong_soul_record_container_invalid",
  "mahjong_soul_canonical_mapping_failed",
  "mahjong_soul_canonical_validation_failed",
  "mahjong_soul_canonical_unsupported_semantics",
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

const PAIPU_IMPORT_STATUSES: ReadonlySet<string> = new Set([
  "analysis_ready",
  "invalid_url",
  "identity_mismatch",
  "no_capture",
  "unsupported_semantics",
  "analysis_failed",
]);

// The fixed safe result of a paipu-URL import: one of the fixed statuses,
// plus exactly {recordId, canonicalEventCount, replayDecisionCount} when
// ready. Record bytes, credentials, endpoints, account/perspective ids and
// raw payloads can never appear in this shape — and the seat never crosses
// (it is auto-resolved in the main process and is none of the renderer's
// business).
export function assertSafePaipuImportResult(value: unknown): unknown {
  if (
    !isRecord(value)
    || typeof value.status !== "string"
    || !PAIPU_IMPORT_STATUSES.has(value.status)
  ) {
    throw new Error(PROTOCOL_ERROR);
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(PROTOCOL_ERROR);
  }
  if (value.status === "analysis_ready") {
    const keys = Object.keys(value).sort();
    if (keys.length !== 4) throw new Error(PROTOCOL_ERROR);
    const recordId = value.recordId;
    const counts = [value.canonicalEventCount, value.replayDecisionCount];
    if (
      typeof recordId !== "string"
      || recordId.length === 0
      || recordId.length > 64
      || counts.some((count) =>
        typeof count !== "number"
        || !Number.isInteger(count)
        || count < 0
        || count > 1_000_000)
    ) {
      throw new Error(PROTOCOL_ERROR);
    }
  } else if (Object.keys(value).length !== 1) {
    throw new Error(PROTOCOL_ERROR);
  }
  return Object.freeze({ ...value });
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
  startRecordAnalysis: async (recordId: string) => {
    if (typeof recordId !== "string") throw new Error(PROTOCOL_ERROR);
    const value = await ipcRenderer.invoke(PRELOAD_CHANNELS.startAnalysis, recordId);
    if (!isRecord(value) || value.status !== "record_fetched" || Object.keys(value).length !== 1) throw new Error(PROTOCOL_ERROR);
    return Object.freeze({ status: "record_fetched" as const });
  },
}));

contextBridge.exposeInMainWorld("riichiCoachPaipu", Object.freeze({
  importPaipu: async (input: unknown) => {
    // Defense in depth: the envelope is checked here, re-checked in the main
    // IPC handler, and the URL is strict-parsed in the main service before
    // any BrowserWindow exists. The seat is never part of the request —
    // the main process resolves it from the URL's perspective identity.
    if (
      !isRecord(input)
      || Object.keys(input).length !== 1
      || typeof input.shareUrl !== "string"
      || input.shareUrl.length === 0
      || input.shareUrl.length > 512
    ) {
      throw new Error(PROTOCOL_ERROR);
    }
    try {
      return assertSafePaipuImportResult(
        await ipcRenderer.invoke(PRELOAD_CHANNELS.importPaipuUrl, input),
      );
    } catch (error) {
      throw fixedError(error);
    }
  },
}));
