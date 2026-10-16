import { digest } from "./config.js";
import type { PairStudyConfig } from "@riichi-coach/contracts";
import { PairStudy } from "./pair-study.js";
import { renderPairReport } from "./pair-report.js";

export async function runPairCommand(command: string, config: PairStudyConfig, directory: string) {
  const study = await PairStudy.open(config, directory);
  try {
    const final = await study.archive.read("fit-final.json");
    const frozen = await study.archive.read("research-frozen.json");
    if ((final || frozen) && ["generate", "scan", "refine"].includes(command)) throw new Error("holdout_already_evaluated_create_new_experiment");
    try {
      if (!final && !frozen) {
        if (["generate", "run", "resume"].includes(command)) await study.generate();
        if (["label", "run", "resume"].includes(command)) await study.label();
        if (command === "fit") await study.fit(false);
        if (command === "scan") { await study.label(); await study.scan(); }
        if (command === "refine") { await study.label(); await study.refine(); }
        if (["run", "resume"].includes(command)) {
          if (study.searching) { await study.fit(false); await study.scan(); await study.refine(); }
          await study.label();
          const selected = await study.fit(false);
          await study.archive.write("research-frozen.json", {
            trainingInputHash: digest(study.learningRows().filter(r => r.split === "train")),
            modelsHash: digest(selected ? Object.fromEntries(Object.entries(selected.models).map(([k, m]) => [k, m.model ?? null])) : null),
          });
        }
      }
      if (["run", "resume"].includes(command) && await study.archive.read("research-frozen.json")) {
        if (config.scans.threats && study.searching) await study.scan(true);
        const freeze = await study.archive.read("research-frozen.json") as { trainingInputHash: string; modelsHash: string };
        if (freeze.trainingInputHash !== digest(study.learningRows().filter(r => r.split === "train"))) throw new Error("frozen_training_input_changed");
        const result = await study.fit(true);
        const modelHash = digest(result ? Object.fromEntries(Object.entries(result.models).map(([k, m]) => [k, m.model ?? null])) : null);
        if (modelHash !== freeze.modelsHash) throw new Error("frozen_model_changed_during_evaluation");
      }
    } catch (e) {
      const message = (e as Error).message;
      if (!["learning_timeout", "experiment_budget_exhausted"].includes(message)) throw e;
      await study.archive.write("stage-stop.json", { reason: message });
    }
    const summary = await renderPairReport(study);
    process.stdout.write(JSON.stringify(summary) + "\n");
  } finally { await study.close(); }
}
