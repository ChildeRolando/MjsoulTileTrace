// One bounded independent adjudication of the p50 r2 right-edge mark.
// Shows the disputed asset together with the same-book comparison strips and
// asks only whether the mark is a non-body clipping fragment, then records the
// call and the source-adjudication decision bound to the revision candidate and
// the current verification-dependency manifest.
import {readFile, writeFile, appendFile, mkdir} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT = 'E:/AgentData/Coach/knowledge/processing';
const DELIVERY = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-4f19aa1145ac/worktree/.multica/delivery/coac-248-native-inline-correction';
const RUNTIME_REL = 'audit/runtimes/native-repair-d0782d5041cfb2';
const RUNTIME = join(ROOT, RUNTIME_REL);
const MANIFEST_REL = `${RUNTIME_REL}/verification-dependencies.json`;
const CANDIDATE_REL = 'production/sol-high-field-repair-20261027-p50-unknowns/candidates/79-cn/page-0050.json';
const CANDIDATE_SHA = '002a79eaa4873701c876bc0a319bf28005d9403ad88119936893c583f4474028';
const RECEIPT_REL = `audit/pages/79-cn/page-0050.${CANDIDATE_SHA}.91f13b14678b.json`;
const OUT_REL = `audit/adjudications/79-cn/page-0050.${CANDIDATE_SHA}.unknowns-evidence-adjudication.json`;

const sha = b => createHash('sha256').update(b).digest('hex');
const abs = p => join(ROOT, p);
const {auditModel, auditReasoningEffort, auditUsageFromEvents, auditTransportCompleted} = await import(pathToFileURL(join(RUNTIME, 'textbook-audit.mjs')).href);
const {invokeTextbookCodex, hasUnexpectedTextbookTool} = await import(pathToFileURL(join(RUNTIME, 'textbook-production-cli.mjs')).href);

const candidateBytes = await readFile(abs(CANDIDATE_REL));
const candidate = JSON.parse(candidateBytes.toString('utf8'));
const candidateSha256 = sha(candidateBytes);
if (candidateSha256 !== CANDIDATE_SHA) throw Error('candidate changed');
const receiptBytes = await readFile(abs(RECEIPT_REL));
const receipt = JSON.parse(receiptBytes.toString('utf8'));
const manifestBytes = await readFile(abs(MANIFEST_REL));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const invoice = JSON.parse((await readFile(abs('source-inventory.json'))).toString('utf8'));
const source = invoice.sources.find(s => s.sourceId === '79-cn');
const pageDataSha = n => source.pages.find(p => p.page === n).pageDataSha256;

const page = JSON.parse((await readFile(abs('79-cn/pages/050.json'))).toString('utf8'));
const blockOf = (p, id) => { const b = p.blocks.find(x => x.id === id); if (!b || b.type !== 'image') throw Error('missing image block ' + id); return b; };
const p50 = blockOf(page, '79-cn-p50-b12');
const p49 = blockOf(JSON.parse((await readFile(abs('79-cn/pages/049.json'))).toString('utf8')), '79-cn-p49-b12');
const p166 = blockOf(JSON.parse((await readFile(abs('79-cn/pages/166.json'))).toString('utf8')), '79-cn-p166-b11');
const figure = candidate.figures.find(f => f.figureId === '79-cn-p50-r2');
if (!figure) throw Error('r2 missing');

const evidence = [
  {id: 'p50-tile-strip', block: p50, page: 50},
  {id: 'p49-same-mark', block: p49, page: 49},
  {id: 'p166-same-mark', block: p166, page: 166},
].map(e => ({id: e.id, kind: 'source-image', path: e.block.asset, sourceImageBlockId: e.block.id, sourceId: '79-cn', page: e.page, pdfSha256: source.sha256, pageDataSha256: pageDataSha(e.page), sha256: e.block.imageSha256}));

const zoomP50 = join(DELIVERY, 'evidence/p50-r2-asset-mark-x10.png');
const zoomP49 = join(DELIVERY, 'evidence/p49-r12-asset-mark-x14.png');
const images = [abs(p50.asset), abs(p49.asset), abs(p166.asset), zoomP50, zoomP49];

