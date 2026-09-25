// Run inside the affected agent session; a host-side pass alone is insufficient.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const errorFields = (e) => e ? Object.fromEntries(
  ['message', 'code', 'errno', 'syscall', 'path', 'spawnargs'].map(k => [k, e[k] ?? null]),
) : null;
let failed = false;
function probe(name, path, args) {
  const r = spawnSync(path, args, { encoding: 'utf8', timeout: 15000, windowsHide: true });
  console.log(JSON.stringify({ name, path, args, status: r.status, signal: r.signal,
    stdout: r.stdout ?? null, stderr: r.stderr ?? null, error: errorFields(r.error) }));
  failed ||= Boolean(r.error) || r.status !== 0;
}
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch }));
probe('node-pipe', process.execPath, ['--version']);
if (process.platform === 'win32') {
  probe('cmd-pipe', process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/c', 'exit 0']);
}
try {
  const esbuild = require('esbuild');
  console.log(JSON.stringify({ name: 'esbuild-resolution', version: esbuild.version,
    module: require.resolve('esbuild'), binaryOverride: process.env.ESBUILD_BINARY_PATH ?? null }));
  // A separate process provides a timeout even if esbuild's worker hangs.
  probe('esbuild-transform', process.execPath, ['--input-type=commonjs', '-e',
    `try { const e = require(${JSON.stringify(require.resolve('esbuild'))});
      console.log(JSON.stringify({ok:true,code:e.transformSync('let x=1').code}));
    } catch(e) { console.error(JSON.stringify((${errorFields.toString()})(e))); process.exitCode=1; }`]);
} catch (e) {
  console.log(JSON.stringify({ name: 'esbuild-resolution', error: errorFields(e) }));
  failed = true;
}
// Opt in after a workspace build: exercise real output replacement, not just pipes.
if (process.argv.includes('--bundle')) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    probe(`preload-rebuild-${attempt}`, process.execPath,
      ['packages/desktop/scripts/bundle-preload.mjs']);
  }
}
process.exitCode = failed ? 1 : 0;
