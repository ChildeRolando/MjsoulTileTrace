import { MahjongSoulSourceError } from "./errors.js";
import type {
  DecodedLiqiMessage,
  MahjongSoulOAuth2RecoveryContext,
} from "./liqi-codec.js";
import { SecretString } from "./secret-string.js";

const PROTOCOL_ERROR = "mahjong_soul_login_protocol_unsupported" as const;
const MAX_UINT32 = 0xffff_ffff;
const MAX_DISPLAY_NAME_LENGTH = 64;

export interface CapturedMahjongSoulCredential {
  readonly region: "cn";
  readonly loginMethod: "login" | "oauth2Login";
  readonly authType: number;
  readonly accountId: number;
  readonly displayName: string;
  readonly accessToken: SecretString;
}

export interface CapturedMahjongSoulRestoreCandidate
  extends CapturedMahjongSoulCredential {
  readonly recoveryContext: MahjongSoulOAuth2RecoveryContext;
}

function unsupported(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(PROTOCOL_ERROR);
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

function isPositiveUint32(value: unknown): value is number {
  return isUint32(value) && value > 0;
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function snapshotRecoveryContext(
  value: unknown,
): MahjongSoulOAuth2RecoveryContext {
  if (!isRecord(value)) throw unsupported();
  const deviceValue = value.device;
  const clientVersionValue = value.clientVersion;
  const currencyPlatformsValue = value.currencyPlatforms;
  const version = value.version;
  const clientVersionString = value.clientVersionString;
  const tag = value.tag;
  if (
    !isRecord(deviceValue)
    || !isRecord(clientVersionValue)
    || !Array.isArray(currencyPlatformsValue)
    || !isUint32(version)
    || !boundedString(clientVersionString, 128)
    || !boundedString(tag, 64)
  ) {
    throw unsupported();
  }

  const platform = deviceValue.platform;
  const hardware = deviceValue.hardware;
  const os = deviceValue.os;
  const osVersion = deviceValue.osVersion;
  const isBrowser = deviceValue.isBrowser;
  const software = deviceValue.software;
  const salePlatform = deviceValue.salePlatform;
  const hardwareVendor = deviceValue.hardwareVendor;
  const modelNumber = deviceValue.modelNumber;
  const screenWidth = deviceValue.screenWidth;
  const screenHeight = deviceValue.screenHeight;
  const userAgent = deviceValue.userAgent;
  const screenType = deviceValue.screenType;
  const resource = clientVersionValue.resource;
  const packageVersion = clientVersionValue.package;
  const currencyPlatforms = [...currencyPlatformsValue];
  if (
    !boundedString(platform, 64)
    || !boundedString(hardware, 128)
    || !boundedString(os, 64)
    || !boundedString(osVersion, 64)
    || typeof isBrowser !== "boolean"
    || !boundedString(software, 128)
    || !boundedString(salePlatform, 64)
    || !boundedString(hardwareVendor, 128)
    || !boundedString(modelNumber, 128)
    || !isUint32(screenWidth)
    || !isUint32(screenHeight)
    || !boundedString(userAgent, 2048)
    || !isUint32(screenType)
    || !boundedString(resource, 128)
    || !boundedString(packageVersion, 128)
    || currencyPlatforms.some((entry) => !isUint32(entry))
  ) {
    throw unsupported();
  }

  return Object.freeze({
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
    currencyPlatforms: Object.freeze(currencyPlatforms),
    version,
    clientVersionString,
    tag,
  });
}

function projectCredential(
  message: DecodedLiqiMessage,
): CapturedMahjongSoulRestoreCandidate {
  if (!isRecord(message) || message.kind !== "response") {
    throw unsupported();
  }

  const method = message.method;
  let loginMethod: CapturedMahjongSoulCredential["loginMethod"];
  if (method === ".lq.Lobby.login") {
    loginMethod = "login";
  } else if (method === ".lq.Lobby.oauth2Login") {
    loginMethod = "oauth2Login";
  } else {
    throw unsupported();
  }

  const requestContext = message.requestContext;
  if (!isRecord(requestContext)) throw unsupported();
  const requestSource = requestContext.source;
  const contextLoginMethod = requestContext.loginMethod;
  const authType = requestContext.authType;
  const recoveryContext = requestContext.recovery;
  if (
    requestSource !== "observed_login"
    || contextLoginMethod !== loginMethod
    || !isUint32(authType)
  ) {
    throw unsupported();
  }

  const payload = message.payload;
  if (!isRecord(payload)) throw unsupported();

  const responseError = payload.error;
  if (responseError !== undefined && responseError !== null) {
    if (!isRecord(responseError)) throw unsupported();
    const errorCode = responseError.code;
    if (
      !Number.isInteger(errorCode)
      || errorCode !== 0
    ) {
      throw unsupported();
    }
  }

  const accountId = payload.account_id;
  const account = payload.account;
  const accessToken = payload.access_token;
  if (
    !isPositiveUint32(accountId)
    || !isRecord(account)
    || typeof accessToken !== "string"
  ) {
    throw unsupported();
  }
  const displayName = account.nickname;
  if (
    typeof displayName !== "string"
    || displayName.length < 1
    || displayName.length > MAX_DISPLAY_NAME_LENGTH
  ) {
    throw unsupported();
  }

  return Object.freeze({
    region: "cn" as const,
    loginMethod,
    authType,
    accountId,
    displayName,
    accessToken: SecretString.from(accessToken),
    recoveryContext: snapshotRecoveryContext(recoveryContext),
  });
}

export function extractCapturedLoginCredential(
  message: DecodedLiqiMessage,
): CapturedMahjongSoulRestoreCandidate {
  try {
    return projectCredential(message);
  } catch {
    throw unsupported();
  }
}
