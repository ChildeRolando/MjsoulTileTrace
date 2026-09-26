// Runner-agnostic, matching the repo's script-test convention: vitest picks
// this file up during `npm test` (VITEST=true), `node --test` runs it directly.
const test = process.env.VITEST === "true"
  ? (await import("vitest")).test
  : (await import("node:test")).test;

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkWorkspace } from "./check-architecture.mjs";

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
  makePackage(root, "packages/mortal-runtime", "@riichi-coach/mortal-runtime");
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
  "@riichi-coach/mortal-runtime": ["@riichi-coach/contracts"],
  "@riichi-coach/desktop": [
    "@riichi-coach/contracts",
    "@riichi-coach/alpha",
    "@riichi-coach/beta",
    "@riichi-coach/reasoning",
    "@riichi-coach/mortal-runtime",
  ],
};

function clean(root) {
  rmSync(root, { recursive: true, force: true });
}

// --- valid cases -----------------------------------------------------------

test("clean workspace reports no violations", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/alpha/src/index.ts", 'import type { T } from "@riichi-coach/contracts";\n');
    write(root, "packages/desktop/src/renderer/ui.ts", 'import type { T } from "@riichi-coach/contracts";\n');
    write(root, "packages/alpha/tests/integration.test.ts", 'import { x } from "@riichi-coach/reasoning";\n');

    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
    assert.equal(result.packageCount, 6);
  } finally {
    clean(root);
  }
});

test("test code may consume another package's public API", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/alpha/tests/integration.test.ts", 'import { x } from "@riichi-coach/reasoning";\n');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
  } finally {
    clean(root);
  }
});

test("declared public package subpath is allowed from tooling", () => {
  const root = buildWorkspace();
  try {
    write(root, "scripts/declared.mjs", 'import { parse } from "@riichi-coach/desktop/session-api";\n');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
  } finally {
    clean(root);
  }
});

test("import-looking text in comments never triggers a violation", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "packages/alpha/src/index.ts",
      '// import { x } from "@riichi-coach/reasoning";\n' +
        '/* import { y } from "@riichi-coach/reasoning"; */\n',
    );
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
  } finally {
    clean(root);
  }
});

test("import-looking text in ordinary strings never triggers a violation", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "packages/alpha/src/index.ts",
      'const s = \'import { foo } from "@riichi-coach/reasoning"\';',
    );
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
  } finally {
    clean(root);
  }
});

test("import-looking text in template literals never triggers a violation", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "packages/alpha/src/index.ts",
      "const t = `require(\"@riichi-coach/reasoning\")`;",
    );
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
  } finally {
    clean(root);
  }
});

// --- violations ------------------------------------------------------------

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

test("flags renderer code importing a privileged package", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/desktop/src/renderer/ui.ts", 'import { secret } from "@riichi-coach/reasoning";\n');
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

test("flags preload importing a privileged package", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/desktop/src/preload.ts", 'import { secret } from "@riichi-coach/reasoning";\n');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.equal(result.violations.length, 1);
    const violation = result.violations[0];
    assert.equal(violation.rule, "renderer_safe_boundary");
    assert.equal(violation.file, "packages/desktop/src/preload.ts");
  } finally {
    clean(root);
  }
});

test("keeps Mortal subprocess/checkpoint capability out of reasoning and mortal-source", () => {
  const root = buildWorkspace();
  try {
    makePackage(root, "packages/mortal-source", "@riichi-coach/mortal-source");
    const allowed = {
      ...TEST_ALLOWED_EDGES,
      "@riichi-coach/mortal-source": ["@riichi-coach/contracts"],
    };
    write(root, "packages/reasoning/src/bypass.ts", 'import { ManagedMortalRuntime } from "@riichi-coach/mortal-runtime";\n');
    write(root, "packages/mortal-source/src/bypass.ts", 'import { ManagedMortalRuntime } from "@riichi-coach/mortal-runtime";\n');
    const result = checkWorkspace(root, { allowedEdges: allowed });
    assert.equal(result.violations.length, 2);
    assert.ok(result.violations.every((violation) => violation.rule === "package_dependency_direction"));
  } finally {
    clean(root);
  }
});

