// Runner-agnostic, matching the repo's script-test convention: vitest picks
// this file up during `npm test` (VITEST=true), `node --test` runs it directly.
const test = process.env.VITEST === "true"
  ? (await import("vitest")).test
  : (await import("node:test")).test;

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkWorkspace,
  extractImportSpecifiers,
  stripComments,
} from "./check-architecture.mjs";

const PACKAGE_EXPORTS = (extra = {}) =>
  JSON.stringify({ ".": { types: "./src/index.ts", import: "./dist/index.js" }, ...extra }, null, 2);

function write(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf8");
}

function makePackage(root, dir, name, exportsMap) {
  write(root, join(dir, "package.json"), JSON.stringify({
    name,
    private: true,
    type: "module",
    exports: exportsMap ?? { ".": { types: "./src/index.ts", import: "./dist/index.js" } },
  }, null, 2));
}

/** Build a synthetic workspace; returns the temp root (caller cleans up). */
function buildWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "arch-check-"));
  makePackage(root, "packages/contracts", "@riichi-coach/contracts");
  makePackage(root, "packages/alpha", "@riichi-coach/alpha");
  makePackage(root, "packages/beta", "@riichi-coach/beta");
  makePackage(root, "packages/reasoning", "@riichi-coach/reasoning");
  makePackage(root, "packages/desktop", "@riichi-coach/desktop", {
    ".": { types: "./src/index.ts", import: "./dist/index.js" },
    "./session-api": { types: "./src/session-api.ts", import: "./dist/session-api.js" },
  });
  return root;
}

const TEST_ALLOWED_EDGES = {
  "@riichi-coach/contracts": [],
  "@riichi-coach/alpha": ["@riichi-coach/contracts"],
  "@riichi-coach/beta": ["@riichi-coach/contracts"],
  "@riichi-coach/reasoning": ["@riichi-coach/contracts"],
  "@riichi-coach/desktop": [
    "@riichi-coach/contracts",
    "@riichi-coach/alpha",
    "@riichi-coach/beta",
    "@riichi-coach/reasoning",
  ],
};

function clean(root) {
  rmSync(root, { recursive: true, force: true });
}

test("clean workspace reports no violations", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/alpha/src/index.ts", 'import type { T } from "@riichi-coach/contracts";\n');
    write(root, "packages/desktop/src/renderer/ui.ts", 'import type { T } from "@riichi-coach/contracts";\n');
    write(root, "packages/alpha/tests/integration.test.ts", 'import { x } from "@riichi-coach/reasoning";\n');

    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
    assert.equal(result.packageCount, 5);
  } finally {
    clean(root);
  }
});

test("flags a forbidden reverse package dependency in production src", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/alpha/src/index.ts", 'import { x } from "@riichi-coach/beta";\n');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.equal(result.violations.length, 1);
    const violation = result.violations[0];
    assert.equal(violation.rule, "package_dependency_direction");
    assert.equal(violation.file, "packages/alpha/src/index.ts");
    assert.equal(violation.line, 1);
    assert.match(violation.message, /@riichi-coach\/alpha.*must not import.*@riichi-coach\/beta/);
    assert.match(violation.inv, /INV-003/);
  } finally {
    clean(root);
  }
});

test("does not flag test files importing another package's public surface", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/alpha/tests/integration.test.ts", 'import { x } from "@riichi-coach/reasoning";\n');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
  } finally {
    clean(root);
  }
});

test("flags renderer code importing a privileged package", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/desktop/src/renderer/ui.ts", 'import { secret } from "@riichi-coach/reasoning";\n');
    write(root, "packages/desktop/src/preload.ts", 'import { x } from "@riichi-coach/contracts";\n');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.equal(result.violations.length, 1);
    const violation = result.violations[0];
    assert.equal(violation.rule, "renderer_safe_boundary");
    assert.equal(violation.file, "packages/desktop/src/renderer/ui.ts");
    assert.match(violation.message, /Renderer\/preload.*must not import/);
    assert.match(violation.inv, /INV-005/);
  } finally {
    clean(root);
  }
});

test("flags relative deep imports into another package", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/alpha/src/index.ts", 'import { bridge } from "../../beta/src/bridge.js";\n');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.equal(result.violations.length, 1);
    const violation = result.violations[0];
    assert.equal(violation.rule, "package_internal_import");
    assert.match(violation.message, /another package's internals/);
  } finally {
    clean(root);
  }
});

test("flags undeclared subpath imports but allows declared public exports", () => {
  const root = buildWorkspace();
  try {
    write(root, "scripts/undeclared.mjs", 'import { x } from "@riichi-coach/reasoning/dist/internal.js";\n');
    write(root, "scripts/declared.mjs", 'import { parse } from "@riichi-coach/desktop/session-api";\n');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.equal(result.violations.length, 1);
    const violation = result.violations[0];
    assert.equal(violation.rule, "package_internal_import");
    assert.equal(violation.file, "scripts/undeclared.mjs");
    assert.match(violation.message, /not a declared public export/);
  } finally {
    clean(root);
  }
});

test("declared subpath imports still obey dependency direction", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "packages/alpha/src/index.ts",
      'import { parse } from "@riichi-coach/desktop/session-api";\n',
    );
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.equal(result.violations.length, 1);
    const violation = result.violations[0];
    assert.equal(violation.rule, "package_dependency_direction");
    assert.match(violation.message, /must not import "@riichi-coach\/desktop"/);
  } finally {
    clean(root);
  }
});

test("honors the deep-import allowlist", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "scripts/generate-factor-regression-golden.mjs",
      'import { bridge } from "../packages/reasoning/dist/import/legacy-event-stream-bridge.js";\n',
    );
    write(
      root,
      "scripts/other.mjs",
      'import { bridge } from "../packages/reasoning/dist/import/legacy-event-stream-bridge.js";\n',
    );
    const result = checkWorkspace(root, {
      allowedEdges: TEST_ALLOWED_EDGES,
      deepImportAllowlist: ["scripts/generate-factor-regression-golden.mjs"],
    });
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].file, "scripts/other.mjs");
  } finally {
    clean(root);
  }
});

test("reports the correct line number for a later violation", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "packages/alpha/src/index.ts",
      'import { a } from "@riichi-coach/contracts";\n\n// fine\nimport { b } from "@riichi-coach/beta";\n',
    );
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].line, 4);
  } finally {
    clean(root);
  }
});

test("stripComments removes import-looking text from comments only", () => {
  const code = '// import { x } from "fake-a";\n/* import { y } from "fake-b"; */\nimport { z } from "./real.js";\n';
  const stripped = stripComments(code);
  const specifiers = extractImportSpecifiers(stripped).map((entry) => entry.specifier);
  assert.deepEqual(specifiers, ["./real.js"]);
});

test("extractImportSpecifiers covers multiline, type, dynamic and bare imports", () => {
  const code = [
    'import {',
    '  a,',
    '} from "./multi.js";',
    'import type { T } from "./types.js";',
    'const x = import("./dynamic.js");',
    'import "./side-effect.js";',
    'const y = require("./cjs.js");',
    'export * from "./re-export.js";',
  ].join("\n");
  const specifiers = extractImportSpecifiers(stripComments(code)).map((entry) => entry.specifier);
  assert.deepEqual(specifiers, [
    "./multi.js",
    "./types.js",
    "./dynamic.js",
    "./side-effect.js",
    "./cjs.js",
    "./re-export.js",
  ]);
});
