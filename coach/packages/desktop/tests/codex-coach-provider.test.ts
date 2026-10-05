import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CoachReasoningDraftSchema, COACH_REASONING_DRAFT_SCHEMA_VERSION, COACH_REVIEW_PROMPT_VERSION,
  type LlmCoachRequest,
} from "@riichi-coach/contracts";
import {
  CODEX_COACH_OUTPUT_SCHEMA, CODEX_DISABLED_FEATURES, createCodexCoachProvider, getCodexCoachAvailability,
  type CodexCoachProcessPort,
} from "../src/llm-provider/codex-cli.js";

const settings = { providerId: "codex-cli", modelName: "gpt-6-luna", reasoningEffort: "max" } as const;
const prompt = "FROZEN_PROMPT_SECRET";
const request: LlmCoachRequest = {
  promptVersion: COACH_REVIEW_PROMPT_VERSION,
  draftSchemaVersion: COACH_REASONING_DRAFT_SCHEMA_VERSION,
  prompt,
  temperature: 0,
  maxOutputTokens: 8192,
};
const finalDraft = JSON.stringify({ decisions: [] });

type SpawnRecord = { executable: string; args: string[]; options: SpawnOptions; child: FakeChild };
type Transcript = (prompt: string, child: FakeChild, args: string[]) => void;

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly input: Buffer[] = [];
  killed = false;
  suppressKillClose = false;
  closeEmitted = false;
  stdoutText = "";
  stderrText = "";
  private finishScheduled = false;
  onInputEnd: (prompt: string) => void = () => undefined;

  constructor() {
    super();
    this.stdin.on("data", (chunk: Buffer) => this.input.push(Buffer.from(chunk)));
    this.stdin.once("end", () => this.onInputEnd(Buffer.concat(this.input).toString("utf8")));
  }

  kill(): boolean {
    this.killed = true;
    if (!this.suppressKillClose) this.finish(1, "", "");
    return true;
  }

  finish(code: number, stdout = "", stderr = ""): void {
    if (this.finishScheduled) return;
    this.finishScheduled = true;
    this.stdoutText = stdout;
    this.stderrText = stderr;
    if (!this.stdout.destroyed) this.stdout.end(stdout);
    if (!this.stderr.destroyed) this.stderr.end(stderr);
    setImmediate(() => {
      this.emit("exit", code, null);
      this.emit("close", code, null);
      this.closeEmitted = true;
    });
  }
}

function transcript(events: unknown[], stderr = ""): Transcript {
  return (_prompt, child) => child.finish(0, events.map(event => JSON.stringify(event)).join("\n") + "\n", stderr);
}

function successfulTranscript(content = finalDraft, usage: unknown = {
  input_tokens: 10, cached_input_tokens: 4, output_tokens: 3,
}): Transcript {
  return transcript([
    { type: "thread.started", thread_id: "thread-test" },
    { type: "turn.started", turn_id: "turn-test" },
    { type: "item.completed", item: { id: "reasoning-test", type: "reasoning", text: "PRIVATE_COT" } },
    { type: "item.completed", item: { id: "message-test", type: "agent_message", text: content } },
    { type: "turn.completed", usage },
  ], "PRIVATE_STDERR");
}

