// Freeze the edited audit modules into a new runtime directory and rebuild the
// verification-dependency manifest under the unique-writer boundary.
import {readFile, writeFile, mkdir, copyFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const REPO = 'E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study';
const OLD_REL = 'audit/runtimes/native-repair-7076217daf842b13';
const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);

const deps = await import(pathToFileURL(join(REPO, 'textbook-audit-verification-dependencies.mjs')).href);
const auditBytes = await readFile(join(REPO, 'textbook-audit.mjs'));
const cliBytes = await readFile(join(REPO, 'textbook-production-cli.mjs'));
const auditorScriptSha256 = sha(Buffer.concat([auditBytes, cliBytes]));
const runtimeRel = `audit/runtimes/native-repair-${auditorScriptSha256.slice(0, 14)}`;
const runtime = abs(runtimeRel);

const files = await deps.collectModuleDependencyFiles(join(REPO, 'textbook-audit.mjs'));
await mkdir(runtime, {recursive: true});
for (const file of files) {
  await mkdir(dirname(join(runtime, file.name)), {recursive: true});
  await copyFile(join(REPO, file.name), join(runtime, file.name));
  const copied = await readFile(join(runtime, file.name));
  if (sha(copied) !== file.sha256) throw Error('copied module drifted: ' + file.name);
}

// Preserve the whole manifest history of the previous runtime, then archive its
// current manifest as the predecessor of the new one.
await mkdir(join(runtime, 'verification-dependencies.history'), {recursive: true});
const oldManifestBytes = await readFile(abs(join(OLD_REL, 'verification-dependencies.json')));
const oldManifest = JSON.parse(oldManifestBytes.toString('utf8'));
await writeFile(join(runtime, 'verification-dependencies.history', `${oldManifest.manifestSha256}.json`), oldManifestBytes);
for (const name of await readdir(abs(join(OLD_REL, 'verification-dependencies.history')))) {
  await copyFile(abs(join(OLD_REL, 'verification-dependencies.history', name)), join(runtime, 'verification-dependencies.history', name));
}

const pageApprovals = oldManifest.pageApprovals.filter(a => a.path !== 'audit/source-corrections/native-inline-field-corrections.p50.root-acceptance.json');
pageApprovals.push({path: 'audit/source-corrections/native-inline-field-corrections.p50.root-acceptance.json'});
const manifest = await deps.buildVerificationDependencyManifest({baseDir: runtime, entry: 'textbook-audit.mjs', root: ROOT, pageApprovals});
await writeFile(join(runtime, 'verification-dependencies.json'), JSON.stringify(manifest, null, 2) + '\n');
const verify = await deps.verifyVerificationDependencyManifest({baseDir: runtime, manifest, root: ROOT});
const p50Approval = manifest.pageApprovals.find(a => a.path.includes('.p50.'));

console.log(JSON.stringify({
  runtimeRel, auditorScriptSha256,
  files: files.map(f => f.name),
  manifestSha256: manifest.manifestSha256,
  pageApprovals: manifest.pageApprovals.length,
  p50Approval, verify,
}, null, 1));
