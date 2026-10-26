import { existsSync } from "node:fs";
import { join } from "node:path";
import { studyError } from "./canonical.mjs";

/**
 * Argument surface and executable resolution for `bin/selfrag-study.mjs`.
 *
 * Kept free of Arena/provider imports so the parser and the Codex path mirror
 * are testable without a workspace build.
 */
export const SELF_RAG_STUDY_DEFAULTS = Object.freeze({
  corpus: "E:/AgentData/Coach/public-replays-20261022/corpus.sqlite",
  knowledge: "E:/AgentData/Coach/scene-pattern-study-20261023-kb-v2/knowledge.json",
  exclusionRoot: "E:/AgentData/Coach",
});

export const SELF_RAG_STUDY_COMMANDS = Object.freeze(["prepare", "verify", "run", "report"]);
export const SELF_RAG_STUDY_MAX_RUN_MS = 300_000;

export function usage() {
  return [
    "Self-RAG paired study harness",
    "",
    "  node bin/selfrag-study.mjs prepare --artifacts <dir> --seed <seed> [options]",
    "  node bin/selfrag-study.mjs verify  --artifacts <dir> [--phase pilot|evaluation]",
    "  node bin/selfrag-study.mjs run     --artifacts <dir> [--phase pilot|evaluation] [--case <id>] [--arm baseline|selfrag] [--pilot-rerun]",
    "  node bin/selfrag-study.mjs report  --artifacts <dir> [--judge-reasons | --reason-review <file>]",
    "",
    "options:",
    `  --corpus <file>            default ${SELF_RAG_STUDY_DEFAULTS.corpus}`,
    `  --knowledge <file>         default ${SELF_RAG_STUDY_DEFAULTS.knowledge}`,
    `  --exclusion-root <dir>     default ${SELF_RAG_STUDY_DEFAULTS.exclusionRoot}`,
    "  --max-run-ms <1..300000>   per generator call, default 120000",
    "",
    "The study never copies the research corpus into the repository and never",
    "publishes it as product corpus. Artifacts are local, private inputs.",
  ].join("\n");
}

export function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return { command: "help" };
  const [command, ...rest] = argv;
  if (!SELF_RAG_STUDY_COMMANDS.includes(command)) throw studyError("study_command_invalid", command);
  const valued = new Set(["--artifacts", "--seed", "--corpus", "--knowledge", "--exclusion-root", "--phase", "--case", "--arm", "--reason-review", "--max-run-ms"]);
  const flags = new Set(["--pilot-rerun", "--judge-reasons"]);
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (typeof key !== "string") throw studyError("study_option_invalid", String(key));
    if (flags.has(key)) {
      if (options[key] !== undefined) throw studyError("study_option_duplicate", key);
      options[key] = true;
      continue;
    }
    if (!valued.has(key)) throw studyError("study_option_unknown", key);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) throw studyError("study_option_value_missing", key);
    if (options[key] !== undefined) throw studyError("study_option_duplicate", key);
    options[key] = value;
    index += 1;
  }
  if (typeof options["--artifacts"] !== "string" || options["--artifacts"].length === 0) {
    throw studyError("study_artifacts_required");
  }
  if (options["--phase"] !== undefined && !["pilot", "evaluation"].includes(options["--phase"])) {
    throw studyError("study_phase_invalid", options["--phase"]);
  }
  if (options["--arm"] !== undefined && !["baseline", "selfrag"].includes(options["--arm"])) {
    throw studyError("study_arm_invalid", options["--arm"]);
  }
  if (command === "prepare" && (typeof options["--seed"] !== "string" || options["--seed"].length === 0)) {
    throw studyError("study_seed_required");
  }
  if (options["--max-run-ms"] !== undefined) {
    const value = Number(options["--max-run-ms"]);
    if (!Number.isSafeInteger(value) || value < 1 || value > SELF_RAG_STUDY_MAX_RUN_MS) throw studyError("study_max_run_ms_invalid");
    options["--max-run-ms"] = value;
  }
  if (options["--judge-reasons"] === true && options["--reason-review"] !== undefined) {
    throw studyError("study_reason_review_conflict");
  }
  return options;
}

/**
 * Mirrors the Codex adapter's native executable resolution (codex-cli.ts
 * `nativeCodexPath`). The adapter does not export it, and the study must freeze
 * exactly the executable the adapter would run.
 */
export function resolveCodexExecutable(environment = process.env, platform = process.platform, arch = process.arch, exists = existsSync) {
  if (platform !== "win32") return null;
  const appData = environment.APPDATA;
  if (typeof appData !== "string" || appData.length === 0) return null;
  const nativePackage = arch === "arm64" ? "codex-win32-arm64" : arch === "x64" ? "codex-win32-x64" : null;
  const target = arch === "arm64" ? "aarch64-pc-windows-msvc" : arch === "x64" ? "x86_64-pc-windows-msvc" : null;
  if (nativePackage === null || target === null) return null;
  const packageRoot = join(appData, "npm", "node_modules", "@openai", "codex");
  const candidates = [
    join(packageRoot, "node_modules", "@openai", nativePackage, "vendor", target, "bin", "codex.exe"),
    join(packageRoot, "vendor", target, "bin", "codex.exe"),
  ];
  return candidates.find((candidate) => exists(candidate)) ?? null;
}
