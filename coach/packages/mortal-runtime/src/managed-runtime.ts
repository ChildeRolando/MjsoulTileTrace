import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import {
  LocalMortalInferenceRequestSchema,
  LocalMortalInferenceResponseSchema,
  type LocalMortalInferenceRequest,
  type LocalMortalInferenceResponse,
  type ManagedMortalRuntimeIdentity,
  type ManagedMortalRuntimeManifest,
} from "@riichi-coach/contracts";
import { ManagedMortalRuntimeError, verifyManagedMortalArtifacts } from "./manifest.js";

const MAX_LINE_BYTES = 1_048_576;
const RESPONSE_QUIET_PERIOD_MS = 20;

export type ManagedMortalRuntimeOptions = Readonly<{
  executable: string;
  runtimePath: string;
  checkpointPath: string;
  mortalSourcePath: string;
  nativeModulePath: string;
  manifest: ManagedMortalRuntimeManifest;
  identity: ManagedMortalRuntimeIdentity;
  environment?: NodeJS.ProcessEnv;
  startTimeoutMs?: number;
  inferenceTimeoutMs?: number;
}>;

export class ManagedMortalRuntime {
  readonly #options: ManagedMortalRuntimeOptions;
  #child: ChildProcessWithoutNullStreams | null = null;
  #exitSignal: Promise<void> | null = null;
  #stdoutBuffer = Buffer.alloc(0);
  #pendingLine: string | null = null;
  #lineWaiter: { resolve: (line: string) => void; reject: (error: Error) => void } | null = null;
  #protocolFailed = false;

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
    this.#stdoutBuffer = Buffer.alloc(0);
    this.#pendingLine = null;
    this.#protocolFailed = false;
    child.stdout.on("data", (chunk: Buffer) => this.#acceptStdout(chunk));
    const ready = await this.#nextLine(this.#options.startTimeoutMs ?? 30_000, "mortal_runtime_unavailable");
    await this.#waitForQuietBoundary();
    if (ready !== JSON.stringify({ ready: true, protocolVersion: this.#options.identity.protocolVersion })) {
      await this.close();
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
    this.#assertNoUnsolicitedOutput();
  }

  async infer(raw: LocalMortalInferenceRequest): Promise<LocalMortalInferenceResponse> {
    let request: LocalMortalInferenceRequest;
    try {
      request = LocalMortalInferenceRequestSchema.parse(raw);
    } catch {
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
    if (JSON.stringify(request.identity) !== JSON.stringify(this.#options.identity)) {
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
    this.#assertNoUnsolicitedOutput();
    const payload = JSON.stringify(request);
    if (Buffer.byteLength(payload) > MAX_LINE_BYTES) {
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
    this.#child!.stdin.write(`${payload}\n`);
    try {
      const line = await this.#nextLine(this.#options.inferenceTimeoutMs ?? 30_000, "mortal_runtime_timeout");
      await this.#waitForQuietBoundary();
      this.#assertNoUnsolicitedOutput();
      let decoded: unknown;
      decoded = JSON.parse(line);
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
    } catch (error) {
      await this.close();
      if (error instanceof ManagedMortalRuntimeError) throw error;
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
  }

  #acceptStdout(chunk: Buffer): void {
    if (this.#protocolFailed) return;
    const combined = Buffer.concat([this.#stdoutBuffer, chunk]);
    let start = 0;
    for (let index = 0; index < combined.length; index++) {
      if (combined[index] !== 0x0a) continue;
      let end = index;
      if (end > start && combined[end - 1] === 0x0d) end--;
      if (end - start > MAX_LINE_BYTES) return this.#failProtocol();
      const line = combined.subarray(start, end).toString("utf8");
      start = index + 1;
      if (this.#lineWaiter !== null) {
        const waiter = this.#lineWaiter;
        this.#lineWaiter = null;
        waiter.resolve(line);
      } else if (this.#pendingLine === null) {
        this.#pendingLine = line;
      } else {
        return this.#failProtocol();
      }
    }
    this.#stdoutBuffer = combined.subarray(start);
    if (this.#stdoutBuffer.length > MAX_LINE_BYTES) this.#failProtocol();
  }

  #failProtocol(): void {
    this.#protocolFailed = true;
    this.#stdoutBuffer = Buffer.alloc(0);
    this.#pendingLine = null;
    const waiter = this.#lineWaiter;
    this.#lineWaiter = null;
    waiter?.reject(new ManagedMortalRuntimeError("mortal_protocol_invalid"));
    if (this.#child?.exitCode === null) this.#child.kill();
  }

  #assertNoUnsolicitedOutput(): void {
    if (this.#protocolFailed || this.#pendingLine !== null || this.#stdoutBuffer.length !== 0) {
      this.#failProtocol();
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
  }

  async #waitForQuietBoundary(): Promise<void> {
    await new Promise<void>((resolve) => {
      const handle = setTimeout(resolve, RESPONSE_QUIET_PERIOD_MS);
      handle.unref();
    });
  }

  async #nextLine(timeoutMs: number, timeoutCode: "mortal_runtime_unavailable" | "mortal_runtime_timeout"): Promise<string> {
    if (this.#child === null) throw new ManagedMortalRuntimeError("mortal_runtime_unavailable");
    if (this.#protocolFailed) throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    if (this.#pendingLine !== null) {
      const line = this.#pendingLine;
      this.#pendingLine = null;
      return line;
    }
    if (this.#lineWaiter !== null) throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
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
    const next = new Promise<string>((resolve, reject) => {
      this.#lineWaiter = { resolve, reject };
    });
    try {
      return await Promise.race([next, timer, exited]);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      this.#lineWaiter = null;
    }
  }

  async close(): Promise<void> {
    const child = this.#child;
    this.#child = null;
    this.#exitSignal = null;
    this.#lineWaiter = null;
    this.#stdoutBuffer = Buffer.alloc(0);
    this.#pendingLine = null;
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
