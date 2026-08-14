// Reads diagnostic CLI flags for the one-shot electron-entry commands.
//
// Electron 43 on Windows exits silently (code 255) before any application
// code runs when a SPACE-separated switch is followed by an http(s):// value
// and then any further argument — the chromium-level argv re-tokenization
// dies on that shape. `--paipu-url <url> --self-actor 3` therefore never
// reaches the app, while `--paipu-url=<url> --self-actor 3` and a trailing
// `--paipu-url <url>` both work. Every diagnostic flag accepts BOTH forms;
// URLs must use the attached `--name=value` form when more flags follow.
export function readCliFlag(
  argv: readonly string[],
  name: string,
): string | undefined {
  const bare = `--${name}`;
  const attached = `--${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== "string") continue;
    if (token === bare) {
      const next = argv[index + 1];
      // A missing or empty value reports as absent so callers fail fast on
      // their required-flag checks instead of silently passing "".
      return typeof next === "string" && next.length > 0 && !next.startsWith("--")
        ? next
        : undefined;
    }
    if (token.startsWith(attached)) {
      const value = token.slice(attached.length);
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}
