// COAC-248 / 283-1: the one authorised bounded independent review of b0099.
// Zero production, one audit call maximum, no retry. A non-passing verdict ends the
// chapter without a second call.
//
//   node _audit_283_b0099_limited.mjs --preflight   # zero calls, prints the binding
//   node _audit_283_b0099_limited.mjs               # one call
//
// Idempotent: an existing record is returned instead of a second call.
import {readFile, writeFile, appendFile, mkdir, readdir, stat} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const RUNTIME_REL = 'audit/runtimes/web-group-revision-20261027-frozen-4bd6e4fc';
const RUNTIME = join(ROOT, RUNTIME_REL);
const CAND_REL = 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev2.json';
const CAND_SHA = '849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3';
const SRC_REL = 'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise003/source.v3.json';
const SRC_SHA = '8e7eff57a85e84fb963209117689b07fec5efd9b5d7ee81c12f1fd3a44b497de';
const RECEIPT_REL = 'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3.json';
const RECEIPT_SHA = '21d909b832c28e62a76f453863ed24d8fc8738adbb54b36bfd8117b9395d5aea';
const PLAN_REL = 'web-production/v1/batch-plans/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421.json';
const PARENT_BATCH_DIR = 'audit/web/batches/dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421';
const BATCH_ID = 'chapter06-exercise003-batch-001';
const TARGET = 'modern-yabejp-ja:chapter06-exercise003:b0099';
const OUT_REL = 'audit/web/adjudications/group-revision-283-1/b0099-limited-review-20261027.json';
const INFLIGHT_WINDOW_MS = 45 * 60 * 1000;

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const exists = async p => { try { await stat(abs(p)); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };

const preflightOnly = process.argv.includes('--preflight');
if (await exists(OUT_REL)) { console.log(JSON.stringify({skipped: 'b0099 review already recorded', out: OUT_REL}, null, 1)); process.exit(0); }

// --- bind every input by digest before anything else
const candBytes = await readFile(abs(CAND_REL));
if (sha(candBytes) !== CAND_SHA) throw Error('candidate changed');
const srcBytes = await readFile(abs(SRC_REL));
if (sha(srcBytes) !== SRC_SHA) throw Error('source changed');
const receiptBytes = await readFile(abs(RECEIPT_REL));
if (sha(receiptBytes) !== RECEIPT_SHA) throw Error('audit receipt changed');
const planBytes = await readFile(abs(PLAN_REL));
const checkpointRel = `${PARENT_BATCH_DIR}/${BATCH_ID}.json`;
const checkpointBytes = await readFile(abs(checkpointRel));

const candidate = JSON.parse(candBytes.toString('utf8'));
const source = JSON.parse(srcBytes.toString('utf8'));
const receipt = JSON.parse(receiptBytes.toString('utf8'));
const checkpoint = JSON.parse(checkpointBytes.toString('utf8'));

// --- the finding must be exactly one uncertain b0099 entry
const findings = (checkpoint.modelReview.issues ?? []).filter(i => i.targetId === TARGET);
if (findings.length !== 1 || findings[0].severity !== 'uncertain') throw Error('b0099 finding not a single uncertain item');
const finding = findings[0];
if (!receipt.modelReview.issues.some(i => i.targetId === TARGET && i.severity === 'uncertain')) throw Error('receipt does not carry the same b0099 uncertain item');

// --- no prior review and nothing in flight (the "check first" the owner asked for)
const adjudicationDir = 'audit/web/adjudications/group-revision-283-1';
const prior = (await exists(adjudicationDir))
  ? (await readdir(abs(adjudicationDir))).filter(x => /b0099/i.test(x))
  : [];
if (prior.length) throw Error('a b0099 review record already exists: ' + prior.join(','));
const callRows = (await readFile(abs('audit/calls.jsonl'), 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l));
const b0099Calls = callRows.filter(r => JSON.stringify(r).includes(TARGET) || JSON.stringify(r).includes(BATCH_ID));
const now = Date.now();
const inFlight = callRows.filter(r => {
  const started = Date.parse(r.startedAt ?? r.recordedAt ?? '');
  const ended = Date.parse(r.finishedAt ?? r.recordedAt ?? '');
  return Number.isFinite(started) && Number.isFinite(ended) && ended - started > INFLIGHT_WINDOW_MS && started < now && now - started < INFLIGHT_WINDOW_MS;
});

// --- projection: the exercise-8 span only, source text plus the candidate's own blocks
const SCOPE_IDS = [];
for (let n = 97; n <= 113; n += 1) SCOPE_IDS.push(`modern-yabejp-ja:chapter06-exercise003:b${String(n).padStart(4, '0')}`);
const sourceById = new Map(source.blocks.map(b => [b.id, b]));
const figureBySource = new Map((candidate.figures ?? []).map(f => [f.sourceBlockIds?.[0], f]));
const scopeBlocks = SCOPE_IDS.map(id => {
  const s = sourceById.get(id);
  if (!s) throw Error('scope source block missing: ' + id);
  const fig = figureBySource.get(id);
  return {
    sourceBlockId: id,
    sourceType: s.type,
    sourceText: s.text ?? null,
    candidate: (candidate.body.blocks ?? []).find(b => b.sourceBlockIds?.[0] === id) ?? null,
    candidateFigure: fig ? {transcription: fig.transcription ?? null, tiles: (fig.tiles ?? []).map(t => ({code: t.code, red: !!t.red, orientation: t.orientation ?? 'upright'})), unknowns: fig.unknowns ?? []} : null,
  };
}).map(b => {
  const out = {sourceBlockId: b.sourceBlockId, sourceType: b.sourceType, sourceText: b.sourceText};
  if (b.candidate?.type === 'text') out.candidateText = b.candidate.text;
  if (b.candidate?.type === 'figure') out.candidateFigure = {transcription: b.candidateFigure?.transcription ?? null, tiles: b.candidateFigure?.tiles ?? [], unknowns: b.candidateFigure?.unknowns ?? []};
  return out;
});
if (!scopeBlocks.some(b => b.sourceBlockId === TARGET)) throw Error('target not in scope projection');

const projection = {
  schema: 'coach-web-b0099-unknown-preservation-review-projection/1',
  articleId: 'chapter06-exercise003',
  source: {path: SRC_REL, sha256: SRC_SHA, url: source.url, title: source.title, language: source.language},
  candidate: {path: CAND_REL, sha256: CAND_SHA},
  parentAuditReceipt: {path: RECEIPT_REL, sha256: RECEIPT_SHA, status: receipt.status},
  parentCheckpoint: {path: checkpointRel, sha256: sha(checkpointBytes), status: checkpoint.status},
  reviewScope: {
    batchId: BATCH_ID,
    targetId: TARGET,
    what: 'exercise 8 only: the game-situation reference line, its citation link, and the answer/explanation that follows it in the same paragraph run',
    notInScope: 'every other group and every other finding in this chapter; card faces, translations and tiles outside this span; no new findings may be raised about them',
    externalPage: 'the page the citation links to is NOT part of this input and must not be guessed at or reconstructed',
  },
  finding: {
    severity: finding.severity,
    targetId: finding.targetId,
    description: finding.description,
    sourceEvidence: finding.sourceEvidence,
    suggestedRepair: finding.suggestedRepair ?? null,
  },
  blocks: scopeBlocks,
};

const prompt = [
  '你独立复核一条审校留下的 uncertain：某个「场况」引用块。这不是整章重审，也不是整组重审：本章其它组、其它争议项都已由别的独立复核覆盖，不得重报，也不得就它们提出新问题。不得使用任何工具、网络或本次输入之外的材料。',
  `上一轮审校把这一条记为 uncertain，原文如下——\n  目标：${finding.targetId}\n  原审校说法：${finding.description}\n  原审校给出的源依据：${finding.sourceEvidence}\n  原审校建议：${finding.suggestedRepair ?? '（无）'}`,
  '这一条的性质是：该块把「場況」指向一个外部网页（日本プロ麻雀連盟「2007年03月の『何を切る？』」），而外部页面本身没有进入本文转录。审校因此无法核对一索二索的可见张数、完整副露组合和各家的具体点数。',
  '请只回答两件事，并给出依据：\n(1) 候选对这一块的忠实保留是否成立——引用的机构名、《切什么？》的月份标题、链接目标是否与源文一致，候选有没有替作者补写或删掉内容、有没有把未知当成已知。\n(2) 这个未被展开的外部场况是否仍然影响本题的教学——也就是：本题的解答与解说所依赖的事实，是否已经由本文自己的文字与本文自己的牌图承载（逐块给出是哪几块承载的），还是必须依赖外部页面才成立。',
  '判定口径：若候选忠实转录且没有编造外部内容，同时本题解答所依赖的牌面与理由在本文范围内可核，判 faithful，preservedUnknownAcceptable=true、teachingAffected=false；若候选漏译、改写了引用，或解答真的落在外部页面而本文无从核对，判 needs-repair 并指出具体块；若输入仍不足以判定，判 uncertain。不要为了让本章通过而放宽标准，也不要把「外部页面未进输入」本身等同于候选缺陷。',
  '输出严格符合 schema 的 JSON。只输出 JSON，不要输出任何其它文字。',
  JSON.stringify(projection),
].join('\n\n');
if (!prompt.includes(JSON.stringify(projection)) || prompt.length < JSON.stringify(projection).length) throw Error('projection_not_embedded_in_prompt');

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    targetId: {enum: [TARGET]},
    verdict: {enum: ['faithful', 'needs-repair', 'uncertain']},
    candidateFaithful: {type: 'boolean'},
    preservedUnknownAcceptable: {type: 'boolean'},
    teachingAffected: {type: 'boolean'},
    evidence: {type: 'string', minLength: 1},
    unresolvedBlockIds: {type: 'array', items: {type: 'string'}},
    summary: {type: 'string', minLength: 1},
  },
  required: ['targetId', 'verdict', 'candidateFaithful', 'preservedUnknownAcceptable', 'teachingAffected', 'evidence', 'unresolvedBlockIds', 'summary'],
};

