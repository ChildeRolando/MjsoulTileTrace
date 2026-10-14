import { parentPort, workerData } from "node:worker_threads";
const mode = workerData.testMode;
if (mode === "crash") throw Error("private_failure_with_path");
parentPort.on("message", () => { parentPort.postMessage({ type: "failed" }); parentPort.close(); });
if (mode === "cancel") {
  // Remain alive until the host closes; there is no orphaned task afterwards.
} else if (mode === "invalid") parentPort.postMessage({ type: "result", result: { sessionId: "s", packageId: "p", package: {} } });
else {
  const until = performance.now() + 150;
  while (performance.now() < until) { /* Deliberately synchronous worker load. */ }
  parentPort.postMessage({ type: "progress", progress: { stage: "saving", completed: 0, total: null } });
  parentPort.postMessage({ type: "result", result: { sessionId: "saved-session", packageId: "saved-package" } });
  parentPort.close();
}
