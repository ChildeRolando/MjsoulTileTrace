import { parentPort } from "node:worker_threads";

parentPort.postMessage({ type: "ready", protocolVersion: 1 });
parentPort.on("message", message => {
  if (message?.type === "request") {
    parentPort.postMessage({
      type: "response",
      id: message.id,
      ok: true,
      payload: { configured: true, settings: null, secret: "MUST_NOT_ESCAPE" },
    });
  } else if (message?.type === "close") {
    parentPort.postMessage({ type: "closed", id: message.id });
    parentPort.close();
  }
});
