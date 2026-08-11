import { MahjongSoulSourceError } from "./errors.js";
import type { DecodedLiqiMessage } from "./liqi-codec.js";
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

function projectCredential(
  message: DecodedLiqiMessage,
): CapturedMahjongSoulCredential {
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
  });
}

export function extractCapturedLoginCredential(
  message: DecodedLiqiMessage,
): CapturedMahjongSoulCredential {
  try {
    return projectCredential(message);
  } catch {
    throw unsupported();
  }
}
