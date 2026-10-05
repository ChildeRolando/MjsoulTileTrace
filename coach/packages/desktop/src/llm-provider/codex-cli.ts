import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, relative, resolve, sep } from "node:path";
import {
  COACH_CLAIM_NODE_KINDS, CodexCoachProviderConfigSchema, LlmCoachRequestSchema,
  type CodexCoachProviderConfig, type LlmCoachErrorCode, type LlmCoachProvider,
  type LlmCoachRequest, type LlmCoachResult, type LlmProviderDescriptor,
  type LlmTokenUsage,
} from "@riichi-coach/contracts";
import { combineReportedTokenUsage, normalizeTokenUsage } from "./token-usage.js";

const SUPPORTED_CLI_VERSION = "0.155.1";
const MAX_PROMPT_BYTES = 1 * 1024 * 1024;
const MAX_STDIO_BYTES = 2 * 1024 * 1024;
const MAX_EVENT_LINE_BYTES = 1024 * 1024;
const MAX_STATUS_OUTPUT_BYTES = 8 * 1024;
const DEFAULT_TURN_TIMEOUT_MS = 120_000;
const DEFAULT_STATUS_TIMEOUT_MS = 5_000;
const KILL_GRACE_MS = 1_000;

/**
 * Only tool-like stable features present in the validated 0.155.1 catalog are
 * disabled here. These are per-invocation overrides, not writes to config.toml.
 * Authentication storage stays enabled so an existing ChatGPT login can be used.
 * `code_mode_host` stays at its default: the CLI needs that host for `exec`,
 * while the separate `code_mode` feature remains disabled and tool surfaces below stay off.
 */
export const CODEX_DISABLED_FEATURES = Object.freeze([
  "apps",
  "auth_elicitation",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "computer_use",
  "fast_mode",
  "goals",
  "guardian_approval",
  "hooks",
  "image_generation",
  "in_app_browser",
  "in_app_chat",
  "in_app_dictation",
  "in_app_local_automation",
  "in_app_updates",
  "memories",
  "mentions_v2",
  "multi_agent",
  "plugin_sharing",
  "plugins",
  "remote_plugin",
  "shell_snapshot",
  "shell_tool",
  "skill_mcp_dependency_install",
  "skill_search",
  "sleep_tool",
  "tool_call_mcp_elicitation",
  "tool_suggest",
  "unbounded_connection_retries",
  "unified_exec",
  "unified_exec_tty",
  "view_image",
  "workspace_dependencies",
] as const);

/** The only file the adapter writes is this non-secret final-output schema. */
export const CODEX_COACH_OUTPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          decisionId: { type: "string", minLength: 1 },
          judgment: {
            type: "object",
            additionalProperties: false,
            properties: {
              localId: { type: "string", minLength: 1 },
              recommendation: { type: "string", minLength: 1 },
              confidence: { enum: ["high", "medium", "low"] },
              premiseRefs: {
                type: "array",
                minItems: 1,
                items: { type: "string", minLength: 1 },
              },
            },
            required: ["localId", "recommendation", "confidence", "premiseRefs"],
          },
          inferences: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                localId: { type: "string", minLength: 1 },
                statement: { type: "string", minLength: 1 },
                premiseRefs: {
                  type: "array",
                  items: { type: "string", minLength: 1 },
                },
              },
              required: ["localId", "statement", "premiseRefs"],
            },
          },
          explanations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string", minLength: 1 },
                claims: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      kind: { enum: Object.keys(COACH_CLAIM_NODE_KINDS) },
                      evidenceRef: { type: "string", minLength: 1 },
                    },
                    required: ["kind", "evidenceRef"],
                  },
                },
                judgmentLocalRef: { type: "string", minLength: 1 },
              },
              required: ["text", "claims", "judgmentLocalRef"],
            },
          },
        },
        required: ["decisionId", "judgment", "inferences", "explanations"],
      },
    },
  },
  required: ["decisions"],
} as const;

type ProcessPort = {
  findExecutable(): string | null;
  spawn: typeof spawn;
  makeTempDirectory(): Promise<string>;
  removeTempDirectory(path: string): Promise<void>;
  removeTempDirectorySync(path: string): void;
};

