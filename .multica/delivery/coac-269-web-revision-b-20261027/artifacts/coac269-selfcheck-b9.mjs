#!/usr/bin/env node
// COAC-269 line B batch-8 zero-call self-check of the produced figure revisions.
// This is NOT the independent audit. It mechanically proves:
//   - every text block, the body flow order and every NON-target figure are byte-identical to the
//     needs-repair parent (presentationAsset is render-only and excluded),
//   - the revision's own binding (parent path/sha, notes path/sha, figureIds) is the one the claim
//     and the dispatch used,
//   - the changed fields are confined to the TARGET figure's model-owned field set
//     (kind/transcription/unknowns/caption/sourceNotes/provenance); every other field is unchanged,
//   - the frozen audit entry accepts the candidate as a revision of this parent and audit notes
//     (verifyWebRevisionContent) and accepts it as a real bound production output
//     (verifyWebProductionCall: model, effort, raw artifact sha, prompt/output sha, visual inputs),
//   - the frozen deterministic checks pass against the bound source.
// Incidental non-target field changes produced by the model are recorded, not hidden.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const R = 'E:/AgentData/Coach/knowledge/processing';
const RT = join(R, 'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49');
const sha = b => createHash('sha256').update(b).digest('hex');
const {webDeterministicChecks, verifyWebRevisionContent, verifyWebProductionCall} =
  await import(pathToFileURL(join(RT, 'textbook-audit-web.mjs')).href);

const CASES = [
  {
    chapterId: '79-cn-chapter-205-5', articleId: 'cv1770234',
    targetFigureId: '79-bilibili-cn:cv1770234:b0004:figure',
    source: 'web-sources/v1/79-bilibili-cn/articles/cv1770234/source.json',
    parent: 'web-production/v1/candidates/79-bilibili-cn/cv1770234.display.json',
    candidate: 'web-production/v1/candidates/79-bilibili-cn/cv1770234.coac269rev1.json',
    notes: 'audit/web/articles/79-bilibili-cn/cv1770234.181e5da06710e24009128eb6254071ec141983ca34b9a0448b1cd36f61b0d3b6.json',
  },
];

// fields of a figure the frozen runner itself lets the target figure's model output overwrite
const MODEL_OWNED_FIELDS = new Set(['kind', 'transcription', 'unknowns', 'caption', 'sourceNotes', 'provenance']);

