#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzePrototypeGame,
  renderCoachGameMarkdown,
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
} from "@riichi-coach/reasoning";

const coachRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultFixture = path.join(
  coachRoot,
  "fixtures",
  "mortal",
  "c1924cad66f66dd9-east1-turn6-7.json",
);
const resourcesDir = path.join(coachRoot, "resources");

function usage() {
  console.log(`riichi-coach — 日麻 AI 教练原型（可审计五轴 + 逐威胁防守矩阵）

用法：
  node bin/riichi-coach.mjs [报告.json] [--out 输出目录]

参数：
  报告.json   Mortal 牌谱（source + mjaiLog + decisions 格式）路径；默认使用
              fixtures/mortal/c1924cad66f66dd9-east1-turn6-7.json 演示。
  --out <目录> 输出 JSON 报告与 Markdown 报告到该目录；默认 coach/reports。

输出：
  <reportId>-report.json  完整结构化报告
  <reportId>-report.md    可读分析报告
`);
}

function parseArgs(argv) {
  let reportPath = defaultFixture;
  let outDir = path.join(coachRoot, "reports");
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--out" || arg === "--output") {
      outDir = argv[++index];
      if (outDir === undefined) throw new Error("--out 缺少输出目录");
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg.startsWith("-")) throw new Error(`未知参数：${arg}`);
    reportPath = arg;
  }
  return { reportPath, outDir };
}

function safeBaseName(value) {
  return value.replace(/[^0-9A-Za-z._-]/gu, "-");
}

async function main() {
  const { reportPath, outDir } = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(await readFile(reportPath, "utf8"));
  const client = new JsonlFactEngineClient(
    new ManagedFactEngineTransport(resourcesDir),
  );
  try {
    const report = await analyzePrototypeGame(raw, client);
    await mkdir(outDir, { recursive: true });
    const base = path.join(outDir, safeBaseName(report.sourceReportId));
    await writeFile(
      `${base}-report.json`,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      `${base}-report.md`,
      renderCoachGameMarkdown(report),
      "utf8",
    );
    console.log(`牌谱：${report.sourceReportId}`);
    console.log(`主视角玩家：${report.selfActor}`);
    console.log(`决策数：${report.decisions.length}`);
    console.log(`JSON 报告：${base}-report.json`);
    console.log(`Markdown 报告：${base}-report.md`);
    for (const decision of report.decisions) {
      console.log(`  ${decision.decisionId}（第 ${decision.turn} 巡）：${decision.explanation}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`riichi-coach 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
