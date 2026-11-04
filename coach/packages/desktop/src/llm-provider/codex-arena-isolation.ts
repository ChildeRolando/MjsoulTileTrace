import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, lstat, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { rmSync } from "node:fs";

export type ArenaCodexIsolation = {
  catalogPath?: string;
  sourceHome?: string;
  expectedCatalogSourceSha256?: string;
  /** Internal process-port test seam; the production factory never supplies it. */
  loopbackProbe?: { baseUrl: string };
};
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Only client tool metadata changes. Authentication never becomes an audit field. */
export async function prepareCodexArenaIsolation(directory: string, instructions: string, options: ArenaCodexIsolation) {
  const sourceHome = options.sourceHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const catalogBytes = await readFile(options.catalogPath ?? join(sourceHome, "models_cache.json"));
  const expected = options.expectedCatalogSourceSha256 ?? "40ca8034bb45cf3eb1cc40c497da6e6861b6146f56a7603594a93dfe47377766";
  if (hash(catalogBytes) !== expected) throw new Error("arena_catalog_drift");
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  if (catalog.client_version !== "0.166.0" || !Array.isArray(catalog.models)) throw new Error("arena_catalog_drift");
  const targets = catalog.models.filter((model: any) => model.slug === "gpt-6.1-terra");
  if (targets.length !== 1) throw new Error("arena_catalog_drift");
  const target = targets[0];
  if (target.tool_mode !== "code_mode_only" || target.apply_patch_tool_type !== "freeform" ||
      JSON.stringify(target.experimental_supported_tools) !== JSON.stringify(["send_user_message_async", "clock"])) throw new Error("arena_catalog_drift");
  target.tool_mode = "direct"; target.apply_patch_tool_type = null; target.experimental_supported_tools = [];
  const override = JSON.stringify(catalog);
  // CLI refuses CODEX_HOME under the OS temp root. Use the user's private local
  // application directory and remove the entire run-owned home after close.
  const homeRoot = join(process.env.LOCALAPPDATA ?? join(homedir(), ".cache"), "RiichiCoach", "arena-codex-homes");
  await mkdir(homeRoot, { recursive: true, mode: 0o700 });
  const cleanHome = await mkdtemp(join(homeRoot, "run-"));
  try {
  const sourceAuth = join(sourceHome, "auth.json");
  const stat = await lstat(sourceAuth);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error("arena_auth_reuse_unavailable");
  const authBytes = await readFile(sourceAuth);
  const auth = JSON.parse(authBytes.toString("utf8"));
  if (auth.auth_mode !== "chatgpt" || !auth.tokens || typeof auth.tokens.access_token !== "string") throw new Error("arena_auth_reuse_unavailable");
  await writeFile(join(cleanHome, "auth.json"), authBytes, { mode: 0o600, flag: "wx" });
  const catalogPath = join(directory, "tool-less-catalog.json"), instructionsPath = join(directory, "arena-instructions.txt");
  await writeFile(catalogPath, override, { mode: 0o600, flag: "wx" });
  await writeFile(instructionsPath, instructions, { mode: 0o600, flag: "wx" });
  const args = ["--enable", "skip_host_skill_discovery"];
  for (const feature of ["goals", "view_image", "code_mode_host", "multi_agent_v2", "multi_agent", "sleep_tool", "default_mode_request_user_input", "memories", "plugins", "shell_tool", "unified_exec", "code_mode", "apps", "browser_use", "computer_use"]) args.push("--disable", feature);
  for (const config of ["agents.enabled=false", "tools.experimental_request_user_input.enabled=false", "skills.include_instructions=false", "skills.bundled.enabled=false", "include_environment_context=false", "include_permissions_instructions=false", "include_apps_instructions=false", "include_collaboration_mode_instructions=false", "developer_instructions=\"\"", "suppress_unstable_features_warning=true", "project_doc_max_bytes=0", "web_search=\"disabled\"", "model_catalog_json=" + JSON.stringify(catalogPath), "model_instructions_file=" + JSON.stringify(instructionsPath)]) args.push("-c", config);
  const environment: NodeJS.ProcessEnv = { CODEX_HOME: cleanHome };
  if (options.loopbackProbe) {
    const url = new URL(options.loopbackProbe.baseUrl);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.search || url.hash) throw new Error("arena_probe_must_be_loopback");
    for (const config of ['model_provider="arena_local_probe"', 'model_providers.arena_local_probe.name="arena_local_probe"', 'model_providers.arena_local_probe.wire_api="responses"', 'model_providers.arena_local_probe.env_key="ARENA_SYNTHETIC_PROBE_KEY"', 'model_providers.arena_local_probe.request_max_retries=0', 'model_providers.arena_local_probe.stream_max_retries=0', 'model_providers.arena_local_probe.base_url=' + JSON.stringify(url.href.replace(/\/$/, ""))]) args.push("-c", config);
    Object.assign(environment, { ARENA_SYNTHETIC_PROBE_KEY: "synthetic-local-only", HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", NO_PROXY: "127.0.0.1" });
  }
  return { args, environment, dispose: () => rm(cleanHome, { recursive: true, force: true }), disposeSync: () => rmSync(cleanHome, { recursive: true, force: true }), metadata: { cliVersion: "0.162.1", catalogClientVersion: "0.166.0", catalogSourceSha256: hash(catalogBytes), catalogOverrideSha256: hash(override), clientFlags: JSON.stringify(args),
    authReuse: "transient_copy_existing_chatgpt_file", authenticationValidated: "false", supplierContext: "unknown", physicalRequestBoundary: options.loopbackProbe ? "loopback_counted_zero_retries" : "unknown_builtin_retries" } };
  } catch (error) { await rm(cleanHome, { recursive: true, force: true }); throw error; }
}
