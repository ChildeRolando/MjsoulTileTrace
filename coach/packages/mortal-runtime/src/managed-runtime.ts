import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createInterface, type Interface } from "node:readline";
import {
  LocalMortalInferenceRequestSchema,
  LocalMortalInferenceResponseSchema,
  type LocalMortalInferenceRequest,
  type LocalMortalInferenceResponse,
  type ManagedMortalRuntimeManifest,
} from "@riichi-coach/contracts";
import { ManagedMortalRuntimeError, verifyManagedMortalArtifacts } from "./manifest.js";

const MAX_LINE_BYTES = 1_048_576;

export type ManagedMortalRuntimeOptions = Readonly<{
  executable: string;
  runtimePath: string;
  checkpointPath: string;
  mortalSourcePath: string;
  manifest: ManagedMortalRuntimeManifest;
  environment?: NodeJS.ProcessEnv;
  startTimeoutMs?: number;
  inferenceTimeoutMs?: number;
}>;

export class ManagedMortalRuntime {
  readonly #options: ManagedMortalRuntimeOptions;
  #child: ChildProcessWithoutNullStreams | null = null;
  #lines: Interface | null = null;
  #iterator: AsyncIterator<string> | null = null;
  #exitSignal: Promise<void> | null = null;

  constructor(options: ManagedMortalRuntimeOptions) {
    this.#options = options;
  }

  async start(): Promise<void> {
    if (this.#child !== null) return;
    await verifyManagedMortalArtifacts(this.#options);
    const child = spawn(this.#options.executable, [
      "-u", this.#options.runtimePath,
      "--checkpoint", this.#options.checkpointPath,
      "--mortal-source", this.#options.mortalSourcePath,
    ], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: this.#options.environment ?? process.env });
    this.#child = child;
    this.#exitSignal = new Promise((resolve) => {
      child.once("error", () => resolve());
      child.once("exit", () => resolve());
    });
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.#lines = lines;
    this.#iterator = lines[Symbol.asyncIterator]();
    const ready = await this.#nextLine(this.#options.startTimeoutMs ?? 30_000, "mortal_runtime_unavailable");
    if (ready !== JSON.stringify({ ready: true, protocolVersion: this.#options.manifest.identity.protocolVersion })) {
      await this.close();
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
  }

  async infer(raw: LocalMortalInferenceRequest): Promise<LocalMortalInferenceResponse> {
    const request = LocalMortalInferenceRequestSchema.parse(raw);
    if (JSON.stringify(request.identity) !== JSON.stringify(this.#options.manifest.identity)) {
      throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
    }
    const requestActions = request.candidates.map((candidate) => JSON.stringify(candidate.runtimeAction));
    if (new Set(requestActions).size !== requestActions.length) {
      throw new ManagedMortalRuntimeError("mortal_candidate_mismatch");
    }
    if (request.candidates.filter((candidate) => candidate.actionRef === request.actualActionRef).length !== 1) {
      throw new ManagedMortalRuntimeError("mortal_actual_action_mismatch");
    }
    if (this.#child === null) await this.start();
    const payload = JSON.stringify(request);
    if (Buffer.byteLength(payload) > MAX_LINE_BYTES) {
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
    this.#child!.stdin.write(`${payload}\n`);
    const line = await this.#nextLine(this.#options.inferenceTimeoutMs ?? 30_000, "mortal_runtime_timeout");
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(line);
    } catch {
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
    if (typeof decoded === "object" && decoded !== null &&
        "status" in decoded && decoded.status === "ok" &&
        "candidates" in decoded && Array.isArray(decoded.candidates) &&
        decoded.candidates.length !== request.candidates.length) {
      throw new ManagedMortalRuntimeError("mortal_candidate_mismatch");
    }
    let response: LocalMortalInferenceResponse;
    try {
      response = LocalMortalInferenceResponseSchema.parse(decoded);
    } catch {
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
    if (response.requestId !== request.requestId) {
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
    if (response.status === "ok") {
      if (JSON.stringify(response.decision) !== JSON.stringify(request.decision) ||
          JSON.stringify(response.identity) !== JSON.stringify(request.identity)) {
        throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
      }
      const expected = request.candidates.map((candidate) => JSON.stringify(candidate.runtimeAction)).sort();
      const actual = response.candidates.map((candidate) => JSON.stringify(candidate.runtimeAction)).sort();
      if (new Set(actual).size !== actual.length || JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new ManagedMortalRuntimeError("mortal_candidate_mismatch");
      }
      if (!expected.includes(JSON.stringify(response.preferredRuntimeAction))) {
        throw new ManagedMortalRuntimeError("mortal_candidate_mismatch");
      }
    }
    return response;
  }

  async #nextLine(timeoutMs: number, timeoutCode: "mortal_runtime_unavailable" | "mortal_runtime_timeout"): Promise<string> {
    if (this.#child === null || this.#iterator === null) throw new ManagedMortalRuntimeError("mortal_runtime_unavailable");
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timer = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new ManagedMortalRuntimeError(timeoutCode)), timeoutMs);
      timeoutHandle.unref();
    });
    const exited = this.#exitSignal!.then(() => {
      throw new ManagedMortalRuntimeError(
        timeoutCode === "mortal_runtime_unavailable" ? "mortal_runtime_unavailable" : "mortal_runtime_crash",
      );
    });
    const next = this.#iterator.next().then((value) => {
      if (value.done) throw new ManagedMortalRuntimeError("mortal_runtime_crash");
      return value.value;
    });
    try {
      return await Promise.race([next, timer, exited]);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  }

  async close(): Promise<void> {
    const child = this.#child;
    this.#child = null;
    this.#iterator = null;
    this.#exitSignal = null;
    this.#lines?.close();
    this.#lines = null;
    if (child === null || child.exitCode !== null) return;
    child.stdin.end();
    const exited = once(child, "exit");
    const forced = new Promise<void>((resolve) => {
      const handle = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolve();
      }, 1_000);
      handle.unref();
    });
    await Promise.race([exited.then(() => undefined), forced]);
  }
}