function fakePort(options: {
  onExec?: Transcript;
  version?: string;
  login?: string;
  executables?: string[];
} = {}) {
  const directories: string[] = [];
  const records: SpawnRecord[] = [];
  const schemaContents: string[] = [];
  const removedDirectories = new Set<string>();
  let execCount = 0;
  let executableLookups = 0;
  const fakeSpawn = ((executable: string, args: readonly string[] = [], rawOptions?: SpawnOptions) => {
    const child = new FakeChild();
    const argv = [...args];
    const spawnOptions = rawOptions ?? {};
    records.push({ executable, args: argv, options: spawnOptions, child });
    if (argv[0] === "exec") {
      execCount += 1;
      const schemaIndex = argv.indexOf("--output-schema");
      if (schemaIndex >= 0) {
        schemaContents.push(readFileSync(argv[schemaIndex + 1]!, "utf8"));
      }
      const onExec = options.onExec ?? successfulTranscript();
      child.onInputEnd = received => onExec(received, child, argv);
    } else if (argv.length === 1 && argv[0] === "--version") {
      child.onInputEnd = () => child.finish(0, options.version ?? "codex-cli 0.155.1\n");
    } else if (argv[0] === "login" && argv[1] === "status") {
      child.onInputEnd = () => child.finish(0, "", options.login ?? "Logged in using ChatGPT\n");
    } else {
      child.onInputEnd = () => child.finish(2, "", "unexpected fake command");
    }
    return child as unknown as ChildProcessWithoutNullStreams;
  }) as typeof spawn;

  const port: CodexCoachProcessPort = {
    findExecutable: () => {
      const index = executableLookups++;
      return options.executables?.[Math.min(index, options.executables.length - 1)] ?? "C:\\mock\\codex.exe";
    },
    spawn: fakeSpawn,
    async makeTempDirectory() {
      const path = await mkdtemp(join(tmpdir(), "codex-coach-provider-test-"));
      directories.push(path);
      return path;
    },
    async removeTempDirectory(path) {
      await rm(path, { recursive: true, force: true });
      removedDirectories.add(path);
    },
    removeTempDirectorySync(path) { void rm(path, { recursive: true, force: true }); },
  };
  return {
    port, records, directories, removedDirectories, schemaContents,
    get execCount() { return execCount; },
    get executableLookups() { return executableLookups; },
  };
}

const featureDisabled = (args: string[], feature: string) => {
  const index = args.findIndex((value, current) => value === "--disable" && args[current + 1] === feature);
  return index >= 0;
};

function matchesCodexOutputSchema(value: unknown, schema: Record<string, unknown>): boolean {
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (schema.type === "string") return typeof value === "string"
    && value.length >= (typeof schema.minLength === "number" ? schema.minLength : 0);
  if (schema.type === "array") return Array.isArray(value)
    && value.length >= (typeof schema.minItems === "number" ? schema.minItems : 0)
    && (value.length === 0 || matchesCodexOutputSchema(value[0], schema.items as Record<string, unknown>));
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const required = schema.required as string[] | undefined;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    if (required?.some(key => !(key in record))) return false;
    if (schema.additionalProperties === false && Object.keys(record).some(key => !(key in properties))) return false;
    return Object.entries(record).every(([key, entry]) => properties[key] !== undefined
      && matchesCodexOutputSchema(entry, properties[key]!));
  }
  return true;
}

function hasClosedRequiredObjectProperties(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (Array.isArray(value)) return value.every(hasClosedRequiredObjectProperties);
  const schema = value as Record<string, unknown>;
  if (schema.type === "object") {
    const properties = schema.properties;
    const required = schema.required;
    if (properties === null || typeof properties !== "object" || Array.isArray(properties)
      || !Array.isArray(required) || schema.additionalProperties !== false) return false;
    const propertyNames = Object.keys(properties as Record<string, unknown>).sort();
    const requiredNames = required.filter((key): key is string => typeof key === "string").sort();
    if (propertyNames.length !== requiredNames.length
      || propertyNames.some((name, index) => name !== requiredNames[index])) return false;
    return Object.values(properties as Record<string, unknown>).every(hasClosedRequiredObjectProperties);
  }
  if (schema.type === "array") return hasClosedRequiredObjectProperties(schema.items);
  return true;
}

