import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const rendererRoot = new URL("../src/renderer/", import.meta.url);
const html = readFileSync(new URL("index.html", rendererRoot), "utf8");
const electron = createRequire(import.meta.url)("electron") as string;
const harness = fileURLToPath(new URL("./electron-focus-harness.cjs", import.meta.url));
const startedAt = Date.parse("2026-10-05T12:34:00+08:00") / 1_000;
const record = {
  recordId: "261005-00000000-0000-0000-0000-000000000001",
  shareUrl: "https://game.maj-soul.com/1/?paipu=261005-00000000-0000-0000-0000-000000000001_a1",
  startedAt,
  players: [
    { seat: 0, displayName: "Alpha", finalScore: 27_000, rank: 2, gradingScore: null, gradingScoreUnit: null },
    { seat: 1, displayName: "Beta", finalScore: 18_000, rank: 4, gradingScore: null, gradingScoreUnit: null },
    { seat: 2, displayName: "Gamma", finalScore: 32_000, rank: 1, gradingScore: -123, gradingScoreUnit: "soul_pearl" },
    { seat: 3, displayName: "Delta", finalScore: 23_000, rank: 3, gradingScore: null, gradingScoreUnit: null },
  ],
  selfSeat: 2,
  rule: {
    playerCount: 4,
    length: "south",
    modeId: 2,
    detailRuleHash: "sha256:7a53cc5deb60512f3dacacc7695dd5072077c6f4984dbedbff76e27092393b1c",
    displayLabel: "四人南风",
  },
  rankedMode: { id: 6, label: "四人银之间 · 半庄" },
  analysisStatus: "not_analyzed",
  lastSyncedAt: startedAt + 100,
};

type CatalogCard = Readonly<{
  title: string | null;
  players: readonly Readonly<{ text: string; tag: string; className: string; title: string | null }>[];
  button: string | null;
  fullText: string;
}>;

function expectedStartedAt(): string {
  const date = new Date(startedAt * 1_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function renderCatalogCard(): Promise<CatalogCard> {
  const directory = mkdtempSync(join(tmpdir(), "record-label-catalog-renderer-"));
  const profile = mkdtempSync(join(tmpdir(), "record-label-catalog-profile-"));
  try {
    for (const name of ["app", "fixed-review-ui", "record-label", "session-ui-policy", "paipu-ui-policy"]) {
      const source = readFileSync(new URL(`${name}.ts`, rendererRoot), "utf8");
      writeFileSync(join(directory, `${name}.js`), transpileModule(source, {
        compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
      }).outputText, "utf8");
    }
    const setup = `
      const record = ${JSON.stringify(record)};
      window.riichiCoach = {
        getSessionStatus: async () => ({ region: "cn", status: "valid", displayName: "fixture" }),
        openMahjongSoulLogin: async () => ({ region: "cn", status: "valid", displayName: "fixture" }),
        logoutMahjongSoul: async () => ({ region: "cn", status: "logged_out" }),
      };
      window.riichiCoachCatalog = {
        listAnalyzableRecords: async () => [record],
        syncAnalyzableRecords: async () => [record],
        getRecordAnalysisProgress: async () => ({ stage: "idle", completed: 0, total: null, elapsedMs: 0,
          estimatedTotalMs: null, remainingMs: null, estimateSource: "learning", steps: [] }),
        startRecordAnalysis: async () => { throw new Error("analysis not used by this renderer regression"); },
        clearSourceCache: async () => ({ pendingMaterials: 0 }),
      };
      window.riichiCoachPaipu = { importPaipu: async () => ({ status: "analysis_failed" }) };
      window.riichiCoachProvider = {
        status: async () => ({ configured: true, settings: null }),
        listReviewSessions: async () => [],
        openReview: async () => { throw new Error("review not used by this renderer regression"); },
        getReviewDetail: async () => { throw new Error("review not used by this renderer regression"); },
        leaveReview: async () => ({ status: "acknowledged" }),
        cancelGeneration: async () => ({ status: "acknowledged" }),
        generateReview: async () => ({ status: "failed", code: "generation_failed" }),
      };
      window.run = async () => {
        for (let i = 0; i < 100 && document.querySelector("#catalog-list .catalog-record-title") === null; i++) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      };
      window.focusResult = () => {
        const item = document.querySelector("#catalog-list li");
        return {
          title: item?.querySelector(".catalog-record-title")?.textContent ?? null,
          players: [...(item?.querySelectorAll(".catalog-record-players > *") ?? [])].map(player => ({
            text: player.textContent,
            tag: player.tagName,
            className: player.className,
            title: player.getAttribute("title"),
          })),
          button: item?.querySelector("button")?.textContent ?? null,
          fullText: item?.textContent ?? "",
        };
      };
    `;
    writeFileSync(join(directory, "setup.js"), setup, "utf8");
    writeFileSync(join(directory, "page.html"), html.replace(
      '<script type="module" src="./app.js"></script>',
      '<script src="./setup.js"></script><script type="module" src="./app.js"></script>',
    ), "utf8");
    const config = join(directory, "input.json");
    writeFileSync(config, JSON.stringify({ directory, profile, scenarios: ["window.run()"] }), "utf8");
    return await new Promise<CatalogCard>((resolve, reject) => {
      const child = spawn(electron, [harness, config], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      child.stdout.on("data", data => { stdout += String(data); });
      child.stderr.on("data", data => { stderr += String(data); });
      const timer = setTimeout(() => {
        timedOut = true;
        if (process.platform === "win32" && child.pid !== undefined) {
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
        } else child.kill("SIGKILL");
      }, 30_000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("close", code => {
        clearTimeout(timer);
        if (timedOut || code !== 0) return reject(new Error(`Catalog renderer fixture failed (${code}): ${stderr}`));
        const line = stdout.split(/\r?\n/u).find(value => value.startsWith("FOCUS_RESULT="));
        if (line === undefined) return reject(new Error("Catalog renderer fixture result missing"));
        try { resolve(JSON.parse(line.slice("FOCUS_RESULT=".length))[0] as CatalogCard); }
        catch (error) { reject(error); }
      });
    });
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

describe("catalog record label renderer", () => {
  it("renders date and rule plus all players ordered by rank with the actual self seat highlighted", async () => {
    const card = await renderCatalogCard();
    expect(card.title).toBe(`${expectedStartedAt()} · 四人南风 · 四人银之间 · 半庄 · 本局魂珠 -1.23`);
    expect(card.players.map(player => player.text)).toEqual([
      "西位 · Gamma · 第1名 · 32,000点 · 魂珠 -1.23",
      "东位 · Alpha · 第2名 · 27,000点",
      "北位 · Delta · 第3名 · 23,000点",
      "南位 · Beta · 第4名 · 18,000点",
    ]);
    expect(card.players[0]).toMatchObject({
      tag: "STRONG",
      className: "catalog-record-player catalog-record-player-self",
      title: "本人",
    });
    expect(card.players.slice(1).every(player => player.tag === "SPAN")).toBe(true);
    expect(card.button).toBe("分析");
    expect(card.fullText).not.toContain("你为");
  }, 60_000);
});