test("keeps Mortal runtime capability out of renderer and preload", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/desktop/src/renderer/runtime.ts", 'import { ManagedMortalRuntime } from "@riichi-coach/mortal-runtime";\n');
    write(root, "packages/desktop/src/preload.ts", 'import { ManagedMortalRuntime } from "@riichi-coach/mortal-runtime";\n');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    const violations = result.violations.filter((violation) => violation.rule === "renderer_safe_boundary");
    assert.equal(violations.length, 2);
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

test("only the coach service may use the report generation seam", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/desktop/src/llm-provider/service.ts", 'import { generateReviewReport } from "@riichi-coach/reasoning";\n');
    write(root, "packages/desktop/src/coach-ipc.ts", 'import { generateReviewReport, assembleReviewReport } from "@riichi-coach/reasoning";\n');
    write(root, "packages/desktop/src/bypass.ts", 'import { createOpenAiCoachProvider } from "./llm-provider/openai-compatible.js";\n');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    const seamViolations = result.violations.filter(
      (violation) => violation.rule === "review_report_generation_seam",
    );
    assert.equal(seamViolations.length, 3);
    assert.deepEqual(
      seamViolations.map((violation) => violation.file),
      [
        "packages/desktop/src/bypass.ts",
        "packages/desktop/src/coach-ipc.ts",
        "packages/desktop/src/coach-ipc.ts",
      ],
    );
  } finally {
    clean(root);
  }
});

for (const [form, code] of Object.entries({
  reexport: 'export { createOpenAiCoachProvider } from "./llm-provider/openai-compatible.js";',
  starReexport: 'export * from "./llm-provider/openai-compatible.js";',
  namespaceReexport: 'export * as provider from "./llm-provider/openai-compatible.js";',
  dynamicImport: 'await import("./llm-provider/openai-compatible.js");',
  require: 'require("./llm-provider/openai-compatible.js");',
  importEquals: 'import provider = require("./llm-provider/openai-compatible.js");',
  namespaceImport: 'import * as provider from "./llm-provider/openai-compatible.js";',
  defaultImport: 'import provider from "./llm-provider/openai-compatible.js";',
  namedDefaultImport: 'import { default as provider } from "./llm-provider/openai-compatible.js";',
  mixedDefaultImport: 'import provider, { createOpenAiCoachProvider } from "./llm-provider/openai-compatible.js";',
  sideEffectImport: 'import "./llm-provider/openai-compatible.js";',
  templateImport: 'await import(`./llm-provider/openai-compatible.js`);',
})) {
  for (const file of ["coach-ipc.ts", "llm-provider/service.ts"]) {
    test(`concrete provider ownership rejects ${form} in ${file}`, () => {
      const root = buildWorkspace();
      const path = `packages/desktop/src/${file}`;
      try {
        const providerPath = file === "llm-provider/service.ts"
          ? "./openai-compatible.js"
          : "./llm-provider/openai-compatible.js";
        write(root, path, `// boundary regression\n${code.replaceAll("./llm-provider/openai-compatible.js", providerPath)}\n`);
        const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
        assert.equal(result.violations.length, 1);
        assert.equal(result.violations[0].rule, "review_report_generation_seam");
        assert.equal(result.violations[0].file, path);
        assert.equal(result.violations[0].line, 2);
      } finally {
        clean(root);
      }
    });
  }
}

test("coach service may statically compose the concrete provider with a named import", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "packages/desktop/src/llm-provider/service.ts",
      'import { createOpenAiCoachProvider as createProvider } from "./openai-compatible.js";\n',
    );
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
  } finally {
    clean(root);
  }
});

for (const [form, code] of Object.entries({
  reexport: 'export { generateReviewReport } from "@riichi-coach/reasoning";',
  starReexport: 'export * from "@riichi-coach/reasoning";',
  namespaceReexport: 'export * as reasoning from "@riichi-coach/reasoning";',
  dynamicImport: 'await import("@riichi-coach/reasoning");',
  require: 'require("@riichi-coach/reasoning");',
  importEquals: 'import reasoning = require("@riichi-coach/reasoning");',
  namespaceImport: 'import * as reasoning from "@riichi-coach/reasoning";',
  defaultImport: 'import reasoning from "@riichi-coach/reasoning";',
  namedDefaultImport: 'import { default as reasoning } from "@riichi-coach/reasoning";',
  mixedDefaultImport: 'import reasoning, { validateReviewReport } from "@riichi-coach/reasoning";',
  sideEffectImport: 'import "@riichi-coach/reasoning";',
  templateImport: 'await import(`@riichi-coach/reasoning`);',
})) {
  for (const file of ["report-store.ts", "llm-provider/service.ts"]) {
    test(`generation authority rejects ${form} in ${file}`, () => {
      const root = buildWorkspace();
      const path = `packages/desktop/src/${file}`;
      try {
        write(root, path, `// boundary regression\n${code}\n`);
        const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
        assert.equal(result.violations.length, 1);
        assert.equal(result.violations[0].rule, "review_report_generation_seam");
        assert.equal(result.violations[0].file, path);
        assert.equal(result.violations[0].line, 2);
      } finally {
        clean(root);
      }
    });
  }
}

