import {
  MahjongSoulSourceErrorCodeSchema, COACH_IPC_CHANNELS, CoachProviderSettingsSchema,
  CoachProviderStatusSchema, CoachGenerateRequestSchema, CoachGenerateResultSchema,
  type CoachDesktopApi,
} from "@riichi-coach/contracts";
import {
  parseMahjongSoulSessionStatus,
  type MahjongSoulDesktopApi,
} from "./session-api.js";
import {
  parseAnalyzableRecordSummaries,
  type MahjongSoulCatalogApi,
} from "./catalog-api.js";
import {
  MAHJONG_SOUL_CATALOG_IPC_CHANNELS,
  MAHJONG_SOUL_IPC_CHANNELS,
} from "./ipc.js";

const PROTOCOL_ERROR = "mahjong_soul_login_protocol_unsupported" as const;

export function createCoachPreloadApi(ipc: IpcRendererInvokePort): CoachDesktopApi {
  const status = async (channel: string, args: unknown[]) => {
    try { return CoachProviderStatusSchema.parse(await ipc.invoke(channel, ...args)); }
    catch { throw Error("m6d2_provider_operation_failed"); }
  };
  return Object.freeze({
    configure: async (value: Parameters<CoachDesktopApi["configure"]>[0]) => {
      try { return await status(COACH_IPC_CHANNELS.configure, [CoachProviderSettingsSchema.parse(value)]); }
      catch { throw Error("m6d2_provider_operation_failed"); }
    },
    getStatus: () => status(COACH_IPC_CHANNELS.status, []),
    importCredential: () => status(COACH_IPC_CHANNELS.importCredential, []),
    clearCredential: () => status(COACH_IPC_CHANNELS.clearCredential, []),
    generate: async (value: Parameters<CoachDesktopApi["generate"]>[0]) => {
      try { return CoachGenerateResultSchema.parse(await ipc.invoke(COACH_IPC_CHANNELS.generate, CoachGenerateRequestSchema.parse(value))); }
      catch { throw Error("m6d2_provider_operation_failed"); }
    },
  });
}

export interface IpcRendererInvokePort {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

function fixedError(error?: unknown): Error {
  if (
    error instanceof Error
    && MahjongSoulSourceErrorCodeSchema.safeParse(error.message).success
  ) {
    return new Error(error.message);
  }
  return new Error(PROTOCOL_ERROR);
}

export function createMahjongSoulPreloadApi(
  ipcRenderer: IpcRendererInvokePort,
): MahjongSoulDesktopApi {
  const rawInvoke = ipcRenderer !== null && typeof ipcRenderer === "object"
    ? ipcRenderer.invoke
    : undefined;
  if (
    typeof rawInvoke !== "function"
  ) {
    throw fixedError();
  }
  const invokePort = rawInvoke.bind(ipcRenderer) as IpcRendererInvokePort["invoke"];
  const invoke = async (channel: string): Promise<ReturnType<typeof parseMahjongSoulSessionStatus>> => {
    try {
      return parseMahjongSoulSessionStatus(await invokePort(channel));
    } catch (error) {
      throw fixedError(error);
    }
  };
  return Object.freeze({
    getSessionStatus: () => invoke(MAHJONG_SOUL_IPC_CHANNELS.getStatus),
    openMahjongSoulLogin: () => invoke(MAHJONG_SOUL_IPC_CHANNELS.openLogin),
    logoutMahjongSoul: () => invoke(MAHJONG_SOUL_IPC_CHANNELS.logout),
  });
}

export function createMahjongSoulCatalogPreloadApi(
  ipcRenderer: IpcRendererInvokePort,
): MahjongSoulCatalogApi {
  const rawInvoke = ipcRenderer !== null && typeof ipcRenderer === "object"
    ? ipcRenderer.invoke
    : undefined;
  if (typeof rawInvoke !== "function") {
    throw fixedError();
  }
  const invokePort = rawInvoke.bind(ipcRenderer) as IpcRendererInvokePort["invoke"];
  const invokeCatalog = async (channel: string): Promise<
    ReturnType<typeof parseAnalyzableRecordSummaries>
  > => {
    try {
      return parseAnalyzableRecordSummaries(await invokePort(channel));
    } catch (error) {
      throw fixedError(error);
    }
  };
  return Object.freeze({
    syncAnalyzableRecords: () =>
      invokeCatalog(MAHJONG_SOUL_CATALOG_IPC_CHANNELS.syncAnalyzableRecords),
    listAnalyzableRecords: () =>
      invokeCatalog(MAHJONG_SOUL_CATALOG_IPC_CHANNELS.listAnalyzableRecords),
    startRecordAnalysis: async (recordId: string) => {
      try {
        const value = await invokePort(MAHJONG_SOUL_CATALOG_IPC_CHANNELS.startRecordAnalysis, recordId);
        if (value === null || typeof value !== "object" || (value as { status?: unknown }).status !== "record_fetched") throw fixedError();
        return Object.freeze({ status: "record_fetched" as const });
      } catch (error) { throw fixedError(error); }
    },
  });
}
