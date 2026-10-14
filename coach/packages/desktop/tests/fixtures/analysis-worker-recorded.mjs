// Private benchmark entry: fixed real native/helper replies isolate package
// work from inference timing. Production never selects this worker entry.
import { readFileSync, writeFileSync } from "node:fs";
import { parentPort } from "node:worker_threads";
import { Session } from "node:inspector";
import { createHash } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { JsonlFactEngineClient } from "@riichi-coach/reasoning";
import { ManagedMortalRuntime } from "@riichi-coach/mortal-runtime";
const captured = JSON.parse(readFileSync(process.env.RIICHI_ANALYSIS_RECORDED_RESPONSES, "utf8"));
const replies = new Map(captured.responses);
const answer = async (method, request) => {
  await setImmediate();
  const key = method + ":" + createHash("sha256").update(JSON.stringify(request)).digest("hex");
  if (!replies.has(key)) throw new Error("unrecorded_request");
  return structuredClone(replies.get(key));
};
for (const method of ["analyzeHand13", "analyzeHandStructure", "analyzeCompletedHand", "analyzeThreatRisk"]) {
  JsonlFactEngineClient.prototype[method] = request => answer(method, request);
}
JsonlFactEngineClient.prototype.identity = async () => captured.factIdentity;
for (const method of ["queryRules", "scoreRules"]) ManagedMortalRuntime.prototype[method] = request => answer(method, request);
if (process.env.RIICHI_ANALYSIS_CPU_PROFILE) {
  const session = new Session(); session.connect();
  const post = (method) => new Promise((resolve, reject) => session.post(method, (error, result) => error ? reject(error) : resolve(result)));
  await post("Profiler.enable"); await post("Profiler.start");
  const original = parentPort.postMessage.bind(parentPort);
  parentPort.postMessage = message => {
    if (message.type === "result" || message.type === "failed") {
      session.post("Profiler.stop", (error, result) => {
        if (!error) writeFileSync(process.env.RIICHI_ANALYSIS_CPU_PROFILE, JSON.stringify(result.profile));
        session.disconnect();
      });
    }
    return original(message);
  };
}
await import("../../dist/analysis-worker.js");
