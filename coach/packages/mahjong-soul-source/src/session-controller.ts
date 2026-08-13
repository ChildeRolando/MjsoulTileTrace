import type { MahjongSoulSessionStatus } from "@riichi-coach/contracts";

import { MahjongSoulSourceError } from "./errors.js";
import {
  snapshotMahjongSoulRecoveryContext,
  type CapturedMahjongSoulRestoreCandidate,
} from "./login-result.js";
import { SecretString } from "./secret-string.js";
import type {
  MahjongSoulSessionVault,
  StoredMahjongSoulSession,
} from "./session-vault.js";
import {
  MAHJONG_SOUL_CN_CLIENT_VERSION,
  MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION,
} from "./protocol-manifest.js";

const PROTOCOL_ERROR = "mahjong_soul_login_protocol_unsupported" as const;
const STORAGE_ERROR = "mahjong_soul_session_storage_unavailable" as const;

export type MahjongSoulLoginProviderResult = Readonly<
  | { status: "authenticated"; credential: CapturedMahjongSoulRestoreCandidate }
  | { status: "rejected" }
  | { status: "unverified" }
  | { status: "cancelled" }
>;

export interface MahjongSoulLoginProvider {
  run(input: {
    readonly mode: "interactive" | "restore";
    readonly expected?: {
      readonly loginMethod: "login" | "oauth2Login";
      readonly accountId: number;
    };
  }): Promise<MahjongSoulLoginProviderResult>;
  cancelActive(): void;
}

export interface MahjongSoulSessionController {
  initialize(): Promise<MahjongSoulSessionStatus>;
  getStatus(): MahjongSoulSessionStatus;
  openLogin(): Promise<MahjongSoulSessionStatus>;
  logout(): Promise<MahjongSoulSessionStatus>;
}

function protocolFailure(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(PROTOCOL_ERROR);
}

function storageFailure(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(STORAGE_ERROR);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function status(value: MahjongSoulSessionStatus): MahjongSoulSessionStatus {
  return Object.freeze({ ...value });
}

const LOGGED_OUT = status({ region: "cn", status: "logged_out" });
const AUTHENTICATING = status({ region: "cn", status: "authenticating" });
const VALIDATING = status({ region: "cn", status: "session_validating" });

function valid(displayName: string, lastValidatedAt: number): MahjongSoulSessionStatus {
  return status({
    region: "cn",
    status: "valid",
    displayName,
    lastValidatedAt,
  });
}

function offline(session: StoredMahjongSoulSession): MahjongSoulSessionStatus {
  return status({
    region: "cn",
    status: "offline_unverified",
    displayName: session.displayName,
    lastValidatedAt: session.lastValidatedAt,
  });
}

function snapshotCredential(value: unknown): CapturedMahjongSoulRestoreCandidate {
  if (!isRecord(value)) throw protocolFailure();
  const region = value.region;
  const loginMethod = value.loginMethod;
  const authType = value.authType;
  const accountId = value.accountId;
  const displayName = value.displayName;
  const accessToken = value.accessToken;
  const recoveryContext = snapshotMahjongSoulRecoveryContext(value.recoveryContext);
  if (
    region !== "cn"
    || (loginMethod !== "login" && loginMethod !== "oauth2Login")
    || typeof authType !== "number"
    || !Number.isInteger(authType)
    || authType < 0
    || authType > 0xffff_ffff
    || typeof accountId !== "number"
    || !Number.isInteger(accountId)
    || accountId < 1
    || accountId > 0xffff_ffff
    || typeof displayName !== "string"
    || displayName.length < 1
    || displayName.length > 64
    || !(accessToken instanceof SecretString)
  ) {
    throw protocolFailure();
  }
  return Object.freeze({
    region,
    loginMethod,
    authType,
    accountId,
    displayName,
    accessToken,
    recoveryContext,
  });
}

function parseLoginResult(value: unknown): MahjongSoulLoginProviderResult {
  if (!isRecord(value)) throw protocolFailure();
  const resultStatus = value.status;
  const keys = Object.keys(value);
  if (resultStatus === "authenticated") {
    if (
      keys.length !== 2
      || !keys.includes("status")
      || !keys.includes("credential")
    ) {
      throw protocolFailure();
    }
    return Object.freeze({
      status: "authenticated" as const,
      credential: snapshotCredential(value.credential),
    });
  }
  if (
    (resultStatus === "rejected" || resultStatus === "unverified" || resultStatus === "cancelled")
    && keys.length === 1
    && keys[0] === "status"
  ) {
    return Object.freeze({ status: resultStatus });
  }
  throw protocolFailure();
}

function snapshotStored(value: StoredMahjongSoulSession): StoredMahjongSoulSession {
  const captured = snapshotCredential(value);
  const createdAt = value.createdAt;
  const lastValidatedAt = value.lastValidatedAt;
  const adapterVersion = value.adapterVersion;
  const clientVersion = value.clientVersion;
  if (
    typeof createdAt !== "number"
    || !Number.isSafeInteger(createdAt)
    || createdAt < 0
    || typeof lastValidatedAt !== "number"
    || !Number.isSafeInteger(lastValidatedAt)
    || lastValidatedAt < createdAt
    || adapterVersion !== MAHJONG_SOUL_PROTOCOL_ADAPTER_VERSION
    || clientVersion !== MAHJONG_SOUL_CN_CLIENT_VERSION
  ) {
    throw protocolFailure();
  }
  return Object.freeze({
    ...captured,
    recoveryContext: snapshotMahjongSoulRecoveryContext(value.recoveryContext),
    adapterVersion,
    clientVersion,
    createdAt,
    lastValidatedAt,
  });
}

function readClock(clock: () => number): number {
  let value: number;
  try {
    value = clock();
  } catch {
    throw storageFailure();
  }
  if (!Number.isSafeInteger(value) || value < 0) throw storageFailure();
  return value;
}

async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof MahjongSoulSourceError) throw error;
    throw storageFailure();
  }
}

