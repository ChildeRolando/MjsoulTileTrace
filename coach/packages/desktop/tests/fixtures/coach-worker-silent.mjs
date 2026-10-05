import { parentPort } from "node:worker_threads";

parentPort.postMessage({ type: "ready", protocolVersion: 1 });
parentPort.on("message", () => {});