export type CodexCoachProcessPort = ProcessPort;

function nativeCodexPath(): string | null {
  if (process.platform !== "win32") return null;
  const appData = process.env.APPDATA;
  if (typeof appData !== "string" || appData.length === 0) return null;
  const nativePackage = process.arch === "arm64" ? "codex-win32-arm64"
    : process.arch === "x64" ? "codex-win32-x64" : null;
  const target = process.arch === "arm64" ? "aarch64-pc-windows-msvc"
    : process.arch === "x64" ? "x86_64-pc-windows-msvc" : null;
  if (nativePackage === null || target === null) return null;
  const packageRoot = join(appData, "npm", "node_modules", "@openai", "codex");
  const candidates = [
    join(packageRoot, "node_modules", "@openai", nativePackage, "vendor", target, "bin", "codex.exe"),
    join(packageRoot, "vendor", target, "bin", "codex.exe"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function isOwnedTempDirectory(path: string): boolean {
  const root = resolve(tmpdir());
  const target = resolve(path);
  const rel = relative(root, target);
  return rel.length > 0 && rel !== ".." && !rel.startsWith(".." + sep)
    && target.split(/[\\/]/).at(-1)?.startsWith("riichi-coach-codex-") === true;
}

function removeOwnedTempDirectory(path: string): Promise<void> {
  if (!isOwnedTempDirectory(path)) return Promise.reject(new Error("provider_unavailable"));
  return rm(path, { recursive: true, force: true });
}

function removeOwnedTempDirectorySync(path: string): void {
  if (!isOwnedTempDirectory(path)) return;
  try { rmSync(path, { recursive: true, force: true }); } catch { /* process is already exiting */ }
}

const defaultProcessPort: ProcessPort = Object.freeze({
  findExecutable: nativeCodexPath,
  spawn,
  makeTempDirectory: () => mkdtemp(join(tmpdir(), "riichi-coach-codex-")),
  removeTempDirectory: removeOwnedTempDirectory,
  removeTempDirectorySync: removeOwnedTempDirectorySync,
});

function safeEnvironment(): NodeJS.ProcessEnv {
  const source = process.env;
  const result: NodeJS.ProcessEnv = {};
  const names = [
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
    "http_proxy", "https_proxy", "all_proxy", "no_proxy",
    "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
    "HOME", "CODEX_HOME", "TEMP", "TMP", "SystemRoot", "WINDIR",
  ] as const;
  for (const name of names) {
    if (source[name] !== undefined) result[name] = source[name];
  }
  const systemRoot = source.SystemRoot ?? source.WINDIR;
  if (systemRoot !== undefined) result.PATH = [join(systemRoot, "System32"), systemRoot].join(delimiter);
  return result;
}

function disableToolFeatures(args: string[]): void {
  for (const feature of CODEX_DISABLED_FEATURES) args.push("--disable", feature);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseUsage(value: unknown): LlmTokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  return normalizeTokenUsage({
    inputTokens: value.input_tokens,
    cachedInputTokens: value.cached_input_tokens,
    outputTokens: value.output_tokens,
  }, true);
}

function usageFromEvent(value: unknown): LlmTokenUsage | undefined {
  return isRecord(value) ? parseUsage(value.usage) : undefined;
}

type InternalFailure = {
  errorCode: LlmCoachErrorCode;
  retryable: boolean;
  usage?: LlmTokenUsage;
};

type ExecResult =
  | { kind: "success"; content: string; usage?: LlmTokenUsage }
  | { kind: "failure"; failure: InternalFailure };

function failure(errorCode: LlmCoachErrorCode, retryable = false, usage?: LlmTokenUsage): ExecResult {
  return { kind: "failure", failure: { errorCode, retryable, ...(usage === undefined ? {} : { usage }) } };
}

function safeFailureCode(value: unknown): InternalFailure {
  switch (value) {
    case "timeout": return { errorCode: "timeout", retryable: true };
    case "rate_limited":
    case "rate_limit_exceeded": return { errorCode: "rate_limited", retryable: true };
    case "server_error":
    case "server_error_retryable": return { errorCode: "server_error", retryable: true };
    case "network_reset": return { errorCode: "network_reset", retryable: true };
    case "connection_failed": return { errorCode: "connection_failed", retryable: true };
    default: return { errorCode: "connection_failed", retryable: false };
  }
}

function asBuffer(chunk: Buffer | string | Uint8Array): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  return typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
}

type SmallCommandResult = {
  exitCode: number | null;
  matchesExpected: boolean;
  timedOut: boolean;
  exceeded: boolean;
  cleanupDeferred: boolean;
};

function runSmallCommand(input: {
  executable: string;
  args: string[];
  cwd: string;
  port: ProcessPort;
  timeoutMs: number;
  expected: { stdout?: string; stderr?: string };
}): Promise<SmallCommandResult | null> {
  return new Promise((resolvePromise) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = input.port.spawn(input.executable, input.args, {
        cwd: input.cwd,
        env: safeEnvironment(),
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      }) as ChildProcessWithoutNullStreams;
    } catch {
      resolvePromise(null);
      return;
    }
    let settled = false;
    let childClosed = false;
    let timedOut = false;
    let exceeded = false;
    let killing = false;
    let cleanupDeferred = false;
    let byteCount = 0;
    let stdoutBytes = 0;
    const stderrOutput: Buffer[] = [];
    let stderrBytes = 0;
    const output: Buffer[] = [];
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let killGrace: ReturnType<typeof setTimeout> | undefined;
    const settle = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(killGrace);
      if (childClosed) process.removeListener("exit", exitCleanup);
      resolvePromise({
        exitCode: code,
        matchesExpected: !exceeded && ((input.expected.stdout !== undefined
          && Buffer.concat(output, stdoutBytes).toString("utf8").trim() === input.expected.stdout)
          || (input.expected.stderr !== undefined
            && Buffer.concat(stderrOutput, stderrBytes).toString("utf8").trim() === input.expected.stderr)),
        timedOut,
        exceeded,
        cleanupDeferred,
      });
    };
    const exitCleanup = () => {
      try { child.kill(); } catch { /* best effort during process shutdown */ }
      input.port.removeTempDirectorySync(input.cwd);
    };
    process.once("exit", exitCleanup);
    const kill = () => {
      if (settled || killing) return;
      killing = true;
      killGrace = setTimeout(() => {
        if (childClosed) return;
        cleanupDeferred = true;
        settle(null);
      }, KILL_GRACE_MS);
      try { child.kill(); } catch { /* fixed failure below */ }
    };
    timeout = setTimeout(() => {
      timedOut = true;
      kill();
    }, input.timeoutMs);
    const countBytes = (chunk: Buffer | string | Uint8Array, retain: "stdout" | "stderr" | null) => {
      const bytes = asBuffer(chunk);
      byteCount += bytes.byteLength;
      if (byteCount > MAX_STATUS_OUTPUT_BYTES) {
        exceeded = true;
        kill();
        return;
      }
      if (retain === "stdout") {
        output.push(bytes);
        stdoutBytes += bytes.byteLength;
      } else if (retain === "stderr") {
        stderrOutput.push(bytes);
        stderrBytes += bytes.byteLength;
      }
    };
    child.stdout.on("data", (chunk: Buffer | string | Uint8Array) => countBytes(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer | string | Uint8Array) => countBytes(chunk, "stderr"));
    child.stdin.on("error", kill);
    child.once("error", kill);
    child.once("close", (code) => {
      childClosed = true;
      process.removeListener("exit", exitCleanup);
      if (cleanupDeferred) void input.port.removeTempDirectory(input.cwd).catch(() => undefined);
      settle(code);
    });
    child.stdin.end();
  });
}

