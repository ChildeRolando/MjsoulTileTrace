import { contextBridge, ipcRenderer } from "electron";
import {
  createMahjongSoulCatalogPreloadApi,
  createMahjongSoulPreloadApi,
} from "./preload.js";

contextBridge.exposeInMainWorld(
  "riichiCoach",
  createMahjongSoulPreloadApi(ipcRenderer),
);
contextBridge.exposeInMainWorld(
  "riichiCoachCatalog",
  createMahjongSoulCatalogPreloadApi(ipcRenderer),
);
