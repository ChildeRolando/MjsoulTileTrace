import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The sandboxed Electron preload cannot resolve bare npm package specifiers
// (`@riichi-coach/contracts`, `zod`). Bundle the compiled preload into one
// self-contained CommonJS file so only the `electron` module stays external.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(packageRoot, "dist", "preload-entry.js");
const outfile = resolve(packageRoot, "dist", "preload.bundle.cjs");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "cjs",
  platform: "node",
  external: ["electron"],
  logLevel: "info",
});