function availabilityArgs(command: "version" | "login"): string[] {
  // These commands do not create an agent turn or expose model tools. Keep
  // their arguments to the CLI's non-interactive status surface.
  return command === "version" ? ["--version"] : ["login", "status"];
}

/**
 * Checks only the installed CLI version and the fixed ChatGPT login status.
 * It does not start a model turn and never returns CLI output or a path.
 */
export async function getCodexCoachAvailability(
  processPort: CodexCoachProcessPort = defaultProcessPort,
): Promise<boolean> {
  let executable: string | null;
  try { executable = processPort.findExecutable(); } catch { return false; }
  if (executable === null) return false;
  return codexExecutableAvailability(executable, processPort);
}

async function codexExecutableAvailability(
  executable: string,
  processPort: CodexCoachProcessPort,
): Promise<boolean> {
  let cwd: string | undefined;
  let deferCwdCleanup = false;
  try {
    cwd = await processPort.makeTempDirectory();
    const version = await runSmallCommand({
      executable,
      args: availabilityArgs("version"),
      cwd,
      port: processPort,
      timeoutMs: DEFAULT_STATUS_TIMEOUT_MS,
      expected: { stdout: "codex-cli " + SUPPORTED_CLI_VERSION },
    });
    if (version?.cleanupDeferred) deferCwdCleanup = true;
    if (version === null || version.cleanupDeferred || version.exceeded || version.timedOut || version.exitCode !== 0 || !version.matchesExpected) return false;
    const login = await runSmallCommand({
      executable,
      args: availabilityArgs("login"),
      cwd,
      port: processPort,
      timeoutMs: DEFAULT_STATUS_TIMEOUT_MS,
      expected: { stdout: "Logged in using ChatGPT", stderr: "Logged in using ChatGPT" },
    });
    if (login?.cleanupDeferred) deferCwdCleanup = true;
    return login !== null && !login.cleanupDeferred && !login.exceeded && !login.timedOut
      && login.exitCode === 0 && login.matchesExpected;
  } catch {
    return false;
  } finally {
    if (cwd !== undefined && !deferCwdCleanup) await processPort.removeTempDirectory(cwd).catch(() => undefined);
  }
}

