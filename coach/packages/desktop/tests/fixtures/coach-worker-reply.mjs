import { parentPort } from "node:worker_threads";

parentPort.postMessage({ type: "ready", protocolVersion: 1 });
parentPort.on("message", message => {
  if (message?.type === "request") {
    setTimeout(() => {
      parentPort.postMessage({
        type: "response",
        id: message.id,
        ok: true,
        payload: { status: "failed", code: "generation_failed" },
      });
    }, 100);
  } else if (message?.type === "close") {
    parentPort.postMessage({ type: "closed", id: message.id });
    parentPort.close();
  }
});
