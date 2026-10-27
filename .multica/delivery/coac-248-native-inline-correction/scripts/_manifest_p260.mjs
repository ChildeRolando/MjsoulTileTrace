import {readFile, writeFile, copyFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const REPO = 'E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study';
const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const RUNTIME = join(ROOT, 'audit/runtimes/native-repair-7076217daf842b13');
const MODULE = 'textbook-audit-pdf-native-corrections.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');

// 1. Sync the tested module into the frozen runtime, then re-verify byte identity.
await copyFile(join(REPO, MODULE), join(RUNTIME, MODULE));
const repoBytes = await readFile(join(REPO, MODULE));
const runtimeBytes = await readFile(join(RUNTIME, MODULE));
if (sha(repoBytes) !== sha(runtimeBytes)) throw Error('runtime_sync_mismatch');
console.log(JSON.stringify({syncedModule: MODULE, sha256: sha(repoBytes)}));

// 2. Archive the previous manifest before replacing it (history is evidence, never rewritten).
const manifestPath = join(RUNTIME, 'verification-dependencies.json');
const previous = JSON.parse(await readFile(manifestPath, 'utf8'));
const historyDir = join(RUNTIME, 'verification-dependencies.history');
await mkdir(historyDir, {recursive: true});
const historyPath = join(historyDir, previous.manifestSha256 + '.json');
await writeFile(historyPath, JSON.stringify(previous, null, 2) + '\n');
console.log(JSON.stringify({archivedManifest: previous.manifestSha256, historyPath}));

// 3. Build the new manifest over the final tested code and every page approval
//    the native correction routes actually point at.
const builder = await import(pathToFileURL(join(REPO, 'textbook-audit-verification-dependencies.mjs')).href);
const approvals = [];
for (const page of [260, 261, 262, 309, 315, 329, 330]) {
  approvals.push(...await builder.nativePageApprovalEntries({baseDir: RUNTIME, sourceId: 'nemata-jp', page}));
}
const manifest = await builder.buildVerificationDependencyManifest({
  baseDir: RUNTIME, entry: 'textbook-audit.mjs', root: ROOT, pageApprovals: approvals,
});
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({files: manifest.files.length, pageApprovals: manifest.pageApprovals.map(a => a.path), manifestSha256: manifest.manifestSha256}));
