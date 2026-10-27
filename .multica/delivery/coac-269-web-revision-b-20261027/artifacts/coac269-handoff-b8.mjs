#!/usr/bin/env node
// COAC-269 line B batch-8 handoff to COAC-249: explicit targets + SHA-complete receipt. No model call.
// Batch 8 is the owner-dispatched 79-cn figure batch: 79-cn-chapter-128-14 (cv1734739, b0013) and
// 79-cn-chapter-145-4 (cv1744266, b0005), both single-figure revisions of a verbatim Chinese parent.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const R = 'E:/AgentData/Coach/knowledge/processing';
const NS = 'web-production/v1/coac269-20261027';
const PRODUCTION = 'receipts/production-b8-7d6e186219c99ed9.json';
const SELFCHECK = 'receipts/selfcheck-b8-10ef55587fbe579c.json';
const sha = b => createHash('sha256').update(b).digest('hex');

const b8 = [
  {
    chapterId: '79-cn-chapter-128-14', articleId: 'cv1734739',
    candidate: 'web-production/v1/candidates/79-bilibili-cn/cv1734739.coac269rev1.json',
    parent: 'web-production/v1/candidates/79-bilibili-cn/cv1734739.display.json',
    parentAudit: 'audit/web/articles/79-bilibili-cn/cv1734739.2aec7345fda18914b17cab6d01703d1a5e0fb5bee27eb056e62453f4f24887ec.retry-1792944840664-30f5eb57.json',
    source: 'web-sources/v1/79-bilibili-cn/articles/cv1734739/source.json',
    targets: ['79-bilibili-cn:cv1734739:b0013:figure'],
    notes:
      'Single-figure repair (figure transport b0013), exactly 1 target figure, figureIds otherwise empty. Parent audit error: the second hand tile of 例5 was transcribed as 3m; the bound source image reads 二萬 二萬 四萬 五萬 六萬 (2m 2m 4m 5m 6m). The candidate now has 2m 2m 4m 5m 6m and keeps everything else in the figure (labels 例5/宝牌, the 3p dora indicator, the 13-tile sequence and the other six figures). '
      + 'This line re-read the bound PNG 15ea782afb32a1655b2df4e56dcba24222cb5ec9626b715441c0907f70371855.png at 4x nearest-neighbour before dispatch and independently agrees. '
      + 'Disclosed incidental change inside the target figure only (the frozen runner lets the model overwrite kind/transcription/unknowns/caption/sourceNotes): the caption lost its trailing full stop, 「例5：手牌与宝牌。」 -> 「例5：手牌与宝牌」. No text block, flow position or other figure changed. '
      + 'Verify: (1) tiles 1-2 really are both 2m and the rest of the hand matches 2p 3p 3p 4p 6p 4s 5s 6s 7s; (2) the 宝牌 indicator is still 3p and the label sequence is faithful; (3) the caption change is acceptable; (4) no tile was invented and nothing outside b0013 moved.',
  },
  {
    chapterId: '79-cn-chapter-145-4', articleId: 'cv1744266',
    candidate: 'web-production/v1/candidates/79-bilibili-cn/cv1744266.coac269rev1.json',
    parent: 'web-production/v1/candidates/79-bilibili-cn/cv1744266.display.json',
    parentAudit: 'audit/web/articles/79-bilibili-cn/cv1744266.7557da593c6cdee11ca01853639150f50e39cbc9dc94bd51f0461d65d18ad92a.retry-1792948017171-19a0c0ed.json',
    source: 'web-sources/v1/79-bilibili-cn/articles/cv1744266/source.json',
    targets: ['79-bilibili-cn:cv1744266:b0005:figure'],
    notes:
      'Single-figure repair (figure transport b0005), exactly 1 target figure, figureIds otherwise empty. Parent audit error: the 12th hand tile of 例1 was transcribed as 2z (南); the bound source image reads 東 (1z), with 中 (7z) as the 13th tile. The candidate now has 2m 6m 2p 2p 4p 7p 5s 5s 5s 8s 9s 1z 7z and keeps the ツモ 5s note and the other four figures. '
      + 'This line re-read the bound JPG f1632162d13233b60f8a0370dbbf4f768ab9f644236f9d51460c0a2e66352fe3.jpg at 4x zoom before dispatch and independently agrees. '
      + 'Disclosed incidental changes inside the target figure only (the frozen runner lets the model overwrite kind/transcription/unknowns/caption/sourceNotes): the caption was reworded 「例1：手牌与摸入的5s。」 -> 「例1：手牌及右侧摸入的5s。」 (also losing the trailing full stop), and the parent sourceNote 「原图与近邻放大图为同一图像，仅计一次。」 was not re-emitted. No text block, flow position or other figure changed. '
      + 'Verify: (1) tile 12 is 東 and tile 13 is 中; (2) the 5s triplet, 8s/9s run and the ツモ 5s are unchanged; (3) the reworded caption is accurate and the dropped parent note is acceptable; (4) no tile was invented and nothing outside b0005 moved.',
  },
];