class StatefulSessionController implements MahjongSoulSessionController {
  readonly #vault: MahjongSoulSessionVault;
  readonly #loginProvider: MahjongSoulLoginProvider;
  readonly #clearBrowserSession: () => Promise<void>;
  readonly #clock: () => number;
  #status: MahjongSoulSessionStatus = LOGGED_OUT;
  #stableStatus: MahjongSoulSessionStatus = LOGGED_OUT;
  #operation: Promise<MahjongSoulSessionStatus> | null = null;
  #generation = 0;

  constructor(
    vault: MahjongSoulSessionVault,
    loginProvider: MahjongSoulLoginProvider,
    clearBrowserSession: () => Promise<void>,
    clock: () => number,
  ) {
    this.#vault = vault;
    this.#loginProvider = loginProvider;
    this.#clearBrowserSession = clearBrowserSession;
    this.#clock = clock;
  }

  getStatus(): MahjongSoulSessionStatus {
    return this.#status;
  }

  initialize(): Promise<MahjongSoulSessionStatus> {
    if (this.#operation !== null) return this.#operation;
    this.#status = VALIDATING;
    const generation = this.#generation;
    const operation = this.#initialize(generation).finally(() => {
      if (this.#operation === operation) this.#operation = null;
    });
    this.#operation = operation;
    return operation;
  }

