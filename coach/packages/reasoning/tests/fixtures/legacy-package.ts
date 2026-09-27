import { readFile } from "node:fs/promises";
import type { StructuredAnalysisPackage } from "@riichi-coach/contracts";
import { validateStructuredAnalysisPackage } from "../../src/validate/structured-package-validator.js";

/** Saved v1 data from the fixed 975d329 synthetic producer. Read-only backwards
 * compatibility fixture; never executes the retired legality/proof algorithm. */
export async function readLegacyPackage(mode: "ready" | "missing" = "ready"): Promise<StructuredAnalysisPackage> {
  const pkg = JSON.parse(await readFile(new URL(`./legacy-package-${mode}.json`, import.meta.url), "utf8")) as StructuredAnalysisPackage;
  validateStructuredAnalysisPackage(pkg);
  return pkg;
}
