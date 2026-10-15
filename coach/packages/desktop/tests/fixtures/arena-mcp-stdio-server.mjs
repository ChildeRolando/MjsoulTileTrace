import { ArenaRunAliasVault } from "../../dist/blind-discard-arena.js";
import { createArenaMcpServer } from "../../dist/blind-discard-arena-mcp.js";
import {
  createArenaMcpTestEngine,
  createPackagedArenaMcpTestEngine,
} from "./arena-mcp-test-helper.mjs";

try {
  const raw = process.env.ARENA_MCP_TEST_CONTEXT;
  if (!raw) throw new Error("test_context_missing");
  const context = JSON.parse(raw);
  const helper = context.helper === "packaged"
    ? createPackagedArenaMcpTestEngine({ emitCloseMarker: true })
    : createArenaMcpTestEngine({
        behavior: context.behavior,
        emitCloseMarker: true,
      });
  const { engine } = helper;
  const server = createArenaMcpServer({
    authorizedCases: context.authorizedCases,
    engine,
    aliases: new ArenaRunAliasVault(),
    disposeHelper: helper.disposeHelper,
    limits: context.limits,
  });
  await server.connectStdio();
} catch {
  process.stderr.write("ARENA_MCP_TEST_SERVER_START_FAILED\n");
  process.exitCode = 1;
}