const precheck = {
  preflight: true,
  targetId: TARGET,
  findingSeverity: finding.severity,
  candidate: {path: CAND_REL, sha256: CAND_SHA},
  source: {path: SRC_REL, sha256: SRC_SHA},
  parentAuditReceipt: {path: RECEIPT_REL, sha256: RECEIPT_SHA},
  parentCheckpoint: {path: checkpointRel, sha256: sha(checkpointBytes)},
  scopeBlocks: scopeBlocks.length,
  projectionBytes: Buffer.byteLength(JSON.stringify(projection)),
  promptBytes: Buffer.byteLength(prompt),
  projectionEmbedded: prompt.includes(JSON.stringify(projection)),
  priorB0099ReviewRecords: prior,
  ledger: {
    rowsInCallLedger: callRows.length,
    rowsMentioningB0099OrBatch001: b0099Calls.length,
    noteOnThoseRows: 'all are the 2026-10-26 complete-unit batch audits where b0099 was in scope; none is a b0099-specific review record',
    callsInFlightNow: inFlight.length,
  },
  caps: {production: 0, audit: 1, retries: 0},
};
if (preflightOnly) { console.log(JSON.stringify(precheck, null, 1)); process.exit(0); }
if (inFlight.length) throw Error('a call appears to be in flight; not starting a second one');

