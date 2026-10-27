// Round 2026-10-27T09:05-09:25Z: record the 187-1 and 198-1 isolated text revisions.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const P = '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json';
const ROOT = 'E:/AgentData/Coach/knowledge/processing/';
const sha = b => createHash('sha256').update(b).digest('hex');
const fileSha = async p => sha(await readFile(ROOT + p));
const bytes = await readFile(P);
const j = JSON.parse(bytes);
const byId = id => j.objects.find(o => o.objectId === id);

const chapters = [
  {
    id: 'web-chapter:nemata-jp-chapter-187-1', article: 'chapter03-section006',
    cand: 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section006.rev1.json',
    candSha: '310a9fb99713adf007a7226cc01fcf848b16cf3b164fc1094d2a81a644f2d2e2',
    audit: 'audit/web/articles/modern-yabejp-ja/chapter03-section006.310a9fb99713adf007a7226cc01fcf848b16cf3b164fc1094d2a81a644f2d2e2.json',
    auditSha: '1dff00c2dad7381519e44ee225d8dcc9550e8cb659aa3a031effc414362e3e45',
    parent: 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section006.display.json',
    parentSha: 'a09441ee2d656618bcf2ed97e573e4524d62ba5b3c94fbcc7ec714aeb77a4d73',
    parentAudit: 'audit/web/articles/modern-yabejp-ja/chapter03-section006.a09441ee2d656618bcf2ed97e573e4524d62ba5b3c94fbcc7ec714aeb77a4d73.retry-1792980856137-13934817.json',
    parentAuditSha: '02b455cc98418b076cc876d98cc3bfdb07be270efca1ec8e5c298c892acdd3d7',
    target: 'modern-yabejp-ja:chapter03-section006:b0095',
    prod: '6d90340a-340f-474d-9cf5-f3655da7b0f7', aud: 'c4ff3326-0dac-4080-970a-fd3513460ede',
  },
  {
    id: 'web-chapter:nemata-jp-chapter-198-1', article: 'chapter03-section012',
    cand: 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section012.rev1.json',
    candSha: 'af5ea28cb84f84f9006f5c205c7fa4f99431bf7b3bad8e22e47a3a1245820e3b',
    audit: 'audit/web/articles/modern-yabejp-ja/chapter03-section012.af5ea28cb84f84f9006f5c205c7fa4f99431bf7b3bad8e22e47a3a1245820e3b.json',
    auditSha: 'd930c9ef68a2771347e182c9964ed7c48a9b5aacc3cc90fa72127109be802669',
    parent: 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section012.display.json',
    parentSha: '62d901f6a2c5b8fb6c4512693cf2c90ad6ed931a9e812449cad5ec3125d5d1f6',
    parentAudit: 'audit/web/articles/modern-yabejp-ja/chapter03-section012.62d901f6a2c5b8fb6c4512693cf2c90ad6ed931a9e812449cad5ec3125d5d1f6.retry-1792983526139-9a68195f.json',
    parentAuditSha: '69dc54916a0913ae0c3976130a0ce44f8896187b1a9f05a8a6416d2b47d59ec4',
    target: 'modern-yabejp-ja:chapter03-section012:b0082',
    prod: '1491c6fc-9a6c-47e6-9390-aa351c0ca70f', aud: '8ac81b8f-082e-474a-a93e-9ca48271fe5c',
  },
];

for (const c of chapters) {
  const o = byId(c.id);
  if (!o) throw Error('missing ' + c.id);
  if (await fileSha(c.cand) !== c.candSha) throw Error('candidate sha mismatch ' + c.article);
  if (await fileSha(c.audit) !== c.auditSha) throw Error('audit sha mismatch ' + c.article);
  if (await fileSha(c.parentAudit) !== c.parentAuditSha) throw Error('parent audit sha mismatch ' + c.article);
  Object.assign(o, {
    candidatePath: 'E:/AgentData/Coach/knowledge/processing/' + c.cand,
    candidateSha256: c.candSha,
    auditPath: c.audit,
    auditStatus: 'passed',
    auditSha256: c.auditSha,
    issueCount: 0,
    currentDisposition: 'passed-awaiting-250-merge',
    revisedFrom: {
      parentCandidatePath: c.parent,
      parentCandidateSha256: c.parentSha,
      parentAuditPath: c.parentAudit,
      parentAuditSha256: c.parentAuditSha,
      targets: [c.target],
    },
    handoff250: 'integration/coac250-incremental-187-1-198-1-20261027.json',
  });
}

j.countsCurrent = {
  ...j.countsCurrent,
  needsRepair: (j.countsCurrent.needsRepair ?? 51) - 2,
  resolvedThisStage: (j.countsCurrent.resolvedThisStage ?? 7) + 2,
  resolvedTotal: (j.countsCurrent.resolvedTotal ?? 11) + 2,
};

j.round20261027T0925 = {
  recordedAt: '2026-10-27T09:25:00.000000+00:00',
  round: '2026-10-27T09:05-09:25Z',
  resolved: chapters.map(c => ({
    objectId: c.id, articleId: c.article, candidateSha256: c.candSha, auditSha256: c.auditSha,
    targets: [c.target], handoff: 'integration/coac250-incremental-187-1-198-1-20261027.json',
  })),
  mergeConfirmation: {
    objectId: 'web-chapter:nemata-jp-chapter-174-1',
    pointer: 'accepted-content-preview-2026-10-27T07-16-27-706Z',
    corpusId: '472db63a58434c11bbbb542d082e66d780300d4527a14fbca9ca4f113ced52d5',
    chapters: 207, selectedWeb: 178, pendingWeb: 45,
    note: 'still the newest accepted-content-preview; chapter02-section024 is still listed in pendingWeb by its old .display.json path, so the 174-1 handoff was not re-sent',
  },
  modelCalls: {
    production: 2, audit: 2, deterministicRejections: 0,
    usage: {
      production: {inputTokens: 24521, outputTokens: 759},
      audit: {inputTokens: 28413, cachedInputTokens: 14592, outputTokens: 903},
    },
    detail: chapters.map(c => ({chapter: c.id, production: c.prod, audit: c.aud})),
  },
  handoff250: 'integration/coac250-incremental-187-1-198-1-20261027.json',
  stillOpen: {needsRepair: 49, list: ['nemata-jp-chapter-215-4 (entry decision)', 'nemata-jp-chapter-236-1 (entry decision)', 'nemata-jp-chapter-283-1 (b0099 uncertain)']},
};

j.latestRound = {
  at: '2026-10-27T09:25:00.000000+00:00',
  objects: chapters.map(c => c.id),
  productionModelCalls: 2,
  auditModelCalls: 2,
  deterministicRejections: 0,
  note: '187-1 b0095 and 198-1 b0082 passed isolated text revision plus independent target-text audit; handed to 250 together; 174-1 not re-handed (preview pointer unchanged)',
  stillOpen: ['nemata-jp-chapter-215-4', 'nemata-jp-chapter-236-1', 'nemata-jp-chapter-283-1'],
};
j.refreshedAt = '2026-10-27T09:25:00.000000+00:00';

const out = JSON.stringify(j, null, 1) + '\n';
await writeFile(P, out);
console.log(JSON.stringify({bytes: out.length, sha: sha(Buffer.from(out))}));