  async #initialize(generation: number): Promise<MahjongSoulSessionStatus> {
    const rawSession = await storageOperation(() => this.#vault.restore());
    if (generation !== this.#generation) return this.#stableStatus;
    if (rawSession === null) {
      this.#status = LOGGED_OUT;
      this.#stableStatus = this.#status;
      return this.#status;
    }
    const session = snapshotStored(rawSession);
    let result: MahjongSoulLoginProviderResult;
    try {
      result = parseLoginResult(await this.#loginProvider.run({
        mode: "restore",
        expected: {
          loginMethod: session.loginMethod,
          accountId: session.accountId,
        },
      }));
    } catch (error) {
      this.#status = offline(session);
      this.#stableStatus = this.#status;
      if (error instanceof MahjongSoulSourceError) return this.#status;
      result = { status: "unverified" };
    }
    if (generation !== this.#generation) return this.#stableStatus;
    if (result.status === "unverified" || result.status === "cancelled") {
      this.#status = offline(session);
      this.#stableStatus = this.#status;
      return this.#status;
    }
    if (
      result.status === "rejected"
      || result.credential.loginMethod !== session.loginMethod
      || result.credential.accountId !== session.accountId
    ) {
      try {
        await storageOperation(() => this.#vault.clear());
      } catch (error) {
        this.#status = offline(session);
        this.#stableStatus = this.#status;
        throw error;
      }
      this.#status = LOGGED_OUT;
      this.#stableStatus = this.#status;
      return this.#status;
    }
    let timestamp: number;
    try {
      timestamp = readClock(this.#clock);
    } catch (error) {
      this.#status = offline(session);
      this.#stableStatus = this.#status;
      throw error;
    }
    try {
      await storageOperation(() => this.#vault.markValidated(timestamp));
    } catch (error) {
      this.#status = offline(session);
      this.#stableStatus = this.#status;
      throw error;
    }
    this.#status = valid(session.displayName, timestamp);
    this.#stableStatus = this.#status;
    return this.#status;
  }

  openLogin(): Promise<MahjongSoulSessionStatus> {
    if (this.#operation !== null) return this.#operation;
    const previous = this.#stableStatus;
    this.#status = AUTHENTICATING;
    const generation = this.#generation;
    const operation = this.#openLogin(previous, generation).finally(() => {
      if (this.#operation === operation) this.#operation = null;
    });
    this.#operation = operation;
    return operation;
  }

  async #openLogin(
    previous: MahjongSoulSessionStatus,
    generation: number,
  ): Promise<MahjongSoulSessionStatus> {
    let result: MahjongSoulLoginProviderResult;
    try {
      result = parseLoginResult(await this.#loginProvider.run({ mode: "interactive" }));
    } catch (error) {
      this.#status = previous;
      if (error instanceof MahjongSoulSourceError) throw error;
      return this.#status;
    }
    if (generation !== this.#generation) return this.#stableStatus;
    if (result.status === "cancelled" || result.status === "unverified") {
      this.#status = previous;
      this.#stableStatus = this.#status;
      return this.#status;
    }
    if (result.status === "rejected") {
      try {
        await storageOperation(() => this.#vault.clear());
      } catch (error) {
        this.#status = previous;
        throw error;
      }
      this.#status = LOGGED_OUT;
      this.#stableStatus = this.#status;
      return this.#status;
    }
    const credential = result.credential;
    let timestamp: number;
    try {
      timestamp = readClock(this.#clock);
    } catch (error) {
      this.#status = previous;
      throw error;
    }
    try {
      await storageOperation(() => this.#vault.save(credential));
    } catch (error) {
      this.#status = previous;
      throw error;
    }
    this.#status = valid(credential.displayName, timestamp);
    this.#stableStatus = this.#status;
    return this.#status;
  }

  async logout(): Promise<MahjongSoulSessionStatus> {
    const previous = this.#stableStatus;
    this.#generation += 1;
    try {
      this.#loginProvider.cancelActive();
    } catch {
      this.#status = previous;
      throw storageFailure();
    }
    const active = this.#operation;
    if (active !== null) await active.catch(() => undefined);
    try {
      await storageOperation(this.#clearBrowserSession);
      await storageOperation(() => this.#vault.clear());
    } catch (error) {
      this.#status = previous;
      throw error;
    }
    this.#status = LOGGED_OUT;
    this.#stableStatus = this.#status;
    return this.#status;
  }
}

function isObjectLike(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

function snapshotVaultPort(value: unknown): MahjongSoulSessionVault {
  if (!isObjectLike(value)) throw storageFailure();
  const candidate = value as Record<keyof MahjongSoulSessionVault, unknown>;
  const save = candidate.save;
  const restore = candidate.restore;
  const markValidated = candidate.markValidated;
  const clear = candidate.clear;
  if (
    typeof save !== "function"
    || typeof restore !== "function"
    || typeof markValidated !== "function"
    || typeof clear !== "function"
  ) {
    throw storageFailure();
  }
  return Object.freeze({
    save: save.bind(value) as MahjongSoulSessionVault["save"],
    restore: restore.bind(value) as MahjongSoulSessionVault["restore"],
    markValidated: markValidated.bind(value) as MahjongSoulSessionVault["markValidated"],
    clear: clear.bind(value) as MahjongSoulSessionVault["clear"],
  });
}

function snapshotLoginProvider(value: unknown): MahjongSoulLoginProvider {
  if (!isObjectLike(value)) throw storageFailure();
  const candidate = value as Record<keyof MahjongSoulLoginProvider, unknown>;
  const run = candidate.run;
  const cancelActive = candidate.cancelActive;
  if (typeof run !== "function" || typeof cancelActive !== "function") {
    throw storageFailure();
  }
  return Object.freeze({
    run: run.bind(value) as MahjongSoulLoginProvider["run"],
    cancelActive: cancelActive.bind(value) as MahjongSoulLoginProvider["cancelActive"],
  });
}

export function createMahjongSoulSessionController(input: {
  readonly vault: MahjongSoulSessionVault;
  readonly loginProvider: MahjongSoulLoginProvider;
  readonly clearBrowserSession: () => Promise<void>;
  readonly clock: () => number;
}): MahjongSoulSessionController {
  if (!isRecord(input)) throw storageFailure();
  const vault = snapshotVaultPort(input.vault);
  const loginProvider = snapshotLoginProvider(input.loginProvider);
  const clearBrowserSession = input.clearBrowserSession;
  const clock = input.clock;
  if (
    typeof clearBrowserSession !== "function"
    || typeof clock !== "function"
  ) {
    throw storageFailure();
  }
  return new StatefulSessionController(
    vault,
    loginProvider,
    clearBrowserSession,
    clock,
  );
}