const {auditModel, auditReasoningEffort, auditUsageFromEvents, auditTransportCompleted} = await import(pathToFileURL(join(RUNTIME, 'textbook-audit.mjs')).href);
const {invokeTextbookCodex, hasUnexpectedTextbookTool} = await import(pathToFileURL(join(RUNTIME, 'textbook-production-cli.mjs')).href);

const callId = randomUUID(), startedAt = new Date().toISOString();
const result = await invokeTextbookCodex({prompt, schema, model: auditModel, reasoningEffort: auditReasoningEffort, images: [], timeoutMs: 900000});
const usage = auditUsageFromEvents(result.events ?? []), output = result.output;
const unexpectedTool = hasUnexpectedTextbookTool(result.events ?? [], {allowRecoveredTransportDiagnostics: auditTransportCompleted(result)});
const success = auditTransportCompleted(result) && usage !== null && !unexpectedTool;
const promptBytes = Buffer.from(prompt);
const binding = {
  source: candidate.source, productionSha256: CAND_SHA, sourceFileSha256: SRC_SHA,
  parentAuditReceipt: {path: RECEIPT_REL, sha256: RECEIPT_SHA},
  parentCheckpoint: {path: checkpointRel, sha256: sha(checkpointBytes)},
  batchId: BATCH_ID, targetId: TARGET,
  scope: 'b0099-unknown-preservation-limited-review',
  auditorSnapshot: receipt.auditor,
  semanticProjectionSha256: sha(Buffer.from(JSON.stringify(projection))),
  semanticProjectionVersion: 1,
  imageBindings: [],
};
const call = {
  schema: 'coach-textbook-audit-call/1', callId, ...binding, startedAt, finishedAt: new Date().toISOString(),
  scopeTag: 'textbook-web-b0099-unknown-preservation-limited-review',
  model: auditModel, reasoningEffort: auditReasoningEffort,
  parameters: {webSearch: 'disabled', tools: 'capability-restricted', ephemeral: true, ignoreUserConfig: true, ignoreRules: true, sandbox: 'read-only', timeoutMs: 900000},
  promptSha256: sha(promptBytes), semanticPromptSha256: sha(promptBytes), requestPrompt: result.requestPrompt ?? null,
  requestPromptSha256: result.requestPromptSha256 ?? null, schemaSha256: sha(JSON.stringify(schema)),
  success, usage, exitCode: result.exitCode, timedOut: result.timedOut, outputOverflow: result.outputOverflow, unexpectedTool,
  transportDiagnostics: (result.events ?? []).filter(e => e.type === 'error'),
  failure: success ? null : {stderr: result.stderr, eventErrors: (result.events ?? []).filter(e => ['turn.failed', 'error'].includes(e.type))},
  outputSha256: output ? sha(JSON.stringify(output)) : null, structuredOutput: output,
  rawLastMessage: result.rawLastMessage ?? null, rawStdout: result.rawStdout ?? null, events: result.events ?? [],
};
if (!success) {
  await mkdir(abs('audit/calls'), {recursive: true});
  const callPath = `audit/calls/${callId}.json`;
  await writeFile(abs(callPath), JSON.stringify({...call, prompt, schema}, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({failed: true, callId, failure: call.failure, usage}, null, 1));
  process.exit(1);
}
await mkdir(abs('audit/calls'), {recursive: true});
const callPath = `audit/calls/${callId}.json`;
await writeFile(abs(callPath), JSON.stringify({...call, prompt, schema}, null, 2) + '\n', {flag: 'wx'});
await appendFile(abs('audit/calls.jsonl'), JSON.stringify({...call, events: undefined}) + '\n');
const callSha = sha(await readFile(abs(callPath)));

// --- deterministic validation of the response
const errors = [];
if (output.targetId !== TARGET) errors.push('target_mismatch');
if (output.verdict === 'faithful') {
  if (output.candidateFaithful !== true) errors.push('faithful_but_candidate_not_faithful');
  if (output.preservedUnknownAcceptable !== true) errors.push('faithful_but_unknown_not_acceptable');
  if (output.teachingAffected !== false) errors.push('faithful_but_teaching_affected');
  if ((output.unresolvedBlockIds ?? []).length) errors.push('faithful_with_open_blocks');
}
if (output.verdict !== 'faithful' && !(output.evidence ?? '').trim()) errors.push('no_evidence');
const passed = errors.length === 0 && output.verdict === 'faithful';

const record = {
  schema: 'coac-web-b0099-limited-review/1',
  recordedAt: new Date().toISOString(),
  chapterId: 'nemata-jp-chapter-283-1',
  articleId: 'chapter06-exercise003',
  batchId: BATCH_ID,
  targetId: TARGET,
  candidate: {path: CAND_REL, sha256: CAND_SHA, unchangedByThisReview: true},
  source: {path: SRC_REL, sha256: SRC_SHA},
  parentAuditReceipt: {path: RECEIPT_REL, sha256: RECEIPT_SHA, status: receipt.status},
  parentCheckpoint: {path: checkpointRel, sha256: sha(checkpointBytes), status: checkpoint.status},
  scope: {
    what: 'the single authorised bounded independent review of b0099: is the unknown preserved faithfully, and does the unexpanded external situation still affect the teaching of exercise 8',
    notInScope: ['every other finding in this chapter', 'the passed groups 002/004/009/010/011', 'card faces and translations outside this span'],
    limits: {productionCalls: 0, auditCalls: 1, retries: 0},
  },
  ledgerBeforeCall: precheck.ledger,
  finding: {severity: finding.severity, targetId: finding.targetId, description: finding.description, sourceEvidence: finding.sourceEvidence, suggestedRepair: finding.suggestedRepair ?? null},
  verdicts: {
    verdict: output.verdict,
    candidateFaithful: output.candidateFaithful,
    preservedUnknownAcceptable: output.preservedUnknownAcceptable,
    teachingAffected: output.teachingAffected,
    evidence: output.evidence,
    unresolvedBlockIds: output.unresolvedBlockIds ?? [],
    summary: output.summary,
  },
  validationErrors: errors,
  outcome: passed ? 'faithful-preserved-and-not-teaching-affecting' : 'stopped-' + output.verdict,
  chapterContinues: passed,
  noRetry: true,
  parentVerdictUnchanged: 'the parent batch-001 checkpoint and the chapter audit receipt are untouched; this is a new bounded review record, not a rewrite of any old receipt',
  modelCall: {callId, sha256: callSha, outputSha256: call.outputSha256, usage},
  modelCalls: 1,
  productionCalls: 0,
};
await mkdir(abs('audit/web/adjudications/group-revision-283-1'), {recursive: true});
await writeFile(abs(OUT_REL), JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({callId, usage, outcome: record.outcome, validationErrors: errors, verdicts: record.verdicts, out: OUT_REL, outSha256: sha(await readFile(abs(OUT_REL)))}, null, 1));
