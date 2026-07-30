import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceUrl = "https://mjai.ekyu.moe/report/c1924cad66f66dd9.json";
const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Mortal fixture download failed: ${response.status}`);
}

const report = await response.json();
if (report.player_id !== 3 || report.review?.model_tag !== "4.1b") {
  throw new Error("Unexpected report identity or Mortal model");
}

const entries = report.review.kyokus[0].entries.filter(
  (entry) => entry.last_actor === 3 && (entry.junme === 6 || entry.junme === 7),
);
if (entries.length !== 2) {
  throw new Error(`Expected two regression entries, got ${entries.length}`);
}

const fixture = {
  source: {
    reportId: "c1924cad66f66dd9",
    modelTag: "4.1b",
    playerId: 3,
  },
  mjaiLog: report.mjai_log.slice(0, 64),
  decisions: entries,
};
const output = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json",
);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
