import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../src/renderer/", import.meta.url));
const target = fileURLToPath(new URL("../dist/renderer/", import.meta.url));
await mkdir(target, { recursive: true });
await Promise.all([
  copyFile(`${source}index.html`, `${target}index.html`),
  copyFile(`${source}styles.css`, `${target}styles.css`),
]);
