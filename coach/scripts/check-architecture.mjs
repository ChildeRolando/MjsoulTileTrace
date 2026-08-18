/**
 * Mechanical architecture boundary check for the coach workspace.
 *
 * Three rules, each mapped to the invariants it protects (see
 * docs/development/INVARIANTS.md and docs/adr/0005-workspace-dependency-
 * boundaries.md):
 *
 *  R1 package_dependency_direction (INV-003 / INV-009)
 *     Workspace packages may only import riichi-coach packages listed in the
 *     allowed dependency direction table. Game-record providers
 *     (mahjong-soul-source, tenhou-source) must never import reasoning (a
 *     source cannot compute coach factors); reasoning must never import the
 *     game-record providers (their protocol semantics terminate before the
 *     canonical replay/reasoning boundary). reasoning MAY import
 *     mortal-source — the model/report evidence provider — whose public
 *     report-format contract it consumes (ADR-0005). Nothing below desktop
 *     may import desktop.
 *
 *  R2 renderer_safe_boundary (INV-005)
 *     Desktop renderer code and the preload entries must not import the
 *     privileged packages (mahjong-soul-source, mortal-source, tenhou-source,
 *     reasoning). They receive only safe DTOs through narrow desktop API
 *     modules and contracts. Direct-import level by design; transitive
 *     leakage is covered by the preload/security-boundary behavior tests.
 *
 *  R3 package_internal_import (INV-003 / INV-009)
 *     Cross-package imports must use the package root (the exports map
 *     exposes only "."). Subpath package imports and relative imports into
 *     another package's src/dist/tests are violations. A tiny allowlist
 *     covers repository tools that legitimately need a deliberately
 *     non-public bridge (see scripts/generate-factor-regression-golden.mjs).
 *
 * Parsing is owned by the TypeScript Compiler API (ts.createSourceFile + AST
 * traversal): only real module specifiers are collected, so import-looking
 * text inside comments, string literals, and template literals can never be
 * interpreted as an import. Only static/literal module specifiers are
 * governed; runtime-computed specifiers (e.g. import(getPackageName())) are
 * intentionally ignored.
 *
 * Run: npm run check:architecture   (from coach/)
 * Deterministic, offline, no external services. Exit 1 on any violation.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(THIS_DIR, "..");

const RULE_IDS = {
  packageDependencyDirection: "package_dependency_direction",
  rendererSafeBoundary: "renderer_safe_boundary",
  packageInternalImport: "package_internal_import",
};

/** Allowed riichi-coach dependency edges for production src code. */
export const DEFAULT_ALLOWED_EDGES = Object.freeze({
  "@riichi-coach/contracts": Object.freeze([]),
  "@riichi-coach/mahjong-soul-source": Object.freeze(["@riichi-coach/contracts"]),
  "@riichi-coach/tenhou-source": Object.freeze(["@riichi-coach/contracts"]),
  "@riichi-coach/mortal-source": Object.freeze(["@riichi-coach/contracts"]),
  // reasoning may consume the mortal-source report-format evidence contract
  // (ADR-0005) but must stay clear of game-record provider protocol details.
  "@riichi-coach/reasoning": Object.freeze([
    "@riichi-coach/contracts",
    "@riichi-coach/mortal-source",
  ]),
  // desktop is the composition root: it may wire every importer.
  "@riichi-coach/desktop": Object.freeze([
    "@riichi-coach/contracts",
    "@riichi-coach/mahjong-soul-source",
    "@riichi-coach/tenhou-source",
    "@riichi-coach/mortal-source",
    "@riichi-coach/reasoning",
  ]),
});

/** Packages whose raw protocol/secrets must never reach renderer code. */
export const DEFAULT_PRIVILEGED_PACKAGES = Object.freeze([
  "@riichi-coach/mahjong-soul-source",
  "@riichi-coach/mortal-source",
  "@riichi-coach/tenhou-source",
  "@riichi-coach/reasoning",
]);

/**
 * Files allowed to import package internals outside the owning package.
 * Each entry is a path relative to the coach root.
 */
