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

function hasSuccessfulError(value: Readonly<Record<string, unknown>>): boolean {
  const error = value.error;
  if (error === undefined || error === null) return true;
  return isRecord(error) && error.code === 0;
}

function snapshotCandidate(
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

function oauth2LoginPayload(
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

export async function diagnoseMahjongSoulIndependentRestore(input: {
  readonly credential: CapturedMahjongSoulCredential;
  readonly createSession: () => Promise<MahjongSoulLobbySession>;
  readonly now: () => number;
}): Promise<MahjongSoulRestoreDiagnosticResult> {
  let credential: CapturedMahjongSoulRestoreCandidate | null;
  try {
    credential = snapshotCandidate(input?.credential);
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
    session = await input.createSession();
    const check = await session.call(".lq.Lobby.oauth2Check", {
      type: credential.authType,
      access_token: credential.accessToken.reveal(),
    });
    if (!hasSuccessfulError(check) || check.has_account !== true) {
      return result("oauth2_check_rejected");
    }

    const login = await session.call(
      ".lq.Lobby.oauth2Login",
      oauth2LoginPayload(credential),
    );
    if (!hasSuccessfulError(login)) return result("oauth2_login_rejected");
    if (!isUint32(login.account_id) || login.account_id !== credential.accountId) {
      return result("identity_mismatch");
    }

    const info = await session.call(".lq.Lobby.fetchInfo", {});
    if (!hasSuccessfulError(info)) return result("inconclusive");

    const now = input.now();
    if (!Number.isSafeInteger(now) || now < 1000) return result("inconclusive");
    const endTime = Math.floor(now / 1000);
    if (!isUint32(endTime) || endTime === 0) return result("inconclusive");
    const beginTime = endTime - 1;
    const catalog = await session.call(".lq.Lobby.fetchGameRecordListV2", {
      tag: 0,
      begin_time: beginTime,
      end_time: endTime,
    });
    if (!hasSuccessfulError(catalog)) return result("catalog_probe_rejected");
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