function eventRecord(line: Buffer): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line.toString("utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseEvent(
  event: Record<string, unknown>,
  state: {
    threadStarted: boolean;
    turnStarted: boolean;
    turnCompleted: boolean;
    finalText?: string;
    usage?: LlmTokenUsage;
    terminalFailure?: InternalFailure;
  },
): InternalFailure | null {
  if (state.turnCompleted || state.terminalFailure !== undefined) {
    return { errorCode: "connection_failed", retryable: false };
  }
  switch (event.type) {
    case "thread.started":
      if (state.threadStarted || state.turnStarted) return { errorCode: "connection_failed", retryable: false };
      state.threadStarted = true;
      return null;
    case "turn.started":
      if (!state.threadStarted || state.turnStarted) return { errorCode: "connection_failed", retryable: false };
      state.turnStarted = true;
      return null;
    case "item.started":
    case "item.updated":
    case "item.completed": {
      if (!state.threadStarted || !state.turnStarted || !isRecord(event.item)) {
        return { errorCode: "connection_failed", retryable: false };
      }
      const item = event.item;
      if (item.type !== "agent_message" && item.type !== "reasoning") {
        return { errorCode: "connection_failed", retryable: false };
      }
      // Reasoning item payloads are deliberately never copied out of the event.
      if (event.type === "item.completed" && item.type === "agent_message") {
        if (state.finalText !== undefined || typeof item.text !== "string" || item.text.length === 0) {
          return { errorCode: "connection_failed", retryable: false };
        }
        state.finalText = item.text;
      }
      return null;
    }
    case "turn.completed":
      if (!state.threadStarted || !state.turnStarted) return { errorCode: "connection_failed", retryable: false };
      {
        const usage = usageFromEvent(event);
        if (usage !== undefined) state.usage = usage;
      }
      state.turnCompleted = true;
      return null;
    case "turn.failed": {
      if (!state.threadStarted || !state.turnStarted) return { errorCode: "connection_failed", retryable: false };
      const error = safeFailureCode(isRecord(event.error) ? event.error.code : undefined);
      const usage = usageFromEvent(event) ?? (isRecord(event.error) ? usageFromEvent(event.error) : undefined);
      if (usage !== undefined) error.usage = usage;
      return error;
    }
    default:
      return { errorCode: "connection_failed", retryable: false };
  }
}

