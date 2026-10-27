// One bounded independent adjudication of the p261 r50 tile dispute.
// Runs a single scoped model call (target tile + same-book anchor tiles + the
// affected example), records it as a normal audit call, and writes the
// source-adjudication decision bound to the current candidate and manifest.
import {readFile, writeFile, appendFile, mkdir} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const RUNTIME_REL = 'audit/runtimes/native-repair-d0782d5041cfb2';
const RUNTIME = join(ROOT, RUNTIME_REL);
const MANIFEST_REL = `${RUNTIME_REL}/verification-dependencies.json`;
const CANDIDATE_REL = 'production/sol-high-field-repair18-20261027-p261/candidates/nemata-jp/page-0261.json';
const RECEIPT_REL = 'audit/pages/nemata-jp/page-0261.376c71a39de29653b0ba59c947d777832aa2af3623885cf1f8f451b9f29cf359.7076217daf84.json';
const OUT_REL = 'audit/adjudications/nemata-jp/page-0261.376c71a39de29653b0ba59c947d777832aa2af3623885cf1f8f451b9f29cf359.source-3m-adjudication.json';

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const {auditModel, auditReasoningEffort, auditUsageFromEvents, auditTransportCompleted} = await import(pathToFileURL(join(RUNTIME, 'textbook-audit.mjs')).href);
const {invokeTextbookCodex, hasUnexpectedTextbookTool} = await import(pathToFileURL(join(RUNTIME, 'textbook-production-cli.mjs')).href);

const candidateBytes = await readFile(abs(CANDIDATE_REL));
const candidate = JSON.parse(candidateBytes.toString('utf8'));
const candidateSha256 = sha(candidateBytes);
if (candidateSha256 !== '376c71a39de29653b0ba59c947d777832aa2af3623885cf1f8f451b9f29cf359') throw Error('candidate changed');
const receiptBytes = await readFile(abs(RECEIPT_REL));
const receipt = JSON.parse(receiptBytes.toString('utf8'));
const manifestBytes = await readFile(abs(MANIFEST_REL));
const manifest = JSON.parse(manifestBytes.toString('utf8'));

const page = JSON.parse((await readFile(abs('nemata-jp/pages/261.json'))).toString('utf8'));
const anchorPages = {255: JSON.parse((await readFile(abs('nemata-jp/pages/255.json'))).toString('utf8'))};
const block = (p, id) => p.blocks.find(b => b.id === id);
const assetOf = (p, id) => { const b = block(p, id); if (!b || b.type !== 'image') throw Error('missing image block ' + id); return {id, asset: b.asset, sha256: b.imageSha256}; };

const target = assetOf(page, 'nemata-jp-p261-b92');
const anchors3 = [assetOf(anchorPages[255], 'nemata-jp-p255-b42'), assetOf(anchorPages[255], 'nemata-jp-p255-b71'), assetOf(anchorPages[255], 'nemata-jp-p255-b78')];
const anchors5 = [assetOf(anchorPages[255], 'nemata-jp-p255-b43'), assetOf(anchorPages[255], 'nemata-jp-p255-b72'), assetOf(anchorPages[255], 'nemata-jp-p255-b79')];
const figure = candidate.figures.find(f => f.figureId === 'nemata-jp-p261-r50');
const affectedBlock = candidate.body.blocks.find(b => (b.inlineFigureIds ?? []).includes('nemata-jp-p261-r50') && (b.sourceBlockIds ?? []).includes('nemata-jp-p261-b33'));
if (!figure || !affectedBlock) throw Error('affected example missing');

