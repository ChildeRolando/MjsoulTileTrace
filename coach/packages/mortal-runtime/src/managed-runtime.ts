import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import {
  LIBRIICHI_RULE_NORMALIZATION_VERSION,
  LibriichiRuleRequestSchema,
  LibriichiRuleResponseSchema,
  libriichiRuleCanonicalJson,
  type LibriichiRuleIdentity,
  type LibriichiRuleRequest,
  type LibriichiRuleResponse,
  LocalMortalInferenceRequestSchema,
  LocalMortalInferenceResponseSchema,
  type LocalMortalInferenceRequest,
  type LocalMortalInferenceResponse,
  type ManagedMortalRuntimeIdentity,
  type ManagedMortalRuntimeManifest,
} from "@riichi-coach/contracts";
import { ManagedMortalRuntimeError, verifyManagedLibriichiArtifacts, verifyManagedMortalArtifacts } from "./manifest.js";

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
  #startPromise: Promise<void> | null = null;
  #closeRequested = false;
  #ready = false;
  #exitSignal: Promise<void> | null = null;
  readonly #childExits = new WeakMap<ChildProcessWithoutNullStreams, Promise<void>>();
  #stdoutBuffer = Buffer.alloc(0);
  #pendingLine: string | null = null;
  #lineWaiter: { resolve: (line: string) => void; reject: (error: Error) => void } | null = null;
  #protocolFailed = false;
  #streamFailed = false;
  #operationTail: Promise<unknown> = Promise.resolve();
  #closeGeneration = 0;
  #operationGeneration = 0;
  #modelArtifactsVerified = false;

  constructor(options: ManagedMortalRuntimeOptions) {
    this.#options = options;
  }

  get ruleIdentity(): LibriichiRuleIdentity {
    return {
      implementation: "Equim-chan/Mortal/libriichi",
      revision: this.#options.identity.runtimeRevision,
      nativeArtifactSha256: this.#options.identity.nativeArtifactSha256,
      wrapperSha256: this.#options.identity.runtimeArtifactSha256,
      normalizationVersion: LIBRIICHI_RULE_NORMALIZATION_VERSION,
    };
  }

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const generation = this.#closeGeneration;
    const current = this.#operationTail.then(() => {
      this.#operationGeneration = generation;
      this.#assertOperationOpen();
      return operation();
    });
    this.#operationTail = current.catch(() => undefined);
    return current;
  }

  #assertOperationOpen(): void {
    if (this.#operationGeneration !== this.#closeGeneration) throw new ManagedMortalRuntimeError("mortal_runtime_unavailable");
  }

  async start(): Promise<void> {
    if (this.#ready && !this.#protocolFailed && !this.#streamFailed && this.#child !== null &&
        this.#child.exitCode === null && this.#child.signalCode === null) return;
    if (this.#startPromise !== null) return this.#startPromise;
    this.#closeRequested = false;
    const startPromise = this.#startOnce();
    this.#startPromise = startPromise;
    try {
      await startPromise;
    } finally {
      if (this.#startPromise === startPromise) this.#startPromise = null;
    }
  }

  async #startOnce(): Promise<void> {
    if (this.#child !== null) {
      const previous = this.#child;
      await this.#closeExactChild(previous);
      this.#clearChild(previous);
    }
    await verifyManagedLibriichiArtifacts(this.#options);
    if (this.#closeRequested) throw new ManagedMortalRuntimeError("mortal_runtime_unavailable");
    const child = spawn(this.#options.executable, [
      "-u", this.#options.runtimePath,
      "--checkpoint", this.#options.checkpointPath,
      "--mortal-source", this.#options.mortalSourcePath,
      "--native-module", this.#options.nativeModulePath,
    ], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: this.#options.environment ?? process.env });
    this.#child = child;
    this.#modelArtifactsVerified = false;
    // Register at spawn time: cleanup can run after exit, including signal exits.
    // A stream error is NOT proof that the process itself has exited.
    this.#childExits.set(child, new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.once("close", () => resolve());
      child.once("error", () => { if (child.pid === undefined) resolve(); });
    }));
    this.#ready = false;
    this.#streamFailed = false;
    this.#exitSignal = new Promise((resolve) => {
      child.once("error", () => resolve());
      child.once("exit", () => resolve());
      const streamError = () => {
        if (this.#child !== child) return;
        this.#streamFailed = true;
        this.#lineWaiter?.reject(new ManagedMortalRuntimeError("mortal_runtime_crash"));
        resolve();
      };
      child.stdin.on("error", streamError);
      child.stdout.on("error", streamError);
      child.stderr.on("error", streamError);
    });
    child.stderr.resume();
    this.#stdoutBuffer = Buffer.alloc(0);
    this.#pendingLine = null;
    this.#protocolFailed = false;
    child.stdout.on("data", (chunk: Buffer) => this.#acceptStdout(chunk));
    try {
      const ready = await this.#nextLine(this.#options.startTimeoutMs ?? 30_000, "mortal_runtime_unavailable");
      await this.#waitForQuietBoundary();
      if (ready !== JSON.stringify({ ready: true, protocolVersion: this.#options.identity.protocolVersion })) {
        throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
      }
      this.#assertNoUnsolicitedOutput();
      this.#ready = true;
    } catch (error) {
      await this.#closeExactChild(child);
      this.#clearChild(child);
      if (error instanceof ManagedMortalRuntimeError) throw error;
      throw new ManagedMortalRuntimeError("mortal_runtime_unavailable");
    }
  }

  infer(raw: LocalMortalInferenceRequest): Promise<LocalMortalInferenceResponse> {
    return this.#serialize(() => this.#inferOnce(raw));
  }

  async #inferOnce(raw: LocalMortalInferenceRequest): Promise<LocalMortalInferenceResponse> {
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
    try {
      // Verify before the child's first lazy model load. A successfully loaded
      // checkpoint remains in that exact process; hashing it on every decision
      // would repeatedly read the entire model hundreds of times per game.
      if (!this.#modelArtifactsVerified || !this.#ready || this.#child === null || this.#closeRequested) {
        await verifyManagedMortalArtifacts(this.#options);
      }
      this.#assertOperationOpen();
      if (!this.#ready || this.#child === null) await this.start();
      this.#assertOperationOpen();
      this.#assertNoUnsolicitedOutput();
      this.#modelArtifactsVerified = true;
      const payload = JSON.stringify(request);
      if (Buffer.byteLength(payload) > MAX_LINE_BYTES) {
        throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
      }
      this.#child!.stdin.write(`${payload}\n`);
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
      if (response.status === "error") this.#modelArtifactsVerified = false;
      return response;
    } catch (error) {
      await this.close();
      if (error instanceof ManagedMortalRuntimeError) throw error;
      throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
    }
  }

  queryRules(raw: LibriichiRuleRequest): Promise<LibriichiRuleResponse> {
    return this.#serialize(() => this.#queryRulesOnce(raw));
  }

  async #queryRulesOnce(raw: LibriichiRuleRequest): Promise<LibriichiRuleResponse> {
    const digest = (value: unknown) => createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");
    try {
      const request = LibriichiRuleRequestSchema.parse(raw);
      const { requestId, ...content } = request;
      if (requestId !== digest(content) || request.eventPrefixSha256 !== digest(request.events) ||
          request.events.at(-1)!.eventRef !== request.decision.triggerEventRef) {
        throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
      }
      if (libriichiRuleCanonicalJson(request.identity) !== libriichiRuleCanonicalJson(this.ruleIdentity)) {
        throw new ManagedMortalRuntimeError("mortal_runtime_identity_mismatch");
      }
      await verifyManagedLibriichiArtifacts(this.#options);
      this.#assertOperationOpen();
      if (!this.#ready || this.#child === null) await this.start();
      this.#assertOperationOpen();
      this.#assertNoUnsolicitedOutput();
      const payload = JSON.stringify(request);
      if (Buffer.byteLength(payload) > MAX_LINE_BYTES) throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
      this.#child!.stdin.write(`${payload}\n`);
      const line = await this.#nextLine(this.#options.inferenceTimeoutMs ?? 30_000, "mortal_runtime_timeout");
      await this.#waitForQuietBoundary();
      this.#assertNoUnsolicitedOutput();
      const response = LibriichiRuleResponseSchema.parse(JSON.parse(line));
      if (response.requestId !== requestId) throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
      if (response.status !== "error") {
        const { resultId, ...resultContent } = response;
        if (resultId !== digest(resultContent) ||
            libriichiRuleCanonicalJson(response.identity) !== libriichiRuleCanonicalJson(request.identity)) {
          throw new ManagedMortalRuntimeError("mortal_protocol_invalid");
        }
        if (response.status === "ok") {
          const keys = response.actions.map(action => libriichiRuleCanonicalJson(action.runtimeAction));
          if (new Set(keys).size !== keys.length) throw new ManagedMortalRuntimeError("mortal_candidate_mismatch");
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
    if (this.#streamFailed) throw new ManagedMortalRuntimeError("mortal_runtime_crash");
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
    if (this.#streamFailed) throw new ManagedMortalRuntimeError("mortal_runtime_crash");
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
    this.#closeGeneration++;
    this.#closeRequested = true;
    if (this.#startPromise !== null) {
      try { await this.#startPromise; } catch { /* Startup failure still requires cleanup below. */ }
    }
    const child = this.#child;
    this.#ready = false;
    if (child === null) return;
    await this.#closeExactChild(child);
    this.#clearChild(child);
  }

  #clearChild(child: ChildProcessWithoutNullStreams): void {
    if (this.#child !== child) return;
    this.#child = null;
    this.#exitSignal = null;
    this.#lineWaiter = null;
    this.#stdoutBuffer = Buffer.alloc(0);
    this.#pendingLine = null;
    this.#protocolFailed = false;
    this.#ready = false;
    this.#modelArtifactsVerified = false;
  }

  async #closeExactChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
    const exited = this.#childExits.get(child)!;
    child.stdin.end();
    const waitBounded = async (): Promise<boolean> => {
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          exited.then(() => true),
          new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), 1_000); }),
        ]);
      } finally { clearTimeout(timer); }
    };
    if (await waitBounded()) return;
    child.kill("SIGKILL");
    if (!await waitBounded()) throw new ManagedMortalRuntimeError("mortal_runtime_crash");
  }
}
