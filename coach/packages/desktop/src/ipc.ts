import {
  MahjongSoulSourceErrorCodeSchema,
  type MahjongSoulSessionStatus,
} from "@riichi-coach/contracts";
import type { MahjongSoulSessionController } from "@riichi-coach/mahjong-soul-source";
import { parseMahjongSoulSessionStatus } from "./session-api.js";
import { parseAnalyzableRecordSummaries } from "./catalog-api.js";
import type { MahjongSoulCatalogService } from "./catalog-service.js";
import type { MahjongSoulRecordIngestionService } from "./record-ingestion-service.js";

const PROTOCOL_ERROR = "mahjong_soul_login_protocol_unsupported" as const;

export const MAHJONG_SOUL_IPC_CHANNELS = Object.freeze({
  getStatus: "mahjong-soul:get-session-status",
  openLogin: "mahjong-soul:open-login",
  logout: "mahjong-soul:logout",
} as const);

export const MAHJONG_SOUL_CATALOG_IPC_CHANNELS = Object.freeze({
  syncAnalyzableRecords: "mahjong-soul:sync-analyzable-records",
  listAnalyzableRecords: "mahjong-soul:list-analyzable-records",
  startRecordAnalysis: "mahjong-soul:start-record-analysis",
} as const);

export interface IpcMainPort {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
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

function senderId(event: unknown): number | null {
  if (event === null || typeof event !== "object") return null;
  const sender = (event as { sender?: unknown }).sender;
  if (sender === null || typeof sender !== "object") return null;
  const id = (sender as { id?: unknown }).id;
  return typeof id === "number" && Number.isInteger(id) && id >= 0 ? id : null;
}

export function registerMahjongSoulIpc(input: {
  readonly ipcMain: IpcMainPort;
  readonly service: Pick<MahjongSoulSessionController, "getStatus" | "openLogin" | "logout">;
  readonly trustedSenderId: number;
}): Readonly<{ dispose(): void }> {
  const { ipcMain, service, trustedSenderId } = input;
  const getStatus = service?.getStatus;
  const openLogin = service?.openLogin;
  const logout = service?.logout;
  if (
    ipcMain === null
    || typeof ipcMain !== "object"
    || typeof ipcMain.handle !== "function"
    || typeof ipcMain.removeHandler !== "function"
    || service === null
    || typeof service !== "object"
    || typeof getStatus !== "function"
    || typeof openLogin !== "function"
    || typeof logout !== "function"
    || !Number.isInteger(trustedSenderId)
    || trustedSenderId < 0
  ) {
    throw fixedError();
  }
  const operations = Object.freeze({
    getStatus: getStatus.bind(service) as typeof getStatus,
    openLogin: openLogin.bind(service) as typeof openLogin,
    logout: logout.bind(service) as typeof logout,
  });

  const register = (
    channel: string,
    operation: () => MahjongSoulSessionStatus | Promise<MahjongSoulSessionStatus>,
  ): void => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        if (args.length !== 0 || senderId(event) !== trustedSenderId) {
          throw fixedError();
        }
        return parseMahjongSoulSessionStatus(await operation());
      } catch (error) {
        throw fixedError(error);
      }
    });
  };

  register(MAHJONG_SOUL_IPC_CHANNELS.getStatus, operations.getStatus);
  register(MAHJONG_SOUL_IPC_CHANNELS.openLogin, operations.openLogin);
  register(MAHJONG_SOUL_IPC_CHANNELS.logout, operations.logout);

  return Object.freeze({
    dispose(): void {
      for (const channel of Object.values(MAHJONG_SOUL_IPC_CHANNELS)) {
        ipcMain.removeHandler(channel);
      }
    },
  });
}

export function registerMahjongSoulCatalogIpc(input: {
  readonly ipcMain: IpcMainPort;
  readonly service: Pick<
    MahjongSoulCatalogService,
    "syncAnalyzableRecords" | "listAnalyzableRecords"
  > & Pick<MahjongSoulRecordIngestionService, "ingest">;
  readonly trustedSenderId: number;
}): Readonly<{ dispose(): void }> {
  const { ipcMain, service, trustedSenderId } = input;
  const syncAnalyzableRecords = service?.syncAnalyzableRecords;
  const listAnalyzableRecords = service?.listAnalyzableRecords;
  const ingest = service?.ingest;
  if (
    ipcMain === null
    || typeof ipcMain !== "object"
    || typeof ipcMain.handle !== "function"
    || typeof ipcMain.removeHandler !== "function"
    || service === null
    || typeof service !== "object"
    || typeof syncAnalyzableRecords !== "function"
    || typeof listAnalyzableRecords !== "function"
    || typeof ingest !== "function"
    || !Number.isInteger(trustedSenderId)
    || trustedSenderId < 0
  ) {
    throw fixedError();
  }

  const operations = Object.freeze({
    syncAnalyzableRecords: syncAnalyzableRecords.bind(service) as typeof syncAnalyzableRecords,
    listAnalyzableRecords: listAnalyzableRecords.bind(service) as typeof listAnalyzableRecords,
  });

  const register = (
    channel: string,
    operation: () => Promise<unknown>,
  ): void => {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        if (args.length !== 0 || senderId(event) !== trustedSenderId) {
          throw fixedError();
        }
        return parseAnalyzableRecordSummaries(await operation());
      } catch (error) {
        throw fixedError(error);
      }
    });
  };

  register(
    MAHJONG_SOUL_CATALOG_IPC_CHANNELS.syncAnalyzableRecords,
    operations.syncAnalyzableRecords,
  );
  register(
    MAHJONG_SOUL_CATALOG_IPC_CHANNELS.listAnalyzableRecords,
    operations.listAnalyzableRecords,
  );
  ipcMain.handle(MAHJONG_SOUL_CATALOG_IPC_CHANNELS.startRecordAnalysis, async (event, ...args) => {
    try {
      if (senderId(event) !== trustedSenderId || args.length !== 1 || typeof args[0] !== "string") throw fixedError();
      const fetched = await ingest.call(service, args[0]);
      if (fetched.recordId !== args[0] || fetched.actionCount < 1) throw fixedError();
      return Object.freeze({ status: "record_fetched" as const });
    } catch (error) {
      throw fixedError(error);
    }
  });

  return Object.freeze({
    dispose(): void {
      for (const channel of Object.values(MAHJONG_SOUL_CATALOG_IPC_CHANNELS)) {
        ipcMain.removeHandler(channel);
      }
    },
  });
}
