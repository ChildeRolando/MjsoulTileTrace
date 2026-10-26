import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';

const LIST = '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json';
const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const sha = b => createHash('sha256').update(b).digest('hex');
const READ = p => readFile(join(ROOT, p));

const EXPECTED = [
  {page: 1,   cand: '195ec4e95734120c92d4bc0281512b7cb06d84fda221b68e339f020e06ddd02b', audit: '9619f5b27ba1b1bb6227184081d72cb599de232741d6f5ea01e7d1daa829ab91', errors: ['uncertain:nemata-jp-p1-r4'], issueCount: 1},
  {page: 2,   cand: '205a9a8ab2dcc7353f5d3ec2df6f6b99339ecbb4ca57c507690b6ff45397e1d6', audit: '02b5cea0e12ad34ddf670e20cbb6071e395c2587f2d2797e6be303d1af9d442c', errors: ['uncertain:nemata-jp-p2-r11','uncertain:nemata-jp-p2-r15'], issueCount: 2},
  {page: 3,   cand: 'b4c7a236ae6b3854d1c989f7504af4b4271d7172dedef408d1150ac2e1a75a36', audit: '68037da0805fc3c947b9d3ca0ddc83576ac1ee368a3c91539243266af0f3152f', errors: ['uncertain:nemata-jp-p3-r1','uncertain:nemata-jp-p3-r3'], issueCount: 2},
  {page: 317, cand: 'e0911ad1e2ee917537c953d1d2e204120fcd3477a67baf1f26eac90f18c9efcf', audit: 'f30bffa04d44573d0ca9fdacd3152d713d061e9503b7c97398e23146eec3f86c', errors: ['needs-repair:nemata-jp-p317-b5','uncertain:nemata-jp-p317-r6'], issueCount: 2},
];
const PROD = 'production/sol-high-metadata-four-pages-inline-20261026';

const list = JSON.parse(await readFile(LIST, 'utf8'));
const seen = new Set(list.objects.map(o => o.candidateSha256));
const added = [];

for (const e of EXPECTED) {
  const pad = String(e.page).padStart(4, '0');
  const candidatePath = `${PROD}/candidates/nemata-jp/page-${pad}.json`;
  const auditPath = `audit/pages/nemata-jp/page-${pad}.${e.cand}.6baa4a7e1404.json`;
  const candBytes = await READ(candidatePath);
  const auditBytes = await READ(auditPath);
  const candSha = sha(candBytes), auditSha = sha(auditBytes);
  if (candSha !== e.cand) throw Error(`candidate sha mismatch p${e.page}: ${candSha}`);
  if (auditSha !== e.audit) throw Error(`audit sha mismatch p${e.page}: ${auditSha}`);
  const audit = JSON.parse(auditBytes.toString('utf8'));
  if (audit.status !== 'needs-repair') throw Error(`p${e.page} audit status ${audit.status}`);
  if (audit.production.sha256 !== candSha) throw Error(`p${e.page} audit/candidate binding`);
  if (audit.auditorScriptSha256 !== '6baa4a7e14041a0ccb80f41ed4ee994428a9cda94b8bd420aeb70f4342c0b6da') throw Error(`p${e.page} auditor identity changed`);
  const errorsRaw = audit.modelChecks.errors;
  const errors = [...new Set(errorsRaw)];
  const targetIds = ids => [...new Set(ids.map(x => String(x).replace(/^(?:error|needs-repair|uncertain|source-note):/, '')))];
  if (JSON.stringify(targetIds(errorsRaw)) !== JSON.stringify(targetIds(e.errors))) throw Error(`p${e.page} error targets differ: ${JSON.stringify(errorsRaw)}`);
  const det = audit.deterministicChecks;
  if (!det.passed) throw Error(`p${e.page} deterministic checks not passed`);

  const o = {
    objectId: `nemata-jp:page:${e.page}`,
    kind: 'pdf-page',
    sourceId: 'nemata-jp',
    page: e.page,
    frontMatter: true,
    candidatePath: `${ROOT}/${candidatePath}`,
    candidateSha256: candSha,
    auditPath: `${ROOT}/${auditPath}`,
    auditSha256: auditSha,
    auditorScriptSha256: audit.auditorScriptSha256,
    auditStatus: audit.status,
    issueCount: e.issueCount,
    reviewErrors: errors,
    reviewErrorsRaw: errorsRaw,
    deterministicChecks: {passed: det.passed, textBlocks: det.textBlocks, imageBlocks: det.imageBlocks, figures: det.figures},
    currentDisposition: 'needs-repair',
    origin: 'COAC-247 metadata four pages (20261026)',
    newThisStage: true,
    productionRoot: PROD,
    model: 'gpt-6.1-sol',
    reasoningEffort: 'high',
    productionModelCallsUsed: 1,
    note: 'Produced once and independently audited once under COAC-247; handed back for repair. Not re-produced, not re-audited by this ticket yet.',
  };
  added.push(o);
}

const dupes = added.filter(o => seen.has(o.candidateSha256));
if (dupes.length) { console.log(JSON.stringify({deduped: dupes.map(o => o.objectId)})); }

const fresh = added.filter(o => !seen.has(o.candidateSha256));
list.objects.push(...fresh);
list.countsCurrent.needsRepair += fresh.length;
list.countsCurrent.totalTracked += fresh.length;
list.countsCurrent.newObjectsStillUnresolved += fresh.length;
list.breakdown.metadataFrontMatter = fresh.length;
list.addedThisRefresh.push(...fresh.map(o => o.objectId));
list.metadataFourPageIntake = {
  receivedAt: new Date().toISOString(),
  handoff: 'COAC-247 wakeup 01a17a58-e875-757e-8a46-3e209c7cc507',
  productionRoot: PROD,
  auditRuntime: 'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  auditorScriptSha256: '6baa4a7e14041a0ccb80f41ed4ee994428a9cda94b8bd420aeb70f4342c0b6da',
  dedupe: {method: 'candidateSha256', checkedAgainst: 'existing objects list', newObjects: fresh.length, duplicates: dupes.length},
  objects: fresh.map(o => ({objectId: o.objectId, candidateSha256: o.candidateSha256, auditSha256: o.auditSha256, status: o.auditStatus, reviewErrors: o.reviewErrors})),
};
list.refreshedAt = new Date().toISOString();
await writeFile(LIST, JSON.stringify(list, null, 2) + '\n');
console.log(JSON.stringify({added: fresh.map(o => o.objectId), counts: list.countsCurrent, breakdown: list.breakdown}, null, 1));
