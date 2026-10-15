import { readFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { readLabConfig, digest } from "./config.js";
import { LabBatch } from "./batch.js";
import { Archive } from "./archive.js";
import { coachRoot, labRoot } from "./runtime.js";
import { fitBoundaries, refineBatch, learningPython } from "./learning.js";
import { renderReport } from "./report.js";

async function setup() {
  const python = learningPython(),
    venv = resolve(python, "../..");
  const run = (exe: string, args: string[]) =>
    new Promise<void>((ok, no) => {
      const child = spawn(exe, args, { stdio: "inherit", windowsHide: true });
      child.once("error", no);
      child.once("exit", (code) =>
        code === 0 ? ok() : no(new Error("learning_setup_failed")),
      );
    });
  if (process.env.RIICHI_QUESTION_LAB_PYTHON) {
    await run(python, [
      "-c",
      "import sys; assert sys.prefix != sys.base_prefix, 'question lab setup requires an isolated virtual environment'",
    ]);
  } else {
    await mkdir(venv, { recursive: true });
    await run(process.env.RIICHI_QUESTION_LAB_BASE_PYTHON ?? "python", [
      "-m",
      "venv",
      venv,
    ]);
  }
  await run(python, [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "-r",
    join(labRoot, "python/requirements.txt"),
  ]);
}
export async function main(args = process.argv.slice(2)) {
  const [command, configPath, ...rest] = args;
  if (command === "setup") {
    await setup();
    return;
  }
  const commands = [
    "validate",
    "generate",
    "label",
    "fit",
    "refine",
    "report",
    "resume",
    "run",
  ];
  if (!command || !commands.includes(command) || !configPath)
    throw new Error(
      "用法：question-lab <validate|generate|label|fit|refine|report|resume|run> <config.json|yaml> [--out <目录>]；setup 安装独立学习环境",
    );
  if (rest.length && !(rest.length === 2 && rest[0] === "--out" && rest[1]))
    throw new Error("unknown_cli_arguments");
  const config = await readLabConfig(resolve(configPath)),
    directory = resolve(
      rest[1] ??
        join(
          coachRoot,
          "reports/question-lab",
          `${config.name.replace(/[^a-zA-Z0-9_-]/g, "_")}-${digest(config).slice(0, 12)}`,
        ),
    );
  if (command === "validate") {
    process.stdout.write(
      JSON.stringify(
        { status: "valid", configHash: digest(config), config },
        null,
        2,
      ) + "\n",
    );
    return;
  }
  if (["fit", "report"].includes(command)) {
    const manifest = JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8"),
    );
    if (manifest.identity.configHash !== digest(config))
      throw new Error("archive_config_mismatch");
    const archive = await Archive.open(directory, manifest.identity);
    try {
      if (command === "fit") await fitBoundaries(archive, config, true);
      const report = await renderReport(archive, config);
      process.stdout.write(
        JSON.stringify({ status: "complete", directory, report }) + "\n",
      );
    } finally {
      await archive.close();
    }
    return;
  }
  const batch = await LabBatch.open(config, directory);
  try {
    if (
      command === "refine" &&
      (await batch.archive.read("boundaries-final.json"))
    )
      throw new Error("holdout_already_evaluated_create_new_experiment");
    if (["generate", "run", "resume"].includes(command)) await batch.generate();
    if (["label", "run", "resume", "refine"].includes(command))
      await batch.label();
    if (
      ["run", "resume", "refine"].includes(command) &&
      !(await batch.archive.read("boundaries-final.json")) &&
      batch.remainingMs > 0
    ) {
      await refineBatch(batch);
      await batch.checkpointBudget();
      if (batch.remainingMs > 0)
        await fitBoundaries(batch.archive, config, true);
    }
    const report = await renderReport(batch.archive, config),
      summary = await batch.summarize();
    process.stdout.write(
      JSON.stringify({ ...summary, directory, report }) + "\n",
    );
  } finally {
    await batch.close();
  }
}
main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