export const DEFAULT_DEEP_IMPORT_ALLOWLIST = Object.freeze([
  // Needs the deliberately non-public legacy bridge to regenerate goldens.
  "scripts/generate-factor-regression-golden.mjs",
]);

const WORKSPACE_PACKAGE_PREFIX = "@riichi-coach/";

const CODE_EXTENSIONS = new Set(["ts", "mts", "cts", "js", "mjs", "cjs"]);

// Build output and dependency directories are never scanned: they are not
// authored source and their imports are not governed by the boundary rules.
const SKIP_DIRECTORIES = new Set(["dist", "node_modules", ".git"]);

/**
 * Collect every static module specifier in a source file using the TypeScript
 * Compiler API. Recognized AST nodes:
 *  - ImportDeclaration (import ..., import type ..., side-effect import)
 *  - ExportDeclaration with a module specifier (export ... from, export * from)
 *  - CallExpression import("...") with a string-literal first argument
 *  - CallExpression require("...") with a string-literal first argument
 * Comments, string literals, and template literals never produce specifiers
 * because they are not module-specifier syntax nodes.
 * @returns {{ specifier: string, line: number }[]} 1-based line numbers
 */
export function collectModuleSpecifiers(code, fileName) {
  const scriptKind = /\.(m?js|cjs)$/u.test(fileName)
    ? ts.ScriptKind.JS
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    scriptKind,
  );
  const specifiers = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec !== undefined && ts.isStringLiteral(spec)) {
        specifiers.push(spec);
      }
    } else if (ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec !== undefined && ts.isStringLiteral(spec)) {
        specifiers.push(spec);
      }
    } else if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const isDynamicImport = ts.isImportKeyword(expression);
      const isRequire = ts.isIdentifier(expression) && expression.text === "require";
      const argument = node.arguments[0];
      if ((isDynamicImport || isRequire) && ts.isStringLiteral(argument)) {
        specifiers.push(argument);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers.map((node) => ({
    specifier: node.text,
    line: ts.getLineAndCharacterOfPosition(
      sourceFile,
      node.getStart(sourceFile),
    ).line + 1,
  }));
}