function requestArgs(input: {
  modelName: string;
  reasoningEffort: string;
  cwd: string;
  schemaPath: string;
}): string[] {
  const args = [
    "exec",
    "--model", input.modelName,
    "--config", "model_reasoning_effort=" + input.reasoningEffort,
    "--config", "web_search=disabled",
    "--ephemeral",
    "--ignore-user-config",
    "--sandbox", "read-only",
    "--strict-config",
    "--skip-git-repo-check",
    "--json",
    "--output-schema", input.schemaPath,
    "--cd", input.cwd,
  ];
  disableToolFeatures(args);
  args.push("-");
  return args;
}

async function runExecAttempt(input: {
  port: ProcessPort;
  executable: string;
  request: LlmCoachRequest;
  modelName: string;
  reasoningEffort: string;
  timeoutMs: number;
  maxOutputBytes: number;
  signal?: AbortSignal;
  cancelled: () => boolean;
}): Promise<ExecResult> {
  let cwd: string | undefined;
  let child: ChildProcessWithoutNullStreams | undefined;
  let processExit: (() => void) | undefined;
  let deferCwdCleanupUntilClose = false;
  try {
    const prompt = Buffer.from(input.request.prompt, "utf8");
    if (prompt.byteLength > MAX_PROMPT_BYTES || input.cancelled()) return failure("provider_unavailable");
    cwd = await input.port.makeTempDirectory();
    if (input.cancelled()) return failure("provider_unavailable");
    const schemaPath = join(cwd, "coach-reasoning-draft-v1.schema.json");
    await writeFile(schemaPath, JSON.stringify(CODEX_COACH_OUTPUT_SCHEMA), { encoding: "utf8", flag: "wx", mode: 0o600 });
    if (input.cancelled()) return failure("provider_unavailable");

    return await new Promise<ExecResult>((resolvePromise) => {
      const state: {
        threadStarted: boolean;
        turnStarted: boolean;
        turnCompleted: boolean;
        finalText?: string;
        usage?: LlmTokenUsage;
        terminalFailure?: InternalFailure;
      } = { threadStarted: false, turnStarted: false, turnCompleted: false };
      let settled = false;
      let forcedFailure: InternalFailure | undefined;
      let totalBytes = 0;
      let pending = Buffer.alloc(0);
      let timedOut = false;
      let processError = false;
      let exitCode: number | null = null;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let killGrace: ReturnType<typeof setTimeout> | undefined;
      let killing = false;
      let childClosed = false;
      let terminationUnconfirmed = false;
      const finish = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(killGrace);
        if (childClosed && processExit !== undefined) process.removeListener("exit", processExit);
        if (terminationUnconfirmed) {
          const previous = forcedFailure ?? state.terminalFailure;
          const usage = state.usage ?? previous?.usage;
          resolvePromise({ kind: "failure", failure: {
            errorCode: previous?.errorCode ?? (timedOut ? "timeout" : "connection_failed"),
            retryable: false,
            ...(usage === undefined ? {} : { usage }),
          } });
          return;
        }
        if (forcedFailure !== undefined) {
          resolvePromise({ kind: "failure", failure: { ...forcedFailure, ...(state.usage === undefined ? {} : { usage: state.usage }) } });
          return;
        }
        if (state.terminalFailure !== undefined) {
          resolvePromise({ kind: "failure", failure: {
            ...state.terminalFailure,
            ...(state.terminalFailure.usage === undefined && state.usage !== undefined ? { usage: state.usage } : {}),
          } });
          return;
        }
        if (timedOut) {
          resolvePromise(failure("timeout", true, state.usage));
          return;
        }
        if (processError || code !== 0 || exitCode !== 0) {
          resolvePromise(failure("connection_failed", false, state.usage));
          return;
        }
        if (pending.length > 0) {
          consumeLine(pending);
          pending = Buffer.alloc(0);
          if (forcedFailure !== undefined) {
            resolvePromise({ kind: "failure", failure: forcedFailure });
            return;
          }
          if (state.terminalFailure !== undefined) {
            resolvePromise({ kind: "failure", failure: state.terminalFailure });
            return;
          }
        }
        if (!state.turnCompleted || state.finalText === undefined) {
          resolvePromise(failure("connection_failed", false, state.usage));
          return;
        }
        resolvePromise({ kind: "success", content: state.finalText, ...(state.usage === undefined ? {} : { usage: state.usage }) });
      };
      const kill = (reason?: InternalFailure) => {
        if (reason !== undefined && forcedFailure === undefined && state.terminalFailure === undefined) forcedFailure = reason;
        if (killing || settled) return;
        killing = true;
        killGrace = setTimeout(() => {
          if (childClosed) return;
          terminationUnconfirmed = true;
          deferCwdCleanupUntilClose = true;
          finish(exitCode);
        }, KILL_GRACE_MS);
        try { child?.kill(); } catch { /* fixed failure returned after close or kill grace */ }
      };
      const failAndKill = (reason: InternalFailure) => {
        if (forcedFailure !== undefined || state.terminalFailure !== undefined || settled) return;
        kill(reason);
      };
      const consumeLine = (line: Buffer) => {
        if (line.length === 0) return;
        if (line.byteLength > MAX_EVENT_LINE_BYTES) {
          failAndKill({ errorCode: "connection_failed", retryable: false });
          return;
        }
        const event = eventRecord(line);
        if (event === null) {
          failAndKill({ errorCode: "connection_failed", retryable: false });
          return;
        }
        const problem = parseEvent(event, state);
        if (problem !== null) {
          if (event.type === "turn.failed") {
            state.terminalFailure = problem;
            kill();
          } else failAndKill(problem);
        }
      };
      const onStdout = (chunk: Buffer | string | Uint8Array) => {
        if (forcedFailure !== undefined || state.terminalFailure !== undefined || settled) return;
        const bytes = asBuffer(chunk);
        totalBytes += bytes.byteLength;
        if (totalBytes > input.maxOutputBytes) {
          failAndKill({ errorCode: "connection_failed", retryable: false });
          return;
        }
        const buffer = pending.length === 0 ? bytes : Buffer.concat([pending, bytes]);
        let start = 0;
        for (;;) {
          const newline = buffer.indexOf(0x0a, start);
          if (newline < 0) break;
          consumeLine(buffer.subarray(start, newline));
          if (forcedFailure !== undefined || state.terminalFailure !== undefined) return;
          start = newline + 1;
        }
        pending = Buffer.from(buffer.subarray(start));
        if (pending.byteLength > MAX_EVENT_LINE_BYTES) failAndKill({ errorCode: "connection_failed", retryable: false });
      };
      const onStderr = (chunk: Buffer | string | Uint8Array) => {
        if (forcedFailure !== undefined || state.terminalFailure !== undefined || settled) return;
        totalBytes += asBuffer(chunk).byteLength;
        if (totalBytes > input.maxOutputBytes) failAndKill({ errorCode: "connection_failed", retryable: false });
      };
      try {
        child = input.port.spawn(input.executable, requestArgs({
          modelName: input.modelName,
          reasoningEffort: input.reasoningEffort,
          cwd: cwd!,
          schemaPath,
        }), {
          cwd,
          env: safeEnvironment(),
          windowsHide: true,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
        }) as ChildProcessWithoutNullStreams;
      } catch {
        resolvePromise(failure("provider_unavailable"));
        return;
      }
      processExit = () => {
        try { child?.kill(); } catch { /* best effort during process shutdown */ }
        input.port.removeTempDirectorySync(cwd!);
      };
      process.once("exit", processExit);
      child.stdout.on("data", onStdout);
      child.stderr.on("data", onStderr);
      child.stdin.once("error", () => failAndKill({ errorCode: "connection_failed", retryable: false }));
      child.once("error", () => {
        processError = true;
        kill();
      });
      child.once("exit", (code) => { exitCode = code; });
      const onAbort = () => failAndKill({ errorCode: "provider_unavailable", retryable: false });
      child.once("close", (code) => {
        childClosed = true;
        if (processExit !== undefined) process.removeListener("exit", processExit);
        input.signal?.removeEventListener("abort", onAbort);
        if (deferCwdCleanupUntilClose && cwd !== undefined) {
          void input.port.removeTempDirectory(cwd).catch(() => undefined);
        }
        finish(code);
      });
      timeout = setTimeout(() => {
        timedOut = true;
        kill();
      }, input.timeoutMs);
      input.signal?.addEventListener("abort", onAbort, { once: true });
      if (input.cancelled()) {
        failAndKill({ errorCode: "provider_unavailable", retryable: false });
        return;
      }
      try { child.stdin.end(prompt); }
      catch { failAndKill({ errorCode: "connection_failed", retryable: false }); }
    });
  } catch {
    return failure("provider_unavailable");
  } finally {
    if (!deferCwdCleanupUntilClose) {
      if (processExit !== undefined) process.removeListener("exit", processExit);
      if (cwd !== undefined) await input.port.removeTempDirectory(cwd).catch(() => undefined);
    }
  }
}

