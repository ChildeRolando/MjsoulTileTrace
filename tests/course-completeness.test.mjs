import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { analyzeDiscards, parseCompactHand } from "../lib/mahjong.mjs";

const root = process.cwd();
const tileIds = [
  "1m","2m","3m","4m","5m","6m","7m","8m","9m",
  "1p","2p","3p","4p","5p","6p","7p","8p","9p",
  "1s","2s","3s","4s","5s","6s","7s","8s","9s",
  "1z","2z","3z","4z","5z","6z","7z"
];
const lessonSlugs = [
  "0001-effective-tiles-and-live-counts",
  "0002-wait-shapes-and-direct-ukeire",
  "0003-penchan-versus-kanchan-improvement",
  "0004-floating-tile-value",
  "0005-five-block-and-shanten",
  "0006-compound-shapes-abcd-abbc",
  "0007-reinforced-taatsu-2334",
  "0008-pair-selection",
  "0009-six-block-theory",
  "0010-visible-tile-interference",
  "0011-lexicographic-discard-model",
  "0012-speed-drills-and-exam",
  "0013-one-shanten-families",
  "0014-standard-one-shanten",
  "0015-headless-one-shanten",
  "0016-kuttsuki-one-shanten",
  "0017-complex-waits",
  "0018-mastery-protocol"
];

test("manifest maps all thirty-four unique tiles to local SVG files", () => {
  const manifestPath = path.join(root, "assets", "tiles", "manifest.json");
  assert.ok(fs.existsSync(manifestPath), "tile manifest is missing");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.deepEqual(Object.keys(manifest).sort(), [...tileIds].sort());
  for (const [id, item] of Object.entries(manifest)) {
    assert.match(item.name, /^[一二三四五六七八九东西南北白发中][万筒索]?$/);
    assert.equal(item.file, `${id}.svg`);
    const svgPath = path.join(root, "assets", "tiles", item.file);
    assert.ok(fs.existsSync(svgPath), `${id} SVG is missing`);
    const svg = fs.readFileSync(svgPath, "utf8");
    assert.match(svg, /<svg\b/);
    assert.match(svg, /viewBox="0 0 72 96"/);
    assert.ok(!svg.includes("TODO"));
  }
});

test("course contains a linked index and eighteen complete visual lessons", () => {
  const indexPath = path.join(root, "index.html");
  assert.ok(fs.existsSync(indexPath), "course index is missing");
  const index = fs.readFileSync(indexPath, "utf8");
  assert.ok(index.includes("已完成 0 / 18 课"));
  for (const slug of lessonSlugs) {
    const relative = `lessons/${slug}.html`;
    assert.ok(index.includes(relative), `index does not link ${relative}`);
    const lessonPath = path.join(root, relative);
    assert.ok(fs.existsSync(lessonPath), `${relative} is missing`);
    const html = fs.readFileSync(lessonPath, "utf8");
    assert.match(html, /<h1>[^<]+<\/h1>/);
    assert.ok(html.includes("继续追问你的教师"));
    assert.ok(html.includes("data-question="));
    const groups = [...html.matchAll(/<button[^>]+data-question="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(groups).size, 3, `${slug} must have three quiz groups`);
    for (const group of new Set(groups)) {
      assert.equal(groups.filter((id) => id === group).length, 3, `${slug} ${group} must have three choices`);
    }
    const tileImages = [...html.matchAll(/<img[^>]+class="[^"]*\btile\b[^"]*"[^>]*>/g)].map((match) => match[0]);
    assert.ok(tileImages.length >= 6, `${slug} must use tile images`);
    for (const image of tileImages) {
      assert.match(image, /src="\.\.\/assets\/tiles\/(?:[1-9][mps]|[1-7]z)\.svg"/);
      assert.match(image, /alt="[^"]+"/);
    }
  }
});

test("graduation example is a genuine six-block hand", () => {
  const graduation = fs.readFileSync(path.join(root, "lessons", "0012-speed-drills-and-exam.html"), "utf8");
  assert.ok(graduation.includes("六个功能块"));
  assert.ok(graduation.includes("边张"));
  assert.ok(graduation.includes("嵌张"));
  assert.ok(!graduation.includes("两张孤立牌"));
});

test("printable visual references exist", () => {
  for (const file of ["effective-tiles.html", "glossary.html", "decision-model.html", "shapes.html", "probability-model.html"]) {
    const referencePath = path.join(root, "reference", file);
    assert.ok(fs.existsSync(referencePath), `${file} is missing`);
    const html = fs.readFileSync(referencePath, "utf8");
    assert.ok(html.includes("@media print"), `${file} lacks print styling`);
  }
});

test("visual analyzer and mixed drill trainer are complete", () => {
  const analyzerPath = path.join(root, "analyzer.html");
  const trainerPath = path.join(root, "trainer.html");
  assert.ok(fs.existsSync(analyzerPath), "visual analyzer is missing");
  assert.ok(fs.existsSync(trainerPath), "mixed drill trainer is missing");
  const analyzer = fs.readFileSync(analyzerPath, "utf8");
  const trainer = fs.readFileSync(trainerPath, "utf8");
  assert.ok(analyzer.includes("assets/analyzer.js"));
  assert.ok(trainer.includes("assets/trainer.js"));
  assert.ok(analyzer.includes("id=\"tile-palette\""));
  assert.ok(analyzer.includes("id=\"analysis-results\""));
  assert.ok(trainer.includes("id=\"drill-hand\""));
  assert.ok(trainer.includes("id=\"drill-feedback\""));
  const trainerScript = fs.readFileSync(path.join(root, "assets", "trainer.js"), "utf8");
  const drillHands = [...trainerScript.matchAll(/\bhand:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(drillHands.length, 20, "trainer must contain twenty fixed hands");
  for (const hand of drillHands) {
    const counts = parseCompactHand(hand);
    assert.equal(counts.reduce((sum,count) => sum + count, 0), 14, `${hand} is not a fourteen-tile hand`);
    assert.ok(analyzeDiscards(counts).length > 0, `${hand} has no discard analysis`);
  }
  for (const file of ["assets/analyzer.js", "assets/trainer.js"]) {
    const script = fs.readFileSync(path.join(root, file), "utf8");
    assert.ok(script.includes("../lib/mahjong.mjs"), `${file} must use the exact engine`);
  }
});

test("all relative HTML, script, stylesheet and image links resolve", () => {
  const htmlFiles = [
    path.join(root, "index.html"),
    path.join(root, "analyzer.html"),
    path.join(root, "trainer.html"),
    ...lessonSlugs.map((slug) => path.join(root, "lessons", `${slug}.html`)),
    ...["effective-tiles.html", "glossary.html", "decision-model.html", "shapes.html", "probability-model.html"].map((file) => path.join(root, "reference", file))
  ];
  for (const htmlPath of htmlFiles) {
    assert.ok(fs.existsSync(htmlPath), `${htmlPath} is missing`);
    const html = fs.readFileSync(htmlPath, "utf8");
    const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((href) => !/^(?:https?:|#|data:)/.test(href));
    for (const href of links) {
      const target = path.resolve(path.dirname(htmlPath), href.split("#")[0]);
      assert.ok(fs.existsSync(target), `${path.relative(root, htmlPath)} has broken link ${href}`);
    }
  }
});