const out = {schema: 'coac269-revision-selfcheck/2', ticket: 'COAC-269', batch: 'b9', recordedAt: new Date().toISOString(), modelCalls: 0, chapters: [], errors: []};
for (const c of CASES) {
  const rec = {chapterId: c.chapterId, articleId: c.articleId, errors: []};
  const fail = m => { rec.errors.push(m); out.errors.push(c.chapterId + ':' + m); };
  const cb = await readFile(join(R, c.candidate)), cand = JSON.parse(cb);
  const pb = await readFile(join(R, c.parent)), par = JSON.parse(pb);
  const nb = await readFile(join(R, c.notes)), notes = JSON.parse(nb);
  const sb = await readFile(join(R, c.source)), src = JSON.parse(sb);
  const self = {...cand}; delete self.candidateSha256;
  rec.candidateSha256 = sha(cb); rec.parentSha256 = sha(pb); rec.notesSha256 = sha(nb); rec.sourceSha256 = sha(sb);
  rec.candidateSelfConsistent = sha(JSON.stringify(self)) === cand.candidateSha256;
  if (!rec.candidateSelfConsistent) fail('candidate_self_sha');
  if (cand.source.sourceSha256 !== sha(sb)) fail('candidate_source_sha');
  if (cand.source.sourceId !== par.source.sourceId || cand.source.articleId !== par.source.articleId) fail('candidate_source_identity');
  if (cand.body.mode !== 'verbatim') fail('candidate_body_mode:' + cand.body.mode);
  const rev = cand.provenance.revision || {};
  if (rev.parentPath !== c.parent || rev.parentSha256 !== sha(pb)) fail('revision_parent_binding');
  if (rev.notesPath !== c.notes || rev.notesSha256 !== sha(nb)) fail('revision_notes_binding');
  if (JSON.stringify(rev.figureIds) !== JSON.stringify([c.targetFigureId]) || (rev.textBlockIds || []).length) fail('revision_scope');
  rec.revision = rev;

  // text blocks and flow order must be untouched
  const parText = new Map(par.body.blocks.filter(b => b.type === 'text').map(b => [b.sourceBlockIds[0], b]));
  const candText = new Map(cand.body.blocks.filter(b => b.type === 'text').map(b => [b.sourceBlockIds[0], b]));
  if (parText.size !== candText.size) fail('text_block_count_changed');
  for (const [id, b] of parText) {
    const n = candText.get(id); if (!n) { fail('text_block_missing:' + id); continue; }
    if (n.text !== b.text) fail('text_changed:' + id);
    const a = {...b}, z = {...n}; delete a.text; delete z.text;
    if (JSON.stringify(a) !== JSON.stringify(z)) fail('non_text_field_changed:' + id);
  }
  if (JSON.stringify(cand.body.blocks.map(b => [b.type, b.sourceBlockIds, b.figureId ?? null])) !== JSON.stringify(par.body.blocks.map(b => [b.type, b.sourceBlockIds, b.figureId ?? null]))) fail('body_flow_order_changed');

  // figures: only the target may differ, and only in its model-owned fields
  if (cand.figures.length !== par.figures.length) fail('figure_count_changed');
  const norm = f => { const x = structuredClone(f); delete x.presentationAsset; return x; };
  const figureDiffs = [];
  for (let i = 0; i < Math.min(cand.figures.length, par.figures.length); i++) {
    const a = norm(par.figures[i]), b = norm(cand.figures[i]);
    const changedFields = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (!changedFields.length) continue;
    const entry = {figureId: a.figureId, changedFields};
    if (a.figureId !== c.targetFigureId) { fail('non_target_figure_changed:' + a.figureId + ':' + changedFields.join(',')); }
    else {
      const outside = changedFields.filter(k => !MODEL_OWNED_FIELDS.has(k));
      if (outside.length) fail('target_field_outside_model_owned:' + outside.join(','));
      for (const k of changedFields) entry[k] = {from: a[k], to: b[k]};
      figureDiffs.push(entry);
    }
  }
  rec.figureDiffs = figureDiffs;
  const targetDiff = figureDiffs.find(d => d.figureId === c.targetFigureId);
  rec.targetTranscriptionChanged = !!targetDiff && targetDiff.changedFields.includes('transcription');
  if (!rec.targetTranscriptionChanged) fail('target_transcription_not_changed');

  // frozen entry gates: revision content + real bound production output + deterministic checks
  try { verifyWebRevisionContent(cand, par, notes); rec.verifyWebRevisionContent = {ok: true}; }
  catch (e) { rec.verifyWebRevisionContent = {ok: false, error: String(e.message)}; fail('verifyWebRevisionContent:' + e.message); }
  try {
    const proof = await verifyWebProductionCall(R, cand);
    rec.verifyWebProductionCall = {ok: true, revision: proof.revision ?? null, visualInputs: proof.visualInputs ? {inputs: proof.visualInputs.inputs?.length ?? null} : null};
  } catch (e) { rec.verifyWebProductionCall = {ok: false, error: String(e.message)}; fail('verifyWebProductionCall:' + e.message); }
  const det = webDeterministicChecks(cand, src, sha(sb));
  rec.webDeterministicChecks = {passed: det.passed, errors: (det.errors || []).slice(0, 10)};
  if (!det.passed) fail('webDeterministicChecks:' + (det.errors || []).join('|'));

  const call = cand.provenance.attempts?.[0];
  rec.productionCall = call ? {callId: call.callId, success: call.success, usage: call.usage, durationMs: call.durationMs,
    rawArtifactPath: call.rawArtifactPath, rawArtifactSha256: call.rawArtifactSha256, targets: call.targets,
    visualInputs: (call.visualInputs || []).length} : null;
  if (!call || !call.success) fail('production_call_binding');
  else { const raw = await readFile(join(R, 'web-production/v1', call.rawArtifactPath)); if (sha(raw) !== call.rawArtifactSha256) fail('raw_artifact_sha'); }
  if ((cand.provenance.attempts || []).length !== 1) fail('unexpected_retry_or_extra_attempt');

  rec.ok = rec.errors.length === 0;
  out.chapters.push(rec);
}
out.ok = out.errors.length === 0;
const name = `selfcheck-b9-${sha(JSON.stringify(out.chapters.map(c => [c.chapterId, c.candidateSha256, c.errors]))).slice(0, 16)}.json`;
await writeFile(join(R, 'web-production/v1/coac269-20261027/receipts', name), JSON.stringify(out, null, 2) + '\n', {flag: 'wx'}).catch(e => { if (e.code !== 'EEXIST') throw e; });
console.log(JSON.stringify({
  ok: out.ok, errors: out.errors,
  receipt: `web-production/v1/coac269-20261027/receipts/${name}`,
  chapters: out.chapters.map(c => ({
    chapterId: c.chapterId, ok: c.ok, candidateSha256: c.candidateSha256,
    targetTranscriptionChanged: c.targetTranscriptionChanged, figureDiffs: c.figureDiffs,
    verifyWebRevisionContent: c.verifyWebRevisionContent, verifyWebProductionCall: c.verifyWebProductionCall,
    webDeterministicChecks: c.webDeterministicChecks, productionCall: c.productionCall, errors: c.errors,
  })),
}, null, 2));
process.exit(out.ok ? 0 : 1);