/**
 * Main-process adapter for the installed local Codex CLI. It implements the
 * existing completion port and never exposes process output, paths or account
 * state to the renderer.
 */
export function createCodexCoachProvider(input: {
  settings: CodexCoachProviderConfig;
  processPort?: CodexCoachProcessPort;
  timeoutMs?: number;
  maxOutputBytes?: number;
}): LlmCoachProvider & { cancelActive(): void } {
  const settingsResult = CodexCoachProviderConfigSchema.safeParse(input.settings);
  const port = input.processPort ?? defaultProcessPort;
  const active = new Set<AbortController>();
  const descriptor: LlmProviderDescriptor = {
    providerId: "codex-cli",
    model: "gpt-6-luna",
    reasoningEffort: "max",
    samplingMode: "provider_default",
  };
  return Object.freeze({
    descriptor: () => descriptor,
    cancelActive() {
      for (const controller of active) controller.abort();
    },
    async complete(request: LlmCoachRequest): Promise<LlmCoachResult> {
      const checked = LlmCoachRequestSchema.safeParse(request);
      if (!settingsResult.success || !checked.success || Buffer.byteLength(checked.data.prompt, "utf8") > MAX_PROMPT_BYTES) {
        return { errorCode: "provider_unavailable", transportRetries: 0 };
      }
      let executable: string | null;
      try { executable = port.findExecutable(); } catch { executable = null; }
      if (executable === null || !(await codexExecutableAvailability(executable, port))) {
        return { errorCode: "provider_unavailable", transportRetries: 0 };
      }
      const controller = new AbortController();
      active.add(controller);
      const timeoutCandidate = input.timeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
      const timeoutMs = Number.isFinite(timeoutCandidate)
        ? Math.max(1, Math.min(DEFAULT_TURN_TIMEOUT_MS, Math.floor(timeoutCandidate)))
        : DEFAULT_TURN_TIMEOUT_MS;
      const outputCandidate = input.maxOutputBytes ?? MAX_STDIO_BYTES;
      const maxOutputBytes = Number.isFinite(outputCandidate)
        ? Math.max(1, Math.min(MAX_STDIO_BYTES, Math.floor(outputCandidate)))
        : MAX_STDIO_BYTES;
      let reportedUsage: LlmTokenUsage | undefined;
      try {
        for (const retries of [0, 1] as const) {
          const result = await runExecAttempt({
            port,
            executable,
            request: checked.data,
            modelName: settingsResult.data.modelName,
            reasoningEffort: settingsResult.data.reasoningEffort,
            timeoutMs,
            maxOutputBytes,
            signal: controller.signal,
            cancelled: () => controller.signal.aborted,
          });
          reportedUsage = combineReportedTokenUsage(reportedUsage, result.kind === "success"
            ? result.usage : result.failure.usage);
          if (result.kind === "success") {
            return { content: result.content, ...(reportedUsage === undefined ? {} : { usage: reportedUsage }), transportRetries: retries };
          }
          if (!result.failure.retryable || retries === 1 || controller.signal.aborted) {
            return {
              errorCode: result.failure.errorCode,
              ...(reportedUsage === undefined ? {} : { usage: reportedUsage }),
              transportRetries: retries,
            };
          }
        }
        return { errorCode: "connection_failed", transportRetries: 1 };
      } finally {
        active.delete(controller);
      }
    },
  });
}