function walkFiles(dir, extensions, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, extensions, out);
    } else if (extensions.has(entry.name.split(".").pop())) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Run the boundary check over a workspace root.
 * @param {string} root coach repository root
 * @param {object} [opts] overrides (mainly for the checker's own tests)
 */
export function checkWorkspace(root, opts = {}) {
  const allowedEdges = opts.allowedEdges ?? DEFAULT_ALLOWED_EDGES;
  const privilegedPackages = new Set(
    opts.privilegedPackages ?? DEFAULT_PRIVILEGED_PACKAGES,
  );
  const deepImportAllowlist = new Set(
    opts.deepImportAllowlist ?? DEFAULT_DEEP_IMPORT_ALLOWLIST,
  );
  const workspacePattern = opts.workspacePattern ?? ["packages/*"];
  const scanExtensions = new Set(opts.scanExtensions ?? ["ts", "mjs"]);

  // Discover workspace packages: dir name -> package name.
  const packageDirs = new Map();
  for (const pattern of workspacePattern) {
    if (!pattern.includes("*")) continue;
    const [base] = pattern.split("*");
    const baseDir = join(root, base);
    let children;
    try {
      children = readdirSync(baseDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of children) {
      if (!entry.isDirectory()) continue;
      const pkgJsonPath = join(baseDir, entry.name, "package.json");
      try {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
        if (typeof pkgJson.name === "string" && pkgJson.name.startsWith(WORKSPACE_PACKAGE_PREFIX)) {
          packageDirs.set(entry.name, {
            name: pkgJson.name,
            dir: join(baseDir, entry.name),
          });
        }
      } catch {
        // not a workspace package
      }
    }
  }

  const violations = [];
  let scannedFiles = 0;
  let scannedImports = 0;

  const record = (rule, file, line, message, inv) => {
    violations.push({ rule, file, line, message, inv });
  };

  // Declared public subpaths per package (e.g. desktop's "./session-api").
  // A subpath import is only a violation when the target package does not
  // declare it in its exports map.
  const declaredSubpaths = new Map();
  for (const entry of packageDirs.values()) {
    let exportsMap;
    try {
      exportsMap = JSON.parse(
        readFileSync(join(entry.dir, "package.json"), "utf8"),
      ).exports;
    } catch {
      continue;
    }
    if (exportsMap === null || typeof exportsMap !== "object") continue;
    const subpaths = Object.keys(exportsMap)
      .filter((key) => key !== ".")
      .map((key) => key.replace(/^\.\//, ""));
    declaredSubpaths.set(entry.name, new Set(subpaths));
  }

  // Package boundaries for relative deep-import detection.
  const isInsideAnyPackage = (absPath) => {
    const rel = relative(root, absPath);
    if (rel.startsWith("..") || isAbsolute(rel)) return false;
    for (const entry of packageDirs.values()) {
      const pkgRel = relative(entry.dir, absPath);
      if (!pkgRel.startsWith("..") && !isAbsolute(pkgRel)) return true;
    }
    return false;
  };

  const isRendererSafeFile = (relPath) => {
    const normalized = relPath.split(sep).join("/");
    return normalized.startsWith("packages/desktop/src/renderer/") ||
      normalized === "packages/desktop/src/preload.ts" ||
      normalized === "packages/desktop/src/preload-entry.ts";
  };

  const scanRoots = [];
  for (const dir of packageDirs.keys()) {
    const pkg = packageDirs.get(dir);
    scanRoots.push({ dir: pkg.dir, packageName: pkg.name });
  }
  // Repository tools: scripts/, smoke/ and bin/ are scanned for R3 only.
  scanRoots.push({ dir: join(root, "scripts"), packageName: null });
  scanRoots.push({ dir: join(root, "smoke"), packageName: null });
  scanRoots.push({ dir: join(root, "bin"), packageName: null });

  for (const scanRoot of scanRoots) {
    for (const file of walkFiles(scanRoot.dir, scanExtensions)) {
      const relPath = relative(root, file).split(sep).join("/");
      const ownerPackage = scanRoot.packageName;
      const allowlisted = deepImportAllowlist.has(relPath);
      // R1/R2 govern production src code only; tests may import any public
      // package surface (they are integration tests by design).
      const isProductionCode = ownerPackage !== null &&
        relPath.split("/").includes("src");
      const code = readFileSync(file, "utf8");
      scannedFiles += 1;

      for (const { specifier, line } of collectModuleSpecifiers(code, file)) {
        scannedImports += 1;

        // Builtins and external third-party packages are not governed here.
        if (isNodeBuiltin(specifier)) continue;
        if (!specifier.startsWith(WORKSPACE_PACKAGE_PREFIX) && !specifier.startsWith(".")) {
          continue;
        }

        if (specifier.startsWith(WORKSPACE_PACKAGE_PREFIX)) {
          const pkgName = workspacePackageName(specifier);
          const rest = specifier.slice(pkgName.length);
          const subpath = rest.replace(/^\//, "");

          if (![...packageDirs.values()].some((entry) => entry.name === pkgName)) {
            record(
              RULE_IDS.packageDependencyDirection,
              relPath, line,
              `Unknown workspace package "${pkgName}"`,
              "INV-003",
            );
            continue;
          }

          if (subpath !== "" && !allowlisted) {
            const declared = declaredSubpaths.get(pkgName);
            if (declared === undefined || !declared.has(subpath)) {
              record(
                RULE_IDS.packageInternalImport,
                relPath, line,
                `Subpath import "${specifier}" is not a declared public export ` +
                  `of "${pkgName}" (import "${pkgName}" instead)`,
                "INV-003/INV-009",
              );
              continue;
            }
            // Declared public subpath (e.g. desktop/session-api): fall through
            // so dependency-direction / renderer rules still apply to the
            // target package.
          }

          if (ownerPackage === null) continue; // scripts may import any public surface
          if (pkgName === ownerPackage) {
            record(
              RULE_IDS.packageInternalImport,
              relPath, line,
              `Self package import "${specifier}" — use a relative import`,
              "INV-003/INV-009",
            );
            continue;
          }
          if (isProductionCode && isRendererSafeFile(relPath) && privilegedPackages.has(pkgName)) {
            record(
              RULE_IDS.rendererSafeBoundary,
              relPath, line,
              `Renderer/preload code must not import privileged package "${pkgName}"`,
              "INV-005",
            );
            continue;
          }
          if (isProductionCode) {
            const allowed = allowedEdges[ownerPackage] ?? [];
            if (!allowed.includes(pkgName)) {
              record(
                RULE_IDS.packageDependencyDirection,
                relPath, line,
                `"${ownerPackage}" must not import "${pkgName}" ` +
                  `(allowed: ${allowed.length === 0 ? "none" : allowed.join(", ")})`,
                "INV-003/INV-009",
              );
            }
          }
          continue;
        }

        // Relative import.
        if (specifier.startsWith(".")) {
          const resolved = resolve(dirname(file), specifier);
          if (isInsideAnyPackage(resolved)) {
            const targetRel = relative(root, resolved).split(sep).join("/");
            const extension = targetRel.split(".").pop();
            // TS sources import compiled ".js" names; treat every JS/TS-ish
            // extension as code so data fixtures (".json", ".pb") stay allowed.
            const isCode = CODE_EXTENSIONS.has(extension);
            if (isCode && !allowlisted && !ownerIsPackageDir(ownerPackage, resolved, packageDirs)) {
              record(
                RULE_IDS.packageInternalImport,
                relPath, line,
                `Relative import "${specifier}" reaches another package's internals ` +
                  `(${targetRel}) — import the package root instead`,
                "INV-003/INV-009",
              );
            }
          }
        }
      }
    }
  }

  violations.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return a.line - b.line;
  });
  return { violations, scannedFiles, scannedImports, packageCount: packageDirs.size };
}

function isNodeBuiltin(spec) {
  if (spec.startsWith("node:")) return true;
  const builtins = new Set([
    "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
    "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
    "events", "fs", "http", "http2", "https", "inspector", "module", "net",
    "os", "path", "perf_hooks", "process", "punycode", "querystring",
    "readline", "repl", "stream", "string_decoder", "timers", "tls",
    "trace_events", "tty", "url", "util", "v8", "vm", "wasi", "worker_threads",
    "zlib",
  ]);
  return builtins.has(spec);
}

function workspacePackageName(spec) {
  if (!spec.startsWith(WORKSPACE_PACKAGE_PREFIX)) return null;
  const segments = spec.split("/");
  return segments.slice(0, 2).join("/");
}

function ownerIsPackageDir(ownerPackage, resolved, packageDirs) {
  if (ownerPackage === null) return false;
  const ownerEntry = [...packageDirs.values()].find((entry) => entry.name === ownerPackage);
  if (ownerEntry === undefined) return false;
  const rel = relative(ownerEntry.dir, resolved);
  return !rel.startsWith("..") && !isAbsolute(rel);
}

export function formatViolations(violations) {
  if (violations.length === 0) return "";
  const lines = violations.map((violation) =>
    `[architecture] ${violation.rule} (${violation.inv})\n` +
    `  ${violation.file}:${violation.line} — ${violation.message}`
  );
  return `${lines.join("\n")}\n`;
}

export function main(argv) {
  const root = resolve(argv[0] ?? DEFAULT_ROOT);
  const { violations, scannedFiles, scannedImports, packageCount } =
    checkWorkspace(root);
  const output = formatViolations(violations);
  if (output !== "") {
    process.stderr.write(output);
  }
  process.stdout.write(
    `architecture check: ${packageCount} packages, ${scannedFiles} files, ` +
    `${scannedImports} imports, ${violations.length} violation(s)\n`,
  );
  return violations.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined) {
  const entry = resolve(process.argv[1]);
  if (entry === resolve(fileURLToPath(import.meta.url))) {
    const exitCode = main(process.argv.slice(2));
    process.exitCode = exitCode;
  }
}
