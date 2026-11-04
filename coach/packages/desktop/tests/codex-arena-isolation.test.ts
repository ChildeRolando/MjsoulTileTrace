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
    const prepared = await prepareCodexArenaIsolation(work, "选择弃牌。", f);
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

it("rejects batch capability before any paid request when builtin request count is unobservable", async () => {
  const provider = createCodexArenaToolCallProvider({ modelName: "gpt-6.1-terra", reasoningEffort: "high" });
  expect(await provider.preflight?.()).toEqual({ status: "unavailable", reason: "builtin_physical_request_boundary_unknown" });
});

it.skipIf(!process.env.COACH_ARENA_ISOLATION_CLI).each(["success", "503", "drop"])("real CLI Terra/high clean home, no tools and exactly one local POST: %s", async mode => {
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
    for (const event of [{ type: "response.created", response: { id: "local", status: "in_progress" } }, { type: "response.output_item.done", output_index: 0, item: { id: "msg", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"tile":"1m","red":false}', annotations: [] }] } }, { type: "response.completed", response: { id: "local", status: "completed", output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    response.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const authBefore = await readFile(join(f.sourceHome, "auth.json"));
    const provider = createCodexArenaToolCallProvider({ modelName: "gpt-6.1-terra", reasoningEffort: "high", timeoutMs: 20000,
      isolation: { ...f, loopbackProbe: { baseUrl: `http://127.0.0.1:${address.port}/v1` } },
      processPort: { findExecutable: () => process.env.COACH_ARENA_ISOLATION_CLI!, spawn, makeTempDirectory: () => mkdtemp(join(tmpdir(), "riichi-coach-codex-")), removeTempDirectory: p => rm(p, { recursive: true, force: true }), removeTempDirectorySync: p => rmSync(p, { recursive: true, force: true }) } });
    const instructions = "选择要打出的牌。仅输出 tile 与 red。", user = '{"局面":"中文逐字核对","self":{"concealedTiles":[{"id":"1m","red":false}]}}';
    const result = await provider.request({ messages: [{ role: "system", content: instructions }, { role: "user", content: user }], tools: [], outputSchema: arenaDirectOutputSchema(), requireIsolatedContext: true, maxInputBytes: 65536, maxOutputBytes: 16384, maxOutputTokens: 512 }, new AbortController().signal, audit => audits.push(audit));
    if (mode === "success") expect(result).toMatchObject({ status: "final", content: '{"tile":"1m","red":false}' });
    else expect(result.status).toBe("provider_error");
    expect(wire).toHaveLength(1); expect(wire[0]).not.toHaveProperty("tools");
    const messages = wire[0].input.map((m: any) => ({ role: m.role, text: m.content.map((c: any) => c.text).join("") }));
    expect(messages).toEqual([{ role: "developer", text: instructions }, { role: "user", text: user }]);
    expect(wire[0].reasoning.effort).toBe("high"); expect(wire[0].model).toBe("gpt-6.1-terra");
    for (const marker of ["POLLUTION_", "SYNTHETIC_AUTH_CANARY", "additional_tools", "permissions instructions", "environment_context"]) expect(JSON.stringify(wire)).not.toContain(marker);
    expect(await readFile(join(f.sourceHome, "auth.json"))).toEqual(authBefore);
    if (process.env.RIICHI_ARENA_CODEX_CAPTURE) await writeFile(process.env.RIICHI_ARENA_CODEX_CAPTURE + (mode === "success" ? "" : `.${mode}.json`), JSON.stringify({ realModelCalls: 0, cliVersion: "0.162.1", catalogClientVersion: "0.166.0", requests: wire, requestBodySha256, audits, auth: "synthetic file only; real chain unverified", productionPhysicalRequests: "unknown; batch preflight rejects" }, null, 2));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(f.root, { recursive: true, force: true }); }
}, 30000);
