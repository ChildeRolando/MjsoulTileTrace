// Round 2026-10-27T07:50-08:15Z: record the 174-1 pass, the 215-4 rev2 candidate blocked by the
// revision entry's notes contract, and the free entry check on 236-1's uncertain finding.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const P = '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json';
const sha = b => createHash('sha256').update(b).digest('hex');
const bytes = await readFile(P);
const j = JSON.parse(bytes);

const byId = id => j.objects.find(o => o.objectId === id);

const o174 = byId('web-chapter:nemata-jp-chapter-174-1');
Object.assign(o174, {
  candidatePath: 'E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/chapter02-section024.rev1.json',
  candidateSha256: '7ceae3d061f859f9d4c93822422be385100396e12593a3980045e871f2adc5a7',
  auditPath: 'audit/web/articles/modern-yabejp-ja/chapter02-section024.7ceae3d061f859f9d4c93822422be385100396e12593a3980045e871f2adc5a7.json',
  auditStatus: 'passed',
  auditSha256: '8f586cab236f47fdddbb4a7e9fc3a53721205d5fae72e10ef5d0dff08c9290fa',
  issueCount: 0,
  currentDisposition: 'passed-awaiting-250-merge',
  revisedFrom: {
    parentCandidatePath: 'web-production/v1/candidates/modern-yabejp-ja/chapter02-section024.display.json',
    parentCandidateSha256: '0af14db9257c169c8dd0884fac2668d1d222b53b31bd00d319e9f02950cfb659',
    parentAuditPath: 'audit/web/articles/modern-yabejp-ja/chapter02-section024.0af14db9257c169c8dd0884fac2668d1d222b53b31bd00d319e9f02950cfb659.retry-1792976734826-6b625934.json',
    parentAuditSha256: sha(await readFile('E:/AgentData/Coach/knowledge/processing/audit/web/articles/modern-yabejp-ja/chapter02-section024.0af14db9257c169c8dd0884fac2668d1d222b53b31bd00d319e9f02950cfb659.retry-1792976734826-6b625934.json')),
    targets: ['modern-yabejp-ja:chapter02-section024:b0036'],
  },
  handoff250: 'integration/coac250-incremental-174-1-20261027.json',
});

const o215 = byId('web-chapter:nemata-jp-chapter-215-4');
Object.assign(o215, {
  revisionCandidate: {
    candidatePath: 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section027.rev2.json',
    candidateSha256: 'a75742e9c2bcb5b1c39453c6d8f795bea24cc5a431657b318ec7f5280a431817',
    parentSha256: 'e9a9376e2a870f6f9236e3ce574972d1c68226d9597f9c7dd53d781d12da2af9',
    notesPath: 'audit/web/articles/modern-yabejp-ja/chapter03-section027.e9a9376e2a870f6f9236e3ce574972d1c68226d9597f9c7dd53d781d12da2af9.retry-1793084669596-d7092797.json',
    changed: 'b0011「入り目でなければ」改为「若这张牌不是进张完成面子后切出的余牌」，与独审裁决的读法一致；其余 12 块逐字节不变',
    auditStatus: 'not-reachable-through-the-existing-revision-entry',
  },
  auditEntryLimit: {
    reason: 'the revision entry requires the notes receipt to carry a complete-article review: modelReview.completeArticleCompared, modelReview.domOrder, a blockCheck for every untargeted block, and modelChecks equal to validateWebReview(modelReview). A target-text receipt carries only target scope plus target_text_* checks.',
    deterministicRejections: ['web_revision_notes_scope', 'web_revision_parent_receipt_changed (modelChecks vs validateWebReview)'],
    modelCalls: 0,
    candidatesForDecision: [
      'extend the revision verifier to accept a target-text receipt chain (completeArticleCompared/domOrder/modelChecks read from effectiveModelReview and validateTargetTextReview) — an entry change, needs an owner call',
      'or run one full-article re-audit of rev1 to produce full-article notes, then audit rev2 — costs one extra review call and re-reviews blocks already passed',
    ],
  },
  currentDisposition: 'needs-repair-revision-candidate-ready-entry-cannot-verify',
});

const o236 = byId('web-chapter:nemata-jp-chapter-236-1');
Object.assign(o236, {
  entryCheck: {
    checkedAt: '2026-10-27T08:05:00Z',
    finding: 'the only non-faithful item is severity "uncertain" (b0003), not "error"',
    supported: false,
    reason: 'verifyWebRevisionContent requires a target to hold a severity=error issue and a needs-repair blockCheck, and rejects any non-source-note issue whose severity is not error; an uncertain-only receipt therefore fails web_revision_notes_scope. Production-side target derivation would also pick the block up, but the audit can never accept the resulting revision.',
    modelCalls: 0,
    conclusion: 'recorded and skipped; resolving b0003 needs either an entry decision for uncertain targets or the source-adjudication route, not a revision dispatch',
  },
});

j.countsCurrent = {
  ...j.countsCurrent,
  needsRepair: (j.countsCurrent.needsRepair ?? 52) - 1,
  resolvedThisStage: (j.countsCurrent.resolvedThisStage ?? 6) + 1,
  resolvedTotal: (j.countsCurrent.resolvedTotal ?? 10) + 1,
};