const images = [target, ...anchors3, ...anchors5].map(a => abs(a.asset));
const prompt = [
  '这是对一处已记录审校争议的独立复核，只裁决所附目标牌面，不审阅整页或其他内容。不得使用任何工具。',
  '附图共7张：图1是目标牌（源块 nemata-jp-p261-b92，对应候选图例 r50）；图2-4是同书已确认的三张3m参照牌（源块 p255-b42/b71/b78）；图5-7是同书已确认的三张5m参照牌（源块 p255-b43/b72/b79）。参照牌的牌码来自同书固定牌序：该组首张为可一眼确认的2m（二万），第4张为8m（八万），同页另有6s（六根绿竹）。',
  '目标牌上半部是黑色汉字数字，下半部红色“萬”字固定表示万子；只看黑色数字的笔画结构。三点：三横；五点：上横、竖撇折、下横加一横、中间交叉结构，字形明显不同。不要根据文件名或哈希猜牌。',
  `受影响的牌例是候选图例 r50 的转录「${figure.transcription}」与段 b33 中的句内牌引用；只判断该牌例引用的牌码是否与源图目标牌一致。`,
  `返回 JSON。verdict 只能是 target-is-3m、target-is-5m 或 undetermined；matchesReferenceGroup 说明目标与哪组参照一致；affectedExampleFaithful 表示候选牌例引用的牌码是否与源图一致（无法判定时 false）。evidence 用简洁中文给出可见依据。`,
].join('\n\n');

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: {enum: ['target-is-3m', 'target-is-5m', 'undetermined']},
    matchesReferenceGroup: {enum: ['3m', '5m', 'neither']},
    affectedExampleFaithful: {type: 'boolean'},
    evidence: {type: 'string', minLength: 1},
  },
  required: ['verdict', 'matchesReferenceGroup', 'affectedExampleFaithful', 'evidence'],
};

const callId = randomUUID(), startedAt = new Date().toISOString();
const result = await invokeTextbookCodex({prompt, schema, model: auditModel, reasoningEffort: auditReasoningEffort, images, timeoutMs: 900000});
const usage = auditUsageFromEvents(result.events ?? []), output = result.output;
const unexpectedTool = hasUnexpectedTextbookTool(result.events ?? [], {allowRecoveredTransportDiagnostics: auditTransportCompleted(result)});
const success = auditTransportCompleted(result) && usage !== null && !unexpectedTool;
const binding = {
  source: candidate.source, productionSha256: candidateSha256, pageImageSha256: receipt.pageImageSha256,
  auditorScriptSha256: receipt.auditorScriptSha256, manifestSha256: manifest.manifestSha256,
  scope: 'single-tile-dispute-adjudication-not-page-review',
  imageBindings: [target, ...anchors3, ...anchors5].map(a => ({sourceBlockId: a.id, path: a.asset, sha256: a.sha256})),
};
const call = {
  schema: 'coach-textbook-audit-call/1', callId, ...binding, startedAt, finishedAt: new Date().toISOString(),
  durationMs: result.durationMs, cliVersion: 'codex-cli 0.162.1', model: auditModel, reasoningEffort: auditReasoningEffort,
  parameters: {webSearch: 'disabled', tools: 'capability-restricted', ephemeral: true, ignoreUserConfig: true, ignoreRules: true, sandbox: 'read-only', timeoutMs: 900000},
  promptSha256: sha(prompt), semanticPromptSha256: sha(prompt), requestPrompt: result.requestPrompt ?? null,
  requestPromptSha256: result.requestPromptSha256 ?? null, schemaSha256: sha(JSON.stringify(schema)),
  success, usage, exitCode: result.exitCode, timedOut: result.timedOut, outputOverflow: result.outputOverflow, unexpectedTool,
  transportDiagnostics: (result.events ?? []).filter(e => e.type === 'error'),
  failure: success ? null : {stderr: result.stderr, eventErrors: (result.events ?? []).filter(e => ['turn.failed', 'error'].includes(e.type))},
  outputSha256: output ? sha(JSON.stringify(output)) : null, structuredOutput: output,
  rawLastMessage: result.rawLastMessage ?? null, rawStdout: result.rawStdout ?? null, events: result.events ?? [],
};
if (!success) { console.log(JSON.stringify({failed: true, callId, failure: call.failure, usage}, null, 1)); process.exit(1); }
await mkdir(abs('audit/calls'), {recursive: true});
const callPath = `audit/calls/${callId}.json`;
await writeFile(abs(callPath), JSON.stringify(call, null, 2) + '\n', {flag: 'wx'});
await appendFile(abs('audit/calls.jsonl'), JSON.stringify({...call, events: undefined}) + '\n');
const callSha256 = sha(await readFile(abs(callPath)));

