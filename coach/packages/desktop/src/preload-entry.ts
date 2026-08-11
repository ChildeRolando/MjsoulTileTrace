import { contextBridge, ipcRenderer } from "electron";
import { createMahjongSoulPreloadApi } from "./preload.js";

contextBridge.exposeInMainWorld(
  "riichiCoach",
  createMahjongSoulPreloadApi(ipcRenderer),
);
