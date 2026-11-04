import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(new URL('../arena-console/dist/', import.meta.url), { recursive: true });
// affectUI ships a React-injected style tag. Extract it for the console's existing self-only CSP.
const source = await readFile(new URL('../arena-console/trace/vendor/tool-call-card.tsx', import.meta.url), 'utf8');
const css = source.match(/const css = \/\* css \*\/ `([\s\S]*?)`;?\s*$/)?.[1];
if (!css) throw new Error('affectui_css_not_found');
await writeFile(new URL('../arena-console/dist/tool-call-card.css', import.meta.url), css);
await build({ absWorkingDir: root, entryPoints: ['arena-console/trace/view.jsx'],
  outfile: 'arena-console/dist/trace.mjs', bundle: true, minify: true, format: 'esm',
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'linked',
  plugins: [{ name: 'affectui-external-styles', setup(builder) {
    builder.onLoad({ filter: /tool-call-card\.tsx$/ }, () => ({ loader: 'tsx',
      contents: source.replace(/<style href="ui-tool-call" precedence="default">\s*\{css\}\s*<\/style>/g, '') }));
  } }] });