const review = receipt.modelReview, issue = review.issues[0];
if (!issue || issue.targetId !== 'nemata-jp-p261-r50') throw Error('receipt issue changed');
const bodyCheck = review.bodyChecks.find(c => c.id === 'nemata-jp-p261-b33');
if (!bodyCheck || bodyCheck.verdict !== 'needs-repair') throw Error('affected body check changed');

const invoice = JSON.parse((await readFile(abs('source-inventory.json'))).toString('utf8'));
const nemata = invoice.sources.find(s => s.sourceId === 'nemata-jp');
const pageDataShaFor = n => nemata.pages.find(p => p.page === n).pageDataSha256;
const sourceEvidence = (a, id) => ({id, kind: 'source-image', path: a.asset, sourceImageBlockId: a.id, sourceId: 'nemata-jp', page: Number(a.id.split('-p')[1].split('-')[0]), pdfSha256: nemata.sha256, pageDataSha256: pageDataShaFor(Number(a.id.split('-p')[1].split('-')[0])), sha256: a.sha256});
const evidence = [
  sourceEvidence(target, 'target-inline-tile'),
  ...anchors3.map((a, i) => sourceEvidence(a, `known-3m-${i + 1}`)),
  ...anchors5.map((a, i) => sourceEvidence(a, `known-5m-${i + 1}`)),
];

const decision = {
  schema: 'coach-textbook-source-adjudication/1',
  status: 'resolved-with-source-evidence',
  productionSha256: candidateSha256,
  source: receipt.source,
  originalAudit: {path: RECEIPT_REL, sha256: sha(receiptBytes), callIds: receipt.calls.map(c => c.callId)},
  approval: {
    authority: 'root', scope: 'specified-issues-only',
    reference: 'Root instructed a single bounded independent adjudication of the p261 r50 dispute and its affected example, without changing 3m and without re-reviewing the rest of the page (COAC-248 comment 01a17ae6-9e33-7829-af2b-0bf303f2fc9f).',
  },
  verification: 'root-authorized-source-adjudication-with-independent-model-recheck-not-full-page-pass-not-user-human-gold-standard',
  manifest: {path: MANIFEST_REL, sha256: sha(manifestBytes), manifestSha256: manifest.manifestSha256},
  modelAdjudication: {callId, sha256: callSha256, outputSha256: call.outputSha256, verdict: output.verdict, manifestSha256: manifest.manifestSha256, review: output},
  sourceConclusion: {kind: 'tile-code', tileCode: '3m', note: 'The source tile at b92 shows the three-stroke 三 numeral and matches the same-book 3m anchors, not the 五 form of the 5m anchors.'},
  evidence,
  requiredEvidenceIds: evidence.map(e => e.id),
  resolutions: [{
    issueIndex: 0, issueSha256: sha(JSON.stringify(issue)), targetId: 'nemata-jp-p261-r50',
    decision: 'reviewer-visible-tile-misread',
    reason: output.evidence,
    evidenceIds: evidence.map(e => e.id),
    affectedReviewChecks: [{key: 'bodyChecks', id: 'nemata-jp-p261-b33', verdict: 'needs-repair', sha256: sha(JSON.stringify(bodyCheck))}],
  }],
  recordedAt: new Date().toISOString(),
};
await mkdir(dirname(abs(OUT_REL)), {recursive: true});
await writeFile(abs(OUT_REL), JSON.stringify(decision, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({callId, verdict: output.verdict, usage, decision: OUT_REL, decisionSha256: sha(await readFile(abs(OUT_REL)))}, null, 1));