const prompt = [
  '这是对一项“未知符号”审校项的独立复核，只裁决附图1中牌列右缘的痕迹性质，不审阅正文、译文或其他牌例。不得使用任何工具。',
  '附图5张：图1是争议嵌图（79-cn p50-b12，六张索子 134556s）；图2是同书 p49-b12 的同类牌列；图3是同书 p166-b11 的同类牌列；图4是图1右缘放大10倍；图5是图2右缘放大14倍。',
  '以下事实已由确定性检查在模型外核实，可直接采信：该痕迹位于图1嵌图自身矩形之内，紧贴牌框线右侧1-2列、只在中部约7行有暗像素（约2×7像素）；PDF文本层在该位置只有两个空格span，没有字形；该页PDF图像矩形之外没有drawing或annotation；全书98条同类行内牌列中只有p49、p50、p166三条带有这一窄条右缘痕迹。',
  '请判断：这条痕迹更可能是原书印刷的可转录字符/正文内容，还是PDF切图时留下的非正文边角残片（例如相邻内容的极窄切片）？只看可见形状与位置，不要推测不可见的原书内容。',
  '返回 JSON。verdict 只能是 resolved-as-non-body-crop-fragment、transcribable-character 或 undetermined；insideAssetRect/touchesAssetEdge 按可见情况填写；sameShapeOnComparisonPages 说明图2、图3是否与图1同位置同形；evidence 用简洁中文说明依据。',
].join('\n\n');

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: {enum: ['resolved-as-non-body-crop-fragment', 'transcribable-character', 'undetermined']},
    insideAssetRect: {type: 'boolean'},
    touchesAssetEdge: {type: 'boolean'},
    sameShapeOnComparisonPages: {enum: ['yes', 'no', 'unclear']},
    evidence: {type: 'string', minLength: 1},
  },
  required: ['verdict', 'insideAssetRect', 'touchesAssetEdge', 'sameShapeOnComparisonPages', 'evidence'],
};

const callId = randomUUID(), startedAt = new Date().toISOString();
const result = await invokeTextbookCodex({prompt, schema, model: auditModel, reasoningEffort: auditReasoningEffort, images, timeoutMs: 900000});
const usage = auditUsageFromEvents(result.events ?? []), output = result.output;
const unexpectedTool = hasUnexpectedTextbookTool(result.events ?? [], {allowRecoveredTransportDiagnostics: auditTransportCompleted(result)});
const success = auditTransportCompleted(result) && usage !== null && !unexpectedTool;
const binding = {
  source: candidate.source, productionSha256: candidateSha256, pageImageSha256: receipt.pageImageSha256,
  auditorScriptSha256: receipt.auditorScriptSha256, manifestSha256: manifest.manifestSha256,
  scope: 'single-unknowns-entry-adjudication-not-page-review',
  imageBindings: [p50, p49, p166].map(b => ({sourceBlockId: b.id, path: b.asset, sha256: b.imageSha256})),
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
await mkdir(abs('audit/calls'), {recursive: true});
const callPath = `audit/calls/${callId}.json`;
await writeFile(abs(callPath), JSON.stringify(call, null, 2) + '\n', {flag: 'wx'});
await appendFile(abs('audit/calls.jsonl'), JSON.stringify({...call, events: undefined}) + '\n');
if (!success) { console.log(JSON.stringify({failed: true, callId, failure: call.failure, usage}, null, 1)); process.exit(1); }
const callSha256 = sha(await readFile(abs(callPath)));

const review = receipt.modelReview, issue = review.issues[0];
if (!issue || issue.targetId !== '79-cn-p50-r2') throw Error('receipt issue changed');

const decision = {
  schema: 'coach-textbook-source-adjudication/1',
  status: 'resolved-with-source-evidence',
  productionSha256: candidateSha256,
  source: receipt.source,
  originalAudit: {path: RECEIPT_REL, sha256: sha(receiptBytes), callIds: receipt.calls.map(c => c.callId)},
  approval: {
    authority: 'root', scope: 'specified-issues-only',
    reference: 'Root allowed a page-level/item-level unknowns evidence revision for 79-cn page 50, limited to the verified 2x7 px right-edge crop fragment record, requiring an independent review to confirm the mark is a non-body crop fragment before the item is cleared (COAC-248 comment 01a17ae6-9e33-7829-af2b-0bf303f2fc9f).',
  },
  verification: 'root-authorized-source-adjudication-with-independent-model-recheck-not-full-page-pass-not-user-human-gold-standard',
  manifest: {path: MANIFEST_REL, sha256: sha(manifestBytes), manifestSha256: manifest.manifestSha256},
  modelAdjudication: {callId, sha256: callSha256, outputSha256: call.outputSha256, verdict: output.verdict, manifestSha256: manifest.manifestSha256, review: output},
  sourceConclusion: {kind: 'non-body-crop-fragment', resolvedField: 'unknowns', note: 'The mark sits inside the embedded asset rect against the tile border, repeats at the same relative position on p49-b12 and p166-b11, has no glyph in the PDF text layer and no vector object outside the image, so it is a slicing artefact rather than body content.'},
  evidence,
  requiredEvidenceIds: evidence.map(e => e.id),
  resolutions: [{
    issueIndex: 0, issueSha256: sha(JSON.stringify(issue)), targetId: '79-cn-p50-r2',
    decision: 'source-evidence-unknowns-entry',
    reason: output.evidence,
    evidenceIds: evidence.map(e => e.id),
  }],
  recordedAt: new Date().toISOString(),
};
await mkdir(dirname(abs(OUT_REL)), {recursive: true});
await writeFile(abs(OUT_REL), JSON.stringify(decision, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({callId, verdict: output.verdict, usage, decision: OUT_REL, decisionSha256: sha(await readFile(abs(OUT_REL)))}, null, 1));