test("aliased generation imports retain symbol ownership", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/desktop/src/llm-provider/service.ts", 'import { generateReviewReport as generate } from "@riichi-coach/reasoning";');
    write(root, "packages/desktop/src/report-store.ts", 'import { generateReviewReport as generate, assembleReviewReport as assemble } from "@riichi-coach/reasoning";');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.equal(result.violations.length, 2);
    assert.ok(result.violations.every((v) => v.rule === "review_report_generation_seam" && v.file.endsWith("report-store.ts")));
  } finally {
    clean(root);
  }
});

test("read-back validation remains allowed outside generation", () => {
  const root = buildWorkspace();
  try {
    write(root, "packages/desktop/src/report-store.ts", 'import { validateReviewReport, validateStrictAnalysisPackage as validatePackage } from "@riichi-coach/reasoning";\n');
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
  } finally {
    clean(root);
  }
});

test("presenter may use only the authorized read-back composition seam", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "packages/desktop/src/fixed-review-presenter.ts",
      'import { composeReviewReadBackContext } from "@riichi-coach/reasoning";\n',
    );
    write(
      root,
      "packages/reasoning/src/review-read-back.ts",
      [
        'import { projectContextGraph } from "./context-graph/project-context-graph.js";',
        'import { validateStructuredAnalysisPackage } from "./validate/structured-package-validator.js";',
        'import { validateReviewReport } from "./groundingValidator.js";',
        'import { appendReasoningOverlay } from "./reviewReport.js";',
      ].join("\n"),
    );
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
  } finally {
    clean(root);
  }
});

test("presenter cannot bypass read-back or generation ownership", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "packages/desktop/src/fixed-review-presenter.ts",
      [
        "import {",
        "  appendReasoningOverlay,",
        "  assembleReviewReport,",
        "  buildCoachRequest,",
        "  buildGraphContextSlice,",
        "  generateReviewReport,",
        '} from "@riichi-coach/reasoning";',
        'import { createOpenAiCoachProvider } from "./llm-provider/openai-compatible.js";',
      ].join("\n"),
    );
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    const seamViolations = result.violations.filter(
      (violation) => violation.rule === "review_report_generation_seam",
    );
    assert.equal(seamViolations.length, 6);
    assert.ok(seamViolations.every(
      (violation) => violation.file === "packages/desktop/src/fixed-review-presenter.ts",
    ));
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

test("violation reports useful file and line information", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "packages/alpha/src/index.ts",
      'import { a } from "@riichi-coach/contracts";\n\n// fine\nimport { b } from "@riichi-coach/beta";\n',
    );
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].file, "packages/alpha/src/index.ts");
    assert.equal(result.violations[0].line, 4);
  } finally {
    clean(root);
  }
});

// --- syntax forms ----------------------------------------------------------

test("detects every supported import syntax form", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "scripts/forms.mjs",
      [
        'import { a } from "@riichi-coach/alpha/dist/a.js";',
        'import type { T } from "@riichi-coach/alpha/dist/t.js";',
        'import "@riichi-coach/alpha/dist/s.js";',
        'export { b } from "@riichi-coach/alpha/dist/e.js";',
        'export * from "@riichi-coach/alpha/dist/star.js";',
        'const d = await import("@riichi-coach/alpha/dist/d.js");',
        'const r = require("@riichi-coach/alpha/dist/r.js");',
      ].join("\n") + "\n",
    );
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.equal(result.violations.length, 7);
    for (const violation of result.violations) {
      assert.equal(violation.rule, "package_internal_import");
      assert.match(violation.message, /not a declared public export/);
    }
    assert.deepEqual(
      result.violations.map((violation) => violation.line),
      [1, 2, 3, 4, 5, 6, 7],
    );
  } finally {
    clean(root);
  }
});

test("runtime-computed import specifiers are intentionally ignored", () => {
  const root = buildWorkspace();
  try {
    write(
      root,
      "scripts/computed.mjs",
      [
        'const a = await import(getPackageName());',
        'const b = require(moduleName);',
        "const c = import(`@riichi-coach/alpha/${suffix}`);",
      ].join("\n") + "\n",
    );
    const result = checkWorkspace(root, { allowedEdges: TEST_ALLOWED_EDGES });
    assert.deepEqual(result.violations, []);
  } finally {
    clean(root);
  }
});
