import type { MahjongSoulLobbySession } from "./lobby-session.js";
import type {
  CapturedMahjongSoulRestoreCandidate,
  CapturedMahjongSoulCredential,
} from "./login-result.js";
import { SecretString } from "./secret-string.js";

const MAX_UINT32 = 0xffff_ffff;

export type MahjongSoulRestoreDiagnosticStatus =
  | "independent_restore_verified"
  | "oauth2_check_rejected"
  | "oauth2_login_rejected"
  | "identity_mismatch"
  | "catalog_probe_rejected"
  | "session_create_failed"
  | "oauth2_check_call_failed"
  | "oauth2_login_call_failed"
  | "fetch_info_call_failed"
  | "catalog_probe_call_failed"
  | "inconclusive";

export type MahjongSoulRestoreDiagnosticResult = Readonly<{
  readonly status: MahjongSoulRestoreDiagnosticStatus;
}>;

function result(
  status: MahjongSoulRestoreDiagnosticStatus,
): MahjongSoulRestoreDiagnosticResult {
  return Object.freeze({ status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isUint32(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value <= MAX_UINT32;
}

export function classifyRestoreResponseError(
  value: Readonly<Record<string, unknown>>,
): "success" | "rejected" | "invalid" {
  const error = value.error;
  if (error === undefined || error === null) return "success";
  if (!isRecord(error) || !Number.isInteger(error.code)) return "invalid";
  return error.code === 0 ? "success" : "rejected";
}

export function snapshotRestoreCandidate(
  value: unknown,
): CapturedMahjongSoulRestoreCandidate | null {
  if (!isRecord(value)) return null;
  const region = value.region;
  const loginMethod = value.loginMethod;
  const authType = value.authType;
  const accountId = value.accountId;
  const displayName = value.displayName;
  const accessToken = value.accessToken;
  const recovery = value.recoveryContext;
  if (
    region !== "cn"
    || (loginMethod !== "login" && loginMethod !== "oauth2Login")
    || !isUint32(authType)
    || !isUint32(accountId)
    || accountId === 0
    || typeof displayName !== "string"
    || displayName.length < 1
    || displayName.length > 64
    || !(accessToken instanceof SecretString)
    || !isRecord(recovery)
  ) {
    return null;
  }
  const device = recovery.device;
  const clientVersion = recovery.clientVersion;
  const currencyPlatforms = recovery.currencyPlatforms;
  const version = recovery.version;
  const clientVersionString = recovery.clientVersionString;
  const tag = recovery.tag;
  if (
    !isRecord(device)
    || !isRecord(clientVersion)
    || !Array.isArray(currencyPlatforms)
    || currencyPlatforms.some((entry) => !isUint32(entry))
    || !isUint32(version)
    || typeof clientVersionString !== "string"
    || clientVersionString.length > 128
    || typeof tag !== "string"
    || tag.length > 64
  ) {
    return null;
  }
  const platform = device.platform;
  const hardware = device.hardware;
  const os = device.os;
  const osVersion = device.osVersion;
  const isBrowser = device.isBrowser;
  const software = device.software;
  const salePlatform = device.salePlatform;
  const hardwareVendor = device.hardwareVendor;
  const modelNumber = device.modelNumber;
  const screenWidth = device.screenWidth;
  const screenHeight = device.screenHeight;
  const userAgent = device.userAgent;
  const screenType = device.screenType;
  const resource = clientVersion.resource;
  const packageVersion = clientVersion.package;
  if (
    typeof platform !== "string"
    || typeof hardware !== "string"
    || typeof os !== "string"
    || typeof osVersion !== "string"
    || typeof isBrowser !== "boolean"
    || typeof software !== "string"
    || typeof salePlatform !== "string"
    || typeof hardwareVendor !== "string"
    || typeof modelNumber !== "string"
    || !isUint32(screenWidth)
    || !isUint32(screenHeight)
    || typeof userAgent !== "string"
    || userAgent.length > 2048
    || !isUint32(screenType)
    || typeof resource !== "string"
    || resource.length > 128
    || typeof packageVersion !== "string"
    || packageVersion.length > 128
  ) {
    return null;
  }
  return Object.freeze({
    region,
    loginMethod,
    authType,
    accountId,
    displayName,
    accessToken,
    recoveryContext: Object.freeze({
      device: Object.freeze({
        platform,
        hardware,
        os,
        osVersion,
        isBrowser,
        software,
        salePlatform,
        hardwareVendor,
        modelNumber,
        screenWidth,
        screenHeight,
        userAgent,
        screenType,
      }),
      clientVersion: Object.freeze({ resource, package: packageVersion }),
      currencyPlatforms: Object.freeze([...currencyPlatforms]),
      version,
      clientVersionString,
      tag,
    }),
  });
}

export function createOAuth2LoginPayload(
  credential: CapturedMahjongSoulRestoreCandidate,
): Readonly<Record<string, unknown>> {
  const context = credential.recoveryContext;
  const device = context.device;
  return Object.freeze({
    type: credential.authType,
    access_token: credential.accessToken.reveal(),
    reconnect: false,
    device: Object.freeze({
      platform: device.platform,
      hardware: device.hardware,
      os: device.os,
      os_version: device.osVersion,
      is_browser: device.isBrowser,
      software: device.software,
      sale_platform: device.salePlatform,
      hardware_vendor: device.hardwareVendor,
      model_number: device.modelNumber,
      screen_width: device.screenWidth,
      screen_height: device.screenHeight,
      user_agent: device.userAgent,
      screen_type: device.screenType,
    }),
    client_version: Object.freeze({ ...context.clientVersion }),
    gen_access_token: false,
    currency_platforms: Object.freeze([...context.currencyPlatforms]),
    version: context.version,
    client_version_string: context.clientVersionString,
    tag: context.tag,
  });
}

function serverErrorCodeOf(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const error = value.error;
  if (!isRecord(error)) return null;
  const code = error.code;
  if (typeof code !== "number" || !Number.isInteger(code)) return null;
  return code;
}

export type MahjongSoulRestoreRejection = Readonly<{
  readonly checkErrorCode: number | null;
  readonly checkHasAccount: boolean | null;
  readonly loginErrorCode: number | null;
  readonly loginAccountId: number | null;
}>;

// Replays the oauth2Check + oauth2Login restore against the lobby and reports
// the raw server error codes (never the token) so a rejection can be told apart
// from a CAPTCHA/rate-limit (e.g. 151) versus an expired token (has_account
// false with no error).
export async function readSessionRestoreRejection(
  lobby: MahjongSoulLobbySession,
  session: CapturedMahjongSoulRestoreCandidate,
): Promise<MahjongSoulRestoreRejection> {
  const check = await lobby.call(".lq.Lobby.oauth2Check", {
    type: session.authType,
    access_token: session.accessToken.reveal(),
  });
  const login = await lobby.call(
    ".lq.Lobby.oauth2Login",
    createOAuth2LoginPayload(session),
  );
  return Object.freeze({
    checkErrorCode: serverErrorCodeOf(check),
    checkHasAccount: typeof check.has_account === "boolean"
      ? check.has_account
      : null,
    loginErrorCode: serverErrorCodeOf(login),
    loginAccountId: typeof login.account_id === "number"
      ? login.account_id
      : null,
  });
}

export async function diagnoseMahjongSoulIndependentRestore(input: {
  readonly credential: CapturedMahjongSoulCredential;
  readonly createSession: () => Promise<MahjongSoulLobbySession>;
  readonly now: () => number;
}): Promise<MahjongSoulRestoreDiagnosticResult> {
  let credential: CapturedMahjongSoulRestoreCandidate | null;
  try {
    credential = snapshotRestoreCandidate(input?.credential);
  } catch {
    credential = null;
  }
  if (
    credential === null
    || typeof input.createSession !== "function"
    || typeof input.now !== "function"
  ) {
    return result("inconclusive");
  }

  let session: MahjongSoulLobbySession | null = null;
  try {
    try {
      session = await input.createSession();
    } catch {
      return result("session_create_failed");
    }
    let check: Readonly<Record<string, unknown>>;
    try {
      check = await session.call(".lq.Lobby.oauth2Check", {
        type: credential.authType,
        access_token: credential.accessToken.reveal(),
      });
    } catch {
      return result("oauth2_check_call_failed");
    }
    const checkError = classifyRestoreResponseError(check);
    if (checkError === "invalid") return result("inconclusive");
    if (checkError === "rejected" || check.has_account === false) {
      return result("oauth2_check_rejected");
    }
    if (check.has_account !== true) return result("inconclusive");

    let login: Readonly<Record<string, unknown>>;
    try {
      login = await session.call(
        ".lq.Lobby.oauth2Login",
        createOAuth2LoginPayload(credential),
      );
    } catch {
      return result("oauth2_login_call_failed");
    }
    const loginError = classifyRestoreResponseError(login);
    if (loginError === "invalid") return result("inconclusive");
    if (loginError === "rejected") return result("oauth2_login_rejected");
    if (!isUint32(login.account_id)) return result("inconclusive");
    if (login.account_id !== credential.accountId) {
      return result("identity_mismatch");
    }

    let info: Readonly<Record<string, unknown>>;
    try {
      info = await session.call(".lq.Lobby.fetchInfo", {});
    } catch {
      return result("fetch_info_call_failed");
    }
    if (classifyRestoreResponseError(info) !== "success") return result("inconclusive");

    const now = input.now();
    if (!Number.isSafeInteger(now) || now < 1000) return result("inconclusive");
    const endTime = Math.floor(now / 1000);
    if (!isUint32(endTime) || endTime === 0) return result("inconclusive");
    const beginTime = endTime - 1;
    let catalog: Readonly<Record<string, unknown>>;
    try {
      catalog = await session.call(".lq.Lobby.fetchGameRecordListV2", {
        tag: 0,
        begin_time: beginTime,
        end_time: endTime,
      });
    } catch {
      return result("catalog_probe_call_failed");
    }
    const catalogError = classifyRestoreResponseError(catalog);
    if (catalogError === "invalid") return result("inconclusive");
    if (catalogError === "rejected") return result("catalog_probe_rejected");
    if (
      typeof catalog.iterator !== "string"
      || catalog.iterator.length === 0
      || catalog.iterator.length > 4096
      || !isUint32(catalog.iterator_expire)
      || catalog.iterator_expire === 0
      || catalog.actual_begin_time !== beginTime
      || catalog.actual_end_time !== endTime
    ) {
      return result("inconclusive");
    }
    return result("independent_restore_verified");
  } catch {
    return result("inconclusive");
  } finally {
    if (session !== null) {
      try {
        await session.close();
      } catch {
        // A diagnostic result never exposes transport shutdown details.
      }
    }
  }
}
