import { readFile, rm, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { JsonlFactEngineClient, ManagedFactEngineTransport } from "@riichi-coach/reasoning";
import { ArenaRunAliasVault, createArenaMcpServer } from "@riichi-coach/desktop/blind-discard-arena-mcp";

const MAX_CASE_CONFIG_BYTES = 256 * 1024;
const resourcesRoot = fileURLToPath(new URL("../resources/", import.meta.url));

async function readAuthorizedCaseConfig(configPath) {
  const absolute = resolve(configPath);
  const tempRoot = resolve(tmpdir()) + sep;
  if (!absolute.startsWith(tempRoot) || !isAbsolute(absolute) || !absolute.includes(`${sep}arena-mcp-`)) {
    throw new Error("arena_mcp_config_invalid");
  }
  const info = await stat(absolute);
  if (!info.isFile() || info.size < 1 || info.size > MAX_CASE_CONFIG_BYTES) {
    throw new Error("arena_mcp_config_invalid");
  }
  let value;
  try {
    value = JSON.parse(await readFile(absolute, "utf8"));
  } finally {
    await rm(absolute, { force: true });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      !Array.isArray(value.authorizedCases) || value.authorizedCases.length !== 1 ||
      !["none", "first-helper-timeout"].includes(value.fault)) {
    throw new Error("arena_mcp_config_invalid");
  }
  return value;
}

async function main() {
  const configPath = process.argv[2];
  if (typeof configPath !== "string") throw new Error("arena_mcp_config_invalid");
  const config = await readAuthorizedCaseConfig(configPath);
  const engine = new JsonlFactEngineClient(new ManagedFactEngineTransport(resourcesRoot));
  let injected = false;
  const helper = config.fault === "first-helper-timeout"
    ? {
      identity: () => engine.identity(),
      async analyzeHand13(request) {
        if (!injected) {
          injected = true;
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        }
        return await engine.analyzeHand13(request);
      },
    }
    : engine;
  const server = createArenaMcpServer({
    authorizedCases: config.authorizedCases,
    engine: helper,
    aliases: new ArenaRunAliasVault(),
    disposeHelper: () => engine.close(),
    ...(config.fault === "first-helper-timeout" ? { limits: { helperTimeoutMs: 50 } } : {}),
  });
  await server.connectStdio();
}

main().catch(async () => {
  process.stderr.write("arena_mcp_server_failed\n");
  process.exitCode = 1;
});
