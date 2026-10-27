#!/usr/bin/env node
// COAC-269: move the batch-3 183-1 revision to pending adjudication.
// Decision source: the member corrective comment of 2026-10-27T10:59:39Z — COAC-249 confirmed the
// parent audit for chapter03-section003 is only `uncertain` and forbids rewriting it without
// confirmation; the b3 revision therefore cannot stand as an audited candidate.
// This record preserves every artifact, stops all further paid calls, and forbids audit/ingest.
// It also acts as the denylist the batch-5 joint exclusion reads: a chapter with a pending
// adjudication record cannot become an eligible repair target again.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync, statSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';

const processing = 'E:/AgentData/Coach/knowledge/processing';
const ns = join(processing, 'web-production/v1/coac269-20261027');
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => relative(processing, p).replaceAll('\\', '/');
const fileInfo = p => existsSync(join(processing, p))
  ? {path: p, sha256: sha(readFileSync(join(processing, p))), size: statSync(join(processing, p)).size}
  : {path: p, missing: true};

const chapterId = 'nemata-jp-chapter-183-1';
const articleId = 'chapter03-section003';
const candidate = `web-production/v1/candidates/modern-yabejp-ja/${articleId}.coac269rev1.json`;
const parent = `web-production/v1/candidates/modern-yabejp-ja/${articleId}.display.json`;
const parentAudit = 'audit/web/articles/modern-yabejp-ja/chapter03-section003.889adf0d0f694bc09475a5c35d83d758493e94af90c3e389dfdebfa5bf205b02.json';

const record = {
  schema: 'coac269-pending-adjudication/1',
  ticket: 'COAC-269',
  line: 'B',
  recordedAt: new Date().toISOString(),
  modelCalls: 0,
  productionCalls: 0,
  chapterId,
  articleId,
  disposition: 'pending-adjudication',
  decisionSource: {
    commentId: '01a17d04-0b7e-71d4-b962-d36a2ae49981',
    recordedAt: '2026-10-27T10:59:39Z',
    text: '183-1 已被249确认父审仅uncertain且禁止未确认改写，你的新revision不成立：保留证据但不得入审或替换原稿，移入待裁决，不继续付费。',
  },
  reason: 'the parent audit verdict is `uncertain` on whether 「打1張」 means the discard has already been played; rewriting it to a definite 「已打出」 without source confirmation is forbidden, so the b3 revision has no valid basis for an independent audit or ingestion',
  effects: {
    doNotAudit: true,
    doNotIngestTo250: true,
    doNotOverwriteParent: true,
    furtherPaidCalls: 0,
    evidencePreserved: true,
    deleted: [],
    rewritten: [],
  },
  evidence: {
    candidate: fileInfo(candidate),
    parent: fileInfo(parent),
    parentAudit: fileInfo(parentAudit),
    productionReceipt: fileInfo('web-production/v1/coac269-20261027/receipts/production-b3-42f0fbe887bdf360.json'),
    selfcheckReceipt: fileInfo('web-production/v1/coac269-20261027/receipts/selfcheck-b3-3b846f9db751ee3e.json'),
    handoff249: fileInfo('web-production/v1/coac269-20261027/handoff/handoff-b3-4ca082ce03ad8f22.json'),
    auditSideReceiptsForCandidate: 'none: the batch-3 handoff was prepared but 249 never dispatched an audit for this candidate sha',
  },
  batch5Effect: 'chapter03-section003 is excluded from batch-5 selection by this record even though the chapter is not covered by the coverage union; the joint exclusion skips it with reason ticket-pending-adjudication',
  nextStep: 'await a human/COAC-244 adjudication on the 「打1張」 reading; no further model call from line B until then',
};
const body = JSON.stringify(record, null, 2) + '\n';
const dir = join(ns, 'adjudication');
await mkdir(dir, {recursive: true});
const name = `pending-adjudication-183-1-${sha(body).slice(0, 16)}.json`;
const path = join(dir, name);
await writeFile(path, body, {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });

// Notice for COAC-249 in the handoff channel it actually reads: stop the registered first audit.
const notice = {
  schema: 'coac269-to-coac249-notice/1',
  ticket: 'COAC-269',
  to: 'COAC-249',
  recordedAt: new Date().toISOString(),
  modelCalls: 0,
  kind: 'do-not-audit',
  chapterId,
  articleId,
  candidate,
  candidateSha256: record.evidence.candidate.sha256,
  reason: 'revision moved to pending adjudication; the member ruled it invalid and forbade any audit or replacement of the parent',
  authoritativeRecord: {path: rel(path), sha256: sha(readFileSync(path))},
  requestedAction: 'do not dispatch or continue an independent audit for this candidate; no ingestion by COAC-250',
};
const nbody = JSON.stringify(notice, null, 2) + '\n';
const ndir = join(ns, 'handoff');
await mkdir(ndir, {recursive: true});
const nname = `notice-249-do-not-audit-183-1-${sha(nbody).slice(0, 16)}.json`;
await writeFile(join(ndir, nname), nbody, {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
console.log(JSON.stringify({record: rel(path), recordSha256: sha(readFileSync(path)), notice: rel(join(ndir, nname)), candidate: record.evidence.candidate, modelCalls: 0}, null, 2));
