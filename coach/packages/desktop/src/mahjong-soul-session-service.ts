import {
  MahjongSoulSourceError,
  createMahjongSoulSessionController,
  type MahjongSoulLoginProvider,
  type MahjongSoulSessionController,
  type MahjongSoulSessionRestorer,
  type MahjongSoulSessionVault,
} from "@riichi-coach/mahjong-soul-source";
import type { MahjongSoulSessionStatus } from "@riichi-coach/contracts";

const STORAGE_ERROR = "mahjong_soul_session_storage_unavailable" as const;

export interface BrowserSessionClearPort {
  clearStorageData(): Promise<void>;
  clearCache(): Promise<void>;
}

function unavailable(): MahjongSoulSourceError {
  return new MahjongSoulSourceError(STORAGE_ERROR);
}

function isObjectLike(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

function snapshotBrowserSession(value: unknown): BrowserSessionClearPort {
  if (!isObjectLike(value)) throw unavailable();
  const candidate = value as Record<keyof BrowserSessionClearPort, unknown>;
  const clearStorageData = candidate.clearStorageData;
  const clearCache = candidate.clearCache;
  if (typeof clearStorageData !== "function" || typeof clearCache !== "function") {
    throw unavailable();
  }
  return Object.freeze({
    clearStorageData: clearStorageData.bind(value) as BrowserSessionClearPort["clearStorageData"],
    clearCache: clearCache.bind(value) as BrowserSessionClearPort["clearCache"],
  });
}

export function createMahjongSoulSessionService(input: {
  readonly vault: MahjongSoulSessionVault;
  readonly loginProvider: MahjongSoulLoginProvider;
  readonly sessionRestorer: MahjongSoulSessionRestorer;
  readonly browserSession: BrowserSessionClearPort;
  readonly cancelCatalogSync: () => Promise<void>;
  readonly resumeCatalogSync: () => void;
  readonly clearCatalog: () => Promise<void>;
  readonly clock: () => number;
}): MahjongSoulSessionController {
  try {
    if (!isObjectLike(input)) throw unavailable();
    const browserSession = snapshotBrowserSession(input.browserSession);
    if (typeof input.cancelCatalogSync !== "function") throw unavailable();
    if (typeof input.resumeCatalogSync !== "function") throw unavailable();
    if (typeof input.clearCatalog !== "function") throw unavailable();
    const cancelCatalogSync = input.cancelCatalogSync;
    const clearCatalog = input.clearCatalog;
    const controller = createMahjongSoulSessionController({
      vault: input.vault,
      loginProvider: input.loginProvider,
      sessionRestorer: input.sessionRestorer,
      clock: input.clock,
      clearBrowserSession: async () => {
        try {
          await cancelCatalogSync();
          await browserSession.clearStorageData();
          await browserSession.clearCache();
          await clearCatalog();
        } catch {
          throw unavailable();
        }
      },
    });
    const resumeCatalogSync = input.resumeCatalogSync;
    let serviceOperation: Promise<MahjongSoulSessionStatus> | null = null;
    const runExclusive = (
      operation: () => Promise<MahjongSoulSessionStatus>,
    ): Promise<MahjongSoulSessionStatus> => {
      if (serviceOperation !== null) return serviceOperation;
      const current = operation().finally(() => {
        if (serviceOperation === current) serviceOperation = null;
      });
      serviceOperation = current;
      return current;
    };
    return Object.freeze({
      getStatus: () => controller.getStatus(),
      initialize: () => runExclusive(async () => {
        const result = await controller.initialize();
        if (result.status === "valid") resumeCatalogSync();
        return result;
      }),
      openLogin: () => runExclusive(async () => {
        const result = await controller.openLogin();
        if (result.status === "valid") resumeCatalogSync();
        return result;
      }),
      logout: () => runExclusive(() => controller.logout()),
    });
  } catch {
    throw unavailable();
  }
}
