import { it, expect } from "vitest";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodexArenaToolCallProvider } from "../src/llm-provider/codex-cli.js";
import { prepareCodexArenaIsolation } from "../src/llm-provider/codex-arena-isolation.js";
import { arenaDirectOutputSchema } from "../src/blind-discard-arena-experiment.js";

const syntheticCatalog = { client_version: "0.166.0", models: [{ slug: "gpt-6.1-terra", tool_mode: "code_mode_only", apply_patch_tool_type: "freeform", experimental_supported_tools: ["send_user_message_async", "clock"], preserved: "unchanged" }] };
async function fixture(catalog: unknown = syntheticCatalog) {
  const root = await mkdtemp(join(tmpdir(), "riichi-coach-codex-isolation-test-")), sourceHome = join(root, "polluted");
  await mkdir(join(sourceHome, "skills/sentinel"), { recursive: true });
  const token = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "synthetic", exp: 4102444800, "https://api.openai.com/auth": { chatgpt_account_id: "synthetic-account" } })).toString("base64url")}.synthetic`;
  await writeFile(join(sourceHome, "auth.json"), JSON.stringify({ auth_mode: "chatgpt", tokens: { id_token: token, access_token: token, refresh_token: "SYNTHETIC_AUTH_CANARY", account_id: "synthetic-account" }, last_refresh: new Date().toISOString() }));
  await writeFile(join(sourceHome, "AGENTS.md"), "POLLUTION_AGENTS_CANARY");
  await writeFile(join(sourceHome, "config.toml"), 'developer_instructions="POLLUTION_CONFIG_CANARY"');
  await writeFile(join(sourceHome, "skills/sentinel/SKILL.md"), "POLLUTION_SKILL_CANARY");
  const catalogPath = join(root, "source-catalog.json"); await writeFile(catalogPath, JSON.stringify(catalog));
  return { root, sourceHome, catalogPath, expectedCatalogSourceSha256: createHash("sha256").update(await readFile(catalogPath)).digest("hex") };
}

it("changes exactly three client tool settings and copies only auth into a transient clean home", async () => {
  const f = await fixture();
  try {
    const work = join(f.root, "work"); await mkdir(work);
    const before = await readFile(join(f.sourceHome, "auth.json"));
    const prepared = await prepareCodexArenaIsolation(work, "选择弃牌。", { ...f, loopbackProbe: { baseUrl: "http://127.0.0.1:1234/v1" } });
    expect(await readFile(join(prepared.environment.CODEX_HOME!, "auth.json"))).toEqual(before);
    expect(await readFile(join(f.sourceHome, "auth.json"))).toEqual(before);
    const actual = JSON.parse(await readFile(join(work, "tool-less-catalog.json"), "utf8"));
    expect(actual).toEqual({ ...syntheticCatalog, models: [{ ...syntheticCatalog.models[0], tool_mode: "direct", apply_patch_tool_type: null, experimental_supported_tools: [] }] });
    expect(JSON.stringify(prepared.metadata)).not.toContain("SYNTHETIC_AUTH_CANARY");
    expect(prepared.metadata.catalogClientVersion).toBe("0.166.0");
    await expect(readFile(join(prepared.environment.CODEX_HOME!, "AGENTS.md"))).rejects.toThrow();
    await expect(readFile(join(prepared.environment.CODEX_HOME!, "config.toml"))).rejects.toThrow();
    await prepared.dispose();
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("requires an explicit runtime pin before a real isolated request", async () => {
  const provider = createCodexArenaToolCallProvider({ modelName: "gpt-6.1-terra", reasoningEffort: "high", isolation: {} });
  expect(await provider.preflight?.()).toEqual({ status: "unavailable", reason: "arena_runtime_pin_required" });
});

it("rejects a conflicting API key in the reused auth file", async () => {
  const f = await fixture();
  try {
    const authPath = join(f.sourceHome, "auth.json"), auth = JSON.parse(await readFile(authPath, "utf8"));
    auth.OPENAI_API_KEY = "SYNTHETIC_CONFLICT"; await writeFile(authPath, JSON.stringify(auth));
    const work = join(f.root, "conflict-work"); await mkdir(work);
    await expect(prepareCodexArenaIsolation(work, "选择弃牌。", { ...f, loopbackProbe: { baseUrl: "http://127.0.0.1:1234/v1" } })).rejects.toThrow("arena_auth_reuse_unavailable");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("does not allow the real isolated path to select a different auth home", async () => {
  const f = await fixture();
  try {
    const work = join(f.root, "different-auth-work"); await mkdir(work);
    await expect(prepareCodexArenaIsolation(work, "选择弃牌。", { sourceHome: f.sourceHome })).rejects.toThrow("arena_auth_source_mismatch");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it("rejects a changed runtime before spawning any process", async () => {
  const f = await fixture(); let spawns = 0;
  try {
    const changed = join(f.root, "changed.exe"); await writeFile(changed, "not the pinned executable");
    const provider = createCodexArenaToolCallProvider({ modelName: "gpt-6.1-terra", reasoningEffort: "high", isolation: { sourceHome: f.sourceHome, runtimePin: { executablePath: changed, catalogPath: f.catalogPath, toolLessCatalogPath: f.catalogPath } },
      processPort: { findExecutable: () => changed, spawn: ((...args: Parameters<typeof spawn>) => { spawns++; return spawn(...args); }) as typeof spawn, makeTempDirectory: () => mkdtemp(join(tmpdir(), "riichi-coach-codex-")), removeTempDirectory: p => rm(p, { recursive: true, force: true }), removeTempDirectorySync: p => rmSync(p, { recursive: true, force: true }) } });
    expect(await provider.preflight?.()).toEqual({ status: "unavailable", reason: "arena_runtime_pin_drift" });
    const result = await provider.request({ messages: [{ role: "system", content: "选择弃牌" }, { role: "user", content: "局面" }], tools: [], outputSchema: arenaDirectOutputSchema(), requireIsolatedContext: true, maxInputBytes: 65536, maxOutputBytes: 16384, maxOutputTokens: 512 }, new AbortController().signal);
    expect(result.status).toBe("provider_error"); expect(spawns).toBe(0);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it.skipIf(!process.env.COACH_ARENA_PIN_ROOT)("rejects a changed pinned catalog before starting the CLI", async () => {
  const f = await fixture(); const root = process.env.COACH_ARENA_PIN_ROOT!; let spawns = 0;
  try {
    const changed = join(f.root, "changed-catalog.json"); await writeFile(changed, (await readFile(join(root, "catalog-original.json"), "utf8")) + " ");
    const provider = createCodexArenaToolCallProvider({ modelName: "gpt-6.1-terra", reasoningEffort: "high", isolation: { runtimePin: { executablePath: join(root, "bin/codex.exe"), catalogPath: changed, toolLessCatalogPath: join(root, "catalog-no-tools.json") } },
      processPort: { findExecutable: () => "must-not-use-global", spawn: ((...args: any[]) => { spawns++; return (spawn as any)(...args); }) as typeof spawn, makeTempDirectory: () => mkdtemp(join(tmpdir(), "riichi-coach-codex-")), removeTempDirectory: p => rm(p, { recursive: true, force: true }), removeTempDirectorySync: p => rmSync(p, { recursive: true, force: true }) } });
    expect(await provider.preflight?.()).toEqual({ status: "unavailable", reason: "arena_runtime_pin_drift" });
    const result = await provider.request({ messages: [{ role: "system", content: "选择弃牌" }, { role: "user", content: "局面" }], tools: [], outputSchema: arenaDirectOutputSchema(), requireIsolatedContext: true, maxInputBytes: 65536, maxOutputBytes: 16384, maxOutputTokens: 512 }, new AbortController().signal);
    expect(result.status).toBe("provider_error"); expect(spawns).toBe(0);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

it.skipIf(!process.env.COACH_ARENA_PIN_ROOT)("binds the original catalog and derives the audited tool-less catalog for the OpenAI alias", async () => {
  const f = await fixture(); const root = process.env.COACH_ARENA_PIN_ROOT!;
  const previousHome = process.env.CODEX_HOME; process.env.CODEX_HOME = f.sourceHome;
  try {
    const work = join(f.root, "alias-work"); await mkdir(work);
    const prepared = await prepareCodexArenaIsolation(work, "选择弃牌。", { sourceHome: f.sourceHome, runtimePin: { executablePath: join(root, "bin/codex.exe"), catalogPath: join(root, "catalog-original.json"), toolLessCatalogPath: join(root, "catalog-no-tools.json") } });
    try {
      expect(JSON.parse(await readFile(join(work, "tool-less-catalog.json"), "utf8"))).toEqual(JSON.parse(await readFile(join(root, "catalog-no-tools.json"), "utf8")));
      expect(prepared.metadata.catalogSourceSha256).toBe("40ca8034bb45cf3eb1cc40c497da6e6861b6146f56a7603594a93dfe47377766");
      expect(prepared.metadata.catalogOverrideSha256).toBe(createHash("sha256").update(await readFile(join(work, "tool-less-catalog.json"))).digest("hex"));
      expect(prepared.args).toContain('model_provider="arena_openai_retryless"');
      expect(prepared.args).toContain("model_providers.arena_openai_retryless.requires_openai_auth=true");
      expect(prepared.args).toContain("model_providers.arena_openai_retryless.request_max_retries=0");
      expect(prepared.args).toContain("model_providers.arena_openai_retryless.stream_max_retries=0");
      expect(prepared.args.some(value => value.includes("arena_openai_retryless.base_url"))).toBe(false);
      expect(prepared.redact("x SYNTHETIC_AUTH_CANARY y")).toBe("x [REDACTED] y");
      expect(JSON.stringify(prepared.metadata)).not.toContain("SYNTHETIC_AUTH_CANARY");
    } finally { await prepared.dispose(); }
  } finally {
    if (previousHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousHome;
    await rm(f.root, { recursive: true, force: true });
  }
});

it.skipIf(!process.env.COACH_ARENA_ISOLATION_CLI || !process.env.COACH_ARENA_PIN_ROOT || !process.env.COACH_ARENA_CATALOG).each(["success", "invalid", "secret", "503", "drop"])("real CLI Terra/high clean home, no tools and exactly one local POST: %s", async mode => {
  const source = JSON.parse(await readFile(process.env.COACH_ARENA_CATALOG!, "utf8"));
  const target = source.models.find((m: any) => m.slug === "gpt-6.1-terra");
  // The supplied audit catalog is already tool-less. Restore only the three source settings for this test.
  target.tool_mode = "code_mode_only"; target.apply_patch_tool_type = "freeform"; target.experimental_supported_tools = ["send_user_message_async", "clock"];
  const f = await fixture(source), wire: any[] = [], audits: any[] = [], requestBodySha256: string[] = [];
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    if (request.method !== "POST") { response.end('{"data":[]}'); return; }
    const requestBytes = Buffer.concat(chunks); requestBodySha256.push(createHash("sha256").update(requestBytes).digest("hex"));
    wire.push(JSON.parse(requestBytes.toString("utf8")));
    if (mode === "503") { response.writeHead(503); response.end(); return; }
    if (mode === "drop") { response.writeHead(200, { "Content-Type": "text/event-stream" }); response.write('event: response.created\ndata: {"type":"response.created","response":{"id":"local","status":"in_progress"}}\n\n'); response.destroy(); return; }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const output = mode === "invalid" ? "{damaged" : mode === "secret" ? "SYNTHETIC_AUTH_CANARY" : '{"tile":"1m","red":false}';
    for (const event of [{ type: "response.created", response: { id: "local", status: "in_progress" } }, { type: "response.output_item.done", output_index: 0, item: { id: "msg", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: output, annotations: [] }] } }, { type: "response.completed", response: { id: "local", status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    response.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const originalKey = process.env.OPENAI_API_KEY, originalBase = process.env.OPENAI_BASE_URL;
  process.env.OPENAI_API_KEY = "SYNTHETIC_ENV_KEY"; process.env.OPENAI_BASE_URL = "https://invalid.example";
  try {
    const address = server.address() as { port: number };
    const authBefore = await readFile(join(f.sourceHome, "auth.json"));
    const diagnostics: any[] = [];
    const pinRoot = process.env.COACH_ARENA_PIN_ROOT!;
    const provider = createCodexArenaToolCallProvider({ modelName: "gpt-6.1-terra", reasoningEffort: "high", timeoutMs: 20000,
      isolation: { sourceHome: f.sourceHome, runtimePin: { executablePath: join(pinRoot, "bin/codex.exe"), catalogPath: join(pinRoot, "catalog-original.json"), toolLessCatalogPath: join(pinRoot, "catalog-no-tools.json") }, loopbackProbe: { baseUrl: `http://127.0.0.1:${address.port}/v1` }, onDiagnostic: value => diagnostics.push(value) },
      processPort: { findExecutable: () => "must-not-use-global", spawn: ((...args: any[]) => { if (args[1]?.includes("exec")) { expect(args[2].env.OPENAI_API_KEY).toBeUndefined(); expect(args[2].env.OPENAI_BASE_URL).toBeUndefined(); } return (spawn as any)(...args); }) as typeof spawn, makeTempDirectory: () => mkdtemp(join(tmpdir(), "riichi-coach-codex-")), removeTempDirectory: p => rm(p, { recursive: true, force: true }), removeTempDirectorySync: p => rmSync(p, { recursive: true, force: true }) } });
    const instructions = "选择要打出的牌。仅输出 tile 与 red。", user = '{"局面":"中文逐字核对","self":{"concealedTiles":[{"id":"1m","red":false}]}}';
    const result = await provider.request({ messages: [{ role: "system", content: instructions }, { role: "user", content: user }], tools: [], outputSchema: arenaDirectOutputSchema(), requireIsolatedContext: true, maxInputBytes: 65536, maxOutputBytes: 16384, maxOutputTokens: 512 }, new AbortController().signal, audit => audits.push(audit));
    if (mode === "success") expect(result).toMatchObject({ status: "final", content: '{"tile":"1m","red":false}' });
    else if (mode === "invalid") expect(result).toMatchObject({ status: "final", content: "{damaged" });
    else if (mode === "secret") expect(result).toMatchObject({ status: "final", content: "[REDACTED]" });
    else expect(result.status).toBe("provider_error");
    expect(diagnostics).toHaveLength(1); expect(diagnostics[0].physicalRequests).toBe("unknown");
    if (mode === "success") expect(diagnostics[0].rawFinal).toBe('{"tile":"1m","red":false}');
    if (mode === "invalid") expect(diagnostics[0].rawFinal).toBe("{damaged");
    if (mode === "secret") expect(diagnostics[0].rawFinal).toBe("[REDACTED]");
    if (mode === "503" || mode === "drop") expect(diagnostics[0].rawFinal).toBeNull();
    expect(wire).toHaveLength(1); expect(wire[0]).not.toHaveProperty("tools");
    const messages = wire[0].input.map((m: any) => ({ role: m.role, text: m.content.map((c: any) => c.text).join("") }));
    expect(messages).toEqual([{ role: "developer", text: instructions }, { role: "user", text: user }]);
    expect(wire[0].reasoning.effort).toBe("high"); expect(wire[0].model).toBe("gpt-6.1-terra");
    for (const marker of ["POLLUTION_", "SYNTHETIC_AUTH_CANARY", "additional_tools", "permissions instructions", "environment_context"]) expect(JSON.stringify(wire)).not.toContain(marker);
    expect(await readFile(join(f.sourceHome, "auth.json"))).toEqual(authBefore);
    if (process.env.RIICHI_ARENA_CODEX_CAPTURE) await writeFile(process.env.RIICHI_ARENA_CODEX_CAPTURE + (mode === "success" ? "" : `.${mode}.json`), JSON.stringify({ realModelCalls: 0, cliVersion: "0.162.1", catalogClientVersion: "0.166.0", requests: wire, requestBodySha256, audits, auth: "synthetic file only; real chain unverified", productionPhysicalRequests: "unknown; batch preflight rejects" }, null, 2));
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
    if (originalBase === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = originalBase;
    await new Promise<void>(resolve => server.close(() => resolve())); await rm(f.root, { recursive: true, force: true });
  }
}, 30000);