j.round20261027T0810 = {
  recordedAt: '2026-10-27T08:10:00.000000+00:00',
  round: '2026-10-27T07:50-08:15Z',
  resolved: [{
    objectId: 'web-chapter:nemata-jp-chapter-174-1',
    chapterId: 'nemata-jp-chapter-174-1',
    articleId: 'chapter02-section024',
    candidateSha256: '7ceae3d061f859f9d4c93822422be385100396e12593a3980045e871f2adc5a7',
    auditSha256: '8f586cab236f47fdddbb4a7e9fc3a53721205d5fae72e10ef5d0dff08c9290fa',
    targets: ['modern-yabejp-ja:chapter02-section024:b0036'],
    handoff: 'integration/coac250-incremental-174-1-20261027.json',
  }],
  open: [{
    objectId: 'web-chapter:nemata-jp-chapter-215-4',
    candidateSha256: 'a75742e9c2bcb5b1c39453c6d8f795bea24cc5a431657b318ec7f5280a431817',
    state: 'revision produced, independent audit not reachable through the existing entry',
  }],
  entryChecks: [{
    objectId: 'web-chapter:nemata-jp-chapter-236-1',
    verdict: 'entry does not accept an uncertain-only target',
  }],
  runtimeChanges: [{
    what: 'production runner for the 215-4 rev2 chain',
    path: 'web-production/v1/runs/coac248-web-215-4-rev2-20261027/frozen-runner/textbook-production-web.mjs',
    sha256: 'd6651f509e66d296fc94cc7464ae482ccb925f05a2012d11c96da69025517677',
    base: 'web-production/v1/runners/4a5ce8ab361e659bf7a8e822d3e013ccf413701cfa604aaa1c58c688beab8ca9.mjs',
    change: 'the untargeted-block faithfulness requirement reads notes.effectiveModelReview.blockChecks when the notes receipt carries one, otherwise notes.modelReview.blockChecks as before',
    adopted: true,
  }, {
    what: 'audit verifier for a second-generation targeted revision',
    path: 'audit/runtimes/web-revision-chain-20261027-tentative-not-adopted',
    change: 'verifyWebRevisionContent reads the effective review for the scope and per-block checks',
    adopted: false,
    why: 'even with that fallback verifyWebRevisionInheritance still compares modelChecks against validateWebReview(modelReview) and cannot accept target_text_* check codes; the runtime was not used and produced no receipt',
  }],
  modelCalls: {
    production: 2,
    audit: 1,
    deterministicRejections: 3,
    voidOrContentless: 0,
    usage: {production: {inputTokens: 25242, outputTokens: 697}, audit: {inputTokens: 13268, cachedInputTokens: 13056, outputTokens: 721}},
    detail: [
      {chapter: '215-4', production: 'a6b8ff2f-0a52-4d4d-9a9f-0cbf6a7d3a6e', audit: null},
      {chapter: '174-1', production: 'c1f02b4a-083e-4cb9-afeb-7f47026d3819', audit: '9cc8e03d-3565-425d-87a6-829796a11ca1'},
    ],
  },
  handoff250: 'integration/coac250-incremental-174-1-20261027.json',
  mergeConfirmation: {
    objectId: 'web-chapter:nemata-jp-chapter-222-1',
    pointer: 'accepted-content-preview-2026-10-27T07-16-27-706Z',
    corpusId: '472db63a58434c11bbbb542d082e66d780300d4527a14fbca9ca4f113ced52d5',
    chapters: 207,
    selectedWeb: 178,
    pendingWeb: 45,
    previewChapterId: 'modern-yabejp-ja-chapter04-section004-chapter',
    candidateSha256: '3910165816bc9776e27fccd11e9e46636c0eef860949df2978cb1481dde4d56a',
    note: 'present in selectedWeb with auditStatus passed; no re-handoff',
  },
  stillOpen: {needsRepair: 51, list: ['nemata-jp-chapter-215-4 (entry)', 'nemata-jp-chapter-236-1 (entry)', 'nemata-jp-chapter-283-1 (b0099 uncertain)']},
};

j.latestRound = {
  at: '2026-10-27T08:10:00.000000+00:00',
  objects: ['web-chapter:nemata-jp-chapter-174-1'],
  productionModelCalls: 2,
  auditModelCalls: 1,
  deterministicRejections: 3,
  note: '174-1 b0036 passed and handed to 250; 215-4 rev2 produced and its audit is blocked by the revision entry notes contract (0 model calls); 236-1 uncertain confirmed unsupported by the entry',
  stillOpen: ['nemata-jp-chapter-215-4', 'nemata-jp-chapter-236-1', 'nemata-jp-chapter-283-1'],
};
j.refreshedAt = '2026-10-27T08:10:00.000000+00:00';

const out = JSON.stringify(j, null, 1) + '\n';
await writeFile(P, out);
console.log(JSON.stringify({bytes: out.length, sha: sha(Buffer.from(out))}));
