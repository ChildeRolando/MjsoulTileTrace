import { MahjongSoulSourceErrorCodeSchema } from "@riichi-coach/contracts";
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
