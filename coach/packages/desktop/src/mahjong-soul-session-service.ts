import {
  MahjongSoulSourceError,
  createMahjongSoulSessionController,
  type MahjongSoulLoginProvider,
  type MahjongSoulSessionController,
  type MahjongSoulSessionVault,
} from "@riichi-coach/mahjong-soul-source";

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
  readonly browserSession: BrowserSessionClearPort;
  readonly clock: () => number;
}): MahjongSoulSessionController {
  try {
    if (!isObjectLike(input)) throw unavailable();
    const browserSession = snapshotBrowserSession(input.browserSession);
    return createMahjongSoulSessionController({
      vault: input.vault,
      loginProvider: input.loginProvider,
      clock: input.clock,
      clearBrowserSession: async () => {
        await browserSession.clearStorageData();
        await browserSession.clearCache();
      },
    });
  } catch {
    throw unavailable();
  }
}