const selfcheck = JSON.parse(await readFile(join(R, NS, SELFCHECK), 'utf8'));
const prod = JSON.parse(await readFile(join(R, NS, PRODUCTION), 'utf8'));

const hand = {
  schema: 'coac269-to-coac249-handoff/1', ticket: 'COAC-269', batch: 'b8', to: 'COAC-249',
  recordedAt: new Date().toISOString(), modelCalls: 0,
  scope: 'first independent semantic audit per candidate SHA; do not re-audit passed SHAs',
  budget: 'one first audit per chapter for this batch; failed or void audits count, no retry loop',
  entry: 'existing figure-targeted revision entry of the frozen web production runner, Chinese (verbatim) source: the repair scope is the parent audit non-source-note issue targetIds, so exactly one figure is re-transcribed and the body plus every other figure is inherited byte-for-byte. No gate, runtime, selection, pointer or register was modified. No new framework: the same runner/flags as the 081-8 figure repair.',
  excludedThisBatch: {
    '79-cn-chapter-090-6': 'owned and advanced by line A (COAC-248) per the 12:23 owner dispatch; not claimed, produced or audited here',
    '79-cn-chapter-081-8': 'line A reserve (four-figure 081-8 already passed by 249); do not re-audit',
    'nemata-jp-chapter-183-1': 'pending adjudication (handoff/notice-249-do-not-audit-183-1-*.json): evidence only, do not audit, do not ingest',
    'nemata-jp-chapter-089-1': 'batch 7, handed to 249 earlier; not re-handed here',
    'nemata-jp-chapter-060-1': 'batch 7, handed to 249 earlier; not re-handed here',
  },
  disclosure: {
    'incidental-fields': 'both candidates change only the target figure; inside that figure the model also re-emitted caption (both) and dropped one parent sourceNote (145-4). These are model-owned fields of the target figure under the frozen entry, are listed per chapter below and in selfcheck figureDiffs, and are deliberately NOT hand-edited after production.',
    'not-touched': 'no passed candidate was produced in this run for either article; the two display parents remain the only needs-repair parents on the current source sha.',
  },
  chapters: [],
};
const targetsOut = {
  schema: 'coach-explicit-audit-targets/1', createdAt: new Date().toISOString(),
  source: 'COAC-269 line B batch-8 produced figure-revision candidates on their needs-repair display parents; prepared from the b8 preflight/claim/production/selfcheck receipts. No audit dispatched here.',
  totalTargets: 0, targets: [],
};
for (const p of b8) {
  const cb = await readFile(join(R, p.candidate));
  const cand = JSON.parse(cb);
  const pc = prod.chapters.find(x => x.chapterId === p.chapterId);
  const sc = selfcheck.chapters.find(c => c.chapterId === p.chapterId);
  const rec = {...p};
  rec.candidateSha256 = sha(cb);
  rec.parentSha256 = sha(await readFile(join(R, p.parent)));
  rec.parentAuditSha256 = sha(await readFile(join(R, p.parentAudit)));
  rec.sourceSha256 = sha(await readFile(join(R, p.source)));
  rec.productionCall = cand.provenance.attempts.map(a => ({
    callId: a.callId, success: a.success, usage: a.usage, durationMs: a.durationMs,
    rawArtifactPath: a.rawArtifactPath, rawArtifactSha256: a.rawArtifactSha256,
    promptSha256: a.promptSha256, semanticPromptSha256: a.semanticPromptSha256,
    runnerSha256: cand.provenance.runnerSha256, cliSha256: a.cliSnapshot?.sha256,
    targets: a.targets, visualInputs: (a.visualInputs || []).length,
  }));
  rec.rawArtifactSha256Verified = await Promise.all(rec.productionCall.map(async a =>
    sha(await readFile(join(R, 'web-production/v1', a.rawArtifactPath))) === a.rawArtifactSha256));
  rec.attemptCount = cand.provenance.attempts.length;
  rec.figureDiffs = sc?.figureDiffs ?? null;
  rec.targetTranscriptionChanged = sc?.targetTranscriptionChanged ?? null;
  rec.selfCheckReceipt = `${NS}/${SELFCHECK}`;
  rec.selfCheckOk = selfcheck.ok;
  rec.selfCheckGates = {verifyWebRevisionContent: sc?.verifyWebRevisionContent, verifyWebProductionCall: sc?.verifyWebProductionCall, webDeterministicChecks: sc?.webDeterministicChecks};
  rec.jointExclusionAtDispatch = pc.jointExclusionAtDispatch;
  rec.sharedClaimAtDispatch = pc.sharedClaimAtDispatch;
  rec.dispatchGuardReceipt = pc.dispatchGuard?.receipt ?? null;
  rec.makerSlot = {acquiredAt: prod.makerSlot?.acquiredAt, releasedAt: prod.makerSlot?.releasedAt, acquireExit: prod.makerSlot?.acquireExit, releaseExit: prod.makerSlot?.releaseExit};
  rec.productionReceipt = `${NS}/${PRODUCTION}`;
  hand.chapters.push(rec);
  targetsOut.targets.push({
    kind: 'complete-web-candidate', chapterId: p.chapterId, articleId: p.articleId,
    path: join(R, p.candidate).replaceAll('\\', '/'),
    sourceId: '79-bilibili-cn', sourceSha256: rec.sourceSha256, sha256: rec.candidateSha256,
    parentSha256: rec.parentSha256, parentAuditSha256: rec.parentAuditSha256,
    category: 'coac269-line-b-targeted-figure-revision', targets: p.targets,
  });
}
targetsOut.totalTargets = targetsOut.targets.length;
const handName = `handoff-b8-${sha(JSON.stringify(hand.chapters)).slice(0, 16)}.json`;
await writeFile(join(R, NS, 'handoff', handName), JSON.stringify(hand, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
const tgtName = `explicit-targets-b8-${sha(JSON.stringify(targetsOut.targets)).slice(0, 16)}.json`;
await writeFile(join(R, NS, 'handoff', tgtName), JSON.stringify(targetsOut, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
console.log(JSON.stringify({
  coac249Handoff: `${NS}/handoff/${handName}`,
  coac249HandoffSha256: sha(await readFile(join(R, NS, 'handoff', handName))),
  coac249ExplicitTargets: `${NS}/handoff/${tgtName}`,
  coac249ExplicitTargetsSha256: sha(await readFile(join(R, NS, 'handoff', tgtName))),
  handoff: hand.chapters.map(c => ({
    chapterId: c.chapterId, candidate: c.candidateSha256, call: c.productionCall[0].callId,
    usage: c.productionCall[0].usage, durationMs: c.productionCall[0].durationMs,
    rawVerified: c.rawArtifactSha256Verified, attempts: c.attemptCount, targets: c.targets,
    visualInputs: c.productionCall[0].visualInputs,
    changedFields: (c.figureDiffs || []).map(d => ({figureId: d.figureId, changedFields: d.changedFields})),
    gates: {revision: c.selfCheckGates.verifyWebRevisionContent, production: c.selfCheckGates.verifyWebProductionCall?.ok, deterministic: c.selfCheckGates.webDeterministicChecks?.passed},
  })),
}, null, 2));
