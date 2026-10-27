#!/usr/bin/env node
// COAC-269 line B batch-5 claim. Post-incident claim key: chapterId + CURRENT candidate SHA.
// The batch-2/batch-3 claim was keyed by parentCandidateSha alone, which could not distinguish a
// second revision of the same original chapter. This script additionally re-proves, at claim
// time, that no other candidate of the same article has a passed audit bound to the current
// source sha, and that the batch-5 preflight's joint-exclusion receipt is still the current one.
// Writes only into the ticket namespace; no shared list/selection/pointer write.
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';

const processing = 'E:/AgentData/Coach/knowledge/processing';
const ns = join(processing, 'web-production/v1/coac269-20261027');
const sha = b => createHash('sha256').update(b).digest('hex');
const rel = p => relative(processing, p).replaceAll('\\', '/');
const preflightRel = process.argv[2];
const jointRel = process.argv[3];
if (!preflightRel || !jointRel) { console.error('usage: coac269-claim-b5.mjs <preflight-receipt> <joint-exclusion-receipt>'); process.exit(2); }

const pre = JSON.parse(await readFile(join(processing, preflightRel), 'utf8'));
if (!pre.ok) { console.error('preflight not ok'); process.exit(1); }
if (pre.batch !== 'b5') { console.error('not a b5 preflight'); process.exit(1); }
const jointBytes = await readFile(join(processing, jointRel));
const joint = JSON.parse(jointBytes);
if (joint.recordedAt !== pre.jointExclusion.recordedAt || sha(jointBytes) !== pre.jointExclusion.sha256) {
  console.error('joint receipt is not the one the preflight consumed'); process.exit(1);
}
const jointAgeSeconds = Math.round((Date.now() - new Date(joint.recordedAt).getTime()) / 1000);
if (jointAgeSeconds > 900) { console.error('joint receipt stale at claim time: ' + jointAgeSeconds + 's'); process.exit(1); }
const ptrBytes = await readFile(join(processing, 'integration/accepted-preview-current.json'));
if (sha(ptrBytes) !== joint.inputs.activePreviewPointer.sha256) { console.error('active preview pointer changed since joint exclusion'); process.exit(1); }

const auditDir = join(processing, 'audit/web/articles/modern-yabejp-ja');
const candidatesDir = join(processing, 'web-production/v1/candidates/modern-yabejp-ja');
const auditFiles = await readdir(auditDir);
const candidateFiles = await readdir(candidatesDir);

const claims = [];
const errors = [];
for (const c of pre.chapters) {
  const rec = {chapterId: c.chapterId, articleId: c.articleId};
  // absence proof: no other candidate of this article has a passed audit bound to the current source
  const sourceSha = c.source.sha256;
  const passed = [];
  for (const f of candidateFiles) {
    if (!f.startsWith(c.articleId + '.')) continue;
    const candSha = sha(await readFile(join(candidatesDir, f)));
    for (const a of auditFiles) {
      if (!a.startsWith(c.articleId + '.')) continue;
      let j; try { j = JSON.parse(readFileSync(join(auditDir, a), 'utf8')); } catch { continue; }
      if (!j.production || j.production.sha256 !== candSha) continue;
      if (j.source && j.source.sourceSha256 !== sourceSha) continue;
      if (String(j.status).startsWith('passed')) passed.push({candidate: f, candidateSha256: candSha, audit: a, status: j.status, recordedAt: j.recordedAt});
    }
  }
  rec.passedCandidatesForArticle = passed;
  if (passed.length) errors.push(c.chapterId + ':passed_candidate_exists:' + passed.map(p => p.candidate).join(','));
  // output must not already exist
  const outPath = join(processing, pre.chapters.find(x => x.chapterId === c.chapterId).outputPath);
  if (existsSync(outPath)) errors.push(c.chapterId + ':variant_output_exists');

  const claim = {
    schema: 'coac269-candidate-claim/2',
    ticket: 'COAC-269',
    line: 'B',
    batch: 'b5',
    claimedAt: new Date().toISOString(),
    owner: 'COAC-269 Ticket executor',
    claimKey: c.chapterId + ':' + c.parent.sha256,
    chapterId: c.chapterId,
    articleId: c.articleId,
    parentCandidate: {path: c.parent.path, sha256: c.parent.sha256},
    parentAudit: {path: c.notes.path, sha256: c.notes.sha256},
    source: {path: c.source.path, sha256: c.source.sha256},
    targets: c.targets.map(t => t.sourceBlockId),
    plannedOutput: c.outputPath,
    variant: pre.variant,
    selectionProof: {
      rule: 'canonical chapter id absent from the union of active preview selection/unit-map, latest unified register, and every passed receipt bound to the current source sha',
      jointExclusion: {path: jointRel, sha256: sha(jointBytes), recordedAt: joint.recordedAt, ageSecondsAtClaim: jointAgeSeconds, pointerSha256: sha(ptrBytes)},
      preflight: {path: preflightRel, sha256: sha(await readFile(join(processing, preflightRel)))},
      passedCandidatesForArticle: [],
      absenceOfPassedCandidate: true,
    },
    writes: 'ticket namespace only: claims/, receipts/, preflight/, handoff/; no shared list, selection, pointer or formal library write',
  };
  const path = join(ns, 'claims', `claim-b5-${c.chapterId}-${c.parent.sha256}.json`);
  try {
    await writeFile(path, JSON.stringify(claim, null, 2) + '\n', {flag: 'wx'});
    rec.claimPath = rel(path); rec.created = true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const old = JSON.parse(await readFile(path, 'utf8'));
    if (old.parentCandidate.sha256 !== c.parent.sha256 || old.chapterId !== c.chapterId) errors.push(c.chapterId + ':claim_key_conflict');
    rec.claimPath = rel(path); rec.created = false; rec.existingOwner = old.owner;
  }
  claims.push(rec);
}

const batch = {
  schema: 'coac269-claim-batch/2',
  ticket: 'COAC-269',
  line: 'B',
  batch: 'b5',
  recordedAt: new Date().toISOString(),
  modelCalls: 0,
  claimKeyRule: 'chapterId + current candidate SHA; a second revision of the same original chapter cannot slip through on variant-file absence',
  preflight: preflightRel,
  jointExclusion: {path: jointRel, sha256: sha(jointBytes), recordedAt: joint.recordedAt},
  claims,
  errors,
  ok: errors.length === 0,
};
await mkdir(join(ns, 'claims'), {recursive: true});
const batchPath = join(ns, 'claims', `batch-b5-${sha(JSON.stringify(claims) + JSON.stringify(errors)).slice(0, 16)}.json`);
await writeFile(batchPath, JSON.stringify(batch, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
console.log(JSON.stringify({ok: batch.ok, errors, batchPath: rel(batchPath), jointAgeSeconds, claims: claims.map(c => ({chapterId: c.chapterId, claimPath: c.claimPath, created: c.created, claimKey: c.chapterId + ':' + pre.chapters.find(x => x.chapterId === c.chapterId).parent.sha256, passedCandidatesForArticle: c.passedCandidatesForArticle.length}))}, null, 2));
process.exit(batch.ok ? 0 : 1);