describe("Codex CLI coach provider", () => {
  it("reports fixed provider metadata and captures only the final assistant item and normalized usage", async () => {
    const fake = fakePort();
    const provider = createCodexCoachProvider({ settings, processPort: fake.port });
    const result = await provider.complete(request);

    expect(provider.descriptor()).toEqual({
      providerId: "codex-cli", model: "gpt-6-luna", reasoningEffort: "max", samplingMode: "provider_default",
    });
    expect(result).toEqual({
      content: finalDraft,
      usage: { inputTokens: 10, cachedInputTokens: 4, outputTokens: 3, totalTokens: 13 },
      transportRetries: 0,
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_COT");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_STDERR");
    expect(fake.execCount).toBe(1);
  });

  it("keeps the output schema compatible with the public CoachReasoningDraft contract", () => {
    const draft = CoachReasoningDraftSchema.parse({ decisions: [{
      decisionId: "decision:test",
      judgment: { localId: "j1", recommendation: "action:v1:discard", confidence: "medium", premiseRefs: ["evidence:1"] },
      inferences: [{ localId: "i1", statement: "可见牌数较少", premiseRefs: ["evidence:1"] }],
      explanations: [{ text: "保留高效形状", claims: [{ kind: "factor_fact", evidenceRef: "evidence:1" }], judgmentLocalRef: "j1" }],
    }] });
    for (const kind of ["factor_fact", "factor_difference", "known_game_fact", "model_evaluation"] as const) {
      const variant = structuredClone(draft);
      variant.decisions[0]!.explanations![0]!.claims[0]!.kind = kind;
      expect(CoachReasoningDraftSchema.safeParse(variant).success).toBe(true);
      expect(matchesCodexOutputSchema(variant, CODEX_COACH_OUTPUT_SCHEMA as unknown as Record<string, unknown>)).toBe(true);
    }
  });

  it("marks exactly every property as required in each closed JSON-schema object", () => {
    expect(hasClosedRequiredObjectProperties(CODEX_COACH_OUTPUT_SCHEMA)).toBe(true);
  });

  it("pins model and effort, disables every verified tool feature, and passes the frozen prompt only over stdin", async () => {
    const fake = fakePort();
    const result = await createCodexCoachProvider({ settings, processPort: fake.port }).complete(request);
    const exec = fake.records.find(record => record.args[0] === "exec")!;
    const args = exec.args;
    const schemaPath = args[args.indexOf("--output-schema") + 1]!;

    expect(result).toHaveProperty("content", finalDraft);
    expect(args.slice(0, 2)).toEqual(["exec", "--model"]);
    expect(args).toContain("gpt-6-luna");
    expect(args).toContain("model_reasoning_effort=max");
    expect(args).toContain("web_search=disabled");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("--sandbox");
    expect(args).toContain("read-only");
    expect(args).toContain("--json");
    expect(args).toContain("--skip-git-repo-check");
    expect(args).toContain("-");
    expect(args).not.toContain("--ignore-rules");
    expect(args).not.toContain("--output-last-message");
    expect(args).not.toContain(prompt);
    for (const feature of CODEX_DISABLED_FEATURES) expect(featureDisabled(args, feature)).toBe(true);
    expect(exec.options.shell).toBe(false);
    expect(exec.options.stdio).toEqual(["pipe", "pipe", "pipe"]);
    expect(exec.options.windowsHide).toBe(true);
    expect(exec.child.input.join("")).toBe(prompt);
    expect(JSON.stringify(exec.options.env)).not.toMatch(/OPENAI_API_KEY|API_KEY|SECRET/i);
    expect(schemaPath.startsWith(exec.options.cwd as string)).toBe(true);
    expect(fake.schemaContents.some(schema => schema.includes('"decisions"'))).toBe(true);
    expect(fake.records.filter(record => record.args[0] !== "exec").map(record => record.args)).toEqual([
      ["--version"], ["login", "status"],
    ]);
    await expect(stat(schemaPath)).rejects.toThrow();
    for (const directory of fake.directories) await expect(stat(directory)).rejects.toThrow();
  });

  it("keeps the Codex execution host available while every model tool surface stays disabled", async () => {
    const fake = fakePort();
    await createCodexCoachProvider({ settings, processPort: fake.port }).complete(request);
    const args = fake.records.find(record => record.args[0] === "exec")!.args;

    expect(featureDisabled(args, "code_mode_host")).toBe(false);
    expect(args).not.toContain("--enable");
    for (const feature of [
      "apps", "auth_elicitation", "browser_use", "browser_use_external", "browser_use_full_cdp_access",
      "computer_use", "plugins", "remote_plugin", "shell_tool", "tool_call_mcp_elicitation",
      "unified_exec", "unified_exec_tty", "workspace_dependencies",
    ]) {
      expect(featureDisabled(args, feature), `${feature} remains disabled`).toBe(true);
    }
    expect(args).toContain("read-only");
    expect(args).toContain("web_search=disabled");
  });

  it("forwards only existing proxy environment names to native CLI children", async () => {
    const proxyNames = [
      "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
      "http_proxy", "https_proxy", "all_proxy", "no_proxy",
    ];
    const privateNames = ["OPENAI_API_KEY", "CODEX_API_KEY", "MCP_SERVER_TOKEN", "MULTICA_COMMAND"];
    proxyNames.forEach(name => vi.stubEnv(name, "synthetic-proxy-value"));
    privateNames.forEach((name, index) => vi.stubEnv(name, `synthetic-secret-${index}`));
    try {
      const fake = fakePort();
      await createCodexCoachProvider({ settings, processPort: fake.port }).complete(request);
      const everyChildReceivesProxyContract = fake.records.every(record => {
        const env = record.options.env ?? {};
        return proxyNames.every(name => env[name] === "synthetic-proxy-value");
      });
      const noPrivateVariablesEscape = fake.records.every(record => {
        const env = record.options.env ?? {};
        return privateNames.every(name => !Object.hasOwn(env, name));
      });

      expect(everyChildReceivesProxyContract).toBe(true);
      expect(noPrivateVariablesEscape).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("requires the verified CLI version and a ChatGPT login without starting a model turn", async () => {
    const oldVersion = fakePort({ version: "codex-cli 0.155.0\n" });
    expect(await getCodexCoachAvailability(oldVersion.port)).toBe(false);
    expect(oldVersion.records.map(record => record.args)).toEqual([["--version"]]);
    expect(oldVersion.execCount).toBe(0);

    const loggedOut = fakePort({ login: "Not logged in\n" });
    expect(await getCodexCoachAvailability(loggedOut.port)).toBe(false);
    expect(loggedOut.execCount).toBe(0);
    expect(loggedOut.records.map(record => record.args)).toEqual([["--version"], ["login", "status"]]);

    const ready = fakePort();
    expect(await getCodexCoachAvailability(ready.port)).toBe(true);
    expect(ready.execCount).toBe(0);
    expect(ready.records[1]?.child.stdoutText).toBe("");
    expect(ready.records[1]?.child.stderrText.trim()).toBe("Logged in using ChatGPT");
  });

  it("checks and runs the same executable path when the resolver changes between lookups", async () => {
    const verified = "C:\\mock\\codex-verified.exe";
    const unverified = "C:\\mock\\codex-unverified.exe";
    const fake = fakePort({ executables: [verified, unverified] });
    const result = await createCodexCoachProvider({ settings, processPort: fake.port }).complete(request);
    expect(result).toHaveProperty("content", finalDraft);
    expect(fake.executableLookups).toBe(1);
    expect(fake.records.every(record => record.executable === verified)).toBe(true);
    expect(fake.records.some(record => record.executable === unverified)).toBe(false);
  });

  it("does not invoke a model when local availability is missing", async () => {
    const fake = fakePort({ login: "Not logged in\n" });
    const result = await createCodexCoachProvider({ settings, processPort: fake.port }).complete(request);
    expect(result).toEqual({ errorCode: "provider_unavailable", transportRetries: 0 });
    expect(fake.execCount).toBe(0);
  });

  it("cancels an active child and prevents retry", async () => {
    let started!: () => void;
    const executing = new Promise<void>(resolve => { started = resolve; });
    const fake = fakePort({ onExec: () => { started(); } });
    const provider = createCodexCoachProvider({ settings, processPort: fake.port });
    const completion = provider.complete(request);
    await executing;
    provider.cancelActive();
    expect(await completion).toEqual({ errorCode: "provider_unavailable", transportRetries: 0 });
    expect(fake.records.find(record => record.args[0] === "exec")?.child.killed).toBe(true);
    for (const directory of fake.directories) await expect(stat(directory)).rejects.toThrow();
  });

  it("rejects tool events immediately and does not retry semantic or protocol failures", async () => {
    const tool = fakePort({ onExec: transcript([
      { type: "thread.started", thread_id: "t" },
      { type: "turn.started", turn_id: "t" },
      { type: "item.started", item: { type: "function_call" } },
    ]) });
    const toolResult = await createCodexCoachProvider({ settings, processPort: tool.port }).complete(request);
    expect(toolResult).toEqual({ errorCode: "connection_failed", transportRetries: 0 });
    expect(tool.records.find(record => record.args[0] === "exec")?.child.killed).toBe(true);

    const duplicate = fakePort({ onExec: transcript([
      { type: "thread.started", thread_id: "t" },
      { type: "turn.started", turn_id: "t" },
      { type: "item.completed", item: { type: "agent_message", text: finalDraft } },
      { type: "item.completed", item: { type: "agent_message", text: finalDraft } },
    ]) });
    expect(await createCodexCoachProvider({ settings, processPort: duplicate.port }).complete(request)).toEqual({
      errorCode: "connection_failed", transportRetries: 0,
    });
    expect(duplicate.execCount).toBe(1);

    const malformed = fakePort({ onExec: (_prompt, child) => child.finish(0, "not-json\n") });
    expect(await createCodexCoachProvider({ settings, processPort: malformed.port }).complete(request)).toEqual({
      errorCode: "connection_failed", transportRetries: 0,
    });
    expect(malformed.execCount).toBe(1);

    const nonzero = fakePort({ onExec: (_prompt, child) => child.finish(7, [
      { type: "thread.started", thread_id: "t" },
      { type: "turn.started", turn_id: "t" },
      { type: "item.completed", item: { type: "agent_message", text: finalDraft } },
      { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
    ].map(event => JSON.stringify(event)).join("\n") + "\n") });
    expect(await createCodexCoachProvider({ settings, processPort: nonzero.port }).complete(request)).toEqual({
      errorCode: "connection_failed", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, transportRetries: 0,
    });
    expect(nonzero.execCount).toBe(1);
  });

  it("caps combined stdout and stderr bytes and kills an over-limit child", async () => {
    const fake = fakePort({ onExec: (_prompt, child) => child.finish(0, "", "X".repeat(101)) });
    const result = await createCodexCoachProvider({ settings, processPort: fake.port, maxOutputBytes: 100 }).complete(request);
    expect(result).toEqual({ errorCode: "connection_failed", transportRetries: 0 });
    expect(fake.records.find(record => record.args[0] === "exec")?.child.killed).toBe(true);
    expect(fake.execCount).toBe(1);
  });

  it("enforces the fixed 2 MiB limit even if a caller requests a larger limit", async () => {
    const fake = fakePort({ onExec: (_prompt, child) => child.finish(0, "", "X".repeat(2 * 1024 * 1024 + 1)) });
    const result = await createCodexCoachProvider({ settings, processPort: fake.port, maxOutputBytes: Number.MAX_SAFE_INTEGER }).complete(request);
    expect(result).toEqual({ errorCode: "connection_failed", transportRetries: 0 });
    expect(fake.records.find(record => record.args[0] === "exec")?.child.killed).toBe(true);
  });

  it("times out and terminates each attempt, with hard timeout caps", async () => {
    const fake = fakePort({ onExec: () => undefined });
    const provider = createCodexCoachProvider({ settings, processPort: fake.port, timeoutMs: 5, maxOutputBytes: Number.MAX_SAFE_INTEGER });
    const result = await provider.complete(request);
    expect(result).toEqual({ errorCode: "timeout", transportRetries: 1 });
    expect(fake.execCount).toBe(2);
    expect(fake.records.filter(record => record.args[0] === "exec").every(record => record.child.killed)).toBe(true);
    expect(new Set(fake.records.filter(record => record.args[0] === "exec").map(record => record.options.cwd)).size).toBe(2);
    for (const directory of fake.directories) await expect(stat(directory)).rejects.toThrow();
  });

  it("does not start a retry until a timed out child actually closes", async () => {
    const fake = fakePort({ onExec: (_prompt, child) => {
      child.suppressKillClose = true;
      setTimeout(() => child.finish(1), 1_250);
    } });
    const result = await createCodexCoachProvider({ settings, processPort: fake.port, timeoutMs: 5 }).complete(request);
    const exec = fake.records.find(record => record.args[0] === "exec")!;
    expect(result).toEqual({ errorCode: "timeout", transportRetries: 0 });
    expect(fake.execCount).toBe(1);
    expect(exec.child.killed).toBe(true);
    expect(exec.child.closeEmitted).toBe(false);
    await expect(stat(exec.options.cwd as string)).resolves.toBeDefined();
    await new Promise<void>(resolve => exec.child.once("close", () => resolve()));
    for (let tries = 0; tries < 20 && !fake.removedDirectories.has(exec.options.cwd as string); tries += 1) {
      await new Promise<void>(resolve => setTimeout(resolve, 10));
    }
    expect(fake.removedDirectories.has(exec.options.cwd as string)).toBe(true);
    await expect(stat(exec.options.cwd as string)).rejects.toThrow();
  });

  it("handles stdin EPIPE without retaining raw child error text or retrying it", async () => {
    const fake = fakePort({ onExec: (_prompt, child) => {
      setImmediate(() => child.stdin.emit("error", Object.assign(new Error("PRIVATE_EPIPE_TEXT"), { code: "EPIPE" })));
    } });
    const result = await createCodexCoachProvider({ settings, processPort: fake.port }).complete(request);
    expect(result).toEqual({ errorCode: "connection_failed", transportRetries: 0 });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_EPIPE_TEXT");
    expect(fake.records.find(record => record.args[0] === "exec")?.child.killed).toBe(true);
    for (const directory of fake.directories) await expect(stat(directory)).rejects.toThrow();
  });

  it("combines usage from failed and retried turns by reported counter only", async () => {
    let attempt = 0;
    const fake = fakePort({ onExec: (_prompt, child) => {
      attempt += 1;
      const events = attempt === 1 ? [
        { type: "thread.started", thread_id: "one" },
        { type: "turn.started", turn_id: "one" },
        { type: "turn.failed", error: { code: "rate_limit_exceeded" }, usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 2 } },
      ] : [
        { type: "thread.started", thread_id: "two" },
        { type: "turn.started", turn_id: "two" },
        { type: "item.completed", item: { type: "agent_message", text: finalDraft } },
        { type: "turn.completed", usage: { input_tokens: 12, cached_input_tokens: 5, output_tokens: 3 } },
      ];
      transcript(events)("", child, []);
    } });
    const result = await createCodexCoachProvider({ settings, processPort: fake.port }).complete(request);
    expect(result).toEqual({
      content: finalDraft,
      usage: { inputTokens: 22, cachedInputTokens: 9, outputTokens: 5, totalTokens: 27 },
      transportRetries: 1,
    });
    for (const directory of fake.directories) await expect(stat(directory)).rejects.toThrow();
  });

  it("keeps content when optional or malformed usage is absent", async () => {
    const fake = fakePort({ onExec: successfulTranscript(finalDraft, {
      input_tokens: 4, cached_input_tokens: 999, output_tokens: -1,
    }) });
    const result = await createCodexCoachProvider({ settings, processPort: fake.port }).complete(request);
    expect(result).toEqual({ content: finalDraft, usage: { inputTokens: 4 }, transportRetries: 0 });
  });
});
